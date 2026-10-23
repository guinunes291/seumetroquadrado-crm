// Distribuição v3 — as chaves de cache que TODA mutação da distribuição
// invalida, e o hook que as invalida.
// Recortado de queries.ts (que reexporta tudo) sem mudança de conteúdo.

import { useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Chaves invalidadas em toda mutação da distribuição
// ---------------------------------------------------------------------------
export const DISTRIBUICAO_KEYS = [
  ["distribuicao:resumo"],
  ["distribuicao:elegibilidade"],
  ["distribuicao:excecoes"],
  ["distribuicao:historico"],
  ["distribuicao:participantes-log"],
  ["distribuicao:roletas"],
  ["distribuicao:roletas-por-corretor"],
  ["distribuicao:settings"],
  ["distribuicao:config"],
  ["distribuicao:minha-elegibilidade"],
  ["distribuicao:recebidos-semana"],
  ["distribuicao:vendas-mes-anterior"],
  ["distribuicao:corretores"],
  ["distribuicao:wip"],
  ["distribuicao:zonas-roletas"],
  // A página de métricas de Campanhas lê as mesmas linhas que a Central
  // agora edita — sem estas chaves ela ficaria stale após cada mutação.
  ["gestao:campanhas"],
  ["gestao:equipe"],
  ["gestao:equipe-metricas"],
  ["gestao:tier-hist"],
  ["gestao:projetos-mini"],
  // Presença por filial (20261013120000): o interruptor de presença da
  // Central vira check-in "liberado pela gestão" — o quadro de /presenca e o
  // card do corretor leem a mesma linha.
  ["presenca"],
] as const;

export function useInvalidateDistribuicao() {
  const qc = useQueryClient();
  return () => {
    for (const key of DISTRIBUICAO_KEYS) qc.invalidateQueries({ queryKey: [...key] });
  };
}
