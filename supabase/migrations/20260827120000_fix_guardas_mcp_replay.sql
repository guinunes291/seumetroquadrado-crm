-- Fix das guardas do MCP que nunca funcionaram — nem no replay do harness,
-- nem em produção:
--
-- (1) mcp_guard_update disparava "nao pode esvaziar campo preenchido
--     (leads.search_text)" em TODO update do MCP em leads: search_text é
--     GENERATED ALWAYS ... STORED e o Postgres computa colunas geradas
--     DEPOIS dos BEFORE-triggers — NEW.search_text chega NULL na guarda
--     mesmo quando o valor final não será vazio (idem
--     convites_crm.email_normalizado). A guarda passa a pular colunas
--     geradas (pg_attribute.attgenerated); colunas normais seguem
--     protegidas.
--
-- (2) mcp_marcar_perdido é SECURITY INVOKER (correto: transicionar_lead
--     deve rodar sob a RLS do caller), mas lia/escrevia api_escrita_log —
--     tabela com RLS sem policies e grants só para service_role — e lia o
--     teto em mcp_config, cuja policy de SELECT é admin-only. Resultado:
--     42501 no count e no INSERT de auditoria, e o teto configurado era
--     invisível ao agente (sempre caía no default 20). As três operações
--     movem para helpers SECURITY DEFINER, no mesmo padrão do
--     mcp_log_bloqueio (20260802203531). Superfície de abuso consciente:
--     um caller authenticated que invoque mcp_registrar_perdido direto só
--     polui a própria trilha de auditoria / aperta o próprio teto — mesma
--     classe do mcp_log_bloqueio, já executável por authenticated.
--
-- (3) mcp_colunas_sem_grant chamava has_column_privilege com o nome
--     fabricado como 'public.'||tabela; sob predicate pushdown o planner
--     avalia isso antes do filtro de schema e aborta em relações do
--     pg_catalog (erro intermitente "public.pg_proc does not exist" no
--     mcp_aplicar_guardas). O nome passa a ser qualificado pelo schema da
--     própria linha.
--
-- Idempotente: CREATE OR REPLACE em tudo; os triggers referenciam as
-- funções por nome e não precisam ser recriados.
-- Rollback: reaplicar as definições de 20260802205537 (guarda) e
-- 20260802203531 (wrapper) e dropar os dois helpers.

-- ---------------------------------------------------------------------------
-- 1. Guarda de UPDATE: pular colunas geradas no bloco "não esvaziar"
-- ---------------------------------------------------------------------------
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

  -- Não esvaziar: pula colunas GERADAS (GENERATED ALWAYS ... STORED). Elas
  -- são computadas DEPOIS dos BEFORE-triggers, então NEW.<col> chega NULL
  -- aqui mesmo quando o valor final não será vazio (leads.search_text,
  -- convites_crm.email_normalizado) — sem o filtro, TODO update do MCP em
  -- leads era bloqueado.
  FOR k IN
    SELECT jk.key
    FROM jsonb_object_keys(o) AS jk(key)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = TG_RELID AND a.attname = jk.key AND a.attgenerated <> ''
    )
  LOOP
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

-- ---------------------------------------------------------------------------
-- 2. Detector de grants sem depender da ordem de avaliação do planner
-- ---------------------------------------------------------------------------
-- O original chamava has_column_privilege('authenticated',
-- format('public.%I', table_name), ...) — sob predicate pushdown o planner
-- pode avaliar a função ANTES do filtro table_schema = 'public', e aí a
-- format() fabrica nomes inexistentes (ex.: public.pg_proc, vindo do
-- pg_catalog) e o SELECT inteiro aborta com 42P01. Erro intermitente por
-- construção: depende do plano. Qualificar com o schema DA PRÓPRIA LINHA
-- torna o nome válido para qualquer linha, em qualquer ordem de avaliação.
CREATE OR REPLACE VIEW public.mcp_colunas_sem_grant
WITH (security_invoker = true) AS
SELECT c.table_name::text AS tabela, c.column_name::text AS coluna
FROM information_schema.columns c
JOIN (SELECT DISTINCT tabela FROM public.mcp_colunas_segredo()) s ON s.tabela = c.table_name
WHERE c.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM public.mcp_colunas_segredo() seg
    WHERE seg.tabela = c.table_name AND seg.coluna = c.column_name)
  AND NOT has_column_privilege(
        'authenticated',
        format('%I.%I', c.table_schema, c.table_name),
        c.column_name, 'SELECT');
