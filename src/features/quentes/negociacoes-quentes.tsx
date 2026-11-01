// "Perto de fechar" (referência de 2026-10, "Hot deals"): faixa de cartões com
// as negociações mais perto da venda. A cor da etapa vai numa faixa do
// cartão, nunca no fundo inteiro — no funil a cor já tem significado (etapa,
// SLA, temperatura) e um cartão todo pintado brigaria com isso.

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Buildings, Clock, Fire } from "@phosphor-icons/react";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { useCorretoresMin } from "@/features/pipeline/queries";
import { fmtBRLCompacto } from "@/features/ranking/ranking-derive";
import { LEAD_STATUS_BADGE_TONE, leadStatusLabel } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { rankearQuentes, rotuloFollowup, type LeadQuente } from "./derive";
import { useLeadsQuentes } from "./queries";

// No celular a faixa rola para o lado (o próximo cartão aparece na borda e
// avisa que há mais) em vez de empilhar 6 cartões antes das exceções; do sm
// em diante, grade.
const FAIXA =
  "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3";
const ITEM = "w-[82%] shrink-0 snap-start sm:w-auto";

export function NegociacoesQuentes({ mostrarCorretor = true }: { mostrarCorretor?: boolean }) {
  const quentesQ = useLeadsQuentes();
  const corretoresQ = useCorretoresMin();
  // "Agora" fixo por render de dados: o ranking não se reordena sozinho.
  const lista = useMemo(() => rankearQuentes(quentesQ.data ?? [], new Date()), [quentesQ.data]);
  const nomeDoCorretor = useMemo(() => {
    const mapa = new Map((corretoresQ.data ?? []).map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? (mapa.get(id) ?? null) : null);
  }, [corretoresQ.data]);

  return (
    <section aria-labelledby="quentes-titulo" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="quentes-titulo"
            className="flex items-center gap-1.5 font-display text-lg font-semibold"
          >
            <Fire className="h-5 w-5 text-warning" weight="duotone" aria-hidden="true" />
            Perto de fechar
          </h2>
          <p className="text-sm text-muted-foreground">
            Análise de crédito, proposta enviada e visita realizada — as mais urgentes primeiro.
          </p>
        </div>
        <Link
          to="/kanban"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver o funil <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {quentesQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar as negociações quentes."
          error={quentesQ.error}
          onRetry={() => void quentesQ.refetch()}
        />
      ) : quentesQ.isLoading ? (
        <ul className={FAIXA} aria-label="Carregando">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className={ITEM}>
              <Skeleton className="h-36 w-full rounded-xl" />
            </li>
          ))}
        </ul>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum lead em análise de crédito, proposta enviada ou visita realizada agora.
        </p>
      ) : (
        <ul className={FAIXA}>
          {lista.map((l) => (
            <li key={l.id} className={ITEM}>
              <CartaoQuente
                lead={l}
                corretor={mostrarCorretor ? nomeDoCorretor(l.corretor_id) : null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CartaoQuente({ lead, corretor }: { lead: LeadQuente; corretor: string | null }) {
  const followup = rotuloFollowup(lead.proximo_followup, new Date());
  const parado = lead.diasParado !== null && lead.diasParado >= 3;
  return (
    <Link
      to="/leads/$leadId"
      params={{ leadId: lead.id }}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-elev-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {/* Faixa da etapa: a cor do funil, sem pintar o cartão inteiro. */}
      <span
        className={cn(
          "px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase",
          LEAD_STATUS_BADGE_TONE[lead.status],
        )}
      >
        {leadStatusLabel(lead.status)}
      </span>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate font-display text-base font-semibold group-hover:underline">
            {lead.nome}
          </span>
          <TemperatureChip temperatura={lead.temperatura} size="sm" pulse={false} />
        </div>
        {lead.projeto_nome && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Buildings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{lead.projeto_nome}</span>
          </span>
        )}
        {lead.preco_a_partir !== null && lead.preco_a_partir > 0 && (
          <span
            className="font-display text-lg font-semibold tabular-nums"
            title="Preço 'a partir de' do empreendimento — estimativa, não o valor fechado"
          >
            ~{fmtBRLCompacto(lead.preco_a_partir)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">a partir de</span>
          </span>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
          {parado ? (
            <span className="inline-flex items-center gap-1 font-medium text-warning">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> parado há {lead.diasParado} dias
            </span>
          ) : (
            followup && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {followup}
              </span>
            )
          )}
          {corretor && <span className="truncate">{corretor}</span>}
        </div>
      </div>
    </Link>
  );
}
