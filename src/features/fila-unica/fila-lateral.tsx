// A coluna lateral da fila no desktop — os três painéis do mockup: a agenda
// de hoje (as visitas com o estado de confirmação), como a fila se mantém
// finita (os números da semana e o fluxo pré-venda → fila → desfecho) e o
// que a Sami faz aqui. No celular não aparece: a Agenda tem o próprio slot
// na barra do polegar.

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { INTENT_BADGE } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { useAgendaDoDia } from "@/features/agenda/use-agenda-do-dia";
import {
  acoesDisponiveis,
  aguardaValidacao,
  type ItemAgendaDia,
} from "@/features/agenda/agenda-do-dia";
import { STATUS_LABEL, STATUS_TONE, TIPO_LABEL } from "@/features/agenda/types";
import { useFilaSemana } from "@/features/fila-unica/use-fila-semana";
import { LIMITE_FILA } from "@/features/fila-unica/derive";

const LIMITE_AGENDA = 4;

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "confirmada" / "sem confirmação" / "validar" — a mesma régua da Agenda. */
function EstadoDaVisita({ item, agora }: { item: ItemAgendaDia; agora: Date }) {
  if (item.status === "agendado") {
    if (aguardaValidacao(item, agora)) {
      return <Badge className={INTENT_BADGE.warning}>validar</Badge>;
    }
    if (acoesDisponiveis(item, agora).includes("confirmar")) {
      return <Badge className={INTENT_BADGE.warning}>sem confirmação</Badge>;
    }
    return null;
  }
  if (item.status === "confirmado")
    return <Badge className={INTENT_BADGE.success}>confirmada</Badge>;
  return <Badge className={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>;
}

function Painel({
  titulo,
  sub,
  children,
  className,
}: {
  titulo: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        "rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground shadow-elev-1",
        className,
      )}
    >
      <h3 className="mb-2 flex items-baseline justify-between gap-2 text-[13.5px] font-semibold">
        {titulo}
        {sub && <span className="text-xs font-medium text-muted-foreground">{sub}</span>}
      </h3>
      {children}
    </section>
  );
}

export function AgendaDeHoje() {
  const { query, classificada, agora, escopoPronto } = useAgendaDoDia();
  const hoje = classificada.hoje;
  const visitas = hoje.filter((i) => i.tipo === "visita").length;
  const sub =
    query.isPending || !escopoPronto ? undefined : `${visitas} visita${visitas === 1 ? "" : "s"}`;
  return (
    <Painel titulo="Agenda de hoje" sub={sub}>
      {query.isPending || !escopoPronto ? (
        <div className="space-y-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : query.isError ? (
        <p className="text-xs text-muted-foreground">Não foi possível ler a agenda.</p>
      ) : hoje.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem compromissos hoje.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {hoje.slice(0, LIMITE_AGENDA).map((item) => (
            <li
              key={item.id}
              data-testid="agenda-hoje-item"
              className="grid grid-cols-[44px_1fr_auto] items-center gap-2 py-1.5 text-[13px]"
            >
              <span className="font-display font-semibold tabular-nums">
                {hora(item.data_inicio)}
              </span>
              <span className="min-w-0">
                <span className="block truncate">
                  {TIPO_LABEL[item.tipo] ?? item.tipo} ·{" "}
                  {item.lead ? (
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: item.lead.id }}
                      className="font-medium hover:underline"
                    >
                      {item.lead.nome}
                    </Link>
                  ) : (
                    item.titulo
                  )}
                </span>
                {(item.lead?.projeto_nome || item.local) && (
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {item.lead?.projeto_nome ?? item.local}
                  </span>
                )}
              </span>
              <EstadoDaVisita item={item} agora={agora} />
            </li>
          ))}
        </ul>
      )}
      {hoje.length > LIMITE_AGENDA && (
        <p className="mt-1 text-xs text-muted-foreground">
          + {hoje.length - LIMITE_AGENDA} na{" "}
          <Link to="/agendamentos" className="text-primary hover:underline">
            Agenda
          </Link>
        </p>
      )}
    </Painel>
  );
}

function Caixa({ children, dourada = false }: { children: React.ReactNode; dourada?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
        dourada
          ? "border-modulo-central/50 text-modulo-central"
          : "border-border-subtle bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function ComoAFilaSeMantem() {
  const q = useFilaSemana();
  return (
    <Painel titulo="Como a fila se mantém finita" sub="esta semana">
      {q.isPending ? (
        <Skeleton className="h-10" />
      ) : q.isError ? (
        <p className="text-xs text-muted-foreground">Não foi possível ler a semana.</p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground" data-testid="fila-semana">
          <b className="font-display text-foreground">{q.data.desfechos}</b> desfecho(s)
          registrado(s) por aqui · <b className="font-display text-foreground">{q.data.perdidos}</b>{" "}
          perdido(s) com motivo ·{" "}
          <b className="font-display text-foreground">{q.data.reentraram}</b> reentraram porque o
          cliente respondeu no WhatsApp. A devolução automática à pré-venda depois de três
          tentativas sem resposta é a próxima fatia.
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Caixa>Pré-venda</Caixa>
        <span aria-hidden="true">→</span>
        <Caixa dourada>Fila (máx. {LIMITE_FILA})</Caixa>
        <span aria-hidden="true">→</span>
        <Caixa>Desfecho</Caixa>
      </div>
    </Painel>
  );
}

export function OQueASamiFaz() {
  return (
    <Painel titulo="O que a Sami faz aqui" sub="copiloto">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Você dita “liguei pra Lilia, achou a parcela alta, retorno sexta” e ela monta o pacote:
        interação, objeção e follow-up de sexta. Um toque confirma. Nunca envia mensagem ao cliente.
      </p>
    </Painel>
  );
}

export function FilaLateral({ className }: { className?: string }) {
  return (
    <aside className={cn("flex flex-col gap-3", className)} aria-label="Ao lado da fila">
      <AgendaDeHoje />
      <ComoAFilaSeMantem />
      <OQueASamiFaz />
    </aside>
  );
}
