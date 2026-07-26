import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { leadStatusLabel } from "@/lib/leads";
import { cn } from "@/lib/utils";
import type { HeatmapRow } from "./queries";

/**
 * Heatmap corretor × etapa (peça central da Tela 3) em CSS grid — sem lib.
 * Cor relativa à MÉDIA da coluna (etapa): coluna inteira fraca = problema de
 * processo; linha inteira fraca = problema de pessoa. Célula linka para a
 * lista de leads correspondente (drill-through).
 */
export function HeatmapMatriz({
  rows,
  formatoValor,
  maiorMelhor = true,
}: {
  rows: HeatmapRow[];
  formatoValor: (v: number) => string;
  /** true: valores altos são bons (conversão); false: altos são ruins (parados/dias). */
  maiorMelhor?: boolean;
}) {
  const { etapas, corretores, celulas, mediaPorEtapa } = useMemo(() => {
    const etapasMap = new Map<string, number>();
    const corretoresMap = new Map<string, string>();
    const celulas = new Map<string, HeatmapRow>();
    for (const r of rows) {
      etapasMap.set(r.etapa, r.ordem);
      corretoresMap.set(r.corretor_id, r.nome);
      celulas.set(`${r.corretor_id}:${r.etapa}`, r);
    }
    const etapas = Array.from(etapasMap.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([etapa]) => etapa);
    const corretores = Array.from(corretoresMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "pt-BR"),
    );
    const mediaPorEtapa = new Map<string, number>();
    for (const etapa of etapas) {
      const valores = rows
        .filter((r) => r.etapa === etapa && r.valor !== null)
        .map((r) => Number(r.valor));
      if (valores.length > 0) {
        mediaPorEtapa.set(etapa, valores.reduce((s, v) => s + v, 0) / valores.length);
      }
    }
    return { etapas, corretores, celulas, mediaPorEtapa };
  }, [rows]);

  if (rows.length === 0) return null;

  // Tom relativo à média da etapa: bom = success, ruim = destructive.
  const tomDaCelula = (etapa: string, valor: number | null): string => {
    const media = mediaPorEtapa.get(etapa);
    if (valor === null || media === undefined || media === 0) return "bg-muted/40";
    const razao = valor / media;
    const bom = maiorMelhor ? razao : 1 / Math.max(razao, 0.01);
    if (bom >= 1.25) return "bg-success/25";
    if (bom >= 0.95) return "bg-success/10";
    if (bom >= 0.7) return "bg-warning/15";
    return "bg-destructive/20";
  };

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[560px] gap-px rounded-lg border border-border-subtle bg-border-subtle"
        style={{ gridTemplateColumns: `minmax(140px, 1.4fr) repeat(${etapas.length}, minmax(72px, 1fr))` }}
        role="table"
        aria-label="Heatmap corretor por etapa"
      >
        <div className="bg-card p-2 text-xs font-medium text-muted-foreground" role="columnheader">
          Corretor
        </div>
        {etapas.map((etapa) => (
          <div
            key={etapa}
            className="bg-card p-2 text-center text-xs font-medium text-muted-foreground"
            role="columnheader"
            title={leadStatusLabel(etapa)}
          >
            {leadStatusLabel(etapa)}
          </div>
        ))}
        {corretores.map(([id, nome]) => (
          <MatrizLinha
            key={id}
            corretorId={id}
            nome={nome}
            etapas={etapas}
            celulas={celulas}
            tomDaCelula={tomDaCelula}
            formatoValor={formatoValor}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Cor relativa à média do time em cada etapa. Coluna inteira fraca = processo; linha inteira
        fraca = pessoa. Clique na célula para abrir os leads.
      </p>
    </div>
  );
}

function MatrizLinha({
  corretorId,
  nome,
  etapas,
  celulas,
  tomDaCelula,
  formatoValor,
}: {
  corretorId: string;
  nome: string;
  etapas: string[];
  celulas: Map<string, HeatmapRow>;
  tomDaCelula: (etapa: string, valor: number | null) => string;
  formatoValor: (v: number) => string;
}) {
  return (
    <>
      <div className="truncate bg-card p-2 text-sm font-medium" role="rowheader" title={nome}>
        {nome}
      </div>
      {etapas.map((etapa) => {
        const c = celulas.get(`${corretorId}:${etapa}`);
        const valor = c?.valor ?? null;
        return (
          <Link
            key={etapa}
            to="/leads"
            search={{ status: etapa, corretor: corretorId }}
            role="cell"
            title={
              valor === null
                ? `${nome} · ${leadStatusLabel(etapa)}: sem dado`
                : `${nome} · ${leadStatusLabel(etapa)}: ${formatoValor(Number(valor))}${
                    c?.base != null ? ` (base ${c.base})` : ""
                  } — abrir leads`
            }
            className={cn(
              "flex items-center justify-center p-2 text-xs tabular-nums transition-opacity hover:opacity-75",
              tomDaCelula(etapa, valor === null ? null : Number(valor)),
            )}
          >
            {valor === null ? "—" : formatoValor(Number(valor))}
          </Link>
        );
      })}
    </>
  );
}
