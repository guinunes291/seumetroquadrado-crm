// Gestão dos materiais de venda de UM empreendimento (admin/gestor): lista
// por tipo com subir/descer, ocultar e remover; formulário para adicionar ou
// editar (tipo, título, link, descrição). O tipo é pré-selecionado pelo link
// (lib/projeto-materiais.inferirTipoPelaUrl) — a pessoa cola o Drive e só
// confirma. Book e tabela das colunas antigas do projeto NÃO aparecem aqui:
// continuam no Materiais em massa (/projetos-materiais), que é onde a gestão
// já preenche esses dois.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TIPOS_MATERIAL,
  hostLegivel,
  infoDoTipo,
  inferirTipoPelaUrl,
  moverMaterial,
  proximaOrdem,
  validarMaterial,
  type MaterialRow,
  type ProjetoMaterialTipo,
} from "@/lib/projeto-materiais";
import { cn } from "@/lib/utils";
import { ICONE_MATERIAL } from "./projeto-materiais-section";
import type { SalvarMaterialInput } from "./use-projeto-materiais";

type Form = { tipo: string; titulo: string; url: string; descricao: string };
const FORM_VAZIO: Form = { tipo: "", titulo: "", url: "", descricao: "" };

export type ProjetoMateriaisDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nomeProjeto: string;
  itens: readonly MaterialRow[];
  pending?: boolean;
  onSalvar: (input: SalvarMaterialInput) => void;
  onAlternarAtivo: (id: string, ativo: boolean) => void;
  onRemover: (id: string) => void;
  onReordenar: (mudancas: Array<{ id: string; ordem: number }>) => void;
};

