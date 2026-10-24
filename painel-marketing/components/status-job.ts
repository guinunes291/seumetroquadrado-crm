// Como cada status da fila aparece na tela.
export const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  rascunho: { texto: "Rascunho", cor: "bg-creme text-cinza" },
  aguardando_aprovacao: { texto: "Aguardando você", cor: "bg-aurum/20 text-navy" },
  executando: { texto: "Aplicando", cor: "bg-navy/10 text-navy" },
  concluido: { texto: "Aplicado", cor: "bg-green-100 text-green-800" },
  erro: { texto: "Erro", cor: "bg-alerta/10 text-alerta" },
  revertido: { texto: "Revertido", cor: "bg-creme text-cinza" },
};
