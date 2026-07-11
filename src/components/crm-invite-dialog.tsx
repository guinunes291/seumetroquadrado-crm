import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PapelConvite = "admin" | "superintendente" | "gestor" | "corretor";

export function CrmInviteDialog({
  equipes,
  canAssignPrivilegedRoles,
}: {
  equipes: Array<{ id: string; nome: string }>;
  canAssignPrivilegedRoles: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<PapelConvite>("corretor");
  const [equipeId, setEquipeId] = useState("none");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("crm-convites", {
      body: {
        acao: "convidar",
        email: email.trim(),
        papel,
        equipe_id: equipeId === "none" ? null : equipeId,
        validade_dias: 7,
      },
    });
    setSubmitting(false);
    if (error || !data?.ok) {
      const code = data?.error;
      const description =
        code === "invite_already_pending"
          ? "Já existe um convite pendente para este e-mail."
          : code === "invite_delivery_failed"
            ? "O convite não pôde ser entregue. Confira o e-mail e a configuração SMTP."
            : "Confira o papel, a equipe e tente novamente.";
      toast.error("Não foi possível enviar o convite", { description });
      return;
    }
    toast.success(data.conta_existente ? "Conta existente liberada" : "Convite enviado", {
      description: "O acesso expira em sete dias se o convite não for aceito.",
    });
    setEmail("");
    setPapel("corretor");
    setEquipeId("none");
    setOpen(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["corretores"] }),
      queryClient.invalidateQueries({ queryKey: ["convites-crm"] }),
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Convidar pessoa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Novo convite para o CRM</DialogTitle>
            <DialogDescription>
              O papel e a equipe são concedidos somente quando este e-mail aceita o convite.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mail profissional</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Papel</Label>
                <Select value={papel} onValueChange={(value) => setPapel(value as PapelConvite)}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corretor">Corretor</SelectItem>
                    {canAssignPrivilegedRoles && (
                      <>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="superintendente">Superintendente</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-team">Equipe</Label>
                <Select value={equipeId} onValueChange={setEquipeId}>
                  <SelectTrigger id="invite-team">
                    <SelectValue placeholder="Sem equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem equipe</SelectItem>
                    {equipes.map((equipe) => (
                      <SelectItem key={equipe.id} value={equipe.id}>
                        {equipe.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
