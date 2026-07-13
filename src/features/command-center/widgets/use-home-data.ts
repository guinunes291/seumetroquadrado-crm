// Dados compartilhados dos widgets da home (Central de Comando).
//
// Regra de ouro: os hooks daqui preservam EXATAMENTE as queryKeys e os
// payloads que viviam na rota /hoje. Quando dois widgets precisam do mesmo
// dado, ambos chamam o mesmo hook — o react-query deduplica pela queryKey
// (uma busca só, vários observadores), sem prop drilling.
//
// O escopo minha/operação chega PRONTO da rota via WidgetProps (PR #78):
// aqui ninguém recalcula papel nem equipe do gestor.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, FileText, MapPin, MessageCircle, Phone, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLeadsComSla } from "@/features/dashboard/queries";
import { scoreLead } from "@/lib/priority";
import { buildWhatsAppUrl } from "@/lib/templates";
import { buildMissionQueue, computeStreak, type Mission } from "@/features/command-center/derive";
import type { WidgetProps } from "@/features/command-center/widget-registry";

export type Periodo = "hoje" | "semana" | "mes";

export type Atividade = {
  dia: string;
  ligacoes: number;
  whatsapps: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
  vendas: number;
  vgv_dia: number;
  pontuacao_total: number;
};

export type MetaDiaria = {
  meta_ligacoes: number;
  meta_whatsapps: number;
  meta_agendamentos: number;
  meta_visitas: number;
  meta_vendas: number;
};

const toDate = (d: Date) => d.toISOString().slice(0, 10);

export function intervalo(p: Periodo): { di: string; df: string } {
  const now = new Date();
  if (p === "hoje") return { di: toDate(now), df: toDate(now) };
  if (p === "semana") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { di: toDate(s), df: toDate(now) };
  }
  return { di: toDate(new Date(now.getFullYear(), now.getMonth(), 1)), df: toDate(now) };
}

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Recorte de WidgetProps que os hooks de dados precisam. */
type ScopeProps = Pick<WidgetProps, "escopo" | "scopeIds" | "scopeKey" | "scopeReady">;

// ---------------------------------------------------------------------------
// Atividades / metas / conquistas (desempenho)
// ---------------------------------------------------------------------------

export function useAtividadesDiarias(
  { scopeIds, scopeKey, scopeReady }: ScopeProps,
  di: string,
  df: string,
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meu-painel:atividades", scopeKey, di, df],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      let q = supabase
        .from("atividades_diarias" as never)
        .select(
          "dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, vgv_dia, pontuacao_total",
        )
        .gte("dia", di)
        .lte("dia", df);
      if (scopeIds) q = q.in("corretor_id", scopeIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Atividade[];
    },
  });
}

/** Streak: últimos 35 dias de atividade (independente do filtro de período). */
export function useStreakAtividade({ scopeIds, scopeKey, scopeReady }: ScopeProps) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meu-painel:streak", scopeKey],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      const ini = new Date();
      ini.setDate(ini.getDate() - 35);
      let q = supabase
        .from("atividades_diarias" as never)
        .select(
          "dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, pontuacao_total",
        )
        .gte("dia", toDate(ini));
      if (scopeIds) q = q.in("corretor_id", scopeIds);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Atividade[];
      const ativos = rows
        .filter(
          (r) =>
            r.ligacoes +
              r.whatsapps +
              r.agendamentos +
              r.visitas +
              r.documentacoes +
              r.vendas +
              r.pontuacao_total >
            0,
        )
        .map((r) => r.dia);
      return computeStreak(ativos, toDate(new Date()));
    },
  });
}

/** Metas: em "minha" é a meta do usuário; em "operacao" é a SOMA das metas de
 *  todos os corretores no escopo (a meta agregada do dia da operação/equipe). */
