import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, GraduationCap, Info, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { exportRowsXlsx } from "@/lib/spreadsheets";
import { cn } from "@/lib/utils";
import { AtualizadoEm } from "./atualizado-em";
import { RaioXCorretor } from "./raio-x-corretor";
import {
  conversaoPct,
  mediasDoTime,
  performanceParaExport,
  SINAL_LABEL,
  sinalizar,
  type SinalCorretor,
} from "./performance-derive";
import { usePerformanceCorretores, type PerformanceRow } from "./queries";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

function SinalBadge({ sinal }: { sinal: SinalCorretor }) {
  if (!sinal) return null;
  const mentoria = sinal === "mentoria";
  const Icone = mentoria ? GraduationCap : Rocket;
  return (
    <Badge
      variant="outline"
      title={SINAL_LABEL[sinal]}
      className={cn(
        "gap-1 font-normal",
        mentoria ? "border-warning/50 text-warning" : "border-success/50 text-success",
      )}
    >
      <Icone className="h-3 w-3" />
      {mentoria ? "mentoria" : "dar lead"}
    </Badge>
  );
}

/**
 * Tela 4 — Time: tabela ranqueável com os 4 blocos (atividade, conversão,
 * resultado, capacidade) e o cruzamento esforço × conversão sinalizado.
 * Clique na linha abre o drill de 6 meses do corretor (?corretor= na URL).
 */
export function PerformanceView({
  corretorDrill,
  onDrillChange,
}: {
  corretorDrill: string | null;
  onDrillChange: (corretorId: string | null) => void;
}) {
  const [mes] = useState(() => new Date().toISOString().slice(0, 8) + "01");
  const perfQ = usePerformanceCorretores(mes);
  const rows = perfQ.data?.rows ?? [];
  const medias = useMemo(() => mediasDoTime(rows), [rows]);

  const exportar = async () => {
    try {
      await exportRowsXlsx(performanceParaExport(rows), {
        fileName: `performance-time-${mes.slice(0, 7)}`,
        sheetName: "Performance",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    }
  };

  const columns = useMemo<ColumnDef<PerformanceRow, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Corretor" />,
        meta: { label: "Corretor" },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="max-w-[180px] truncate font-medium">{row.original.nome}</span>
            <SinalBadge sinal={sinalizar(row.original, medias)} />
          </span>
        ),
      },
      // Bloco Atividade (esforço)
      {
        accessorKey: "leads_recebidos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Leads" />,
        meta: { label: "Leads recebidos", align: "right", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "contatos",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Contatos" />,
        meta: { label: "Contatos reais", align: "right", hideBelow: "sm", cellClassName: "tabular-nums" },
      },
      {
        id: "primeira_resposta",
        accessorFn: (r) => r.primeira_resposta_p50_min ?? Number.MAX_SAFE_INTEGER,
        header: ({ column }) => <DataTableColumnHeader column={column} title="1ª resp." />,
        meta: { label: "1ª resposta (p50)", align: "right", hideBelow: "lg", cellClassName: "tabular-nums" },
        cell: ({ row }) => (
          <span
            className="text-muted-foreground"
            title="Proxy: 1ª interação de contato do corretor no lead (não existe data_primeiro_contato)"
          >
            {row.original.primeira_resposta_p50_min != null
              ? `${row.original.primeira_resposta_p50_min} min`
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "tarefas_concluidas",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tarefas" />,
        meta: { label: "Tarefas concluídas", align: "right", hideBelow: "lg", cellClassName: "tabular-nums" },
      },
      // Bloco Conversão (eficiência)
      {
        accessorKey: "agendamentos_criados",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Agend." />,
        meta: { label: "Agendamentos", align: "right", hideBelow: "sm", cellClassName: "tabular-nums" },
      },
      {
        accessorKey: "visitas_realizadas",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Visitas" />,
        meta: { label: "Visitas realizadas", align: "right", hideBelow: "md", cellClassName: "tabular-nums" },
        cell: ({ row }) => (
          <span>
            {row.original.visitas_realizadas}
            {row.original.no_shows > 0 && (
              <span className="ml-1 text-xs text-destructive" title="No-shows">
                ({row.original.no_shows}ns)
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "analises",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Análises" />,
        meta: { label: "Análises", align: "right", hideBelow: "md", cellClassName: "tabular-nums" },
      },
      {
        id: "conversao",
        accessorFn: (r) => conversaoPct(r) ?? -1,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Conv." />,
        meta: { label: "Conversão lead→venda", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => {
          const conv = conversaoPct(row.original);
          return conv === null ? (
            <span className="text-muted-foreground" title="Amostra pequena (<5 leads)">
              —
            </span>
          ) : (
            <Badge variant="outline" title={`${row.original.vendas} de ${row.original.leads_recebidos} leads`}>
              {conv}%
            </Badge>
          );
        },
      },
      // Bloco Resultado
      {
        accessorKey: "vendas",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Vendas" />,
        meta: { label: "Vendas", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => (
          <span className="font-semibold text-success">{row.original.vendas}</span>
        ),
      },
      {
        accessorKey: "vgv",
        header: ({ column }) => <DataTableColumnHeader column={column} title="VGV" />,
        meta: { label: "VGV", align: "right", cellClassName: "tabular-nums" },
        cell: ({ row }) => <span>{row.original.vgv > 0 ? fmtBRL(row.original.vgv) : "—"}</span>,
      },
      // Bloco Capacidade
      {
        accessorKey: "carga_ativa",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Carga" />,
        meta: { label: "Carga ativa", align: "right", hideBelow: "sm", cellClassName: "tabular-nums" },
        cell: ({ row }) => {
          const cap = row.original.capacidade_pct;
          return (
            <span
              className={cn(cap != null && cap >= 100 && "font-semibold text-destructive")}
              title={
                cap != null
                  ? `${cap}% da capacidade configurada${row.original.presente ? " · presente" : ""}`
                  : undefined
              }
            >
              {row.original.carga_ativa}
              {cap != null && <span className="ml-1 text-xs text-muted-foreground">({cap}%)</span>}
            </span>
          );
        },
      },
    ],
    [medias],
  );

  if (corretorDrill) {
    return <RaioXCorretor corretorId={corretorDrill} onVoltar={() => onDrillChange(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Atividade · Conversão · Resultado · Capacidade — mês corrente. Clique na linha para o
          histórico de 6 meses.
          {perfQ.data?.degradado && (
            <span className="ml-2 text-warning">
              modo degradado: sem contatos/1ª resposta/VGV até aplicar as migrations.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AtualizadoEm quando={rows[0]?.atualizado_em} />
          <Button size="sm" variant="outline" onClick={exportar} disabled={rows.length === 0}>
            <Download className="mr-1 h-4 w-4" /> XLSX
          </Button>
        </div>
      </div>

      {perfQ.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : perfQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar a performance do time."
          error={perfQ.error}
          onRetry={() => perfQ.refetch()}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum corretor ativo no escopo.</p>
      ) : (
        <DataTable
          tableId="intel-performance"
          columns={columns}
          data={rows}
          onRowClick={(row: PerformanceRow) => onDrillChange(row.corretor_id)}
        />
      )}

      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3 shrink-0" />
        Sinalizações vs média do time (amostra mínima 5 leads): esforço alto + conversão baixa →
        mentoria; esforço baixo + conversão alta → dar mais lead. Ranking visível só para gestão.
      </p>
    </div>
  );
}
