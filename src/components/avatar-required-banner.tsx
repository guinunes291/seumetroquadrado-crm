import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

/**
 * Aviso persistente: enquanto o corretor não tiver foto de perfil, aparece um
 * banner em todas as páginas com atalho para "Meu perfil". Some sozinho assim
 * que a foto é enviada.
 */
export function AvatarRequiredBanner() {
  const { user } = useAuth();
  const location = useLocation();

  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["avatar-obrigatorio", user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url, foto_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const temFoto = !!(data?.avatar_url || data?.foto_url);
  if (!user || !data || temFoto) return null;
  if (location.pathname.startsWith("/meu-perfil")) return null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <Camera className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span>
          <strong>Foto de perfil obrigatória.</strong> Atualize sua foto no sistema para continuar
          aparecendo no ranking e na vitrine.
        </span>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/meu-perfil">Atualizar agora</Link>
      </Button>
    </div>
  );
}
