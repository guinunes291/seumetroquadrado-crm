// Cockpit da Fila Única no celular — o placar do mockup aprovado: o anel do
// dia (quantos leads cabem nos 40) e os três números que a lista responde
// (vencidos, vencem hoje, sem próximo passo), num card só de ~150 px. No
// desktop o placar são os quatro StatTiles (FilaResumo); aqui, quatro tiles
// empilhados empurravam o primeiro lead para depois de duas telas de rolagem.
//
// O anel usa a cor do módulo Central de Comando (dourado do tema), não o
// dourado sólido do FAB — a regra do "dourado raro" da identidade v3 vale para
// o acento sólido, e o módulo já é dourado por definição.

import { useEffect, useState } from "react";
import { Timer } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LIMITE_FILA, type FilaUnica } from "@/features/fila-unica/derive";

const TAMANHO = 72;
const TRACO = 6;

/** Anel "N de 40": desenha do zero até o valor no primeiro paint (draw-in do
 *  SMQ Motion); com motion-reduce o valor aparece direto. */
function AnelDoDia({ valor, teto }: { valor: number; teto: number }) {
  const [desenhado, setDesenhado] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDesenhado(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = (TAMANHO - TRACO) / 2;
  const c = 2 * Math.PI * r;
  const fracao = teto > 0 ? Math.min(1, valor / teto) : 0;
  const cheio = (desenhado ? fracao : 0) * c;
  return (
    <span
      role="img"
      aria-label={`${valor} de ${teto} leads no dia`}
      className="relative inline-flex shrink-0 text-modulo-central"
      style={{ width: TAMANHO, height: TAMANHO }}
    >
      <svg
        width={TAMANHO}
        height={TAMANHO}
        viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
        className="-rotate-90"
      >
        <circle
          cx={TAMANHO / 2}
          cy={TAMANHO / 2}
          r={r}
          fill="none"
          strokeWidth={TRACO}
          className="stroke-muted"
        />
        <circle
          cx={TAMANHO / 2}
          cy={TAMANHO / 2}
          r={r}
          fill="none"
          strokeWidth={TRACO}
          strokeLinecap="round"
          strokeDasharray={`${cheio} ${c - cheio}`}
          className="stroke-current transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none text-foreground">
        <span className="font-display text-lg font-semibold tabular-nums">{valor}</span>
        <span className="mt-0.5 text-[9.5px] font-medium text-muted-foreground">de {teto}</span>
      </span>
    </span>
  );
}

function Numero({
  valor,
  rotulo,
  tom,
}: {
  valor: number;
  rotulo: string;
  tom: "danger" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-muted/40 px-2 py-1.5">
      <div
        className={cn(
          "font-display text-lg font-semibold leading-none tabular-nums",
          valor > 0 ? (tom === "danger" ? "text-destructive" : "text-warning") : "text-foreground",
        )}
      >
        {valor}
      </div>
      <div className="mt-1 text-[10px] leading-tight text-muted-foreground">{rotulo}</div>
    </div>
  );
}

export function FilaCockpit({ fila, className }: { fila: FilaUnica; className?: string }) {
  const r = fila.resumo;
  const noDia = Math.min(fila.total, LIMITE_FILA);
  const excedente = fila.total - noDia;
  return (
    <section
      aria-label="Placar do dia"
      className={cn(
        "rounded-2xl border border-border-subtle bg-card p-3 text-card-foreground shadow-elev-1",
        className,
      )}
    >
      <div className="grid grid-cols-[72px_1fr] items-center gap-3">
        <AnelDoDia valor={noDia} teto={LIMITE_FILA} />
        <div className="grid grid-cols-3 gap-1.5">
          <Numero valor={r.vencidos} rotulo="vencidos" tom="danger" />
          <Numero valor={r.hoje} rotulo="vencem hoje" tom="warning" />
          <Numero valor={r.semProximoPasso} rotulo="sem próximo passo" tom="danger" />
        </div>
      </div>
      {(r.slaCorrendo > 0 || excedente > 0 || r.ocultosInbox > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {r.slaCorrendo > 0 && (
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5 text-warning" />
              {r.slaCorrendo} no SLA do 1º contato
            </span>
          )}
          {excedente > 0 && <span>+{excedente} entram conforme estes saem</span>}
          {r.ocultosInbox > 0 && <span>+{r.ocultosInbox} nas filas de Atender</span>}
        </div>
      )}
    </section>
  );
}
