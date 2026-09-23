// Meu Funil — o estudo que o corretor faz todo dia antes de trabalhar.
// Mesma view na página /meu-funil e no estudo obrigatório (meu-funil-global).

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  CalendarCheck,
  ChatsCircle,
  FileText,
  Funnel,
  Info,
  MapPin,
  Target,
  TrendDown,
  TrendUp,
  Trophy,
  UsersThree,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { origemLabel } from "@/lib/origem";
import { cn } from "@/lib/utils";
import {
  AMOSTRA_MINIMA,
  ETAPAS,
  FOCOS,
  PERIODOS_DIAS,
  PERIODO_PADRAO,
  diagnosticar,
  fmtNum,
  fmtPct,
  matematicaDaVenda,
  passagens,
  planoDoMes,
  resumoPorOrigem,
  somarGrupo,
  timeDoGrupo,
  type ContagemFunil,
  type Diagnostico,
  type EtapaChave,
  type Passagem,
  type PeriodoDias,
  type PorVenda,
} from "@/features/meu-funil/meu-funil";
import { useMeuFunil } from "@/features/meu-funil/use-meu-funil";

const ICONE_ETAPA: Record<EtapaChave, Icon> = {
  recebidos: UsersThree,
  conversou: ChatsCircle,
  agendou: CalendarCheck,
  visitou: MapPin,
  pasta: FileText,
  vendas: Trophy,
};

