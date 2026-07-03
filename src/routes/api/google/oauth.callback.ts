// GET /api/google/oauth/callback — retorno do consentimento OAuth do Google.
// Valida o state assinado (HMAC), troca o code por tokens e grava a conexão do
// usuário; depois volta para o CRM com o resultado na query string.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/google/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (params: string) =>
          Response.redirect(`${url.origin}/meu-perfil?${params}`, 302);

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return back("google=erro&motivo=parametros");

        const gcal = await import("@/lib/google-calendar.server");
        if (!gcal.isGoogleCalendarConfigured()) return back("google=erro&motivo=nao_configurado");

        const userId = gcal.verifyOAuthState(state);
        if (!userId) return back("google=erro&motivo=state_invalido");

        try {
          await gcal.completeOAuth(userId, code, url.origin);
          return back("google=conectado");
        } catch (e) {
          console.error("[google-oauth] callback falhou:", e);
          return back("google=erro&motivo=troca_de_tokens");
        }
      },
    },
  },
});
