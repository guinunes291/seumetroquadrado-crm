import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, MessageSquare } from "lucide-react";
import { CANAL_LABEL, extractVariables, type TemplateCanal } from "@/lib/templates";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({ meta: [{ title: "Templates de mensagem — Seu Metro Quadrado" }] }),
  component: TemplatesPage,
});

type Template = {
  id: string;
  nome: string;
  canal: TemplateCanal;
  assunto: string | null;
  conteudo: string;
  ativo: boolean;
  projeto_id: string | null;
  created_at: string;
};

const CANAIS: TemplateCanal[] = ["whatsapp", "email", "sms", "interno"];

export function TemplatesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({
    nome: "",
    canal: "whatsapp" as TemplateCanal,
    assunto: "",
    conteudo: "",
    ativo: true,
    projeto_id: null as string | null,
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("templates_mensagem")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  function resetForm() {
    setForm({
      nome: "",
      canal: "whatsapp",
      assunto: "",
      conteudo: "",
      ativo: true,
      projeto_id: null,
    });
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({
      nome: t.nome,
      canal: t.canal,
      assunto: t.assunto ?? "",
      conteudo: t.conteudo,
      ativo: t.ativo,
      projeto_id: t.projeto_id,
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (form.nome.trim().length < 2) throw new Error("Dê um nome ao template.");
      if (form.conteudo.trim().length < 5) throw new Error("Conteúdo muito curto.");
      const payload = {
        nome: form.nome.trim(),
        canal: form.canal,
        assunto: form.assunto.trim() || null,
        conteudo: form.conteudo,
        ativo: form.ativo,
        projeto_id: form.projeto_id,
      };
      if (editing) {
        const { error } = await supabase
          .from("templates_mensagem")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("templates_mensagem")
          .insert({ ...payload, criado_por: u.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Template atualizado" : "Template criado");
      setOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates_mensagem").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template removido");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const variaveis = extractVariables(form.conteudo);

  return (
    <div>
      <PageHeader
        title="Templates de mensagem"
        description="Modelos reutilizáveis para WhatsApp, e-mail e SMS. Use {{nome}}, {{projeto}} e {{corretor}} como variáveis."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> Novo template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar template" : "Novo template"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input
                      value={form.nome}
                      onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <Label>Canal</Label>
                    <Select
                      value={form.canal}
                      onValueChange={(v) => setForm({ ...form, canal: v as TemplateCanal })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CANAIS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CANAL_LABEL[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.canal === "email" && (
                  <div>
                    <Label>Assunto</Label>
                    <Input
                      value={form.assunto}
                      onChange={(e) => setForm({ ...form, assunto: e.target.value })}
                      maxLength={200}
                    />
                  </div>
                )}

                <div>
                  <Label>Empreendimento (opcional)</Label>
                  <Select
                    value={form.projeto_id ?? "all"}
                    onValueChange={(v) => setForm({ ...form, projeto_id: v === "all" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os empreendimentos</SelectItem>
                      {projetos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Conteúdo</Label>
                  <Textarea
                    value={form.conteudo}
                    onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                    rows={8}
                    maxLength={4000}
                    placeholder="Olá {{nome}}, tudo bem? Sou {{corretor}} e estou acompanhando seu interesse no {{projeto}}."
                  />
                  {variaveis.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">Variáveis:</span>
                      {variaveis.map((v) => (
                        <Badge
                          key={v}
                          variant="outline"
                          className="text-[10px]"
                        >{`{{${v}}}`}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.ativo}
                    onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                  />
                  <Label className="cursor-pointer">Template ativo</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">Nenhum template criado</div>
            <div className="text-sm text-muted-foreground mt-1">
              Crie modelos prontos para acelerar follow-ups e propostas.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-medium">{t.nome}</div>
                    <div className="mt-1 flex gap-1">
                      <Badge variant="outline">{CANAL_LABEL[t.canal]}</Badge>
                      {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Remover "${t.nome}"?`)) remove.mutate(t.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {t.assunto && (
                  <div className="text-xs text-muted-foreground mb-1">Assunto: {t.assunto}</div>
                )}
                <p className="text-sm whitespace-pre-wrap text-muted-foreground line-clamp-5">
                  {t.conteudo}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
