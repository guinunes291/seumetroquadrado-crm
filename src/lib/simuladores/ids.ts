// Os ids das abas dos Simuladores, num módulo SEM dependências: a rota valida
// ?construtora= com ele, e o validateSearch das rotas vai para o bundle
// principal. Importar construtoras.ts ali levaria junto lib/orcamento e a
// tabela APROVE inteira (estourou o teto de 250 KB do chunk de entrada).

export const SIMULADOR_IDS = ["vibra", "direcional", "longitude", "mundo-apto"] as const;

export type SimuladorId = (typeof SIMULADOR_IDS)[number];

export function simuladorIdOuNada(v: unknown): SimuladorId | undefined {
  return SIMULADOR_IDS.find((id) => id === v);
}
