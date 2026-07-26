-- Camada de Gestão (Fase A2): ordem comercial do funil + atividade canônica.
--
-- O enum lead_status foi estendido depois de criado (aguardando_retorno e
-- aguardando_corretor ficaram no FIM do enum), então enum_range() NÃO é a
-- ordem comercial. funil_ordem() é o espelho SQL de LEAD_STATUS_ORDER
-- (src/lib/leads.ts) — fonte única de ordenação para as views de metrics.

CREATE OR REPLACE FUNCTION public.funil_ordem(_s public.lead_status)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE _s
    -- Pré-funil (caixa de entrada, ainda não distribuído/aceito).
    WHEN 'novo'                   THEN 0
    WHEN 'aguardando_corretor'    THEN 0
    -- Funil comercial (mesma ordem de LEAD_STATUS_ORDER).
    WHEN 'aguardando_atendimento' THEN 1
    WHEN 'aguardando_retorno'     THEN 2
    WHEN 'em_atendimento'         THEN 3
    WHEN 'qualificado'            THEN 3  -- legado: equivale a em_atendimento
    WHEN 'agendado'               THEN 4
    WHEN 'visita_realizada'       THEN 5
    WHEN 'proposta_enviada'       THEN 5  -- legado: pós-visita, pré-análise
    WHEN 'analise_credito'        THEN 6
    WHEN 'contrato_fechado'       THEN 7
    WHEN 'pos_venda'              THEN 7  -- terminal de sucesso
    WHEN 'perdido'                THEN 99
  END;
$$;

COMMENT ON FUNCTION public.funil_ordem(public.lead_status) IS
  'Ordem comercial do funil (espelho de LEAD_STATUS_ORDER em src/lib/leads.ts). 0 = pré-funil; 1-7 = etapas; 99 = perdido. Legados: qualificado=3, proposta_enviada=5, pos_venda=7. Nunca ordene etapa por enum_range().';

GRANT EXECUTE ON FUNCTION public.funil_ordem(public.lead_status) TO authenticated, service_role;

-- Definição canônica de "última atividade" de um lead — a mesma régua das
-- ferramentas MCP: COALESCE(ultima_interacao, ultimo_contato, updated_at).
-- "Parado há N dias" = now() - lead_ultima_atividade(...) em toda a camada.
CREATE OR REPLACE FUNCTION public.lead_ultima_atividade(
  _ultima_interacao timestamptz,
  _ultimo_contato timestamptz,
  _updated_at timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(_ultima_interacao, _ultimo_contato, _updated_at);
$$;

COMMENT ON FUNCTION public.lead_ultima_atividade(timestamptz, timestamptz, timestamptz) IS
  'Última atividade canônica do lead: COALESCE(ultima_interacao, ultimo_contato, updated_at). Fonte única da métrica "parado" em views, RPCs e alertas.';

GRANT EXECUTE ON FUNCTION public.lead_ultima_atividade(timestamptz, timestamptz, timestamptz)
  TO authenticated, service_role;
