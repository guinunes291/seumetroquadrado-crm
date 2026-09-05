-- =====================================================================
-- Pontuação diária: os pesos de configuracao_pontuacao passam a valer
-- para TODO o histórico, no momento em que mudam.
--
-- Antes: bump_atividade gravava atividades_diarias.pontuacao_total com os
-- pesos do instante do lançamento. Trocar um peso (ex.: venda de 1000 para
-- 1500) deixava o passado com a régua antiga e o futuro com a nova — o
-- ranking somava pontos de duas moedas diferentes e nenhuma tela conseguia
-- explicar o total (quantidade × peso não batia). A única reconciliação era
-- manual (a migration 20260711122000 recalculou uma vez).
--
-- Agora: mudar pesos (INSERT/UPDATE/DELETE em configuracao_pontuacao)
-- recalcula pontuacao_total de todas as linhas com a fórmula vigente — a
-- mesma de bump_atividade —, e a página de Desempenho mostra a decomposição
-- quantidade × peso com a garantia de que ela bate com o total oficial.
-- Contadores (ligações, visitas, vendas, VGV) não são tocados: só o total.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recalcular_pontuacao_atividades()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _lig int := public.pontos_de('ligacao');
  _wa  int := public.pontos_de('whatsapp');
  _ag  int := public.pontos_de('agendamento');
  _vis int := public.pontos_de('visita');
  _doc int := public.pontos_de('documentacao');
  _ven int := public.pontos_de('venda');
  _n int;
BEGIN
  UPDATE public.atividades_diarias a
     SET pontuacao_total = a.ligacoes * _lig
                         + a.whatsapps * _wa
                         + a.agendamentos * _ag
                         + a.visitas * _vis
                         + a.documentacoes * _doc
                         + a.vendas * _ven,
         updated_at = now()
   WHERE a.pontuacao_total IS DISTINCT FROM (
           a.ligacoes * _lig
         + a.whatsapps * _wa
         + a.agendamentos * _ag
         + a.visitas * _vis
         + a.documentacoes * _doc
         + a.vendas * _ven);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

COMMENT ON FUNCTION public.recalcular_pontuacao_atividades() IS
  'Recalcula atividades_diarias.pontuacao_total com os pesos vigentes de configuracao_pontuacao (mesma fórmula de bump_atividade). Devolve quantas linhas mudaram. Disparada automaticamente quando os pesos mudam.';

REVOKE ALL ON FUNCTION public.recalcular_pontuacao_atividades() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_pontuacao_atividades() TO service_role;

CREATE OR REPLACE FUNCTION public.trg_config_pontuacao_recalcular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.recalcular_pontuacao_atividades();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_config_pontuacao_recalcular() FROM PUBLIC, anon, authenticated;

-- Por comando (statement), não por linha: um UPDATE que troca seis pesos
-- recalcula o histórico uma vez só.
DROP TRIGGER IF EXISTS trg_config_pontuacao_recalcular ON public.configuracao_pontuacao;
CREATE TRIGGER trg_config_pontuacao_recalcular
  AFTER INSERT OR UPDATE OR DELETE ON public.configuracao_pontuacao
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_config_pontuacao_recalcular();

-- Reconcilia o histórico existente com os pesos vigentes (idempotente: só
-- toca linhas cujo total não bate com a fórmula).
SELECT public.recalcular_pontuacao_atividades();
