// Camada de dados da GESTÃO da Academia (hub /academia/gestao, Conteúdo e
// certificado). Mesmo contrato de academia-client.ts: toda leitura passa por
// rpcWithFallback, então objeto que ainda não existe no banco (a migration da
// gestão pode não ter rodado) vira tela vazia, e qualquer OUTRO erro sobe
// para o QueryErrorState da tela.
//
// Quem vê o quê é decidido pela RLS, não aqui: gestor lê a própria equipe,
// admin lê tudo. A gestão nunca mostra a própria pessoa como "equipe": as
// RPCs recusam agir sobre si mesmo, então a tela nem oferece.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import {
  supabaseAcademia,
  type AcademiaAtribuicaoRow,
  type AcademiaAulaRow,
  type AcademiaCandidatoRow,
  type AcademiaCertificadoRow,
  type AcademiaConfigRow,
  type AcademiaCorretorResumoRow,
  type AcademiaEfeitoRow,
  type AcademiaEncontroRow,
  type AcademiaFaseRow,
  type AcademiaFaseStatusRow,
  type AcademiaGateSombraRow,
  type AcademiaModuloRow,
  type AcademiaModuloStatusRow,
  type AcademiaMotorRetorno,
  type AcademiaNivelHistoricoRow,
  type AcademiaPraticaRow,
  type AcademiaPresencaRow,
  type AcademiaQuestaoRow,
  type AcademiaRecomendacaoRow,
  type AcademiaRegraRecomendacaoRow,
  type AcademiaStatusPratica,
  type AcademiaTipoEncontro,
} from "@/integrations/supabase/academia-pendente";
import { ACADEMIA_KEY } from "../academia-client";
import type { Json } from "@/integrations/supabase/types";

const G = ["academia", "gestao"] as const;

export const GESTAO_KEY = {
  equipe: [...G, "equipe"] as const,
  praticas: [...G, "praticas"] as const,
  atribuicoes: [...G, "atribuicoes"] as const,
  gate: [...G, "gate"] as const,
  modulos: [...G, "modulos"] as const,
  ficha: (id: string) => [...G, "ficha", id] as const,
  candidatos: [...G, "candidatos"] as const,
  recomendacoes: [...G, "recomendacoes"] as const,
  efeito: [...G, "efeito"] as const,
  encontros: [...G, "encontros"] as const,
  conteudo: [...G, "conteudo"] as const,
  conteudoModulo: (codigo: string) => [...G, "conteudo", codigo] as const,
  certificado: (codigo: string) => ["academia", "certificado", codigo] as const,
};

/** Módulo resumido para seletores (atribuir, roleplay, encontro). */
export type ModuloResumo = Pick<
  AcademiaModuloRow,
  | "id"
  | "codigo"
  | "titulo"
  | "fase"
  | "numero"
  | "status"
  | "exige_pratica"
  | "pratica_rubrica"
  | "pratica_descricao"
>;

const CAMPOS_MODULO_RESUMO =
  "id, codigo, titulo, fase, numero, status, exige_pratica, pratica_rubrica, pratica_descricao";

function useUid(): { uid: string | null; pronto: boolean } {
  const { user, loading } = useAuth();
  return { uid: user?.id ?? null, pronto: !loading && !!user?.id };
}

function useInvalidarAcademia() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ACADEMIA_KEY.raiz });
}

// ---------------------------------------------------------------------------
// Equipe (Agora e Time)
// ---------------------------------------------------------------------------

export type DadosEquipe = {
  /** Participantes ativos que a pessoa pode gerir (sem ela mesma). */
  corretores: AcademiaCorretorResumoRow[];
  fases: AcademiaFaseRow[];
  faseStatus: AcademiaFaseStatusRow[];
};

