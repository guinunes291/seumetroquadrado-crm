import { describe, expect, it } from "vitest";
import { getShortcutGroups, isTypingTarget, registerShortcut } from "@/lib/shortcuts";

describe("registry de atalhos", () => {
  it("expõe os atalhos globais padrão (⌘K, ⌘J, ?, [)", () => {
    const globalGroup = getShortcutGroups().find((g) => g.group === "Global");
    const keys = globalGroup?.items.map((s) => s.keys) ?? [];
    expect(keys).toContain("⌘K");
    expect(keys).toContain("⌘J");
    expect(keys).toContain("?");
    expect(keys).toContain("[");
  });

  it("registerShortcut é idempotente (remount não duplica)", () => {
    registerShortcut({ keys: "F", description: "Modo foco", group: "Leads" });
    registerShortcut({ keys: "F", description: "Modo foco", group: "Leads" });
    const leads = getShortcutGroups().find((g) => g.group === "Leads");
    expect(leads?.items.filter((s) => s.keys === "F")).toHaveLength(1);
  });

  it("ordena os grupos (Global antes dos contextuais)", () => {
    const groups = getShortcutGroups().map((g) => g.group);
    expect(groups[0]).toBe("Global");
  });
});

describe("isTypingTarget", () => {
  it("bloqueia atalhos de tecla única enquanto o usuário digita", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const div = document.createElement("div");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("cobre contenteditable", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
    // jsdom não calcula isContentEditable sem layout — o fallback via closest cobre.
    expect(isTypingTarget(editable)).toBe(true);
    editable.remove();
  });
});
