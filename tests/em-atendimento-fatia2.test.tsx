// Regra dos 65, Fatia 2 — as telas. A regra mora no banco
// (tests/db/em-atendimento-fatia2.test.ts); aqui se trava o que a tela decide
// com o que ele devolve: a trava vira janela de troca, Em atendimento sai só
// por desfecho, o retorno avisa antes de virar perda, o contador e a escolha.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DESFECHOS_EM_ATENDIMENTO,
  MOTIVO_SAIDA_NAO_OFERECIDA,
  motivoPerdaLabel,
  resolveStageAction,
  saidaOferecida,
} from "@/lib/leads";
import {
  deInputData,
  destinoDoRetorno,
  erroLotado,
  maisParados,
  paraInputData,
  parseContador,
  prazoParaManter,
  tomContador,
  type ContadorEmAtendimento,
  type LinhaMeus65,
} from "@/lib/em-atendimento";

const DIA = 86_400_000;
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ---------------------------------------------------------------------------
// Parte pura
// ---------------------------------------------------------------------------

describe("a trava do banco (EA065)", () => {
  it("lê os números do DETAIL; outro erro não é a trava", () => {
    expect(
      erroLotado({
        code: "EA065",
        message: "Em atendimento lotado: 65 de 65.",
        details: '{"em_atendimento": 65, "teto": 65, "lead_id": "abc"}',
      }),
    ).toEqual({ emAtendimento: 65, teto: 65, leadId: "abc" });
    // O driver pg devolve `detail`; o supabase-js, `details`.
    expect(erroLotado({ code: "EA065", detail: '{"em_atendimento": 3, "teto": 3}' })).toEqual({
      emAtendimento: 3,
      teto: 3,
      leadId: null,
    });
    expect(erroLotado({ code: "EA065", details: "não é json" })).toEqual({
      emAtendimento: 0,
      teto: 0,
      leadId: null,
    });
    expect(erroLotado({ code: "22023", message: "x" })).toBeNull();
    expect(erroLotado(new Error("rede"))).toBeNull();
    expect(erroLotado(null)).toBeNull();
  });
});

describe("desfechos de Em atendimento", () => {
  it("são cinco: Agendou, Pediu retorno, Esfriou, Mandou doc, Perdido", () => {
    expect(DESFECHOS_EM_ATENDIMENTO.map((d) => d.label)).toEqual([
      "Agendou",
      "Pediu retorno",
      "Esfriou",
      "Mandou doc",
      "Perdido",
    ]);
    // Nenhum é direto: todos pedem o formulário da casa (data, visita, pasta, motivo).
    expect(DESFECHOS_EM_ATENDIMENTO.every((d) => d.action.kind !== "direct")).toBe(true);
  });

  it("a tela só oferece esses destinos para sair de Em atendimento", () => {
    expect(saidaOferecida("em_atendimento", "agendado")).toBe(true);
    expect(saidaOferecida("em_atendimento", "aguardando_retorno")).toBe(true);
    expect(saidaOferecida("em_atendimento", "analise_credito")).toBe(true);
    expect(saidaOferecida("em_atendimento", "perdido")).toBe(true);
    // O banco ainda aceita estas (até a Fatia 3), a tela não.
    expect(saidaOferecida("em_atendimento", "qualificacao_corretor")).toBe(false);
    expect(saidaOferecida("em_atendimento", "visita_realizada")).toBe(false);
    // Fora de Em atendimento nada muda.
    expect(saidaOferecida("aguardando_atendimento", "qualificacao_corretor")).toBe(true);
    expect(MOTIVO_SAIDA_NAO_OFERECIDA).toContain("Pediu retorno");
  });

  it("de Em atendimento, Aguardando retorno pede a data (Pediu retorno)", () => {
    expect(resolveStageAction("aguardando_retorno", "em_atendimento")).toEqual({
      kind: "modal",
      modal: "pediu_retorno",
    });
    expect(resolveStageAction("aguardando_retorno")).toEqual({ kind: "direct" });
    expect(resolveStageAction("aguardando_retorno", "agendado")).toEqual({ kind: "direct" });
  });

  it("a perda 'retorno futuro' tem nome, mas fica fora do menu do corretor", () => {
    expect(motivoPerdaLabel("retorno_futuro")).toBe("Retorno futuro (além de 30 dias)");
  });
});

