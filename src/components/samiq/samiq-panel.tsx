import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { perguntarSamiQ } from "@/lib/samiq.functions";
import {
  SAMIQ_ACTION_META,
  type SamiQAction,
  type SamiQResposta,
  type SamiQSugestao,
} from "@/lib/samiq";
import { SAMIQ_TOOL_LABELS, isSamiQToolName } from "@/lib/samiq-tools";
import {
  avaliarRespostaSamiQ,
  carregarUltimaConversaSamiQ,
} from "@/components/samiq/samiq-conversas";
import { SamiQPropostasCard } from "@/components/samiq/samiq-propostas-card";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";
import type { SamiQAbrirDetail } from "@/components/samiq/abrir-samiq";
import { briefingSamiQ } from "@/lib/samiq-briefing.functions";
import type { BriefingIcone, BriefingLinha } from "@/lib/samiq-briefing";
import { useDitado } from "@/hooks/use-ditado";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDots,
  ChatCircleDots,
  CircleNotch,
  Clipboard,
  Copy,
  Fire,
  FolderOpen,
  ListChecks,
  ListNumbers,
  Microphone,
  PaperPlaneTilt,
  Path as RouteIcon,
  PhoneCall,
  Plus,
  ShieldWarning,
  Snowflake,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
  Timer,
  User,
  Warning,
  WhatsappLogo,
  type Icon as IconComponent,
} from "@phosphor-icons/react";
import { SamiMark } from "@/components/ui/sami-mark";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sugestoes?: SamiQSugestao[];
  /** Alvo do 👍/👎 — só respostas geradas nesta ou numa sessão persistida. */
  executionId?: string | null;
  /** Ferramentas de leitura consultadas (chip "Consultei: …"). */
  ferramentas?: string[];
  fallback?: boolean;
  avaliacao?: 1 | -1 | null;
  /** Propostas de escrita (S2) desta resposta — o card vive na mensagem. */
  propostas?: PropostaSamiQ[];
};

const QUICK_ACTIONS: { action: SamiQAction; icon: IconComponent }[] = [
  { action: "resumo_cliente", icon: User },
  { action: "mensagem_sugerida", icon: WhatsappLogo },
  { action: "responder_objecao", icon: ShieldWarning },
  { action: "proximo_passo", icon: RouteIcon },
  { action: "projeto_ideal", icon: SamiMark },
  { action: "checklist_docs", icon: ListChecks },
  { action: "recuperar_frio", icon: Fire },
  { action: "script_ligacao", icon: PhoneCall },
  { action: "prioridade_dia", icon: ListNumbers },
  { action: "analise_funil", icon: Clipboard },
];

const UUID_RE = /^\/leads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** % do orçamento mensal a partir do qual o painel avisa (D18: alerta em 80%). */
const ALERTA_CUSTO_PCT = 80;

const BRIEFING_ICONE: Record<BriefingIcone, IconComponent> = {
  agenda: CalendarDots,
  confirmar: CalendarCheck,
  followup: Timer,
  responder: ChatCircleDots,
  esfriando: Snowflake,
  docs: FolderOpen,
  novos: Sparkle,
};

const DITADO_CONSENTIMENTO_CHAVE = "samiq:ditado-consentido";

function consentiuDitado(): boolean {
  try {
    return window.localStorage.getItem(DITADO_CONSENTIMENTO_CHAVE) === "1";
  } catch {
    return false;
  }
}

function registrarConsentimentoDitado(): void {
  try {
    window.localStorage.setItem(DITADO_CONSENTIMENTO_CHAVE, "1");
  } catch {
    /* sem storage: pede de novo na próxima vez */
  }
}

/**
 * Painel do SamiQ: contexto no topo (detecta o lead da rota atual), grade de
 * ações rápidas e um chat com memória (Onda S1). A pergunta livre consulta a
 * carteira por ferramentas de LEITURA no servidor; o SamiQ sugere, o corretor
 * decide — botões de sugestão apenas copiam texto ou navegam.
 */
