import { describe, it, expect } from "vitest";
import { cn, formatDuracaoParado } from "@/lib/utils";

describe("cn (class merger)", () => {
  it("mescla classes simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("ignora falsy", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("resolve conflitos do tailwind", () => {
    // tailwind-merge: a última prevalece
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("formatDuracaoParado (SLA acumulado dd:hh:mm)", () => {
  it("retorna — para zero, negativo ou inválido", () => {
    expect(formatDuracaoParado(0)).toBe("—");
    expect(formatDuracaoParado(-5)).toBe("—");
    expect(formatDuracaoParado(null)).toBe("—");
    expect(formatDuracaoParado(undefined)).toBe("—");
    expect(formatDuracaoParado(NaN)).toBe("—");
  });
  it("abaixo de 1h mostra minutos", () => {
    expect(formatDuracaoParado(45)).toBe("45min");
    expect(formatDuracaoParado(1)).toBe("1min");
  });
  it("entre 1h e 1 dia mostra horas e minutos", () => {
    expect(formatDuracaoParado(60)).toBe("1h00");
    expect(formatDuracaoParado(90)).toBe("1h30");
    expect(formatDuracaoParado(150)).toBe("2h30");
  });
  it("a partir de 1 dia mostra dd hh mm", () => {
    expect(formatDuracaoParado(1440)).toBe("1d 00h00");
    // 167797 min ≈ 116 dias (o caso real que aparecia como "167797 min")
    expect(formatDuracaoParado(167797)).toBe("116d 12h37");
  });
  it("ignora frações de minuto", () => {
    expect(formatDuracaoParado(90.9)).toBe("1h30");
  });
});
