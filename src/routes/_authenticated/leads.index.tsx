import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CONTATO_OPCOES,
  VISOES_PADRAO,
  FILTRO_PADRAO,
  passaContato,
  loadViews,
  saveViews,
  loadUltimoFiltro,
  saveUltimoFiltro,
  type LeadFiltros,
  type SavedView,
} from "@/lib/leads-views";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  UserPlus,
  Search,
  Trash2,
  List,
  Trello,
  Upload,
  Zap,
  MessageCircle,
  Phone,
  PhoneCall,
  Flame,
  Thermometer,
  Snowflake,
  AlertTriangle,
  ArrowRightLeft,
  Bookmark,
  ChevronDown,
  CalendarClock,
  LayoutGrid,
  RefreshCw,
  Rows3,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportLeadsDialog } from "@/components/import-leads-dialog";
import { KanbanBoard } from "@/components/leads-kanban-board";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { isValidBrazilPhone, isValidEmail, normalizeSearch, onlyDigits } from "@/lib/validators";
import { maskPhoneBR } from "@/lib/masks";
import {
  LEAD_STATUS_ORDER,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_BADGE_TONE,
  PROXIMA_ACAO,
  leadStatusLabel,
  resolveStageAction,
  type LeadStatus,
} from "@/lib/leads";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import { TransferSlaBadge, useTransferTimeouts } from "@/components/transfer-sla-badge";
import { LeadPeekDrawer } from "@/features/leads/lead-peek-drawer";
import { ORIGEM_OPTIONS, abrirNovoLead } from "@/features/leads/novo-lead-dialog";
import type { Lead } from "@/features/leads/types";
import { TempIcon, InatividadeBadge } from "@/features/leads/lead-indicators";
import { FinanceiroPopover, LeadRowMenu, IniciarSplitButton } from "@/features/leads/row-actions";
import { useLeadMutations } from "@/features/leads/use-lead-mutations";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { FilterBar } from "@/components/ui/filter-bar";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { EntityCard, EntityRow } from "@/components/ui/entity-card";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads — Seu Metro Quadrado" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: string; view?: "lista" | "kanban" } => ({
    status: typeof search.status === "string" ? search.status : undefined,
    view: search.view === "kanban" ? "kanban" : undefined,
  }),
  component: LeadsPage,
});

const PERIODO_OPTIONS = [
  { value: "all", label: "Qualquer período" },
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "custom", label: "Intervalo personalizado" },
] as const;

type Periodo = (typeof PERIODO_OPTIONS)[number]["value"];

const LEADS_PAGE_SIZE = 50;

function periodoStart(p: Periodo): Date | null {
  const now = new Date();
  if (p === "hoje") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "7d") return new Date(now.getTime() - 7 * 86400000);
  if (p === "30d") return new Date(now.getTime() - 30 * 86400000);
  if (p === "90d") return new Date(now.getTime() - 90 * 86400000);
  return null;
}

