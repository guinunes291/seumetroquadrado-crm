import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { readLocalSession } from "@/lib/auth-fallback";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "gestor" | "corretor" | "superintendente";
export type AccountStatus = "pendente" | "ativa" | "bloqueada";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: AppRole[];
  rolesLoading: boolean;
  rolesError: Error | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Fonte única de sessão e papéis para toda a aplicação.
 *
 * Antes, cada chamada de useAuth/useUserRoles criava um listener Supabase e
 * repetia a consulta de user_roles. O provider mantém exatamente uma
 * assinatura por aba e limpa o cache ao trocar de usuário para impedir que
 * dados da sessão anterior apareçam durante o próximo carregamento.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let settled = false;

    const applySession = (next: Session | null) => {
      if (!active) return;
      settled = true;
      const nextUserId = next?.user.id ?? null;
      const previousUserId = currentUserId.current;

      if (previousUserId && previousUserId !== nextUserId) {
        queryClient.clear();
      }

      currentUserId.current = nextUserId;
      setSession(next);
      setLoading(false);
      void router.invalidate();
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next);
    });

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));

    // getSession/onAuthStateChange podem nunca responder quando o Navigator
    // LockManager fica preso (Safari/iOS após suspensão da aba) — sem este
    // teto, loading=true eterno congela o app inteiro em skeletons. Aplica a
    // sessão gravada no aparelho e segue; quando o lock destravar, o evento
    // real do supabase corrige o estado.
    const failSafe = window.setTimeout(() => {
      if (!settled) applySession(readLocalSession());
    }, 4000);

    return () => {
      active = false;
      window.clearTimeout(failSafe);
      subscription.subscription.unsubscribe();
    };
  }, [queryClient, router]);

  const user = session?.user ?? null;
  const rolesQuery = useQuery({
    queryKey: ["auth", "roles", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((row) => row.role as AppRole);
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      roles: rolesQuery.data ?? [],
      rolesLoading: !!user && rolesQuery.isPending,
      rolesError: rolesQuery.error instanceof Error ? rolesQuery.error : null,
    }),
    [loading, rolesQuery.data, rolesQuery.error, rolesQuery.isPending, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return value;
}

export function useAuth() {
  const { session, user, loading } = useAuthContext();
  return { session, user, loading };
}

export function useUserRoles() {
  const { roles, loading: authLoading, rolesLoading, rolesError } = useAuthContext();
  const has = (role: AppRole) => roles.includes(role);

  return {
    roles,
    loading: authLoading || rolesLoading,
    error: rolesError,
    isAdmin: has("admin"),
    isGestor: has("gestor"),
    isCorretor: has("corretor"),
    isSuperintendente: has("superintendente"),
    has,
  };
}
