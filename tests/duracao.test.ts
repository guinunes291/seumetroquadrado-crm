import { describe, it, expect } from "vitest";
import { formatDuration, formatDurationHoras } from "@/lib/duracao";

describe("formatDuration (hh:mm)", () => {
  it("nulo/indefinido/dado sujo vira — (pendente, nunca 00:00)", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(NaN)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(-90)).toBe("—");
  });

  it("abaixo de 1h", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(1)).toBe("00:01");
    expect(formatDuration(42)).toBe("00:42");
    expect(formatDuration(59)).toBe("00:59");
  });

  it("1h a 23h59", () => {
    expect(formatDuration(60)).toBe("01:00");
    expect(formatDuration(61)).toBe("01:01");
    expect(formatDuration(90)).toBe("01:30");
    expect(formatDuration(155)).toBe("02:35");
    expect(formatDuration(1439)).toBe("23:59");
  });

  it("24h ou mais: dias + hh:mm (padrão)", () => {
    expect(formatDuration(1440)).toBe("1d 00:00");
    expect(formatDuration(1441)).toBe("1d 00:01");
    expect(formatDuration(3075)).toBe("2d 03:15");
    // caso real que aparecia como "167797 min" na tela de leads parados
    expect(formatDuration(167797)).toBe("116d 12:37");
  });

  it("24h ou mais: modo acumulado (hh:mm corrido)", () => {
    expect(formatDuration(1440, { acimaDe24h: "acumulado" })).toBe("24:00");
    expect(formatDuration(1575, { acimaDe24h: "acumulado" })).toBe("26:15");
    expect(formatDuration(3075, { acimaDe24h: "acumulado" })).toBe("51:15");
  });

  it("arredonda ao minuto mais próximo só na exibição", () => {
    expect(formatDuration(90.6)).toBe("01:31");
    expect(formatDuration(90.4)).toBe("01:30");
    // arredonda ANTES de classificar a faixa (23h59.6min é um dia)
    expect(formatDuration(1439.6)).toBe("1d 00:00");
  });
});

describe("formatDurationHoras (horas decimais das MVs)", () => {
  it("converte horas para hh:mm", () => {
    expect(formatDurationHoras(0.5)).toBe("00:30");
    expect(formatDurationHoras(1.5)).toBe("01:30");
    expect(formatDurationHoras(26.25)).toBe("1d 02:15");
  });

  it("nulo/negativo vira —", () => {
    expect(formatDurationHoras(null)).toBe("—");
    expect(formatDurationHoras(undefined)).toBe("—");
    expect(formatDurationHoras(-2)).toBe("—");
  });
});
