// Fila Única — leitura (Fatia 1). Nenhuma RPC nova: a fila é composta no
// cliente a partir das três fontes que já existem, cada uma com o mesmo
// contrato fail-closed das telas donas:
//   - atendimento_inbox_v4 (mesma queryKey de /atendimento: o cache é um só,
//     abrir uma tela aquece a outra);
//   - followup_fila_v1 (prefixo "followup:fila": toda invalidação do hub
//     Follow-Up alcança esta query);
//   - leads_sem_acao (o guardrail da home; sem a migration, cai em lista
//     vazia — a fila continua de pé, sem o balde "sem próximo passo").
// Regra que rege o arquivo: falha de leitura NUNCA vira fila vazia. Erro em
// qualquer fonte é propagado para a tela renderizar QueryErrorState — uma
// fila zerada é notícia boa, e não pode ser confundida com uma query que
// explodiu.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";
import { parseAtendimentoInbox, type AtendimentoInbox } from "@/features/atendimento/inbox";
import { rpcAtendimentoInbox } from "@/features/atendimento/atendimento-rpc";
import { fetchFilaFollowUp, type FilaFollowUp } from "@/features/followup/fila-client";
import { buildFilaUnica, type FilaUnica, type SemAcaoRow } from "@/features/fila-unica/derive";

const semAcaoRowSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  status: z.string(),
  temperatura: z.string().nullable(),
  proximo_followup: z.string().nullable(),
  ultima_interacao: z.string().nullable(),
  projeto_nome: z.string().nullable().optional(),
  corretor_id: z.string().uuid().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export function parseSemAcao(input: unknown): SemAcaoRow[] {
  return z.array(semAcaoRowSchema).parse(input ?? []);
}

/** Mesma cadeia de fallback de /atendimento (v4 → v3 → v2), com as filas que
 *  cada degrau não conhece preenchidas vazias — o parse exige as 6. */
async function carregarInbox(corretorId: string): Promise<AtendimentoInbox> {
  const params = { _corretor_id: corretorId, _limit_per_queue: 15 };
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

export const FILA_UNICA_SEM_ACAO_KEY = "fila-unica:sem-acao";

export function useFilaUnica() {
  const { user } = useAuth();
  const enabled = !!user;

  const inboxQ = useQuery({
    queryKey: ["atendimento:inbox", user?.id],
    enabled,
    queryFn: () => carregarInbox(user!.id),
  });

  const reguaQ = useQuery({
    queryKey: ["followup:fila", "fila-unica", user?.id],
    enabled,
    queryFn: () =>
      rpcWithFallback<FilaFollowUp | null>(
        () => fetchFilaFollowUp(),
        () => null,
      ),
  });

  // Só a própria carteira (Fatia 1 = "minha fila"). A visão por corretor,
  // para a gestão, é a Fatia 3 — e vai ler as mesmas fontes com escopo.
  const semAcaoQ = useQuery({
    queryKey: [FILA_UNICA_SEM_ACAO_KEY, user?.id],
    enabled,
    queryFn: () =>
      rpcWithFallback<SemAcaoRow[]>(
        async () => {
          const { data, error } = await rpc("leads_sem_acao", { _corretores: [user!.id] });
          if (error) throw error;
          return parseSemAcao(data);
        },
        () => [],
      ),
  });

  useRealtimeInvalidate(
    ["leads", "interacoes", "documentacoes", "tarefas", "mensagens", "conversas_tratadas"],
    [["atendimento:inbox"], ["followup:fila"], [FILA_UNICA_SEM_ACAO_KEY], ["nav-badges"]],
  );

  const isLoading = inboxQ.isLoading || reguaQ.isLoading || semAcaoQ.isLoading;
  const isError = inboxQ.isError || reguaQ.isError || semAcaoQ.isError;
  const error = inboxQ.error ?? reguaQ.error ?? semAcaoQ.error ?? null;

  const fila: FilaUnica | null = useMemo(() => {
    if (isLoading || isError || !inboxQ.data) return null;
    return buildFilaUnica({
      inbox: inboxQ.data,
      regua: reguaQ.data ?? null,
      semAcao: semAcaoQ.data ?? [],
    });
  }, [inboxQ.data, reguaQ.data, semAcaoQ.data, isLoading, isError]);

  const refetch = () => {
    void inboxQ.refetch();
    void reguaQ.refetch();
    void semAcaoQ.refetch();
  };

  return { fila, isLoading, isError, error, refetch };
}
