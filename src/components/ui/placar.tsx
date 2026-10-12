// O placar do "como estou agora" (identidade Lançamento): o anel dourado
// "N de M", os números com dono (a cor só acende acima de zero) e a linha de
// notas do que corre por fora. Nasceu no placar da Fila Única
// (features/fila-unica/fila-cockpit.tsx) e mora aqui para que toda tela que
// responde "quanto eu tenho de quanto" use o MESMO desenho — antes o mesmo
// X/65 aparecia em anel na Fila, em texto na Meus 65 e em prosa na Minha base.

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Anel "N de M": desenha do zero até o valor no primeiro paint (draw-in do
 *  SMQ Motion); com motion-reduce o valor aparece direto. Estourado, enche no
 *  teto — uma fração maior que 1 leria como erro. */
export function AnelNdeM({
  valor,
  teto,
  tamanho = 72,
  traco = 6,
  cartao = false,
  rotulo = "leads no dia",
  className,
}: {
  valor: number;
  teto: number;
  tamanho?: number;
  traco?: number;
  /** O anel grande do cartão principal: número grande e "de M" embaixo. */
  cartao?: boolean;
  /** O que o anel conta, para o leitor de tela: "37 de 65 {rotulo}". */
  rotulo?: string;
  className?: string;
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
  // Entre o compacto do celular (72) e o do cartão (172): o placar das telas.
  const medio = !cartao && tamanho >= 96;
  return (
    <span
      role="img"
      aria-label={`${valor} de ${teto} ${rotulo}`}
      className={cn("relative inline-flex shrink-0 text-modulo-central", className)}
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
          className={cn(
            "stroke-current transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none",
            !cartao && !medio && "drop-shadow-[0_0_8px_var(--color-modulo-central)]",
          )}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none text-foreground">
        {cartao ? (
          <>
            <span className="font-display text-5xl font-bold tracking-tight tabular-nums">
              {valor}
            </span>
            <span className="mt-1.5 text-sm text-muted-foreground">de {teto}</span>
          </>
        ) : medio ? (
          <>
            <span className="font-display text-3xl font-bold tracking-tight tabular-nums">
              {valor}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">de {teto}</span>
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

/** Um número com dono: o valor em Sora e o rótulo embaixo. A cor (`cor`) só
 *  acende quando há o que cobrar; zerado, ele fica neutro. */
export function Numero({
  valor,
  rotulo,
  cor,
  cartao = false,
}: {
  valor: number;
  rotulo: string;
  /** Cor do número quando há o que cobrar; zerado ele fica neutro. */
  cor: string;
  cartao?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle",
        cartao ? "min-h-[92px] bg-card px-3 py-3" : "bg-muted/40 px-2 py-1.5",
      )}
    >
      <div
        className={cn(
          "font-display font-semibold leading-none tabular-nums",
          cartao ? "text-[28px] font-bold tracking-tight" : "text-lg",
          valor > 0 ? cor : "text-foreground",
        )}
      >
        {valor}
      </div>
      <div
        className={cn(
          "mt-1 leading-tight text-muted-foreground",
          cartao ? "mt-2 text-xs" : "text-[10px]",
        )}
      >
        {rotulo}
      </div>
    </div>
  );
}

/** A linha de notas do placar: o que corre por fora, numa linha cinza — nunca
 *  um parágrafo. Quem chama decide se há o que dizer (sem filhos, não monte). */
export function Notas({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type NumeroDoPlacar = {
  valor: number;
  rotulo: string;
  /** Classe de cor quando > 0 (ex.: "text-destructive"). */
  cor: string;
};

/**
 * O placar de uma tela: o anel "N de M" e até quatro números com dono ao
 * lado, as notas embaixo. É o topo da Minha base, dos Meus 65 e dos Materiais —
 * o mesmo anel da Central, num cartão do tamanho de um topo de página.
 */
export function Placar({
  titulo,
  sub,
  anel,
  numeros,
  notas,
  acao,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  titulo?: string;
  sub?: ReactNode;
  anel: { valor: number; teto: number; rotulo: string };
  numeros: NumeroDoPlacar[];
  notas?: ReactNode;
  /** A ação única do placar, no canto do título. */
  acao?: ReactNode;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  return (
    <section
      aria-label={ariaLabel ?? titulo ?? "Placar"}
      data-testid={testId}
      className={cn(
        "rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground shadow-elev-1 md:p-5",
        className,
      )}
    >
      {(titulo || acao) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {titulo && <h2 className="font-display text-base font-bold">{titulo}</h2>}
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          {acao}
        </header>
      )}
      <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <AnelNdeM
          valor={anel.valor}
          teto={anel.teto}
          rotulo={anel.rotulo}
          tamanho={112}
          traco={10}
          className="mx-auto sm:mx-0"
        />
        <div
          className={cn(
            "grid gap-2",
            numeros.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
          )}
        >
          {numeros.map((n) => (
            <Numero key={n.rotulo} valor={n.valor} rotulo={n.rotulo} cor={n.cor} cartao />
          ))}
        </div>
      </div>
      {notas && <Notas className="mt-3 text-xs">{notas}</Notas>}
    </section>
  );
}
