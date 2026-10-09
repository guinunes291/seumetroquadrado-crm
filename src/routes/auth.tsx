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
import { ChartBar, Eye, EyeSlash, LinkSimple, SquaresFour } from "@phosphor-icons/react";
import { safePostLoginPath, safeSameOriginPath } from "@/lib/safe-navigation";

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
  const destinoAposLogin = safePostLoginPath(
    next,
    typeof window === "undefined" ? "https://crm.local" : window.location.origin,
  );
  const [loading, setLoading] = useState(false);

  // Se já estiver logado, respeita o destino preservado.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (destinoAposLogin === "/inicio") {
          navigate({ to: "/inicio" });
        } else {
          window.location.href = destinoAposLogin;
        }
      }
    });
  }, [navigate, destinoAposLogin]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const authTimeout = (action: string) =>
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${action} demorou para responder. Tente novamente em instantes.`));
      }, 12_000);
    });

  const authErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message?: unknown }).message ?? "").trim();
      if (message) return message;
    }
    return "O servidor demorou para responder. Tente novamente em instantes.";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPwd,
        }),
        authTimeout("O login"),
      ]);
      if (error) {
        toast.error("Não foi possível entrar", { description: authErrorMessage(error) });
        return;
      }
      toast.success("Bem-vindo de volta!");
      if (destinoAposLogin === "/inicio") {
        navigate({ to: "/inicio" });
      } else {
        window.location.href = destinoAposLogin;
      }
    } catch (error) {
      toast.error("Não foi possível entrar", { description: authErrorMessage(error) });
    } finally {
      setLoading(false);
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
    if (destinoAposLogin === "/inicio") {
      navigate({ to: "/inicio" });
    } else {
      window.location.href = destinoAposLogin;
    }
  };

  return (
    // Identidade Lançamento (2026-10): uma tela escura só, como no vídeo — a
    // tese e os três pilares à esquerda, o cartão de acesso flutuando à
    // direita. No celular a tese encolhe para o título e o cartão vem logo
    // abaixo. O formulário não mudou.
    <div className="relative min-h-screen overflow-hidden bg-gradient-command text-claro">
      {/* luz ambiente estática (pintada 1x) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 520px at 70% 20%, oklch(0.42 0.08 252 / 0.45), transparent 65%), radial-gradient(640px 380px at 10% 110%, oklch(0.77 0.11 85 / 0.08), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 md:px-10 md:py-10">
        <div className="flex items-center gap-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="h-10 w-10 rounded-lg bg-claro object-contain p-px"
          />
          <div>
            <div className="font-display text-lg font-semibold leading-tight">
              Seu Metro Quadrado
            </div>
            <div className="text-xs text-gold-300">Central de Comando</div>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1fr_420px] lg:gap-16">
          <section className="max-w-xl space-y-6">
            <p className="text-xs font-semibold text-gold-300">CRM Imobiliário</p>
            <h1 className="font-display text-3xl font-bold leading-[1.1] tracking-tight md:text-5xl">
              A central de comando da sua operação imobiliária.
            </h1>
            <ul className="hidden space-y-3.5 text-[15px] text-claro/80 lg:block">
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-claro/[0.06] ring-1 ring-inset ring-claro/10">
                  <SquaresFour className="h-4 w-4 text-gold-300" />
                </span>
                Do primeiro contato à comissão, num só lugar
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-claro/[0.06] ring-1 ring-inset ring-claro/10">
                  <ChartBar className="h-4 w-4 text-gold-300" />
                </span>
                Funil, metas e exceções ao vivo
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-claro/[0.06] ring-1 ring-inset ring-claro/10">
                  <LinkSimple className="h-4 w-4 text-gold-300" />
                </span>
                Integrado a Google Agenda, WhatsApp e webhooks
              </li>
            </ul>
          </section>

          {/* Formulário — intocado em conteúdo; entra com slide-fade sutil. */}
          <div className="animate-slide-fade motion-reduce:animate-none w-full max-w-md justify-self-center text-foreground lg:justify-self-end">
            <Card className="rounded-2xl border-claro/10 shadow-elev-4">
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
                          <EyeSlash className="h-4 w-4" aria-hidden="true" />
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

        <p className="text-xs text-claro/50">© {new Date().getFullYear()} Seu Metro Quadrado</p>
      </div>
      <Toaster richColors closeButton />
    </div>
  );
}