export function useMetaDiariaAgregada({ scopeIds, scopeKey, scopeReady }: ScopeProps) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meu-painel:meta", scopeKey],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      let q = supabase
        .from("metas_diarias" as never)
        .select("meta_ligacoes, meta_whatsapps, meta_agendamentos, meta_visitas, meta_vendas");
      if (scopeIds) q = q.in("corretor_id", scopeIds);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as MetaDiaria[];
      if (rows.length === 0) return null;
      return rows.reduce<MetaDiaria>(
        (acc, r) => ({
          meta_ligacoes: acc.meta_ligacoes + (r.meta_ligacoes ?? 0),
          meta_whatsapps: acc.meta_whatsapps + (r.meta_whatsapps ?? 0),
          meta_agendamentos: acc.meta_agendamentos + (r.meta_agendamentos ?? 0),
          meta_visitas: acc.meta_visitas + (r.meta_visitas ?? 0),
          meta_vendas: acc.meta_vendas + (r.meta_vendas ?? 0),
        }),
        {
          meta_ligacoes: 0,
          meta_whatsapps: 0,
          meta_agendamentos: 0,
          meta_visitas: 0,
          meta_vendas: 0,
        },
      );
    },
  });
}

export function useConquistas({ scopeIds, scopeKey, scopeReady }: ScopeProps) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meu-painel:conquistas", scopeKey],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      let ganhasQ = supabase.from("conquistas" as never).select("id");
      if (scopeIds) ganhasQ = ganhasQ.in("corretor_id", scopeIds);
      const [minhas, tipos] = await Promise.all([
        ganhasQ,
        supabase
          .from("tipos_conquista" as never)
          .select("id")
          .eq("ativo", true),
      ]);
      return {
        ganhas: minhas.data?.length ?? 0,
        total: tipos.data?.length ?? 0,
      };
    },
  });
}

/** Soma as linhas de atividades_diarias do período nos totais exibidos. */
export function somarAtividades(rows: Atividade[] | undefined) {
  const acc = {
    ligacoes: 0,
    whatsapps: 0,
    agendamentos: 0,
    visitas: 0,
    documentacoes: 0,
    vendas: 0,
    vgv: 0,
    pontos: 0,
  };
  (rows ?? []).forEach((r) => {
    acc.ligacoes += r.ligacoes;
    acc.whatsapps += r.whatsapps;
    acc.agendamentos += r.agendamentos;
    acc.visitas += r.visitas;
    acc.documentacoes += r.documentacoes;
    acc.vendas += r.vendas;
    acc.vgv += Number(r.vgv_dia) || 0;
    acc.pontos += r.pontuacao_total;
  });
  return acc;
}

export type TotaisAtividades = ReturnType<typeof somarAtividades>;

/** Cards de atividade (valor × meta) usados pelas metas do dia e produtividade. */
export function buildAtividadeCards(totais: TotaisAtividades, meta: MetaDiaria | null | undefined) {
  return [
    {
      key: "ligacoes",
      label: "Ligações",
      icon: Phone,
      value: totais.ligacoes,
      meta: meta?.meta_ligacoes,
    },
    {
      key: "whatsapps",
      label: "WhatsApp",
      icon: MessageCircle,
      value: totais.whatsapps,
      meta: meta?.meta_whatsapps,
    },
    {
      key: "agendamentos",
      label: "Agendamentos",
      icon: CalendarCheck,
      value: totais.agendamentos,
      meta: meta?.meta_agendamentos,
    },
    {
      key: "visitas",
      label: "Visitas",
      icon: MapPin,
      value: totais.visitas,
      meta: meta?.meta_visitas,
    },
    {
      key: "documentacoes",
      label: "Documentações",
      icon: FileText,
      value: totais.documentacoes,
      meta: undefined,
    },
    {
      key: "vendas",
      label: "Vendas",
      icon: Trophy,
      value: totais.vendas,
      meta: meta?.meta_vendas,
    },
  ];
}

// ---------------------------------------------------------------------------
// O dia: agenda e tarefas
// ---------------------------------------------------------------------------

function useIntervaloDeHoje() {
  return useMemo(() => {
    const n = new Date();
    const ini = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0);
    const fim = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59);
    return { ini: ini.toISOString(), fim: fim.toISOString() };
  }, []);
}

