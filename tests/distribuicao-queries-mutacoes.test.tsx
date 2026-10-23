import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Caracterização de src/features/distribuicao/queries.ts (mutações) escrita ANTES
// da quebra do arquivo em módulos: descreve o que cada hook faz HOJE — o que
// pede ao banco (tabela, filtros, ordem, RPC e parâmetros), que mensagem mostra e quantas chaves de cache invalida — sem julgar
// se está certo. Cada chamada ao banco vira uma linha de texto (ver
// tests/helpers/supabase-gravador.ts).
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

const wrapper =
  (qc: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function zerar() {
  g.limpar();
  g.toasts.splice(0);
  for (const k of Object.keys(g.respostas)) delete g.respostas[k];
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
});
afterEach(cleanup);

async function executar(
  useHook: () => { mutateAsync: (a: never) => Promise<unknown> },
  args: unknown,
  rpc: Record<string, unknown>,
) {
  zerar();
  for (const [k, v] of Object.entries(rpc)) g.respostas[`rpc:${k}`] = v;
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidadas: unknown[] = [];
  const original = qc.invalidateQueries.bind(qc);
  qc.invalidateQueries = ((f: { queryKey: unknown }) => {
    invalidadas.push(f.queryKey);
    return original(f as never);
  }) as typeof qc.invalidateQueries;
  const { result } = renderHook(useHook, { wrapper: wrapper(qc) });
  await act(async () => {
    await result.current.mutateAsync(args as never);
  });
  return { chamadas: [...g.chamadas], toasts: [...g.toasts], invalidadas };
}

// As 21 chaves que toda mutação da distribuição invalida, na ordem — escritas
// aqui (e não lidas de Q.DISTRIBUICAO_KEYS) para que mudar a lista no código
// apareça como mudança de comportamento.
const CHAVES = [
  ["distribuicao:resumo"],
  ["distribuicao:elegibilidade"],
  ["distribuicao:excecoes"],
  ["distribuicao:historico"],
  ["distribuicao:participantes-log"],
  ["distribuicao:roletas"],
  ["distribuicao:roletas-por-corretor"],
  ["distribuicao:settings"],
  ["distribuicao:config"],
  ["distribuicao:minha-elegibilidade"],
  ["distribuicao:recebidos-semana"],
  ["distribuicao:vendas-mes-anterior"],
  ["distribuicao:corretores"],
  ["distribuicao:wip"],
  ["distribuicao:zonas-roletas"],
  ["gestao:campanhas"],
  ["gestao:equipe"],
  ["gestao:equipe-metricas"],
  ["gestao:tier-hist"],
  ["gestao:projetos-mini"],
  ["presenca"],
];

