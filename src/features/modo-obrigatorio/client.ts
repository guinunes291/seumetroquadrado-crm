// Modo Obrigatório — cliente da RPC que decide se o corretor está travado.
//
// A fonte da verdade é o banco (modo_obrigatorio_v1, migration
// 20261002120000): QUAIS pendências, em QUE ordem, e se trava. A tela só
// obedece.
//
// FAIL-OPEN, de propósito e ao contrário do resto das filas (que são
// fail-closed): um erro nosso — RPC ausente num deploy fora de ordem, payload
// inesperado, rede — NÃO pode trancar o time inteiro fora do CRM. Na falha, a
// resposta é "não travado" e o erro vai para o console. É o mesmo princípio do
// Estudo do Meu Funil (liberarPorFalha).

import { z } from "zod";
import { rpc } from "@/features/dashboard/queries";
import { filaItemSchema } from "@/features/cadencia/client";

const leadSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string(),
  email: z.string().nullable(),
  status: z.string(),
  temperatura: z.string().nullable(),
  ultima_interacao: z.string().nullable(),
  proximo_followup: z.string().nullable(),
  projeto_id: z.string().uuid().nullable(),
  projeto_nome: z.string().nullable(),
  created_at: z.string(),
  corretor_id: z.string().uuid().nullable(),
  origem: z.string(),
  renda_informada: z.string().nullable(),
  entrada_disponivel: z.string().nullable(),
  usa_fgts: z.boolean().nullable(),
  proxima_acao: z.string().nullable(),
  faixa_mcmv: z.string().nullable(),
});

const itemSchema = z.object({
  lead_id: z.string().uuid(),
  tipo: z.enum(["cadencia", "fundo_parado"]),
  grupo: z.number().int(),
  ordem: z.number().int(),
  nome: z.string(),
  status: z.string(),
  etapa: z.string().nullable(),
  prazo: z.string().nullable(),
  atrasado: z.boolean().nullable(),
  dias_parado: z.number().int().nullable(),
  projeto_id: z.string().uuid().nullable(),
  projeto_nome: z.string().nullable(),
  motivo: z.string(),
  cadencia: filaItemSchema.nullable(),
  lead: leadSchema,
});

const modoSchema = z.object({
  gerado_em: z.string(),
  aplica: z.boolean(),
  travado: z.boolean(),
  liberado_hoje: z.boolean(),
  total: z.number().int().nonnegative(),
  itens: z.array(itemSchema),
});

export type ItemObrigatorio = z.infer<typeof itemSchema>;
export type LeadObrigatorio = z.infer<typeof leadSchema>;
export type ModoObrigatorio = z.infer<typeof modoSchema>;

/** O que vale quando não dá para saber: não trava. */
export const MODO_LIVRE: ModoObrigatorio = {
  gerado_em: "",
  aplica: false,
  travado: false,
  liberado_hoje: false,
  total: 0,
  itens: [],
};

export const MODO_OBRIGATORIO_KEY = "modo-obrigatorio";

/** Lê o modo do corretor autenticado. Nunca lança: falha vira MODO_LIVRE. */
export async function lerModoObrigatorio(): Promise<ModoObrigatorio> {
  try {
    const { data, error } = await rpc("modo_obrigatorio_v1", {});
    if (error) throw error;
    const parsed = modoSchema.safeParse(data);
    if (!parsed.success) {
      console.error("modo_obrigatorio_v1: payload inesperado — CRM liberado", parsed.error);
      return MODO_LIVRE;
    }
    return parsed.data;
  } catch (e) {
    console.error("modo_obrigatorio_v1 indisponível — CRM liberado", e);
    return MODO_LIVRE;
  }
}

const equipeSchema = z.object({
  corretor_id: z.string().uuid(),
  nome: z.string().nullable(),
  total: z.number().int(),
  cadencia: z.number().int(),
  lead_chegou: z.number().int(),
  fundo_parado: z.number().int(),
  atrasados: z.number().int(),
  mais_antigo: z.string().nullable(),
  liberado_hoje: z.boolean(),
  motivo_liberacao: z.string().nullable(),
  modo_ativo: z.boolean(),
});

export type LinhaEquipeObrigatorio = z.infer<typeof equipeSchema>;

/** Visão da gestão. Fail-closed: é tela de acompanhamento, não trava ninguém. */
export async function fetchEquipeObrigatorio(): Promise<LinhaEquipeObrigatorio[]> {
  const { data, error } = await rpc("modo_obrigatorio_equipe_v1", {});
  if (error) throw error;
  return z.array(equipeSchema).parse(data ?? []);
}

export async function liberarCorretorHoje(corretorId: string, motivo: string): Promise<void> {
  const { error } = await rpc("modo_obrigatorio_liberar", {
    _corretor: corretorId,
    _motivo: motivo,
  });
  if (error) throw error;
}
