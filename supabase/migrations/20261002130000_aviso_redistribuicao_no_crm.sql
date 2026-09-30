-- 2026-10-02 — Aviso de redistribuição por SLA sai do CRM (sem n8n).
--
-- ANTES
-- A redistribuição em si já era do CRM (cron distribuicao-auto →
-- redistribuir_sla_webhook), mas o WhatsApp "🔁 1 lead novo pra você" dependia
-- de dois workflows n8n: _notificar_handoff_novo_dono fazia POST no webhook do
-- Marcão (copiloto/handoff), que enfileirava numa tabela do banco operacional,
-- e o "Digest Redistribuição (anti-rajada)" mandava a cada 10 min uma
-- mensagem agrupada por corretor + resumo ao gestor. O nome do empreendimento
-- ainda passava por um espelho fora do CRM.
--
-- AGORA
-- 1) _notificar_handoff_novo_dono separa como o Marcão separava: motivo de
--    redistribuição por SLA ("redistribu" + "SLA") entra na fila
--    avisos_redistribuicao do próprio CRM; o resto (roleta v2, SDR,
--    transferência avulsa) segue para o dossiê do Marcão, sem mudança.
-- 2) Cron avisos-redistribuicao (10 min) → disparar_avisos_redistribuicao():
--    havendo aviso pendente dentro do horário (8h–20h, São Paulo), emite um
--    token de uso único e chama a Edge Function notify-redistribuicao via
--    pg_net. Nenhum segredo no banco — mesmo padrão do aviso do SDR.
-- 3) A função consome o token em reivindicar_avisos_redistribuicao(), que
--    descarta saltos intermediários (lead redistribuído 2x no intervalo: só o
--    dono final é avisado) e avisos de lead que já mudou de dono, e devolve os
--    avisos com nome do lead, projeto e telefone do corretor lidos do CRM.
--    Manda UMA mensagem por corretor (5 s entre envios — anti-bloqueio da
--    Z-API) e o resumo ao gestor; concluir_avisos_redistribuicao() registra o
--    resultado de cada envio.

-- ---------------------------------------------------------------------------
-- 1) Fila de avisos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avisos_redistribuicao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL,
  motivo text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviando', 'enviado', 'descartado', 'erro')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  reivindicado_em timestamptz,
  concluido_em timestamptz,
  resultado text
);
COMMENT ON TABLE public.avisos_redistribuicao IS
  'Fila do WhatsApp de redistribuição por SLA ao novo dono do lead. Enviada agrupada por corretor pela Edge Function notify-redistribuicao (cron avisos-redistribuicao).';
CREATE INDEX IF NOT EXISTS idx_avisos_redistribuicao_abertos
  ON public.avisos_redistribuicao (status, id)
  WHERE status IN ('pendente', 'enviando');
CREATE INDEX IF NOT EXISTS idx_avisos_redistribuicao_lead
  ON public.avisos_redistribuicao (lead_id, id DESC);

