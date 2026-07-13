// useCountUp — números que "contam" até o valor (KPIs, metas, contagens).
// requestAnimationFrame + ease-out; sob prefers-reduced-motion (ou SSR) o
// valor aparece direto. Nunca altera layout: use com tabular-nums.

import { useEffect, useRef, useState } from "react";

const DEFAULT_DURATION = 700;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useCountUp(target: number, options: { durationMs?: number } = {}): number {
  const durationMs = options.durationMs ?? DEFAULT_DURATION;
  // Primeiro paint parte de 0 (sensação de painel ligando); updates seguintes
  // animam do valor anterior para o novo.
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0));
  const fromRef = useRef(display);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = from + (target - from) * eased;
      setDisplay(t >= 1 ? target : value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      // Interrompido no meio (novo alvo/unmount): próximo ciclo parte de onde parou.
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return display;
}
