// Selo "Habilitado" da Academia em telas que já existiam (Pessoas e a lista
// de participantes da roleta). SÓ LEITURA: a Academia mostra o selo e não
// bloqueia nada (decisão do dono). Aparece só para quem pode gerir a Academia
// e só para quem está inscrito: sem inscrito, as telas ficam como eram.

import { useQuery } from "@tanstack/react-query";
import { SealCheck } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserRoles } from "@/hooks/use-auth";
import { useAppFlag } from "@/hooks/use-app-flags";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { supabase } from "@/integrations/supabase/client";
import type { AcademiaParticipanteRow } from "@/features/academia/tipos";
import { podeGerirAcademia } from "./use-flags-nav";

type Selo = Pick<
  AcademiaParticipanteRow,
  "corretor_id" | "participa" | "nivel" | "habilitado_override"
>;

function useSelos(habilitado: boolean) {
  return useQuery<Map<string, Selo>>({
    queryKey: ["academia", "selos"],
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabase
            .from("academia_participantes")
            .select("corretor_id, participa, nivel, habilitado_override")
            .eq("participa", true);
          if (error) throw error;
          return new Map(((data ?? []) as Selo[]).map((s) => [s.corretor_id, s]));
        },
        () => new Map<string, Selo>(),
      ),
  });
}

/** Habilitado = decisão manual quando existe; senão, passou de Iniciante. */
export function estaHabilitado(s: Pick<Selo, "nivel" | "habilitado_override">): boolean {
  return s.habilitado_override ?? s.nivel !== "iniciante";
}

export function SeloHabilitadoAcademia({ corretorId }: { corretorId: string }) {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const menu = useAppFlag("academia_menu");
  const pode = podeGerirAcademia({ isAdmin, isGestor, isSuperintendente, menuLigado: menu.ligada });
  const selos = useSelos(pode);
  const s = selos.data?.get(corretorId);
  if (!pode || !s) return null;
  const ok = estaHabilitado(s);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            ok
              ? "ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
              : "ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          }
        >
          <SealCheck className="h-3 w-3" />
          {ok ? "Habilitado" : "Em formação"}
        </span>
      </TooltipTrigger>
      <TooltipContent>Selo da Academia. Só informa: não bloqueia a roleta.</TooltipContent>
    </Tooltip>
  );
}
