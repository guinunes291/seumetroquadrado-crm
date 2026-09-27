import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleNotch } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Fase 1 (consolidação): sombras só pela escala elev, foco visível de 2px,
  // transição de 200ms que respeita "reduzir movimento" e alvo de 44px no celular.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors duration-200 motion-reduce:transition-none press-scale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-elev-1 hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-elev-1 hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-elev-1 hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-elev-1 hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Só para links dentro de texto corrido.
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 md:h-9",
        sm: "h-11 rounded-md px-3 text-xs md:h-8",
        lg: "h-11 rounded-md px-8 md:h-10",
        // WCAG/mobile: ações só com ícone precisam de alvo de toque de 44 px.
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Estado de processamento: desabilita, mostra spinner e anuncia aria-busy.
   * Use em TODO botão que dispara mutação (`loading={mutation.isPending}`).
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // asChild delega a renderização (ex.: <Link>): sem spinner injetado para
    // não quebrar o contrato de filho único do Slot.
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          aria-busy={loading || undefined}
          {...props}
        >
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <CircleNotch aria-hidden="true" className="animate-spin" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
