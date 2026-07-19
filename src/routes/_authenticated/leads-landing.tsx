import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, ExternalLink, Inbox } from "lucide-react";
import { toast } from "sonner";

type LeadLanding = {
  id: string;
  recebido_em: string;
  status: string;
  tipo: string | null;
  nome: string | null;
  whatsapp: string | null;
  renda: string | null;
  regiao: string | null;
  origem: string | null;
  pagina: string | null;
  referrer: string | null;
  timestamp_cliente: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  sim_renda: number | null;
  sim_tem_dependente: boolean | null;
  sim_carteira36m: boolean | null;
  sim_fgts: number | null;
  sim_entrada: number | null;
  sim_aluguel: number | null;
  sim_faixa: number | null;
  sim_segmento: string | null;
  sim_subsidio: number | null;
  sim_financiamento: number | null;
  sim_parcela: number | null;
  sim_teto_imovel: number | null;
  raw: unknown;
};

const STATUS_OPTS = ["novo", "em_contato", "ganho", "perdido"] as const;

/** Limite de registros baixados para a lista (e para o contador "X de Y"). */
const LIMITE_LEADS_LANDING = 1000;

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR");
  } catch {
    return s;
  }
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(s: string) {
  const cls: Record<string, string> = {
    novo: "bg-blue-500/15 text-blue-600",
    em_contato: "bg-amber-500/15 text-warning",
    ganho: "bg-success/15 text-success",
    perdido: "bg-rose-500/15 text-destructive",
  };
  return (
    <Badge className={cls[s] ?? ""} variant="secondary">
      {s}
    </Badge>
  );
}

