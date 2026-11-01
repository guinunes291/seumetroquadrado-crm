// Troca de tema em círculo: o tema novo se espalha a partir do ponto clicado
// (View Transitions API + clip-path no ::view-transition-new(root)). Em vez
// do "flash" seco claro↔escuro, o olho acompanha a troca. Sem suporte à API,
// ou com prefers-reduced-motion, aplica direto — mesmo resultado, sem efeito.
// O CSS que tira o fade de rota durante a troca mora em styles.css (.vt-tema).

export type OrigemTema = { x: number; y: number };

type DocComTransicao = Document & {
  startViewTransition?: (cb: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

/** Raio que cobre a tela inteira a partir de (x, y): distância até o canto mais longe. */
export function raioAteOCanto(x: number, y: number, largura: number, altura: number): number {
  return Math.hypot(Math.max(x, largura - x), Math.max(y, altura - y));
}

/**
 * Origem do círculo a partir do clique. Pelo teclado (Enter num item de menu)
 * o evento vem com detail 0 e coordenadas zeradas — aí usa o centro do item.
 */
export function origemDoEvento(e: {
  detail: number;
  clientX: number;
  clientY: number;
  currentTarget: Element;
}): OrigemTema {
  if (e.detail > 0) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function trocarTemaComCirculo(aplicar: () => void, origem?: OrigemTema): void {
  const doc = typeof document === "undefined" ? null : (document as DocComTransicao);
  const reduzMovimento =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc?.startViewTransition || reduzMovimento) {
    aplicar();
    return;
  }

  const x = origem?.x ?? innerWidth / 2;
  const y = origem?.y ?? innerHeight / 2;
  const fim = raioAteOCanto(x, y, innerWidth, innerHeight);
  const root = doc.documentElement;

  root.classList.add("vt-tema");
  const transicao = doc.startViewTransition(aplicar);
  transicao.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${fim}px at ${x}px ${y}px)`] },
        {
          duration: 620,
          easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    // Transição abortada (ex.: outra começou por cima) — o tema já foi aplicado.
    .catch(() => {});
  transicao.finished.finally(() => root.classList.remove("vt-tema"));
}
