import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  CheckCircle2,
  Circle,
  ExternalLink,
  MoreVertical,
  Pencil,
  Copy,
  CheckCheck,
  Archive,
  RotateCcw,
  Trash2,
  Search,
  Send,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getOferta,
  marcarContatado,
  marcarContatadosEmMassa,
  archiveOferta,
  restaurarOferta,
  concluirOferta,
  updateOferta,
  deleteOferta,
  computeOfertaStats,
  filterOfertaLeads,
  buildMensagemOferta,
  statusLabel,
  statusVariant,
  type OfertaLeadRow,
} from "@/lib/oferta-ativa";
import { buildWhatsAppUrl } from "@/lib/templates";
import { leadStatusLabel } from "@/lib/leads";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useDebounce } from "@/hooks/use-debounce";
import { useUserRoles } from "@/hooks/use-auth";
import { OfertaEnvioMassa } from "@/components/oferta-envio-massa";

export const Route = createFileRoute("/_authenticated/oferta-ativa/$ofertaId")({
  head: () => ({ meta: [{ title: "Lista de Oferta Ativa — Seu Metro Quadrado" }] }),
  component: OfertaDetailPage,
});

type DetailCache = Awaited<ReturnType<typeof getOferta>>;
type ContatoFiltro = "todos" | "contatados" | "nao_contatados";
const PAGINA_RENDER = 50;

