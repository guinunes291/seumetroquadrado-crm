import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ArrowRightLeft, Search, Users, UserCheck, UserX, Trophy } from "lucide-react";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_BADGE_TONE,
  leadStatusLabel,
  type LeadStatus,
} from "@/lib/leads";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/leads-por-corretor")({
  beforeLoad: () => {
    throw redirect({ to: "/painel-gestor", search: { tab: "leads-corretor" } });
  },
});

type Corretor = { id: string; nome: string; ativo: boolean };
type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  status: string;
  corretor_id: string | null;
  created_at: string;
};

type Stats = {
  total: number;
  emAtendimento: number;
  aguardando: number;
  ganhos: number;
  perdidos: number;
};

export function LeadsPorCorretorPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();

  const [selectedCorretor, setSelectedCorretor] = useState<string | "unassigned" | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
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

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads-por-corretor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, email, telefone, status, corretor_id, created_at")
        .eq("na_lixeira", false)
        .order("created_at", { ascending: false })
        .limit(2000);
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
  }, [leads]);

  const unassignedStats = statsByCorretor.get("__unassigned__");

  const filteredLeads = useMemo(() => {
    let list = leads ?? [];
    if (selectedCorretor === "unassigned") {
      list = list.filter((l) => !l.corretor_id);
    } else if (selectedCorretor) {
      list = list.filter((l) => l.corretor_id === selectedCorretor);
    }
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
  }, [leads, selectedCorretor, statusFilter, search]);

  const transferMutation = useMutation({
    mutationFn: async ({ ids, corretorId }: { ids: string[]; corretorId: string }) => {
      // RPC canônica: renova data_distribuicao (sem isso o job de redistribuição
      // desfazia a transferência em minutos) e registra em distribution_log.
      const { error } = await supabase.rpc(
        "transferir_leads" as never,
        { _ids: ids, _corretor: corretorId } as never,
      );
      if (error) throw error;
      // Notifica via WhatsApp os leads com origem=facebook (uma chamada por lead).
      await Promise.allSettled(
        ids.map((id) =>
          supabase.functions.invoke("notify-lead-transfer", {
            body: { lead_id: id, corretor_id: corretorId },
          }),
        ),
      );
    },
    onSuccess: (_data, vars) => {
      toast.success(`${vars.ids.length} lead(s) transferido(s) com sucesso`);
      setSelectedLeads([]);
      setTransferOpen(false);
      setTargetCorretor("");
      qc.invalidateQueries({ queryKey: ["leads-por-corretor"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAll = () => {
    if (selectedLeads.length === filteredLeads.length) setSelectedLeads([]);
    else setSelectedLeads(filteredLeads.map((l) => l.id));
  };
  const toggleOne = (id: string) =>
    setSelectedLeads((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
          selectedLeads.length > 0 ? (
            <Button onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transferir {selectedLeads.length} {selectedLeads.length === 1 ? "lead" : "leads"}
            </Button>
          ) : null
        }
      />

      {/* Cards de corretores */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {unassignedStats && unassignedStats.total > 0 && (
          <CorretorCard
            nome="Sem corretor"
            stats={unassignedStats}
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
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome, email ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
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
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Carregando...</div>
          ) : filteredLeads.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Nenhum lead encontrado.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length
                        }
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Corretor</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((l) => {
                    const corretorNome = l.corretor_id
                      ? (corretores?.find((c) => c.id === l.corretor_id)?.nome ?? "—")
                      : "Sem corretor";
                    return (
                      <TableRow
                        key={l.id}
                        className={selectedLeads.includes(l.id) ? "bg-muted/50" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedLeads.includes(l.id)}
                            onCheckedChange={() => toggleOne(l.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: l.id }}
                            className="hover:underline"
                          >
                            {l.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{l.telefone}</div>
                          {l.email && (
                            <div className="text-muted-foreground text-xs">{l.email}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus] ?? ""}
                          >
                            {leadStatusLabel(l.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{corretorNome}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLeads([l.id]);
                              setTransferOpen(true);
                            }}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de transferência */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir leads</DialogTitle>
            <DialogDescription>
              Selecione o corretor de destino para {selectedLeads.length}{" "}
              {selectedLeads.length === 1 ? "lead" : "leads"}.
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
              disabled={!targetCorretor || transferMutation.isPending}
              onClick={() =>
                transferMutation.mutate({
                  ids: selectedLeads,
                  corretorId: targetCorretor,
                })
              }
            >
              {transferMutation.isPending ? "Transferindo..." : "Confirmar transferência"}
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
  redistribuidos,
  selected,
  onClick,
  muted,
}: {
  nome: string;
  stats: Stats;
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
          <Badge variant={stats.total > 0 ? "default" : "secondary"}>{stats.total}</Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-blue-600" />
          <span>{stats.emAtendimento} em atendimento</span>
        </div>
        <div className="flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 text-warning" />
          <span>{stats.aguardando} aguardando</span>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-green-600" />
          <span>{stats.ganhos} ganhos</span>
        </div>
        <div className="flex items-center gap-2">
          <UserX className="h-3.5 w-3.5 text-destructive" />
          <span>{stats.perdidos} perdidos</span>
        </div>
        {(redistribuidos ?? 0) > 0 && (
          <div
            className="flex items-center gap-2 text-muted-foreground"
            title="Movimentações do job automático de leads parados nos últimos 7 dias"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-amber-600" />
            <span>{redistribuidos} redistribuições (7d)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
