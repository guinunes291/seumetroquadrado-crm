// O "● ao vivo" ao lado das abas — só onde o dado se atualiza sozinho
// (regra da Fase 9 do Lançamento): o selo não aparece em tela de consulta.

import { cn } from "@/lib/utils";

export function SeloAoVivo({
  title = "Atualiza sozinho.",
  className,
}: {
  /** O que se atualiza e de quanto em quanto tempo (tooltip). */
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive",
        className,
      )}
      title={title}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
      />
      ao vivo
    </span>
  );
}
