// Sami — leituras das ferramentas de escrita: o cliente da ação e os
// homônimos dele na carteira (sempre pelo supabase do corretor, com RLS).
// Recortado de samiq-propostas.server.ts sem mudança de comportamento.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { displayNameForSamiQ } from "@/lib/samiq-governance";
import {
  filtrarHomonimos,
  primeiroNomeNormalizado,
  type ClienteParaDesambiguar,
} from "@/lib/samiq-homonimos";
import { escapeLike } from "@/lib/validators";

export type Db = SupabaseClient<Database>;

export type LeadResolvido = {
  id: string;
  nome: string | null;
  status: string;
  corretorId: string | null;
  bruto: ClienteParaDesambiguar;
};

export async function resolverLead(supabase: Db, leadId: string): Promise<LeadResolvido | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, status, corretor_id, projeto_nome, telefone, telefone_e164")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    nome: displayNameForSamiQ(data.nome),
    status: data.status,
    corretorId: data.corretor_id ?? null,
    bruto: {
      id: data.id,
      nome: data.nome,
      projeto_nome: data.projeto_nome,
      status: data.status,
      telefone: data.telefone,
      telefone_e164: data.telefone_e164,
    },
  };
}

/**
 * Outros clientes da carteira (RLS do corretor) com o mesmo primeiro nome.
 * Falha de consulta devolve null: quem chama bloqueia, porque gravar no
 * cliente errado é pior do que perguntar.
 */
export async function buscarHomonimos(
  supabase: Db,
  alvo: ClienteParaDesambiguar,
): Promise<ClienteParaDesambiguar[] | null> {
  const primeiro = primeiroNomeNormalizado(alvo.nome);
  if (!primeiro) return [];
  const original = (alvo.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, status, projeto_nome, telefone, telefone_e164")
    .is("deleted_at", null)
    .eq("na_lixeira", false)
    .neq("id", alvo.id)
    .ilike("nome", `${escapeLike(original)}%`)
    .limit(30);
  if (error) return null;
  return filtrarHomonimos(alvo, (data ?? []) as ClienteParaDesambiguar[]);
}
