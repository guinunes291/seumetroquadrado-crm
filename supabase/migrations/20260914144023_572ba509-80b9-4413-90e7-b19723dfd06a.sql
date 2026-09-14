-- ============================================================================
-- Fatia 4 — Régua de devolução com destino (§6 de docs/ops/bolsao-oportunidades-fatia4.md)
-- Corte por DESTINO, decisão do dono (14/09/2026):
--   estoque  -> Bolsão  : 30 dias parado
--   pago/qualificado -> roleta: 60 dias parado
-- Começa em modo='sombra': mede e loga, não move ninguém.
-- ============================================================================

INSERT INTO public.gestao_config (chave, valor, descricao)
VALUES (
  'bolsao',
  jsonb_build_object(
    'modo', 'sombra',
    'devolver_estoque_dias', 30,
    'devolver_pago_dias', 60,
    'lote_max', 500
  ),
  'Regua de devolucao com destino (Fatia 4 §6). modo=sombra|ativo; '
  'devolver_estoque_dias -> Bolsao; devolver_pago_dias -> roleta; '
  'lote_max limita cada varredura.'
)
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Trilha de auditoria: toda linha avaliada, inclusive em sombra.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devolucao_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_anterior_id uuid REFERENCES public.profiles(id),
  grupo text NOT NULL,
  destino text NOT NULL,
  origem text,
  status_no_momento text,
  dias_parado integer,
  corte_dias integer,
  modo text NOT NULL,
  aplicado boolean NOT NULL DEFAULT false,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devolucao_log_lote_idx ON public.devolucao_log (lote_id);
CREATE INDEX IF NOT EXISTS devolucao_log_lead_idx ON public.devolucao_log (lead_id, created_at DESC);

GRANT SELECT ON public.devolucao_log TO authenticated;
GRANT ALL ON public.devolucao_log TO service_role;

ALTER TABLE public.devolucao_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devolucao_log gestao le" ON public.devolucao_log;
CREATE POLICY "devolucao_log gestao le"
  ON public.devolucao_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
  );

-- ---------------------------------------------------------------------------
-- Candidatos: uma fonte só, usada pela prévia e pela varredura.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regua_devolucao_candidatos_v1()
RETURNS TABLE(
  lead_id uuid,
  corretor_id uuid,
  origem text,
  status text,
  grupo text,
  destino text,
  dias_parado integer,
  corte_dias integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (
    SELECT
      COALESCE((g.valor ->> 'devolver_estoque_dias')::int, 30) AS estoque_dias,
      COALESCE((g.valor ->> 'devolver_pago_dias')::int, 60)    AS pago_dias
    FROM public.gestao_config AS g
    WHERE g.chave = 'bolsao'
  ),
  base AS (
    SELECT
      l.id,
      l.corretor_id,
      l.origem::text AS origem,
      l.status::text AS status,
      GREATEST(0, (EXTRACT(EPOCH FROM (
        now() - COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at)
      )) / 86400)::int) AS dias_parado,
      CASE
        WHEN l.origem::text IN ('facebook', 'chatbot', 'impulso_smq')
          OR l.sdr_entregue_em IS NOT NULL THEN 'pago'
        WHEN l.origem::text IN ('importacao', 'google_sheets', 'outro') THEN 'estoque'
        ELSE 'conquistado'
      END AS grupo
    FROM public.leads AS l
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
    b.dias_parado,
    CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END
  FROM base AS b, cfg AS c
  WHERE b.grupo <> 'conquistado'
    AND b.dias_parado >= CASE WHEN b.grupo = 'pago' THEN c.pago_dias ELSE c.estoque_dias END;
$$;

REVOKE ALL ON FUNCTION public.regua_devolucao_candidatos_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regua_devolucao_candidatos_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Varredura. _modo NULL => usa o modo da configuração.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regua_devolucao_processar(
  _modo text DEFAULT NULL,
  _limite integer DEFAULT NULL
)
RETURNS TABLE(lote_id uuid, modo text, destino text, avaliados integer, aplicados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
           'Régua de devolução: ' || _c.dias_parado || ' dias parado (grupo '
             || _c.grupo || ', corte ' || _c.corte_dias || ') — destino ' || _c.destino,
           CASE WHEN _c.destino = 'bolsao' THEN 'base' ELSE 'roleta' END,
           'devolucao_' || _c.destino, 'sucesso');
      END IF;
    END IF;

    INSERT INTO public.devolucao_log
      (lote_id, lead_id, corretor_anterior_id, grupo, destino, origem,
       status_no_momento, dias_parado, corte_dias, modo, aplicado)
    VALUES
      (_lote, _c.lead_id, _c.corretor_id, _c.grupo, _c.destino, _c.origem,
       _c.status, _c.dias_parado, _c.corte_dias, _m, _ok);
  END LOOP;

  RETURN QUERY
  SELECT _lote, _m, d.destino, count(*)::int, count(*) FILTER (WHERE d.aplicado)::int
  FROM public.devolucao_log AS d
  WHERE d.lote_id = _lote
  GROUP BY d.destino;
END;
$$;

REVOKE ALL ON FUNCTION public.regua_devolucao_processar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regua_devolucao_processar(text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.regua_devolucao_processar(text, integer) IS
  'Regua de devolucao com destino (Fatia 4 §6): estoque parado 30d -> Bolsao, '
  'pago/qualificado parado 60d -> roleta. Comeca em modo sombra.';

-- ---------------------------------------------------------------------------
-- Desfazer um lote aplicado (idempotente).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regua_devolucao_desfazer(_lote uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _r record; _n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin pode desfazer' USING ERRCODE = '42501';
  END IF;

  FOR _r IN
    SELECT * FROM public.devolucao_log
    WHERE lote_id = _lote AND aplicado
  LOOP
    PERFORM set_config('app.transicionar_lead', 'on', true);
    UPDATE public.leads
       SET corretor_id = _r.corretor_anterior_id,
           status = CASE WHEN status = 'aguardando_corretor'::public.lead_status
                         THEN _r.status_no_momento::public.lead_status
                         ELSE status END
     WHERE id = _r.lead_id AND corretor_id IS NULL;
    PERFORM set_config('app.transicionar_lead', 'off', true);

    IF FOUND THEN
      UPDATE public.devolucao_log SET aplicado = false WHERE id = _r.id;
      _n := _n + 1;
    END IF;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.regua_devolucao_desfazer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regua_devolucao_desfazer(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Varredura diária às 5h (roda no modo da configuração — hoje, sombra).
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('regua-devolucao-diaria')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'regua-devolucao-diaria');

SELECT cron.schedule(
  'regua-devolucao-diaria', '0 5 * * *',
  $cron$SELECT public.regua_devolucao_processar();$cron$
);