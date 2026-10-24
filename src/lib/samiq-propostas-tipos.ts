// Sami — os tipos de ação, rótulos, ferramenta → tipo, o nível por risco (direto/confirmar)
// e as regras do desfazer de 24 h.
// Recortado de samiq-propostas.ts (que reexporta tudo) sem mudança de comportamento.

export const SAMIQ_PROPOSTA_TIPOS = [
  "registrar_contato",
  "anotar",
  "criar_tarefa",
  "atualizar_qualificacao",
  "agendar_visita",
  "mudar_etapa",
  // v8 — CRM no WhatsApp
  "registrar_retorno",
  "marcar_perdido",
  "trocar_vaga",
  "concluir_tarefa",
  "reagendar_tarefa",
  "cancelar_tarefa",
  "confirmar_visita",
  "remarcar_visita",
  "cancelar_visita",
  "registrar_visita",
  "documentos_checklist",
  "atualizar_documento",
  "anexar_documento",
  "enviar_analise_credito",
  "registrar_resultado_credito",
  "registrar_venda",
  "fazer_checkin",
  "criar_lead",
  "pedir_lote",
] as const;

export type SamiQPropostaTipo = (typeof SAMIQ_PROPOSTA_TIPOS)[number];

export const SAMIQ_PROPOSTA_LABEL: Record<SamiQPropostaTipo, string> = {
  registrar_contato: "Registrar contato",
  anotar: "Anotar",
  criar_tarefa: "Criar tarefa",
  atualizar_qualificacao: "Atualizar qualificação",
  agendar_visita: "Agendar visita",
  mudar_etapa: "Mudar etapa",
  registrar_retorno: "Retorno combinado",
  marcar_perdido: "Marcar como perdido",
  trocar_vaga: "Trocar vaga em atendimento",
  concluir_tarefa: "Concluir tarefa",
  reagendar_tarefa: "Reagendar tarefa",
  cancelar_tarefa: "Cancelar tarefa",
  confirmar_visita: "Confirmar visita",
  remarcar_visita: "Remarcar visita",
  cancelar_visita: "Cancelar visita",
  registrar_visita: "Resultado da visita",
  documentos_checklist: "Checklist de documentos",
  atualizar_documento: "Atualizar documento",
  anexar_documento: "Anexar documento",
  enviar_analise_credito: "Enviar para análise de crédito",
  registrar_resultado_credito: "Resultado do crédito",
  registrar_venda: "Registrar venda",
  fazer_checkin: "Check-in",
  criar_lead: "Cadastrar cliente",
  pedir_lote: "Pedir lote de prospecção",
};

/** Ferramenta do modelo → tipo da ação. Na v8 o nome da ferramenta é o próprio tipo. */
export const SAMIQ_FERRAMENTAS_PROPOSTA = Object.fromEntries(
  SAMIQ_PROPOSTA_TIPOS.map((tipo) => [tipo, tipo]),
) as { readonly [K in SamiQPropostaTipo]: K };

export type SamiQFerramentaProposta = keyof typeof SAMIQ_FERRAMENTAS_PROPOSTA;

// ---------------------------------------------------------------------------
// Autonomia por risco (v8)
// ---------------------------------------------------------------------------

export type NivelAcao = "direto" | "confirmar";

export const SAMIQ_NIVEL_ACAO: Record<SamiQPropostaTipo, NivelAcao> = {
  registrar_contato: "direto",
  anotar: "direto",
  criar_tarefa: "direto",
  atualizar_qualificacao: "direto",
  agendar_visita: "confirmar",
  mudar_etapa: "confirmar",
  registrar_retorno: "confirmar",
  marcar_perdido: "confirmar",
  trocar_vaga: "confirmar",
  concluir_tarefa: "direto",
  reagendar_tarefa: "direto",
  cancelar_tarefa: "direto",
  confirmar_visita: "direto",
  remarcar_visita: "direto",
  cancelar_visita: "confirmar",
  registrar_visita: "confirmar",
  documentos_checklist: "direto",
  atualizar_documento: "direto",
  anexar_documento: "direto",
  enviar_analise_credito: "confirmar",
  registrar_resultado_credito: "confirmar",
  registrar_venda: "confirmar",
  fazer_checkin: "direto",
  criar_lead: "confirmar",
  pedir_lote: "confirmar",
};

