// Aba Histórico — toda decisão do motor, com filtros e o contexto completo
// ("por que este corretor?": aptos, inaptos e motivos no momento da decisão).

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import {
  gatilhoLabel,
  motivoInaptidaoLabel,
  resumoDecisao,
  roletaLabel,
  RESULTADO_LABEL,
  ROLETA_LABEL,
} from "@/lib/distribuicao";
import {
  useDecisaoContexto,
  useHistoricoDistribuicao,
  useNomesPerfis,
  type LogLinha,
} from "./queries";

const TODOS = "__todos__";

export function TabHistorico() {
  const [roleta, setRoleta] = useState(TODOS);
  const [resultado, setResultado] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [dias, setDias] = useState("7");
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<LogLinha | null>(null);

  const q = useHistoricoDistribuicao({
    roleta: roleta === TODOS ? null : roleta,
    resultado: resultado === TODOS ? null : resultado,
    tipo: tipo === TODOS ? null : tipo,
    dias: Number(dias),
  });
  const nomesQ = useNomesPerfis();
  const nomes = nomesQ.data;

  const linhas = useMemo(
    () =>
      (q.data ?? []).filter((l) => {
        if (!busca.trim()) return true;
        const t = busca.trim().toLowerCase();
        return (
          (l.leads?.nome ?? "").toLowerCase().includes(t) ||
          (l.corretor_id ? (nomes?.get(l.corretor_id) ?? "").toLowerCase().includes(t) : false) ||
          (l.motivo ?? "").toLowerCase().includes(t)
        );
      }),
    [q.data, busca, nomes],
  );

  const columns = useMemo<ColumnDef<LogLinha, unknown>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Quando" />,
        meta: { label: "Quando", cellClassName: "whitespace-nowrap" },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {format(parseISO(row.original.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
          </span>
        ),
      },
      {
        id: "lead",
        accessorFn: (l) => l.leads?.nome ?? "(lead)",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lead" />,
        meta: { label: "Lead" },
        cell: ({ row }) => (
          <Link
            to="/leads/$leadId"
            params={{ leadId: row.original.lead_id }}
            className="font-medium hover:underline"
          >
            {row.original.leads?.nome ?? "(lead)"}
          </Link>
        ),
      },
      {
        id: "roleta",
        accessorFn: (l) => roletaLabel(l.roleta_slug),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Roleta" />,
        meta: { label: "Roleta", hideBelow: "md" },
        cell: ({ getValue }) => <span className="text-xs">{String(getValue())}</span>,
      },
      {
        id: "corretor",
        accessorFn: (l) => (l.corretor_id ? (nomes?.get(l.corretor_id) ?? "—") : "—"),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Corretor" />,
        meta: { label: "Corretor", hideBelow: "sm" },
        cell: ({ getValue }) => <span className="text-xs">{String(getValue())}</span>,
      },
      {
        accessorKey: "tipo",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
        meta: { label: "Tipo", hideBelow: "lg" },
        cell: ({ row }) => <span className="text-xs capitalize">{row.original.tipo}</span>,
      },
      {
        accessorKey: "resultado",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Resultado" />,
        meta: { label: "Resultado" },
        cell: ({ row }) => (
          <StatusBadge
            intent={
              row.original.resultado === "sucesso"
                ? "success"
                : row.original.resultado === "erro"
                  ? "danger"
                  : "warning"
            }
          >
            {RESULTADO_LABEL[row.original.resultado] ?? row.original.resultado}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "motivo",
        header: "Motivo",
        enableSorting: false,
        meta: { label: "Motivo", hideBelow: "lg" },
        cell: ({ row }) => (
          <span className="block max-w-72 truncate text-xs text-muted-foreground">
            {row.original.motivo ?? "—"}
          </span>
        ),
      },
      {
        id: "contexto",
        header: () => <span className="sr-only">Contexto da decisão</span>,
        enableSorting: false,
        enableHiding: false,
        size: 88,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setAlvo(row.original)}>
            Por quê?
          </Button>
        ),
      },
    ],
    [nomes],
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Distribuição"
        title={
          <span className="flex items-center gap-1.5">
            <History className="h-4 w-4 text-primary" /> Decisões do motor
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-8"
            placeholder="Lead, corretor ou motivo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={roleta} onValueChange={setRoleta}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as roletas</SelectItem>
            {Object.entries(ROLETA_LABEL).map(([slug, label]) => (
              <SelectItem key={slug} value={slug}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resultado} onValueChange={setResultado}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos resultados</SelectItem>
            <SelectItem value="sucesso">Distribuído</SelectItem>
            <SelectItem value="sem_corretor">Sem corretor</SelectItem>
            <SelectItem value="excecao">Exceção</SelectItem>
            <SelectItem value="erro">Erro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os tipos</SelectItem>
            <SelectItem value="automatica">Automática</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="redistribuicao">Redistribuição</SelectItem>
            <SelectItem value="inicial">Inicial</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24h</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        tableId="distribuicao-historico"
        aria-label="Histórico de decisões de distribuição"
        columns={columns}
        data={linhas}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => void q.refetch()}
        empty={
          <EmptyState
            icon={History}
            title="Nenhuma decisão no período/filtros"
            description="Ajuste os filtros ou aguarde novas distribuições."
          />
        }
      />

      <DecisaoContextoDialog alvo={alvo} onFechar={() => setAlvo(null)} nomes={nomes} />
    </div>
  );
}

