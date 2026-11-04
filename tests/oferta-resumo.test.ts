import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
import { listOfertas, ofertasAtivasQueryOptions } from "@/lib/oferta-ativa";

beforeEach(() => vi.resetAllMocks());

describe("resumos da Oferta Ativa", () => {
  it("carrega totais exatos em uma chamada sem baixar os vínculos", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: "o1", nome: "Campanha", status: "ativa", filtros: {}, total_leads: 1501, total_contatados: 1200, total_avancados: 300 }], error: null });
    const ofertas = await listOfertas();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("listar_ofertas_ativas_resumo", { _arquivadas: false });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(ofertas[0]).toMatchObject({ totalLeads: 1501, totalContatados: 1200, totalAvancados: 300 });
  });
  it("solicita apenas arquivadas quando informado", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(listOfertas(true)).resolves.toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("listar_ofertas_ativas_resumo", { _arquivadas: true });
  });
  it("não oculta falha como totais vazios", async () => {
    const error = new Error("consulta falhou");
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(listOfertas()).rejects.toBe(error);
  });
  it("mantém ativas antes de rascunhos e concluídas", async () => {
    mocks.rpc.mockResolvedValue({ data: ["concluida", "rascunho", "ativa"].map((status) => ({ id: status, status, filtros: {}, total_leads: 0, total_contatados: 0, total_avancados: 0 })), error: null });
    const queryFn = ofertasAtivasQueryOptions.queryFn;
    if (typeof queryFn !== "function") throw new Error("Consulta ausente");
    const result = await queryFn({} as Parameters<typeof queryFn>[0]);
    expect(result.map((o) => o.status)).toEqual(["ativa", "rascunho", "concluida"]);
  });
});