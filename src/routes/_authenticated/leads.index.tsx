import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  UserPlus,
  Search,
  Trash2,
  Shuffle,
  Trello,
  Upload,
  Play,
  MessageCircle,
  Phone,
  PhoneCall,
  DollarSign,
  Flame,
  Thermometer,
  Snowflake,
  AlertCircle,
  ArrowRightLeft,
  X,
} from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/templates";
import { ImportLeadsDialog } from "@/components/import-leads-dialog";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { isValidBrazilPhone, isValidEmail } from "@/lib/validators";
import {
  LEAD_STATUS_ORDER,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_BADGE_TONE,
  leadStatusLabel,
  type LeadStatus,
} from "@/lib/leads";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads — Seu Metro Quadrado" }] }),
  component: LeadsPage,
});

const ORIGEM_OPTIONS = [
  "facebook",
  "google_sheets",
  "site",
  "indicacao",
  "captacao_corretor",
  "whatsapp",
  "telefone",
  "plantao",
  "agendamento_self_service",
  "chatbot",
  "outro",
] as const;

const PERIODO_OPTIONS = [
  { value: "all", label: "Qualquer período" },
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
] as const;

type Periodo = (typeof PERIODO_OPTIONS)[number]["value"];

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

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  origem: string;
  status: string;
  temperatura: string | null;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  observacoes: string | null;
  created_at: string;
  ultima_interacao: string | null;
  na_lixeira: boolean;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
};

function TempIcon({ temp }: { temp: string | null }) {
  if (temp === "quente")
    return <Flame className="h-3.5 w-3.5 text-red-500" aria-label="Quente" />;
  if (temp === "morno")
    return <Thermometer className="h-3.5 w-3.5 text-amber-500" aria-label="Morno" />;
  if (temp === "frio")
    return <Snowflake className="h-3.5 w-3.5 text-sky-500" aria-label="Frio" />;
  return null;
}

function InatividadeBadge({ lead }: { lead: Lead }) {
  const ativo = !["contrato_fechado", "perdido", "pos_venda", "novo"].includes(lead.status);
  if (!ativo) return null;
  const ref = lead.ultima_interacao ?? lead.created_at;
  if (!ref) return null;
  const dias = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  if (dias < 2) return null;
  const tone =
    dias >= 5
      ? "bg-red-500/15 text-red-700 dark:text-red-300"
      : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return (
    <Badge variant="secondary" className={`${tone} gap-1`} title={`Sem interação há ${dias} dias`}>
      <AlertCircle className="h-3 w-3" /> {dias}d parado
    </Badge>
  );
}

function FinRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  );
}

