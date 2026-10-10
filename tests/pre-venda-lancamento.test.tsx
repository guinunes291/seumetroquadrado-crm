// Pré-venda (SDR) na identidade Lançamento, com o dia real do SDR (decisões do
// dono em 10/10/2026): ele passa o dia no discador e entra no CRM para passar
// o cliente adiante. A regra mora no banco (tests/db/sdr-passagem.test.ts);
// aqui se trava a tela: o que a passagem exige antes de bater na RPC, o que o
// painel conta, e que a roleta aparece em número, nunca em nomes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { camposFaltandoPassagem, payloadPassagem, type FormPassagem } from "@/lib/sdr";
import type { PainelSdr as PainelDados } from "@/features/sdr/painel-client";
import {
  colunasDoPainel,
  etiquetasDaEntrega,
  rotuloSemana,
  textoRoleta,
} from "@/features/sdr/painel-derive";

const estado = vi.hoisted(() => ({
  passar: vi.fn(),
  confirmar: vi.fn(),
  prefill: vi.fn(),
  painel: vi.fn(),
  navigate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: estado.toast }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => estado.navigate,
  Link: ({ children, ...p }: { children: React.ReactNode; to: string }) => (
    <a href={p.to}>{children}</a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/features/sdr/client", () => ({
  useInvalidarSdr: () => vi.fn(),
  useZonaDoLead: () => ({ data: null, isPending: false }),
}));
vi.mock("@/features/sdr/painel-client", () => ({
  usePassarCliente: () => useMutation({ mutationFn: (p: unknown) => estado.passar(p) }),
  useRegistrarConfirmacao: () => useMutation({ mutationFn: (p: unknown) => estado.confirmar(p) }),
  usePrefillPassagem: (leadId: string | null | undefined) =>
    useQuery({
      queryKey: ["prefill", leadId],
      enabled: !!leadId,
      queryFn: () => estado.prefill(leadId),
    }),
  usePainelSdr: () => useQuery({ queryKey: ["painel"], queryFn: () => estado.painel() }),
}));

import { PassarClienteDialog } from "@/features/sdr/passar-cliente-dialog";
import { PainelSdr } from "@/features/sdr/painel-sdr";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  for (const f of [estado.passar, estado.confirmar, estado.prefill, estado.painel, estado.navigate])
    f.mockReset();
  estado.toast.success.mockReset();
  estado.toast.error.mockReset();
});

const futuro = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

function form(p: Partial<FormPassagem> = {}): FormPassagem {
  return {
    modo: "visita",
    nome: "Joana Prado",
    telefone: "11 97000-0001",
    renda: "3.200",
    tipoRenda: "CLT",
    fgts: "sim",
    decisor: "Com o cônjuge",
    restricaoCpf: "nao",
    resumo: "",
    zona: "Leste",
    local: "Estande Vila Matilde",
    inicio: "2030-01-10T10:00",
    ...p,
  };
}

describe("regras da passagem (as mesmas da RPC)", () => {
  it("visita completa passa; cada falta aparece com o nome do banco, na ordem", () => {
    expect(camposFaltandoPassagem(form())).toEqual([]);
    expect(
      camposFaltandoPassagem(
        form({ renda: " ", tipoRenda: "", fgts: null, restricaoCpf: null, zona: "Zona Leste" }),
      ),
    ).toEqual(["renda", "tipo de renda", "FGTS", "restrição no CPF", "zona"]);
    expect(camposFaltandoPassagem(form({ local: "", inicio: "" }))).toEqual([
      "endereço da visita",
      "data e hora",
    ]);
  });

  it("documentação não pede zona, endereço nem data", () => {
    expect(
      camposFaltandoPassagem(form({ modo: "documentacao", zona: null, local: "", inicio: "" })),
    ).toEqual([]);
  });

  it("o corpo da RPC: textos limpos, horário em ISO e nada de visita na documentação", () => {
    const p = payloadPassagem(form({ resumo: "  quer 2 dorms  " }));
    expect(p).toMatchObject({
      modo: "visita",
      renda: "3.200",
      tipo_renda: "CLT",
      fgts: "sim",
      restricao_cpf: "nao",
      resumo: "quer 2 dorms",
      zona: "Leste",
      local: "Estande Vila Matilde",
    });
    expect(p.inicio).toBe(new Date("2030-01-10T10:00").toISOString());
    const d = payloadPassagem(form({ modo: "documentacao" }));
    expect(d.local).toBeNull();
    expect(d.inicio).toBeNull();
  });
});

