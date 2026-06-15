// Helpers para templates de mensagem (WhatsApp, e-mail, SMS).

export type TemplateCanal = "whatsapp" | "email" | "sms" | "interno";

export const CANAL_LABEL: Record<TemplateCanal, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  interno: "Interno",
};

export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * Substitui placeholders {{chave}} no template. Chaves não fornecidas
 * permanecem visíveis para que o corretor saiba o que está faltando.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === null || v === undefined || v === "") return `{{${key}}}`;
    return String(v);
  });
}

/** Extrai todas as variáveis usadas em um template, sem duplicar. */
export function extractVariables(template: string): string[] {
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) out.add(m[1]);
  return Array.from(out);
}

/**
 * Normaliza um telefone brasileiro para o formato esperado pelo wa.me
 * (apenas dígitos, com DDI 55 quando ausente).
 */
export function normalizePhoneToWhatsApp(telefone: string): string {
  const digits = telefone.replace(/\D+/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("55")) return digits;
  // Números brasileiros têm 10 ou 11 dígitos (DDD + número).
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Constrói o link wa.me com mensagem pré-preenchida. */
export function buildWhatsAppUrl(telefone: string, mensagem: string): string {
  const phone = normalizePhoneToWhatsApp(telefone);
  const text = encodeURIComponent(mensagem);
  return phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;
}
