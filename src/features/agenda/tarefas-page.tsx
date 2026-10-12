// Tarefas no padrão Lançamento (2026-10) — a aba "tarefas" do hub
// /agendamentos (o cabeçalho "Tarefas" mora no hub, antes das abas no celular).
// O topo responde "como estou agora" em três números com dono (Vencidas · Para
// hoje · Esta semana); a ação principal é a linha navy de criar (Enter), com o
// diálogo completo em "+ detalhes"; a lista vem agrupada como a Fila Única
// (Vencidas → Hoje → Depois → Sem data), uma linha de meta por tarefa e
// Adiar/Editar no "…". Concluídas descem para "Ver concluídas".
//
// Não muda: as queries, o insert do quick-add (SEM data de vencimento — por
// isso o grupo "Sem data"), o concluir com Desfazer (useUndoableMutation), o
// adiar, o diálogo de criar/editar e o badge de vencidas da sidebar (é do
// banco, nav_pendencias). Regras de grupo e números em tarefas-derive.ts.

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useUndoableMutation } from "@/hooks/use-undoable-mutation";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { FiltrosMenu } from "@/components/ui/filtros-menu";
import { AcoesLinha, type AcaoDaLinha } from "@/components/ui/acoes-linha";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CaretDown,
  CheckCircle,
  Clock,
  ListChecks,
  MagnifyingGlass,
  PencilSimple,
  Plus,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  TAREFA_STATUS,
  TAREFA_TIPOS,
  TAREFA_PRIORIDADES,
  STATUS_LABEL,
  TIPO_LABEL,
  PRIORIDADE_LABEL,
  type TarefaStatus,
  type TarefaTipo,
  type TarefaPrioridade,
} from "@/lib/tarefas";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { AgendaDeHoje } from "@/features/fila-unica/fila-lateral";
import { useRelogio } from "./use-agenda-do-dia";
import {
  agruparTarefas,
  concluidasHoje,
  estaAberta,
  GRUPO_DOT,
  GRUPO_HINT,
  GRUPO_LABEL,
  metaDaTarefa,
  numerosDasTarefas,
  ORDEM_GRUPOS,
  PRIORIDADE_DOT,
} from "./tarefas-derive";

type TarefaRow = Tables<"tarefas"> & {
  leads: { id: string; nome: string | null } | null;
  profiles: { id: string; nome: string | null } | null;
};

type TarefaPayload = Partial<TablesInsert<"tarefas">>;

/** Filtro de status da lista: as abertas (padrão) ou uma delas. Concluídas e
 *  canceladas ficam atrás de "Ver concluídas". */
const STATUS_ABERTOS = ["pendente", "em_andamento"] as const;

const HORA_MS = 60 * 60 * 1000;
const ADIAR: { rotulo: string; ms: number }[] = [
  { rotulo: "Adiar 1 hora", ms: HORA_MS },
  { rotulo: "Adiar 1 dia", ms: 24 * HORA_MS },
  { rotulo: "Adiar 1 semana", ms: 7 * 24 * HORA_MS },
];

