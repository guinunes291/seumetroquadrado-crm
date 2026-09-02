// Fila do dia da régua de follow-up — um lead por vez, no modelo do Modo
// Volume: sweep com atalhos, ação primária no canal que a régua manda e o
// desfecho fecha o ciclo (agenda o próximo toque, pausa para conversa, abre
// visita ou descarta). O toque em si é registrado pelos hooks de contato
// (abrirWhatsApp/ligar) — o desfecho nunca grava interação duplicada.

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { cn } from "@/lib/utils";
import { isTypingTarget } from "@/lib/shortcuts";
import { origemLabel } from "@/lib/origem";
import { formatDuration } from "@/lib/duracao";
import {
  LEAD_STATUS_BADGE_TONE,
  LEAD_STATUS_LABEL,
  type LeadStatus,
  type StageLead,
} from "@/lib/leads";
import {
  proximoToque,
  tipoDaTarefa,
  tituloDoToque,
  REGUA_PADRAO,
  type TemperaturaRegua,
} from "@/lib/regua-followup";
import { garantirFollowUpAberto } from "@/lib/follow-up";
import { mensagemDoToque } from "@/features/followup/mensagem-toque";
import {
  carregarRegua,
  concluirToquesDeHoje,
  contarTentativas,
  esgotarFollowUp,
  fetchFilaFollowUp,
  type FilaItem,
} from "@/features/followup/fila-client";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { useLigarLead } from "@/hooks/use-ligar-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type PerdidoState,
  type StageModalState,
} from "@/components/lead-stage/lead-stage-modals";
import { ResumoIA } from "@/components/resumo-ia";
import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  Bank,
  Buildings,
  CalendarCheck,
  CalendarDots,
  ClipboardText,
  Clock,
  Confetti,
  Megaphone,
  Phone,
  PiggyBank,
  Prohibit,
  Target,
  Wallet,
  WhatsappLogo,
} from "@phosphor-icons/react";

const ATALHOS = "Atalhos: ← → navegar · W WhatsApp · L ligar · D desfecho.";

type DesfechoTipo = "sem_resposta" | "respondeu" | "agendou" | "descartar";

function toStageLead(item: FilaItem): StageLead {
  return {
    id: item.id,
    nome: item.nome,
    status: item.status,
    corretor_id: item.corretor_id,
    projeto_id: item.projeto_id,
    projeto_nome: item.projeto_nome,
    observacoes: item.observacoes,
  };
}

