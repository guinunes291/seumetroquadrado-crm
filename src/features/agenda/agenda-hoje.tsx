// O topo e a lateral da Agenda no padrão Lançamento (2026-10): o cartão "Hoje"
// (os compromissos do dia, o estado de cada um e UMA ação visível por linha) e
// os painéis "A validar" e "Amanhã". Só desenho: os dados vêm de
// useAgendaDoDia (a mesma query do hub /inicio e da lateral da Fila) e as
// escritas de useAcoesAgenda (confirmar, validar pela RPC salvar_modo_visita,
// remarcar) — quem monta é features/agenda/agenda-page.tsx.

import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowsClockwise,
  CalendarCheck,
  CheckCircle,
  DotsThree,
  ListChecks,
  MapPinArea,
  Path as RouteIcon,
  PencilSimple,
  Phone,
  UserCircle,
  WhatsappLogo,
  XCircle,
} from "@phosphor-icons/react";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Painel } from "@/components/ui/painel";
import { Skeleton } from "@/components/ui/skeleton";
import { INTENT_BADGE } from "@/lib/status-tones";
import { buildWhatsAppUrl } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { PONTO_CLASSE } from "./types";
import {
  acaoPrincipal,
  acoesDisponiveis,
  aguardaValidacao,
  estadoDoCompromisso,
  estaAberto,
  fraseResumo,
  mensagemContato,
  nomeCurto,
  passouHa,
  pontoDoCompromisso,
  resumoDoDia,
  tipoLabel,
  vazioDoEscopo,
  type AgendaClassificada,
  type ItemAgendaDia,
  type TipoEscopoAgenda,
} from "./agenda-do-dia";

export type Desfecho = "realizada" | "nao_compareceu";

/** As ações de uma linha da agenda do dia — as mesmas do hub /inicio. */
export type AcoesDaLinha = {
  onConfirmar: (item: ItemAgendaDia) => void;
  onValidar: (item: ItemAgendaDia, desfecho: Desfecho) => void;
  onRemarcar: (item: ItemAgendaDia) => void;
  /** Ligar pelo 3C Plus (useLigarLead), com recuo para o tel: do aparelho. */
  onLigar: (item: ItemAgendaDia) => void;
  onEditar: (item: ItemAgendaDia) => void;
};

/** O selo "confirmada / sem confirmação / validar" (cinza para encerrados). */
export function EstadoChip({ estado }: { estado: ReturnType<typeof estadoDoCompromisso> }) {
  if (!estado) return null;
  return (
    <Badge
      variant="secondary"
      className={cn("h-5 shrink-0 px-1.5 text-[11px] font-semibold", INTENT_BADGE[estado.intent])}
    >
      {estado.rotulo}
    </Badge>
  );
}

function hora(iso: string) {
  return format(new Date(iso), "HH:mm");
}

function diaCurto(iso: string) {
  return format(new Date(iso), "EEEEEE dd/MM", { locale: ptBR });
}

const SUFIXO_ESCOPO: Record<TipoEscopoAgenda, string> = {
  minha: "",
  equipe: " · equipe",
  operacao: " · operação",
};

// ---------------------------------------------------------------------------
// Cartão "Hoje"
// ---------------------------------------------------------------------------

