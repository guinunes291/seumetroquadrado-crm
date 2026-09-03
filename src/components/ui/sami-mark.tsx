import { forwardRef } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Monograma da Sami — o avatar da assistente (identidade v3, decisão 8).
 *
 * Substitui o `Sparkles` em todas as superfícies de IA: um "S" em Sora dentro
 * de um disco navy com fio dourado e um ponto de presença. Trata a assistente
 * como colega de equipe (igual ao avatar dos corretores), não como "recurso de
 * IA". O ponto dourado é o único lugar onde ela "brilha": comunica presença,
 * não mágica.
 *
 * Aceita as mesmas props de um ícone Phosphor (`IconProps`) para poder entrar
 * em qualquer slot tipado como `Icon` (ex.: `{ icon: SamiMark }`); `weight` e
 * `mirrored` são ignorados de propósito — o monograma tem uma forma só.
 */
export const SamiMark = forwardRef<SVGSVGElement, IconProps>(function SamiMark(
  { className, size = 24, alt, color: _color, weight: _weight, mirrored: _mirrored, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={alt ? "img" : undefined}
      aria-hidden={alt ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    >
      {alt ? <title>{alt}</title> : null}
      <circle cx="16" cy="16" r="15" fill="var(--sami-disc)" />
      <circle
        cx="16"
        cy="16"
        r="14.4"
        fill="none"
        stroke="var(--color-gold)"
        strokeWidth="1.1"
        opacity="0.9"
      />
      <text
        x="16"
        y="21.6"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize="17"
        fill="var(--sami-glyph)"
      >
        S
      </text>
      <circle
        cx="25.5"
        cy="25.5"
        r="3.4"
        fill="var(--color-gold)"
        stroke="var(--sami-halo, var(--color-background))"
        strokeWidth="1.4"
      />
    </svg>
  );
});
