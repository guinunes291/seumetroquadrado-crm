// Carimbo "PAGA" (recibo com carimbo, referência de 2026-10): no lugar do selo
// verde genérico, a comissão quitada ganha um carimbo inclinado com a data —
// responde "já caiu?" sem ler a tabela, e a data fica visível também no
// celular, onde a coluna Pagamento some. Só a cor de sucesso do tema; nada
// de cor fixa.

import { cn } from "@/lib/utils";

type CarimboPagoProps = {
  /** Data já formatada para exibição (ex.: "16/10"). Sem data, só "PAGA". */
  data?: string | null;
  /** Bate o carimbo ao aparecer — use só na linha que acabou de ser paga. */
  animar?: boolean;
  className?: string;
};

export function CarimboPago({ data, animar = false, className }: CarimboPagoProps) {
  return (
    <span
      className={cn(
        "inline-flex -rotate-6 items-baseline gap-1 rounded-sm border-[3px] border-double border-success px-1.5 py-px font-display text-[11px] leading-tight font-bold tracking-[0.14em] whitespace-nowrap text-success uppercase select-none",
        animar && "animate-carimbo",
        className,
      )}
    >
      Paga
      {data && (
        <span className="font-sans text-[10px] font-semibold tracking-normal tabular-nums">
          {data}
        </span>
      )}
    </span>
  );
}
