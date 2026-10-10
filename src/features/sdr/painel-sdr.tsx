// Painel da pré-venda na identidade Lançamento (como no vídeo de lançamento),
// com o trabalho real do SDR (decisões de 10/10/2026): ele passa o dia no
// discador e entra no CRM para passar o cliente adiante. Então o painel mostra
// o que acontece DEPOIS da passagem, que é o que paga (a folha do sábado):
//   A confirmar → Confirmada → Realizada → Pasta → Venda
// e o que pede ação: as confirmações D-1/D-0 (com o resultado), quem não
// compareceu e quem está sem visita marcada (documentação; a gestão acompanha).
//
// A roleta aparece em número, nunca em nomes nem "o próximo da vez": quem
// recebe sai no agendamento (agenda livre no horário, zona do cliente,
// corretor de origem com prioridade). Uma leitura só: sdr_painel.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarPlus,
  Phone,
  ShuffleAngular,
  WarningCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { quandoDaVisita } from "@/features/visitas/visita-derive";
import { LEAD_STATUS_BADGE_TONE, leadStatusLabel, type LeadStatus } from "@/lib/leads";
import { iniciais } from "@/lib/prateleira";
import { cn } from "@/lib/utils";
import { ConfirmacaoAcoes } from "./confirmacao-acoes";
import { PassarClienteDialog } from "./passar-cliente-dialog";
import {
  usePainelSdr,
  type EntregaPainel,
  type PainelSdr,
  type RoletaPainel,
} from "./painel-client";
import {
  colunasDoPainel,
  etiquetasDaEntrega,
  rotuloSemana,
  textoRoleta,
  type ColunaPainel,
} from "./painel-derive";

function CartaoColuna({ c }: { c: ColunaPainel }) {
  const destaque = c.chave === "a_confirmar";
  return (
    <li
      data-testid="coluna-pre-venda"
      title={c.dica}
      className="flex w-[70%] shrink-0 snap-start flex-col rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground sm:w-auto"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-bold">{c.rotulo}</h3>
        <span className="font-display text-2xl font-bold tabular-nums text-muted-foreground">
          {c.total}
        </span>
      </div>
      {c.destaque ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle px-2.5 py-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
          >
            {iniciais(c.destaque.nome)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{c.destaque.nome}</p>
            <p className="truncate text-[11px] text-muted-foreground">{c.destaque.detalhe}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 min-h-[46px] text-xs text-muted-foreground">Ninguém aqui agora.</p>
      )}
      <div className="mt-auto pt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              destaque ? "bg-gradient-gold" : "bg-primary dark:bg-navy-300",
            )}
            style={{ width: `${Math.max(c.total > 0 ? 6 : 0, c.fracao * 100)}%` }}
          />
        </div>
      </div>
    </li>
  );
}

/** A roda do vídeo, com pontos anônimos: quantos estão aptos, não quem. */
function RodaAnonima({ n }: { n: number }) {
  const pontos = Math.min(n, 8);
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" aria-hidden="true">
      <circle
        cx="60"
        cy="60"
        r="44"
        fill="none"
        className="stroke-border"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      <circle cx="60" cy="60" r="9" className="fill-primary dark:fill-navy-300" />
      {Array.from({ length: pontos }, (_, i) => {
        const a = (2 * Math.PI * i) / pontos - Math.PI / 2;
        return (
          <circle
            key={i}
            data-testid="ponto-roleta"
            cx={60 + 44 * Math.cos(a)}
            cy={60 + 44 * Math.sin(a)}
            r="9"
            className="fill-primary/85 dark:fill-navy-300"
          />
        );
      })}
    </svg>
  );
}

function RoletaCard({ r }: { r: RoletaPainel }) {
  const t = textoRoleta(r);
  return (
    <section
      aria-label="Roleta do SDR"
      className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground"
    >
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-bold">Roleta</h2>
        <p className="text-xs text-muted-foreground">
          distribui a visita que você agenda a um corretor apto
        </p>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t.titulo}
        </p>
        <p className="font-display text-3xl font-bold tracking-tight" data-testid="roleta-numero">
          {t.numero}
        </p>
        <p
          className={cn(
            "mt-1 flex items-start gap-1 text-xs",
            t.alerta ? "text-warning" : "text-muted-foreground",
          )}
        >
          {t.alerta && <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" weight="fill" />}
          {t.detalhe}
        </p>
      </div>
      <RodaAnonima n={r.aptos} />
    </section>
  );
}

