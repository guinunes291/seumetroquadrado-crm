// Presença por filial — acesso a dados (RPCs da migration 20261013120000).
// Toda escrita passa por RPC: o banco aplica a regra do plantão e trava o
// UPDATE direto em profiles.presente.

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { supabasePendente } from "@/integrations/supabase/pendentes";
import { useAuth } from "@/hooks/use-auth";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import {
  AVISO_FORA_DO_REFORCO,
  motivoPresencaLabel,
  nomeDoMes,
  parseMinhaPresenca,
  rotuloLocal,
  type CheckinAtual,
  type CheckinDoDia,
  type FalhaLocalizacao,
  type MinhaPresenca,
  type PresencaHojeRow,
} from "./presenca-derive";

/** Prefixo de todas as queries de presença (a Central também invalida). */
export const PRESENCA_KEY = ["presenca"] as const;

const chaveMinha = (uid: string | undefined) => [...PRESENCA_KEY, "minha", uid] as const;

async function lerMinhaPresenca(): Promise<MinhaPresenca> {
  const { data, error } = await supabasePendente.rpc("presenca_minha_v1");
  if (error) throw error;
  return parseMinhaPresenca(data);
}

/** Intervalo da releitura enquanto algo na tela depende de uma ação de fora. */
export const RELEITURA_MS = 15_000;

/**
 * A minha presença de hoje. `releitura` (sim/não, ou decidido pelo dado lido):
 * relê a cada 15 s, quando a aba volta a ficar visível e quando a janela
 * ganha o foco — um check-in feito no celular, o "Confirmar no plantão" da
 * gestão ou o interruptor chegam sem o corretor recarregar a página. O
 * diálogo obrigatório relê enquanto está na tela; o card de /presenca e a
 * faixa do topo, enquanto mostram um check-in barrado pela localização.
 */
export function useMinhaPresenca(
  enabled = true,
  opts: { releitura?: boolean | ((p: MinhaPresenca | undefined) => boolean) } = {},
) {
  const { user } = useAuth();
  const { releitura } = opts;
  const relendo = (p: MinhaPresenca | undefined) =>
    typeof releitura === "function" ? releitura(p) : !!releitura;
  const q = useQuery({
    queryKey: chaveMinha(user?.id),
    enabled: enabled && !!user,
    // Sem releitura, a faixa do topo lê isto em toda tela: 1 min de folga
    // basta. A virada do dia (o reset das 00:00; não há auto-checkout às 23h)
    // chega pela releitura diária de useCheckinObrigatorio ou na próxima
    // invalidação (um check-in, o "Encerrar presença").
    staleTime: (query) => (relendo(query.state.data) ? 0 : 60_000),
    refetchInterval: (query) => (relendo(query.state.data) ? RELEITURA_MS : false),
    refetchOnWindowFocus: (query) => (relendo(query.state.data) ? "always" : false),
    queryFn: lerMinhaPresenca,
  });
  // O react-query só escuta "visibilitychange"; no computador, voltar do
  // celular para a janela do CRM costuma ser só "focus".
  const ouvirFoco = enabled && !!user && relendo(q.data);
  const { refetch } = q;
  useEffect(() => {
    if (!ouvirFoco) return;
    const reler = () => void refetch({ cancelRefetch: false });
    window.addEventListener("focus", reler);
    return () => window.removeEventListener("focus", reler);
  }, [ouvirFoco, refetch]);
  return q;
}

/**
 * Lê a presença de novo AGORA (sem cache): antes de qualquer check-in do
 * diálogo e do card, para nunca rebaixar um check-in que já liberou a roleta
 * (feito no celular, confirmado pela gestão ou liberado pelo interruptor).
 */
export function useBuscarPresencaFresca() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return () =>
    qc.fetchQuery({ queryKey: chaveMinha(user?.id), queryFn: lerMinhaPresenca, staleTime: 0 });
}

