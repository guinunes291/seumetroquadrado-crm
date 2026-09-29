// Porta de entrada das rotas de GESTÃO da Academia (/academia/gestao,
// /academia/conteudo). Mesma ordem de perguntas do guard do aluno:
//   1. a leitura da flag falhou?  QueryErrorState, nunca tela em branco;
//   2. ainda carregando?          Skeleton;
//   3. pode gerir?                admin sempre; gestor e superintendente só
//                                 com academia_menu ligada. Não pode: volta
//                                 para o /inicio, como se a rota não existisse;
//   4. rota só de admin?          Conteúdo. Quem não é admin volta para a gestão.

import type { ReactNode } from "react";
import { redirect } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import { useAppFlag } from "@/hooks/use-app-flags";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { EsqueletoAcademia } from "../guard";
import { podeGerirAcademia } from "../use-flags-nav";

export function AcademiaGestaoGuard({
  somenteAdmin = false,
  children,
}: {
  somenteAdmin?: boolean;
  children: ReactNode;
}) {
  const { loading, isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const flag = useAppFlag("academia_menu");

  if (!isAdmin && flag.erro) {
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
  if (loading || (!isAdmin && flag.carregando)) return <EsqueletoAcademia />;

  if (!podeGerirAcademia({ isAdmin, isGestor, isSuperintendente, menuLigado: flag.ligada })) {
    throw redirect({ to: "/" });
  }
  if (somenteAdmin && !isAdmin) {
    throw redirect({ to: "/academia/gestao" });
  }
  return <>{children}</>;
}
