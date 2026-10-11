// "Sua vez nas roletas" — a Central de Comando do corretor (decisão do dono,
// 11/10/2026: os corretores veem em qual posição da fila estão, por zona).
// Só a própria posição: o banco (minhas_posicoes_roletas_v1) não manda o nome
// de nenhum colega. Fora da fila, o motivo — e, se for check-in, o atalho.

import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMinhasPosicoes } from "./fila-client";
import { ordenarMinhas, textoMinhaPosicao } from "./fila-derive";

export function MinhasPosicoesRoletas({ className }: { className?: string }) {
  const q = useMinhasPosicoes();
  const linhas = q.data ? ordenarMinhas(q.data).map((p) => ({ p, t: textoMinhaPosicao(p) })) : [];
  const pedeCheckin = linhas.some((l) => l.t.checkin);

  return (
    <section
      aria-label="Sua vez nas roletas"
      className={cn(
        "rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground shadow-elev-1",
        className,
      )}
    >
      <h3 className="mb-2 flex items-baseline justify-between gap-2 text-[13.5px] font-semibold">
        Sua vez nas roletas
        <span className="text-xs font-medium text-muted-foreground">agora</span>
      </h3>
      {q.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : q.isError ? (
        <p className="text-xs text-muted-foreground">Não foi possível ler as suas roletas.</p>
      ) : linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Você não está em nenhuma roleta. A gestão monta as filas na Central de Distribuição.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {linhas.map(({ p, t }) => (
            <li
              key={`${p.slug}:${p.zona ?? ""}`}
              className="py-1.5 text-[13px]"
              data-testid="minha-posicao"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{t.fila}</span>
                <b
                  className={cn(
                    "shrink-0 font-display tabular-nums",
                    t.apto ? "text-foreground" : "text-xs font-semibold text-warning",
                  )}
                >
                  {t.valor}
                </b>
              </div>
              {t.detalhe && (
                <p
                  className={cn("text-[11.5px]", t.apto ? "text-success" : "text-muted-foreground")}
                >
                  {t.detalhe}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {pedeCheckin && (
        <Link
          to="/presenca"
          className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
        >
          Fazer o check-in de hoje
        </Link>
      )}
    </section>
  );
}
