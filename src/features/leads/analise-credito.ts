// Fluxo da análise de crédito (item 3.1, forma segura): a tabela
// `analises_credito` — órfã desde jun/2026 — vira o registro de cada
// análise. A ÚLTIMA linha por lead é o estado atual; toda decisão ecoa na
// timeline como interação (autor + momento ficam lá, padrão da casa).
// Tudo tipado pelos types gerados — a tabela sempre existiu no schema.

import { supabase } from "@/integrations/supabase/client";

export type AnaliseStatus = "enviada" | "pendente" | "aprovada" | "reprovada";
export type AnaliseResultado = Extract<AnaliseStatus, "aprovada" | "reprovada">;

export type AnaliseCredito = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export const ANALISE_STATUS_LABEL: Record<AnaliseStatus, string> = {
  enviada: "Enviada ao banco",
  pendente: "Pendente (aguardando docs)",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
};

/** Última análise registrada do lead (estado atual); null = sem registro. */
export async function fetchAnaliseAtual(leadId: string): Promise<AnaliseCredito | null> {
  const { data, error } = await supabase
    .from("analises_credito")
    .select("id, lead_id, corretor_id, status, observacoes, created_at, updated_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Abre um registro de análise (chamado pelo modal de etapa). */
export async function registrarAnalise(args: {
  leadId: string;
  corretorId: string | null;
  status: AnaliseStatus;
  observacoes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("analises_credito").insert({
    lead_id: args.leadId,
    corretor_id: args.corretorId,
    status: args.status,
    observacoes: args.observacoes?.trim() || null,
  });
  if (error) throw error;
}

/**
 * Decide a análise atual do lead: aprova ou reprova (com motivo). Sem
 * registro aberto (lead que entrou em análise antes deste fluxo), cria a
 * linha já decidida — o legado não bloqueia a decisão. Eco na timeline
 * incluído: é a trilha de autor/momento que o resto do CRM já usa.
 */
export async function decidirAnalise(args: {
  leadId: string;
  leadNome: string;
  resultado: AnaliseResultado;
  motivo?: string | null;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  const motivo = args.motivo?.trim() || null;

  const atual = await fetchAnaliseAtual(args.leadId);
  if (atual && atual.status !== "aprovada" && atual.status !== "reprovada") {
    const observacoes = motivo
      ? `${atual.observacoes ? `${atual.observacoes}\n` : ""}Reprovação: ${motivo}`
      : atual.observacoes;
    const { error } = await supabase
      .from("analises_credito")
      .update({ status: args.resultado, observacoes })
      .eq("id", atual.id);
    if (error) throw error;
  } else {
    // Sem análise aberta (ou a última já decidida — nova rodada): registra
    // uma linha nova já com o desfecho.
    const { error } = await supabase.from("analises_credito").insert({
      lead_id: args.leadId,
      corretor_id: uid,
      status: args.resultado,
      observacoes: motivo ? `Reprovação: ${motivo}` : null,
    });
    if (error) throw error;
  }

  const aprovada = args.resultado === "aprovada";
  const { error: ecoErr } = await supabase.from("interacoes").insert({
    lead_id: args.leadId,
    autor_id: uid,
    tipo: "nota",
    direcao: "interna",
    titulo: aprovada ? "Análise de crédito APROVADA" : "Análise de crédito REPROVADA",
    conteudo: aprovada
      ? "Crédito aprovado — negócio liberado para fechamento."
      : motivo || "Crédito reprovado.",
    metadata: { status_analise: args.resultado, fonte: "fluxo_analise" },
  });
  if (ecoErr) throw ecoErr;
}
