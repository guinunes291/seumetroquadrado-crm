import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Caracterização de src/features/distribuicao/queries.ts (consultas: roletas e corretores)
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
  useRoletas: {
    useHook: () => Q.useRoletas(),
    esperado: {
      chave: [["distribuicao:roletas"]],
      // Desde c20e6882 (main): colunas explícitas, sem webhook_token.
      chamadas: [
        'pendente.from(roletas).select("id, slug, nome, descricao, ativo, criterio_participacao, exigir_presenca, horario_inicio, horario_fim, permitir_fora_horario, tipo, equipe_fixa, projeto_id, tiers_recalculados_em, filial_id").order("slug")',
      ],
      dados: [
        { id: "r1", slug: "z-norte", nome: "Zona Norte", ativo: true, filial_id: "f1" },
        { id: "r2", slug: "plantao", nome: "Plantão", ativo: false, filial_id: null },
      ],
    },
  },
  useZonasRoletas: {
    useHook: () => Q.useZonasRoletas(),
    esperado: {
      chave: [["distribuicao:zonas-roletas"]],
      chamadas: [
        'supabase.from(zonas_roletas).select("zona, roleta_slug")',
        'pendente.from(roletas).select("slug, nome, ativo, filial_id")',
        'supabase.from(filiais).select("id, slug, nome, ordem")',
      ],
      dados: [
        {
          zona: "norte",
          roleta_slug: "z-norte",
          roleta_nome: "Zona Norte",
          roleta_ativa: true,
          filial_slug: "barra-funda",
          filial_nome: "Barra Funda",
          filial_ordem: 1,
        },
        {
          zona: "sul",
          roleta_slug: "plantao",
          roleta_nome: "Plantão",
          roleta_ativa: false,
          filial_slug: null,
          filial_nome: null,
          filial_ordem: null,
        },
      ],
    },
  },
  useRoletasPorCorretor: {
    useHook: () => Q.useRoletasPorCorretor(),
    esperado: {
      chave: [["distribuicao:roletas-por-corretor"]],
      chamadas: [
        'supabase.from(roleta_participantes).select("corretor_id, ativo, pausado_ate, roleta:roletas!roleta_participantes_roleta_id_fkey(slug, nome, tipo, ativo)")',
      ],
      dados: { mapa: [["c1", [{ slug: "z-norte", nome: "Zona Norte", tipo: "zona" }]]] },
    },
  },
  "useParticipantesLog(r1)": {
    useHook: () => Q.useParticipantesLog("r1"),
    esperado: {
      chave: [["distribuicao:participantes-log", "r1"]],
      chamadas: [
        'supabase.from(roleta_participantes_log).select("*").order("created_at",{"ascending":false}).limit(200).eq("roleta_id","r1")',
      ],
      dados: [{ id: "pl1", acao: "incluir" }],
    },
  },
  "useParticipantesLog(null)": {
    useHook: () => Q.useParticipantesLog(null),
    esperado: {
      chave: [["distribuicao:participantes-log", null]],
      chamadas: [
        'supabase.from(roleta_participantes_log).select("*").order("created_at",{"ascending":false}).limit(200)',
      ],
      dados: [{ id: "pl1", acao: "incluir" }],
    },
  },
  useDistribuicaoSettings: {
    useHook: () => Q.useDistribuicaoSettings(),
    esperado: {
      chave: [["distribuicao:settings"]],
      chamadas: ['supabase.from(distribuicao_settings).select("*")'],
      dados: { teto: { valor: 5, descricao: "Teto", updated_at: "t1" } },
    },
  },
  useDistribuicaoConfig: {
    useHook: () => Q.useDistribuicaoConfig(),
    esperado: {
      chave: [["distribuicao:config"]],
      chamadas: ['supabase.from(distribuicao_config).select("*").order("origem")'],
      dados: [{ origem: "landing", roleta_slug: "plantao" }],
    },
  },
  useCorretoresDisponiveis: {
    useHook: () => Q.useCorretoresDisponiveis(),
    esperado: {
      chave: [["distribuicao:corretores-disponiveis"]],
      chamadas: [
        'supabase.from(user_roles).select("user_id").eq("role","corretor")',
        'supabase.from(profiles).select("id, nome, ativo").in("id",["c1","c2"]).eq("ativo",true).order("nome")',
      ],
      dados: [
        { id: "c1", nome: "Ana" },
        { id: "c2", nome: "Bia" },
      ],
    },
  },
  useCorretoresDaMinhaEquipe: {
    useHook: () => Q.useCorretoresDaMinhaEquipe(),
    esperado: {
      chave: [["distribuicao:corretores-minha-equipe"]],
      chamadas: [
        "supabase.auth.getUser()",
        'supabase.from(equipes).select("id").eq("gestor_id","gestor-1")',
        'supabase.from(profiles).select("equipe_id").eq("id","gestor-1").maybeSingle()',
        'supabase.from(profiles).select("id").in("equipe_id",["eq1","eq2"])',
      ],
      dados: { conjunto: ["c1", "c2"] },
    },
  },
  useCorretoresDaMinhaEquipeLista: {
    useHook: () => Q.useCorretoresDaMinhaEquipeLista(),
    esperado: {
      chave: [["distribuicao:corretores-minha-equipe-lista"]],
      chamadas: [
        "supabase.auth.getUser()",
        'supabase.from(equipes).select("id").eq("gestor_id","gestor-1")',
        'supabase.from(profiles).select("equipe_id").eq("id","gestor-1").maybeSingle()',
        'supabase.from(profiles).select("id, nome").in("equipe_id",["eq1","eq2"]).eq("ativo",true).neq("id","gestor-1").order("nome")',
      ],
      dados: [
        { id: "c1", nome: "Ana" },
        { id: "c2", nome: "Bia" },
      ],
    },
  },
  useNomesPerfis: {
    useHook: () => Q.useNomesPerfis(),
    esperado: {
      chave: [["distribuicao:nomes-perfis"]],
      chamadas: ['supabase.from(profiles).select("id, nome")'],
      dados: {
        mapa: [
          ["c1", "Ana"],
          ["c2", "Bia"],
        ],
      },
    },
  },
  useProjetosMini: {
    useHook: () => Q.useProjetosMini(),
    esperado: {
      chave: [["gestao:projetos-mini"]],
      chamadas: ['supabase.from(projetos).select("id, nome").eq("ativo",true).order("nome")'],
      dados: [{ id: "p1", nome: "Residencial X" }],
    },
  },
  useCorretoresDistribuicao: {
    useHook: () => Q.useCorretoresDistribuicao(),
    esperado: {
      chave: [["distribuicao:corretores"]],
      chamadas: [
        'supabase.from(user_roles).select("user_id").eq("role","corretor")',
        'supabase.from(profiles).select("id, nome, ativo, presente, telefone, zonas").in("id",["c1","c2"]).order("nome")',
        'v2.listarCamposDistribuicaoV2(["c1","c2"])',
      ],
      dados: [
        {
          id: "c1",
          nome: "Ana",
          ativo: true,
          presente: true,
          telefone: "11",
          zonas: ["norte"],
          v2: { modelo: "fixo" },
        },
        {
          id: "c2",
          nome: "Bia",
          ativo: false,
          presente: false,
          telefone: null,
          zonas: [],
          v2: null,
        },
      ],
    },
  },
  useWipCorretores: {
    useHook: () => Q.useWipCorretores(),
    esperado: {
      chave: [["distribuicao:wip"]],
      chamadas: ["v2.listarWipCorretores()"],
      dados: { c1: { wip: 3 } },
    },
  },
};

describe("distribuição › consultas: roletas e corretores (caracterização)", () => {
  for (const [nome, c] of Object.entries(CENARIOS)) {
    it(nome, async () => {
      expect(await consultar(g, c.useHook)).toEqual(c.esperado);
    });
  }
});
