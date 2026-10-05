// Revisão mensal da regra dos 65 (Fatia 4) — Painel do Gestor, aba Time.
// As duas perguntas do dono (§2.5 de docs/ops/em-atendimento-teto-65.md): a
// cada quantas horas o corretor volta a cada lead dos 65 (meta: mediana de
// até 72 h) e quantas conversas que entraram em Em atendimento saíram dali
// para Agendado (meta: 70%). As contas moram no banco
// (`em_atendimento_revisao_v1`); aqui se escolhe o mês e se julga cada número
// contra a meta — a meta sempre escrita ao lado, nunca só pela cor.

import { useState } from "react";
import { Label } from "@/components/ui/label";
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
import { INTENT_TEXT } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import {
  avaliarTaxa,
  avaliarToque,
  fmtHoras,
  fmtPct,
  linhaDaCasa,
  linhasDosCorretores,
  mesesDaRevisao,
  metasDaConfig,
  rotuloMes,
  serieDaCasa,
  toquesPorDia,
  type LinhaRevisao65,
  type MetasRevisao65,
} from "@/features/gestao/regra-65/derive";
import { useRegra65Config, useRegra65Revisao } from "@/features/gestao/regra-65/use-regra-65";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmt1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function Linha({ l, metas }: { l: LinhaRevisao65; metas: MetasRevisao65 }) {
  const toque = avaliarToque(l.mediana_horas, metas.toqueHoras);
  const taxa = avaliarTaxa(l.taxa_agendado, metas.agendadoPct);
  return (
    <TableRow data-testid="regra-65-revisao-linha">
      <TableCell className="font-semibold">{l.nome}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(l.leads_65)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(l.leads_65 - l.leads_tocados)}</TableCell>
      <TableCell
        className="text-right tabular-nums"
        title={`${fmt(l.toques)} conversas em ${l.dias} dias`}
      >
        {fmt1(toquesPorDia(l))}
      </TableCell>
      <TableCell
        className={cn("text-right tabular-nums", INTENT_TEXT[toque])}
        title={
          l.mediana_horas == null
            ? "nenhum intervalo medido no mês"
            : `${fmt(l.intervalos)} intervalo(s) · meta: até ${metas.toqueHoras} h`
        }
      >
        {l.mediana_horas == null ? "—" : fmtHoras(l.mediana_horas)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmt(l.entraram)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(l.agendaram)}</TableCell>
      <TableCell
        className={cn("text-right tabular-nums", INTENT_TEXT[taxa])}
        title={`meta: ${metas.agendadoPct}% · ${fmt(l.em_aberto)} ainda em atendimento`}
      >
        {l.taxa_agendado == null ? "—" : fmtPct(l.taxa_agendado)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmt(l.perderam_vaga)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(l.sairam_base)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(l.trocas)}</TableCell>
    </TableRow>
  );
}

