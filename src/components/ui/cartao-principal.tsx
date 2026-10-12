// O cartão principal do topo de uma tela (identidade Lançamento): título em
// Sora, subtítulo, o número grande no meio (anel ou valor), até três números
// com dono embaixo, as notas, UMA ação e um rodapé. É o molde do card "Fila
// Única" da Central de Comando (FilaCartao, em fila-cockpit.tsx, que agora é
// um caso dele) — pronto para qualquer módulo responder "como estou agora"
// sem copiar o JSX da Fila.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CartaoPrincipal({
  titulo,
  subtitulo,
  destaque,
  numeros,
  notas,
  acao,
  rodape,
  className,
  "aria-label": ariaLabel,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  /** O número grande do centro: um AnelNdeM grande ou um valor em Sora. */
  destaque: ReactNode;
  /** A linha de até três `Numero` (cartao) — já com o grid. */
  numeros?: ReactNode;
  /** A linha de notas (Notas), logo abaixo dos números. */
  notas?: ReactNode;
  /** A ação única do cartão (navy). */
  acao?: ReactNode;
  /** Linha extra no rodapé (ex.: o dinheiro em jogo). */
  rodape?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section
      aria-label={ariaLabel ?? titulo}
      className={cn(
        "flex flex-col rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground",
        className,
      )}
    >
      <header>
        <h2 className="font-display text-lg font-bold">{titulo}</h2>
        {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      </header>
      <div className="flex flex-1 items-center justify-center py-6">{destaque}</div>
      {numeros}
      {notas}
      {acao && <div className="mt-4">{acao}</div>}
      {rodape}
    </section>
  );
}