export function HojeCard({
  agora,
  classificada,
  tipoEscopo,
  carregando,
  erro,
  tituloErro,
  onRetry,
  nomeCorretor,
  ocupadoId,
  ligando,
  acoes,
}: {
  agora: Date;
  classificada: AgendaClassificada;
  tipoEscopo: TipoEscopoAgenda;
  carregando: boolean;
  erro: unknown;
  tituloErro: string;
  onRetry: () => void;
  /** Na agenda da equipe/operação: quem atende cada compromisso. */
  nomeCorretor?: (item: ItemAgendaDia) => string | undefined;
  ocupadoId: string | null;
  ligando: boolean;
  acoes: AcoesDaLinha;
}) {
  const resumo = resumoDoDia(classificada, agora);
  const { pendentes, hoje } = classificada;

  return (
    <section
      aria-label="Hoje"
      className="rounded-2xl border border-border-subtle bg-card p-4 text-card-foreground shadow-elev-1 md:p-5"
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Hoje · {format(agora, "EEEE, d 'de' MMMM", { locale: ptBR })}
            {SUFIXO_ESCOPO[tipoEscopo]}
          </p>
          <h2 className="mt-1 font-display text-base font-bold leading-snug tracking-tight md:text-lg">
            {carregando ? "Carregando a agenda…" : fraseResumo(resumo)}
          </h2>
        </div>
        <Link
          to="/modo-visita"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <MapPinArea className="h-4 w-4" aria-hidden="true" /> Abrir no Modo Visita
        </Link>
      </header>

      <AsyncBoundary
        isLoading={carregando}
        isError={!!erro}
        error={erro}
        errorTitle={tituloErro}
        onRetry={onRetry}
        loadingFallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        }
      >
        {pendentes.length > 0 && (
          // Sem a lateral (celular e telas médias), as visitas de dias
          // anteriores sem validação sobem para dentro do cartão.
          <div
            data-testid="hoje-pendentes"
            className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/5 py-2 pl-3 pr-2 xl:hidden"
          >
            <p className="min-w-0 text-sm">
              <b className="font-semibold text-warning">
                {pendentes.length} {pendentes.length === 1 ? "passou" : "passaram"} sem validação
              </b>
              <span className="block truncate text-xs text-muted-foreground">
                {pendentes
                  .slice(0, 3)
                  .map(
                    (i) =>
                      `${nomeCurto(i.lead?.nome ?? i.titulo)} · ${format(new Date(i.data_inicio), "EEEEEE HH:mm", { locale: ptBR })}`,
                  )
                  .join(" · ")}
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-10 shrink-0 md:h-9"
              disabled={ocupadoId === pendentes[0].id}
              aria-label={`Validar a visita de ${pendentes[0].lead?.nome ?? pendentes[0].titulo}`}
              onClick={() => acoes.onValidar(pendentes[0], "realizada")}
            >
              <CheckCircle className="h-4 w-4" /> Validar
            </Button>
          </div>
        )}

        {hoje.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-muted-foreground">
            {vazioDoEscopo(tipoEscopo)}
          </p>
        ) : (
          <ul className="space-y-2">
            {hoje.map((item) => (
              <LinhaHoje
                key={item.id}
                item={item}
                agora={agora}
                corretor={nomeCorretor?.(item)}
                ocupado={ocupadoId === item.id}
                ligando={ligando}
                acoes={acoes}
              />
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </section>
  );
}

function IconeAcao({
  label,
  href,
  externo,
  onClick,
  disabled,
  children,
}: {
  label: string;
  href?: string;
  externo?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const classe = "h-10 w-10 shrink-0 md:h-9 md:w-9";
  if (href) {
    return (
      <Button asChild variant="outline" size="icon" className={classe}>
        <a
          href={href}
          aria-label={label}
          title={label}
          {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          {children}
        </a>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={classe}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const ROTULO_ACAO = {
  validar: { rotulo: "Validar", icone: CheckCircle },
  confirmar: { rotulo: "Confirmar", icone: CheckCircle },
  ligar: { rotulo: "Ligar", icone: Phone },
  remarcar: { rotulo: "Remarcar", icone: ArrowsClockwise },
} as const;

export function LinhaHoje({
  item,
  agora,
  corretor,
  ocupado,
  ligando,
  mostrarDia,
  acoes,
}: {
  item: ItemAgendaDia;
  agora: Date;
  corretor?: string;
  ocupado: boolean;
  ligando: boolean;
  mostrarDia?: boolean;
  acoes: AcoesDaLinha;
}) {
  const disponiveis = acoesDisponiveis(item, agora);
  const principal = acaoPrincipal(item, agora);
  const aberto = estaAberto(item);
  const passou = aguardaValidacao(item, agora);
  const concluido = item.status === "realizado" || item.status === "nao_compareceu";
  const nome = item.lead?.nome ?? item.titulo;
  const tel = item.lead?.telefone ?? null;
  const whatsapp = tel ? buildWhatsAppUrl(tel, mensagemContato(item, agora)) : null;
  const rota = item.local
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.local)}`
    : null;
  const detalhes = [
    corretor ? `Corretor: ${corretor}` : null,
    tipoLabel(item.tipo),
    item.lead && !item.titulo.includes(item.lead.nome) ? item.titulo : null,
    item.lead?.projeto_nome ?? null,
    item.local,
    passou ? `passou ${passouHa(item.data_fim, agora)} sem desfecho` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const executar = () => {
    if (principal === "validar") acoes.onValidar(item, "realizada");
    else if (principal === "confirmar") acoes.onConfirmar(item);
    else if (principal === "ligar") acoes.onLigar(item);
    else if (principal === "remarcar") acoes.onRemarcar(item);
  };
  const Acao = principal ? ROTULO_ACAO[principal] : null;
  const rotuloAcao = principal === "confirmar" && ocupado ? "Confirmando…" : (Acao?.rotulo ?? "");

  return (
    <li
      data-testid="agenda-hoje-linha"
      className={cn(
        "rounded-xl border border-border-subtle bg-card p-3",
        concluido && "opacity-60",
        passou && "border-warning/40 bg-warning/5",
      )}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="w-11 shrink-0 pt-0.5 font-display text-sm font-semibold leading-tight tabular-nums">
            {hora(item.data_inicio)}
            {mostrarDia && (
              <span className="block font-sans text-[10.5px] font-medium text-muted-foreground">
                {diaCurto(item.data_inicio)}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  PONTO_CLASSE[pontoDoCompromisso(item, agora)],
                )}
                aria-hidden="true"
              />
              {item.lead ? (
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: item.lead.id }}
                  className="truncate text-sm font-semibold hover:underline"
                >
                  {nome}
                </Link>
              ) : (
                <span className="truncate text-sm font-semibold">{nome}</span>
              )}
              <EstadoChip estado={estadoDoCompromisso(item, agora)} />
            </div>
            {detalhes && <p className="truncate text-xs text-muted-foreground">{detalhes}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pl-14 md:pl-0">
          {tel && item.lead && principal !== "ligar" && (
            <IconeAcao
              label={`Ligar para ${nome}`}
              disabled={ligando}
              onClick={() => acoes.onLigar(item)}
            >
              <Phone className="h-4 w-4" />
            </IconeAcao>
          )}
          {whatsapp && (
            <IconeAcao label={`WhatsApp de ${nome}`} href={whatsapp} externo>
              <WhatsappLogo className="h-4 w-4" />
            </IconeAcao>
          )}
          {rota && (
            <IconeAcao label={`Rota até ${item.local}`} href={rota} externo>
              <RouteIcon className="h-4 w-4" />
            </IconeAcao>
          )}
          {Acao && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 flex-1 md:h-9 md:min-w-[104px] md:flex-none"
              disabled={ocupado || (principal === "ligar" && ligando)}
              onClick={executar}
            >
              <Acao.icone className="h-4 w-4" /> {rotuloAcao}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 md:h-9 md:w-9"
                aria-label={`Mais ações · ${nome}`}
              >
                <DotsThree className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {disponiveis.includes("validar") && (
                <DropdownMenuItem onSelect={() => acoes.onValidar(item, "nao_compareceu")}>
                  <XCircle className="h-4 w-4" /> Não veio
                </DropdownMenuItem>
              )}
              {disponiveis.includes("remarcar") && principal !== "remarcar" && (
                <DropdownMenuItem onSelect={() => acoes.onRemarcar(item)}>
                  <ArrowsClockwise className="h-4 w-4" /> Remarcar
                </DropdownMenuItem>
              )}
              {item.lead && (
                <DropdownMenuItem asChild>
                  <Link to="/leads/$leadId" params={{ leadId: item.lead.id }}>
                    <UserCircle className="h-4 w-4" /> Abrir ficha do lead
                  </Link>
                </DropdownMenuItem>
              )}
              {item.lead && (
                <DropdownMenuItem asChild>
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: item.lead.id }}
                    search={{ tab: "documentacao" }}
                  >
                    <ListChecks className="h-4 w-4" /> Documentação
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {item.tipo === "visita" && aberto && (
                <DropdownMenuItem asChild>
                  <Link to="/modo-visita">
                    <MapPinArea className="h-4 w-4" /> Abrir no Modo Visita
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => acoes.onEditar(item)}>
                <PencilSimple className="h-4 w-4" /> Editar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Lateral do desktop: "A validar" e "Amanhã" (no máximo 3 painéis)
// ---------------------------------------------------------------------------

const LIMITE_LATERAL = 5;

function Carregando() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
    </div>
  );
}

function Mais({ total }: { total: number }) {
  const resto = total - LIMITE_LATERAL;
  if (resto <= 0) return null;
  return <p className="mt-1 text-xs text-muted-foreground">+ {resto} na grade</p>;
}

/** Visitas de dias anteriores que passaram sem desfecho — validar aqui. */
export function PainelAValidar({
  pendentes,
  carregando,
  ocupadoId,
  nomeCorretor,
  onValidar,
}: {
  pendentes: ItemAgendaDia[];
  carregando: boolean;
  ocupadoId: string | null;
  nomeCorretor?: (item: ItemAgendaDia) => string | undefined;
  onValidar: (item: ItemAgendaDia, desfecho: Desfecho) => void;
}) {
  const n = pendentes.length;
  return (
    <Painel titulo="A validar" sub={!carregando && n > 0 ? `${n} de dias anteriores` : undefined}>
      {carregando ? (
        <Carregando />
      ) : n === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma visita esperando validação.</p>
      ) : (
        <>
          <ul className="divide-y divide-border-subtle">
            {pendentes.slice(0, LIMITE_LATERAL).map((item) => {
              const nome = item.lead?.nome ?? item.titulo;
              const corretor = nomeCorretor?.(item);
              return (
                <li
                  key={item.id}
                  data-testid="a-validar-item"
                  className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-[13px]"
                >
                  <span className="font-display text-[12.5px] font-semibold leading-tight tabular-nums">
                    {hora(item.data_inicio)}
                    <span className="block font-sans text-[10.5px] font-medium text-muted-foreground">
                      {diaCurto(item.data_inicio)}
                    </span>
                  </span>
                  <span className="min-w-0">
                    {item.lead ? (
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: item.lead.id }}
                        className="block truncate font-semibold hover:underline"
                      >
                        {nome}
                      </Link>
                    ) : (
                      <span className="block truncate font-semibold">{nome}</span>
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {[tipoLabel(item.tipo), item.lead?.projeto_nome ?? item.local, corretor]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ocupadoId === item.id}
                    aria-label={`Validar a visita de ${nome}`}
                    onClick={() => onValidar(item, "realizada")}
                  >
                    Validar
                  </Button>
                </li>
              );
            })}
          </ul>
          <Mais total={n} />
          <p className="mt-2 text-xs text-muted-foreground">
            Só entram no relatório de visitas depois de validadas.
          </p>
        </>
      )}
    </Painel>
  );
}

/** Prévia de amanhã: confirmar no D-1 sem esperar a tarefa lembrar. */
export function PainelAmanha({
  amanha,
  carregando,
  agora,
  nomeCorretor,
}: {
  amanha: ItemAgendaDia[];
  carregando: boolean;
  agora: Date;
  nomeCorretor?: (item: ItemAgendaDia) => string | undefined;
}) {
  const n = amanha.length;
  return (
    <Painel
      titulo="Amanhã"
      sub={carregando ? undefined : `${n} ${n === 1 ? "compromisso" : "compromissos"}`}
    >
      {carregando ? (
        <Carregando />
      ) : n === 0 ? (
        <p className="text-xs text-muted-foreground">Nada marcado para amanhã.</p>
      ) : (
        <>
          <ul className="divide-y divide-border-subtle">
            {amanha.slice(0, LIMITE_LATERAL).map((item) => {
              const corretor = nomeCorretor?.(item);
              return (
                <li
                  key={item.id}
                  data-testid="amanha-item"
                  className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-[13px]"
                >
                  <span className="font-display text-[12.5px] font-semibold tabular-nums">
                    {hora(item.data_inicio)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">
                      {tipoLabel(item.tipo)} ·{" "}
                      {item.lead ? (
                        <Link
                          to="/leads/$leadId"
                          params={{ leadId: item.lead.id }}
                          className="font-semibold hover:underline"
                        >
                          {item.lead.nome}
                        </Link>
                      ) : (
                        <span className="font-semibold">{item.titulo}</span>
                      )}
                    </span>
                    {(item.lead?.projeto_nome || item.local || corretor) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[item.lead?.projeto_nome ?? item.local, corretor]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <EstadoChip estado={estadoDoCompromisso(item, agora)} />
                </li>
              );
            })}
          </ul>
          <Mais total={n} />
          <p className="mt-2 text-xs text-muted-foreground">
            Confirme hoje o que é amanhã — é o D-1 da régua.
          </p>
        </>
      )}
    </Painel>
  );
}
