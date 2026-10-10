// "Buscar oportunidade" (registro mãe): a primeira tela do Novo lead do
// corretor. Ele busca o cliente por telefone, e-mail ou CPF; achou, cria o SEU
// registro; não achou, cadastra — e esse cadastro vira o cadastro mãe. A regra
// mora no banco (tests/db/registro-mae.test.ts); aqui se trava o que a tela
// faz com o que ele devolve.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  argumentosDaBusca,
  errosDaBusca,
  oportunidadeSchema,
  rotulosHerdados,
  type Oportunidade,
} from "@/features/leads/oportunidade";

const CPF_OK = "529.982.247-25";

describe("errosDaBusca", () => {
  const vazio = { telefone: "", email: "", cpf: "" };

  it("sem nenhum dos três: pede um", () => {
    expect(errosDaBusca(vazio).geral).toMatch(/telefone, o e-mail ou o CPF/);
    expect(errosDaBusca({ telefone: "  ", email: " ", cpf: "" }).geral).toBeDefined();
  });

  it("qualquer um dos três sozinho basta", () => {
    expect(errosDaBusca({ ...vazio, telefone: "(11) 98765-4321" })).toEqual({});
    expect(errosDaBusca({ ...vazio, email: "carla@exemplo.com" })).toEqual({});
    expect(errosDaBusca({ ...vazio, cpf: CPF_OK })).toEqual({});
  });

  it("campo preenchido errado impede, apontando qual", () => {
    expect(errosDaBusca({ ...vazio, telefone: "1234" })).toHaveProperty("telefone");
    expect(errosDaBusca({ ...vazio, email: "carla@" })).toHaveProperty("email");
    // Dígito verificador errado: um "não achou" por erro de digitação viraria
    // um cadastro mãe duplicado.
    expect(errosDaBusca({ ...vazio, cpf: "529.982.247-26" })).toHaveProperty("cpf");
    // Um certo e um errado: não busca pelo certo e esconde o errado.
    expect(
      Object.keys(errosDaBusca({ telefone: "(11) 98765-4321", email: "", cpf: "111" })),
    ).toEqual(["cpf"]);
  });
});

describe("argumentosDaBusca", () => {
  it("só o que foi preenchido; e-mail minúsculo e CPF em dígitos", () => {
    expect(argumentosDaBusca({ telefone: "(11) 98765-4321", email: "", cpf: "" })).toEqual({
      _telefone: "(11) 98765-4321",
      _email: null,
      _cpf: null,
    });
    expect(argumentosDaBusca({ telefone: "", email: " Carla@Exemplo.com ", cpf: CPF_OK })).toEqual({
      _telefone: null,
      _email: "carla@exemplo.com",
      _cpf: "52998224725",
    });
  });
});

