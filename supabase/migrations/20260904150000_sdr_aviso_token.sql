-- SDR (pré-venda) — aviso ao corretor sem chave service_role no banco.
--
-- O banco do CRM roda no Lovable Cloud: a chave service_role não fica exposta
-- para ser guardada no Vault. Troca da 20260904140000: o banco emite um TOKEN
-- de uso único (tabela sdr_avisos_corretor), manda só o token para a Edge
-- Function via pg_net, e a função — que já recebe SUPABASE_SERVICE_ROLE_KEY do
-- ambiente — consome o token e monta o WhatsApp. Nenhum segredo no banco;
-- um token vale 1 hora e é queimado no primeiro uso.

CREATE TABLE IF NOT EXISTS public.sdr_avisos_corretor (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL,
  gatilho text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  consumido_em timestamptz,
  request_id bigint
);
COMMENT ON TABLE public.sdr_avisos_corretor IS
  'Tokens de uso único emitidos pelo banco para a Edge Function notify-lead-transfer mandar o WhatsApp de entrega do SDR ao corretor.';
CREATE INDEX IF NOT EXISTS idx_sdr_avisos_corretor_lead ON public.sdr_avisos_corretor (lead_id, criado_em DESC);

ALTER TABLE public.sdr_avisos_corretor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sdr_avisos_corretor FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.sdr_avisos_corretor TO service_role;

UPDATE public.distribuicao_settings
   SET descricao = 'URL da Edge Function que manda o WhatsApp de entrega do SDR ao corretor (contexto sdr). Vazio = não avisa. O banco manda um token de uso único; nenhuma chave é necessária.'
 WHERE chave = 'sdr_aviso_corretor_url';

CREATE OR REPLACE FUNCTION public._sdr_notificar_corretor(_lead_id uuid, _corretor_id uuid, _gatilho text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _url text;
  _token uuid;
  _req bigint;
  _motivo text;
BEGIN
  _url := NULLIF(btrim(COALESCE(public.get_dist_setting('sdr_aviso_corretor_url') #>> '{}', '')), '');

  IF _url IS NULL THEN
    _motivo := 'sem_url';
  ELSE
    INSERT INTO public.sdr_avisos_corretor (lead_id, corretor_id, gatilho)
    VALUES (_lead_id, _corretor_id, _gatilho)
    RETURNING token INTO _token;
    BEGIN
      SELECT net.http_post(
        url := _url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('token', _token)
      ) INTO _req;
      UPDATE public.sdr_avisos_corretor SET request_id = _req WHERE token = _token;
    EXCEPTION WHEN OTHERS THEN
      _motivo := 'http_post_falhou: ' || SQLERRM;
    END;
  END IF;

  INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
  VALUES (
    _lead_id, 'sdr_aviso_corretor',
    CASE WHEN _motivo IS NULL THEN 'WhatsApp de entrega enfileirado para o corretor'
         ELSE 'WhatsApp de entrega NÃO enviado (' || _motivo || ')' END,
    'sdr_motor',
    jsonb_strip_nulls(jsonb_build_object('corretor_id', _corretor_id, 'gatilho', _gatilho,
                                         'enviado', _motivo IS NULL, 'motivo', _motivo,
                                         'token', _token, 'request_id', _req))
  );
  IF _motivo IS NOT NULL THEN
    RAISE WARNING 'sdr_notificar_corretor lead=% corretor=%: %', _lead_id, _corretor_id, _motivo;
  END IF;
  RETURN _motivo IS NULL;
END; $$;

REVOKE ALL ON FUNCTION public._sdr_notificar_corretor(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sdr_notificar_corretor(uuid, uuid, text) TO service_role;

DO $$
BEGIN
  IF to_regclass('public.sdr_avisos_corretor') IS NULL THEN
    RAISE EXCEPTION 'sdr_aviso_token: tabela sdr_avisos_corretor ausente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_sdr_notificar_corretor' AND p.prosrc LIKE '%vault%'
  ) THEN
    RAISE EXCEPTION 'sdr_aviso_token: _sdr_notificar_corretor ainda depende do Vault';
  END IF;
END $$;
