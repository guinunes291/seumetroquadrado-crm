// useCountUp — números que "contam" até o valor (KPIs, metas, contagens).
// requestAnimationFrame + ease-out; sob prefers-reduced-motion (ou SSR) o
// valor aparece direto. Nunca altera layout: use com tabular-nums.

import { useEffect, useRef, useState } from "react";

const DEFAULT_DURATION = 900;

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
  // O valor que está NA TELA agora. Cada animação parte dele — interrompida no
  // meio (novo alvo, ou o efeito duplo do StrictMode no dev), a próxima segue
  // de onde o número parou. Marcar "já cheguei ao alvo" na limpeza congelava o
  // número no valor de partida (0) no modo de desenvolvimento, que roda o
  // efeito duas vezes — era o caso do preview.
  const shownRef = useRef(display);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      shownRef.current = target;
      setDisplay(target);
      return;
    }

    const from = shownRef.current;
    if (from === target) return;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = t >= 1 ? target : from + (target - from) * eased;
      shownRef.current = value;
      setDisplay(value);
      rafRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [target, durationMs]);

  return display;
}
