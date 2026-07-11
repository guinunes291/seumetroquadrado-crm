import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redefinir senha — Seu Metro Quadrado" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase coloca tokens no hash quando vem do e-mail de recuperação
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) setReady(true);
    else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
      });
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd !== pwd2) return toast.error("As senhas não coincidem");
    if (pwd.length < 6) return toast.error("Mínimo de 6 caracteres");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Senha redefinida! Entre novamente.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[oklch(0.22_0.05_250)] to-[oklch(0.32_0.06_250)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Redefinir senha</CardTitle>
          <CardDescription>
            {ready
              ? "Defina sua nova senha de acesso."
              : "Abra o link de redefinição enviado por e-mail para continuar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ready && (
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pwd">Nova senha</Label>
                <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pwd2">Confirmar</Label>
                <Input id="pwd2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Atualizando…" : "Atualizar senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Toaster richColors closeButton />
    </div>
  );
}
