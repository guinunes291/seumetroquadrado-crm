-- =====================================================================
-- 1. curto-circuito: sem usuário logado (cron/service_role) nada é tocado
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_mcp()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cache text; u text; v boolean;
BEGIN
  u := auth.uid()::text;
  IF u IS NULL THEN RETURN false; END IF;   -- cron, service_role, backfill
  cache := current_setting('app.is_mcp_cache', true);
  IF cache = u || ':t' THEN RETURN true; END IF;
  IF cache = u || ':f' THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.mcp_identidade m
    WHERE m.uid = auth.uid() AND m.ativo
  ) INTO v;
  PERFORM set_config('app.is_mcp_cache', u || CASE WHEN v THEN ':t' ELSE ':f' END, true);
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_guard_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN OLD; END IF;
  IF NOT public.is_mcp() THEN RETURN OLD; END IF;
  PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'delete', 'delete proibido');
  RAISE EXCEPTION 'MCP nao pode excluir (tabela %)', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb; n jsonb; k text; ov jsonb; nv jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT public.is_mcp() THEN RETURN NEW; END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);

  IF (o ? 'deleted_at') AND (o ->> 'deleted_at') IS NULL AND (n ->> 'deleted_at') IS NOT NULL THEN
    PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'soft_delete', 'deleted_at');
    RAISE EXCEPTION 'MCP nao pode enviar para a lixeira (tabela %)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF (o ? 'na_lixeira') AND (o ->> 'na_lixeira') = 'false' AND (n ->> 'na_lixeira') = 'true' THEN
    PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'soft_delete', 'na_lixeira');
    RAISE EXCEPTION 'MCP nao pode enviar para a lixeira (tabela %)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF (o ? 'ativo') AND (o ->> 'ativo') = 'true' AND (n ->> 'ativo') = 'false' THEN
    PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'soft_delete', 'ativo');
    RAISE EXCEPTION 'MCP nao pode desativar registro (tabela %)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF (o ? 'ativa') AND (o ->> 'ativa') = 'true' AND (n ->> 'ativa') = 'false' THEN
    PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'soft_delete', 'ativa');
    RAISE EXCEPTION 'MCP nao pode desativar registro (tabela %)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF (o ? 'removido_em') AND (o ->> 'removido_em') IS NULL AND (n ->> 'removido_em') IS NOT NULL THEN
    PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'soft_delete', 'removido_em');
    RAISE EXCEPTION 'MCP nao pode remover versao (tabela %)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'leads'
     AND (n ->> 'status') = 'perdido' AND (o ->> 'status') IS DISTINCT FROM 'perdido'
     AND coalesce(current_setting('app.mcp_perdido', true), '') <> '1' THEN
    PERFORM public.mcp_log_bloqueio('leads', 'perdido', 'use mcp_marcar_perdido');
    RAISE EXCEPTION 'MCP deve usar public.mcp_marcar_perdido() para marcar lead como perdido'
      USING ERRCODE = '42501';
  END IF;

  FOR k IN SELECT jsonb_object_keys(o) LOOP
    ov := o -> k; nv := n -> k;
    IF ov IS DISTINCT FROM nv
       AND jsonb_typeof(ov) <> 'null' AND (ov #>> '{}') <> ''
       AND (nv IS NULL OR jsonb_typeof(nv) = 'null' OR (nv #>> '{}') = '') THEN
      PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'esvaziar', k);
      RAISE EXCEPTION 'MCP nao pode esvaziar campo preenchido (%.%)', TG_TABLE_NAME, k
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_guard_vendas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT public.is_mcp() THEN RETURN NEW; END IF;
  IF OLD.status_venda IN ('aprovada','cancelada') THEN
    PERFORM public.mcp_log_bloqueio('vendas', 'update', 'venda ' || OLD.status_venda::text || ' imutavel');
    RAISE EXCEPTION 'MCP nao pode alterar venda % (registro decidido)', OLD.status_venda
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status_venda = 'aprovada' THEN
    PERFORM public.mcp_log_bloqueio('vendas', 'aprovar', 'aprovacao e humana');
    RAISE EXCEPTION 'MCP nao pode aprovar venda - aprovacao e humana' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_guard_comissoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT public.is_mcp() THEN RETURN NEW; END IF;
  o := to_jsonb(OLD);
  IF (o ? 'status') AND lower(coalesce(o ->> 'status','')) IN ('paga','pago') THEN
    PERFORM public.mcp_log_bloqueio('comissoes', 'update', 'comissao paga imutavel');
    RAISE EXCEPTION 'MCP nao pode alterar comissao paga' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_guard_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb := '{}'::jsonb; o jsonb; n jsonb; k text; rid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT public.is_mcp() THEN RETURN NEW; END IF;
  n := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF (o -> k) IS DISTINCT FROM (n -> k) THEN
        d := d || jsonb_build_object(k, jsonb_build_object('de', o -> k, 'para', n -> k));
      END IF;
    END LOOP;
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
  ELSE
    d := n;
  END IF;
  BEGIN rid := (n ->> 'id')::uuid; EXCEPTION WHEN others THEN rid := NULL; END;
  INSERT INTO public.api_escrita_log
    (agente, acao, tabela, registro_id, diff, ator, origem, resultado, http_status, lead_id)
  VALUES ('mcp', lower(TG_OP), TG_TABLE_NAME, rid, d, auth.uid()::text, 'mcp', 'ok', NULL,
          CASE WHEN TG_TABLE_NAME = 'leads' THEN rid
               WHEN (n ? 'lead_id') THEN (n ->> 'lead_id')::uuid END);
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 2. kill switch fora do alcance do agente
-- =====================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mcp_identidade FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mcp_config FROM authenticated;

CREATE OR REPLACE FUNCTION public.mcp_guard_identidade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF public.is_mcp() THEN
    RAISE EXCEPTION 'MCP nao pode alterar a propria identidade/config (%).', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS mcp_g0_identidade ON public.mcp_identidade;
CREATE TRIGGER mcp_g0_identidade BEFORE INSERT OR UPDATE OR DELETE ON public.mcp_identidade
  FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_identidade();
DROP TRIGGER IF EXISTS mcp_g0_identidade ON public.mcp_config;
CREATE TRIGGER mcp_g0_identidade BEFORE INSERT OR UPDATE OR DELETE ON public.mcp_config
  FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_identidade();

-- =====================================================================
-- 3. grants por coluna: sincronização automática (fim da dívida silenciosa)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mcp_colunas_segredo()
RETURNS TABLE(tabela text, coluna text)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
    ('copiloto_config', 'key'),
    ('propostas', 'link_token'),
    ('push_outbox', 'lease_token')
  ) v(tabela, coluna);
$$;

CREATE OR REPLACE VIEW public.mcp_colunas_sem_grant
WITH (security_invoker = true) AS
SELECT c.table_name::text AS tabela, c.column_name::text AS coluna
FROM information_schema.columns c
JOIN (SELECT DISTINCT tabela FROM public.mcp_colunas_segredo()) s ON s.tabela = c.table_name
WHERE c.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM public.mcp_colunas_segredo() seg
    WHERE seg.tabela = c.table_name AND seg.coluna = c.column_name)
  AND NOT has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'SELECT');
