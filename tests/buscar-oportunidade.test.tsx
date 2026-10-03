// "Buscar oportunidade" (registro mãe): o corretor acha o cliente que já existe
// e cria o SEU registro. A regra mora no banco (tests/db/registro-mae.test.ts);
// aqui se trava o que a tela faz com o que ele devolve.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  classificarBusca,
  oportunidadeSchema,
  rotulosHerdados,
  type Oportunidade,
} from "@/features/leads/oportunidade";

describe("classificarBusca", () => {
  it("e-mail, CPF formatado e telefone", () => {
    expect(classificarBusca(" Carla@Exemplo.com ")).toEqual({
      telefone: null,
      email: "carla@exemplo.com",
      cpf: null,
    });
    expect(classificarBusca("123.456.789-09")).toEqual({
      telefone: null,
      email: null,
      cpf: "12345678909",
    });
    expect(classificarBusca("(11) 98765-4321")).toEqual({
      telefone: "(11) 98765-4321",
      email: null,
      cpf: null,
    });
    // Curto demais para identificar alguém: não busca.
    expect(classificarBusca("1234")).toEqual({ telefone: null, email: null, cpf: null });
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

const mocks = vi.hoisted(() => ({
  buscar: vi.fn(),
  criar: vi.fn(),
}));
vi.mock("@/features/leads/oportunidade", async (orig) => ({
  ...(await orig<typeof import("@/features/leads/oportunidade")>()),
  buscarOportunidade: mocks.buscar,
  criarRegistroFilho: mocks.criar,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/leads/x">{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { BuscarOportunidade } from "@/features/leads/buscar-oportunidade";

const CLIENTE = "11111111-1111-4111-8111-111111111111";
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

function montar(props: { consultaInicial?: string | null; onCriado?: () => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BuscarOportunidade
        onCriado={props.onCriado ?? vi.fn()}
        consultaInicial={props.consultaInicial}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mocks.buscar.mockReset();
  mocks.criar.mockReset();
});

describe("BuscarOportunidade", () => {
  it("cliente existente: mostra o que vem pronto e cria o registro", async () => {
    mocks.buscar.mockResolvedValue(encontrado());
    mocks.criar.mockResolvedValue({ ok: true, lead_id: CLIENTE, ja_existia: false });
    const onCriado = vi.fn();
    montar({ onCriado });

    fireEvent.change(screen.getByPlaceholderText(/Telefone, e-mail ou CPF/), {
      target: { value: "11987654321" },
    });
    fireEvent.click(screen.getByText("Buscar"));

    const bloco = await screen.findByTestId("oportunidade-disponivel");
    expect(bloco.textContent).toContain("Carla Cliente");
    expect(bloco.textContent).toContain("renda, bairro");
    expect(bloco.textContent).toContain("não vêm junto");

    fireEvent.click(screen.getByText("Criar meu registro"));
    await waitFor(() => expect(onCriado).toHaveBeenCalled());
    expect(mocks.criar).toHaveBeenCalledWith(CLIENTE);
  });

  it("bloqueado: não oferece criar", async () => {
    mocks.buscar.mockResolvedValue(
      encontrado({ bloqueado: true, motivo_bloqueio: "negociacao_avancada" }),
    );
    montar({ consultaInicial: "11987654321" });
    expect(await screen.findByTestId("oportunidade-bloqueada")).toBeTruthy();
    expect(screen.queryByText("Criar meu registro")).toBeNull();
  });

  it("já é do corretor: aponta o lead", async () => {
    mocks.buscar.mockResolvedValue(
      encontrado({ ja_na_carteira: true, meu_lead_id: "22222222-2222-4222-8222-222222222222" }),
    );
    montar({ consultaInicial: "11987654321" });
    expect((await screen.findByTestId("oportunidade-ja-sua")).textContent).toContain(
      "já está na sua carteira",
    );
  });

  it("não encontrado: segue para o cadastro", async () => {
    mocks.buscar.mockResolvedValue({ encontrado: false });
    montar({ consultaInicial: "11911112222" });
    expect(await screen.findByTestId("oportunidade-nao-encontrada")).toBeTruthy();
    // A consulta inicial (vinda do cadastro duplicado) busca sozinha.
    expect(mocks.buscar).toHaveBeenCalledWith("11911112222");
  });
});
