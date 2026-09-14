-- 1) motivo na trilha existente (sem tabela nova)
ALTER TABLE public.devolucao_log
  ADD COLUMN IF NOT EXISTS motivo text NOT NULL DEFAULT 'parado';

-- 2) corte do novo critério vem da config (nunca do código)
UPDATE public.gestao_config
   SET valor = jsonb_set(valor, '{devolver_sem_proximo_passo_dias}', '7'::jsonb, true)
 WHERE chave = 'carteira_ativa';

-- 3) candidatos: critério antigo (parado) + novo (sem próximo passo vivo)
DROP FUNCTION IF EXISTS public.regua_devolucao_candidatos_v1();

CREATE FUNCTION public.regua_devolucao_candidatos_v1()
RETURNS TABLE(lead_id uuid, corretor_id uuid, origem text, status text,
              grupo text, destino text, motivo text,
              dias_parado integer, corte_dias integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH cfg AS (
    SELECT
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'bolsao') ->> 'devolver_estoque_dias'
      )::int, 30) AS estoque_dias,
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'bolsao') ->> 'devolver_pago_dias'
      )::int, 60) AS pago_dias,
      COALESCE((
        (SELECT valor FROM public.gestao_config WHERE chave = 'carteira_ativa') ->> 'devolver_sem_proximo_passo_dias'
      )::int, 7) AS sem_passo_dias
  ),
  base AS (
    SELECT
      l.id,
      l.corretor_id,
      l.origem::text AS origem,
      l.status::text AS status,
      GREATEST(0, (EXTRACT(EPOCH FROM (now() - t.toque)) / 86400)::int) AS dias_parado,
      GREATEST(0, (EXTRACT(EPOCH FROM (
        now() - GREATEST(t.toque, COALESCE(v.venc_max, t.toque))
      )) / 86400)::int) AS dias_sem_passo,
      public.lead_sem_proximo_passo(l.id) AS sem_passo,
      CASE
        WHEN l.origem::text IN ('facebook', 'chatbot', 'impulso_smq')
          OR l.sdr_entregue_em IS NOT NULL THEN 'pago'
        WHEN l.origem::text IN ('importacao', 'google_sheets', 'outro') THEN 'estoque'
        ELSE 'conquistado'
      END AS grupo
    FROM public.leads AS l
    CROSS JOIN LATERAL (
      SELECT COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at) AS toque
    ) AS t
    LEFT JOIN LATERAL (
      SELECT max(tr.data_vencimento) AS venc_max
      FROM public.tarefas AS tr
      WHERE tr.lead_id = l.id
        AND tr.deleted_at IS NULL
        AND tr.status IN ('pendente'::public.tarefa_status, 'em_andamento'::public.tarefa_status)
        AND tr.data_vencimento IS NOT NULL
        AND tr.data_vencimento < now()
    ) AS v ON true
    WHERE l.corretor_id IS NOT NULL
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      -- congelados: venda registrada e finalizados
      AND l.status NOT IN (
        'contrato_fechado'::public.lead_status,
        'pos_venda'::public.lead_status,
        'perdido'::public.lead_status
      )
      -- fundo do funil nunca sai automaticamente
      AND l.status NOT IN (
        'agendado'::public.lead_status,
        'visita_realizada'::public.lead_status,
        'proposta_enviada'::public.lead_status,
        'analise_credito'::public.lead_status
      )
      AND NOT public._lead_venda_viva(l.id)
  )
  SELECT
    b.id,
    b.corretor_id,
    b.origem,
    b.status,
    b.grupo,
    CASE WHEN b.grupo = 'pago' THEN 'roleta' ELSE 'bolsao' END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN 'parado' ELSE 'sem_passo' END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN b.dias_parado ELSE b.dias_sem_passo END,
    CASE WHEN b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         THEN CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
         ELSE c.sem_passo_dias END
  FROM base AS b, cfg AS c
  WHERE b.grupo <> 'conquistado'
    AND (
      b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
      OR (b.sem_passo AND b.dias_sem_passo >= c.sem_passo_dias)
    );
$function$;

-- 4) execução: mesmo ponto único, agora gravando o motivo
DROP FUNCTION IF EXISTS public.regua_devolucao_processar(text, integer);

CREATE FUNCTION public.regua_devolucao_processar(_modo text DEFAULT NULL::text, _limite integer DEFAULT NULL::integer)
RETURNS TABLE(lote_id uuid, modo text, motivo text, destino text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _cfg jsonb := COALESCE(
    (SELECT valor FROM public.gestao_config WHERE chave = 'bolsao'), '{}'::jsonb);
  _m text := lower(COALESCE(_modo, _cfg ->> 'modo', 'sombra'));
  _lim int := COALESCE(_limite, (_cfg ->> 'lote_max')::int, 500);
  _lote uuid := gen_random_uuid();
  _c record;
  _ok boolean;
BEGIN
  IF _m NOT IN ('sombra', 'ativo') THEN
    RAISE EXCEPTION 'modo invalido: % (use sombra ou ativo)', _m USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin pode rodar a regua de devolucao' USING ERRCODE = '42501';
  END IF;

  FOR _c IN
    SELECT * FROM public.regua_devolucao_candidatos_v1()
    ORDER BY dias_parado DESC
    LIMIT _lim
  LOOP
    _ok := false;

    IF _m = 'ativo' THEN
      IF _c.destino = 'bolsao' THEN
        UPDATE public.leads
           SET corretor_anterior_id = corretor_id,
               corretor_id = NULL,
               classe_lead = 'base',
               tentativas_redistribuicao = 0,
               corretores_que_tentaram = ARRAY[corretor_id]
         WHERE id = _c.lead_id AND corretor_id = _c.corretor_id;
      ELSE
        PERFORM set_config('app.transicionar_lead', 'on', true);
        UPDATE public.leads
           SET corretor_anterior_id = corretor_id,
               corretor_id = NULL,
               status = 'aguardando_corretor'::public.lead_status,
               tentativas_redistribuicao = 0,
               corretores_que_tentaram = ARRAY[corretor_id]
         WHERE id = _c.lead_id AND corretor_id = _c.corretor_id;
        PERFORM set_config('app.transicionar_lead', 'off', true);
      END IF;

      _ok := FOUND;

      IF _ok THEN
        INSERT INTO public.distribution_log
          (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
        VALUES
          (_c.lead_id, NULL, 'redistribuicao'::public.distribuicao_tipo,
           'Régua de devolução (' || _c.motivo || '): ' || _c.dias_parado
             || ' dias (grupo ' || _c.grupo || ', corte ' || _c.corte_dias
             || ') — destino ' || _c.destino,
           CASE WHEN _c.destino = 'bolsao' THEN 'base' ELSE 'roleta' END,
           'devolucao_' || _c.destino, 'sucesso');
      END IF;
    END IF;

    INSERT INTO public.devolucao_log
      (lote_id, lead_id, corretor_anterior_id, grupo, destino, origem,
       status_no_momento, dias_parado, corte_dias, modo, aplicado, motivo)
    VALUES
      (_lote, _c.lead_id, _c.corretor_id, _c.grupo, _c.destino, _c.origem,
       _c.status, _c.dias_parado, _c.corte_dias, _m, _ok, _c.motivo);
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, d.motivo, d.destino, count(*)::int, count(*) FILTER (WHERE d.aplicado)::int
  FROM public.devolucao_log AS d
  WHERE d.lote_id = _lote
  GROUP BY d.motivo, d.destino;
END;
$function$;