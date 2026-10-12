// Calendário mensal da Agenda (padrão Lançamento, 2026-10): hoje com anel
// dourado; o ponto de cada compromisso só usa cor por intenção — visita em
// navy, os demais tipos em neutro, a visita que passou sem validação em
// atenção e o que já foi encerrado em cinza (texto apagado). Clicar abre o
// compromisso para editar. Transições apenas de transform/opacity.

import { useMemo } from "react";
import { addDays, format, isSameDay, isSameMonth, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Notas } from "@/components/ui/placar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pontoDoCompromisso } from "./agenda-do-dia";
import { PONTO_CLASSE, type Agendamento } from "./types";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Evento({
  a,
  agora,
  rotulo,
  onSelect,
  className,
}: {
  a: Agendamento;
  agora: Date;
  rotulo: string;
  onSelect: (a: Agendamento) => void;
  className?: string;
}) {
  const ponto = pontoDoCompromisso(a, agora);
  const encerrado = ponto === "encerrado";
  return (
    <button
      type="button"
      onClick={() => onSelect(a)}
      className={cn(
        "press-scale flex w-full items-center gap-1.5 truncate rounded-md border border-border-subtle px-1.5 py-0.5 text-left text-[11px] font-medium hover:bg-accent",
        encerrado ? "bg-transparent text-muted-foreground" : "bg-card text-foreground",
        className,
      )}
      title={ponto === "validar" ? `${a.titulo} — passou sem desfecho, validar` : a.titulo}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PONTO_CLASSE[ponto])} />
      <span className="tabular-nums text-muted-foreground">
        {format(parseISO(a.data_inicio), "HH:mm")}
      </span>
      <span className="truncate">{rotulo}</span>
    </button>
  );
}

export function AgendaCalendar({
  cursor,
  rangeStart,
  rangeEnd,
  agendamentos,
  agora = new Date(),
  rotulo = (a) => a.titulo,
  onSelect,
}: {
  /** Mês exibido (qualquer dia dentro dele). */
  cursor: Date;
  /** Início da grade (domingo da 1ª semana) — o mesmo range da query. */
  rangeStart: Date;
  /** Fim da grade (sábado da última semana). */
  rangeEnd: Date;
  agendamentos: Agendamento[];
  /** Relógio da tela: decide o que já passou sem validação. */
  agora?: Date;
  /** Texto do compromisso na célula (padrão: o título). */
  rotulo?: (agendamento: Agendamento) => string;
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
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-elev-1">
        <div
          className="grid grid-cols-7 border-b border-border-subtle bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          aria-hidden="true"
        >
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            const inMonth = isSameMonth(d, cursor);
            const today = isSameDay(d, agora);
            return (
              <div
                key={key}
                aria-current={today ? "date" : undefined}
                className={cn(
                  "flex min-h-[88px] min-w-0 flex-col gap-[3px] border-b border-r border-border-subtle p-1.5 text-xs md:min-h-[104px]",
                  !inMonth && "bg-muted/20 text-muted-foreground",
                  // Hoje: anel dourado por dentro da célula + leve véu gold.
                  today && "bg-gold-500/[0.05] ring-1 ring-inset ring-gold-500/60",
                )}
              >
                <div className="flex items-center justify-between px-0.5 pb-0.5">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      today && "text-gold-700 dark:text-gold-400",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                  {items.length > 0 && (
                    <span className="text-[10.5px] tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                  )}
                </div>
                {items.slice(0, 3).map((a) => (
                  <Evento key={a.id} a={a} agora={agora} rotulo={rotulo(a)} onSelect={onSelect} />
                ))}
                {items.length > 3 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="press-scale w-full rounded px-1 py-0.5 text-left text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        +{items.length - 3} mais
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-2">
                      <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                        {format(d, "dd/MM")} — {items.length} compromissos
                      </div>
                      <div className="max-h-80 space-y-1 overflow-y-auto">
                        {items.map((a) => (
                          <Evento
                            key={a.id}
                            a={a}
                            agora={agora}
                            rotulo={rotulo(a)}
                            onSelect={onSelect}
                            className="py-1.5 text-xs"
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Notas className="text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", PONTO_CLASSE.visita)} aria-hidden="true" />
          visita
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", PONTO_CLASSE.outro)} aria-hidden="true" />
          ligação, reunião, follow-up
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", PONTO_CLASSE.validar)} aria-hidden="true" />
          {"a validar"}
        </span>
        <span>· encerrados em cinza · clique no compromisso para editar</span>
      </Notas>
    </div>
  );
}
