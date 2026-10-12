// Central de Mensagens (Fase 7b; rota viva sob a Gestão de Carteira, acesso
// pelo ⌘K desde a regra dos 2 menus de 2026-09-11) — inbox
// unificada de conversas WhatsApp sobre a tabela `mensagens` da 7a, em MODO
// SIMULADO até a decisão D1 ligar o provedor (7c): a entrada chega pelo
// webhook n8n; a saída registra a mensagem na conversa E abre o wa.me com o
// texto — o corretor dispara pelo próprio aparelho, mas o CRM passa a
// ENXERGAR a conversa (métrica O1).
//
// Lote 3 (auditoria das abas laterais): o estado "aguardando resposta" agora
// EXISTE no banco (fonte única conversa_aguardando_resposta + marcador
// conversas_tratadas). A lista continua com o derive puro por conversa (agora
// descontando as marcas), e "Marcar como tratada" apaga a luz sem responder —
// no badge da sidebar E na fila Responder do /atendimento, de uma vez.
//
// Padrão Lançamento (Fase 2, 12/10/2026): a lista tem a contagem como dona do
// título ("N aguardando resposta · M conversas", do mesmo agruparConversas que
// acende o ponto vermelho de cada linha); a thread é um cartão que ocupa a
// altura da tela, com o composer fixo embaixo; "Abrir lead" fica ghost e
// "Marcar tratada" foi para o "…" do cabeçalho da thread. No celular é
// mestre-detalhe: a lista primeiro e a conversa em tela cheia com voltar.
// Não mudou: o derive, as chaves de cache, o envio pelo wa.me e a marca.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowSquareOut,
  CaretLeft,
  Checks,
  DotsThree,
  Info,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { supabase } from "@/integrations/supabase/client";
import { formatRelativeTime } from "@/lib/interacoes";
import { cn } from "@/lib/utils";
import {
  agruparConversas,
  ordenarThread,
  previewConversa,
  type Conversa,
  type Mensagem,
} from "./derive";
import {
  conversaEstado,
  listarConversasTratadas,
  listarMensagensRecentes,
  marcarConversaTratada,
  registrarEnvioSimulado,
} from "./mensagens-client";
import { BolhasThread, ComposerConversa } from "./thread-conversa";

type LeadResumo = {
  id: string;
  nome: string;
  telefone: string;
  projeto_nome: string | null;
};

/** "4 aguardando resposta · 18 conversas": quantas conversas têm o ponto
 *  vermelho (entrada do cliente depois da última resposta, descontada a
 *  marca "tratada") e quantas há na lista. */
function contagemDaLista(conversas: Conversa[]): { aguardando: number; total: number } {
  return {
    aguardando: conversas.filter((c) => c.aguardandoResposta > 0).length,
    total: conversas.length,
  };
}

