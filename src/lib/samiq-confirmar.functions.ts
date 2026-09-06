// Server functions da confirmação de propostas no PAINEL (Onda S2): confirmar
// (executa com a sessão do corretor e registra a decisão), rejeitar e desfazer
// (24 h). A lógica vive em samiq-confirmar.server.ts (Onda S4), compartilhada
// com a confirmação por WhatsApp em /api/sami. O modelo nunca chega aqui — só
// o botão do card, na mão do corretor.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { ResultadoConfirmacao } from "./samiq-confirmar.server";
import type { ResultadoConfirmacao } from "./samiq-confirmar.server";

const ConfirmarInput = z.object({
  itens: z
    .array(
      z.object({
        id: z.string().uuid(),
        /** Payload editado no card; ausente = confirmar como a Sami propôs. */
        payload: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(10),
});

const IdsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(10) });
const IdInput = z.object({ id: z.string().uuid() });

export const confirmarPropostasSamiQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConfirmarInput.parse(data))
  .handler(async ({ data, context }): Promise<{ resultados: ResultadoConfirmacao[] }> => {
    const { confirmarPropostas } = await import("./samiq-confirmar.server");
    const resultados = await confirmarPropostas({
      supabase: context.supabase,
      userId: context.userId,
      itens: data.itens,
    });
    return { resultados };
  });

export const rejeitarPropostasSamiQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdsInput.parse(data))
  .handler(async ({ data, context }): Promise<{ rejeitadas: number }> => {
    const { rejeitarPropostas } = await import("./samiq-confirmar.server");
    const rejeitadas = await rejeitarPropostas({ userId: context.userId, ids: data.ids });
    return { rejeitadas };
  });

export const desfazerPropostaSamiQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdInput.parse(data))
  .handler(async ({ data, context }): Promise<{ desfeito: boolean; itens: string[] }> => {
    const { desfazerProposta } = await import("./samiq-confirmar.server");
    return desfazerProposta({ userId: context.userId, id: data.id });
  });