const PAINEL: PainelDados = {
  semana: { de: "2026-10-10", ate: "2026-10-16" },
  a_confirmar: [
    {
      agendamento_id: "a1",
      lead_id: "l1",
      nome: "Rafael Costa",
      telefone: "11 97000-0002",
      data_inicio: futuro(20),
      local: "Estande",
      status: "agendado",
      corretor_nome: "Bianca Torres",
    },
  ],
  confirmada: [
    {
      agendamento_id: "a2",
      lead_id: "l2",
      nome: "Paula Reis",
      telefone: null,
      data_inicio: futuro(30),
      local: "Estande",
      status: "confirmado",
      corretor_nome: "Lucas Moura",
    },
  ],
  realizada: [],
  pasta: [{ lead_id: "l3", nome: "Sérgio Lima", em: "2026-10-11T14:00:00Z", corretor_nome: "Ana" }],
  venda: [],
  reagendar: [
    {
      agendamento_id: "a4",
      lead_id: "l4",
      nome: "Carla Dias",
      telefone: "11 97000-0004",
      data_inicio: futuro(-30),
      local: null,
      status: "nao_compareceu",
      corretor_nome: "Ana",
    },
  ],
  sem_visita: [
    {
      lead_id: "l5",
      nome: "Diego Alves",
      telefone: null,
      status: "analise_credito",
      ultima_atividade_em: null,
    },
  ],
  ultima_entrega: {
    lead_id: "l1",
    nome: "Rafael Costa",
    corretor_nome: "Bianca Torres",
    renda_informada: "4.700",
    tipo_renda: "CLT",
    usa_fgts: true,
    restricao_cpf: "nao",
    sdr_entregue_em: "2026-10-10T12:00:00Z",
    proxima_visita: futuro(20),
    regra: "roleta_sdr",
  },
  base_total: 12,
  roleta: { aptos: 6, regra_semanal: true, sombra: false, zona_estrita: true },
};

describe("conta do painel", () => {
  it("cinco colunas na ordem do que paga, com a barra relativa à maior", () => {
    const c = colunasDoPainel(PAINEL);
    expect(c.map((x) => [x.rotulo, x.total])).toEqual([
      ["A confirmar", 1],
      ["Confirmada", 1],
      ["Realizada", 0],
      ["Pasta", 1],
      ["Venda", 0],
    ]);
    expect(c[0].fracao).toBe(1);
    expect(c[2].fracao).toBe(0);
    expect(c[0].destaque?.nome).toBe("Rafael Costa");
    expect(c[3].destaque?.detalhe).toBe("em análise desde 11/10");
  });

  it("a semana da folha é sábado a sexta", () => {
    expect(rotuloSemana(PAINEL.semana)).toBe("sáb 10/10 a sex 16/10");
  });

  it("a roleta é um número; sem aptos, diz para onde a visita vai", () => {
    expect(textoRoleta(PAINEL.roleta)).toMatchObject({
      numero: "6 corretores",
      alerta: false,
    });
    expect(textoRoleta(PAINEL.roleta).detalhe).toContain("regra semanal ativa");
    expect(textoRoleta({ ...PAINEL.roleta, aptos: 1, sombra: true }).numero).toBe("1 corretor");
    expect(textoRoleta({ ...PAINEL.roleta, aptos: 1, sombra: true }).detalhe).toContain("em teste");
    const zero = textoRoleta({ ...PAINEL.roleta, aptos: 0 });
    expect(zero.alerta).toBe(true);
    expect(zero.detalhe).toContain("time da zona");
    expect(textoRoleta({ ...PAINEL.roleta, aptos: 0, zona_estrita: false }).detalhe).toContain(
      "entrega manual",
    );
  });

  it("o lead entregue leva o que o corretor recebeu", () => {
    const t = etiquetasDaEntrega(PAINEL.ultima_entrega!);
    expect(t.slice(0, 4)).toEqual(["Renda 4.700", "CLT", "FGTS sim", "CPF sem restrição"]);
    expect(t[4]).toMatch(/^Visita /);
  });
});

