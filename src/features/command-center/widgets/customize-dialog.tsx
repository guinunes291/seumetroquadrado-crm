import { useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HOME_WIDGETS, type HomeWidgetPrefs } from "@/features/command-center/widget-registry";

/**
 * Personalização da home: mostrar/ocultar e reordenar widgets — sem drag &
 * drop; switches + setas ↑/↓, operável 100% por teclado. Recebe a MESMA
 * instância de preferências que a rota usa para renderizar o grid, então a
 * tela reflete cada mudança na hora.
 */
export function CustomizeHomeDialog({ prefs }: { prefs: HomeWidgetPrefs }) {
  const [open, setOpen] = useState(false);
  const porId = new Map(HOME_WIDGETS.map((w) => [w.id, w]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Personalizar widgets"
          title="Personalizar widgets"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar Central de Comando</DialogTitle>
          <DialogDescription>
            Mostre, oculte e reordene os widgets. A configuração é sua e vale para a visão atual.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {prefs.order.map((id, i) => {
            const w = porId.get(id);
            if (!w) return null;
            const oculto = prefs.hidden.includes(id);
            return (
              <li key={id} className="flex items-center gap-1 rounded-md border p-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-medium",
                    oculto && "text-muted-foreground",
                  )}
                >
                  {w.title}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Mover ${w.title} para cima`}
                  title="Mover para cima"
                  disabled={i === 0}
                  onClick={() => prefs.move(id, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Mover ${w.title} para baixo`}
                  title="Mover para baixo"
                  disabled={i === prefs.order.length - 1}
                  onClick={() => prefs.move(id, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Switch
                  className="ml-1.5"
                  checked={!oculto}
                  onCheckedChange={() => prefs.toggle(id)}
                  aria-label={`Mostrar ${w.title}`}
                />
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={prefs.reset}>
            <RotateCcw className="h-4 w-4" /> Restaurar padrão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
