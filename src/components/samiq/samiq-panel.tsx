import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ClipboardList,
  Copy,
  FileCheck2,
  Flame,
  ListOrdered,
  Loader2,
  MessageCircle,
  PhoneCall,
  Route as RouteIcon,
  Send,
  ShieldQuestion,
  Sparkles,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sugestoes?: SamiQSugestao[];
};

const QUICK_ACTIONS: { action: SamiQAction; icon: LucideIcon }[] = [
  { action: "resumo_cliente", icon: User },
  { action: "mensagem_sugerida", icon: MessageCircle },
  { action: "responder_objecao", icon: ShieldQuestion },
  { action: "proximo_passo", icon: RouteIcon },
  { action: "projeto_ideal", icon: Sparkles },
  { action: "checklist_docs", icon: FileCheck2 },
  { action: "recuperar_frio", icon: Flame },
  { action: "script_ligacao", icon: PhoneCall },
  { action: "prioridade_dia", icon: ListOrdered },
  { action: "analise_funil", icon: ClipboardList },
];

const UUID_RE = /^\/leads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Painel do SamiQ: contexto no topo (detecta o lead da rota atual), grade de
 * ações rápidas e um chat leve. O SamiQ sugere; o corretor decide — botões de
 * sugestão apenas copiam texto ou navegam.
 */
export function SamiQPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const leadId = useMemo(() => pathname.match(UUID_RE)?.[1], [pathname]);

  const [thread, setThread] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [objecaoDraft, setObjecaoDraft] = useState<SamiQAction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Nome do lead em contexto (chip do cabeçalho).
  const { data: leadNome } = useQuery({
    queryKey: ["samiq:lead-nome", leadId],
    enabled: !!leadId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("nome").eq("id", leadId!).maybeSingle();
      return data?.nome ?? null;
    },
  });

  const perguntar = useServerFn(perguntarSamiQ);
  const mutation = useMutation({
    mutationFn: (vars: { action: SamiQAction; pergunta?: string }) =>
      perguntar({
        data: {
          action: vars.action,
          leadId: SAMIQ_ACTION_META[vars.action].precisaLead ? leadId : undefined,
          pergunta: vars.pergunta,
          historico: thread.slice(-6).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 1200),
          })),
        },
      }) as Promise<SamiQResposta>,
    onSuccess: (r) => {
      setThread((t) => [...t, { role: "assistant", content: r.texto, sugestoes: r.sugestoes }]);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setThread((t) => [
        ...t,
        { role: "assistant", content: `Não consegui responder agora: ${e.message}` },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, mutation.isPending]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Contexto */}
      <div className="border-b px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Contexto:
          {leadId ? (
            <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
              <User className="h-3 w-3" /> {leadNome ?? "lead atual"}
            </Badge>
          ) : (
            <span>geral — abra um lead para ações sobre um cliente</span>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div ref={scrollRef} className="space-y-3 px-4 py-3">
          {thread.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sou o <span className="font-medium text-primary">SamiQ</span>, seu copiloto de
                vendas. Escolha uma ação ou pergunte qualquer coisa:
              </p>
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

          {thread.map((m, i) => (
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
              </div>
            </div>
          ))}

          {mutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> SamiQ pensando…
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
              objecaoDraft ? 'Ex.: "achou a parcela alta"' : "Pergunte ao SamiQ… (Enter envia)"
            }
            className="min-h-0 resize-none"
          />
          <Button
            size="icon"
            disabled={!input.trim() || mutation.isPending}
            onClick={enviarLivre}
            className="bg-gradient-gold text-navy-900 shadow-glow-gold hover:opacity-90"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          O SamiQ sugere — você decide. Nada é enviado ao cliente sem sua revisão.
        </p>
      </div>
    </div>
  );
}