export function CentralMensagens() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const abrirWhatsApp = useWhatsAppLead();
  const isMobile = useIsMobile();
  const [leadAtivo, setLeadAtivo] = useState<string | null>(null);
  // Celular: a conversa abre em tela cheia por cima da lista (mestre-detalhe).
  const [threadAberta, setThreadAberta] = useState(false);
  const [texto, setTexto] = useState("");

  const mensagensQ = useQuery({
    queryKey: ["mensagens:central", user?.id],
    enabled: !!user,
    queryFn: () => listarMensagensRecentes(500),
  });
  useRealtimeInvalidate("mensagens", [["mensagens:central"], ["conversa-estado"], ["nav-badges"]]);
  useRealtimeInvalidate("conversas_tratadas", [
    ["mensagens:tratadas"],
    ["conversa-estado"],
    ["nav-badges"],
  ]);

  const leadIdsComMensagem = useMemo(
    () => [...new Set((mensagensQ.data?.rows ?? []).map((m) => m.lead_id))],
    [mensagensQ.data],
  );

  // Marcas "tratada" dos leads em tela — descontam o contador da lista.
  const tratadasQ = useQuery({
    queryKey: ["mensagens:tratadas", leadIdsComMensagem],
    enabled: leadIdsComMensagem.length > 0,
    queryFn: () => listarConversasTratadas(leadIdsComMensagem),
  });

  const conversas = useMemo(
    () => agruparConversas(mensagensQ.data?.rows ?? [], tratadasQ.data),
    [mensagensQ.data, tratadasQ.data],
  );
  const leadIds = useMemo(() => conversas.map((c) => c.leadId), [conversas]);
  const contagem = useMemo(() => contagemDaLista(conversas), [conversas]);

  const leadsQ = useQuery({
    queryKey: ["mensagens:leads", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async (): Promise<Map<string, LeadResumo>> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, projeto_nome")
        .in("id", leadIds);
      if (error) throw error;
      return new Map((data ?? []).map((l) => [l.id, l as LeadResumo]));
    },
  });
  const leads = leadsQ.data ?? new Map<string, LeadResumo>();

  const selecionado = leadAtivo ?? conversas[0]?.leadId ?? null;
  // No celular nada fica marcado na lista até o corretor abrir uma conversa.
  const destacado = isMobile ? (threadAberta ? selecionado : null) : selecionado;
  const thread = useMemo(
    () =>
      selecionado
        ? ordenarThread((mensagensQ.data?.rows ?? []).filter((m) => m.lead_id === selecionado))
        : [],
    [mensagensQ.data, selecionado],
  );
  const leadSelecionado = selecionado ? leads.get(selecionado) : undefined;

  // O "Marcar tratada" segue a FONTE ÚNICA (não a contagem derivada da
  // lista): num banco sem a migration do Lote 3 a RPC devolve null e o item
  // simplesmente não aparece — degrada sem quebrar; e uma saída registrada
  // por fora (wa.me da tabela, ligação) apaga o item junto com o badge.
  const estadoSelecionadoQ = useQuery({
    queryKey: ["conversa-estado", selecionado],
    enabled: !!selecionado,
    staleTime: 30_000,
    queryFn: () => (selecionado ? conversaEstado(selecionado) : null),
  });

  // A resposta e a marca mudam badge da sidebar e fila Responder — invalida
  // as chaves de todo mundo que lê a fonte única.
  const invalidarFonteUnica = () => {
    void qc.invalidateQueries({ queryKey: ["mensagens:central"] });
    void qc.invalidateQueries({ queryKey: ["mensagens:tratadas"] });
    void qc.invalidateQueries({ queryKey: ["conversa-estado"] });
    void qc.invalidateQueries({ queryKey: ["nav-badges"] });
    void qc.invalidateQueries({ queryKey: ["atendimento:inbox"] });
  };

  // Enviar (simulado): grava a saída na conversa e abre o wa.me com o texto
  // (que também registra a interação de saída na timeline — fluxo existente).
  const enviar = useMutation({
    mutationFn: async () => {
      const conteudo = texto.trim();
      if (!conteudo || !selecionado || !user) throw new Error("Escreva a mensagem antes.");
      await registrarEnvioSimulado({ leadId: selecionado, corretorId: user.id, conteudo });
      return conteudo;
    },
    onSuccess: (conteudo) => {
      setTexto("");
      invalidarFonteUnica();
      if (leadSelecionado) {
        abrirWhatsApp(
          {
            id: leadSelecionado.id,
            nome: leadSelecionado.nome,
            telefone: leadSelecionado.telefone,
            projeto_nome: leadSelecionado.projeto_nome,
          },
          { mensagem: conteudo, titulo: "WhatsApp — Central de Mensagens" },
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // "Li, não precisa de resposta": apaga a luz sem responder.
  const marcarTratada = useMutation({
    mutationFn: async () => {
      if (!selecionado) throw new Error("Selecione uma conversa.");
      return marcarConversaTratada(selecionado);
    },
    onSuccess: () => {
      toast.success("Conversa marcada como tratada.");
      invalidarFonteUnica();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirConversa = (leadId: string) => {
    setLeadAtivo(leadId);
    if (isMobile) setThreadAberta(true);
  };

  if (mensagensQ.data?.tabelaAusente) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            A Central depende da migration <code>mensagens</code> (Fase 7a), ainda não aplicada
            neste ambiente. Aplique o deploy do banco via Lovable e volte aqui — nenhuma outra
            configuração é necessária para o modo simulado.
          </span>
        </CardContent>
      </Card>
    );
  }

  const painelDaThread = (noCelular: boolean) => (
    <ThreadDaConversa
      noCelular={noCelular}
      leadId={selecionado}
      lead={leadSelecionado}
      thread={thread}
      aguardando={!!estadoSelecionadoQ.data?.aguardando}
      marcandoTratada={marcarTratada.isPending}
      onMarcarTratada={() => marcarTratada.mutate()}
      texto={texto}
      onTexto={setTexto}
      enviando={enviar.isPending}
      onEnviar={() => enviar.mutate()}
    />
  );

  return (
    <AsyncBoundary
      isLoading={mensagensQ.isLoading}
      isError={mensagensQ.isError}
      error={mensagensQ.error}
      errorTitle="Não foi possível carregar as conversas."
      onRetry={() => void mensagensQ.refetch()}
      loadingLabel="Carregando conversas"
      loadingFallback={
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      }
    >
      {conversas.length === 0 ? (
        <EmptyState
          icon={WhatsappLogo}
          title="Nenhuma conversa ainda"
          description="Quando um cliente escrever no WhatsApp, a conversa aparece aqui."
          className="py-16"
        />
      ) : (
        <>
          <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
            <section
              aria-labelledby="mensagens-contagem"
              className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-card text-card-foreground shadow-elev-1 md:min-h-0"
            >
              <header className="border-b border-border-subtle px-4 py-3">
                <h2 id="mensagens-contagem" className="text-sm font-semibold tabular-nums">
                  <span className={cn(contagem.aguardando > 0 && "text-destructive")}>
                    {contagem.aguardando} aguardando resposta
                  </span>{" "}
                  <span className="font-medium text-muted-foreground">
                    · {contagem.total} {contagem.total === 1 ? "conversa" : "conversas"}
                  </span>
                </h2>
              </header>
              <ul className="divide-y divide-border-subtle md:min-h-0 md:flex-1 md:overflow-y-auto">
                {conversas.map((c) => {
                  const lead = leads.get(c.leadId);
                  const ativa = destacado === c.leadId;
                  return (
                    <li key={c.leadId}>
                      <button
                        type="button"
                        onClick={() => abrirConversa(c.leadId)}
                        aria-current={ativa ? "true" : undefined}
                        className={cn(
                          "flex min-h-11 w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          ativa && "bg-accent shadow-[inset_3px_0_0_var(--color-primary)]",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13.5px] font-semibold">
                            {lead?.nome ?? "Lead"}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatRelativeTime(c.ultima.criado_em)}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px] text-muted-foreground">
                            {previewConversa(c.ultima)}
                          </span>
                          {c.aguardandoResposta > 0 && (
                            <span
                              className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 font-display text-[10.5px] font-bold leading-none text-destructive-foreground"
                              aria-label={`${c.aguardandoResposta} aguardando resposta`}
                            >
                              {c.aguardandoResposta}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {!isMobile && painelDaThread(false)}
          </div>

          {isMobile && (
            <Sheet open={threadAberta} onOpenChange={setThreadAberta}>
              <SheetContent
                side="right"
                aria-describedby={undefined}
                className="flex w-full flex-col gap-0 p-0 pb-[env(safe-area-inset-bottom)] sm:max-w-none [&>button.absolute]:hidden"
              >
                {painelDaThread(true)}
              </SheetContent>
            </Sheet>
          )}
        </>
      )}
    </AsyncBoundary>
  );
}

/** O cartão da conversa: cabeçalho (quem é, Abrir lead, "…"), as bolhas
 *  ocupando a altura e o composer fixo embaixo. No celular vive dentro do
 *  Sheet de tela cheia, com "Voltar às conversas" no lugar do X. */
function ThreadDaConversa({
  noCelular,
  leadId,
  lead,
  thread,
  aguardando,
  marcandoTratada,
  onMarcarTratada,
  texto,
  onTexto,
  enviando,
  onEnviar,
}: {
  noCelular: boolean;
  leadId: string | null;
  lead: LeadResumo | undefined;
  thread: Mensagem[];
  aguardando: boolean;
  marcandoTratada: boolean;
  onMarcarTratada: () => void;
  texto: string;
  onTexto: (v: string) => void;
  enviando: boolean;
  onEnviar: () => void;
}) {
  const corpoRef = useRef<HTMLDivElement>(null);
  const nome = lead?.nome ?? "Conversa";

  // A mensagem mais nova fica embaixo: abrir (ou receber) já mostra o fim da
  // conversa, sem rolar.
  useEffect(() => {
    const el = corpoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [leadId, thread.length]);

  return (
    <section
      aria-label={`Conversa com ${nome}`}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card text-card-foreground",
        noCelular ? "h-full" : "rounded-2xl border border-border-subtle shadow-elev-1",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        {noCelular && (
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0"
              aria-label="Voltar às conversas"
            >
              <CaretLeft />
            </Button>
          </SheetClose>
        )}
        <div className="min-w-0 flex-1">
          {noCelular ? (
            <SheetTitle className="truncate text-[15px] font-semibold">{nome}</SheetTitle>
          ) : (
            <h2 className="truncate text-[15px] font-semibold">{nome}</h2>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {lead?.telefone}
            {lead?.projeto_nome ? ` · ${lead.projeto_nome}` : ""}
          </p>
        </div>
        {leadId && (
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/leads/$leadId" params={{ leadId }}>
              <ArrowSquareOut className="h-4 w-4" /> Abrir lead
            </Link>
          </Button>
        )}
        {aguardando && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground md:h-8 md:w-8"
                aria-label="Mais ações da conversa"
              >
                <DotsThree weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                disabled={marcandoTratada}
                onSelect={onMarcarTratada}
                title="Apaga o aguardando resposta sem responder — some do badge e da fila Responder"
              >
                <Checks />
                <span>
                  Marcar tratada
                  <span className="block text-xs font-normal text-muted-foreground">
                    sai do badge e da fila Responder
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div
        ref={corpoRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 px-4 py-4"
      >
        <BolhasThread thread={thread} />
      </div>

      <div className="bg-card px-4 pb-3">
        <ComposerConversa
          value={texto}
          onChange={onTexto}
          onEnviar={onEnviar}
          pending={enviando}
          disabled={!leadId}
        />
      </div>
    </section>
  );
}
