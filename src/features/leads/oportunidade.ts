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

/** O que o corretor digitou vira telefone, e-mail ou CPF. */
export function classificarBusca(texto: string): {
  telefone: string | null;
  email: string | null;
  cpf: string | null;
} {
  const t = texto.trim();
  if (t.includes("@")) return { telefone: null, email: t.toLowerCase(), cpf: null };
  const digitos = t.replace(/\D/g, "");
  // CPF formatado (000.000.000-00) é CPF; 11 dígitos soltos são celular —
  // um CPF sem pontuação cai como telefone e não acha, e o corretor redigita.
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(t)) return { telefone: null, email: null, cpf: digitos };
  return { telefone: digitos.length >= 9 ? t : null, email: null, cpf: null };
}

/** Rótulos dos campos que vêm prontos no registro novo. */
const ROTULO_CAMPO: Record<string, string> = {
  renda_informada: "renda",
  renda_estimada: "renda estimada",
  tipo_renda: "tipo de renda",
  faixa_mcmv: "faixa MCMV",
  usa_fgts: "FGTS",
  tem_fgts: "FGTS",
  fgts_valor: "valor do FGTS",
  entrada_disponivel: "entrada",
  decisor: "decisor",
  zona: "zona",
  bairro: "bairro",
  dorms_desejados: "dormitórios",
  precisa_vaga: "vaga",
  prioridades: "prioridades",
  objecoes: "objeções",
  resumo_qualificacao: "qualificação",
  projeto_nome: "empreendimento de interesse",
  construtora: "construtora",
  consentimento_lgpd: "consentimento LGPD",
};

export function rotulosHerdados(campos: string[]): string[] {
  return [...new Set(campos.map((c) => ROTULO_CAMPO[c]).filter(Boolean))];
}

export async function buscarOportunidade(texto: string): Promise<Oportunidade> {
  const args = classificarBusca(texto);
  if (!args.telefone && !args.email && !args.cpf) return { encontrado: false };
  const { data, error } = await rpc("buscar_oportunidade", {
    _telefone: args.telefone,
    _email: args.email,
    _cpf: args.cpf,
  });
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
