// Sami v8: tabela de preços desatualizada a partir do dia 5 do mês
// (regra do Guilherme, 24/10/2026), no calendário de São Paulo.
import { describe, expect, it } from "vitest";
import { SAMIQ_DIA_CORTE_TABELA, avisoTabelaSamiQ, situacaoTabelaSamiQ } from "@/lib/samiq-tabela";
import { modelarMaterialProjeto, type MaterialProjetoRow } from "@/lib/samiq-tools";

// Instantes em UTC; São Paulo é UTC-3.
const SP = (iso: string) => new Date(`${iso}-03:00`);

describe("situacaoTabelaSamiQ", () => {
  it("o corte é o dia 5", () => {
    expect(SAMIQ_DIA_CORTE_TABELA).toBe(5);
  });

  it("tabela do mês está em dia (com a data no formato do corretor)", () => {
    expect(situacaoTabelaSamiQ("2026-10-12T15:02:11.123456+00:00", SP("2026-10-24T10:00"))).toEqual(
      {
        estado: "em_dia",
        data: "12/10/2026",
      },
    );
  });

  it("do dia 5 em diante, tabela do mês anterior está desatualizada", () => {
    expect(situacaoTabelaSamiQ("2026-09-28T13:00:00Z", SP("2026-10-24T10:00"))).toEqual({
      estado: "desatualizada",
      data: "28/09/2026",
      mesEsperado: "outubro/2026",
    });
    expect(situacaoTabelaSamiQ("2026-10-12T15:00:00Z", SP("2026-11-05T00:30")).estado).toBe(
      "desatualizada",
    );
  });

  it("do dia 1 ao 4, a tabela do mês anterior ainda vale", () => {
    expect(situacaoTabelaSamiQ("2026-10-12T15:00:00Z", SP("2026-11-01T08:00")).estado).toBe(
      "em_dia",
    );
    expect(situacaoTabelaSamiQ("2026-10-12T15:00:00Z", SP("2026-11-03T12:00")).estado).toBe(
      "em_dia",
    );
  });

  it("o dia é o de São Paulo: 23h59 do dia 4 ainda é dia 4 (em UTC já é dia 5)", () => {
    const agora = SP("2026-11-04T23:59");
    expect(agora.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(situacaoTabelaSamiQ("2026-10-12T15:00:00Z", agora).estado).toBe("em_dia");
  });

  it("antes do dia 5, tabela de dois meses atrás já está desatualizada (esperada: a do mês anterior)", () => {
    expect(situacaoTabelaSamiQ("2026-09-28T13:00:00Z", SP("2026-11-03T12:00"))).toEqual({
      estado: "desatualizada",
      data: "28/09/2026",
      mesEsperado: "outubro/2026",
    });
  });

  it("virada de ano", () => {
    expect(situacaoTabelaSamiQ("2026-12-15T12:00:00Z", SP("2027-01-03T12:00")).estado).toBe(
      "em_dia",
    );
    expect(situacaoTabelaSamiQ("2026-12-15T12:00:00Z", SP("2027-01-05T09:00"))).toEqual({
      estado: "desatualizada",
      data: "15/12/2026",
      mesEsperado: "janeiro/2027",
    });
    expect(situacaoTabelaSamiQ("2026-11-20T12:00:00Z", SP("2027-01-03T12:00"))).toEqual({
      estado: "desatualizada",
      data: "20/11/2026",
      mesEsperado: "dezembro/2026",
    });
  });

  it("o carimbo é lido em São Paulo: 01h UTC do dia 1 ainda é o mês anterior", () => {
    // 2026-10-01T01:00Z = 30/09 às 22h em SP.
    expect(situacaoTabelaSamiQ("2026-10-01T01:00:00Z", SP("2026-10-10T10:00"))).toEqual({
      estado: "desatualizada",
      data: "30/09/2026",
      mesEsperado: "outubro/2026",
    });
  });

  it("data sem hora (AAAA-MM-DD) vale como veio, sem virar o dia anterior", () => {
    expect(situacaoTabelaSamiQ("2026-10-01", SP("2026-10-10T10:00"))).toEqual({
      estado: "em_dia",
      data: "01/10/2026",
    });
  });

  it("sem data ou data ilegível", () => {
    expect(situacaoTabelaSamiQ(null, SP("2026-10-24T10:00"))).toEqual({ estado: "sem_data" });
    expect(situacaoTabelaSamiQ("", SP("2026-10-24T10:00"))).toEqual({ estado: "sem_data" });
    expect(situacaoTabelaSamiQ("ontem", SP("2026-10-24T10:00"))).toEqual({ estado: "sem_data" });
  });
});

describe("avisoTabelaSamiQ", () => {
  it("em dia: sem aviso", () => {
    expect(avisoTabelaSamiQ({ estado: "em_dia", data: "12/10/2026" })).toBeUndefined();
  });

  it("desatualizada: data da tabela, mês esperado e o pedido de confirmar", () => {
    const aviso = avisoTabelaSamiQ({
      estado: "desatualizada",
      data: "28/09/2026",
      mesEsperado: "outubro/2026",
    });
    expect(aviso).toContain("28/09/2026");
    expect(aviso).toContain("outubro/2026");
    expect(aviso).toMatch(/confirme valores e disponibilidade com a construtora/i);
    expect(aviso).not.toContain("—");
  });

  it("sem data: pede para confirmar", () => {
    expect(avisoTabelaSamiQ({ estado: "sem_data" })).toMatch(/sem data de atualização/);
  });
});

describe("modelarMaterialProjeto: aviso da tabela", () => {
  const base: MaterialProjetoRow = {
    id: "p1",
    nome: "Vibra Sabará",
    construtora: "Vibra",
    endereco: null,
    logradouro: null,
    numero: null,
    bairro: null,
    cidade: null,
    regiao: null,
    zona_smq: null,
    tipologia: null,
    dorms_min: null,
    dorms_max: null,
    metragem_min: null,
    metragem_max: null,
    vagas: null,
    preco_a_partir: null,
    renda_minima: null,
    status_entrega: null,
    mes_entrega: null,
    ano_entrega: null,
    status_preco: null,
    disponibilidade_resumo: null,
    perfil_ideal: null,
    argumentos_venda: null,
    book_url: null,
    tabela_precos_url: "https://drive.google.com/file/d/abc/view",
    tabela_atualizada_em: "2026-09-28T13:00:00+00:00",
    preco_atualizado_em: null,
  };
  const agora = SP("2026-10-24T10:00");

  it("tabela de setembro em 24/10: desatualizada, com aviso", () => {
    const m = modelarMaterialProjeto(base, agora) as Record<string, unknown>;
    expect(m.tabela_situacao).toBe("desatualizada");
    expect(m.aviso_tabela).toContain("28/09/2026");
    expect(m.tabela_dias).toBe(26);
  });

  it("tabela de outubro: em dia, sem aviso", () => {
    const m = modelarMaterialProjeto(
      { ...base, tabela_atualizada_em: "2026-10-12T15:00:00+00:00" },
      agora,
    ) as Record<string, unknown>;
    expect(m.tabela_situacao).toBe("em_dia");
    expect(m.aviso_tabela).toBeUndefined();
  });

  it("sem link de tabela: nada sobre tabela velha", () => {
    const m = modelarMaterialProjeto({ ...base, tabela_precos_url: null }, agora) as Record<
      string,
      unknown
    >;
    expect(m.tem_tabela).toBe(false);
    expect(m.tabela_situacao).toBeUndefined();
    expect(m.aviso_tabela).toBeUndefined();
  });
});
