// Venda por contrato — busca do cliente pela GESTÃO (bug de 01/11/2026): o
// cliente existia, mas a tela dizia "nenhum cliente". A busca por telefone
// filtrava no banco só os 4 últimos dígitos com limite de 20 linhas e conferia
// os 9 finais depois; numa base grande o cliente certo ficava fora das 20.
// Agora o banco recebe o sufixo de 9 dígitos em telefone_e164 e no texto cru
// (regras de lib/lead-busca-telefone). Dados fictícios.
import { afterEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  linhasLeads: [] as Linha[],
  chamadas: [] as { metodo: string; args: unknown[] }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (tabela: string) => {
    const filtros: { metodo: string; args: unknown[] }[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "is", "eq", "in", "ilike", "or", "limit"]) {
      b[m] = (...args: unknown[]) => {
        filtros.push({ metodo: m, args });
        mocks.chamadas.push({ metodo: `${tabela}.${m}`, args });
        return b;
      };
    }
    b.then = (ok: (v: unknown) => unknown) => {
      const or = filtros.find((f) => f.metodo === "or");
      let data: Linha[] = tabela === "profiles" ? [{ id: "corretor-1", nome: "Ingrid" }] : [];
      if (tabela === "leads" && or) {
        // Simula o PostgREST: só devolve quem termina com o sufixo pedido.
        const sufixo = String(or.args[0]).match(/%(\d+)/)?.[1] ?? "";
        data = mocks.linhasLeads.filter((l) =>
          [l.telefone, l.telefone_e164].some((t) =>
            String(t ?? "")
              .replace(/\D/g, "")
              .endsWith(sufixo),
          ),
        );
      }
      return Promise.resolve({ data, error: null }).then(ok);
    };
    return b;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});
vi.mock("@/features/dashboard/queries", () => ({ rpc: vi.fn() }));

import { acharClienteDoContrato } from "@/features/vendas/cliente-contrato";
import { CLIENTE_VAZIO } from "@/features/vendas/contrato-venda";

afterEach(() => {
  mocks.linhasLeads = [];
  mocks.chamadas = [];
});

describe("busca do cliente pela gestão", () => {
  it("acha pelo sufixo de 9 dígitos, com telefone salvo com máscara", async () => {
    mocks.linhasLeads = [
      // 30 leads que também terminam em "1214" — antes enchiam o limite de 20
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `outro-${i}`,
        nome: `Outro ${i}`,
        telefone: `(11) 9${String(1000 + i).padStart(4, "0")}-1214`,
        telefone_e164: `551190${String(1000 + i).padStart(3, "0")}1214`,
        corretor_id: null,
      })),
      {
        id: "lead-fabio",
        nome: "Fábio Exemplo",
        telefone: "(11) 91063-1214",
        telefone_e164: "5511910631214",
        corretor_id: "corretor-1",
      },
    ];
    const r = await acharClienteDoContrato({ ...CLIENTE_VAZIO, telefone: "11910631214" }, true);
    expect(r.tipo).toBe("candidatos");
    if (r.tipo !== "candidatos") return;
    expect(r.matchPor).toBe("telefone");
    expect(r.candidatos.map((c) => c.id)).toEqual(["lead-fabio"]);
    expect(r.candidatos[0].corretor_nome).toBe("Ingrid");
    expect(r.candidatos[0]).not.toHaveProperty("telefone_e164");
    const or = mocks.chamadas.find((c) => c.metodo === "leads.or");
    expect(or?.args[0]).toBe("telefone.ilike.%910631214,telefone_e164.ilike.%910631214");
  });

  it("número legado sem o 9º dígito cai no sufixo de 8", async () => {
    mocks.linhasLeads = [
      { id: "lead-fixo", nome: "Fixo", telefone: "11 1063-1214", telefone_e164: null },
    ];
    const r = await acharClienteDoContrato({ ...CLIENTE_VAZIO, telefone: "1110631214" }, true);
    expect(r.tipo === "candidatos" && r.candidatos.map((c) => c.id)).toEqual(["lead-fixo"]);
  });

  it("ninguém com o telefone: nenhum", async () => {
    mocks.linhasLeads = [{ id: "x", nome: "X", telefone: "(11) 95555-0000" }];
    const r = await acharClienteDoContrato({ ...CLIENTE_VAZIO, telefone: "11910631214" }, true);
    expect(r).toEqual({ tipo: "nenhum" });
  });
});
