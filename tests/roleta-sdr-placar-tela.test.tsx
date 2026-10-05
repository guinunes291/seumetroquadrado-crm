// Telas da permanência semanal na roleta do SDR: o card "Placar da semana"
// (Central → Filas → SDR) e o bloco "Roleta do SDR" no card Metas do dia.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  CONFIG_ROLETA_SDR_PADRAO,
  type ConfigRoletaSdr,
  type ResultadoApuracao,
} from "@/lib/roleta-sdr-semanal";
import type {
  ApuracaoSemana,
  LinhaPlacarTela,
} from "@/features/distribuicao/roleta-sdr-semanal-queries";

const estado = vi.hoisted(() => ({
  cfg: undefined as ConfigRoletaSdr | undefined,
  placar: undefined as LinhaPlacarTela[] | undefined,
  apuracoes: [] as ApuracaoSemana[],
}));

vi.mock("@/features/distribuicao/roleta-sdr-semanal-queries", () => ({
  useRoletaSdrConfig: () => ({ data: estado.cfg, isLoading: false, isError: false }),
  usePlacarRoletaSdr: () => ({ data: estado.placar, isLoading: false, isError: false }),
  useUltimasApuracoesRoletaSdr: () => ({
    data: estado.apuracoes,
    isLoading: false,
    isError: false,
  }),
}));

import { PlacarRoletaSdrCard } from "@/features/distribuicao/placar-roleta-sdr";
import { PlacarRoletaSdrCorretor } from "@/features/metas-dia/roleta-sdr-placar";

const linha = (o: Partial<LinhaPlacarTela> & { corretor_id: string }): LinhaPlacarTela => ({
  nome: o.corretor_id,
  visitas: 0,
  pastas: 0,
  pontos: 0,
  vendas_janela: 0,
  ultima_venda: null,
  bloqueado_admin: false,
  na_roleta: true,
  participante_ativo: true,
  pausado_ate: null,
  motivo_pausa: null,
  ...o,
});

const ligada: ConfigRoletaSdr = { ...CONFIG_ROLETA_SDR_PADRAO, regra_ativa: true };

afterEach(() => {
  cleanup();
  estado.cfg = undefined;
  estado.placar = undefined;
  estado.apuracoes = [];
});

