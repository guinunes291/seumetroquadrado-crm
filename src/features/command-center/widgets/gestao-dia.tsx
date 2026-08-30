// Widget hero da visão Operação: resumo do Painel do Dia (exceções + R$ em
// risco) com atalho direto para agir, mais a "ronda do dia" — o que exige
// ação FORA do /painel-gestor (aprovações, régua, entrada), só com contador
// > 0. É a primeira coisa que o gestor vê.

import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TIPO_META, TIPOS_ORDENADOS } from "@/features/gestao/painel-dia/derive";
import { usePainelDia } from "@/features/gestao/painel-dia/use-painel-dia";
import { useNavBadges } from "@/features/nav/use-nav-badges";
import { buildRondaItems } from "@/features/command-center/ronda";
import type { WidgetProps } from "@/features/command-center/widget-registry";

const INTENT_TEXTO: Record<string, string> = {
  danger: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

export function GestaoDiaWidget(_props: WidgetProps) {
  const painelQ = usePainelDia();
  const painel = painelQ.data;
  const resumo = painel?.resumo;
  // Ronda do dia: pendências fora do Painel do Dia, dos MESMOS badges do nav
  // (recortados por papel na RPC) — sem query nova. Lista vazia = nada extra.
  const ronda = buildRondaItems(useNavBadges());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" /> O que exige ação hoje
          {painel?.degradado && (
            <span className="text-xs font-normal text-warning">modo degradado</span>
          )}
        </CardTitle>
        <Button asChild size="sm">
          <Link to="/painel-gestor">
            Painel do Dia <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <AsyncBoundary
          isLoading={painelQ.isLoading}
          isError={painelQ.isError}
          error={painelQ.error}
          errorTitle="Não foi possível carregar as exceções do dia."
          onRetry={() => painelQ.refetch()}
          loadingFallback={<Skeleton className="h-20 w-full" />}
        >
          {resumo && resumo.total === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> Nenhuma exceção agora — operação em
              dia.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-2xl font-semibold tabular-nums">
                  {resumo?.total ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">
                  {resumo?.total === 1 ? "exceção" : "exceções"}
                </span>
                {!!resumo?.vgv_em_risco && resumo.vgv_em_risco > 0 && (
                  <span
                    className="text-sm text-muted-foreground"
                    title="Estimativa pelo preço 'a partir de' dos projetos"
                  >
                    ~{moeda(resumo.vgv_em_risco)} em risco
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {TIPOS_ORDENADOS.map((tipo) => {
                  const n = resumo?.por_tipo[tipo] ?? 0;
                  if (n === 0) return null;
                  const meta = TIPO_META[tipo];
                  return (
                    <Link
                      key={tipo}
                      to="/painel-gestor"
                      className="text-sm hover:underline"
                      title={meta.descricao}
                    >
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          INTENT_TEXTO[meta.intent] ?? "",
                        )}
                      >
                        {n}
                      </span>{" "}
                      <span className="text-muted-foreground">{meta.label.toLowerCase()}</span>
                    </Link>
                  );
                })}
              </div>
              {!!resumo?.corretores_sem_interacao?.length && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  Presentes sem interação hoje:
                  {resumo.corretores_sem_interacao.slice(0, 6).map((c) => (
                    <Badge key={c.corretor_id} variant="outline" className="font-normal">
                      {c.nome}
                    </Badge>
                  ))}
                  {resumo.corretores_sem_interacao.length > 6 && (
                    <span>+{resumo.corretores_sem_interacao.length - 6}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </AsyncBoundary>

        {/* Fora do AsyncBoundary de propósito: a ronda vem de outra fonte
            (useNavBadges) e continua útil mesmo se o Painel do Dia falhar.
            Com todos os contadores zerados, nada é renderizado — a trava
            anti-"menu global" vive em buildRondaItems. */}
        {ronda.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-3">
            <span className="text-xs text-muted-foreground">Ronda do dia:</span>
            {ronda.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                search={item.search ?? {}}
                className="text-sm hover:underline"
                title={item.descricao}
              >
                <span className={cn("font-semibold tabular-nums", INTENT_TEXTO[item.intent] ?? "")}>
                  {item.count}
                </span>{" "}
                <span className="text-muted-foreground">{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
