// Drag-and-drop por Pointer Events — mouse, toque e caneta num código só,
// sem biblioteca. Requisito estreito do Kanban: arrastar um card para outra
// coluna (sem sort intra-coluna; a ordem é calculada). O caminho acessível
// por teclado continua sendo o menu "Mudar etapa" de cada card.
//
// Performance: o ghost segue o ponteiro via transform/translate3d num nó
// fixo (compositor-only); os rects das colunas são cacheados no início do
// arrasto e o hit-test é aritmética pura (testável). Auto-scroll horizontal
// quando o ponteiro encosta nas bordas do contêiner.

import { useCallback, useEffect, useRef, useState } from "react";

export type DropTargetRect = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Hit-test puro: primeiro alvo que contém o ponto (ou null). */
export function hitTest(rects: DropTargetRect[], x: number, y: number): string | null {
  for (const r of rects) {
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return r.id;
  }
  return null;
}

const LONG_PRESS_MS = 250;
const DRAG_THRESHOLD_PX = 6;
const EDGE_SCROLL_ZONE = 48;
const EDGE_SCROLL_STEP = 14;

export type PointerDndState = {
  cardId: string;
  overColumnId: string | null;
} | null;

export function usePointerDnd(opts: {
  onDrop: (cardId: string, toColumnId: string) => void;
  canDrop?: (cardId: string, toColumnId: string) => boolean;
  /** Contêiner com overflow-x para auto-scroll nas bordas. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}) {
  const { onDrop, canDrop, scrollContainerRef } = opts;
  const [dragging, setDragging] = useState<PointerDndState>(null);

  const columnsRef = useRef(new Map<string, HTMLElement>());
  const rectsRef = useRef<DropTargetRect[]>([]);
  const draggingRef = useRef<PointerDndState>(null);
  const ghostRef = useRef<HTMLElement | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; cardId: string; el: HTMLElement } | null>(null);
  const activeRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const measureColumns = useCallback(() => {
    rectsRef.current = [...columnsRef.current.entries()].map(([id, el]) => {
      const r = el.getBoundingClientRect();
      return { id, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
  }, []);

  const cleanup = useCallback(() => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    ghostRef.current?.remove();
    ghostRef.current = null;
    startRef.current = null;
    activeRef.current = false;
    draggingRef.current = null;
    setDragging(null);
    document.body.style.userSelect = "";
  }, []);

  const beginDrag = useCallback(
    (cardId: string, el: HTMLElement, x: number, y: number) => {
      activeRef.current = true;
      measureColumns();
      document.body.style.userSelect = "none";

      // Ghost: clone visual leve do card, movido só por transform.
      const rect = el.getBoundingClientRect();
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = `position:fixed;left:0;top:0;width:${rect.width}px;margin:0;z-index:80;pointer-events:none;opacity:0.92;box-shadow:var(--elev-4);transform:translate3d(${rect.left}px,${rect.top}px,0) rotate(2deg);will-change:transform;`;
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      lastPointRef.current = { x, y };

      const state = { cardId, overColumnId: hitTest(rectsRef.current, x, y) };
      draggingRef.current = state;
      setDragging(state);
    },
    [measureColumns],
  );

  const moveGhost = useCallback(() => {
    rafRef.current = null;
    const start = startRef.current;
    const ghost = ghostRef.current;
    if (!start || !ghost) return;
    const { x, y } = lastPointRef.current;
    const dx = x - start.x;
    const dy = y - start.y;
    const rect = start.el.getBoundingClientRect();
    ghost.style.transform = `translate3d(${rect.left + dx}px, ${rect.top + dy}px, 0) rotate(2deg)`;

    // Auto-scroll horizontal nas bordas do board.
    const sc = scrollContainerRef?.current;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (x < r.left + EDGE_SCROLL_ZONE) sc.scrollLeft -= EDGE_SCROLL_STEP;
      else if (x > r.right - EDGE_SCROLL_ZONE) sc.scrollLeft += EDGE_SCROLL_STEP;
    }
  }, [scrollContainerRef]);

  const onPointerMoveDoc = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      lastPointRef.current = { x: e.clientX, y: e.clientY };

      if (!activeRef.current) {
        // Mouse: começa após o threshold. Toque: só via long-press (timer).
        const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        if (e.pointerType !== "touch" && moved >= DRAG_THRESHOLD_PX) {
          if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
          beginDrag(start.cardId, start.el, e.clientX, e.clientY);
        } else if (e.pointerType === "touch" && moved >= DRAG_THRESHOLD_PX * 2) {
          // Moveu antes do long-press: é scroll, não arrasto.
          if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
          startRef.current = null;
        }
        return;
      }

      e.preventDefault();
      if (!rafRef.current) rafRef.current = requestAnimationFrame(moveGhost);
      const over = hitTest(rectsRef.current, e.clientX, e.clientY);
      const cur = draggingRef.current;
      if (cur && cur.overColumnId !== over) {
        const next = { ...cur, overColumnId: over };
        draggingRef.current = next;
        setDragging(next);
      }
    },
    [beginDrag, moveGhost],
  );

  const onPointerUpDoc = useCallback(
    (e: PointerEvent) => {
      const cur = draggingRef.current;
      if (activeRef.current && cur) {
        const target = hitTest(rectsRef.current, e.clientX, e.clientY);
        if (target && (!canDrop || canDrop(cur.cardId, target))) {
          onDrop(cur.cardId, target);
        }
      }
      cleanup();
    },
    [canDrop, cleanup, onDrop],
  );

  useEffect(() => {
    const onCancel = () => cleanup();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeRef.current) cleanup();
    };
    document.addEventListener("pointermove", onPointerMoveDoc, { passive: false });
    document.addEventListener("pointerup", onPointerUpDoc);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointermove", onPointerMoveDoc);
      document.removeEventListener("pointerup", onPointerUpDoc);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
      cleanup();
    };
  }, [cleanup, onPointerMoveDoc, onPointerUpDoc]);

  /** Espalhe no elemento do card arrastável. */
  const getCardProps = useCallback(
    (cardId: string): React.HTMLAttributes<HTMLElement> => ({
      onPointerDown: (e) => {
        // Só botão principal; ignora interativos internos (menu, botões, links).
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [role=menuitem]")) return;
        const el = e.currentTarget as HTMLElement;
        startRef.current = { x: e.clientX, y: e.clientY, cardId, el };
        if (e.pointerType === "touch") {
          // Long-press para não sequestrar o scroll da página.
          pressTimerRef.current = setTimeout(() => {
            const s = startRef.current;
            if (s)
              beginDrag(
                s.cardId,
                s.el,
                lastPointRef.current.x || s.x,
                lastPointRef.current.y || s.y,
              );
          }, LONG_PRESS_MS);
        }
      },
      style: { touchAction: "pan-y" },
    }),
    [beginDrag],
  );

  /** Registre cada coluna como alvo de drop. */
  const registerColumn = useCallback((columnId: string) => {
    return (el: HTMLElement | null) => {
      if (el) columnsRef.current.set(columnId, el);
      else columnsRef.current.delete(columnId);
    };
  }, []);

  return { dragging, getCardProps, registerColumn };
}
