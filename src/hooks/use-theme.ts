// Hook de tema — store de módulo + useSyncExternalStore (sem provider).
// O estado inicial do documento já foi aplicado pelo THEME_INIT_SCRIPT no
// <head>; aqui cuidamos das mudanças em runtime (toggle e prefers-color-scheme).

import { useSyncExternalStore, useCallback } from "react";
import {
  applyTheme,
  parseThemePref,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePref,
} from "@/lib/theme";
import { trocarTemaComCirculo, type OrigemTema } from "@/lib/theme-transition";

type Listener = () => void;
type Snapshot = `${ThemePref}:${ResolvedTheme}`;

const listeners = new Set<Listener>();
let snapshot: Snapshot | null = null;
// Fallback em memória para quando o localStorage está indisponível (modo privado).
let memoryPref: ThemePref | null = null;

function systemDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function computeSnapshot(): Snapshot {
  let raw: string | null = memoryPref;
  if (raw === null) {
    try {
      raw = typeof localStorage === "undefined" ? null : localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* storage indisponível — cai no padrão */
    }
  }
  const pref = parseThemePref(raw);
  return `${pref}:${resolveTheme(pref, systemDark())}`;
}

function getSnapshot(): Snapshot {
  if (snapshot === null) snapshot = computeSnapshot();
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return "light:light";
}

function refresh() {
  snapshot = computeSnapshot();
  applyTheme(snapshot.endsWith(":dark") ? "dark" : "light");
  listeners.forEach((l) => l());
}

// Segue mudanças do SO enquanto a preferência for "system".
if (typeof matchMedia !== "undefined") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getSnapshot().startsWith("system:")) refresh();
  });
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  /** `origem` (ponto do clique) liga a troca em círculo; sem ela, nasce do centro. */
  setPref: (pref: ThemePref, origem?: OrigemTema) => void;
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [pref, resolved] = snap.split(":") as [ThemePref, ResolvedTheme];
  const setPref = useCallback((p: ThemePref, origem?: OrigemTema) => {
    const aplicar = () => {
      memoryPref = p;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, p);
      } catch {
        /* modo privado: o tema vale só para a sessão atual (memoryPref) */
      }
      refresh();
    };
    // Só anima quando a tela muda de fato (ex.: "Seguir o sistema" estando já
    // no mesmo tema do SO troca a preferência sem trocar a cor).
    const atual = getSnapshot().endsWith(":dark") ? "dark" : "light";
    if (resolveTheme(p, systemDark()) === atual) aplicar();
    else trocarTemaComCirculo(aplicar, origem);
  }, []);
  return { pref, resolved, setPref };
}