describe("rótulos e validação", () => {
  it("traduz os campos e junta os repetidos (FGTS)", () => {
    expect(rotulosHerdados(["renda_informada", "usa_fgts", "tem_fgts", "bairro", "x"])).toEqual([
      "renda",
      "FGTS",
      "bairro",
    ]);
  });

  it("fail-closed: resposta malformada derruba", () => {
    expect(oportunidadeSchema.parse({ encontrado: false })).toEqual({ encontrado: false });
    expect(() =>
      oportunidadeSchema.parse({ encontrado: true, cliente_id: "x", match_por: "telefone" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// O diálogo de Novo lead, aberto pelo mesmo evento dos botões e do ⌘K.

const mocks = vi.hoisted(() => ({
  buscar: vi.fn(),
  criar: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn(),
  roles: { isAdmin: false, isGestor: false, isCorretor: true, isSdr: false },
}));
vi.mock("@/features/leads/oportunidade", async (orig) => ({
  ...(await orig<typeof import("@/features/leads/oportunidade")>()),
  buscarOportunidade: mocks.buscar,
  criarRegistroFilho: mocks.criar,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "corretor-1" } }),
  useUserRoles: () => mocks.roles,
}));
vi.mock("@/integrations/supabase/client", () => {
  // Leituras (e-mail duplicado, corretores): encadeiam e resolvem vazio.
  const leitura = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "order", "ilike", "limit"]) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      rpc: mocks.rpc,
      from: () => ({
        ...leitura(),
        update: (valores: unknown) => ({
          eq: async (coluna: string, id: string) => {
            mocks.update(valores, coluna, id);
            return { error: null };
          },
        }),
      }),
    },
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/leads/x">{children}</a>,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { abrirNovoLead, NovoLeadDialogHost } from "@/features/leads/novo-lead-dialog";

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const encontrado = (
  p: Partial<Extract<Oportunidade, { encontrado: true }>> = {},
): Oportunidade => ({
  encontrado: true,
  cliente_id: CLIENTE,
  match_por: "telefone",
  nome: "Carla Cliente",
  ja_na_carteira: false,
  meu_lead_id: null,
  bloqueado: false,
  motivo_bloqueio: null,
  em_outra_carteira: true,
  campos_herdados: ["renda_informada", "bairro"],
  ...p,
});

function abrir() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NovoLeadDialogHost />
    </QueryClientProvider>,
  );
  act(() => abrirNovoLead());
}

const digitar = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

afterEach(() => {
  cleanup();
  mocks.buscar.mockReset();
  mocks.criar.mockReset();
  mocks.rpc.mockReset();
  mocks.update.mockReset();
  mocks.roles = { isAdmin: false, isGestor: false, isCorretor: true, isSdr: false };
});

describe("Novo lead do corretor: a busca vem primeiro", () => {
  it("abre sempre na busca, com telefone, e-mail e CPF — sem o cadastro", () => {
    abrir();
    expect(screen.getByLabelText("Telefone")).toBeTruthy();
    expect(screen.getByLabelText("E-mail")).toBeTruthy();
    expect(screen.getByLabelText("CPF")).toBeTruthy();
    expect(screen.getByText("Buscar cliente")).toBeTruthy();
    expect(screen.queryByText("Nome *")).toBeNull();
    expect(screen.queryByText("Criar lead")).toBeNull();
  });

  it("sem nenhum dos três: pede um e não consulta o banco", () => {
    abrir();
    fireEvent.click(screen.getByText("Buscar cliente"));
    expect(screen.getByTestId("oportunidade-erro").textContent).toMatch(/telefone, o e-mail/);
    expect(mocks.buscar).not.toHaveBeenCalled();
  });

  it("CPF com dígito errado: aponta o campo e não consulta", () => {
    abrir();
    digitar("CPF", "52998224726");
    expect((screen.getByLabelText("CPF") as HTMLInputElement).value).toBe("529.982.247-26");
    fireEvent.click(screen.getByText("Buscar cliente"));
    expect(screen.getByText(/CPF inválido/)).toBeTruthy();
    expect(mocks.buscar).not.toHaveBeenCalled();
  });

  it("achou: cria o registro filho direto, sem passar pelo cadastro", async () => {
    mocks.buscar.mockResolvedValue(encontrado({ match_por: "cpf" }));
    mocks.criar.mockResolvedValue({ ok: true, lead_id: LEAD, ja_existia: false });
    abrir();
    digitar("CPF", CPF_OK);
    fireEvent.click(screen.getByText("Buscar cliente"));

    const bloco = await screen.findByTestId("oportunidade-disponivel");
    expect(mocks.buscar).toHaveBeenCalledWith({ telefone: "", email: "", cpf: CPF_OK });
    expect(bloco.textContent).toContain("Carla Cliente");
    expect(bloco.textContent).toContain("encontrado pelo CPF");
    expect(bloco.textContent).toContain("renda, bairro");
    expect(bloco.textContent).toContain("não vêm junto");

    // Com o resultado na tela, a ação é a dele: o "Buscar cliente" sai.
    expect(screen.queryByText("Buscar cliente")).toBeNull();
    fireEvent.click(screen.getByText("Criar meu registro"));
    await waitFor(() => expect(screen.queryByText("Novo lead")).toBeNull());
    expect(mocks.criar).toHaveBeenCalledWith(CLIENTE);
    expect(mocks.rpc).not.toHaveBeenCalled(); // nada de criar_lead_dedup
  });

  it("bloqueado: não cria e não abre o cadastro", async () => {
    mocks.buscar.mockResolvedValue(
      encontrado({ bloqueado: true, motivo_bloqueio: "negociacao_avancada" }),
    );
    abrir();
    digitar("Telefone", "11987654321");
    fireEvent.click(screen.getByText("Buscar cliente"));
    expect(await screen.findByTestId("oportunidade-bloqueada")).toBeTruthy();
    expect(screen.queryByText("Criar meu registro")).toBeNull();
    expect(screen.queryByText("Nome *")).toBeNull();
  });

  it("já é do corretor: aponta o lead", async () => {
    mocks.buscar.mockResolvedValue(
      encontrado({ ja_na_carteira: true, meu_lead_id: "22222222-2222-4222-8222-222222222222" }),
    );
    abrir();
    digitar("E-mail", "carla@exemplo.com");
    fireEvent.click(screen.getByText("Buscar cliente"));
    expect((await screen.findByTestId("oportunidade-ja-sua")).textContent).toContain(
      "já está na sua carteira",
    );
  });

  it("mudar o que foi buscado apaga o resultado antigo", async () => {
    mocks.buscar.mockResolvedValue(encontrado());
    abrir();
    digitar("Telefone", "11987654321");
    fireEvent.click(screen.getByText("Buscar cliente"));
    await screen.findByTestId("oportunidade-disponivel");
    digitar("Telefone", "11911112222");
    expect(screen.queryByTestId("oportunidade-disponivel")).toBeNull();
    expect(screen.getByText("Buscar cliente")).toBeTruthy();
  });

  it("não achou: o cadastro vem preenchido, vira o cadastro mãe e leva o CPF", async () => {
    mocks.buscar.mockResolvedValue({ encontrado: false });
    mocks.rpc.mockResolvedValue({ data: { duplicado: false, lead_id: LEAD }, error: null });
    abrir();
    digitar("Telefone", "11987654321");
    digitar("E-mail", "carla@exemplo.com");
    digitar("CPF", CPF_OK);
    fireEvent.click(screen.getByText("Buscar cliente"));

    expect((await screen.findByTestId("cadastro-mae")).textContent).toContain("cadastro mãe");
    expect(screen.getByDisplayValue("(11) 98765-4321")).toBeTruthy();
    expect(screen.getByDisplayValue("carla@exemplo.com")).toBeTruthy();
    expect(screen.getByDisplayValue(CPF_OK)).toBeTruthy();

    const [nome] = screen.getAllByRole("textbox");
    fireEvent.change(nome, { target: { value: "Carla Nova" } });
    fireEvent.click(screen.getByText("Criar lead"));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    // Conferência final com os três antes de criar.
    expect(mocks.buscar).toHaveBeenLastCalledWith({
      telefone: "(11) 98765-4321",
      email: "carla@exemplo.com",
      cpf: CPF_OK,
    });
    const [nomeRpc, args] = mocks.rpc.mock.calls[0];
    expect(nomeRpc).toBe("criar_lead_dedup");
    expect(args._payload).toMatchObject({
      nome: "Carla Nova",
      telefone: "(11) 98765-4321",
      email: "carla@exemplo.com",
      corretor_id: "corretor-1",
      status: "aguardando_atendimento",
    });
    expect(mocks.update).toHaveBeenCalledWith({ cpf: CPF_OK }, "id", LEAD);
  });

  it("conferência final: CPF mudado no cadastro acha o cliente e volta à busca", async () => {
    mocks.buscar
      .mockResolvedValueOnce({ encontrado: false })
      .mockResolvedValueOnce(encontrado({ match_por: "cpf" }));
    abrir();
    digitar("Telefone", "11987654321");
    fireEvent.click(screen.getByText("Buscar cliente"));
    await screen.findByTestId("cadastro-mae");

    const [nome] = screen.getAllByRole("textbox");
    fireEvent.change(nome, { target: { value: "Carla" } });
    fireEvent.change(screen.getByPlaceholderText("000.000.000-00"), {
      target: { value: CPF_OK },
    });
    fireEvent.click(screen.getByText("Criar lead"));

    expect((await screen.findByTestId("oportunidade-disponivel")).textContent).toContain(
      "encontrado pelo CPF",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("telefone acusado em outra carteira na criação: volta à busca e mostra o cliente", async () => {
    mocks.buscar
      .mockResolvedValueOnce({ encontrado: false }) // busca
      .mockResolvedValueOnce({ encontrado: false }) // conferência final
      .mockResolvedValueOnce(encontrado()); // depois do duplicado
    mocks.rpc.mockResolvedValue({
      data: { duplicado: true, lead_id: LEAD, na_carteira: false },
      error: null,
    });
    abrir();
    digitar("Telefone", "11987654321");
    fireEvent.click(screen.getByText("Buscar cliente"));
    await screen.findByTestId("cadastro-mae");
    const [nome] = screen.getAllByRole("textbox");
    fireEvent.change(nome, { target: { value: "Carla" } });
    fireEvent.click(screen.getByText("Criar lead"));

    expect(await screen.findByTestId("oportunidade-disponivel")).toBeTruthy();
    expect(mocks.buscar).toHaveBeenCalledTimes(3);
  });

  it("voltar à busca a partir do cadastro", async () => {
    mocks.buscar.mockResolvedValue({ encontrado: false });
    abrir();
    digitar("Telefone", "11987654321");
    fireEvent.click(screen.getByText("Buscar cliente"));
    await screen.findByTestId("cadastro-mae");
    fireEvent.click(screen.getByText("Voltar à busca"));
    expect((screen.getByLabelText("Telefone") as HTMLInputElement).value).toBe("(11) 98765-4321");
  });
});

describe("Novo lead da gestão: direto no cadastro", () => {
  it("gestor não passa pela busca (ela é do corretor no banco)", () => {
    mocks.roles = { isAdmin: false, isGestor: true, isCorretor: false, isSdr: false };
    abrir();
    expect(screen.getByText("Nome *")).toBeTruthy();
    expect(screen.getByText("Criar lead")).toBeTruthy();
    expect(screen.queryByText("Buscar cliente")).toBeNull();
    expect(screen.queryByTestId("cadastro-mae")).toBeNull();
    expect(screen.queryByPlaceholderText("000.000.000-00")).toBeNull();
  });
});
