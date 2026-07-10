import type { ReactNode } from "react";
import { redirect } from "@tanstack/react-router";
import { useUserRoles, type AppRole } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  allow: AppRole[];
  children: ReactNode;
  /** Para onde mandar quem não tem papel (default "/"). */
  redirectTo?: string;
};

/**
 * Guarda de papel real (não cosmética): enquanto os papéis carregam mostra um
 * skeleton (evita o flash de conteúdo/negação), e quem não tem papel permitido
 * é REDIRECIONADO — em vez de ver um painel vazio. A proteção de dados continua
 * sendo a RLS no banco; isto barra o acesso à UI e evita vazar a estrutura.
 */
export function RequireRole({ allow, children, redirectTo = "/" }: Props) {
  const { roles, loading } = useUserRoles();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const permitido = roles.some((r) => allow.includes(r));
  if (!permitido) {
    throw redirect({ to: redirectTo });
  }

  return <>{children}</>;
}
