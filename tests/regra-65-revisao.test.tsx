// Regra dos 65, Fatia 4 — a revisão mensal no Painel do Gestor (aba Time).
// As contas moram no banco; aqui se trava o que a tela faz com o que ele
// devolve: parse fail-closed, escolha do mês, juízo contra a meta e os textos.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  avaliarTaxa,
  avaliarToque,
  fmtHoras,
  linhaDaCasa,
  linhasDosCorretores,
  mesesDaRevisao,
  metasDaConfig,
  parseRevisaoRegra65,
  rotuloMes,
  serieDaCasa,
  toquesPorDia,
  type ConfigRegra65,
  type LinhaRevisao65,
} from "@/features/gestao/regra-65/derive";

const linha = (p: Partial<LinhaRevisao65> = {}): LinhaRevisao65 => ({
  mes: "2026-09-01",
  casa: false,
  corretor_id: "11111111-1111-4111-8111-111111111111",
  nome: "Ana",
  dias: 30,
  leads_65: 0,
  leads_tocados: 0,
  toques: 0,
  intervalos: 0,
  mediana_horas: null,
  entraram: 0,
  agendaram: 0,
  em_aberto: 0,
  taxa_agendado: null,
  perderam_vaga: 0,
  sairam_base: 0,
  trocas: 0,
  ...p,
});

// Números medidos em produção em 05/10/2026 (somente leitura), setembro.
const casaSet = linha({
  casa: true,
  corretor_id: null,
  nome: null,
  leads_65: 2631,
  leads_tocados: 519,
  toques: 723,
  intervalos: 394,
  mediana_horas: 97,
  entraram: 2798,
  agendaram: 88,
  em_aberto: 1534,
  taxa_agendado: 3.1,
});
const casaAgo = linha({
  mes: "2026-08-01",
  casa: true,
  corretor_id: null,
  nome: null,
  dias: 31,
  leads_65: 2495,
  leads_tocados: 325,
  toques: 442,
  intervalos: 329,
  mediana_horas: 310.5,
  entraram: 4078,
  agendaram: 106,
  em_aberto: 75,
  taxa_agendado: 2.6,
});
const graziele = linha({
  nome: "graziele",
  leads_65: 173,
  leads_tocados: 130,
  toques: 264,
  intervalos: 154,
  mediana_horas: 166.3,
  entraram: 149,
  agendaram: 10,
  em_aberto: 89,
  taxa_agendado: 6.7,
});
const jefferson = linha({
  corretor_id: "22222222-2222-4222-8222-222222222222",
  nome: "Jefferson Luiz",
  leads_65: 291,
  leads_tocados: 78,
  toques: 81,
  intervalos: 7,
  mediana_horas: 17,
  entraram: 417,
  agendaram: 6,
  em_aberto: 279,
  taxa_agendado: 1.4,
  perderam_vaga: 12,
  sairam_base: 3,
  trocas: 2,
});
const vazia = linha({ corretor_id: "33333333-3333-4333-8333-333333333333", nome: "Sem nada" });
const grazieleAgo = linha({
  ...graziele,
  mes: "2026-08-01",
  dias: 31,
  mediana_horas: 40,
  toques: 90,
});

describe("Fatia 4: derivação da revisão mensal", () => {
  it("parse fail-closed", () => {
    expect(parseRevisaoRegra65([casaSet])).toEqual([casaSet]);
    expect(() => parseRevisaoRegra65([{ ...casaSet, toques: "723" }])).toThrow();
    expect(() => parseRevisaoRegra65([{ ...casaSet, mes: "setembro" }])).toThrow();
    expect(parseRevisaoRegra65(null)).toEqual([]);
  });

  it("meses do mais recente ao mais antigo; a casa e os corretores com movimento do mês", () => {
    const todas = [casaAgo, grazieleAgo, casaSet, jefferson, graziele, vazia];
    expect(mesesDaRevisao(todas)).toEqual(["2026-09-01", "2026-08-01"]);
    expect(linhaDaCasa(todas, "2026-09-01")).toBe(casaSet);
    expect(linhaDaCasa(todas, "2026-07-01")).toBeNull();
    expect(linhasDosCorretores(todas, "2026-09-01").map((l) => l.nome)).toEqual([
      "graziele",
      "Jefferson Luiz",
    ]);
    expect(linhasDosCorretores(todas, "2026-08-01")).toEqual([grazieleAgo]);
  });

  it("rótulo do mês sem depender do fuso; toques por dia", () => {
    expect(rotuloMes("2026-09-01")).toBe("setembro de 2026");
    expect(rotuloMes("2026-01-01")).toBe("janeiro de 2026");
    expect(toquesPorDia(casaSet)).toBeCloseTo(24.1, 1);
    expect(toquesPorDia(linha({ dias: 0, toques: 5 }))).toBe(0);
  });

  it("as metas vêm da config; sem ela, 72 h e 70%", () => {
    const cfg: ConfigRegra65 = { modo: "sombra", teto: 65, trava_roleta: 60, teto_base: 150 };
    expect(metasDaConfig(cfg)).toEqual({ toqueHoras: 72, agendadoPct: 70 });
    expect(metasDaConfig(null)).toEqual({ toqueHoras: 72, agendadoPct: 70 });
    expect(
      metasDaConfig({ ...cfg, revisao_toque_meta_horas: 48, revisao_agendado_meta_pct: 50 }),
    ).toEqual({ toqueHoras: 48, agendadoPct: 50 });
  });

  it("juízo contra a meta: toque (menor é melhor) e taxa (maior é melhor)", () => {
    expect(avaliarToque(null, 72)).toBe("neutral");
    expect(avaliarToque(72, 72)).toBe("success");
    expect(avaliarToque(97, 72)).toBe("warning");
    expect(avaliarToque(108.1, 72)).toBe("danger");
    expect(avaliarTaxa(null, 70)).toBe("neutral");
    expect(avaliarTaxa(70, 70)).toBe("success");
    expect(avaliarTaxa(35, 70)).toBe("warning");
    expect(avaliarTaxa(3.1, 70)).toBe("danger");
  });

  it("horas em texto e a série da casa, do mês mais antigo ao mais recente", () => {
    expect(fmtHoras(36)).toBe("36 h");
    expect(fmtHoras(97)).toBe("97 h (4 dias)");
    expect(fmtHoras(310.5)).toBe("311 h (12,9 dias)");
    expect(serieDaCasa([casaSet, casaAgo, graziele], "mediana_horas")).toEqual([310.5, 97]);
    expect(
      serieDaCasa(
        [casaSet, linha({ mes: "2026-07-01", casa: true, corretor_id: null })],
        "taxa_agendado",
      ),
    ).toEqual([3.1]);
  });
});

