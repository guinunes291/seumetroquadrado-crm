// "Cliente respondeu" na Fila do Dia — o que a tela promete ao corretor.
//
// Quem decide para onde o lead vai é o banco (cadencia_marcar_respondeu,
// 20261011120500); aqui só se escolhe o texto que diz isso. Pura para ser
// testável: o texto antigo prometia "qualificação" e o banco mandava para Em
// atendimento — o corretor procurava o lead na coluna errada.

/**
 * Status em que "Cliente respondeu" põe o lead em Em atendimento: o mesmo
 * recorte da RPC (e de _cadencia_status_prospeccao). Em qualquer outro, o
 * lead só sai da cadência e fica na etapa em que está.
 */
export const RESPONDEU_ENTRA_EM_ATENDIMENTO: ReadonlySet<string> = new Set([
  "novo",
  "aguardando_atendimento",
  "aguardando_corretor",
  "aguardando_retorno",
]);

export type TextosRespondeu = {
  /** Primeira frase da descrição do diálogo. */
  destino: string;
  /** Rótulo do botão de salvar. */
  botao: string;
  /** Toast depois de salvar. */
  sucesso: string;
};

export function textosRespondeu(status: string | null | undefined): TextosRespondeu {
  if (status && RESPONDEU_ENTRA_EM_ATENDIMENTO.has(status)) {
    return {
      destino: "O lead sai da cadência e entra em atendimento.",
      botao: "Salvar e pôr em atendimento",
      sucesso: "Lead entrou em atendimento, com o próximo passo agendado.",
    };
  }
  return {
    destino: "O lead sai da cadência e continua na etapa em que está.",
    botao: "Salvar próximo passo",
    sucesso: "Lead fora da cadência, com o próximo passo agendado.",
  };
}