/** Resumo financeiro do lead em um Popover, sem abrir o perfil. */
function FinanceiroPopover({ lead }: { lead: Lead }) {
  const temDados =
    !!(lead.projeto_nome || lead.renda_informada || lead.entrada_disponivel) ||
    lead.usa_fgts != null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Resumo financeiro"
          onClick={(e) => e.stopPropagation()}
        >
          <DollarSign className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 text-sm">
        <div className="font-medium mb-2">Resumo do lead</div>
        <dl className="space-y-1">
          <FinRow label="Empreendimento" value={lead.projeto_nome} />
          <FinRow label="Renda" value={lead.renda_informada} />
          <FinRow label="Entrada" value={lead.entrada_disponivel} />
          <FinRow
            label="FGTS"
            value={lead.usa_fgts == null ? null : lead.usa_fgts ? "Sim" : "Não"}
          />
        </dl>
        {!temDados && (
          <div className="mt-2 text-xs text-muted-foreground">Sem dados financeiros ainda.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LeadsPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const { user } = useAuth();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();

  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);
  const updateStatus = useLeadStatusMutation({ invalidateKeys: [["leads"]] });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(
    canManage ? "all" : "aguardando_atendimento",
  );
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [corretorFilter, setCorretorFilter] = useState<string>("all");
  const [temperaturaFilter, setTemperaturaFilter] = useState<string>("all");
  const [periodoFilter, setPeriodoFilter] = useState<Periodo>("all");
  const [showLixeira, setShowLixeira] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<string>("");
  const [contactLead, setContactLead] = useState<Lead | null>(null);

  // Debounce da busca (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

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

  // Query principal — aplica TODOS os filtros menos statusFilter (para os chips funcionarem).
  const baseQueryKey = {
    debouncedSearch,
    origemFilter,
    corretorFilter,
    temperaturaFilter,
    periodoFilter,
    showLixeira,
    canManage,
    uid: user?.id,
  };

  const { data: leadsAll, isLoading } = useQuery({
    queryKey: ["leads", baseQueryKey],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(
          "id, nome, email, telefone, origem, status, temperatura, corretor_id, projeto_id, projeto_nome, observacoes, created_at, ultima_interacao, na_lixeira, renda_informada, entrada_disponivel, usa_fgts",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      q = q.eq("na_lixeira", showLixeira);
      if (origemFilter !== "all") q = q.eq("origem", origemFilter as never);
      if (corretorFilter === "unassigned") q = q.is("corretor_id", null);
      else if (corretorFilter !== "all") q = q.eq("corretor_id", corretorFilter);
      if (temperaturaFilter !== "all") q = q.eq("temperatura", temperaturaFilter as never);
      const start = periodoStart(periodoFilter);
      if (start) q = q.gte("created_at", start.toISOString());
      if (debouncedSearch) {
        const s = debouncedSearch.replace(/[%,]/g, "");
        q = q.or(`nome.ilike.%${s}%,email.ilike.%${s}%,telefone.ilike.%${s}%`);
      }
      if (!canManage) {
        q = q.neq("status", "novo" as never);
        if (user?.id) q = q.eq("corretor_id", user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    enabled: canManage || !!user?.id,
  });

  useRealtimeInvalidate("leads", [["leads"]]);

  // Contagens por status (a partir do conjunto já filtrado, exceto statusFilter).
  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    (leadsAll ?? []).forEach((l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
    });
    return acc;
  }, [leadsAll]);

  const filtered = useMemo(() => {
    if (!leadsAll) return [];
    const base = statusFilter === "all" ? leadsAll : leadsAll.filter((l) => l.status === statusFilter);
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
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [leadsAll, statusFilter, canManage]);

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

  const distribuir = useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.rpc(
        "distribuir_lead" as never,
        { _lead_id: leadId, _tipo: "manual" } as never,
      );
      if (error) throw error;
      return { corretorId: data as string | null, leadId };
    },
    onSuccess: async ({ corretorId, leadId }) => {
      if (!corretorId) {
        toast.error("Nenhum corretor disponível na fila. Ative corretores em Distribuição.");
      } else {
        toast.success("Lead atribuído via roleta");
        await supabase.functions.invoke("notify-lead-transfer", {
          body: { lead_id: leadId, corretor_id: corretorId },
        });
      }
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moverLixeira = useMutation({
    mutationFn: async ({ ids, lixeira }: { ids: string[]; lixeira: boolean }) => {
      const { error } = await supabase
        .from("leads")
        .update({
          na_lixeira: lixeira,
          data_movido_lixeira: lixeira ? new Date().toISOString() : null,
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.lixeira
          ? `${v.ids.length} lead(s) movido(s) para lixeira`
          : `${v.ids.length} lead(s) restaurado(s)`,
      );
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkTransferir = useMutation({
    mutationFn: async ({ ids, corretorId }: { ids: string[]; corretorId: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({
          corretor_id: corretorId,
          data_distribuicao: new Date().toISOString(),
          timestamp_recebimento: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} lead(s) transferido(s)`);
      setSelectedIds(new Set());
      setBulkTransferOpen(false);
      setBulkTarget("");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Registra uma ligação (interação) para todos os leads selecionados de uma vez.
  const bulkRegistrarLigacao = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: u } = await supabase.auth.getUser();
      const autor = u.user?.id ?? null;
      const rows = ids.map((leadId) => ({
        lead_id: leadId,
        autor_id: autor,
        tipo: "ligacao" as const,
        direcao: "saida" as const,
        titulo: "Ligação",
        conteudo: "Ligação registrada em lote pelo corretor.",
      }));
      const { error } = await supabase.from("interacoes").insert(rows as never);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Ligação registrada em ${n} lead(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Iniciar atendimento + registrar interação do tipo de contato escolhido
  const iniciarAtendimento = useMutation({
    mutationFn: async ({
      lead,
      tipo,
    }: {
      lead: Lead;
      tipo: "ligacao" | "whatsapp";
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error: e1 } = await supabase.from("interacoes").insert({
        lead_id: lead.id,
        autor_id: u.user?.id ?? null,
        tipo,
        direcao: "saida",
        titulo: tipo === "whatsapp" ? "Contato inicial via WhatsApp" : "Contato inicial por ligação",
        conteudo: `Atendimento iniciado pelo corretor (${tipo}).`,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("leads")
        .update({ status: "em_atendimento" as never })
        .eq("id", lead.id);
      if (e2) throw e2;
      return { lead, tipo };
    },
    onSuccess: ({ lead, tipo }) => {
      toast.success("Atendimento iniciado");
      if (tipo === "whatsapp") {
        const primeiroNome = lead.nome.split(" ")[0] ?? lead.nome;
        const projeto = lead.projeto_nome ? ` sobre o ${lead.projeto_nome}` : "";
        const msg = `Olá, ${primeiroNome}! Aqui é da Seu Metro Quadrado${projeto}. Recebemos seu contato e gostaríamos de te ajudar. Posso te chamar agora?`;
        window.open(buildWhatsAppUrl(lead.telefone, msg), "_blank", "noopener,noreferrer");
      }
      setContactLead(null);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeFiltersCount =
    (statusFilter !== "all" && statusFilter !== "aguardando_atendimento" ? 1 : 0) +
    (origemFilter !== "all" ? 1 : 0) +
    (corretorFilter !== "all" ? 1 : 0) +
    (temperaturaFilter !== "all" ? 1 : 0) +
    (periodoFilter !== "all" ? 1 : 0) +
    (debouncedSearch ? 1 : 0);

  function limparFiltros() {
    setSearch("");
    setStatusFilter(canManage ? "all" : "aguardando_atendimento");
    setOrigemFilter("all");
    setCorretorFilter("all");
    setTemperaturaFilter("all");
    setPeriodoFilter("all");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Funil de leads, distribuição e qualificação."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/kanban">
                <Trello className="h-4 w-4 mr-1" /> Kanban
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
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-1" /> Novo lead
                </Button>
              </DialogTrigger>
              <NovoLeadDialog
                onClose={() => setCreateOpen(false)}
                canManage={canManage}
                currentUserId={user?.id ?? null}
              />
            </Dialog>
          </div>
        }
      />

      {/* Chips de status com contagem */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
            statusFilter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted"
          }`}
        >
          Todos · {leadsAll?.length ?? 0}
        </button>
        {LEAD_STATUS_ORDER.filter((s) => canManage || s !== "novo").map((s) => {
          const n = statusCounts[s] ?? 0;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(active ? "all" : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
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

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, email ou telefone…"
                className="pl-9"
              />
            </div>
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
            <Select value={periodoFilter} onValueChange={(v) => setPeriodoFilter(v as Periodo)}>
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
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {isLoading ? "Carregando…" : `${filtered.length} lead(s)`}
              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-7"
                  onClick={limparFiltros}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros ({activeFiltersCount})
                </Button>
              )}
            </div>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => setShowLixeira(!showLixeira)}>
                {showLixeira ? "Ver ativos" : "Ver lixeira"}
              </Button>
            )}
          </div>

          {/* Barra de ações em lote */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 p-2">
              <div className="text-sm font-medium">{selectedIds.size} selecionado(s)</div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkRegistrarLigacao.isPending}
                  onClick={() => bulkRegistrarLigacao.mutate(Array.from(selectedIds))}
                >
                  <PhoneCall className="h-3.5 w-3.5 mr-1" /> Registrar ligação
                </Button>
                {canManage && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setBulkTransferOpen(true)}>
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        moverLixeira.mutate({
                          ids: Array.from(selectedIds),
                          lixeira: !showLixeira,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      {showLixeira ? "Restaurar" : "Mover p/ lixeira"}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Limpar
                </Button>
              </div>
            </div>
          )}

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
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-10"
                    >
                      Nenhum lead encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((l) => (
                  <TableRow key={l.id} data-state={selectedIds.has(l.id) ? "selected" : undefined}>
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
                        <div className="text-xs text-muted-foreground">{l.projeto_nome}</div>
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
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                            title="Abrir WhatsApp com mensagem pronta"
                            onClick={(e) => {
                              e.stopPropagation();
                              const primeiroNome = l.nome.split(" ")[0] ?? l.nome;
                              const projeto = l.projeto_nome ? ` sobre o ${l.projeto_nome}` : "";
                              const msg = `Olá, ${primeiroNome}! Aqui é da Seu Metro Quadrado${projeto}. Recebemos seu contato e gostaríamos de te ajudar. Posso te chamar agora?`;
                              window.open(
                                buildWhatsAppUrl(l.telefone, msg),
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-sky-600 hover:text-sky-700 hover:bg-sky-500/10"
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
                      <Badge
                        className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                        variant="secondary"
                      >
                        {leadStatusLabel(l.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.corretor_id ? (
                        (corretoresMap.get(l.corretor_id) ?? "—")
                      ) : (
                        <span className="text-muted-foreground italic">sem corretor</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!l.na_lixeira &&
                          l.status === "aguardando_atendimento" &&
                          (canManage || l.corretor_id === user?.id) && (
                            <Button
                              size="sm"
                              onClick={() => setContactLead(l)}
                              disabled={iniciarAtendimento.isPending}
                            >
                              <Play className="h-3.5 w-3.5 mr-1" /> Iniciar atendimento
                            </Button>
                          )}
                        {!l.na_lixeira &&
                          (canManage || l.corretor_id === user?.id) &&
                          l.status !== "aguardando_atendimento" && (
                            <LeadStageMenu
                              lead={l}
                              onPickDirect={(target) =>
                                updateStatus.mutate({ id: l.id, status: target })
                              }
                              onPickModal={(modal) => setModalState({ modal, lead: l })}
                              onPickPerdido={() => setPerdidoLead(l)}
                            />
                          )}
                        {canManage && !l.corretor_id && !l.na_lixeira && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => distribuir.mutate(l.id)}
                            disabled={distribuir.isPending}
                          >
                            <Shuffle className="h-3.5 w-3.5 mr-1" /> Roleta
                          </Button>
                        )}
                        {canManage && !l.na_lixeira && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Transferir"
                            onClick={() => {
                              setSelectedIds(new Set([l.id]));
                              setBulkTransferOpen(true);
                            }}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              moverLixeira.mutate({ ids: [l.id], lixeira: !l.na_lixeira })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
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
              <Phone className="h-10 w-10 text-sky-500" />
              <span className="font-medium">Ligação</span>
            </button>
            <button
              type="button"
              onClick={() =>
                contactLead && iniciarAtendimento.mutate({ lead: contactLead, tipo: "whatsapp" })
              }
              disabled={iniciarAtendimento.isPending}
              className="flex flex-col items-center gap-2 rounded-lg border p-6 hover:bg-muted transition disabled:opacity-50"
            >
              <MessageCircle className="h-10 w-10 text-emerald-500" />
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
    </div>
  );
}


function NovoLeadDialog({
  onClose,
  canManage,
  currentUserId,
}: {
  onClose: () => void;
  canManage: boolean;
  currentUserId: string | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    origem: canManage ? "outro" : "captacao_corretor",
    projeto_nome: "",
    observacoes: "",
  });
  const [distribuirAuto, setDistribuirAuto] = useState(true);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim() || !form.telefone.trim()) {
        throw new Error("Nome e telefone são obrigatórios");
      }
      if (!isValidBrazilPhone(form.telefone)) {
        throw new Error("Telefone inválido. Informe DDD + número (ex.: 11 91234-5678).");
      }
      if (form.email.trim() && !isValidEmail(form.email)) {
        throw new Error("E-mail inválido.");
      }

      // Checagem de duplicidade por telefone (somente dígitos) e/ou e-mail
      const telDigits = form.telefone.replace(/\D/g, "");
      const emailNorm = form.email.trim().toLowerCase();
      const orFilters: string[] = [];
      if (telDigits) orFilters.push(`telefone.ilike.%${telDigits.slice(-10)}%`);
      if (emailNorm) orFilters.push(`email.ilike.${emailNorm}`);
      if (orFilters.length > 0) {
        const { data: dup, error: dupErr } = await supabase
          .from("leads")
          .select("id, nome, telefone, email, na_lixeira")
          .or(orFilters.join(","))
          .limit(1);
        if (dupErr) throw dupErr;
        if (dup && dup.length > 0) {
          const d = dup[0];
          throw new Error(
            `Lead duplicado: já existe "${d.nome}" (${d.telefone}${d.email ? " / " + d.email : ""}).`,
          );
        }
      }

      const insertPayload: Record<string, unknown> = {
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: emailNorm || null,
        origem: form.origem as never,
        projeto_nome: form.projeto_nome.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      // Corretor: atribui automaticamente a si mesmo e já entra como "aguardando atendimento"
      if (!canManage && currentUserId) {
        insertPayload.corretor_id = currentUserId;
        insertPayload.status = "aguardando_atendimento";
      }

      const { data, error } = await supabase
        .from("leads")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (error) throw error;

      if (canManage && distribuirAuto && data?.id) {
        const { data: corretor } = await supabase.rpc(
          "distribuir_lead" as never,
          {
            _lead_id: data.id,
            _tipo: "inicial",
          } as never,
        );
        return { id: data.id, corretor, selfAssigned: false };
      }
      return { id: data!.id, corretor: null, selfAssigned: !canManage };
    },
    onSuccess: (r) => {
      toast.success(
        r.selfAssigned
          ? "Lead criado e atribuído a você"
          : r.corretor
            ? "Lead criado e atribuído"
            : canManage && distribuirAuto
              ? "Lead criado (nenhum corretor disponível na fila)"
              : "Lead criado",
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo lead</DialogTitle>
        <DialogDescription>Adicione um lead manualmente.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome *</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefone *</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Origem</Label>
            <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGEM_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Projeto de interesse</Label>
            <Input
              value={form.projeto_nome}
              onChange={(e) => setForm({ ...form, projeto_nome: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea
            rows={3}
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        {canManage ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={distribuirAuto}
              onChange={(e) => setDistribuirAuto(e.target.checked)}
            />
            Distribuir automaticamente via roleta
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Este lead será atribuído automaticamente a você.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Salvando…" : "Criar lead"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
