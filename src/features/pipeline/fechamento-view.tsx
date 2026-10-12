// Modo Fechamento: sinais comerciais compactos, calibrados com vendas
// aprovadas quando a etapa possui amostra madura. O índice serve apenas para
// ordenar foco; a taxa histórica observada fica separada e explicada.
//
// Padrão Lançamento (Fase 2 das demais páginas): o topo é UM cartão "Reta
// final" (o molde do FilaCartao) com o anel dos sinais fortes, os três níveis
// e a ação que desce até a lista; cada linha tem nome, etapa, índice e uma
// linha de fatores — a taxa histórica/amostra foi para a dica do selo
// Calibrado/Heurístico, e o parágrafo do rodapé para "Ver como o índice é
// calculado". A RPC, a ordem pelo índice e o Ligar (tel:) não mudaram.

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CaretDown, FileDashed, Phone, WhatsappLogo } from "@phosphor-icons/react";

import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CartaoPrincipal } from "@/components/ui/cartao-principal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { AnelNdeM, Notas, Numero } from "@/components/ui/placar";
import { ScoreRing } from "@/components/ui/score-ring";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { parseFechamentoResponse, type FechamentoResponse } from "@/lib/fechamento";
import { formatRelativeTime } from "@/lib/interacoes";
import { leadStatusLabel, LEAD_STATUS_BADGE_TONE, type LeadStatus } from "@/lib/leads";
import { INTENT_BADGE } from "@/lib/status-tones";
import { buildWhatsAppUrl } from "@/lib/templates";
import { cn } from "@/lib/utils";

const taxaFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "19 dias para fechar o mês" — a mesma conta de dias que a tela já fazia. */
function diasParaFecharOMes(hoje: Date = new Date()): string {
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diasRestantes = ultimoDia - hoje.getDate();
  if (diasRestantes <= 0) return "Último dia para fechar o mês";
  return `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"} para fechar o mês`;
}

type Sinal = FechamentoResponse["items"][number];

/** A frase da taxa histórica (calibrado) ou da amostra (heurístico) — vai
 *  para a dica do selo, não para a linha. */
function explicacaoDoMetodo(lead: Sinal, dados: FechamentoResponse): string {
  if (lead.metodo === "historico_calibrado" && lead.taxa_historica_pct !== null) {
    return (
      `Taxa histórica observada da etapa: ${taxaFormatter.format(lead.taxa_historica_pct)}% ` +
      `(${lead.vendas_aprovadas_etapa} vendas aprovadas em ${lead.amostra_etapa} entradas; ` +
      `horizonte de ${dados.horizonte_conversao_dias} dias).`
    );
  }
  return (
    `Amostra histórica: ${lead.amostra_etapa} de ${dados.amostra_minima} entradas maduras; ` +
    "o índice ainda é heurístico e nenhuma taxa é exibida."
  );
}

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

  return (
    <AsyncBoundary
      isLoading={sinaisQ.isPending}
      isError={sinaisQ.isError}
      error={sinaisQ.error}
      errorTitle="Não foi possível carregar o modo Fechamento."
      onRetry={() => void sinaisQ.refetch()}
      loadingLabel="Carregando modo Fechamento"
    >
      {sinaisQ.data && <RetaFinal dados={sinaisQ.data} />}
    </AsyncBoundary>
  );
}

