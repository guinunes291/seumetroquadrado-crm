// Cockpit da Fila Única — o placar do mockup aprovado: o anel do dia (quantos
// leads cabem nos 40) e os três números que a lista responde (vencidos, vencem
// hoje, sem próximo passo), num card só. No celular é compacto (~150 px de
// altura); no desktop é o painel grande do hero, com anel de 150 px, os três
// números maiores e, no rodapé, o dinheiro em jogo na fila.
//
// O anel usa a cor do módulo Central de Comando (dourado do tema), não o
// dourado sólido do FAB — a regra do "dourado raro" da identidade v3 vale para
// o acento sólido, e o módulo já é dourado por definição.

import { useEffect, useState, type ReactNode } from "react";
import { Timer } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LIMITE_FILA, type FilaUnica } from "@/features/fila-unica/derive";

/** Anel "N de 40": desenha do zero até o valor no primeiro paint (draw-in do
 *  SMQ Motion); com motion-reduce o valor aparece direto. */
function AnelDoDia({
  valor,
  teto,
  tamanho = 72,
  traco = 6,
  grande = false,
}: {
  valor: number;
  teto: number;
  tamanho?: number;
  traco?: number;
  grande?: boolean;
}) {
  const [desenhado, setDesenhado] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDesenhado(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  const fracao = teto > 0 ? Math.min(1, valor / teto) : 0;
  const cheio = (desenhado ? fracao : 0) * c;
  return (
    <span
      role="img"
      aria-label={`${valor} de ${teto} leads no dia`}
      className="relative inline-flex shrink-0 text-modulo-central"
      style={{ width: tamanho, height: tamanho }}
    >
      <svg
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        className="-rotate-90"
      >
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          strokeWidth={traco}
          className="stroke-muted"
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          strokeWidth={traco}
          strokeLinecap="round"
          strokeDasharray={`${cheio} ${c - cheio}`}
          className="stroke-current drop-shadow-[0_0_8px_var(--color-modulo-central)] transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none text-foreground">
        {grande ? (
          <>
            <span className="font-display text-3xl font-semibold tracking-tight tabular-nums">
              {valor}
              <span className="text-base font-medium text-muted-foreground">/{teto}</span>
            </span>
            <span className="mt-1 text-xs text-muted-foreground">carteira ativa</span>
          </>
        ) : (
          <>
            <span className="font-display text-lg font-semibold tabular-nums">{valor}</span>
            <span className="mt-0.5 text-[9.5px] font-medium text-muted-foreground">de {teto}</span>
          </>
        )}
      </span>
    </span>
  );
}

function Numero({
  valor,
  rotulo,
  tom,
  grande = false,
}: {
  valor: number;
  rotulo: string;
  tom: "danger" | "warning";
  grande?: boolean;
}) {
  const cor =
    valor > 0 ? (tom === "danger" ? "text-destructive" : "text-warning") : "text-foreground";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border-subtle bg-muted/40",
        grande ? "px-3 py-2.5" : "px-2 py-1.5",
      )}
    >
      {/* O filete colorido do mockup na borda esquerda do tile, só quando há o
          que cobrar. */}
      {grande && valor > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 left-0 w-[3px]",
            tom === "danger" ? "bg-destructive" : "bg-warning",
          )}
        />
      )}
      <div
        className={cn(
          "font-display font-semibold leading-none tabular-nums",
          grande ? "text-[28px] tracking-tight" : "text-lg",
          cor,
        )}
      >
        {valor}
      </div>
      <div
        className={cn(
          "mt-1 leading-tight text-muted-foreground",
          grande ? "text-xs" : "text-[10px]",
        )}
      >
        {rotulo}
      </div>
    </div>
  );
}

export function FilaCockpit({
  fila,
  className,
  grande = false,
  rodape,
}: {
  fila: FilaUnica;
  className?: string;
  /** O painel do hero (desktop): anel de 150 px e números maiores. */
  grande?: boolean;
  /** Linha extra no rodapé (o dinheiro em jogo na fila). */
  rodape?: ReactNode;
}) {
  const r = fila.resumo;
  const noDia = Math.min(fila.total, LIMITE_FILA);
  const excedente = fila.total - noDia;
  return (
    <section
      aria-label="Placar do dia"
      className={cn(
        "rounded-2xl border border-border-subtle bg-card text-card-foreground shadow-elev-1",
        grande ? "beam-border p-4 md:p-5" : "p-3",
        className,
      )}
    >
      <div
        className={cn(
          "grid items-center",
          grande ? "grid-cols-[150px_1fr] gap-5" : "grid-cols-[72px_1fr] gap-3",
        )}
      >
        {grande ? (
          <AnelDoDia valor={noDia} teto={LIMITE_FILA} tamanho={150} traco={9} grande />
        ) : (
          <AnelDoDia valor={noDia} teto={LIMITE_FILA} />
        )}
        <div className={cn("grid grid-cols-3", grande ? "gap-2.5" : "gap-1.5")}>
          <Numero
            valor={r.vencidos}
            rotulo={grande ? "próximos passos vencidos" : "vencidos"}
            tom="danger"
            grande={grande}
          />
          <Numero valor={r.hoje} rotulo="vencem hoje" tom="warning" grande={grande} />
          <Numero
            valor={r.semProximoPasso}
            rotulo="sem próximo passo"
            tom="danger"
            grande={grande}
          />
        </div>
      </div>
      {rodape}
      {(r.slaCorrendo > 0 || excedente > 0 || r.ocultosInbox > 0) && (
        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground",
            grande ? "text-xs" : "text-[11px]",
          )}
        >
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
