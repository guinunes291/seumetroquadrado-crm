import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Eye, EyeOff, Gauge, Target, Users } from "lucide-react";
import { safeSameOriginPath } from "@/lib/safe-navigation";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Seu Metro Quadrado" },
      { name: "description", content: "Acesso ao CRM Seu Metro Quadrado." },
    ],
  }),
  // Preserva um destino relativo mesmo-origem (ex.: tela de consentimento OAuth).
  validateSearch: (
    s: Record<string, unknown>,
  ): { next: string; motivo?: "inativa" | "validacao" } => ({
    next: typeof s.next === "string" ? s.next : "",
    ...(s.motivo === "inativa" || s.motivo === "validacao" ? { motivo: s.motivo } : {}),
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next, motivo } = Route.useSearch();
  const destino = safeSameOriginPath(
    next,
    typeof window === "undefined" ? "https://crm.local" : window.location.origin,
  );
  const [loading, setLoading] = useState(false);

  // Se já estiver logado, respeita o destino preservado.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (destino.startsWith("/") && destino !== "/") {
          window.location.href = destino;
        } else {
          navigate({ to: "/hoje" });
        }
      }
    });
  }, [navigate, destino]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      navigate({ to: "/hoje" });
    }
  };

  const handlePasswordReset = async () => {
    if (!loginEmail.trim()) {
      toast.error("Informe seu e-mail para recuperar a senha.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível enviar a recuperação", { description: error.message });
      return;
    }
    toast.success("E-mail de recuperação enviado", {
      description: "Confira sua caixa de entrada e o spam.",
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
      navigate({ to: "/hoje" });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca — só desktop largo; a primeira impressão da SMQ. */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-command p-10 text-white lg:flex">
        {/* luz ambiente estática (pintada 1x) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(720px 420px at 78% -8%, oklch(0.77 0.11 85 / 0.1), transparent 65%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="h-10 w-10 rounded-md bg-white object-contain shadow-elev-1"
          />
          <div>
            <div className="font-display text-lg font-semibold leading-tight">
              Seu Metro Quadrado
            </div>
            <div className="text-xs tracking-wide text-gold-300">Central de Comando</div>
          </div>
        </div>

        <div className="relative max-w-md space-y-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-300">
            CRM Imobiliário
          </p>
          <h1 className="font-display text-3xl font-semibold leading-tight">
            A central de comando da sua operação imobiliária.
          </h1>
          <ul className="space-y-3 text-sm text-white/80">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.08]">
                <Users className="h-4 w-4 text-gold-300" />
              </span>
              Leads priorizados por urgência, com a próxima ação sempre à vista
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.08]">
                <Gauge className="h-4 w-4 text-gold-300" />
              </span>
              Funil com valor e conversão por etapa, em tempo real
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.08]">
                <Target className="h-4 w-4 text-gold-300" />
              </span>
              Metas, ranking e comissões acompanhando cada venda
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Seu Metro Quadrado
        </p>
      </aside>

      {/* Formulário — intocado em conteúdo; entra com slide-fade sutil. */}
      <div className="flex flex-1 items-center justify-center bg-background bg-ambient p-4">
        <div className="animate-slide-fade motion-reduce:animate-none w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <div className="inline-flex items-center gap-2">
              <img
                src="/icons/icon-192.png"
                alt=""
                className="h-10 w-10 rounded-md bg-white object-contain shadow-elev-1"
              />
              <div className="text-left">
                <div className="font-display text-lg font-semibold leading-tight">
                  Seu Metro Quadrado
                </div>
                <div className="text-xs text-muted-foreground">CRM Imobiliário</div>
              </div>
            </div>
          </div>

          <Card className="border-border-subtle shadow-elev-3">
            <CardHeader>
              <CardTitle>Acesse sua conta</CardTitle>
              <CardDescription>
                O acesso é exclusivo para profissionais convidados pela gestão.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {motivo && (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"
                >
                  {motivo === "inativa"
                    ? "Esta conta está pendente ou bloqueada. Solicite a liberação à gestão."
                    : "Não foi possível validar o acesso com segurança. Tente novamente em instantes."}
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="login-pwd">Senha</Label>
                    <button
                      type="button"
                      className="-my-3 min-h-11 rounded-sm px-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={handlePasswordReset}
                      disabled={loading}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-pwd"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={loginPwd}
                      onChange={(e) => setLoginPwd(e.target.value)}
                      className="min-h-11 pr-12"
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
                <Button type="submit" loading={loading} className="min-h-11 w-full">
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>

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
                className="min-h-11 w-full"
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
      </div>
      <Toaster richColors closeButton />
    </div>
  );
}
