import { Check, Monitor, Moon, Sun } from "@phosphor-icons/react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { THEME_PREF_LABEL, type ThemePref } from "@/lib/theme";

const OPTIONS: { pref: ThemePref; icon: typeof Sun }[] = [
  { pref: "light", icon: Sun },
  { pref: "dark", icon: Moon },
  { pref: "system", icon: Monitor },
];

/**
 * Escolha de tema como itens de um menu já aberto. Desde a identidade
 * Lançamento (2026-10) o tema saiu do header — que ficou só com busca,
 * Registrar venda e notificações, como no vídeo — e mora no menu da pessoa,
 * no rodapé da sidebar (a mesma gaveta no celular).
 */
export function ThemeMenuItems() {
  const { pref, setPref } = useTheme();
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        Tema
      </DropdownMenuLabel>
      {OPTIONS.map(({ pref: p, icon: OptIcon }) => (
        <DropdownMenuItem key={p} onClick={() => setPref(p)} className="gap-2">
          <OptIcon className="h-4 w-4" />
          <span className="flex-1">{THEME_PREF_LABEL[p]}</span>
          {pref === p && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}
