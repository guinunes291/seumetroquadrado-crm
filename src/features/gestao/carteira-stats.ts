// Leitura da carteira por corretor, separada em ativa / prospecção / parada.
//
// A RPC `carteira_stats_por_corretor_v1` (migration 20260914170000) responde
// uma pergunta diferente da antiga `leads_stats_por_corretor`: em vez de
// "quantos leads ele tem", ela diz **quantos estão em tratativa**, quantos
// ainda são topo de funil e quantos são peso morto.
//
// Passa pela fronteira `rpc` de features/dashboard/queries para não gastar o
// budget de escapes de tipo (checado em CI), e o retorno é validado com zod
// FAIL-CLOSED. Banco antigo: `rpcWithFallback` devolve null e a tela cai na
// leitura anterior, nunca em zeros silenciosos.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";

export const CARTEIRA_STATS_KEY = "carteira-stats-corretor";

const linhaSchema = z.object({
  corretor_id: z.string().uuid().nullable(),
  // bigint chega como string pelo PostgREST.
  total: z.coerce.number().int(),
  ativa: z.coerce.number().int(),
  prospeccao: z.coerce.number().int(),
  parada: z.coerce.number().int(),
  fundo: z.coerce.number().int(),
  ganhos: z.coerce.number().int(),
  perdidos: z.coerce.number().int(),
});

export type CarteiraStats = z.infer<typeof linhaSchema>;

export function parseCarteiraStats(input: unknown): CarteiraStats[] {
  return z.array(linhaSchema).parse(input ?? []);
}

export const SEM_DONO = "__unassigned__";

/** Indexa por corretor, com os sem dono sob `SEM_DONO`. */
export function indexarPorCorretor(linhas: readonly CarteiraStats[]): Map<string, CarteiraStats> {
  const m = new Map<string, CarteiraStats>();
  for (const l of linhas) m.set(l.corretor_id ?? SEM_DONO, l);
  return m;
}

/**
 * A frase do card. Ela existe para o gestor ler a carteira em uma linha, e a
 * ordem das partes é a ordem da conversa que ele vai ter com o corretor:
 * primeiro o que está vivo, depois o que está parando, depois o topo de funil.
 */
export function fraseDaCarteira(s: CarteiraStats): string {
  const partes = [`${s.ativa} em tratativa`];
  if (s.parada > 0) partes.push(`${s.parada} parados`);
  if (s.prospeccao > 0) partes.push(`${s.prospeccao} em prospecção`);
  return partes.join(" · ");
}

/**
 * Quanto da carteira "de verdade" está parado. É o número que decide se a
 * conversa com o corretor é sobre volume ou sobre disciplina — e o
 * denominador exclui prospecção de propósito: lead que nunca teve primeiro
 * contato não está parado, está na fila.
 */
export function pctParada(s: CarteiraStats): number | null {
  const denom = s.ativa + s.parada;
  if (denom === 0) return null;
  return Math.round((100 * s.parada) / denom);
}

export type TomCarteira = "saudavel" | "atencao" | "critico";

/** Acima de 70% parada a carteira é um cemitério; abaixo de 30% está sob
 *  controle. Os cortes são de leitura, não de regra — quem devolve lead é a
 *  régua de posse, não esta tela. */
export function tomDaCarteira(s: CarteiraStats): TomCarteira | null {
  const pct = pctParada(s);
  if (pct === null) return null;
  if (pct >= 70) return "critico";
  if (pct >= 30) return "atencao";
  return "saudavel";
}

export function useCarteiraStats() {
  return useQuery({
    queryKey: [CARTEIRA_STATS_KEY],
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<CarteiraStats[] | null>(
        async () => {
          const { data, error } = await rpc("carteira_stats_por_corretor_v1", {});
          if (error) throw error;
          return parseCarteiraStats(data);
        },
        () => null,
      ),
  });
}
