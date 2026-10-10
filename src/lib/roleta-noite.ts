// Roleta fechada à noite (migration 20261014120000): das 22h às 9h (horário
// de Brasília) nenhum lead é sorteado — o que chega espera a reabertura. A
// regra mora no banco (`_roleta_fechada_agora`); aqui ficam só a leitura do
// que o banco devolve e os textos das telas e do webhook.

/** O que `roleta_janela_v1()` devolve. */
export type JanelaNoite = {
  ativa: boolean;
  inicio: string; // "22:00"
  fim: string; // "09:00"
  fechada: boolean;
  reabre_em: string | null; // ISO
  fecha_em: string | null; // ISO
};

/**
 * Lê o jsonb de `roleta_janela_v1()` sem confiar no formato: campo ausente ou
 * de outro tipo vira o padrão seguro (fechada = false — a tela só avisa quando
 * o banco disse que fechou).
 */
export function lerJanela(data: unknown): JanelaNoite | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const texto = (v: unknown, padrao: string) => (typeof v === "string" ? v : padrao);
  const isoOuNulo = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    ativa: d.ativa === true,
    inicio: texto(d.inicio, "22:00"),
    fim: texto(d.fim, "09:00"),
    fechada: d.fechada === true,
    reabre_em: isoOuNulo(d.reabre_em),
    fecha_em: isoOuNulo(d.fecha_em),
  };
}

/** Mesmo motivo que o motor devolve com `adiado: true`. */
export const MOTIVO_ROLETA_FECHADA = "roleta_fechada_noite";

/**
 * Resultado de uma RPC de distribuição (motor, roleta ponderada, repasse) que
 * esperou a reabertura. `null` = não é o caso da roleta fechada.
 */
export function lerAdiadoNoite(res: unknown): { reabreAs: string | null } | null {
  if (!res || typeof res !== "object") return null;
  const r = res as { adiado?: unknown; motivo?: unknown; reabre_as?: unknown };
  if (r.motivo !== MOTIVO_ROLETA_FECHADA) return null;
  return { reabreAs: typeof r.reabre_as === "string" ? r.reabre_as : null };
}

/** "09:00" → "9h"; "09:30" → "9h30". */
export function horaCurta(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return "9h";
  const h = String(Number(m[1]));
  return m[2] === "00" ? `${h}h` : `${h}h${m[2]}`;
}

function diaBrt(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "hoje às 9h" ou "amanhã às 9h", pelo relógio de Brasília. */
export function quandoReabre(reabreEm: string | null, agora: Date = new Date()): string {
  if (!reabreEm) return "às 9h";
  const alvo = new Date(reabreEm);
  if (Number.isNaN(alvo.getTime())) return "às 9h";
  const hora = horaCurta(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(alvo),
  );
  return diaBrt(alvo) === diaBrt(agora) ? `hoje às ${hora}` : `amanhã às ${hora}`;
}

/** Linha curta para as telas: "A roleta fecha às 22h e reabre às 9h." */
export function textoJanela(j: Pick<JanelaNoite, "inicio" | "fim">): string {
  return `A roleta fecha às ${horaCurta(j.inicio)} e reabre às ${horaCurta(j.fim)}.`;
}

/** Nota interna no lead que chegou com a roleta fechada (webhook). */
export function notaLeadNoite(opts: {
  reabreAs: string | null;
  chegouEm: Date;
  viaMarquinhos: boolean;
}): string {
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(opts.chegouEm);
  const reabre = horaCurta(opts.reabreAs);
  return [
    `Chegou às ${hora}, com a roleta fechada (à noite nenhum lead é sorteado).`,
    `Entra na roleta às ${reabre}, para quem estiver com check-in.`,
    opts.viaMarquinhos
      ? `O Marquinhos avisou o cliente que um consultor chama a partir das ${reabre}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}
