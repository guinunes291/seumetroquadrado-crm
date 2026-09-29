// Aba "Time": matriz corretor x fase (percentual dos obrigatórios concluídos),
// nível, selo Habilitado separando "por trilha" de "por decisão", atrasados e
// última atividade. Clicar abre a ficha do corretor na Academia.

import { useNavigate } from "@tanstack/react-router";
import { UsersThree } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataBr } from "../formato";
import { ROTULO_NIVEL } from "../niveis";
import { origemDoSelo, percentualPorFase, type OrigemSelo } from "./derivacao";
import { useEquipeAcademia } from "./gestao-client";

export function SeloOrigem({ origem }: { origem: OrigemSelo }) {
  if (origem === "trilha")
    return <StatusBadge intent="success">Habilitado pela trilha</StatusBadge>;
  if (origem === "decisao") return <StatusBadge intent="info">Habilitado por decisão</StatusBadge>;
  return <StatusBadge intent="neutral">Em formação</StatusBadge>;
}

function CelulaFase({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) {
    return <span className="text-muted-foreground">·</span>;
  }
  const cor =
    pct === 100
      ? "text-emerald-700 dark:text-emerald-400"
      : pct === 0
        ? "text-muted-foreground"
        : "";
  return <span className={`tabular-nums ${cor}`}>{pct}%</span>;
}

export function AbaTime() {
  const equipe = useEquipeAcademia();
  const navigate = useNavigate();

  if (equipe.isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar o time."
        error={equipe.error}
        onRetry={() => void equipe.refetch()}
      />
    );
  }
  if (equipe.isPending) return <Skeleton className="h-64 w-full" />;

  const { corretores, fases, faseStatus } = equipe.data;
  if (corretores.length === 0) {
    return (
      <EmptyState
        icon={UsersThree}
        title="Ninguém da sua equipe está na Academia ainda."
        description="Quem entra na trilha é decisão do admin, na aba Participantes."
      />
    );
  }
  const pct = percentualPorFase(faseStatus);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Corretor</TableHead>
            <TableHead>Nível</TableHead>
            <TableHead>Selo</TableHead>
            {fases.map((f) => (
              <TableHead key={f.numero} className="text-center" title={f.nome}>
                F{f.numero}
              </TableHead>
            ))}
            <TableHead className="text-right">Atrasados</TableHead>
            <TableHead>Última atividade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {corretores.map((c) => (
            <TableRow
              key={c.corretor_id}
              className="cursor-pointer"
              onClick={() =>
                void navigate({
                  to: "/academia/gestao/corretor/$corretorId",
                  params: { corretorId: c.corretor_id },
                })
              }
            >
              <TableCell className="font-medium">{c.corretor_nome}</TableCell>
              <TableCell>{ROTULO_NIVEL[c.nivel]}</TableCell>
              <TableCell>
                <SeloOrigem origem={origemDoSelo(c)} />
              </TableCell>
              {fases.map((f) => (
                <TableCell key={f.numero} className="text-center">
                  <CelulaFase pct={pct.get(c.corretor_id)?.get(f.numero)} />
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums">
                {c.modulos_atrasados > 0 ? (
                  <span className="font-semibold text-destructive">{c.modulos_atrasados}</span>
                ) : (
                  0
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {c.ultima_atividade ? dataBr(c.ultima_atividade) : "Nunca"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
