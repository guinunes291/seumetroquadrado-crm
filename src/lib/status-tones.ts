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

/** Bolinha de prioridade/tier. */
export const INTENT_DOT: Record<Intent, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-slate-400",
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
  blue: "bg-blue-500/15 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  amber: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  yellow: "bg-yellow-500/15 text-yellow-700 dark:bg-yellow-400/15 dark:text-yellow-300",
  violet: "bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  cyan: "bg-cyan-500/15 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  indigo: "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  teal: "bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
  orange: "bg-orange-500/15 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  green: "bg-green-600/20 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  lime: "bg-lime-500/15 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300",
  rose: "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  slate: "bg-slate-500/15 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
};

/** Coluna do kanban: fundo 10% + borda 30%. Derivado do MESMO hue do badge. */
export const HUE_COLUMN: Record<Hue, string> = {
  blue: "bg-blue-500/10 border-blue-500/30",
  amber: "bg-amber-500/10 border-amber-500/30",
  yellow: "bg-yellow-500/10 border-yellow-500/30",
  violet: "bg-violet-500/10 border-violet-500/30",
  cyan: "bg-cyan-500/10 border-cyan-500/30",
  indigo: "bg-indigo-500/10 border-indigo-500/30",
  emerald: "bg-emerald-500/10 border-emerald-500/30",
  teal: "bg-teal-500/10 border-teal-500/30",
  orange: "bg-orange-500/10 border-orange-500/30",
  green: "bg-green-600/15 border-green-600/40",
  lime: "bg-lime-500/10 border-lime-500/30",
  rose: "bg-rose-500/10 border-rose-500/30",
  slate: "bg-slate-500/10 border-slate-500/30",
};

/** Bolinha/dot por hue (legenda de calendário, timeline). */
export const HUE_DOT: Record<Hue, string> = {
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  orange: "bg-orange-500",
  green: "bg-green-600",
  lime: "bg-lime-500",
  rose: "bg-rose-500",
  slate: "bg-slate-400",
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
