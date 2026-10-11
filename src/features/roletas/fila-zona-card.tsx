// A roleta do vídeo, com a regra real (decisão do dono, 11/10/2026): "a
// roleta será apenas para o SDR e os corretores vendo em qual posição da fila
// estão. Por fila de zona." Aqui é a do SDR (e da gestão): escolhe a zona e vê
// a fila de cada roleta dela, com nomes — a dele (Agendados do SDR) em
// destaque, na roda de iniciais com o 1º na seta, como no vídeo.
//
// A ordem vem do banco (roletas_filas_zona_v1), que lê o estado de cada motor
// sem mudar nada. O que só o lead decide fica dito embaixo da fila: quem tem
// visita no horário é pulado e o corretor de origem fura a fila.

import { useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { iniciais } from "@/lib/prateleira";
import { cn } from "@/lib/utils";
import { ZONAS_REGIAO } from "@/lib/zonas";
import { useFilasZona, type FilaRoleta, type PessoaNaFila } from "./fila-client";
import {
  comoAndaAVez,
  filaEmLinha,
  foraEmLinha,
  nomeDaFila,
  ordenarFilas,
  ordinal,
  zonaInicial,
} from "./fila-derive";

const CHAVE_ZONA = "smq:roleta-zona";
const SEM_ZONA = "__sem_zona__";

function lerZonaSalva(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_ZONA);
  } catch {
    return null;
  }
}

function salvarZona(z: string) {
  try {
    window.localStorage.setItem(CHAVE_ZONA, z);
  } catch {
    // Sem storage (aba privada): a zona volta para a primeira na próxima vez.
  }
}

