// Celebração CSS-only — rara por design: venda registrada, meta batida,
// conquista desbloqueada. Nunca em ação corriqueira, nunca bloqueia a UI
// (overlay pointer-events-none que se remove sozinho). Sob reduced-motion
// nada é renderizado — o toast/estado da tela já comunica o evento.

import { useEffect, useState } from "react";

export type CelebrationKind = "venda" | "meta" | "conquista";

const EVENT = "smq-celebrate";

/** Dispara a celebração global (host montado no shell autenticado). */
export function celebrate(kind: CelebrationKind): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind } }));
}

const PARTICLE_COUNT = 16;

// Trajetórias determinísticas (leque de ângulos com raios alternados) — sem
// Math.random: mesmo visual em todo disparo, testável e sem hidratação torta.
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (i % 2) * 0.2;
  const radius = 120 + (i % 4) * 46;
  return {
    dx: Math.round(Math.cos(angle) * radius),
    dy: Math.round(Math.sin(angle) * radius * 0.72) - 40,
    rot: (i % 2 === 0 ? 1 : -1) * (90 + (i % 5) * 40),
    delay: (i % 4) * 40,
    size: 5 + (i % 3) * 3,
  };
});

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function CelebrationHost() {
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const onCelebrate = () => {
      if (prefersReducedMotion()) return;
      setBurst((b) => b + 1);
    };
    window.addEventListener(EVENT, onCelebrate);
    return () => window.removeEventListener(EVENT, onCelebrate);
  }, []);

  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(0), 1400);
    return () => clearTimeout(timer);
  }, [burst]);

  if (!burst) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
    >
      {PARTICLES.map((p, i) => (
        <span
          key={`${burst}-${i}`}
          className="absolute rounded-[2px] bg-gradient-gold opacity-0"
          style={{
            width: p.size,
            height: p.size,
            animation: `celebrate-burst 1.15s var(--ease-out-quart) ${p.delay}ms both`,
            ["--dx" as string]: `${p.dx}px`,
            ["--dy" as string]: `${p.dy}px`,
            ["--rot" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
