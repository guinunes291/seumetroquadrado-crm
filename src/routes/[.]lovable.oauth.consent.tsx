// Tela de consentimento OAuth (Supabase authorization server).
// URL: /.lovable/oauth/consent?authorization_id=...
// O TanStack Router escapa o ponto literal com [.], então o arquivo precisa ser
// exatamente src/routes/[.]lovable.oauth.consent.tsx — arquivos começados com
// ponto viram "hidden" e são ignorados pelo gerador de rotas (404 silencioso).
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Beta types no supabase-js — wrapper local mínimo p/ evitar `any`.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{
    data: {
      client?: { name?: string; client_uri?: string } | null;
      redirect_url?: string | null;
      redirect_to?: string | null;
    } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
};

function oauthApi(): OAuthApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.auth as any).oauth as OAuthApi;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Sessão do Supabase mora no localStorage: sem SSR aqui, caso contrário o
  // getSession() no server é sempre null e chuta usuário logado para /auth.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Preserva a URL de consentimento como caminho relativo mesmo-origem
      // para o /auth voltar aqui após o login.
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId =
      new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    // Cliente já aprovado: o AS resolve imediato — segue direto para o redirect.
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      throw redirect({ href: immediate });
    }
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Não foi possível carregar a autorização</CardTitle>
          <CardDescription>{String((error as Error)?.message ?? error)}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nomeCliente = details?.client?.name ?? "um aplicativo externo";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não devolveu um redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[oklch(0.22_0.05_250)] to-[oklch(0.32_0.06_250)]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Conectar {nomeCliente} à sua conta</CardTitle>
          <CardDescription>
            {nomeCliente} vai poder usar o CRM Seu Metro Quadrado agindo como
            você (mesmas permissões do seu login). Você pode revogar o acesso a
            qualquer momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
              {busy ? "Aguarde..." : "Autorizar"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => decide(false)}
              className="flex-1"
            >
              Negar
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
