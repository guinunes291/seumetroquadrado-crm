// Presença por filial — acesso a dados (RPCs da migration 20261013120000).
// Toda escrita passa por RPC: o banco aplica a regra do plantão e trava o
// UPDATE direto em profiles.presente.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  motivoPresencaLabel,
  nomeDoMes,
  parseMinhaPresenca,
  rotuloLocal,
  type MinhaPresenca,
  type PresencaHojeRow,
} from "./presenca-derive";

/** Prefixo de todas as queries de presença (a Central também invalida). */
export const PRESENCA_KEY = ["presenca"] as const;

export function useMinhaPresenca(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PRESENCA_KEY, "minha", user?.id],
    enabled: enabled && !!user,
    // A faixa do topo lê isto em toda tela: 1 min de folga basta, e a virada
    // do dia (auto-checkout das 23h) aparece no próximo foco da janela.
    staleTime: 60_000,
    queryFn: async (): Promise<MinhaPresenca> => {
      const { data, error } = await supabase.rpc("presenca_minha_v1");
      if (error) throw error;
      return parseMinhaPresenca(data);
    },
  });
}

export type Localizacao = { lat: number; lng: number; precisao: number | null };

/**
 * Localização do celular para o check-in NA FILIAL (nunca em casa). Melhor
 * esforço: negou, não tem GPS ou demorou → null, e o banco registra "sem
 * localização" (só bloqueia se a gestão ligar a exigência).
 */
export function obterLocalizacao(timeoutMs = 10_000): Promise<Localizacao | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

function useInvalidarPresenca() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...PRESENCA_KEY] });
    // "Minhas roletas" (Meu Perfil) e a Central mostram a mesma presença.
    qc.invalidateQueries({ queryKey: ["distribuicao:minha-elegibilidade"] });
    qc.invalidateQueries({ queryKey: ["distribuicao:corretores"] });
  };
}

function toastDoCheckin(p: MinhaPresenca) {
  const c = p.checkin;
  if (!c) return;
  const local = rotuloLocal(c.modo, c.filial_nome);
  if (c.apto_roleta) {
    toast.success(`Check-in feito: ${local}. Você está na roleta hoje.`);
  } else {
    toast.warning(`Check-in registrado: ${local}. Você está fora da roleta.`, {
      description:
        motivoPresencaLabel(c.motivo, { ...p, mes: nomeDoMes(p.mes_referencia) }) ?? undefined,
      duration: 10_000,
    });
  }
}

export function useCheckin() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidar = useInvalidarPresenca();
  return useMutation({
    mutationFn: async (args: { modo: "loja" | "casa"; filial?: string }) => {
      const geo = args.modo === "loja" ? await obterLocalizacao() : null;
      const { data, error } = await supabase.rpc("presenca_checkin", {
        _modo: args.modo,
        _filial: args.filial,
        _latitude: geo?.lat,
        _longitude: geo?.lng,
        _precisao_m: geo?.precisao ?? undefined,
      });
      if (error) throw error;
      return parseMinhaPresenca(data);
    },
    onSuccess: (status) => {
      // A RPC não devolve as filiais — preserva as que já estavam no cache.
      qc.setQueryData<MinhaPresenca>([...PRESENCA_KEY, "minha", user?.id], (antes) => ({
        ...status,
        filiais: antes?.filiais ?? status.filiais,
      }));
      invalidar();
      toastDoCheckin(status);
    },
    onError: (e: Error) => toast.error(`Não foi possível fazer o check-in: ${e.message}`),
  });
}

/** "Sair": encerra a presença e tira da roleta (marcar_presenca(false)). */
export function useEncerrarPresenca() {
  const invalidar = useInvalidarPresenca();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("marcar_presenca", { _presente: false });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Presença encerrada. Você saiu da roleta até o próximo check-in.");
    },
    onError: (e: Error) => toast.error(`Não foi possível encerrar: ${e.message}`),
  });
}

// ---------------------------------------------------------------------------
// Gestão
// ---------------------------------------------------------------------------

export function usePresencaHoje(enabled: boolean) {
  return useQuery({
    queryKey: [...PRESENCA_KEY, "hoje"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PresencaHojeRow[]> => {
      const { data, error } = await supabase.rpc("presenca_hoje_v1");
      if (error) throw error;
      return (data ?? []) as PresencaHojeRow[];
    },
  });
}

/** A gestão faz o check-in do corretor numa filial (vale como confirmado). */
export function useCheckinPelaGestao() {
  const invalidar = useInvalidarPresenca();
  return useMutation({
    mutationFn: async (args: { corretorId: string; filial: string; nome: string }) => {
      const { error } = await supabase.rpc("presenca_checkin", {
        _modo: "loja",
        _filial: args.filial,
        _corretor_id: args.corretorId,
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      invalidar();
      toast.success(`${args.nome}: check-in confirmado pela gestão.`);
    },
    onError: (e: Error) => toast.error(`Falha no check-in: ${e.message}`),
  });
}

export type FilialRow = {
  id: string;
  slug: string;
  nome: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_metros: number;
  ativa: boolean;
  ordem: number;
};

export function useFiliais(enabled = true) {
  return useQuery({
    queryKey: [...PRESENCA_KEY, "filiais"],
    enabled,
    queryFn: async (): Promise<FilialRow[]> => {
      const { data, error } = await supabase
        .from("filiais")
        .select("id, slug, nome, endereco, latitude, longitude, raio_metros, ativa, ordem")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarFilial() {
  const invalidar = useInvalidarPresenca();
  return useMutation({
    mutationFn: async (f: Pick<FilialRow, "id"> & Partial<Omit<FilialRow, "id" | "slug">>) => {
      const { id, ...campos } = f;
      const { data, error } = await supabase
        .from("filiais")
        .update(campos)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      // RLS barra sem erro: 0 linhas = sem permissão.
      if (!data?.length) throw new Error("sem permissão para alterar filiais");
    },
    onSuccess: () => {
      invalidar();
      toast.success("Filial atualizada.");
    },
    onError: (e: Error) => toast.error(`Falha ao salvar a filial: ${e.message}`),
  });
}
