// Dados de teste e execução compartilhados pelos testes de caracterização das
// consultas de src/features/distribuicao/queries.ts (painel e roletas/corretores).
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { expect } from "vitest";
import type { criarGravador } from "./supabase-gravador";

type Gravador = ReturnType<typeof criarGravador> & {
  respostas: Record<string, unknown>;
  toasts: string[];
};

export const FIX = {
  distribuicao_excecoes: [{ id: "e1", lead_id: "l1", leads: { nome: "Lead 1" } }],
  distribution_log: [
    { corretor_id: "c1" },
    { corretor_id: "c1" },
    { corretor_id: "c2" },
    { corretor_id: null },
  ],
  distribuicao_log_contexto: [{ contexto: { aptos: 2 } }],
  roletas: [
    { id: "r1", slug: "z-norte", nome: "Zona Norte", ativo: true, filial_id: "f1" },
    { id: "r2", slug: "plantao", nome: "Plantão", ativo: false, filial_id: null },
  ],
  zonas_roletas: [
    { zona: "norte", roleta_slug: "z-norte" },
    { zona: "sul", roleta_slug: "plantao" },
    { zona: "oeste", roleta_slug: "sumiu" },
  ],
  filiais: [{ id: "f1", slug: "barra-funda", nome: "Barra Funda", ordem: 1 }],
  roleta_participantes: [
    {
      corretor_id: "c1",
      ativo: true,
      pausado_ate: null,
      roleta: { slug: "z-norte", nome: "Zona Norte", tipo: "zona", ativo: true },
    },
    {
      corretor_id: "c1",
      ativo: true,
      pausado_ate: "2099-01-01T00:00:00Z",
      roleta: [{ slug: "plantao", nome: "Plantão", tipo: "fixa", ativo: true }],
    },
    {
      corretor_id: "c2",
      ativo: false,
      pausado_ate: null,
      roleta: { slug: "z-norte", nome: "Zona Norte", tipo: "zona", ativo: true },
    },
  ],
  roleta_participantes_log: [{ id: "pl1", acao: "incluir" }],
  distribuicao_settings: [
    { chave: "teto", valor: 5, descricao: "Teto", updated_at: "t1", extra: "x" },
  ],
  distribuicao_config: [{ origem: "landing", roleta_slug: "plantao" }],
  user_roles: [{ user_id: "c1" }, { user_id: "c2" }],
  profiles: [
    {
      id: "c1",
      nome: "Ana",
      ativo: true,
      presente: true,
      telefone: "11",
      zonas: ["norte"],
      equipe_id: "eq1",
    },
    {
      id: "c2",
      nome: "Bia",
      ativo: null,
      presente: null,
      telefone: null,
      zonas: null,
      equipe_id: null,
    },
  ],
  equipes: [{ id: "eq1" }, { id: "eq2" }],
  projetos: [{ id: "p1", nome: "Residencial X" }],
};
export const RPC = {
  painel_distribuicao_resumo: { distribuidos_hoje: 3 },
  elegibilidade_roleta: [{ corretor_id: "c1", apto: true }],
  vendas_mes_anterior: [{ corretor_id: "c1", qtd: 2, total: 500000 }],
  minha_elegibilidade: [{ roleta_slug: "plantao", apto: false }],
};

// Map/Set viram objetos comparáveis; RecebidosSemana leva o `truncado` junto.
const norm = (v: unknown): unknown =>
  v instanceof Map
    ? { mapa: [...v.entries()], ...("truncado" in v ? { truncado: v.truncado } : {}) }
    : v instanceof Set
      ? { conjunto: [...v].sort() }
      : v;

export type HookDeConsulta = () => { isSuccess: boolean; isError: boolean; data?: unknown };

/** Roda o hook com as fixtures e devolve chave do cache, chamadas e dados. */
export async function consultar(g: Gravador, hook: HookDeConsulta) {
  g.limpar();
  g.toasts.splice(0);
  for (const k of Object.keys(g.respostas)) delete g.respostas[k];
  Object.assign(g.respostas, FIX, { "auth:user": { id: "gestor-1" } });
  for (const [k, v] of Object.entries(RPC)) g.respostas[`rpc:${k}`] = v;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const { result } = renderHook(hook, { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return {
    chave: qc
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey),
    chamadas: [...g.chamadas],
    dados: norm(result.current.data),
  };
}
