// "Link da pasta para o cliente" na aba Documentação do lead
// (migration 20261024120000). O cliente abre o link pessoal da pasta
// (/pasta/<token>), responde o perfil se ainda não houver checklist e envia
// foto ou PDF de cada item, aos poucos. Os arquivos chegam aqui como
// "recebidos" (badge "Pelo cliente"); no 3º documento a regra da pasta leva o
// lead para Análise de crédito. Mandar o link de novo renova o prazo (30 dias).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  Copy,
  FolderSimpleUser,
  LinkSimple,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNomeDoCorretor } from "@/hooks/use-nome-do-corretor";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  mensagemConvitePasta,
  pastaPath,
  pastaResumoSchema,
  type PastaResumo,
} from "@/lib/documentacao-link";

function resumoDe(data: unknown): PastaResumo | null {
  return data == null ? null : pastaResumoSchema.parse(data);
}

function quando(iso: string, comHora = false): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export function PastaClienteCard({
  leadId,
  lead,
}: {
  leadId: string;
  lead: { nome: string; telefone: string };
}) {
  const qc = useQueryClient();
  const queryKey = ["pasta-do-lead", leadId];
  const { user } = useAuth();
  const { data: nomeCorretor = null } = useNomeDoCorretor(user?.id);
  const abrirWa = useWhatsAppLead();
  const [confirmarTroca, setConfirmarTroca] = useState(false);

  const pastaQ = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("consultar_pasta_do_lead", { _lead_id: leadId });
      if (error) throw error;
      return resumoDe(data);
    },
  });

  // Gera na primeira vez; depois, renova o prazo (o endereço não muda).
  const garantir = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("link_pasta_do_lead", { _lead_id: leadId });
      if (error) throw error;
      return resumoDe(data);
    },
    onSuccess: (p) => qc.setQueryData(queryKey, p),
    onError: () => toast.error("Não foi possível gerar o link agora. Tente novamente."),
  });

  const trocar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("trocar_link_pasta_do_lead", { _lead_id: leadId });
      if (error) throw error;
      return resumoDe(data);
    },
    onSuccess: (p) => {
      qc.setQueryData(queryKey, p);
      toast.success("Link novo gerado. O antigo parou de funcionar.");
    },
    onError: () => toast.error("Não foi possível trocar o link agora."),
  });

  const pasta = pastaQ.data;
  const url = pasta ? `${window.location.origin}${pastaPath(pasta.token)}` : "";

  // Copiar e abrir o WhatsApp primeiro (o navegador exige o gesto do clique);
  // a renovação do prazo vai em seguida, em segundo plano.
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
    garantir.mutate();
  };
  const mandarWhatsapp = () => {
    abrirWa(
      { id: leadId, nome: lead.nome, telefone: lead.telefone },
      {
        mensagem: mensagemConvitePasta(url, lead.nome, nomeCorretor),
        titulo: "Link da pasta de documentos enviado via WhatsApp",
      },
    );
    garantir.mutate();
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderSimpleUser className="h-4 w-4 text-primary" /> Link da pasta para o cliente
        </div>
        <p className="text-xs text-muted-foreground">
          O cliente abre, responde o perfil (se ainda não houver checklist) e manda foto ou PDF de
          cada item, aos poucos. Os arquivos chegam aqui como recebidos.
        </p>

        {pastaQ.isPending ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : pastaQ.isError ? (
          <Button size="sm" variant="outline" onClick={() => void pastaQ.refetch()}>
            Tentar carregar de novo
          </Button>
        ) : !pasta ? (
          <Button size="sm" onClick={() => garantir.mutate()} disabled={garantir.isPending}>
            <LinkSimple className="mr-2 h-4 w-4" />
            {garantir.isPending ? "Gerando..." : "Gerar link da pasta"}
          </Button>
        ) : (
          <div className="space-y-2">
            <input
              readOnly
              value={url}
              aria-label="Endereço do link da pasta"
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 w-full min-w-0 rounded-md border bg-background px-2 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-exito-300 text-exito-700 hover:bg-exito-50"
                onClick={mandarWhatsapp}
              >
                <WhatsappLogo className="mr-2 h-4 w-4" /> Mandar no WhatsApp
              </Button>
              <Button size="sm" variant="outline" onClick={() => void copiar()}>
                <Copy className="mr-2 h-4 w-4" /> Copiar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmarTroca(true)}
                disabled={trocar.isPending}
              >
                <ArrowsClockwise className="mr-2 h-4 w-4" /> Trocar link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {pasta.expirada
                ? `Venceu em ${quando(pasta.expira_em)} — mandar de novo renova por 30 dias.`
                : `Vale até ${quando(pasta.expira_em)}.`}{" "}
              {pasta.arquivos_recebidos === 0
                ? "Nenhum arquivo pelo link ainda."
                : `${pasta.arquivos_recebidos} arquivo${pasta.arquivos_recebidos > 1 ? "s" : ""} pelo link${
                    pasta.ultimo_envio_em
                      ? `, o último em ${quando(pasta.ultimo_envio_em, true)}`
                      : ""
                  }.`}
            </p>
          </div>
        )}

        <AlertDialog open={confirmarTroca} onOpenChange={setConfirmarTroca}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Trocar o link da pasta?</AlertDialogTitle>
              <AlertDialogDescription>
                O link atual para de funcionar na hora (use se ele foi para a pessoa errada). Os
                documentos já enviados continuam no lead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => trocar.mutate()}>Trocar link</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
