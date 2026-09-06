import { useEffect, useState } from "react";
import { SamiMark } from "@/components/ui/sami-mark";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { SamiQPanel } from "@/components/samiq/samiq-panel";
import {
  SAMIQ_ABRIR_EVENTO,
  lerDetalheAbrirSamiQ,
  type SamiQAbrirDetail,
} from "@/components/samiq/abrir-samiq";

/**
 * SamiQ — monograma da Sami flutuante (desktop) + painel lateral. No mobile o
 * gatilho é o slot central do BottomNav (evento "open-samiq") e o painel vira
 * bottom-drawer. Atalho de teclado: ⌘J / Ctrl+J.
 */
export function SamiQLauncher() {
  const [open, setOpen] = useState(false);
  // Contexto vindo de um chip (Onda S3): cliente em foco e texto pré-digitado.
  const [seed, setSeed] = useState<SamiQAbrirDetail | undefined>(undefined);
  const isMobile = useIsMobile();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "j" || e.key === "J") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSeed(undefined);
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      setSeed(lerDetalheAbrirSamiQ(e));
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener(SAMIQ_ABRIR_EVENTO, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(SAMIQ_ABRIR_EVENTO, onOpen);
    };
  }, []);

  const mudarAberto = (proximo: boolean) => {
    setOpen(proximo);
    if (!proximo) setSeed(undefined);
  };

  const titulo = (
    <span className="flex items-center gap-2">
      <SamiMark className="h-7 w-7" />
      SamiQ — copiloto do corretor
    </span>
  );

  return (
    <>
      {/* FAB desktop — o mobile usa o slot central do BottomNav */}
      <button
        type="button"
        aria-label="Abrir SamiQ (⌘J)"
        title="SamiQ — copiloto do corretor (⌘J)"
        onClick={() => mudarAberto(true)}
        className="fixed bottom-6 right-6 z-40 hidden h-13 w-13 items-center justify-center rounded-full shadow-elev-3 transition-transform hover:scale-105 active:scale-95 md:flex [--sami-halo:var(--color-card)]"
      >
        <SamiMark className="h-13 w-13" />
      </button>

      {isMobile ? (
        <Drawer open={open} onOpenChange={mudarAberto}>
          <DrawerContent className="flex h-[85vh] flex-col">
            <DrawerHeader className="border-b pb-2 text-left">
              <DrawerTitle className="font-display text-base">{titulo}</DrawerTitle>
            </DrawerHeader>
            <SamiQPanel seed={seed} onClose={() => mudarAberto(false)} />
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={mudarAberto}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="font-display text-base">{titulo}</SheetTitle>
            </SheetHeader>
            <SamiQPanel seed={seed} onClose={() => mudarAberto(false)} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