function RetaFinal({ dados }: { dados: FechamentoResponse }) {
  const listaRef = useRef<HTMLElement>(null);
  const [comoAberto, setComoAberto] = useState(false);
  const { contagens, items, total_count: total } = dados;
  // Pasta travada entre os fortes: o que destrava o mês primeiro.
  const docsNosFortes = items.filter(
    (lead) => lead.nivel === "alta" && lead.documentos_pendentes > 0,
  ).length;

  // "Trabalhar os fortes": a lista já vem pelo índice, então os fortes são o
  // topo dela — desce até lá e leva o foco junto (teclado e leitor de tela).
  const trabalharOsFortes = () => {
    const lista = listaRef.current;
    if (!lista) return;
    lista.scrollIntoView?.({ behavior: "smooth", block: "start" });
    lista.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <CartaoPrincipal
          aria-label="Reta final — placar do fechamento"
          titulo="Reta final"
          subtitulo={diasParaFecharOMes()}
          className="xl:sticky xl:top-24"
          destaque={
            <div className="flex flex-col items-center gap-2">
              <AnelNdeM
                valor={contagens.alta}
                teto={total}
                tamanho={172}
                traco={12}
                cartao
                rotulo="leads em negociação com sinal forte"
              />
              <span className="text-xs text-muted-foreground">com sinal forte</span>
            </div>
          }
          numeros={
            <div
              className="grid grid-cols-3 gap-2"
              role="group"
              aria-label="Resumo dos sinais de fechamento"
            >
              <Numero
                valor={contagens.alta}
                rotulo="alta · sinal forte"
                cor="text-success"
                cartao
              />
              <Numero
                valor={contagens.media}
                rotulo="média · sinal moderado"
                cor="text-warning"
                cartao
              />
              <Numero
                valor={contagens.baixa}
                rotulo="baixa · sinal inicial"
                cor="text-foreground"
                cartao
              />
            </div>
          }
          notas={
            <Notas className="mt-3 text-xs">
              {docsNosFortes > 0 && (
                <span className="font-medium text-warning">
                  {docsNosFortes === 1
                    ? "1 pasta com documento pendente entre os fortes"
                    : `${docsNosFortes} pastas com documento pendente entre os fortes`}
                </span>
              )}
              <span>o índice ordena o foco, não é probabilidade</span>
            </Notas>
          }
          acao={
            items.length > 0 ? (
              <Button className="w-full" onClick={trabalharOsFortes}>
                {contagens.alta > 0 ? "Trabalhar os fortes" : "Ver a lista"}
              </Button>
            ) : undefined
          }
        />

        <section
          ref={listaRef}
          id="fechamento-lista"
          tabIndex={-1}
          aria-labelledby="fechamento-lista-titulo"
          className="scroll-mt-24 overflow-hidden rounded-2xl border border-border-subtle bg-card text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-3">
            <h2 id="fechamento-lista-titulo" className="text-sm font-semibold">
              Fortes primeiro{" "}
              <span className="font-medium text-muted-foreground">
                · ordenados pelo índice de 0 a 100
              </span>
            </h2>
            {/* A RPC devolve até 50: "50 de 64" diz que há mais do que a lista. */}
            <span className="text-xs tabular-nums text-muted-foreground">
              {items.length} de {total}
            </span>
          </header>
          {items.length === 0 ? (
            <EmptyState title="Nenhum lead em negociação no momento." className="m-4" />
          ) : (
            <ul
              className="divide-y divide-border-subtle"
              aria-label="Leads ordenados por sinal de fechamento"
            >
              {items.map((lead) => (
                <LinhaDoFechamento key={lead.id} lead={lead} dados={dados} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <Collapsible open={comoAberto} onOpenChange={setComoAberto}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-card p-3.5 text-left text-sm shadow-elev-1 hover:bg-accent/40"
          >
            <span className="min-w-0">
              <span className="font-semibold">Ver como o índice é calculado</span>
              <span className="text-muted-foreground">
                {" "}
                · etapa, temperatura, última interação e follow-up; calibrado com a taxa histórica
                quando há {dados.amostra_minima}+ entradas
              </span>
            </span>
            <CaretDown
              className={cn("h-4 w-4 shrink-0 transition-transform", comoAberto && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 rounded-xl border border-border-subtle bg-card p-4 text-sm text-muted-foreground">
          <p>
            O índice de 0–100 ordena sinais de foco e não é uma probabilidade individual ou uma
            garantia de venda. Quando há pelo menos {dados.amostra_minima} entradas maduras, ele usa
            a taxa histórica observada da etapa na carteira acessível e somente vendas aprovadas
            (horizonte de {dados.horizonte_conversao_dias} dias); com amostra menor, permanece
            explicitamente heurístico — a dica do selo Calibrado/Heurístico de cada lead mostra a
            taxa ou a amostra da etapa.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function LinhaDoFechamento({ lead, dados }: { lead: Sinal; dados: FechamentoResponse }) {
  const tone = LEAD_STATUS_BADGE_TONE[lead.status as LeadStatus];
  const waUrl = buildWhatsAppUrl(lead.telefone, `Olá ${lead.nome.split(" ")[0]}, tudo bem?`);
  const telHref = `tel:${lead.telefone.replace(/[^\d+]/g, "")}`;
  const calibrado = lead.metodo === "historico_calibrado";
  // Uma linha só: os fatores do índice, o empreendimento e a última conversa.
  const fatores = [
    lead.fatores.join(" · "),
    lead.projeto_nome,
    lead.ultima_interacao ? formatRelativeTime(lead.ultima_interacao) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // O nome é o link do dossiê e estica sobre a linha inteira (o "Abrir"
    // virou o clique na linha); selos com dica e os botões ficam por cima.
    <li className="relative flex items-center gap-3 px-4 py-3 hover:bg-accent/40 focus-within:bg-accent/40">
      <ScoreRing
        value={lead.indice}
        size={36}
        intent={lead.nivel === "alta" ? "success" : lead.nivel === "media" ? "warning" : "neutral"}
        title={`Índice de sinal de fechamento ${lead.indice} de 100`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to="/leads/$leadId"
            params={{ leadId: lead.id }}
            className="min-w-0 truncate font-semibold after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {lead.nome}
          </Link>
          <Badge variant="outline" className={cn("shrink-0", tone)}>
            {leadStatusLabel(lead.status)}
          </Badge>
          <Badge
            variant="outline"
            className="relative z-10 shrink-0 cursor-help"
            title={explicacaoDoMetodo(lead, dados)}
          >
            {calibrado ? "Calibrado" : "Heurístico"}
          </Badge>
          {lead.documentos_pendentes > 0 && (
            <Badge
              variant="secondary"
              className={cn("relative z-10 shrink-0 gap-1", INTENT_BADGE.warning)}
              title={`${lead.documentos_pendentes} documento(s) pendente(s) ou reprovado(s)`}
            >
              <FileDashed className="h-3 w-3" aria-hidden="true" />
              {lead.documentos_pendentes} doc
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{fatores}</p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1.5">
        <Button
          size="icon"
          variant="outline"
          aria-label={`Abrir WhatsApp de ${lead.nome}`}
          title="WhatsApp"
          onClick={() => window.open(waUrl, "_blank", "noopener,noreferrer")}
        >
          <WhatsappLogo className="h-4 w-4" aria-hidden="true" />
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
      </div>
    </li>
  );
}
