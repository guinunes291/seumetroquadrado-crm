// Modo Obrigatório — a parte do front que decide a trava.
//
// Duas garantias: (1) o corretor travado só chega às rotas do processo, à
// ficha dos leads da lista e ao hub de projetos; (2) FAIL-OPEN — erro nosso
// (RPC ausente, payload estranho, rede) nunca tranca o time fora do CRM.
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/features/dashboard/queries", () => ({ rpc }));

import { lerModoObrigatorio, MODO_LIVRE } from "@/features/modo-obrigatorio/client";
import { rotaPermitidaTravado } from "@/features/modo-obrigatorio/rotas";
import { exigirProcessoObrigatorio } from "@/features/modo-obrigatorio/use-modo-obrigatorio";
import { SECOES_TRAVADO } from "@/features/modo-obrigatorio/nav";

afterEach(() => rpc.mockReset());

const LEAD = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

function lead(id = LEAD) {
  return {
    id,
    nome: "Maria Silva",
    telefone: "11987654321",
    email: null,
    status: "agendado",
    temperatura: "morno",
    ultima_interacao: null,
    proximo_followup: null,
    projeto_id: null,
    projeto_nome: null,
    created_at: "2026-09-20T12:00:00Z",
    corretor_id: "33333333-3333-4333-8333-333333333333",
    origem: "facebook",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
    proxima_acao: null,
    faixa_mcmv: null,
  };
}

function payload(travado: boolean) {
  return {
    gerado_em: "2026-09-27T12:00:00Z",
    aplica: true,
    travado,
    liberado_hoje: false,
    total: 1,
    itens: [
      {
        lead_id: LEAD,
        tipo: "fundo_parado",
        grupo: 4,
        ordem: 1,
        nome: "Maria Silva",
        status: "agendado",
        etapa: null,
        prazo: null,
        atrasado: null,
        dias_parado: 7,
        projeto_id: null,
        projeto_nome: null,
        motivo: "Parado há 7 dias",
        cadencia: null,
        lead: lead(),
      },
    ],
  };
}

describe("rotaPermitidaTravado", () => {
  it("libera o processo e o hub de projetos inteiro", () => {
    for (const p of [
      "/obrigatorio",
      "/projetos",
      "/projetos/abc",
      "/projetos-foco",
      "/projetos-materiais",
      "/vitrine",
    ]) {
      expect(rotaPermitidaTravado(p, [])).toBe(true);
    }
  });

  it("libera só a ficha dos leads que estão na lista", () => {
    expect(rotaPermitidaTravado(`/leads/${LEAD}`, [LEAD])).toBe(true);
    expect(rotaPermitidaTravado(`/leads/${OUTRO}`, [LEAD])).toBe(false);
  });

  it("fecha todo o resto", () => {
    for (const p of ["/fila", "/leads", "/inicio", "/cadencia", "/pipeline", "/meu-perfil", "/"]) {
      expect(rotaPermitidaTravado(p, [LEAD])).toBe(false);
    }
    // Prefixo parecido não é o hub de projetos.
    expect(rotaPermitidaTravado("/projetosx", [])).toBe(false);
  });

  it("o menu do travado aponta só para rotas permitidas", () => {
    for (const s of SECOES_TRAVADO) expect(rotaPermitidaTravado(s.to, [])).toBe(true);
  });
});

describe("lerModoObrigatorio (fail-open)", () => {
  it("lê o payload válido", async () => {
    rpc.mockResolvedValue({ data: payload(true), error: null });
    const m = await lerModoObrigatorio();
    expect(m.travado).toBe(true);
    expect(m.itens[0].lead.nome).toBe("Maria Silva");
  });

  it("erro da RPC não trava", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "não existe" } });
    expect(await lerModoObrigatorio()).toEqual(MODO_LIVRE);
  });

  it("payload inesperado não trava", async () => {
    rpc.mockResolvedValue({ data: { travado: true }, error: null });
    expect(await lerModoObrigatorio()).toEqual(MODO_LIVRE);
  });

  it("rede caindo não trava", async () => {
    rpc.mockRejectedValue(new Error("fetch failed"));
    expect(await lerModoObrigatorio()).toEqual(MODO_LIVRE);
  });
});

describe("exigirProcessoObrigatorio (beforeLoad)", () => {
  const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  it("travado fora das rotas permitidas redireciona para /obrigatorio", async () => {
    rpc.mockResolvedValue({ data: payload(true), error: null });
    await expect(exigirProcessoObrigatorio(qc(), "u1", "/fila")).rejects.toMatchObject({
      options: { to: "/obrigatorio" },
    });
  });

  it("travado na ficha de um lead da lista passa", async () => {
    rpc.mockResolvedValue({ data: payload(true), error: null });
    await expect(exigirProcessoObrigatorio(qc(), "u1", `/leads/${LEAD}`)).resolves.toBeUndefined();
  });

  it("não travado passa em qualquer rota", async () => {
    rpc.mockResolvedValue({ data: payload(false), error: null });
    await expect(exigirProcessoObrigatorio(qc(), "u1", "/fila")).resolves.toBeUndefined();
  });

  it("com a RPC fora do ar, passa (fail-open)", async () => {
    rpc.mockRejectedValue(new Error("fora do ar"));
    await expect(exigirProcessoObrigatorio(qc(), "u1", "/fila")).resolves.toBeUndefined();
  });
});
