import { Calculator, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lpWhatsAppHref, scrollToLpId } from "@/lib/lp-jd-bonfiglioli";

/**
 * CTAs sempre acessíveis: barra fixa no rodapé (mobile) e botão flutuante de
 * WhatsApp (desktop, apenas quando o número oficial estiver configurado).
 */
export function LpStickyCta() {
  const wa = lpWhatsAppHref();

  return (
    <>
      {/* Barra fixa mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="h-12 bg-gold text-sm font-semibold text-navy hover:bg-gold/90"
            onClick={() => scrollToLpId("simular")}
          >
            <Calculator />
            Simular agora
          </Button>
          {wa ? (
            <Button
              asChild
              variant="outline"
              className="h-12 border-white/25 bg-white/5 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
            >
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-12 border-white/25 bg-white/5 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
              onClick={() => scrollToLpId("form")}
            >
              <MessageCircle />
              Falar agora
            </Button>
          )}
        </div>
      </div>

      {/* Botão flutuante de WhatsApp (desktop) */}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Conversar no WhatsApp"
          className="fixed bottom-6 right-6 z-40 hidden size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 md:flex"
        >
          <MessageCircle className="size-7" />
        </a>
      )}
    </>
  );
}
