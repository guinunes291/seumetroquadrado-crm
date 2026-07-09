import { Moon, Sun, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { THEME_PREF_LABEL, type ThemePref } from "@/lib/theme";

const OPTIONS: { pref: ThemePref; icon: typeof Sun }[] = [
  { pref: "dark", icon: Moon },
  { pref: "light", icon: Sun },
  { pref: "system", icon: Monitor },
];

export function ThemeToggle() {
  const { pref, resolved, setPref } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alterar tema">
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ pref: p, icon: OptIcon }) => (
          <DropdownMenuItem key={p} onClick={() => setPref(p)} className="gap-2">
            <OptIcon className="h-4 w-4" />
            <span className="flex-1">{THEME_PREF_LABEL[p]}</span>
            {pref === p && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