describe("PassarClienteDialog", () => {
  const preencher = () => {
    fireEvent.change(screen.getByLabelText("Telefone *"), { target: { value: "11 97000-0009" } });
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Marcos Lima" } });
    fireEvent.change(screen.getByLabelText("Renda familiar *"), { target: { value: "3.200" } });
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Tipo de renda" })).getByText("CLT"),
    );
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "FGTS" })).getByText("Tem FGTS"));
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Quem decide" })).getByText("Sozinho(a)"),
    );
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Restrição no CPF" })).getByText("Não"),
    );
  };

  it("sem os obrigatórios não chama o banco e diz o que falta", () => {
    montar(<PassarClienteDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText("Agendar e passar ao corretor"));
    expect(estado.passar).not.toHaveBeenCalled();
    expect(screen.getByTestId("passagem-falta").textContent).toBe(
      "Falta: nome, telefone, renda, tipo de renda, FGTS, quem decide, restrição no CPF, zona, endereço da visita.",
    );
  });

  it("visita completa: a RPC recebe tudo; cliente de volta ao corretor de origem é dito", async () => {
    estado.passar.mockResolvedValue({
      ok: true,
      modo: "visita",
      lead_id: "l9",
      novo: false,
      puxado: true,
      corretor_origem_id: "b1",
      corretor_nome: "Bruno Reis",
      regra: "sdr_retorno_corretor_origem",
    });
    montar(<PassarClienteDialog open onOpenChange={() => {}} />);
    preencher();
    fireEvent.click(screen.getByRole("radio", { name: "Leste" }));
    fireEvent.change(screen.getByLabelText("Endereço da visita *"), {
      target: { value: "Estande Penha" },
    });
    expect(screen.getByTestId("passagem-falta").textContent).toBe("Tudo certo para passar.");
    fireEvent.click(screen.getByText("Agendar e passar ao corretor"));
    await waitFor(() => expect(estado.passar).toHaveBeenCalled());
    expect(estado.passar.mock.calls[0][0]).toMatchObject({
      modo: "visita",
      nome: "Marcos Lima",
      renda: "3.200",
      tipo_renda: "CLT",
      fgts: "sim",
      decisor: "Sozinho(a)",
      restricao_cpf: "nao",
      zona: "Leste",
      local: "Estande Penha",
    });
    await waitFor(() => expect(estado.toast.success).toHaveBeenCalled());
    expect(estado.toast.success.mock.calls[0][0]).toBe("Cliente voltou para Bruno Reis");
  });

  it("só documentação: sem zona e sem visita; o cliente novo abre na ficha", async () => {
    estado.passar.mockResolvedValue({
      ok: true,
      modo: "documentacao",
      lead_id: "l10",
      novo: true,
      puxado: false,
      corretor_origem_id: null,
    });
    montar(<PassarClienteDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Só documentação" }));
    expect(screen.queryByLabelText("Endereço da visita *")).toBeNull();
    preencher();
    fireEvent.click(screen.getByText("Registrar para documentação"));
    await waitFor(() => expect(estado.passar).toHaveBeenCalled());
    expect(estado.passar.mock.calls[0][0]).toMatchObject({ modo: "documentacao", local: null });
    await waitFor(() =>
      expect(estado.navigate).toHaveBeenCalledWith({
        to: "/leads/$leadId",
        params: { leadId: "l10" },
      }),
    );
  });

  it("aberta da ficha: começa com o que ela sabe e não deixa trocar nome e telefone", async () => {
    estado.prefill.mockResolvedValue({
      nome: "Carla Dias",
      telefone: "11 97000-0004",
      renda: "2.900",
      tipoRenda: "Autônomo",
      fgts: "nao",
      decisor: "Com a mãe",
      restricaoCpf: "nao_sabe",
      resumo: "",
      zona: "Sul",
    });
    montar(<PassarClienteDialog open leadId="l4" onOpenChange={() => {}} />);
    await waitFor(() =>
      expect((screen.getByLabelText("Nome *") as HTMLInputElement).value).toBe("Carla Dias"),
    );
    expect((screen.getByLabelText("Telefone *") as HTMLInputElement).disabled).toBe(true);
    // Um "quem decide" fora dos atalhos aparece selecionado, não some.
    expect(screen.getByRole("radio", { name: "Com a mãe" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("radio", { name: "Sul" }).getAttribute("aria-checked")).toBe("true");

    // O banco recebe o próprio registro (nada de procurar pelo telefone).
    estado.passar.mockResolvedValue({
      ok: true,
      modo: "visita",
      lead_id: "l4",
      corretor_nome: "Ana",
    });
    fireEvent.change(screen.getByLabelText("Endereço da visita *"), {
      target: { value: "Estande" },
    });
    fireEvent.click(screen.getByText("Agendar e passar ao corretor"));
    await waitFor(() => expect(estado.passar).toHaveBeenCalled());
    expect(estado.passar.mock.calls[0][0]).toMatchObject({ lead_id: "l4", decisor: "Com a mãe" });
  });

  it("o erro do banco chega como mensagem", async () => {
    estado.passar.mockRejectedValue(
      Object.assign(new Error("nenhum corretor apto para receber a visita"), { code: "22023" }),
    );
    montar(<PassarClienteDialog open onOpenChange={() => {}} />);
    preencher();
    fireEvent.click(screen.getByRole("radio", { name: "Leste" }));
    fireEvent.change(screen.getByLabelText("Endereço da visita *"), { target: { value: "X" } });
    fireEvent.click(screen.getByText("Agendar e passar ao corretor"));
    await waitFor(() => expect(estado.toast.error).toHaveBeenCalled());
    expect(estado.toast.error.mock.calls[0][1]).toMatchObject({
      description: expect.stringContaining("nenhum corretor apto"),
    });
  });
});

describe("PainelSdr", () => {
  it("colunas, roleta em número sem nomes, lead entregue e as confirmações", async () => {
    estado.painel.mockResolvedValue(PAINEL);
    estado.confirmar.mockResolvedValue({ agendamento_id: "a1", data_inicio: futuro(20) });
    montar(<PainelSdr sdrId={null} podePassar onPassar={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId("coluna-pre-venda")).toHaveLength(5));

    const roleta = screen.getByRole("region", { name: "Roleta do SDR" });
    expect(within(roleta).getByTestId("roleta-numero").textContent).toBe("6 corretores");
    expect(within(roleta).getAllByTestId("ponto-roleta")).toHaveLength(6);
    // Nenhum nome ou inicial de corretor na roleta.
    expect(roleta.textContent).not.toMatch(/Bianca|Lucas|BT|LM/);

    const entrega = screen.getByRole("region", { name: "Lead entregue" });
    expect(entrega.textContent).toContain("Bianca Torres");
    expect(entrega.textContent).toContain("Renda 4.700");
    expect(entrega.textContent).toContain("CPF sem restrição");

    const linhas = screen.getAllByTestId("confirmacao");
    expect(linhas.map((l) => l.textContent?.includes("Rafael Costa"))).toEqual([true, false]);
    fireEvent.click(within(linhas[0]).getByText("Confirmou"));
    await waitFor(() =>
      expect(estado.confirmar).toHaveBeenCalledWith({
        agendamentoId: "a1",
        resultado: "confirmou",
        novoInicio: undefined,
      }),
    );
    expect(screen.getAllByText(/Agendar de novo|Agendar visita/)).toHaveLength(2);
  });

  it("para o admin (que acompanha), sem botões de passar cliente", async () => {
    estado.painel.mockResolvedValue(PAINEL);
    montar(<PainelSdr sdrId="s1" podePassar={false} onPassar={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId("coluna-pre-venda")).toHaveLength(5));
    expect(screen.queryByText(/Agendar de novo|Agendar visita/)).toBeNull();
  });
});

describe("tela e navegação", () => {
  const ler = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("o /sdr abre no painel com o título do módulo; a base inteira fica em ?tab=base", () => {
    const page = ler("src/features/sdr/sdr-page.tsx");
    expect(page).toContain(': "Pré-venda (SDR)";');
    expect(page).toContain(
      "<PainelSdr sdrId={sdrId} podePassar={podePassar} onPassar={() => setPassar(true)} />",
    );
    expect(page).toContain('tab === "base" ? (');
    expect(ler("src/routes/_authenticated/sdr.tsx")).toContain('"base", "reaquecer"');
    const nav = ler("src/features/nav/sistemas.ts");
    expect(nav).toContain('{ id: "base", label: "Painel", icon: Fire, to: "/sdr" }');
  });

  it("o SDR não vê 'contatos hoje' (ele liga do discador); o admin vê, com a ressalva", () => {
    const page = ler("src/features/sdr/sdr-page.tsx");
    expect(page).toContain("<RaioXView sdrId={sdrId} mostrarContatos={isAdmin} />");
    expect(page).toContain("as ligações do discador não entram");
  });

  it("toda visita do SDR pela ficha passa pela passagem (com renda, FGTS e CPF)", () => {
    expect(ler("src/routes/_authenticated/leads.$leadId.tsx")).toContain("<PassarClienteDialog");
    expect(ler("src/features/sdr/sdr-lead-card.tsx")).toContain("<PassarClienteDialog");
  });
});
