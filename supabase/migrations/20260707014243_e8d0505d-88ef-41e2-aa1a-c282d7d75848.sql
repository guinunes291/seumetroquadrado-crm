-- 1) Allowlist agente x ação
CREATE TABLE IF NOT EXISTS public.api_escrita_permissoes (
  agente text NOT NULL,
  acao   text NOT NULL,
  ativo  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agente, acao)
);

GRANT ALL ON public.api_escrita_permissoes TO service_role;
ALTER TABLE public.api_escrita_permissoes ENABLE ROW LEVEL SECURITY;
-- Sem policies: apenas service_role (backend) lê/escreve.

-- Seed da matriz do blueprint (idempotente)
INSERT INTO public.api_escrita_permissoes (agente, acao) VALUES
  ('celio','registrar_interacao'),
  ('celio','criar_tarefa'),
  ('celio','concluir_tarefa'),
  ('celio','registrar_analise'),
  ('celio','abrir_pasta'),
  ('celio','agendar_visita'),
  ('celio','ping'),
  ('vitor','registrar_interacao'),
  ('vitor','remarcar_visita'),
  ('vitor','ping'),
  ('debora','registrar_interacao'),
  ('debora','criar_tarefa'),
  ('debora','concluir_tarefa'),
  ('debora','atualizar_pasta'),
  ('debora','ping'),
  ('sergio','registrar_interacao'),
  ('sergio','atualizar_etapa'),
  ('sergio','realocar_corretor'),
  ('sergio','ping'),
  ('warroom','registrar_interacao'),
  ('warroom','criar_tarefa'),
  ('warroom','ping'),
  ('queiroz','registrar_interacao'),
  ('queiroz','ping'),
  ('sami','registrar_interacao'),
  ('sami','criar_tarefa'),
  ('sami','agendar_visita'),
  ('sami','abrir_pasta'),
  ('sami','ping')
ON CONFLICT (agente, acao) DO NOTHING;

-- Helper de checagem
CREATE OR REPLACE FUNCTION public.pode_escrever(_agente text, _acao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.api_escrita_permissoes
    WHERE agente = _agente
      AND acao = _acao
      AND ativo = true
  )
$$;

-- 2) Auditoria da camada de escrita
CREATE TABLE IF NOT EXISTS public.api_escrita_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  agente text,
  acao text,
  lead_id uuid,
  payload jsonb,
  resultado text,        -- 'ok' | 'erro'
  http_status int,
  ip text
);

CREATE INDEX IF NOT EXISTS api_escrita_log_ts_idx      ON public.api_escrita_log (ts DESC);
CREATE INDEX IF NOT EXISTS api_escrita_log_agente_idx  ON public.api_escrita_log (agente, ts DESC);
CREATE INDEX IF NOT EXISTS api_escrita_log_lead_idx    ON public.api_escrita_log (lead_id, ts DESC);

GRANT ALL ON public.api_escrita_log TO service_role;
ALTER TABLE public.api_escrita_log ENABLE ROW LEVEL SECURITY;
-- Sem policies: apenas service_role (backend) lê/escreve.