import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { getShortcutGroups, isTypingTarget } from "@/lib/shortcuts";

/**
 * Overlay de atalhos — abre com "?" (fora de campos de texto) ou pelo evento
 * "open-shortcuts-help". Lê o registry central (lib/shortcuts).
 */
export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-shortcuts-help", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-shortcuts-help", onOpen);
    };
  }, []);

  const groups = getShortcutGroups();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Atalhos de teclado</DialogTitle>
          <DialogDescription>Trabalhe sem tirar a mão do teclado.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map(({ group, items }) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {items.map((s) => (
                  <li
                    key={`${group}-${s.keys}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm">{s.description}</span>
                    <Kbd>{s.keys}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
