// Card da agenda do dia no hub /inicio: a agenda acionável na primeira tela
// após o login. O escopo segue o papel (regra em escopoDaAgenda): corretor vê
// "Seu dia"; gestor, a agenda da equipe; admin/superintendente, a operação —
// nesses dois casos cada linha traz o nome do corretor. Três recortes — visitas passadas sem validação, hoje, prévia de
// amanhã — e, em cada linha, o que o corretor precisa fazer sem trocar de
// aba: ligar / WhatsApp / rota, confirmar, validar (realizada ou não veio) e
// remarcar. Regras em agenda-do-dia.ts; escrita em use-agenda-do-dia.ts.

import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowsClockwise,
  CalendarCheck,
  CalendarDots,
  CalendarPlus,
  CheckCircle,
  DotsThreeVertical,
  ListChecks,
  MapPinArea,
  Path as RouteIcon,
  PencilSimple,
  Phone,
  UserCircle,
  WarningCircle,
  WhatsappLogo,
  XCircle,
  type Icon as IconComponent,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { INTENT_BADGE } from "@/lib/status-tones";
import { buildWhatsAppUrl } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { AgendamentoForm } from "./agendamento-form";
import { RemarcarDialog } from "./remarcar-dialog";
import { ValidarVisitaSheet } from "./validar-visita-sheet";
import { STATUS_LABEL, STATUS_TONE, TIPO_DOT } from "./types";
import {
  acoesDisponiveis,
  aguardaValidacao,
  estaAberto,
  fraseResumo,
  LIMITE_LISTA_SECUNDARIA,
  mensagemContato,
  resumoDoDia,
  tipoLabel,
  tituloDoEscopo,
  vazioDoEscopo,
  type ItemAgendaDia,
} from "./agenda-do-dia";
import { useAcoesAgenda, useAgendaDoDia, useCriarAgendamento } from "./use-agenda-do-dia";

type Desfecho = "realizada" | "nao_compareceu";