export function useEquipeAcademia() {
  const { uid, pronto } = useUid();
  return useQuery<DadosEquipe>({
    queryKey: GESTAO_KEY.equipe,
    enabled: pronto,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const [resumo, fases, faseStatus] = await Promise.all([
            supabaseAcademia.from("v_academia_corretor_resumo").select("*"),
            supabaseAcademia.from("academia_fases").select("*").order("numero"),
            supabaseAcademia.from("v_academia_fase_status").select("*"),
          ]);
          for (const r of [resumo, fases, faseStatus]) if (r.error) throw r.error;
          const corretores = ((resumo.data ?? []) as AcademiaCorretorResumoRow[])
            .filter((r) => r.participa && r.corretor_id !== uid)
            .sort((a, b) => a.corretor_nome.localeCompare(b.corretor_nome, "pt-BR"));
          return {
            corretores,
            fases: (fases.data ?? []) as AcademiaFaseRow[],
            faseStatus: (faseStatus.data ?? []) as AcademiaFaseStatusRow[],
          };
        },
        () => ({ corretores: [], fases: [], faseStatus: [] }),
      ),
  });
}

/** Módulos que a pessoa enxerga (gestor: publicados; admin: todos). */
export function useModulosAcademia() {
  const { pronto } = useUid();
  return useQuery<ModuloResumo[]>({
    queryKey: GESTAO_KEY.modulos,
    enabled: pronto,
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia
            .from("academia_modulos")
            .select(CAMPOS_MODULO_RESUMO)
            .order("fase")
            .order("numero");
          if (error) throw error;
          return (data ?? []) as ModuloResumo[];
        },
        () => [],
      ),
  });
}

export type PraticaPendente = AcademiaPraticaRow & { modulo: ModuloResumo | null };

export function usePraticasPendentes() {
  const { uid, pronto } = useUid();
  return useQuery<PraticaPendente[]>({
    queryKey: GESTAO_KEY.praticas,
    enabled: pronto,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia
            .from("academia_praticas")
            .select("*")
            .eq("status", "pendente")
            .order("enviado_em", { ascending: true });
          if (error) throw error;
          const praticas = ((data ?? []) as AcademiaPraticaRow[]).filter(
            (p) => p.corretor_id !== uid,
          );
          const ids = [...new Set(praticas.map((p) => p.modulo_id))];
          const mods = ids.length
            ? await supabaseAcademia
                .from("academia_modulos")
                .select(CAMPOS_MODULO_RESUMO)
                .in("id", ids)
            : { data: [], error: null };
          if (mods.error) throw mods.error;
          const porId = new Map(((mods.data ?? []) as ModuloResumo[]).map((m) => [m.id, m]));
          return praticas.map((p) => ({ ...p, modulo: porId.get(p.modulo_id) ?? null }));
        },
        () => [],
      ),
  });
}

export function useAtribuicoesAbertas() {
  const { uid, pronto } = useUid();
  return useQuery<AcademiaAtribuicaoRow[]>({
    queryKey: GESTAO_KEY.atribuicoes,
    enabled: pronto,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia
            .from("academia_atribuicoes")
            .select("*")
            .is("concluida_em", null)
            .is("cancelada_em", null)
            .order("prazo", { ascending: true, nullsFirst: false });
          if (error) throw error;
          return ((data ?? []) as AcademiaAtribuicaoRow[]).filter((a) => a.corretor_id !== uid);
        },
        () => [],
      ),
  });
}

/** Gate em sombra: só leitura, nunca bloqueia. `null` = migration ausente. */
export function useGateSombra() {
  const { pronto } = useUid();
  return useQuery<AcademiaGateSombraRow[] | null>({
    queryKey: GESTAO_KEY.gate,
    enabled: pronto,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia.rpc("academia_gate_sombra");
          if (error) throw error;
          return (data ?? []) as AcademiaGateSombraRow[];
        },
        () => null,
      ),
  });
}

// ---------------------------------------------------------------------------
// Ficha do corretor na Academia
// ---------------------------------------------------------------------------

export type DadosFicha = {
  resumo: AcademiaCorretorResumoRow | null;
  modulos: AcademiaModuloStatusRow[];
  atribuicoes: AcademiaAtribuicaoRow[];
  praticas: AcademiaPraticaRow[];
  historico: AcademiaNivelHistoricoRow[];
  certificados: AcademiaCertificadoRow[];
};

