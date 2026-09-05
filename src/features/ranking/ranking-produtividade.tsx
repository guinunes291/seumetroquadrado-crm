// Visão "Produtividade" do hub de Desempenho: a pontuação de atividade
// (ligações, WhatsApp, agendamentos, visitas, documentações, vendas × pesos
// de configuracao_pontuacao). A pontuação oficial é a do banco
// (atividades_diarias.pontuacao_total, somada pelo RPC); aqui ela é
// EXPLICADA — pesos vigentes à vista e composição quantidade × peso.

import { useMemo } from "react";
import {
  CalendarCheck,
  ChatText,
  FileText,
  Flag,
  MapPin,
  Phone,
  Pulse,
  Star,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { Podium } from "@/features/ranking/podium";
import {
  classificar,
  decomporPontos,
  escalaHeat,
  formatNum,
  pesosDivergem,
  type Pesos,
  type RankRow,
  type RankRowPosicionada,
  type Totais,
} from "./ranking-derive";
import { Posicao } from "./ranking-vendas";
import {
  AvatarCorretor,
  BarraComposicao,
  HeatCell,
  LegendaPontuacao,
  ListaRanking,
  MolduraPodio,
  Painel,
  VazioRanking,
  entradasPodio,
} from "./ranking-ui";

type ColunaHeat = "ligacoes" | "whatsapp" | "agendamentos" | "visitas" | "documentacoes" | "vendas";

export function RankingProdutividade({
  ranking,
  totais,
  pesos,
  mudancas,
  periodoLabel,
  loading,
}: {
  ranking: RankRow[];
  totais: Totais;
  pesos: Pesos | null;
  mudancas: Map<string, number>;
  periodoLabel: string;
  loading: boolean;
}) {
  const porPontos = useMemo(() => classificar(ranking, "pontos"), [ranking]);
  const divergem = useMemo(() => pesosDivergem(ranking, pesos), [ranking, pesos]);

  const heat = useMemo(() => {
    const col = (k: ColunaHeat) => escalaHeat(porPontos.map((r) => r[k]));
    return {
      ligacoes: col("ligacoes"),
      whatsapp: col("whatsapp"),
      agendamentos: col("agendamentos"),
      visitas: col("visitas"),
      documentacoes: col("documentacoes"),
      vendas: col("vendas"),
    };
  }, [porPontos]);

  const composicao = useMemo(() => {
    if (!pesos) return [];
    const topo = Math.max(porPontos[0]?.pontos ?? 0, 1);
    return porPontos.slice(0, 10).map((r) => ({
      row: r,
      parcelas: decomporPontos(r, pesos),
      largura: (r.pontos / topo) * 100,
    }));
  }, [porPontos, pesos]);

  const colunas = useMemo<ColumnDef<RankRowPosicionada, unknown>[]>(() => {
    const heatCol = (
      key: ColunaHeat,
      titulo: string,
      label: string,
      hideBelow?: "sm" | "md" | "lg",
    ) => ({
      accessorKey: key,
      header: ({
        column,
      }: {
        column: Parameters<typeof DataTableColumnHeader<RankRowPosicionada, unknown>>[0]["column"];
      }) => <DataTableColumnHeader column={column} title={titulo} />,
      meta: { label, align: "center" as const, hideBelow },
      cell: ({ row }: { row: { original: RankRowPosicionada } }) => (
        <HeatCell value={row.original[key]} heat={heat[key](row.original[key])} />
      ),
    });
    return [
      {
        accessorKey: "pos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
        meta: { label: "Posição" },
        size: 56,
        cell: ({ row }) => <Posicao pos={row.original.pos} />,
      },
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Corretor" />,
        meta: { label: "Corretor" },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <AvatarCorretor nome={row.original.nome} foto={row.original.foto} className="h-7 w-7" />
            <span className="font-medium">{row.original.nome}</span>
          </div>
        ),
      },
      heatCol("ligacoes", "Lig.", "Ligações", "md"),
      heatCol("whatsapp", "WhatsApp", "WhatsApp", "md"),
      heatCol("agendamentos", "Agend.", "Agendamentos", "sm"),
      heatCol("visitas", "Visitas", "Visitas", "sm"),
      heatCol("documentacoes", "Docs", "Documentações", "lg"),
      heatCol("vendas", "Vendas", "Vendas"),
      {
        accessorKey: "pontos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pontos" />,
        meta: { label: "Pontos", align: "right" },
        cell: ({ row }) => (
          <span className="font-display font-semibold tabular-nums">
            {formatNum(row.original.pontos)}
          </span>
        ),
      },
    ];
  }, [heat]);

  return (
    <div className="stagger-children space-y-5">
      <StatGrid className="grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8">
        <StatTile
          title="Pontos do time"
          icon={Star}
          intent="warning"
          value={totais.pontos}
          hint={periodoLabel}
          className="ring-1 ring-gold-500/40"
        />
        <StatTile
          title="Ligações"
          icon={Phone}
          intent="info"
          value={totais.ligacoes}
          hint={periodoLabel}
        />
        <StatTile
          title="WhatsApp"
          icon={ChatText}
          intent="info"
          value={totais.whatsapp}
          hint={periodoLabel}
        />
        <StatTile
          title="Agendamentos"
          icon={CalendarCheck}
          value={totais.agendamentos}
          hint={periodoLabel}
        />
        <StatTile
          title="Visitas"
          icon={MapPin}
          intent="warning"
          value={totais.visitas}
          hint={periodoLabel}
        />
        <StatTile
          title="Documentações"
          icon={FileText}
          value={totais.documentacoes}
          hint={periodoLabel}
        />
        <StatTile
          title="Vendas"
          icon={Trophy}
          intent="success"
          value={totais.vendas}
          hint={periodoLabel}
        />
        <StatTile
          title="Corretores ativos"
          icon={UsersThree}
          value={totais.corretoresAtivos}
          hint={
            totais.corretoresAtivos > 0
              ? `média ${formatNum(Math.round(totais.pontos / totais.corretoresAtivos))} pts`
              : "sem atividade"
          }
        />
      </StatGrid>

      {pesos && (
        <Painel
          titulo="Como pontua"
          icone={Pulse}
          descricao="Pesos vigentes, lidos da configuração. Cada atividade registrada no CRM vale isto; a pontuação é calculada no banco, dia a dia."
        >
          <LegendaPontuacao pesos={pesos} divergem={divergem} />
        </Painel>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Painel
          titulo="Pódio de pontuação"
          icone={Star}
          descricao={periodoLabel}
          className="lg:col-span-2"
        >
          <MolduraPodio>
            <Podium
              entries={entradasPodio(porPontos, "pontos")}
              emptyMessage="Sem atividade no período"
            />
          </MolduraPodio>
        </Painel>
        <Painel
          titulo="Ranking"
          icone={Flag}
          descricao="Desempate por vendas e VGV; empate total divide a posição"
        >
          <ListaRanking
            rows={porPontos}
            criterio="pontos"
            mudancas={mudancas}
            max={15}
            vazio={
              <VazioRanking
                icone={Pulse}
                titulo="Sem atividade no período."
                descricao="Ligações, mensagens, agendamentos, visitas, documentações e vendas registradas no CRM aparecem aqui."
              />
            }
          />
        </Painel>
      </div>

      {pesos && composicao.length > 0 && (
        <Painel
          titulo="Composição da pontuação"
          icone={Star}
          descricao="Quanto cada tipo de atividade rendeu para os 10 primeiros (quantidade × peso vigente)."
        >
          <ol className="space-y-2.5">
            {composicao.map(({ row, parcelas, largura }) => (
              <li
                key={row.corretorId}
                className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="w-6 shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">
                    {row.pos}º
                  </span>
                  <AvatarCorretor nome={row.nome} foto={row.foto} className="h-6 w-6" />
                  <span className="truncate font-medium">{row.nome}</span>
                </span>
                <BarraComposicao parcelas={parcelas} total={row.pontos} largura={largura} />
                <span className="font-display w-16 text-right text-sm font-semibold tabular-nums">
                  {formatNum(row.pontos)}
                </span>
              </li>
            ))}
          </ol>
        </Painel>
      )}

      <Painel
        titulo="Desempenho detalhado"
        icone={Pulse}
        descricao="Cor por quartil da coluna: quem está acima da mediana e do 3º quartil do time."
      >
        <DataTable
          tableId="ranking"
          aria-label="Classificação completa de produtividade"
          columns={colunas}
          data={porPontos}
          rowKey={(r) => r.corretorId}
          loading={loading}
          virtualizeOver={40}
          empty={
            <VazioRanking
              icone={Pulse}
              titulo="Sem atividade no período."
              descricao="Ajuste o período no filtro acima para ver a classificação."
            />
          }
        />
      </Painel>
    </div>
  );
}
