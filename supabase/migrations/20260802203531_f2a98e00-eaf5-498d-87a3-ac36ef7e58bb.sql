-- =====================================================================
-- MCP plano B: identidade de app com escrita total, exclusão barrada
-- =====================================================================

-- 1. identidade -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mcp_identidade (
  uid uuid PRIMARY KEY,
  ativo boolean NOT NULL DEFAULT true,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_identidade TO authenticated;
GRANT ALL ON public.mcp_identidade TO service_role;
ALTER TABLE public.mcp_identidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_identidade_admin ON public.mcp_identidade;
CREATE POLICY mcp_identidade_admin ON public.mcp_identidade
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.mcp_config (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_config TO authenticated;
GRANT ALL ON public.mcp_config TO service_role;
ALTER TABLE public.mcp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_config_admin ON public.mcp_config;
CREATE POLICY mcp_config_admin ON public.mcp_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.mcp_config (chave, valor)
VALUES ('perdidos_teto_dia', '20'::jsonb)
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_mcp()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mcp_identidade m
    WHERE m.uid = auth.uid() AND m.ativo
  );
$$;

-- registra automaticamente o profile do agente quando ele for criado
CREATE OR REPLACE FUNCTION public.mcp_autoregistrar_identidade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(coalesce(NEW.email,'')) = 'mcp-agent@seumetroquadrado.com.br' THEN
    INSERT INTO public.mcp_identidade (uid, nota)
    VALUES (NEW.id, 'agente MCP (auto-registrado)')
    ON CONFLICT (uid) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mcp_autoregistrar ON public.profiles;
CREATE TRIGGER trg_mcp_autoregistrar
  AFTER INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.mcp_autoregistrar_identidade();

-- 2. auditoria --------------------------------------------------------
ALTER TABLE public.api_escrita_log
  ADD COLUMN IF NOT EXISTS tabela text,
  ADD COLUMN IF NOT EXISTS registro_id uuid,
  ADD COLUMN IF NOT EXISTS diff jsonb,
  ADD COLUMN IF NOT EXISTS ator text,
  ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.api_escrita_log ALTER COLUMN http_status DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.mcp_guard_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb := '{}'::jsonb;
  o jsonb;
  n jsonb;
  k text;
  rid uuid;
BEGIN
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

CREATE OR REPLACE FUNCTION public.mcp_log_bloqueio(_tabela text, _acao text, _detalhe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.api_escrita_log
    (agente, acao, tabela, diff, ator, origem, resultado, http_status)
  VALUES ('mcp', _acao, _tabela, jsonb_build_object('bloqueio', _detalhe),
          auth.uid()::text, 'mcp', 'erro', 403);
EXCEPTION WHEN others THEN NULL;
END;
$$;

-- 3. as quatro travas -------------------------------------------------

-- 3.1 nunca excluir
CREATE OR REPLACE FUNCTION public.mcp_guard_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_mcp() THEN RETURN OLD; END IF;
  PERFORM public.mcp_log_bloqueio(TG_TABLE_NAME, 'delete', 'delete proibido');
  RAISE EXCEPTION 'MCP nao pode excluir (tabela %)', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;

-- 3.2 soft delete / desativação  +  3.3 não esvaziar campo preenchido
CREATE OR REPLACE FUNCTION public.mcp_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb; n jsonb; k text; ov jsonb; nv jsonb;
BEGIN
  IF NOT public.is_mcp() THEN RETURN NEW; END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);

  -- lixeira
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

  -- lead perdido só via wrapper
  IF TG_TABLE_NAME = 'leads'
     AND (n ->> 'status') = 'perdido' AND (o ->> 'status') IS DISTINCT FROM 'perdido'
     AND coalesce(current_setting('app.mcp_perdido', true), '') <> '1' THEN
    PERFORM public.mcp_log_bloqueio('leads', 'perdido', 'use mcp_marcar_perdido');
    RAISE EXCEPTION 'MCP deve usar public.mcp_marcar_perdido() para marcar lead como perdido'
      USING ERRCODE = '42501';
  END IF;

  -- não esvaziar
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

-- 3.4 financeiro
CREATE OR REPLACE FUNCTION public.mcp_guard_vendas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_mcp() THEN RETURN NEW; END IF;
  IF OLD.status_venda IN ('aprovada','cancelada') THEN
    PERFORM public.mcp_log_bloqueio('vendas', 'update', 'venda ' || OLD.status_venda::text || ' imutavel');
    RAISE EXCEPTION 'MCP nao pode alterar venda % (registro decidido)', OLD.status_venda
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status_venda = 'aprovada' THEN
    PERFORM public.mcp_log_bloqueio('vendas', 'aprovar', 'aprovacao e humana');
    RAISE EXCEPTION 'MCP nao pode aprovar venda — aprovacao e humana' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_guard_comissoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb := to_jsonb(OLD);
BEGIN
  IF NOT public.is_mcp() THEN RETURN NEW; END IF;
  IF (o ? 'status') AND lower(coalesce(o ->> 'status','')) IN ('paga','pago') THEN
    PERFORM public.mcp_log_bloqueio('comissoes', 'update', 'comissao paga imutavel');
    RAISE EXCEPTION 'MCP nao pode alterar comissao paga' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. aplicador idempotente + detector ---------------------------------
CREATE OR REPLACE FUNCTION public.mcp_aplicar_guardas()
RETURNS TABLE(tabela text, acao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname::text AS nome
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN ('api_escrita_log')
    ORDER BY c.relname
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t.oid AND g.tgname = 'mcp_g1_delete') THEN
      EXECUTE format('CREATE TRIGGER mcp_g1_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_delete()', t.nome);
      tabela := t.nome; acao := 'g1_delete'; RETURN NEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t.oid AND g.tgname = 'mcp_g2_update') THEN
      EXECUTE format('CREATE TRIGGER mcp_g2_update BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_update()', t.nome);
      tabela := t.nome; acao := 'g2_update'; RETURN NEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = t.oid AND g.tgname = 'mcp_g4_audit') THEN
      EXECUTE format('CREATE TRIGGER mcp_g4_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_audit()', t.nome);
      tabela := t.nome; acao := 'g4_audit'; RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