export function MeuFunilView({
  dia,
  onDiagnostico,
}: {
  dia: string;
  /** Avisa o estudo obrigatório qual foco sugerir. */
  onDiagnostico?: (d: Diagnostico) => void;
}) {
  const [periodo, setPeriodo] = useState<PeriodoDias>(PERIODO_PADRAO);
  const q = useMeuFunil(periodo);
  const dados = q.data;

  const minha = useMemo(() => somarGrupo(dados?.minhas ?? [], "real"), [dados]);
  const base = useMemo(() => somarGrupo(dados?.minhas ?? [], "base"), [dados]);
  const timeReal = useMemo(() => timeDoGrupo(dados?.time ?? [], "real"), [dados]);
  const timeBase = useMemo(() => timeDoGrupo(dados?.time ?? [], "base"), [dados]);
  const ps = useMemo(() => passagens(minha, timeReal), [minha, timeReal]);
  const porVenda = useMemo(() => matematicaDaVenda(minha, timeReal), [minha, timeReal]);
  const diag = useMemo(() => diagnosticar(ps, minha), [ps, minha]);

  useEffect(() => {
    if (dados) onDiagnostico?.(diag);
  }, [dados, diag, onDiagnostico]);

  return (
    <div className="space-y-6" data-testid="meu-funil-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Dos leads que você <strong className="text-foreground">recebeu</strong> nos últimos{" "}
          {periodo} dias, quantos chegaram a cada etapa até hoje.
        </p>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={String(periodo)}
          onValueChange={(v) => v && setPeriodo(Number(v) as PeriodoDias)}
          aria-label="Período de estudo"
        >
          {PERIODOS_DIAS.map((d) => (
            <ToggleGroupItem key={d} value={String(d)}>
              {d} dias
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {q.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : q.isError || !dados ? (
        <QueryErrorState
          title="Não foi possível carregar o seu funil."
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <>
          <DiagnosticoCard diag={diag} />
          <MatematicaDaVenda porVenda={porVenda} vendas={minha.vendas} />
          <FunilPorEtapa minha={minha} passagens={ps} />
          <PlanoDoMesCard
            dia={dia}
            metaGestao={dados.mes.meta_vendas}
            vendasMes={dados.mes.vendas}
            porVenda={porVenda}
          />
          <ConversaoPorOrigem linhas={resumoPorOrigem(dados.minhas, "real")} />
          <BaseImportadaCard
            base={base}
            timeBase={timeBase}
            linhas={resumoPorOrigem(dados.minhas, "base")}
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Etapas acumuladas: quem chegou à pasta também conta como quem agendou e visitou. Leads
            recebidos nos últimos dias ainda estão amadurecendo — por isso o período padrão é de{" "}
            {PERIODO_PADRAO} dias. "Time" é a soma de todos os corretores no mesmo período.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DiagnosticoCard({ diag }: { diag: Diagnostico }) {
  const foco = FOCOS.find((f) => f.chave === diag.foco)!;
  return (
    <Card className="border-primary/40 bg-primary/5" data-testid="meu-funil-diagnostico">
      <CardContent className="flex gap-3 p-4">
        <Target className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Onde o seu funil vaza
          </p>
          <p className="font-display text-lg font-semibold">{foco.label}</p>
          <p className="text-sm text-muted-foreground">{diag.motivo}</p>
          <p className="text-sm">
            <span className="font-medium">Como atacar hoje: </span>
            {foco.dica}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MatematicaDaVenda({ porVenda, vendas }: { porVenda: PorVenda[]; vendas: number }) {
  return (
    <section aria-labelledby="mat-venda" className="space-y-3">
      <div>
        <h2 id="mat-venda" className="font-display text-lg font-semibold">
          A matemática da sua venda
        </h2>
        <p className="text-sm text-muted-foreground">
          {vendas > 0
            ? `Com ${vendas} ${vendas === 1 ? "venda" : "vendas"} no período, cada venda sua custou:`
            : "Você ainda não vendeu nenhum lead deste período. Enquanto isso, a régua é a do time:"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {porVenda.map((p) => {
          const Icone = ICONE_ETAPA[p.chave];
          const valor = p.meu ?? p.time;
          const pior = p.meu !== null && p.time !== null && p.meu > p.time;
          return (
            <div
              key={p.chave}
              className="rounded-xl border border-border-subtle bg-card p-4 shadow-elev-1"
              data-testid={`por-venda-${p.chave}`}
            >
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{p.label}</span>
                <Icone className="h-4 w-4" />
              </div>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
                {fmtNum(valor)}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.meu === null && p.time !== null ? "régua do time" : "para 1 venda"}
              </p>
              {p.meu !== null && p.time !== null && (
                <p
                  className={cn(
                    "mt-1 flex items-center gap-1 text-xs font-medium",
                    pior ? "text-warning" : "text-success",
                  )}
                >
                  {pior ? (
                    <TrendDown className="h-3.5 w-3.5" />
                  ) : (
                    <TrendUp className="h-3.5 w-3.5" />
                  )}
                  Time: {fmtNum(p.time)}{" "}
                  {pior ? "(você precisa de mais)" : "(você precisa de menos)"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FunilPorEtapa({ minha, passagens: ps }: { minha: ContagemFunil; passagens: Passagem[] }) {
  const topo = Math.max(1, minha.recebidos);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Funnel className="h-5 w-5" /> Seu funil por etapa
        </CardTitle>
        <CardDescription>
          Volume em cada etapa e quanto passa de uma para a outra, comparado com o time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {ETAPAS.map((e, i) => {
          const volume = minha[e.chave];
          const largura = Math.max(2, Math.round((volume / topo) * 100));
          const p = i > 0 ? ps[i - 1] : null;
          const Icone = ICONE_ETAPA[e.chave];
          return (
            <div key={e.chave}>
              {p && <PassagemLinha p={p} />}
              <div className="flex items-center gap-3" title={`${e.label}: ${volume}`}>
                <span className="flex w-36 shrink-0 items-center gap-1.5 text-sm">
                  <Icone className="h-4 w-4 text-muted-foreground" /> {e.label}
                </span>
                <div className="h-7 flex-1 rounded-r bg-muted/40">
                  <div
                    className="flex h-7 items-center justify-end rounded-r bg-primary/80 pr-2"
                    style={{ width: `${largura}%` }}
                  />
                </div>
                <span className="w-12 text-right font-display font-semibold tabular-nums">
                  {volume}
                </span>
              </div>
            </div>
          );
        })}
        <p className="pt-2 text-xs text-muted-foreground">
          Perdidos no período: <span className="tabular-nums">{minha.perdidos}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function PassagemLinha({ p }: { p: Passagem }) {
  const abaixo = p.gapPp !== null && p.gapPp < 0 && !p.amostraPequena;
  return (
    <div className="flex items-center gap-2 py-1 pl-36 text-xs text-muted-foreground">
      <ArrowDown className="h-3 w-3" />
      <span className="font-medium text-foreground tabular-nums">{fmtPct(p.taxa)}</span>
      {p.taxaTime !== null && <span className="tabular-nums">· time {fmtPct(p.taxaTime)}</span>}
      {abaixo && (
        <span className="flex items-center gap-1 font-medium text-warning">
          <Warning className="h-3 w-3" /> abaixo do time ({fmtNum(p.gapPp)} p.p.)
        </span>
      )}
      {p.amostraPequena && p.base > 0 && (
        <span className="italic">amostra pequena (menos de {AMOSTRA_MINIMA})</span>
      )}
    </div>
  );
}

function PlanoDoMesCard({
  dia,
  metaGestao,
  vendasMes,
  porVenda,
}: {
  dia: string;
  metaGestao: number | null;
  vendasMes: number;
  porVenda: PorVenda[];
}) {
  const [metaTxt, setMetaTxt] = useState(() => String(metaGestao ?? Math.max(1, vendasMes + 1)));
  useEffect(() => {
    if (metaGestao !== null) setMetaTxt(String(metaGestao));
  }, [metaGestao]);
  const meta = Math.max(0, Math.floor(Number(metaTxt) || 0));
  const plano = planoDoMes({ meta, vendasMes, dia, minha: porVenda });

  return (
    <Card data-testid="meu-funil-plano">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Target className="h-5 w-5" /> O que falta para bater o mês
        </CardTitle>
        <CardDescription>
          Sua conversão aplicada às vendas que faltam — é isso que você precisa produzir até o fim
          do mês.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="meu-funil-meta">Meta de vendas do mês</Label>
            <Input
              id="meu-funil-meta"
              type="number"
              min={0}
              inputMode="numeric"
              className="w-28"
              value={metaTxt}
              onChange={(e) => setMetaTxt(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {metaGestao !== null
              ? "Meta lançada pela gestão. "
              : "Sem meta lançada — simule a sua. "}
            Vendas no mês: <strong className="text-foreground tabular-nums">{plano.feitas}</strong>{" "}
            · faltam <strong className="text-foreground tabular-nums">{plano.faltam}</strong> ·{" "}
            {plano.diasUteis} {plano.diasUteis === 1 ? "dia útil restante" : "dias úteis restantes"}
          </p>
        </div>

        {plano.faltam === 0 ? (
          <p className="rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
            <Trophy className="mr-1 inline h-4 w-4" /> Meta do mês batida. Tudo o que vier agora é
            acima da meta.
          </p>
        ) : plano.fonte === null ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há vendas no período (nem suas, nem do time) para calcular a conversão.
          </p>
        ) : (
          <>
            {plano.fonte === "time" && (
              <p className="text-xs text-muted-foreground">
                Calculado com a conversão do time, porque você ainda não tem venda neste período.
              </p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      Para {plano.faltam} {plano.faltam === 1 ? "venda" : "vendas"} você precisa de
                    </TableHead>
                    <TableHead className="text-right">No mês</TableHead>
                    <TableHead className="text-right">Por dia útil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plano.itens.map((i) => (
                    <TableRow key={i.chave}>
                      <TableCell>{i.label}</TableCell>
                      <TableCell className="text-right font-display font-semibold tabular-nums">
                        {i.total}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(i.porDia)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TabelaOrigens({ linhas }: { linhas: ReturnType<typeof resumoPorOrigem> }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Origem</TableHead>
            <TableHead className="text-right">Recebidos</TableHead>
            <TableHead className="text-right">Conversou</TableHead>
            <TableHead className="text-right">Agendou</TableHead>
            <TableHead className="text-right">Visitou</TableHead>
            <TableHead className="text-right">Pasta</TableHead>
            <TableHead className="text-right">Vendas</TableHead>
            <TableHead className="text-right">Leads p/ 1 venda</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={`${l.grupo}-${l.origem}`}>
              <TableCell className="font-medium">
                {origemLabel(l.origem)}
                {l.amostraPequena && (
                  <span className="ml-1.5 text-xs font-normal italic text-muted-foreground">
                    (amostra pequena)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{l.recebidos}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(l.pctConversa)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(l.pctAgendamento)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(l.pctVisita)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(l.pctPasta)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {l.vendas} <span className="text-muted-foreground">({fmtPct(l.pctVenda)})</span>
              </TableCell>
              <TableCell className="text-right font-display font-semibold tabular-nums">
                {fmtNum(l.leadsPorVenda)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConversaoPorOrigem({ linhas }: { linhas: ReturnType<typeof resumoPorOrigem> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Conversão por origem</CardTitle>
        <CardDescription>
          % dos leads de cada origem que chegaram a cada etapa. Invista seu tempo onde a origem
          converte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead recebido no período.</p>
        ) : (
          <TabelaOrigens linhas={linhas} />
        )}
      </CardContent>
    </Card>
  );
}

function BaseImportadaCard({
  base,
  timeBase,
  linhas,
}: {
  base: ContagemFunil;
  timeBase: ContagemFunil | null;
  linhas: ReturnType<typeof resumoPorOrigem>;
}) {
  const porVenda = matematicaDaVenda(base, timeBase);
  return (
    <Card className="border-dashed" data-testid="meu-funil-base">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 font-display">
          Base importada <Badge variant="secondary">Importação + Google Sheets</Badge>
        </CardTitle>
        <CardDescription>
          Estudada à parte: são cargas em lote de contatos frios. Somadas ao seu funil, fariam
          parecer que você precisa de muito mais leads por venda do que realmente precisa no lead
          que chega quente. Lead da base que o SDR reaqueceu e te entregou já conta no funil
          principal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {base.recebidos === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead de base importada no período.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
              {ETAPAS.map((e) => (
                <div key={e.chave} className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{e.label}</p>
                  <p className="font-display text-xl font-semibold tabular-nums">{base[e.chave]}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {base.vendas > 0 ? (
                <>
                  Na base, você precisa trabalhar{" "}
                  <strong className="text-foreground">
                    {fmtNum(porVenda.find((p) => p.chave === "recebidos")?.meu)} contatos
                  </strong>{" "}
                  e conversar com{" "}
                  <strong className="text-foreground">
                    {fmtNum(porVenda.find((p) => p.chave === "conversou")?.meu)}
                  </strong>{" "}
                  para 1 venda.
                </>
              ) : (
                <>
                  Nenhuma venda da base no período. A base rende quando você conversa: das{" "}
                  {base.recebidos} fichas, {base.conversou} viraram conversa (
                  {fmtPct(
                    base.recebidos > 0
                      ? Math.round((base.conversou / base.recebidos) * 1000) / 10
                      : null,
                  )}
                  ).
                </>
              )}
            </p>
            <TabelaOrigens linhas={linhas} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
