// Porta de entrada de toda rota /academia.
//
// Três perguntas, nesta ordem, e cada uma tem um desfecho diferente:
//   1. a leitura falhou?  QueryErrorState, nunca tela em branco;
//   2. ainda carregando?  Skeleton, porque "não sei" não é "não pode";
//   3. flag desligada?    volta para o /inicio, como se a rota não existisse;
//   4. não participa?     mensagem amigável, NÃO é erro nem redirect.

import type { ReactNode } from "react";
import { redirect } from "@tanstack/react-router";
import { GraduationCap } from "@phosphor-icons/react";
import { useUserRoles } from "@/hooks/use-auth";
import { useAppFlag } from "@/hooks/use-app-flags";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useParticipacaoAcademia } from "./academia-client";

export function EsqueletoAcademia() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

export function AcademiaGuard({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useUserRoles();
  const flag = useAppFlag("academia_menu");
  const participacao = useParticipacaoAcademia();

  if (flag.erro) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível verificar se a Academia está liberada."
          error={flag.erro}
          onRetry={flag.recarregar}
        />
      </div>
    );
  }
  if (participacao.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar sua inscrição na Academia."
          error={participacao.error}
          onRetry={() => void participacao.refetch()}
        />
      </div>
    );
  }

  if (loading || flag.carregando || participacao.isPending) return <EsqueletoAcademia />;

  if (!flag.ligada) {
    throw redirect({ to: "/" });
  }

  if (participacao.data?.participa !== true) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={GraduationCap}
          title="Você ainda não está na Academia."
          description={
            isAdmin
              ? "Inscreva alguém (ou você) chamando academia_definir_participacao para a trilha aparecer aqui."
              : "Fale com seu gestor para entrar na trilha."
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
