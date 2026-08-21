// Contrato do payload do webhook público de leads (/api/public/webhooks/lead/$token).
// Puro (só zod) para ser testável em unidade — o route importa daqui.
//
// Regra de ouro: integração de terceiro (Zapier/Meta Lead Ads) não pode perder
// lead por detalhe de mapeamento. `normalizarPayloadExterno` aceita os nomes
// crus do Lead Ads (full_name, phone_number, email), origem em qualquer caixa
// e booleans como string; campo acessório inválido (e-mail malformado, origem
// desconhecida) degrada para null/"outro" em vez de rejeitar o lead. Os campos
// que identificam o lead (nome + telefone válido) continuam obrigatórios.
import { z } from "zod";

const optStr = (max = 2000) => z.string().trim().max(max).optional().nullable();

export const ORIGENS_LEAD = [
  "facebook",
  "google_sheets",
  "site",
  "indicacao",
  "captacao_corretor",
  "whatsapp",
  "telefone",
  "plantao",
  "agendamento_self_service",
  "chatbot",
  "impulso_smq",
  "outro",
] as const;

export const payloadSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  telefone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .refine((v) => {
      const d = v.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 13;
    }, "telefone inválido"),
  email: z.string().trim().email().max(320).optional().nullable(),
  origem: z.enum(ORIGENS_LEAD).optional().default("outro"),
  campanha: optStr(255),
  empreendimento: optStr(255),
  observacoes: optStr(),
  observacao: optStr(),
  resumo: optStr(4000),
  utm_source: optStr(255),
  utm_medium: optStr(255),
  utm_campaign: optStr(255),
  utm_content: optStr(255),
  distribuir: z.boolean().optional().default(true),
  // Zona/bairro do lead (texto livre — o trigger do banco normaliza "zona
  // leste" → 'Leste' ou resolve pelo bairro via zonas_bairros; o que não
  // normalizar fica NULL e o lead segue o fluxo por origem, sem corte).
  zona: optStr(120),
  bairro: optStr(255),
  // Qualificação IA (handoff)
  faixaRenda: optStr(120),
  finalidadeImovel: optStr(120),
  empreendimentoInteresse: optStr(255),
  regiao: optStr(255),
  fgts: optStr(255),
  decisor: optStr(255),
  temperatura: z
    .union([
      z.enum(["FRIO", "MORNO", "QUENTE", "PRONTO", "frio", "morno", "quente", "pronto"]),
      z.literal(""),
    ])
    .optional()
    .nullable(),
  motivoHandoff: z.enum(["analise", "visita", "humano"]).optional().nullable(),
  aceitouAnalise: z.boolean().optional().nullable(),
  aceitouVisita: z.boolean().optional().nullable(),
});

export type PayloadLead = z.infer<typeof payloadSchema>;

const EMAIL_SIMPLES = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function primeiroTexto(...valores: unknown[]): string | null {
  for (const v of valores) {
    const t = texto(v);
    if (t) return t;
  }
  return null;
}

/**
 * Aproxima payloads de terceiros do contrato antes do zod. Não inventa dado:
 * só renomeia aliases conhecidos e degrada acessórios inválidos. O objeto
 * original não é mutado.
 */
export function normalizarPayloadExterno(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b: Record<string, unknown> = { ...(body as Record<string, unknown>) };

  const nome = primeiroTexto(b.nome, b.full_name, b.fullName, b.name);
  if (nome) b.nome = nome;

  const telefone = primeiroTexto(
    b.telefone,
    b.phone_number,
    b.phoneNumber,
    b.phone,
    b.whatsapp,
    b.celular,
  );
  if (telefone) b.telefone = telefone;

  // E-mail vazio ou malformado não pode derrubar o lead inteiro.
  const email = texto(b.email);
  if (email && EMAIL_SIMPLES.test(email)) b.email = email;
  else delete b.email;

  // Origem em qualquer caixa ("Facebook") e com espaços; desconhecida cai no
  // default "outro" do schema em vez de virar 400.
  const origem = texto(b.origem);
  if (origem) {
    const norm = origem.toLowerCase().replace(/\s+/g, "_");
    if ((ORIGENS_LEAD as readonly string[]).includes(norm)) b.origem = norm;
    else delete b.origem;
  } else if ("origem" in b) {
    delete b.origem;
  }

  // Zapier costuma serializar booleans como string.
  for (const campo of ["distribuir", "aceitouAnalise", "aceitouVisita"] as const) {
    const v = b[campo];
    if (v === "true") b[campo] = true;
    else if (v === "false") b[campo] = false;
  }

  return b;
}

/** Normaliza e valida em um passo — o que o route usa. */
export function validarPayloadLead(body: unknown) {
  return payloadSchema.safeParse(normalizarPayloadExterno(body));
}
