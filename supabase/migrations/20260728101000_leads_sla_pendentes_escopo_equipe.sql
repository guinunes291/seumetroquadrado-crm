-- leads_sla_pendentes — escopo de gestor = EQUIPE (alinha com leads_filtered_v3).
--
-- Antes: qualquer gestor via os pendentes de SLA da organização INTEIRA
-- (divergindo da lista/contagens, que já recortam por equipe desde 19-20/07).
-- Agora: admin/superintendente veem tudo; gestor vê própria carteira + equipe
-- + órfãos (mesma régua da leads_filtered_v3); corretor segue vendo só a
-- própria carteira (o parâmetro _corretor continua ignorado para ele).
-- Gestor que pedir _corretor fora da equipe recebe vazio (não erro), para não
-- quebrar consumidores que passam qualquer id.
--
-- Mesmo RETURNS TABLE da 20260717100000 — CREATE OR REPLACE seguro.

CREATE OR REPLACE FUNCTION public.leads_sla_pendentes(_corretor uuid DEFAULT NULL)
RETURNS TABLE (
  lead_id uuid,
  corretor_id uuid,
  nome text,
  telefone text,
  status text,
  sla_minutos integer,
  minutos_decorridos integer,
  sla_status text,
  temperatura_calc lead_temperatura
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _ve_tudo boolean;
  _gestor boolean;
  _equipe uuid[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  _ve_tudo := public.ve_carteira_completa(_caller);
  _gestor  := public.has_role(_caller, 'gestor'::public.app_role);
  _equipe  := COALESCE(ARRAY(SELECT public.corretores_do_gestor(_caller)), '{}'::uuid[]);

  RETURN QUERY
  SELECT l.id,
         l.corretor_id,
         l.nome,
         l.telefone,
         l.status::text,
         sla.efetivo AS sla_minutos,
         (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60)::int AS minutos_decorridos,
         CASE
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > sla.efetivo THEN 'estourado'
           WHEN (EXTRACT(EPOCH FROM (now() - COALESCE(l.data_distribuicao, l.created_at)))/60) > (sla.efetivo * 0.6) THEN 'atencao'
           ELSE 'ok'
         END AS sla_status,
         CASE
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '24 hours' THEN 'quente'::lead_temperatura
           WHEN l.status IN ('agendado','visita_realizada','analise_credito') THEN 'quente'::lead_temperatura
           WHEN l.created_at > now() - interval '48 hours' AND l.ultima_interacao IS NOT NULL THEN 'quente'::lead_temperatura
           WHEN l.ultima_interacao IS NOT NULL AND l.ultima_interacao > now() - interval '72 hours' THEN 'morno'::lead_temperatura
           WHEN l.created_at > now() - interval '7 days' THEN 'morno'::lead_temperatura
           ELSE 'frio'::lead_temperatura
         END AS temperatura_calc
  FROM public.leads l
  LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN l.via_webhook AND dc.timeout_minutos IS NOT NULL
        THEN LEAST(dc.timeout_minutos, COALESCE(dc.sla_minutos, 30))
      ELSE COALESCE(dc.sla_minutos, 30)
    END AS efetivo
  ) sla
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status IN ('novo','aguardando_atendimento')
    AND (
      CASE
        -- corretor: sempre a própria carteira, _corretor ignorado
        WHEN NOT (_ve_tudo OR _gestor) THEN l.corretor_id = _caller
        -- gestão pedindo um corretor específico: precisa estar no escopo
        WHEN _corretor IS NOT NULL THEN
          l.corretor_id = _corretor
          AND (_ve_tudo OR _corretor = _caller OR _corretor = ANY(_equipe))
        -- gestão sem filtro: tudo (admin/super) ou carteira+equipe+órfãos (gestor)
        ELSE
          _ve_tudo
          OR l.corretor_id = _caller
          OR l.corretor_id = ANY(_equipe)
          OR l.corretor_id IS NULL
      END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.leads_sla_pendentes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_sla_pendentes(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_sla_pendentes(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
