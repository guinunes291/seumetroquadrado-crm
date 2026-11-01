/** Server-derived authorization; caller text/context never grants director scope. */
export const MARQUINHOS_ADMIN_ID = "07699874-e860-47f1-971b-a6bf3f71ae6f";
export type CanalMemoriaSami = "painel" | "whatsapp" | "marquinhos";

export function podeUsarMarquinhos(userId: string, admin: boolean): boolean {
  return userId === MARQUINHOS_ADMIN_ID && admin;
}

/** Scope every lead read/write in the channel session, including by-id resolution. */
export function urlComEscopoSami(url: string, userId: string, canal?: CanalMemoriaSami): string {
  if (!canal) return url;
  const scoped = new URL(url);
  if (!scoped.pathname.endsWith("/rest/v1/leads")) return url;
  scoped.searchParams.append("deleted_at", "is.null");
  scoped.searchParams.append("na_lixeira", "eq.false");
  if (canal === "whatsapp") scoped.searchParams.append("corretor_id", `eq.${userId}`);
  return scoped.toString();
}

export function autoriaSami(canal?: CanalMemoriaSami): string {
  return canal === "marquinhos" ? "Marquinhos (Mark)" : "Sami";
}

export function autoriaDoHistorico(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as { origem?: unknown; via?: unknown; canal?: unknown };
  if (m.origem === "marquinhos" || m.via === "marquinhos" || m.canal === "marquinhos") return "Marquinhos (Mark)";
  return m.origem === "samiq" || m.via === "samiq" ? "Sami" : null;
}

export function confirmarExplicitoMarquinhos(texto: string): boolean {
  return /^confirma(r)?\b/i.test(texto.trim());
}

/** A recorded action is never an implicit cancellation target in this channel. */
export function desfazerExplicitoMarquinhos(texto: string): boolean {
  return /^desfazer\b/i.test(texto.trim());
}

export function selecionarLeadMarquinhos<T extends { id: string; nome: string | null; status: string }>(
  candidatos: readonly T[], nome: string, status: string,
): T | null {
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  const encontrados = candidatos.filter((c) => normalizar(c.nome ?? "") === normalizar(nome) && c.status === status);
  return encontrados.length === 1 ? encontrados[0] ?? null : null;
}

export function propostaDaConversa<T extends { id: string }>(
  propostas: T[], idsDaConversa: ReadonlySet<string>,
): T[] {
  return propostas.filter((p) => idsDaConversa.has(p.id));
}