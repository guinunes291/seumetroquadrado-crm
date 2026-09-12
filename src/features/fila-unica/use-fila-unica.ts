// Fila Única — leitura (Fatia 1). Nenhuma RPC nova: a fila é composta no
// cliente a partir das três fontes que já existem, cada uma com o mesmo
// contrato fail-closed das telas donas:
//   - atendimento_inbox_v4 (chave própria sob o prefixo "atendimento:inbox":
//     pede 30 cards por fila, o teto da RPC, em vez dos 15 de /atendimento —
//     a chave não é a mesma porque o payload não é o mesmo; a invalidação por
//     prefixo alcança as duas);
//   - followup_fila_v1 (prefixo "followup:fila": toda invalidação do hub
//     Follow-Up alcança esta query);
//   - leads_sem_acao (o guardrail da home; sem a migration, cai em lista
//     vazia — a fila continua de pé, sem o balde "sem próximo passo").
// Mais um enriquecimento por id em `leads` (created_at, ultimo_contato,
// projeto_nome, corretor_id, os fatos do Resumo e o preço de tabela do
// projeto de interesse): as fontes não trazem tudo que o card e o relógio
// precisam, e a lógica pura nunca inventa data nem valor.
// Regra que rege o arquivo: falha de leitura NUNCA vira fila vazia. Erro em
// qualquer fonte é propagado para a tela renderizar QueryErrorState — uma
// fila zerada é notícia boa, e não pode ser confundida com uma query que
// explodiu. O gate de carregamento é `isPending` (sem dado ainda), não
// `isLoading` (pendente E buscando): uma query pausada por falta de rede
// mostra o esqueleto, não uma tela em branco.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { parseAtendimentoInbox, type AtendimentoInbox } from "@/features/atendimento/inbox";
import { rpcAtendimentoInbox } from "@/features/atendimento/atendimento-rpc";
import { fetchFilaFollowUp, type FilaFollowUp } from "@/features/followup/fila-client";
import {
  buildFilaUnica,
  type FilaUnica,
  type LeadExtras,
  type SemAcaoRow,
} from "@/features/fila-unica/derive";

const semAcaoRowSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  status: z.string(),
  temperatura: z.string().nullable(),
  proximo_followup: z.string().nullable(),
  ultima_interacao: z.string().nullable(),
});

export function parseSemAcao(input: unknown): SemAcaoRow[] {
  return z.array(semAcaoRowSchema).parse(input ?? []);
}

/** Teto da RPC (schema da inbox aceita até 30 por fila). /atendimento pede 15
 *  porque mostra por fila; aqui a fila é uma só e o corte por fila esconde
 *  gente — o que sobrar além de 30 é contado em `resumo.ocultosInbox`. */
const CARDS_POR_FILA = 30;

/** Mesma cadeia de fallback de /atendimento (v4 → v3 → v2), com as filas que
 *  cada degrau não conhece preenchidas vazias — o parse exige as 6. */
async function carregarInbox(corretorId: string): Promise<AtendimentoInbox> {
  const params = { _corretor_id: corretorId, _limit_per_queue: CARDS_POR_FILA };
  return rpcWithFallback(
    async () => parseAtendimentoInbox(await rpcAtendimentoInbox("v4", params)),
    () =>
      rpcWithFallback(
        async () =>
          parseAtendimentoInbox([
            ...(await rpcAtendimentoInbox("v3", params)),
            { fila: "confirmar_visita", total_count: 0, items: [] },
          ]),
        async () => {
          const rows = await rpcAtendimentoInbox("v2", params);
          return parseAtendimentoInbox([
            { fila: "novos", total_count: 0, items: [] },
            ...rows,
            { fila: "confirmar_visita", total_count: 0, items: [] },
          ]);
        },
      ),
  );
}

const extrasRowSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().nullable(),
  ultimo_contato: z.string().nullable(),
  projeto_nome: z.string().nullable(),
  corretor_id: z.string().uuid().nullable(),
  faixa_mcmv: z.string().nullable().optional(),
  decisor: z.string().nullable().optional(),
  tipo_renda: z.string().nullable().optional(),
  // O projeto de interesse embutido: o preço de tabela vira o "dinheiro em
  // jogo" do card; sob consulta, não há número honesto.
  projeto: z
    .object({ preco_a_partir: z.number().nullable(), sob_consulta: z.boolean().nullable() })
    .nullable()
    .optional(),
});

/** Preço de tabela do projeto → VGV estimado; null quando não há número honesto. */
export function valorDoProjeto(
  projeto: { preco_a_partir: number | null; sob_consulta: boolean | null } | null | undefined,
): number | null {
  if (!projeto || projeto.sob_consulta) return null;
  return projeto.preco_a_partir && projeto.preco_a_partir > 0 ? projeto.preco_a_partir : null;
}

/** Ids por requisição do enriquecimento. O pior caso antes da dedup é
 *  30×6 da inbox + toda a régua + 60 de leads_sem_acao — centenas de UUIDs
 *  num `.in` viram uma query string longa demais para proxies e para o
 *  PostgREST. 100 ids ≈ 3,7 KB de URL; os lotes vão em paralelo. */
export const EXTRAS_POR_LOTE = 100;

/** Campos que as fontes não trazem, lidos por id em `leads` (RLS da carteira
 *  aplica); o `.in` é index-scan por chave primária. Qualquer lote com erro
 *  derruba a query inteira — enriquecimento parcial mentiria no relógio. */
