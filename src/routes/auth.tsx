import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Seu Metro Quadrado" },
      { name: "description", content: "Acesso ao CRM Seu Metro Quadrado." },
    ],
  }),
  // Preserva um destino relativo mesmo-origem (ex.: tela de consentimento OAuth).
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  component: AuthPage,
});

/** Só aceita destinos relativos mesmo-origem — evita open redirect. */
function safeNext(next: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const destino = safeNext(next);
  const [loading, setLoading] = useState(false);

  // Se já estiver logado, respeita o destino preservado.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (destino.startsWith("/") && destino !== "/") {
          window.location.href = destino;
        } else {
          navigate({ to: "/" });
        }
      }
    });
  }, [navigate, destino]);


  // Form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [signupNome, setSignupNome] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPwd, setSignupPwd] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPwd,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    toast.success("Bem-vindo de volta!");
    if (destino !== "/") {
      window.location.href = destino;
    } else {
      navigate({ to: "/" });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const emailRedirectTo =
      destino !== "/"
        ? `${window.location.origin}/auth?next=${encodeURIComponent(destino)}`
        : window.location.origin;
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPwd,
      options: {
        emailRedirectTo,
        data: { nome: signupNome },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível criar a conta", { description: error.message });
      return;
    }
    toast.success("Conta criada!", {
      description: "Verifique seu e-mail para confirmar (se exigido) e faça login.",
    });
  };

  const handleGoogle = async () => {
    setLoading(true);
    // Preserva o `next` no round-trip do Google devolvendo p/ /auth?next=...
    const redirectUri =
      destino !== "/"
        ? `${window.location.origin}/auth?next=${encodeURIComponent(destino)}`
        : window.location.origin;
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirectUri,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Erro no login com Google", {
        description: result.error.message ?? "Tente novamente.",
      });
      return;
    }
    if (result.redirected) return;
    if (destino !== "/") {
      window.location.href = destino;
    } else {
      navigate({ to: "/" });
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[oklch(0.22_0.05_250)] to-[oklch(0.32_0.06_250)] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-white">
            <div className="h-10 w-10 rounded-md bg-gold text-navy flex items-center justify-center font-bold text-lg">
              m²
            </div>
            <div className="text-left">
              <div className="font-semibold text-lg leading-tight">Seu Metro Quadrado</div>
              <div className="text-xs text-white/70">CRM Imobiliário</div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Acesse sua conta</CardTitle>
            <CardDescription>Entre com e-mail e senha ou via Google.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4 mt-4">
                <form onSubmit={handleLogin} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="login-pwd">Senha</Label>
                    <Input
                      id="login-pwd"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={loginPwd}
                      onChange={(e) => setLoginPwd(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-4">
                <form onSubmit={handleSignup} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="signup-nome">Nome completo</Label>
                    <Input
                      id="signup-nome"
                      required
                      value={signupNome}
                      onChange={(e) => setSignupNome(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="signup-pwd">Senha</Label>
                    <Input
                      id="signup-pwd"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={signupPwd}
                      onChange={(e) => setSignupPwd(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Criando..." : "Criar conta"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Sua conta passa por aprovação antes do acesso completo. Em caso de dúvida, fale com o administrador.
                  </p>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button
              variant="outline"
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.4c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.33 9.14 5.4 12 5.4z"
                />
              </svg>
              Continuar com Google
            </Button>
          </CardContent>
        </Card>
      </div>
      <Toaster richColors closeButton />
    </div>
  );
}
