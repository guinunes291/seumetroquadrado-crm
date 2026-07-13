// Calendário mensal da Agenda — extraído da rota /agendamentos e revestido com
// o design system: hoje com anel dourado, dots por tipo (tons nominais do
// status-tones), hover-lift nos compromissos clicáveis. Transições apenas de
// transform/opacity; o grid em si é estático (bordas hairline).

import { useMemo } from "react";
import { addDays, format, isSameDay, isSameMonth, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TIPO_DOT, type Agendamento } from "./types";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AgendaCalendar({
  cursor,
  rangeStart,
  rangeEnd,
  agendamentos,
  onSelect,
}: {
  /** Mês exibido (qualquer dia dentro dele). */
  cursor: Date;
  /** Início da grade (domingo da 1ª semana) — o mesmo range da query. */
  rangeStart: Date;
  /** Fim da grade (sábado da última semana). */
  rangeEnd: Date;
  agendamentos: Agendamento[];
  onSelect: (agendamento: Agendamento) => void;
}) {
  const days = useMemo(() => {
    const out: Date[] = [];
    let d = rangeStart;
    while (d <= rangeEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [rangeStart, rangeEnd]);

  const byDay = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    for (const a of agendamentos) {
      const key = format(parseISO(a.data_inicio), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [agendamentos]);

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-card shadow-elev-1">
      <div className="grid grid-cols-7 border-b border-border-subtle bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="px-2 py-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const today = isSameDay(d, new Date());
          const tipos = [...new Set(items.map((a) => a.tipo))];
          return (
            <div
              key={key}
              className={cn(
                "min-h-[110px] space-y-1 border-b border-r border-border-subtle p-1.5 text-xs",
                !inMonth && "bg-muted/20 text-muted-foreground",
                // Hoje: anel dourado por dentro da célula + leve véu gold.
                today && "bg-gold-500/[0.05] ring-1 ring-inset ring-gold-500/60",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "tabular-nums",
                    today && "font-bold text-gold-600 dark:text-gold-400",
                  )}
                >
                  {format(d, "d")}
                </span>
                {items.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="flex gap-0.5" aria-hidden="true">
                      {tipos.map((t) => (
                        <span key={t} className={cn("h-1.5 w-1.5 rounded-full", TIPO_DOT[t])} />
                      ))}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                  </span>
                )}
              </div>
              {items.slice(0, 3).map((a) => (
                <button
                  key={a.id}
                  onClick={() => onSelect(a)}
                  className="hover-lift press-scale flex w-full items-center gap-1.5 truncate rounded border border-border-subtle bg-card px-1.5 py-1 text-left shadow-elev-1 hover:bg-accent"
                  title={a.titulo}
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TIPO_DOT[a.tipo])} />
                  <span className="truncate">
                    {format(parseISO(a.data_inicio), "HH:mm")} {a.titulo}
                  </span>
                </button>
              ))}
              {items.length > 3 && (
                <div className="px-1 text-[10px] text-muted-foreground">
                  +{items.length - 3} mais
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
