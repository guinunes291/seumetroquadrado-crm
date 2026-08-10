// Central de Mensagens (Fase 7b) — inbox unificada de conversas WhatsApp
// sobre a tabela `mensagens` da 7a, em MODO SIMULADO até a decisão D1 ligar
// o provedor (7c): a entrada chega pelo webhook n8n; a saída registra a
// mensagem na conversa E abre o wa.me com o texto — o corretor dispara pelo
// próprio aparelho, mas o CRM passa a ENXERGAR a conversa (métrica O1).
//
// Sem estado de "lida" no banco nesta fase: "aguardando resposta" é derivado
// por conversa (derive.ts), preservando a RLS fechada da 7a.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Info, MessageCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { supabase } from "@/integrations/supabase/client";
import { formatRelativeTime } from "@/lib/interacoes";
import { cn } from "@/lib/utils";
import { agruparConversas, ordenarThread, previewConversa } from "./derive";
import { listarMensagensRecentes, registrarEnvioSimulado } from "./mensagens-client";

type LeadResumo = {
  id: string;
  nome: string;
  telefone: string;
  projeto_nome: string | null;
};

export function CentralMensagens() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const abrirWhatsApp = useWhatsAppLead();
  const [leadAtivo, setLeadAtivo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const mensagensQ = useQuery({
    queryKey: ["mensagens:central", user?.id],
    enabled: !!user,
    queryFn: () => listarMensagensRecentes(500),
  });
  useRealtimeInvalidate("mensagens", [["mensagens:central"]]);

  const conversas = useMemo(() => agruparConversas(mensagensQ.data?.rows ?? []), [mensagensQ.data]);
  const leadIds = useMemo(() => conversas.map((c) => c.leadId), [conversas]);

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
  const thread = useMemo(
    () =>
      selecionado
        ? ordenarThread((mensagensQ.data?.rows ?? []).filter((m) => m.lead_id === selecionado))
        : [],
    [mensagensQ.data, selecionado],
  );
  const leadSelecionado = selecionado ? leads.get(selecionado) : undefined;

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
      void qc.invalidateQueries({ queryKey: ["mensagens:central"] });
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
          icon={MessageCircle}
          title="Nenhuma conversa ainda"
          description="As mensagens dos clientes entram aqui pelo webhook do WhatsApp (Fase 7a). Você também pode iniciar uma conversa pelo lead — cada envio da Central registra a mensagem e abre o WhatsApp com o texto pronto."
          className="py-16"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(260px,340px)_1fr]">
          {/* Lista de conversas */}
          <div className="space-y-2">
            {conversas.map((c) => {
              const lead = leads.get(c.leadId);
              return (
                <button
                  key={c.leadId}
                  type="button"
                  onClick={() => setLeadAtivo(c.leadId)}
                  className={cn(
                    "w-full rounded-md border p-2 text-left transition-colors hover:bg-accent/40",
                    selecionado === c.leadId && "border-primary/50 bg-accent/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{lead?.nome ?? "Lead"}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(c.ultima.criado_em)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {previewConversa(c.ultima)}
                    </span>
                    {c.aguardandoResposta > 0 && (
                      <Badge className="shrink-0 px-1.5" variant="destructive">
                        {c.aguardandoResposta}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Thread do lead selecionado */}
          <Card>
            <CardContent className="flex h-[60vh] flex-col gap-3 p-3">
              <div className="flex items-center justify-between gap-2 border-b pb-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {leadSelecionado?.nome ?? "Conversa"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {leadSelecionado?.telefone}
                    {leadSelecionado?.projeto_nome ? ` · ${leadSelecionado.projeto_nome}` : ""}
                  </div>
                </div>
                {selecionado && (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/leads/$leadId" params={{ leadId: selecionado }}>
                      <ExternalLink className="h-4 w-4" /> Abrir lead
                    </Link>
                  </Button>
                )}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.direcao === "saida" ? "ml-auto bg-primary/10" : "mr-auto bg-muted",
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {m.conteudo ?? (m.midia_url ? "[mídia]" : "[mensagem]")}
                    </div>
                    <div className="mt-1 text-right text-[10px] text-muted-foreground">
                      {formatRelativeTime(m.criado_em)}
                      {m.direcao === "saida" ? ` · ${m.status}` : ""}
                      {m.provider === "simulado" ? " · via aparelho" : ""}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-end gap-2 border-t pt-2">
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escreva a resposta — registra na conversa e abre o WhatsApp com o texto pronto."
                  className="min-h-[44px] flex-1 resize-none"
                  rows={2}
                  aria-label="Mensagem"
                />
                <Button
                  onClick={() => enviar.mutate()}
                  disabled={enviar.isPending || !texto.trim() || !selecionado}
                  title="Registrar na conversa e abrir o WhatsApp"
                >
                  <Send className="h-4 w-4" /> Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AsyncBoundary>
  );
}
