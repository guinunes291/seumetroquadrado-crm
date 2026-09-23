-- ===========================================================================
-- CADÊNCIA — corretor inativo não segura lead em formação
-- ===========================================================================
-- Cadência em 20260921120000..20260924120000; base em formação em
-- 20260925120000. Desenho: docs/ops/cadencia-followup-reativacao.md.
--
-- Medido em produção em 22/09/2026, logo depois da base em formação: 7 leads
-- em D1/D2/D3 com dono fora da tabela de corretores, dos quais 5 com o perfil
-- INATIVO (cauã Caetano, Ezequiel Silva, Juliana Alonso ×2, Emilly Vitória).
-- Ninguém trabalha esses leads. O prazo da etapa vence, `cadencia_vencidos`
-- os devolve à roleta e o painel registra "falha" de quem já saiu da casa —
-- um número errado sobre uma pessoa, e dias de um lead parado por nada.
--
-- A origem é um defeito da Fase 0 (20260923120000): a classificação exigia
-- lead COM corretor, mas nunca perguntou se o corretor está ATIVO.
--
-- Três mudanças, uma regra — "cadência é trabalho de quem está na casa":
--
--   1. A classificação da Fase 0 não manda para a cadência lead de dono
--      inativo. Os outros destinos não mudam: número inválido continua
--      encerrado e estoque > 30 dias continua indo à reativação, que é
--      trabalho do SDR e não depende de quem era o dono.
--   2. `cadencia_iniciar` recusa dono inativo — a segunda linha de defesa para
--      qualquer outro caminho que tente começar uma cadência.
--   3. `cadencia_devolver_inativos` devolve à roleta, pelo MESMO caminho da
--      cadência (`_cadencia_devolver_roleta`), o lead em D1/D2/D3 de dono
--      inativo. Roda uma vez aqui e, daqui em diante, no início do motor de
--      vencidos: corretor desligado amanhã não deixa lead esperando vencer.
--
-- O job do log é `inativo`, e não `vencidos`, de propósito: o painel conta
-- como FALHA do corretor só o job `vencidos` (20260924120000). Sair da casa não
-- é deixar a etapa vencer.
--
-- Idempotente. Rollback: reaplicar cadencia_iniciar e cadencia_vencidos de
-- 20260921120100 e cadencia_fase0_classificar de 20260923120000.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) O log aceita o job novo
-- ---------------------------------------------------------------------------
ALTER TABLE public.cadencia_execucao_log DROP CONSTRAINT IF EXISTS cadencia_execucao_log_job_check;
ALTER TABLE public.cadencia_execucao_log
  ADD CONSTRAINT cadencia_execucao_log_job_check
  CHECK (job IN ('avancar','encerrar','vencidos','auditoria','fase0','inativo'));

