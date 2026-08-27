// Cliente do módulo Follow-Up — a fila do dia da régua de toques.
//
// As RPCs desta feature (followup_fila_v1, marcar_followup_esgotado,
// reativar_followup) ainda não existem nos types gerados do Supabase; elas
// passam pela fronteira `rpc` de features/dashboard/queries para não gastar
// o budget de escapes de tipo (checado em CI). O retorno é validado com zod
// FAIL-CLOSED, como na inbox de atendimento: um item malformado derruba a
// query com erro claro em vez de renderizar uma fila silenciosamente errada.

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/features/dashboard/queries";
import { parseRegua, REGUA_PADRAO, type ReguaFollowUp } from "@/lib/regua-followup";

const filaItemSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string(),
  email: z.string().nullable(),
  status: z.string(),
  temperatura: z.string().nullable(),
  origem: z.string(),
  projeto_id: z.string().uuid().nullable(),
  projeto_nome: z.string().nullable(),
  corretor_id: z.string().uuid().nullable(),
  created_at: z.string(),
  ultima_interacao: z.string().nullable(),
  proxima_acao: z.string().nullable(),
  proximo_followup: z.string().nullable(),
  renda_informada: z.string().nullable(),
  entrada_disponivel: z.string().nullable(),
  usa_fgts: z.boolean().nullable(),
  observacoes: z.string().nullable(),
  minutos_vencido: z.number().int().nonnegative(),
  tentativas: z.number().int().nonnegative(),
  respondeu: z.boolean(),
});

const filaSchema = z.object({
  gerado_em: z.string(),
  corretor_id: z.string().uuid(),
  itens: z.array(filaItemSchema),
});

export type FilaItem = z.infer<typeof filaItemSchema>;
export type FilaFollowUp = z.infer<typeof filaSchema>;

export function parseFilaFollowUp(input: unknown): FilaFollowUp {
  return filaSchema.parse(input);
}

/** Fila do dia do corretor autenticado — ou de um corretor do time, quando o
 *  caller é gestão (o guard de escopo é da própria RPC). */
export async function fetchFilaFollowUp(corretorId?: string): Promise<FilaFollowUp> {
  const { data, error } = await rpc("followup_fila_v1", {
    _corretor: corretorId ?? null,
    _take: 200,
  });
  if (error) throw error;
  return parseFilaFollowUp(data);
}

/** Régua vigente. gestao_config só é legível pela gestão (RLS); para o
 *  corretor a leitura falha ou volta vazia — cai no REGUA_PADRAO em silêncio,
 *  que é a mesma cadência que a migration semeia no banco. */
export async function carregarRegua(): Promise<ReguaFollowUp> {
  try {
    const { data, error } = await supabase
      .from("gestao_config")
      .select("chave, valor")
      .eq("chave", "regua_followup")
      .maybeSingle();
    if (error || !data) return REGUA_PADRAO;
    return parseRegua(data.valor);
  } catch {
    return REGUA_PADRAO;
  }
}

/** Marca a régua como esgotada (decisão humana pendente: reativar/descartar).
 *  A RPC também cancela as tarefas de contato abertas do lead. */
export async function esgotarFollowUp(leadId: string): Promise<void> {
  const { error } = await rpc("marcar_followup_esgotado", { _lead_id: leadId });
  if (error) throw error;
}

/** Devolve o lead esgotado à régua para um novo ciclo de toques. */
export async function reativarFollowUp(leadId: string): Promise<void> {
  const { error } = await rpc("reativar_followup", { _lead_id: leadId });
  if (error) throw error;
}
