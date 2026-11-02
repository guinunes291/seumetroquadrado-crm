// Venda por contrato (IA) — a TELA: anexar → leitura → formulário preenchido
// → cliente encontrado → "atual → novo" → cadastro de venda já preenchido.
// A regra de banco mora em tests/db/venda-contrato.test.ts; a validação pura
// em tests/venda-contrato.test.ts. Dados fictícios.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ExtracaoContratoSchema,
  normalizarLeituraContrato,
  type LeituraContrato,
} from "@/features/vendas/contrato-venda";

const CPF_OK = "52998224725";
const CLIENTE_MAE = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";

const leituraOk = (): LeituraContrato =>
  normalizarLeituraContrato(
    ExtracaoContratoSchema.parse({
      comprador: {
        nome: "MARIA EXEMPLO",
        cpf: "529.982.247-25",
        email: "maria@exemplo.com",
        telefone: "11912345678",
        profissao: "VENDEDORA",
      },
      venda: {
        construtora: "Vibra Residencial",
        empreendimento: "Vibra Exemplo",
        unidade: "B0101",
        valor_venda: 351100,
        data_assinatura: "2026-10-27",
      },
      confianca: 0.9,
    }),
    "2026-11-01",
  );

const mocks = vi.hoisted(() => ({
  ler: vi.fn(),
  achar: vi.fn(),
  atuais: vi.fn(),
  resolver: vi.fn(),
  finalizar: vi.fn(),
  roles: { isAdmin: false, isGestor: false, isSuperintendente: false, isCorretor: true },
  vendaProps: null as null | Record<string, unknown>,
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/contrato-venda-ia.functions", () => ({ lerContratoVenda: mocks.ler }));
vi.mock("@/lib/telefone-corretor.functions", () => ({
  validarTelefoneCliente: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/features/vendas/extrair-contrato", () => ({
  prepararContrato: vi.fn(async () => ({
    totalPaginas: 3,
    texto: "=== Página 1 ===\nQUADRO RESUMO",
    imagens: [],
    paginasEnviadas: [1],
  })),
}));
vi.mock("@/features/vendas/cliente-contrato", async (orig) => ({
  ...(await orig<typeof import("@/features/vendas/cliente-contrato")>()),
  acharClienteDoContrato: mocks.achar,
  carregarDadosAtuais: mocks.atuais,
  resolverClienteDaVenda: mocks.resolver,
  finalizarVendaContrato: mocks.finalizar,
}));
vi.mock("@/features/leads/novo-lead-queries", () => ({
  useCorretoresParaAtribuir: () => ({ data: [{ id: "corretor-2", nome: "Bruno" }] }),
  criarLeadDedup: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "corretor-1" } }),
  useUserRoles: () => mocks.roles,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
// O cadastro de venda de verdade tem testes próprios: aqui só se confere o que
// a venda por contrato entrega para ele.
vi.mock("@/components/registrar-venda-dialog", () => ({
  VendaEtapasDialog: (props: Record<string, unknown>) => {
    mocks.vendaProps = props;
    const resolver = props.resolverLead as () => Promise<{ id: string }>;
    return (
      <button data-testid="registrar-stub" onClick={() => void resolver()}>
        Registrar venda (stub)
      </button>
    );
  },
}));

import { VendaContratoDialog } from "@/features/vendas/venda-contrato-dialog";

function abrir(leadFixo?: Record<string, unknown>) {
  const qc = new QueryClient();
  const r = render(
    <QueryClientProvider client={qc}>
      <VendaContratoDialog open onOpenChange={() => {}} leadFixo={leadFixo as never} />
    </QueryClientProvider>,
  );
  return r;
}

function anexar() {
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "contrato.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

// O rótulo ganha " conferir" quando a IA não achou o campo (o leitor de tela
// também anuncia isso).
const rotulo = (r: string) =>
  new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(conferir)?$`);
const valor = (r: string) => (screen.getByLabelText(rotulo(r)) as HTMLInputElement).value;

afterEach(() => {
  cleanup();
  for (const m of [mocks.ler, mocks.achar, mocks.atuais, mocks.resolver, mocks.finalizar])
    m.mockReset();
  mocks.vendaProps = null;
  mocks.roles = { isAdmin: false, isGestor: false, isSuperintendente: false, isCorretor: true };
});

describe("Venda por contrato: corretor", () => {
  it("dois contratos consecutivos resolvem clientes diferentes sem reutilizar a venda anterior", async () => {
    mocks.ler.mockResolvedValue(leituraOk());
    mocks.achar.mockResolvedValue({ tipo: "nenhum" });
    mocks.resolver
      .mockResolvedValueOnce({ leadId: LEAD, corretorId: "corretor-1", criado: true })
      .mockResolvedValueOnce({ leadId: CLIENTE_MAE, corretorId: "corretor-1", criado: true });
    const view = abrir();
    anexar();
    fireEvent.click(await screen.findByText("Cadastrar cliente novo"));
    fireEvent.click(screen.getByText("Continuar para a venda"));
    await screen.findByTestId("registrar-stub");
    const resolverPrimeiro = mocks.vendaProps?.resolverLead as () => Promise<{ id: string }>;
    expect((await resolverPrimeiro()).id).toBe(LEAD);
    expect((await resolverPrimeiro()).id).toBe(LEAD);
    expect(mocks.resolver).toHaveBeenCalledTimes(1);

    // O diálogo global permanece montado depois de registrar/fechar.
    const qc = new QueryClient();
    view.rerender(<QueryClientProvider client={qc}>
      <VendaContratoDialog open={false} onOpenChange={() => {}} />
    </QueryClientProvider>);
    const segundo = leituraOk();
    segundo.cliente = { ...segundo.cliente, nome: "Lucas Exemplo", telefone: "11987654321" };
    mocks.ler.mockResolvedValue(segundo);
    view.rerender(<QueryClientProvider client={qc}>
      <VendaContratoDialog open onOpenChange={() => {}} />
    </QueryClientProvider>);
    anexar();
    fireEvent.click(await screen.findByText("Cadastrar cliente novo"));
    fireEvent.click(screen.getByText("Continuar para a venda"));
    await screen.findByTestId("registrar-stub");
    const resolverSegundo = mocks.vendaProps?.resolverLead as () => Promise<{ id: string }>;
    expect((await resolverSegundo()).id).toBe(CLIENTE_MAE);
    expect(mocks.resolver).toHaveBeenCalledTimes(2);
    expect(mocks.resolver.mock.calls[1]?.[1]).toMatchObject({
      nome: "Lucas Exemplo", telefone: "11987654321",
    });
  });

  it("lê o contrato, preenche o comprador e marca o que a IA não achou", async () => {
    mocks.ler.mockResolvedValue(leituraOk());
    mocks.achar.mockResolvedValue({ tipo: "nenhum" });
    abrir();
    anexar();
    await screen.findByText("Dados do comprador");
    expect(valor("Nome")).toBe("Maria Exemplo");
    expect(valor("CPF")).toBe("529.982.247-25");
    expect(valor("Profissão")).toBe("Vendedora");
    // RG não veio: vazio e marcado "conferir"
    expect(valor("RG")).toBe("");
    expect(screen.getAllByText("conferir").length).toBeGreaterThan(0);
    expect(mocks.achar).toHaveBeenCalledWith(expect.objectContaining({ cpf: CPF_OK }), false);
  });

  it("cliente de outra carteira: confirma, vira registro filho e a venda abre preenchida", async () => {
    mocks.ler.mockResolvedValue(leituraOk());
    mocks.achar.mockResolvedValue({
      tipo: "oportunidade",
      matchPor: "cpf",
      oportunidade: {
        encontrado: true,
        cliente_id: CLIENTE_MAE,
        match_por: "cpf",
        nome: "Maria Exemplo",
        ja_na_carteira: false,
        meu_lead_id: null,
        bloqueado: false,
        motivo_bloqueio: null,
        em_outra_carteira: true,
        campos_herdados: [],
      },
    });
    mocks.resolver.mockResolvedValue({ leadId: LEAD, corretorId: "corretor-1", criado: true });
    abrir();
    anexar();
    fireEvent.click(await screen.findByText("Sim, é ele"));
    expect(screen.getByText("Dados do contrato que entram no seu registro")).toBeTruthy();

    fireEvent.click(screen.getByText("Continuar para a venda"));
    const stub = await screen.findByTestId("registrar-stub");
    expect(mocks.vendaProps?.prefill).toMatchObject({
      construtora: "Vibra Residencial",
      unidade: "B0101",
      valorVenda: 351100,
      dataAssinatura: "2026-10-27",
    });
    // Nada gravado até registrar a venda
    expect(mocks.resolver).not.toHaveBeenCalled();
    fireEvent.click(stub);
    await waitFor(() => expect(mocks.resolver).toHaveBeenCalledTimes(1));
    const [decisao] = mocks.resolver.mock.calls[0];
    expect(decisao).toMatchObject({ tipo: "registro_filho", clienteId: CLIENTE_MAE });
    expect(decisao.campos).toContain("cpf");
    expect(decisao.campos).not.toContain("telefone"); // identidade é da mãe

    // Segundo clique (venda falhou e o corretor tentou de novo): não recria
    fireEvent.click(stub);
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.resolver).toHaveBeenCalledTimes(1);
  });

  it("negociação avançada com outro corretor bloqueia o avanço", async () => {
    mocks.ler.mockResolvedValue(leituraOk());
    mocks.achar.mockResolvedValue({
      tipo: "oportunidade",
      matchPor: "telefone",
      oportunidade: {
        encontrado: true,
        cliente_id: CLIENTE_MAE,
        match_por: "telefone",
        nome: "Maria Exemplo",
        ja_na_carteira: false,
        meu_lead_id: null,
        bloqueado: true,
        motivo_bloqueio: "negociacao_avancada",
        em_outra_carteira: true,
        campos_herdados: [],
      },
    });
    abrir();
    anexar();
    await screen.findByText(/negociação avançada com outro corretor/);
    expect(screen.queryByText("Sim, é ele")).toBeNull();
    expect(
      (screen.getByText("Continuar para a venda").closest("button") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("leitura falhou: segue manual, e cliente novo exige telefone", async () => {
    const { toast } = await import("sonner");
    mocks.ler.mockRejectedValue(new Error("gateway fora"));
    abrir();
    anexar();
    await screen.findByText("Dados do comprador");
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("gateway fora"));
    expect(valor("Nome")).toBe("");
    fireEvent.click(screen.getByText("Cadastrar cliente novo"));
    fireEvent.change(screen.getByLabelText(rotulo("Nome")), { target: { value: "Ana Exemplo" } });
    fireEvent.click(screen.getByText("Continuar para a venda"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Informe o telefone do cliente (DDD + número)."),
    );
    expect(mocks.vendaProps).toBeNull();
  });
});

describe("Venda por contrato: pelo card do lead", () => {
  it("mostra atual → novo: campo vazio vem marcado, valor diferente o usuário decide", async () => {
    mocks.ler.mockResolvedValue(leituraOk());
    mocks.atuais.mockResolvedValue({
      nome: "Maria Exemplo",
      telefone: "(11) 91234-5678",
      email: "antigo@exemplo.com",
      cpf: "",
    });
    mocks.resolver.mockResolvedValue({ leadId: LEAD, corretorId: "corretor-1", criado: false });
    abrir({
      id: LEAD,
      nome: "Maria Exemplo",
      telefone: null,
      email: null,
      corretor_id: "corretor-1",
      projeto_id: null,
      projeto_nome: null,
      status: "em_atendimento",
    });
    anexar();
    await screen.findByText("O que o contrato atualiza no cadastro");
    expect(mocks.achar).not.toHaveBeenCalled();
    // e-mail diferente aparece riscado → novo, desmarcado
    expect(screen.getByText("antigo@exemplo.com")).toBeTruthy();
    fireEvent.click(screen.getByText("Continuar para a venda"));
    fireEvent.click(await screen.findByTestId("registrar-stub"));
    await waitFor(() => expect(mocks.resolver).toHaveBeenCalled());
    const [decisao] = mocks.resolver.mock.calls[0];
    expect(decisao).toMatchObject({ tipo: "existente", leadId: LEAD });
    expect(decisao.campos).toEqual(expect.arrayContaining(["cpf", "profissao"]));
    expect(decisao.campos).not.toContain("email");
    expect(decisao.campos).not.toContain("nome"); // igual: nem aparece
  });
});
