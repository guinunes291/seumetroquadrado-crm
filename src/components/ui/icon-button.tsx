import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<
  ButtonProps,
  "aria-label" | "asChild" | "children" | "size"
> {
  /** Nome acessível obrigatório; também é usado como tooltip nativa por padrão. */
  label: string;
  icon: React.ReactNode;
}

/** Botão somente com ícone, nome acessível e alvo mínimo de toque de 44 px. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon, className, title = label, type = "button", ...props }, ref) => (
    <Button
      ref={ref}
      type={type}
      size="icon"
      aria-label={label}
      title={title}
      className={cn(className, "h-11 min-h-11 w-11 min-w-11")}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
    </Button>
  ),
);
IconButton.displayName = "IconButton";