export function useFichaCorretor(corretorId: string) {
  const { pronto } = useUid();
  return useQuery<DadosFicha>({
    queryKey: GESTAO_KEY.ficha(corretorId),
    enabled: pronto && corretorId.length > 0,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const [resumo, modulos, atribuicoes, praticas, historico, certificados] =
            await Promise.all([
              supabaseAcademia
                .from("v_academia_corretor_resumo")
                .select("*")
                .eq("corretor_id", corretorId)
                .maybeSingle(),
              supabaseAcademia
                .from("v_academia_modulo_status")
                .select("*")
                .eq("corretor_id", corretorId)
                .order("fase")
                .order("numero"),
              supabaseAcademia
                .from("academia_atribuicoes")
                .select("*")
                .eq("corretor_id", corretorId)
                .order("criado_em", { ascending: false }),
              supabaseAcademia
                .from("academia_praticas")
                .select("*")
                .eq("corretor_id", corretorId)
                .order("enviado_em", { ascending: false }),
              supabaseAcademia
                .from("academia_niveis_historico")
                .select("*")
                .eq("corretor_id", corretorId)
                .order("em", { ascending: false }),
              supabaseAcademia
                .from("academia_certificados")
                .select("*")
                .eq("corretor_id", corretorId)
                .order("emitido_em", { ascending: false }),
            ]);
          for (const r of [resumo, modulos, atribuicoes, praticas, historico, certificados]) {
            if (r.error) throw r.error;
          }
          return {
            resumo: (resumo.data ?? null) as AcademiaCorretorResumoRow | null,
            modulos: (modulos.data ?? []) as AcademiaModuloStatusRow[],
            atribuicoes: (atribuicoes.data ?? []) as AcademiaAtribuicaoRow[],
            praticas: (praticas.data ?? []) as AcademiaPraticaRow[],
            historico: (historico.data ?? []) as AcademiaNivelHistoricoRow[],
            certificados: (certificados.data ?? []) as AcademiaCertificadoRow[],
          };
        },
        () => ({
          resumo: null,
          modulos: [],
          atribuicoes: [],
          praticas: [],
          historico: [],
          certificados: [],
        }),
      ),
  });
}

// ---------------------------------------------------------------------------
// Participantes (só admin)
// ---------------------------------------------------------------------------

export function useCandidatos(habilitado: boolean) {
  return useQuery<AcademiaCandidatoRow[] | null>({
    queryKey: GESTAO_KEY.candidatos,
    enabled: habilitado,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia.rpc("academia_candidatos");
          if (error) throw error;
          return (data ?? []) as AcademiaCandidatoRow[];
        },
        () => null,
      ),
  });
}

// ---------------------------------------------------------------------------
// Recomendações e efeito
// ---------------------------------------------------------------------------

export type DadosRecomendacoes = {
  modo: AcademiaConfigRow["recomendacao_modo"] | null;
  regras: AcademiaRegraRecomendacaoRow[];
  /** Últimos 30 dias, qualquer status: a fila e o resumo por regra. */
  recomendacoes: AcademiaRecomendacaoRow[];
};

export function useRecomendacoes() {
  const { uid, pronto } = useUid();
  return useQuery<DadosRecomendacoes>({
    queryKey: GESTAO_KEY.recomendacoes,
    enabled: pronto,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
          const [cfg, regras, recs] = await Promise.all([
            supabaseAcademia.from("academia_config").select("recomendacao_modo").maybeSingle(),
            supabaseAcademia.from("academia_regras_recomendacao").select("*").order("codigo"),
            supabaseAcademia
              .from("academia_recomendacoes")
              .select("*")
              .gte("gerada_em", desde)
              .order("gerada_em", { ascending: false }),
          ]);
          for (const r of [cfg, regras, recs]) if (r.error) throw r.error;
          return {
            modo: (cfg.data?.recomendacao_modo ?? null) as DadosRecomendacoes["modo"],
            regras: (regras.data ?? []) as AcademiaRegraRecomendacaoRow[],
            recomendacoes: ((recs.data ?? []) as AcademiaRecomendacaoRow[]).filter(
              (r) => r.corretor_id !== uid,
            ),
          };
        },
        () => ({ modo: null, regras: [], recomendacoes: [] }),
      ),
  });
}

