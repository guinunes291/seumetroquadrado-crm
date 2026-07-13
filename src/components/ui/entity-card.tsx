import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,[contenteditable="true"],[role="button"],[role="checkbox"],[role="link"],[role="menuitem"]';

type EntitySurfaceProps = Omit<React.HTMLAttributes<HTMLElement>, "onClick" | "onKeyDown"> & {
  asChild?: boolean;
  selected?: boolean;
  onActivate?: () => void;
  onClick?: React.MouseEventHandler<HTMLElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
};

export type EntityCardProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "children" | "onClick" | "onKeyDown"
> & {
  children: React.ReactNode;
  selected?: boolean;
  onActivate?: () => void;
  activationLabel?: string;
};

function isNestedInteractive(target: EventTarget | null, currentTarget: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    currentTarget instanceof HTMLElement &&
    target !== currentTarget &&
    Boolean(target.closest(INTERACTIVE_SELECTOR))
  );
}

function useEntityHandlers({
  onActivate,
  onClick,
  onKeyDown,
}: Pick<EntitySurfaceProps, "onActivate" | "onClick" | "onKeyDown">) {
  const handleClick: React.MouseEventHandler<HTMLElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || !onActivate) return;
    if (!isNestedInteractive(event.target, event.currentTarget)) onActivate();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLElement> = (event) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      !onActivate ||
      isNestedInteractive(event.target, event.currentTarget)
    )
      return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  };

  return { handleClick, handleKeyDown };
}

/**
 * Superfície de entidade para cards mobile. A ativação usa um botão-overlay,
 * que expõe `aria-pressed` sem engolir os links e botões internos do card.
 */
export const EntityCard = React.forwardRef<HTMLElement, EntityCardProps>(
  (
    {
      selected = false,
      onActivate,
      activationLabel,
      className,
      children,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    return (
      <article
        ref={ref}
        aria-label={ariaLabel}
        data-state={selected ? "selected" : undefined}
        className={cn(
          "relative rounded-xl border bg-card p-3 shadow-elev-1 data-[state=selected]:ring-2 data-[state=selected]:ring-primary",
          // Lift no hover (desktop) + squeeze no toque (mobile) SÓ quando o
          // card é ativável — card estático não deve prometer clique.
          onActivate && "cursor-pointer hover-lift press-scale hover:shadow-elev-2",
          className,
        )}
        {...props}
      >
        {onActivate && (
          <button
            type="button"
            aria-label={activationLabel ?? ariaLabel ?? "Abrir item"}
            aria-pressed={selected}
            className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={onActivate}
          />
        )}
        <div className="pointer-events-none relative z-10 space-y-2 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_textarea]:pointer-events-auto">
          {children}
        </div>
      </article>
    );
  },
);
EntityCard.displayName = "EntityCard";

/** Mesmo contrato de interação para linhas densas no desktop. */
export const EntityRow = React.forwardRef<HTMLElement, EntitySurfaceProps>(
  (
    {
      asChild = false,
      selected = false,
      onActivate,
      onClick,
      onKeyDown,
      className,
      tabIndex,
      role,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "div";
    const { handleClick, handleKeyDown } = useEntityHandlers({ onActivate, onClick, onKeyDown });

    return (
      <Comp
        ref={ref as React.Ref<HTMLDivElement>}
        role={role ?? (asChild ? undefined : "row")}
        tabIndex={tabIndex ?? (onActivate ? 0 : undefined)}
        aria-keyshortcuts={onActivate ? "Enter Space" : undefined}
        aria-selected={selected}
        data-state={selected ? "selected" : undefined}
        className={cn(
          "transition-colors data-[state=selected]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          onActivate && "cursor-pointer",
          className,
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
EntityRow.displayName = "EntityRow";
