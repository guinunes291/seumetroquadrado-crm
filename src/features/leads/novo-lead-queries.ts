// Novo lead — acesso a dados do diálogo: corretores para "Atribuir a",
// e-mail já cadastrado, criação com dedupe (criar_lead_dedup), CPF depois da
// criação e a triagem da roleta.
// Recortado de novo-lead-dialog.tsx sem mudança de comportamento.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export function useCorretoresParaAtribuir(enabled: boolean) {
  return useQuery({
    queryKey: ["corretores-atribuir-novo-lead"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        // "docs-bot" é a conta de serviço (perfil ativo para operar via API);
        // nunca atende lead, então fica fora das opções de atribuição.
        .neq("nome", "docs-bot")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Duplicidade por e-mail (best-effort, sob RLS): devolve o lead que casa. */
export async function leadsComEmail(emailNorm: string) {
  const { data: dup, error: dupErr } = await supabase
    .from("leads")
    .select("id, nome, email")
    .ilike("email", emailNorm)
    .limit(1);
  if (dupErr) throw dupErr;
  return dup;
}

/** Criação com dedupe de telefone decidido no servidor (lock transacional). */
export async function criarLeadDedup(payload: Record<string, unknown>) {
  // RPC já presente nos tipos gerados — chamada tipada, sem cast do client.
  const { data: criacao, error } = await supabase.rpc("criar_lead_dedup", {
    _payload: payload as Json,
  });
  if (error) throw error;
  return criacao;
}

/** CPF entra depois da criação; devolve o erro (o lead não é desfeito). */
export async function gravarCpfDoLead(leadId: string, cpf: string) {
  const { error: cpfErr } = await supabase.from("leads").update({ cpf }).eq("id", leadId);
  return cpfErr;
}

/** Distribuição v3: triagem única (origem → roleta → corretor apto). */
export async function triarEDistribuirLead(leadId: string) {
  const { data: triagem } = await supabase.rpc("triar_e_distribuir_lead", {
    _lead_id: leadId,
    _gatilho: "manual_criacao",
  });
  return triagem;
}