type Cenario = {
  useHook: () => { mutateAsync: (a: never) => Promise<unknown> };
  args: unknown;
  rpc?: Record<string, unknown>;
};
const CENARIOS: Record<string, Cenario & { chamadas: string[]; toasts: string[] }> = {
  useGerenciarParticipante: {
    useHook: () => Q.useGerenciarParticipante(),
    args: { slug: "plantao", corretorId: "c1", acao: "limite", motivo: "ajuste", limite: null },
    chamadas: [
      'supabase.rpc(gerenciar_participante_roleta,{"_slug":"plantao","_corretor_id":"c1","_acao":"limite","_motivo":"ajuste"})',
    ],
    toasts: [],
  },
  "useResolverExcecao(ok)": {
    useHook: () => Q.useResolverExcecao(),
    args: { excecaoId: "e1", leadId: "l1", acao: "atribuir" },
    rpc: { resolver_excecao: { ok: true, corretor_id: "c9" } },
    chamadas: [
      'supabase.rpc(resolver_excecao,{"_excecao_id":"e1","_acao":"atribuir","_params":{}})',
      'supabase.functions.invoke(notify-lead-transfer,{"body":{"lead_id":"l1","corretor_id":"c9"}})',
    ],
    toasts: [],
  },
  "useResolverExcecao(sem apto)": {
    useHook: () => Q.useResolverExcecao(),
    args: { excecaoId: "e1", leadId: "l1", acao: "reprocessar", params: { x: 1 } },
    rpc: { resolver_excecao: { ok: false, motivo: "sem_corretor_apto" } },
    chamadas: [
      'supabase.rpc(resolver_excecao,{"_excecao_id":"e1","_acao":"reprocessar","_params":{"x":1}})',
    ],
    toasts: ["warning: Ainda sem corretor apto (sem_corretor_apto) — exceção mantida."],
  },
  "useDistribuirManual(ok)": {
    useHook: () => Q.useDistribuirManual(),
    args: { leadId: "l1", corretorId: "c9" },
    rpc: {
      distribuir_lead_v3: {
        ok: true,
        corretor_id: "c9",
        corretor_nome: "Bia",
        aviso_zona: "Fora da zona",
      },
    },
    chamadas: [
      'supabase.rpc(distribuir_lead_v3,{"_lead_id":"l1","_tipo":"manual","_corretor_id":"c9","_gatilho":"manual"})',
      'supabase.functions.invoke(notify-lead-transfer,{"body":{"lead_id":"l1","corretor_id":"c9"}})',
    ],
    toasts: ["success: Lead distribuído para Bia.", "warning: Fora da zona"],
  },
  "useDistribuirManual(sem apto)": {
    useHook: () => Q.useDistribuirManual(),
    args: { leadId: "l1", roletaSlug: "plantao", gatilho: "botao" },
    rpc: { distribuir_lead_v3: { ok: false, motivo: "sem_aptos" } },
    chamadas: [
      'supabase.rpc(distribuir_lead_v3,{"_lead_id":"l1","_tipo":"automatica","_roleta_slug":"plantao","_gatilho":"botao"})',
    ],
    toasts: ["warning: Sem corretor apto (sem_aptos) — lead na fila de exceções."],
  },
  useMarcarPresencaAdmin: {
    useHook: () => Q.useMarcarPresencaAdmin(),
    args: { corretorId: "c1", presente: true },
    chamadas: ['supabase.rpc(marcar_presenca_admin,{"_corretor_id":"c1","_presente":true})'],
    toasts: ["success: Na roleta hoje — registrado como liberado pela gestão."],
  },
  useRodarDistribuicao: {
    useHook: () => Q.useRodarDistribuicao(),
    args: undefined,
    rpc: {
      processar_distribuicao_automatica: {
        distribuidos: 4,
        sem_corretor: 1,
        repassados_sla: 2,
        redistribuidos: 0,
      },
    },
    chamadas: ["supabase.rpc(processar_distribuicao_automatica)"],
    toasts: [
      "success: Rodada concluída: 4 distribuídos · 1 sem corretor · 2 repasses SLA · 0 redistribuídos.",
    ],
  },
  useEscoarEstoque: {
    useHook: () => Q.useEscoarEstoque("plantao"),
    args: 10,
    rpc: {
      distribuir_estoque_roleta: { distribuidos: 6, corretores_aptos: 3, restante_estoque: 9 },
    },
    chamadas: ['supabase.rpc(distribuir_estoque_roleta,{"_roleta":"plantao","_limite":10})'],
    toasts: [
      "success: 6 leads do estoque distribuídos para 3 corretor(es) apto(s) · 9 ainda no estoque.",
    ],
  },
  useAtualizarSetting: {
    useHook: () => Q.useAtualizarSetting(),
    args: { chave: "teto", valor: { n: 5 } },
    chamadas: ['supabase.rpc(atualizar_distribuicao_setting,{"_chave":"teto","_valor":{"n":5}})'],
    toasts: ["success: Configuração atualizada."],
  },
  "useAtualizarConfigOrigem(limpar)": {
    useHook: () => Q.useAtualizarConfigOrigem(),
    args: { origem: "landing", roletaSlug: null, timeoutMinutos: null },
    chamadas: [
      'supabase.rpc(atualizar_distribuicao_config,{"_origem":"landing","_limpar_roleta":true,"_limpar_timeout_minutos":true})',
    ],
    toasts: ["success: Origem atualizada."],
  },
  "useAtualizarConfigOrigem(valores)": {
    useHook: () => Q.useAtualizarConfigOrigem(),
    args: {
      origem: "landing",
      roletaSlug: "plantao",
      timeoutHoras: 2,
      timeoutMinutos: 30,
      slaMinutos: 15,
    },
    chamadas: [
      'supabase.rpc(atualizar_distribuicao_config,{"_origem":"landing","_roleta_slug":"plantao","_limpar_roleta":false,"_timeout_horas":2,"_timeout_minutos":30,"_limpar_timeout_minutos":false,"_sla_minutos":15})',
    ],
    toasts: ["success: Origem atualizada."],
  },
  "useAtualizarRoleta(limpar)": {
    useHook: () => Q.useAtualizarRoleta(),
    args: { slug: "plantao", projetoId: null, filialSlug: null },
    chamadas: [
      'pendente.rpc(atualizar_roleta,{"_slug":"plantao","_limpar_projeto":true,"_limpar_filial":true})',
    ],
    toasts: ["success: Roleta atualizada."],
  },
  "useAtualizarRoleta(valores)": {
    useHook: () => Q.useAtualizarRoleta(),
    args: {
      slug: "plantao",
      ativo: true,
      exigirPresenca: false,
      horarioInicio: "08:00",
      horarioFim: null,
      permitirForaHorario: true,
      equipeFixa: true,
      projetoId: "p1",
      filialSlug: "barra-funda",
    },
    chamadas: [
      'pendente.rpc(atualizar_roleta,{"_slug":"plantao","_ativo":true,"_exigir_presenca":false,"_horario_inicio":"08:00","_horario_fim":null,"_permitir_fora_horario":true,"_equipe_fixa":true,"_projeto_id":"p1","_limpar_projeto":false,"_filial_slug":"barra-funda"})',
    ],
    toasts: ["success: Roleta atualizada."],
  },
  useCriarRoletaCampanha: {
    useHook: () => Q.useCriarRoletaCampanha(),
    args: { nome: "Campanha X", projetoId: null },
    rpc: { criar_roleta_campanha: { ok: true, roleta: { slug: "camp-x" } } },
    chamadas: ['pendente.rpc(criar_roleta_campanha,{"_nome":"Campanha X","_equipe_fixa":false})'],
    toasts: ["success: Campanha criada (camp-x) — monte a equipe e copie o token."],
  },
  "useAtualizarCorretorDistribuicao(limpar)": {
    useHook: () => Q.useAtualizarCorretorDistribuicao(),
    args: { corretorId: "c1", modeloContrato: null },
    chamadas: [
      'supabase.rpc(atualizar_corretor_distribuicao,{"_corretor_id":"c1","_limpar_modelo_contrato":true})',
    ],
    toasts: ["success: Corretor atualizado."],
  },
  "useAtualizarCorretorDistribuicao(valores)": {
    useHook: () => Q.useAtualizarCorretorDistribuicao(),
    args: {
      corretorId: "c1",
      zonas: ["norte"],
      modeloContrato: "fixo",
      onboardingConcluido: true,
      limiteDiarioWebhook: 7,
    },
    chamadas: [
      'supabase.rpc(atualizar_corretor_distribuicao,{"_corretor_id":"c1","_zonas":["norte"],"_modelo_contrato":"fixo","_limpar_modelo_contrato":false,"_onboarding_concluido":true,"_limite_diario_webhook":7})',
    ],
    toasts: ["success: Corretor atualizado."],
  },
  "useRecalcularTiers(0)": {
    useHook: () => Q.useRecalcularTiers(),
    args: "plantao",
    rpc: { recalcular_tiers_roleta: 0 },
    chamadas: [
      'supabase.rpc(recalcular_tiers_roleta,{"_roleta_slug":"plantao","_gatilho":"manual"})',
    ],
    toasts: ["success: Tiers atualizados (sem mudanças)."],
  },
  "useRecalcularTiers(2)": {
    useHook: () => Q.useRecalcularTiers(),
    args: "plantao",
    rpc: { recalcular_tiers_roleta: 2 },
    chamadas: [
      'supabase.rpc(recalcular_tiers_roleta,{"_roleta_slug":"plantao","_gatilho":"manual"})',
    ],
    toasts: ["success: 2 mudança(s) de tier."],
  },
};

describe("distribuição › mutações (caracterização)", () => {
  for (const [nome, c] of Object.entries(CENARIOS)) {
    it(nome, async () => {
      expect(await executar(c.useHook, c.args, c.rpc ?? {})).toEqual({
        chamadas: c.chamadas,
        toasts: c.toasts,
        invalidadas: CHAVES,
      });
    });
  }
});