describe("retorno com data", () => {
  const agora = new Date("2026-10-03T12:00:00-03:00");
  const em = (dias: number) => new Date(agora.getTime() + dias * DIA);

  it("até 30 dias fica; além vira retorno futuro — menos o lead próprio", () => {
    expect(destinoDoRetorno(em(30), agora, 30, false)).toBe("aguardando_retorno");
    expect(destinoDoRetorno(em(31), agora, 30, false)).toBe("retorno_futuro");
    expect(destinoDoRetorno(em(60), agora, 30, true)).toBe("proprio_fica");
  });

  it("o input de data vai e volta às 9h locais", () => {
    const d = deInputData("2026-11-05");
    expect(d?.getHours()).toBe(9);
    expect(paraInputData(d!)).toBe("2026-11-05");
    expect(deInputData("05/11/2026")).toBeNull();
  });
});

const linha = (p: Partial<LinhaMeus65> & { lead_id: string; nome: string }): LinhaMeus65 => ({
  telefone: null,
  status: "em_atendimento",
  origem: "facebook",
  temperatura: null,
  projeto_nome: "Residencial Alfa",
  grupo: "pago",
  camada: "em_atendimento",
  movimento: new Date(Date.now() - 2 * DIA).toISOString(),
  dias_sem_toque: 2,
  proximo_followup: null,
  escreveu_em: null,
  escolhido: false,
  posicao: 1,
  acao: "fica",
  destino: null,
  motivo: "nos 65 (posição 1)",
  ...p,
});

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("escolha e contador", () => {
  it("os 5 mais parados de Em atendimento, do mais parado ao menos", () => {
    const linhas = [
      linha({ lead_id: id(1), nome: "Um", dias_sem_toque: 1 }),
      linha({ lead_id: id(2), nome: "Dois", dias_sem_toque: 4 }),
      linha({ lead_id: id(3), nome: "Três", dias_sem_toque: 9, acao: "perde_vaga" }),
      linha({ lead_id: id(4), nome: "Quatro", dias_sem_toque: 3 }),
      linha({ lead_id: id(5), nome: "Cinco", dias_sem_toque: 0 }),
      linha({ lead_id: id(6), nome: "Seis", dias_sem_toque: 6 }),
      linha({ lead_id: id(7), nome: "Fundo", dias_sem_toque: 30, camada: "fundo" }),
    ];
    expect(maisParados(linhas).map((l) => l.nome)).toEqual([
      "Três",
      "Seis",
      "Dois",
      "Quatro",
      "Um",
    ]);
  });

  it("escolhido parado precisa de toque até o último contato + 5 dias", () => {
    const movimento = "2026-10-01T10:00:00.000Z";
    expect(prazoParaManter(movimento, 5)?.toISOString()).toBe("2026-10-06T10:00:00.000Z");
    expect(prazoParaManter(null, 5)).toBeNull();
  });

  it("tom do contador: verde, âmbar na trava da roleta, vermelho lotado", () => {
    const c = { teto: 65, trava_roleta: 60 };
    expect(tomContador({ ...c, em_atendimento: 12 })).toBe("ok");
    expect(tomContador({ ...c, em_atendimento: 60 })).toBe("alerta");
    expect(tomContador({ ...c, em_atendimento: 65 })).toBe("lotado");
  });

  it("fail-closed: contador malformado derruba", () => {
    expect(parseContador(null)).toBeNull();
    expect(() => parseContador({ em_atendimento: "48" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

const contador = (p: Partial<ContadorEmAtendimento> = {}): ContadorEmAtendimento => ({
  corretor_id: id(9),
  corretor: true,
  modo: "sombra",
  em_atendimento: 48,
  teto: 65,
  trava_roleta: 60,
  lotado: false,
  escolhidos: 3,
  minha_base: 120,
  teto_base: 150,
  retorno_max_dias: 30,
  dias_sem_toque: 5,
  ...p,
});

const estado = vi.hoisted(() => ({
  contador: { data: undefined as unknown, isPending: false },
  meus: { data: undefined as unknown, isPending: false },
  registrarRetorno: vi.fn(),
  trocarVaga: vi.fn(),
  escolher: vi.fn(),
  invalidar: vi.fn(),
}));
vi.mock("@/features/em-atendimento/use-em-atendimento", () => ({
  useEmAtendimentoContador: () => estado.contador,
  useMeus65: () => estado.meus,
  registrarRetorno: estado.registrarRetorno,
  trocarVaga: estado.trocarVaga,
  escolherEmAtendimento: estado.escolher,
  invalidarEmAtendimento: estado.invalidar,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "00000009-0000-4000-8000-000000000000" } }),
  useUserRoles: () => ({ isAdmin: false, isGestor: false, isSuperintendente: false, isSdr: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  // Mantém os atributos do chip (testid, tom, título); `search`/`params`
  // não são atributos de <a>.
  Link: ({
    children,
    to,
    search: _search,
    params: _params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    search?: unknown;
    params?: unknown;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { nome: "Novo Lead" } }) }),
      }),
    }),
  },
}));

