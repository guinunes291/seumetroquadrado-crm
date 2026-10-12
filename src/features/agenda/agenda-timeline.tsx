// Visão em lista da Agenda (padrão Lançamento, 2026-10) — o padrão no
// celular: os compromissos agrupados por dia ("Hoje · seg 12/10 · 4"), uma
// linha cada (hora · tipo · nome · estado). No mês corrente a lista começa
// HOJE; os dias anteriores do mês ficam atrás de "Ver os N anteriores". Cada
// linha mantém a MESMA ação da lista antiga: abrir o compromisso para editar
// (concluir/cancelar/remover/exportar continuam no diálogo de edição).

import { useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDots, CalendarPlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { estadoDoCompromisso, pontoDoCompromisso } from "./agenda-do-dia";
import { EstadoChip } from "./agenda-hoje";
import { PONTO_CLASSE, TIPO_LABEL, type Agendamento } from "./types";

function rotuloDoDia(d: Date, agora: Date): string | null {
  if (isSameDay(d, agora)) return "Hoje";
  if (isSameDay(d, addDays(agora, 1))) return "Amanhã";
  if (isSameDay(d, addDays(agora, -1))) return "Ontem";
  return null;
}

export function AgendaTimeline({
  agendamentos,
  loading,
  agora = new Date(),
  desde,
  corretorNome,
  leadNome,
  mostrarCorretor = false,
  onSelect,
  onCreate,
}: {
  agendamentos: Agendamento[];
  loading?: boolean;
  /** Relógio da tela (estado de cada compromisso e "Hoje/Amanhã"). */
  agora?: Date;
  /** A lista começa aqui (o início de hoje, no mês corrente); o que vem antes
   *  fica atrás de "Ver os N anteriores". */
  desde?: Date | null;
  corretorNome: (id: string | null) => string;
  /** Nome do lead (null quando não está na lista carregada — cai no título). */
  leadNome: (id: string | null) => string | null;
  /** Gestão: o nome do corretor ao lado de cada compromisso. */
  mostrarCorretor?: boolean;
  onSelect: (agendamento: Agendamento) => void;
  onCreate: () => void;
}) {
  const [verAnteriores, setVerAnteriores] = useState(false);

  const anteriores = useMemo(
    () => (desde ? agendamentos.filter((a) => parseISO(a.data_inicio) < desde).length : 0),
    [agendamentos, desde],
  );

  const grupos = useMemo(() => {
    const visiveis =
      desde && !verAnteriores
        ? agendamentos.filter((a) => parseISO(a.data_inicio) >= desde)
        : agendamentos;
    const out: { chave: string; dia: Date; itens: Agendamento[] }[] = [];
    for (const a of [...visiveis].sort(
      (x, y) => Date.parse(x.data_inicio) - Date.parse(y.data_inicio),
    )) {
      const dia = parseISO(a.data_inicio);
      const chave = format(dia, "yyyy-MM-dd");
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.chave === chave) ultimo.itens.push(a);
      else out.push({ chave, dia, itens: [a] });
    }
    return out;
  }, [agendamentos, desde, verAnteriores]);

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {anteriores > 0 && (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setVerAnteriores((v) => !v)}
        >
          {verAnteriores
            ? "Começar em hoje"
            : `Ver ${anteriores === 1 ? "o compromisso anterior" : `os ${anteriores} anteriores`} deste mês`}
        </button>
      )}

      {grupos.length === 0 ? (
        <EmptyState
          icon={CalendarDots}
          title={anteriores > 0 ? "Nada daqui até o fim do mês" : "Nenhum agendamento no período"}
          description="Mude o mês na linha acima ou crie um novo compromisso."
          action={
            <Button size="sm" variant="outline" onClick={onCreate}>
              <CalendarPlus className="mr-1 h-4 w-4" /> Novo agendamento
            </Button>
          }
          className="rounded-2xl"
        />
      ) : (
        grupos.map((g) => {
          const relativo = rotuloDoDia(g.dia, agora);
          const diaCurto = format(g.dia, "EEEEEE dd/MM", { locale: ptBR });
          return (
            <section key={g.chave} aria-label={relativo ?? diaCurto}>
              <h3 className="mb-1.5 flex items-baseline gap-1.5 text-[12.5px] font-semibold">
                {relativo ?? diaCurto}
                <span className="font-medium text-muted-foreground">
                  {relativo ? `· ${diaCurto} · ${g.itens.length}` : `· ${g.itens.length}`}
                </span>
              </h3>
              <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-elev-1">
                {g.itens.map((a) => {
                  const ponto = pontoDoCompromisso(a, agora);
                  const doLead = a.lead_id ? leadNome(a.lead_id) : null;
                  const nome = doLead ?? a.titulo;
                  const detalhes = [
                    `${format(parseISO(a.data_inicio), "HH:mm")}–${format(parseISO(a.data_fim), "HH:mm")}`,
                    doLead ? a.titulo : null,
                    a.local,
                    mostrarCorretor ? corretorNome(a.corretor_id) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        title={detalhes}
                        data-testid="agenda-lista-item"
                        className={cn(
                          "grid min-h-12 w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-accent/40",
                          ponto === "encerrado" && "text-muted-foreground",
                        )}
                      >
                        <span className="font-display font-semibold tabular-nums">
                          {format(parseISO(a.data_inicio), "HH:mm")}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PONTO_CLASSE[ponto])}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {TIPO_LABEL[a.tipo] ?? a.tipo} · <b className="font-semibold">{nome}</b>
                            {mostrarCorretor && (
                              <span className="text-muted-foreground">
                                {" "}
                                · {corretorNome(a.corretor_id)}
                              </span>
                            )}
                          </span>
                        </span>
                        <EstadoChip estado={estadoDoCompromisso(a, agora)} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