function EntregaCard({ e, onPassar }: { e: EntregaPainel | null; onPassar?: () => void }) {
  if (!e) {
    return (
      <section
        aria-label="Lead entregue"
        className="flex flex-col justify-between rounded-2xl bg-gradient-command p-5 text-white shadow-elev-2 dark:ring-1 dark:ring-white/10"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-400">
          Lead entregue
        </p>
        <p className="mt-3 font-display text-lg font-bold">Nenhum cliente passado ainda.</p>
        {onPassar && (
          <Button
            size="sm"
            className="mt-4 w-fit bg-gradient-gold text-navy-900 hover:opacity-90"
            onClick={onPassar}
          >
            Passar o primeiro cliente
          </Button>
        )}
      </section>
    );
  }
  const corretor = e.corretor_nome ?? "Corretor";
  const voltou = e.regra === "sdr_retorno_corretor_origem";
  return (
    <section
      aria-label="Lead entregue"
      className="flex flex-col rounded-2xl bg-gradient-command p-5 text-white shadow-elev-2 dark:ring-1 dark:ring-white/10"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-400">
        Lead entregue
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-gold font-display text-base font-bold text-navy-900"
        >
          {iniciais(corretor)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold">{corretor}</p>
          <p className="truncate text-sm text-white/75">
            recebeu{" "}
            <Link
              to="/leads/$leadId"
              params={{ leadId: e.lead_id }}
              className="font-semibold text-white underline-offset-2 hover:underline"
            >
              {e.nome}
            </Link>{" "}
            {voltou ? "de volta (falou com o cliente nos últimos dias)" : "pela roleta"}
          </p>
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="O que o corretor recebeu">
        {etiquetasDaEntrega(e).map((t) => (
          <li key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-4 text-xs text-white/70">
        O corretor recebe o lead pronto. Sem garimpo.
      </p>
    </section>
  );
}

function Telefone({ telefone }: { telefone: string | null }) {
  if (!telefone) return null;
  return (
    <a
      href={`tel:${telefone.replace(/[^\d+]/g, "")}`}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Phone className="h-3.5 w-3.5" /> {telefone}
    </a>
  );
}

function Confirmacoes({ p }: { p: PainelSdr }) {
  const visitas = [...p.a_confirmar, ...p.confirmada].sort((a, b) =>
    a.data_inicio.localeCompare(b.data_inicio),
  );
  return (
    <section
      aria-label="Confirmações"
      className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground md:p-5"
    >
      <h2 className="font-display text-lg font-bold">Confirmações</h2>
      <p className="text-xs text-muted-foreground">
        Ligue no dia anterior e no dia da visita. A resposta do cliente vai para o corretor.
      </p>
      {visitas.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma visita marcada pela frente.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle">
          {visitas.map((v) => (
            <li
              key={v.agendamento_id}
              data-testid="confirmacao"
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: v.lead_id }}
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {v.nome}
                  </Link>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide">
                    {quandoDaVisita(v.data_inicio)}
                  </span>
                  {v.status === "confirmado" && (
                    <Badge variant="secondary" className="bg-success/15 text-success">
                      confirmada
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>com {v.corretor_nome ?? "corretor"}</span>
                  <Telefone telefone={v.telefone} />
                </div>
              </div>
              <ConfirmacaoAcoes visita={v} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Pendencias({
  p,
  onAgendar,
}: {
  p: PainelSdr;
  /** Ausente para o admin: só o SDR passa cliente. */
  onAgendar?: (leadId: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-label="Reagendar"
        className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground md:p-5"
      >
        <h2 className="font-display text-lg font-bold">Reagendar</h2>
        <p className="text-xs text-muted-foreground">
          Não compareceram nos últimos 14 dias e voltaram para você. Ligue enquanto lembram da
          visita.
        </p>
        {p.reagendar.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Ninguém para reagendar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {p.reagendar.map((v) => (
              <li key={v.agendamento_id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: v.lead_id }}
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {v.nome}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>faltou {quandoDaVisita(v.data_inicio).toLowerCase()}</span>
                    <Telefone telefone={v.telefone} />
                  </div>
                </div>
                {onAgendar && (
                  <Button size="sm" variant="outline" onClick={() => onAgendar(v.lead_id)}>
                    <CalendarPlus className="mr-1 h-4 w-4" /> Agendar de novo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Sem visita marcada"
        className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground md:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Sem visita marcada</h2>
          {p.base_total > 0 && (
            <Link
              to="/sdr"
              search={{ tab: "base" }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Ver a base inteira ({p.base_total}) <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Documentação e conversas em andamento. A gestão acompanha com você até a visita.
        </p>
        {p.sem_visita.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nenhum cliente parado sem visita.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {p.sem_visita.map((l) => (
              <li key={l.lead_id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: l.lead_id }}
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {l.nome}
                    </Link>
                    <Badge
                      variant="secondary"
                      className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                    >
                      {l.status === "analise_credito" ? "Pasta" : leadStatusLabel(l.status)}
                    </Badge>
                  </div>
                  <Telefone telefone={l.telefone} />
                </div>
                {onAgendar && (
                  <Button size="sm" variant="outline" onClick={() => onAgendar(l.lead_id)}>
                    <CalendarPlus className="mr-1 h-4 w-4" /> Agendar visita
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function PainelSdr({
  sdrId,
  podePassar,
  onPassar,
}: {
  sdrId: string | null;
  /** Só o SDR passa cliente (o admin acompanha). */
  podePassar: boolean;
  onPassar: () => void;
}) {
  const q = usePainelSdr(sdrId);
  const [agendarLead, setAgendarLead] = useState<string | null>(null);

  if (q.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShuffleAngular className="h-3.5 w-3.5" />
        Semana da folha: {rotuloSemana(p.semana)}. Realizada, Pasta e Venda contam esta semana.
      </p>
      <ol className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
        {colunasDoPainel(p).map((c) => (
          <CartaoColuna key={c.chave} c={c} />
        ))}
      </ol>
      <div className="grid gap-4 lg:grid-cols-2">
        <RoletaCard r={p.roleta} />
        <EntregaCard e={p.ultima_entrega} onPassar={podePassar ? onPassar : undefined} />
      </div>
      <Confirmacoes p={p} />
      <Pendencias p={p} onAgendar={podePassar ? (id) => setAgendarLead(id) : undefined} />

      {agendarLead && podePassar && (
        <PassarClienteDialog
          open
          leadId={agendarLead}
          onOpenChange={(o) => !o && setAgendarLead(null)}
        />
      )}
    </div>
  );
}
