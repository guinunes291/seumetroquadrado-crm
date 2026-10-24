import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Caracterização de src/features/distribuicao/queries.ts (consultas: painel)
// escrita ANTES da quebra do arquivo em módulos: descreve o que cada hook faz
// HOJE — o que pede ao banco (tabela, filtros, ordem, RPC e parâmetros), a
// chave de cache e o que devolve — sem julgar se está certo. Cada chamada ao
// banco vira uma linha de texto (ver tests/helpers/supabase-gravador.ts).
const g = await vi.hoisted(async () => {
  const { criarGravador } = await import("./helpers/supabase-gravador");
  const respostas: Record<string, unknown> = {};
  const toasts: string[] = [];
  return { respostas, toasts, ...criarGravador(respostas) };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: g.cliente }));
vi.mock("@/integrations/supabase/pendentes", () => ({ supabasePendente: g.pendente }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "gestor-1" } }) }));
vi.mock("sonner", () => ({
  toast: Object.fromEntries(
    ["success", "warning", "error", "info"].map((t) => [
      t,
      (m: string) => g.toasts.push(`${t}: ${m}`),
    ]),
  ),
}));
vi.mock("@/features/distribuicao/corretor-v2-client", () => ({
  listarCamposDistribuicaoV2: async (ids: string[]) => {
    g.chamadas.push(`v2.listarCamposDistribuicaoV2(${JSON.stringify(ids)})`);
    return { c1: { modelo: "fixo" } };
  },
  listarWipCorretores: async () => {
    g.chamadas.push("v2.listarWipCorretores()");
    return { c1: { wip: 3 } };
  },
}));
import * as Q from "@/features/distribuicao/queries";
import { consultar, type HookDeConsulta } from "./helpers/distribuicao-consultas";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
});
afterEach(cleanup);

const CENARIOS: Record<string, { useHook: HookDeConsulta; esperado: unknown }> = {
  useDistribuicaoResumo: {
    useHook: () => Q.useDistribuicaoResumo(),
    esperado: {
      chave: [["distribuicao:resumo"]],
      chamadas: ["supabase.rpc(painel_distribuicao_resumo)"],
      dados: { distribuidos_hoje: 3 },
    },
  },
  useElegibilidadeRoleta: {
    useHook: () => Q.useElegibilidadeRoleta("plantao"),
    esperado: {
      chave: [["distribuicao:elegibilidade", "plantao"]],
      chamadas: ['supabase.rpc(elegibilidade_roleta,{"_slug":"plantao"})'],
      dados: [{ corretor_id: "c1", apto: true }],
    },
  },
  useVendasMesAnterior: {
    useHook: () => Q.useVendasMesAnterior(),
    esperado: {
      chave: [["distribuicao:vendas-mes-anterior"]],
      chamadas: ["supabase.rpc(vendas_mes_anterior)"],
      dados: [{ corretor_id: "c1", qtd: 2, total: 500000 }],
    },
  },
  useMinhaElegibilidade: {
    useHook: () => Q.useMinhaElegibilidade(),
    esperado: {
      chave: [["distribuicao:minha-elegibilidade"]],
      chamadas: ["supabase.rpc(minha_elegibilidade)"],
      dados: [{ roleta_slug: "plantao", apto: false }],
    },
  },
  "useExcecoes(abertas)": {
    useHook: () => Q.useExcecoes(),
    esperado: {
      chave: [["distribuicao:excecoes", "abertas"]],
      chamadas: [
        'supabase.from(distribuicao_excecoes).select("*, leads(nome, telefone, origem, status)").order("created_at",{"ascending":false}).limit(200).in("status",["pendente","em_analise"])',
      ],
      dados: [{ id: "e1", lead_id: "l1", leads: { nome: "Lead 1" } }],
    },
  },
  "useExcecoes(todas)": {
    useHook: () => Q.useExcecoes("todas"),
    esperado: {
      chave: [["distribuicao:excecoes", "todas"]],
      chamadas: [
        'supabase.from(distribuicao_excecoes).select("*, leads(nome, telefone, origem, status)").order("created_at",{"ascending":false}).limit(200)',
      ],
      dados: [{ id: "e1", lead_id: "l1", leads: { nome: "Lead 1" } }],
    },
  },
  "useHistoricoDistribuicao(todos filtros)": {
    useHook: () =>
      Q.useHistoricoDistribuicao({
        roleta: "plantao",
        corretor: "c1",
        resultado: "sucesso",
        apenasFalhas: true,
        tipo: "manual",
        dias: 7,
        limite: 50,
        busca: "x",
      }),
    esperado: {
      chave: [
        [
          "distribuicao:historico",
          {
            roleta: "plantao",
            corretor: "c1",
            resultado: "sucesso",
            apenasFalhas: true,
            tipo: "manual",
            dias: 7,
            limite: 50,
            busca: "x",
          },
        ],
      ],
      chamadas: [
        'supabase.from(distribution_log).select("*, leads(nome)").order("created_at",{"ascending":false}).limit(50).eq("roleta_slug","plantao").eq("corretor_id","c1").eq("resultado","sucesso").neq("resultado","sucesso").eq("tipo","manual").gte("created_at","2026-10-13T12:00:00.000Z")',
      ],
      dados: [
        { corretor_id: "c1" },
        { corretor_id: "c1" },
        { corretor_id: "c2" },
        { corretor_id: null },
      ],
    },
  },
  "useHistoricoDistribuicao(vazio)": {
    useHook: () => Q.useHistoricoDistribuicao({}),
    esperado: {
      chave: [["distribuicao:historico", {}]],
      chamadas: [
        'supabase.from(distribution_log).select("*, leads(nome)").order("created_at",{"ascending":false}).limit(300)',
      ],
      dados: [
        { corretor_id: "c1" },
        { corretor_id: "c1" },
        { corretor_id: "c2" },
        { corretor_id: null },
      ],
    },
  },
  useDecisaoContexto: {
    useHook: () => Q.useDecisaoContexto("log-1"),
    esperado: {
      chave: [["distribuicao:contexto", "log-1"]],
      chamadas: [
        'supabase.from(distribuicao_log_contexto).select("contexto").eq("log_id","log-1").maybeSingle()',
      ],
      dados: { aptos: 2 },
    },
  },
  useRecebidosSemana: {
    useHook: () => Q.useRecebidosSemana("landing"),
    esperado: {
      chave: [["distribuicao:recebidos-semana", "landing"]],
      chamadas: [
        'supabase.from(distribution_log).select("corretor_id").eq("roleta_slug","landing").eq("resultado","sucesso").gte("created_at","2026-10-13T12:00:00.000Z").limit(2000)',
      ],
      dados: {
        mapa: [
          ["c1", 2],
          ["c2", 1],
        ],
        truncado: false,
      },
    },
  },
};

describe("distribuição › consultas: painel (caracterização)", () => {
  for (const [nome, c] of Object.entries(CENARIOS)) {
    it(nome, async () => {
      expect(await consultar(g, c.useHook)).toEqual(c.esperado);
    });
  }
});
