// Camada de dados da Academia. Usa o `supabase` do app com os tipos gerados
// (types.ts); onde o banco guarda texto fechado por CHECK ou jsonb, o
// resultado é estreitado aqui, uma vez, para os tipos de ./tipos.
//
// Degradação controlada: a migration da Academia pode não estar aplicada no
// ambiente vivo. Toda leitura e toda RPC passam por rpcWithFallback, que
// devolve o caminho vazio quando o objeto não existe, em vez de quebrar a
// tela. Qualquer OUTRO erro sobe e vira QueryErrorState.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { supabase } from "@/integrations/supabase/client";
import type {
  AcademiaAtribuicaoRow,
  AcademiaAulaRow,
  AcademiaCertificadoRow,
  AcademiaCorretorResumoRow,
  AcademiaFaseRow,
  AcademiaFaseStatusRow,
  AcademiaModuloRow,
  AcademiaModuloStatusRow,
  AcademiaNivelHistoricoRow,
  AcademiaParticipanteRow,
  AcademiaPraticaRow,
  AcademiaQuizEnviarRetorno,
  AcademiaQuizIniciarRetorno,
} from "@/features/academia/tipos";

export const ACADEMIA_KEY = {
  raiz: ["academia"] as const,
  participacao: (uid: string | null) => ["academia", "participacao", uid] as const,
  trilha: (uid: string | null) => ["academia", "trilha", uid] as const,
  modulo: (codigo: string) => ["academia", "modulo", codigo] as const,
  aulas: (moduloId: string | null) => ["academia", "aulas", moduloId] as const,
  progresso: (uid: string | null) => ["academia", "progresso", uid] as const,
};

function idDoUsuario(uid: string | undefined): string | null {
  return uid ?? null;
}

// ---------------------------------------------------------------------------
// Participação
// ---------------------------------------------------------------------------

/** `null` = não participa (ou a migration ainda não existe neste banco). */
export function useParticipacaoAcademia() {
  const { user, loading } = useAuth();
  const uid = idDoUsuario(user?.id);
  return useQuery<AcademiaParticipanteRow | null>({
    queryKey: ACADEMIA_KEY.participacao(uid),
    enabled: !loading && uid !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabase
            .from("academia_participantes")
            .select("*")
            .eq("corretor_id", uid as string)
            .maybeSingle();
          if (error) throw error;
          return data ?? null;
        },
        () => null,
      ),
  });
}

/** Atalho: participa E está com a participação ativa. */
export function useEhParticipante(): { participa: boolean; carregando: boolean } {
  const q = useParticipacaoAcademia();
  return { participa: q.data?.participa === true, carregando: q.isPending };
}

// ---------------------------------------------------------------------------
// Trilha
// ---------------------------------------------------------------------------

export type DadosTrilha = {
  resumo: AcademiaCorretorResumoRow | null;
  fases: AcademiaFaseRow[];
  faseStatus: AcademiaFaseStatusRow[];
  modulos: AcademiaModuloStatusRow[];
  atribuicoes: Array<AcademiaAtribuicaoRow & { codigo: string | null; titulo: string | null }>;
};

export function useTrilha() {
  const { user, loading } = useAuth();
  const uid = idDoUsuario(user?.id);
  return useQuery<DadosTrilha>({
    queryKey: ACADEMIA_KEY.trilha(uid),
    enabled: !loading && uid !== null,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const [resumo, fases, faseStatus, modulos, atribuicoes] = await Promise.all([
            supabase
              .from("v_academia_corretor_resumo")
              .select("*")
              .eq("corretor_id", uid as string)
              .maybeSingle(),
            supabase.from("academia_fases").select("*").order("numero"),
            supabase
              .from("v_academia_fase_status")
              .select("*")
              .eq("corretor_id", uid as string),
            supabase
              .from("v_academia_modulo_status")
              .select("*")
              .eq("corretor_id", uid as string),
            supabase
              .from("academia_atribuicoes")
              .select("*")
              .eq("corretor_id", uid as string)
              .is("concluida_em", null)
              .is("cancelada_em", null),
          ]);
          for (const r of [resumo, fases, faseStatus, modulos, atribuicoes]) {
            if (r.error) throw r.error;
          }
          const mods = (modulos.data ?? []) as AcademiaModuloStatusRow[];
          const porId = new Map(mods.map((m) => [m.modulo_id, m]));
          return {
            resumo: (resumo.data ?? null) as AcademiaCorretorResumoRow | null,
            fases: (fases.data ?? []) as AcademiaFaseRow[],
            faseStatus: (faseStatus.data ?? []) as AcademiaFaseStatusRow[],
            modulos: mods,
            atribuicoes: ((atribuicoes.data ?? []) as AcademiaAtribuicaoRow[]).map((a) => ({
              ...a,
              codigo: porId.get(a.modulo_id)?.codigo ?? null,
              titulo: porId.get(a.modulo_id)?.titulo ?? null,
            })),
          };
        },
        () => ({ resumo: null, fases: [], faseStatus: [], modulos: [], atribuicoes: [] }),
      ),
  });
}

// ---------------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------------

export type DadosModulo = {
  modulo: AcademiaModuloRow | null;
  status: AcademiaModuloStatusRow | null;
  aulas: AcademiaAulaRow[];
  aulasFeitas: Set<string>;
  praticas: AcademiaPraticaRow[];
};

