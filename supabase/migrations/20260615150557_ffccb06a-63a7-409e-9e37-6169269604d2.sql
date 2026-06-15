
-- ============= 1. SOFT DELETE =============
ALTER TABLE public.leads          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.projetos       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.unidades       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.agendamentos   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tarefas        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.interacoes     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_deleted_at        ON public.leads(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projetos_deleted_at     ON public.projetos(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unidades_deleted_at     ON public.unidades(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agendamentos_deleted_at ON public.agendamentos(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_deleted_at      ON public.tarefas(deleted_at) WHERE deleted_at IS NOT NULL;

-- Função de restauração (admin only)
CREATE OR REPLACE FUNCTION public.restaurar_registro(_tabela text, _id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _tabela NOT IN ('leads','projetos','unidades','agendamentos','tarefas','interacoes') THEN
    RAISE EXCEPTION 'tabela invalida';
  END IF;

  EXECUTE format('UPDATE public.%I SET deleted_at = NULL WHERE id = $1', _tabela) USING _id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurar_registro(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_registro(text, uuid) TO authenticated;

-- ============= 2. AUDIT LOG =============
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  operacao text NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  usuario_id uuid,
  valores_antigos jsonb,
  valores_novos jsonb,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tabela_registro ON public.audit_log(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON public.audit_log(usuario_id);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger genérico de auditoria
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old jsonb;
  _new jsonb;
  _diff jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD);
    INSERT INTO public.audit_log(tabela, registro_id, operacao, usuario_id, valores_antigos)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', auth.uid(), _old);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    SELECT jsonb_object_agg(key, value) INTO _diff
    FROM jsonb_each(_new)
    WHERE _old->key IS DISTINCT FROM value;
    IF _diff IS NOT NULL AND _diff <> '{}'::jsonb THEN
      INSERT INTO public.audit_log(tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos, diff)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', auth.uid(), _old, _new, _diff);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW);
    INSERT INTO public.audit_log(tabela, registro_id, operacao, usuario_id, valores_novos)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', auth.uid(), _new);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_leads ON public.leads;
CREATE TRIGGER trg_audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_agendamentos ON public.agendamentos;
CREATE TRIGGER trg_audit_agendamentos
  AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_tarefas ON public.tarefas;
CREATE TRIGGER trg_audit_tarefas
  AFTER INSERT OR UPDATE OR DELETE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_projetos ON public.projetos;
CREATE TRIGGER trg_audit_projetos
  AFTER INSERT OR UPDATE OR DELETE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_unidades ON public.unidades;
CREATE TRIGGER trg_audit_unidades
  AFTER INSERT OR UPDATE OR DELETE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============= 3. DETECTOR DE DUPLICATAS =============
CREATE OR REPLACE FUNCTION public.detectar_duplicatas_leads()
RETURNS TABLE (
  grupo_chave text,
  tipo text,
  quantidade bigint,
  lead_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT regexp_replace(telefone, '\D', '', 'g') AS grupo_chave,
         'telefone'::text AS tipo,
         COUNT(*) AS quantidade,
         array_agg(id ORDER BY created_at) AS lead_ids
  FROM public.leads
  WHERE telefone IS NOT NULL
    AND telefone <> ''
    AND deleted_at IS NULL
  GROUP BY regexp_replace(telefone, '\D', '', 'g')
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT lower(trim(email)) AS grupo_chave,
         'email'::text AS tipo,
         COUNT(*) AS quantidade,
         array_agg(id ORDER BY created_at) AS lead_ids
  FROM public.leads
  WHERE email IS NOT NULL
    AND email <> ''
    AND deleted_at IS NULL
  GROUP BY lower(trim(email))
  HAVING COUNT(*) > 1;
$$;

REVOKE EXECUTE ON FUNCTION public.detectar_duplicatas_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detectar_duplicatas_leads() TO authenticated;

-- Mesclar leads (mantém o destino, transfere interações/tarefas/agendamentos e marca origem como deletado)
CREATE OR REPLACE FUNCTION public.mesclar_leads(_lead_destino uuid, _lead_origem uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL
     OR (NOT public.has_role(_caller, 'admin')
         AND NOT public.has_role(_caller, 'gestor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _lead_destino = _lead_origem THEN
    RAISE EXCEPTION 'destino e origem iguais';
  END IF;

  UPDATE public.interacoes   SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.tarefas      SET lead_id = _lead_destino WHERE lead_id = _lead_origem;
  UPDATE public.agendamentos SET lead_id = _lead_destino WHERE lead_id = _lead_origem;

  UPDATE public.leads
  SET deleted_at = now(),
      observacoes = COALESCE(observacoes, '') ||
        E'\n[Mesclado em ' || to_char(now(),'DD/MM/YYYY HH24:MI') ||
        ' no lead ' || _lead_destino::text || ']'
  WHERE id = _lead_origem;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mesclar_leads(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesclar_leads(uuid, uuid) TO authenticated;
