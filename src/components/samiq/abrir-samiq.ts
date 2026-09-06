// Como qualquer tela abre a Sami com contexto (Onda S3, decisão D19 — chips
// contextuais): um CustomEvent "open-samiq" com o cliente em foco e,
// opcionalmente, um texto já digitado (ex.: "Liguei para a Maria agora: ").
// O launcher escuta, abre o painel e passa o detalhe como `seed`.
//
// O evento sem detalhe continua valendo (FAB, ⌘J, BottomNav).

export const SAMIQ_ABRIR_EVENTO = "open-samiq";

export type SamiQAbrirDetail = {
  leadId?: string;
  leadNome?: string;
  /** Texto pré-digitado no campo (o corretor completa e envia). */
  texto?: string;
  /** true = envia o texto imediatamente como pergunta livre. */
  autoEnviar?: boolean;
  /** De onde veio (telemetria de UI, opcional): "atender", "dossie", "pos-chamada"... */
  origem?: string;
};

export function abrirSamiQ(detail: SamiQAbrirDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SamiQAbrirDetail>(SAMIQ_ABRIR_EVENTO, { detail }));
}

/** Lê o detalhe do evento com tolerância (o evento legado não traz detalhe). */
export function lerDetalheAbrirSamiQ(event: Event): SamiQAbrirDetail {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object") return {};
  const d = detail as Record<string, unknown>;
  const out: SamiQAbrirDetail = {};
  if (typeof d.leadId === "string" && /^[0-9a-f-]{36}$/i.test(d.leadId)) out.leadId = d.leadId;
  if (typeof d.leadNome === "string" && d.leadNome.trim())
    out.leadNome = d.leadNome.trim().slice(0, 120);
  if (typeof d.texto === "string" && d.texto.trim()) out.texto = d.texto.slice(0, 500);
  if (d.autoEnviar === true) out.autoEnviar = true;
  if (typeof d.origem === "string") out.origem = d.origem.slice(0, 40);
  return out;
}

/** Texto padrão do chip "Registrar com a Sami" (o corretor completa a frase). */
export function textoRegistrarComSami(
  leadNome: string | null | undefined,
  canal?: "ligacao",
): string {
  const nome = leadNome?.trim().split(/\s+/)[0] || "o cliente";
  return canal === "ligacao" ? `Liguei para ${nome} agora: ` : `Falei com ${nome}: `;
}
