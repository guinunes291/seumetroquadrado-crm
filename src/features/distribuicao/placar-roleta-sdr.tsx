// Central de Distribuição → Filas → SDR → "Placar da semana" (admin).
//
// Permanência semanal na roleta Agendados do SDR (docs/politica-roleta-sdr-
// semanal.md): o placar da semana EM CURSO vem do banco (roleta_sdr_placar) e
// o status previsto é a mesma cascata que a apuração de sábado roda —
// "se a semana fechasse agora". Embaixo, as últimas 4 apurações gravadas.

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChartBar, ClockCounterClockwise, Warning } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Intent } from "@/lib/status-tones";
import {
  RESULTADO_LABEL,
  STATUS_PREVISTO_LABEL,
  ehApto,
  formatarPontos,
  montarCascata,
  rotuloSemana,
  semanaEmCurso,
  ultimaSemanaFechada,
  situacaoNaRoleta,
  statusPrevisto,
  type ConfigRoletaSdr,
  type ResultadoApuracao,
  type StatusPrevisto,
} from "@/lib/roleta-sdr-semanal";
import {
  usePlacarRoletaSdr,
  useRoletaSdrConfig,
  useUltimasApuracoesRoletaSdr,
  type ApuracaoSemana,
} from "./roleta-sdr-semanal-queries";

const INTENT_PREVISTO: Record<StatusPrevisto, Intent> = {
  fica: "success",
  entra: "success",
  volta: "success",
  pausa: "warning",
  fora: "neutral",
  bloqueado: "danger",
};

const INTENT_RESULTADO: Record<ResultadoApuracao, Intent> = {
  apto_meta: "success",
  apto_venda: "info",
  apto_complemento: "info",
  pausado: "warning",
  bloqueado_admin: "danger",
};

const FAIXA_CURTA: Partial<Record<ResultadoApuracao, string>> = {
  apto_venda: "exceção: venda",
  apto_complemento: "exceção: complemento",
};

function SeloRegra({ cfg }: { cfg: ConfigRoletaSdr }) {
  if (!cfg.regra_ativa) return <StatusBadge intent="neutral">Regra desligada</StatusBadge>;
  if (cfg.modo_sombra) return <StatusBadge intent="info">Modo sombra</StatusBadge>;
  return <StatusBadge intent="success">Valendo</StatusBadge>;
}

const dataHora = (iso: string) => format(parseISO(iso), "dd/MM HH:mm", { locale: ptBR });

