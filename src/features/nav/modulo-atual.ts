import { createContext, useContext } from "react";

// Contexto LEVE de propósito: o PageHeader (55 telas) importa só isto. O
// provider, que resolve o módulo pelo registro SISTEMAS, mora em
// modulo-atual-provider.tsx e é importado só pelo shell — se o registro
// viesse junto do PageHeader, o Rollup o içaria para o chunk principal.

export type ModuloAtual = { numero: number; titulo: string };

/** Exportado para o provider do shell e para testes/previews montarem o
 *  cabeçalho com um módulo fixo. Fora do shell vale null: sem eyebrow. */
export const ModuloAtualContext = createContext<ModuloAtual | null>(null);

export function useModuloAtual(): ModuloAtual | null {
  return useContext(ModuloAtualContext);
}
