// Aviso de quarta da roleta do SDR dentro do CRM (migration 20261011120200):
// o card do placar (regra pura) e o pop-up — quando abre sozinho, quando vira
// toast, o "Entendi" que marca o alerta como lido e o link do sino.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CONFIG_ROLETA_SDR_PADRAO,
  cardAvisoRoletaSdr,
  dataHoraCurta,
  parseMeuAviso,
  rotuloSemana,
  semanaEmCurso,
  type ConfigRoletaSdr,
  type LinhaPlacarTela,
  type MeuAvisoRoletaSdr,
} from "@/lib/roleta-sdr-semanal";

const estado = vi.hoisted(() => ({
  cfg: undefined as ConfigRoletaSdr | undefined,
  placar: undefined as LinhaPlacarTela[] | undefined,
  aviso: undefined as MeuAvisoRoletaSdr | null | undefined,
  marcados: [] as string[],
  toasts: [] as { titulo: string; acao?: () => void }[],
}));

vi.mock("@/features/distribuicao/roleta-sdr-semanal-queries", () => ({
  useRoletaSdrConfig: () => ({ data: estado.cfg }),
  usePlacarRoletaSdr: (_s: string, enabled: boolean) => ({
    data: enabled ? estado.placar : undefined,
  }),
  useMeuAvisoRoletaSdr: (_s: string, enabled: boolean) => ({
    data: enabled ? estado.aviso : undefined,
    isSuccess: enabled && estado.aviso !== undefined,
  }),
  useMarcarAvisoRoletaSdrLido: () => ({
    mutate: (id: string) => estado.marcados.push(id),
  }),
}));

vi.mock("sonner", () => ({
  toast: (titulo: string, o?: { action?: { onClick: () => void } }) =>
    estado.toasts.push({ titulo, acao: o?.action?.onClick }),
}));

import { AvisoRoletaSdrHost } from "@/features/metas-dia/aviso-roleta-sdr";

const SEMANA = "2026-10-03";
const ligada: ConfigRoletaSdr = { ...CONFIG_ROLETA_SDR_PADRAO, regra_ativa: true };

const linha = (o: Partial<LinhaPlacarTela> = {}): LinhaPlacarTela => ({
  corretor_id: "ana",
  nome: "Ana Paula Souza",
  visitas: 1,
  pastas: 1,
  pontos: 2.5,
  vendas_janela: 0,
  ultima_venda: null,
  bloqueado_admin: false,
  na_roleta: true,
  participante_ativo: true,
  pausado_ate: null,
  motivo_pausa: null,
  ...o,
});

const aviso = (o: Partial<MeuAvisoRoletaSdr> = {}): MeuAvisoRoletaSdr => ({
  alerta_id: "alerta-1",
  lida: false,
  criado_em: "2026-10-07T21:00:00Z",
  semana_inicio: semanaEmCurso(),
  sombra: true,
  ...o,
});

describe("card do aviso (regra pura)", () => {
  const quarta = new Date("2026-10-07T21:30:00Z");

  it("2,5 pts: 83%, o que falta até a sexta e o verbo de quem está recebendo", () => {
    const card = cardAvisoRoletaSdr(linha(), SEMANA, ligada, quarta);
    expect(card).toMatchObject({
      primeiroNome: "Ana",
      semana: "03/10 a 09/10",
      pontos: "2,5",
      meta: "3 pts",
      pct: 83,
      batida: false,
      visitas: { qtd: 1, rotulo: "visita realizada", vale: "1 pt" },
      pastas: { qtd: 1, rotulo: "pasta", vale: "1,5 pts" },
      falta: "Falta 1 visita ou 1 pasta até sexta (09/10)",
      objetivo: "Para continuar recebendo agendados a partir de sábado.",
      situacao: "recebendo",
      situacaoTexto: "Você está recebendo agendados do SDR",
    });
  });

  it("zerado e fora da roleta: faltam 3 visitas ou 2 pastas para entrar", () => {
    const card = cardAvisoRoletaSdr(
      linha({ visitas: 0, pastas: 0, pontos: 0, na_roleta: false, participante_ativo: false }),
      SEMANA,
      ligada,
      quarta,
    );
    expect(card.pct).toBe(0);
    expect(card.visitas).toEqual({ qtd: 0, rotulo: "visitas realizadas", vale: "0 pts" });
    expect(card.falta).toBe("Faltam 3 visitas ou 2 pastas até sexta (09/10)");
    expect(card.objetivo).toBe("Para entrar na roleta e receber agendados a partir de sábado.");
    expect(card.situacaoTexto).toBe("Você ainda não está na roleta do SDR");
  });

  it("pausado mostra até quando (relógio de São Paulo)", () => {
    const card = cardAvisoRoletaSdr(
      linha({ pausado_ate: "2026-10-10T12:00:00Z" }),
      SEMANA,
      ligada,
      quarta,
    );
    expect(card.situacao).toBe("pausado");
    expect(card.situacaoTexto).toBe("Você está pausado na roleta do SDR até 10/10, 09:00");
    expect(card.objetivo).toBe("Para voltar a receber agendados a partir de sábado.");
  });

  it("meta batida depois do aviso: barra cheia, sem 'falta'", () => {
    const card = cardAvisoRoletaSdr(linha({ visitas: 3, pontos: 4 }), SEMANA, ligada, quarta);
    expect(card.pct).toBe(100);
    expect(card.batida).toBe(true);
    expect(card.falta).toBeNull();
    expect(card.objetivo).toBe(
      "Meta da semana batida: você recebe agendados do SDR a partir de sábado.",
    );
  });

  it("sem nome no cadastro: 'Olá!' sem nome", () => {
    expect(
      cardAvisoRoletaSdr(linha({ nome: "Corretor sem nome" }), SEMANA, ligada).primeiroNome,
    ).toBeNull();
  });

  it("dataHoraCurta e a resposta da RPC (null = sem aviso; formato errado falha)", () => {
    expect(dataHoraCurta("2026-10-10T12:00:00Z")).toBe("10/10, 09:00");
    expect(parseMeuAviso(null)).toBeNull();
    expect(parseMeuAviso(aviso())).toEqual(aviso());
    expect(() => parseMeuAviso({ alerta_id: 1 })).toThrow();
  });
});