export function useModulo(codigo: string) {
  const { user, loading } = useAuth();
  const uid = idDoUsuario(user?.id);
  return useQuery<DadosModulo>({
    queryKey: [...ACADEMIA_KEY.modulo(codigo), uid],
    enabled: !loading && uid !== null && codigo.length > 0,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const vazio: DadosModulo = {
            modulo: null,
            status: null,
            aulas: [],
            aulasFeitas: new Set<string>(),
            praticas: [],
          };
          const { data: modulo, error: erroModulo } = await supabase
            .from("academia_modulos")
            .select("*")
            .eq("codigo", codigo)
            .maybeSingle();
          if (erroModulo) throw erroModulo;
          if (!modulo) return vazio;

          const [aulas, status, progresso, praticas] = await Promise.all([
            supabase.from("academia_aulas").select("*").eq("modulo_id", modulo.id).order("ordem"),
            supabase
              .from("v_academia_modulo_status")
              .select("*")
              .eq("corretor_id", uid as string)
              .eq("modulo_id", modulo.id)
              .maybeSingle(),
            supabase
              .from("academia_progresso_aulas")
              .select("aula_id")
              .eq("corretor_id", uid as string),
            supabase
              .from("academia_praticas")
              .select("*")
              .eq("corretor_id", uid as string)
              .eq("modulo_id", modulo.id)
              .order("enviado_em", { ascending: false }),
          ]);
          for (const r of [aulas, status, progresso, praticas]) {
            if (r.error) throw r.error;
          }
          return {
            modulo: modulo as AcademiaModuloRow,
            status: (status.data ?? null) as AcademiaModuloStatusRow | null,
            aulas: (aulas.data ?? []) as AcademiaAulaRow[],
            aulasFeitas: new Set(
              ((progresso.data ?? []) as Array<{ aula_id: string }>).map((p) => p.aula_id),
            ),
            praticas: (praticas.data ?? []) as AcademiaPraticaRow[],
          };
        },
        () => ({
          modulo: null,
          status: null,
          aulas: [],
          aulasFeitas: new Set<string>(),
          praticas: [],
        }),
      ),
  });
}

// ---------------------------------------------------------------------------
// Progresso (certificados e histórico)
// ---------------------------------------------------------------------------

export type DadosProgresso = {
  certificados: AcademiaCertificadoRow[];
  historico: AcademiaNivelHistoricoRow[];
};

export function useProgresso() {
  const { user, loading } = useAuth();
  const uid = idDoUsuario(user?.id);
  return useQuery<DadosProgresso>({
    queryKey: ACADEMIA_KEY.progresso(uid),
    enabled: !loading && uid !== null,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const [certificados, historico] = await Promise.all([
            supabase
              .from("academia_certificados")
              .select("*")
              .eq("corretor_id", uid as string)
              .order("emitido_em", { ascending: false }),
            supabase
              .from("academia_niveis_historico")
              .select("*")
              .eq("corretor_id", uid as string)
              .order("em", { ascending: false }),
          ]);
          for (const r of [certificados, historico]) if (r.error) throw r.error;
          return {
            certificados: (certificados.data ?? []) as AcademiaCertificadoRow[],
            historico: (historico.data ?? []) as AcademiaNivelHistoricoRow[],
          };
        },
        () => ({ certificados: [], historico: [] }),
      ),
  });
}

// ---------------------------------------------------------------------------
// Mutações
// ---------------------------------------------------------------------------

function useInvalidarAcademia() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ACADEMIA_KEY.raiz });
}

export function useMarcarAula(codigo: string) {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async ({ aulaId, concluida }: { aulaId: string; concluida: boolean }) => {
      const { error } = await supabase.rpc("academia_marcar_aula", {
        _aula: aulaId,
        _concluida: concluida,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
    meta: { codigo },
  });
}

export function useEnviarPratica(codigo: string) {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async ({
      moduloId,
      texto,
      url,
    }: {
      moduloId: string;
      texto: string;
      url: string;
    }) => {
      const { data, error } = await supabase.rpc("academia_pratica_enviar", {
        _modulo: moduloId,
        _texto: texto,
        _url: url.trim() === "" ? undefined : url.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    meta: { codigo },
  });
}

export function useIniciarQuiz() {
  return useMutation({
    mutationFn: async (moduloId: string): Promise<AcademiaQuizIniciarRetorno> => {
      const { data, error } = await supabase.rpc("academia_quiz_iniciar", {
        _modulo: moduloId,
      });
      if (error) throw error;
      // jsonb montado pela função: o gerador tipa como Json, o formato é este.
      return data as AcademiaQuizIniciarRetorno;
    },
  });
}

export function useEnviarQuiz() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async ({
      tentativaId,
      respostas,
    }: {
      tentativaId: string;
      respostas: Record<string, number>;
    }): Promise<AcademiaQuizEnviarRetorno> => {
      const { data, error } = await supabase.rpc("academia_quiz_enviar", {
        _tentativa: tentativaId,
        _respostas: respostas,
      });
      if (error) throw error;
      // jsonb montado pela função: o gerador tipa como Json, o formato é este.
      return data as AcademiaQuizEnviarRetorno;
    },
    onSuccess: invalidar,
  });
}
