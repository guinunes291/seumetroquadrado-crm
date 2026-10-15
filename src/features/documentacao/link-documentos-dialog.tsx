// "Link de documentos" — o link FIXO de documentação do corretor
// (/documentos/<slug>, migration 20261024120000).
//
// O corretor manda o link a qualquer cliente: ele informa os dados e o perfil
// de renda, cai na carteira do corretor em Em atendimento com a lista de
// documentos na aba Documentação, e envia os arquivos pelo celular, aos
// poucos. Gerar um link novo derruba o antigo na hora; as pastas já abertas
// continuam valendo (são dos clientes).

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  Copy,
  FolderSimple,
  LinkSimple,
  Prohibit,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNomeDoCorretor } from "@/hooks/use-nome-do-corretor";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  documentacaoLinkPath,
  documentacaoLinkResumoSchema,
  mensagemConviteDocumentos,
  type DocumentacaoLinkResumo,
} from "@/lib/documentacao-link";

const QUERY_KEY = ["meu-documentacao-link"];

function resumoDe(data: unknown): DocumentacaoLinkResumo | null {
  return data == null ? null : documentacaoLinkResumoSchema.parse(data);
}

export function LinkDocumentosDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [confirmar, setConfirmar] = useState<"trocar" | "desativar" | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: nomeCorretor = null } = useNomeDoCorretor(user?.id);

  const linkQ = useQuery({
    queryKey: QUERY_KEY,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("meu_documentacao_link");
      if (error) throw error;
      return resumoDe(data);
    },
  });

  const acao = useMutation({
    mutationFn: async (qual: "criar" | "trocar" | "desativar") => {
      if (qual === "desativar") {
        const { error } = await supabase.rpc("desativar_meu_documentacao_link");
        if (error) throw error;
        return null;
      }
      const { data, error } = await supabase.rpc(
        qual === "criar" ? "criar_meu_documentacao_link" : "trocar_meu_documentacao_link",
      );
      if (error) throw error;
      return resumoDe(data);
    },
    onSuccess: (link, qual) => {
      qc.setQueryData(QUERY_KEY, link);
      if (qual === "trocar") toast.success("Link novo gerado. O antigo parou de funcionar.");
      if (qual === "desativar") toast.success("Link desativado.");
    },
    onError: () => toast.error("Não foi possível concluir agora. Tente novamente."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link de documentos</DialogTitle>
          <DialogDescription>
            Mande para o cliente: ele preenche os dados, responde o perfil de renda e envia os
            documentos pelo celular. O lead cai na sua carteira em Em atendimento, com a lista na
            aba Documentação — e vai sozinho para Análise de crédito no 3º documento.
          </DialogDescription>
        </DialogHeader>

        {linkQ.isPending ? (
          <Skeleton className="h-36 rounded-lg" />
        ) : linkQ.isError ? (
          <div className="space-y-3 rounded-lg border p-4 text-center text-sm">
            <p>Não foi possível carregar o seu link.</p>
            <Button size="sm" variant="outline" onClick={() => void linkQ.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : linkQ.data ? (
          <CartaoDoLink
            link={linkQ.data}
            nomeCorretor={nomeCorretor}
            onTrocar={() => setConfirmar("trocar")}
            onDesativar={() => setConfirmar("desativar")}
          />
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed p-4 text-center">
            <FolderSimple className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Você ainda não tem o link de documentos.
            </p>
            <Button onClick={() => acao.mutate("criar")} disabled={acao.isPending}>
              <LinkSimple className="mr-1.5 h-4 w-4" />
              {acao.isPending ? "Criando..." : "Criar meu link"}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Cliente que já está na sua carteira? Mande o link da pasta dele pela aba{" "}
          <span className="font-medium">Documentação</span> do lead.
        </p>

        <AlertDialog open={confirmar !== null} onOpenChange={(o) => !o && setConfirmar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmar === "trocar" ? "Gerar um link novo?" : "Desativar o link?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmar === "trocar"
                  ? "O link atual para de funcionar na hora. Quem já abriu a pasta continua enviando pelo link da pasta."
                  : "Ninguém mais consegue se cadastrar por este link. Quem já abriu a pasta continua enviando pelo link da pasta."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmar) acao.mutate(confirmar);
                  setConfirmar(null);
                }}
              >
                {confirmar === "trocar" ? "Gerar novo" : "Desativar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function CartaoDoLink({
  link,
  nomeCorretor,
  onTrocar,
  onDesativar,
}: {
  link: DocumentacaoLinkResumo;
  nomeCorretor: string | null;
  onTrocar: () => void;
  onDesativar: () => void;
}) {
  const url = `${window.location.origin}${documentacaoLinkPath(link.slug)}`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <LinkSimple className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          readOnly
          value={url}
          aria-label="Endereço do link de documentos"
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copiar()}>
          <Copy className="mr-1.5 h-4 w-4" /> Copiar
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensagemConviteDocumentos(url, nomeCorretor))}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <WhatsappLogo className="mr-1.5 h-4 w-4" /> WhatsApp
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
        <span>
          {link.total_cadastros === 0
            ? "Nenhum cliente abriu a pasta ainda."
            : `${link.total_cadastros} cliente${link.total_cadastros > 1 ? "s" : ""} pelo link.`}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={onTrocar}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-foreground"
          >
            <ArrowsClockwise className="h-3.5 w-3.5" /> Gerar novo
          </button>
          <button
            type="button"
            onClick={onDesativar}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-destructive"
          >
            <Prohibit className="h-3.5 w-3.5" /> Desativar
          </button>
        </span>
      </div>
    </div>
  );
}