describe("Placar da semana (Central → Filas → SDR)", () => {
  it("mostra pontos e o status previsto pela mesma cascata da apuração", () => {
    estado.cfg = ligada;
    estado.placar = [
      linha({ corretor_id: "ana", nome: "Ana", visitas: 3, pontos: 3 }),
      linha({
        corretor_id: "bia",
        nome: "Bia",
        vendas_janela: 1,
        ultima_venda: "2026-10-02",
        na_roleta: false,
        participante_ativo: false,
      }),
      linha({ corretor_id: "caio", nome: "Caio", visitas: 1, pastas: 1, pontos: 2.5 }),
      linha({ corretor_id: "davi", nome: "Davi", visitas: 1, pontos: 1 }),
      linha({ corretor_id: "fabio", nome: "Fábio", visitas: 4, pontos: 4, bloqueado_admin: true }),
    ];
    render(<PlacarRoletaSdrCard />);

    const linhaDe = (nome: string) => screen.getByText(nome).closest("tr")!;
    expect(within(linhaDe("Ana")).getByText("Vai ficar")).toBeInTheDocument();
    expect(within(linhaDe("Ana")).getByText("3 pts")).toBeInTheDocument();
    expect(within(linhaDe("Bia")).getByText("Vai entrar")).toBeInTheDocument();
    expect(within(linhaDe("Bia")).getByText("exceção: venda")).toBeInTheDocument();
    expect(within(linhaDe("Caio")).getByText("Vai ficar")).toBeInTheDocument();
    expect(within(linhaDe("Caio")).getByText("exceção: complemento")).toBeInTheDocument();
    expect(within(linhaDe("Davi")).getByText("Vai pausar")).toBeInTheDocument();
    expect(within(linhaDe("Fábio")).getByText("Removido pelo admin")).toBeInTheDocument();
    expect(screen.getByText("Modo sombra")).toBeInTheDocument();
    expect(
      screen.getByText(/3 aptos \(1 pela meta, 1 por venda, 1 por complemento\)/),
    ).toBeInTheDocument();
  });

  it("alterna entre a semana em curso e a última fechada (a que o sábado aplica)", () => {
    estado.cfg = ligada;
    estado.placar = [linha({ corretor_id: "ana", nome: "Ana", visitas: 3, pontos: 3 })];
    render(<PlacarRoletaSdrCard />);
    expect(screen.getByText(/· em curso/)).toBeInTheDocument();
    expect(screen.getByText("Se a semana fechasse agora:")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Última fechada" }), { button: 0 });
    expect(screen.getByText(/· fechada/)).toBeInTheDocument();
    expect(screen.getByText("Na apuração desta semana:")).toBeInTheDocument();
  });

  it("ninguém qualificado: avisa que a roleta ficaria vazia", () => {
    estado.cfg = ligada;
    estado.placar = [linha({ corretor_id: "a", nome: "Ana" })];
    render(<PlacarRoletaSdrCard />);
    expect(screen.getByText(/a roleta ficaria vazia/)).toBeInTheDocument();
  });

  it("regra desligada: explica que o time segue manual", () => {
    estado.cfg = CONFIG_ROLETA_SDR_PADRAO;
    estado.placar = [linha({ corretor_id: "a", nome: "Ana" })];
    render(<PlacarRoletaSdrCard />);
    expect(screen.getByText("Regra desligada")).toBeInTheDocument();
    expect(screen.getByText(/o time da roleta segue/)).toBeInTheDocument();
  });

  it("lista as últimas apurações com sombra/aplicada e o resultado de cada um", () => {
    estado.cfg = ligada;
    estado.placar = [];
    const l = (nome: string, resultado: ResultadoApuracao, pontos: number) => ({
      semana_inicio: "2026-09-26",
      corretor_id: nome,
      nome,
      visitas: 0,
      pastas: 0,
      pontos,
      vendas_janela: 0,
      resultado,
      sombra: true,
      aplicado_em: null,
      apurado_em: "2026-10-03T11:00:00Z",
    });
    estado.apuracoes = [
      {
        semana_inicio: "2026-09-26",
        sombra: true,
        aplicado_em: null,
        apurado_em: "2026-10-03T11:00:00Z",
        linhas: [l("Ana", "apto_meta", 3), l("Davi", "pausado", 1)],
      },
    ];
    render(<PlacarRoletaSdrCard />);
    expect(screen.getByText("26/09 a 02/10")).toBeInTheDocument();
    expect(screen.getByText("Sombra (sem efeito)")).toBeInTheDocument();
    expect(screen.getByText("Meta batida")).toBeInTheDocument();
    expect(screen.getByText("Pausado")).toBeInTheDocument();
  });
});

describe("Roleta do SDR no card Metas do dia (corretor)", () => {
  it("mostra o próprio placar e o que falta pelos dois caminhos", () => {
    estado.cfg = ligada;
    estado.placar = [linha({ corretor_id: "eu", visitas: 1, pastas: 1, pontos: 2.5 })];
    render(<PlacarRoletaSdrCorretor uid="eu" />);
    const bloco = screen.getByTestId("metas-dia-roleta-sdr");
    expect(bloco).toHaveTextContent("2,5/3 pts");
    expect(bloco).toHaveTextContent("falta 1 visita ou 1 pasta até sexta");
    expect(bloco).toHaveTextContent("teste"); // modo sombra
    expect(bloco.getAttribute("title")).toBe(
      "Sua semana na roleta do SDR: 1 visita realizada e 1 pasta (2,5 pts). Para continuar recebendo agendados a partir de sábado, falta 1 visita ou 1 pasta até sexta.",
    );
  });

  it("meta batida", () => {
    estado.cfg = { ...ligada, modo_sombra: false };
    estado.placar = [linha({ corretor_id: "eu", pastas: 2, pontos: 3 })];
    render(<PlacarRoletaSdrCorretor uid="eu" />);
    expect(screen.getByTestId("metas-dia-roleta-sdr")).toHaveTextContent(
      "meta batida: na roleta do SDR a partir de sábado",
    );
  });

  it("some com a regra desligada ou para quem foi removido pelo admin", () => {
    estado.cfg = CONFIG_ROLETA_SDR_PADRAO;
    estado.placar = [linha({ corretor_id: "eu" })];
    const { container, rerender } = render(<PlacarRoletaSdrCorretor uid="eu" />);
    expect(container).toBeEmptyDOMElement();
    estado.cfg = ligada;
    estado.placar = [linha({ corretor_id: "eu", bloqueado_admin: true })];
    rerender(<PlacarRoletaSdrCorretor uid="eu" />);
    expect(container).toBeEmptyDOMElement();
  });
});