function waLink(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null;
  const d = whatsapp.replace(/\D+/g, "");
  if (d.length < 10) return null;
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}`;
}

function LeadsLandingPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [faixaFilter, setFaixaFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LeadLanding | null>(null);

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["leads_landing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads_landing")
        .select("*")
        .order("recebido_em", { ascending: false })
        .limit(LIMITE_LEADS_LANDING);
      if (error) throw error;
      return (data ?? []) as unknown as LeadLanding[];
    },
  });
  // Corte silencioso exposto: acima do limite, a lista mostra só os mais recentes.
  const truncado = leads.length >= LIMITE_LEADS_LANDING;

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads_landing").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["leads_landing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "todos" && l.status !== statusFilter) return false;
      if (tipoFilter !== "todos" && l.tipo !== tipoFilter) return false;
      if (faixaFilter !== "todos" && String(l.sim_faixa ?? "") !== faixaFilter) return false;
      if (term) {
        const hay = `${l.nome ?? ""} ${l.whatsapp ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [leads, statusFilter, tipoFilter, faixaFilter, search]);

  const filtrosAtivos =
    statusFilter !== "todos" ||
    tipoFilter !== "todos" ||
    faixaFilter !== "todos" ||
    search.trim() !== "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads Landing"
        description="Leads recebidos da landing page externa via webhook público."
      />

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por nome ou WhatsApp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {STATUS_OPTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            <SelectItem value="lead_form">lead_form</SelectItem>
            <SelectItem value="lead_simulacao">lead_simulacao</SelectItem>
          </SelectContent>
        </Select>
        <Select value={faixaFilter} onValueChange={setFaixaFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Faixa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas faixas</SelectItem>
            <SelectItem value="1">Faixa 1</SelectItem>
            <SelectItem value="2">Faixa 2</SelectItem>
            <SelectItem value="3">Faixa 3</SelectItem>
            <SelectItem value="4">Faixa 4</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground self-center">
          {filtered.length} de {leads.length}
        </div>
      </div>

      {truncado && (
        <p className="text-[11px] text-muted-foreground">
          Mostrando os {LIMITE_LEADS_LANDING.toLocaleString("pt-BR")} leads mais recentes (limite de
          exibição) — registros mais antigos não aparecem na lista e os totais podem estar
          subestimados.
        </p>
      )}

      {isError ? (
        <QueryErrorState
          title="Não foi possível carregar os leads da landing."
          error={error}
          onRetry={() => refetch()}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Renda</TableHead>
                <TableHead>Região</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Faixa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9} className="py-3">
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      icon={Inbox}
                      title="Nenhum lead encontrado"
                      description={
                        filtrosAtivos
                          ? "Ajuste a busca ou os filtros para ver outros leads."
                          : "Os leads enviados pela landing page aparecem aqui assim que chegam."
                      }
                      action={
                        filtrosAtivos ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearch("");
                              setStatusFilter("todos");
                              setTipoFilter("todos");
                              setFaixaFilter("todos");
                            }}
                          >
                            Limpar filtros
                          </Button>
                        ) : undefined
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelected(l)}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {fmtDate(l.recebido_em)}
                    </TableCell>
                    <TableCell className="font-medium">{l.nome ?? "—"}</TableCell>
                    <TableCell>{l.whatsapp ?? "—"}</TableCell>
                    <TableCell>{l.renda ?? "—"}</TableCell>
                    <TableCell>{l.regiao ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.tipo ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>{l.sim_faixa ?? "—"}</TableCell>
                    <TableCell>{statusBadge(l.status)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {waLink(l.whatsapp) && (
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={waLink(l.whatsapp)!}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Abrir WhatsApp de ${l.nome ?? "lead"}`}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.nome ?? "Lead"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                {statusBadge(selected.status)}
                <Badge variant="outline">{selected.tipo ?? "—"}</Badge>
                {waLink(selected.whatsapp) && (
                  <Button asChild size="sm">
                    <a href={waLink(selected.whatsapp)!} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                    </a>
                  </Button>
                )}
                <Select
                  value={selected.status}
                  onValueChange={(v) => {
                    updateStatus.mutate({ id: selected.id, status: v });
                    setSelected({ ...selected, status: v });
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <section>
                <h3 className="font-semibold mb-2">Contato</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">WhatsApp:</span>{" "}
                    {selected.whatsapp ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Renda:</span> {selected.renda ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Região:</span> {selected.regiao ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Origem:</span> {selected.origem ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Recebido:</span>{" "}
                    {fmtDate(selected.recebido_em)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">No cliente:</span>{" "}
                    {fmtDate(selected.timestamp_cliente)}
                  </div>
                </div>
              </section>

              {selected.sim_renda != null || selected.sim_faixa != null ? (
                <section>
                  <h3 className="font-semibold mb-2">Simulação</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Renda: {fmtMoney(selected.sim_renda)}</div>
                    <div>
                      Faixa: {selected.sim_faixa ?? "—"} ({selected.sim_segmento ?? "—"})
                    </div>
                    <div>Dependente: {selected.sim_tem_dependente ? "Sim" : "Não"}</div>
                    <div>Carteira 36m: {selected.sim_carteira36m ? "Sim" : "Não"}</div>
                    <div>FGTS: {fmtMoney(selected.sim_fgts)}</div>
                    <div>Entrada: {fmtMoney(selected.sim_entrada)}</div>
                    <div>Aluguel atual: {fmtMoney(selected.sim_aluguel)}</div>
                    <div>Subsídio: {fmtMoney(selected.sim_subsidio)}</div>
                    <div>Financiamento: {fmtMoney(selected.sim_financiamento)}</div>
                    <div>Parcela: {fmtMoney(selected.sim_parcela)}</div>
                    <div className="col-span-2">
                      Teto do imóvel: {fmtMoney(selected.sim_teto_imovel)}
                    </div>
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="font-semibold mb-2">Marketing</h3>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>utm_source: {selected.utm_source ?? "—"}</div>
                  <div>utm_medium: {selected.utm_medium ?? "—"}</div>
                  <div>utm_campaign: {selected.utm_campaign ?? "—"}</div>
                  <div>utm_term: {selected.utm_term ?? "—"}</div>
                  <div>utm_content: {selected.utm_content ?? "—"}</div>
                  <div>gclid: {selected.gclid ?? "—"}</div>
                  <div>fbclid: {selected.fbclid ?? "—"}</div>
                </div>
                {selected.pagina && (
                  <div className="mt-2 text-xs break-all">
                    <a
                      className="text-primary underline inline-flex items-center gap-1"
                      href={selected.pagina}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" /> {selected.pagina}
                    </a>
                  </div>
                )}
                {selected.referrer && (
                  <div className="mt-1 text-xs break-all text-muted-foreground">
                    Referrer: {selected.referrer}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/leads-landing")({
  component: LeadsLandingPage,
});
