import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lpWhatsAppHref, scrollToLpId, WHATSAPP_MSG_PADRAO } from "@/lib/lp-jd-bonfiglioli";

type WhatsAppCtaProps = {
  mensagem?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
  /** Texto exibido quando o WhatsApp está configurado. */
  children?: ReactNode;
  /** Texto do fallback (rola até o formulário) enquanto não há número. */
  fallbackLabel?: string;
};

/**
 * CTA de WhatsApp que nunca renderiza link quebrado: enquanto o número
 * oficial da SMQ não estiver em LP_CONFIG.whatsapp, degrada para um botão
 * que leva ao formulário de cadastro.
 */
export function WhatsAppCta({
  mensagem = WHATSAPP_MSG_PADRAO,
  className,
  size = "lg",
  children = "Ver condições pelo WhatsApp",
  fallbackLabel = "Falar com um especialista",
}: WhatsAppCtaProps) {
  const href = lpWhatsAppHref(mensagem);

  if (!href) {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={() => scrollToLpId("form")}
      >
        <MessageCircle data-testid="lp-wa-icon" />
        {fallbackLabel}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size={size} className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle data-testid="lp-wa-icon" />
        {children}
      </a>
    </Button>
  );
}