export function useEfeito() {
  const { pronto } = useUid();
  return useQuery<AcademiaEfeitoRow[] | null>({
    queryKey: GESTAO_KEY.efeito,
    enabled: pronto,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia
            .from("v_academia_efeito")
            .select("*")
            .order("concluida_em", { ascending: false });
          if (error) throw error;
          return (data ?? []) as AcademiaEfeitoRow[];
        },
        () => null,
      ),
  });
}

// ---------------------------------------------------------------------------
// Encontros
// ---------------------------------------------------------------------------

export type DadosEncontros = {
  encontros: AcademiaEncontroRow[];
  presencas: AcademiaPresencaRow[];
};

export function useEncontros() {
  const { pronto } = useUid();
  return useQuery<DadosEncontros>({
    queryKey: GESTAO_KEY.encontros,
    enabled: pronto,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
          const { data, error } = await supabaseAcademia
            .from("academia_encontros")
            .select("*")
            .gte("inicio", desde)
            .order("inicio", { ascending: true });
          if (error) throw error;
          const encontros = (data ?? []) as AcademiaEncontroRow[];
          const ids = encontros.map((e) => e.id);
          const pres = ids.length
            ? await supabaseAcademia.from("academia_presencas").select("*").in("encontro_id", ids)
            : { data: [], error: null };
          if (pres.error) throw pres.error;
          return { encontros, presencas: (pres.data ?? []) as AcademiaPresencaRow[] };
        },
        () => ({ encontros: [], presencas: [] }),
      ),
  });
}

/** Próximos encontros para a trilha do aluno (até 3). */
export function useProximosEncontros() {
  return useQuery<AcademiaEncontroRow[]>({
    queryKey: ["academia", "proximos-encontros"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia
            .from("academia_encontros")
            .select("*")
            .gte("inicio", new Date().toISOString())
            .order("inicio")
            .limit(3);
          if (error) throw error;
          return (data ?? []) as AcademiaEncontroRow[];
        },
        () => [],
      ),
  });
}

// ---------------------------------------------------------------------------
// Conteúdo (só admin)
// ---------------------------------------------------------------------------

export type ModuloConteudo = AcademiaModuloRow & {
  aulas: number;
  aulasPublicadas: number;
  questoesAtivas: number;
};

export function useConteudo(habilitado: boolean) {
  return useQuery<ModuloConteudo[]>({
    queryKey: GESTAO_KEY.conteudo,
    enabled: habilitado,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const [mods, aulas, questoes] = await Promise.all([
            supabaseAcademia.from("academia_modulos").select("*").order("fase").order("numero"),
            supabaseAcademia.from("academia_aulas").select("modulo_id, status"),
            supabaseAcademia.from("academia_questoes").select("modulo_id, ativa"),
          ]);
          for (const r of [mods, aulas, questoes]) if (r.error) throw r.error;
          const contaAulas = new Map<string, { total: number; pub: number }>();
          for (const a of (aulas.data ?? []) as Array<
            Pick<AcademiaAulaRow, "modulo_id" | "status">
          >) {
            const c = contaAulas.get(a.modulo_id) ?? { total: 0, pub: 0 };
            c.total += 1;
            if (a.status === "publicado") c.pub += 1;
            contaAulas.set(a.modulo_id, c);
          }
          const contaQ = new Map<string, number>();
          for (const q of (questoes.data ?? []) as Array<
            Pick<AcademiaQuestaoRow, "modulo_id" | "ativa">
          >) {
            if (q.ativa) contaQ.set(q.modulo_id, (contaQ.get(q.modulo_id) ?? 0) + 1);
          }
          return ((mods.data ?? []) as AcademiaModuloRow[]).map((m) => ({
            ...m,
            aulas: contaAulas.get(m.id)?.total ?? 0,
            aulasPublicadas: contaAulas.get(m.id)?.pub ?? 0,
            questoesAtivas: contaQ.get(m.id) ?? 0,
          }));
        },
        () => [],
      ),
  });
}

export type DadosConteudoModulo = {
  modulo: AcademiaModuloRow | null;
  aulas: AcademiaAulaRow[];
  questoes: AcademiaQuestaoRow[];
};

