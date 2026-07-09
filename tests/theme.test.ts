import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_PREF,
  parseThemePref,
  resolveTheme,
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

describe("parseThemePref", () => {
  it("aceita os três valores válidos", () => {
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("system")).toBe("system");
  });

  it("cai no padrão (dark) para qualquer outra entrada", () => {
    expect(DEFAULT_THEME_PREF).toBe("dark");
    expect(parseThemePref(null)).toBe("dark");
    expect(parseThemePref(undefined)).toBe("dark");
    expect(parseThemePref("")).toBe("dark");
    expect(parseThemePref("blue")).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("preferência explícita ignora o sistema", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("system segue o sistema operacional", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("THEME_INIT_SCRIPT (anti-FOUC)", () => {
  it("usa a mesma chave de storage do resto do app", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it("espelha o padrão dark: só deixa de aplicar .dark quando o usuário pediu claro", () => {
    // dark é aplicado exceto em light explícito / system+SO claro — inclusive no catch.
    expect(THEME_INIT_SCRIPT).toContain('t==="light"');
    expect(THEME_INIT_SCRIPT).toContain('t==="system"');
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme: light");
    expect(THEME_INIT_SCRIPT).toContain('catch(e){document.documentElement.classList.add("dark")');
  });

  it("é framework-free (sem import/require)", () => {
    expect(THEME_INIT_SCRIPT).not.toMatch(/\b(import|require)\b/);
  });
});

describe("THEME_COLORS", () => {
  it("tem um hex válido por tema", () => {
    expect(THEME_COLORS.dark).toMatch(/^#[0-9a-f]{6}$/);
    expect(THEME_COLORS.light).toMatch(/^#[0-9a-f]{6}$/);
  });
});
