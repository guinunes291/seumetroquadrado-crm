// Copa SMQ — classificação geral premium: DataTable (tableId "copa") no lugar
// da grade de divs. As linhas chegam prontas do RPC copa_ranking; nenhuma
// regra de pontuação vive aqui.

import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Medal } from "@/features/ranking/medal";
import { shortName } from "@/lib/copa";
import { GREEN, type ConfigPonto, type CopaRankRow } from "./copa-ui";

type Linha = CopaRankRow & { pos: number };

export function CopaClassificacao({
  ranking,
  myId,
  config,
  loading,
}: {
  ranking: CopaRankRow[];
  myId: string | null;
  config: ConfigPonto[];
  loading?: boolean;
}) {
  const rows = useMemo<Linha[]>(() => ranking.map((r, idx) => ({ ...r, pos: idx + 1 })), [ranking]);

  const columns = useMemo<ColumnDef<Linha, unknown>[]>(
    () => [
      {
        accessorKey: "pos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
        meta: { label: "Posição" },
        size: 56,
        cell: ({ row }) =>
          row.original.pos <= 3 ? (
            <Medal
              tier={row.original.pos === 1 ? "ouro" : row.original.pos === 2 ? "prata" : "bronze"}
              size="sm"
              title={`${row.original.pos}º lugar`}
            >
              {row.original.pos}
            </Medal>
          ) : (
            <span className="pl-2 font-semibold tabular-nums text-muted-foreground">
              {row.original.pos}
            </span>
          ),
      },
      {
        id: "selecao",
        accessorFn: (r) => r.selecao_nome ?? shortName(r.nome),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Seleção / Corretor" />
        ),
        meta: { label: "Seleção / Corretor" },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-2xl leading-none">{row.original.bandeira}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {row.original.selecao_nome ?? "Sem seleção"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {shortName(row.original.nome)}
                {row.original.corretor_id === myId && (
                  <span className="ml-1.5 font-semibold" style={{ color: GREEN }}>
                    ● Você
                  </span>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "total_agendamentos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="📅 Agend." />,
        meta: { label: "Agendamentos", align: "center", hideBelow: "sm" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.total_agendamentos}</span>,
      },
      {
        accessorKey: "total_visitas",
        header: ({ column }) => <DataTableColumnHeader column={column} title="🏠 Visitas" />,
        meta: { label: "Visitas", align: "center", hideBelow: "sm" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.total_visitas}</span>,
      },
      {
        accessorKey: "total_documentacao",
        header: ({ column }) => <DataTableColumnHeader column={column} title="📄 Docs" />,
        meta: { label: "Documentações", align: "center", hideBelow: "md" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.total_documentacao}</span>,
      },
      {
        accessorKey: "total_vendas",
        header: ({ column }) => <DataTableColumnHeader column={column} title="✅ Vendas" />,
        meta: { label: "Vendas", align: "center" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.total_vendas}</span>,
      },
      {
        accessorKey: "total_pontos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
        meta: { label: "Total de pontos", align: "right" },
        cell: ({ row }) => (
          <span className="font-display text-base font-bold tabular-nums" style={{ color: GREEN }}>
            {row.original.total_pontos}
          </span>
        ),
      },
    ],
    [myId],
  );

  return (
    <div>
      <SectionHeader eyebrow="Classificação" title="Tabela de Pontuação Geral" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        {config.map((p) => (
          <div
            key={p.chave}
            style={{
              background: "rgba(0,156,59,0.1)",
              border: "1px solid rgba(0,156,59,0.3)",
              borderRadius: 8,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{p.label}</span>
            <span
              className="font-display tabular-nums"
              style={{ color: GREEN, fontSize: 16, fontWeight: 900 }}
            >
              +{p.pontos} pts
            </span>
          </div>
        ))}
      </div>
      <DataTable
        tableId="copa"
        aria-label="Classificação geral da Copa"
        columns={columns}
        data={rows}
        rowKey={(r) => r.corretor_id}
        loading={loading}
        rowClassName={(r) => (r.corretor_id === myId ? "bg-[rgba(0,156,59,0.08)]" : undefined)}
        empty={
          <EmptyState
            icon={Trophy}
            title="Nenhuma pontuação ainda."
            description="Os pontos aparecem aqui assim que a primeira semana for lançada."
          />
        }
      />
    </div>
  );
}