export function AgendaDoDiaCard() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const { query, agora, classificada, escopo, nomes, escopoPronto, escopoErro, refetchEscopo } =
    useAgendaDoDia();
  const tipoEscopo = escopo?.tipo ?? "minha";
  const mostrarCorretor = tipoEscopo !== "minha";
  const acoes = useAcoesAgenda();
  const criar = useCriarAgendamento();

  const [validando, setValidando] = useState<{ item: ItemAgendaDia; desfecho: Desfecho } | null>(
    null,
  );
  const [remarcando, setRemarcando] = useState<ItemAgendaDia | null>(null);
  const [openNew, setOpenNew] = useState(false);

  // Listas do formulário "+ Agendar": só quando o diálogo abre, e com as
  // MESMAS queryKeys da rota /agendamentos (cache compartilhado).
  const corretoresQ = useQuery({
    queryKey: ["profiles-min"],
    enabled: openNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const leadsQ = useQuery({
    queryKey: ["leads-min"],
    enabled: openNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, corretor_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resumo = resumoDoDia(classificada, agora);
  const ocupadoId =
    (acoes.confirmar.isPending && acoes.confirmar.variables?.id) ||
    (acoes.validar.isPending && acoes.validar.variables?.item.id) ||
    (acoes.remarcar.isPending && acoes.remarcar.variables?.item.id) ||
    null;

  const linhaProps = {
    agora,
    ocupadoId,
    nomeCorretor: mostrarCorretor
      ? (item: ItemAgendaDia) => nomes.get(item.corretor_id)
      : undefined,
    onConfirmar: (item: ItemAgendaDia) => acoes.confirmar.mutate(item),
    onValidar: (item: ItemAgendaDia, desfecho: Desfecho) => setValidando({ item, desfecho }),
    onRemarcar: (item: ItemAgendaDia) => setRemarcando(item),
  };

  if (!user) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" /> {tituloDoEscopo(tipoEscopo)} ·{" "}
            <span className="capitalize">{format(agora, "EEEE", { locale: ptBR })}</span>
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold leading-tight">
            {!escopoPronto || query.isLoading ? "Carregando a agenda…" : fraseResumo(resumo)}
          </h2>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button size="sm" className="min-h-9 shrink-0">
              <CalendarPlus className="h-4 w-4" /> Agendar
            </Button>
          </DialogTrigger>
          {openNew && (
            <AgendamentoForm
              title="Novo agendamento"
              corretores={corretoresQ.data ?? []}
              leads={leadsQ.data ?? []}
              isAdminOrGestor={isAdmin || isGestor}
              currentUserId={user.id}
              onSubmit={(payload) => criar.mutate(payload, { onSuccess: () => setOpenNew(false) })}
              pending={criar.isPending}
            />
          )}
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <AsyncBoundary
          isLoading={!escopoPronto && !escopoErro ? true : query.isLoading}
          isError={!!escopoErro || query.isError}
          error={escopoErro ?? query.error}
          errorTitle={
            escopoErro
              ? "Não foi possível carregar a sua equipe para montar a agenda."
              : "Não foi possível carregar a agenda."
          }
          onRetry={() => void (escopoErro ? refetchEscopo() : query.refetch())}
          loadingFallback={
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          }
        >
          {classificada.pendentes.length > 0 && (
            <Secao
              icon={WarningCircle}
              titulo="Visitas que passaram sem validação"
              contagem={classificada.pendentes.length}
              tone="warning"
              descricao="Enquanto não forem validadas, não entram no relatório de visitas."
            >
              {classificada.pendentes.slice(0, LIMITE_LISTA_SECUNDARIA).map((item) => (
                <Linha key={item.id} item={item} mostrarDia {...linhaProps} />
              ))}
              <MaisNaAgenda total={classificada.pendentes.length} />
            </Secao>
          )}

          <Secao icon={CalendarDots} titulo="Hoje" contagem={classificada.hoje.length}>
            {classificada.hoje.length === 0 ? (
              <li className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-subtle p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>{vazioDoEscopo(tipoEscopo)}</span>
                <Button size="sm" variant="outline" onClick={() => setOpenNew(true)}>
                  <CalendarPlus className="h-4 w-4" /> Agendar
                </Button>
              </li>
            ) : (
              classificada.hoje.map((item) => <Linha key={item.id} item={item} {...linhaProps} />)
            )}
          </Secao>

          {classificada.amanha.length > 0 && (
            <Secao
              icon={CalendarDots}
              titulo="Amanhã"
              contagem={classificada.amanha.length}
              descricao="Confirme hoje o que é amanhã — é o D-1 da régua."
            >
              {classificada.amanha.slice(0, LIMITE_LISTA_SECUNDARIA).map((item) => (
                <Linha key={item.id} item={item} {...linhaProps} />
              ))}
              <MaisNaAgenda total={classificada.amanha.length} />
            </Secao>
          )}
        </AsyncBoundary>

        <nav
          aria-label="Atalhos da agenda"
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium"
        >
          <Link to="/agendamentos" className="text-primary hover:underline">
            Agenda completa
          </Link>
          <Link
            to="/agendamentos"
            search={{ tab: "tarefas" }}
            className="text-primary hover:underline"
          >
            Tarefas
          </Link>
          <Link to="/modo-visita" className="text-primary hover:underline">
            Modo Visita
          </Link>
        </nav>
      </CardContent>

      {validando && (
        <ValidarVisitaSheet
          key={validando.item.id}
          item={validando.item}
          desfechoInicial={validando.desfecho}
          onOpenChange={(o) => !o && setValidando(null)}
          onSubmit={(registro) =>
            acoes.validar.mutate(
              { item: validando.item, registro },
              { onSuccess: () => setValidando(null) },
            )
          }
          pending={acoes.validar.isPending}
        />
      )}
      {remarcando && (
        <RemarcarDialog
          key={remarcando.id}
          item={remarcando}
          onOpenChange={(o) => !o && setRemarcando(null)}
          onSubmit={(novoInicio) =>
            acoes.remarcar.mutate(
              { item: remarcando, novoInicio },
              { onSuccess: () => setRemarcando(null) },
            )
          }
          pending={acoes.remarcar.isPending}
        />
      )}
    </Card>
  );
}

/** "+N mais" das listas secundárias — o resto vive na agenda completa. */
function MaisNaAgenda({ total }: { total: number }) {
  const resto = total - LIMITE_LISTA_SECUNDARIA;
  if (resto <= 0) return null;
  return (
    <li className="px-1 text-xs text-muted-foreground">
      <Link to="/agendamentos" className="font-medium text-primary hover:underline">
        +{resto} {resto === 1 ? "compromisso" : "compromissos"} na agenda completa
      </Link>
    </li>
  );
}

function Secao({
  icon: Icon,
  titulo,
  contagem,
  descricao,
  tone,
  children,
}: {
  icon: IconComponent;
  titulo: string;
  contagem: number;
  descricao?: string;
  tone?: "warning";
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
            tone === "warning" && "text-warning",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {titulo}
          {contagem > 0 && <span className="tabular-nums">· {contagem}</span>}
        </h3>
        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function EstadoBadge({ item, agora }: { item: ItemAgendaDia; agora: Date }) {
  const base = "text-[10px]";
  if (item.status === "agendado") {
    if (aguardaValidacao(item, agora)) {
      return (
        <Badge variant="secondary" className={cn(base, INTENT_BADGE.warning)}>
          Validar
        </Badge>
      );
    }
    if (acoesDisponiveis(item, agora).includes("confirmar")) {
      return (
        <Badge variant="secondary" className={cn(base, INTENT_BADGE.warning)}>
          A confirmar
        </Badge>
      );
    }
    return null;
  }
  return (
    <Badge variant="secondary" className={cn(base, STATUS_TONE[item.status])}>
      {STATUS_LABEL[item.status]}
    </Badge>
  );
}

function AtalhoIcone({
  href,
  label,
  externo,
  children,
}: {
  href: string;
  label: string;
  externo?: boolean;
  children: ReactNode;
}) {
  return (
    <Button asChild variant="outline" size="icon" className="h-9 w-9" aria-label={label}>
      <a href={href} title={label} {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}>
        {children}
      </a>
    </Button>
  );
}

function Linha({
  item,
  agora,
  ocupadoId,
  mostrarDia,
  nomeCorretor,
  onConfirmar,
  onValidar,
  onRemarcar,
}: {
  item: ItemAgendaDia;
  agora: Date;
  ocupadoId: string | null;
  mostrarDia?: boolean;
  /** Presente na agenda da equipe/operação: quem atende este compromisso. */
  nomeCorretor?: (item: ItemAgendaDia) => string | undefined;
  onConfirmar: (item: ItemAgendaDia) => void;
  onValidar: (item: ItemAgendaDia, desfecho: Desfecho) => void;
  onRemarcar: (item: ItemAgendaDia) => void;
}) {
  const acoes = acoesDisponiveis(item, agora);
  const aberto = estaAberto(item);
  const concluido = item.status === "realizado" || item.status === "nao_compareceu";
  const passou = aguardaValidacao(item, agora);
  const ocupado = ocupadoId === item.id;
  const inicio = new Date(item.data_inicio);
  const nome = item.lead?.nome ?? item.titulo;
  const tel = item.lead?.telefone ?? null;
  const whatsapp = tel ? buildWhatsAppUrl(tel, mensagemContato(item, agora)) : null;
  const rota = item.local
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.local)}`
    : null;
  const corretor = nomeCorretor?.(item);
  const detalhes = [
    corretor ? `Corretor: ${corretor}` : null,
    tipoLabel(item.tipo),
    item.lead ? item.titulo : null,
    item.local,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={cn(
        "rounded-lg border border-border-subtle bg-card p-3",
        concluido && "opacity-60",
        passou && "border-warning/50 bg-warning/5",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="w-11 shrink-0 pt-0.5 font-display text-sm font-semibold leading-tight tabular-nums">
            {format(inicio, "HH:mm")}
            {mostrarDia && (
              <div className="text-[10px] font-medium text-muted-foreground">
                {format(inicio, "dd/MM")}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", TIPO_DOT[item.tipo])}
                aria-hidden="true"
              />
              {item.lead ? (
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: item.lead.id }}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {nome}
                </Link>
              ) : (
                <span className="truncate text-sm font-medium">{nome}</span>
              )}
              <EstadoBadge item={item} agora={agora} />
            </div>
            {detalhes && <p className="truncate text-xs text-muted-foreground">{detalhes}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {tel && (
            <AtalhoIcone href={`tel:${tel}`} label="Ligar">
              <Phone className="h-4 w-4" />
            </AtalhoIcone>
          )}
          {whatsapp && (
            <AtalhoIcone href={whatsapp} label="WhatsApp" externo>
              <WhatsappLogo className="h-4 w-4" />
            </AtalhoIcone>
          )}
          {rota && (
            <AtalhoIcone href={rota} label="Rota" externo>
              <RouteIcon className="h-4 w-4" />
            </AtalhoIcone>
          )}
          {acoes.includes("confirmar") && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-9"
              disabled={ocupado}
              onClick={() => onConfirmar(item)}
            >
              <CheckCircle className="h-4 w-4" /> {ocupado ? "Confirmando…" : "Confirmar"}
            </Button>
          )}
          {acoes.includes("validar") && (
            <>
              <Button
                size="sm"
                className="min-h-9"
                disabled={ocupado}
                onClick={() => onValidar(item, "realizada")}
              >
                <CheckCircle className="h-4 w-4" /> Realizada
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-9"
                disabled={ocupado}
                onClick={() => onValidar(item, "nao_compareceu")}
              >
                <XCircle className="h-4 w-4" /> Não veio
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={`Mais ações · ${nome}`}
              >
                <DotsThreeVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {aberto && acoes.includes("remarcar") && (
                <DropdownMenuItem onSelect={() => onRemarcar(item)}>
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
              <DropdownMenuItem asChild>
                <Link to="/agendamentos">
                  <PencilSimple className="h-4 w-4" /> Editar na agenda
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
