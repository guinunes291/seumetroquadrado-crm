-- leads_stats_por_corretor v2 — inclui "aguardando retorno" no card.
--
-- Feedback de produção: o card por corretor mostrava 4 baldes (em atendimento,
-- aguardando, ganhos, perdidos) e o total; leads em aguardando_retorno (e nas
-- etapas de agenda/análise) entravam no total mas em linha nenhuma — ex.:
-- total 58 com linhas somando 7. Nova coluna aguardando_retorno; o restante
-- ("outras etapas": qualificado/agendado/visita/proposta/análise) a UI deriva
-- de total - somas, para o card sempre fechar a conta.
--
-- Mudar RETURNS TABLE exige DROP + CREATE (mesmo nome, zero args — sem risco
-- de overload no PostgREST). O cliente tolera as duas versões: coluna extra é
-- ignorada pelo build antigo, e o build novo trata a ausência com ?? 0.

DROP FUNCTION IF EXISTS public.leads_stats_por_corretor();

CREATE FUNCTION public.leads_stats_por_corretor()
RETURNS TABLE(
  corretor_id uuid,
  total bigint,
  em_atendimento bigint,
  aguardando bigint,
  aguardando_retorno bigint,
  ganhos bigint,
  perdidos bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _gestor boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _gestor  := public.has_role(_caller, 'gestor'::public.app_role);
  IF NOT (_ve_tudo OR _gestor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _equipe := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  SELECT
    l.corretor_id,
    count(*) AS total,
    count(*) FILTER (WHERE l.status::text = 'em_atendimento') AS em_atendimento,
    count(*) FILTER (
      WHERE l.status::text IN ('aguardando_atendimento','novo','aguardando_corretor')
    ) AS aguardando,
    count(*) FILTER (WHERE l.status::text = 'aguardando_retorno') AS aguardando_retorno,
    count(*) FILTER (WHERE l.status::text IN ('contrato_fechado','pos_venda')) AS ganhos,
    count(*) FILTER (WHERE l.status::text = 'perdido') AS perdidos
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND (
      _ve_tudo
      OR l.corretor_id = _caller
      OR l.corretor_id = ANY(_equipe)
      OR l.corretor_id IS NULL
    )
  GROUP BY l.corretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_stats_por_corretor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_stats_por_corretor() FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_stats_por_corretor() TO authenticated;

NOTIFY pgrst, 'reload schema';