export function RevisaoRegra65() {
  const config = useRegra65Config();
  const q = useRegra65Revisao(6);
  const metas = metasDaConfig(config.data);
  const linhas = q.data ?? [];
  const meses = mesesDaRevisao(linhas);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const mes = escolhido && meses.includes(escolhido) ? escolhido : (meses[0] ?? null);
  const casa = mes ? linhaDaCasa(linhas, mes) : null;
  const corretores = mes ? linhasDosCorretores(linhas, mes) : [];
  const serieToque = serieDaCasa(linhas, "mediana_horas");
  const serieTaxa = serieDaCasa(linhas, "taxa_agendado");

  return (
    <section
      aria-label="Revisão mensal da regra dos 65"
      className="space-y-3"
      data-testid="regra-65-revisao"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold md:text-lg">
            Revisão mensal — regra dos 65
          </h2>
          <p className="text-xs text-muted-foreground md:text-sm">
            Duas perguntas por mês: a cada quantas horas o corretor volta a cada lead dos 65 (meta:
            mediana de até {metas.toqueHoras} h) e quantas conversas que entraram em Em atendimento
            saíram dali para Agendado (meta: {metas.agendadoPct}%).
          </p>
        </div>
        {meses.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="regra-65-revisao-mes">Mês</Label>
            <select
              id="regra-65-revisao-mes"
              data-testid="regra-65-revisao-mes"
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={mes ?? ""}
              onChange={(e) => setEscolhido(e.target.value)}
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {rotuloMes(m)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {q.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : q.isError ? (
        <QueryErrorState
          title="Não foi possível ler a revisão mensal."
          error={q.error}
          onRetry={() => q.refetch()}
        />
      ) : !q.data ? (
        <p className="text-xs text-muted-foreground">
          Sem dado: a revisão mensal ainda não está disponível neste ambiente.
        </p>
      ) : !casa ? (
        <p className="text-xs text-muted-foreground">Nenhum mês medido no seu escopo.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              title="Entre toques nos 65"
              value={casa.mediana_horas == null ? "—" : fmtHoras(casa.mediana_horas)}
              intent={avaliarToque(casa.mediana_horas, metas.toqueHoras)}
              hint={`meta: até ${metas.toqueHoras} h · ${fmt(casa.intervalos)} intervalo(s) medido(s)`}
              spark={serieToque.length > 1 ? serieToque : undefined}
            />
            <StatTile
              title="Em atendimento → Agendado"
              value={casa.taxa_agendado == null ? "—" : fmtPct(casa.taxa_agendado)}
              intent={avaliarTaxa(casa.taxa_agendado, metas.agendadoPct)}
              hint={`meta: ${metas.agendadoPct}% · ${fmt(casa.agendaram)} de ${fmt(casa.entraram)} que entraram no mês${
                casa.em_aberto > 0 ? ` · ${fmt(casa.em_aberto)} ainda em atendimento` : ""
              }`}
              spark={serieTaxa.length > 1 ? serieTaxa : undefined}
            />
            <StatTile
              title="Conversas por dia"
              value={fmt1(toquesPorDia(casa))}
              hint={`${fmt(casa.toques)} conversas em ${casa.dias} dia(s) · ${fmt(
                casa.leads_65 - casa.leads_tocados,
              )} dos ${fmt(casa.leads_65)} nos 65 sem toque no mês`}
            />
            <StatTile
              title="Movimentos da regra"
              value={fmt(casa.perderam_vaga + casa.sairam_base)}
              intent={casa.perderam_vaga + casa.sairam_base > 0 ? "warning" : "neutral"}
              hint={`${fmt(casa.perderam_vaga)} perderam a vaga · ${fmt(
                casa.sairam_base,
              )} saíram da base · ${fmt(casa.trocas)} troca(s)`}
            />
          </div>

          {corretores.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum corretor com movimento em {rotuloMes(mes ?? "")}.
            </p>
          ) : (
            <div className="rounded-2xl border border-border-subtle bg-card text-card-foreground shadow-elev-1">
              <div className="overflow-x-auto">
                <Table className="min-w-[1080px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Corretor</TableHead>
                      <TableHead className="text-right">Nos 65</TableHead>
                      <TableHead className="text-right">Sem toque</TableHead>
                      <TableHead className="text-right">Conversas/dia</TableHead>
                      <TableHead className="text-right">Entre toques</TableHead>
                      <TableHead className="text-right">Entraram</TableHead>
                      <TableHead className="text-right">→ Agendado</TableHead>
                      <TableHead className="text-right">Taxa</TableHead>
                      <TableHead className="text-right">Perderam a vaga</TableHead>
                      <TableHead className="text-right">Saíram da base</TableHead>
                      <TableHead className="text-right">Trocas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {corretores.map((l) => (
                      <Linha key={l.corretor_id ?? l.nome ?? ""} l={l} metas={metas} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="px-4 pb-3 pt-2 text-xs text-muted-foreground">
                Toque é contato real (ligação, WhatsApp, mensagem do cliente); mudança de status e
                nota não contam, e toques a menos de 1 h um do outro são uma conversa só. "Entre
                toques" é a mediana da espera entre conversas enquanto o lead esteve em Em
                atendimento. "Entraram" é a safra do mês: quem entrou em Em atendimento; "→
                Agendado", quantos saíram dali direto para o fundo do funil. Passe o mouse nos
                números para ver a meta e o detalhe.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
