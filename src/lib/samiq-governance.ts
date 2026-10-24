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
// Celular (9 + 8 dígitos, com ou sem DDD/espaço). Vem ANTES do RG: "11 930785691"
// tem 9 dígitos colados e o RG_PATTERN o lia como RG, então o histórico da
// conversa guardava "11 [RG]" e o telefone do cliente sumia do contexto.
const MOBILE_PATTERN = /(?<![\d.])(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9\d{4}[\s.-]?\d{4}\b/g;
const ADDRESS_PATTERN = /\b(?:rua|avenida|av\.|travessa|alameda)\s+[^,;\n]{3,80}/gi;
const LABELED_NAME_PATTERN =
  /(\b(?:nome(?:\s+completo)?|cliente)\s*[:=-]\s*)[\p{L}]+(?:\s+[\p{L}]+){1,5}/giu;
// v8.2 (QA de 24/10/2026): "conta" precisa fechar a palavra e o valor precisa
// ter dígito. Sem isso "primeiro contato." virava "primeiro conta[DADO_BANCARIO]"
// no histórico e "me conta uma piada" virava "me conta [DADO_BANCARIO] piada".
const BANK_ACCOUNT_PATTERN =
  /(\b(?:ag[eê]ncia|conta(?:\s+(?:corrente|poupan[cç]a))?|chave\s+pix)\b\s*(?:n[ºo.]|n[uú]mero)?\s*[:=-]?\s*)(?=[A-Z0-9@._+\-/]*\d)[A-Z0-9@._+\-/]{3,100}/gi;
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
    .replace(MOBILE_PATTERN, "[TELEFONE]")
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
 * Marcadores numerados que o servidor sabe desfazer (v8, Sami-CRM).
 * `[TELEFONE_1]` -> o telefone que o corretor digitou. O modelo nunca vê o
 * contato do cliente, mas consegue cadastrar um lead ou achar um cliente pelo
 * telefone: a ferramenta recebe o marcador e o servidor troca pelo valor real
 * antes de gravar (restaurarPiiDoCorretor).
 */
export type MapaPiiCorretor = Record<string, string>;

const MARCADOR_RESTAURAVEL = /\[(TELEFONE|EMAIL|CPF)_\d{1,2}\]/g;

/** v8.2: por quanto tempo os marcadores de uma conversa continuam restauráveis. */
export const SAMIQ_PII_MAPA_VALIDO_MS = 30 * 60 * 1000;

/** Mapa guardado na conversa (samiq_conversas.contexto.pii), com a hora do último marcador novo. */
export type PiiDaConversa = { mapa: MapaPiiCorretor; em: string };

/** Mapa anterior que ainda vale (30 min desde o último marcador novo). */
export function mapaPiiValido(pii: PiiDaConversa | null | undefined, agora: Date): MapaPiiCorretor {
  if (!pii || !pii.mapa) return {};
  const em = Date.parse(pii.em);
  if (!Number.isFinite(em) || agora.getTime() - em > SAMIQ_PII_MAPA_VALIDO_MS) return {};
  return { ...pii.mapa };
}

/**
 * O que vai para a memória da conversa depois do turno: o mapa inteiro (até 12
 * marcadores), com `em` renovado só quando esta mensagem trouxe marcador novo.
 */
export function piiParaMemoria(
  anterior: PiiDaConversa | null | undefined,
  mapaDoTurno: MapaPiiCorretor,
  agora: Date,
): PiiDaConversa | null {
  const chaves = Object.keys(mapaDoTurno);
  if (chaves.length === 0) return null;
  const antes = anterior?.mapa ?? {};
  const trouxeNovo = chaves.some((k) => antes[k] !== mapaDoTurno[k]);
  const em = trouxeNovo || !anterior?.em ? agora.toISOString() : anterior.em;
  const mapa = Object.fromEntries(chaves.slice(-12).map((k) => [k, mapaDoTurno[k]!]));
  return { mapa, em };
}

/**
 * Texto do CORRETOR que vai ao modelo (pergunta e histórico). Diferente do
 * texto livre vindo do banco, aqui nomes de cliente e de empreendimento
 * passam (decisão D12: o modelo precisa do sobrenome para achar o cliente
 * certo e do nome do empreendimento para buscar o material). Telefone, e-mail
 * e CPF viram marcadores numerados restauráveis; RG, CEP, endereço, data de
 * nascimento, identificadores longos e dados bancários são redigidos como
 * sempre e não voltam.
 */
export function redigirTextoDoCorretor(
  value: string,
  maxLength = 4000,
  /**
   * v8.2: marcadores das mensagens anteriores da conversa (30 min). A numeração
   * continua de onde parou e o mesmo telefone ganha o mesmo marcador, para o
   * modelo poder usar o [TELEFONE_1] que viu no histórico ("sim, é outro
   * cliente" depois de "cadastra Fulano 11 9...").
   */
  anterior: MapaPiiCorretor = {},
): { texto: string; mapa: MapaPiiCorretor } {
  const mapa: MapaPiiCorretor = { ...anterior };
  const contagem: Record<"TELEFONE" | "EMAIL" | "CPF", number> = { TELEFONE: 0, EMAIL: 0, CPF: 0 };
  for (const chave of Object.keys(anterior)) {
    const m = /^\[(TELEFONE|EMAIL|CPF)_(\d{1,2})\]$/.exec(chave);
    if (m) {
      const tipo = m[1] as "TELEFONE" | "EMAIL" | "CPF";
      contagem[tipo] = Math.max(contagem[tipo], Number(m[2]));
    }
  }
  const marcar = (tipo: "TELEFONE" | "EMAIL" | "CPF") => (achado: string) => {
    const valor = achado.trim();
    const existente = Object.entries(mapa).find(([, v]) => v === valor)?.[0];
    if (existente) return achado.replace(valor, existente);
    contagem[tipo] += 1;
    const chave = `[${tipo}_${contagem[tipo]}]`;
    mapa[chave] = valor;
    return achado.replace(valor, chave);
  };
  const texto = value
    .replace(EMAIL_PATTERN, marcar("EMAIL"))
    .replace(CPF_PATTERN, marcar("CPF"))
    .replace(CNPJ_PATTERN, "[CNPJ]")
    .replace(PIS_PASEP_PATTERN, "[PIS_PASEP]")
    // Telefone antes de RG/identificador: "11987654321" e "98765-4321" são
    // telefone para o corretor, e o marcador numerado permite usá-lo.
    .replace(PHONE_PATTERN, marcar("TELEFONE"))
    .replace(RG_PATTERN, "[RG]")
    .replace(CEP_PATTERN, "[CEP]")
    .replace(BIRTH_DATE_PATTERN, "$1[DATA]")
    .replace(LONG_ID_PATTERN, "[IDENTIFICADOR]")
    .replace(ADDRESS_PATTERN, "[ENDERECO]")
    .replace(BANK_ACCOUNT_PATTERN, "$1[DADO_BANCARIO]")
    .slice(0, maxLength);
  return { texto, mapa };
}

/** Troca os marcadores restauráveis pelo valor que o corretor digitou. */
export function restaurarPiiDoCorretor(value: string, mapa: MapaPiiCorretor): string {
  if (!value || Object.keys(mapa).length === 0) return value;
  return value.replace(MARCADOR_RESTAURAVEL, (marcador) => mapa[marcador] ?? marcador);
}

/** O texto ainda tem algum marcador de PII (restaurável ou não)? */
export function temMarcadorPii(value: string | null | undefined): boolean {
  return /\[(TELEFONE|EMAIL|CPF|CNPJ|RG|CEP|PIS_PASEP|IDENTIFICADOR|ENDERECO|DADO_BANCARIO|DATA)(_\d{1,2})?\]/.test(
    value ?? "",
  );
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

/**
 * Nome completo do cliente para campos ESTRUTURADOS (decisão D12): o modelo
 * precisa distinguir duas "Maria" na carteira e citar o cliente pelo nome.
 * Telefone, CPF, e-mail, endereço e banco continuam bloqueados por chave e por
 * padrão; texto livre segue com a camada agressiva (redactSamiQFreeText).
 */
export function displayNameForSamiQ(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nome = value.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!nome || /\d/.test(nome)) return null;
  return redactSamiQPii(nome, 80);
}

export function firstNameForSamiQ(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const first = value.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  if (!first || /\d/.test(first)) return null;
  return redactSamiQPii(first, 40);
}

// Perfis que não são pessoa (o número da empresa, contas de equipe ou de
// teste). "Seu Metro Quadrado" virava "Seu" e a Sami chamava o dono de "Seu".
const NOME_INSTITUCIONAL =
  /\b(metro quadrado|smq|imobiliaria|equipe|admin|administrador|suporte|teste|comercial|plantao)\b/;
const PRIMEIRO_NOME_INVALIDO = new Set([
  "seu",
  "sua",
  "o",
  "a",
  "time",
  "conta",
  "usuario",
  "corretor",
]);

/** Primeiro nome para a Sami chamar o corretor; null quando o perfil não é de uma pessoa. */
export function primeiroNomeDoCorretor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normal = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!normal || NOME_INSTITUCIONAL.test(normal)) return null;
  const primeiro = normal.split(/\s+/)[0] ?? "";
  if (PRIMEIRO_NOME_INVALIDO.has(primeiro)) return null;
  return firstNameForSamiQ(value);
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
