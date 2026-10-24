// Distribuição v3 — consultas de CORRETORES para a central: disponíveis, da
// equipe do gestor, nomes, projetos para vínculo de campanha, campos de
// distribuição e WIP.
// Recortado de queries.ts (que reexporta tudo) sem mudança de conteúdo.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listarCamposDistribuicaoV2,
  listarWipCorretores,
  type CamposDistribuicaoV2,
  type WipCorretor,
} from "./corretor-v2-client";

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
/** Corretores ativos (role corretor) — para o dialog de inclusão na roleta. */
export function useCorretoresDisponiveis(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:corretores-disponiveis"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: roles, error: er } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "corretor");
      if (er) throw er;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as Array<{ id: string; nome: string }>;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, ativo")
        .in("id", ids)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, nome: p.nome }));
    },
  });
}

/**
 * Corretores das equipes que o usuário logado gerencia (gestor).
 * Base do escopo de autonomia do gestor nas filas: ele só inclui/remove gente
 * do próprio time — o mesmo recorte é validado no banco.
 */
export function useCorretoresDaMinhaEquipe(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:corretores-minha-equipe"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const meuId = auth.user?.id;
      if (!meuId) return new Set<string>();

      const [{ data: equipesGeridas }, { data: meuPerfil }] = await Promise.all([
        supabase.from("equipes").select("id").eq("gestor_id", meuId),
        supabase.from("profiles").select("equipe_id").eq("id", meuId).maybeSingle(),
      ]);

      const equipeIds = new Set<string>((equipesGeridas ?? []).map((e) => e.id));
      if (meuPerfil?.equipe_id) equipeIds.add(meuPerfil.equipe_id);
      if (equipeIds.size === 0) return new Set<string>();

      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .in("equipe_id", [...equipeIds]);
      if (error) throw error;
      return new Set<string>((data ?? []).map((p) => p.id));
    },
  });
}

/**
 * Lista (id, nome) dos perfis ativos da(s) equipe(s) do gestor logado. O gestor
 * não lê papéis de terceiros (RLS de user_roles), então a lista do diálogo de
 * inclusão sai direto dos perfis do time — o banco revalida na inclusão.
 */
export function useCorretoresDaMinhaEquipeLista(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:corretores-minha-equipe-lista"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const meuId = auth.user?.id;
      if (!meuId) return [] as Array<{ id: string; nome: string }>;
      const [{ data: equipesGeridas }, { data: meuPerfil }] = await Promise.all([
        supabase.from("equipes").select("id").eq("gestor_id", meuId),
        supabase.from("profiles").select("equipe_id").eq("id", meuId).maybeSingle(),
      ]);
      const equipeIds = new Set<string>((equipesGeridas ?? []).map((e) => e.id));
      if (meuPerfil?.equipe_id) equipeIds.add(meuPerfil.equipe_id);
      if (equipeIds.size === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("equipe_id", [...equipeIds])
        .eq("ativo", true)
        .neq("id", meuId)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, nome: p.nome }));
    },
  });
}

/** Nomes dos corretores/gestores (mapa id → nome) para logs e tabelas. */
export function useNomesPerfis(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:nomes-perfis"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) m.set(p.id, p.nome);
      return m;
    },
  });
}

/** Projetos ativos (id, nome) — vínculo de campanha na aba Filas. */
export function useProjetosMini(enabled = true) {
  return useQuery({
    queryKey: ["gestao:projetos-mini"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });
}

export interface CorretorDistribuicao {
  id: string;
  nome: string;
  ativo: boolean;
  presente: boolean;
  telefone: string | null;
  zonas: string[];
  v2: CamposDistribuicaoV2 | null;
}

/** Corretores (role corretor) com os campos de DISTRIBUIÇÃO — aba Corretores.
 *  Os campos do modelo v2 chegam pela fronteira tolerante (migration pode
 *  não ter rodado): v2 = null nesse caso e a tela mostra "—". */
export function useCorretoresDistribuicao(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:corretores"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<CorretorDistribuicao[]> => {
      const { data: roles, error: er } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "corretor");
      if (er) throw er;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, ativo, presente, telefone, zonas")
        .in("id", ids)
        .order("nome");
      if (error) throw error;
      const v2 = await listarCamposDistribuicaoV2(ids);
      return (data ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        ativo: p.ativo ?? false,
        presente: p.presente ?? false,
        telefone: p.telefone,
        zonas: (p.zonas ?? []) as string[],
        v2: v2[p.id] ?? null,
      }));
    },
  });
}

/** WIP por corretor contra o disjuntor (view v_wip_corretor). `null` = view
 *  ainda não existe — a coluna some da tela. */
export function useWipCorretores(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:wip"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, WipCorretor> | null> => listarWipCorretores(),
  });
}
