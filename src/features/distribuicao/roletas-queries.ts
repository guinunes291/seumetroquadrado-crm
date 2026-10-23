// Distribuição v3 — consultas das ROLETAS: cadastro, mapa zona → roleta →
// filial, em quais roletas cada corretor entra no rodízio, log de
// participantes e a política (settings e configuração por origem).
// Recortado de queries.ts (que reexporta tudo) sem mudança de conteúdo.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePendente } from "@/integrations/supabase/pendentes";
import type { Json } from "@/integrations/supabase/types";
import { type ZonaRoletaLinha } from "@/lib/distribuicao";

// ---------------------------------------------------------------------------
// Tipos das respostas
// ---------------------------------------------------------------------------
export interface ParticipanteLogLinha {
  id: string;
  roleta_id: string;
  corretor_id: string;
  acao: string;
  motivo: string | null;
  feito_por: string | null;
  created_at: string;
}

export interface RoletaRow {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criterio_participacao: string;
  exigir_presenca: boolean;
  horario_inicio: string | null;
  horario_fim: string | null;
  permitir_fora_horario: boolean;
  // Colunas de campanha/tipo — o select("*") de useRoletas já as traz.
  tipo: string;
  equipe_fixa: boolean;
  webhook_token: string | null;
  projeto_id: string | null;
  tiers_recalculados_em: string | null;
  // Roletas por filial (0079, 12/10/2026): a filial dona — sempre na roleta de
  // filial (tipo zona), opcional na campanha (rótulo e agrupamento na aba Filas).
  filial_id: string | null;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export function useRoletas(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:roletas"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      // supabasePendente: roletas.filial_id ainda não está nos types gerados.
      const { data, error } = await supabasePendente.from("roletas").select("*").order("slug");
      if (error) throw error;
      return (data ?? []) as RoletaRow[];
    },
  });
}

/**
 * O mapa das filiais: zonas_roletas (zona → roleta) com o nome da roleta e a
 * filial dela (nome e ordem). Lido direto das três tabelas (RLS de leitura
 * para autenticado) — é o que a aba Corretores usa para editar a região por
 * filial e a aba Filas para ordenar as roletas de filial. Nunca uma constante:
 * a gestão abre uma loja nova sem deploy.
 */
export function useZonasRoletas(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:zonas-roletas"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ZonaRoletaLinha[]> => {
      const [mapa, roletas, filiais] = await Promise.all([
        supabase.from("zonas_roletas").select("zona, roleta_slug"),
        supabasePendente.from("roletas").select("slug, nome, ativo, filial_id"),
        supabase.from("filiais").select("id, slug, nome, ordem"),
      ]);
      if (mapa.error) throw mapa.error;
      if (roletas.error) throw roletas.error;
      if (filiais.error) throw filiais.error;
      const porFilial = new Map((filiais.data ?? []).map((f) => [f.id, f]));
      const porRoleta = new Map((roletas.data ?? []).map((r) => [r.slug, r]));
      return (mapa.data ?? []).flatMap((m) => {
        const r = porRoleta.get(m.roleta_slug);
        if (!r) return [];
        const f = r.filial_id ? porFilial.get(r.filial_id) : undefined;
        return [
          {
            zona: m.zona,
            roleta_slug: r.slug,
            roleta_nome: r.nome,
            roleta_ativa: r.ativo,
            filial_slug: f?.slug ?? null,
            filial_nome: f?.nome ?? null,
            filial_ordem: f?.ordem ?? null,
          },
        ];
      });
    },
  });
}

export interface RoletaDoCorretor {
  slug: string;
  nome: string;
  tipo: string;
}

/**
 * Em quais roletas cada corretor ENTRA NO RODÍZIO hoje.
 *
 * Existe por causa de um incidente real: a gestão marcou uma corretora como
 * Inapta na Marquinhos e ela continuou recebendo lead de chatbot — porque
 * seguia ativa numa roleta de CAMPANHA, que consome a mesma origem por um
 * endpoint próprio (webhook por token). Cada aba mostrava a verdade da sua
 * roleta e nenhuma mostrava a do corretor.
 *
 * Mesma regra de rodízio do motor (`_elegibilidade_roleta`): participante
 * ativo, não pausado, na roleta ativa. Os demais critérios (presença, cota,
 * % trabalhado) são do dia e não interessam aqui — a pergunta é "de onde mais
 * pode cair lead pra ele", não "cai agora".
 */
export interface ParticipacaoBruta {
  corretor_id: string;
  ativo: boolean;
  pausado_ate: string | null;
  // O embed é to-one, mas o PostgREST tipa como array em algumas versões.
  roleta:
    | { slug: string; nome: string; tipo: string; ativo: boolean }
    | Array<{ slug: string; nome: string; tipo: string; ativo: boolean }>
    | null;
}

/** Regra de rodízio, isolada do React Query para poder ser testada direto. */
export function agruparRoletasPorCorretor(
  linhas: ParticipacaoBruta[],
  agora: number = Date.now(),
): Map<string, RoletaDoCorretor[]> {
  const mapa = new Map<string, RoletaDoCorretor[]>();
  for (const linha of linhas) {
    const r = Array.isArray(linha.roleta) ? linha.roleta[0] : linha.roleta;
    if (!r?.ativo || !linha.ativo) continue;
    if (linha.pausado_ate && new Date(linha.pausado_ate).getTime() > agora) continue;
    const atual = mapa.get(linha.corretor_id) ?? [];
    atual.push({ slug: r.slug, nome: r.nome, tipo: r.tipo });
    mapa.set(linha.corretor_id, atual);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return mapa;
}

export function useRoletasPorCorretor(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:roletas-por-corretor"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roleta_participantes")
        .select(
          "corretor_id, ativo, pausado_ate, roleta:roletas!roleta_participantes_roleta_id_fkey(slug, nome, tipo, ativo)",
        );
      if (error) throw error;
      return agruparRoletasPorCorretor((data ?? []) as unknown as ParticipacaoBruta[]);
    },
  });
}

export function useParticipantesLog(roletaId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:participantes-log", roletaId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("roleta_participantes_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (roletaId) q = q.eq("roleta_id", roletaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ParticipanteLogLinha[];
    },
  });
}

export function useDistribuicaoSettings(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:settings"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("distribuicao_settings").select("*");
      if (error) throw error;
      const map: Record<string, { valor: Json; descricao: string | null; updated_at: string }> = {};
      for (const row of data ?? []) {
        map[row.chave] = {
          valor: row.valor,
          descricao: row.descricao,
          updated_at: row.updated_at,
        };
      }
      return map;
    },
  });
}

export function useDistribuicaoConfig(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:config"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuicao_config")
        .select("*")
        .order("origem");
      if (error) throw error;
      return data ?? [];
    },
  });
}
