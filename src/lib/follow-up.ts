// Motor anti-perda de lead: cada avanço de etapa do funil gera, automaticamente,
// a próxima tarefa de follow-up. Hoje as transições só gravam uma nota na
// timeline — o acompanhamento depende da memória do corretor, e é aí que o lead
// esfria. Esta camada transforma "mudou de etapa" em "tem próximo passo agendado".
//
// A escolha do follow-up (`followUpParaStatus`) é uma função PURA (testável sem
// banco); a persistência (`criarFollowUpAutomatico`) faz dedup e insere em `tarefas`.

import type { LeadStatus } from "@/lib/leads";
import type { TarefaTipo, TarefaPrioridade } from "@/lib/tarefas";
import { supabase } from "@/integrations/supabase/client";

const DIA_MS = 24 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

export type FollowUpTemplate = {
  titulo: string;
  tipo: TarefaTipo;
  prioridade: TarefaPrioridade;
  /** Vencimento da tarefa em ISO 8601. */
  vencimento: string;
};

/**
 * Dada a NOVA etapa do lead, devolve a próxima tarefa de follow-up que o corretor
 * deve cumprir — ou `null` quando a etapa não pede acompanhamento (venda fechada,
 * perdido, ou caixa de entrada ainda não trabalhada).
 *
 * Pura e determinística: `agora` é injetável para os testes.
 */
export function followUpParaStatus(
  status: LeadStatus,
  opts: { nome?: string; dataInicio?: string | null; agora?: Date } = {},
): FollowUpTemplate | null {
  const nome = opts.nome?.trim() || "o cliente";
  const agora = opts.agora ?? new Date();
  const emDias = (n: number) => new Date(agora.getTime() + n * DIA_MS).toISOString();

  switch (status) {
    case "agendado": {
      // Confirmar a visita ~1 dia antes — nunca no passado, nem depois da visita.
      let venc = agora.getTime() + 1 * DIA_MS;
      if (opts.dataInicio) {
        const visita = Date.parse(opts.dataInicio);
        if (!Number.isNaN(visita)) {
          const umDiaAntes = visita - 1 * DIA_MS;
          venc = Math.min(Math.max(umDiaAntes, agora.getTime() + HORA_MS), visita);
        }
      }
      return {
        titulo: `Confirmar visita com ${nome}`,
        tipo: "whatsapp",
        prioridade: "alta",
        vencimento: new Date(venc).toISOString(),
      };
    }
    case "visita_realizada":
      return {
        titulo: `Pós-visita: definir próximo passo com ${nome}`,
        tipo: "follow_up",
        prioridade: "alta",
        vencimento: emDias(2),
      };
    case "analise_credito":
      return {
        titulo: `Cobrar retorno do crédito de ${nome}`,
        tipo: "follow_up",
        prioridade: "media",
        vencimento: emDias(3),
      };
    case "em_atendimento":
      return {
        titulo: `Follow-up com ${nome}`,
        tipo: "follow_up",
        prioridade: "media",
        vencimento: emDias(1),
      };
    case "aguardando_retorno":
      return {
        titulo: `Retomar contato com ${nome}`,
        tipo: "follow_up",
        prioridade: "media",
        vencimento: emDias(1),
      };
    default:
      return null;
  }
}

export type CriarFollowUpArgs = {
  leadId: string;
  nome: string;
  corretorId: string | null;
  status: LeadStatus;
  /** Início da visita (para `agendado`), para mirar a confirmação 1 dia antes. */
  dataInicio?: string | null;
  /** Autor da tarefa; se ausente, usa o usuário autenticado. */
  criadoPorId?: string | null;
};

/**
 * Cria a tarefa de follow-up correspondente à nova etapa, se houver — e desde
 * que ainda não exista uma tarefa ABERTA igual para o lead (evita duplicar
 * quando o corretor reentra na mesma etapa ou refaz o agendamento).
 *
 * Best-effort: devolve `true` se criou a tarefa, `false` se não havia follow-up
 * para a etapa ou já existia uma aberta. Lança apenas em erro de banco — quem
 * chama deve tratar como não-bloqueante (a mudança de etapa não pode falhar por
 * causa do follow-up).
 */
export async function criarFollowUpAutomatico(args: CriarFollowUpArgs): Promise<boolean> {
  const tpl = followUpParaStatus(args.status, {
    nome: args.nome,
    dataInicio: args.dataInicio,
  });
  if (!tpl) return false;

  // Dedup: já existe uma tarefa aberta com o mesmo título para este lead?
  const { data: abertas, error: selErr } = await supabase
    .from("tarefas")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("titulo", tpl.titulo)
    .in("status", ["pendente", "em_andamento"])
    .limit(1);
  if (selErr) throw selErr;
  if (abertas && abertas.length > 0) return false;

  let criadoPor = args.criadoPorId ?? null;
  if (!criadoPor) {
    const { data: u } = await supabase.auth.getUser();
    criadoPor = u.user?.id ?? null;
  }

  const { error: insErr } = await supabase.from("tarefas").insert({
    titulo: tpl.titulo,
    tipo: tpl.tipo,
    status: "pendente",
    prioridade: tpl.prioridade,
    lead_id: args.leadId,
    corretor_id: args.corretorId ?? criadoPor,
    criado_por: criadoPor,
    data_vencimento: tpl.vencimento,
  } as never);
  if (insErr) throw insErr;
  return true;
}
