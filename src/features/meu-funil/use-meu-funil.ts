// Dados do Meu Funil (página + estudo diário obrigatório).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseMeuFunil as db } from "@/integrations/supabase/meu-funil-pendente";
import { useAuth } from "@/hooks/use-auth";
import {
  normalizarMeuFunil,
  type EstudoDia,
  type FocoChave,
  type MeuFunilRpc,
} from "@/features/meu-funil/meu-funil";

export const MEU_FUNIL_KEY = "meu-funil";

/** Coorte do próprio corretor + régua do time (RPC auto-escopada). */
export function useMeuFunil(dias: number, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [MEU_FUNIL_KEY, "estudo", user?.id, dias],
    enabled: !!user && enabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<MeuFunilRpc | null> => {
      const { data, error } = await db.rpc("meu_funil_estudo", { _dias: dias });
      if (error) throw error;
      return normalizarMeuFunil(data);
    },
  });
}

/** Registro de HOJE (null = ainda não estudou → estudo obrigatório). */
export function useEstudoDeHoje(dia: string, enabled = true) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [MEU_FUNIL_KEY, "hoje", uid, dia],
    enabled: !!uid && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EstudoDia | null> => {
      const { data, error } = await db
        .from("funil_estudo_diario")
        .select("dia, foco, compromisso, segundos_na_tela, concluido_em")
        .eq("corretor_id", uid!)
        .eq("dia", dia)
        .maybeSingle();
      if (error) throw error;
      return (data as EstudoDia | null) ?? null;
    },
  });
}

export type RegistrarEstudoInput = {
  dia: string;
  foco: FocoChave;
  compromisso: string;
  segundos: number;
};

/** Upsert do estudo do dia (uma linha por corretor por dia). */
export function useRegistrarEstudo() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarEstudoInput) => {
      if (!user) throw new Error("Sessão expirada. Entre novamente.");
      const compromisso = input.compromisso.trim().slice(0, 500) || null;
      const { error } = await db.from("funil_estudo_diario").upsert(
        {
          corretor_id: user.id,
          dia: input.dia,
          foco: input.foco,
          compromisso,
          segundos_na_tela: Math.max(0, Math.round(input.segundos)),
          concluido_em: new Date().toISOString(),
        },
        { onConflict: "corretor_id,dia" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [MEU_FUNIL_KEY, "hoje"] });
    },
  });
}
