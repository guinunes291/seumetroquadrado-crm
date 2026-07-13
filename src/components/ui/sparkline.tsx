import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Tendência em SVG puro (sem Recharts — fica fora do bundle de gráficos).
 * Herda a cor via stroke-current; área preenchida sutil opcional.
 */
export function Sparkline({
  data,
  width = 72,
  height = 24,
  strokeWidth = 1.5,
  fill = true,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Preenche a área sob a linha com um degradê discreto. */
  fill?: boolean;
  className?: string;
}) {
  const gradId = useId();
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth;
  const stepX = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${(width - pad).toFixed(1)},${height - pad}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${gradId})`} />
        </>
      )}
      {/* Draw-in do SMQ Motion: pathLength=1 + dashoffset 1→0, uma vez no mount. */}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="[stroke-dasharray:1] animate-[draw-line_0.9s_var(--ease-out-quart)_both] motion-reduce:animate-none"
      />
    </svg>
  );
}
