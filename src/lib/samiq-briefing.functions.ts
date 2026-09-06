// Briefing ao abrir a Sami no PAINEL (Onda S3, D13): autentica (JWT do
// corretor → RLS) e delega a samiq-briefing.server.ts, que também serve ao
// WhatsApp (/api/sami/briefing). Não chama o modelo — não gasta cota nem
// entra em samiq_execucoes. É o "quem merece atenção hoje" da Elô, de graça.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BriefingSamiQ } from "@/lib/samiq-briefing";

export const briefingSamiQ = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BriefingSamiQ> => {
    const { montarBriefingDoCorretor } = await import("./samiq-briefing.server");
    return montarBriefingDoCorretor({ supabase: context.supabase, userId: context.userId });
  });