/** Este aparelho é um computador (sem tela de toque)? Na dúvida, não. */
export function ehComputador(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return !window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export type Localizacao = { lat: number; lng: number; precisao: number | null };

/** O que o celular respondeu: a posição, ou por que não veio. */
export type LeituraLocalizacao =
  ({ ok: true } & Localizacao) | { ok: false; falha: FalhaLocalizacao };

/** GeolocationPositionError.code → o que dizer ao corretor. */
export function falhaDoCodigo(code: number | undefined): FalhaLocalizacao {
  if (code === 1) return "negada";
  if (code === 2) return "indisponivel";
  return "tempo";
}

/**
 * Localização do celular para o check-in NA FILIAL (nunca em casa). Nunca
 * rejeita: sem posição, devolve o tipo de falha (permissão negada, GPS
 * indisponível, tempo esgotado, navegador sem suporte) só para a tela
 * explicar o que fazer. Para o banco não muda nada: sem coordenada, ele
 * registra "sem localização" (e barra, com a exigência ligada).
 */
export function obterLocalizacao(
  timeoutMs = 10_000,
  { maximumAge = 60_000 }: { maximumAge?: number } = {},
): Promise<LeituraLocalizacao> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, falha: "sem_suporte" });
  }
  return new Promise((resolve) => {
    let respondeu = false;
    const responder = (r: LeituraLocalizacao) => {
      if (respondeu) return;
      respondeu = true;
      clearTimeout(guarda);
      resolve(r);
    };
    // Alguns navegadores nunca chamam de volta (pedido de permissão esquecido
    // na tela): sem esta guarda, o botão ficaria girando para sempre.
    const guarda = setTimeout(() => responder({ ok: false, falha: "tempo" }), timeoutMs + 20_000);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          responder({
            ok: true,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precisao: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          }),
        (err) => responder({ ok: false, falha: falhaDoCodigo(err?.code) }),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge },
      );
    } catch {
      responder({ ok: false, falha: "sem_suporte" });
    }
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

/** O check-in gravado e, se faltou a localização, por quê (só a tela sabe). */
export type ResultadoCheckin = {
  presenca: MinhaPresenca;
  falhaLocalizacao: FalhaLocalizacao | null;
};

/** O texto que explica por que o check-in não liberou a roleta (null = liberou). */
export function motivoDoResultado(
  r: ResultadoCheckin,
  opts: { computador?: boolean } = {},
): string | null {
  const p = r.presenca;
  const c = p.checkin;
  if (!c || c.apto_roleta) return null;
  return motivoPresencaLabel(c.motivo, {
    ...p,
    mes: nomeDoMes(p.mes_referencia),
    filial_nome: c.filial_nome,
    distancia_m: c.distancia_m,
    precisao_m: c.precisao_m,
    falha_localizacao: r.falhaLocalizacao ?? c.falha_localizacao,
    computador: opts.computador,
  });
}

/**
 * O check-in que liberou a roleta chegou de fora do diálogo (o celular, a
 * gestão confirmando no plantão, o interruptor): o verde diz de onde.
 */
export function avisarNaRoletaDeFora(c: CheckinAtual) {
  if (c.modo === "liberado_gestao") {
    toast.success("Liberado pela gestão: você está na roleta hoje.");
  } else if (c.origem === "gestao") {
    toast.success(
      `Plantão confirmado pela gestão: ${rotuloLocal(c.modo, c.filial_nome)}. Você está na roleta hoje.`,
    );
  } else {
    toast.success(
      `Check-in feito: ${rotuloLocal(c.modo, c.filial_nome)}. Você está na roleta hoje.`,
    );
  }
}

function toastDoCheckin(r: ResultadoCheckin, avisarRecusa: boolean, barradoHoje: boolean) {
  const c = r.presenca.checkin;
  if (!c) return;
  const local = rotuloLocal(c.modo, c.filial_nome);
  // O verde "na roleta" só quando o banco liberou de verdade.
  if (c.apto_roleta) {
    toast.success(`Check-in feito: ${local}. Você está na roleta hoje.`, {
      // Barrado na filial e depois "Em casa" com a meta: a roleta volta, o
      // reforço não (decisão do dono 4).
      description: barradoHoje && c.modo === "casa" ? AVISO_FORA_DO_REFORCO : undefined,
    });
  } else if (avisarRecusa) {
    toast.warning(`Check-in registrado: ${local}. Você está fora da roleta.`, {
      description: motivoDoResultado(r) ?? undefined,
      duration: 10_000,
    });
  }
}

