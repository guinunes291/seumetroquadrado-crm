// Quadro do dia (gestão): quem está em cada filial, quem está em casa (e se
// isso libera a roleta) e quem ainda não fez check-in. Admin e gestor também
// confirmam o check-in de alguém numa filial (o corretor sem celular no
// plantão); superintendente só lê.

import {
  DotsThreeVertical,
  House,
  Storefront,
  UserCheck,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCheckinPelaGestao, useFiliais, usePresencaHoje } from "./presenca-client";
import {
  agruparQuadro,
  localizacaoLabel,
  resumoQuadro,
  type ColunaQuadro,
  type PresencaHojeRow,
} from "./presenca-derive";

const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : null;

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function PresencaQuadro({ podeOperar }: { podeOperar: boolean }) {
  const hojeQ = usePresencaHoje(true);
  const filiaisQ = useFiliais();
  const filiaisAtivas = (filiaisQ.data ?? []).filter((f) => f.ativa);

  if (hojeQ.isLoading || filiaisQ.isLoading) return <Skeleton className="h-80 w-full" />;
  if (hojeQ.isError || filiaisQ.isError) {
    return (
      <QueryErrorState
        title="Não foi possível carregar a presença de hoje."
        error={hojeQ.error ?? filiaisQ.error}
        onRetry={() => {
          void hojeQ.refetch();
          void filiaisQ.refetch();
        }}
      />
    );
  }

  const rows = hojeQ.data ?? [];
  const resumo = resumoQuadro(rows);
  const colunas = agruparQuadro(rows, filiaisAtivas);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          title="Na roleta agora"
          value={resumo.naRoleta}
          icon={UserCheck}
          intent="success"
        />
        <StatTile
          title="No plantão (filiais)"
          value={resumo.naFilial}
          icon={Storefront}
          intent="info"
        />
        <StatTile
          title="Em casa, fora da roleta"
          value={resumo.emCasaForaDaRoleta}
          icon={House}
          intent={resumo.emCasaForaDaRoleta > 0 ? "warning" : "neutral"}
          hint="Abaixo do mínimo de vendas do mês anterior"
        />
        <StatTile
          title="Sem check-in"
          value={resumo.semCheckin}
          icon={Warning}
          intent={resumo.semCheckin > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {colunas.map((col) => (
          <Coluna
            key={col.chave}
            coluna={col}
            filiais={filiaisAtivas.map((f) => ({ slug: f.slug, nome: f.nome }))}
            podeOperar={podeOperar}
          />
        ))}
      </div>
    </div>
  );
}

function Coluna({
  coluna,
  filiais,
  podeOperar,
}: {
  coluna: ColunaQuadro;
  filiais: { slug: string; nome: string }[];
  podeOperar: boolean;
}) {
  const Icone = coluna.chave.startsWith("filial:")
    ? Storefront
    : coluna.chave === "casa"
      ? House
      : Users;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Icone className="h-4 w-4 text-primary" /> {coluna.titulo}
          </span>
          <StatusBadge intent="neutral">{coluna.corretores.length}</StatusBadge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {coluna.corretores.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ninguém aqui.</p>
        ) : (
          coluna.corretores.map((r) => (
            <LinhaCorretor key={r.corretor_id} r={r} filiais={filiais} podeOperar={podeOperar} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function LinhaCorretor({
  r,
  filiais,
  podeOperar,
}: {
  r: PresencaHojeRow;
  filiais: { slug: string; nome: string }[];
  podeOperar: boolean;
}) {
  const checkin = useCheckinPelaGestao();
  const aberto = r.modo !== null && r.encerrado_em === null;
  const evidencia = r.modo === "loja" ? localizacaoLabel(r.localizacao, r.distancia_m) : null;
  const casaBloqueada = aberto && r.modo === "casa" && !r.apto_roleta;

  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <Avatar className="h-8 w-8">
        {r.avatar_url && <AvatarImage src={r.avatar_url} alt="" />}
        <AvatarFallback className="text-xs">{iniciais(r.nome)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.nome}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {aberto ? (
            r.presente ? (
              <StatusBadge intent="success">Na roleta</StatusBadge>
            ) : (
              <StatusBadge intent="warning">Fora da roleta</StatusBadge>
            )
          ) : r.encerrado_em ? (
            <span>Saiu às {hora(r.encerrado_em)}</span>
          ) : null}
          {aberto && r.checkin_em && <span>desde {hora(r.checkin_em)}</span>}
          <span title="Vendas aprovadas no mês anterior / meta para trabalhar de casa">
            · {r.vendas_mes_anterior}/{r.vendas_minimas} vendas no mês anterior
          </span>
          {casaBloqueada && <span className="text-warning">· abaixo do mínimo</span>}
          {evidencia && <StatusBadge intent={evidencia.intent}>{evidencia.texto}</StatusBadge>}
        </div>
      </div>
      {podeOperar && filiais.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label={`Ações de presença de ${r.nome}`}
              disabled={checkin.isPending}
            >
              <DotsThreeVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Confirmar no plantão</DropdownMenuLabel>
            {filiais.map((f) => (
              <DropdownMenuItem
                key={f.slug}
                onSelect={() =>
                  checkin.mutate({ corretorId: r.corretor_id, filial: f.slug, nome: r.nome })
                }
              >
                <Storefront className="mr-2 h-4 w-4" /> {f.nome}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
