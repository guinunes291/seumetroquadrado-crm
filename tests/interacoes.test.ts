import { describe, it, expect } from "vitest";
import {
  describeInteracao,
  formatRelativeTime,
  isContactInteraction,
  INTERACAO_LABEL,
} from "@/lib/interacoes";

describe("interacoes helpers", () => {
  it("rotula tipos conhecidos", () => {
    expect(INTERACAO_LABEL.ligacao).toBe("Ligação");
    expect(INTERACAO_LABEL.whatsapp).toBe("WhatsApp");
    expect(INTERACAO_LABEL.mudanca_status).toBe("Mudança de status");
  });

  it("classifica interações de contato", () => {
    expect(isContactInteraction("ligacao")).toBe(true);
    expect(isContactInteraction("whatsapp")).toBe(true);
    expect(isContactInteraction("nota")).toBe(false);
    expect(isContactInteraction("mudanca_status")).toBe(false);
  });

  it("descreve interação considerando direção", () => {
    expect(describeInteracao("ligacao", "entrada")).toBe("Ligação recebida");
    expect(describeInteracao("ligacao", "saida")).toBe("Ligação enviada");
    expect(describeInteracao("nota", "interna")).toBe("Anotação");
    expect(describeInteracao("mudanca_status", "interna")).toBe("Mudança de status");
  });

  it("formata tempo relativo", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(formatRelativeTime("2026-06-15T11:59:30Z", now)).toBe("agora mesmo");
    expect(formatRelativeTime("2026-06-15T11:30:00Z", now)).toBe("há 30 min");
    expect(formatRelativeTime("2026-06-15T09:00:00Z", now)).toBe("há 3 h");
    expect(formatRelativeTime("2026-06-10T12:00:00Z", now)).toBe("há 5 d");
    expect(formatRelativeTime("2026-04-15T12:00:00Z", now)).toBe("há 2 meses");
    expect(formatRelativeTime("2024-06-15T12:00:00Z", now)).toBe("há 2 anos");
  });
});
