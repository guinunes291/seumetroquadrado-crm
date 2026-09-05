// Consultas do hub de Desempenho. Nenhum número é calculado aqui: as linhas
// chegam agregadas do RPC (no máximo 50 por chamada) e a matemática vive em
// ranking-derive.ts. Realtime em atividades_diarias/metas/configuracao_pontuacao
// invalida as consultas (debounce de 2s) — pontos, vendas e metas mudam na TV
// sozinhos; "leads recebidos" e "alterações" (lidos de leads/transições pelo
// RPC) esperam o refresh periódico de 5 min, que continua como rede de
// segurança para tudo.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { agoraSaoPaulo, dateKey, getDateRange, mesRange, type PeriodoOption } from "@/lib/periodo";
import {
  CALENDARIO_PADRAO,
  janelaMesAnteriorComparavel,
  mapearRanking,
  normalizarCalendarioPacing,
  type ConfigPontoRow,
  type MetaRow,
  type PerfilResumo,
  type RankRow,
} from "./ranking-derive";

/** Teto de linhas do RPC — acima disso os totais da tela ficam truncados. */
export const RANKING_LIMITE = 50;

// Referência estável enquanto os perfis carregam (um `new Map()` por render
// invalidaria os memos das linhas a cada render).
const SEM_PERFIS = new Map<string, PerfilResumo>();

/**
 * "Hoje" em São Paulo que VIRA junto com o dia: a TV do escritório fica
 * ligada de um dia para o outro e o refresh de 5 min reconsultava as datas
 * de ontem. O estado só muda quando o dia SP muda (nada re-renderiza a cada
 * minuto), e como as queryKeys carregam as datas, a virada invalida o cache.
 */
