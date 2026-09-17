import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowsLeftRight,
  MagnifyingGlass,
  Trophy,
  UserCheck,
  UserMinus,
  UsersThree,
} from "@phosphor-icons/react";
import {
  SEM_DONO,
  excedente,
  filtrarPorEscopo,
  indexarPorCorretor,
  pctParada,
  prazosDaCasa,
  semPassoVivo,
  textoTratativa,
  tomDaCarteira,
  useCarteiraStats,
  type CarteiraStats,
  type EscopoCarteira,
} from "@/features/gestao/carteira-stats";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_BADGE_TONE,
  leadStatusLabel,
  type LeadStatus,
} from "@/lib/leads";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { notificarTransferenciaEmLote } from "@/lib/notificar-transferencia";

type Corretor = { id: string; nome: string; ativo: boolean };
type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  status: string;
  corretor_id: string | null;
  created_at: string;
  // Relógio da higiene: é o que separa "em tratativa" de "parado" na lista,
  // com os mesmos campos que a RPC usa para contar.
  ultima_interacao: string | null;
  ultimo_contato: string | null;
};

type Stats = {
  total: number;
  emAtendimento: number;
  aguardando: number;
  ganhos: number;
  perdidos: number;
};

/** Linha da RPC leads_stats_por_corretor (agregação server-side da base inteira). */
type StatsRow = {
  corretor_id: string | null;
  total: number;
  em_atendimento: number;
  aguardando: number;
  ganhos: number;
  perdidos: number;
};

/** Limite de leads baixados para a LISTAGEM (a agregação dos cards é no servidor). */
const LIMITE_LEADS = 2000;

const LEAD_COLUNAS =
  "id, nome, email, telefone, status, corretor_id, created_at, ultima_interacao, ultimo_contato";

const ESCOPO_LABEL: Record<EscopoCarteira, string> = {
  tratativa: "Em tratativa",
  parados: "Parados",
  todos: "Todos",
};

