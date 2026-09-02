import { describe, it, expect } from "vitest";
import { saneiaLocal, saneiaMetragem } from "@/lib/projetos-saneamento";

// Casos reais da base (MCP do CRM, 02/09/2026) — ver docs/revisao-projetos-foco.md §2.
describe("saneiaMetragem", () => {
  it("divide por 10 a vírgula perdida do tabelão (studio de R$ 175 mil com 240 m²)", () => {
    expect(saneiaMetragem(240, 240, 175_560)).toEqual({
      metragem_min: 24,
      metragem_max: 24,
      corrigida: true,
    });
    expect(saneiaMetragem(170, 670, 211_954)).toEqual({
      metragem_min: 17,
      metragem_max: 67,
      corrigida: true,
    });
  });

  it("corrige também sem preço — Cury e Mundo Apto chegam sem valor", () => {
    expect(saneiaMetragem(380, 380, null)).toEqual({
      metragem_min: 38,
      metragem_max: 38,
      corrigida: true,
    });
  });

  it("corrige só o lado suspeito quando a faixa veio mista", () => {
    expect(saneiaMetragem(45, 680, 300_000)).toEqual({
      metragem_min: 45,
      metragem_max: 68,
      corrigida: true,
    });
  });

  it("não mexe em produto acima de R$ 600 mil — lá 160 m² é apartamento de verdade", () => {
    expect(saneiaMetragem(160, 220, 1_200_000)).toEqual({
      metragem_min: 160,
      metragem_max: 220,
      corrigida: false,
    });
  });

  it("não mexe quando o resultado não é plausível (10.000 m² é lote, não vírgula)", () => {
    expect(saneiaMetragem(10_000, 10_000, 296_500)).toEqual({
      metragem_min: 10_000,
      metragem_max: 10_000,
      corrigida: false,
    });
  });

  it("não inverte a faixa: se dividir deixa mín > máx, a hipótese estava errada", () => {
    // 160 → 16 ficaria acima do máximo de 14 m²: o dado original é que está estranho.
    expect(saneiaMetragem(160, 14, 200_000)).toEqual({
      metragem_min: 160,
      metragem_max: 14,
      corrigida: false,
    });
  });

  it("é idempotente: o valor já corrigido passa intacto", () => {
    const primeira = saneiaMetragem(240, 370, 196_900);
    const segunda = saneiaMetragem(primeira.metragem_min, primeira.metragem_max, 196_900);
    expect(segunda).toEqual({ metragem_min: 24, metragem_max: 37, corrigida: false });
  });

  it("preserva uma casa decimal e trata nulos", () => {
    expect(saneiaMetragem(245, null, null)).toEqual({
      metragem_min: 24.5,
      metragem_max: null,
      corrigida: true,
    });
    expect(saneiaMetragem(null, null, null)).toEqual({
      metragem_min: null,
      metragem_max: null,
      corrigida: false,
    });
  });
});

describe("saneiaLocal", () => {
  it("separa a cidade colada no bairro com hífen", () => {
    expect(saneiaLocal("Vila das Belezas - Sao Paulo", null)).toEqual({
      bairro: "Vila das Belezas",
      cidade: "São Paulo",
    });
    expect(saneiaLocal("Jardim Angela - SP", null)).toEqual({
      bairro: "Jardim Angela",
      cidade: "São Paulo",
    });
  });

  it("extrai o município entre parênteses", () => {
    expect(saneiaLocal("Ponte Grande (Guarulhos)", null)).toEqual({
      bairro: "Ponte Grande",
      cidade: "Guarulhos",
    });
  });

  it("a cidade informada na coluna própria vence o sufixo", () => {
    expect(saneiaLocal("Centro - Guarulhos", "Guarulhos")).toEqual({
      bairro: "Centro",
      cidade: "Guarulhos",
    });
  });

  it("só a cidade no lugar do bairro vira bairro vazio (Vivaz vem assim)", () => {
    expect(saneiaLocal("Sao Paulo", null)).toEqual({ bairro: null, cidade: "São Paulo" });
  });

  it("normaliza a grafia da capital e limpa espaços", () => {
    expect(saneiaLocal("  Mooca  ", "sao paulo")).toEqual({ bairro: "Mooca", cidade: "São Paulo" });
    expect(saneiaLocal(null, "")).toEqual({ bairro: null, cidade: null });
  });

  it("não quebra bairro composto quando o sufixo não é cidade conhecida", () => {
    expect(saneiaLocal("Lapa/Perdizes", "São Paulo")).toEqual({
      bairro: "Lapa/Perdizes",
      cidade: "São Paulo",
    });
    expect(saneiaLocal("Vila Mariana (próx. metrô)", null)).toEqual({
      bairro: "Vila Mariana (próx. metrô)",
      cidade: null,
    });
  });
});
