-- Funil novo de 7 etapas (parte 2/2): remapeia os status legados e ajusta o
-- dashboard_funil para contar a etapa nova 'aguardando_retorno'.
--
-- Mapeamento (decisão do produto):
--   qualificado      -> em_atendimento
--   proposta_enviada -> em_atendimento
--   pos_venda        -> contrato_fechado  (funde em "Venda")
-- 'novo' permanece (caixa de entrada não distribuída, usada pela distribuição).
--
-- IMPORTANTE: desabilitamos os gatilhos de usuário em `leads` durante o UPDATE
-- para o remap NÃO gerar transições artificiais — em especial, evitar que
-- pos_venda -> contrato_fechado registre "vendas" falsas na data da migração.

ALTER TABLE public.leads DISABLE TRIGGER USER;

UPDATE public.leads
SET status = 'em_atendimento'
WHERE status IN ('qualificado', 'proposta_enviada');

UPDATE public.leads
SET status = 'contrato_fechado'
WHERE status = 'pos_venda';

ALTER TABLE public.leads ENABLE TRIGGER USER;

-- dashboard_funil: incluir 'aguardando_retorno' no estágio "Em atendimento"
-- (mesma definição atual + a etapa nova). Demais buckets inalterados.
CREATE OR REPLACE FUNCTION public.dashboard_funil(
  _di timestamptz,
  _df timestamptz,
  _corretor uuid DEFAULT NULL
)
RETURNS TABLE(etapa text, ordem int, quantidade int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_gestor boolean := public.has_role(_caller,'admin') OR public.has_role(_caller,'gestor') OR public.has_role(_caller,'superintendente');
  _scope uuid := _corretor;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT _is_gestor THEN _scope := _caller; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT id, status FROM public.leads
    WHERE deleted_at IS NULL AND na_lixeira = false
      AND created_at >= _di AND created_at < _df
      AND (_scope IS NULL OR corretor_id = _scope)
  )
  SELECT * FROM (VALUES
    ('Novos',            1, (SELECT count(*)::int FROM base)),
    ('Em atendimento',   2, (SELECT count(*)::int FROM base WHERE status IN ('aguardando_retorno','em_atendimento','qualificado','agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Agendados',        3, (SELECT count(*)::int FROM base WHERE status IN ('agendado','visita_realizada','analise_credito','contrato_fechado'))),
    ('Visitas',          4, (SELECT count(*)::int FROM base WHERE status IN ('visita_realizada','analise_credito','contrato_fechado'))),
    ('Análise crédito',  5, (SELECT count(*)::int FROM base WHERE status IN ('analise_credito','contrato_fechado'))),
    ('Fechados',         6, (SELECT count(*)::int FROM base WHERE status = 'contrato_fechado'))
  ) AS t(etapa, ordem, quantidade);
END;
$$;
