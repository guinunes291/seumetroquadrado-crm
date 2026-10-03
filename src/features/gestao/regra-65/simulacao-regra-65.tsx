// "Regra dos 65 — simulação": o que a regra faria HOJE, por corretor, sem
// mover nenhum lead (Fatia 1, modo sombra; docs/ops/em-atendimento-teto-65.md).
// É a tela que a gestão acompanha durante a semana de sombra, antes de a
// regra ser ligada: quem fica nos 65, quem perde a vaga por 5 dias sem toque,
// o que sai da Minha base e quem pararia de receber lead novo.

import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  descemDos65,
  linhasComCarteira,
  saemDaBase,
  totaisRegra65,
  type LinhaRegra65,
} from "@/features/gestao/regra-65/derive";
import { useRegra65Portas, useRegra65Sombra } from "@/features/gestao/regra-65/use-regra-65";

const fmt = (n: number) => n.toLocaleString("pt-BR");

function Numero({ n, alerta = false }: { n: number; alerta?: boolean }) {
  return (
    <span className={cn("tabular-nums", alerta && n > 0 && "font-bold text-destructive")}>
      {fmt(n)}
    </span>
  );
}

function Linha({ l }: { l: LinhaRegra65 }) {
  const descem = descemDos65(l);
  const saem = saemDaBase(l);
  return (
    <TableRow data-testid="regra-65-linha">
      <TableCell className="font-semibold">{l.nome}</TableCell>
      <TableCell className="text-right">
        <Numero n={l.em_atendimento} alerta={l.em_atendimento > l.teto} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {fmt(l.ficam)} / {l.teto}
      </TableCell>
      <TableCell
        className="text-right"
        title={`${l.perde_vaga} por 5 dias sem toque · ${l.excedente} acima do teto · ${l.porta_cadencia} em cadência sem resposta`}
      >
        <Numero n={descem} alerta />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {fmt(l.base)} → {fmt(l.base_depois)}
      </TableCell>
      <TableCell
        className="text-right"
        title={`${l.sai_roleta} voltam à roleta · ${l.sai_bolsao} vão ao Bolsão · ${l.sai_reativacao} à reativação`}
      >
        <Numero n={saem} alerta />
      </TableCell>
      <TableCell className="text-right">
        <Numero n={l.fundo_desfecho} alerta />
      </TableCell>
      <TableCell className="text-right">
        {l.recebe_lead ? (
          <span className="text-xs text-muted-foreground">recebe</span>
        ) : (
          <span className="text-xs font-semibold text-destructive" title={l.trava ?? undefined}>
            trava
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function SimulacaoRegra65({ veCasaInteira }: { veCasaInteira: boolean }) {
  const q = useRegra65Sombra();
  const portas = useRegra65Portas(veCasaInteira);
  const linhas = q.data ? linhasComCarteira(q.data) : [];
  const t = totaisRegra65(linhas);
  const teto = q.data?.[0]?.teto ?? 65;

  return (
    <section aria-label="Regra dos 65 — simulação" className="space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold md:text-lg">
          Regra dos {teto} — simulação
        </h2>
        <p className="text-xs text-muted-foreground md:text-sm">
          <b className="text-foreground">Modo sombra: nenhum lead foi movido.</b> O que a regra
          faria hoje: no máximo {teto} em Em atendimento; 5 dias sem toque perde a vaga; na Minha
          base, 5 dias sem toque o lead sai — pago volta à roleta, estoque vai ao Bolsão, o próprio
          fica com alerta ao gestor.
        </p>
      </div>

      {q.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : q.isError ? (
        <QueryErrorState
          title="Não foi possível ler a simulação."
          error={q.error}
          onRetry={() => q.refetch()}
        />
      ) : !q.data ? (
        <p className="text-xs text-muted-foreground">
          Sem dado: a simulação ainda não está disponível neste ambiente.
        </p>
      ) : linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum corretor com carteira no seu escopo.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              title="Em atendimento hoje"
              value={fmt(t.emAtendimento)}
              hint={`${fmt(t.ficam)} ficam nos ${teto}`}
            />
            <StatTile
              title="Perdem a vaga"
              value={fmt(t.descem)}
              intent={t.descem > 0 ? "warning" : "neutral"}
              hint="descem para a Minha base"
            />
            <StatTile
              title="Saem da Minha base"
              value={fmt(t.saiRoleta + t.saiBolsao)}
              intent={t.saiRoleta + t.saiBolsao > 0 ? "warning" : "neutral"}
              hint={`${fmt(t.saiRoleta)} roleta · ${fmt(t.saiBolsao)} Bolsão`}
            />
            <StatTile
              title="Fundo parado 10+ dias"
              value={fmt(t.fundoDesfecho)}
              intent={t.fundoDesfecho > 0 ? "danger" : "neutral"}
              hint="o gestor dá o desfecho"
            />
          </div>

          <div className="rounded-2xl border border-border-subtle bg-card text-card-foreground shadow-elev-1">
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Corretor</TableHead>
                    <TableHead className="text-right">Em atendimento</TableHead>
                    <TableHead className="text-right">Ficam</TableHead>
                    <TableHead className="text-right">Perdem a vaga</TableHead>
                    <TableHead className="text-right">Minha base (hoje → depois)</TableHead>
                    <TableHead className="text-right">Saem da base</TableHead>
                    <TableHead className="text-right">Fundo 10+ dias</TableHead>
                    <TableHead className="text-right">Roleta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <Linha key={l.corretor_id} l={l} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="px-4 pb-3 pt-2 text-xs text-muted-foreground">
              {t.travados > 0
                ? `${fmt(t.travados)} corretor(es) parariam de receber lead novo (trava em ${linhas[0].trava_roleta} em atendimento ou ${linhas[0].teto_base} na Minha base). `
                : "Nenhum corretor pararia de receber lead novo. "}
              Passe o mouse em "Perdem a vaga" e "Saem da base" para ver o motivo de cada número.
            </p>
          </div>

          {veCasaInteira && portas.data ? (
            <p data-testid="regra-65-portas" className="text-xs text-muted-foreground md:text-sm">
              Fora das carteiras:{" "}
              <b className="text-foreground">
                {fmt(portas.data.em_atendimento_sem_dono)} leads em Em atendimento sem dono
              </b>{" "}
              — não são conversa de ninguém e voltam para Aguardando atendimento quando a regra for
              ligada.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