import { ContadorEmAtendimento as Contador } from "@/features/em-atendimento/contador-chip";
import { RetornoDialog } from "@/features/em-atendimento/retorno-dialog";
import { JanelaTroca } from "@/features/em-atendimento/janela-troca";
import { DesfechosEmAtendimento } from "@/features/em-atendimento/desfechos-em-atendimento";
import { Meus65Page } from "@/features/em-atendimento/meus-65-page";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  estado.contador.data = undefined;
  estado.meus.data = undefined;
  estado.registrarRetorno.mockReset();
  estado.trocarVaga.mockReset();
  estado.escolher.mockReset();
  estado.invalidar.mockReset();
});

const lead = { id: id(1), nome: "Carla Cliente", status: "em_atendimento", corretor_id: id(9) };

describe("ContadorEmAtendimento", () => {
  it("mostra X/65 com o tom, e some para conta sem papel de corretor", () => {
    estado.contador.data = contador({ em_atendimento: 62 });
    const a = montar(<Contador />);
    const chip = screen.getByTestId("contador-em-atendimento");
    expect(chip.textContent).toContain("62/65");
    expect(chip.getAttribute("data-tom")).toBe("alerta");
    expect(chip.getAttribute("href")).toBe("/meus-65");
    a.unmount();

    estado.contador.data = contador({ em_atendimento: 65, lotado: true });
    const b = montar(<Contador />);
    const lotado = screen.getByTestId("contador-em-atendimento");
    expect(lotado.textContent).toContain("lotado");
    expect(lotado.getAttribute("data-tom")).toBe("lotado");
    b.unmount();

    estado.contador.data = contador({ corretor: false });
    montar(<Contador />);
    expect(screen.queryByTestId("contador-em-atendimento")).toBeNull();
  });
});

describe("DesfechosEmAtendimento", () => {
  it("cinco botões; cada um abre o formulário certo", () => {
    const onPickModal = vi.fn();
    const onPickPerdido = vi.fn();
    montar(
      <DesfechosEmAtendimento
        lead={lead}
        gestao={false}
        onPickModal={onPickModal}
        onPickPerdido={onPickPerdido}
      />,
    );
    const bloco = screen.getByTestId("desfechos-em-atendimento");
    expect(within(bloco).getAllByRole("button")).toHaveLength(5);
    fireEvent.click(within(bloco).getByText("Pediu retorno"));
    expect(onPickModal).toHaveBeenCalledWith("pediu_retorno", "aguardando_retorno");
    fireEvent.click(within(bloco).getByText("Mandou doc"));
    expect(onPickModal).toHaveBeenCalledWith("analise_credito", "analise_credito");
    fireEvent.click(within(bloco).getByText("Perdido"));
    expect(onPickPerdido).toHaveBeenCalled();
  });
});

