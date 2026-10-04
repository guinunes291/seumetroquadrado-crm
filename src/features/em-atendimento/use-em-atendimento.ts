// Leituras e ações da regra dos 65 (Fatia 2). As RPCs não estão nos types
// gerados; passam pela fronteira `rpc` de features/dashboard/queries para não
// gastar o budget de escapes de tipo. Toda leitura é validada fail-closed e
// degrada para null em banco sem a migration (rpcWithFallback).

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { rpc } from "@/features/dashboard/queries";
import { rpcWithFallback } from "@/lib/supabase-errors";
import {
  parseContador,
  parseMeus65,
  type ContadorEmAtendimento,
  type DesfechoRetorno,
  type LinhaMeus65,
} from "@/lib/em-atendimento";

export const EM_ATENDIMENTO_KEY = "em-atendimento:contador";
export const MEUS_65_KEY = "em-atendimento:meus-65";

/** O que muda de lugar quando um lead entra ou sai de Em atendimento. */
export const EM_ATENDIMENTO_INVALIDA: readonly (readonly unknown[])[] = [
  [EM_ATENDIMENTO_KEY],
  [MEUS_65_KEY],
  ["leads"],
  ["leads-status-counts"],
  ["leads-kanban"],
  ["pipeline-stage-v2"],
  ["pipeline-snapshot-v2"],
];

export function invalidarEmAtendimento(qc: QueryClient) {
  EM_ATENDIMENTO_INVALIDA.forEach((key) => qc.invalidateQueries({ queryKey: key }));
}

/** O contador X/65 do corretor (NULL = o próprio). Null sem a migration. */
export function useEmAtendimentoContador(corretorId?: string | null, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [EM_ATENDIMENTO_KEY, corretorId ?? user?.id],
    enabled: enabled && !!user,
    staleTime: 30_000,
    queryFn: () =>
      rpcWithFallback<ContadorEmAtendimento | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_contador_v1", {
            _corretor: corretorId ?? null,
          });
          if (error) throw error;
          return parseContador(data);
        },
        () => null,
      ),
  });
}

/** Os leads do corretor em Em atendimento, na ordem da disputa das vagas. */
export function useMeus65(corretorId?: string | null, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [MEUS_65_KEY, corretorId ?? user?.id],
    enabled: enabled && !!user,
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<LinhaMeus65[] | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_sombra_leads_v2", {
            _corretor: corretorId ?? null,
            _camada: "em_atendimento",
          });
          if (error) throw error;
          return parseMeus65(data);
        },
        () => null,
      ),
  });
}

const retornoResultadoSchema = z.object({
  destino: z.enum(["aguardando_retorno", "perdido"]),
  categoria: z.string().optional(),
  retorno_em: z.string(),
  proprio: z.boolean(),
});

export type RetornoResultado = z.infer<typeof retornoResultadoSchema>;

export async function registrarRetorno(input: {
  leadId: string;
  tipo: DesfechoRetorno;
  data: Date;
  nota?: string | null;
}): Promise<RetornoResultado> {
  const { data, error } = await rpc("registrar_retorno_lead", {
    _lead_id: input.leadId,
    _tipo: input.tipo,
    _data: input.data.toISOString(),
    _nota: input.nota?.trim() || null,
  });
  if (error) throw error;
  return retornoResultadoSchema.parse(data);
}

const trocaResultadoSchema = z.object({
  ok: z.literal(true),
  entra: z.string().uuid(),
  sai: z.string().uuid(),
  desfecho: z.string(),
});

export type DesfechoTroca = DesfechoRetorno | "perdido";

export async function trocarVaga(input: {
  entra: string;
  sai: string;
  desfecho: DesfechoTroca;
  data?: Date | null;
  categoria?: string | null;
  detalhe?: string | null;
}) {
  const { data, error } = await rpc("trocar_vaga_em_atendimento", {
    _entra: input.entra,
    _sai: input.sai,
    _desfecho: input.desfecho,
    _data: input.data ? input.data.toISOString() : null,
    _categoria: input.categoria ?? null,
    _detalhe: input.detalhe?.trim() || null,
  });
  if (error) throw error;
  return trocaResultadoSchema.parse(data);
}

const escolhaResultadoSchema = z.union([
  z.object({
    ok: z.literal(true),
    escolhido: z.boolean(),
    escolhidos: z.number().int(),
    teto: z.number().int(),
  }),
  z.object({
    ok: z.literal(false),
    motivo: z.string(),
    escolhidos: z.number().int(),
    teto: z.number().int(),
  }),
]);

export type EscolhaResultado = z.infer<typeof escolhaResultadoSchema>;

export async function escolherEmAtendimento(leadId: string, escolher: boolean) {
  const { data, error } = await rpc("escolher_em_atendimento", {
    _lead_id: leadId,
    _escolher: escolher,
  });
  if (error) throw error;
  return escolhaResultadoSchema.parse(data);
}
