// SamiQ no PAINEL: a server function só autentica (JWT do corretor → RLS),
// valida a entrada e entrega ao cérebro único (samiq-core.server.ts, Onda S4).
// O mesmo cérebro atende o WhatsApp por /api/sami — prompt versionado,
// ferramentas, propostas, governança e memória são idênticos nos dois canais.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SamiQInputSchema, type SamiQResposta } from "@/lib/samiq";

export const perguntarSamiQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SamiQInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SamiQResposta> => {
    const { responderSamiQ } = await import("./samiq-core.server");
    return responderSamiQ({
      supabase: context.supabase,
      userId: context.userId,
      data,
      canal: "painel",
    });
  });
