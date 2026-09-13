// Leitura e escrita da carteira ativa / Reserva.
//
// As RPCs (carteira_ativa_v1, carteira_reserva_v1, carteira_ativa_config,
// carteira_resgatar, carteira_soltar) ainda não existem nos types gerados do
// Supabase; passam pela fronteira `rpc` de features/dashboard/queries para não
// gastar o budget de escapes de tipo (checado em CI). O retorno é validado com
// zod FAIL-CLOSED, como a inbox e a régua: uma linha malformada derruba a
// query com erro claro em vez de renderizar uma carteira silenciosamente
// errada — e aqui isso decide quem o corretor trabalha hoje.
//
// Banco antigo (sem a migration 20260913120000): `rpcWithFallback` devolve
// null e a tela diz "sem dado", nunca uma carteira vazia. Carteira vazia e
// carteira indisponível levam a decisões opostas.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";
import type { LinhaCarteira, LinhaReserva } from "@/features/carteira-ativa/derive";

export const CARTEIRA_ATIVA_KEY = "carteira-ativa";
export const CARTEIRA_RESERVA_KEY = "carteira-reserva";
export const CARTEIRA_CONFIG_KEY = "carteira-config";

/** Reexportado do módulo puro para quem já importava daqui — a definição (e
 *  a razão de ser única) está em `carteira-ativa/derive`. */
export { TETO_PADRAO, CAP_RESGATE_PADRAO } from "@/features/carteira-ativa/derive";
import { CAP_RESGATE_PADRAO } from "@/features/carteira-ativa/derive";

const linhaCarteiraSchema = z.object({
  lead_id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  status: z.string(),
  temperatura: z.string().nullable(),
  projeto_nome: z.string().nullable(),
  created_at: z.string(),
  movimento: z.string(),
  dias_parado: z.number().int(),
  proximo_followup: z.string().nullable(),
  // numeric chega como string pelo PostgREST.
  valor: z.coerce.number().nullable(),
  faixa: z.string(),
  posicao: z.number().int(),
});

const linhaReservaSchema = z.object({
  lead_id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  status: z.string(),
  temperatura: z.string().nullable(),
  projeto_nome: z.string().nullable(),
  created_at: z.string(),
  movimento: z.string(),
  dias_parado: z.number().int(),
  valor: z.coerce.number().nullable(),
  motivo: z.string(),
  // `count(*) OVER ()` — bigint vira string no PostgREST.
  total: z.coerce.number().int(),
});

export function parseCarteira(input: unknown): LinhaCarteira[] {
  return z.array(linhaCarteiraSchema).parse(input ?? []);
}

export function parseReserva(input: unknown): LinhaReserva[] {
  return z.array(linhaReservaSchema).parse(input ?? []);
}

/** Config vigente (teto e caps). Aberta a qualquer membro ativo: a régua
 *  governa a tela do corretor, e a RLS de gestao_config é gestão-only. */
export function useCarteiraConfig() {
  return useQuery({
    queryKey: [CARTEIRA_CONFIG_KEY],
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<{ teto: number; cap_resgate: number } | null>(
        async () => {
          const { data, error } = await rpc("carteira_ativa_config", {});
          if (error) throw error;
          const parsed = z
            .object({ teto: z.number().int().positive(), cap_resgate: z.number().int() })
            .partial({ cap_resgate: true })
            .parse(data ?? {});
          return { teto: parsed.teto, cap_resgate: parsed.cap_resgate ?? CAP_RESGATE_PADRAO };
        },
        () => null,
      ),
  });
}

export function useCarteiraAtiva(corretorId?: string) {
  const { user } = useAuth();
  useRealtimeInvalidate(
    ["leads", "tarefas", "agendamentos", "interacoes"],
    [[CARTEIRA_ATIVA_KEY], [CARTEIRA_RESERVA_KEY]],
  );
  return useQuery({
    queryKey: [CARTEIRA_ATIVA_KEY, corretorId ?? user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () =>
      rpcWithFallback<LinhaCarteira[] | null>(
        async () => {
          const { data, error } = await rpc("carteira_ativa_v1", {
            _corretor: corretorId ?? null,
          });
          if (error) throw error;
          return parseCarteira(data);
        },
        () => null,
      ),
  });
}

export function useCarteiraReserva(opts: {
  corretorId?: string;
  busca?: string;
  limite?: number;
  offset?: number;
}) {
  const { user } = useAuth();
  const { corretorId, busca, limite = 50, offset = 0 } = opts;
  return useQuery({
    queryKey: [CARTEIRA_RESERVA_KEY, corretorId ?? user?.id, busca ?? "", limite, offset],
    enabled: !!user,
    staleTime: 30_000,
    // A busca muda a cada tecla: manter a página anterior evita o pisca de
    // lista vazia, que numa tela de "não perdi ninguém" lê como perda.
    placeholderData: (anterior) => anterior,
    queryFn: () =>
      rpcWithFallback<LinhaReserva[] | null>(
        async () => {
          const { data, error } = await rpc("carteira_reserva_v1", {
            _corretor: corretorId ?? null,
            _busca: busca?.trim() ? busca.trim() : null,
            _limit: limite,
            _offset: offset,
          });
          if (error) throw error;
          return parseReserva(data);
        },
        () => null,
      ),
  });
}

const resultadoSchema = z.object({
  ok: z.boolean(),
  motivo: z.string().optional(),
  cap: z.number().int().optional(),
  vagas_agora: z.number().int().optional(),
});

export type ResultadoResgate = z.infer<typeof resultadoSchema>;

/** Puxar da Reserva para a carteira (faixa B) e desfazer. O banco recusa
 *  acima do cap e para lead de outro corretor — a tela só reporta. */
export function useResgate() {
  const qc = useQueryClient();
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: [CARTEIRA_ATIVA_KEY] });
    void qc.invalidateQueries({ queryKey: [CARTEIRA_RESERVA_KEY] });
  };

  const resgatar = useMutation({
    mutationFn: async (leadId: string): Promise<ResultadoResgate> => {
      const { data, error } = await rpc("carteira_resgatar", { _lead: leadId });
      if (error) throw error;
      return resultadoSchema.parse(data);
    },
    onSuccess: invalidar,
  });

  const soltar = useMutation({
    mutationFn: async (leadId: string): Promise<ResultadoResgate> => {
      const { data, error } = await rpc("carteira_soltar", { _lead: leadId });
      if (error) throw error;
      return resultadoSchema.parse(data);
    },
    onSuccess: invalidar,
  });

  return { resgatar, soltar };
}
