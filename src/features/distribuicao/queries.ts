// Distribuição v3 — camada de dados (React Query) da central de distribuição.
//
// Todos os números vêm do SERVIDOR (RPCs do motor único) — nada de calcular
// "próximo da vez" ou % no relógio/timezone do navegador (bug #8 da auditoria).
//
// Desde a quebra em módulos (2026-10), este arquivo só reexporta: consultas em
// painel-queries.ts, roletas-queries.ts e corretores-queries.ts; mutações em
// operacao-mutations.ts e config-mutations.ts; chaves de cache em
// distribuicao-keys.ts.

export {
  type ResumoDistribuicao,
  type ElegibilidadeLinha,
  type ExcecaoLinha,
  type LogLinha,
  type VendaMesAnterior,
  useDistribuicaoResumo,
  useElegibilidadeRoleta,
  useVendasMesAnterior,
  useMinhaElegibilidade,
  useExcecoes,
  type FiltrosHistorico,
  useHistoricoDistribuicao,
  useDecisaoContexto,
  LIMITE_RECEBIDOS_SEMANA,
  type RecebidosSemana,
  useRecebidosSemana,
} from "./painel-queries";
export {
  type ParticipanteLogLinha,
  type RoletaRow,
  useRoletas,
  useZonasRoletas,
  type RoletaDoCorretor,
  type ParticipacaoBruta,
  agruparRoletasPorCorretor,
  useRoletasPorCorretor,
  useParticipantesLog,
  useDistribuicaoSettings,
  useDistribuicaoConfig,
} from "./roletas-queries";
export {
  useCorretoresDisponiveis,
  useCorretoresDaMinhaEquipe,
  useCorretoresDaMinhaEquipeLista,
  useNomesPerfis,
  useProjetosMini,
  type CorretorDistribuicao,
  useCorretoresDistribuicao,
  useWipCorretores,
} from "./corretores-queries";
export { DISTRIBUICAO_KEYS } from "./distribuicao-keys";
export {
  useGerenciarParticipante,
  useResolverExcecao,
  useDistribuirManual,
  useMarcarPresencaAdmin,
  useRodarDistribuicao,
  useEscoarEstoque,
} from "./operacao-mutations";
export {
  useAtualizarSetting,
  useAtualizarConfigOrigem,
  useAtualizarRoleta,
  useCriarRoletaCampanha,
  useAtualizarCorretorDistribuicao,
  useRecalcularTiers,
} from "./config-mutations";
