// Visão "Vendas" do hub de Desempenho: quem vendeu e quanto vale o que
// vendeu no período (VGV), com o funil de eventos do período.

import { useMemo } from "react";
import {
  CalendarCheck,
  ChartLineUp,
  CurrencyDollar,
  Flag,
  MapPin,
  Receipt,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { Podium } from "@/features/ranking/podium";
import { Medal } from "@/features/ranking/medal";
import {
  classificar,
  fmtBRL,
  fmtBRLCompacto,
  formatNum,
  funilConversao,
  type RankRow,
  type RankRowPosicionada,
  type Totais,
} from "./ranking-derive";
import {
  AvatarCorretor,
  FunilConversao,
  ListaRanking,
  MolduraPodio,
  Painel,
  VazioRanking,
  entradasPodio,
} from "./ranking-ui";

export function RankingVendas({
  ranking,
  totais,
  periodoLabel,
  loading,
}: {
  ranking: RankRow[];
  totais: Totais;
  periodoLabel: string;
  loading: boolean;
}) {
  const porVgv = useMemo(() => classificar(ranking, "vgv"), [ranking]);
  const funil = useMemo(() => funilConversao(totais), [totais]);

  const colunas = useMemo<ColumnDef<RankRowPosicionada, unknown>[]>(
    () => [
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
      {
        accessorKey: "vendas",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Vendas" />,
        meta: { label: "Vendas", align: "center" },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{formatNum(row.original.vendas)}</span>
        ),
      },
      {
        accessorKey: "vgv",
        header: ({ column }) => <DataTableColumnHeader column={column} title="VGV" />,
        meta: { label: "VGV", align: "right" },
        cell: ({ row }) => (
          <span className="font-display font-semibold tabular-nums text-success">
            {fmtBRL(row.original.vgv)}
          </span>
        ),
      },
      {
        id: "ticket",
        accessorFn: (r) => (r.vendas > 0 ? r.vgv / r.vendas : 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ticket médio" />,
        meta: { label: "Ticket médio", align: "right", hideBelow: "md" },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.vendas > 0 ? fmtBRL(row.original.vgv / row.original.vendas) : "—"}
          </span>
        ),
      },
      {
        id: "participacao",
        accessorFn: (r) => (totais.vgv > 0 ? r.vgv / totais.vgv : 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="% do VGV" />,
        meta: { label: "Participação no VGV", align: "right", hideBelow: "sm" },
        cell: ({ row }) => {
          const pct = totais.vgv > 0 ? (row.original.vgv / totais.vgv) * 100 : 0;
          return (
            <div className="flex items-center justify-end gap-2">
              <span className="tabular-nums">{pct.toFixed(1)}%</span>
              <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted md:block">
                <span
                  className={
                    row.original.pos === 1
                      ? "block h-full bg-gradient-gold"
                      : "block h-full bg-navy-400/60 dark:bg-navy-300/50"
                  }
                  style={{ width: `${pct}%` }}
                />
              </span>
            </div>
          );
        },
      },
    ],
    [totais.vgv],
  );

  return (
    <div className="stagger-children space-y-5">
      <StatGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
        <StatTile
          title="Vendas aprovadas"
          icon={Trophy}
          intent="success"
          value={totais.vendas}
          hint={periodoLabel}
          className="ring-1 ring-gold-500/40"
        />
        <StatTile
          title="VGV"
          icon={CurrencyDollar}
          intent="success"
          value={totais.vgv}
          formatValue={fmtBRLCompacto}
          hint={periodoLabel}
        />
        <StatTile
          title="Ticket médio"
          icon={Receipt}
          value={totais.ticketMedio}
          formatValue={fmtBRLCompacto}
          hint={totais.vendas > 0 ? "VGV ÷ vendas" : "sem vendas no período"}
        />
        <StatTile
          title="Visitas realizadas"
          icon={MapPin}
          intent="warning"
          value={totais.visitas}
          hint={periodoLabel}
        />
        <StatTile
          title="Agendamentos"
          icon={CalendarCheck}
          intent="info"
          value={totais.agendamentos}
          hint={periodoLabel}
        />
        <StatTile
          title="Corretores que venderam"
          icon={UsersThree}
          value={totais.corretoresComVenda}
          hint={`de ${formatNum(totais.corretoresAtivos)} ${totais.corretoresAtivos === 1 ? "ativo" : "ativos"}`}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        <Painel
          titulo="Pódio de VGV"
          icone={Trophy}
          descricao={periodoLabel}
          className="lg:col-span-2"
        >
          <MolduraPodio>
            <Podium
              entries={entradasPodio(porVgv, "vgv")}
              emptyMessage="Nenhuma venda aprovada no período"
            />
          </MolduraPodio>
        </Painel>
        <Painel titulo="Ranking de VGV" icone={Flag}>
          <ListaRanking
            rows={porVgv}
            criterio="vgv"
            max={15}
            vazio={
              <VazioRanking
                icone={Trophy}
                titulo="Nenhuma venda aprovada no período."
                descricao="Amplie o período no filtro ou aguarde a aprovação das vendas pendentes."
              />
            }
          />
        </Painel>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Painel
          titulo="Funil de conversão"
          icone={ChartLineUp}
          descricao={`Eventos de ${periodoLabel.toLowerCase()} · taxa em relação à etapa anterior`}
          className="lg:col-span-2"
        >
          <FunilConversao etapas={funil} />
        </Painel>
        <Painel
          titulo="VGV por corretor"
          icone={CurrencyDollar}
          descricao={periodoLabel}
          acao={<span className="text-success tabular-nums">Total: {fmtBRL(totais.vgv)}</span>}
          className="lg:col-span-3"
        >
          <DataTable
            tableId="ranking-vgv"
            aria-label="VGV por corretor no período"
            columns={colunas}
            data={porVgv}
            rowKey={(r) => r.corretorId}
            loading={loading}
            hideToolbar
            virtualizeOver={40}
            empty={
              <VazioRanking
                icone={CurrencyDollar}
                titulo="Nenhuma venda no período."
                descricao="Vendas aparecem aqui quando a gestão aprova o fechamento."
              />
            }
          />
        </Painel>
      </div>
    </div>
  );
}

export function Posicao({ pos }: { pos: number }) {
  return pos <= 3 ? (
    <Medal
      tier={pos === 1 ? "ouro" : pos === 2 ? "prata" : "bronze"}
      size="sm"
      title={`${pos}º lugar`}
    >
      {pos}
    </Medal>
  ) : (
    <span className="pl-2 font-semibold tabular-nums text-muted-foreground">{pos}º</span>
  );
}