SELECT * FROM public.mcp_aplicar_guardas();

DROP TRIGGER IF EXISTS mcp_g5_vendas ON public.vendas;
CREATE TRIGGER mcp_g5_vendas BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_vendas();
DROP TRIGGER IF EXISTS mcp_g5_comissoes ON public.comissoes;
CREATE TRIGGER mcp_g5_comissoes BEFORE UPDATE ON public.comissoes
  FOR EACH ROW EXECUTE FUNCTION public.mcp_guard_comissoes();

CREATE OR REPLACE VIEW public.mcp_tabelas_sem_guarda
WITH (security_invoker = true) AS
SELECT c.relname::text AS tabela
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname <> 'api_escrita_log'
  AND (
    NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = 'mcp_g1_delete')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = 'mcp_g2_update')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = 'mcp_g4_audit')
  );
GRANT SELECT ON public.mcp_tabelas_sem_guarda TO authenticated;

CREATE OR REPLACE VIEW public.mcp_escrita_hoje
WITH (security_invoker = true) AS
SELECT tabela, acao, resultado, count(*)::int AS total, max(ts) AS ultima
FROM public.api_escrita_log
WHERE agente = 'mcp' AND ts > now() - interval '24 hours'
GROUP BY 1,2,3;
GRANT SELECT ON public.mcp_escrita_hoje TO authenticated;

-- 5. wrapper de perdido ----------------------------------------------
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
    SELECT (valor #>> '{}')::int INTO teto FROM public.mcp_config WHERE chave = 'perdidos_teto_dia';
    teto := coalesce(teto, 20);
    SELECT count(*)::int INTO usados FROM public.api_escrita_log
      WHERE agente = 'mcp' AND acao = 'perdido' AND resultado = 'ok'
        AND ts > date_trunc('day', now());
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
    INSERT INTO public.api_escrita_log
      (agente, acao, tabela, registro_id, lead_id, diff, ator, origem, resultado, http_status)
    VALUES ('mcp', 'perdido', 'leads', _lead_id, _lead_id,
            jsonb_build_object('motivo', _motivo, 'categoria', _motivo_categoria),
            auth.uid()::text, 'mcp', 'ok', 200);
  END IF;
  RETURN jsonb_build_object('ok', true, 'lead_id', _lead_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mcp_marcar_perdido(uuid, text, text) TO authenticated;

-- 6. funções de limpeza fora do alcance do app -------------------------
REVOKE EXECUTE ON FUNCTION public.expirar_lixeira_antiga() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_landing_webhook_state(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.limpar_vitrine_eventos_expirados(timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.release_landing_webhook_request(text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.arquivar_leads_sem_contato_30d() FROM authenticated;

-- 7. colunas-segredo que a UI nao usa ----------------------------------
REVOKE SELECT (key) ON public.copiloto_config FROM authenticated;
REVOKE SELECT (link_token) ON public.propostas FROM authenticated;
REVOKE SELECT (lease_token) ON public.push_outbox FROM authenticated;

-- 8. permissões de agente (padrão dos outros 7) ------------------------
INSERT INTO public.api_escrita_permissoes (agente, acao, ativo)
SELECT 'mcp', a, true FROM unnest(ARRAY[
  'criar_lead','atualizar_lead','registrar_interacao','criar_tarefa',
  'mover_etapa','marcar_perdido','realocar_corretor','registrar_venda'
]) a
ON CONFLICT DO NOTHING;

-- 9. verificação diária das guardas ------------------------------------
SELECT cron.unschedule('mcp-aplicar-guardas') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mcp-aplicar-guardas');
SELECT cron.schedule('mcp-aplicar-guardas', '17 4 * * *',
  $$ SELECT public.mcp_aplicar_guardas(); $$);
