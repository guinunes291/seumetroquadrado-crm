-- Clientes externos da API publica: credenciais individuais, escopos e restricoes.
-- O segredo em texto puro nunca entra no banco; somente SHA-256 hexadecimal.

DO $$
BEGIN
  CREATE TYPE public.api_cliente_escopo AS ENUM (
    'leads:read',
    'leads:write',
    'events:write',
    'sales:read',
    'commissions:read',
    'metrics:read'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.api_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 120),
  -- lowercase hex(sha256(secret)); nunca armazene o segredo original.
  segredo_hash text NOT NULL UNIQUE
    CHECK (segredo_hash ~ '^[0-9a-f]{64}$'),
  -- Identificador operacional nao secreto (ex.: ultimos 8 chars do hash).
  segredo_prefixo text NOT NULL CHECK (length(segredo_prefixo) BETWEEN 4 AND 24),
  ativo boolean NOT NULL DEFAULT true,
  valido_de timestamptz NOT NULL DEFAULT now(),
  valido_ate timestamptz,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_revogacao text,
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE RESTRICT,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE RESTRICT,
  rotacionado_de_id uuid REFERENCES public.api_clientes(id) ON DELETE SET NULL,
  substituido_por_id uuid REFERENCES public.api_clientes(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_clientes_validade_check
    CHECK (valido_ate IS NULL OR valido_ate > valido_de),
  CONSTRAINT api_clientes_revogacao_check
    CHECK (revogado_em IS NULL OR ativo = false)
);

CREATE TABLE IF NOT EXISTS public.api_cliente_escopos (
  cliente_id uuid NOT NULL REFERENCES public.api_clientes(id) ON DELETE CASCADE,
  escopo public.api_cliente_escopo NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (cliente_id, escopo)
);

CREATE TABLE IF NOT EXISTS public.api_cliente_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id uuid REFERENCES public.api_clientes(id) ON DELETE SET NULL,
  escopo public.api_cliente_escopo,
  metodo text NOT NULL CHECK (length(metodo) BETWEEN 1 AND 12),
  rota text NOT NULL CHECK (length(rota) BETWEEN 1 AND 500),
  resultado text NOT NULL CHECK (resultado IN ('autorizado', 'negado', 'erro')),
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  -- Hash SHA-256 do IP, sem armazenar o endereco em claro.
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  request_id text CHECK (request_id IS NULL OR length(request_id) <= 128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_clientes_ativos_idx
  ON public.api_clientes (ativo, valido_ate)
  WHERE revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS api_clientes_equipe_idx
  ON public.api_clientes (equipe_id)
  WHERE ativo AND revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS api_clientes_projeto_idx
  ON public.api_clientes (projeto_id)
  WHERE ativo AND revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS api_cliente_auditoria_cliente_created_idx
  ON public.api_cliente_auditoria (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_cliente_auditoria_created_idx
  ON public.api_cliente_auditoria (created_at DESC);

DROP TRIGGER IF EXISTS trg_api_clientes_updated ON public.api_clientes;
CREATE TRIGGER trg_api_clientes_updated
  BEFORE UPDATE ON public.api_clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.api_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_clientes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_escopos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_escopos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_cliente_auditoria FORCE ROW LEVEL SECURITY;

-- Nenhuma policy para anon/authenticated: credenciais e auditoria sao server-only.
REVOKE ALL ON public.api_clientes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_cliente_escopos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_cliente_auditoria FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.api_cliente_auditoria_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_clientes TO service_role;
GRANT ALL ON public.api_cliente_escopos TO service_role;
GRANT ALL ON public.api_cliente_auditoria TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.api_cliente_auditoria_id_seq TO service_role;

COMMENT ON TABLE public.api_clientes IS
  'Credenciais de integracoes externas. segredo_hash e SHA-256; segredo em claro e proibido.';
COMMENT ON COLUMN public.api_clientes.segredo_hash IS
  'SHA-256 hexadecimal lowercase do X-API-Key; nunca registrar ou retornar o segredo.';
COMMENT ON TABLE public.api_cliente_auditoria IS
  'Trilha de autenticacao da API sem payload e sem PII em claro.';