-- ---------------------------------------------------------------------------
-- 2) Dono ativo: a pergunta num lugar só
-- ---------------------------------------------------------------------------
-- Sem perfil é tratado como inativo: lead cujo dono sumiu da tabela de
-- perfis também não tem quem o trabalhe.
CREATE OR REPLACE FUNCTION public._cadencia_dono_ativo(_corretor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((SELECT p.ativo FROM public.profiles p WHERE p.id = _corretor), false);
$$;

-- ---------------------------------------------------------------------------
-- 3) cadencia_iniciar recusa dono inativo
-- ---------------------------------------------------------------------------
-- Idêntica a 20260921120100 mais a guarda do dono.
CREATE OR REPLACE FUNCTION public.cadencia_iniciar(_lead uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _l public.leads%ROWTYPE;
BEGIN
  SELECT * INTO _l FROM public.leads WHERE id = _lead;
  IF NOT FOUND OR _l.corretor_id IS NULL THEN
    RETURN false;
  END IF;
  -- Cadência é trabalho de quem está na casa (20260926120000).
  IF NOT public._cadencia_dono_ativo(_l.corretor_id) THEN
    RETURN false;
  END IF;
  IF _l.cadencia_etapa IS NOT NULL
     OR _l.arquivado_em IS NOT NULL
     OR COALESCE(_l.opt_out, false)
     OR COALESCE(_l.na_lixeira, false)
     OR _l.deleted_at IS NOT NULL
     OR _l.status NOT IN (
          'novo'::public.lead_status,
          'aguardando_atendimento'::public.lead_status,
          'aguardando_corretor'::public.lead_status,
          'em_atendimento'::public.lead_status,
          'aguardando_retorno'::public.lead_status
        ) THEN
    RETURN false;
  END IF;
  UPDATE public.leads
     SET cadencia_etapa     = 'D1',
         cadencia_inicio_ts = now(),
         cadencia_prazo_ts  = public.cadencia_fim_do_dia(now(), 0)
   WHERE id = _lead;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.cadencia_iniciar(uuid) IS
  'Coloca o lead em D1 com prazo no fim do dia. Chamado pelo gatilho de '
  'atribuição de corretor e pela admissão da Fase 0; ignora quem já está em '
  'cadência, fora da janela pré-resposta, ou com dono inativo.';

-- ---------------------------------------------------------------------------
-- 4) Fase 0: a classificação não manda dono inativo para a cadência
-- ---------------------------------------------------------------------------
-- Idêntica a 20260923120000 com o filtro no fim. Mesma função para o ensaio e
-- para a execução — o número do dry-run continua sendo o número da carga, e a
-- contagem "faltam N" do painel deixa de prometer leads que ninguém trabalharia.
CREATE OR REPLACE FUNCTION public.cadencia_fase0_classificar()
RETURNS TABLE(
  lead_id       uuid,
  corretor_id   uuid,
  destino       text,
  dias_parado   integer,
  motivo        text,
  escrita_lote  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH base AS (
    SELECT
      l.id,
      l.corretor_id,
      public.higiene_dias_parado(l.ultima_interacao, l.ultimo_contato, l.created_at) AS dias,
      public.telefone_suspeito(l.telefone) AS suspeito,
      COALESCE(l.opt_out, false) AS optout,
      (count(*) OVER (PARTITION BY date_trunc('second',
         COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)))
       >= (SELECT lote_min_leads FROM public.higiene_config WHERE id)) AS em_lote,
      public._cadencia_dono_ativo(l.corretor_id) AS dono_ativo
    FROM public.leads l
    WHERE l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND l.corretor_id IS NOT NULL
      AND l.cadencia_etapa IS NULL
      AND l.arquivado_em IS NULL
      AND l.status IN ('novo'::public.lead_status,
                       'aguardando_atendimento'::public.lead_status,
                       'aguardando_corretor'::public.lead_status,
                       'em_atendimento'::public.lead_status,
                       'aguardando_retorno'::public.lead_status)
      AND NOT public._lead_venda_viva(l.id)
  ),
  classificado AS (
    SELECT
      b.id,
      b.corretor_id,
      CASE
        WHEN b.suspeito OR b.optout            THEN 'encerrar'
        WHEN b.dias > 30 AND NOT b.em_lote     THEN 'reativacao'
        ELSE                                        'cadencia'
      END AS destino,
      b.dias,
      CASE
        WHEN b.optout   THEN 'opt_out'
        WHEN b.suspeito THEN 'numero_invalido'
        WHEN b.dias > 30 AND NOT b.em_lote THEN 'estoque_30d'
        WHEN b.em_lote  THEN 'escrita_em_lote_vai_para_cadencia'
        ELSE 'estoque_ate_30d'
      END AS motivo,
      b.em_lote,
      b.dono_ativo
    FROM base b
  )
  SELECT c.id, c.corretor_id, c.destino, c.dias, c.motivo, c.em_lote
  FROM classificado c
  -- Cadência é trabalho de quem está na casa. Encerrar e reativação não
  -- dependem do dono e continuam valendo.
  WHERE c.destino <> 'cadencia' OR c.dono_ativo;
$$;

COMMENT ON FUNCTION public.cadencia_fase0_classificar() IS
  'Classificação do estoque para a Fase 0 (encerrar | reativacao | cadencia). '
  'Só lead COM corretor, fora da cadência e na janela pré-resposta; o destino '
  'cadência exige dono ATIVO. Mesma função para o ensaio e para a execução.';