/** A falha de localização vai para o Sentry (diagnóstico de "todo mundo barrado"). */
function registrarFalhaLocalizacao(falha: FalhaLocalizacao) {
  void import("@/lib/error-tracking-browser")
    .then((m) =>
      m.captureClientError(new Error(`geolocalizacao:${falha}`), "presenca.checkin", true),
    )
    .catch(() => {
      /* sem rastreamento: o check-in segue igual */
    });
}

export type ArgsCheckin = {
  modo: "loja" | "casa";
  filial?: string;
  /** "Tentar de novo": lê a posição agora (sem reaproveitar a de até 1 min atrás). */
  novaLeitura?: boolean;
  /** Houve um check-in na filial barrado hoje (o verde avisa do reforço). */
  barradoHoje?: boolean;
};

/**
 * O check-in do próprio corretor. `avisarRecusa: false` para quem mostra o
 * motivo na própria tela (o diálogo obrigatório): o toast fica só para o
 * verde. `avisarErro: false` para quem mostra o erro na própria tela.
 */
export function useCheckin({
  avisarRecusa = true,
  avisarErro = true,
}: { avisarRecusa?: boolean; avisarErro?: boolean } = {}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidar = useInvalidarPresenca();
  return useMutation({
    mutationFn: async (args: ArgsCheckin): Promise<ResultadoCheckin> => {
      const leitura =
        args.modo === "loja"
          ? await obterLocalizacao(undefined, args.novaLeitura ? { maximumAge: 0 } : undefined)
          : null;
      const geo = leitura?.ok ? leitura : null;
      const falha = leitura && !leitura.ok ? leitura.falha : null;
      if (falha) registrarFalhaLocalizacao(falha);
      const base = {
        _modo: args.modo,
        _filial: args.filial,
        _latitude: geo?.lat,
        _longitude: geo?.lng,
        _precisao_m: geo?.precisao ?? undefined,
      };
      let { data, error } = await supabasePendente.rpc(
        "presenca_checkin",
        falha ? { ...base, _falha_localizacao: falha } : base,
      );
      // Banco sem a 0082 (sem o parâmetro novo): o mesmo check-in, sem o porquê.
      if (error && falha && isMissingBackendObject(error)) {
        ({ data, error } = await supabasePendente.rpc("presenca_checkin", base));
      }
      if (error) throw error;
      return { presenca: parseMinhaPresenca(data), falhaLocalizacao: falha };
    },
    onSuccess: (r, args) => {
      // A RPC não devolve as filiais — preserva as que já estavam no cache.
      qc.setQueryData<MinhaPresenca>(chaveMinha(user?.id), (antes) => ({
        ...r.presenca,
        filiais: antes?.filiais ?? r.presenca.filiais,
      }));
      invalidar();
      toastDoCheckin(r, avisarRecusa, !!args.barradoHoje);
    },
    onError: (e: Error) => {
      if (avisarErro) toast.error(`Não foi possível fazer o check-in: ${e.message}`);
    },
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
      const { data, error } = await supabasePendente.rpc("presenca_hoje_v1");
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
      const { error } = await supabasePendente.rpc("presenca_checkin", {
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

const fmtDiaSaoPaulo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoje em São Paulo (YYYY-MM-DD), o mesmo `dia` que o banco grava. */
export function diaSaoPauloHoje(): string {
  return fmtDiaSaoPaulo.format(new Date());
}

/**
 * Os check-ins de hoje (todos, para a gestão; os do próprio corretor, pela
 * RLS e pelo filtro). Serve só para o sinal "fora do reforço hoje" de quem a
 * localização barrou e trocou para "Em casa" — presenca_hoje_v1 e
 * presenca_minha_v1 trazem só o último check-in.
 */
export function useCheckinsDoDia(
  enabled: boolean,
  { dia, corretorId }: { dia: string; corretorId?: string },
) {
  return useQuery({
    queryKey: [...PRESENCA_KEY, "checkins-dia", dia, corretorId ?? "todos"],
    enabled: enabled && !!dia,
    staleTime: 30_000,
    refetchInterval: corretorId ? false : 60_000,
    queryFn: async (): Promise<CheckinDoDia[]> => {
      let q = supabase
        .from("presenca_checkins")
        .select("corretor_id, modo, apto_roleta, motivo, created_at")
        .eq("dia", dia);
      if (corretorId) q = q.eq("corretor_id", corretorId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
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
      const { data, error } = await supabasePendente
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
      const { data, error } = await supabasePendente
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
