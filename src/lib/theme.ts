// Tema da Central de Comando SMQ. Função PURA e testável; o hook use-theme e o
// script anti-FOUC do __root.tsx derivam daqui. O padrão do produto é o escuro
// ("Modo Comando") — o claro ("Clareza") é opt-in, persistido por dispositivo.

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "smq-theme";
export const DEFAULT_THEME_PREF: ThemePref = "dark";

/** Cor do chrome do navegador (meta theme-color) por tema resolvido. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0c111d",
  light: "#fdfdfe",
};

/** Normaliza o valor cru do localStorage (ou qualquer entrada) para uma preferência válida. */
export function parseThemePref(raw: string | null | undefined): ThemePref {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_THEME_PREF;
}

/** Resolve a preferência para o tema efetivo. `system` segue o SO; o resto é literal. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

export const THEME_PREF_LABEL: Record<ThemePref, string> = {
  dark: "Modo Comando (escuro)",
  light: "Clareza (claro)",
  system: "Seguir o sistema",
};

/** Aplica o tema no documento: classe `.dark` + meta theme-color. Só roda no browser. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[resolved];
}

/**
 * Script inline injetado no <head> pelo __root.tsx ANTES do primeiro paint,
 * para não piscar claro→escuro (FOUC). Precisa ser framework-free, idempotente
 * e espelhar resolveTheme: dark é o padrão na ausência de preferência salva.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var light=t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches);if(!light)document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}})()`;