export function ProjetoMateriaisDialog({
  open,
  onOpenChange,
  nomeProjeto,
  itens,
  pending,
  onSalvar,
  onAlternarAtivo,
  onRemover,
  onReordenar,
}: ProjetoMateriaisDialogProps) {
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  // Tipo escolhido à mão não é sobrescrito pelo palpite do link.
  const [tipoManual, setTipoManual] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(FORM_VAZIO);
      setEditando(null);
      setTipoManual(false);
    }
  }, [open]);

  const ordenados = useMemo(() => {
    const ordemTipo = new Map(TIPOS_MATERIAL.map((t, i) => [t.tipo, i]));
    return [...itens].sort((a, b) => {
      const t = (ordemTipo.get(a.tipo) ?? 99) - (ordemTipo.get(b.tipo) ?? 99);
      if (t !== 0) return t;
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    });
  }, [itens]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const aoMudarUrl = (url: string) => {
    const patch: Partial<Form> = { url };
    if (!tipoManual) {
      const palpite = inferirTipoPelaUrl(url);
      if (palpite) patch.tipo = palpite;
    }
    set(patch);
  };

  const iniciarEdicao = (m: MaterialRow) => {
    setEditando(m.id);
    setTipoManual(true);
    setForm({ tipo: m.tipo, titulo: m.titulo, url: m.url, descricao: m.descricao ?? "" });
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setTipoManual(false);
    setForm(FORM_VAZIO);
  };

  const submeter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = validarMaterial(form);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    if (editando) {
      onSalvar({ ...r.valor, id: editando });
    } else {
      onSalvar({ ...r.valor, ordem: proximaOrdem(itens, r.valor.tipo) });
    }
    cancelarEdicao();
  };

  const tipoAtual = form.tipo ? infoDoTipo(form.tipo as ProjetoMaterialTipo) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Materiais de venda — {nomeProjeto}</DialogTitle>
          <DialogDescription>
            Plantas, vídeos, tour, memorial e artes que o corretor abre na ficha. Book e tabela
            principais continuam no Materiais em massa.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={submeter}
          className="space-y-3 rounded-lg border border-border-subtle bg-muted/30 p-3"
        >
          <div className="text-xs font-medium text-muted-foreground">
            {editando ? "Editando material" : "Novo material"}
          </div>
          <div>
            <Label htmlFor="material-url">Link</Label>
            <Input
              id="material-url"
              inputMode="url"
              placeholder="https://drive.google.com/…"
              value={form.url}
              onChange={(e) => aoMudarUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="material-tipo">Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => {
                  setTipoManual(true);
                  set({ tipo: v });
                }}
              >
                <SelectTrigger id="material-tipo">
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_MATERIAL.map((t) => (
                    <SelectItem key={t.tipo} value={t.tipo}>
                      {t.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tipoAtual && <p className="mt-1 text-xs text-muted-foreground">{tipoAtual.dica}</p>}
            </div>
            <div>
              <Label htmlFor="material-titulo">Título</Label>
              <Input
                id="material-titulo"
                placeholder={tipoAtual ? `ex.: ${tipoAtual.rotulo} 2 dorms` : "ex.: Planta 2 dorms"}
                value={form.titulo}
                maxLength={120}
                onChange={(e) => set({ titulo: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="material-descricao">Descrição (opcional)</Label>
            <Textarea
              id="material-descricao"
              rows={2}
              maxLength={300}
              placeholder="ex.: tabela válida até 30/09, condições para FGTS"
              value={form.descricao}
              onChange={(e) => set({ descricao: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            {editando && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicao}>
                Cancelar edição
              </Button>
            )}
            <Button type="submit" size="sm" disabled={pending}>
              {editando ? (
                <>
                  <PencilSimple className="mr-1 h-4 w-4" /> Salvar alterações
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" /> Adicionar
                </>
              )}
            </Button>
          </div>
        </form>

        {ordenados.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            Nenhum material além do book e da tabela principais. Cole o primeiro link acima.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {ordenados.map((m) => {
              const Icone = ICONE_MATERIAL[m.tipo];
              const info = infoDoTipo(m.tipo);
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-border-subtle py-1.5 pl-3 pr-1",
                    !m.ativo && "opacity-60",
                    editando === m.id && "ring-2 ring-ring",
                  )}
                >
                  <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{m.titulo}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {info.rotulo}
                      </Badge>
                      {!m.ativo && (
                        <Badge variant="outline" className="text-[10px]">
                          Oculto
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {hostLegivel(m.url)}
                      {m.descricao ? ` · ${m.descricao}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <IconButton
                      variant="ghost"
                      label="Subir"
                      icon={<ArrowUp className="h-4 w-4" />}
                      className="h-9 min-h-9 w-9 min-w-9"
                      disabled={pending}
                      onClick={() => {
                        const mud = moverMaterial(itens, m.id, "cima");
                        if (mud.length > 0) onReordenar(mud);
                      }}
                    />
                    <IconButton
                      variant="ghost"
                      label="Descer"
                      icon={<ArrowDown className="h-4 w-4" />}
                      className="h-9 min-h-9 w-9 min-w-9"
                      disabled={pending}
                      onClick={() => {
                        const mud = moverMaterial(itens, m.id, "baixo");
                        if (mud.length > 0) onReordenar(mud);
                      }}
                    />
                    <IconButton
                      variant="ghost"
                      label={m.ativo ? "Ocultar da ficha" : "Mostrar na ficha"}
                      icon={
                        m.ativo ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />
                      }
                      className="h-9 min-h-9 w-9 min-w-9"
                      disabled={pending}
                      onClick={() => onAlternarAtivo(m.id, !m.ativo)}
                    />
                    <IconButton
                      variant="ghost"
                      label="Editar"
                      icon={<PencilSimple className="h-4 w-4" />}
                      className="h-9 min-h-9 w-9 min-w-9"
                      disabled={pending}
                      onClick={() => iniciarEdicao(m)}
                    />
                    <IconButton
                      variant="ghost"
                      label="Remover"
                      icon={<Trash className="h-4 w-4" />}
                      className="h-9 min-h-9 w-9 min-w-9 text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Remover “${m.titulo}” da ficha?`)) onRemover(m.id);
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