export function FilaFollowUpView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const abrirWhatsApp = useWhatsAppLead();
  const { ligar, discando } = useLigarLead();

  const [index, setIndex] = useState(0);
  // Leads já tratados nesta sessão saem da fila local na hora — sem esperar o
  // refetch — para o avanço nunca pular nem repetir um lead.
  const [tratados, setTratados] = useState<Set<string>>(() => new Set());
  const [desfechoOpen, setDesfechoOpen] = useState(false);
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const filaQ = useQuery({
    queryKey: ["followup:fila", user?.id],
    enabled: !!user,
    queryFn: () => fetchFilaFollowUp(),
  });

  const reguaQ = useQuery({
    queryKey: ["followup:regua"],
    staleTime: 5 * 60_000,
    queryFn: carregarRegua,
  });
  const regua = reguaQ.data ?? REGUA_PADRAO;

  // Templates ativos de WhatsApp — a convenção "Régua N" escolhe a mensagem
  // do toque; sem template, o fallback G.P.V.A. embutido assume.
  const templatesQ = useQuery({
    queryKey: ["followup:templates"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates_mensagem")
        .select("nome, conteudo")
        .eq("canal", "whatsapp")
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []).map((t) => ({ nome: t.nome, conteudo: t.conteudo }));
    },
  });

  useRealtimeInvalidate(["leads", "interacoes", "tarefas"], [["followup:fila"]]);

  const fila = useMemo(
    () => (filaQ.data?.itens ?? []).filter((i) => !tratados.has(i.id)),
    [filaQ.data, tratados],
  );
  const total = fila.length + tratados.size;
  const pos = tratados.size + (fila.length === 0 ? 0 : index + 1);

  useEffect(() => {
    setIndex((i) => (fila.length === 0 ? 0 : Math.min(i, fila.length - 1)));
  }, [fila.length]);

  const updateStatus = useLeadStatusMutation({
    optimisticKeys: [],
    invalidateKeys: [["followup:fila"], ["leads"], ["nav-badges"]],
  });

  const current: FilaItem | undefined = fila[index];

  // O nº do toque EXIBIDO congela no primeiro render de cada lead: o clique
  // em WhatsApp/Ligar registra a interação e o refetch do realtime bumpa
  // `tentativas` em segundos — sem o congelamento, o "Toque N de 13" (e o
  // título da mensagem) pularia para N+1 na frente do corretor, no mesmo
  // lead. O DESFECHO não usa este valor: ele relê o contador do banco.
  const tentativasVistas = useRef(new Map<string, number>());
  if (current && !tentativasVistas.current.has(current.id)) {
    tentativasVistas.current.set(current.id, current.tentativas);
  }
  const tentativasBase = current
    ? (tentativasVistas.current.get(current.id) ?? current.tentativas)
    : 0;

  // O toque de HOJE: nº tentativas + 1, canal ditado pela régua. null quando
  // as tentativas já alcançaram o teto — só resta o desfecho (esgotar).
  const toqueHoje = current
    ? proximoToque(
        regua,
        current.temperatura as TemperaturaRegua | null,
        current.status,
        tentativasBase,
      )
    : null;
  const numeroToque = current ? Math.min(tentativasBase + 1, regua.maxToques) : 1;
  const canalHoje = toqueHoje?.canal ?? "whatsapp";

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, Math.max(fila.length - 1, 0))),
    [fila.length],
  );
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  const doWhatsApp = useCallback(() => {
    if (!current) return;
    const mensagem = mensagemDoToque({
      toque: numeroToque,
      maxToques: regua.maxToques,
      nome: current.nome,
      projetoNome: current.projeto_nome,
      templates: templatesQ.data ?? [],
    });
    abrirWhatsApp(
      {
        id: current.id,
        nome: current.nome,
        telefone: current.telefone,
        projeto_nome: current.projeto_nome,
      },
      { mensagem, titulo: `WhatsApp — Follow-up toque ${numeroToque}` },
    );
  }, [current, numeroToque, regua.maxToques, templatesQ.data, abrirWhatsApp]);

  const doLigar = useCallback(() => {
    if (!current) return;
    ligar({ id: current.id, nome: current.nome, telefone: current.telefone });
  }, [current, ligar]);

  const concluirLead = useCallback(
    (leadId: string) => {
      setTratados((antes) => {
        const depois = new Set(antes);
        depois.add(leadId);
        return depois;
      });
      void qc.invalidateQueries({ queryKey: ["followup:fila"] });
      void qc.invalidateQueries({ queryKey: ["nav-badges"] });
    },
    [qc],
  );

  // "Sem resposta": conclui as tarefas de contato do toque de hoje e agenda o
  // próximo toque da régua como tarefa comum (dedup em garantirFollowUpAberto;
  // o espelho tarefas ↔ proximo_followup faz o resto) — ou esgota, se não há
  // próximo toque na régua.
  const semResposta = useMutation({
    mutationFn: async (item: FilaItem) => {
      // Fonte de verdade na hora do desfecho: o contador derivado do banco já
      // inclui o toque de hoje quando ele saiu por WhatsApp/Ligar. O snapshot
      // da fila pode estar nos DOIS estados (o refetch do realtime corre em
      // paralelo) — somar +1 sobre ele dobraria o toque e esgotaria a régua
      // um toque mais cedo. Banco antigo (RPC ausente) cai no comportamento
      // de snapshot.
      const feitas = (await contarTentativas(item.id)) ?? item.tentativas + 1;
      // O toque de hoje foi dado: as tarefas de contato que puseram o lead na
      // fila fecham como concluídas — sem isso elas ficariam pendentes, o
      // espelho continuaria no passado e o lead voltaria à fila TODO dia,
      // fora da cadência (e acumulando tarefa aberta por desfecho).
      await concluirToquesDeHoje(item.id);
      const prox = proximoToque(
        regua,
        item.temperatura as TemperaturaRegua | null,
        item.status,
        feitas,
      );
      if (!prox) {
        await esgotarFollowUp(item.id);
        return { esgotou: true as const };
      }
      const vencimento = new Date();
      vencimento.setDate(vencimento.getDate() + prox.emDias);
      await garantirFollowUpAberto({
        leadId: item.id,
        tipo: tipoDaTarefa(prox.canal),
        titulo: tituloDoToque(prox.toque, regua.maxToques, prox.canal),
        prioridade: "media",
        vencimento: vencimento.toISOString(),
        corretorId: item.corretor_id,
        criadoPorId: user?.id ?? null,
      });
      return { esgotou: false as const, toque: prox.toque, emDias: prox.emDias };
    },
    onSuccess: (r, item) => {
      if (r.esgotou) {
        toast("Régua esgotada — lead movido para Esgotados", {
          description: "Decida lá: reativar a régua ou descartar com motivo.",
        });
        void qc.invalidateQueries({ queryKey: ["followup:esgotados"] });
      } else {
        toast.success(
          `Toque ${r.toque}/${regua.maxToques} agendado para daqui a ${r.emDias} dia${r.emDias === 1 ? "" : "s"}.`,
        );
      }
      void qc.invalidateQueries({ queryKey: ["tarefas"] });
      concluirLead(item.id);
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível registrar o desfecho."),
  });

  const onDesfecho = useCallback(
    (tipo: DesfechoTipo) => {
      if (!current) return;
      setDesfechoOpen(false);
      if (tipo === "sem_resposta") {
        semResposta.mutate(current);
      } else if (tipo === "respondeu") {
        toast.success(`${current.nome} respondeu — continue a conversa antes de qualquer toque.`, {
          action: { label: "Abrir Mensagens", onClick: () => void navigate({ to: "/mensagens" }) },
        });
        concluirLead(current.id);
      } else if (tipo === "agendou") {
        setModalState({ modal: "agendado", lead: toStageLead(current) });
      } else {
        setPerdidoLead(toStageLead(current));
      }
    },
    [current, semResposta, navigate, concluirLead],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalState || perdidoLead || desfechoOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key.toLowerCase() === "w") doWhatsApp();
      else if (e.key.toLowerCase() === "l") doLigar();
      else if (e.key.toLowerCase() === "d" && current) setDesfechoOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, doWhatsApp, doLigar, current, modalState, perdidoLead, desfechoOpen]);

  const acaoWhatsApp = (
    <Button
      key="whatsapp"
      className={cn(
        "min-h-11 flex-1",
        canalHoje !== "whatsapp" && "border-success/40 text-success hover:bg-success/10",
      )}
      variant={canalHoje === "whatsapp" ? "default" : "outline"}
      onClick={doWhatsApp}
    >
      <WhatsappLogo className="mr-1 h-4 w-4" /> WhatsApp
    </Button>
  );
  const acaoLigar = (
    <Button
      key="ligar"
      className="min-h-11 flex-1"
      variant={canalHoje === "ligacao" ? "default" : "outline"}
      disabled={discando}
      onClick={doLigar}
    >
      <Phone className="mr-1 h-4 w-4" /> {discando ? "Discando…" : "Ligar"}
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm font-semibold text-foreground">Fila do dia</span>
        <Badge variant="secondary" className="text-xs">
          {total === 0 ? "0 leads" : `${pos} de ${total}`}
        </Badge>
        <span>{ATALHOS}</span>
      </div>

      {total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(pos / total) * 100}%` }}
          />
        </div>
      )}

      {filaQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar a fila de follow-up."
          error={filaQ.error}
          onRetry={() => void filaQ.refetch()}
          className="mx-auto max-w-4xl"
        />
      ) : filaQ.isLoading ? (
        <Card className="mx-auto max-w-4xl">
          <CardContent className="space-y-6 p-6 md:p-8" aria-busy="true">
            <div className="space-y-2">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-10 w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-11 w-full" />
          </CardContent>
        </Card>
      ) : !current ? (
        <EmptyState
          icon={Confetti}
          title="Fila zerada 🎉"
          description="Todos os toques do dia foram dados. Os próximos entram aqui quando vencerem — bom momento para avançar a carteira no Atender."
          action={
            <Button asChild variant="outline">
              <Link to="/atendimento">Ir para Atender</Link>
            </Button>
          }
          className="py-16"
        />
      ) : (
        <Card className="mx-auto max-w-4xl">
          <CardContent className="space-y-6 p-6 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-2xl font-bold md:text-3xl">{current.nome}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {current.projeto_nome && <span>{current.projeto_nome}</span>}
                  <span>· {origemLabel(current.origem)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/leads/$leadId" params={{ leadId: current.id }}>
                    <ArrowSquareOut className="mr-1 h-4 w-4" /> Abrir
                  </Link>
                </Button>
                <LeadStageMenu
                  lead={current}
                  onPickDirect={(target: LeadStatus) =>
                    updateStatus.mutate({ id: current.id, status: target })
                  }
                  onPickModal={(modal) => setModalState({ modal, lead: toStageLead(current) })}
                  onPickPerdido={() => setPerdidoLead(toStageLead(current))}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(LEAD_STATUS_BADGE_TONE[current.status as LeadStatus])}
              >
                {LEAD_STATUS_LABEL[current.status as LeadStatus] ?? current.status}
              </Badge>
              <TemperatureChip temperatura={current.temperatura} />
              {current.respondeu && (
                <Badge variant="destructive" className="gap-1">
                  <ArrowBendUpLeft className="h-3 w-3" /> Respondeu!
                </Badge>
              )}
              {current.minutos_vencido > 0 && (
                <Badge variant="secondary" className="gap-1 bg-warning/15 text-warning">
                  <Clock className="h-3 w-3" /> Vencido há {formatDuration(current.minutos_vencido)}
                </Badge>
              )}
            </div>

            {/* O coração da régua: qual toque é este e por qual canal sai. */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-semibold">
                  Toque <span className="text-2xl font-bold text-primary">{numeroToque}</span>{" "}
                  <span className="text-muted-foreground">de {regua.maxToques}</span>
                </div>
                <Badge variant="secondary" className="gap-1">
                  {canalHoje === "ligacao" ? (
                    <>
                      <Phone className="h-3 w-3" /> Toque por ligação
                    </>
                  ) : (
                    <>
                      <WhatsappLogo className="h-3 w-3" /> Toque por WhatsApp
                    </>
                  )}
                </Badge>
              </div>
              <div className="mt-3 flex gap-1" aria-hidden="true">
                {Array.from({ length: regua.maxToques }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      i < tentativasBase
                        ? "bg-primary"
                        : i === numeroToque - 1
                          ? "bg-primary/50"
                          : "bg-muted-foreground/20",
                    )}
                  />
                ))}
              </div>
              {!toqueHoje && (
                <p className="mt-2 text-xs text-warning">
                  Tentativas no teto da régua — registre o desfecho para esgotar ou decidir.
                </p>
              )}
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <InfoLine icon={Phone} label="Telefone" value={current.telefone} />
              <InfoLine icon={Buildings} label="Projeto" value={current.projeto_nome ?? "—"} />
              <InfoLine icon={Megaphone} label="Origem" value={origemLabel(current.origem)} />
              <InfoLine
                icon={CalendarDots}
                label="Último contato"
                value={fmtDate(current.ultima_interacao)}
              />
              <InfoLine icon={Target} label="Próxima ação" value={current.proxima_acao ?? "—"} />
            </div>

            <Separator />

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Perfil financeiro
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoTile
                  icon={Wallet}
                  label="Renda"
                  value={current.renda_informada ?? "Não informada"}
                />
                <InfoTile
                  icon={PiggyBank}
                  label="Entrada"
                  value={current.entrada_disponivel ?? "Não informada"}
                />
                <InfoTile
                  icon={Bank}
                  label="FGTS"
                  value={
                    current.usa_fgts === true
                      ? "Sim, usa"
                      : current.usa_fgts === false
                        ? "Não usa"
                        : "Não informado"
                  }
                />
              </div>
            </div>

            {current.observacoes && (
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Observações</div>
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-foreground/90">
                  {current.observacoes}
                </p>
              </div>
            )}

            <ResumoIA leadId={current.id} />

            <div className="flex gap-2">
              {canalHoje === "ligacao" ? [acaoLigar, acaoWhatsApp] : [acaoWhatsApp, acaoLigar]}
            </div>
            <Button
              variant="secondary"
              className="min-h-11 w-full"
              disabled={semResposta.isPending}
              onClick={() => setDesfechoOpen(true)}
            >
              <ClipboardText className="mr-1 h-4 w-4" /> Desfecho do toque
            </Button>

            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" onClick={prev} disabled={index === 0}>
                Anterior
              </Button>
              <Button onClick={next} disabled={index >= fila.length - 1}>
                Próximo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {current && (
        <DesfechoDialog
          open={desfechoOpen}
          onOpenChange={setDesfechoOpen}
          nome={current.nome}
          pending={semResposta.isPending}
          onPick={onDesfecho}
        />
      )}

      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
        onDone={() => {
          const id = modalState?.lead.id ?? perdidoLead?.id;
          if (id) concluirLead(id);
        }}
      />
    </div>
  );
}

/** Chips de desfecho do toque — o gesto único que fecha o ciclo do lead na
 *  fila. Interno da fila: o registro do toque já aconteceu no WhatsApp/Ligar. */
function DesfechoDialog({
  open,
  onOpenChange,
  nome,
  pending,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nome: string;
  pending: boolean;
  onPick: (tipo: DesfechoTipo) => void;
}) {
  const OPCOES: {
    key: DesfechoTipo;
    label: string;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
    destrutivo?: boolean;
  }[] = [
    {
      key: "sem_resposta",
      label: "Sem resposta",
      hint: "agenda o próximo toque da régua (ou esgota, se este era o último)",
      icon: Clock,
    },
    {
      key: "respondeu",
      label: "Respondeu",
      hint: "continue a conversa nas Mensagens — nada é agendado",
      icon: ArrowBendUpLeft,
    },
    {
      key: "agendou",
      label: "Agendou visita",
      hint: "abre o formulário de agendamento da visita",
      icon: CalendarCheck,
    },
    {
      key: "descartar",
      label: "Descartar",
      hint: "marca como perdido, com o motivo",
      icon: Prohibit,
      destrutivo: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Desfecho do toque — {nome}</DialogTitle>
          <DialogDescription>O que aconteceu depois do contato?</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {OPCOES.map(({ key, label, hint, icon: Icon, destrutivo }) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              disabled={pending}
              className={cn(
                "min-h-11 justify-start gap-3 py-2 text-left",
                destrutivo && "border-destructive/40 text-destructive hover:bg-destructive/10",
              )}
              onClick={() => onPick(key)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium">{label}</span>
                <span
                  className={cn(
                    "block truncate text-xs font-normal",
                    destrutivo ? "text-destructive/70" : "text-muted-foreground",
                  )}
                >
                  {hint}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
