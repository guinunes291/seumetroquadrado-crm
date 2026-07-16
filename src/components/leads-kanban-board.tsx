import { useEffect, useState, useMemo, useRef } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  Phone,
  Mail,
  GripVertical,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { usePointerDnd } from "@/features/pipeline/use-pointer-dnd";
import { computeStageMetrics, formatVgvCompact } from "@/features/pipeline/stage-metrics";
import {
  FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_COLUMN_TONE,
  PROXIMA_ACAO,
  motivoTransicaoBloqueada,
  resolveStageAction,
  transicaoLeadPermitida,
  type LeadStatus,
} from "@/lib/leads";
import { useUserRoles } from "@/hooks/use-auth";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { SlaBadge } from "@/components/sla-badge";
import { TransferSlaBadge, useTransferTimeouts } from "@/components/transfer-sla-badge";
import { useDebounce } from "@/hooks/use-debounce";
import { ResponsiveTabs } from "@/components/ui/responsive-tabs";

const COLUMNS = FUNNEL_STAGES.map((id) => ({
  id,
  label: LEAD_STATUS_LABEL[id],
  tone: LEAD_STATUS_COLUMN_TONE[id],
}));

// Dias sem interação — o sinal de urgência do card. Só vale para etapas
// "vivas" (mesma regra do badge de inatividade da listagem).
const ETAPAS_SEM_INATIVIDADE = ["novo", "contrato_fechado", "perdido", "pos_venda"];
function diasParado(lead: { status: string; ultima_interacao: string | null; created_at: string }) {
  if (ETAPAS_SEM_INATIVIDADE.includes(lead.status)) return 0;
  const ref = lead.ultima_interacao ?? lead.created_at;
  if (!ref) return 0;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
}

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  status: string;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  observacoes: string | null;
  temperatura: string | null;
  origem: string | null;
  data_distribuicao: string | null;
  tentativas_redistribuicao: number | null;
  via_webhook: boolean | null;
  created_at: string;
  ultima_interacao: string | null;
};

const LeadSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string().nullable(),
  telefone: z.string(),
  status: z.string(),
  corretor_id: z.string().uuid().nullable(),
  projeto_id: z.string().uuid().nullable(),
  projeto_nome: z.string().nullable(),
  observacoes: z.string().nullable(),
  temperatura: z.string().nullable(),
  origem: z.string().nullable(),
  data_distribuicao: z.string().nullable(),
  tentativas_redistribuicao: z.number().nullable(),
  via_webhook: z.boolean().nullable(),
  created_at: z.string(),
  ultima_interacao: z.string().nullable(),
});
const StagePageSchema = z.object({
  items: z.array(LeadSchema),
  has_more: z.boolean(),
  next_cursor: z.object({ created_at: z.string(), id: z.string().uuid() }).nullable(),
});
type StagePage = z.infer<typeof StagePageSchema>;

type SlaRow = {
  lead_id: string;
  status: string;
  sla_minutos: number;
  minutos_decorridos: number;
  sla_status: string;
};

/**
 * Quadro Kanban dos leads. Extraído da antiga rota `/kanban` para ser usado como
 * uma das visões (toggle Lista/Kanban) dentro de `/leads` — consolidação Fase 1.
 * A rota `/kanban` permanece como redirect de compatibilidade.
 */
