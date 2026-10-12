// Check-in obrigatório (decisão do dono, 12/10/2026: "checkin obrigatório") —
// regras de TELA, puras. O corretor só usa o CRM depois de dizer onde está
// hoje (uma filial ou em casa). A aptidão para a roleta continua no banco
// (presenca_checkin); aqui só se decide quando o diálogo abre e o que ele faz
// com o resultado.

import type { MinhaPresenca } from "./presenca-derive";

/** Telas que já mostram o card de check-in: nem faixa nem diálogo por cima. */
export const TELAS_COM_CARD_CHECKIN = ["/presenca", "/meu-perfil"];

/**
 * Telas de campo em tela cheia: nada obrigatório abre por cima (o card das
 * metas do dia também some nelas).
 */
export const ROTAS_TELA_CHEIA = ["/modo-visita"];

/** O diálogo obrigatório não abre nesta rota? */
export function rotaSemCheckinObrigatorio(pathname: string): boolean {
  return [...TELAS_COM_CARD_CHECKIN, ...ROTAS_TELA_CHEIA].some((r) => pathname.startsWith(r));
}

/**
 * Falta o check-in de hoje? Conta QUALQUER check-in de hoje — aberto,
 * encerrado ("Encerrar presença") ou barrado: quem já disse onde está não é
 * bloqueado de novo no mesmo dia (a faixa do topo continua avisando).
 *
 * `null` = ainda não dá para saber (sessão, papéis ou presença carregando, ou
 * dados de ontem numa aba que virou o dia): nada abre, para não piscar.
 * Erro na leitura → `false`: falha técnica nunca prende ninguém fora do CRM.
 */
export function checkinObrigatorioPendente(input: {
  carregando: boolean;
  ehCorretor: boolean;
  erro: boolean;
  presenca: MinhaPresenca | undefined;
  /** O cache é de outro dia e a releitura ainda não voltou. */
  aguardandoReleitura: boolean;
  /** O check-in falhou por erro técnico e o corretor seguiu sem ele (hoje, neste aparelho). */
  liberadoPorFalha: boolean;
}): boolean | null {
  if (input.carregando) return null;
  if (!input.ehCorretor) return false;
  if (input.liberadoPorFalha) return false;
  if (input.erro) return false;
  if (!input.presenca || input.aguardandoReleitura) return null;
  return input.presenca.checkin === null;
}

/**
 * O que o diálogo faz depois do check-in:
 * - na_roleta: fecha;
 * - recusado (em casa abaixo do mínimo de vendas): mostra o motivo e libera o
 *   CRM — ele disse a verdade, só não entra na roleta;
 * - barrado (escolheu uma filial e a localização não confirmou): continua
 *   aberto com o porquê e três saídas (tentar de novo, em casa, seguir sem
 *   receber leads).
 */
export type DesfechoCheckin = "na_roleta" | "recusado" | "barrado";

export function desfechoCheckin(p: MinhaPresenca): DesfechoCheckin {
  const c = p.checkin;
  if (!c || c.apto_roleta) return "na_roleta";
  if (c.modo === "loja" && (c.motivo === "fora_da_filial" || c.motivo === "sem_localizacao")) {
    return "barrado";
  }
  return "recusado";
}
