// "Buscar oportunidade": o corretor encontra pelo telefone, e-mail ou CPF um
// cliente que já existe no CRM e cria o SEU registro dele (registro filho),
// herdando os dados já preenchidos. Desenho: docs/ops/registro-mae.md.
//
// As RPCs não estão nos types gerados; passam pela fronteira `rpc` de
// features/dashboard/queries para não gastar o budget de escapes de tipo. O
// retorno é validado com zod FAIL-CLOSED: aqui ele decide se o corretor cria
// um registro na base dele.

import { z } from "zod";
import { rpc } from "@/features/dashboard/queries";
import { isValidBrazilPhone, isValidCPF, isValidEmail, onlyDigits } from "@/lib/validators";

export const oportunidadeSchema = z.union([
  z.object({ encontrado: z.literal(false) }),
  z.object({
    encontrado: z.literal(true),
    cliente_id: z.string().uuid(),
    match_por: z.enum(["telefone", "cpf", "email"]),
    nome: z.string().nullable(),
    ja_na_carteira: z.boolean(),
    meu_lead_id: z.string().uuid().nullable(),
    bloqueado: z.boolean(),
    motivo_bloqueio: z.string().nullable(),
    em_outra_carteira: z.boolean(),
    campos_herdados: z.array(z.string()),
  }),
]);

export type Oportunidade = z.infer<typeof oportunidadeSchema>;

export const registroFilhoSchema = z.union([
  z.object({
    ok: z.literal(true),
    lead_id: z.string().uuid(),
    ja_existia: z.boolean(),
    adicional: z.boolean().optional(),
  }),
  z.object({ ok: z.literal(false), motivo: z.string() }),
]);

export type RegistroFilho = z.infer<typeof registroFilhoSchema>;

/** A primeira tela do Novo lead: um campo para cada jeito de achar o cliente. */
export type BuscaCliente = { telefone: string; email: string; cpf: string };

export type ErrosBusca = Partial<Record<keyof BuscaCliente | "geral", string>>;

/** O que impede a busca. Vazio = pode buscar. Um campo preenchido errado
 *  também impede: um "não encontrado" por erro de digitação viraria um
 *  cadastro mãe duplicado, justamente o que a busca existe para evitar. */
export function errosDaBusca(b: BuscaCliente): ErrosBusca {
  const tel = b.telefone.trim();
  const mail = b.email.trim();
  const cpf = b.cpf.trim();
  if (!tel && !mail && !cpf) return { geral: "Preencha o telefone, o e-mail ou o CPF do cliente." };
  const erros: ErrosBusca = {};
  if (tel && !isValidBrazilPhone(tel)) erros.telefone = "Telefone inválido: DDD + número.";
  if (mail && !isValidEmail(mail)) erros.email = "E-mail inválido.";
  if (cpf && !isValidCPF(cpf)) erros.cpf = "CPF inválido: confira os 11 dígitos.";
  return erros;
}

/** Argumentos da RPC: só o que foi preenchido. O banco procura nessa ordem —
 *  telefone, CPF, e-mail — e devolve a primeira mãe que achar. */
export function argumentosDaBusca(b: BuscaCliente): {
  _telefone: string | null;
  _email: string | null;
  _cpf: string | null;
} {
  return {
    _telefone: b.telefone.trim() || null,
    _email: b.email.trim().toLowerCase() || null,
    _cpf: onlyDigits(b.cpf) || null,
  };
}

const ROTULO_MATCH: Record<"telefone" | "cpf" | "email", string> = {
  telefone: "pelo telefone",
  cpf: "pelo CPF",
  email: "pelo e-mail",
};

export function rotuloMatch(m: "telefone" | "cpf" | "email"): string {
  return ROTULO_MATCH[m];
}

export { rotulosHerdados } from "./campos-cliente";

export async function buscarOportunidade(b: BuscaCliente): Promise<Oportunidade> {
  const args = argumentosDaBusca(b);
  if (!args._telefone && !args._email && !args._cpf) return { encontrado: false };
  const { data, error } = await rpc("buscar_oportunidade", args);
  if (error) throw error;
  return oportunidadeSchema.parse(data);
}

export async function criarRegistroFilho(clienteId: string): Promise<RegistroFilho> {
  const { data, error } = await rpc("criar_registro_filho", {
    _cliente_id: clienteId,
    _payload: {},
  });
  if (error) throw error;
  return registroFilhoSchema.parse(data);
}
