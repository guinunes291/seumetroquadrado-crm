// A aba "Agenda" do hub /agendamentos no padrão Lançamento (2026-10). O
// cabeçalho ("Agenda" + "Novo agendamento") mora no hub, antes das abas no
// celular; aqui ficam:
//   - o cartão "Hoje" (useAgendaDoDia, a mesma query do hub /inicio): cada
//     compromisso com o estado e UMA ação visível — validar, confirmar,
//     ligar (useLigarLead: 3C Plus com recuo para o tel:) ou remarcar;
//   - a linha discreta do mês com Calendário/Lista e os filtros atrás de
//     "Filtros"; no desktop a grade mensal, no celular a lista começando hoje;
//   - a lateral do desktop: "A validar" e "Amanhã" (classificarAgenda);
//   - o diálogo de edição de sempre, com a remoção confirmada num AlertDialog.
//
// Não muda: a query da grade (mesma queryKey e filtros), o insert/update/
// soft-delete, o espelho no Google Agenda, a validação (RPC salvar_modo_visita)
// e o remarcar (useAcoesAgenda).

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLigarLead } from "@/hooks/use-ligar-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { syncAgendamentoGoogle } from "@/lib/google-calendar.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { FiltrosMenu } from "@/components/ui/filtros-menu";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AgendaCalendar } from "./agenda-calendar";
import { AgendaTimeline } from "./agenda-timeline";
import { AgendamentoForm } from "./agendamento-form";
import { nomeCurto, recortarPorCorretor, type ItemAgendaDia } from "./agenda-do-dia";
import { HojeCard, PainelAmanha, PainelAValidar, type Desfecho } from "./agenda-hoje";
import { RemarcarDialog } from "./remarcar-dialog";
import { STATUS_LABEL, STATUS_OPTIONS, type Agendamento } from "./types";
import {
  invalidarAgendaDoDia,
  useAcoesAgenda,
  useAgendaDoDia,
  useCriarAgendamento,
} from "./use-agenda-do-dia";
import { ValidarVisitaSheet } from "./validar-visita-sheet";

// Espelha no Google Calendar em segundo plano — nunca bloqueia o fluxo do CRM.
function syncGoogleEmBackground(agendamentoId: string) {
  syncAgendamentoGoogle({ data: { agendamentoId } })
    .then((r) => {
      if (!r.synced && r.reason && !/não configurado|sem Google conectado/.test(r.reason)) {
        toast.warning("Agendamento salvo, mas não sincronizou com o Google Agenda", {
          description: r.reason,
        });
      }
    })
    .catch(() => {
      /* silencioso: o agendamento em si já foi salvo */
    });
}

// As listas do formulário — as MESMAS queryKeys do card do hub /inicio
// (cache compartilhado entre as telas).
async function buscarCorretores() {
  const { data, error } = await supabase.from("profiles").select("id, nome, email").order("nome");
  if (error) throw error;
  return data ?? [];
}

async function buscarLeads() {
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, telefone, corretor_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

/** O compromisso do cartão do dia no formato do diálogo de edição (os campos
 *  que o recorte do dia não carrega não entram no update — o formulário monta
 *  o patch só com o que ele edita). */
function paraAgendamento(item: ItemAgendaDia): Agendamento {
  const { lead: _lead, ...resto } = item;
  return {
    ...resto,
    criado_por_id: null,
    timezone: "America/Sao_Paulo",
    motivo_cancelamento: null,
    realizado_em: null,
  };
}

/**
 * "Novo agendamento" — a única ação do cabeçalho da Agenda. O botão (filho)
 * vira o gatilho do diálogo; `open` é controlado pelo hub para que o vazio da
 * lista também possa abri-lo.
 */
export function NovoAgendamentoDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const corretoresQ = useQuery({
    queryKey: ["profiles-min"],
    enabled: open,
    queryFn: buscarCorretores,
  });
  const leadsQ = useQuery({ queryKey: ["leads-min"], enabled: open, queryFn: buscarLeads });
  // O mesmo insert tipado do "+ Agendar" do hub /inicio (linhaDoFormulario):
  // as mesmas colunas que o formulário manda, sem cast; invalida o detalhe do
  // lead e o cartão "Hoje" e espelha no Google em segundo plano.
  const criar = useCriarAgendamento();

  if (!user) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {open && (
        <AgendamentoForm
          title="Novo agendamento"
          corretores={corretoresQ.data ?? []}
          leads={leadsQ.data ?? []}
          isAdminOrGestor={isAdmin || isGestor}
          currentUserId={user.id}
          onSubmit={(payload) => criar.mutate(payload, { onSuccess: () => onOpenChange(false) })}
          pending={criar.isPending}
        />
      )}
    </Dialog>
  );
}

