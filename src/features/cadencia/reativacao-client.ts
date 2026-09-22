// Camada de dados da tela de reativação (SDR + gestão).
//
// Lê `reativacao_fila_v1` (migration 20260924120000), que devolve DUAS listas:
// acionáveis (elegíveis hoje) e em descanso (somente leitura). A separação é
// do banco de propósito — se a tela filtrasse, bastaria um bug de comparação
// de data para o SDR ligar para quem acabou de receber a mensagem de
// encerramento, que é o custo que a janela de descanso existe para evitar.
//
// Zod FAIL-CLOSED, como no resto do módulo.

import { z } from "zod";
import { rpc } from "@/features/dashboard/queries";

const acionavelSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  nome: z.string(),
  empreendimento: z.string().nullable(),
  faixa_renda: z.string().nullable(),
  prioridade: z.number().int(),
  horarios_tentados: z.unknown().nullable(),
  tentativas_reativacao: z.number().int(),
  entrou_em: z.string(),
  elegivel_em: z.string(),
  status: z.string(),
  origem: z.string(),
});

const descansoSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  nome: z.string(),
  empreendimento: z.string().nullable(),
  faixa_renda: z.string().nullable(),
  prioridade: z.number().int(),
  entrou_em: z.string(),
  elegivel_em: z.string(),
  origem: z.string(),
});

const filaSchema = z.object({
  gerado_em: z.string(),
  acionaveis: z.array(acionavelSchema),
  em_descanso: z.array(descansoSchema),
});

export type ItemReativacao = z.infer<typeof acionavelSchema>;
export type ItemDescanso = z.infer<typeof descansoSchema>;
export type FilaReativacao = z.infer<typeof filaSchema>;

export function parseFilaReativacao(input: unknown): FilaReativacao {
  return filaSchema.parse(input);
}

export async function fetchFilaReativacao(): Promise<FilaReativacao> {
  const { data, error } = await rpc("reativacao_fila_v1", { _take: 200 });
  if (error) throw error;
  return parseFilaReativacao(data);
}

export async function marcarReativado(filaId: string, notas: string): Promise<void> {
  const { error } = await rpc("reativacao_marcar_reativado", {
    _fila_id: filaId,
    _notas: notas.trim() || null,
  });
  if (error) throw error;
}

export async function marcarSemRetorno(filaId: string): Promise<void> {
  const { error } = await rpc("reativacao_marcar_sem_retorno", { _fila_id: filaId });
  if (error) throw error;
}

/** Faixas de horário já gastas, em texto curto para a lista. */
export function resumoHorarios(valor: unknown): string {
  if (valor == null) return "—";
  if (Array.isArray(valor)) return valor.map(String).join(" · ") || "—";
  if (typeof valor === "object") {
    const partes = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== 0 && v !== false)
      .map(([k, v]) => (typeof v === "boolean" ? k : `${k}: ${String(v)}`));
    return partes.length ? partes.join(" · ") : "—";
  }
  return String(valor);
}