export function KanbanBoard() {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [mobileStage, setMobileStage] = useState<LeadStatus>(COLUMNS[0].id);
  const [extraPages, setExtraPages] = useState<Partial<Record<LeadStatus, StagePage>>>({});
  const [loadingMore, setLoadingMore] = useState<LeadStatus | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const boardScrollRef = useRef<HTMLDivElement>(null);

  const { data: corretores } = useQuery({
    queryKey: ["corretores-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true);
      return data ?? [];
    },
  });
  const corretoresMap = useMemo(() => {
    const m = new Map<string, string>();
    (corretores ?? []).forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [corretores]);

  const stageQueries = useQueries({
    queries: COLUMNS.map((column) => ({
      queryKey: ["pipeline-stage-v2", column.id, debouncedSearch],
      queryFn: async (): Promise<StagePage> => {
        const { data, error } = await supabase.rpc("pipeline_stage_page_v2", {
          _status: column.id,
          _query: debouncedSearch || undefined,
          _limit: 20,
          _cursor: undefined,
        });
        if (error) throw error;
        return StagePageSchema.parse(data);
      },
    })),
  });
  // Snapshot v3 traz o VGV por etapa; sem a migration aplicada, cai para a v2
  // e os chips de valor simplesmente não aparecem (rpcWithFallback).
  const snapshotQuery = useQuery({
    queryKey: ["pipeline-snapshot-v2", debouncedSearch],
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabase.rpc(
            "pipeline_snapshot_v3" as never,
            {
              _query: debouncedSearch || undefined,
            } as never,
          );
          if (error) throw error;
          return data as {
            etapa: LeadStatus;
            quantidade: number;
            followups_vencidos: number;
            sem_proxima_acao: number;
            parados_ha_7_dias: number;
            vgv?: number;
          }[];
        },
        async () => {
          const { data, error } = await supabase.rpc("pipeline_snapshot_v2", {
            _query: debouncedSearch || undefined,
          });
          if (error) throw error;
          return data;
        },
      ),
  });

  useEffect(() => setExtraPages({}), [debouncedSearch]);

  const initialPages = useMemo(
    () =>
      new Map<LeadStatus, StagePage>(
        COLUMNS.flatMap((column, index) => {
          const page = stageQueries[index]?.data;
          return page ? [[column.id, page] as const] : [];
        }),
      ),
    [stageQueries],
  );
  const leads = useMemo(() => {
    const seen = new Set<string>();
    return COLUMNS.flatMap((column) => [
      ...(initialPages.get(column.id)?.items ?? []),
      ...(extraPages[column.id]?.items ?? []),
    ]).filter((lead) => (seen.has(lead.id) ? false : (seen.add(lead.id), true)));
  }, [extraPages, initialPages]);
  const leadsLoading = stageQueries.some((query) => query.isLoading) || snapshotQuery.isLoading;
  const leadsError = stageQueries.some((query) => query.isError) || snapshotQuery.isError;
  const refetchLeads = async () => {
    setExtraPages({});
    await Promise.all([...stageQueries.map((query) => query.refetch()), snapshotQuery.refetch()]);
  };

  const loadMore = async (status: LeadStatus) => {
    const base = initialPages.get(status);
    const extra = extraPages[status];
    const cursor = extra?.next_cursor ?? base?.next_cursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(status);
    try {
      const { data, error } = await supabase.rpc("pipeline_stage_page_v2", {
        _status: status,
        _query: debouncedSearch || undefined,
        _limit: 20,
        _cursor: cursor,
      });
      if (error) throw error;
      const page = StagePageSchema.parse(data);
      setExtraPages((current) => ({
        ...current,
        [status]: {
          ...page,
          items: [...(current[status]?.items ?? []), ...page.items],
        },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar mais leads.");
    } finally {
      setLoadingMore(null);
    }
  };

  // SLA serve só para o badge dos cards em novo/aguardando — a RPC estreita
  // (leads_sla_pendentes) devolve apenas esse recorte em vez de varrer todos
  // os leads ativos da org (a varredura completa estourou statement timeout em
  // produção). Poll de 2min mantém a query fora do caminho quente; sem a
  // migration aplicada, cai para a leads_com_sla antiga filtrando no cliente.
  const { data: slaRows } = useQuery({
    queryKey: ["leads-sla"],
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabase.rpc(
            "leads_sla_pendentes" as never,
            {
              _corretor: undefined,
            } as never,
          );
          if (error) throw error;
          return (data ?? []) as unknown as SlaRow[];
        },
        async () => {
          const { data, error } = await supabase.rpc("leads_com_sla", { _corretor: undefined });
          if (error) throw error;
          return ((data ?? []) as SlaRow[]).filter(
            (r) => r.status === "novo" || r.status === "aguardando_atendimento",
          );
        },
      ),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const slaMap = useMemo(() => {
    const m = new Map<string, SlaRow>();
    (slaRows ?? []).forEach((r) => m.set(r.lead_id, r));
    return m;
  }, [slaRows]);
  const transferTimeouts = useTransferTimeouts();

  // Realtime só reidrata as páginas/contagens do quadro. O SLA (query pesada de
  // toda a org) fica fora daqui — atualiza por poll — para não refazê-lo a cada
  // mudança em `leads`.
  useRealtimeInvalidate("leads", [["pipeline-stage-v2"], ["pipeline-snapshot-v2"]]);

  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const updateStatus = useLeadStatusMutation({
    invalidateKeys: [["pipeline-stage-v2"], ["pipeline-snapshot-v2"]],
    onSuccess: (vars) => {
      setExtraPages({});
      const nome = leads.find((lead) => lead.id === vars.id)?.nome ?? "Lead";
      setAnnouncement(`${nome} movido para ${LEAD_STATUS_LABEL[vars.status]}.`);
    },
  });

  // Roteia a etapa escolhida (no menu ou ao arrastar): direta, modal ou perdido.
  // O drag permite soltar em qualquer coluna; aqui validamos contra a máquina
  // de estados do banco e explicamos o bloqueio — antes, a RPC rejeitava e o
  // card "voltava" com um erro genérico. "Venda" fica fora do gate (o modal
  // registra a venda para aprovação; a etapa muda no fluxo de aprovação).
  const routeStage = (lead: Lead, target: LeadStatus) => {
    if (lead.status === target) return;
    if (target !== "contrato_fechado" && !transicaoLeadPermitida(lead.status, target, gestao)) {
      toast.error(motivoTransicaoBloqueada(lead.status, target, gestao));
      return;
    }
    const action = resolveStageAction(target);
    if (action.kind === "direct") updateStatus.mutate({ id: lead.id, status: target });
    else if (action.kind === "modal") setModalState({ modal: action.modal, lead });
    else setPerdidoLead(lead);
  };

  // Drag por Pointer Events: mouse, TOQUE (long-press) e caneta — sem lib.
  // O menu "Mudar etapa" continua sendo o caminho acessível por teclado.
  const { dragging, getCardProps, registerColumn } = usePointerDnd({
    scrollContainerRef: boardScrollRef,
    canDrop: (cardId, toColumnId) => {
      const lead = leads.find((l) => l.id === cardId);
      return !!lead && lead.status !== toColumnId;
    },
    onDrop: (cardId, toColumnId) => {
      const lead = leads.find((l) => l.id === cardId);
      if (lead) routeStage(lead, toColumnId as LeadStatus);
    },
  });

  const byColumn = useMemo(() => {
    const map = new Map<string, Lead[]>();
    COLUMNS.forEach((c) => map.set(c.id, []));
    const s = search.trim().toLowerCase();
    (leads ?? []).forEach((l) => {
      if (s && !l.nome.toLowerCase().includes(s) && !l.telefone.includes(s)) return;
      map.get(l.status)?.push(l);
    });
    // Em "Em atendimento", quem está há mais tempo sem interação sobe pro topo
    // — o corretor ataca primeiro quem está esfriando. Sem interação registrada
    // (recém-iniciado) cai pro fim da coluna. Fallback: created_at.
    const emAtend = map.get("em_atendimento");
    if (emAtend) {
      emAtend.sort((a, b) => {
        const ta = a.ultima_interacao ? Date.parse(a.ultima_interacao) : NaN;
        const tb = b.ultima_interacao ? Date.parse(b.ultima_interacao) : NaN;
        if (Number.isNaN(ta) && Number.isNaN(tb))
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        if (Number.isNaN(ta)) return 1;
        if (Number.isNaN(tb)) return -1;
        return ta - tb;
      });
    }
    return map;
  }, [leads, search]);

  const snapshotByStage = useMemo(
    () => new Map((snapshotQuery.data ?? []).map((row) => [row.etapa, row])),
    [snapshotQuery.data],
  );
  const pipelineTotal = useMemo(
    () => [...snapshotByStage.values()].reduce((sum, row) => sum + Number(row.quantidade), 0),
    [snapshotByStage],
  );

  // Economia do funil: VGV por etapa (v3) + % de conversão acumulada vs. etapa
  // anterior — derivado das quantidades, sem histórico.
  const stageMetrics = useMemo(
    () =>
      computeStageMetrics(
        (snapshotQuery.data ?? []).map((row) => ({
          etapa: String(row.etapa),
          quantidade: Number(row.quantidade),
          vgv: "vgv" in row && row.vgv != null ? Number(row.vgv) : null,
        })),
        FUNNEL_STAGES,
      ),
    [snapshotQuery.data],
  );

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id="kanban-instructions" className="text-sm text-muted-foreground">
          Arraste os cards entre as colunas. Pelo teclado ou toque, use o menu “Mudar etapa do lead”
          em cada card.
        </p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar lead…"
          aria-label="Buscar leads no funil"
          className="min-h-11 w-full sm:w-64"
        />
      </div>

      <div className="md:hidden">
        <ResponsiveTabs
          value={mobileStage}
          onValueChange={(value) => {
            const stage = value as LeadStatus;
            setMobileStage(stage);
            setAnnouncement(`Etapa exibida: ${LEAD_STATUS_LABEL[stage]}.`);
          }}
          ariaLabel="Etapa exibida no funil"
          listClassName="w-full sm:w-full"
          items={COLUMNS.map((column) => ({
            value: column.id,
            label: `${column.label} · ${Number(snapshotByStage.get(column.id)?.quantidade ?? 0)}`,
          }))}
        >
          {null}
        </ResponsiveTabs>
      </div>

      {leadsError && (
        <Card className="p-8 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive opacity-70" />
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o quadro. Tente novamente.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchLeads()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
          </Button>
        </Card>
      )}

      {leadsLoading && !leadsError && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-lg" />
          ))}
        </div>
      )}

      {!leadsLoading && !leadsError && pipelineTotal === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum lead ativo no funil ainda.
        </p>
      )}

      {!leadsLoading && !leadsError && pipelineTotal > 0 && (
        <div
          ref={boardScrollRef}
          className="overflow-x-auto pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="region"
          aria-label="Funil de leads"
          aria-describedby="kanban-instructions"
          tabIndex={0}
        >
          <div className="flex gap-3 min-w-max">
            {COLUMNS.map((col) => {
              const items = byColumn.get(col.id) ?? [];
              const metrics = stageMetrics.get(col.id);
              const vgvLabel = formatVgvCompact(metrics?.vgv ?? null);
              return (
                <section
                  key={col.id}
                  ref={registerColumn(col.id)}
                  aria-labelledby={`kanban-col-${col.id}`}
                  className={cn(
                    "w-full shrink-0 rounded-lg border-2 border-dashed p-2 transition-colors md:block md:w-72",
                    col.id !== mobileStage && "hidden",
                    col.tone,
                    dragging?.overColumnId === col.id && "ring-2 ring-primary/60 bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between px-1 py-2">
                    <h2 id={`kanban-col-${col.id}`} className="font-semibold text-sm">
                      {col.label}
                    </h2>
                    <div className="flex items-center gap-1">
                      {(() => {
                        // Snapshot agregado: cards sem interação há sete dias.
                        const parados = Number(snapshotByStage.get(col.id)?.parados_ha_7_dias ?? 0);
                        return parados > 0 ? (
                          <Badge
                            variant="secondary"
                            className="gap-0.5 bg-warning/15 text-[10px] text-warning"
                            title={`${parados} lead(s) parados há 7+ dias nesta etapa`}
                          >
                            <AlertCircle className="h-3 w-3" /> {parados}
                          </Badge>
                        ) : null;
                      })()}
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        <AnimatedNumber
                          value={Number(snapshotByStage.get(col.id)?.quantidade ?? items.length)}
                        />
                      </Badge>
                    </div>
                  </div>
                  {/* Economia da etapa: VGV potencial + conversão acumulada. */}
                  {(vgvLabel || metrics?.conversaoPct != null) && (
                    <div className="flex items-center justify-between gap-1 px-1 pb-1.5 text-[11px] text-muted-foreground tabular-nums">
                      {vgvLabel ? (
                        <span
                          className="font-medium text-gold-700 dark:text-gold-400"
                          title="VGV potencial dos leads desta etapa"
                        >
                          {vgvLabel}
                        </span>
                      ) : (
                        <span />
                      )}
                      {metrics?.conversaoPct != null && (
                        <span title="Leads nesta etapa ou além, vs. a etapa anterior (funil acumulado)">
                          conv. {metrics.conversaoPct.toLocaleString("pt-BR")}%
                        </span>
                      )}
                    </div>
                  )}
                  <div className="space-y-2 min-h-[100px]">
                    {items.map((lead) => (
                      <Card
                        key={lead.id}
                        role="group"
                        aria-label={`${lead.nome}, etapa ${col.label}`}
                        {...getCardProps(lead.id)}
                        className={cn(
                          "p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow bg-background",
                          dragging?.cardId === lead.id && "opacity-40",
                        )}
                      >
                        <div className="flex items-start gap-1">
                          <GripVertical
                            className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{lead.nome}</div>
                            {lead.projeto_nome && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                {lead.projeto_nome}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span className="truncate">{lead.telefone}</span>
                            </div>
                            {lead.email && (
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{lead.email}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">
                                {lead.corretor_id
                                  ? (corretoresMap.get(lead.corretor_id) ?? "—")
                                  : "sem corretor"}
                              </span>
                              {(lead.status === "novo" ||
                                lead.status === "aguardando_atendimento") &&
                                slaMap.get(lead.id) && (
                                  <SlaBadge
                                    compact
                                    slaMinutos={slaMap.get(lead.id)!.sla_minutos}
                                    referencia={lead.data_distribuicao ?? lead.created_at}
                                  />
                                )}
                              <TransferSlaBadge
                                compact
                                showBar
                                leadId={lead.id}
                                origem={lead.origem}
                                status={lead.status}
                                dataDistribuicao={lead.data_distribuicao}
                                tentativas={lead.tentativas_redistribuicao}
                                timeouts={transferTimeouts}
                                viaWebhook={lead.via_webhook}
                              />

                              <TemperatureChip
                                temperatura={lead.temperatura}
                                size="sm"
                                pulse={false}
                              />
                              {(() => {
                                const dias = diasParado(lead);
                                return dias >= 2 ? (
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "gap-0.5 text-[9px]",
                                      dias >= 5
                                        ? "bg-destructive/15 text-destructive"
                                        : "bg-warning/15 text-warning",
                                    )}
                                    title={`Sem interação há ${dias} dias`}
                                  >
                                    <AlertCircle className="h-2.5 w-2.5" /> {dias}d
                                  </Badge>
                                ) : null;
                              })()}
                            </div>
                            {PROXIMA_ACAO[lead.status as LeadStatus] && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 min-h-11 w-full text-xs"
                                disabled={updateStatus.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const acao = PROXIMA_ACAO[lead.status as LeadStatus]!;
                                  routeStage(lead, acao.target);
                                }}
                              >
                                {PROXIMA_ACAO[lead.status as LeadStatus]!.label}
                              </Button>
                            )}
                          </div>
                          <div className="flex flex-col items-center gap-0.5 shrink-0">
                            <LeadStageMenu
                              lead={lead}
                              onPickDirect={(target) =>
                                updateStatus.mutate({ id: lead.id, status: target })
                              }
                              onPickModal={(modal) => setModalState({ modal, lead })}
                              onPickPerdido={() => setPerdidoLead(lead)}
                            />
                            {lead.status !== "perdido" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                aria-label="Descartar lead"
                                title="Descartar lead"
                                draggable={false}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPerdidoLead(lead);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                    {(extraPages[col.id]?.has_more ?? initialPages.get(col.id)?.has_more) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        disabled={loadingMore === col.id}
                        onClick={() => void loadMore(col.id)}
                      >
                        {loadingMore === col.id ? "Carregando…" : "Carregar mais 20"}
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
        onDone={() => {
          setExtraPages({});
          void refetchLeads();
        }}
      />
    </div>
  );
}
