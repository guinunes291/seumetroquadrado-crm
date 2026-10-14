// Integração leve com calendários externos (Fase A — sem OAuth):
// gera o link "Adicionar ao Google Agenda" pré-preenchido e o arquivo .ics
// (Apple/Outlook). A sincronização automática via OAuth é a Fase B.

export type CalendarEventInput = {
  titulo: string;
  /** Início em ISO (UTC ou com offset). */
  inicio: string | Date;
  /** Fim em ISO; se ausente, assume 1h de duração. */
  fim?: string | Date | null;
  descricao?: string | null;
  local?: string | null;
  /**
   * Lembretes do .ics, em minutos ANTES do início (ex.: [1440, 300] = 1 dia e
   * 5 horas antes). Viram blocos VALARM, que Apple Calendar/Outlook respeitam.
   * O link do Google não aceita lembretes — lá vale o padrão da agenda do usuário.
   */
  lembretesMinutos?: readonly number[];
};

const HOUR_MS = 3_600_000;

function toDate(v: string | Date): Date {
  return typeof v === "string" ? new Date(v) : v;
}

/** Formata para o padrão de data do Google/ICS em UTC: YYYYMMDDTHHmmssZ. */
function toCalendarUtc(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function eventRange(ev: CalendarEventInput): { start: Date; end: Date } {
  const start = toDate(ev.inicio);
  const end = ev.fim ? toDate(ev.fim) : new Date(start.getTime() + HOUR_MS);
  return { start, end };
}

/** URL do Google Calendar com o evento pré-preenchido (abre em nova aba). */
export function buildGoogleCalendarUrl(ev: CalendarEventInput): string {
  const { start, end } = eventRange(ev);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.titulo,
    dates: `${toCalendarUtc(start)}/${toCalendarUtc(end)}`,
  });
  if (ev.descricao) params.set("details", ev.descricao);
  if (ev.local) params.set("location", ev.local);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapa texto para propriedades ICS (RFC 5545). */
function icsEscape(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Duração ICS negativa (antes do início): 1440 → -P1D, 300 → -PT5H, 90 → -PT1H30M. */
export function icsTriggerAntes(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const parteDias = dias ? `${dias}D` : "";
  if (horas === 0 && mins === 0) return dias ? `-P${parteDias}` : "-PT0M";
  return `-P${parteDias}T${horas ? `${horas}H` : ""}${mins ? `${mins}M` : ""}`;
}

function valarm(minutos: number, titulo: string): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(titulo)}`,
    `TRIGGER:${icsTriggerAntes(minutos)}`,
    "END:VALARM",
  ];
}

/**
 * Dobra linhas com mais de 75 octetos (RFC 5545 §3.1): continuação começa com
 * espaço. Descrições longas sem dobra quebram em alguns leitores (Outlook).
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let atual = "";
  let tamanho = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    const limite = parts.length === 0 ? 75 : 74; // a continuação já gasta 1 octeto no espaço
    if (tamanho + n > limite) {
      parts.push(atual);
      atual = "";
      tamanho = 0;
    }
    atual += ch;
    tamanho += n;
  }
  parts.push(atual);
  return parts.join("\r\n ");
}

/** Conteúdo de um arquivo .ics com o evento (Apple Calendar, Outlook…). */
export function buildIcsContent(ev: CalendarEventInput, uid?: string): string {
  const { start, end } = eventRange(ev);
  const lembretes = [...new Set(ev.lembretesMinutos ?? [])].filter((m) => m > 0);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Seu Metro Quadrado//CRM//PT-BR",
    "BEGIN:VEVENT",
    `UID:${uid ?? `${start.getTime()}-${Math.abs(hashCode(ev.titulo))}@seumetroquadrado`}`,
    `DTSTAMP:${toCalendarUtc(new Date())}`,
    `DTSTART:${toCalendarUtc(start)}`,
    `DTEND:${toCalendarUtc(end)}`,
    `SUMMARY:${icsEscape(ev.titulo)}`,
    ...(ev.descricao ? [`DESCRIPTION:${icsEscape(ev.descricao)}`] : []),
    ...(ev.local ? [`LOCATION:${icsEscape(ev.local)}`] : []),
    ...lembretes.sort((a, b) => b - a).flatMap((m) => valarm(m, ev.titulo)),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n");
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Dispara o download do .ics no browser. */
export function downloadIcs(ev: CalendarEventInput, uid?: string): void {
  const blob = new Blob([buildIcsContent(ev, uid)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.titulo.replace(/[^\w\d à-ú-]+/gi, "").trim() || "evento"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