GRANT SELECT ON public.mcp_colunas_sem_grant TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Orçamento e auditoria de "perdido" atrás de SECURITY DEFINER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_perdidos_orcamento(OUT usados int, OUT teto int)
RETURNS record
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::int FROM public.api_escrita_log
      WHERE agente = 'mcp' AND acao = 'perdido' AND resultado = 'ok'
        AND ts > date_trunc('day', now())),
    coalesce((SELECT (valor #>> '{}')::int FROM public.mcp_config
               WHERE chave = 'perdidos_teto_dia'), 20);
$$;
REVOKE ALL ON FUNCTION public.mcp_perdidos_orcamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_perdidos_orcamento() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_registrar_perdido(
  _lead_id uuid, _motivo text, _motivo_categoria text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.api_escrita_log
    (agente, acao, tabela, registro_id, lead_id, diff, ator, origem, resultado, http_status)
  VALUES ('mcp', 'perdido', 'leads', _lead_id, _lead_id,
          jsonb_build_object('motivo', _motivo, 'categoria', _motivo_categoria),
          auth.uid()::text, 'mcp', 'ok', 200);
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_registrar_perdido(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_registrar_perdido(uuid, text, text) TO authenticated, service_role;

-- Wrapper segue SECURITY INVOKER: transicionar_lead deve rodar sob a RLS do
-- caller. Só o orçamento e o registro de auditoria passam pelos helpers.
CREATE OR REPLACE FUNCTION public.mcp_marcar_perdido(
  _lead_id uuid, _motivo text, _motivo_categoria text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE teto int; usados int;
BEGIN
  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'motivo obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF _motivo_categoria IS NULL OR btrim(_motivo_categoria) = '' THEN
    RAISE EXCEPTION 'motivo_categoria obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF public.is_mcp() THEN
    SELECT p.usados, p.teto INTO usados, teto FROM public.mcp_perdidos_orcamento() p;
    IF usados >= teto THEN
      PERFORM public.mcp_log_bloqueio('leads', 'perdido', 'teto diario atingido: ' || teto);
      RAISE EXCEPTION 'teto diario de leads perdidos atingido (%/dia)', teto USING ERRCODE = '54000';
    END IF;
    PERFORM set_config('app.mcp_perdido', '1', true);
  END IF;

  PERFORM public.transicionar_lead(_lead_id, 'perdido'::public.lead_status,
    _motivo, _motivo_categoria, NULL, NULL);

  IF public.is_mcp() THEN
    PERFORM set_config('app.mcp_perdido', '0', true);
    PERFORM public.mcp_registrar_perdido(_lead_id, _motivo, _motivo_categoria);
  END IF;
  RETURN jsonb_build_object('ok', true, 'lead_id', _lead_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mcp_marcar_perdido(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sanidade: falha o replay se o fix não ficou de pé
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF pg_get_viewdef('public.mcp_colunas_sem_grant'::regclass) NOT LIKE '%table_schema%table_name%' THEN
    RAISE EXCEPTION 'fix_guardas_mcp: view do detector sem o nome qualificado pela linha';
  END IF;
  IF to_regprocedure('public.mcp_perdidos_orcamento()') IS NULL THEN
    RAISE EXCEPTION 'fix_guardas_mcp: helper mcp_perdidos_orcamento ausente';
  END IF;
  IF to_regprocedure('public.mcp_registrar_perdido(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'fix_guardas_mcp: helper mcp_registrar_perdido ausente';
  END IF;
  IF pg_get_functiondef('public.mcp_guard_update()'::regprocedure) NOT LIKE '%attgenerated%' THEN
    RAISE EXCEPTION 'fix_guardas_mcp: guarda sem o filtro de colunas geradas';
  END IF;
  IF (SELECT prosecdef FROM pg_proc
      WHERE oid = 'public.mcp_marcar_perdido(uuid,text,text)'::regprocedure) THEN
    RAISE EXCEPTION 'fix_guardas_mcp: wrapper deveria seguir SECURITY INVOKER';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc
          WHERE oid = 'public.mcp_perdidos_orcamento()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc
             WHERE oid = 'public.mcp_registrar_perdido(uuid,text,text)'::regprocedure) THEN
    RAISE EXCEPTION 'fix_guardas_mcp: helpers deveriam ser SECURITY DEFINER';
  END IF;
  IF pg_get_functiondef('public.mcp_marcar_perdido(uuid,text,text)'::regprocedure)
     LIKE '%api_escrita_log%' THEN
    RAISE EXCEPTION 'fix_guardas_mcp: wrapper ainda acessa api_escrita_log direto';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
