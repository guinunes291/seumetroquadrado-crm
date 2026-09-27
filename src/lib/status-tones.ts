// Fonte única de cores de status do CRM.
//
// Dois vocabulários:
//  - `Intent`: significado semântico (sucesso/alerta/perigo/info/neutro), mapeado
//    para os tokens --success/--warning/--destructive/--info do design system.
//    Use para SLA, tarefas, prioridade, temperatura e qualquer "verde=ok".
//  - `Hue`: cor nominal para diferenciar categorias sem juízo de valor (as 12
//    etapas do funil, tipos de interação). Cada hue gera as variantes badge/
//    column/dot num formato único, eliminando os mapas paralelos que existiam
//    em lib/leads.ts, leads-kanban-board.tsx, lib/interacoes.ts etc.
//
// As classes precisam ser literais para o Tailwind enxergá-las no build.

export type Intent = "success" | "warning" | "danger" | "info" | "neutral";

/** Badge preenchido suave: fundo 15% + texto na cor cheia. */
export const INTENT_BADGE: Record<Intent, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
  neutral: "bg-muted text-muted-foreground",
};

/** Badge suave com borda (variant="outline"), usado por SLA e chips. */
export const INTENT_BADGE_BORDERED: Record<Intent, string> = {
  success: "bg-success/15 text-success border-success/40",
  warning: "bg-warning/15 text-warning border-warning/40",
  danger: "bg-destructive/15 text-destructive border-destructive/40",
  info: "bg-info/15 text-info border-info/40",
  neutral: "bg-muted text-muted-foreground border-border",
};

/** Somente contorno + texto (padrão das tarefas). */
export const INTENT_OUTLINE: Record<Intent, string> = {
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-destructive text-destructive",
  info: "border-info text-info",
  neutral: "border-muted text-muted-foreground",
};

/** Só o texto/stroke na cor do intent (score-ring, ícones, números). */
export const INTENT_TEXT: Record<Intent, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  neutral: "text-muted-foreground",
};

/** Bolinha de prioridade/tier. */
export const INTENT_DOT: Record<Intent, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-ardosia-400",
};

// ---------------------------------------------------------------------------
// Hues nominais (categorias sem juízo de valor)
// ---------------------------------------------------------------------------

export type Hue =
  | "blue"
  | "amber"
  | "yellow"
  | "violet"
  | "cyan"
  | "indigo"
  | "emerald"
  | "teal"
  | "orange"
  | "green"
  | "lime"
  | "rose"
  | "slate";

/** Badge: fundo 15% + texto 700 (300 no dark, para contraste sobre navy). */
export const HUE_BADGE: Record<Hue, string> = {
  blue: "bg-azul-500/15 text-azul-700 dark:bg-azul-400/15 dark:text-azul-300",
  amber: "bg-aviso-500/15 text-aviso-700 dark:bg-aviso-400/15 dark:text-aviso-300",
  yellow: "bg-amarelo-500/15 text-amarelo-700 dark:bg-amarelo-400/15 dark:text-amarelo-300",
  violet: "bg-violeta-500/15 text-violeta-700 dark:bg-violeta-400/15 dark:text-violeta-300",
  cyan: "bg-ciano-500/15 text-ciano-700 dark:bg-ciano-400/15 dark:text-ciano-300",
  indigo: "bg-anil-500/15 text-anil-700 dark:bg-anil-400/15 dark:text-anil-300",
  emerald: "bg-exito-500/15 text-exito-700 dark:bg-exito-400/15 dark:text-exito-300",
  teal: "bg-petroleo-500/15 text-petroleo-700 dark:bg-petroleo-400/15 dark:text-petroleo-300",
  orange: "bg-laranja-500/15 text-laranja-700 dark:bg-laranja-400/15 dark:text-laranja-300",
  green: "bg-verde-600/20 text-verde-800 dark:bg-verde-500/20 dark:text-verde-300",
  lime: "bg-lima-500/15 text-lima-700 dark:bg-lima-400/15 dark:text-lima-300",
  rose: "bg-perigo-500/15 text-perigo-700 dark:bg-perigo-400/15 dark:text-perigo-300",
  slate: "bg-ardosia-500/15 text-ardosia-700 dark:bg-ardosia-400/15 dark:text-ardosia-300",
};

/** Coluna do kanban: só o fio de 2px no topo leva a cor da etapa (identidade
 *  v3) — a coluna é superfície neutra com hairline. Derivado do MESMO hue do
 *  badge; a coluna aplica `border-t-2` e este mapa dá a cor do fio. */
export const HUE_COLUMN: Record<Hue, string> = {
  blue: "border-t-blue-500",
  amber: "border-t-amber-500",
  yellow: "border-t-yellow-500",
  violet: "border-t-violet-500",
  cyan: "border-t-cyan-500",
  indigo: "border-t-indigo-500",
  emerald: "border-t-emerald-500",
  teal: "border-t-teal-500",
  orange: "border-t-orange-500",
  green: "border-t-green-600",
  lime: "border-t-lime-500",
  rose: "border-t-rose-500",
  slate: "border-t-slate-400",
};

/** Bolinha/dot por hue (legenda de calendário, timeline). */
export const HUE_DOT: Record<Hue, string> = {
  blue: "bg-azul-500",
  amber: "bg-aviso-500",
  yellow: "bg-amarelo-500",
  violet: "bg-violeta-500",
  cyan: "bg-ciano-500",
  indigo: "bg-anil-500",
  emerald: "bg-exito-500",
  teal: "bg-petroleo-500",
  orange: "bg-laranja-500",
  green: "bg-verde-600",
  lime: "bg-lima-500",
  rose: "bg-perigo-500",
  slate: "bg-ardosia-400",
};

// ---------------------------------------------------------------------------
// Temperatura do lead (semântica compartilhada entre kanban, lista e blitz)
// ---------------------------------------------------------------------------

export type Temperatura = "quente" | "morno" | "frio";

export const TEMPERATURA_INTENT: Record<Temperatura, Intent> = {
  quente: "danger",
  morno: "warning",
  frio: "info",
};

export const TEMPERATURA_LABEL: Record<Temperatura, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

export function temperaturaBadgeClass(temp: string | null | undefined): string {
  const intent = TEMPERATURA_INTENT[(temp ?? "") as Temperatura];
  return intent ? INTENT_BADGE[intent] : INTENT_BADGE.neutral;
}
