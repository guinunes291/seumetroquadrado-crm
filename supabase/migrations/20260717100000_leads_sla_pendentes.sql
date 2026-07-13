-- Incidente em produção (13/07, manhã): a Central de Comando em escopo
-- "Operação" estourou statement timeout (57014) montando a fila de
-- prioridades. Causa: leads_com_sla sem _corretor varre e DEVOLVE todos os
-- leads ativos da organização — mas o SLA de 1º atendimento só corre para
-- leads em 'novo'/'aguardando_atendimento'; todo o resto volta como 'ok' e é
-- descartado pelos consumidores (fila da home e badge do Kanban). Com o
-- dashboard aberto em vários navegadores + poll de 2min do Kanban, a
-- varredura completa passa dos 8s do papel authenticated.

-- 1) ESTANCA o incidente já (vale assim que este SQL rodar, sem novo deploy):
--    timeout local maior só para esta função — a fila volta a montar mesmo no
--    caminho antigo/lento enquanto o app novo não chega.
ALTER FUNCTION public.leads_com_sla(uuid) SET statement_timeout = '20s';

-- 2) FIX ESTRUTURAL: RPC estreita com APENAS os pendentes de 1º atendimento.
--    Mesmas colunas, mesmos cálculos de prazo/status/temperatura da
--    leads_com_sla — muda só o recorte: de "todos os ativos" para o punhado
--    de linhas que os consumidores realmente usam. O cliente troca para ela
--    com fallback (PGRST202) para a leads_com_sla enquanto esta migration não
--    estiver aplicada.

CREATE INDEX IF NOT EXISTS idx_leads_sla_pendentes
  ON public.leads (corretor_id, data_distribuicao)
  WHERE deleted_at IS NULL
    AND na_lixeira = false
    AND status IN ('novo','aguardando_atendimento');

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
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

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
    AND (_scope IS NULL OR l.corretor_id = _scope);
END;
$$;

REVOKE ALL ON FUNCTION public.leads_sla_pendentes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_sla_pendentes(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.leads_sla_pendentes(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
