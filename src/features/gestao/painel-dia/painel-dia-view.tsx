import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Download, UserX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadMutations } from "@/features/leads/use-lead-mutations";
import { exportRowsXlsx } from "@/lib/spreadsheets";
import { cn } from "@/lib/utils";
import {
  drillSearchDoTipo,
  excecoesParaExport,
  TIPO_META,
  TIPOS_ORDENADOS,
  type ExcecaoTipo,
} from "./derive";
import { ExcecaoItem } from "./excecao-item";
import { usePainelDia } from "./use-painel-dia";

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

const CHIP_ATIVO: Record<string, string> = {
  danger: "border-destructive bg-destructive/10 text-destructive",
  warning: "border-warning bg-warning/10 text-warning",
  info: "border-info bg-info/10 text-info",
};

/**
 * Tela 1 — Painel do Dia: feed por exceção com ação em lote. Cada card de
 * tipo filtra o feed; cada número leva à lista de leads correspondente.
 */
export function PainelDiaView() {
  const painelQ = usePainelDia();
  const [tipoAtivo, setTipoAtivo] = useState<ExcecaoTipo | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [transferirOpen, setTransferirOpen] = useState(false);
  const [corretorDestino, setCorretorDestino] = useState("");

  const limparSelecao = () => setSelecionados(new Set());
  const mutations = useLeadMutations({
    clearSelection: limparSelecao,
    fecharDialogs: {
      transferir: () => {
        setTransferirOpen(false);
        setCorretorDestino("");
      },
    },
  });

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

  const painel = painelQ.data;
  const feed = useMemo(() => {
    const todas = painel?.excecoes ?? [];
    return tipoAtivo ? todas.filter((e) => e.tipo === tipoAtivo) : todas;
  }, [painel, tipoAtivo]);

  const toggle = (leadId: string) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });

  const selecionarTodos = () =>
    setSelecionados(new Set(feed.map((e) => e.lead_id)));

  const exportar = async () => {
    try {
      await exportRowsXlsx(excecoesParaExport(feed), {
        fileName: `painel-do-dia-${new Date().toISOString().slice(0, 10)}`,
        sheetName: "Exceções",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  };

  if (painelQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="flex flex-wrap gap-2">
          {TIPOS_ORDENADOS.map((t) => (
            <Skeleton key={t} className="h-14 w-40" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (painelQ.isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar o Painel do Dia."
        error={painelQ.error}
        onRetry={() => painelQ.refetch()}
      />
    );
  }

  if (!painel) return null;
  const { resumo } = painel;

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      {/* Cabeçalho: total, R$ em risco e frescor do dado */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-lg font-semibold">
          {resumo.total === 0
            ? "Nenhuma exceção agora"
            : `${resumo.total} ${resumo.total === 1 ? "exceção" : "exceções"}`}
        </span>
        {resumo.vgv_em_risco > 0 && (
          <span
            className="text-sm text-muted-foreground"
            title="Soma do valor potencial estimado dos leads com exceção (estimativa pelo preço 'a partir de' do projeto)"
          >
            ~{moeda(resumo.vgv_em_risco)} em risco (estimado)
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {painel.degradado ? "modo degradado" : "ao vivo"}
        </span>
      </div>

      {painel.degradado && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <span>
              Painel degradado: as migrations da camada de gestão ainda não foram aplicadas no
              banco — mostrando apenas SLA estourado e leads parados (30 min+), sem R$ nem
              documentação.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Cards por tipo (clicáveis: filtram o feed) */}
      <div className="flex flex-wrap gap-2">
        {TIPOS_ORDENADOS.map((tipo) => {
          const meta = TIPO_META[tipo];
          const n = resumo.por_tipo[tipo] ?? 0;
          const ativo = tipoAtivo === tipo;
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => {
                setTipoAtivo(ativo ? null : tipo);
                limparSelecao();
              }}
              title={meta.descricao}
              aria-pressed={ativo}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-1.5 text-left transition-colors",
                n === 0 && "opacity-50",
                ativo
                  ? (CHIP_ATIVO[meta.intent] ?? "border-primary bg-primary/10")
                  : "border-border-subtle bg-card hover:border-primary/40",
              )}
            >
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                {meta.label}
              </span>
              <span className="font-display text-xl font-semibold tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Corretores presentes sem interação hoje */}
      {resumo.corretores_sem_interacao.length > 0 && (
        <Card className="border-info/40 bg-info/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <UserX className="h-4 w-4 shrink-0 text-info" />
            <span className="font-medium">Presentes sem interação hoje:</span>
            {resumo.corretores_sem_interacao.map((c) => (
              <Badge key={c.corretor_id} variant="outline">
                {c.nome}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feed */}
      {feed.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={
            tipoAtivo
              ? `Nenhuma exceção de "${TIPO_META[tipoAtivo].label}" agora.`
              : "Nenhuma exceção agora — operação em dia. 🎉"
          }
          description={
            tipoAtivo ? "Limpe o filtro para ver os demais tipos." : undefined
          }
          action={
            tipoAtivo ? (
              <Button variant="outline" onClick={() => setTipoAtivo(null)}>
                Limpar filtro
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {feed.length} no feed{tipoAtivo ? ` · ${TIPO_META[tipoAtivo].label}` : ""} · ordenado
              por severidade e R$
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={selecionarTodos}>
                Selecionar todos
              </Button>
              <Button size="sm" variant="ghost" onClick={exportar} title="Exportar XLSX">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <ul className="space-y-2">
            {feed.map((e) => (
              <ExcecaoItem
                key={`${e.tipo}:${e.lead_id}`}
                excecao={e}
                selecionada={selecionados.has(e.lead_id)}
                onToggle={toggle}
              />
            ))}
          </ul>
        </>
      )}

      <BulkActionBar
        selectedCount={selecionados.size}
        onClear={limparSelecao}
        entityLabel="lead"
      >
        <Button size="sm" onClick={() => setTransferirOpen(true)}>
          <Users className="mr-1 h-4 w-4" /> Transferir
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/leads" search={tipoAtivo ? drillSearchDoTipo(tipoAtivo) : {}}>
            Abrir no /leads
          </Link>
        </Button>
      </BulkActionBar>

      {/* Transferência em lote — mesma RPC canônica da lista de leads */}
      <Dialog open={transferirOpen} onOpenChange={setTransferirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Transferir {selecionados.size} lead{selecionados.size === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <Select value={corretorDestino} onValueChange={setCorretorDestino}>
            <SelectTrigger>
              <SelectValue placeholder="Corretor de destino" />
            </SelectTrigger>
            <SelectContent>
              {(corretores ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferirOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!corretorDestino || mutations.bulkTransferir.isPending}
              onClick={() =>
                mutations.bulkTransferir.mutate({
                  ids: Array.from(selecionados),
                  corretorId: corretorDestino,
                })
              }
            >
              {mutations.bulkTransferir.isPending ? "Transferindo…" : "Transferir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