-- ---------------------------------------------------------------------------
-- 5) Devolver à roleta o lead em formação de dono inativo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cadencia_devolver_inativos(_modo text DEFAULT NULL)
RETURNS TABLE(lote_id uuid, modo text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _l record;
  _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin devolve leads de corretor inativo' USING ERRCODE = '42501';
  END IF;

  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_etapa
      FROM public.leads l
     WHERE l.cadencia_etapa IN ('D1','D2','D3')
       AND l.corretor_id IS NOT NULL
       AND l.deleted_at IS NULL
       AND NOT COALESCE(l.na_lixeira, false)
       AND NOT public._cadencia_dono_ativo(l.corretor_id)
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN
      -- O mesmo caminho da etapa vencida: solta o corretor, limpa a etapa no
      -- mesmo UPDATE e registra distribution_log e lead_eventos. O próximo
      -- dono recebe o lead em D1 pelo gatilho de atribuição.
      _ok := public._cadencia_devolver_roleta(_l.id, _l.corretor_id, 'corretor_inativo');
    END IF;
    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'inativo', _l.id, _l.corretor_id, _l.cadencia_etapa, 'roleta',
       'corretor_inativo', _m, _ok, jsonb_build_object('dono_ativo', false));
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cadencia_devolver_inativos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadencia_devolver_inativos(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.cadencia_devolver_inativos(text) IS
  'Devolve à roleta o lead em D1/D2/D3 cujo dono está inativo, pelo caminho '
  'da própria cadência. Log com job=inativo, que o painel NÃO conta como falha '
  'do corretor. Roda no início de cadencia_vencidos. Admin apenas.';

-- ---------------------------------------------------------------------------
-- 6) O motor de vencidos limpa os inativos antes de cobrar prazo
-- ---------------------------------------------------------------------------
-- Idêntica a 20260921120100 mais a primeira linha do corpo. Antes da cobrança
-- porque o lead de dono inativo com prazo vencido cairia nela — e seria
-- registrado como falha de quem já não está na casa.
CREATE OR REPLACE FUNCTION public.cadencia_vencidos(_modo text DEFAULT NULL, _limite integer DEFAULT 500)
RETURNS TABLE(lote_id uuid, modo text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _cfg public.cadencia_config%ROWTYPE;
  _m text;
  _lote uuid := gen_random_uuid();
  _l record;
  _ok boolean;
BEGIN
  SELECT * INTO _cfg FROM public.cadencia_config WHERE id = 1;
  _m := lower(COALESCE(_modo, _cfg.modo, 'sombra'));
  IF _m NOT IN ('sombra','ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  PERFORM public.cadencia_devolver_inativos(_m);

  FOR _l IN
    SELECT l.id, l.corretor_id, l.cadencia_etapa, l.cadencia_prazo_ts
    FROM public.leads l
    WHERE l.cadencia_etapa IN ('D1','D2')
      AND l.cadencia_prazo_ts IS NOT NULL
      AND l.cadencia_prazo_ts < now() - make_interval(days => _cfg.tolerancia_venc_d)
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
    ORDER BY l.cadencia_prazo_ts
    LIMIT GREATEST(COALESCE(_limite, 500), 1)
  LOOP
    _ok := false;
    IF _m = 'ativo' THEN
      _ok := public._cadencia_devolver_roleta(_l.id, _l.corretor_id, 'etapa_vencida');
    END IF;
    INSERT INTO public.cadencia_execucao_log
      (lote_id, job, lead_id, corretor_id, etapa_de, etapa_para, motivo, modo, aplicado, detalhe)
    VALUES
      (_lote, 'vencidos', _l.id, _l.corretor_id, _l.cadencia_etapa, 'roleta',
       'etapa_vencida', _m, _ok,
       jsonb_build_object('prazo', _l.cadencia_prazo_ts,
                          'dias_vencido',
                          floor(extract(epoch FROM now() - _l.cadencia_prazo_ts) / 86400)));
  END LOOP;
  RETURN QUERY
  SELECT _lote, _m, count(*)::int, count(*) FILTER (WHERE g.aplicado)::int
  FROM public.cadencia_execucao_log g
  WHERE g.lote_id = _lote;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Os leads de hoje
-- ---------------------------------------------------------------------------
-- Segue o modo da cadência (ativo em produção desde 22/09/2026): em sombra,
-- só registra o que faria, como todo o resto do motor.
DO $inativos$
DECLARE
  _r record;
BEGIN
  SELECT * INTO _r FROM public.cadencia_devolver_inativos(NULL);
  RAISE NOTICE 'cadência: % lead(s) de corretor inativo avaliados, % devolvidos à roleta (modo %)',
    _r.avaliados, _r.aplicados, _r.modo;
END
$inativos$;

NOTIFY pgrst, 'reload schema';
