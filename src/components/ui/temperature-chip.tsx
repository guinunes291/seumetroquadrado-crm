import { Flame, Thermometer, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INTENT_BADGE_BORDERED,
  TEMPERATURA_INTENT,
  TEMPERATURA_LABEL,
  type Temperatura,
} from "@/lib/status-tones";

const TEMP_ICON: Record<Temperatura, typeof Flame> = {
  quente: Flame,
  morno: Thermometer,
  frio: Snowflake,
};

/**
 * Chip de temperatura do lead. `quente` pulsa em dourado (pulse-glow) para
 * puxar o olho — é o único chip com movimento, de propósito.
 */
export function TemperatureChip({
  temperatura,
  size = "md",
  pulse = true,
  className,
}: {
  temperatura: string | null | undefined;
  size?: "sm" | "md";
  /** Desliga o pulso (ex.: dentro de listas longas). */
  pulse?: boolean;
  className?: string;
}) {
  const temp = (temperatura ?? "") as Temperatura;
  const intent = TEMPERATURA_INTENT[temp];
  if (!intent) return null;
  const Icon = TEMP_ICON[temp];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        INTENT_BADGE_BORDERED[intent],
        size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
        temp === "quente" && pulse && "animate-pulse-glow motion-reduce:animate-none",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {TEMPERATURA_LABEL[temp]}
    </span>
  );
}