describe("pop-up do aviso no CRM", () => {
  beforeEach(() => {
    estado.cfg = ligada;
    estado.placar = [linha()];
    estado.aviso = aviso();
  });

  afterEach(() => {
    cleanup();
    estado.cfg = undefined;
    estado.placar = undefined;
    estado.aviso = undefined;
    estado.marcados = [];
    estado.toasts = [];
    window.history.replaceState(null, "", "/");
  });

  it("abre sozinho com o aviso não lido e mostra o card do placar", () => {
    render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    const dlg = screen.getByTestId("aviso-roleta-sdr");
    expect(dlg).toHaveTextContent("Olá, Ana!");
    expect(screen.getByTestId("aviso-roleta-sdr-pontos")).toHaveTextContent("2,5");
    expect(dlg).toHaveTextContent("de 3 pts");
    expect(dlg).toHaveTextContent("Falta 1 visita ou 1 pasta até sexta");
    expect(dlg).toHaveTextContent(`Semana ${rotuloSemana(semanaEmCurso())}`);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");
    // Em sombra: selo e aviso de fase de teste.
    expect(dlg).toHaveTextContent("Teste");
    expect(dlg).toHaveTextContent("Fase de teste");
  });

  it("'Entendi' fecha e marca o alerta como lido (uma vez)", () => {
    render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    fireEvent.click(screen.getByTestId("aviso-roleta-sdr-entendi"));
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
    expect(estado.marcados).toEqual(["alerta-1"]);
  });

  it("não abre por cima de outro pop-up; abre quando ele fecha", () => {
    const { rerender } = render(<AvisoRoletaSdrHost uid="ana" bloqueado />);
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
    rerender(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.getByTestId("aviso-roleta-sdr")).toBeInTheDocument();
  });

  it("alerta já lido, sem aviso, regra desligada ou removido pelo admin: não abre", () => {
    estado.aviso = aviso({ lida: true });
    const { unmount } = render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
    unmount();

    estado.aviso = null;
    const r2 = render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
    r2.unmount();

    estado.aviso = aviso();
    estado.cfg = { ...ligada, regra_ativa: false };
    const r3 = render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
    r3.unmount();

    estado.cfg = ligada;
    estado.placar = [linha({ bloqueado_admin: true })];
    render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
  });

  it("aviso que chega com o CRM aberto vira toast; 'Ver placar' abre o pop-up", () => {
    estado.aviso = null;
    const { rerender } = render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    estado.aviso = aviso({ alerta_id: "alerta-18h" });
    rerender(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
    expect(estado.toasts).toHaveLength(1);
    expect(estado.toasts[0].titulo).toContain("Roleta do SDR");
    rerender(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(estado.toasts).toHaveLength(1); // um toast por aviso
    act(() => estado.toasts[0].acao?.());
    expect(screen.getByTestId("aviso-roleta-sdr")).toBeInTheDocument();
  });

  it("o link do sino (#aviso-roleta-sdr) reabre o pop-up mesmo com o alerta lido e limpa o hash", () => {
    estado.aviso = aviso({ lida: true });
    window.history.replaceState(null, "", "/fila#aviso-roleta-sdr");
    render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.getByTestId("aviso-roleta-sdr")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/fila");
    // Fechar um aviso já lido não grava nada de novo.
    fireEvent.click(screen.getByTestId("aviso-roleta-sdr-entendi"));
    expect(estado.marcados).toEqual([]);
  });

  it("troca de hash com o CRM aberto (sino na própria /fila) também abre", () => {
    estado.aviso = aviso({ lida: true });
    render(<AvisoRoletaSdrHost uid="ana" bloqueado={false} />);
    expect(screen.queryByTestId("aviso-roleta-sdr")).not.toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", "/fila#aviso-roleta-sdr");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByTestId("aviso-roleta-sdr")).toBeInTheDocument();
  });
});
