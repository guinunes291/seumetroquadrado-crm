// "Sua vez nas roletas" — a Central de Comando do corretor (decisão do dono,
// 11/10/2026: os corretores veem em qual posição da fila estão, por zona).
// Só a própria posição: o banco (minhas_posicoes_roletas_v1) não manda o nome
// de nenhum colega.
//
// Em cima, onde ele está na fila e em que posição. Embaixo, onde está fora,
// agrupado pelo motivo: sem check-in ele fica fora de todas as filas que
// exigem presença, e uma linha por roleta e zona passava de 30 para quem
// atende três zonas (visto em produção, 11/10).
//
// Roletas por filial (12/10/2026): a roleta de filial é UMA fila ("Roleta
// Belém · Leste, Grande SP — 2º de 7") e a campanha também ("Cury Leopoldina
// — 2º de 6"); fora pela vez única: "Sua vez agora é na Belém".

import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMinhasPosicoes } from "./fila-client";
import { agruparFora, filasEmLinha, ordenarMinhas, textoMinhaPosicao } from "./fila-derive";

export function MinhasPosicoesRoletas({ className }: { className?: string }) {
  const q = useMinhasPosicoes();
  const todas = q.data ?? [];
  const naFila = ordenarMinhas(todas.filter((p) => p.apto && p.posicao != null)).map((p) =>
    textoMinhaPosicao(p),
  );
  const fora = agruparFora(todas);

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
      ) : todas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Você não está em nenhuma roleta. A gestão monta as filas na Central de Distribuição.
        </p>
      ) : (
        <div className="space-y-2.5">
          {naFila.length > 0 && (
            <ul className="divide-y divide-border-subtle">
              {naFila.map((t) => (
                <li key={t.fila} className="py-1.5 text-[13px]" data-testid="minha-posicao">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">{t.fila}</span>
                    <b className="shrink-0 font-display tabular-nums">{t.valor}</b>
                  </div>
                  {t.detalhe && <p className="text-[11.5px] text-success">{t.detalhe}</p>}
                </li>
              ))}
            </ul>
          )}
          {fora.length > 0 && (
            <div className="space-y-1.5" aria-label="Fora da fila agora">
              {naFila.length > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Fora agora
                </p>
              )}
              {fora.map((g) => (
                <div key={g.chave} className="text-[12px]" data-testid="fora-grupo">
                  <p className="font-semibold text-warning">{g.rotulo}</p>
                  <p className="text-muted-foreground">{filasEmLinha(g.filas)}</p>
                  {g.checkin && (
                    <Link
                      to="/presenca"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Fazer o check-in de hoje
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
