// Regra dos 65 — simulação (modo sombra) no Painel do Gestor, aba Time.
// A regra mora no banco; aqui se trava o que a tela faz com o que ele devolve:
// validação fail-closed, os totais do topo e o texto que diz "nada foi movido".
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  descemDos65,
  linhasComCarteira,
  parsePortasRegra65,
  parseRegra65,
  saemDaBase,
  totaisRegra65,
  descreverExecucao,
  estadoDaRegra,
  parseConfigRegra65,
  parseExecucoesRegra65,
  type ConfigRegra65,
  type ExecucaoRegra65,
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
  config: { data: undefined as ConfigRegra65 | null | undefined },
  execucoes: { data: undefined as ExecucaoRegra65[] | null | undefined },
  ligar: { mutate: vi.fn(), isPending: false },
  desligar: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/features/gestao/regra-65/use-regra-65", () => ({
  useRegra65Sombra: () => estado.sombra,
  useRegra65Portas: () => estado.portas,
  useRegra65Config: () => estado.config,
  useRegra65Execucoes: () => estado.execucoes,
  useLigarRegra65: () => estado.ligar,
  useDesligarRegra65: () => estado.desligar,
}));

import { SimulacaoRegra65 } from "@/features/gestao/regra-65/simulacao-regra-65";

afterEach(() => {
  cleanup();
  estado.sombra.data = undefined;
  estado.sombra.isPending = false;
  estado.sombra.isError = false;
  estado.portas.data = undefined;
  estado.config.data = undefined;
  estado.execucoes.data = undefined;
  estado.ligar.mutate.mockReset();
  estado.desligar.mutate.mockReset();
});

const cfg = (p: Partial<ConfigRegra65> = {}): ConfigRegra65 => ({
  modo: "sombra",
  virada_em: null,
  teto: 65,
  trava_roleta: 60,
  teto_base: 150,
  ...p,
});

const execucao = (p: Partial<ExecucaoRegra65> = {}): ExecucaoRegra65 => ({
  id: "33333333-3333-4333-8333-333333333333",
  modo: "sombra",
  gatilho: "cron",
  iniciado_em: "2026-10-06T09:41:00Z",
  terminado_em: "2026-10-06T09:42:00Z",
  avaliados: 4793,
  aplicados: 0,
  alertas: 0,
  erros: 0,
  resumo: { perde_vaga: 1608, sem_toque: 2688, fundo_desfecho: 208 },
  ...p,
});

describe("Fatia 3b: estado da regra e rodadas (derivação)", () => {
  it("sombra / agendada / ligada seguem o mesmo juízo do banco", () => {
    const agora = new Date("2026-10-06T12:00:00Z");
    expect(estadoDaRegra(cfg(), agora)).toBe("sombra");
    expect(estadoDaRegra(cfg({ modo: "ligado", virada_em: "2026-10-13T09:00:00Z" }), agora)).toBe(
      "agendada",
    );
    expect(estadoDaRegra(cfg({ modo: "ligado", virada_em: "2026-10-06T09:00:00Z" }), agora)).toBe(
      "ligada",
    );
    expect(estadoDaRegra(cfg({ modo: "ligado" }), agora)).toBe("ligada");
  });

  it("parse fail-closed da config e das rodadas", () => {
    expect(parseConfigRegra65({ ...cfg(), extra: 1 }).teto).toBe(65);
    expect(() => parseConfigRegra65({ modo: "talvez" })).toThrow();
    expect(parseExecucoesRegra65([execucao()])).toHaveLength(1);
    expect(() => parseExecucoesRegra65([{ id: "x" }])).toThrow();
  });

  it("descreve a rodada: sombra 'seriam', ligada 'aplicados', maiores primeiro", () => {
    expect(descreverExecucao(execucao())).toBe(
      "sombra: 4.793 lead(s) seriam movidos ou avisados (2.688 saem por 5 dias sem toque, 1.608 perdem a vaga, 208 fundo parado 10+ dias)",
    );
    expect(
      descreverExecucao(execucao({ modo: "ligado", aplicados: 4500, alertas: 12, erros: 2 })),
    ).toMatch(/^ligada: 4\.500 de 4\.793 aplicados .* · 12 aviso\(s\) ao gestor · 2 erro\(s\)$/);
  });
});

describe("Fatia 3b: o interruptor e a última rodada no cartão", () => {
  it("admin em sombra vê 'Ligar a regra' com a data da virada; quem não é admin não vê", () => {
    estado.sombra.data = [jefferson];
    estado.config.data = cfg();
    const { rerender } = render(<SimulacaoRegra65 veCasaInteira admin />);
    expect(screen.getByTestId("regra-65-controle")).toBeTruthy();
    const botao = screen.getByText("Ligar a regra");
    fireEvent.change(screen.getByLabelText("Data da virada"), {
      target: { value: "2026-10-13T06:00" },
    });
    fireEvent.click(botao);
    expect(estado.ligar.mutate).toHaveBeenCalledWith(new Date("2026-10-13T06:00").toISOString());
    rerender(<SimulacaoRegra65 veCasaInteira admin={false} />);
    expect(screen.queryByTestId("regra-65-controle")).toBeNull();
  });

  it("agendada: cabeçalho diz a virada e o botão é 'Desligar'; ligada: 'Regra ligada'", () => {
    estado.sombra.data = [jefferson];
    estado.config.data = cfg({ modo: "ligado", virada_em: "2099-01-10T09:00:00Z" });
    const { rerender } = render(<SimulacaoRegra65 veCasaInteira admin />);
    expect(screen.getByText(/Modo sombra até a virada em/)).toBeTruthy();
    fireEvent.click(screen.getByText("Desligar (voltar à sombra)"));
    expect(estado.desligar.mutate).toHaveBeenCalled();

    estado.config.data = cfg({ modo: "ligado", virada_em: "2020-01-10T09:00:00Z" });
    rerender(<SimulacaoRegra65 veCasaInteira admin />);
    expect(screen.getByText(/Regra ligada: o cron move e avisa a cada hora/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Regra dos 65" })).toBeTruthy();
  });

  it("mostra a última rodada do cron", () => {
    estado.sombra.data = [jefferson];
    estado.config.data = cfg();
    estado.execucoes.data = [execucao()];
    render(<SimulacaoRegra65 veCasaInteira />);
    expect(screen.getByTestId("regra-65-ultima-rodada").textContent).toMatch(
      /sombra: 4\.793 lead\(s\) seriam movidos/,
    );
  });
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
