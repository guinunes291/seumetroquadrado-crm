// Briefing do corretor (Onda S3, D13) — a coleta, com a SESSÃO DO CORRETOR
// (RLS): agenda de hoje→amanhã, tarefas vencidas e filas de Atender, montadas
// pela regra pura de samiq-briefing.ts. Não chama o modelo: não gasta cota nem
// entra em samiq_execucoes. Extraído na Onda S4 para servir ao painel
// (samiq-briefing.functions.ts) e ao WhatsApp (/api/sami/briefing).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import type { QueueKey } from "@/features/atendimento/derive";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { displayNameForSamiQ } from "@/lib/samiq-governance";
import { hojeSaoPaulo, intervaloAgendaSamiQ } from "@/lib/samiq-tools";
import {
  montarBriefingSamiQ,
  type BriefingAgendaItem,
  type BriefingSamiQ,
  type BriefingTarefa,
} from "@/lib/samiq-briefing";

type Db = SupabaseClient<Database>;

const MAX_TAREFAS = 5;

export async function montarBriefingDoCorretor(args: {
  supabase: Db;
  userId: string;
  agora?: Date;
}): Promise<BriefingSamiQ> {
  const { supabase, userId } = args;
  const agora = args.agora ?? new Date();
  const hoje = hojeSaoPaulo(agora);
  // hoje → amanhã (2 dias): a Sami cobra a confirmação de amanhã hoje.
  const janela = intervaloAgendaSamiQ(hoje, hoje, hoje);

  const [agendaRes, tarefasRes, inboxRows] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, tipo, status, titulo, data_inicio, lead_id, lead:leads(id, nome)")
      .eq("corretor_id", userId)
      .is("deleted_at", null)
      .in("status", ["agendado", "confirmado"])
      .gte("data_inicio", janela.inicioIso)
      .lte("data_inicio", diaSeguinteFim(janela.fimIso))
      .order("data_inicio", { ascending: true })
      .limit(30),
    supabase
      .from("tarefas")
      .select("id, titulo, data_vencimento, lead_id, lead:leads(id, nome)", { count: "exact" })
      .eq("corretor_id", userId)
      .is("deleted_at", null)
      .in("status", ["pendente", "em_andamento"])
      .lt("data_vencimento", agora.toISOString())
      .order("data_vencimento", { ascending: true })
      .limit(MAX_TAREFAS),
    rpcWithFallback(
      async () => {
        const { data, error } = await supabase.rpc("atendimento_inbox_v4", {
          _corretor_id: userId,
          _limit_per_queue: 1,
        });
        if (error) throw error;
        return data ?? [];
      },
      async () => {
        const { data, error } = await supabase.rpc("atendimento_inbox_v2", {
          _corretor_id: userId,
          _limit_per_queue: 1,
        });
        if (error) throw error;
        return data ?? [];
      },
    ).catch(() => null),
  ]);

  const agenda: BriefingAgendaItem[] = (agendaRes.data ?? []).map((a) => ({
    id: a.id,
    tipo: a.tipo,
    status: a.status,
    titulo: a.titulo,
    inicio: a.data_inicio,
    leadId: a.lead?.id ?? a.lead_id ?? null,
    leadNome: displayNameForSamiQ(a.lead?.nome ?? null),
  }));
  const tarefasVencidas: BriefingTarefa[] = (tarefasRes.data ?? []).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    venceEm: t.data_vencimento,
    leadId: t.lead?.id ?? t.lead_id ?? null,
    leadNome: displayNameForSamiQ(t.lead?.nome ?? null),
  }));

  let contagens: Partial<Record<QueueKey, number>> = {};
  if (inboxRows) {
    try {
      contagens = parseAtendimentoInbox(inboxRows).counts;
    } catch {
      contagens = {};
    }
  }

  return montarBriefingSamiQ({
    agora,
    hoje,
    agenda,
    tarefasVencidas,
    totalTarefasVencidas: tarefasRes.count ?? tarefasVencidas.length,
    contagens,
  });
}

/** "AAAA-MM-DDT23:59:59-03:00" de hoje → o mesmo instante de amanhã. */
function diaSeguinteFim(fimHojeIso: string): string {
  const d = new Date(fimHojeIso);
  return new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString();
}
