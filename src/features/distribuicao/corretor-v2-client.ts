// Fronteira ÚNICA de LEITURA do cliente para os artefatos do modelo v2 que
// ainda não estão nos types gerados: profiles.modelo_contrato,
// profiles.onboarding_concluido_em e a view v_wip_corretor (migrations
// 20260826120000+). Mesmo padrão do ramal-sonax-client: em ambiente onde a
// migration ainda não rodou, devolve vazio e a tela degrada ("—" / coluna
// oculta) em vez de quebrar.
//
// ESCRITA nunca passa por aqui — é sempre a RPC auditada
// atualizar_corretor_distribuicao (useAtualizarCorretorDistribuicao).

import { supabase } from "@/integrations/supabase/client";

export type CamposDistribuicaoV2 = {
  modelo_contrato: "fixo" | "autonomo" | null;
  onboarding_concluido_em: string | null;
};

export type WipCorretor = {
  leads_ativos: number;
  disjuntor: number;
};

/** Códigos de "coluna/relação ainda não existe" (migration v2 pendente). */
const FONTE_AUSENTE = new Set(["42703", "42P01", "PGRST204", "PGRST202", "PGRST205"]);

export async function listarCamposDistribuicaoV2(
  ids: string[],
): Promise<Record<string, CamposDistribuicaoV2>> {
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("profiles")
    // Colunas fora dos types gerados — o cast é a fronteira, não o chamador.
    .select("id, modelo_contrato, onboarding_concluido_em" as "id")
    .in("id", ids);
  if (error) {
    if (FONTE_AUSENTE.has(error.code ?? "")) return {};
    throw new Error(error.message || "Não foi possível carregar os campos de distribuição.");
  }
  const rows = (data ?? []) as unknown as Array<{ id: string } & Partial<CamposDistribuicaoV2>>;
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        modelo_contrato: r.modelo_contrato ?? null,
        onboarding_concluido_em: r.onboarding_concluido_em ?? null,
      },
    ]),
  );
}

/** WIP (leads ativos) contra o disjuntor, da view v_wip_corretor. `null` =
 *  view ainda não existe — a coluna some da tela em vez de quebrar. */
export async function listarWipCorretores(): Promise<Record<string, WipCorretor> | null> {
  const { data, error } = await (
    supabase.from as unknown as (t: string) => ReturnType<typeof supabase.from>
  )("v_wip_corretor").select("corretor_id, leads_ativos, disjuntor");
  if (error) {
    if (FONTE_AUSENTE.has(error.code ?? "")) return null;
    throw new Error(error.message || "Não foi possível carregar o WIP dos corretores.");
  }
  const rows = (data ?? []) as unknown as Array<{
    corretor_id: string;
    leads_ativos: number;
    disjuntor: number;
  }>;
  return Object.fromEntries(
    rows.map((r) => [
      r.corretor_id,
      { leads_ativos: r.leads_ativos ?? 0, disjuntor: r.disjuntor ?? 30 },
    ]),
  );
}
