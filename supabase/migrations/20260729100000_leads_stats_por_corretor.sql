-- leads_stats_por_corretor — agregação no SERVIDOR para a aba "Leads por
-- Corretor" do Painel do Gestor.
--
-- Bug em produção: a tela baixava só os 2.000 leads mais recentes e somava no
-- cliente. Com 55 mil leads (e a safra recente quase toda sem corretor), os
-- cards dos corretores apareciam ZERADOS — o corte silencioso virava número
-- errado, não "subestimado". Agora o banco conta a base inteira por corretor.
--
-- Escopo (mesma régua de leads_filtered_v3):
--   admin/superintendente → todos os corretores;
--   gestor → própria carteira + equipe + órfãos (corretor_id IS NULL);
--   demais papéis → bloqueado (a tela é de gestão).
--
-- Buckets espelham os cards da tela:
--   aguardando = aguardando_atendimento + novo + aguardando_corretor
--   ganhos     = contrato_fechado + pos_venda
--   (linhas com corretor_id NULL alimentam o card "Sem corretor")

CREATE OR REPLACE FUNCTION public.leads_stats_por_corretor()
RETURNS TABLE(
  corretor_id uuid,
  total bigint,
  em_atendimento bigint,
  aguardando bigint,
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