// ---------------------------------------------------------------------------

const estado = vi.hoisted(() => ({
  config: { data: undefined as ConfigRegra65 | null | undefined },
  revisao: {
    data: undefined as LinhaRevisao65[] | null | undefined,
    isPending: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}));
vi.mock("@/features/gestao/regra-65/use-regra-65", () => ({
  useRegra65Config: () => estado.config,
  useRegra65Revisao: () => estado.revisao,
}));

import { RevisaoRegra65 } from "@/features/gestao/regra-65/revisao-regra-65";

afterEach(() => {
  cleanup();
  estado.config.data = undefined;
  estado.revisao.data = undefined;
  estado.revisao.isPending = false;
  estado.revisao.isError = false;
});

describe("Fatia 4: o cartão da revisão mensal", () => {
  it("mostra o mês mais recente, as duas respostas com a meta ao lado e uma linha por corretor", () => {
    estado.revisao.data = [casaAgo, grazieleAgo, casaSet, jefferson, graziele, vazia];
    render(<RevisaoRegra65 />);
    const sel = screen.getByTestId("regra-65-revisao-mes") as HTMLSelectElement;
    expect(sel.value).toBe("2026-09-01");
    expect(
      screen.getByText("Entre toques nos 65").parentElement?.parentElement?.textContent,
    ).toContain("97 h (4 dias)");
    expect(screen.getByText(/meta: até 72 h · 394 intervalo/)).toBeTruthy();
    expect(
      screen.getByText(/meta: 70% · 88 de 2.798 que entraram no mês · 1.534 ainda em atendimento/),
    ).toBeTruthy();
    expect(screen.getByText(/723 conversas em 30 dia/)).toBeTruthy();
    const linhas = screen.getAllByTestId("regra-65-revisao-linha");
    expect(linhas).toHaveLength(2);
    expect(within(linhas[0]).getByText("graziele")).toBeTruthy();
    expect(within(linhas[1]).getByText("12")).toBeTruthy(); // perderam a vaga
    expect(within(linhas[1]).getByText("17 h")).toBeTruthy();
  });

  it("trocar o mês troca a casa e a tabela", () => {
    estado.revisao.data = [casaAgo, grazieleAgo, casaSet, jefferson, graziele];
    render(<RevisaoRegra65 />);
    fireEvent.change(screen.getByTestId("regra-65-revisao-mes"), {
      target: { value: "2026-08-01" },
    });
    expect(screen.getByText(/meta: até 72 h · 329 intervalo/)).toBeTruthy();
    expect(screen.getAllByTestId("regra-65-revisao-linha")).toHaveLength(1);
    expect(screen.getByText("40 h")).toBeTruthy();
  });

  it("as metas da config entram no texto", () => {
    estado.config.data = {
      modo: "sombra",
      teto: 65,
      trava_roleta: 60,
      teto_base: 150,
      revisao_toque_meta_horas: 48,
      revisao_agendado_meta_pct: 50,
    };
    estado.revisao.data = [casaSet, graziele];
    render(<RevisaoRegra65 />);
    expect(screen.getByText(/meta: até 48 h/)).toBeTruthy();
    expect(screen.getByText(/meta: 50% ·/)).toBeTruthy();
  });

  it("sem a RPC diz 'sem dado'; com erro oferece tentar de novo", () => {
    estado.revisao.data = null;
    render(<RevisaoRegra65 />);
    expect(screen.getByText(/Sem dado/)).toBeTruthy();
    cleanup();
    estado.revisao.isError = true;
    estado.revisao.error = new Error("boom");
    render(<RevisaoRegra65 />);
    expect(screen.getByText("Não foi possível ler a revisão mensal.")).toBeTruthy();
  });
});
