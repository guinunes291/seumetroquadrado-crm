import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Um RAF compartilhado limita o tilt a um cálculo por frame, sem renderizar React. */
export function useAurumTilt(root: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    let frame = 0;
    let active: HTMLElement | null = null;
    const reset = () => {
      cancelAnimationFrame(frame);
      if (active) {
        active.style.removeProperty("--tilt-x");
        active.style.removeProperty("--tilt-y");
        active.style.removeProperty("--light-x");
        active.style.removeProperty("--light-y");
        active.style.removeProperty("will-change");
        active.removeAttribute("data-tilting");
      }
      active = null;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || reduced() || document.hidden) return reset();
      const card =
        e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tilt]") : null;
      if (!card || !el.contains(card)) return reset();
      if (active !== card) reset();
      active = card;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = Math.max(-0.5, Math.min(0.5, (e.clientX - rect.left) / rect.width - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (e.clientY - rect.top) / rect.height - 0.5));
        card.style.setProperty("--tilt-x", `${-y * 12}deg`);
        card.style.setProperty("--tilt-y", `${x * 12}deg`);
        card.style.setProperty("--light-x", `${x * rect.width}px`);
        card.style.setProperty("--light-y", `${y * rect.height}px`);
        card.style.willChange = "transform";
        card.dataset.tilting = "true";
      });
    };
    const media =
      typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", reset);
    media?.addEventListener("change", reset);
    return () => {
      reset();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", reset);
      media?.removeEventListener("change", reset);
    };
  }, [root, enabled]);
}

/** FLIP usa posições relativas à lista; rolar a página não cria falsas ultrapassagens. */
export function useAurumReorder(root: RefObject<HTMLElement | null>, signature: string) {
  const previous = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const rows = root.current?.querySelectorAll<HTMLElement>("[data-ranking-id]");
    if (!rows) return;
    const next = new Map<string, number>();
    const animations: Animation[] = [];
    rows.forEach((row) => {
      const id = row.dataset.rankingId!;
      const y = row.offsetTop;
      const old = previous.current.get(id);
      next.set(id, y);
      if (old === undefined || old === y || reduced() || document.hidden || !row.animate) return;
      row.style.willChange = "transform";
      const animation = row.animate(
        [
          { transform: `translateY(${old - y}px)`, opacity: 0.72 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      animations.push(animation);
      animation.finished.then(() => row.style.removeProperty("will-change")).catch(() => {});
    });
    previous.current = next;
    return () => {
      animations.forEach((a) => a.cancel());
      rows.forEach((row) => row.style.removeProperty("will-change"));
    };
  }, [root, signature]);
}
