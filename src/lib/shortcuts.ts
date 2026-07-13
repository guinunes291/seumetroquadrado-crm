// Registry central de atalhos de teclado — alimenta o overlay "?" e serve de
// documentação viva. Puro e testável; os handlers vivem nos componentes.

export type ShortcutGroup = "Global" | "Leads" | "Modo Foco";

export type ShortcutDef = {
  /** Notação exibida, ex.: "⌘K", "?", "J / K". */
  keys: string;
  description: string;
  group: ShortcutGroup;
};

const GROUP_ORDER: ShortcutGroup[] = ["Global", "Leads", "Modo Foco"];

const registry: ShortcutDef[] = [
  { keys: "⌘K", description: "Busca global e ações", group: "Global" },
  { keys: "⌘J", description: "Abrir SamiQ (copiloto)", group: "Global" },
  { keys: "?", description: "Este painel de atalhos", group: "Global" },
  { keys: "[", description: "Recolher/expandir a barra lateral", group: "Global" },
];

/** Registra um atalho (idempotente por keys+group — remount não duplica). */
export function registerShortcut(def: ShortcutDef): void {
  const exists = registry.some((s) => s.keys === def.keys && s.group === def.group);
  if (!exists) registry.push(def);
}

/** Grupos ordenados para o overlay de ajuda. */
export function getShortcutGroups(): { group: ShortcutGroup; items: ShortcutDef[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: registry.filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);
}

/**
 * `true` quando o evento aconteceu digitando em campo de texto — atalhos de
 * tecla única (?, [, J/K) NUNCA podem disparar nesse contexto.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') != null
  );
}