describe("RetornoDialog", () => {
  it("avisa quando a data passa de 30 dias e grava o desfecho com a data", async () => {
    estado.contador.data = contador();
    estado.registrarRetorno.mockResolvedValue({
      destino: "perdido",
      categoria: "retorno_futuro",
      retorno_em: new Date(Date.now() + 45 * DIA).toISOString(),
      proprio: false,
    });
    const onDone = vi.fn();
    montar(
      <RetornoDialog lead={lead} tipo="pediu_retorno" onOpenChange={vi.fn()} onDone={onDone} />,
    );

    expect(screen.queryByTestId("retorno-aviso-futuro")).toBeNull();
    fireEvent.change(screen.getByLabelText("Retornar em *"), {
      target: { value: paraInputData(new Date(Date.now() + 45 * DIA)) },
    });
    expect(screen.getByTestId("retorno-aviso-futuro").textContent).toContain("Retorno futuro");

    fireEvent.click(screen.getByText("Confirmar"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const chamada = estado.registrarRetorno.mock.calls[0][0];
    expect(chamada.leadId).toBe(lead.id);
    expect(chamada.tipo).toBe("pediu_retorno");
    expect(chamada.data).toBeInstanceOf(Date);
    expect(estado.invalidar).toHaveBeenCalled();
  });
});

describe("JanelaTroca", () => {
  it("sugere os 5 mais parados e troca: sai com retorno, entra o novo", async () => {
    estado.contador.data = contador({ em_atendimento: 65, lotado: true });
    estado.meus.data = [
      linha({ lead_id: id(11), nome: "Parado 9", dias_sem_toque: 9 }),
      linha({ lead_id: id(12), nome: "Parado 1", dias_sem_toque: 1 }),
      linha({ lead_id: id(13), nome: "Parado 7", dias_sem_toque: 7 }),
      linha({ lead_id: id(14), nome: "Parado 4", dias_sem_toque: 4 }),
      linha({ lead_id: id(15), nome: "Parado 6", dias_sem_toque: 6 }),
      linha({ lead_id: id(16), nome: "Parado 0", dias_sem_toque: 0 }),
    ];
    estado.trocarVaga.mockResolvedValue({
      ok: true,
      entra: id(1),
      sai: id(11),
      desfecho: "pediu_retorno",
    });
    const onDone = vi.fn();
    montar(
      <JanelaTroca
        entra={{ id: id(1), nome: "Carla Cliente" }}
        onOpenChange={vi.fn()}
        onDone={onDone}
      />,
    );

    const janela = screen.getByTestId("janela-troca");
    expect(janela.textContent).toContain("65/65");
    const candidatos = within(janela).getAllByTestId("troca-candidato");
    expect(candidatos.map((c) => c.textContent)).toEqual([
      expect.stringContaining("Parado 9"),
      expect.stringContaining("Parado 7"),
      expect.stringContaining("Parado 6"),
      expect.stringContaining("Parado 4"),
      expect.stringContaining("Parado 1"),
    ]);

    // Sem escolher quem sai, não troca.
    expect((within(janela).getByText("Trocar") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(candidatos[0]);
    fireEvent.click(within(janela).getByText("Trocar"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const chamada = estado.trocarVaga.mock.calls[0][0];
    expect(chamada).toMatchObject({ entra: id(1), sai: id(11), desfecho: "pediu_retorno" });
    expect(chamada.data).toBeInstanceOf(Date);
  });
});

describe("Meus65Page", () => {
  it("placar, lista na ordem da disputa, prazo do escolhido e a escolha", async () => {
    estado.contador.data = contador({ em_atendimento: 3, escolhidos: 1 });
    estado.meus.data = [
      linha({
        lead_id: id(21),
        nome: "Escolhida",
        escolhido: true,
        posicao: 1,
        dias_sem_toque: 3,
        movimento: "2026-10-01T10:00:00.000Z",
      }),
      linha({ lead_id: id(22), nome: "Segundo", posicao: 2 }),
      linha({
        lead_id: id(23),
        nome: "Parado",
        posicao: null,
        acao: "perde_vaga",
        dias_sem_toque: 8,
      }),
    ];
    estado.escolher.mockResolvedValue({ ok: true, escolhido: true, escolhidos: 2, teto: 65 });
    montar(<Meus65Page />);

    expect(screen.getByTestId("meus-65-placar").textContent).toContain("3/65");
    const linhas = screen.getAllByTestId("meus-65-linha");
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain("toque até 06/10 para manter");
    expect(linhas[2].textContent).toContain("perde a vaga");
    expect(screen.getByText(/não segura o relógio/)).toBeTruthy();

    fireEvent.click(within(linhas[1]).getByRole("checkbox"));
    await waitFor(() => expect(estado.escolher).toHaveBeenCalledWith(id(22), true));
  });

  it("gestão olhando outro corretor: leitura, sem a escolha", () => {
    estado.contador.data = contador({ corretor_id: id(8) });
    estado.meus.data = [linha({ lead_id: id(22), nome: "Segundo", posicao: 2 })];
    montar(<Meus65Page corretorId={id(8)} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fiação: as telas passam pelas mesmas peças
// ---------------------------------------------------------------------------

describe("fiação", () => {
  it("a mutação de etapa abre a janela de troca na trava, em vez do toast", () => {
    const hook = read("src/hooks/use-lead-status.ts");
    expect(hook).toContain("if (janela && erroLotado(err)) {");
    expect(hook.indexOf("janela.abrir(")).toBeLessThan(hook.indexOf("toast.error(err.message"));
  });

  it("a janela mora uma vez, no layout autenticado", () => {
    expect(read("src/routes/_authenticated/route.tsx")).toContain("<JanelaTrocaProvider>");
  });

  it("Kanban e ficha só oferecem os desfechos para sair de Em atendimento", () => {
    for (const p of [
      "src/components/leads-kanban-board.tsx",
      "src/routes/_authenticated/leads.$leadId.tsx",
    ]) {
      const src = read(p);
      expect(src).toContain("if (!saidaOferecida(lead.status, target)) {");
      expect(src).toContain("resolveStageAction(target, lead.status)");
    }
    expect(read("src/components/lead-stage-menu.tsx")).toContain("DESFECHOS_EM_ATENDIMENTO");
    expect(read("src/components/lead-stage/lead-stage-modals.tsx")).toContain(
      'modal === "esfriou"',
    );
  });
});

// ---------------------------------------------------------------------------
// Correções da revisão adversarial (docs §7.5)
// ---------------------------------------------------------------------------

describe("revisão: janela de troca", () => {
  it("avisa quando a data de quem sai passa de 30 dias", async () => {
    estado.contador.data = contador({ em_atendimento: 65, lotado: true });
    estado.meus.data = [linha({ lead_id: id(11), nome: "Parado 9", dias_sem_toque: 9 })];
    montar(
      <JanelaTroca
        entra={{ id: id(1), nome: "Carla Cliente" }}
        onOpenChange={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("troca-aviso-futuro")).toBeNull();
    fireEvent.change(screen.getByLabelText("Retornar em *"), {
      target: { value: paraInputData(new Date(Date.now() + 45 * DIA)) },
    });
    expect(screen.getByTestId("troca-aviso-futuro").textContent).toContain("Retorno futuro");
  });
});

describe("revisão: Meus 65", () => {
  it("erro de verdade mostra a mensagem; conta sem teto não vê placar 0/65", () => {
    estado.contador.data = contador({ corretor: false });
    estado.meus.data = [];
    montar(<Meus65Page />);
    expect(screen.getByTestId("meus-65-sem-teto")).toBeTruthy();
    expect(screen.queryByTestId("meus-65-placar")).toBeNull();
  });
});

describe("revisão: fiação", () => {
  it("Kanban mostra a ocupação do banco, não a contagem filtrada pela busca", () => {
    const k = read("src/components/leads-kanban-board.tsx");
    expect(k).toContain("· {ocupacao65}/{teto65}");
    expect(k).toContain("`${column.label} · ${ocupacao65}/${teto65}`");
    expect(k).not.toContain("{quantidade}/{teto65}");
  });

  it("o contato é uma RPC (interação + passo numa transação); a etapa é consequência", () => {
    // Fatia 3a.2 substituiu iniciar_atendimento_lead por registrar_contato_lead:
    // a tela nunca grava a interação direto nem escolhe Em atendimento.
    const m = read("src/features/leads/use-lead-mutations.ts");
    expect(m).toContain('rpc("registrar_contato_lead", {');
    expect(m).not.toContain("iniciar_atendimento_lead");
    expect(m).not.toContain("Contato inicial via WhatsApp");
    const d = read("src/components/registrar-contato-dialog.tsx");
    expect(d).toContain('rpc("registrar_contato_lead", {');
    // Teto cheio: o contato fica gravado (não é erro) e a janela de troca abre.
    expect(d).toContain("if (r.lotado && !r.entrou && janela) {");
    // A troca ainda leva um contato para quem entra quando o pedido vem com um.
    expect(read("src/features/em-atendimento/janela-troca.tsx")).toContain(
      "contato: entra.contato ?? null",
    );
    expect(read("src/features/em-atendimento/use-em-atendimento.ts")).toContain(
      "_contato_tipo: input.contato ?? null",
    );
  });

  it("Fila Única e cadência abrem a janela na trava", () => {
    expect(read("src/features/fila-unica/use-desfecho.ts")).toContain(
      "janela.abrir({ id: vars.item.lead.id",
    );
    expect(read("src/features/cadencia/fila-view.tsx")).toContain(
      "janela.abrir({ id: item.id, nome: item.nome",
    );
  });
});