async function carregarExtras(ids: string[]): Promise<Map<string, LeadExtras>> {
  const mapa = new Map<string, LeadExtras>();
  if (ids.length === 0) return mapa;
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += EXTRAS_POR_LOTE) {
    lotes.push(ids.slice(i, i + EXTRAS_POR_LOTE));
  }
  const respostas = await Promise.all(
    lotes.map(async (lote) => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, created_at, ultimo_contato, projeto_nome, corretor_id, faixa_mcmv, decisor, tipo_renda, projeto:projetos!leads_projeto_id_fkey(preco_a_partir, sob_consulta)",
        )
        .in("id", lote);
      if (error) throw error;
      return z.array(extrasRowSchema).parse(data ?? []);
    }),
  );
  for (const row of respostas.flat()) {
    mapa.set(row.id, {
      created_at: row.created_at,
      ultimo_contato: row.ultimo_contato,
      projeto_nome: row.projeto_nome,
      corretor_id: row.corretor_id,
      faixa_mcmv: row.faixa_mcmv ?? null,
      decisor: row.decisor ?? null,
      tipo_renda: row.tipo_renda ?? null,
      valor_projeto: valorDoProjeto(row.projeto),
    });
  }
  return mapa;
}

function idsDasFontes(
  inbox: AtendimentoInbox | undefined,
  regua: FilaFollowUp | null | undefined,
  semAcao: SemAcaoRow[] | undefined,
): string[] {
  const ids = new Set<string>();
  if (inbox) {
    for (const fila of Object.values(inbox.filas)) for (const q of fila) ids.add(q.lead.id);
  }
  for (const f of regua?.itens ?? []) ids.add(f.id);
  for (const r of semAcao ?? []) ids.add(r.id);
  return Array.from(ids).sort();
}

export const FILA_UNICA_INBOX_KEY = ["atendimento:inbox", "fila-unica"] as const;
export const FILA_UNICA_SEM_ACAO_KEY = "fila-unica:sem-acao";
export const FILA_UNICA_EXTRAS_KEY = "fila-unica:extras";

/** A fila de um corretor: a própria (default) ou, para a gestão, a de
 *  `corretorId` ("Ver a fila" na tabela da equipe). As três fontes aceitam o
 *  alvo e o banco decide o escopo — fora dele, erro, nunca lista vazia. */
export function useFilaUnica(opts: { corretorId?: string | null } = {}) {
  const { user } = useAuth();
  const alvo = opts.corretorId ?? user?.id ?? null;
  const enabled = !!user && !!alvo;

  const inboxQ = useQuery({
    queryKey: [...FILA_UNICA_INBOX_KEY, alvo],
    enabled,
    queryFn: () => carregarInbox(alvo!),
  });

  const reguaQ = useQuery({
    queryKey: ["followup:fila", "fila-unica", alvo],
    enabled,
    queryFn: () =>
      rpcWithFallback<FilaFollowUp | null>(
        () => fetchFilaFollowUp(opts.corretorId ?? undefined),
        () => null,
      ),
  });

  const semAcaoQ = useQuery({
    queryKey: [FILA_UNICA_SEM_ACAO_KEY, alvo],
    enabled,
    queryFn: () =>
      rpcWithFallback<SemAcaoRow[]>(
        async () => {
          // A RPC está em types.ts: cliente tipado, sem a ponte solta do
          // dashboard. O parse continua fail-closed (a forma vem do banco).
          const { data, error } = await supabase.rpc("leads_sem_acao", {
            _corretores: [alvo!],
          });
          if (error) throw error;
          return parseSemAcao(data);
        },
        () => [],
      ),
  });

  const fontesProntas = !!inboxQ.data && reguaQ.data !== undefined && semAcaoQ.data !== undefined;
  const ids = useMemo(
    () => (fontesProntas ? idsDasFontes(inboxQ.data, reguaQ.data, semAcaoQ.data) : []),
    [fontesProntas, inboxQ.data, reguaQ.data, semAcaoQ.data],
  );

  const extrasQ = useQuery({
    queryKey: [FILA_UNICA_EXTRAS_KEY, alvo, ids.join(",")],
    enabled: enabled && fontesProntas,
    queryFn: () => carregarExtras(ids),
  });

  useRealtimeInvalidate(
    ["leads", "interacoes", "documentacoes", "tarefas", "mensagens", "conversas_tratadas"],
    [
      ["atendimento:inbox"],
      ["followup:fila"],
      [FILA_UNICA_SEM_ACAO_KEY],
      [FILA_UNICA_EXTRAS_KEY],
      ["nav-badges"],
    ],
  );

  const isError = inboxQ.isError || reguaQ.isError || semAcaoQ.isError || extrasQ.isError;
  const error = inboxQ.error ?? reguaQ.error ?? semAcaoQ.error ?? extrasQ.error ?? null;
  const isLoading =
    !isError && (inboxQ.isPending || reguaQ.isPending || semAcaoQ.isPending || extrasQ.isPending);

  const fila: FilaUnica | null = useMemo(() => {
    if (isLoading || isError || !inboxQ.data || !extrasQ.data) return null;
    return buildFilaUnica({
      inbox: inboxQ.data,
      regua: reguaQ.data ?? null,
      semAcao: semAcaoQ.data ?? [],
      extras: extrasQ.data,
    });
  }, [inboxQ.data, reguaQ.data, semAcaoQ.data, extrasQ.data, isLoading, isError]);

  const refetch = () => {
    void inboxQ.refetch();
    void reguaQ.refetch();
    void semAcaoQ.refetch();
    void extrasQ.refetch();
  };

  return { fila, isLoading, isError, error, refetch };
}