export function TarefasPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManageAll = isAdmin || isGestor;
  const qc = useQueryClient();
  const agora = useRelogio();

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [quickTitulo, setQuickTitulo] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroCorretor, setFiltroCorretor] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TarefaRow | null>(null);
  // "+ detalhes" leva o que já foi digitado na linha rápida para o diálogo.
  const [rascunho, setRascunho] = useState("");
  const [verConcluidas, setVerConcluidas] = useState(false);

  const tarefasQuery = useQuery({
    queryKey: ["tarefas", { canManageAll }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*, leads(id, nome), profiles!tarefas_corretor_id_fkey(id, nome)")
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (error) throw error;
      // Fronteira explícita: o hint `profiles!tarefas_corretor_id_fkey` resolve
      // no PostgREST, mas os types gerados não conhecem essa relação.
      return (data ?? []) as unknown as TarefaRow[];
    },
  });

  useRealtimeInvalidate("tarefas", [["tarefas"]]);

  const leadsQuery = useQuery({
    queryKey: ["tarefas:leads-opt"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, nome")
        .is("deleted_at", null)
        .order("nome")
        .limit(200);
      return data ?? [];
    },
  });

  const corretoresQuery = useQuery({
    queryKey: ["tarefas:corretores-opt"],
    enabled: canManageAll,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  // Busca (título ou lead), tipo e corretor valem para abertas e concluídas;
  // o status só escolhe entre as abertas.
  const tarefasFiltradas = useMemo(() => {
    const list = tarefasQuery.data ?? [];
    const termo = busca.trim().toLowerCase();
    return list.filter((t) => {
      if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
      if (canManageAll && filtroCorretor !== "todos" && t.corretor_id !== filtroCorretor) {
        return false;
      }
      if (
        termo &&
        !t.titulo?.toLowerCase().includes(termo) &&
        !t.leads?.nome?.toLowerCase().includes(termo)
      ) {
        return false;
      }
      if (filtroStatus !== "todos" && estaAberta(t) && t.status !== filtroStatus) return false;
      return true;
    });
  }, [tarefasQuery.data, filtroStatus, filtroTipo, filtroCorretor, busca, canManageAll]);

  const { grupos, encerradas } = useMemo(
    () => agruparTarefas(tarefasFiltradas, agora),
    [tarefasFiltradas, agora],
  );

  // Os três números do topo contam a carteira toda (sem os filtros da lista),
  // como os números de antes.
  const numeros = useMemo(
    () => numerosDasTarefas(agruparTarefas(tarefasQuery.data ?? [], agora).grupos, agora),
    [tarefasQuery.data, agora],
  );

  const saveMutation = useMutation({
    mutationFn: async (payload: TarefaPayload) => {
      if (editing?.id) {
        const { error } = await supabase.from("tarefas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefas").insert({
          ...payload,
          corretor_id: payload.corretor_id ?? user?.id,
          criado_por: user?.id,
        } as TablesInsert<"tarefas">);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tarefa atualizada" : "Tarefa criada");
      // Criada pelo "+ detalhes": o rascunho da linha rápida virou a tarefa.
      if (!editing) setQuickTitulo("");
      setDialogOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Concluir tarefa usa o padrão universal de Desfazer (delayed): o círculo
  // marca na hora via patch otimista — defensivo, pois o cache sob ["tarefas"]
  // pode guardar um array puro OU o shape { rows } — e o servidor só é chamado
  // quando a janela de 5s do toast expira. Desfazer = restaurar os snapshots.
  const concluirTarefa = useUndoableMutation<{ id: string; resultado?: string }>({
    mode: "delayed",
    message: () => "Tarefa concluída",
    mutationFn: async ({ id, resultado }) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString(), resultado })
        .eq("id", id);
      if (error) throw error;
    },
    optimistic: {
      keys: [["tarefas"]],
      apply: (cached, { id }) => {
        const concluir = (rows: unknown[]) =>
          rows.map((r) => {
            const row = r && typeof r === "object" ? (r as { id?: unknown }) : null;
            return row && row.id === id
              ? { ...row, status: "concluida", data_conclusao: new Date().toISOString() }
              : r;
          });
        if (Array.isArray(cached)) return concluir(cached);
        if (cached && typeof cached === "object") {
          const c = cached as { rows?: unknown };
          if (Array.isArray(c.rows)) return { ...cached, rows: concluir(c.rows) };
        }
        return cached;
      },
    },
    invalidateKeys: [["tarefas"]],
    errorMessage: "Não foi possível concluir a tarefa",
  });

  // Snooze: adia o vencimento da tarefa para agora + N (1h / 1 dia / 1 semana).
  const snoozeMutation = useMutation({
    mutationFn: async ({ id, ms }: { id: string; ms: number }) => {
      const novo = new Date(Date.now() + ms).toISOString();
      const { error } = await supabase
        .from("tarefas")
        .update({ data_vencimento: novo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa adiada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Quick-add: cria uma tarefa só com o título (padrões follow-up / média / pendente).
  const quickAdd = useMutation({
    mutationFn: async () => {
      const titulo = quickTitulo.trim();
      if (!titulo) throw new Error("Escreva o título da tarefa.");
      const payload: TarefaPayload = {
        titulo,
        tipo: "follow_up",
        status: "pendente",
        prioridade: "media",
        criado_por: user?.id,
      };
      if (canManageAll) payload.corretor_id = user?.id;
      const { error } = await supabase.from("tarefas").insert(payload as TablesInsert<"tarefas">);
      if (error) throw error;
    },
    onSuccess: () => {
      setQuickTitulo("");
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: TarefaPayload = {
      titulo: fd.get("titulo") as string,
      descricao: (fd.get("descricao") as string) || null,
      tipo: fd.get("tipo") as TarefaTipo,
      status: fd.get("status") as TarefaStatus,
      prioridade: fd.get("prioridade") as TarefaPrioridade,
      lead_id: (() => {
        const v = fd.get("lead_id") as string;
        return v && v !== "__none__" ? v : null;
      })(),
      data_vencimento: fd.get("data_vencimento")
        ? new Date(fd.get("data_vencimento") as string).toISOString()
        : null,
    };
    if (canManageAll) payload.corretor_id = (fd.get("corretor_id") as string) || user?.id;
    saveMutation.mutate(payload);
  };

  const editar = (t: TarefaRow) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const filtrosAtivos =
    (filtroStatus !== "todos" ? 1 : 0) +
    (filtroTipo !== "todos" ? 1 : 0) +
    (canManageAll && filtroCorretor !== "todos" ? 1 : 0);
  const temFiltros = filtrosAtivos > 0 || busca.trim() !== "";
  const limparFiltros = () => {
    setBusca("");
    setFiltroStatus("todos");
    setFiltroTipo("todos");
    setFiltroCorretor("todos");
  };
  const nomeCorretorFiltro =
    (corretoresQuery.data ?? []).find((c) => c.id === filtroCorretor)?.nome ?? "corretor";
  const resumoFiltros = [
    filtroStatus === "todos" ? "abertas" : STATUS_LABEL[filtroStatus as TarefaStatus].toLowerCase(),
    filtroTipo === "todos" ? "todos os tipos" : TIPO_LABEL[filtroTipo as TarefaTipo],
    canManageAll ? (filtroCorretor === "todos" ? "todos os corretores" : nomeCorretorFiltro) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const abertas = ORDEM_GRUPOS.reduce((n, g) => n + grupos[g].length, 0);
  const nConcluidasHoje = concluidasHoje(encerradas, agora);

  const linha = (t: TarefaRow) => (
    <LinhaTarefa
      key={t.id}
      tarefa={t}
      meta={metaDaTarefa(t, {
        lead: t.leads?.nome,
        corretor: canManageAll ? t.profiles?.nome : null,
        agora,
      })}
      onConcluir={() => concluirTarefa.mutate({ id: t.id })}
      acoes={[
        ...ADIAR.map((a) => ({
          rotulo: a.rotulo,
          icone: Clock,
          oculta: !estaAberta(t),
          onSelect: () => snoozeMutation.mutate({ id: t.id, ms: a.ms }),
        })),
        { rotulo: "Editar", icone: PencilSimple, onSelect: () => editar(t) },
      ]}
    />
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="min-w-0 space-y-4">
        <section aria-label="Como estão as tarefas">
          <StatGrid className="grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-4 xl:grid-cols-3">
            <StatTile
              title="Vencidas"
              value={
                <span
                  data-testid="tarefas-vencidas"
                  className={cn(numeros.vencidas > 0 && "text-destructive")}
                >
                  {numeros.vencidas}
                </span>
              }
              hint={<span className="hidden sm:inline">{numeros.hintVencidas}</span>}
              loading={tarefasQuery.isLoading}
            />
            <StatTile
              title="Para hoje"
              value={<span data-testid="tarefas-hoje">{numeros.paraHoje}</span>}
              hint={<span className="hidden sm:inline">{numeros.hintHoje}</span>}
              loading={tarefasQuery.isLoading}
            />
            <StatTile
              title="Esta semana"
              value={<span data-testid="tarefas-semana">{numeros.estaSemana}</span>}
              hint={<span className="hidden sm:inline">{numeros.hintSemana}</span>}
              loading={tarefasQuery.isLoading}
            />
          </StatGrid>
        </section>

        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            if (o && !editing) setRascunho(quickTitulo.trim());
            setDialogOpen(o);
            if (!o) setEditing(null);
          }}
        >
          {/* A ação principal da tela: a linha navy de criar. Grava SEM data
              de vencimento (a tarefa cai em "Sem data"); "+ detalhes" abre o
              diálogo completo com o que já foi digitado. */}
          <form
            role="group"
            aria-label="Adicionar tarefa"
            className="flex items-center gap-2 rounded-2xl bg-gradient-command py-2 pl-4 pr-2 text-white shadow-elev-2 dark:ring-1 dark:ring-white/10"
            onSubmit={(e) => {
              e.preventDefault();
              if (quickTitulo.trim() && !quickAdd.isPending) quickAdd.mutate();
            }}
          >
            <Plus className="h-4 w-4 shrink-0 text-gold-400" aria-hidden="true" />
            <label htmlFor="tarefa-rapida" className="sr-only">
              Título da nova tarefa
            </label>
            <input
              id="tarefa-rapida"
              value={quickTitulo}
              onChange={(e) => setQuickTitulo(e.target.value)}
              placeholder="Adicionar tarefa…"
              enterKeyHint="done"
              autoComplete="off"
              className="h-9 min-w-0 flex-1 bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-white/60"
            />
            <Kbd className="hidden border-white/30 bg-transparent text-white/80 sm:inline-flex">
              Enter
            </Kbd>
            <DialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                + detalhes
              </Button>
            </DialogTrigger>
          </form>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="titulo">Título</Label>
                <Input
                  id="titulo"
                  name="titulo"
                  required
                  defaultValue={editing?.titulo ?? rascunho}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select name="tipo" defaultValue={editing?.tipo ?? "follow_up"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAREFA_TIPOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <Select name="prioridade" defaultValue={editing?.prioridade ?? "media"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAREFA_PRIORIDADES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORIDADE_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue={editing?.status ?? "pendente"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAREFA_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="data_vencimento">Vencimento</Label>
                  <Input
                    id="data_vencimento"
                    name="data_vencimento"
                    type="datetime-local"
                    defaultValue={
                      editing?.data_vencimento
                        ? format(parseISO(editing.data_vencimento), "yyyy-MM-dd'T'HH:mm")
                        : ""
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Lead vinculado (opcional)</Label>
                <Select name="lead_id" defaultValue={editing?.lead_id ?? "__none__"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {(leadsQuery.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canManageAll && (
                <div>
                  <Label>Atribuir ao corretor</Label>
                  <Select name="corretor_id" defaultValue={editing?.corretor_id ?? user?.id}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(corretoresQuery.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  name="descricao"
                  rows={3}
                  defaultValue={editing?.descricao ?? ""}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Busca à vista; status, tipo e corretor atrás de "Filtros", com o
            estado em texto (regra 5). */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full sm:max-w-xs">
            <MagnifyingGlass
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Buscar tarefa ou lead"
              aria-label="Buscar tarefa ou lead"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
            />
          </div>
          <FiltrosMenu
            ativos={filtrosAtivos}
            resumo={resumoFiltros}
            onLimpar={() => {
              setFiltroStatus("todos");
              setFiltroTipo("todos");
              setFiltroCorretor("todos");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="tarefas-filtro-status">Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger id="tarefas-filtro-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as abertas</SelectItem>
                  {STATUS_ABERTOS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tarefas-filtro-tipo">Tipo</Label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger id="tarefas-filtro-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {TAREFA_TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canManageAll && (
              <div className="space-y-1.5">
                <Label htmlFor="tarefas-filtro-corretor">Corretor</Label>
                <Select value={filtroCorretor} onValueChange={setFiltroCorretor}>
                  <SelectTrigger id="tarefas-filtro-corretor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os corretores</SelectItem>
                    {(corretoresQuery.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </FiltrosMenu>
        </div>

        {tarefasQuery.isLoading ? (
          <div className="space-y-4 py-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="mt-1 h-5 w-5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : tarefasQuery.isError ? (
          <QueryErrorState
            title="Não foi possível carregar as tarefas."
            error={tarefasQuery.error}
            onRetry={() => tarefasQuery.refetch()}
          />
        ) : (
          <>
            {abertas === 0 ? (
              <EmptyState
                icon={ListChecks}
                title={temFiltros ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa aberta"}
                description={
                  temFiltros
                    ? "Ajuste a busca ou os filtros para ver outras tarefas."
                    : "Escreva na linha acima e aperte Enter."
                }
                action={
                  temFiltros ? (
                    <Button variant="outline" size="sm" onClick={limparFiltros}>
                      Limpar filtros
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              ORDEM_GRUPOS.map((g) =>
                grupos[g].length === 0 ? null : (
                  <section
                    key={g}
                    aria-label={GRUPO_LABEL[g]}
                    data-testid={`tarefas-grupo-${g}`}
                    className="space-y-2"
                  >
                    <h2 className="flex flex-wrap items-center gap-2 px-1 text-sm font-semibold md:px-0">
                      <span
                        className={cn("h-2 w-2 rounded-full", GRUPO_DOT[g])}
                        aria-hidden="true"
                      />
                      {GRUPO_LABEL[g]}
                      <span className="font-display text-xs font-semibold text-muted-foreground">
                        · {grupos[g].length}
                      </span>
                      <span className="hidden text-xs font-normal text-muted-foreground md:inline">
                        · {GRUPO_HINT[g]}
                      </span>
                    </h2>
                    <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-elev-1">
                      {grupos[g].map(linha)}
                    </ul>
                  </section>
                ),
              )
            )}

            {encerradas.length > 0 && (
              <Collapsible open={verConcluidas} onOpenChange={setVerConcluidas}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <CaretDown
                      className={cn(
                        "h-4 w-4 transition-transform motion-reduce:transition-none",
                        verConcluidas && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                    {verConcluidas
                      ? "Esconder concluídas"
                      : `Ver concluídas (${encerradas.length})`}
                    {!verConcluidas && nConcluidasHoje > 0 && (
                      <span className="font-normal text-muted-foreground">
                        · {nConcluidasHoje} hoje
                      </span>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul
                    aria-label="Concluídas"
                    className="mt-2 divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-card"
                  >
                    {encerradas.map(linha)}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>

      {/* Tarefas e visitas são o mesmo dia: a agenda de hoje ao lado. */}
      <aside className="hidden flex-col gap-3 lg:flex" aria-label="Ao lado das tarefas">
        <AgendaDeHoje />
      </aside>
    </div>
  );
}

function LinhaTarefa({
  tarefa: t,
  meta,
  onConcluir,
  acoes,
}: {
  tarefa: TarefaRow;
  meta: string;
  onConcluir: () => void;
  acoes: AcaoDaLinha[];
}) {
  const concluida = t.status === "concluida";
  const encerrada = !estaAberta(t);
  const prioridade = PRIORIDADE_LABEL[t.prioridade as TarefaPrioridade] ?? t.prioridade;
  return (
    <li data-testid="tarefa-linha" className="flex items-start gap-3 py-3 pl-4 pr-2">
      <button
        type="button"
        onClick={onConcluir}
        disabled={encerrada}
        className={cn(
          "press-scale mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
          concluida
            ? "border-success bg-success text-success-foreground"
            : "border-muted-foreground/40 hover:border-primary disabled:opacity-50",
        )}
        aria-label={`Concluir: ${t.titulo}`}
      >
        {concluida && <CheckCircle className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn(
              "h-[7px] w-[7px] shrink-0 rounded-full",
              PRIORIDADE_DOT[t.prioridade] ?? "bg-muted-foreground/60",
            )}
            title={`Prioridade ${prioridade.toLowerCase()}`}
            aria-hidden="true"
          />
          <span className="sr-only">Prioridade {prioridade.toLowerCase()}:</span>
          <span
            className={cn("truncate", encerrada && "text-muted-foreground line-through")}
            title={t.descricao ?? undefined}
          >
            {t.titulo}
          </span>
        </p>
        <p className="mt-0.5 truncate pl-[15px] text-xs text-muted-foreground">{meta}</p>
      </div>
      <AcoesLinha horizontal rotulo={`Mais ações · ${t.titulo}`} acoes={acoes} />
    </li>
  );
}
