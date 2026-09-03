// Tema da Central de Comando SMQ. Função PURA e testável; o hook use-theme e o
// script anti-FOUC do __root.tsx derivam daqui. O padrão do produto é o CLARO
// ("Clareza", identidade v3) — o escuro ("Modo Comando") é opt-in, persistido
// por dispositivo.

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "smq-theme";
export const DEFAULT_THEME_PREF: ThemePref = "light";

/** Cor do chrome do navegador (meta theme-color) por tema resolvido. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0c111d",
  light: "#f5f7f9",
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
  light: "Clareza (claro)",
  dark: "Modo Comando (escuro)",
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
 * para não piscar escuro→claro (FOUC). Precisa ser framework-free, idempotente
 * e espelhar resolveTheme: claro é o padrão na ausência de preferência salva —
 * .dark só entra com "dark" explícito ou "system" + SO escuro (e nunca no catch).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var dark=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark)}catch(e){document.documentElement.classList.remove("dark")}})()`;