function OfertaDetailPage() {
  const { ofertaId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;

  useRealtimeInvalidate(["oferta_ativa_leads", "ofertas_ativas"], [["oferta-detail", ofertaId]]);

  const q = useQuery({
    queryKey: ["oferta-detail", ofertaId],
    queryFn: () => getOferta(ofertaId),
  });

  const [busca, setBusca] = useState("");
  const buscaDebounced = useDebounce(busca, 300);
  const [statusFiltro, setStatusFiltro] = useState<string[]>([]);
  const [contatoFiltro, setContatoFiltro] = useState<ContatoFiltro>("todos");
  const [visibleCount, setVisibleCount] = useState(PAGINA_RENDER);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [envioOpen, setEnvioOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<{ ids: string[]; valor: boolean } | null>(null);
  const [confirmConcluir, setConfirmConcluir] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState(false);

  useEffect(() => {
    setVisibleCount(PAGINA_RENDER);
  }, [buscaDebounced, statusFiltro, contatoFiltro]);

  function patchContatado(ids: Set<string>, valor: boolean) {
    const contatado_em = valor ? new Date().toISOString() : null;
    qc.setQueryData<DetailCache>(["oferta-detail", ofertaId], (cache) =>
      cache
        ? {
            ...cache,
            leads: cache.leads.map((r) =>
              ids.has(r.id) ? { ...r, contatado: valor, contatado_em } : r,
            ),
          }
        : cache,
    );
  }

  // Referência à própria mutação para o "Tentar novamente" do toast de erro.
  const marcarRef = useRef<((vars: { ids: string[]; valor: boolean }) => void) | null>(null);
  const marcarM = useMutation({
    mutationFn: ({ ids, valor }: { ids: string[]; valor: boolean }) =>
      ids.length === 1 ? marcarContatado(ids[0], valor) : marcarContatadosEmMassa(ids, valor),
    onMutate: async ({ ids, valor }) => {
      await qc.cancelQueries({ queryKey: ["oferta-detail", ofertaId] });
      const prev = qc.getQueryData<DetailCache>(["oferta-detail", ofertaId]);
      patchContatado(new Set(ids), valor);
      return { prev };
    },
    onError: (err: Error, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["oferta-detail", ofertaId], ctx.prev);
      toast.error(err.message, {
        action: { label: "Tentar novamente", onClick: () => marcarRef.current?.(vars) },
      });
    },
    onSuccess: (_data, vars) => {
      if (vars.ids.length > 1) {
        toast.success(`${vars.ids.length} lead(s) atualizado(s)`);
        setSelecionados(new Set());
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["oferta-detail", ofertaId] });
      qc.invalidateQueries({ queryKey: ["ofertas-ativas"] });
    },
  });
  marcarRef.current = marcarM.mutate;

  const lifecycleM = useMutation({
    mutationFn: async (acao: "concluir" | "reativar" | "arquivar") => {
      if (acao === "concluir") await concluirOferta(ofertaId);
      else if (acao === "reativar") await restaurarOferta(ofertaId);
      else await archiveOferta(ofertaId);
    },
    onSuccess: (_data, acao) => {
      toast.success(
        acao === "concluir"
          ? "Lista concluída"
          : acao === "reativar"
            ? "Lista reativada"
            : "Lista arquivada",
      );
      qc.invalidateQueries({ queryKey: ["oferta-detail", ofertaId] });
      qc.invalidateQueries({ queryKey: ["ofertas-ativas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editM = useMutation({
    mutationFn: (dados: { nome: string; descricao: string | null }) =>
      updateOferta(ofertaId, dados),
    onSuccess: () => {
      toast.success("Lista atualizada");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["oferta-detail", ofertaId] });
      qc.invalidateQueries({ queryKey: ["ofertas-ativas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: () => deleteOferta(ofertaId),
    onSuccess: () => {
      toast.success("Lista excluída");
      qc.invalidateQueries({ queryKey: ["ofertas-ativas"] });
      navigate({ to: "/projetos", search: { tab: "oferta" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => q.data?.leads ?? [], [q.data]);
  // Vínculos cujo lead saiu do escopo (excluído) contam nos números,
  // mas não são acionáveis — ficam fora da tabela.
  const rowsComLead = useMemo(() => rows.filter((r) => r.lead), [rows]);
  const statsAll = useMemo(() => computeOfertaStats(rows), [rows]);

  const filtered = useMemo(
    () =>
      filterOfertaLeads(rowsComLead, {
        busca: buscaDebounced,
        status: statusFiltro,
        contato: contatoFiltro,
      }),
    [rowsComLead, buscaDebounced, statusFiltro, contatoFiltro],
  );
  const visiveis = filtered.slice(0, visibleCount);

  const statusPresentes = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const r of rowsComLead) {
      const s = r.lead!.status;
      contagem.set(s, (contagem.get(s) ?? 0) + 1);
    }
    return Array.from(contagem.entries()).sort((a, b) => b[1] - a[1]);
  }, [rowsComLead]);

  const linhasSelecionadas = useMemo(
    () => rowsComLead.filter((r) => selecionados.has(r.id)),
    [rowsComLead, selecionados],
  );

  const filtrosAtivos =
    buscaDebounced.trim() !== "" || statusFiltro.length > 0 || contatoFiltro !== "todos";

  const todosFiltradosSelecionados =
    filtered.length > 0 && filtered.every((r) => selecionados.has(r.id));
  const algumFiltradoSelecionado = filtered.some((r) => selecionados.has(r.id));

  function toggleSelecionarTodos() {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (todosFiltradosSelecionados) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkMarcar(valor: boolean) {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    // Desmarcar sempre confirma; marcar só confirma em volumes grandes.
    if (!valor || ids.length > 20) setConfirmBulk({ ids, valor });
    else marcarM.mutate({ ids, valor });
  }

  function abrirWhatsApp(row: OfertaLeadRow) {
    const l = row.lead;
    if (!l) return;
    window.open(
      buildWhatsAppUrl(l.telefone, buildMensagemOferta(l)),
      "_blank",
      "noopener,noreferrer",
    );
    if (!row.contatado) marcarM.mutate({ ids: [row.id], valor: true });
  }

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 animate-pulse bg-muted rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
        <div className="h-64 animate-pulse bg-muted rounded-xl" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    const notFound = (q.error as { code?: string } | null)?.code === "PGRST116";
    return (
      <EmptyState
        icon={AlertTriangle}
        title={notFound ? "Lista não encontrada" : "Erro ao carregar a lista"}
        description={
          notFound
            ? "Ela pode ter sido excluída ou você não tem acesso a ela."
            : (q.error as Error | null)?.message
        }
        action={
          notFound ? (
            <Button asChild variant="outline">
              <Link to="/projetos" search={{ tab: "oferta" }}>
                Voltar para Oferta Ativa
              </Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => q.refetch()}>
              Tentar novamente
            </Button>
          )
        }
        className="py-20"
      />
    );
  }

  const { oferta } = q.data;
  const listaAtiva = oferta.status === "ativa";

  function LinhaAcoes({ row }: { row: OfertaLeadRow }) {
    const l = row.lead!;
    return (
      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant="outline"
          title="Enviar WhatsApp"
          onClick={() => abrirWhatsApp(row)}
        >
          <MessageCircle className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" title="Ligar" asChild>
          <a href={`tel:${l.telefone}`}>
            <Phone className="w-4 h-4" />
          </a>
        </Button>
        <Button size="sm" variant="outline" title="Abrir lead" asChild>
          <Link to="/leads/$leadId" params={{ leadId: l.id }}>
            <ExternalLink className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    );
  }

  function ToggleContatado({ row }: { row: OfertaLeadRow }) {
    return (
      <button
        onClick={() => marcarM.mutate({ ids: [row.id], valor: !row.contatado })}
        title={row.contatado ? "Marcar como não contatado" : "Marcar como contatado"}
      >
        {row.contatado ? (
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/projetos" search={{ tab: "oferta" }}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <PageHeader
            title={oferta.nome}
            description={oferta.descricao ?? undefined}
            actions={
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(oferta.status)}>{statusLabel(oferta.status)}</Badge>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" title="Ações da lista">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditOpen(true)}>
                        <Pencil className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          navigate({ to: "/oferta-ativa/nova", search: { de: ofertaId } })
                        }
                      >
                        <Copy className="w-4 h-4 mr-2" /> Duplicar
                      </DropdownMenuItem>
                      {listaAtiva && (
                        <DropdownMenuItem onClick={() => setConfirmConcluir(true)}>
                          <CheckCheck className="w-4 h-4 mr-2" /> Concluir
                        </DropdownMenuItem>
                      )}
                      {!listaAtiva && (
                        <DropdownMenuItem onClick={() => lifecycleM.mutate("reativar")}>
                          <RotateCcw className="w-4 h-4 mr-2" /> Reativar
                        </DropdownMenuItem>
                      )}
                      {oferta.status !== "arquivada" && (
                        <DropdownMenuItem onClick={() => lifecycleM.mutate("arquivar")}>
                          <Archive className="w-4 h-4 mr-2" /> Arquivar
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setConfirmExcluir(true)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            }
          />
        </div>
      </div>

      {canManage && listaAtiva && statsAll.total > 0 && statsAll.contatados === statsAll.total && (
        <div className="rounded-xl border border-green-600/30 bg-green-600/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Todos os leads desta lista já foram contatados. 🎉</p>
          <Button size="sm" onClick={() => setConfirmConcluir(true)}>
            <CheckCheck className="w-4 h-4 mr-2" /> Concluir lista
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total de leads</p>
          <p className="text-2xl font-semibold">{statsAll.total}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Contatados</p>
          <p className="text-2xl font-semibold">
            {statsAll.contatados}{" "}
            <span className="text-sm text-muted-foreground">({statsAll.pctContatados}%)</span>
          </p>
          <Progress value={statsAll.pctContatados} className="h-1.5 mt-2" />
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Avançados</p>
          <p className="text-2xl font-semibold">
            {statsAll.avancados}{" "}
            <span className="text-sm text-muted-foreground">({statsAll.pctAvancados}%)</span>
          </p>
          <Progress value={statsAll.pctAvancados} className="h-1.5 mt-2 [&>div]:bg-green-500" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou projeto..."
              className="pl-8 w-64 max-w-full"
            />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ["todos", "Todos"],
                ["nao_contatados", "Não contatados"],
                ["contatados", "Contatados"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setContatoFiltro(valor)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  contatoFiltro === valor
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary/50"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {statusPresentes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {statusPresentes.map(([status, count]) => {
              const ativo = statusFiltro.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() =>
                    setStatusFiltro((prev) =>
                      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
                    )
                  }
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                    ativo
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary/50"
                  }`}
                >
                  {leadStatusLabel(status)} · {count}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Mostrando {visiveis.length} de {filtered.length}
            {filtrosAtivos ? ` (${statsAll.total} na lista)` : ""}
          </span>
          {filtrosAtivos && (
            <button
              type="button"
              className="underline hover:text-foreground flex items-center gap-0.5"
              onClick={() => {
                setBusca("");
                setStatusFiltro([]);
                setContatoFiltro("todos");
              }}
            >
              <X className="w-3 h-3" /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {selecionados.size > 0 && (
        <div className="sticky top-0 z-10 rounded-xl border bg-card shadow-sm p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{selecionados.size} selecionado(s)</span>
          <Button
            size="sm"
            variant="outline"
            disabled={marcarM.isPending}
            onClick={() => bulkMarcar(true)}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" /> Marcar contatados
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={marcarM.isPending}
            onClick={() => bulkMarcar(false)}
          >
            <Circle className="w-4 h-4 mr-1.5" /> Desmarcar contato
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEnvioOpen(true)}>
            <Send className="w-4 h-4 mr-1.5" /> Enviar template
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground ml-auto"
            onClick={() => setSelecionados(new Set())}
          >
            Limpar seleção
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={
            rowsComLead.length === 0 ? "Nenhum lead nesta lista." : "Nenhum lead com esses filtros."
          }
          description={
            rowsComLead.length === 0
              ? "Os leads que casarem com os filtros da lista aparecem aqui."
              : "Ajuste a busca ou os filtros para encontrar os leads."
          }
          action={
            filtrosAtivos ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBusca("");
                  setStatusFiltro([]);
                  setContatoFiltro("todos");
                }}
              >
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Tabela (desktop) */}
          <div className="bg-card border rounded-xl overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        todosFiltradosSelecionados
                          ? true
                          : algumFiltradoSelecionado
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSelecionarTodos}
                      aria-label="Selecionar todos os leads filtrados"
                    />
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((row) => {
                  const l = row.lead!;
                  return (
                    <TableRow key={row.id} className={row.contatado ? "opacity-70" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selecionados.has(row.id)}
                          onCheckedChange={() => toggleSelecionado(row.id)}
                          aria-label={`Selecionar ${l.nome}`}
                        />
                      </TableCell>
                      <TableCell>
                        <ToggleContatado row={row} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{l.nome}</div>
                        <div className="text-xs text-muted-foreground">{l.telefone}</div>
                      </TableCell>
                      <TableCell className="text-sm">{l.projeto_nome ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{leadStatusLabel(l.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <LinhaAcoes row={row} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Cards (mobile) */}
          <div className="md:hidden space-y-2">
            <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
              <Checkbox
                checked={
                  todosFiltradosSelecionados
                    ? true
                    : algumFiltradoSelecionado
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={toggleSelecionarTodos}
              />
              Selecionar todos ({filtered.length})
            </label>
            {visiveis.map((row) => {
              const l = row.lead!;
              return (
                <div
                  key={row.id}
                  className={`bg-card border rounded-xl p-3 space-y-2 ${
                    row.contatado ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      className="mt-1"
                      checked={selecionados.has(row.id)}
                      onCheckedChange={() => toggleSelecionado(row.id)}
                      aria-label={`Selecionar ${l.nome}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-tight">{l.nome}</p>
                      <p className="text-xs text-muted-foreground">{l.telefone}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <Badge variant="outline">{leadStatusLabel(l.status)}</Badge>
                        {l.projeto_nome && (
                          <span className="text-xs text-muted-foreground">{l.projeto_nome}</span>
                        )}
                      </div>
                    </div>
                    <ToggleContatado row={row} />
                  </div>
                  <LinhaAcoes row={row} />
                </div>
              );
            })}
          </div>

          {filtered.length > visibleCount && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGINA_RENDER)}>
                Carregar mais ({filtered.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      <OfertaEnvioMassa
        open={envioOpen}
        onOpenChange={setEnvioOpen}
        rows={linhasSelecionadas}
        onMarcarContatado={(vinculoId) => marcarM.mutate({ ids: [vinculoId], valor: true })}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar lista</DialogTitle>
          </DialogHeader>
          <form
            key={`${oferta.id}-${oferta.updated_at}`}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const nome = String(fd.get("nome") ?? "").trim();
              const descricao = String(fd.get("descricao") ?? "").trim();
              if (nome.length < 2) {
                toast.error("Dê um nome com pelo menos 2 caracteres à lista.");
                return;
              }
              editM.mutate({ nome, descricao: descricao === "" ? null : descricao });
            }}
          >
            <div>
              <Label htmlFor="oferta-nome">Nome *</Label>
              <Input id="oferta-nome" name="nome" defaultValue={oferta.nome} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="oferta-descricao">Descrição</Label>
              <Input
                id="oferta-descricao"
                name="descricao"
                defaultValue={oferta.descricao ?? ""}
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editM.isPending}>
                {editM.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmBulk} onOpenChange={(o) => !o && setConfirmBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBulk?.valor
                ? `Marcar ${confirmBulk.ids.length} lead(s) como contatados?`
                : `Desmarcar contato de ${confirmBulk?.ids.length} lead(s)?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulk?.valor
                ? "Os leads selecionados serão marcados como contatados agora."
                : "O registro de contato desses leads será removido, junto com a data."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmBulk) marcarM.mutate({ ids: confirmBulk.ids, valor: confirmBulk.valor });
                setConfirmBulk(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmConcluir} onOpenChange={setConfirmConcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir esta lista?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha é encerrada e a lista sai das ações do dia a dia. Você pode reativá-la
              depois, se precisar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => lifecycleM.mutate("concluir")}>
              Concluir lista
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmExcluir} onOpenChange={setConfirmExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta lista?</AlertDialogTitle>
            <AlertDialogDescription>
              A lista e o progresso de contato dos leads dela serão excluídos de forma permanente.
              Os leads em si não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteM.mutate()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
