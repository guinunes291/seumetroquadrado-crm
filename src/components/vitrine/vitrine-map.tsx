import { memo, useMemo } from "react";
import type { ProjetoRow } from "@/components/projeto-card";
import {
  schematicProjection,
  pinColor,
  FAIXAS_PRECO,
  ZONA_LABELS,
  type MapProjection,
} from "@/lib/vitrine/map-projection";
import { cn } from "@/lib/utils";

type Props = {
  projetos: ProjetoRow[];
  visibleIds: Set<string>;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Projeção do mapa. Padrão: esquemático por zona. Troque por uma geográfica
   *  (makeGeographicProjection) quando os projetos tiverem lat/lng. */
  projection?: MapProjection;
};

type PinPt = { p: ProjetoRow; x: number; y: number };

// Camada de pinos memoizada: NÃO depende de hover/seleção, então mover o mouse
// (que muda o estado do pai) não re-renderiza os ~900 pinos — só o destaque, que
// é um único elemento sobreposto. Sem isso o hover trava em catálogos grandes.
const PinsLayer = memo(function PinsLayer({
  pins,
  visibleIds,
  onHover,
  onSelect,
}: {
  pins: PinPt[];
  visibleIds: Set<string>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {pins.map(({ p, x, y }) => {
        const visible = visibleIds.has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            title={p.nome}
            aria-label={p.nome}
            tabIndex={visible ? 0 : -1}
            onClick={() => onSelect(p.id)}
            onMouseEnter={() => onHover(p.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(p.id)}
            onBlur={() => onHover(null)}
            className={cn(
              "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white",
              "shadow-sm outline-none transition-opacity hover:z-20",
              "focus-visible:ring-2 focus-visible:ring-amber-400",
              visible ? "opacity-90 hover:opacity-100" : "pointer-events-none opacity-[0.1]",
            )}
            style={{ left: `${x}%`, top: `${y}%`, background: pinColor(p.preco_a_partir) }}
          />
        );
      })}
    </>
  );
});

/**
 * Mapa esquemático da Vitrine: desenho de SP por zonas com um pino por
 * empreendimento, colorido pela faixa de preço. Os pinos fora do filtro atual
 * ficam esmaecidos (o mapa nunca "some", só destaca o que casa).
 */
export function VitrineMap({
  projetos,
  visibleIds,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  projection = schematicProjection,
}: Props) {
  const pins = useMemo<PinPt[]>(
    () =>
      projetos
        .map((p) => {
          const pt = projection(p);
          return pt ? { p, x: pt.x, y: pt.y } : null;
        })
        .filter((v): v is PinPt => v != null),
    [projetos, projection],
  );

  const activeId = hoveredId ?? selectedId;
  const active = activeId ? pins.find((pp) => pp.p.id === activeId) : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border bg-card">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="100" height="100" fill="#F5F8FC" />
        <path d="M18 34 Q40 20 62 12 L70 10 66 22 Q46 30 30 40 Z" fill="#E9EFF6" />
        <path d="M8 40 Q26 40 40 44 L38 62 Q22 66 12 60 Z" fill="#ECF1F8" />
        <path d="M42 44 Q54 42 62 48 L58 70 Q46 72 40 64 Z" fill="#EEF3F9" />
        <path d="M62 26 Q80 34 92 46 L88 60 Q72 56 60 52 66 40 Z" fill="#E9EFF6" />
        <path d="M30 62 Q50 60 62 66 L58 92 Q40 96 26 88 Z" fill="#ECF1F8" />
        <path
          d="M6 46 Q40 40 70 30 92 44"
          fill="none"
          stroke="#CBD8E8"
          strokeWidth="1.3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {ZONA_LABELS.map((z) => (
          <text
            key={z.zona}
            x={z.x}
            y={z.y}
            textAnchor="middle"
            style={{
              fontSize: 3,
              fill: "#9AAAC1",
              fontWeight: 800,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            {z.zona}
          </text>
        ))}
      </svg>

      <PinsLayer pins={pins} visibleIds={visibleIds} onHover={onHover} onSelect={onSelect} />

      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 shadow-[0_0_0_3px_rgba(224,164,53,0.35)]"
          style={{
            left: `${active.x}%`,
            top: `${active.y}%`,
            background: pinColor(active.p.preco_a_partir),
          }}
        />
      )}

      <div className="absolute bottom-3 left-3 max-w-[190px] rounded-lg border bg-background/95 p-2.5 text-[11px] shadow-sm backdrop-blur">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Preço a partir de
        </div>
        <div className="space-y-1">
          {FAIXAS_PRECO.map((f) => (
            <div key={f.label} className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
                style={{ background: f.cor }}
              />
              {f.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
