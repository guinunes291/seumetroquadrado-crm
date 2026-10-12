// O topo do Kanban no padrão Lançamento (Fase 2 das demais páginas): quatro
// números com dono, somados do snapshot que o quadro já carrega — VGV no
// funil, follow-ups vencidos, sem próxima ação e parados 7+ dias. A cor só
// acende acima de zero. E a linha miúda de cada coluna, que substituiu os três
// selos de 10 px no cabeçalho de cada etapa.

import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { INTENT_DOT } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import type { SinaisDoFunil, SinalDoFunil } from "./stage-metrics";

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export function ResumoDoFunil({
  vgvLabel,
  sinais,
  rotuloDaEtapa,
  loading,
}: {
  /** VGV das colunas já formatado (formatVgvCompact); null sem o snapshot v3. */
  vgvLabel: string | null;
  sinais: SinaisDoFunil;
  rotuloDaEtapa: (etapa: string) => string;
  loading?: boolean;
}) {
  // "2 em Em atendimento": onde o sinal pesa mais — o corretor sabe qual
  // coluna abrir sem ler as dez.
  const onde = (s: SinalDoFunil, zerado: string) =>
    s.total > 0 && s.maiorEtapa ? `${s.naMaiorEtapa} em ${rotuloDaEtapa(s.maiorEtapa)}` : zerado;

  return (
    <section aria-label="Como está o funil" data-testid="kanban-resumo">
      {/* A cor vai na classe do tile: título e dica têm cor própria (cinza),
          então só o número acende — e só quando há o que cobrar. */}
      <StatGrid className="grid-cols-2 gap-3">
        <StatTile
          title="VGV no funil"
          value={vgvLabel ?? "—"}
          hint={plural(sinais.leads, "lead no funil", "leads no funil")}
          loading={loading}
        />
        <StatTile
          title="Follow-ups vencidos"
          value={sinais.vencidos.total}
          hint={onde(sinais.vencidos, "nenhum vencido")}
          loading={loading}
          className={cn(sinais.vencidos.total > 0 && "text-destructive")}
        />
        <StatTile
          title="Sem próxima ação"
          value={sinais.semAcao.total}
          hint={onde(sinais.semAcao, "todos com próximo passo")}
          loading={loading}
        />
        <StatTile
          title="Parados 7+ dias"
          value={sinais.parados.total}
          hint={onde(sinais.parados, "ninguém parado")}
          loading={loading}
          className={cn(sinais.parados.total > 0 && "text-warning")}
        />
      </StatGrid>
    </section>
  );
}

/** Os sinais da etapa em texto miúdo sob o nome da coluna — só o que há. */
export function SinaisDaColuna({
  vencidos,
  semAcao,
  parados,
}: {
  vencidos: number;
  semAcao: number;
  parados: number;
}) {
  if (vencidos <= 0 && semAcao <= 0 && parados <= 0) return null;
  return (
    <p
      className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-1 pb-1.5 text-[11px] tabular-nums text-muted-foreground"
      data-testid="kanban-sinais-coluna"
    >
      {vencidos > 0 && (
        <span
          className="inline-flex items-center gap-1"
          title={`${vencidos} follow-up(s) vencido(s) nesta etapa`}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", INTENT_DOT.danger)}
          />
          {plural(vencidos, "vencido", "vencidos")}
        </span>
      )}
      {semAcao > 0 && (
        <span title={`${semAcao} lead(s) sem próxima ação registrada`}>{semAcao} sem ação</span>
      )}
      {parados > 0 && (
        <span title={`${parados} lead(s) parados há 7+ dias nesta etapa`}>
          {plural(parados, "parado", "parados")}
        </span>
      )}
    </p>
  );
}