function DecisaoContextoDialog({
  alvo,
  onFechar,
  nomes,
}: {
  alvo: LogLinha | null;
  onFechar: () => void;
  nomes: Map<string, string> | undefined;
}) {
  const ctxQ = useDecisaoContexto(alvo?.id ?? null);
  const d = resumoDecisao(ctxQ.data);

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Por que essa decisão?</DialogTitle>
          <DialogDescription>
            {alvo
              ? `${roletaLabel(alvo.roleta_slug)} · ${gatilhoLabel(d.gatilho)} · ` +
                format(parseISO(alvo.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
              : ""}
          </DialogDescription>
        </DialogHeader>

        {ctxQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : ctxQ.data == null ? (
          <p className="text-sm text-muted-foreground">
            Sem contexto registrado (decisão anterior à distribuição v3 ou ação manual direta).
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            {d.vencedor && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Escolhido
                </p>
                <StatusBadge intent="success">{d.vencedor.nome}</StatusBadge>
                <span className="ml-2 text-xs text-muted-foreground">
                  regra:{" "}
                  {d.regra === "rodizio_menos_recente" ? "há mais tempo sem receber" : d.regra}
                </span>
              </div>
            )}
            {d.corretorAnterior && (
              <p className="text-xs text-muted-foreground">
                Cliente já tinha corretor ({nomes?.get(d.corretorAnterior.corretor_id) ?? "—"}
                {d.corretorAnterior.ativo ? "" : " — inativo"}) · política: sempre nova roleta.
              </p>
            )}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Aptos no momento ({d.aptos.length})
              </p>
              {d.aptos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum corretor apto.</p>
              ) : (
                <ul className="space-y-1">
                  {d.aptos.map((a) => (
                    <li key={a.corretor_id} className="flex items-center justify-between text-xs">
                      <span>{a.nome}</span>
                      <span className="text-muted-foreground tabular-nums">
                        último lead:{" "}
                        {a.ultimo_lead_em
                          ? format(parseISO(a.ultimo_lead_em), "dd/MM HH:mm", { locale: ptBR })
                          : "nunca"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Inaptos no momento ({d.inaptos.length})
              </p>
              {d.inaptos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum.</p>
              ) : (
                <ul className="space-y-1">
                  {d.inaptos.map((i) => (
                    <li key={i.corretor_id} className="text-xs">
                      <span className="font-medium">{i.nome}</span>
                      <span className="text-muted-foreground">
                        {" — "}
                        {i.motivos.map(motivoInaptidaoLabel).join(", ")}
                        {typeof i.pct_trabalhado === "number"
                          ? ` (${i.pct_trabalhado}% trabalhado)`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {d.percentualMinimo != null && (
              <p className="text-xs text-muted-foreground">
                Percentual mínimo vigente na decisão: {d.percentualMinimo}%.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