GRANT SELECT ON public.mcp_colunas_sem_grant TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_sincronizar_grants_colunas()
RETURNS TABLE(tabela text, coluna text, acao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.mcp_colunas_sem_grant LOOP
    EXECUTE format('GRANT SELECT (%I) ON public.%I TO authenticated', r.coluna, r.tabela);
    tabela := r.tabela; coluna := r.coluna; acao := 'grant'; RETURN NEXT;
  END LOOP;
  -- reforça o revoke das colunas-segredo (idempotente)
  FOR r IN SELECT * FROM public.mcp_colunas_segredo() LOOP
    EXECUTE format('REVOKE SELECT (%I) ON public.%I FROM authenticated', r.coluna, r.tabela);
  END LOOP;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_sincronizar_grants_colunas() FROM PUBLIC, anon, authenticated;

-- entra no mesmo checklist das guardas
CREATE OR REPLACE FUNCTION public.mcp_aplicar_guardas()
RETURNS TABLE(tabela text, acao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; g record;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname::text AS nome
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN ('api_escrita_log')
    ORDER BY c.relname
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger x WHERE x.tgrelid = t.oid AND x.tgname = 'mcp_g1_delete') THEN
      EXECUTE format('CREATE TRIGGER mcp_g1_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_delete()', t.nome);
      tabela := t.nome; acao := 'g1_delete'; RETURN NEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger x WHERE x.tgrelid = t.oid AND x.tgname = 'mcp_g2_update') THEN
      EXECUTE format('CREATE TRIGGER mcp_g2_update BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_update()', t.nome);
      tabela := t.nome; acao := 'g2_update'; RETURN NEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger x WHERE x.tgrelid = t.oid AND x.tgname = 'mcp_g4_audit') THEN
      EXECUTE format('CREATE TRIGGER mcp_g4_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_audit()', t.nome);
      tabela := t.nome; acao := 'g4_audit'; RETURN NEXT;
    END IF;
  END LOOP;

  FOR g IN SELECT * FROM public.mcp_sincronizar_grants_colunas() LOOP
    tabela := g.tabela; acao := 'grant_coluna:' || g.coluna; RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

SELECT public.mcp_sincronizar_grants_colunas();