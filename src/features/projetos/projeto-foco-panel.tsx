// Painel "Projeto em foco" — histórico de campanhas de destaque e ativação de
// um novo foco (gestor/admin). Mesmo payload e fluxo da rota; as mutations
// continuam na página, este painel só apresenta e coleta o formulário.

import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";

export type FocoRow = Tables<"projeto_foco">;

export type FocoPayload = { motivo: string | null; fim: string | null };

export function ProjetoFocoPanel({
  focos,
  loading,
  canManage,
  open,
  onOpenChange,
  onAtivar,
  ativarPending,
  onDesativar,
}: {
  focos: FocoRow[];
  loading?: boolean;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAtivar: (payload: FocoPayload) => void;
  ativarPending?: boolean;
  onDesativar: (id: string) => void;
}) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAtivar({
      motivo: (fd.get("motivo") || null) as string | null,
      fim: fd.get("fim") ? new Date(String(fd.get("fim"))).toISOString() : null,
    });
  };

  return (
    <section aria-label="Projeto em foco">
      <SectionHeader
        eyebrow="Campanhas"
        title="Projeto em foco"
        action={
          canManage ? (
            <Dialog open={open} onOpenChange={onOpenChange}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Star className="mr-1 h-4 w-4" />
                  Ativar foco
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ativar projeto em foco</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <Label htmlFor="motivo">Motivo / campanha</Label>
                    <Input id="motivo" name="motivo" placeholder="ex.: Lançamento, meta do mês" />
                  </div>
                  <div>
                    <Label htmlFor="fim">Encerrar em (opcional)</Label>
                    <Input id="fim" name="fim" type="datetime-local" />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={ativarPending}>
                      Ativar
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      <div className="overflow-hidden rounded-xl border border-border-subtle bg-card shadow-elev-1">
        {loading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : focos.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Este projeto nunca foi destacado."
            description={
              canManage
                ? "Ative o foco para destacar o empreendimento nas telas dos corretores."
                : undefined
            }
            className="m-4 border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {focos.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.motivo || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {new Date(f.inicio).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {f.fim ? new Date(f.fim).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    {f.ativo ? <Badge>Ativo</Badge> : <Badge variant="outline">Encerrado</Badge>}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      {f.ativo && (
                        <Button size="sm" variant="ghost" onClick={() => onDesativar(f.id)}>
                          Encerrar
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