ALTER TABLE public.avisos_redistribuicao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_redistribuicao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.avisos_redistribuicao TO authenticated;
DROP POLICY IF EXISTS avisos_redistribuicao_admin_le ON public.avisos_redistribuicao;
CREATE POLICY avisos_redistribuicao_admin_le ON public.avisos_redistribuicao
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Tokens de uso único do disparo (banco → Edge Function).
CREATE TABLE IF NOT EXISTS public.avisos_redistribuicao_disparos (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  consumido_em timestamptz,
  request_id bigint
);
ALTER TABLE public.avisos_redistribuicao_disparos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_redistribuicao_disparos FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Configuração (editável em Distribuição → Política → Outras chaves)
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('aviso_redistribuicao_url',
   to_jsonb('https://rldnprwjlomjmjvinxuh.supabase.co/functions/v1/notify-redistribuicao'::text),
   'URL da Edge Function que manda o WhatsApp agrupado de redistribuição por SLA. Vazio = não avisa (a fila acumula).'),
  ('aviso_redistribuicao_gestor_telefone',
   to_jsonb('5511930785690'::text),
   'WhatsApp que recebe o resumo de cada rodada de avisos de redistribuição. Vazio = sem resumo.')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Roteamento: SLA → fila do CRM; o resto → dossiê do Marcão (inalterado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notificar_handoff_novo_dono(
  _lead_id uuid, _corretor_id uuid, _motivo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead record; _cor record; _payload jsonb;
BEGIN
  -- Redistribuição por SLA: aviso agrupado do próprio CRM. Mesmo critério
  -- que o Marcão usava ("redistribu" E "sla" no motivo).
  IF COALESCE(_motivo, '') ~* 'redistribu' AND COALESCE(_motivo, '') ~* 'sla' THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE id = _lead_id)
       AND _corretor_id IS NOT NULL THEN
      INSERT INTO public.avisos_redistribuicao (lead_id, corretor_id, motivo)
      VALUES (_lead_id, _corretor_id, _motivo);
    END IF;
    RETURN;
  END IF;

  SELECT l.id, l.nome, l.telefone, l.projeto_nome INTO _lead
  FROM public.leads l WHERE l.id = _lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT p.nome, p.telefone INTO _cor
  FROM public.profiles p WHERE p.id = _corretor_id;
  IF NOT FOUND THEN RETURN; END IF;

  _payload := jsonb_build_object(
    'lead_id', _lead.id,
    'nome', _lead.nome,
    'telefone', regexp_replace(COALESCE(_lead.telefone,''), '\D','','g'),
    'empreendimento_nome', _lead.projeto_nome,
    'corretor_nome', _cor.nome,
    'corretor_telefone', public._telefone_e164_br(_cor.telefone),
    'motivo', _motivo,
    'crm_url', 'https://seumetroquadrado-crm.lovable.app/leads/' || _lead.id
  );

  BEGIN
    PERFORM net.http_post(
      url := 'https://guilhermenunessmq.app.n8n.cloud/webhook/copiloto/handoff',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := _payload
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notificar_handoff_novo_dono falhou lead=%: %', _lead_id, SQLERRM;
  END;
END; $$;
REVOKE ALL ON FUNCTION public._notificar_handoff_novo_dono(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Disparo (cron): token de uso único → Edge Function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparar_avisos_redistribuicao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _hora int := EXTRACT(hour FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  _url text;
  _token uuid;
  _req bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.avisos_redistribuicao
    WHERE status = 'pendente'
       OR (status = 'enviando' AND reivindicado_em < now() - interval '15 minutes')
  ) THEN
    RETURN jsonb_build_object('ok', true, 'disparou', false, 'motivo', 'fila_vazia');
  END IF;

  -- Fora do expediente a fila espera: nada de WhatsApp de madrugada.
  IF _hora < 8 OR _hora >= 20 THEN
    RETURN jsonb_build_object('ok', true, 'disparou', false, 'motivo', 'fora_do_horario');
  END IF;

  _url := NULLIF(btrim(COALESCE(public.get_dist_setting('aviso_redistribuicao_url') #>> '{}', '')), '');
  IF _url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'disparou', false, 'motivo', 'sem_url');
  END IF;

  INSERT INTO public.avisos_redistribuicao_disparos DEFAULT VALUES RETURNING token INTO _token;
  SELECT net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('token', _token),
    -- A função espera 5 s entre corretores (até ~80 s por rodada): o padrão
    -- de 5 s do pg_net cortaria a requisição no meio.
    timeout_milliseconds := 120000
  ) INTO _req;
  UPDATE public.avisos_redistribuicao_disparos SET request_id = _req WHERE token = _token;

  RETURN jsonb_build_object('ok', true, 'disparou', true, 'request_id', _req);
END; $$;
REVOKE ALL ON FUNCTION public.disparar_avisos_redistribuicao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disparar_avisos_redistribuicao() TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Reivindicação (Edge Function, com o token)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reivindicar_avisos_redistribuicao(
  _token uuid, _max_corretores integer DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _saltos int := 0;
  _dono_mudou int := 0;
  _corretores uuid[];
  _avisos jsonb;
BEGIN
  UPDATE public.avisos_redistribuicao_disparos
     SET consumido_em = now()
   WHERE token = _token AND consumido_em IS NULL AND expira_em > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'token_invalido');
  END IF;

  -- Lease vencida (a função caiu no meio do envio) volta para a fila.
  UPDATE public.avisos_redistribuicao
     SET status = 'pendente', reivindicado_em = NULL
   WHERE status = 'enviando' AND reivindicado_em < now() - interval '15 minutes';

  -- Salto intermediário: o lead foi redistribuído de novo antes do aviso sair.
  -- Só o aviso mais recente de cada lead vale — os donos do meio não recebem.
  UPDATE public.avisos_redistribuicao a
     SET status = 'descartado', concluido_em = now(), resultado = 'salto_intermediario'
   WHERE a.status = 'pendente'
     AND EXISTS (
       SELECT 1 FROM public.avisos_redistribuicao b
       WHERE b.lead_id = a.lead_id AND b.id > a.id AND b.status IN ('pendente', 'enviando', 'enviado')
     );
  GET DIAGNOSTICS _saltos = ROW_COUNT;

  -- Dono mudou depois (transferência manual, devolução) ou lead saiu do ar:
  -- avisar seria mandar o corretor atrás de um lead que não é mais dele.
  UPDATE public.avisos_redistribuicao a
     SET status = 'descartado', concluido_em = now(), resultado = 'dono_mudou'
    FROM public.leads l
   WHERE a.status = 'pendente'
     AND l.id = a.lead_id
     AND (l.corretor_id IS DISTINCT FROM a.corretor_id
          OR l.deleted_at IS NOT NULL
          OR l.na_lixeira);
  GET DIAGNOSTICS _dono_mudou = ROW_COUNT;

  -- Até _max_corretores corretores por rodada (os de aviso mais antigo
  -- primeiro): cada corretor custa 5 s na função. O resto fica para a próxima.
  SELECT array_agg(corretor_id ORDER BY primeiro)
    INTO _corretores
    FROM (
      SELECT corretor_id, min(id) AS primeiro
      FROM public.avisos_redistribuicao
      WHERE status = 'pendente'
      GROUP BY corretor_id
      ORDER BY min(id)
      LIMIT GREATEST(COALESCE(_max_corretores, 15), 1)
    ) c;

  WITH alvo AS (
    SELECT id FROM public.avisos_redistribuicao
    WHERE status = 'pendente' AND corretor_id = ANY(COALESCE(_corretores, ARRAY[]::uuid[]))
    FOR UPDATE SKIP LOCKED
  ), marcados AS (
    UPDATE public.avisos_redistribuicao a
       SET status = 'enviando', reivindicado_em = now()
      FROM alvo
     WHERE a.id = alvo.id
    RETURNING a.id, a.lead_id, a.corretor_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'lead_id', m.lead_id,
           'lead_nome', l.nome,
           'projeto_nome', l.projeto_nome,
           'corretor_id', m.corretor_id,
           'corretor_nome', p.nome,
           'corretor_telefone', public._telefone_e164_br(p.telefone)
         ) ORDER BY m.id), '[]'::jsonb)
    INTO _avisos
    FROM marcados m
    JOIN public.leads l ON l.id = m.lead_id
    LEFT JOIN public.profiles p ON p.id = m.corretor_id;

  RETURN jsonb_build_object(
    'ok', true,
    'avisos', _avisos,
    'descartados_salto', _saltos,
    'descartados_dono_mudou', _dono_mudou,
    'gestor_telefone',
      NULLIF(btrim(COALESCE(public.get_dist_setting('aviso_redistribuicao_gestor_telefone') #>> '{}', '')), '')
  );
END; $$;
REVOKE ALL ON FUNCTION public.reivindicar_avisos_redistribuicao(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reivindicar_avisos_redistribuicao(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Conclusão (Edge Function, por mensagem enviada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.concluir_avisos_redistribuicao(
  _ids bigint[], _resultado text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _n int;
BEGIN
  -- Falha de envio NÃO volta para a fila: reenvio automático é o caminho da
  -- rajada que derruba a instância. Fica registrada para o gestor ver.
  UPDATE public.avisos_redistribuicao
     SET status = CASE WHEN _resultado = 'enviada' THEN 'enviado' ELSE 'erro' END,
         concluido_em = now(),
         resultado = left(COALESCE(_resultado, ''), 300)
   WHERE id = ANY(COALESCE(_ids, ARRAY[]::bigint[])) AND status = 'enviando';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.concluir_avisos_redistribuicao(bigint[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_avisos_redistribuicao(bigint[], text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Cron
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('avisos-redistribuicao')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisos-redistribuicao');
END $$;
SELECT cron.schedule('avisos-redistribuicao', '*/10 * * * *',
  $$ SELECT public.disparar_avisos_redistribuicao(); $$);
