import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { INTENT_TEXT, type Intent } from "@/lib/status-tones";

/**
 * Anel de score 0–100 em SVG puro. Usado para o score de prioridade do lead
 * (alta=danger, média=warning) e para probabilidade de fechamento (success).
 * O arco herda a cor via stroke-current + classe de texto do intent.
 * No primeiro paint o arco "desenha" de 0 até o valor (draw-in do SMQ Motion);
 * `motion-reduce:transition-none` mostra o valor direto.
 */
export function ScoreRing({
  value,
  size = 40,
  strokeWidth = 4,
  intent = "neutral",
  showValue = true,
  className,
  title,
}: {
  /** 0–100 (valores fora da faixa são grampeados). */
  value: number;
  size?: number;
  strokeWidth?: number;
  intent?: Intent;
  /** Mostra o número no centro (desligue em tamanhos < 32). */
  showValue?: boolean;
  className?: string;
  /** Acessibilidade/tooltip — ex.: "Score de prioridade 82". */
  title?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  // Renderiza vazio e preenche no frame seguinte: a transition de
  // stroke-dasharray (já presente no arco) vira a animação de entrada.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = drawn ? v : 0;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const filled = (shown / 100) * c;

  return (
    <span
      role="img"
      aria-label={title ?? `Score ${v}`}
      title={title}
      className={cn("relative inline-flex shrink-0", INTENT_TEXT[intent], className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          className="stroke-current transition-[stroke-dasharray] duration-500 motion-reduce:transition-none"
        />
      </svg>
      {showValue && (
        <span
          className="font-display absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-foreground"
          style={{ fontSize: Math.max(9, size * 0.3) }}
        >
          {v}
        </span>
      )}
    </span>
  );
}
