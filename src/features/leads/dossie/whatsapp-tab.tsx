// Aba WhatsApp do dossiê (Lote 3 da auditoria das abas laterais): a conversa
// REAL do lead embutida na ficha — mesma tabela `mensagens` da Central e o
// mesmo estado "aguardando resposta" da fonte única do banco. Acabou o pulo
// de hub só para ler a thread: quem trabalha a ficha responde (ou marca
// tratada) daqui, e o badge da sidebar e a fila Responder apagam juntos.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, ExternalLink, Info, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { ordenarThread } from "@/features/mensagens/derive";
import {
  conversaEstado,
  listarMensagensDoLead,
  marcarConversaTratada,
  registrarEnvioSimulado,
} from "@/features/mensagens/mensagens-client";
import { BolhasThread, ComposerConversa } from "@/features/mensagens/thread-conversa";

type LeadDaConversa = {
  nome: string;
  telefone: string;
  projeto_nome?: string | null;
};

export function WhatsappTab({ leadId, lead }: { leadId: string; lead: LeadDaConversa }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const abrirWhatsApp = useWhatsAppLead();
  const [texto, setTexto] = useState("");

  const mensagensQ = useQuery({
    queryKey: ["mensagens:lead", leadId],
    queryFn: () => listarMensagensDoLead(leadId),
  });

  // Estado pela FONTE ÚNICA (a mesma do badge/fila) — RPC ausente devolve
  // null e o cabeçalho simplesmente não mostra o estado.
  const estadoQ = useQuery({
    queryKey: ["conversa-estado", leadId],
    staleTime: 30_000,
    queryFn: () => conversaEstado(leadId),
  });

  useRealtimeInvalidate(
    "mensagens",
    [
      ["mensagens:lead", leadId],
      ["conversa-estado", leadId],
    ],
    {
      filter: `lead_id=eq.${leadId}`,
    },
  );
  useRealtimeInvalidate("conversas_tratadas", [["conversa-estado", leadId]], {
    filter: `lead_id=eq.${leadId}`,
  });

  const invalidarFonteUnica = () => {
    void qc.invalidateQueries({ queryKey: ["mensagens:lead", leadId] });
    void qc.invalidateQueries({ queryKey: ["mensagens:central"] });
    void qc.invalidateQueries({ queryKey: ["mensagens:tratadas"] });
    void qc.invalidateQueries({ queryKey: ["conversa-estado", leadId] });
    void qc.invalidateQueries({ queryKey: ["nav-badges"] });
    void qc.invalidateQueries({ queryKey: ["atendimento:inbox"] });
  };

  // Mesmo fluxo da Central: registra a saída na conversa E abre o wa.me (o
  // hook ainda registra a interação de saída na timeline).
  const enviar = useMutation({
    mutationFn: async () => {
      const conteudo = texto.trim();
      if (!conteudo || !user) throw new Error("Escreva a mensagem antes.");
      await registrarEnvioSimulado({ leadId, corretorId: user.id, conteudo });
      return conteudo;
    },
    onSuccess: (conteudo) => {
      setTexto("");
      invalidarFonteUnica();
      abrirWhatsApp(
        { id: leadId, nome: lead.nome, telefone: lead.telefone, projeto_nome: lead.projeto_nome },
        { mensagem: conteudo, titulo: "WhatsApp — Ficha do lead" },
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marcarTratada = useMutation({
    mutationFn: () => marcarConversaTratada(leadId),
    onSuccess: () => {
      toast.success("Conversa marcada como tratada.");
      invalidarFonteUnica();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (mensagensQ.data?.tabelaAusente) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            A conversa depende da migration <code>mensagens</code> (Fase 7a), ainda não aplicada
            neste ambiente.
          </span>
        </CardContent>
      </Card>
    );
  }

  const thread = ordenarThread(mensagensQ.data?.rows ?? []);
  const estado = estadoQ.data ?? null;

  return (
    <AsyncBoundary
      isLoading={mensagensQ.isLoading}
      isError={mensagensQ.isError}
      error={mensagensQ.error}
      errorTitle="Não foi possível carregar a conversa."
      onRetry={() => void mensagensQ.refetch()}
      loadingLabel="Carregando conversa"
      loadingFallback={
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      }
    >
      <Card>
        <CardContent className="flex h-[55vh] flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-2 border-b pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold">Conversa no WhatsApp</span>
              {estado?.aguardando && <Badge variant="destructive">Aguardando resposta</Badge>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {estado?.aguardando && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => marcarTratada.mutate()}
                  disabled={marcarTratada.isPending}
                  title="Apaga o aguardando resposta sem responder — some do badge e da fila Responder"
                >
                  <CheckCheck className="h-4 w-4" /> Marcar tratada
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link to="/mensagens">
                  <ExternalLink className="h-4 w-4" /> Central
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {thread.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title="Nenhuma mensagem ainda"
                description="As mensagens do cliente entram pelo webhook do WhatsApp; cada envio daqui registra na conversa e abre o WhatsApp com o texto pronto."
                className="py-10"
              />
            ) : (
              <BolhasThread thread={thread} />
            )}
          </div>

          <ComposerConversa
            value={texto}
            onChange={setTexto}
            onEnviar={() => enviar.mutate()}
            pending={enviar.isPending}
          />
        </CardContent>
      </Card>
    </AsyncBoundary>
  );
}
