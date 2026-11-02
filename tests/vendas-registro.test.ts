import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), consulta: vi.fn(), inserir: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { registrarVenda, type RegistrarVendaInput } from "@/lib/vendas";

const input: RegistrarVendaInput = {
  leadId: "lead-teste", corretorId: "corretor-teste", criadoPorId: "admin-teste",
  projetoId: null, projetoNome: null, valorVenda: 284952.30,
  dataAssinatura: "2026-10-30",
  split: { total: 3.4, corretor: 2.4, gerente: 0.4, superintendente: 0.6 },
};

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), limit: mocks.consulta, insert: mocks.inserir };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.consulta.mockResolvedValue({ data: [], error: null });
  mocks.inserir.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "venda-nova" }, error: null }) }) });
});

describe("registro compartilhado de vendas", () => {
  it("não insere outra venda quando o cliente já tem venda ativa", async () => {
    mocks.consulta.mockResolvedValue({ data: [{ id: "venda-existente" }], error: null });
    await expect(registrarVenda(input)).rejects.toThrow("já tem uma venda");
    expect(mocks.inserir).not.toHaveBeenCalled();
    const query = mocks.from.mock.results[0]?.value;
    expect(query.in).toHaveBeenCalledWith("status_venda", ["rascunho", "pendente", "aprovada"]);
  });

  it("registra venda pendente quando não há venda ativa", async () => {
    await expect(registrarVenda(input)).resolves.toBe("venda-nova");
    expect(mocks.inserir).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: "lead-teste", status_venda: "pendente", valor_venda: 284952.30,
    }));
  });

  it("mantém a proteção do banco quando outra sessão registra primeiro", async () => {
    mocks.inserir.mockReturnValue({ select: () => ({ single: async () => ({
      data: null, error: { code: "23505", message: 'duplicate key violates "uq_vendas_lead_ativa"' },
    }) }) });
    await expect(registrarVenda(input)).rejects.toThrow("já tem uma venda");
    expect(mocks.inserir).toHaveBeenCalledTimes(1);
  });

  it("bloqueia envio simultâneo e libera nova tentativa após falha", async () => {
    let liberar: ((value: { data: null; error: Error }) => void) | undefined;
    mocks.consulta.mockReturnValueOnce(new Promise((resolve) => { liberar = resolve; }));
    const primeira = registrarVenda(input);
    await expect(registrarVenda(input)).rejects.toThrow("já está em andamento");
    liberar?.({ data: null, error: new Error("consulta falhou") });
    await expect(primeira).rejects.toThrow("consulta falhou");
    await expect(registrarVenda(input)).resolves.toBe("venda-nova");
    expect(mocks.inserir).toHaveBeenCalledTimes(1);
  });

  it("não confunde outra restrição de unicidade com venda ativa", async () => {
    const error = { code: "23505", message: 'duplicate key violates "outra_restricao"' };
    mocks.inserir.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error }) }) });
    await expect(registrarVenda(input)).rejects.toEqual(error);
  });
});