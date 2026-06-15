import { useMemo } from "react";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subDays,
  subMonths,
  format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export const PERIOD_PRESETS = [
  { value: "all", label: "Todo o período" },
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "this_week", label: "Esta semana" },
  { value: "last_week", label: "Semana passada" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "last_30", label: "Últimos 30 dias" },
  { value: "last_90", label: "Últimos 90 dias" },
  { value: "this_year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["value"];

export type DateRange = { di: Date | null; df: Date | null };

export function rangeFromPreset(
  preset: PeriodPreset,
  custom?: { from?: Date; to?: Date },
): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { di: startOfDay(now), df: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { di: startOfDay(y), df: endOfDay(y) };
    }
    case "this_week":
      return { di: startOfWeek(now, { weekStartsOn: 1 }), df: endOfWeek(now, { weekStartsOn: 1 }) };
    case "last_week": {
      const lw = subDays(now, 7);
      return { di: startOfWeek(lw, { weekStartsOn: 1 }), df: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case "this_month":
      return { di: startOfMonth(now), df: endOfMonth(now) };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { di: startOfMonth(lm), df: endOfMonth(lm) };
    }
    case "last_30":
      return { di: startOfDay(subDays(now, 30)), df: endOfDay(now) };
    case "last_90":
      return { di: startOfDay(subDays(now, 90)), df: endOfDay(now) };
    case "this_year":
      return { di: startOfYear(now), df: endOfDay(now) };
    case "custom":
      return {
        di: custom?.from ? startOfDay(custom.from) : null,
        df: custom?.to ? endOfDay(custom.to) : null,
      };
    case "all":
    default:
      return { di: null, df: null };
  }
}

export function PeriodFilter({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
}: {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  custom: { from?: Date; to?: Date };
  onCustomChange: (c: { from?: Date; to?: Date }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as PeriodPreset)}>
        <SelectTrigger className="w-[200px]">
          <CalendarDays className="h-4 w-4 mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[260px] justify-start text-left font-normal">
              <CalendarRange className="mr-2 h-4 w-4" />
              {custom.from
                ? custom.to
                  ? `${format(custom.from, "dd/MM/yy", { locale: ptBR })} – ${format(custom.to, "dd/MM/yy", { locale: ptBR })}`
                  : format(custom.from, "dd/MM/yyyy", { locale: ptBR })
                : "Selecione as datas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarComponent
              initialFocus
              mode="range"
              defaultMonth={custom.from}
              selected={{ from: custom.from, to: custom.to }}
              onSelect={(r) => onCustomChange({ from: r?.from, to: r?.to })}
              numberOfMonths={2}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function useDateFilter(preset: PeriodPreset, custom: { from?: Date; to?: Date }) {
  return useMemo(() => {
    const r = rangeFromPreset(preset, custom);
    return {
      di: r.di?.toISOString() ?? null,
      df: r.df?.toISOString() ?? null,
    };
  }, [preset, custom.from?.getTime(), custom.to?.getTime()]);
}
