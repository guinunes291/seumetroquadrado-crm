// O topo da aba Dia na identidade Lançamento (como no vídeo de lançamento):
// à esquerda, os quatro números do mês e as vendas das últimas 12 semanas; à
// direita, as três exceções mais graves, com o feed completo logo abaixo
// (#excecoes). Sem consulta nova: os números são os do dashboard
// (dashboard_kpis, dashboard_serie_diaria) e as exceções, o mesmo feed da aba.

import { useMemo } from "react";
import { ArrowDown } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { agoraSaoPaulo } from "@/lib/periodo";
import { useDashboardKpis, useDashboardSerie } from "@/features/dashboard/queries";
import { detalheLegivel, TIPO_META, type PainelDia } from "./derive";
import { conversaoDoMes, inicioDasSemanas, vendasPorSemana } from "./dia-resumo";

const moedaCompacta = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

const BORDA_INTENT: Record<string, string> = {
  danger: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-info",
};

function Kpi({
  rotulo,
  valor,
  dica,
  carregando,
}: {
  rotulo: string;
  valor: string;
  dica?: string;
  carregando: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground"
      title={dica}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {rotulo}
      </p>
      {carregando ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className="mt-1 font-display text-2xl font-bold tabular-nums tracking-tight">{valor}</p>
      )}
    </div>
  );
}

export function DiaTopo({ painel }: { painel: PainelDia }) {
  // Instantes completos, fixados na montagem (a chave do cache não pode mudar
  // a cada render) — o mesmo padrão do painel de insights.
  const { mes, semanas, agoraSP } = useMemo(() => {
    const agora = new Date();
    const sp = agoraSaoPaulo(agora);
    return {
      agoraSP: sp,
      mes: {
        di: new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString(),
        df: agora.toISOString(),
      },
      semanas: { di: inicioDasSemanas(sp).toISOString(), df: agora.toISOString() },
    };
  }, []);
  const kpisQ = useDashboardKpis(mes, null);
  const serieQ = useDashboardSerie(semanas, null);
  const k = kpisQ.data;
  const barras = useMemo(() => vendasPorSemana(serieQ.data ?? [], agoraSP), [serieQ.data, agoraSP]);
  const maxBarra = Math.max(1, ...barras.map((b) => b.vendas));
  const conversao = k ? conversaoDoMes(k.contrato_fechado, k.total) : null;
  const top = painel.excecoes.slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            rotulo="Vendas no mês"
            valor={k ? String(k.contrato_fechado) : "—"}
            carregando={kpisQ.isPending}
          />
          <Kpi rotulo="VGV" valor={k ? moedaCompacta(k.vgv) : "—"} carregando={kpisQ.isPending} />
          <Kpi
            rotulo="Visitas no mês"
            valor={k ? String(k.visitas_periodo) : "—"}
            dica="Visitas realizadas (validadas), no dia em que estavam marcadas."
            carregando={kpisQ.isPending}
          />
          <Kpi
            rotulo="Conversão"
            valor={conversao == null ? "—" : `${conversao.toLocaleString("pt-BR")}%`}
            dica="Vendas do mês ÷ leads que entraram no mês — leitura do mês, não coorte."
            carregando={kpisQ.isPending}
          />
        </div>

        <section
          aria-label="Vendas das últimas 12 semanas"
          className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground md:p-5"
        >
          <h2 className="font-display text-lg font-bold">Vendas · últimas 12 semanas</h2>
          {serieQ.isPending ? (
            <Skeleton className="mt-4 h-36 w-full" />
          ) : serieQ.isError ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Não foi possível carregar as vendas por semana agora.
            </p>
          ) : (
            <ol className="mt-4 flex h-36 items-end gap-1.5 sm:gap-2">
              {barras.map((b) => (
                <li
                  key={b.inicio}
                  data-testid="barra-semana"
                  data-atual={b.atual || undefined}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  aria-label={`Semana de ${b.inicio.slice(8, 10)}/${b.inicio.slice(5, 7)}: ${b.vendas} ${b.vendas === 1 ? "venda" : "vendas"}${b.atual ? " (em andamento)" : ""}`}
                >
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {b.vendas > 0 ? b.vendas : ""}
                  </span>
                  <span
                    className={cn(
                      "w-full rounded-t-md",
                      b.vendas === 0
                        ? "bg-muted"
                        : b.atual
                          ? "bg-gradient-gold"
                          : "bg-primary dark:bg-navy-300",
                    )}
                    style={{ height: `${Math.max(4, (b.vendas / maxBarra) * 100)}%` }}
                  />
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Por semana de assinatura, de segunda a domingo; a última (em dourado) ainda está em
            andamento.
          </p>
        </section>
      </div>

      <section
        aria-label="Exceções"
        className="flex flex-col rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground md:p-5"
      >
        <h2 className="font-display text-lg font-bold">Exceções</h2>
        <p className="text-xs text-muted-foreground">ordenadas por severidade e R$</p>
        {top.length === 0 ? (
          <p className="mt-4 flex-1 text-sm text-muted-foreground">
            Nenhuma exceção agora — operação em dia.
          </p>
        ) : (
          <ul className="mt-3 flex-1 space-y-2">
            {top.map((e) => {
              const meta = TIPO_META[e.tipo];
              return (
                <li
                  key={`${e.tipo}:${e.lead_id}`}
                  data-testid="excecao-topo"
                  className={cn(
                    "rounded-lg border border-l-4 border-border-subtle px-3 py-2",
                    BORDA_INTENT[meta.intent],
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{meta.label}</span>
                    {e.valor_potencial != null && e.valor_potencial > 0 && (
                      <span
                        className="shrink-0 text-sm font-semibold tabular-nums"
                        title="Valor potencial estimado (preço 'a partir de' do projeto)"
                      >
                        −{moedaCompacta(e.valor_potencial)}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.lead_nome}
                    {detalheLegivel(e) ? ` · ${detalheLegivel(e)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {painel.resumo.total > 0 && (
          <a
            href="#excecoes"
            className="mt-3 inline-flex items-center gap-1 self-start rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Ver todas ({painel.resumo.total}) <ArrowDown className="h-3.5 w-3.5" />
          </a>
        )}
      </section>
    </div>
  );
}
