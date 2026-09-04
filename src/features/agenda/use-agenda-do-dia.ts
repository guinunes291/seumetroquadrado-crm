// Dados e escrita da agenda do dia (hub /inicio). A leitura é UMA query da
// agenda PRÓPRIA do usuário (corretor_id = eu) na janela [hoje − 7d, amanhã];
// a classificação em pendentes/hoje/amanhã é pura (agenda-do-dia.ts).
//
// Escrita: nenhuma regra nova de banco. Confirmar é um UPDATE de status (RLS
// da carteira); validar reusa a RPC salvar_modo_visita (a mesma do Modo
// Visita: valida o agendamento, grava interesse/objeção, registra na timeline,
// reagenda e move o lead numa transação); remarcar insere o novo horário e
// marca o antigo como "remarcado", com compensação se o segundo passo falhar.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { invalidateAgendamentoQueries } from "@/lib/agendamentos";
import { criarFollowUpAutomatico, garantirFollowUpAberto } from "@/lib/follow-up";
import { syncAgendamentoGoogle } from "@/lib/google-calendar.functions";
import {
  classificarAgenda,
  etapaEfetiva,
  janelaDaAgenda,
  payloadSalvarVisita,
  remarcarPayload,
  validarRegistroVisita,
  validarRemarcacao,
  type AgendamentoInsert,
  type ItemAgendaDia,
  type RegistroVisita,
} from "./agenda-do-dia";
import type { Agendamento } from "./types";

export const AGENDA_DO_DIA_KEY = "agenda-do-dia";

// Literal ÚNICO (sem concatenação): é o texto literal que deixa o supabase-js
// tipar o join `lead:leads(...)` pela FK agendamentos_lead_id_fkey.
const COLUNAS =
  "id, lead_id, corretor_id, tipo, status, titulo, descricao, local, data_inicio, data_fim, lembrete_minutos, lead:leads(id, nome, telefone, projeto_nome)";

