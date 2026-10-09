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
  ArrowClockwise,
  ArrowRight,
  ArrowsHorizontal,
  CalendarDots,
  Prohibit,
  Question,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { usePointerDnd } from "@/features/pipeline/use-pointer-dnd";
import { computeStageMetrics, formatVgvCompact } from "@/features/pipeline/stage-metrics";
import {
  FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_COLUMN_TONE,
  MOTIVO_SAIDA_NAO_OFERECIDA,
  PROXIMA_ACAO,
  motivoTransicaoBloqueada,
  resolveStageAction,
  saidaOferecida,
  transicaoLeadPermitida,
  type LeadStatus,
} from "@/lib/leads";
import { useUserRoles } from "@/hooks/use-auth";
import { useEmAtendimentoContador } from "@/features/em-atendimento/use-em-atendimento";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { SlaBadge } from "@/components/sla-badge";
import { TransferSlaBadge, useTransferTimeouts } from "@/components/transfer-sla-badge";
import { useDebounce } from "@/hooks/use-debounce";
import { ResponsiveTabs } from "@/components/ui/responsive-tabs";
import { LeadPeekDrawer, type PeekLead } from "@/features/leads/lead-peek-drawer";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { useIsMobile } from "@/hooks/use-mobile";

const ALL_COLUMNS = FUNNEL_STAGES.map((id) => ({
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
  // Timestamp futuro (dado sujo/importação) não pode virar "-1d" no card.
  return Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86400000));
}

/** "Registrar contato" → "registrar contato", para ler em "próximo passo: …". */
function primeiraMinuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
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

// Colunas recolhidas são preferência de layout do usuário (não estado do
// funil) — persistem entre sessões no localStorage.
const CHAVE_COLAPSADAS = "smq:kanban-colapsadas";
function lerColapsadas(): Set<LeadStatus> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CHAVE_COLAPSADAS) ?? "[]");
    if (!Array.isArray(raw)) return new Set();
    // Filtra lixo/etapas antigas — um rename de etapa não pode quebrar o board.
    return new Set(
      raw.filter(
        (s): s is LeadStatus =>
          typeof s === "string" && (FUNNEL_STAGES as readonly string[]).includes(s),
      ),
    );
  } catch {
    return new Set();
  }
}

// O drawer não carrega os campos financeiros (renda/entrada/FGTS) — a página
// da etapa é enxuta de propósito. Defaults neutros satisfazem o PeekLead
// estrutural sem alargar o payload do quadro.
function toPeekLead(lead: Lead): PeekLead {
  return {
    ...lead,
    origem: lead.origem ?? "outro",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
  };
}

type KanbanBoardProps = {
  /** Semeia a busca interna no mount (o input continua editável). */
  initialSearch?: string;
  /** uuid do corretor para filtrar o quadro; "all"/"unassigned" são ignorados. */
  corretorId?: string;
  /** Subconjunto de colunas (ex.: fase do funil); ausente = quadro completo. */
  stages?: LeadStatus[];
};

/**
 * Quadro Kanban dos leads. Extraído da antiga rota `/kanban` para ser usado como
 * uma das visões (toggle Lista/Kanban) dentro de `/leads` — consolidação Fase 1.
 * A rota `/kanban` permanece como redirect de compatibilidade.
 */
