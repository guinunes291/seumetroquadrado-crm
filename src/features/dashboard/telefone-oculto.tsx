import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Telefone com privacidade de apresentação: mascarado por padrão (sobram os
 * 2 últimos dígitos para conferência), revela ao passar o mouse e o botão de
 * olho trava/destrava a revelação — dá para projetar o relatório numa reunião
 * sem expor o contato de cada cliente.
 */
export function TelefoneOculto({
  telefone,
  className,
}: {
  telefone: string | null | undefined;
  className?: string;
}) {
  const [fixo, setFixo] = useState(false);
  const [hover, setHover] = useState(false);
  if (!telefone?.trim()) return null;
  const visivel = fixo || hover;
  const mascarado = telefone.replace(/\d(?=(?:\D*\d){2})/g, "•");
  return (
    <span
      className={cn("inline-flex items-center gap-1 tabular-nums", className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span aria-label={visivel ? undefined : "Telefone oculto"}>
        {visivel ? telefone : mascarado}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        aria-label={fixo ? "Ocultar telefone" : "Mostrar telefone"}
        aria-pressed={fixo}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setFixo((v) => !v);
        }}
      >
        {fixo ? <EyeSlash className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </span>
  );
}