export function useConteudoModulo(codigo: string, habilitado: boolean) {
  return useQuery<DadosConteudoModulo>({
    queryKey: GESTAO_KEY.conteudoModulo(codigo),
    enabled: habilitado && codigo.length > 0,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data: modulo, error } = await supabaseAcademia
            .from("academia_modulos")
            .select("*")
            .eq("codigo", codigo)
            .maybeSingle();
          if (error) throw error;
          if (!modulo) return { modulo: null, aulas: [], questoes: [] };
          const [aulas, questoes] = await Promise.all([
            supabaseAcademia
              .from("academia_aulas")
              .select("*")
              .eq("modulo_id", modulo.id)
              .order("ordem"),
            supabaseAcademia
              .from("academia_questoes")
              .select("*")
              .eq("modulo_id", modulo.id)
              .order("ordem"),
          ]);
          for (const r of [aulas, questoes]) if (r.error) throw r.error;
          return {
            modulo: modulo as AcademiaModuloRow,
            aulas: (aulas.data ?? []) as AcademiaAulaRow[],
            questoes: (questoes.data ?? []) as AcademiaQuestaoRow[],
          };
        },
        () => ({ modulo: null, aulas: [], questoes: [] }),
      ),
  });
}

// ---------------------------------------------------------------------------
// Certificado
// ---------------------------------------------------------------------------

export type DadosCertificado = {
  certificado: AcademiaCertificadoRow | null;
  nome: string | null;
};