export function SamiQPanel({ onClose, seed }: { onClose: () => void; seed?: SamiQAbrirDetail }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const leadRota = useMemo(() => pathname.match(UUID_RE)?.[1], [pathname]);
  // Cliente em foco: o chip que abriu a Sami manda; senão, o dossiê aberto.
  const leadId = seed?.leadId ?? leadRota;

  const [thread, setThread] = useState<Msg[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [custoMesPct, setCustoMesPct] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [objecaoDraft, setObjecaoDraft] = useState<SamiQAction | null>(null);
  const [feedbackPara, setFeedbackPara] = useState<string | null>(null);
  const [feedbackMotivo, setFeedbackMotivo] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Nome do lead em contexto (chip do cabeçalho).
  const { data: leadNomeQuery } = useQuery({
    queryKey: ["samiq:lead-nome", leadId],
    enabled: !!leadId && !seed?.leadNome,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("nome").eq("id", leadId!).maybeSingle();
      return data?.nome ?? null;
    },
  });
  const leadNome = seed?.leadNome ?? leadNomeQuery;

  // Briefing ao abrir (S3, D13): agenda, follow-ups vencidos e filas — sem
  // chamar o modelo. Só enquanto a conversa está vazia.
  const carregarBriefing = useServerFn(briefingSamiQ);
  const briefing = useQuery({
    queryKey: ["samiq:briefing"],
    staleTime: 60_000,
    retry: 1,
    enabled: thread.length === 0,
    queryFn: () => carregarBriefing(),
  });

  // Memória: retoma a última conversa recente (RLS: só a do usuário).
  const memoria = useQuery({
    queryKey: ["samiq:ultima-conversa"],
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => carregarUltimaConversaSamiQ(),
  });
  const memoriaAplicada = useRef(false);
  useEffect(() => {
    if (memoriaAplicada.current || memoria.isPending) return;
    memoriaAplicada.current = true;
    const conversa = memoria.data;
    if (!conversa || conversa.mensagens.length === 0) return;
    setConversaId(conversa.id);
    setThread(
      conversa.mensagens.map((m) => ({
        role: m.role,
        content: m.content,
        executionId: m.executionId,
        ferramentas: m.ferramentas,
        avaliacao: m.avaliacao,
        propostas: m.propostas,
      })),
    );
  }, [memoria.data, memoria.isPending]);

  const perguntar = useServerFn(perguntarSamiQ);
  const mutation = useMutation({
    mutationFn: (vars: { action: SamiQAction; pergunta?: string }) =>
      perguntar({
        data: {
          action: vars.action,
          leadId: SAMIQ_ACTION_META[vars.action].precisaLead ? leadId : undefined,
          pergunta: vars.pergunta,
          conversaId: conversaId ?? undefined,
          historico: thread.slice(-6).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 1200),
          })),
        },
      }) as Promise<SamiQResposta>,
    onSuccess: (r) => {
      if (r.conversaId) setConversaId(r.conversaId);
      if (typeof r.custoMesPct === "number") setCustoMesPct(r.custoMesPct);
      setThread((t) => [
        ...t,
        {
          role: "assistant",
          content: r.texto,
          sugestoes: r.sugestoes,
          executionId: r.executionId ?? null,
          ferramentas: r.ferramentas ?? [],
          fallback: r.fallback,
          avaliacao: null,
          propostas: r.propostas ?? [],
        },
      ]);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setThread((t) => [
        ...t,
        { role: "assistant", content: `Não consegui responder agora: ${e.message}` },
      ]);
    },
  });

  const avaliar = useMutation({
    mutationFn: (vars: { executionId: string; nota: 1 | -1; motivo?: string }) =>
      avaliarRespostaSamiQ(vars.executionId, vars.nota, vars.motivo),
    onSuccess: (ok, vars) => {
      if (!ok) return;
      setThread((t) =>
        t.map((m) => (m.executionId === vars.executionId ? { ...m, avaliacao: vars.nota } : m)),
      );
      if (vars.nota === -1 && vars.motivo === undefined) {
        setFeedbackPara(vars.executionId);
        setFeedbackMotivo("");
      } else {
        setFeedbackPara(null);
        toast.success(vars.nota === 1 ? "Valeu! Isso ajuda a Sami a melhorar." : "Anotado.");
      }
    },
    onError: () => toast.error("Não consegui registrar sua avaliação."),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, mutation.isPending]);

  // Texto vindo do chip: pré-digita (o corretor completa) ou envia na hora.
  const seedAplicado = useRef(false);
  useEffect(() => {
    if (!seed?.texto || seedAplicado.current) return;
    seedAplicado.current = true;
    if (seed.autoEnviar) {
      const q = seed.texto.trim();
      setThread((t) => [...t, { role: "user", content: q }]);
      mutation.mutate({ action: "pergunta_livre", pergunta: q });
    } else {
      setInput(seed.texto);
    }
  }, [seed, mutation]);

  // Ditado por voz (S3, D8): o texto reconhecido entra no campo; o corretor
  // revisa e envia. O áudio é processado pelo navegador, não pela SMQ.
  const ditado = useDitado({
    onTexto: (texto) => setInput((v) => (v.trim() ? `${v.trimEnd()} ${texto}` : texto)),
    onErro: (mensagem) => toast.error(mensagem),
  });
  const alternarDitado = () => {
    if (ditado.ouvindo) {
      ditado.parar();
      return;
    }
    if (consentiuDitado()) {
      ditado.iniciar();
      return;
    }
    toast("Ditado por voz", {
      description:
        "O áudio é transcrito pelo motor de voz do seu navegador/celular e vira texto neste campo. Nada é gravado pela SMQ.",
      action: {
        label: "Entendi, ativar",
        onClick: () => {
          registrarConsentimentoDitado();
          ditado.iniciar();
        },
      },
    });
  };

  const perguntarDoBriefing = (linha: BriefingLinha) => {
    if (!linha.pergunta || mutation.isPending) return;
    setThread((t) => [...t, { role: "user", content: linha.pergunta! }]);
    mutation.mutate({ action: "pergunta_livre", pergunta: linha.pergunta });
  };

  const disparar = (action: SamiQAction, pergunta?: string) => {
    const meta = SAMIQ_ACTION_META[action];
    if (meta.precisaLead && !leadId) {
      toast.info("Abra a página de um lead para usar esta ação.");
      return;
    }
    const rotulo = pergunta ? `${meta.label}: ${pergunta}` : meta.label;
    setThread((t) => [...t, { role: "user", content: rotulo }]);
    mutation.mutate({ action, pergunta });
  };

  const enviarLivre = () => {
    const q = input.trim();
    if (!q || mutation.isPending) return;
    setInput("");
    if (objecaoDraft) {
      const action = objecaoDraft;
      setObjecaoDraft(null);
      disparar(action, q);
      return;
    }
    setThread((t) => [...t, { role: "user", content: q }]);
    mutation.mutate({ action: "pergunta_livre", pergunta: q });
  };

  const novaConversa = () => {
    if (mutation.isPending) return;
    setThread([]);
    setConversaId(null);
    setObjecaoDraft(null);
    setFeedbackPara(null);
  };

  const executarSugestao = (s: SamiQSugestao) => {
    if (s.copyText) {
      navigator.clipboard.writeText(s.copyText);
      toast.success("Copiado — revise antes de enviar.");
    }
    if (s.to) {
      onClose();
      navigate({ to: s.to });
    }
  };

  const enviarMotivo = (executionId: string) => {
    avaliar.mutate({ executionId, nota: -1, motivo: feedbackMotivo.trim() || "" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Contexto */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          Contexto:
          {leadId ? (
            <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
              <User className="h-3 w-3" /> {leadNome ?? "lead atual"}
            </Badge>
          ) : (
            <span className="truncate">sua carteira — pergunte sobre clientes, agenda e funil</span>
          )}
        </div>
        {thread.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={novaConversa}
            disabled={mutation.isPending}
            title="Começar uma conversa nova (a atual fica guardada)"
          >
            <Plus className="h-3.5 w-3.5" /> Nova conversa
          </Button>
        )}
      </div>

      {custoMesPct != null && custoMesPct >= ALERTA_CUSTO_PCT && (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-4 py-1.5 text-xs text-foreground">
          <Warning className="h-3.5 w-3.5 shrink-0 text-warning" />
          Você já usou {custoMesPct}% do orçamento mensal da Sami.
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div ref={scrollRef} className="space-y-3 px-4 py-3">
          {thread.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {briefing.data?.saudacao ?? "Oi"}! Sou a{" "}
                <span className="font-medium text-primary">Sami</span>, seu copiloto de vendas.
                Escolha uma ação, toque numa linha do seu dia ou pergunte sobre a sua carteira.
              </p>
              {/* Briefing ao abrir (S3): o "quem merece atenção hoje", sem custo de IA. */}
              <div className="rounded-lg border bg-card p-2.5 shadow-elev-1">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Seu dia
                </div>
                {briefing.isPending ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CircleNotch className="h-3.5 w-3.5 animate-spin" /> Olhando agenda, tarefas e
                    filas…
                  </div>
                ) : briefing.isError ? (
                  <p className="text-xs text-muted-foreground">
                    Não consegui montar o resumo do dia agora.
                  </p>
                ) : briefing.data?.vazio ? (
                  <p className="text-xs text-muted-foreground">
                    Tudo em dia por aqui: sem visita pendente, follow-up vencido ou cliente
                    esperando resposta.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {briefing.data?.linhas.map((linha) => {
                      const Icone = BRIEFING_ICONE[linha.icone];
                      return (
                        <li key={linha.chave} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted",
                              linha.tom === "warning" && "text-foreground",
                              linha.tom !== "warning" && "text-muted-foreground",
                            )}
                            title={linha.pergunta ? `Perguntar: ${linha.pergunta}` : linha.texto}
                            disabled={mutation.isPending}
                            onClick={() => perguntarDoBriefing(linha)}
                          >
                            <Icone
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                linha.tom === "warning" ? "text-warning" : "text-primary",
                              )}
                            />
                            <span className="truncate">{linha.texto}</span>
                          </button>
                          {linha.to && (
                            <button
                              type="button"
                              aria-label="Abrir no CRM"
                              title="Abrir no CRM"
                              className="rounded p-1 text-muted-foreground hover:text-primary"
                              onClick={() => {
                                onClose();
                                navigate({ to: linha.to! });
                              }}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ACTIONS.map(({ action, icon: Icon }) => {
                  const meta = SAMIQ_ACTION_META[action];
                  const desabilitada = meta.precisaLead && !leadId;
                  return (
                    <Button
                      key={action}
                      variant="outline"
                      size="sm"
                      disabled={desabilitada || mutation.isPending}
                      title={
                        desabilitada ? "Abra a página de um lead para usar esta ação" : meta.label
                      }
                      className="h-auto justify-start gap-1.5 px-2 py-2 text-left text-xs"
                      onClick={() => {
                        if (action === "responder_objecao") {
                          setObjecaoDraft(action);
                          toast.info("Descreva a objeção do cliente no campo abaixo e envie.");
                          return;
                        }
                        disparar(action);
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{meta.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {thread.map((m, i) => {
            const ferramentas = (m.ferramentas ?? []).filter(isSamiQToolName);
            const podeAvaliar = m.role === "assistant" && !!m.executionId;
            return (
              <div
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[88%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border bg-card shadow-elev-1",
                  )}
                >
                  {m.fallback && (
                    <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Warning className="h-3 w-3" /> Sem dados suficientes
                    </div>
                  )}
                  {m.content}
                  {m.sugestoes && m.sugestoes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.sugestoes.map((s, j) => (
                        <Button
                          key={j}
                          size="sm"
                          variant="secondary"
                          className="h-7 gap-1 text-xs"
                          onClick={() => executarSugestao(s)}
                        >
                          {s.copyText && <Copy className="h-3 w-3" />}
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  {m.propostas && m.propostas.length > 0 && (
                    <SamiQPropostasCard
                      propostas={m.propostas}
                      onChange={(propostas) =>
                        setThread((t) => t.map((x, k) => (k === i ? { ...x, propostas } : x)))
                      }
                    />
                  )}
                  {(ferramentas.length > 0 || podeAvaliar) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      {ferramentas.length > 0 && (
                        <span>
                          Consultei: {ferramentas.map((f) => SAMIQ_TOOL_LABELS[f]).join(" · ")}
                        </span>
                      )}
                      {podeAvaliar && (
                        <span className="ml-auto flex items-center gap-0.5">
                          <button
                            type="button"
                            aria-label="Resposta útil"
                            aria-pressed={m.avaliacao === 1}
                            disabled={avaliar.isPending}
                            className={cn(
                              "rounded p-0.5 hover:text-primary",
                              m.avaliacao === 1 && "text-primary",
                            )}
                            onClick={() => avaliar.mutate({ executionId: m.executionId!, nota: 1 })}
                          >
                            <ThumbsUp
                              className="h-3.5 w-3.5"
                              weight={m.avaliacao === 1 ? "fill" : "regular"}
                            />
                          </button>
                          <button
                            type="button"
                            aria-label="Resposta não ajudou"
                            aria-pressed={m.avaliacao === -1}
                            disabled={avaliar.isPending}
                            className={cn(
                              "rounded p-0.5 hover:text-destructive",
                              m.avaliacao === -1 && "text-destructive",
                            )}
                            onClick={() =>
                              avaliar.mutate({ executionId: m.executionId!, nota: -1 })
                            }
                          >
                            <ThumbsDown
                              className="h-3.5 w-3.5"
                              weight={m.avaliacao === -1 ? "fill" : "regular"}
                            />
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                  {podeAvaliar && feedbackPara === m.executionId && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Input
                        value={feedbackMotivo}
                        onChange={(e) => setFeedbackMotivo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            enviarMotivo(m.executionId!);
                          }
                        }}
                        maxLength={300}
                        placeholder="O que faltou? (opcional)"
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        onClick={() => enviarMotivo(m.executionId!)}
                      >
                        Enviar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {mutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleNotch className="h-4 w-4 animate-spin text-primary" /> Sami consultando…
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Entrada */}
      <div className="border-t p-3">
        {objecaoDraft && (
          <div className="mb-1.5 text-xs text-primary">Descreva a objeção do cliente e envie ↵</div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarLivre();
              }
            }}
            rows={2}
            maxLength={500}
            placeholder={
              objecaoDraft ? 'Ex.: "achou a parcela alta"' : "Pergunte à Sami… (Enter envia)"
            }
            className="min-h-0 resize-none"
          />
          {ditado.suportado && (
            <Button
              size="icon"
              variant={ditado.ouvindo ? "default" : "outline"}
              className={cn(ditado.ouvindo && "animate-pulse")}
              onClick={alternarDitado}
              disabled={mutation.isPending}
              aria-label={ditado.ouvindo ? "Parar ditado" : "Ditar por voz"}
              aria-pressed={ditado.ouvindo}
              title={ditado.ouvindo ? "Ouvindo… toque para parar" : "Ditar por voz"}
            >
              <Microphone className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            disabled={!input.trim() || mutation.isPending}
            onClick={enviarLivre}
            aria-label="Enviar"
          >
            <PaperPlaneTilt className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          A Sami consulta sua carteira e prepara registros — você confirma com um toque. Nada é
          gravado nem enviado ao cliente sem a sua confirmação.
        </p>
      </div>
    </div>
  );
}
