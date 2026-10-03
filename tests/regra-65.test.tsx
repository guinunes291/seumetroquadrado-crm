// Regra dos 65 — simulação (modo sombra) no Painel do Gestor, aba Time.
// A regra mora no banco; aqui se trava o que a tela faz com o que ele devolve:
// validação fail-closed, os totais do topo e o texto que diz "nada foi movido".
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  descemDos65,
  linhasComCarteira,
  parsePortasRegra65,
  parseRegra65,
  saemDaBase,
  totaisRegra65,
  type LinhaRegra65,
  type PortasRegra65,
} from "@/features/gestao/regra-65/derive";

const linha = (p: Partial<LinhaRegra65> & { nome: string }): LinhaRegra65 => ({
  corretor_id: "11111111-1111-4111-8111-111111111111",
  teto: 65,
  trava_roleta: 60,
  teto_base: 150,
  em_atendimento: 0,
  ficam: 0,
  excedente: 0,
  perde_vaga: 0,
  porta_cadencia: 0,
  base: 0,
  base_cadencia: 0,
  retorno_protegido: 0,
  qualificacao_vencida: 0,
  sai_roleta: 0,
  sai_bolsao: 0,
  sai_reativacao: 0,
  alerta_proprio: 0,
  base_depois: 0,
  fundo: 0,
  fundo_gestor: 0,
  fundo_desfecho: 0,
  recebe_lead: true,
  trava: null,
  ...p,
});

// Números medidos em produção em 03/10/2026 (somente leitura).
const jefferson = linha({
  nome: "Jefferson Luiz",
  em_atendimento: 286,
  ficam: 48,
  perde_vaga: 238,
  base: 352,
  sai_bolsao: 346,
  base_depois: 244,
  fundo: 27,
  fundo_desfecho: 21,
  recebe_lead: false,
  trava: "minha base com 244 (teto 150)",
});
const eduardo = linha({
  corretor_id: "22222222-2222-4222-8222-222222222222",
  nome: "eduardo santana",
  em_atendimento: 55,
  ficam: 55,
  base: 16,
  sai_bolsao: 7,
  base_depois: 9,
  fundo: 1,
});
const vazio = linha({ corretor_id: "33333333-3333-4333-8333-333333333333", nome: "Sem carteira" });

describe("derivação", () => {
  it("valida fail-closed: linha malformada derruba a leitura", () => {
    expect(parseRegra65([jefferson])).toEqual([jefferson]);
    expect(() => parseRegra65([{ ...jefferson, ficam: "48" }])).toThrow();
    expect(parseRegra65(null)).toEqual([]);
  });

  it("portas: uma linha só, ou null", () => {
    const p: PortasRegra65 = {
      em_atendimento_sem_dono: 5438,
      em_atendimento_dono_inativo: 0,
      em_atendimento_em_cadencia: 0,
      clientes_duplicados: 0,
      registros_encerrariam: 0,
      registros_em_conflito: 0,
    };
    expect(parsePortasRegra65([p])).toEqual(p);
    expect(parsePortasRegra65([])).toBeNull();
  });

  it("descem dos 65 pelos três caminhos; saem da base pelos três destinos", () => {
    expect(descemDos65(linha({ nome: "x", excedente: 2, perde_vaga: 3, porta_cadencia: 1 }))).toBe(
      6,
    );
    expect(saemDaBase(linha({ nome: "x", sai_roleta: 1, sai_bolsao: 4, sai_reativacao: 2 }))).toBe(
      7,
    );
  });

  it("totais da casa e quem pararia de receber", () => {
    expect(totaisRegra65([jefferson, eduardo])).toEqual({
      corretores: 2,
      emAtendimento: 341,
      ficam: 103,
      descem: 238,
      saiRoleta: 0,
      saiBolsao: 353,
      fundoDesfecho: 21,
      travados: 1,
    });
  });

  it("corretor sem nenhum lead vivo fica fora da tabela", () => {
    expect(linhasComCarteira([jefferson, vazio, eduardo])).toEqual([jefferson, eduardo]);
  });
});

// ---------------------------------------------------------------------------

const estado = vi.hoisted(() => ({
  sombra: {
    data: undefined as LinhaRegra65[] | null | undefined,
    isPending: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  portas: { data: undefined as PortasRegra65 | null | undefined },
}));
vi.mock("@/features/gestao/regra-65/use-regra-65", () => ({
  useRegra65Sombra: () => estado.sombra,
  useRegra65Portas: () => estado.portas,
}));

import { SimulacaoRegra65 } from "@/features/gestao/regra-65/simulacao-regra-65";

afterEach(() => {
  cleanup();
  estado.sombra.data = undefined;
  estado.sombra.isPending = false;
  estado.sombra.isError = false;
  estado.portas.data = undefined;
});

describe("SimulacaoRegra65", () => {
  it("diz que nada foi movido e mostra uma linha por corretor com carteira", () => {
    estado.sombra.data = [jefferson, eduardo, vazio];
    render(<SimulacaoRegra65 veCasaInteira={false} />);

    expect(screen.getByText(/Modo sombra: nenhum lead foi movido/)).toBeTruthy();
    const linhas = screen.getAllByTestId("regra-65-linha");
    expect(linhas).toHaveLength(2);

    const j = within(linhas[0]);
    expect(j.getByText("Jefferson Luiz")).toBeTruthy();
    expect(j.getByText("48 / 65")).toBeTruthy();
    expect(j.getByText("352 → 244")).toBeTruthy();
    expect(j.getByText("trava").getAttribute("title")).toBe("minha base com 244 (teto 150)");
    expect(within(linhas[1]).getByText("recebe")).toBeTruthy();

    expect(screen.getByText(/1 corretor\(es\) parariam de receber lead novo/)).toBeTruthy();
  });

  it("portas só para quem vê a casa inteira", () => {
    estado.sombra.data = [jefferson];
    estado.portas.data = {
      em_atendimento_sem_dono: 5438,
      em_atendimento_dono_inativo: 0,
      em_atendimento_em_cadencia: 0,
      clientes_duplicados: 0,
      registros_encerrariam: 0,
      registros_em_conflito: 0,
    };
    const { rerender } = render(<SimulacaoRegra65 veCasaInteira={false} />);
    expect(screen.queryByTestId("regra-65-portas")).toBeNull();

    rerender(<SimulacaoRegra65 veCasaInteira />);
    expect(screen.getByTestId("regra-65-portas").textContent).toContain(
      "5.438 leads em Em atendimento sem dono",
    );
  });

  it("banco sem a migration: 'sem dado', nunca uma equipe vazia", () => {
    estado.sombra.data = null;
    render(<SimulacaoRegra65 veCasaInteira />);
    expect(screen.getByText(/Sem dado: a simulação ainda não está disponível/)).toBeTruthy();
    expect(screen.queryByTestId("regra-65-linha")).toBeNull();
  });
});
