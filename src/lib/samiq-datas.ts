// Datas da Sami-CRM (v8) — PURO, sem rede.
//
// O servidor roda em UTC e a operação vive em São Paulo (UTC-3 fixo desde o
// fim do horário de verão, em 2019). Dois problemas que este módulo resolve:
//  1. o modelo precisa saber que hoje é SÁBADO e que são 10h32 para entender
//     "sábado às 10h", "amanhã de manhã", "daqui a 2 horas";
//  2. o modelo às vezes devolve "2026-10-25T10:00:00" sem fuso (lido como UTC,
//     vira 07:00 em SP) ou só "2026-10-25". Aqui isso vira horário de SP.

export const FUSO_SP = "America/Sao_Paulo";
export const OFFSET_SP = "-03:00";

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const SEM_FUSO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;

/**
 * ISO 8601 com o fuso de São Paulo. "2026-10-25" vira 09:00 do dia (ou a
 * hora padrão pedida); "2026-10-25T10:00" sem fuso vira 10:00 de SP. Qualquer
 * coisa com fuso (Z, -03:00, +00:00) fica como veio.
 */
export function isoComFusoSP(valor: string, horaPadrao = "09:00"): string {
  const v = (valor ?? "").trim();
  if (SO_DATA.test(v)) return `${v}T${horaPadrao}:00${OFFSET_SP}`;
  if (SEM_FUSO.test(v)) {
    const base = v.replace(" ", "T");
    const comSegundos = /T\d{2}:\d{2}$/.test(base) ? `${base}:00` : base;
    return `${comSegundos}${OFFSET_SP}`;
  }
  return v;
}

/** O mesmo, para campos opcionais/nulos do payload. */
export function isoComFusoSPOpcional<T extends string | null | undefined>(
  valor: T,
  horaPadrao?: string,
): T {
  if (typeof valor !== "string" || !valor.trim()) return valor;
  return isoComFusoSP(valor, horaPadrao) as T;
}

/** AAAA-MM-DD de um instante, no calendário de São Paulo. */
export function diaSP(agora: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_SP,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** AAAA-MM do mês atual em SP. */
export function mesSP(agora: Date = new Date()): string {
  return diaSP(agora).slice(0, 7);
}

const DIA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIA_SEMANA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function partesSP(agora: Date): { ano: number; mes: number; dia: number; hora: string; semana: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_SP,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(agora);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const semanas: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hora = `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
  return {
    ano: Number(get("year")),
    mes: Number(get("month")),
    dia: Number(get("day")),
    hora,
    semana: semanas[get("weekday")] ?? 0,
  };
}

function dd(n: number): string {
  return String(n).padStart(2, "0");
}

/** "sábado, 24/10/2026, 10:32" — o agora que o modelo lê no cabeçalho. */
export function agoraParaModelo(agora: Date = new Date()): string {
  const p = partesSP(agora);
  return `${DIA_SEMANA[p.semana]}, ${dd(p.dia)}/${dd(p.mes)}/${p.ano}, ${p.hora}`;
}

/**
 * Os próximos dias com a data ISO de cada um, para o modelo não errar
 * "sábado" ou "terça que vem": "hoje sáb 24/10 (2026-10-24) · amanhã dom
 * 25/10 (2026-10-25) · seg 26/10 (2026-10-26) ...".
 */
export function calendarioParaModelo(agora: Date = new Date(), dias = 8): string {
  const itens: string[] = [];
  for (let i = 0; i < dias; i += 1) {
    const d = new Date(agora.getTime() + i * 24 * 60 * 60 * 1000);
    const p = partesSP(d);
    const iso = `${p.ano}-${dd(p.mes)}-${dd(p.dia)}`;
    const prefixo = i === 0 ? "hoje " : i === 1 ? "amanhã " : "";
    itens.push(`${prefixo}${DIA_SEMANA_CURTO[p.semana]} ${dd(p.dia)}/${dd(p.mes)} (${iso})`);
  }
  return itens.join(" · ");
}

/** "sáb 25/10 10:00" no horário de SP (textos do WhatsApp e do card). */
export function fmtDataHoraSP(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = partesSP(d);
  return `${DIA_SEMANA_CURTO[p.semana]} ${dd(p.dia)}/${dd(p.mes)} ${p.hora}`;
}

/** "25/10/2026" a partir de AAAA-MM-DD. */
export function fmtDiaBr(dia: string | null | undefined): string | null {
  if (!dia || !SO_DATA.test(dia)) return null;
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
}

/** true se o instante já passou (com tolerância, para "agora" e relógios desalinhados). */
export function jaPassou(iso: string, agora: Date = new Date(), toleranciaMs = 5 * 60_000): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t < agora.getTime() - toleranciaMs;
}

/** Os próximos 12 meses (AAAA-MM) a partir do mês seguinte — mesma janela da tela de venda. */
export function mesesPrevisaoSP(agora: Date = new Date()): string[] {
  const p = partesSP(agora);
  const out: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const total = p.mes - 1 + i;
    const ano = p.ano + Math.floor(total / 12);
    const mes = (total % 12) + 1;
    out.push(`${ano}-${dd(mes)}`);
  }
  return out;
}
