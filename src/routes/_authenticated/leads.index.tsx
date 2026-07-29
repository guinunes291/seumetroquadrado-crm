import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
  mesclarFiltrosDaUrl,
  filtrosParaSearch,
  searchParaFiltros,
  temFiltrosNaUrl,
  type LeadFiltros,
  type LeadSearchFiltros,
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
  Ban,
  Bookmark,
  ChevronDown,
  CalendarClock,
  Crosshair,
  LayoutGrid,
  RefreshCw,
  Rows3,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Shuffle,
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
  MOTIVO_PERDA_CATEGORIAS,
  MOTIVO_PERDA_LABEL,
  PROXIMA_ACAO,
  leadStatusLabel,
  resolveStageAction,
  type LeadStatus,
  type MotivoPerdaCategoria,
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
import { LeadRowMenu, IniciarSplitButton } from "@/features/leads/row-actions";
import { rpcLeadsFiltered, rpcLeadsStatusCounts } from "@/features/leads/leads-rpc";
import { useLeadMutations } from "@/features/leads/use-lead-mutations";
import { LeadsTable, FlagChips } from "@/features/leads/leads-table";
import { FocusMode } from "@/features/leads/focus-mode";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { FilterBar } from "@/components/ui/filter-bar";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { EntityCard } from "@/components/ui/entity-card";
import type { SortingState } from "@/components/ui/data-table";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { isTypingTarget } from "@/lib/shortcuts";
import { origemLabel } from "@/lib/origem";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads — Seu Metro Quadrado" }] }),
  // Drill-through universal: todo filtro server-side da leads_filtered pode
  // chegar pela URL (telas de gestão linkam para cá). URL vence localStorage.
  // A página também ESCREVE os filtros/página na URL (replace) — a visão
  // corrente vira link compartilhável e sobrevive ao voltar do detalhe.
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: "lista" | "kanban"; pagina?: number } & LeadSearchFiltros => ({
    view: search.view === "kanban" ? "kanban" : undefined,
    pagina:
      typeof search.pagina === "number" && Number.isFinite(search.pagina) && search.pagina > 1
        ? Math.floor(search.pagina)
        : undefined,
    ...searchParaFiltros(search),
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
  const searchParams = Route.useSearch();
  const { view } = searchParams;
  const statusParam = searchParams.status;
  // Filtros vindos da URL (drill-through das telas de gestão).
  const urlFiltros = useMemo(
    () => searchParaFiltros(searchParams as Record<string, unknown>),
    [searchParams],
  );
  const navigate = Route.useNavigate();
  const activeView: "lista" | "kanban" = view ?? "lista";
  const setView = (v: "lista" | "kanban") =>
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        view: v === "kanban" ? "kanban" : undefined,
      }),
    });
  // Aceita qualquer status conhecido (não só os do funil) — o drill-through e
  // os chips dinâmicos cobrem também novo/qualificado/proposta_enviada/etc.
  const statusParamValido =
    statusParam && statusParam in LEAD_STATUS_LABEL ? statusParam : undefined;
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
  // Página inicial pode vir da URL (?pagina=N) — voltar do detalhe não reseta.
  const [page, setPage] = useState(searchParams.pagina ?? 1);
  const [viewMode, setViewMode] = useState<"tabela" | "cards">(() => {
    if (typeof window === "undefined") return "tabela";
    const saved = window.localStorage.getItem("smq:leads-view-mode");
    if (saved === "cards" || saved === "tabela") return saved;
    return window.matchMedia("(max-width: 767px)").matches ? "cards" : "tabela";
  });
  const [importOpen, setImportOpen] = useState(false);
  // Sort por coluna da tabela premium (whitelist da RPC v2). Mudar filtros não
  // reseta o sort — a preferência de ordenação sobrevive ao refinamento.
  const [sorting, setSorting] = useState<SortingState>([]);
  // Modo foco: trabalhar a fila filtrada um lead por vez (botão ou atalho F).
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusStart, setFocusStart] = useState<string | undefined>();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<string>("");
  const [bulkFollowupOpen, setBulkFollowupOpen] = useState(false);
  const [bulkFollowupData, setBulkFollowupData] = useState<string>("");
  // Descarte em lote com motivo (higiene do funil).
  const [bulkDescarteOpen, setBulkDescarteOpen] = useState(false);
  const [descarteCategoria, setDescarteCategoria] = useState<MotivoPerdaCategoria | "">("");
  const [descarteDetalhe, setDescarteDetalhe] = useState("");
  // Confirmação padrão das ações em lote (substitui os window.confirm).
  const [confirmState, setConfirmState] = useState<{
    titulo: string;
    descricao?: string;
    acao: () => void;
  } | null>(null);
  // "Selecionar todos os N do filtro" (cap 1000) — busca os ids paginando a RPC.
  const [selecionandoTudo, setSelecionandoTudo] = useState(false);
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

  // Drill-down: filtros da URL viram estado sempre que mudam (chegada de
  // qualquer tela de gestão com ?status=…&corretor=…&periodo=…).
  const urlFiltrosKey = JSON.stringify(urlFiltros);
  useEffect(() => {
    if (Object.keys(urlFiltros).length === 0) return;
    aplicarFiltros(mesclarFiltrosDaUrl(urlFiltros, canManage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFiltrosKey, canManage]);

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
  // Deep-link com filtros na URL VENCE o último filtro salvo — senão o
  // drill-through das telas de gestão abriria a lista errada.
  useEffect(() => {
    if (!user?.id || filtrosRestauradosRef.current) return;
    filtrosRestauradosRef.current = true;
    setSavedViews(loadViews(user.id));
    if (temFiltrosNaUrl(searchParams as Record<string, unknown>)) return;
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

  // Filtros/página → URL (replace, sem sujar o histórico): a visão corrente
  // vira link compartilhável ("olha essa fila") e voltar do detalhe do lead
  // restaura filtros E página. Idempotente com o efeito de drill-through:
  // reaplicar os mesmos valores não muda estado.
  useEffect(() => {
    if (!filtrosRestauradosRef.current) return;
    navigate({
      replace: true,
      search: (prev: Record<string, unknown>) => ({
        view: prev.view === "kanban" ? ("kanban" as const) : undefined,
        ...(page > 1 ? { pagina: page } : {}),
        ...filtrosParaSearch(filtrosAtuais),
      }),
    });
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
    page,
  ]);

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
  // SEM page de propósito: as contagens e a fila do foco reusam esta key e não
  // dependem da página (antes cada troca de página refazia os counts à toa).
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
  };

  const periodoRange = useMemo(() => {
    if (periodoFilter === "custom") {
      return {
        start: customDateStart(dataInicioFilter),
        end: customDateEnd(dataFimFilter),
      };
    }
    return { start: periodoStart(periodoFilter), end: periodoEnd(periodoFilter) };
  }, [periodoFilter, dataInicioFilter, dataFimFilter]);

  // Parâmetros compartilhados entre a query principal, os counts e a fila do
  // modo foco — uma única montagem para os três consumidores.
  const buildParams = () => {
    const sNorm = debouncedSearch ? normalizeSearch(debouncedSearch).replace(/[%,]/g, "") : "";
    const sDig = debouncedSearch ? onlyDigits(debouncedSearch) : "";
    return {
      _na_lixeira: showLixeira,
      _status: statusFilter,
      _origem: origemFilter,
      _corretor: corretorFilter,
      _temperatura: temperaturaFilter,
      _periodo_start: periodoRange.start ? periodoRange.start.toISOString() : undefined,
      _periodo_end: periodoRange.end ? periodoRange.end.toISOString() : undefined,
      _search: sNorm,
      _search_digits: sDig,
    };
  };

  type LeadsSource = "v3" | "v2" | "v1";

  const {
    data: leadsResult,
    isLoading,
    isError: leadsError,
    refetch: refetchLeads,
  } = useQuery({
    queryKey: ["leads", baseQueryKey, statusFilter, sorting, page],
    queryFn: async (): Promise<{ rows: Lead[]; source: LeadsSource }> => {
      const paramsV1 = buildParams();
      const paramsPaginados = {
        ...paramsV1,
        _contato: contatoFilter,
        _sort: sorting[0]?.id ?? null,
        _sort_dir: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : null,
        _limit: LEADS_PAGE_SIZE,
        _offset: (page - 1) * LEADS_PAGE_SIZE,
      };
      return rpcWithFallback<{ rows: Lead[]; source: LeadsSource }>(
        // v3: tudo da v2 + score de prioridade e proximo_followup por linha,
        // sort por score, recorte sem_contato_30d e escopo de gestor com órfãos.
        async () => ({
          rows: await rpcLeadsFiltered("v3", paramsPaginados),
          source: "v3" as const,
        }),
        () =>
          rpcWithFallback<{ rows: Lead[]; source: LeadsSource }>(
            // v2 (P2-15): contato, sort e paginação 100% no servidor — sempre
            // uma página de LEADS_PAGE_SIZE, mesmo com filtro de contato ativo.
            async () => ({
              rows: await rpcLeadsFiltered("v2", paramsPaginados),
              source: "v2" as const,
            }),
            // v1 (fallback enquanto a migration não está aplicada): filtros de
            // contato ainda dependem do conjunto completo — baixa até 1000 linhas
            // e fatia no cliente; os demais paginam no banco.
            async () => {
              const v1ServerPaginated = contatoFilter === "all";
              const { data, error } = await supabase.rpc("leads_filtered", {
                ...paramsV1,
                _limit: v1ServerPaginated ? LEADS_PAGE_SIZE : 1000,
                _offset: v1ServerPaginated ? (page - 1) * LEADS_PAGE_SIZE : 0,
              });
              if (error) throw error;
              // O Row gerado da RPC é atribuível a Lead (campos `T` vs `T | null`)
              // — dispensa o antigo double-cast via unknown.
              return { rows: data ?? [], source: "v1" as const };
            },
          ),
      );
    },
    enabled: canManage || !!user?.id,
  });

  const leadsAll = leadsResult?.rows;
  const source: LeadsSource = leadsResult?.source ?? "v3";
  // Com v2/v3 a paginação é sempre no servidor; no fallback v1 só quando não
  // há filtro de contato (que ainda fatia no cliente).
  const serverPaginated = source !== "v1" ? true : contatoFilter === "all";

  // IDs de leads com follow-up pendente — só no fallback v1 (a v2 resolve o
  // recorte "com_followup" no próprio servidor e devolve `tem_followup`).
  const {
    data: followupIds,
    isLoading: followupLoading,
    isError: followupError,
    refetch: refetchFollowups,
  } = useQuery({
    queryKey: ["followup-lead-ids", user?.id, canManage],
    enabled: contatoFilter === "com_followup" && source === "v1",
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

  // Corretor só precisa acordar com mudanças da própria carteira; gestor/admin
  // veem tudo, então não filtram. O debounce do hook coalesce rajadas.
  //
  // PERF: sem filtro (gestão) o canal recebe TODA mudança de lead/venda da
  // empresa — com o intake automático rodando, isso é um fluxo contínuo. Cada
  // invalidação refaz duas RPCs que varrem a base inteira (leads_filtered_v3 +
  // leads_status_counts_v3), então a janela de coalescing precisa ser bem
  // maior nesse caso: 8s de atraso na lista custa muito menos que a tela
  // travada em refetch permanente.
  useRealtimeInvalidate(["leads", "vendas"], [["leads"], ["leads-status-counts"]], {
    filter: !canManage && user?.id ? `corretor_id=eq.${user.id}` : undefined,
    debounceMs: canManage ? 8_000 : 1_500,
  });

  // Contagens reais por status — respeita filtros e usa data_assinatura para Venda.
  const {
    data: statusCountsData,
    isError: statusCountsError,
    refetch: refetchStatusCounts,
  } = useQuery({
    queryKey: ["leads-status-counts", baseQueryKey],
    queryFn: async () => {
      const { _status: _ignorado, ...countParams } = buildParams();
      void _ignorado;
      const rows = await rpcWithFallback<unknown[]>(
        // v3: mesmo escopo da lista (gestor vê órfãos) + recorte sem_contato_30d.
        () => rpcLeadsStatusCounts("v3", { ...countParams, _contato: contatoFilter }),
        () =>
          rpcWithFallback<unknown[]>(
            // v2: as abas de status contam respeitando também o recorte de contato.
            () => rpcLeadsStatusCounts("v2", { ...countParams, _contato: contatoFilter }),
            async () => {
              const { data, error } = await supabase.rpc("leads_status_counts", countParams);
              if (error) throw error;
              return data ?? [];
            },
          ),
      );
      const counts: Record<string, number> = {};
      let total = 0;
      (rows as Array<{ status: string; quantidade: number }>).forEach((row) => {
        if (row.status === "__total__") total = Number(row.quantidade);
        else counts[row.status] = Number(row.quantidade);
      });
      return { total, counts };
    },
    enabled: canManage || !!user?.id,
  });

  // useMemo para o memo dos chips dinâmicos não recalcular a cada render.
  const statusCounts = useMemo(() => statusCountsData?.counts ?? {}, [statusCountsData]);
  const leadQueryTotal = Number(leadsAll?.[0]?.total_count ?? leadsAll?.length ?? 0);
  const totalLeadsCount = statusCountsData?.total ?? leadQueryTotal;
  const followupFilterFailed = contatoFilter === "com_followup" && followupError;
  const listError = leadsError || statusCountsError || followupFilterFailed;
  const listLoading = isLoading || (contatoFilter === "com_followup" && followupLoading);

  const filtered = useMemo(() => {
    if (!leadsAll) return [];
    // v2/v3: o servidor já aplicou o recorte de contato e a ordenação (sort de
    // coluna ou prioridade operacional) — a página recebe a lista pronta.
    // Exceção transitória: sem_contato_30d só existe na v3; se o backend ainda
    // está na v2, filtra a página localmente (total fica aproximado até a
    // migration v3 ser aplicada).
    if (source !== "v1") {
      if (source === "v2" && contatoFilter === "sem_contato_30d") {
        return leadsAll.filter((l) =>
          passaContato("sem_contato_30d", {
            ultimaInteracao: l.ultima_interacao,
            status: l.status,
            temFollowup: l.tem_followup ?? false,
          }),
        );
      }
      return leadsAll;
    }
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
  }, [leadsAll, source, contatoFilter, followupIds]);

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

  // Limpa a seleção quando o RECORTE muda (filtros/busca/lixeira) — mas não ao
  // trocar de página: a seleção pode atravessar páginas ("selecionar todos os
  // N do filtro") e o antigo prune por linhas visíveis a destruía.
  useEffect(() => {
    setSelectedIds(new Set());
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

  // "Selecionar todos os N do filtro": pagina a RPC (200 por chamada) até o
  // teto de 1000 ids — o suficiente para transferir/descartar uma safra sem
  // 20 repetições de página, sem derrubar o navegador.
  const SELECAO_MAX = 1000;
  const selecionarTodosDoFiltro = async () => {
    setSelecionandoTudo(true);
    try {
      const paramsV1 = buildParams();
      const ids: string[] = [];
      for (let offset = 0; offset < SELECAO_MAX; offset += 200) {
        const paramsPagina = {
          ...paramsV1,
          _contato: contatoFilter,
          _sort: null,
          _sort_dir: null,
          _limit: 200,
          _offset: offset,
        };
        const rows = await rpcWithFallback<Lead[]>(
          () => rpcLeadsFiltered("v3", paramsPagina),
          () => rpcLeadsFiltered("v2", paramsPagina),
        );
        ids.push(...rows.map((l) => l.id));
        if (rows.length < 200) break;
      }
      setSelectedIds(new Set(ids));
      if (visibleTotal > SELECAO_MAX) {
        toast.info(
          `Selecionados os primeiros ${SELECAO_MAX.toLocaleString("pt-BR")} leads do filtro — refine o recorte para cobrir o restante.`,
        );
      }
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível selecionar todos os leads.");
    } finally {
      setSelecionandoTudo(false);
    }
  };

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
    bulkDescartar,
    bulkRoleta,
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

  // Próxima ação sugerida da etapa: abre modal, fluxo de perda ou transiciona
  // direto — mesma regra usada pela linha da tabela, pelos cards e pelo peek.
  const executarProximaAcao = (l: Lead) => {
    const acao = PROXIMA_ACAO[l.status as LeadStatus];
    if (!acao) return;
    const action = resolveStageAction(acao.target);
    if (action.kind === "modal") setModalState({ modal: action.modal, lead: l });
    else if (action.kind === "perdido") setPerdidoLead(l);
    else updateStatus.mutate({ id: l.id, status: acao.target });
  };

  // Fila do modo foco = o RECORTE inteiro (até 200 ids na ordem operacional),
  // não só a página de 50 — sem isso o "trabalhar a fila" acabava no lead 50.
  const { data: focusIdsData } = useQuery({
    queryKey: ["leads-focus-ids", baseQueryKey, statusFilter],
    enabled: focusOpen && source !== "v1",
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const paramsFila = {
        ...buildParams(),
        _contato: contatoFilter,
        _sort: null,
        _sort_dir: null,
        _limit: 200,
        _offset: 0,
      };
      const rows = await rpcWithFallback<Lead[]>(
        () => rpcLeadsFiltered("v3", paramsFila),
        () => rpcLeadsFiltered("v2", paramsFila),
      );
      return rows.map((l) => l.id);
    },
  });
  const focusQueue = useMemo(() => {
    const ids = focusIdsData ?? filtered.map((l) => l.id);
    // "Focar a partir daqui" num lead fora da 1ª leva (ex.: página 5): garante
    // o lead clicado na fila, na frente.
    if (focusStart && !ids.includes(focusStart)) return [focusStart, ...ids];
    return ids;
  }, [focusIdsData, filtered, focusStart]);

  // Atalho F abre o modo foco com a fila filtrada atual (só na view lista,
  // nunca digitando em campo de texto).
  useEffect(() => {
    if (activeView !== "lista") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFocusStart(undefined);
        setFocusOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeView]);

  // Chips dinâmicos: status VÁLIDOS do enum porém fora do funil exibido
  // (novo, aguardando_corretor, qualificado, proposta_enviada, pos_venda…).
  // Sem eles, 83% da base só aparecia no "Todos" e a soma dos chips nunca
  // batia com o total (docs/revisao-pagina-leads.md §3.1).
  const statusForaDoFunil = useMemo(() => {
    const funil = new Set<string>(LEAD_STATUS_ORDER);
    const ordem = ["novo", "aguardando_corretor", "qualificado", "proposta_enviada", "pos_venda"];
    return Object.keys(statusCounts)
      .filter((s) => !funil.has(s) && s !== "__total__" && (statusCounts[s] ?? 0) > 0)
      .filter((s) => canManage || s !== "novo")
      .sort((a, b) => {
        const ia = ordem.indexOf(a);
        const ib = ordem.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
      });
  }, [statusCounts, canManage]);

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
        // Kanban herda a busca e o corretor da lista — trocar de visão não
        // descarta mais o recorte que o usuário montou.
        <KanbanBoard
          initialSearch={search || undefined}
          corretorId={canManage && corretorFilter !== "all" ? corretorFilter : undefined}
        />
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
            {/* Status fora do funil com leads (a soma dos chips = "Todos") —
                visual tracejado para diferenciar das etapas de trabalho. */}
            {statusForaDoFunil.map((s) => {
              const n = statusCounts[s] ?? 0;
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(active ? "all" : s)}
                  aria-pressed={active}
                  title="Status fora do funil de trabalho — triagem recomendada"
                  className={`min-h-11 px-3 py-2 rounded-full text-xs font-medium border border-dashed whitespace-nowrap transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {leadStatusLabel(s)} · {n}
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      title="Modo foco (F) — trabalhar a fila um lead por vez"
                      onClick={() => {
                        setFocusStart(undefined);
                        setFocusOpen(true);
                      }}
                    >
                      <Crosshair className="h-4 w-4 mr-1" /> Modo foco
                    </Button>
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
                            {origemLabel(o)}
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
                    setConfirmState({
                      titulo: `Registrar ligação em ${n} lead${n > 1 ? "s" : ""}?`,
                      descricao:
                        "Cria uma interação de ligação (saída) na timeline de cada lead selecionado.",
                      acao: () => bulkRegistrarLigacao.mutate(Array.from(selectedIds)),
                    });
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
                          setConfirmState({
                            titulo: `Marcar ${n} lead${n > 1 ? "s" : ""} como ${opt.label}?`,
                            acao: () =>
                              bulkTemperatura.mutate({
                                ids: Array.from(selectedIds),
                                temp: opt.key,
                              }),
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
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={bulkDescartar.isPending}
                  onClick={() => setBulkDescarteOpen(true)}
                >
                  <Ban className="h-3.5 w-3.5 mr-1" /> Descartar
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkRoleta.isPending}
                    onClick={() => {
                      const n = selectedIds.size;
                      setConfirmState({
                        titulo: `Distribuir ${n} lead${n > 1 ? "s" : ""} pela roleta?`,
                        descricao:
                          "Cada lead passa pela triagem v3 (origem → roleta → corretor apto). Quem a roleta recusar cai na fila de exceções da Distribuição.",
                        acao: () => bulkRoleta.mutate(Array.from(selectedIds)),
                      });
                    }}
                  >
                    <Shuffle className="h-3.5 w-3.5 mr-1" />
                    {bulkRoleta.isPending ? "Distribuindo…" : "Roleta"}
                  </Button>
                )}
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
                        setConfirmState({
                          titulo: `${acao} ${n} lead${n > 1 ? "s" : ""}?`,
                          acao: () =>
                            moverLixeira.mutate({
                              ids: Array.from(selectedIds),
                              lixeira: !showLixeira,
                            }),
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      {showLixeira ? "Restaurar" : "Mover p/ lixeira"}
                    </Button>
                  </>
                )}
              </BulkActionBar>

              {/* Seleção além da página: banner "selecionar todos os N do filtro". */}
              {paginated.length > 0 &&
                paginated.every((l) => selectedIds.has(l.id)) &&
                visibleTotal > paginated.length &&
                selectedIds.size < Math.min(visibleTotal, SELECAO_MAX) && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs">
                    <span>
                      Os {selectedIds.size} desta página estão selecionados — o filtro tem{" "}
                      {visibleTotal.toLocaleString("pt-BR")} lead(s).
                    </span>
                    <Button
                      size="sm"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      disabled={selecionandoTudo}
                      onClick={() => void selecionarTodosDoFiltro()}
                    >
                      {selecionandoTudo
                        ? "Selecionando…"
                        : `Selecionar todos os ${Math.min(visibleTotal, SELECAO_MAX).toLocaleString("pt-BR")} do filtro`}
                    </Button>
                    {visibleTotal > SELECAO_MAX && (
                      <span className="text-muted-foreground">(máx. 1.000 por vez)</span>
                    )}
                  </div>
                )}

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
              ) : viewMode === "tabela" ? (
                // Tabela premium (DataTable): substitui a <Table> manual cujas
                // linhas eram <EntityRow> — a ativação da linha (peek) virou o
                // onRowClick do DataTable, que ignora cliques em controles
                // internos (botões, links, checkboxes).
                <LeadsTable
                  leads={paginated}
                  loading={listLoading}
                  source={source}
                  canManage={canManage}
                  userId={user?.id}
                  corretoresMap={corretoresMap}
                  transferTimeouts={transferTimeouts}
                  transferInfoMap={transferInfoMap}
                  lastContactType={lastContactType}
                  iniciarPending={iniciarAtendimento.isPending}
                  proximaAcaoPending={updateStatus.isPending}
                  selected={selectedIds}
                  onSelectedChange={setSelectedIds}
                  sorting={sorting}
                  onSortingChange={setSorting}
                  pagination={
                    visibleTotal > LEADS_PAGE_SIZE
                      ? {
                          page: pageSafe,
                          pageSize: LEADS_PAGE_SIZE,
                          total: visibleTotal,
                          onPageChange: setPage,
                        }
                      : undefined
                  }
                  onRowClick={setPeekLead}
                  onWhatsApp={abrirWhatsApp}
                  onIniciar={iniciarComTipo}
                  onEscolherContato={setContactLead}
                  onProximaAcao={executarProximaAcao}
                  onPickDirect={(l, target) => updateStatus.mutate({ id: l.id, status: target })}
                  onPickModal={(l, modal) => setModalState({ modal, lead: l })}
                  onPickPerdido={setPerdidoLead}
                  onRoleta={(l) => distribuir.mutate(l.id)}
                  onTransferir={(l) => {
                    setSelectedIds(new Set([l.id]));
                    setBulkTransferOpen(true);
                  }}
                  onLixeira={(l) =>
                    moverLixeira.mutate({ ids: [l.id], lixeira: !l.na_lixeira, nome: l.nome })
                  }
                  onSetTemperatura={(l, temp) => bulkTemperatura.mutate({ ids: [l.id], temp })}
                  onFocar={(l) => {
                    setFocusStart(l.id);
                    setFocusOpen(true);
                  }}
                  onFollowup={(l) => {
                    setSelectedIds(new Set([l.id]));
                    setBulkFollowupOpen(true);
                  }}
                />
              ) : listLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="stagger-children grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                          {/* Temperatura clicável: requalifica sem abrir o lead. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Mudar temperatura de ${l.nome}`}
                                title="Mudar temperatura"
                              >
                                <TemperatureChip
                                  temperatura={l.temperatura}
                                  size="sm"
                                  pulse={false}
                                />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {(
                                [
                                  { key: "quente", label: "🔥 Quente" },
                                  { key: "morno", label: "🌡️ Morno" },
                                  { key: "frio", label: "❄️ Frio" },
                                ] as const
                              ).map((opt) => (
                                <DropdownMenuItem
                                  key={opt.key}
                                  disabled={l.temperatura === opt.key}
                                  onSelect={() =>
                                    bulkTemperatura.mutate({ ids: [l.id], temp: opt.key })
                                  }
                                >
                                  {opt.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                        <FlagChips lead={l} />
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
                          {l.projeto_nome || "Sem empreendimento"} · {origemLabel(l.origem)}
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
                              moverLixeira.mutate({
                                ids: [l.id],
                                lixeira: !l.na_lixeira,
                                nome: l.nome,
                              })
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

              {/* Paginação (50 por página) — a view tabela pagina dentro do
                  DataTable; este rodapé atende só a view cards. */}
              {viewMode === "cards" && visibleTotal > LEADS_PAGE_SIZE && (
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

          {/* Modo foco — fila = recorte inteiro (até 200), navegada com J/K */}
          <FocusMode
            leadIds={focusQueue}
            startId={focusStart}
            open={focusOpen}
            onOpenChange={setFocusOpen}
            origem="leads"
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

          {/* Descartar em lote com motivo — higiene do funil sem redistribuição. */}
          <Dialog
            open={bulkDescarteOpen}
            onOpenChange={(o) => {
              setBulkDescarteOpen(o);
              if (!o) {
                setDescarteCategoria("");
                setDescarteDetalhe("");
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Descartar {selectedIds.size} lead(s)</DialogTitle>
                <DialogDescription>
                  Todos os selecionados serão marcados como perdidos com o motivo abaixo — sem
                  redistribuição pela roleta. Um lead perdido pode ser reativado pela gestão.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Motivo da perda *</Label>
                  <Select
                    value={descarteCategoria}
                    onValueChange={(v) => setDescarteCategoria(v as MotivoPerdaCategoria)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o motivo…" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOTIVO_PERDA_CATEGORIAS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {MOTIVO_PERDA_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {descarteCategoria === "outro"
                      ? "Descreva o motivo *"
                      : "Observação (opcional)"}
                  </Label>
                  <Textarea
                    rows={3}
                    value={descarteDetalhe}
                    onChange={(e) => setDescarteDetalhe(e.target.value)}
                    placeholder="Contexto adicional sobre o descarte…"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setBulkDescarteOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={
                    bulkDescartar.isPending ||
                    !descarteCategoria ||
                    (descarteCategoria === "outro" && !descarteDetalhe.trim())
                  }
                  onClick={() =>
                    bulkDescartar.mutate(
                      {
                        ids: Array.from(selectedIds),
                        categoria: descarteCategoria,
                        detalhe: descarteDetalhe,
                      },
                      { onSuccess: () => setBulkDescarteOpen(false) },
                    )
                  }
                >
                  {bulkDescartar.isPending ? "Descartando…" : "Descartar leads"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Confirmação padrão das ações em lote (substitui window.confirm). */}
          <AlertDialog open={!!confirmState} onOpenChange={(o) => !o && setConfirmState(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmState?.titulo}</AlertDialogTitle>
                {confirmState?.descricao && (
                  <AlertDialogDescription>{confirmState.descricao}</AlertDialogDescription>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    confirmState?.acao();
                    setConfirmState(null);
                  }}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