export function PlacarRoletaSdrCard() {
  const agora = useMemo(() => new Date(), []);
  // "Fechada" = a semana que a apuração de sábado aplica: é a simulação do
  // que vai acontecer (ou do que teria acontecido, com a regra desligada).
  const [qual, setQual] = useState<"curso" | "fechada">("curso");
  const semana = qual === "curso" ? semanaEmCurso(agora) : ultimaSemanaFechada(agora);
  const cfgQ = useRoletaSdrConfig();
  const placarQ = usePlacarRoletaSdr(semana);
  const apuracoesQ = useUltimasApuracoesRoletaSdr(4);
  const cfg = cfgQ.data;

  const linhas = useMemo(() => {
    if (!cfg || !placarQ.data) return [];
    return montarCascata(placarQ.data, cfg)
      .map((l) => {
        const situacao = situacaoNaRoleta(l, agora);
        return { ...l, situacao, previsto: statusPrevisto(l.resultado, situacao) };
      })
      .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [cfg, placarQ.data, agora]);

  const aptos = linhas.filter((l) => ehApto(l.resultado));
  const porFaixa = (r: ResultadoApuracao) => linhas.filter((l) => l.resultado === r).length;

  return (
    <Card data-testid="placar-roleta-sdr">
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ChartBar className="h-4 w-4 text-primary" /> Placar da semana
            <span className="font-normal text-muted-foreground">
              {rotuloSemana(semana)} · {qual === "curso" ? "em curso" : "fechada"}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={qual} onValueChange={(v) => setQual(v as "curso" | "fechada")}>
              <TabsList className="h-8">
                <TabsTrigger value="curso" className="text-xs">
                  Em curso
                </TabsTrigger>
                <TabsTrigger value="fechada" className="text-xs">
                  Última fechada
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {cfg && <SeloRegra cfg={cfg} />}
          </div>
        </div>
        {cfg && (
          <p className="text-xs text-muted-foreground">
            Visita realizada = {formatarPontos(cfg.peso_visita)} · pasta ={" "}
            {formatarPontos(cfg.peso_pasta)} · meta {formatarPontos(cfg.meta_pontos)} na semana
            (sábado a sexta). Abaixo de {cfg.minimo_aptos} aptos entram, nessa ordem, quem vendeu
            nos últimos {cfg.venda_janela_dias} dias e quem tem mais pontos. A apuração roda no
            sábado 08:00; quem não bate fica pausado até o sábado seguinte 09:00.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {cfg && !cfg.regra_ativa && (
          <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            A regra está desligada (Política → roleta_sdr_regra_ativa): o time da roleta segue
            manual. O placar abaixo é só leitura.
          </p>
        )}

        {placarQ.isLoading || cfgQ.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : placarQ.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o placar.</p>
        ) : linhas.length === 0 ? (
          <EmptyState
            icon={ChartBar}
            title="Nenhum corretor ativo"
            description="O placar avalia todo usuário com papel corretor e perfil ativo."
          />
        ) : (
          <>
            <p className="text-xs">
              <span className="font-semibold">
                {qual === "curso" ? "Se a semana fechasse agora:" : "Na apuração desta semana:"}
              </span>{" "}
              {aptos.length} {aptos.length === 1 ? "apto" : "aptos"} ({porFaixa("apto_meta")} pela
              meta, {porFaixa("apto_venda")} por venda, {porFaixa("apto_complemento")} por
              complemento) · {linhas.length - aptos.length - porFaixa("bloqueado_admin")} fora ·{" "}
              {porFaixa("bloqueado_admin")} removido(s) pelo admin.
            </p>
            {aptos.length === 0 && (
              <p className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
                <Warning className="h-4 w-4 text-warning" />
                Ninguém qualificado: a roleta ficaria vazia e as entregas iriam pela entrega manual
                do admin.
              </p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corretor</TableHead>
                    <TableHead className="text-right">Visitas</TableHead>
                    <TableHead className="text-right">Pastas</TableHead>
                    <TableHead className="text-right">Pontos</TableHead>
                    <TableHead className="text-right">Venda 15 dias</TableHead>
                    <TableHead>Status previsto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.corretor_id}>
                      <TableCell className="font-medium">{l.nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.visitas}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.pastas}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatarPontos(l.pontos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.vendas_janela > 0 ? l.vendas_janela : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge intent={INTENT_PREVISTO[l.previsto]}>
                            {STATUS_PREVISTO_LABEL[l.previsto]}
                          </StatusBadge>
                          {FAIXA_CURTA[l.resultado] && (
                            <span className="text-[11px] text-muted-foreground">
                              {FAIXA_CURTA[l.resultado]}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <UltimasApuracoes
          semanas={apuracoesQ.data ?? []}
          carregando={apuracoesQ.isLoading}
          erro={apuracoesQ.isError}
        />
      </CardContent>
    </Card>
  );
}

function UltimasApuracoes({
  semanas,
  carregando,
  erro,
}: {
  semanas: ApuracaoSemana[];
  carregando: boolean;
  erro: boolean;
}) {
  return (
    <section className="space-y-2 border-t pt-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold">
        <ClockCounterClockwise className="h-4 w-4 text-primary" /> Últimas apurações
      </h4>
      {carregando ? (
        <Skeleton className="h-16 w-full" />
      ) : erro ? (
        <p className="text-sm text-destructive">Não foi possível carregar as apurações.</p>
      ) : semanas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma apuração gravada ainda. A primeira roda no sábado 08:00 com a regra ligada.
        </p>
      ) : (
        semanas.map((s, i) => {
          const conta = (r: ResultadoApuracao) => s.linhas.filter((l) => l.resultado === r).length;
          return (
            <details key={s.semana_inicio} open={i === 0} className="rounded-md border">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className="font-semibold">{rotuloSemana(s.semana_inicio)}</span>
                {s.sombra ? (
                  <StatusBadge intent="info">Sombra (sem efeito)</StatusBadge>
                ) : (
                  <StatusBadge intent="success">
                    Aplicada {s.aplicado_em ? dataHora(s.aplicado_em) : ""}
                  </StatusBadge>
                )}
                <span className="text-muted-foreground">
                  {conta("apto_meta")} meta · {conta("apto_venda")} venda ·{" "}
                  {conta("apto_complemento")} complemento · {conta("pausado")} pausados
                  {conta("bloqueado_admin") > 0 && ` · ${conta("bloqueado_admin")} removidos`}
                </span>
              </summary>
              <div className="overflow-x-auto px-3 pb-2">
                <Table>
                  <TableBody>
                    {s.linhas.map((l) => (
                      <TableRow key={l.corretor_id}>
                        <TableCell className="py-1.5 font-medium">{l.nome}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                          {l.visitas} vis · {l.pastas} pas
                        </TableCell>
                        <TableCell className="py-1.5 text-right font-semibold tabular-nums">
                          {formatarPontos(l.pontos)}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <StatusBadge intent={INTENT_RESULTADO[l.resultado]}>
                            {RESULTADO_LABEL[l.resultado]}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          );
        })
      )}
    </section>
  );
}
