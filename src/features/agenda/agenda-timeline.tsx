// Visão em lista da Agenda usando a Timeline do design system (agrupada por
// dia, ícone por tipo). Cada item mantém a MESMA ação da lista antiga: abrir
// o compromisso para edição — concluir/cancelar/remover/exportar continuam no
// dialog de edição da rota.

import { format, parseISO } from "date-fns";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TIPO_ICON,
  TIPO_ICON_TONE,
  TIPO_LABEL,
  type Agendamento,
} from "./types";

export function AgendaTimeline({
  agendamentos,
  loading,
  corretorNome,
  leadNome,
  onSelect,
  onCreate,
}: {
  agendamentos: Agendamento[];
  loading?: boolean;
  corretorNome: (id: string | null) => string;
  leadNome: (id: string | null) => string;
  onSelect: (agendamento: Agendamento) => void;
  onCreate: () => void;
}) {
  const items: TimelineItem[] = agendamentos.map((a) => ({
    id: a.id,
    icon: TIPO_ICON[a.tipo] ?? CalendarDays,
    iconClassName: TIPO_ICON_TONE[a.tipo],
    timestamp: a.data_inicio,
    title: (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(a)}
          className="text-left font-medium hover:underline"
        >
          {a.titulo}
        </button>
        <Badge variant="secondary" className={cn("text-[10px]", STATUS_TONE[a.status])}>
          {STATUS_LABEL[a.status]}
        </Badge>
      </span>
    ),
    meta: [
      `${format(parseISO(a.data_inicio), "HH:mm")} – ${format(parseISO(a.data_fim), "HH:mm")}`,
      TIPO_LABEL[a.tipo],
      corretorNome(a.corretor_id),
      a.lead_id ? `Lead: ${leadNome(a.lead_id)}` : null,
      a.local || null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4 shadow-elev-1">
      <Timeline
        items={items}
        groupByDay
        loading={loading}
        empty={
          <EmptyState
            icon={CalendarDays}
            title="Nenhum agendamento no período"
            description="Mude o mês nos controles acima ou crie um novo compromisso."
            action={
              <Button size="sm" onClick={onCreate}>
                <CalendarPlus className="mr-1 h-4 w-4" /> Novo agendamento
              </Button>
            }
            className="border-0"
          />
        }
      />
    </div>
  );
}
