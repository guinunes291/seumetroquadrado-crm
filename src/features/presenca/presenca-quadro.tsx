// Quadro do dia (gestão): quem está em cada filial, quem está em casa (e se
// isso libera a roleta) e quem ainda não fez check-in. Admin e gestor também
// confirmam o check-in de alguém numa filial (o corretor sem celular no
// plantão); superintendente só lê.
//
// A própria linha (gestor que também é corretor): sem "Confirmar no plantão".
// A gestão não confirma a si mesma — o banco trata esse check-in como o do
// próprio corretor (presenca_checkin: _por_gestao só quando o alvo é OUTRA
// pessoa) e, sem coordenada, com a exigência ligada ele saía BARRADO "sem
// localização": fora das roletas e do reforço no dia. No lugar, "Meu
// check-in" leva ao card de check-in da página, com a localização do celular.
//
// Barrado pela localização: fica na coluna da filial que escolheu, com o
// porquê no selo, mas fora do número do cabeçalho (o selo "N barrados" ao
// lado) — a soma das colunas bate com o tile "No plantão (filiais)". Quem foi
// barrado e trocou para "Em casa" ganha o sinal "fora do reforço hoje".

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
import { useAuth } from "@/hooks/use-auth";
import {
  diaSaoPauloHoje,
  useCheckinPelaGestao,
  useCheckinsDoDia,
  useFiliais,
  usePresencaHoje,
} from "./presenca-client";
import {
  agruparQuadro,
  barradoPelaLocalizacao,
  barradosSemDestrave,
  localizacaoLabel,
  resumoQuadro,
  statusRoletaLinha,
  type ColunaQuadro,
  type PresencaHojeRow,
} from "./presenca-derive";
import { pedirCheckin } from "./use-checkin-obrigatorio";

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
  // Só para o sinal "fora do reforço hoje": se falhar, o quadro segue sem ele.
  const doDiaQ = useCheckinsDoDia(true, { dia: diaSaoPauloHoje() });
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
  const foraDoReforco = barradosSemDestrave(doDiaQ.data ?? []);

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
          hint={
            resumo.barradosLocalizacao > 0
              ? `Fora da conta: ${resumo.barradosLocalizacao} barrado${resumo.barradosLocalizacao === 1 ? "" : "s"} pela localização`
              : undefined
          }
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
            foraDoReforco={foraDoReforco}
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
  foraDoReforco,
}: {
  coluna: ColunaQuadro;
  filiais: { slug: string; nome: string }[];
  podeOperar: boolean;
  foraDoReforco: Set<string>;
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
          <span className="flex items-center gap-1" data-testid={`contagem-${coluna.chave}`}>
            <StatusBadge intent="neutral">{coluna.validos}</StatusBadge>
            {coluna.barrados > 0 && (
              <StatusBadge intent="danger">
                {coluna.barrados} barrado{coluna.barrados === 1 ? "" : "s"}
              </StatusBadge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {coluna.corretores.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ninguém aqui.</p>
        ) : (
          coluna.corretores.map((r) => (
            <LinhaCorretor
              key={r.corretor_id}
              r={r}
              filiais={filiais}
              podeOperar={podeOperar}
              foraDoReforco={foraDoReforco.has(r.corretor_id)}
            />
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
  foraDoReforco,
}: {
  r: PresencaHojeRow;
  filiais: { slug: string; nome: string }[];
  podeOperar: boolean;
  /** Barrado pela localização hoje, sem destrave depois. */
  foraDoReforco: boolean;
}) {
  const checkin = useCheckinPelaGestao();
  const { user } = useAuth();
  // A própria linha: a gestão não confirma a si mesma (ver o topo do arquivo).
  const propria = !!user && r.corretor_id === user.id;
  const aberto = r.modo !== null && r.encerrado_em === null;
  // Barrado pela localização: o selo já diz a distância (ou "sem localização").
  const status = statusRoletaLinha(r);
  const evidencia =
    r.modo === "loja" && !barradoPelaLocalizacao(r)
      ? localizacaoLabel(r.localizacao, r.distancia_m)
      : null;
  const casaBloqueada = aberto && r.modo === "casa" && !r.apto_roleta;
  // O barrado já diz que está fora; em casa depois de barrado, o reforço não volta.
  const semReforco = aberto && r.modo === "casa" && foraDoReforco;

  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <Avatar className="h-8 w-8">
        {r.avatar_url && <AvatarImage src={r.avatar_url} alt="" />}
        <AvatarFallback className="text-xs">{iniciais(r.nome)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {r.nome}
          {propria && <span className="font-normal text-muted-foreground"> (você)</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {status ? (
            <StatusBadge intent={status.intent}>{status.texto}</StatusBadge>
          ) : r.encerrado_em ? (
            <span>Saiu às {hora(r.encerrado_em)}</span>
          ) : null}
          {aberto && r.checkin_em && <span>desde {hora(r.checkin_em)}</span>}
          <span title="Vendas aprovadas no mês anterior / meta para trabalhar de casa">
            · {r.vendas_mes_anterior}/{r.vendas_minimas} vendas no mês anterior
          </span>
          {casaBloqueada && <span className="text-warning">· abaixo do mínimo</span>}
          {semReforco && (
            <span title="Barrado pela localização numa filial hoje: fora do reforço até um check-in na loja que valha (ou a liberação da gestão)">
              <StatusBadge intent="warning">fora do reforço hoje</StatusBadge>
            </span>
          )}
          {evidencia && <StatusBadge intent={evidencia.intent}>{evidencia.texto}</StatusBadge>}
        </div>
      </div>
      {podeOperar && propria ? (
        // O card de check-in da página atende o pedido (rola até ele e foca):
        // é lá que o celular confere a localização.
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          title="O seu check-in é pelo card de check-in, com a localização do celular"
          onClick={() => pedirCheckin({ acao: "abrir", origem: "quadro" })}
        >
          Meu check-in
        </Button>
      ) : podeOperar && filiais.length > 0 ? (
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
      ) : null}
    </div>
  );
}