/** Relógio que avança a cada minuto: "já começou" / "já passou" viram sem F5. */
export function useRelogio(intervaloMs = 60_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

export function useAgendaDoDia() {
  const { user } = useAuth();
  const uid = user?.id;
  const agora = useRelogio();
  // A janela depende só do DIA — recalcular por minuto invalidaria a query à toa.
  const diaKey = format(agora, "yyyy-MM-dd");
  const janela = useMemo(() => janelaDaAgenda(new Date(`${diaKey}T12:00:00`)), [diaKey]);

  const query = useQuery({
    queryKey: [AGENDA_DO_DIA_KEY, uid, diaKey],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<ItemAgendaDia[]> => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(COLUNAS)
        .eq("corretor_id", uid!)
        .is("deleted_at", null)
        .neq("status", "cancelado")
        .gte("data_inicio", janela.inicio.toISOString())
        .lte("data_inicio", janela.fim.toISOString())
        .order("data_inicio")
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Push do Supabase só para as MINHAS linhas — outro aparelho (ou o gestor)
  // mexendo na agenda reflete aqui sem polling.
  useRealtimeInvalidate("agendamentos", [[AGENDA_DO_DIA_KEY]], {
    enabled: !!uid,
    filter: uid ? `corretor_id=eq.${uid}` : undefined,
  });

  const classificada = useMemo(
    () => classificarAgenda(query.data ?? [], agora),
    [query.data, agora],
  );

  return { query, agora, classificada };
}

/** Invalidação canônica + as chaves específicas desta tela e das vizinhas
 *  (widget da /hoje, Modo Visita, modal da ficha, badges da sidebar). */
export function invalidarAgendaDoDia(qc: QueryClient, leadId?: string | null) {
  invalidateAgendamentoQueries(qc, leadId);
  qc.invalidateQueries({ queryKey: [AGENDA_DO_DIA_KEY] });
  qc.invalidateQueries({ queryKey: ["meu-dia:agenda"] });
  qc.invalidateQueries({ queryKey: ["modo-visita"] });
  qc.invalidateQueries({ queryKey: ["nav-badges"] });
  if (leadId) qc.invalidateQueries({ queryKey: ["visita-validar", leadId] });
}

// Espelha no Google Calendar em segundo plano — nunca bloqueia o fluxo do CRM
// (mesmo contrato da rota /agendamentos).
function syncGoogleEmBackground(agendamentoId: string) {
  syncAgendamentoGoogle({ data: { agendamentoId } })
    .then((r) => {
      if (!r.synced && r.reason && !/não configurado|sem Google conectado/.test(r.reason)) {
        toast.warning("Salvo, mas não sincronizou com o Google Agenda", {
          description: r.reason,
        });
      }
    })
    .catch(() => {
      /* silencioso: o agendamento em si já foi salvo */
    });
}

const mensagemDeErro = (e: unknown) =>
  e instanceof Error ? e.message : "Tente novamente em instantes.";

export function useAcoesAgenda() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const confirmar = useMutation({
    mutationFn: async (item: ItemAgendaDia) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: "confirmado" })
        .eq("id", item.id)
        .eq("status", "agendado");
      if (error) throw error;

      // A tarefa D-1 "Confirmar visita com X" (motor anti-perda) nasceu para
      // isto — confirmar aqui a conclui, senão o corretor pagaria a mesma ação
      // duas vezes. Best-effort: falha vira só um aviso no console.
      if (item.lead_id) {
        const { error: tErr } = await supabase
          .from("tarefas")
          .update({
            status: "concluida",
            data_conclusao: new Date().toISOString(),
            resultado: "Confirmado pela agenda do dia",
          })
          .eq("lead_id", item.lead_id)
          .in("status", ["pendente", "em_andamento"])
          .ilike("titulo", "Confirmar visita%");
        if (tErr) console.warn("[agenda-do-dia] tarefa de confirmação não concluída", tErr);
      }
      return item;
    },
    onSuccess: (item) => {
      invalidarAgendaDoDia(qc, item.lead_id);
      toast.success("Compromisso confirmado", {
        description: item.lead?.nome ? `${item.lead.nome} · ${item.titulo}` : item.titulo,
      });
      syncGoogleEmBackground(item.id);
    },
    onError: (e) => toast.error("Não foi possível confirmar.", { description: mensagemDeErro(e) }),
  });

  const remarcar = useMutation({
    mutationFn: async ({ item, novoInicio }: { item: ItemAgendaDia; novoInicio: Date }) => {
      const erro = validarRemarcacao(novoInicio);
      if (erro) throw new Error(erro);
      const uid = user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre de novo.");

      // 1) Novo horário primeiro: se falhar, nada mudou.
      const { data: criado, error: insErr } = await supabase
        .from("agendamentos")
        .insert(remarcarPayload(item, novoInicio, uid))
        .select("id")
        .single();
      if (insErr) throw insErr;
      const novoId = criado.id;

      // 2) O antigo vira "remarcado" — COM COMPENSAÇÃO: sem isto sobrariam
      //    dois horários abertos para a mesma visita.
      const { error: updErr } = await supabase
        .from("agendamentos")
        .update({ status: "remarcado" })
        .eq("id", item.id);
      if (updErr) {
        await supabase
          .from("agendamentos")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", novoId);
        throw updErr;
      }

      // 3) A confirmação D-1 mira o horário novo (dedup ±1 dia no motor).
      if (item.lead_id) {
        try {
          await criarFollowUpAutomatico({
            leadId: item.lead_id,
            nome: item.lead?.nome ?? "",
            corretorId: item.corretor_id,
            status: "agendado",
            dataInicio: novoInicio.toISOString(),
            criadoPorId: uid,
          });
        } catch (e) {
          console.warn("[agenda-do-dia] follow-up de confirmação não criado", e);
        }
      }
      return { novoId, item };
    },
    onSuccess: ({ novoId, item }) => {
      invalidarAgendaDoDia(qc, item.lead_id);
      toast.success("Compromisso remarcado");
      syncGoogleEmBackground(item.id);
      syncGoogleEmBackground(novoId);
    },
    onError: (e) => toast.error("Não foi possível remarcar.", { description: mensagemDeErro(e) }),
  });

  const validar = useMutation({
    mutationFn: async ({ item, registro }: { item: ItemAgendaDia; registro: RegistroVisita }) => {
      const erros = validarRegistroVisita(registro);
      const primeiro = Object.values(erros)[0];
      if (primeiro) throw new Error(primeiro);
      if (!item.lead_id) throw new Error("Só visitas vinculadas a um lead podem ser validadas.");

      const { error } = await supabase.rpc(
        "salvar_modo_visita",
        payloadSalvarVisita(item, registro),
      );
      if (error) throw error;

      // Motor anti-perda: a visita (ou o no-show) nunca fica sem próximo
      // passo agendado. Vencimento = o "próximo contato" que o corretor viu na
      // tela, o mesmo que a RPC gravou em leads.proximo_followup.
      let followUp = false;
      const etapa = etapaEfetiva(registro);
      const venc = registro.proximoFollowup ? new Date(registro.proximoFollowup) : null;
      if (venc && !Number.isNaN(venc.getTime())) {
        try {
          followUp = await garantirFollowUpAberto({
            leadId: item.lead_id,
            tipo: "follow_up",
            titulo:
              etapa === "visita_realizada"
                ? `Pós-visita: definir próximo passo com ${item.lead?.nome ?? "o cliente"}`
                : `Retomar contato com ${item.lead?.nome ?? "o cliente"}`,
            prioridade: "alta",
            vencimento: venc.toISOString(),
            corretorId: item.corretor_id,
            criadoPorId: user?.id ?? null,
          });
        } catch (e) {
          console.warn("[agenda-do-dia] follow-up pós-visita não criado", e);
        }
      }
      return { item, registro, followUp };
    },
    onSuccess: ({ item, registro, followUp }) => {
      invalidarAgendaDoDia(qc, item.lead_id);
      qc.invalidateQueries({ queryKey: ["interacoes", item.lead_id] });
      const titulo = registro.compareceu
        ? "Visita registrada · lead em Visita realizada"
        : "Não comparecimento registrado · lead em Aguardando retorno";
      const extras = [
        registro.reagendarPara ? "novo horário criado" : null,
        followUp ? "follow-up criado" : null,
      ].filter(Boolean);
      toast.success(titulo, { description: extras.length ? extras.join(" · ") : undefined });
      syncGoogleEmBackground(item.id);
    },
    onError: (e) =>
      toast.error("Não foi possível registrar a visita.", { description: mensagemDeErro(e) }),
  });

  return { confirmar, remarcar, validar };
}

