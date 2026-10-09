import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, ClockAfternoon, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  atualizarEfetivacaoVenda,
  marcosPendentes,
  vendaEfetivada,
  EFETIVACAO_FLAGS,
  type EfetivacaoFlagKey,
} from "@/lib/vendas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PendingSale = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  projeto_nome: string | null;
  valor_venda: number;
  data_assinatura: string;
  created_at: string;
  contrato_assinado: boolean;
  ato_pago: boolean;
  apto_repasse: boolean;
  percentual_comissao: number | null;
  percentual_gerente: number | null;
  percentual_superintendente: number | null;
  pct_share_corretor: number | null;
  leadNome: string;
  corretorNome: string;
};

/** "Mariana Costa" → "MC" — o avatar da linha da venda. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras =
    partes.length > 1 ? [partes[0][0], partes[partes.length - 1][0]] : [partes[0]?.[0]];
  return letras.filter(Boolean).join("").toUpperCase() || "?";
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function PendingSalesApproval() {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<{
    sale: PendingSale;
    type: "aprovada" | "rejeitada";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [pct, setPct] = useState({ total: "", gerente: "", superintendente: "" });
  const abrirDecisao = (sale: PendingSale, type: "aprovada" | "rejeitada") => {
    const f = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
    setPct({
      total: f(sale.percentual_comissao),
      gerente: f(sale.percentual_gerente),
      superintendente: f(sale.percentual_superintendente),
    });
    setDecision({ sale, type });
  };
  const num = (t: string) => {
    const v = Number(t.replace(",", "."));
    return t.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  };

  const query = useQuery({
    queryKey: ["vendas", "pendentes-aprovacao"],
    queryFn: async (): Promise<PendingSale[]> => {
      const { data: sales, error } = await supabase
        .from("vendas")
        .select(
          "id, lead_id, corretor_id, projeto_nome, valor_venda, data_assinatura, created_at, contrato_assinado, ato_pago, apto_repasse, percentual_comissao, percentual_gerente, percentual_superintendente, pct_share_corretor",
        )
        .eq("status_venda", "pendente")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;

      const leadIds = [
        ...new Set((sales ?? []).flatMap((sale) => (sale.lead_id ? [sale.lead_id] : []))),
      ];
      const corretorIds = [
        ...new Set((sales ?? []).flatMap((sale) => (sale.corretor_id ? [sale.corretor_id] : []))),
      ];
      const [leadsResult, profilesResult] = await Promise.all([
        leadIds.length
          ? supabase.from("leads").select("id, nome").in("id", leadIds)
          : Promise.resolve({ data: [], error: null }),
        corretorIds.length
          ? supabase.from("profiles").select("id, nome").in("id", corretorIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (leadsResult.error) throw leadsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      const leadNames = new Map((leadsResult.data ?? []).map((lead) => [lead.id, lead.nome]));
      const profileNames = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.nome]),
      );
      return (sales ?? []).map((sale) => ({
        ...sale,
        leadNome: (sale.lead_id && leadNames.get(sale.lead_id)) || "Lead não identificado",
        corretorNome: (sale.corretor_id && profileNames.get(sale.corretor_id)) || "Sem corretor",
      }));
    },
  });

  // Marcos de efetivação: contrato assinado, ato pago, apto para repasse.
  // A RPC atualizar_efetivacao_venda audita e o banco trava a aprovação
  // enquanto os 3 não estiverem ativos.
  const flagMutation = useMutation({
    mutationFn: async (input: { vendaId: string; key: EfetivacaoFlagKey; value: boolean }) =>
      atualizarEfetivacaoVenda(input.vendaId, { [input.key]: input.value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendas"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Decisão inválida");
      if (decision.type === "rejeitada" && !reason.trim()) {
        throw new Error("Informe o motivo da rejeição.");
      }
      if (decision.type === "aprovada") {
        const total = num(pct.total);
        const gerente = num(pct.gerente || "0");
        const sup = num(pct.superintendente || "0");
        if (total === null || gerente === null || sup === null) {
          throw new Error("Percentuais inválidos — use números entre 0 e 100.");
        }
        const share = decision.sale.pct_share_corretor;
        const patch: {
          percentual_comissao: number;
          percentual_gerente: number;
          percentual_superintendente: number;
          percentual_corretor?: number;
        } = {
          percentual_comissao: total,
          percentual_gerente: gerente,
          percentual_superintendente: sup,
        };
        if (share != null)
          patch.percentual_corretor = Math.round(total * Number(share) * 100) / 10000;
        const { error: upErr } = await supabase
          .from("vendas")
          .update(patch)
          .eq("id", decision.sale.id);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.rpc("aprovar_venda", {
        p_decisao: decision.type,
        p_motivo: decision.type === "rejeitada" ? reason.trim() : undefined,
        p_venda_id: decision.sale.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(decision?.type === "aprovada" ? "Venda aprovada" : "Venda rejeitada");
      setDecision(null);
      setReason("");
      await Promise.all(
        [
          ["vendas"],
          ["comissoes"],
          ["leads"],
          ["leads-kanban"],
          ["ranking"],
          ["metricas"],
          // No hub Dinheiro (2.4) o fechamento e o badge da sidebar dividem a
          // tela com a aprovação — sem estas duas chaves ficavam defasados.
          ["financeiro-fechamento"],
          ["nav-badges"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const total = useMemo(
    () => (query.data ?? []).reduce((sum, sale) => sum + Number(sale.valor_venda || 0), 0),
    [query.data],
  );

  if (query.isError) {
    return (
      <Card>
        <CardContent role="alert" className="space-y-3 py-6 text-sm">
          <p className="font-medium">Não foi possível carregar as vendas pendentes.</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!query.isLoading && (query.data?.length ?? 0) === 0) return null;

  return (
    <>
      {/* Identidade Lançamento (como no vídeo): uma linha por venda — quem
          comprou, de quem e onde, o valor e a decisão — e os marcos de
          efetivação logo abaixo. O quarto quadro é o ESTADO (em efetivação /
          pronta), não um marco: ele não se marca, decorre dos outros três. */}
      <section
        aria-label="Aprovações de venda"
        className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Aprovações de venda</h2>
          {!query.isLoading && (
            <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
              {query.data?.length ?? 0} {(query.data?.length ?? 0) === 1 ? "pendente" : "pendentes"}{" "}
              · {money(total)}
            </span>
          )}
        </div>
        <div className="mt-3 space-y-4" aria-live="polite">
          {query.isLoading ? (
            <div className="h-20 animate-pulse rounded-md bg-muted" />
          ) : (
            query.data?.map((sale) => {
              const efetivada = vendaEfetivada(sale);
              const pendentes = marcosPendentes(sale);
              return (
                <div key={sale.id} className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                      >
                        {iniciais(sale.leadNome)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{sale.leadNome}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {sale.corretorNome} · {sale.projeto_nome ?? "Sem projeto"} ·{" "}
                          {new Date(`${sale.data_assinatura}T12:00:00`).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <strong className="font-display text-xl font-bold tabular-nums">
                      {money(sale.valor_venda)}
                    </strong>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => abrirDecisao(sale, "rejeitada")}
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" /> Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        disabled={!efetivada}
                        title={efetivada ? undefined : `Aguardando: ${pendentes.join(", ")}`}
                        onClick={() => abrirDecisao(sale, "aprovada")}
                      >
                        <CheckCircle className="h-4 w-4" aria-hidden="true" /> Aprovar
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {EFETIVACAO_FLAGS.map((flag) => (
                      <label
                        key={flag.key}
                        className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border-subtle px-3 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={sale[flag.key]}
                          disabled={flagMutation.isPending}
                          className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground [&_svg]:h-3 [&_svg]:w-3"
                          onCheckedChange={(checked) =>
                            flagMutation.mutate({
                              vendaId: sale.id,
                              key: flag.key,
                              value: checked === true,
                            })
                          }
                        />
                        {flag.label}
                      </label>
                    ))}
                    <div
                      className={
                        efetivada
                          ? "flex min-h-11 items-center gap-2.5 rounded-xl bg-success/10 px-3 text-sm font-medium text-success"
                          : "flex min-h-11 items-center gap-2.5 rounded-xl bg-muted px-3 text-sm font-medium text-muted-foreground"
                      }
                    >
                      {efetivada ? (
                        <CheckCircle
                          className="h-5 w-5 shrink-0"
                          weight="fill"
                          aria-hidden="true"
                        />
                      ) : (
                        <ClockAfternoon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      )}
                      {efetivada ? "Pronta para aprovar" : "Em efetivação"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <AlertDialog
        open={!!decision}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setDecision(null);
            setReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision?.type === "aprovada" ? "Aprovar esta venda?" : "Rejeitar esta venda?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {decision?.type === "aprovada"
                ? "A aprovação fechará o lead e lançará ranking, VGV e comissões de forma atômica."
                : "A rejeição não gera comissão nem altera as metas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {decision?.type === "aprovada" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Comissão da imobiliária (%)</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["total", "Imobiliária (total)"],
                    ["gerente", "Gerente"],
                    ["superintendente", "Superint."],
                  ] as const
                ).map(([k, rotulo]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-[11px]">{rotulo}</Label>
                    <Input
                      inputMode="decimal"
                      value={pct[k]}
                      onChange={(e) => setPct((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const total = num(pct.total);
                const share = decision.sale.pct_share_corretor;
                if (total === null || share == null) return null;
                const corr = Math.round(total * Number(share) * 100) / 10000;
                return (
                  <p className="text-xs text-muted-foreground">
                    Corretor recebe {Number(share).toLocaleString("pt-BR")}% (tier) ={" "}
                    {corr.toLocaleString("pt-BR")}% do imóvel ·{" "}
                    {money((decision.sale.valor_venda * corr) / 100)}
                  </p>
                );
              })()}
            </div>
          )}
          {decision?.type === "rejeitada" && (
            <div className="space-y-1.5">
              <Label htmlFor="sale-rejection-reason">Motivo da rejeição *</Label>
              <Textarea
                id="sale-rejection-reason"
                autoFocus
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || (decision?.type === "rejeitada" && !reason.trim())}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Processando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