export function useCertificado(codigo: string) {
  return useQuery<DadosCertificado>({
    queryKey: GESTAO_KEY.certificado(codigo),
    enabled: codigo.length > 0,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await supabaseAcademia
            .from("academia_certificados")
            .select("*")
            .eq("codigo", codigo)
            .maybeSingle();
          if (error) throw error;
          if (!data) return { certificado: null, nome: null };
          const cert = data as AcademiaCertificadoRow;
          const { data: resumo, error: e2 } = await supabaseAcademia
            .from("v_academia_corretor_resumo")
            .select("corretor_nome")
            .eq("corretor_id", cert.corretor_id)
            .maybeSingle();
          if (e2) throw e2;
          return { certificado: cert, nome: resumo?.corretor_nome ?? null };
        },
        () => ({ certificado: null, nome: null }),
      ),
  });
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export function useAvaliarPratica() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: {
      praticaId: string;
      status: Exclude<AcademiaStatusPratica, "pendente">;
      rubrica: Json;
      feedback: string;
    }) => {
      const { error } = await supabaseAcademia.rpc("academia_pratica_avaliar", {
        _pratica: p.praticaId,
        _status: p.status,
        _rubrica: p.rubrica,
        _feedback: p.feedback,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useRegistrarRoleplay() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: {
      corretorId: string;
      moduloId: string;
      status: Exclude<AcademiaStatusPratica, "pendente">;
      rubrica: Json;
      feedback: string;
    }) => {
      const { error } = await supabaseAcademia.rpc("academia_registrar_roleplay", {
        _corretor: p.corretorId,
        _modulo: p.moduloId,
        _status: p.status,
        _rubrica: p.rubrica,
        _feedback: p.feedback,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useAtribuirModulo() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: {
      corretorId: string;
      moduloId: string;
      /** Atribuição da gestão sempre tem prazo (a tela sugere 7 dias). */
      prazo: string;
      motivo: string;
    }) => {
      const { error } = await supabaseAcademia.rpc("academia_atribuir", {
        _corretor: p.corretorId,
        _modulo: p.moduloId,
        _prazo: p.prazo,
        _motivo: p.motivo,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useDefinirHabilitado() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: { corretorId: string; habilitado: boolean | null; motivo: string }) => {
      const { error } = await supabaseAcademia.rpc("academia_definir_habilitado", {
        _corretor: p.corretorId,
        // `null` = voltar à regra da trilha. O gerador de types não sabe
        // declarar argumento nulo de RPC (mesma limitação de
        // lib/samiq-rpc-args.ts); a função SQL trata o nulo de propósito.
        _habilitado: p.habilitado as boolean,
        _motivo: p.motivo,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function usePromoverMestre() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: { corretorId: string; motivo: string }) => {
      const { error } = await supabaseAcademia.rpc("academia_promover_mestre", {
        _corretor: p.corretorId,
        _motivo: p.motivo,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useDefinirParticipacao() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: { pessoaId: string; participa: boolean; inicio: string | null }) => {
      const { error } = await supabaseAcademia.rpc("academia_definir_participacao", {
        _pessoa: p.pessoaId,
        _participa: p.participa,
        _inicio_trilha: p.inicio ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useDecidirRecomendacao() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: {
      recId: string;
      acao: "atribuir" | "descartar";
      motivo: string;
      prazo: string | null;
    }) => {
      const { error } = await supabaseAcademia.rpc("academia_decidir_recomendacao", {
        _rec: p.recId,
        _acao: p.acao,
        _motivo: p.motivo,
        _prazo: p.prazo ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useRodarMotor() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (): Promise<AcademiaMotorRetorno> => {
      const { data, error } = await supabaseAcademia.rpc("academia_rodar_motor", {});
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export type EncontroForm = {
  id: string | null;
  tipo: AcademiaTipoEncontro;
  titulo: string;
  inicio: string;
  duracaoMin: number | null;
  facilitadorId: string | null;
  moduloId: string | null;
  descricao: string;
  acaoRegistrada: string;
};

export function useSalvarEncontro() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (f: EncontroForm): Promise<string> => {
      const { data, error } = await supabaseAcademia.rpc("academia_salvar_encontro", {
        _id: f.id,
        _tipo: f.tipo,
        _titulo: f.titulo,
        _inicio: f.inicio,
        _duracao_min: f.duracaoMin,
        _facilitador: f.facilitadorId,
        _modulo: f.moduloId,
        _descricao: f.descricao,
        _acao_registrada: f.acaoRegistrada,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useRegistrarPresenca() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (p: { encontroId: string; corretorId: string; presente: boolean | null }) => {
      const { error } = await supabaseAcademia.rpc("academia_registrar_presenca", {
        _encontro: p.encontroId,
        _corretor: p.corretorId,
        _presente: p.presente,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

// Conteúdo: a RLS só deixa admin escrever nestas tabelas.

export type AulaForm = Pick<
  AcademiaAulaRow,
  "titulo" | "tipo" | "conteudo_md" | "url_material" | "url_video" | "duracao_min" | "status"
> & { id: string | null; moduloId: string; ordem: number };

export function useSalvarAula() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (f: AulaForm) => {
      const campos = {
        titulo: f.titulo.trim(),
        tipo: f.tipo,
        conteudo_md: f.conteudo_md,
        url_material: f.url_material,
        url_video: f.url_video,
        duracao_min: f.duracao_min,
        status: f.status,
        atualizado_em: new Date().toISOString(),
      };
      const r = f.id
        ? await supabaseAcademia.from("academia_aulas").update(campos).eq("id", f.id)
        : await supabaseAcademia
            .from("academia_aulas")
            .insert({ ...campos, modulo_id: f.moduloId, ordem: f.ordem });
      if (r.error) throw r.error;
    },
    onSuccess: invalidar,
  });
}

export type QuestaoForm = Pick<
  AcademiaQuestaoRow,
  "enunciado" | "correta" | "explicacao" | "ativa"
> & {
  id: string | null;
  moduloId: string;
  ordem: number;
  alternativas: string[];
};

export function useSalvarQuestao() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (f: QuestaoForm) => {
      const campos = {
        enunciado: f.enunciado.trim(),
        alternativas: f.alternativas,
        correta: f.correta,
        explicacao: f.explicacao,
        ativa: f.ativa,
      };
      const r = f.id
        ? await supabaseAcademia.from("academia_questoes").update(campos).eq("id", f.id)
        : await supabaseAcademia
            .from("academia_questoes")
            .insert({ ...campos, modulo_id: f.moduloId, ordem: f.ordem });
      if (r.error) throw r.error;
    },
    onSuccess: invalidar,
  });
}

export function useMarcarRevisado() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (moduloId: string) => {
      const { error } = await supabaseAcademia
        .from("academia_modulos")
        .update({ revisao_pendente: null, atualizado_em: new Date().toISOString() })
        .eq("id", moduloId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function usePublicarModulo() {
  const invalidar = useInvalidarAcademia();
  return useMutation({
    mutationFn: async (moduloId: string) => {
      const { error } = await supabaseAcademia.rpc("academia_publicar_modulo", {
        _modulo: moduloId,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}
