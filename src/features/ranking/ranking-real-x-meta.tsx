// Visão "Real x Meta" do hub de Desempenho: o mês contra a meta cadastrada.
// Meta do time = soma das metas individuais do escopo (regra do Metas &
// Ritmo), VGV pela meta_gmv cadastrada, comparação com o MESMO período do
// mês anterior e projeção por dia útil — tudo em ranking-derive.ts.

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  ChartBar,
  CurrencyDollar,
  FileText,
  MapPin,
  Star,
  Target,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/utils";
import {
  MESES_LONGOS,
  NIVEL_META_LABEL,
  classificar,
  fmtBRL,
  fmtBRLCompacto,
  formatNum,
  metaPrincipal,
  metaVgvCorretor,
  metasPorCorretor,
  pctMeta,
  projetarMes,
  variacaoPct,
  type CalendarioPacing,
  type JanelaComparavel,
  type MetaRow,
  type MetaTotais,
  type RankRow,
  type Totais,
} from "./ranking-derive";
import { AnelMeta, BarraMeta, ListaRanking, Painel, VazioRanking } from "./ranking-ui";

export function RankingRealXMeta({
  ano,
  mes,
  hoje,
  rankingMes,
  totaisMes,
  totaisMesAnterior,
  janelaAnterior,
  metas,
  metaTotais,
  calendario,
  podeGerirMetas,
}: {
  ano: number;
  mes: number;
  hoje: Date;
  rankingMes: RankRow[];
  totaisMes: Totais;
  totaisMesAnterior: Totais;
  janelaAnterior: JanelaComparavel;
  metas: MetaRow[];
  metaTotais: MetaTotais;
  calendario?: CalendarioPacing;
  podeGerirMetas: boolean;
}) {
  // Uma decisão só para anel, barra, gap, projeção (e para a celebração, na
  // página): a meta de vendas quando existe; senão a de VGV — o anel não pode
  // dizer "meta não definida" enquanto o bloco de VGV logo abaixo mostra 71%.
  const principal = useMemo(() => metaPrincipal(totaisMes, metaTotais), [totaisMes, metaTotais]);
  const { usaVgv, definida: metaDefinida, gap: gapPrincipal, pct: pctPrincipal } = principal;
  const realizadoPrincipal = principal.realizado;
  const metaPrincipalValor = principal.meta;
  const fmtPrincipal = usaVgv ? fmtBRLCompacto : formatNum;
  const pctVgv = pctMeta(totaisMes.vgv, metaTotais.vgv);
  const gapVgv = metaTotais.vgv - totaisMes.vgv;
  const projecao = useMemo(
    () =>
      projetarMes({
        realizado: realizadoPrincipal,
        meta: metaPrincipalValor,
        ano,
        mes,
        hoje,
        calendario,
      }),
    [realizadoPrincipal, metaPrincipalValor, ano, mes, hoje, calendario],
  );
  const topVendedores = useMemo(() => classificar(rankingMes, "vendas"), [rankingMes]);
  const rotuloComparacao = janelaAnterior.parcial
    ? `vs. mesmo período de ${MESES_LONGOS[janelaAnterior.mes - 1].toLowerCase()}`
    : `vs. ${MESES_LONGOS[janelaAnterior.mes - 1].toLowerCase()}`;

  // Real × meta por corretor (barra de VGV com a linha da meta individual).
  const porCorretor = useMemo(() => {
    const metasMap = metasPorCorretor(metas);
    const rows = rankingMes
      .filter((r) => r.vgv > 0 || r.vendas > 0 || metasMap.has(r.corretorId))
      .map((r) => {
        const meta = metasMap.get(r.corretorId);
        const metaVgv = metaVgvCorretor(meta, totaisMes.ticketMedio);
        return { ...r, metaVendas: meta?.vendas ?? 0, metaVgv };
      })
      .sort(
        (a, b) =>
          b.vgv - a.vgv ||
          b.vendas - a.vendas ||
          b.metaVgv.valor - a.metaVgv.valor ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
    const max = Math.max(...rows.map((r) => Math.max(r.vgv, r.metaVgv.valor)), 1);
    const usaTicket = rows.some((r) => r.metaVgv.origem === "ticket_medio");
    return { rows, max, usaTicket };
  }, [rankingMes, metas, totaisMes.ticketMedio]);

  const nomeMes = `${MESES_LONGOS[mes - 1]} de ${ano}`;
  const linkMetas = podeGerirMetas ? (
    <Link
      to="/painel-gestor"
      search={{ tab: "metas" }}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      cadastrar metas
    </Link>
  ) : null;

  return (
    <div className="stagger-children space-y-5">
      <Painel
        titulo={`${usaVgv ? "Meta de VGV" : "Meta de vendas"} — ${nomeMes}`}
        icone={Target}
        descricao={
          metaDefinida ? (
            <>
              {NIVEL_META_LABEL[metaTotais.nivel ?? "corretor"]}
              {metaTotais.nivel === "corretor" &&
                ` · ${metaTotais.linhas} ${metaTotais.linhas === 1 ? "corretor com meta" : "corretores com meta"}`}
              {usaVgv && " · sem meta em quantidade de vendas"}
            </>
          ) : (
            <>Nenhuma meta cadastrada para o mês{linkMetas ? <> — {linkMetas}</> : "."}</>
          )
        }
      >
        {usaVgv ? (
          <BarraMeta
            realizado={totaisMes.vgv}
            meta={metaTotais.vgv}
            unidade="de VGV"
            formatar={fmtBRLCompacto}
          />
        ) : (
          <BarraMeta realizado={totaisMes.vendas} meta={metaTotais.vendas} unidade="vendas" />
        )}
      </Painel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Painel titulo="Atingimento" icone={ChartBar}>
          <div className="flex flex-col items-center gap-4">
            <AnelMeta
              pct={pctPrincipal}
              metaDefinida={metaDefinida}
              label={usaVgv ? "da meta de VGV" : "da meta"}
            />
            <dl className="grid w-full grid-cols-2 gap-2 text-center">
              <MiniStat rotulo="Realizado" valor={fmtPrincipal(realizadoPrincipal)} />
              <MiniStat
                rotulo="Meta"
                valor={metaDefinida ? fmtPrincipal(metaPrincipalValor) : "—"}
              />
              <MiniStat
                rotulo="Gap"
                valor={
                  !metaDefinida
                    ? "—"
                    : gapPrincipal === 0
                      ? "0"
                      : `${gapPrincipal > 0 ? "−" : "+"}${fmtPrincipal(Math.abs(gapPrincipal))}`
                }
                tom={metaDefinida ? (gapPrincipal > 0 ? "danger" : "success") : "neutral"}
                ajuda={metaDefinida && gapPrincipal === 0 ? "meta batida em cheio" : undefined}
              />
              <MiniStat
                rotulo={projecao.posicao === "passado" ? "Fechamento" : "Projeção"}
                valor={
                  projecao.valor === null
                    ? "—"
                    : projecao.pctMeta === null
                      ? fmtPrincipal(Math.round(projecao.valor))
                      : `${projecao.pctMeta.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
                }
                tom={
                  projecao.pctMeta === null
                    ? "neutral"
                    : projecao.pctMeta >= 100
                      ? "success"
                      : projecao.pctMeta >= 80
                        ? "warning"
                        : "danger"
                }
                ajuda={
                  projecao.posicao === "atual"
                    ? `ritmo de ${projecao.diasUteisPassados} de ${projecao.diasUteis} dias úteis${
                        projecao.valor !== null
                          ? ` → ${usaVgv ? fmtBRLCompacto(projecao.valor) : `${formatNum(Math.round(projecao.valor))} vendas`}`
                          : ""
                      }`
                    : projecao.posicao === "futuro"
                      ? "mês ainda não começou"
                      : "mês encerrado"
                }
              />
            </dl>
          </div>
        </Painel>

        <Painel titulo="Indicadores do mês" icone={Star}>
          <StatGrid className="grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <StatTile
              title="Vendas aprovadas"
              icon={Trophy}
              intent="success"
              value={totaisMes.vendas}
              delta={variacaoPct(totaisMes.vendas, totaisMesAnterior.vendas)}
              deltaLabel={rotuloComparacao}
              hint={`${formatNum(totaisMesAnterior.vendas)} ${rotuloComparacao}`}
            />
            <StatTile
              title="VGV"
              icon={CurrencyDollar}
              intent="success"
              value={totaisMes.vgv}
              formatValue={fmtBRLCompacto}
              delta={variacaoPct(totaisMes.vgv, totaisMesAnterior.vgv)}
              deltaLabel={rotuloComparacao}
              hint={`ticket médio ${fmtBRLCompacto(totaisMes.ticketMedio)}`}
            />
            <StatTile
              title="Visitas realizadas"
              icon={MapPin}
              intent="warning"
              value={totaisMes.visitas}
              delta={variacaoPct(totaisMes.visitas, totaisMesAnterior.visitas)}
              deltaLabel={rotuloComparacao}
              hint={
                metaTotais.visitas > 0
                  ? `meta ${formatNum(metaTotais.visitas)} · ${Math.round(pctMeta(totaisMes.visitas, metaTotais.visitas))}%`
                  : `${formatNum(totaisMesAnterior.visitas)} ${rotuloComparacao}`
              }
            />
            <StatTile
              title="Agendamentos"
              icon={CalendarCheck}
              intent="info"
              value={totaisMes.agendamentos}
              delta={variacaoPct(totaisMes.agendamentos, totaisMesAnterior.agendamentos)}
              deltaLabel={rotuloComparacao}
              hint={`${formatNum(totaisMesAnterior.agendamentos)} ${rotuloComparacao}`}
            />
            <StatTile
              title="Leads recebidos"
              icon={UsersThree}
              value={totaisMes.leads}
              delta={variacaoPct(totaisMes.leads, totaisMesAnterior.leads)}
              deltaLabel={rotuloComparacao}
              // Mesma régua da Inteligência: pela data em que o lead chegou ao
              // corretor (distribuição). O dashboard conta pela criação.
              hint={`${formatNum(totaisMesAnterior.leads)} ${rotuloComparacao} · por data de distribuição`}
            />
            <StatTile
              title="Documentações"
              icon={FileText}
              value={totaisMes.documentacoes}
              delta={variacaoPct(totaisMes.documentacoes, totaisMesAnterior.documentacoes)}
              deltaLabel={rotuloComparacao}
              hint={`${formatNum(totaisMesAnterior.documentacoes)} ${rotuloComparacao}`}
            />
          </StatGrid>
        </Painel>

        <Painel titulo="Top vendedores do mês" icone={Trophy}>
          <ListaRanking
            rows={topVendedores}
            criterio="vendas"
            max={10}
            vazio={
              <VazioRanking
                icone={Trophy}
                titulo="Nenhuma venda aprovada no mês."
                descricao="Vendas entram aqui quando a gestão aprova o fechamento."
              />
            }
          />
        </Painel>
      </div>

      <Painel
        titulo="VGV — realizado × meta"
        icone={CurrencyDollar}
        descricao={
          metaTotais.vgv > 0
            ? `${NIVEL_META_LABEL[metaTotais.nivel ?? "corretor"]} (meta de VGV cadastrada)`
            : "Sem meta de VGV cadastrada para o mês."
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatTile
            title="VGV realizado"
            intent="success"
            value={totaisMes.vgv}
            formatValue={fmtBRL}
            hint={`${formatNum(totaisMes.vendas)} ${totaisMes.vendas === 1 ? "venda" : "vendas"}`}
          />
          <StatTile
            title="Meta de VGV"
            value={metaTotais.vgv > 0 ? fmtBRL(metaTotais.vgv) : "—"}
            hint={metaTotais.vgv > 0 ? `${pctVgv.toFixed(1)}% atingido` : "meta não definida"}
          />
          <StatTile
            title="Gap de VGV"
            intent={metaTotais.vgv > 0 ? (gapVgv > 0 ? "danger" : "success") : "neutral"}
            value={
              metaTotais.vgv > 0 ? `${gapVgv > 0 ? "−" : "+"}${fmtBRL(Math.abs(gapVgv))}` : "—"
            }
            hint={metaTotais.vgv > 0 ? (gapVgv > 0 ? "falta para a meta" : "acima da meta") : ""}
          />
        </div>
        {metaTotais.vgv > 0 && (
          <BarraMeta
            realizado={totaisMes.vgv}
            meta={metaTotais.vgv}
            unidade="de VGV"
            formatar={fmtBRLCompacto}
          />
        )}
      </Painel>

      <Painel
        titulo="Vendas por corretor — real × meta"
        icone={UsersThree}
        descricao={
          porCorretor.usaTicket
            ? "Todos os corretores com venda ou meta no mês. Linha = meta individual em VGV; sem meta de VGV cadastrada, usamos meta de vendas × ticket médio do mês."
            : "Todos os corretores com venda ou meta no mês. Linha = meta individual de VGV cadastrada."
        }
        acao={<span className="text-success tabular-nums">VGV total: {fmtBRL(totaisMes.vgv)}</span>}
      >
        {porCorretor.rows.length === 0 ? (
          <VazioRanking
            icone={UsersThree}
            titulo="Sem vendas nem metas neste mês."
            descricao="Escolha outro mês no filtro acima ou cadastre as metas do time."
          />
        ) : (
          <ol className="space-y-3">
            {porCorretor.rows.map((r) => {
              const largura = (r.vgv / porCorretor.max) * 100;
              const marco = r.metaVgv.valor > 0 ? (r.metaVgv.valor / porCorretor.max) * 100 : 0;
              const bateu = r.metaVgv.valor > 0 && r.vgv >= r.metaVgv.valor;
              return (
                <li key={r.corretorId}>
                  <div className="mb-1 flex flex-col gap-x-3 gap-y-0.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 truncate font-medium">{r.nome}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                      {r.metaVgv.valor > 0 && (
                        <span className="text-xs text-muted-foreground">
                          meta {fmtBRLCompacto(r.metaVgv.valor)}
                          {r.metaVendas > 0 &&
                            ` · ${r.metaVendas} ${r.metaVendas === 1 ? "venda" : "vendas"}`}
                        </span>
                      )}
                      <span
                        className={cn("font-display font-semibold", bateu ? "text-success" : "")}
                      >
                        <span className="sm:hidden">{fmtBRLCompacto(r.vgv)}</span>
                        <span className="hidden sm:inline">{fmtBRL(r.vgv)}</span>
                      </span>
                      <span className="w-6 text-right text-muted-foreground">{r.vendas}</span>
                    </span>
                  </div>
                  <div className="relative h-4 overflow-visible rounded-md bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-md transition-[width] duration-700 motion-reduce:transition-none",
                        bateu ? "bg-success" : "bg-navy-500 dark:bg-navy-300/60",
                      )}
                      style={{ width: `${Math.max(largura, 1.5)}%` }}
                    />
                    {marco > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-gold-500 shadow-[0_0_0_1px_var(--color-background)]"
                        style={{ left: `${Math.min(marco, 100)}%` }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Painel>
    </div>
  );
}

function MiniStat({
  rotulo,
  valor,
  tom = "neutral",
  ajuda,
}: {
  rotulo: string;
  valor: string;
  tom?: "success" | "warning" | "danger" | "neutral";
  ajuda?: string;
}) {
  const cor = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    neutral: "text-foreground",
  }[tom];
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className={cn("font-display text-lg font-semibold tabular-nums", cor)} title={ajuda}>
        {valor}
      </dd>
      {ajuda && <dd className="text-[11px] leading-tight text-muted-foreground">{ajuda}</dd>}
    </div>
  );
}
