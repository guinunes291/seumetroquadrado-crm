import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/meu-perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — Seu Metro Quadrado" }] }),
  component: MeuPerfilPage,
});

function MeuPerfilPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const perfilQuery = useQuery({
    enabled: !!user,
    queryKey: ["meu-perfil", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, email, telefone, cargo, bio, avatar_url, data_admissao, presente, presente_em")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const presenteHoje =
    !!perfilQuery.data?.presente &&
    !!perfilQuery.data?.presente_em &&
    new Date(perfilQuery.data.presente_em).toDateString() === new Date().toDateString();

  const togglePresenca = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.rpc("marcar_presenca", { _presente: v });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v ? "Bem-vindo! Você está presente." : "Presença removida.");
      qc.invalidateQueries({ queryKey: ["meu-perfil"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cargo, setCargo] = useState("");
  const [bio, setBio] = useState("");
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");

  useEffect(() => {
    if (perfilQuery.data) {
      setNome(perfilQuery.data.nome ?? "");
      setTelefone(perfilQuery.data.telefone ?? "");
      setCargo(perfilQuery.data.cargo ?? "");
      setBio(perfilQuery.data.bio ?? "");
    }
  }, [perfilQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ nome, telefone: telefone || null, cargo: cargo || null, bio: bio || null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["meu-perfil"] });
      qc.invalidateQueries({ queryKey: ["corretores"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const updatePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd1 !== pwd2) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (pwd1.length < 6) {
      toast.error("Mínimo de 6 caracteres");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pwd1 });
    if (error) {
      toast.error("Erro", { description: error.message });
      return;
    }
    toast.success("Senha atualizada");
    setPwd1("");
    setPwd2("");
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Meu perfil" description="Atualize seus dados de cadastro e senha." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input value={perfilQuery.data?.email ?? user?.email ?? ""} disabled />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cargo">Cargo</Label>
            <Input id="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Corretor pleno, gestor regional…" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Alterar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={updatePwd} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="p1">Nova senha</Label>
                <Input id="p1" type="password" value={pwd1} onChange={(e) => setPwd1(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p2">Confirmar</Label>
                <Input id="p2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Atualizar senha</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