/** Agendamentos de hoje no escopo (visitas/reuniões), exceto cancelados/concluídos. */
export function useAgendaDeHoje({ scopeIds, scopeKey, scopeReady }: ScopeProps) {
  const { user } = useAuth();
  const hoje = useIntervaloDeHoje();
  return useQuery({
    queryKey: ["meu-dia:agenda", scopeKey, hoje.ini],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("id, titulo, data_inicio, tipo, status, local, lead_id")
        .gte("data_inicio", hoje.ini)
        .lte("data_inicio", hoje.fim)
        .not("status", "in", "(cancelado,realizado,nao_compareceu)")
        .order("data_inicio", { ascending: true });
      if (scopeIds) q = q.in("corretor_id", scopeIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tarefas e follow-ups pendentes (vencendo hoje, atrasados ou sem prazo). */
export function useTarefasDeHoje({ scopeIds, scopeKey, scopeReady }: ScopeProps) {
  const { user } = useAuth();
  const hoje = useIntervaloDeHoje();
  return useQuery({
    queryKey: ["meu-dia:tarefas", scopeKey, hoje.fim],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      let q = supabase
        .from("tarefas")
        .select("id, titulo, tipo, prioridade, status, data_vencimento, lead_id")
        .in("status", ["pendente", "em_andamento"])
        .or(`data_vencimento.lte.${hoje.fim},data_vencimento.is.null`)
        .order("data_vencimento", { ascending: true, nullsFirst: false })
        .limit(30);
      if (scopeIds) q = q.in("corretor_id", scopeIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function contarTarefasAtrasadas(tarefas: Array<{ data_vencimento: string | null }>): number {
  return tarefas.filter(
    (t) => t.data_vencimento && new Date(t.data_vencimento).getTime() < Date.now(),
  ).length;
}

// ---------------------------------------------------------------------------
// Fila de missões (SLA + quentes + sem próxima ação)
// ---------------------------------------------------------------------------

export function useFilaDeMissoes({ escopo, scopeIds, scopeKey, scopeReady }: ScopeProps) {
  const { user } = useAuth();

  // Leads com SLA estourado (Facebook e leads chegados pelo webhook: 5min;
  // demais: 30min — prazo efetivo calculado por leads_com_sla).
  // Em "minha" pedimos o SLA do próprio usuário; em "operacao" pedimos sem
  // filtro (a RPC devolve tudo que o papel pode ver) e restringimos ao escopo
  // no cliente via slaRows (necessário p/ o gestor ver só a própria equipe).
  const slaQ = useLeadsComSla(escopo === "minha" ? (user?.id ?? null) : null, !!user);
  const slaRows = useMemo(() => {
    const rows = slaQ.data ?? [];
    // Só filtramos no cliente na visão de operação de um gestor (subconjunto de
    // corretores). Em "minha" a RPC já veio escopada pelo _corretor, e o admin
    // (scopeIds=null) vê tudo — nesses casos não filtramos, o que também evita
    // depender da coluna corretor_id já estar no banco: se a migration que a
    // acrescenta ainda não foi aplicada, o SLA pessoal/geral continua funcionando.
    if (escopo === "minha" || !scopeIds) return rows;
    const set = new Set(scopeIds);
    return rows.filter((r) => r.corretor_id && set.has(r.corretor_id));
  }, [slaQ.data, scopeIds, escopo]);

  // Leads quentes no escopo que ainda estão no funil ativo (prioridade nº 1).
  const quentesQ = useQuery({
    queryKey: ["meu-dia:quentes", scopeKey],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id, nome, telefone, status, ultima_interacao, projeto_nome")
        .eq("na_lixeira", false)
        .eq("temperatura", "quente")
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .order("ultima_interacao", { ascending: true, nullsFirst: true })
        .limit(10);
      if (scopeIds) q = q.in("corretor_id", scopeIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Guardrail anti-perda: leads ativos no escopo SEM próxima ação — nenhuma
  // tarefa aberta, nenhum agendamento futuro e sem follow-up agendado. São os que
  // silenciosamente esfriam. Ordenados pelo Score de prioridade.
  const semAcaoQ = useQuery({
    queryKey: ["meu-dia:sem-acao", scopeKey],
    enabled: !!user && scopeReady,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      let leadsReq = supabase
        .from("leads")
        .select("id, nome, telefone, status, temperatura, proximo_followup, ultima_interacao")
        .eq("na_lixeira", false)
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .limit(300);
      let tarefasReq = supabase
        .from("tarefas")
        .select("lead_id")
        .in("status", ["pendente", "em_andamento"])
        .not("lead_id", "is", null);
      let agendaReq = supabase
        .from("agendamentos")
        .select("lead_id")
        .gte("data_inicio", nowIso)
        .not("status", "in", "(cancelado,realizado,nao_compareceu)")
        .not("lead_id", "is", null);
      if (scopeIds) {
        leadsReq = leadsReq.in("corretor_id", scopeIds);
        tarefasReq = tarefasReq.in("corretor_id", scopeIds);
        agendaReq = agendaReq.in("corretor_id", scopeIds);
      }
      const [leadsR, tarefasR, agendaR] = await Promise.all([leadsReq, tarefasReq, agendaReq]);
      if (leadsR.error) throw leadsR.error;
      if (tarefasR.error) throw tarefasR.error;
      if (agendaR.error) throw agendaR.error;

      const comTarefa = new Set((tarefasR.data ?? []).map((t) => t.lead_id));
      const comAgenda = new Set((agendaR.data ?? []).map((a) => a.lead_id));
      const agoraMs = Date.now();

      return (leadsR.data ?? [])
        .filter((l) => {
          if (comTarefa.has(l.id) || comAgenda.has(l.id)) return false;
          if (l.proximo_followup && new Date(l.proximo_followup).getTime() > agoraMs) return false;
          return true;
        })
        .map((l) => ({
          ...l,
          _score: scoreLead({
            temperatura: l.temperatura,
            status: l.status,
            ultimaInteracao: l.ultima_interacao,
          }),
        }))
        .sort((a, b) => b._score.score - a._score.score)
        .slice(0, 12);
    },
  });

  // Fila de missões: funde SLA estourado + quentes + sem-ação, dedup, por score.
  const carregando = slaQ.isLoading || quentesQ.isLoading || semAcaoQ.isLoading;
  // Falha de qualquer fonte da fila NÃO pode virar "dia tranquilo": sinaliza erro.
  const erro = slaQ.isError || quentesQ.isError || semAcaoQ.isError;
  const error = slaQ.error ?? quentesQ.error ?? semAcaoQ.error;
  const recarregar = () => {
    void slaQ.refetch();
    void quentesQ.refetch();
    void semAcaoQ.refetch();
  };
  const missoes = useMemo(
    () =>
      buildMissionQueue({
        sla: slaRows.map((l) => ({
          lead_id: l.lead_id,
          nome: l.nome,
          telefone: l.telefone,
          status: l.status,
          minutos_decorridos: l.minutos_decorridos,
          sla_status: l.sla_status,
        })),
        quentes: quentesQ.data ?? [],
        semAcao: semAcaoQ.data ?? [],
      }),
    [slaRows, quentesQ.data, semAcaoQ.data],
  );
  const slaEstourados = useMemo(
    () => slaRows.filter((r) => r.sla_status === "estourado").length,
    [slaRows],
  );
  const semAcaoCount = semAcaoQ.data?.length ?? 0;

  return { missoes, carregando, erro, error, recarregar, slaEstourados, semAcaoCount };
}

/** Ação de contato (WhatsApp) reutilizada no hero e na fila. */
export function abrirWhatsMissao(m: Pick<Mission, "nome" | "telefone">) {
  const primeiro = m.nome.split(" ")[0] ?? m.nome;
  window.open(
    buildWhatsAppUrl(
      m.telefone ?? "",
      `Olá, ${primeiro}! Aqui é da Seu Metro Quadrado. Posso te ajudar agora?`,
    ),
    "_blank",
    "noopener,noreferrer",
  );
}
