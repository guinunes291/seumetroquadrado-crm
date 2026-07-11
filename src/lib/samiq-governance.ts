const BLOCKED_KEYS = new Set([
  "cpf",
  "cnpj",
  "rg",
  "email",
  "telefone",
  "telefone_e164",
  "whatsapp",
  "celular",
  "phone",
  "mobile",
  "endereco",
  "address",
  "cep",
  "pis",
  "pasep",
  "agencia",
  "agencia_bancaria",
  "conta_bancaria",
  "conta_corrente",
  "chave_pix",
  "nome_completo",
  "full_name",
  "raw",
]);

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CPF_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const PIS_PASEP_PATTERN = /\b\d{3}\.\d{5}\.\d{2}-\d\b/g;
const RG_PATTERN = /\b(?:rg\s*[:#-]?\s*)?\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/gi;
const CEP_PATTERN = /\b\d{5}-?\d{3}\b/g;
const BIRTH_DATE_PATTERN =
  /(\b(?:nascimento|nascido(?:a)?\s+em|data\s+de\s+nascimento)\s*[:=-]?\s*)\d{1,2}[/. -]\d{1,2}[/. -]\d{2,4}\b/gi;
const PHONE_PATTERN = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}\b/g;
const LONG_ID_PATTERN = /\b\d{10,14}\b/g;
const ADDRESS_PATTERN = /\b(?:rua|avenida|av\.|travessa|alameda)\s+[^,;\n]{3,80}/gi;
const LABELED_NAME_PATTERN =
  /(\b(?:nome(?:\s+completo)?|cliente)\s*[:=-]\s*)[\p{L}]+(?:\s+[\p{L}]+){1,5}/giu;
const BANK_ACCOUNT_PATTERN =
  /(\b(?:ag[eê]ncia|conta(?:\s+(?:corrente|poupan[cç]a))?|chave\s+pix)\s*(?:n[ºo.]|n[uú]mero)?\s*[:=-]?\s*)[A-Z0-9@._+\-/]{3,100}/gi;
const TITLE_CASE_FULL_NAME_PATTERN =
  /\b\p{Lu}\p{Ll}{1,}(?:\s+(?:(?:da|de|do|das|dos|e)\s+)?\p{Lu}\p{Ll}{1,}){1,4}\b/gu;

function normalizedKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function redactSamiQPii(value: string, maxLength = 600): string {
  return value
    .replace(EMAIL_PATTERN, "[EMAIL]")
    .replace(CPF_PATTERN, "[CPF]")
    .replace(CNPJ_PATTERN, "[CNPJ]")
    .replace(PIS_PASEP_PATTERN, "[PIS_PASEP]")
    .replace(RG_PATTERN, "[RG]")
    .replace(CEP_PATTERN, "[CEP]")
    .replace(BIRTH_DATE_PATTERN, "$1[DATA]")
    .replace(LONG_ID_PATTERN, "[IDENTIFICADOR]")
    .replace(PHONE_PATTERN, "[TELEFONE]")
    .replace(ADDRESS_PATTERN, "[ENDERECO]")
    .replace(LABELED_NAME_PATTERN, "$1[NOME]")
    .replace(BANK_ACCOUNT_PATTERN, "$1[DADO_BANCARIO]")
    .slice(0, maxLength);
}

/**
 * Texto livre recebe uma segunda camada mais agressiva para nomes completos.
 * Campos estruturados de catálogo não passam por esta função, preservando os
 * nomes públicos dos empreendimentos.
 */
export function redactSamiQFreeText(value: string, maxLength = 600): string {
  return redactSamiQPii(value, maxLength * 2)
    .replace(TITLE_CASE_FULL_NAME_PATTERN, "[NOME]")
    .slice(0, maxLength);
}

export function firstNameForSamiQ(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const first = value.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  if (!first || /\d/.test(first)) return null;
  return redactSamiQPii(first, 40);
}

export function minimizeSamiQContext(
  value: unknown,
  options: { depth?: number; maxArray?: number; maxString?: number } = {},
): unknown {
  const depth = options.depth ?? 0;
  const maxArray = options.maxArray ?? 40;
  const maxString = options.maxString ?? 600;
  if (depth > 5 || value === null || value === undefined) return null;
  if (typeof value === "string") return redactSamiQPii(value, maxString);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, maxArray)
      .map((item) => minimizeSamiQContext(item, { depth: depth + 1, maxArray, maxString }));
  }
  if (typeof value !== "object") return null;

  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizedKey(key);
    if (BLOCKED_KEYS.has(normalized)) continue;
    result[key] = minimizeSamiQContext(child, {
      depth: depth + 1,
      maxArray,
      maxString,
    });
  }
  return result;
}

/** Estimativa conservadora para telemetria quando o provider omite usage. */
export function estimateSamiQTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
