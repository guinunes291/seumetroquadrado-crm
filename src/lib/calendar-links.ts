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
};

const HOUR_MS = 3_600_000;

function toDate(v: string | Date): Date {
  return typeof v === "string" ? new Date(v) : v;
}

/** Formata para o padrão de data do Google/ICS em UTC: YYYYMMDDTHHmmssZ. */
function toCalendarUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
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
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Conteúdo de um arquivo .ics com o evento (Apple Calendar, Outlook…). */
export function buildIcsContent(ev: CalendarEventInput, uid?: string): string {
  const { start, end } = eventRange(ev);
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
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
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