export type ModoEscritaSamiQ = "por_risco" | "confirmar_tudo";

export function nivelDaAcao(tipo: SamiQPropostaTipo, modo: ModoEscritaSamiQ): NivelAcao {
  return modo === "por_risco" ? SAMIQ_NIVEL_ACAO[tipo] : "confirmar";
}

/**
 * O que o desfazer de 24 h consegue reverter de verdade (o banco espelha esta
 * lista em samiq_decidir_proposta/samiq_desfazer_proposta). Fica de fora o
 * que passa pela máquina de estados do funil (etapa, perda, retorno, visita
 * realizada, análise), o que outra pessoa já pode ter usado (venda, lote)
 * e o que se refaz na hora (check-in, arquivo). Cadastro novo desfaz indo
 * para a lixeira, igual ao que já estava em produção.
 */
export const SAMIQ_TIPOS_DESFAZIVEIS = [
  "registrar_contato",
  "anotar",
  "criar_tarefa",
  "atualizar_qualificacao",
  "agendar_visita",
  "concluir_tarefa",
  "reagendar_tarefa",
  "cancelar_tarefa",
  "confirmar_visita",
  "remarcar_visita",
  "cancelar_visita",
  "atualizar_documento",
  // Cadastro novo: o desfazer manda o cliente para a lixeira (migration 0108).
  "criar_lead",
] as const satisfies readonly SamiQPropostaTipo[];

export function podeDesfazerProposta(tipo: SamiQPropostaTipo): boolean {
  return (SAMIQ_TIPOS_DESFAZIVEIS as readonly string[]).includes(tipo);
}

/**
 * Venda, perda, troca de vaga e crédito mexem em comissão, carteira e roleta:
 * só gravam com a palavra CONFIRMAR do próprio corretor. "ok", "pode", 👍 e
 * linguagem natural não bastam (valem para visita, cadastro e o resto).
 */
export const SAMIQ_TIPOS_SO_COM_CONFIRMAR: ReadonlySet<string> = new Set<SamiQPropostaTipo>([
  "marcar_perdido",
  "trocar_vaga",
  "registrar_venda",
  "enviar_analise_credito",
  "registrar_resultado_credito",
]);

export type MotivoSemDesfazer = "ja_desfeito" | "nao_desfazivel" | "fora_do_prazo";

/**
 * Por que um item do recibo não volta pelo DESFAZER agora (null = volta).
 * O recibo numera tudo o que gravou; quem decide o que dá para reverter é
 * esta regra, aplicada na hora do pedido (a numeração nunca muda).
 */
export function motivoSemDesfazer(
  p: { tipo: SamiQPropostaTipo; status: string; desfazerAte?: string | null },
  agora: Date,
): MotivoSemDesfazer | null {
  if (p.status === "desfeita") return "ja_desfeito";
  if ((p.status !== "aceita" && p.status !== "editada") || !podeDesfazerProposta(p.tipo)) {
    return "nao_desfazivel";
  }
  if (!p.desfazerAte || !(Date.parse(p.desfazerAte) > agora.getTime())) return "fora_do_prazo";
  return null;
}

export const MOTIVO_SEM_DESFAZER_LABEL: Record<MotivoSemDesfazer, string> = {
  ja_desfeito: "já foi desfeito",
  nao_desfazivel: "esse registro não volta pelo DESFAZER; me diga o que corrigir",
  fora_do_prazo: "passou o prazo de 24 h",
};
