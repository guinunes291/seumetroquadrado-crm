// Disparo da base do corretor — leitura pelo RLS do próprio corretor.
// Escrita só por RPC (disparo_base_criar) e pela server function de
// importação (src/lib/disparo-base.functions.ts).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { funilDoDisparo, type StatusItem } from "./importacao";

export const DISPARO_BASE_KEY = {
  piloto: (uid: string | null) => ["disparo-base", "piloto", uid] as const,
  lista: (uid: string | null) => ["disparo-base", "lista", uid] as const,
};

/** Está no piloto? Enquanto carrega, false: o menu aparecer depois é melhor
 *  que aparecer e sumir. */
export function usePilotoDisparoBase(): { piloto: boolean; carregando: boolean } {
  const { user, loading } = useAuth();
  const uid = user?.id ?? null;
  const q = useQuery({
    queryKey: DISPARO_BASE_KEY.piloto(uid),
    enabled: !loading && uid !== null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("disparo_base_e_piloto", {
        _corretor: uid as string,
      });
      if (error) throw error;
      return data === true;
    },
  });
  return { piloto: q.data === true, carregando: q.isPending };
}

export type DisparoResumo = {
  id: string;
  nome: string;
  status: string;
  criadoEm: string;
  total: number;
  funil: Record<StatusItem, number>;
};

export function useMeusDisparos() {
  const { user, loading } = useAuth();
  const uid = user?.id ?? null;
  return useQuery<DisparoResumo[]>({
    queryKey: DISPARO_BASE_KEY.lista(uid),
    enabled: !loading && uid !== null,
    queryFn: async () => {
      const { data: disparos, error } = await supabase
        .from("disparos_base")
        .select("id, nome, status, criado_em")
        .eq("corretor_id", uid as string)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!disparos?.length) return [];
      const { data: itens, error: e2 } = await supabase
        .from("disparos_base_itens")
        .select("disparo_id, status")
        .in(
          "disparo_id",
          disparos.map((d) => d.id),
        )
        .limit(20000);
      if (e2) throw e2;
      return disparos.map((d) => {
        const st = (itens ?? []).filter((i) => i.disparo_id === d.id).map((i) => i.status);
        return {
          id: d.id,
          nome: d.nome,
          status: d.status,
          criadoEm: d.criado_em,
          total: st.length,
          funil: funilDoDisparo(st),
        };
      });
    },
  });
}

export async function criarDisparoBase(
  nome: string,
  declarouBasePropria: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc("disparo_base_criar", {
    _nome: nome,
    _declarou_base_propria: declarouBasePropria,
  });
  if (error) throw new Error(error.message);
  return data;
}
