import { useEffect, useState } from "react";
import { SprintStartDialog } from "@/features/sprint/sprint-dialog";
import { SprintHud } from "@/features/sprint/sprint-hud";

/**
 * Montagem global do Modo Sprint (no shell autenticado): o HUD sobrevive à
 * navegação e o diálogo de início abre de qualquer lugar via o evento
 * "open-sprint" (hero da Central de Comando, command palette).
 */
export function SprintGlobal() {
  const [startOpen, setStartOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setStartOpen(true);
    window.addEventListener("open-sprint", onOpen);
    return () => window.removeEventListener("open-sprint", onOpen);
  }, []);

  return (
    <>
      <SprintStartDialog open={startOpen} onOpenChange={setStartOpen} />
      <SprintHud />
    </>
  );
}
