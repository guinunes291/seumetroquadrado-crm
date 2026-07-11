import { z } from "zod";

export const VITRINE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const VITRINE_MIN_PROJETOS = 2;
export const VITRINE_MAX_PROJETOS = 3;
export const VITRINE_DEFAULT_EXPIRY_DAYS = 7;
export const VITRINE_MAX_EXPIRY_DAYS = 30;

const nullableNumberSchema = z
  .union([z.number(), z.string().transform((value) => Number(value))])
  .refine((value) => Number.isFinite(value), "Número inválido")
  .nullable();

export const vitrinePublicProjectSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1).max(200),
  construtora: z.string().max(200).nullable(),
  bairro: z.string().max(200).nullable(),
  cidade: z.string().max(200).nullable(),
  zona: z.string().max(100).nullable(),
  dorms_min: nullableNumberSchema,
  dorms_max: nullableNumberSchema,
  metragem_min: nullableNumberSchema,
  metragem_max: nullableNumberSchema,
  preco_a_partir: nullableNumberSchema,
  sob_consulta: z.boolean(),
  status_preco: z.string().max(50).nullable(),
  status_entrega: z.string().max(100).nullable(),
  mes_entrega: nullableNumberSchema,
  ano_entrega: nullableNumberSchema,
  renda_minima: nullableNumberSchema,
  disponibilidade_resumo: z.string().max(160).nullable().default(null),
  capa_url: z.string().nullable().default(null),
  galeria_urls: z.array(z.string()).max(12).default([]),
  diferenciais: z.array(z.string().min(1).max(240)).max(30).default([]),
  book_url: z.string().nullable(),
  tabela_precos_url: z.string().nullable(),
});

export type VitrinePublicProject = z.infer<typeof vitrinePublicProjectSchema>;

export type VitrinePublicPayload = {
  expires_at: string;
  projects: VitrinePublicProject[];
};

export const createVitrineLinkInputSchema = z
  .object({
    lead_id: z.string().uuid(),
    project_ids: z.array(z.string().uuid()).min(VITRINE_MIN_PROJETOS).max(VITRINE_MAX_PROJETOS),
    expires_in_days: z
      .number()
      .int()
      .min(1)
      .max(VITRINE_MAX_EXPIRY_DAYS)
      .default(VITRINE_DEFAULT_EXPIRY_DAYS),
  })
  .superRefine((value, context) => {
    if (new Set(value.project_ids).size !== value.project_ids.length) {
      context.addIssue({
        code: "custom",
        path: ["project_ids"],
        message: "Os empreendimentos precisam ser distintos.",
      });
    }
  });

export const revokeVitrineLinkInputSchema = z.object({ link_id: z.string().uuid() });

export const vitrinePublicEventSchema = z
  .object({
    type: z.enum(["project_viewed", "cta_clicked"]),
    project_id: z.string().uuid(),
    cta: z.enum(["book", "price_table", "contact"]).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === "cta_clicked" && !value.cta) {
      context.addIssue({ code: "custom", path: ["cta"], message: "CTA obrigatória." });
    }
    if (value.type === "project_viewed" && value.cta) {
      context.addIssue({ code: "custom", path: ["cta"], message: "CTA não permitida." });
    }
  });

export type VitrinePublicEvent = z.infer<typeof vitrinePublicEventSchema>;

export type VitrineLinkSummary = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  projects: Array<{ id: string; name: string; order: number }>;
};

/**
 * Publica somente HTTPS em host explicitamente autorizado e sem query/hash,
 * evitando vazar URLs assinadas, credenciais ou destinos internos.
 */
export function safePublicHttpUrl(value: unknown, allowedHosts: readonly string[]): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
      return null;
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Valida a allowlist e normaliza links externos antes de responder ao público. */
export function parsePublicVitrineProjects(
  value: unknown,
  allowedHosts: readonly string[] = [],
): VitrinePublicProject[] {
  const rows = z.array(vitrinePublicProjectSchema).min(2).max(3).parse(value);
  return rows.map((row) => ({
    ...row,
    capa_url: safePublicHttpUrl(row.capa_url, allowedHosts),
    galeria_urls: row.galeria_urls
      .map((url) => safePublicHttpUrl(url, allowedHosts))
      .filter((url): url is string => url !== null),
    book_url: safePublicHttpUrl(row.book_url, allowedHosts),
    tabela_precos_url: safePublicHttpUrl(row.tabela_precos_url, allowedHosts),
  }));
}

/** Alterna a shortlist sem duplicar e sem ultrapassar três projetos. */
export function toggleVitrineShortlist(current: string[], projectId: string): string[] {
  if (current.includes(projectId)) return current.filter((id) => id !== projectId);
  if (current.length >= VITRINE_MAX_PROJETOS) return current;
  return [...current, projectId];
}

export function isValidVitrineShortlist(projectIds: string[]): boolean {
  return (
    projectIds.length >= VITRINE_MIN_PROJETOS &&
    projectIds.length <= VITRINE_MAX_PROJETOS &&
    new Set(projectIds).size === projectIds.length
  );
}
