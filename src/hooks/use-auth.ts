import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "gestor" | "corretor" | "superintendente";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // listener primeiro
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    // depois carrega sessão atual
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export function useUserRoles() {
  const { user, loading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setRoles([]);
      setRolesLoading(false);
      return;
    }
    setRolesLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setRoles((data ?? []).map((r) => r.role as AppRole));
        setRolesLoading(false);
      });
  }, [user, loading]);

  const has = (r: AppRole) => roles.includes(r);
  return {
    roles,
    loading: loading || rolesLoading,
    isAdmin: has("admin"),
    isGestor: has("gestor"),
    isCorretor: has("corretor"),
    isSuperintendente: has("superintendente"),
    has,
  };
}
