// Modo Fechamento: sinais comerciais compactos, calibrados com vendas
// aprovadas quando a etapa possui amostra madura. O índice serve apenas para
// ordenar foco; a taxa histórica observada fica separada e explicada.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FileWarning, Flag, MessageCircle, Phone } from "lucide-react";

import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { ScoreRing } from "@/components/ui/score-ring";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  FECHAMENTO_TIER_DOT,
  FECHAMENTO_TIER_LABEL,
  FECHAMENTO_TIER_TONE,
  parseFechamentoResponse,
  type FechamentoTier,
} from "@/lib/fechamento";
import { formatRelativeTime } from "@/lib/interacoes";
import { leadStatusLabel, LEAD_STATUS_BADGE_TONE, type LeadStatus } from "@/lib/leads";
import { buildWhatsAppUrl } from "@/lib/templates";
import { cn } from "@/lib/utils";

const taxaFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function FechamentoView() {
  const { user } = useAuth();
  const sinaisQ = useQuery({
    queryKey: ["pipeline", "fechamento-sinais-v1", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fechamento_sinais_v1", { _limit: 50 });
      if (error) throw error;
      return parseFechamentoResponse(data);
    },
  });

  const hoje = new Date();
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diasRestantes = ultimoDia - hoje.getDate();
  const segundaQuinzena = hoje.getDate() > 15;

  return (
    <AsyncBoundary
      isLoading={sinaisQ.isPending}
      isError={sinaisQ.isError}
      error={sinaisQ.error}
      errorTitle="Não foi possível carregar o modo Fechamento."
      onRetry={() => void sinaisQ.refetch()}
      loadingLabel="Carregando modo Fechamento"
    >
      {sinaisQ.data && (
        <div className="space-y-6">
          <GlassCard glow={segundaQuinzena} className="p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Flag
                  className={cn("h-8 w-8", segundaQuinzena ? "text-primary" : "text-info")}
                  aria-hidden="true"
                />
                <div>
                  <div className="font-display text-lg font-semibold tracking-tight">
                    {segundaQuinzena ? "Reta final do mês" : "Modo Fechamento"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {segundaQuinzena
                      ? `${diasRestantes} dia(s) para fechar o mês — priorize os sinais fortes e destrave documentação.`
                      : "Acompanhe os sinais mais relevantes e remova os obstáculos cedo."}
                  </div>
                </div>
              </div>
              <div className="font-display text-3xl font-semibold tabular-nums text-primary">
                {sinaisQ.data.contagens.alta}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  com sinal forte
                </span>
              </div>
            </div>
          </GlassCard>

          <div className="grid gap-4 sm:grid-cols-3" aria-label="Resumo dos sinais de fechamento">
            {(["alta", "media", "baixa"] as FechamentoTier[]).map((nivel) => (
              <Card key={nivel}>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn("h-2 w-2 rounded-full", FECHAMENTO_TIER_DOT[nivel])}
                      aria-hidden="true"
                    />
                    {FECHAMENTO_TIER_LABEL[nivel]}
                  </div>
                  <div className="font-display mt-1 text-2xl font-bold tabular-nums">
                    {sinaisQ.data.contagens[nivel]}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              {sinaisQ.data.items.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum lead em negociação no momento.
                </p>
              ) : (
                <ul className="divide-y" aria-label="Leads ordenados por sinal de fechamento">
                  {sinaisQ.data.items.map((lead) => {
                    const tone = LEAD_STATUS_BADGE_TONE[lead.status as LeadStatus];
                    const waUrl = buildWhatsAppUrl(
                      lead.telefone,
                      `Olá ${lead.nome.split(" ")[0]}, tudo bem?`,
                    );
                    const telHref = `tel:${lead.telefone.replace(/[^\d+]/g, "")}`;
                    const calibrado = lead.metodo === "historico_calibrado";

                    return (
                      <li
                        key={lead.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/40"
                      >
                        <ScoreRing
                          value={lead.indice}
                          size={44}
                          intent={
                            lead.nivel === "alta"
                              ? "success"
                              : lead.nivel === "media"
                                ? "warning"
                                : "neutral"
                          }
                          title={`Índice de sinal de fechamento ${lead.indice} de 100`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{lead.nome}</span>
                            <Badge variant="outline" className={cn("shrink-0", tone)}>
                              {leadStatusLabel(lead.status)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="shrink-0"
                              title={
                                calibrado
                                  ? "Índice ancorado na taxa histórica observada da etapa"
                                  : "Índice heurístico porque a etapa ainda não atingiu a amostra mínima"
                              }
                            >
                              {calibrado ? "Calibrado" : "Heurístico"}
                            </Badge>
                            {lead.documentos_pendentes > 0 && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 gap-1 bg-warning/15 text-warning"
                                title={`${lead.documentos_pendentes} documento(s) pendente(s) ou reprovado(s)`}
                              >
                                <FileWarning className="h-3 w-3" aria-hidden="true" />
                                {lead.documentos_pendentes} doc
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            <span>{lead.fatores.join(" · ")}</span>
                            {lead.projeto_nome ? <span> · {lead.projeto_nome}</span> : null}
                            {lead.ultima_interacao ? (
                              <span> · {formatRelativeTime(lead.ultima_interacao)}</span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {calibrado && lead.taxa_historica_pct !== null ? (
                              <span>
                                Taxa histórica observada da etapa:{" "}
                                {taxaFormatter.format(lead.taxa_historica_pct)}% (
                                {lead.vendas_aprovadas_etapa} vendas aprovadas em{" "}
                                {lead.amostra_etapa}
                                entradas; horizonte de {sinaisQ.data.horizonte_conversao_dias}{" "}
                                dias).
                              </span>
                            ) : (
                              <span>
                                Amostra histórica: {lead.amostra_etapa} de{" "}
                                {sinaisQ.data.amostra_minima}
                                entradas maduras; o índice ainda é heurístico e nenhuma taxa é
                                exibida.
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <div
                            className={cn(
                              "rounded-full border px-2 py-1 text-xs",
                              FECHAMENTO_TIER_TONE[lead.nivel],
                            )}
                          >
                            {FECHAMENTO_TIER_LABEL[lead.nivel]}
                          </div>
                          <Button
                            size="icon"
                            variant="outline"
                            className="text-success"
                            aria-label={`Abrir WhatsApp de ${lead.nome}`}
                            title="WhatsApp"
                            onClick={() => window.open(waUrl, "_blank", "noopener,noreferrer")}
                          >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label={`Ligar para ${lead.nome}`}
                            title="Ligar"
                            asChild
                          >
                            <a href={telHref}>
                              <Phone className="h-4 w-4" aria-hidden="true" />
                            </a>
                          </Button>
                          <Button size="sm" variant="ghost" className="min-h-11" asChild>
                            <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                              Abrir <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                            </Link>
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            O índice de 0–100 ordena sinais de foco e não é uma probabilidade individual ou uma
            garantia de venda. Quando há pelo menos {sinaisQ.data.amostra_minima} entradas maduras,
            ele usa a taxa histórica observada da etapa na carteira acessível e somente vendas
            aprovadas; com amostra menor, permanece explicitamente heurístico.
            {sinaisQ.data.total_count > sinaisQ.data.items.length
              ? ` Exibindo os ${sinaisQ.data.items.length} primeiros de ${sinaisQ.data.total_count} sinais.`
              : ""}
          </p>
        </div>
      )}
    </AsyncBoundary>
  );
}
