
-- 1. Novos campos no lead
DO $$ BEGIN
  CREATE TYPE public.lead_estado AS ENUM (
    'EM_QUALIFICACAO','AGUARDANDO_HORARIO','COM_CORRETOR',
    'ATENDIMENTO_HUMANO','EM_FOLLOWUP','FRIO_REATIVACAO','ENCERRADO_OPTOUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estado public.lead_estado,
  ADD COLUMN IF NOT EXISTS motivo_handoff text,
  ADD COLUMN IF NOT EXISTS etapa text,
  ADD COLUMN IF NOT EXISTS handoff_em timestamptz,
  ADD COLUMN IF NOT EXISTS copiloto_notificado_em timestamptz;

-- 2. Config (service role)
CREATE TABLE IF NOT EXISTS public.copiloto_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.copiloto_config TO service_role;
ALTER TABLE public.copiloto_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "copiloto_config_admin_select" ON public.copiloto_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 3. Log de eventos
CREATE TABLE IF NOT EXISTS public.copiloto_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  payload jsonb,
  status_http int,
  resposta text,
  tentativa int NOT NULL DEFAULT 1,
  sucesso boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.copiloto_eventos TO authenticated;
GRANT ALL ON public.copiloto_eventos TO service_role;
ALTER TABLE public.copiloto_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "copiloto_eventos_admin_read" ON public.copiloto_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE INDEX IF NOT EXISTS copiloto_eventos_lead_idx ON public.copiloto_eventos(lead_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS copiloto_eventos_erros_idx ON public.copiloto_eventos(criado_em DESC) WHERE sucesso = false;

-- 4. Função/trigger que dispara HTTP via pg_net
CREATE OR REPLACE FUNCTION public.notificar_copiloto_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _url text;
  _secret text;
BEGIN
  -- Apenas em transição PARA COM_CORRETOR
  IF NEW.estado = 'COM_CORRETOR'::public.lead_estado
     AND (OLD.estado IS DISTINCT FROM NEW.estado) THEN

    NEW.handoff_em := COALESCE(NEW.handoff_em, now());
    NEW.copiloto_notificado_em := NULL; -- garante novo disparo

    SELECT value INTO _url FROM public.copiloto_config WHERE key='handoff_url';
    SELECT value INTO _secret FROM public.copiloto_config WHERE key='handoff_secret';

    IF _url IS NOT NULL AND _secret IS NOT NULL THEN
      PERFORM net.http_post(
        url := _url,
        body := jsonb_build_object('lead_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'X-SMQ-Secret', _secret
        ),
        timeout_milliseconds := 8000
      );
    END IF;
  END IF;

  -- Saiu de COM_CORRETOR → reset para próximo handoff legítimo
  IF OLD.estado = 'COM_CORRETOR'::public.lead_estado
     AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.copiloto_notificado_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE UPDATE para conseguir setar handoff_em sem causar segundo UPDATE
DROP TRIGGER IF EXISTS trg_notificar_copiloto_handoff ON public.leads;
CREATE TRIGGER trg_notificar_copiloto_handoff
  BEFORE UPDATE OF estado ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notificar_copiloto_handoff();

-- 5. View alternativa por região (preço mais baixo na mesma região)
CREATE OR REPLACE VIEW public.projetos_alternativa_regiao AS
SELECT
  p.id           AS projeto_id,
  alt.id         AS alternativa_id,
  alt.nome       AS alternativa_nome,
  alt.bairro     AS alternativa_bairro,
  alt.preco_a_partir AS alternativa_preco
FROM public.projetos p
LEFT JOIN LATERAL (
  SELECT a.* FROM public.projetos a
  WHERE a.ativo
    AND a.deleted_at IS NULL
    AND a.id <> p.id
    AND a.zona_smq IS NOT DISTINCT FROM p.zona_smq
    AND a.preco_a_partir IS NOT NULL
  ORDER BY a.preco_a_partir ASC
  LIMIT 1
) alt ON TRUE
WHERE p.ativo AND p.deleted_at IS NULL;
GRANT SELECT ON public.projetos_alternativa_regiao TO authenticated, service_role;

-- 6. Seed config (URL pública; secret será definido por upsert via código pós-deploy)
INSERT INTO public.copiloto_config(key,value) VALUES
  ('handoff_url','https://seumetroquadrado-crm.lovable.app/api/public/hooks/copiloto-handoff')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