export function KanbanBoard({ initialSearch, corretorId, stages }: KanbanBoardProps = {}) {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  const [search, setSearch] = useState(initialSearch ?? "");
  const debouncedSearch = useDebounce(search.trim(), 300);
  // Filtrar ALL_COLUMNS (e não mapear o prop) preserva a ordem canônica do
  // funil independente da ordem em que `stages` chegar.
  const columns = useMemo(
    () => (stages ? ALL_COLUMNS.filter((c) => stages.includes(c.id)) : ALL_COLUMNS),
    [stages],
  );
  const [mobileStage, setMobileStage] = useState<LeadStatus>(columns[0].id);
  // O mobileStage salvo pode apontar para coluna fora da fase (fase trocada
  // com o componente montado, ou default antigo) — deriva no render em vez de
  // forçar setState.
  const mobileStageAtual = columns.some((c) => c.id === mobileStage) ? mobileStage : columns[0].id;
  const [extraPages, setExtraPages] = useState<Partial<Record<LeadStatus, StagePage>>>({});
  const [loadingMore, setLoadingMore] = useState<LeadStatus | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const abrirWhatsApp = useWhatsAppLead();
  const [peekLead, setPeekLead] = useState<Lead | null>(null);
  const [colapsadas, setColapsadas] = useState<Set<LeadStatus>>(lerColapsadas);

  // Filtro de corretor: pipeline_stage_page_v2 E os snapshots v2/v3 aceitam
  // `_corretor_id` (migrations 20260711124000_scale_read_models_v2.sql e
  // 20260715100000_pipeline_snapshot_v3.sql), então cards e contadores das
  // colunas filtram JUNTOS — sem divergência entre badge e coluna.
  const corretorFiltro =
    corretorId && corretorId !== "all" && corretorId !== "unassigned" ? corretorId : undefined;

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

  // Só as colunas visíveis viram query — fase com menos colunas = menos RPCs.
  const stageQueries = useQueries({
    queries: columns.map((column) => ({
      queryKey: ["pipeline-stage-v2", column.id, debouncedSearch, corretorFiltro ?? null],
      queryFn: async (): Promise<StagePage> => {
        const { data, error } = await supabase.rpc("pipeline_stage_page_v2", {
          _status: column.id,
          _query: debouncedSearch || undefined,
          _corretor_id: corretorFiltro,
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
    queryKey: ["pipeline-snapshot-v2", debouncedSearch, corretorFiltro ?? null],
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabase.rpc("pipeline_snapshot_v3", {
            _query: debouncedSearch || undefined,
            _corretor_id: corretorFiltro,
          });
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
            _corretor_id: corretorFiltro,
          });
          if (error) throw error;
          return data;
        },
      ),
  });

  useEffect(() => setExtraPages({}), [debouncedSearch, corretorFiltro]);

  const initialPages = useMemo(
    () =>
      new Map<LeadStatus, StagePage>(
        columns.flatMap((column, index) => {
          const page = stageQueries[index]?.data;
          return page ? [[column.id, page] as const] : [];
        }),
      ),
    [stageQueries, columns],
  );
  const leads = useMemo(() => {
    const seen = new Set<string>();
    return columns
      .flatMap((column) => [
        ...(initialPages.get(column.id)?.items ?? []),
        ...(extraPages[column.id]?.items ?? []),
      ])
      .filter((lead) => (seen.has(lead.id) ? false : (seen.add(lead.id), true)));
  }, [extraPages, initialPages, columns]);
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
        _corretor_id: corretorFiltro,
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
          const { data, error } = await supabase.rpc("leads_sla_pendentes", {
            _corretor: undefined,
          });
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
  // "Registrar contato" a partir do Kanban: soltar na coluna Em atendimento,
  // o botão inteligente e "Cliente respondeu…" no menu (regra dos 65, Fatia 3a.2).
  const [contatoLead, setContatoLead] = useState<Lead | null>(null);

  // Regra dos 65: a coluna Em atendimento do corretor mostra "N/65". Para
  // contas sem o papel (gestão olhando a casa) o banco devolve corretor=false
  // e a coluna fica como sempre.
  const contador65 = useEmAtendimentoContador();
  const teto65 = contador65.data?.corretor ? contador65.data.teto : null;
  // O numerador é a ocupação do banco (a mesma da trava), não a contagem da
  // coluna: com busca ativa a coluna mostra só os que casam com o texto, e
  // "1/65" para quem está lotado seria mentira (revisão).
  const ocupacao65 = contador65.data?.corretor ? contador65.data.em_atendimento : null;

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
    // Regra dos 65, Fatia 3a.2: Em atendimento é consequência do contato —
    // soltar na coluna abre "Registrar contato" (cliente respondeu + passo).
    if (target === "em_atendimento" && !gestao) {
      setContatoLead(lead);
      return;
    }
    if (target !== "contrato_fechado" && !transicaoLeadPermitida(lead.status, target, gestao)) {
      toast.error(motivoTransicaoBloqueada(lead.status, target, gestao));
      return;
    }
    // De Em atendimento só se sai por desfecho (regra dos 65, Fatia 2).
    if (!saidaOferecida(lead.status, target)) {
      toast.error(MOTIVO_SAIDA_NAO_OFERECIDA);
      return;
    }
    const action = resolveStageAction(target, lead.status);
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
    columns.forEach((c) => map.set(c.id, []));
    // O servidor já filtra via `_query` (debounced) na página da etapa e no
    // snapshot. Refiltrar aqui com o texto cru era mais restrito (só nome e
    // telefone, sem unaccent) e dessincronizava os cards dos contadores.
    (leads ?? []).forEach((l) => {
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
  }, [leads, columns]);

  // O snapshot devolve TODAS as etapas — restringe às colunas visíveis antes
  // de qualquer métrica, para os chips (total, VGV) não somarem etapas fora
  // da fase.
  const snapshotRows = useMemo(() => {
    const visiveis = new Set<string>(columns.map((c) => c.id));
    return (snapshotQuery.data ?? []).filter((row) => visiveis.has(String(row.etapa)));
  }, [snapshotQuery.data, columns]);
  const snapshotByStage = useMemo(
    () => new Map(snapshotRows.map((row) => [row.etapa, row])),
    [snapshotRows],
  );
  // O gate de "funil vazio" conta o snapshot SEM o filtro de colunas: o
  // snapshot devolve todas as etapas do enum (novo/perdido incluídas), e
  // restringir às colunas visíveis fazia uma base só de leads "novo" parecer
  // vazia no /pipeline cru.
  const pipelineTotal = useMemo(
    () => (snapshotQuery.data ?? []).reduce((sum, row) => sum + Number(row.quantidade), 0),
    [snapshotQuery.data],
  );

  // Economia do funil: VGV por etapa (v3) + % de conversão acumulada vs. etapa
  // anterior — derivado das quantidades, sem histórico. O acumulado é
  // POSICIONAL no funil INTEIRO (FUNNEL_STAGES), mesmo numa fase: lead que
  // avançou além da fronteira segue contando como "chegou até aqui" — truncar
  // nas colunas da fase inverteria o sinal (progresso contado como perda).
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

  // VGV total do header: soma das etapas VISÍVEIS (snapshotRows já restringe
  // à fase; perdido/pós-venda ficam fora por não serem coluna) — não do
  // stageMetrics, que agora cobre o funil inteiro. null quando o snapshot em
  // uso é a v2 (sem `vgv`).
  const vgvTotal = useMemo(() => {
    let soma = 0;
    let temVgv = false;
    snapshotRows.forEach((row) => {
      if ("vgv" in row && row.vgv != null) {
        temVgv = true;
        soma += Number(row.vgv);
      }
    });
    return temVgv ? soma : null;
  }, [snapshotRows]);
  const vgvTotalLabel = formatVgvCompact(vgvTotal);

  const toggleColapso = (id: LeadStatus) => {
    setColapsadas((atual) => {
      const next = new Set(atual);
      const recolhendo = !next.has(id);
      if (recolhendo) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(CHAVE_COLAPSADAS, JSON.stringify([...next]));
      } catch {
        /* storage indisponível (modo privado/quota) — a preferência só não persiste */
      }
      setAnnouncement(`Coluna ${LEAD_STATUS_LABEL[id]} ${recolhendo ? "recolhida" : "expandida"}.`);
      return next;
    });
  };

  // Próxima ação a partir do peek — mesma rota dos cards (PROXIMA_ACAO +
  // routeStage). Fecha o peek ANTES: modal/fluxo de perda e drawer abertos ao
  // mesmo tempo disputariam foco e overlay.
  const proximaAcaoDoPeek = () => {
    if (!peekLead) return;
    const acao = PROXIMA_ACAO[peekLead.status as LeadStatus];
    if (!acao) return;
    const lead = peekLead;
    setPeekLead(null);
    if ("target" in acao) routeStage(lead, acao.target);
    else setContatoLead(lead);
  };

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
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
          {/* Só aparece com o snapshot v3 aplicado (a v2 não traz `vgv`). */}
          {vgvTotalLabel && (
            <span
              className="text-xs font-medium tabular-nums text-gold-700 dark:text-gold-400"
              title="Soma do VGV potencial das etapas ativas do funil"
            >
              VGV no funil: {vgvTotalLabel}
            </span>
          )}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead…"
            aria-label="Buscar leads no funil"
            className="min-h-11 w-full sm:w-64"
          />
        </div>
      </div>

      <div className="md:hidden">
        <ResponsiveTabs
          value={mobileStageAtual}
          onValueChange={(value) => {
            const stage = value as LeadStatus;
            setMobileStage(stage);
            setAnnouncement(`Etapa exibida: ${LEAD_STATUS_LABEL[stage]}.`);
          }}
          ariaLabel="Etapa exibida no funil"
          listClassName="w-full sm:w-full"
          items={columns.map((column) => ({
            value: column.id,
            label:
              column.id === "em_atendimento" && teto65 && ocupacao65 !== null
                ? `${column.label} · ${ocupacao65}/${teto65}`
                : `${column.label} · ${Number(snapshotByStage.get(column.id)?.quantidade ?? 0)}`,
          }))}
        >
          {null}
        </ResponsiveTabs>
      </div>

      {leadsError && (
        <Card className="p-8 text-center space-y-3">
          <Warning className="h-8 w-8 mx-auto text-destructive opacity-70" />
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o quadro. Tente novamente.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchLeads()}>
            <ArrowClockwise className="h-4 w-4 mr-2" /> Tentar novamente
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
            {columns.map((col) => {
              const items = byColumn.get(col.id) ?? [];
              const metrics = stageMetrics.get(col.id);
              const vgvLabel = formatVgvCompact(metrics?.vgv ?? null);
              const quantidade = Number(snapshotByStage.get(col.id)?.quantidade ?? items.length);
              // Colapso é recurso de desktop: no mobile a ResponsiveTabs já
              // mostra uma etapa por vez — uma barra de 40px ali seria só ruído.
              const colapsada = colapsadas.has(col.id) && !isMobile;
              if (colapsada) {
                return (
                  <section
                    key={col.id}
                    ref={registerColumn(col.id)}
                    aria-labelledby={`kanban-col-${col.id}`}
                    className={cn(
                      "hidden w-10 shrink-0 rounded-xl border-t-2 bg-muted/50 transition-colors md:block dark:bg-card/40",
                      col.tone,
                      dragging?.overColumnId === col.id && "ring-2 ring-primary/60 bg-primary/5",
                    )}
                  >
                    {/* A barra continua alvo de drop: o rect é cacheado no
                        início do arrasto como o de qualquer coluna. */}
                    <button
                      type="button"
                      className="flex min-h-[220px] w-full flex-col items-center gap-2 rounded-lg py-2"
                      aria-label={`Expandir coluna ${col.label} (${quantidade} leads)`}
                      aria-expanded={false}
                      onClick={() => toggleColapso(col.id)}
                    >
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        {quantidade}
                      </Badge>
                      <span
                        id={`kanban-col-${col.id}`}
                        className="rotate-180 text-xs font-semibold [writing-mode:vertical-rl]"
                      >
                        {col.label}
                      </span>
                    </button>
                  </section>
                );
              }
              return (
                <section
                  key={col.id}
                  ref={registerColumn(col.id)}
                  aria-labelledby={`kanban-col-${col.id}`}
                  className={cn(
                    // Coluna da identidade Lançamento: painel cinza-claro sem
                    // borda, como no vídeo. Fica só o fio de 2px da cor da
                    // etapa — com ~10 colunas lado a lado, é o que ajuda a
                    // achar a etapa rolando de lado (o vídeo mostra 4).
                    "group/col w-full shrink-0 rounded-xl border-t-2 bg-muted/50 p-2.5 transition-colors md:block md:w-72 dark:bg-card/40",
                    col.id !== mobileStageAtual && "hidden",
                    col.tone,
                    dragging?.overColumnId === col.id && "ring-2 ring-primary/60 bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between px-1 py-2">
                    <h2 id={`kanban-col-${col.id}`} className="font-display text-sm font-semibold">
                      {col.label}
                      {col.id === "em_atendimento" && teto65 && (
                        <span
                          className="ml-1 font-normal tabular-nums text-muted-foreground"
                          data-testid="kanban-teto-65"
                        >
                          · {ocupacao65}/{teto65}
                        </span>
                      )}
                    </h2>
                    <div className="flex items-center gap-1">
                      {(() => {
                        // Sinais agregados do snapshot: dão o diagnóstico da
                        // etapa sem precisar paginar a coluna inteira.
                        const snap = snapshotByStage.get(col.id);
                        const vencidos = Number(snap?.followups_vencidos ?? 0);
                        const semAcao = Number(snap?.sem_proxima_acao ?? 0);
                        const parados = Number(snap?.parados_ha_7_dias ?? 0);
                        return (
                          <>
                            {vencidos > 0 && (
                              <Badge
                                variant="secondary"
                                className="gap-0.5 bg-destructive/15 text-[10px] text-destructive"
                                title={`${vencidos} follow-up(s) vencido(s) nesta etapa`}
                              >
                                <CalendarDots className="h-3 w-3" /> {vencidos}
                              </Badge>
                            )}
                            {semAcao > 0 && (
                              <Badge
                                variant="secondary"
                                className="gap-0.5 bg-muted text-[10px] text-muted-foreground"
                                title={`${semAcao} lead(s) sem próxima ação registrada`}
                              >
                                <Question className="h-3 w-3" /> {semAcao}
                              </Badge>
                            )}
                            {parados > 0 && (
                              <Badge
                                variant="secondary"
                                className="gap-0.5 bg-warning/15 text-[10px] text-warning"
                                title={`${parados} lead(s) parados há 7+ dias nesta etapa`}
                              >
                                <WarningCircle className="h-3 w-3" /> {parados}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                      <span className="px-1 font-display text-sm font-semibold tabular-nums text-muted-foreground">
                        <AnimatedNumber value={quantidade} />
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hidden h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:opacity-100 md:inline-flex md:opacity-0 md:group-hover/col:opacity-100"
                        aria-label={`Recolher coluna ${col.label}`}
                        title="Recolher coluna"
                        onClick={() => toggleColapso(col.id)}
                      >
                        <ArrowsHorizontal className="h-3.5 w-3.5" />
                      </Button>
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
                          "group/card relative cursor-grab rounded-xl border-border-subtle bg-card p-3 shadow-none transition-shadow hover:shadow-elev-2 active:cursor-grabbing",
                          dragging?.cardId === lead.id && "opacity-40",
                        )}
                      >
                        {/* Cartão enxuto (identidade Lançamento, como no
                            vídeo): nome e temperatura, o empreendimento e o
                            próximo passo. Telefone e e-mail moram no
                            dossiê-relâmpago (clique no nome); os prazos (SLA,
                            transferência, dias parado) só aparecem quando há o
                            que cobrar; o corretor, só para a gestão — para o
                            corretor a carteira inteira é dele. */}
                        <div className="flex items-start justify-between gap-2">
                          {/* O nome abre o dossiê-relâmpago. Botões são
                              ignorados pelo onPointerDown do drag, então o
                              clique nunca vira arrasto. */}
                          <button
                            type="button"
                            className="min-w-0 truncate text-left text-sm font-semibold hover:underline focus-visible:underline"
                            aria-label={`Abrir visão rápida de ${lead.nome}`}
                            onClick={() => setPeekLead(lead)}
                          >
                            {lead.nome}
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <TemperatureChip
                              temperatura={lead.temperatura}
                              size="sm"
                              pulse={false}
                              className="shrink-0"
                            />
                            {/* Menu de etapa e descarte. No desktop aparecem
                              por cima da temperatura ao passar o mouse ou
                              focar o card; no toque ficam sempre à mão. */}
                            <div className="flex shrink-0 items-center md:absolute md:right-1.5 md:top-1.5 md:rounded-lg md:bg-card md:opacity-0 md:shadow-elev-2 md:transition-opacity md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100">
                              <LeadStageMenu
                                lead={lead}
                                onPickDirect={(target) =>
                                  updateStatus.mutate({ id: lead.id, status: target })
                                }
                                onPickModal={(modal) => setModalState({ modal, lead })}
                                onPickPerdido={() => setPerdidoLead(lead)}
                                onPickContato={() => setContatoLead(lead)}
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
                                  <Prohibit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        {(lead.projeto_nome || gestao) && (
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {[
                              lead.projeto_nome,
                              gestao
                                ? lead.corretor_id
                                  ? (corretoresMap.get(lead.corretor_id) ?? "—")
                                  : "sem corretor"
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1 empty:hidden">
                          {(lead.status === "novo" || lead.status === "aguardando_atendimento") &&
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
                          {(() => {
                            const dias = diasParado(lead);
                            return dias >= 2 ? (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "gap-0.5 text-[10px]",
                                  dias >= 5
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-warning/15 text-warning",
                                )}
                                title={`Sem interação há ${dias} dias`}
                              >
                                <WarningCircle className="h-2.5 w-2.5" /> {dias}d parado
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                        <div className="-mx-3">
                          {/* "próximo passo: …" é a ação principal do card:
                              continua com alvo de 44 px (toque), só que com
                              cara de linha de texto, como no vídeo. O -mx-3
                              alinha o texto ao nome. */}
                          <div className="min-w-0">
                            {PROXIMA_ACAO[lead.status as LeadStatus] && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-2 min-h-11 w-full text-xs"
                                disabled={updateStatus.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const acao = PROXIMA_ACAO[lead.status as LeadStatus]!;
                                  if ("target" in acao) routeStage(lead, acao.target);
                                  else setContatoLead(lead);
                                }}
                              >
                                <span className="flex w-full min-w-0 items-center justify-between gap-2 font-normal text-muted-foreground group-hover/card:text-foreground">
                                  <span className="truncate">
                                    próximo passo:{" "}
                                    <b className="font-medium">
                                      {primeiraMinuscula(
                                        PROXIMA_ACAO[lead.status as LeadStatus]!.label,
                                      )}
                                    </b>
                                  </span>
                                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                </span>
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
      {contatoLead && (
        <RegistrarContatoDialog
          open
          onOpenChange={(o) => !o && setContatoLead(null)}
          lead={{
            id: contatoLead.id,
            nome: contatoLead.nome,
            corretor_id: contatoLead.corretor_id ?? null,
            status: contatoLead.status,
          }}
          defaultResultado="atendeu"
        />
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
      {/* Dossiê-relâmpago (peek) — contexto e ação sem abrir a página do lead */}
      <LeadPeekDrawer
        lead={peekLead ? toPeekLead(peekLead) : null}
        onOpenChange={(o) => !o && setPeekLead(null)}
        corretorNome={peekLead?.corretor_id ? corretoresMap.get(peekLead.corretor_id) : undefined}
        onWhatsApp={abrirWhatsApp}
        onProximaAcao={proximaAcaoDoPeek}
      />
    </div>
  );
}