function useHojeSaoPaulo(): Date {
  const [hoje, setHoje] = useState(() => agoraSaoPaulo());
  useEffect(() => {
    const t = setInterval(() => {
      const agora = agoraSaoPaulo();
      setHoje((atual) => (dateKey(atual) === dateKey(agora) ? atual : agora));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return hoje;
}

export const RANKING_QUERY_KEY = "ranking-periodo-v2";

function useRankingPeriodo(chave: string, de: Date, ate: Date) {
  const inicio = dateKey(de);
  const fim = dateKey(ate);
  return useQuery({
    queryKey: [RANKING_QUERY_KEY, chave, inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ranking_periodo_v2", {
        _inicio: inicio,
        _fim: fim,
        _limit: RANKING_LIMITE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRankingData(args: { periodo: PeriodoOption; ano: number; mes: number }) {
  const { periodo, ano, mes } = args;

  // "Hoje" é o de São Paulo (o fuso da operação e do banco), não o do aparelho.
  const hoje = useHojeSaoPaulo();
  const rangePeriodo = useMemo(() => getDateRange(periodo, hoje), [periodo, hoje]);
  const rangeMes = useMemo(() => mesRange(ano, mes), [ano, mes]);
  const janelaAnterior = useMemo(
    () => janelaMesAnteriorComparavel(ano, mes, hoje),
    [ano, mes, hoje],
  );

  const perfisQ = useQuery({
    queryKey: ["ranking:perfis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, avatar_url, foto_url, equipe_id")
        .eq("ativo", true);
      if (error) throw error;
      return new Map<string, PerfilResumo>(
        (data ?? []).map((p) => [
          p.id,
          { id: p.id, foto: p.avatar_url ?? p.foto_url ?? null, equipeId: p.equipe_id ?? null },
        ]),
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  const pesosQ = useQuery({
    queryKey: ["ranking:pesos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_pontuacao")
        .select("chave, pontos, ativo");
      if (error) throw error;
      return (data ?? []) as ConfigPontoRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Calendário de dias úteis do pacing (a mesma régua do Metas & Ritmo). A
  // RPC é SECURITY DEFINER e liberada a authenticated; sem ela, o padrão.
  const calendarioQ = useQuery({
    queryKey: ["ranking:calendario-pacing"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gestao_config_valor", { _chave: "pacing" });
      if (error) return CALENDARIO_PADRAO;
      return normalizarCalendarioPacing(data);
    },
    staleTime: 10 * 60 * 1000,
  });

  const periodoQ = useRankingPeriodo("periodo", rangePeriodo.from, rangePeriodo.to);
  const mesQ = useRankingPeriodo("mes", rangeMes.from, rangeMes.to);
  const mesAnteriorQ = useRankingPeriodo("mes-anterior", janelaAnterior.from, janelaAnterior.to);

  const metasQ = useQuery({
    queryKey: ["ranking:metas", ano, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas")
        .select("corretor_id, equipe_id, meta_vendas, meta_visitas, meta_leads_atendidos, meta_gmv")
        .eq("mes", mes)
        .eq("ano", ano);
      if (error) throw error;
      return (data ?? []) as MetaRow[];
    },
  });

  useRealtimeInvalidate(
    ["atividades_diarias", "metas", "configuracao_pontuacao"],
    [[RANKING_QUERY_KEY], ["ranking:metas"], ["ranking:pesos"]],
    { debounceMs: 2000 },
  );

  const perfis = perfisQ.data ?? SEM_PERFIS;
  const rankingPeriodo = useMemo<RankRow[]>(
    () => mapearRanking(periodoQ.data, perfis),
    [periodoQ.data, perfis],
  );
  const rankingMes = useMemo<RankRow[]>(
    () => mapearRanking(mesQ.data, perfis),
    [mesQ.data, perfis],
  );
  const rankingMesAnterior = useMemo<RankRow[]>(
    () => mapearRanking(mesAnteriorQ.data, perfis),
    [mesAnteriorQ.data, perfis],
  );

  // Principais: sem elas não há número na tela. Secundárias (fotos, pesos):
  // enriquecem — se falham, a tela fica sem foto/legenda, não sem ranking.
  const principais = [periodoQ, mesQ, mesAnteriorQ, metasQ];
  const secundarias = [perfisQ, pesosQ];
  const queries = [...principais, ...secundarias];
  // O RPC devolve no máximo 50 corretores: se alguma leitura bateu no teto,
  // os totais somados na tela deixam gente de fora — a página avisa.
  const truncado = [periodoQ, mesQ, mesAnteriorQ].some(
    (q) => (q.data?.length ?? 0) >= RANKING_LIMITE,
  );
  // Falha num refetch NÃO apaga o que já está na tela: o react-query mantém
  // `data`; a página só troca tudo pelo estado de erro quando não há leitura.
  const temDados = principais.every((q) => q.data !== undefined);
  // "Atualizado às" fala dos números, não das fotos.
  const atualizadoEm = Math.max(0, ...principais.map((q) => q.dataUpdatedAt));
  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const isError = principais.some((q) => q.isError);
  const error = principais.find((q) => q.isError)?.error;
  const isErrorSecundario = secundarias.some((q) => q.isError);
  const refetchAll = () => {
    queries.forEach((q) => void q.refetch());
  };

  return {
    hoje,
    rangePeriodo,
    rangeMes,
    janelaAnterior,
    rankingPeriodo,
    rankingMes,
    rankingMesAnterior,
    metas: metasQ.data ?? [],
    pesosRows: pesosQ.data,
    calendario: calendarioQ.data ?? CALENDARIO_PADRAO,
    truncado,
    temDados,
    /** Última leitura BEM-SUCEDIDA (null antes da primeira). */
    atualizadoEm: atualizadoEm > 0 ? new Date(atualizadoEm) : null,
    isLoading,
    isFetching,
    isError,
    error,
    /** Fotos ou pesos não carregaram: os números estão completos, a tela avisa. */
    isErrorSecundario,
    refetchAll,
    /** Chave do período do ranking de produtividade — muda ao trocar o filtro. */
    chavePeriodo: `${periodo}:${dateKey(rangePeriodo.from)}:${dateKey(rangePeriodo.to)}`,
  };
}

export type RankingData = ReturnType<typeof useRankingData>;