/** A roda do vídeo: iniciais em volta, o 1º da vez na seta, em dourado. */
export function RodaDaFila({ fila }: { fila: PessoaNaFila[] }) {
  const pontos = fila.slice(0, 8);
  const n = pontos.length;
  return (
    <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" aria-hidden="true">
      <circle
        cx="64"
        cy="70"
        r="48"
        fill="none"
        className="stroke-border"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      <circle cx="64" cy="70" r="10" className="fill-primary dark:fill-navy-300" />
      {/* A seta: quem está nela é o próximo. */}
      <path d="M134 70 L124 63 L124 77 Z" className="fill-gold-400" />
      {pontos.map((p, i) => {
        // O 1º fica à direita (na seta); os outros seguem no sentido horário.
        const a = (2 * Math.PI * i) / Math.max(n, 1);
        const x = 64 + 48 * Math.cos(a);
        const y = 70 + 48 * Math.sin(a);
        const primeiro = i === 0;
        return (
          <g key={p.corretor_id} data-testid="roda-ponto">
            <circle
              cx={x}
              cy={y}
              r="12"
              className={primeiro ? "fill-gold-400" : "fill-primary dark:fill-navy-300"}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className={cn(
                "font-display text-[9px] font-bold",
                primeiro ? "fill-navy-900" : "fill-white dark:fill-navy-900",
              )}
            >
              {iniciais(p.nome)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ListaDaVez({ fila, max = 8 }: { fila: PessoaNaFila[]; max?: number }) {
  return (
    <ol className="space-y-1" aria-label="Ordem da vez">
      {fila.slice(0, max).map((p, i) => (
        <li
          key={p.corretor_id}
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1 text-sm",
            i === 0 && "bg-gold-400/15 font-semibold",
          )}
          data-testid="fila-pessoa"
        >
          <span className="w-7 shrink-0 font-display text-xs font-bold tabular-nums text-muted-foreground">
            {ordinal(p.posicao ?? i + 1)}
          </span>
          <span className="truncate">{p.nome}</span>
          {i === 0 && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-700 dark:text-gold-400">
              próximo
            </span>
          )}
        </li>
      ))}
      {fila.length > max && (
        <li className="px-2 text-xs text-muted-foreground">e mais {fila.length - max}</li>
      )}
    </ol>
  );
}

function OutraFila({ r }: { r: FilaRoleta }) {
  const fora = foraEmLinha(r);
  return (
    <li className="space-y-0.5 py-2" data-testid={`fila-${r.slug}`}>
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
        {nomeDaFila(r)}
        {r.exige_presenca && (
          <Badge variant="outline" className="h-5 text-[10px] font-normal">
            check-in
          </Badge>
        )}
        {r.papel === "campanha" && r.equipe_fixa && (
          <Badge variant="outline" className="h-5 text-[10px] font-normal">
            equipe fixa
          </Badge>
        )}
      </p>
      <p className="text-xs text-foreground/90">
        {r.fila.length > 0 ? filaEmLinha(r) : "Ninguém apto agora: o lead espera."}
      </p>
      {fora && <p className="text-xs text-muted-foreground">Fora agora: {fora}.</p>}
    </li>
  );
}

export function FilaZonaCard() {
  // A última zona olhada, se ainda é uma das chips; senão a primeira.
  const [zona, setZona] = useState<string>(
    () => zonaInicial([...ZONAS_REGIAO, SEM_ZONA], lerZonaSalva()) ?? SEM_ZONA,
  );
  const q = useFilasZona(zona === SEM_ZONA ? null : zona);

  const escolher = (z: string) => {
    setZona(z);
    salvarZona(z);
  };

  const filas = q.data ? ordenarFilas(q.data.roletas) : [];
  const doSdr = filas.find((r) => r.papel === "sdr");
  // Em destaque, a fila do SDR; sem ela (lead sem zona), a primeira da lista.
  const destaque = doSdr ?? filas[0] ?? null;
  const outras = filas.filter((r) => r !== destaque);

  return (
    <section
      aria-label="Roleta"
      className="space-y-4 rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold">Roleta</h2>
          <p className="text-xs text-muted-foreground">
            a fila de cada roleta da zona — a visita que você agenda vai para o 1º
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Zona"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {[...ZONAS_REGIAO, SEM_ZONA].map((z) => (
          <button
            key={z}
            type="button"
            role="radio"
            aria-checked={zona === z}
            onClick={() => escolher(z)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              zona === z
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-subtle text-muted-foreground hover:text-foreground",
            )}
          >
            {z === SEM_ZONA ? "Sem zona" : z}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <Skeleton className="h-32 w-32 rounded-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : q.isError ? (
        <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          {destaque && (
            <div className="grid items-start gap-4 sm:grid-cols-[auto_1fr]">
              <RodaDaFila
                fila={destaque.fila.length > 0 ? destaque.fila : (destaque.reserva?.fila ?? [])}
              />
              <div className="min-w-0 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {nomeDaFila(destaque)}
                </p>
                {destaque.fila.length > 0 ? (
                  <ListaDaVez fila={destaque.fila} />
                ) : destaque.reserva ? (
                  <>
                    <p className="flex items-start gap-1 text-xs text-warning">
                      <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" weight="fill" />
                      Ninguém do time do SDR atende a {zona}: a visita vai para o time da zona.
                    </p>
                    {destaque.reserva.fila.length > 0 ? (
                      <ListaDaVez fila={destaque.reserva.fila} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        O time da zona também está vazio: a gestão entrega.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Ninguém apto agora.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {comoAndaAVez(destaque.mecanica)}
                  {destaque.papel === "sdr" &&
                    " Quem tem visita no horário é pulado, e o corretor que falou com o cliente nos últimos 7 dias fura a fila."}
                </p>
                {foraEmLinha(destaque) && (
                  <p className="text-xs text-muted-foreground">
                    Fora agora: {foraEmLinha(destaque)}.
                  </p>
                )}
              </div>
            </div>
          )}

          {outras.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {zona === SEM_ZONA ? "Roletas para lead sem zona" : `Outras roletas da ${zona}`}
              </h3>
              <ul className="divide-y divide-border-subtle">
                {outras.map((r) => (
                  <OutraFila key={r.slug} r={r} />
                ))}
              </ul>
            </div>
          )}
          {filas.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma roleta ativa nesta zona.</p>
          )}
          {doSdr === undefined && zona !== SEM_ZONA && filas.length > 0 && (
            <p className="text-xs text-muted-foreground">
              A roleta Agendados do SDR está desligada.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Cada corretor vê a própria posição na Central de Comando.
          </p>
        </>
      )}
    </section>
  );
}
