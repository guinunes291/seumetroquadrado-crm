// Gestão da lista de construtoras parceiras (admin/gestor).
//
// Ordem é decisão comercial, não alfabética: as setas movem a parceira na
// leitura da bancada. Desativar é mais brando que excluir e preserva a ordem —
// parceria que volta não precisa ser recadastrada.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Building2, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { chaveConstrutora, type Parceira } from "@/lib/construtoras";
import { CONSTRUTORAS_PARCEIRAS_KEY } from "./use-construtoras-parceiras";

export function ConstrutorasParceirasDialog({
  open,
  onOpenChange,
  parceiras,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parceiras: Parceira[];
}) {
  const qc = useQueryClient();
  const [nova, setNova] = useState("");

  const invalidar = () => qc.invalidateQueries({ queryKey: CONSTRUTORAS_PARCEIRAS_KEY });

  const adicionar = useMutation({
    mutationFn: async (nome: string) => {
      const limpo = nome.trim();
      if (!limpo) throw new Error("Informe o nome da construtora.");
      if (parceiras.some((p) => chaveConstrutora(p.nome) === chaveConstrutora(limpo))) {
        throw new Error(`"${limpo}" já está na lista.`);
      }
      const { data: u } = await supabase.auth.getUser();
      // Entra no fim da fila; a gestão sobe com as setas se for prioridade.
      const ordem = (parceiras.at(-1)?.ordem ?? 0) + 10;
      const { error } = await supabase
        .from("construtoras_parceiras")
        .insert({ nome: limpo, ordem, criado_por: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Construtora adicionada");
      setNova("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: async (payload: { id: string; ativo?: boolean; ordem?: number }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("construtoras_parceiras").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("construtoras_parceiras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Construtora removida da lista");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Trocar a ordem é trocar os dois valores — mantém os saltos de 10 e não
  // exige renumerar a lista inteira a cada movimento.
  const mover = (indice: number, direcao: -1 | 1) => {
    const atual = parceiras[indice];
    const vizinho = parceiras[indice + direcao];
    if (!atual || !vizinho) return;
    atualizar.mutate({ id: atual.id, ordem: vizinho.ordem });
    atualizar.mutate({ id: vizinho.id, ordem: atual.ordem });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Construtoras parceiras</DialogTitle>
          <DialogDescription>
            Quem aparece no topo da bancada dos corretores, na ordem definida aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="nova-parceira">Adicionar construtora</Label>
              <Input
                id="nova-parceira"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionar.mutate(nova);
                  }
                }}
                placeholder="Ex.: Lavvi"
                className="mt-1"
                maxLength={120}
              />
            </div>
            <Button onClick={() => adicionar.mutate(nova)} loading={adicionar.isPending}>
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>

          {parceiras.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Nenhuma construtora parceira"
              description="Adicione as construtoras que o time trabalha para elas abrirem a bancada."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
              {parceiras.map((p, i) => (
                <li
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2",
                    !p.ativo && "bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{p.nome}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Subir ${p.nome}`}
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Descer ${p.nome}`}
                    disabled={i === parceiras.length - 1}
                    onClick={() => mover(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={p.ativo ? `Desativar ${p.nome}` : `Ativar ${p.nome}`}
                    title={p.ativo ? "Desativar" : "Ativar"}
                    onClick={() => atualizar.mutate({ id: p.id, ativo: !p.ativo })}
                  >
                    {p.ativo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${p.nome}`}
                    title="Remover da lista"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Remover "${p.nome}" das parceiras em foco?`)) {
                        remover.mutate(p.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            Os projetos entram pela construtora cadastrada na ficha. O nome não precisa ser
            idêntico: "Cury" casa com "Cury Construtora".
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