/** Payload do AgendamentoForm → linha de INSERT tipada (fronteira explícita,
 *  sem cast de escape): o formulário já validou título e datas. */
function linhaDoFormulario(payload: Partial<Agendamento>, criadoPorId: string): AgendamentoInsert {
  const { titulo, corretor_id, data_inicio, data_fim } = payload;
  if (!titulo || !corretor_id || !data_inicio || !data_fim) {
    throw new Error("Preencha título, responsável e horários.");
  }
  return {
    titulo,
    corretor_id,
    data_inicio,
    data_fim,
    criado_por_id: criadoPorId,
    tipo: payload.tipo,
    status: payload.status,
    lead_id: payload.lead_id ?? null,
    local: payload.local ?? null,
    descricao: payload.descricao ?? null,
    lembrete_minutos: payload.lembrete_minutos,
    motivo_cancelamento: payload.motivo_cancelamento ?? null,
  };
}

/** "+ Agendar" do card: mesmo insert da rota /agendamentos (sem mover lead —
 *  quem move é o modal de etapa "Agendado", na ficha e no kanban). */
export function useCriarAgendamento() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Agendamento>) => {
      if (!user?.id) throw new Error("Sessão expirada. Entre de novo.");
      const { data, error } = await supabase
        .from("agendamentos")
        .insert(linhaDoFormulario(payload, user.id))
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, leadId: payload.lead_id ?? null };
    },
    onSuccess: (criado) => {
      invalidarAgendaDoDia(qc, criado.leadId);
      toast.success("Agendamento criado");
      syncGoogleEmBackground(criado.id);
    },
    onError: (e) => toast.error("Não foi possível agendar.", { description: mensagemDeErro(e) }),
  });
}
