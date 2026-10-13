// Check-in obrigatório (decisão do dono, 12/10/2026: "checkin obrigatório") —
// regras de TELA, puras. O corretor só usa o CRM depois de dizer onde está
// hoje (uma filial ou em casa). A aptidão para a roleta continua no banco
// (presenca_checkin); aqui só se decide quando o diálogo abre e o que ele faz
// com o resultado.

import { blocoCheckinLateral, type MinhaPresenca } from "./presenca-derive";

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
 * Leitura com erro e sem dado de hoje (`erro`) → `false`: falha técnica nunca
 * prende ninguém fora do CRM. A releitura que falha com o dado de hoje já
 * lido não chega aqui como erro — vale o último dado bom.
 */
export function checkinObrigatorioPendente(input: {
  carregando: boolean;
  ehCorretor: boolean;
  /** A leitura falhou e não há dado de hoje para decidir. */
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

// ---------------------------------------------------------------------------
// Diálogo voluntário (13/10/2026): o mesmo diálogo, aberto pelo bloco da barra
// lateral ou pela faixa do topo para trocar ou refazer o check-in. Nunca
// prende: fecha com ESC, X ou clique fora.
// ---------------------------------------------------------------------------

/** Obrigatório (falta o check-in de hoje) ou voluntário (pedido pelo corretor). */
export type ModoDialogo = "obrigatorio" | "voluntario";

/**
 * Fecha com ESC/X/fora? O obrigatório prende (menos o recusado: ele disse a
 * verdade e o CRM está liberado); o voluntário nunca — a não ser que, com ele
 * aberto, o dia vire e o check-in de hoje passe a faltar (`deveAbrir`).
 */
export function dialogoBloqueante(i: {
  modo: ModoDialogo;
  deveAbrir: boolean;
  tela: string;
}): boolean {
  return (i.modo === "obrigatorio" || i.deveAbrir) && i.tela !== "recusado";
}

/**
 * O que o diálogo faz com um pedido de check-in (bloco lateral, faixa):
 * - descartar: venceu, o treino do onboarding está na tela (AGENTS.md: nada
 *   abre por cima do treino) ou o diálogo já está aberto;
 * - card: /presenca e /meu-perfil já têm o card, que atende (rola e foca) —
 *   nunca dois check-ins na tela;
 * - esperar: o treino ainda não decidiu ou a presença ainda não chegou (a
 *   virada do dia); o pedido vale 15 s;
 * - abrir.
 */
export type DestinoPedido = "esperar" | "descartar" | "card" | "abrir";

export function destinoDoPedido(i: {
  vigente: boolean;
  pathname: string;
  treinoDecidido: boolean;
  treinoAberto: boolean;
  /** pendente !== null && !!presenca */
  presencaPronta: boolean;
  dialogoAberto: boolean;
}): DestinoPedido {
  if (!i.vigente) return "descartar";
  if (TELAS_COM_CARD_CHECKIN.some((r) => i.pathname.startsWith(r))) return "card";
  if (i.treinoAberto) return "descartar";
  if (i.dialogoAberto) return "descartar";
  if (!i.treinoDecidido || !i.presencaPronta) return "esperar";
  return "abrir";
}

/**
 * A descrição do diálogo na tela das opções. No voluntário, diz onde o
 * corretor está agora (o mesmo texto do bloco da barra lateral) antes de ele
 * trocar.
 */
export function descricaoDoDialogo(p: MinhaPresenca, modo: ModoDialogo): string {
  if (modo === "obrigatorio") return "Para usar o CRM hoje, diga onde você está.";
  const b = blocoCheckinLateral({ presenca: p, pendente: false, erro: false });
  if (b.chave === "sem_checkin") return "Diga onde você está para entrar nas roletas.";
  if (b.chave === "encerrado") {
    return `Agora: ${b.linha} — presença encerrada. Escolha onde você está para voltar às roletas.`;
  }
  const estadoMin = b.estado.charAt(0).toLowerCase() + b.estado.slice(1);
  return `Agora: ${b.linha} — ${estadoMin}. Para trocar, escolha onde você está.`;
}