type Visao = "calendar" | "list";

export function AgendaPage({ onNovo }: { onNovo: () => void }) {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const gestao = isAdmin || isGestor;
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  // Sem escolha do usuário: grade no desktop, lista no celular.
  const [visaoEscolhida, setVisao] = useState<Visao | null>(null);
  const view: Visao = visaoEscolhida ?? (isMobile ? "list" : "calendar");
  const [cursor, setCursor] = useState(() => new Date());
  const [filtroCorretor, setFiltroCorretor] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [validando, setValidando] = useState<{ item: ItemAgendaDia; desfecho: Desfecho } | null>(
    null,
  );
  const [remarcando, setRemarcando] = useState<ItemAgendaDia | null>(null);

  const { data: corretores = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: buscarCorretores,
  });
  const { data: leads = [] } = useQuery({ queryKey: ["leads-min"], queryFn: buscarLeads });

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const rangeStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const {
    data: agendamentos = [],
    isLoading: agLoading,
    isError: agError,
    error: agErrorObj,
    refetch: agRefetch,
  } = useQuery({
    queryKey: [
      "agendamentos",
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      filtroCorretor,
      filtroStatus,
    ],
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("*")
        .is("deleted_at", null)
        .gte("data_inicio", rangeStart.toISOString())
        .lte("data_inicio", rangeEnd.toISOString())
        .order("data_inicio");
      if (filtroCorretor !== "todos") q = q.eq("corretor_id", filtroCorretor);
      if (filtroStatus !== "todos") q = q.eq("status", filtroStatus as Agendamento["status"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Agendamento[];
    },
  });

  useRealtimeInvalidate("agendamentos", [["agendamentos"]]);

  // O dia (cartão "Hoje" e lateral): a mesma query do hub /inicio, recortada
  // pelo filtro de corretor da gestão quando há um escolhido.
  const dia = useAgendaDoDia();
  const acoes = useAcoesAgenda();
  const { ligar, discando } = useLigarLead();
  const agora = dia.agora;
  const corretorFiltrado = gestao && filtroCorretor !== "todos" ? filtroCorretor : null;
  const classificada = useMemo(
    () => recortarPorCorretor(dia.classificada, corretorFiltrado),
    [dia.classificada, corretorFiltrado],
  );
  const tipoEscopo = dia.escopo?.tipo ?? "minha";
  const nomeCorretorDoDia =
    tipoEscopo !== "minha" && !corretorFiltrado
      ? (item: ItemAgendaDia) => dia.nomes.get(item.corretor_id)
      : undefined;
  const carregandoDia = (!dia.escopoPronto && !dia.escopoErro) || dia.query.isLoading;
  const ocupadoId =
    (acoes.confirmar.isPending && acoes.confirmar.variables?.id) ||
    (acoes.validar.isPending && acoes.validar.variables?.item.id) ||
    (acoes.remarcar.isPending && acoes.remarcar.variables?.item.id) ||
    null;

  const corretorNome = (id: string | null) => corretores.find((c) => c.id === id)?.nome ?? "—";
  const leadNome = (id: string | null) =>
    id ? (leads.find((l) => l.id === id)?.nome ?? null) : null;

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      patch,
      leadId,
    }: {
      id: string;
      patch: Partial<Agendamento>;
      leadId: string | null;
    }) => {
      const { error } = await supabase.from("agendamentos").update(patch).eq("id", id);
      if (error) throw error;
      return { id, leadId: patch.lead_id ?? leadId };
    },
    onSuccess: ({ id, leadId }) => {
      invalidarAgendaDoDia(qc, leadId);
      toast.success("Agendamento atualizado");
      setEditing(null);
      syncGoogleEmBackground(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string | null }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { id, leadId };
    },
    onSuccess: ({ id, leadId }) => {
      invalidarAgendaDoDia(qc, leadId);
      toast.success("Agendamento movido para a lixeira");
      setEditing(null);
      syncGoogleEmBackground(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  const acoesDaLinha = {
    onConfirmar: (item: ItemAgendaDia) => acoes.confirmar.mutate(item),
    onValidar: (item: ItemAgendaDia, desfecho: Desfecho) => setValidando({ item, desfecho }),
    onRemarcar: (item: ItemAgendaDia) => setRemarcando(item),
    onLigar: (item: ItemAgendaDia) => {
      if (item.lead) {
        ligar({ id: item.lead.id, nome: item.lead.nome, telefone: item.lead.telefone });
      }
    },
    onEditar: (item: ItemAgendaDia) =>
      setEditing(agendamentos.find((a) => a.id === item.id) ?? paraAgendamento(item)),
  };

  const mes = format(cursor, "MMMM 'de' yyyy", { locale: ptBR });
  const filtrosAtivos =
    (gestao && filtroCorretor !== "todos" ? 1 : 0) + (filtroStatus !== "todos" ? 1 : 0);
  const resumoFiltros = [
    filtroStatus === "todos" ? "todos os status" : STATUS_LABEL[filtroStatus].toLowerCase(),
    gestao
      ? filtroCorretor === "todos"
        ? "todos os corretores"
        : (corretores.find((c) => c.id === filtroCorretor)?.nome ?? "corretor")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // No mês corrente a lista começa hoje (o que passou fica a um toque).
  const desde = isSameMonth(cursor, agora) ? startOfDay(agora) : null;
  const rotuloNaGrade = (a: Agendamento) => {
    const nome = leadNome(a.lead_id);
    return nome ? nomeCurto(nome) : a.titulo;
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <div className="min-w-0 space-y-5">
        <HojeCard
          agora={agora}
          classificada={classificada}
          tipoEscopo={tipoEscopo}
          carregando={carregandoDia}
          erro={dia.escopoErro ?? (dia.query.isError ? dia.query.error : null)}
          tituloErro={
            dia.escopoErro
              ? "Não foi possível carregar a sua equipe para montar a agenda."
              : "Não foi possível carregar a agenda do dia."
          }
          onRetry={() => void (dia.escopoErro ? dia.refetchEscopo() : dia.query.refetch())}
          nomeCorretor={nomeCorretorDoDia}
          ocupadoId={ocupadoId}
          ligando={discando}
          acoes={acoesDaLinha}
        />

        <section aria-label={`Calendário de ${mes}`} className="space-y-2.5">
          {/* A linha discreta do mês: navegação, Calendário/Lista e Filtros. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Mês anterior"
                onClick={() => setCursor(addMonths(cursor, -1))}
              >
                <CaretLeft className="h-4 w-4" />
              </Button>
              <h2 className="min-w-[124px] text-center font-display text-[15px] font-semibold sm:min-w-[140px]">
                {mes}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Próximo mês"
                onClick={() => setCursor(addMonths(cursor, 1))}
              >
                <CaretRight className="h-4 w-4" />
              </Button>
              <span className="mx-0.5 text-muted-foreground" aria-hidden="true">
                ·
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-primary"
                onClick={() => setCursor(new Date())}
              >
                Hoje
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <div
                role="group"
                aria-label="Visualização"
                className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-[3px]"
              >
                {(
                  [
                    ["calendar", "Calendário"],
                    ["list", "Lista"],
                  ] as const
                ).map(([v, rotulo]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setVisao(v)}
                    className={cn(
                      "h-[26px] rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors",
                      view === v && "bg-background text-foreground shadow-sm",
                    )}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <FiltrosMenu
                ativos={filtrosAtivos}
                resumo={<span className="hidden sm:inline">{resumoFiltros}</span>}
                onLimpar={() => {
                  setFiltroCorretor("todos");
                  setFiltroStatus("todos");
                }}
              >
                {gestao && (
                  <div className="space-y-1.5">
                    <Label htmlFor="agenda-filtro-corretor">Corretor</Label>
                    <Select value={filtroCorretor} onValueChange={setFiltroCorretor}>
                      <SelectTrigger id="agenda-filtro-corretor">
                        <SelectValue placeholder="Corretor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os corretores</SelectItem>
                        {corretores.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome ?? c.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="agenda-filtro-status">Status</Label>
                  <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                    <SelectTrigger id="agenda-filtro-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FiltrosMenu>
            </div>
          </div>

          {agError ? (
            <QueryErrorState
              title="Não foi possível carregar a agenda."
              error={agErrorObj}
              onRetry={() => agRefetch()}
            />
          ) : view === "calendar" ? (
            <AgendaCalendar
              cursor={cursor}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              agendamentos={agendamentos}
              agora={agora}
              rotulo={rotuloNaGrade}
              onSelect={setEditing}
            />
          ) : (
            <AgendaTimeline
              key={format(cursor, "yyyy-MM")}
              agendamentos={agendamentos}
              loading={agLoading}
              agora={agora}
              desde={desde}
              corretorNome={corretorNome}
              leadNome={leadNome}
              mostrarCorretor={gestao && filtroCorretor === "todos"}
              onSelect={setEditing}
              onCreate={onNovo}
            />
          )}
        </section>
      </div>

      <aside className="hidden flex-col gap-3 xl:flex" aria-label="Ao lado da agenda">
        <PainelAValidar
          pendentes={classificada.pendentes}
          carregando={carregandoDia}
          ocupadoId={ocupadoId}
          nomeCorretor={nomeCorretorDoDia}
          onValidar={acoesDaLinha.onValidar}
        />
        <PainelAmanha
          amanha={classificada.amanha}
          carregando={carregandoDia}
          agora={agora}
          nomeCorretor={nomeCorretorDoDia}
        />
      </aside>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <AgendamentoForm
            title="Editar agendamento"
            initial={editing}
            corretores={corretores}
            leads={leads}
            isAdminOrGestor={gestao}
            currentUserId={user.id}
            onSubmit={(patch) =>
              updateMut.mutate({ id: editing.id, patch, leadId: editing.lead_id ?? null })
            }
            onDelete={() => setRemovendo(true)}
            pending={updateMut.isPending || deleteMut.isPending}
          />
        </Dialog>
      )}

      {/* Remover pede confirmação no AlertDialog (nunca o confirm() nativo). */}
      <AlertDialog open={removendo && !!editing} onOpenChange={setRemovendo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {editing?.titulo
                ? `“${editing.titulo}” vai para a lixeira.`
                : "Ele vai para a lixeira."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (editing) deleteMut.mutate({ id: editing.id, leadId: editing.lead_id ?? null });
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {validando && (
        <ValidarVisitaSheet
          key={validando.item.id}
          item={validando.item}
          desfechoInicial={validando.desfecho}
          onOpenChange={(o) => !o && setValidando(null)}
          onSubmit={(registro) =>
            acoes.validar.mutate(
              { item: validando.item, registro },
              { onSuccess: () => setValidando(null) },
            )
          }
          pending={acoes.validar.isPending}
        />
      )}
      {remarcando && (
        <RemarcarDialog
          key={remarcando.id}
          item={remarcando}
          onOpenChange={(o) => !o && setRemarcando(null)}
          onSubmit={(novoInicio) =>
            acoes.remarcar.mutate(
              { item: remarcando, novoInicio },
              { onSuccess: () => setRemarcando(null) },
            )
          }
          pending={acoes.remarcar.isPending}
        />
      )}
    </div>
  );
}
