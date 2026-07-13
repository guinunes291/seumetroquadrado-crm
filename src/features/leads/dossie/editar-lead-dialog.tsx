// Diálogo "Editar dados" do dossiê: botão + formulário autocontidos. O form é
// preenchido a partir do lead NO CLIQUE (não em render), igual ao comportamento
// original da rota — editar não perde o rascunho se o lead refetchar no meio.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { maskPhoneBR, maskCPF } from "@/lib/masks";
import type { DossieLead } from "@/features/leads/dossie/types";

export function EditarLeadDialog({ leadId, lead }: { leadId: string; lead: DossieLead }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    cpf: "",
    renda_informada: "",
    entrada_disponivel: "",
    usa_fgts: false,
    projeto_nome: "",
    observacoes: "",
  });

  const openEdit = () => {
    setEditForm({
      nome: lead.nome ?? "",
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
      cpf: lead.cpf ?? "",
      renda_informada: lead.renda_informada ?? "",
      entrada_disponivel: lead.entrada_disponivel ?? "",
      usa_fgts: !!lead.usa_fgts,
      projeto_nome: lead.projeto_nome ?? "",
      observacoes: lead.observacoes ?? "",
    });
    setEditOpen(true);
  };

  const editarLead = useMutation({
    mutationFn: async () => {
      const nome = editForm.nome.trim();
      if (nome.length < 2) throw new Error("Informe o nome do cliente.");
      const telefone = editForm.telefone.trim();
      if (telefone.replace(/\D/g, "").length < 8) throw new Error("Telefone inválido.");
      const email = editForm.email.trim();
      if (email && !email.includes("@")) throw new Error("E-mail inválido.");
      // Nota: `proximo_followup` é derivado das tarefas (trigger do banco) e
      // não é editável aqui — o corretor mexe criando/adiando tarefas.
      const payload = {
        nome,
        telefone,
        email: email || null,
        cpf: editForm.cpf.trim() || null,
        renda_informada: editForm.renda_informada.trim() || null,
        entrada_disponivel: editForm.entrada_disponivel.trim() || null,
        usa_fgts: editForm.usa_fgts,
        projeto_nome: editForm.projeto_nome.trim() || null,
        observacoes: editForm.observacoes.trim() || null,
      };
      const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados atualizados");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" onClick={openEdit}>
        <Pencil className="h-4 w-4 mr-2" /> Editar dados
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar dados do cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input
                value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                maxLength={160}
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                inputMode="tel"
                placeholder="(11) 98765-4321"
                value={editForm.telefone}
                onChange={(e) =>
                  setEditForm({ ...editForm, telefone: maskPhoneBR(e.target.value) })
                }
                maxLength={40}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                maxLength={160}
              />
            </div>
            <div>
              <Label>CPF</Label>
              <Input
                inputMode="numeric"
                placeholder="123.456.789-09"
                value={editForm.cpf}
                onChange={(e) => setEditForm({ ...editForm, cpf: maskCPF(e.target.value) })}
                maxLength={20}
              />
            </div>
            <div>
              <Label>Empreendimento</Label>
              <Input
                value={editForm.projeto_nome}
                onChange={(e) => setEditForm({ ...editForm, projeto_nome: e.target.value })}
                maxLength={160}
              />
            </div>
            <div>
              <Label>Renda informada</Label>
              <Input
                value={editForm.renda_informada}
                onChange={(e) => setEditForm({ ...editForm, renda_informada: e.target.value })}
                maxLength={40}
              />
            </div>
            <div>
              <Label>Entrada disponível</Label>
              <Input
                value={editForm.entrada_disponivel}
                onChange={(e) => setEditForm({ ...editForm, entrada_disponivel: e.target.value })}
                maxLength={40}
              />
            </div>
            <div>
              <Label>Próximo follow-up</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {lead.proximo_followup
                  ? new Date(lead.proximo_followup).toLocaleString("pt-BR")
                  : "—"}
                <div className="text-[11px] mt-0.5">
                  Derivado das tarefas. Crie/adie uma tarefa para alterar.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={editForm.usa_fgts}
                onCheckedChange={(v) => setEditForm({ ...editForm, usa_fgts: v })}
                id="usa-fgts"
              />
              <Label htmlFor="usa-fgts">Usa FGTS</Label>
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={editForm.observacoes}
                onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })}
                rows={4}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => editarLead.mutate()} disabled={editarLead.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
