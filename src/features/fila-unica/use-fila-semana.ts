// "Como a fila se mantém finita" — os números da semana que provam que a
// fila tem saída: desfechos registrados por aqui, perdidos com motivo e
// leads que reentraram porque o cliente respondeu. Leitura só da própria
// carteira (a fila é pessoal). Sem a devolução automática à pré-venda (Fatia
// 3), o painel diz isso em vez de inventar um número.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const FILA_SEMANA_KEY = "fila-unica:semana";

export type FilaSemana = {
  desfechos: number;
  perdidos: number;
  reentraram: number;
};

const contagem = z.object({ count: z.number().nullable() }).passthrough();

async function contar(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const r = await q;
  if (r.error) throw r.error;
  return contagem.parse(r).count ?? 0;
}

export async function carregarFilaSemana(userId: string, agora = new Date()): Promise<FilaSemana> {
  const desde = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [desfechos, perdidos, reentraram] = await Promise.all([
    // Desfechos que saíram desta fila (metadata.origem = fila-unica).
    contar(
      supabase
        .from("interacoes")
        .select("id", { count: "exact", head: true })
        .eq("autor_id", userId)
        .contains("metadata", { origem: "fila-unica" })
        .gte("ocorreu_em", desde),
    ),
    // Perdidos com motivo na minha carteira, nos últimos 7 dias.
    contar(
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("corretor_id", userId)
        .eq("status", "perdido")
        .not("motivo_perda_categoria", "is", null)
        .gte("updated_at", desde),
    ),
    // Reentraram: o cliente falou por último (mensagem de entrada) num lead
    // que já tinha passado pela régua.
    contar(
      supabase
        .from("interacoes")
        .select("id", { count: "exact", head: true })
        .eq("direcao", "entrada")
        .eq("tipo", "whatsapp")
        .gte("ocorreu_em", desde),
    ),
  ]);
  return { desfechos, perdidos, reentraram };
}

export function useFilaSemana() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [FILA_SEMANA_KEY, user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: () => carregarFilaSemana(user!.id),
  });
}