function periodoEnd(p: Periodo): Date | null {
  if (p !== "hoje") return null;
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function customDateStart(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function customDateEnd(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function LeadsPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const { user } = useAuth();
  const canManage = isAdmin || isGestor;
  // Abre o wa.me e registra a interação na timeline (ação única de WhatsApp).
  const abrirWhatsApp = useWhatsAppLead();

  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);
  const updateStatus = useLeadStatusMutation({
    invalidateKeys: [["leads"], ["leads-status-counts"]],
  });

  // Dossiê-relâmpago: EntityCard/Row preservam as ações internas e oferecem
  // ativação por clique, Enter e Espaço na superfície da entidade.
  const [peekLead, setPeekLead] = useState<Lead | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { status: statusParam, view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeView: "lista" | "kanban" = view ?? "lista";
  const setView = (v: "lista" | "kanban") =>
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        view: v === "kanban" ? "kanban" : undefined,
      }),
    });
  const statusParamValido =
    statusParam && (LEAD_STATUS_ORDER as readonly string[]).includes(statusParam)
      ? statusParam
      : undefined;
  const [statusFilter, setStatusFilter] = useState<string>(
    statusParamValido ?? (canManage ? "all" : "aguardando_atendimento"),
  );
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [corretorFilter, setCorretorFilter] = useState<string>("all");
  const [temperaturaFilter, setTemperaturaFilter] = useState<string>("all");
  const [periodoFilter, setPeriodoFilter] = useState<Periodo>("all");
  const [dataInicioFilter, setDataInicioFilter] = useState("");
  const [dataFimFilter, setDataFimFilter] = useState("");
  const [contatoFilter, setContatoFilter] = useState<string>("all");
  const [showLixeira, setShowLixeira] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"tabela" | "cards">(() => {
    if (typeof window === "undefined") return "tabela";
    const saved = window.localStorage.getItem("smq:leads-view-mode");
    if (saved === "cards" || saved === "tabela") return saved;
    return window.matchMedia("(max-width: 767px)").matches ? "cards" : "tabela";
  });
  const [importOpen, setImportOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<string>("");
  const [bulkFollowupOpen, setBulkFollowupOpen] = useState(false);
  const [bulkFollowupData, setBulkFollowupData] = useState<string>("");
  const [contactLead, setContactLead] = useState<Lead | null>(null);
  // Último tipo de contato usado, para o split "Iniciar atendimento" em 1 clique.
  const [lastContactType, setLastContactType] = useState<"ligacao" | "whatsapp">(() => {
    if (typeof window === "undefined") return "whatsapp";
    const v = window.localStorage.getItem("smq:lastContactType");
    return v === "ligacao" || v === "whatsapp" ? v : "whatsapp";
  });
  const iniciarComTipo = (lead: Lead, tipo: "ligacao" | "whatsapp") => {
    setLastContactType(tipo);
    if (typeof window !== "undefined") window.localStorage.setItem("smq:lastContactType", tipo);
    iniciarAtendimento.mutate({ lead, tipo });
  };

  // Visões salvas (localStorage por usuário)
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  // Confirmação antes de excluir uma visão salva.
  const [confirmDeleteView, setConfirmDeleteView] = useState<{ id: string; nome: string } | null>(
    null,
  );
  const [viewName, setViewName] = useState("");
  const filtrosRestauradosRef = useRef(false);

  // Debounce da busca (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Drill-down: ao chegar do dashboard com ?status=…, aplica o filtro de status.
  useEffect(() => {
    if (statusParamValido) setStatusFilter(statusParamValido);
  }, [statusParamValido]);

  // Filtros atuais como objeto (para salvar/restaurar/visões).
  const filtrosAtuais: LeadFiltros = {
    status: statusFilter,
    origem: origemFilter,
    corretor: corretorFilter,
    temperatura: temperaturaFilter,
    periodo: periodoFilter,
    dataInicio: dataInicioFilter,
    dataFim: dataFimFilter,
    contato: contatoFilter,
  };

  const aplicarFiltros = (f: LeadFiltros) => {
    setStatusFilter(f.status);
    setOrigemFilter(f.origem);
    setCorretorFilter(canManage ? f.corretor : "all");
    setTemperaturaFilter(f.temperatura);
    setPeriodoFilter(f.periodo as Periodo);
    setDataInicioFilter(f.dataInicio ?? "");
    setDataFimFilter(f.dataFim ?? "");
    setContatoFilter(f.contato);
  };

  // Carrega visões salvas e restaura o último filtro (1x, ao montar).
  useEffect(() => {
    if (!user?.id || filtrosRestauradosRef.current) return;
    filtrosRestauradosRef.current = true;
    setSavedViews(loadViews(user.id));
    const ultimo = loadUltimoFiltro(user.id);
    if (ultimo) aplicarFiltros({ ...FILTRO_PADRAO, ...ultimo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persiste o filtro atual sempre que muda (após restaurado).
  useEffect(() => {
    if (!user?.id || !filtrosRestauradosRef.current) return;
    saveUltimoFiltro(user.id, filtrosAtuais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    statusFilter,
    origemFilter,
    corretorFilter,
    temperaturaFilter,
    periodoFilter,
    dataInicioFilter,
    dataFimFilter,
    contatoFilter,
  ]);

  // IDs de leads com follow-up pendente (só quando o filtro "com_followup" está ativo).
  const {
    data: followupIds,
    isLoading: followupLoading,
    isError: followupError,
    refetch: refetchFollowups,
  } = useQuery({
    queryKey: ["followup-lead-ids", user?.id, canManage],
    enabled: contatoFilter === "com_followup",
    queryFn: async () => {
      let q = supabase
        .from("tarefas")
        .select("lead_id")
        .eq("tipo", "follow_up")
        .in("status", ["pendente", "em_andamento"])
        .not("lead_id", "is", null);
      if (!canManage && user?.id) q = q.eq("corretor_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.lead_id as string));
    },
  });

  const salvarVisaoAtual = () => {
    const nome = viewName.trim();
    if (!nome || !user?.id) return;
    const nova: SavedView = { id: crypto.randomUUID(), nome, filtros: filtrosAtuais };
    const next = [...savedViews, nova];
    setSavedViews(next);
    saveViews(user.id, next);
    setViewName("");
    setSaveViewOpen(false);
    toast.success("Visão salva");
  };

  const excluirVisao = (id: string) => {
    if (!user?.id) return;
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    saveViews(user.id, next);
  };

  const { data: corretores } = useQuery({
    queryKey: ["corretores-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const corretoresMap = useMemo(() => {
    const m = new Map<string, string>();
    (corretores ?? []).forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [corretores]);

  // Query principal — aplica os filtros direto no banco; em Venda usa data_assinatura.
  const baseQueryKey = {
    debouncedSearch,
    origemFilter,
    corretorFilter,
    temperaturaFilter,
    periodoFilter,
    dataInicioFilter,
    dataFimFilter,
    showLixeira,
    canManage,
    uid: user?.id,
    contatoFilter,
    page,
  };

  // Filtros de contato ainda dependem do conjunto completo. Os demais usam
  // paginação real no banco para que o lead 1.001 continue acessível.
  const serverPaginated = contatoFilter === "all";

  const periodoRange = useMemo(() => {
    if (periodoFilter === "custom") {
      return {
        start: customDateStart(dataInicioFilter),
        end: customDateEnd(dataFimFilter),
      };
    }
    return { start: periodoStart(periodoFilter), end: periodoEnd(periodoFilter) };
  }, [periodoFilter, dataInicioFilter, dataFimFilter]);

  const {
    data: leadsAll,
    isLoading,
    isError: leadsError,
    refetch: refetchLeads,
  } = useQuery({
    queryKey: ["leads", baseQueryKey, statusFilter],
    queryFn: async () => {
      const sNorm = debouncedSearch ? normalizeSearch(debouncedSearch).replace(/[%,]/g, "") : "";
      const sDig = debouncedSearch ? onlyDigits(debouncedSearch) : "";
      const { data, error } = await supabase.rpc("leads_filtered", {
        _na_lixeira: showLixeira,
        _status: statusFilter,
        _origem: origemFilter,
        _corretor: corretorFilter,
        _temperatura: temperaturaFilter,
        _periodo_start: periodoRange.start ? periodoRange.start.toISOString() : undefined,
        _periodo_end: periodoRange.end ? periodoRange.end.toISOString() : undefined,
        _search: sNorm,
        _search_digits: sDig,
        _limit: serverPaginated ? LEADS_PAGE_SIZE : 1000,
        _offset: serverPaginated ? (page - 1) * LEADS_PAGE_SIZE : 0,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
    enabled: canManage || !!user?.id,
  });

  // Corretor só precisa acordar com mudanças da própria carteira; gestor/admin
  // veem tudo, então não filtram. O debounce do hook coalesce rajadas.
  useRealtimeInvalidate(["leads", "vendas"], [["leads"], ["leads-status-counts"]], {
    filter: !canManage && user?.id ? `corretor_id=eq.${user.id}` : undefined,
  });

  // Contagens reais por status — respeita filtros e usa data_assinatura para Venda.
  const {
    data: statusCountsData,
    isError: statusCountsError,
    refetch: refetchStatusCounts,
  } = useQuery({
    queryKey: ["leads-status-counts", baseQueryKey],
    queryFn: async () => {
      const sNorm = debouncedSearch ? normalizeSearch(debouncedSearch).replace(/[%,]/g, "") : "";
      const sDig = debouncedSearch ? onlyDigits(debouncedSearch) : "";
      const { data, error } = await supabase.rpc("leads_status_counts", {
        _na_lixeira: showLixeira,
        _origem: origemFilter,
        _corretor: corretorFilter,
        _temperatura: temperaturaFilter,
        _periodo_start: periodoRange.start ? periodoRange.start.toISOString() : undefined,
        _periodo_end: periodoRange.end ? periodoRange.end.toISOString() : undefined,
        _search: sNorm,
        _search_digits: sDig,
      });
      if (error) throw error;
      const counts: Record<string, number> = {};
      let total = 0;
      ((data ?? []) as unknown as Array<{ status: string; quantidade: number }>).forEach((row) => {
        if (row.status === "__total__") total = Number(row.quantidade);
        else counts[row.status] = Number(row.quantidade);
      });
      return { total, counts };
    },
    enabled: canManage || !!user?.id,
  });

  const statusCounts = statusCountsData?.counts ?? {};
  const leadQueryTotal = Number(leadsAll?.[0]?.total_count ?? leadsAll?.length ?? 0);
  const totalLeadsCount = statusCountsData?.total ?? leadQueryTotal;
  const followupFilterFailed = contatoFilter === "com_followup" && followupError;
  const listError = leadsError || statusCountsError || followupFilterFailed;
  const listLoading = isLoading || (contatoFilter === "com_followup" && followupLoading);

  const filtered = useMemo(() => {
    if (!leadsAll) return [];
    let base = leadsAll;
    if (contatoFilter !== "all") {
      base = base.filter((l) =>
        passaContato(contatoFilter, {
          ultimaInteracao: l.ultima_interacao,
          status: l.status,
          temFollowup: followupIds?.has(l.id) ?? false,
        }),
      );
    }
    // Prioriza: 1) Aguardando + Facebook (ADS), 2) Aguardando + projeto registrado,
    // 3) demais. Dentro de cada grupo, mais recentes primeiro.
    const priority = (l: Lead) => {
      const aguardando = l.status === "aguardando_atendimento";
      if (aguardando && l.origem === "facebook") return 0;
      if (aguardando && (l.projeto_id || l.projeto_nome)) return 1;
      if (aguardando) return 2;
      return 3;
    };
    return [...base].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      if (a.status === "contrato_fechado" || b.status === "contrato_fechado") {
        const av = a.data_venda ? new Date(a.data_venda).getTime() : 0;
        const bv = b.data_venda ? new Date(b.data_venda).getTime() : 0;
        if (av !== bv) return bv - av;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [leadsAll, contatoFilter, followupIds]);

  const currentStatusTotal = statusCountsData
    ? statusFilter === "all"
      ? totalLeadsCount
      : (statusCounts[statusFilter] ?? 0)
    : leadQueryTotal;
  const visibleTotal = serverPaginated ? currentStatusTotal : filtered.length;
  const totalPages = Math.max(1, Math.ceil(visibleTotal / LEADS_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginated = useMemo(
    () =>
      serverPaginated
        ? filtered
        : filtered.slice((pageSafe - 1) * LEADS_PAGE_SIZE, pageSafe * LEADS_PAGE_SIZE),
    [filtered, pageSafe, serverPaginated],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Timeouts de repasse (5 min p/ chatbot/webhook etc.) e infos por lead
  // (data_distribuicao + tentativas) para o timer visual no card/linha.
  const transferTimeouts = useTransferTimeouts();
  const aguardandoIds = useMemo(
    () => paginated.filter((l) => l.status === "aguardando_atendimento").map((l) => l.id),
    [paginated],
  );
  const { data: transferInfoRows } = useQuery({
    queryKey: ["leads-transfer-info", aguardandoIds],
    enabled: aguardandoIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, data_distribuicao, tentativas_redistribuicao, via_webhook")
        .in("id", aguardandoIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const transferInfoMap = useMemo(() => {
    const m = new Map<
      string,
      {
        data_distribuicao: string | null;
        tentativas_redistribuicao: number | null;
        via_webhook: boolean;
      }
    >();
    (transferInfoRows ?? []).forEach((r) =>
      m.set(r.id as string, {
        data_distribuicao: (r.data_distribuicao as string | null) ?? null,
        tentativas_redistribuicao: (r.tentativas_redistribuicao as number | null) ?? null,
        via_webhook: (r.via_webhook as boolean | null) ?? false,
      }),
    );
    return m;
  }, [transferInfoRows]);

  // Volta para a 1ª página quando os filtros mudam.
  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    origemFilter,
    corretorFilter,
    temperaturaFilter,
    periodoFilter,
    dataInicioFilter,
    dataFimFilter,
    contatoFilter,
    debouncedSearch,
    showLixeira,
  ]);

  // Persiste o modo de visualização (tabela/cards).
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("smq:leads-view-mode", viewMode);
  }, [viewMode]);

  // Limpa seleção quando o conjunto filtrado muda
  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(filtered.map((l) => l.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((l) => l.id)));
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const {
    distribuir,
    moverLixeira,
    bulkTransferir,
    bulkTemperatura,
    bulkFollowup,
    bulkRegistrarLigacao,
    iniciarAtendimento,
  } = useLeadMutations({
    clearSelection: () => setSelectedIds(new Set()),
    fecharDialogs: {
      transferir: () => {
        setBulkTransferOpen(false);
        setBulkTarget("");
      },
      followup: () => {
        setBulkFollowupOpen(false);
        setBulkFollowupData("");
      },
      contato: () => setContactLead(null),
    },
  });

  const activeFiltersCount =
    (statusFilter !== "all" && statusFilter !== "aguardando_atendimento" ? 1 : 0) +
    (origemFilter !== "all" ? 1 : 0) +
    (corretorFilter !== "all" ? 1 : 0) +
    (temperaturaFilter !== "all" ? 1 : 0) +
    (periodoFilter !== "all" ? 1 : 0) +
    (contatoFilter !== "all" ? 1 : 0) +
    (debouncedSearch ? 1 : 0);

  function limparFiltros() {
    setSearch("");
    setStatusFilter(canManage ? "all" : "aguardando_atendimento");
    setOrigemFilter("all");
    setCorretorFilter("all");
    setTemperaturaFilter("all");
    setPeriodoFilter("all");
    setDataInicioFilter("");
    setDataFimFilter("");
    setContatoFilter("all");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Funil de leads, distribuição e qualificação."
        actions={
          <div className="flex max-w-full items-center gap-2 overflow-x-auto [&_a]:min-h-11 [&_button]:min-h-11">
            <div className="inline-flex rounded-md border bg-card p-0.5">
              <Button
                size="sm"
                variant={activeView === "lista" ? "default" : "ghost"}
                aria-pressed={activeView === "lista"}
                onClick={() => setView("lista")}
              >
                <List className="h-4 w-4 mr-1" /> Lista
              </Button>
              <Button
                size="sm"
                variant={activeView === "kanban" ? "default" : "ghost"}
                aria-pressed={activeView === "kanban"}
                onClick={() => setView("kanban")}
              >
                <Trello className="h-4 w-4 mr-1" /> Kanban
              </Button>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/blitz">
                <Zap className="h-4 w-4 mr-1" /> Blitz
              </Link>
            </Button>
            {canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Importar
                </Button>
                <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} />
              </>
            )}
            <Button size="sm" onClick={abrirNovoLead}>
              <UserPlus className="h-4 w-4 mr-1" /> Novo lead
            </Button>
          </div>
        }
      />

      {activeView === "kanban" ? (
        <KanbanBoard />
      ) : (
        <>
          {/* Chips de status com contagem */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              aria-pressed={statusFilter === "all"}
              className={`min-h-11 px-3 py-2 rounded-full text-xs font-medium border transition ${
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted"
              }`}
            >
              Todos · {statusCountsData ? totalLeadsCount : "—"}
            </button>
            {LEAD_STATUS_ORDER.filter((s) => canManage || s !== "novo").map((s) => {
              const n = statusCountsData ? (statusCounts[s] ?? 0) : "—";
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(active ? "all" : s)}
                  aria-pressed={active}
                  className={`min-h-11 px-3 py-2 rounded-full text-xs font-medium border whitespace-nowrap transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {LEAD_STATUS_LABEL[s]} · {n}
                </button>
              );
            })}
          </div>

          {/* Filtros rápidos (por contato) + Visões salvas */}
          <div className="flex flex-wrap items-center gap-2">
            {CONTATO_OPCOES.map((o) => {
              const active = contatoFilter === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setContatoFilter(active ? "all" : o.value)}
                  aria-pressed={active}
                  className={`min-h-11 px-3 py-2 rounded-full text-xs font-medium border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-11">
                    <Bookmark className="h-3.5 w-3.5 mr-1" /> Visões
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>Visões prontas</DropdownMenuLabel>
                  {VISOES_PADRAO.map((v) => (
                    <DropdownMenuItem key={v.id} onSelect={() => aplicarFiltros(v.filtros)}>
                      {v.nome}
                    </DropdownMenuItem>
                  ))}
                  {savedViews.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Minhas visões</DropdownMenuLabel>
                      {savedViews.map((v) => (
                        <DropdownMenuItem
                          key={v.id}
                          onSelect={() => aplicarFiltros(v.filtros)}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{v.nome}</span>
                          <button
                            type="button"
                            aria-label={`Excluir visão ${v.nome}`}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmDeleteView({ id: v.id, nome: v.nome });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSaveViewOpen(true)}>
                    <Bookmark className="h-3.5 w-3.5 mr-2" /> Salvar visão atual
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AlertDialog
                open={!!confirmDeleteView}
                onOpenChange={(o) => !o && setConfirmDeleteView(null)}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Excluir a visão "{confirmDeleteView?.nome}"?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta visão salva de filtros será removida. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (confirmDeleteView) excluirVisao(confirmDeleteView.id);
                        setConfirmDeleteView(null);
                      }}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Salvar visão atual</DialogTitle>
              </DialogHeader>
              <div className="py-2">
                <Label>Nome da visão</Label>
                <Input
                  autoFocus
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  placeholder="Ex.: Meus quentes sem contato"
                  onKeyDown={(e) => e.key === "Enter" && salvarVisaoAtual()}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSaveViewOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={salvarVisaoAtual} disabled={!viewName.trim()}>
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <FilterBar
                activeCount={activeFiltersCount}
                onClear={limparFiltros}
                resultsLabel={
                  listError
                    ? "Não foi possível calcular os resultados"
                    : listLoading
                      ? "Carregando leads…"
                      : `${visibleTotal} lead(s)`
                }
                className="shadow-none"
                primary={
                  <div className="relative max-w-xl">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Buscar leads"
                      placeholder="Buscar por nome, email ou telefone…"
                      className="pl-9"
                    />
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border p-0.5">
                      <Button
                        size="icon"
                        variant={viewMode === "tabela" ? "default" : "ghost"}
                        aria-label="Ver leads em tabela"
                        aria-pressed={viewMode === "tabela"}
                        title="Ver em tabela"
                        onClick={() => setViewMode("tabela")}
                      >
                        <Rows3 aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant={viewMode === "cards" ? "default" : "ghost"}
                        aria-label="Ver leads em cards"
                        aria-pressed={viewMode === "cards"}
                        title="Ver em cards"
                        onClick={() => setViewMode("cards")}
                      >
                        <LayoutGrid aria-hidden="true" />
                      </Button>
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        aria-pressed={showLixeira}
                        onClick={() => setShowLixeira(!showLixeira)}
                      >
                        {showLixeira ? "Ver ativos" : "Ver lixeira"}
                      </Button>
                    )}
                  </div>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <>
                    <Select value={origemFilter} onValueChange={setOrigemFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Origem" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as origens</SelectItem>
                        {ORIGEM_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={temperaturaFilter} onValueChange={setTemperaturaFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Temperatura" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas temperaturas</SelectItem>
                        <SelectItem value="quente">🔥 Quente</SelectItem>
                        <SelectItem value="morno">🌡️ Morno</SelectItem>
                        <SelectItem value="frio">❄️ Frio</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={periodoFilter}
                      onValueChange={(v) => setPeriodoFilter(v as Periodo)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Período" />
                      </SelectTrigger>
                      <SelectContent>
                        {PERIODO_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {canManage && (
                      <Select value={corretorFilter} onValueChange={setCorretorFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Corretor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os corretores</SelectItem>
                          <SelectItem value="unassigned">Sem corretor</SelectItem>
                          {(corretores ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                  {periodoFilter === "custom" && (
                    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
                      <div className="relative">
                        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          value={dataInicioFilter}
                          onChange={(e) => setDataInicioFilter(e.target.value)}
                          className="pl-9"
                          aria-label="Data inicial"
                        />
                      </div>
                      <div className="relative">
                        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          value={dataFimFilter}
                          onChange={(e) => setDataFimFilter(e.target.value)}
                          className="pl-9"
                          aria-label="Data final"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </FilterBar>

              {/* Barra de ações em lote */}
              <BulkActionBar
                selectedCount={selectedIds.size}
                entityLabel="lead"
                onClear={() => setSelectedIds(new Set())}
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkRegistrarLigacao.isPending}
                  onClick={() => {
                    const n = selectedIds.size;
                    if (
                      window.confirm(
                        `Registrar ligação em ${n} lead${n > 1 ? "s" : ""} selecionado${n > 1 ? "s" : ""}?`,
                      )
                    )
                      bulkRegistrarLigacao.mutate(Array.from(selectedIds));
                  }}
                >
                  <PhoneCall className="h-3.5 w-3.5 mr-1" /> Registrar ligação
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={bulkTemperatura.isPending}>
                      <Thermometer className="h-3.5 w-3.5 mr-1" /> Temperatura
                      <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {(
                      [
                        { key: "quente", label: "Quente" },
                        { key: "morno", label: "Morno" },
                        { key: "frio", label: "Frio" },
                      ] as const
                    ).map((opt) => (
                      <DropdownMenuItem
                        key={opt.key}
                        onSelect={() => {
                          const n = selectedIds.size;
                          if (
                            window.confirm(`Marcar ${n} lead${n > 1 ? "s" : ""} como ${opt.label}?`)
                          )
                            bulkTemperatura.mutate({
                              ids: Array.from(selectedIds),
                              temp: opt.key,
                            });
                        }}
                      >
                        {opt.key === "quente" && (
                          <Flame className="h-4 w-4 mr-2 text-destructive" />
                        )}
                        {opt.key === "morno" && (
                          <Thermometer className="h-4 w-4 mr-2 text-warning" />
                        )}
                        {opt.key === "frio" && <Snowflake className="h-4 w-4 mr-2 text-info" />}
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="outline" onClick={() => setBulkFollowupOpen(true)}>
                  <CalendarClock className="h-3.5 w-3.5 mr-1" /> Follow-up
                </Button>
                {canManage && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setBulkTransferOpen(true)}>
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const n = selectedIds.size;
                        const acao = showLixeira ? "Restaurar" : "Mover p/ lixeira";
                        if (window.confirm(`${acao} ${n} lead${n > 1 ? "s" : ""}?`))
                          moverLixeira.mutate({
                            ids: Array.from(selectedIds),
                            lixeira: !showLixeira,
                          });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      {showLixeira ? "Restaurar" : "Mover p/ lixeira"}
                    </Button>
                  </>
                )}
              </BulkActionBar>

              {listError ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <AlertTriangle className="h-10 w-10 mx-auto text-destructive opacity-70" />
                    <p className="text-sm text-muted-foreground">
                      Não foi possível carregar os leads ou seus filtros. Verifique sua conexão e
                      tente novamente.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => {
                        void refetchLeads();
                        void refetchStatusCounts();
                        if (contatoFilter === "com_followup") void refetchFollowups();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                    </Button>
                  </CardContent>
                </Card>
              ) : listLoading ? (
                viewMode === "tabela" ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-44 w-full rounded-lg" />
                    ))}
                  </div>
                )
              ) : viewMode === "tabela" ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            onCheckedChange={toggleAll}
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Corretor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 && !listLoading && (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center text-muted-foreground py-10"
                          >
                            Nenhum lead encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                      {paginated.map((l) => (
                        <EntityRow
                          key={l.id}
                          asChild
                          selected={selectedIds.has(l.id)}
                          onActivate={() => setPeekLead(l)}
                          aria-label={`Abrir visão rápida de ${l.nome}`}
                        >
                          <TableRow>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(l.id)}
                                onCheckedChange={() => toggleOne(l.id)}
                                aria-label={`Selecionar ${l.nome}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <TempIcon temp={l.temperatura} />
                                <Link
                                  to="/leads/$leadId"
                                  params={{ leadId: l.id }}
                                  className="font-medium hover:underline"
                                >
                                  {l.nome}
                                </Link>
                                <FinanceiroPopover lead={l} />
                              </div>
                              {l.projeto_nome && (
                                <div className="text-xs text-muted-foreground">
                                  {l.projeto_nome}
                                </div>
                              )}
                              <div className="mt-1">
                                <InatividadeBadge lead={l} />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm">{l.telefone}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {l.email ?? "—"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-success hover:text-success hover:bg-success/10"
                                    aria-label={`Abrir WhatsApp de ${l.nome}`}
                                    title="Abrir WhatsApp com mensagem pronta"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      abrirWhatsApp(l);
                                    }}
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    asChild
                                    size="icon"
                                    variant="ghost"
                                    className="text-info hover:text-info hover:bg-info/10"
                                    aria-label={`Ligar para ${l.nome}`}
                                    title="Ligar"
                                  >
                                    <a
                                      href={`tel:${l.telefone.replace(/\D/g, "")}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Phone className="h-4 w-4" />
                                    </a>
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize text-sm">
                              {l.origem.replace(/_/g, " ")}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge
                                  className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                                  variant="secondary"
                                >
                                  {leadStatusLabel(l.status)}
                                </Badge>
                                {(() => {
                                  const info = transferInfoMap.get(l.id);
                                  if (!info) return null;
                                  return (
                                    <TransferSlaBadge
                                      leadId={l.id}
                                      origem={l.origem}
                                      status={l.status}
                                      dataDistribuicao={info.data_distribuicao}
                                      tentativas={info.tentativas_redistribuicao}
                                      timeouts={transferTimeouts}
                                      viaWebhook={info.via_webhook}
                                      compact
                                      showBar
                                    />
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {l.corretor_id ? (
                                (corretoresMap.get(l.corretor_id) ?? "—")
                              ) : (
                                <span className="text-muted-foreground italic">sem corretor</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {l.status === "contrato_fechado" && l.data_venda
                                ? new Date(`${l.data_venda}T00:00:00`).toLocaleDateString("pt-BR")
                                : new Date(l.created_at).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {!l.na_lixeira &&
                                  l.status === "aguardando_atendimento" &&
                                  (canManage || l.corretor_id === user?.id) && (
                                    <IniciarSplitButton
                                      lead={l}
                                      lastContactType={lastContactType}
                                      pending={iniciarAtendimento.isPending}
                                      onIniciar={iniciarComTipo}
                                      onEscolher={setContactLead}
                                    />
                                  )}
                                {!l.na_lixeira &&
                                  (canManage || l.corretor_id === user?.id) &&
                                  l.status !== "aguardando_atendimento" &&
                                  PROXIMA_ACAO[l.status as LeadStatus] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={updateStatus.isPending}
                                      onClick={() => {
                                        const acao = PROXIMA_ACAO[l.status as LeadStatus]!;
                                        const action = resolveStageAction(acao.target);
                                        if (action.kind === "modal")
                                          setModalState({ modal: action.modal, lead: l });
                                        else if (action.kind === "perdido") setPerdidoLead(l);
                                        else updateStatus.mutate({ id: l.id, status: acao.target });
                                      }}
                                    >
                                      {PROXIMA_ACAO[l.status as LeadStatus]!.label}
                                    </Button>
                                  )}
                                <LeadRowMenu
                                  lead={l}
                                  canManage={canManage}
                                  canAct={canManage || l.corretor_id === user?.id}
                                  onPickDirect={(target) =>
                                    updateStatus.mutate({ id: l.id, status: target })
                                  }
                                  onPickModal={(modal) => setModalState({ modal, lead: l })}
                                  onPickPerdido={() => setPerdidoLead(l)}
                                  onRoleta={() => distribuir.mutate(l.id)}
                                  onTransferir={() => {
                                    setSelectedIds(new Set([l.id]));
                                    setBulkTransferOpen(true);
                                  }}
                                  onLixeira={() =>
                                    moverLixeira.mutate({ ids: [l.id], lixeira: !l.na_lixeira })
                                  }
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        </EntityRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {paginated.length === 0 && !listLoading && (
                    <div className="col-span-full text-center text-muted-foreground py-10">
                      Nenhum lead encontrado.
                    </div>
                  )}
                  {paginated.map((l) => {
                    const proxima = PROXIMA_ACAO[l.status as LeadStatus];
                    const canAct = canManage || l.corretor_id === user?.id;
                    return (
                      <EntityCard
                        key={l.id}
                        aria-label={`Abrir visão rápida de ${l.nome}`}
                        activationLabel={`Abrir visão rápida de ${l.nome}`}
                        selected={selectedIds.has(l.id)}
                        onActivate={() => setPeekLead(l)}
                        className="space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={selectedIds.has(l.id)}
                            onCheckedChange={() => toggleOne(l.id)}
                            aria-label={`Selecionar ${l.nome}`}
                            className="mt-0.5"
                          />
                          <TemperatureChip temperatura={l.temperatura} size="sm" pulse={false} />
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: l.id }}
                            className="font-medium hover:underline flex-1 truncate"
                          >
                            {l.nome}
                          </Link>
                          <Badge
                            className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                            variant="secondary"
                          >
                            {leadStatusLabel(l.status)}
                          </Badge>
                        </div>
                        {(() => {
                          const info = transferInfoMap.get(l.id);
                          if (!info) return null;
                          return (
                            <TransferSlaBadge
                              leadId={l.id}
                              origem={l.origem}
                              status={l.status}
                              dataDistribuicao={info.data_distribuicao}
                              tentativas={info.tentativas_redistribuicao}
                              timeouts={transferTimeouts}
                              viaWebhook={info.via_webhook}
                              showBar
                            />
                          );
                        })()}

                        <div className="text-xs text-muted-foreground capitalize">
                          {l.projeto_nome || "Sem empreendimento"} · {l.origem.replace(/_/g, " ")}
                        </div>
                        <div className="text-sm truncate">
                          {l.telefone}
                          {l.email ? ` · ${l.email}` : ""}
                        </div>

                        <div className="grid grid-cols-3 gap-1 text-xs">
                          <div>
                            <div className="text-muted-foreground">Renda</div>
                            <div className="truncate">{l.renda_informada || "—"}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Entrada</div>
                            <div className="truncate">{l.entrada_disponivel || "—"}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">FGTS</div>
                            <div>{l.usa_fgts == null ? "—" : l.usa_fgts ? "Sim" : "Não"}</div>
                          </div>
                        </div>

                        <div className="min-h-[20px]">
                          {l.corretor_id ? (
                            <span className="text-xs text-muted-foreground">
                              {corretoresMap.get(l.corretor_id) ?? ""}
                            </span>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              sem corretor
                            </span>
                          )}
                          <InatividadeBadge lead={l} />
                        </div>

                        <div className="flex flex-wrap items-center gap-1 pt-2 border-t">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-success hover:bg-success/10"
                            aria-label={`Abrir WhatsApp de ${l.nome}`}
                            title="Abrir WhatsApp com mensagem pronta"
                            onClick={() => abrirWhatsApp(l)}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="text-info hover:bg-info/10"
                            aria-label={`Ligar para ${l.nome}`}
                            title="Ligar"
                          >
                            <a href={`tel:${l.telefone.replace(/\D/g, "")}`}>
                              <Phone className="h-4 w-4" />
                            </a>
                          </Button>

                          {!l.na_lixeira && canAct && l.status === "aguardando_atendimento" && (
                            <IniciarSplitButton
                              lead={l}
                              lastContactType={lastContactType}
                              pending={iniciarAtendimento.isPending}
                              onIniciar={iniciarComTipo}
                              onEscolher={setContactLead}
                            />
                          )}
                          {!l.na_lixeira &&
                            canAct &&
                            l.status !== "aguardando_atendimento" &&
                            proxima && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={updateStatus.isPending}
                                onClick={() => {
                                  const action = resolveStageAction(proxima.target);
                                  if (action.kind === "modal")
                                    setModalState({ modal: action.modal, lead: l });
                                  else if (action.kind === "perdido") setPerdidoLead(l);
                                  else updateStatus.mutate({ id: l.id, status: proxima.target });
                                }}
                              >
                                {proxima.label}
                              </Button>
                            )}
                          <LeadRowMenu
                            lead={l}
                            canManage={canManage}
                            canAct={canAct}
                            onPickDirect={(target) =>
                              updateStatus.mutate({ id: l.id, status: target })
                            }
                            onPickModal={(modal) => setModalState({ modal, lead: l })}
                            onPickPerdido={() => setPerdidoLead(l)}
                            onRoleta={() => distribuir.mutate(l.id)}
                            onTransferir={() => {
                              setSelectedIds(new Set([l.id]));
                              setBulkTransferOpen(true);
                            }}
                            onLixeira={() =>
                              moverLixeira.mutate({ ids: [l.id], lixeira: !l.na_lixeira })
                            }
                          />
                        </div>
                      </EntityCard>
                    );
                  })}
                </div>
              )}

              {/* Teto de segurança da RPC: sem aviso, o corte de 1000 seria silencioso. */}
              {!serverPaginated && totalLeadsCount > 1000 && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  O filtro de contato analisa no máximo 1.000 leads. Refine status, período ou
                  corretor para reduzir o conjunto antes de usar este filtro.
                </p>
              )}

              {/* Paginação (50 por página) */}
              {visibleTotal > LEADS_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs text-muted-foreground">
                    Página {pageSafe} de {totalPages} · {visibleTotal.toLocaleString("pt-BR")}{" "}
                    lead(s)
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={pageSafe <= 1}
                      onClick={() => setPage(pageSafe - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={pageSafe >= totalPages}
                      onClick={() => setPage(pageSafe + 1)}
                    >
                      Próxima <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <LeadStageModals
            modalState={modalState}
            onModalOpenChange={(o) => !o && setModalState(null)}
            perdidoLead={perdidoLead}
            onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
          />

          {/* Dossiê-relâmpago (peek) — contexto e ação sem abrir a página do lead */}
          <LeadPeekDrawer
            lead={peekLead}
            onOpenChange={(o) => !o && setPeekLead(null)}
            corretorNome={
              peekLead?.corretor_id ? corretoresMap.get(peekLead.corretor_id) : undefined
            }
            onWhatsApp={(pl) => abrirWhatsApp(pl as Lead)}
            onProximaAcao={(pl) => {
              const l = pl as Lead;
              const acao = PROXIMA_ACAO[l.status as LeadStatus];
              if (!acao) return;
              const action = resolveStageAction(acao.target);
              setPeekLead(null);
              if (action.kind === "modal") setModalState({ modal: action.modal, lead: l });
              else if (action.kind === "perdido") setPerdidoLead(l);
              else updateStatus.mutate({ id: l.id, status: acao.target });
            }}
          />

          {/* Tipo de contato ao iniciar atendimento */}
          <Dialog open={!!contactLead} onOpenChange={(o) => !o && setContactLead(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Iniciar atendimento</DialogTitle>
                <DialogDescription>
                  Como você está fazendo o primeiro contato com {contactLead?.nome}?
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    contactLead && iniciarAtendimento.mutate({ lead: contactLead, tipo: "ligacao" })
                  }
                  disabled={iniciarAtendimento.isPending}
                  className="flex flex-col items-center gap-2 rounded-lg border p-6 hover:bg-muted transition disabled:opacity-50"
                >
                  <Phone className="h-10 w-10 text-info" />
                  <span className="font-medium">Ligação</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    contactLead &&
                    iniciarAtendimento.mutate({ lead: contactLead, tipo: "whatsapp" })
                  }
                  disabled={iniciarAtendimento.isPending}
                  className="flex flex-col items-center gap-2 rounded-lg border p-6 hover:bg-muted transition disabled:opacity-50"
                >
                  <MessageCircle className="h-10 w-10 text-success" />
                  <span className="font-medium">WhatsApp</span>
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Transferir em lote */}
          <Dialog open={bulkTransferOpen} onOpenChange={setBulkTransferOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transferir {selectedIds.size} lead(s)</DialogTitle>
                <DialogDescription>Escolha o corretor de destino.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Corretor</Label>
                <Select value={bulkTarget} onValueChange={setBulkTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um corretor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(corretores ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setBulkTransferOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!bulkTarget || bulkTransferir.isPending}
                  onClick={() =>
                    bulkTransferir.mutate({
                      ids: Array.from(selectedIds),
                      corretorId: bulkTarget,
                    })
                  }
                >
                  {bulkTransferir.isPending ? "Transferindo…" : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkFollowupOpen} onOpenChange={setBulkFollowupOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Definir follow-up em {selectedIds.size} lead(s)</DialogTitle>
                <DialogDescription>
                  Define a data/hora do próximo follow-up para todos os selecionados.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Próximo follow-up</Label>
                <Input
                  type="datetime-local"
                  value={bulkFollowupData}
                  onChange={(e) => setBulkFollowupData(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setBulkFollowupOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!bulkFollowupData || bulkFollowup.isPending}
                  onClick={() =>
                    bulkFollowup.mutate({
                      ids: Array.from(selectedIds),
                      iso: new Date(bulkFollowupData).toISOString(),
                    })
                  }
                >
                  {bulkFollowup.isPending ? "Salvando…" : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