export function LeadsPorCorretorPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();

  const [selectedCorretor, setSelectedCorretor] = useState<string | "unassigned" | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // A lista abre no que está em tratativa. Sem isso ela é dominada por
  // "Aguardando Atendimento" — prospecção, que tem tela própria.
  const [escopo, setEscopo] = useState<EscopoCarteira>("tratativa");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetCorretor, setTargetCorretor] = useState<string>("");

  const { data: corretores } = useQuery({
    queryKey: ["corretores-min-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Corretor[];
    },
  });

  // Contagens dos cards: agregação SERVER-SIDE da base inteira (bug antigo: a
  // tela somava só os 2.000 mais recentes e os cards apareciam zerados). O
  // fallback devolve null e os cards caem na agregação antiga enquanto a
  // migration da RPC não está aplicada.
  const { data: statsRows } = useQuery({
    queryKey: ["leads-stats-corretor"],
    queryFn: async () =>
      rpcWithFallback<StatsRow[] | null>(
        async () => {
          const { data, error } = await supabase.rpc("leads_stats_por_corretor" as never);
          if (error) throw error;
          return (data ?? []) as StatsRow[];
        },
        () => null,
      ),
  });
  const statsDoServidor = statsRows != null;

  // A leitura nova: carteira separada em tratativa / prospecção / parada.
  // `aguardando` sozinho são 6.186 leads na casa e domina a tela inteira —
  // mas ele mistura topo de funil com abandono, que são conversas diferentes.
  const { data: carteiraRows } = useCarteiraStats();
  const carteiraPorCorretor = useMemo(() => indexarPorCorretor(carteiraRows ?? []), [carteiraRows]);
  const prospeccaoDaCasa = useMemo(
    () => (carteiraRows ?? []).reduce((soma, r) => soma + r.prospeccao, 0),
    [carteiraRows],
  );
  // Os prazos vêm da RPC (que os lê de distribuicao_settings). Sem eles não
  // há como classificar a lista sem chutar um prazo, então o filtro some e a
  // tela volta a mostrar tudo — comportamento antigo, nunca um recorte errado.
  const prazos = useMemo(() => prazosDaCasa(carteiraRows ?? []), [carteiraRows]);
  const escopoEfetivo: EscopoCarteira = prazos ? escopo : "todos";

  const {
    data: leads,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["leads-por-corretor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(LEAD_COLUNAS)
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(LIMITE_LEADS);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
  const truncado = (leads?.length ?? 0) >= LIMITE_LEADS;

  // Listagem por corretor: com um card selecionado, os leads DELE vêm do
  // servidor — antes a tabela filtrava o recorte dos 2.000 recentes e uma
  // carteira antiga aparecia vazia.
  const { data: leadsDoCorretor, isLoading: loadingDoCorretor } = useQuery({
    queryKey: ["leads-do-corretor", selectedCorretor],
    enabled: !!selectedCorretor,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(LEAD_COLUNAS)
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(LIMITE_LEADS);
      q =
        selectedCorretor === "unassigned"
          ? q.is("corretor_id", null)
          : q.eq("corretor_id", selectedCorretor as string);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  // Churn de redistribuição automática dos últimos 7 dias, por corretor — para
  // o gestor VER quando uma carteira está sendo movida pelo job de parados.
  const { data: redistLog } = useQuery({
    queryKey: ["redistribuicoes-7d"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("distribution_log")
        .select("corretor_id")
        .eq("tipo", "redistribuicao")
        .gte("created_at", desde);
      if (error) throw error;
      return (data ?? []) as { corretor_id: string | null }[];
    },
  });
  const redistMap = useMemo(() => {
    const m = new Map<string, number>();
    (redistLog ?? []).forEach((r) => {
      if (r.corretor_id) m.set(r.corretor_id, (m.get(r.corretor_id) ?? 0) + 1);
    });
    return m;
  }, [redistLog]);

  const statsByCorretor = useMemo(() => {
    const map = new Map<string, Stats>();
    // Caminho canônico: contagens da RPC (base inteira, escopo por papel).
    if (statsRows) {
      statsRows.forEach((r) => {
        map.set(r.corretor_id ?? "__unassigned__", {
          total: Number(r.total),
          emAtendimento: Number(r.em_atendimento),
          aguardando: Number(r.aguardando),
          ganhos: Number(r.ganhos),
          perdidos: Number(r.perdidos),
        });
      });
      return map;
    }
    // Fallback (RPC ausente): agregação antiga sobre os 2.000 mais recentes.
    (leads ?? []).forEach((l) => {
      const key = l.corretor_id ?? "__unassigned__";
      const s = map.get(key) ?? {
        total: 0,
        emAtendimento: 0,
        aguardando: 0,
        ganhos: 0,
        perdidos: 0,
      };
      s.total++;
      if (l.status === "em_atendimento") s.emAtendimento++;
      if (l.status === "aguardando_atendimento" || l.status === "novo") s.aguardando++;
      if (l.status === "contrato_fechado" || l.status === "pos_venda") s.ganhos++;
      if (l.status === "perdido") s.perdidos++;
      map.set(key, s);
    });
    return map;
  }, [statsRows, leads]);

  const unassignedStats = statsByCorretor.get("__unassigned__");

  const filteredLeads = useMemo(() => {
    // Com corretor selecionado a base vem do servidor (carteira completa até o
    // limite); sem seleção, é o recorte dos mais recentes.
    let list = selectedCorretor ? (leadsDoCorretor ?? []) : (leads ?? []);
    list = filtrarPorEscopo(list, escopoEfetivo, prazos);
    if (statusFilter !== "all") list = list.filter((l) => l.status === statusFilter);
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (l) =>
          l.nome.toLowerCase().includes(s) ||
          (l.email ?? "").toLowerCase().includes(s) ||
          l.telefone.toLowerCase().includes(s),
      );
    }
    return list;
  }, [leads, leadsDoCorretor, selectedCorretor, escopoEfetivo, prazos, statusFilter, search]);

  const transferMutation = useMutation({
    mutationFn: async ({ ids, corretorId }: { ids: string[]; corretorId: string }) => {
      // RPC canônica: renova data_distribuicao (sem isso o job de redistribuição
      // desfazia a transferência em minutos) e registra em distribution_log.
      const { error } = await supabase.rpc("transferir_leads", {
        _ids: ids,
        _corretor: corretorId,
      });
      if (error) throw error;
      // Notifica via WhatsApp: UMA mensagem de resumo para o corretor (a edge
      // function ainda filtra por origem=facebook). Um aviso por lead virava
      // rajada no mesmo número e arriscava bloqueio da instância Z-API.
      await notificarTransferenciaEmLote({ leadIds: ids, corretorId });
    },
    onSuccess: (_data, vars) => {
      toast.success(`${vars.ids.length} lead(s) transferido(s) com sucesso`);
      setSelectedLeads(new Set());
      setTransferOpen(false);
      setTargetCorretor("");
      qc.invalidateQueries({ queryKey: ["leads-por-corretor"] });
      qc.invalidateQueries({ queryKey: ["leads-do-corretor"] });
      qc.invalidateQueries({ queryKey: ["leads-stats-corretor"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const corretorNomeMap = useMemo(
    () => new Map((corretores ?? []).map((c) => [c.id, c.nome])),
    [corretores],
  );

  const columns = useMemo<ColumnDef<Lead, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nome" />,
        meta: { label: "Nome" },
        cell: ({ row }) => (
          <Link
            to="/leads/$leadId"
            params={{ leadId: row.original.id }}
            className="font-medium hover:underline"
          >
            {row.original.nome}
          </Link>
        ),
      },
      {
        id: "contato",
        header: "Contato",
        enableSorting: false,
        meta: { label: "Contato", hideBelow: "md" },
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.telefone}</div>
            {row.original.email && (
              <div className="text-xs text-muted-foreground">{row.original.email}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        meta: { label: "Status" },
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={LEAD_STATUS_BADGE_TONE[row.original.status as LeadStatus] ?? ""}
          >
            {leadStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        id: "corretor",
        accessorFn: (l) =>
          l.corretor_id ? (corretorNomeMap.get(l.corretor_id) ?? "—") : "Sem corretor",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Corretor" />,
        meta: { label: "Corretor", hideBelow: "lg" },
        cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span>,
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Criado em" />,
        meta: { label: "Criado em", hideBelow: "sm" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {new Date(row.original.created_at).toLocaleDateString("pt-BR")}
          </span>
        ),
      },
      {
        id: "acoes",
        header: "",
        enableSorting: false,
        enableHiding: false,
        size: 48,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Transferir ${row.original.nome}`}
            onClick={() => {
              setSelectedLeads(new Set([row.original.id]));
              setTransferOpen(true);
            }}
          >
            <ArrowsLeftRight className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [corretorNomeMap],
  );

  if (!canManage) {
    return (
      <div className="p-6">
        <PageHeader title="Leads por Corretor" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Apenas gestores e administradores podem acessar esta página.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leads por Corretor"
        description="Visualize a carteira de cada corretor e transfira leads em lote."
        actions={
          selectedLeads.size > 0 ? (
            <Button onClick={() => setTransferOpen(true)}>
              <ArrowsLeftRight className="mr-2 h-4 w-4" />
              Transferir {selectedLeads.size} {selectedLeads.size === 1 ? "lead" : "leads"}
            </Button>
          ) : null
        }
      />

      {truncado && (
        <p className="text-[11px] text-muted-foreground">
          {statsDoServidor
            ? `A lista abaixo mostra os ${LIMITE_LEADS.toLocaleString("pt-BR")} leads mais recentes (limite de exibição) — os números dos cards contam a base inteira.`
            : `Mostrando os ${LIMITE_LEADS.toLocaleString("pt-BR")} leads mais recentes (limite de exibição) — os totais por corretor podem estar subestimados até a migration leads_stats_por_corretor ser aplicada.`}
        </p>
      )}

      {/* Prospecção não é carteira: o lead que ainda não teve primeiro contato
          é trabalho de topo de funil e tem tela própria. Sem esta linha, o
          gestor lê os "em prospecção" dos cards como carteira parada. */}
      {prospeccaoDaCasa > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">
          <span>
            {prospeccaoDaCasa.toLocaleString("pt-BR")} leads ainda sem primeiro contato — isso é
            prospecção, não carteira.
          </span>
          <Link
            to="/prospeccao"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Trabalhar em Prospecção
          </Link>
        </div>
      )}

      {/* Cards de corretores */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {unassignedStats && unassignedStats.total > 0 && (
          <CorretorCard
            nome="Sem corretor"
            stats={unassignedStats}
            carteira={carteiraPorCorretor.get(SEM_DONO)}
            selected={selectedCorretor === "unassigned"}
            onClick={() =>
              setSelectedCorretor(selectedCorretor === "unassigned" ? null : "unassigned")
            }
            muted
          />
        )}
        {(corretores ?? []).map((c) => {
          const s = statsByCorretor.get(c.id) ?? {
            total: 0,
            emAtendimento: 0,
            aguardando: 0,
            ganhos: 0,
            perdidos: 0,
          };
          return (
            <CorretorCard
              key={c.id}
              nome={c.nome}
              stats={s}
              carteira={carteiraPorCorretor.get(c.id)}
              redistribuidos={redistMap.get(c.id) ?? 0}
              selected={selectedCorretor === c.id}
              onClick={() => setSelectedCorretor(selectedCorretor === c.id ? null : c.id)}
            />
          );
        })}
      </div>

      {/* Filtros e tabela */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">
              {selectedCorretor === "unassigned"
                ? "Leads sem corretor"
                : selectedCorretor
                  ? `Leads de ${corretores?.find((c) => c.id === selectedCorretor)?.nome ?? ""}`
                  : "Todos os leads"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredLeads.length})
              </span>
              {/* O gestor precisa saber que está vendo um recorte. Uma lista
                  filtrada sem dizer que está filtrada é pior que a lista cheia. */}
              {escopoEfetivo !== "todos" && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {escopoEfetivo === "tratativa"
                    ? "· só o que está em tratativa (prospecção fica em Prospecção)"
                    : "· só o que está parado no prazo da fase"}
                </span>
              )}
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome, email ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              {prazos && (
                <Select value={escopo} onValueChange={(v) => setEscopo(v as EscopoCarteira)}>
                  <SelectTrigger className="w-48" aria-label="Escopo da carteira">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tratativa">{ESCOPO_LABEL.tratativa}</SelectItem>
                    <SelectItem value="parados">{ESCOPO_LABEL.parados}</SelectItem>
                    <SelectItem value="todos">{ESCOPO_LABEL.todos}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCorretor && (
                <Button variant="outline" onClick={() => setSelectedCorretor(null)}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            tableId="leads-por-corretor"
            aria-label="Leads por corretor"
            columns={columns}
            data={filteredLeads}
            loading={selectedCorretor ? loadingDoCorretor : isLoading}
            error={isError ? error : undefined}
            onRetry={() => void refetch()}
            enableSelection
            selected={selectedLeads}
            onSelectedChange={setSelectedLeads}
            empty={
              <EmptyState
                icon={UsersThree}
                title="Nenhum lead encontrado"
                description="Ajuste a busca ou os filtros — ou limpe a seleção de corretor."
              />
            }
          />
        </CardContent>
      </Card>

      {/* Dialog de transferência */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir leads</DialogTitle>
            <DialogDescription>
              Selecione o corretor de destino para {selectedLeads.size}{" "}
              {selectedLeads.size === 1 ? "lead" : "leads"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Select value={targetCorretor} onValueChange={setTargetCorretor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o corretor de destino" />
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
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!targetCorretor}
              loading={transferMutation.isPending}
              onClick={() =>
                transferMutation.mutate({
                  ids: [...selectedLeads],
                  corretorId: targetCorretor,
                })
              }
            >
              Confirmar transferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CorretorCard({
  nome,
  stats,
  carteira,
  redistribuidos,
  selected,
  onClick,
  muted,
}: {
  nome: string;
  stats: Stats;
  carteira?: CarteiraStats;
  redistribuidos?: number;
  selected: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-all hover:shadow-md ${
        selected ? "ring-2 ring-primary" : ""
      } ${muted ? "border-dashed" : ""}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base truncate">{nome}</CardTitle>
          {/* O número em destaque é o que está EM TRATATIVA, não o total. Com
              441 leads por corretor, o total não diz nada sobre o trabalho —
              e era ele que fazia a tela parecer cheia de gente ocupada. */}
          <Badge variant={(carteira?.ativa ?? stats.total) > 0 ? "default" : "secondary"}>
            {carteira ? carteira.ativa : stats.total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        {carteira ? (
          <>
            <div className="flex items-center gap-2">
              <UsersThree className="h-3.5 w-3.5 text-blue-600" />
              <span>{textoTratativa(carteira)}</span>
              {carteira.fundo > 0 && (
                <span className="text-xs text-muted-foreground">({carteira.fundo} no fundo)</span>
              )}
            </div>
            {/* O excedente NÃO some da tela. Um corretor com 90 em tratativa
                num teto de 65 é informação de gestão; mostrar só 65 e calar
                os 25 seria o card mentindo por omissão. */}
            {excedente(carteira) > 0 && (
              <div
                className="flex items-center gap-2 text-destructive"
                title="Passa do teto de leads em tratativa — precisa devolver ou fechar antes de receber mais"
              >
                <ArrowsLeftRight className="h-3.5 w-3.5" />
                <span>+{excedente(carteira)} acima do teto</span>
              </div>
            )}
            {/* Subconjunto da tratativa: está em tratativa pelo relógio do
                último toque, mas não tem nada marcado adiante. Medido em
                14/09/2026, eram 365 de 444 nos quatro corretores mais cheios —
                e a tela dizia que estava tudo em dia. */}
            {(semPassoVivo(carteira) ?? 0) > 0 && (
              <div
                className="flex items-center gap-2 text-warning"
                title="Sem tarefa nem agendamento no futuro — tarefa vencida não conta como próximo passo"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>{semPassoVivo(carteira)} sem próximo passo</span>
              </div>
            )}
            {carteira.parada > 0 && (
              <div
                className="flex items-center gap-2"
                title="Sem registro no prazo da fase — é o que a régua de devolução leva"
              >
                <UserMinus
                  className={`h-3.5 w-3.5 ${
                    tomDaCarteira(carteira) === "critico" ? "text-destructive" : "text-warning"
                  }`}
                />
                <span>
                  {carteira.parada} parados
                  {pctParada(carteira) !== null && ` (${pctParada(carteira)}%)`}
                </span>
              </div>
            )}
            {carteira.prospeccao > 0 && (
              <div
                className="flex items-center gap-2 text-muted-foreground"
                title="Ainda sem primeiro contato — trabalho de topo de funil, em Prospecção"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>{carteira.prospeccao} em prospecção</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <UsersThree className="h-3.5 w-3.5 text-blue-600" />
              <span>{stats.emAtendimento} em atendimento</span>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-3.5 w-3.5 text-warning" />
              <span>{stats.aguardando} aguardando</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-green-600" />
          <span>{stats.ganhos} ganhos</span>
        </div>
        <div className="flex items-center gap-2">
          <UserMinus className="h-3.5 w-3.5 text-destructive" />
          <span>{stats.perdidos} perdidos</span>
        </div>
        {(redistribuidos ?? 0) > 0 && (
          <div
            className="flex items-center gap-2 text-muted-foreground"
            title="Movimentações do job automático de leads parados nos últimos 7 dias"
          >
            <ArrowsLeftRight className="h-3.5 w-3.5 text-amber-600" />
            <span>{redistribuidos} redistribuições (7d)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
