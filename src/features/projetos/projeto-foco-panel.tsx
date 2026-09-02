// Painel "Projeto em foco" — histórico de campanhas de destaque e ativação de
// um novo foco (gestor/admin). Mesmo payload e fluxo da rota; as mutations
// continuam na página, este painel só apresenta e coleta o formulário.
//
// 2026-09-02 (decisões 14 e 22): a campanha pode ser PROGRAMADA (início no
// futuro — entra sozinha na prateleira na data) e ter ARTE própria para o
// banner (sem arte, a prateleira usa a capa do projeto).

import { CalendarClock, Image as ImageIcon, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { focoProgramado, focoVigente, rotuloUrgencia, diasRestantes } from "@/lib/prateleira";

/** Linha do banco; `arte_url` chega com a migration da prateleira. */
export type FocoRow = Tables<"projeto_foco"> & { arte_url?: string | null };

export type FocoPayload = {
  motivo: string | null;
  fim: string | null;
  /** null = começa agora; data futura = campanha programada. */
  inicio: string | null;
  arte_url: string | null;
};

function statusDoFoco(
  f: FocoRow,
  agora: number,
): { rotulo: string; tom: "ativo" | "programado" | "encerrado" } {
  if (focoProgramado(f, agora)) return { rotulo: "Programado", tom: "programado" };
  if (focoVigente(f, agora)) return { rotulo: "Ativo", tom: "ativo" };
  return { rotulo: "Encerrado", tom: "encerrado" };
}

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
  const agora = Date.now();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const texto = (k: string) => String(fd.get(k) ?? "").trim();
    onAtivar({
      motivo: texto("motivo") || null,
      inicio: texto("inicio") ? new Date(texto("inicio")).toISOString() : null,
      fim: texto("fim") ? new Date(texto("fim")).toISOString() : null,
      arte_url: texto("arte_url") || null,
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
                  <DialogDescription>
                    O empreendimento sobe para o banner e o topo da prateleira dos corretores.
                    Ativar um novo foco encerra o anterior; um foco programado deixa o anterior
                    valendo até a data de início.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <Label htmlFor="motivo">Motivo / campanha</Label>
                    <Input id="motivo" name="motivo" placeholder="ex.: Lançamento, meta do mês" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="inicio">Começar em (opcional)</Label>
                      <Input id="inicio" name="inicio" type="datetime-local" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Vazio começa agora. Data futura programa a campanha.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="fim">Encerrar em (opcional)</Label>
                      <Input id="fim" name="fim" type="datetime-local" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Com data, o card mostra "termina em X dias".
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="arte_url" className="flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Arte do banner (HTTPS, opcional)
                    </Label>
                    <Input
                      id="arte_url"
                      name="arte_url"
                      type="url"
                      inputMode="url"
                      placeholder="https://…/banner-lancamento.jpg"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sem arte, o banner usa a capa do projeto.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button type="submit" loading={ativarPending}>
                      Salvar campanha
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
                ? "Ative o foco para destacar o empreendimento na prateleira dos corretores."
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
              {focos.map((f) => {
                const status = statusDoFoco(f, agora);
                const urg =
                  status.tom === "ativo" ? rotuloUrgencia(diasRestantes(f.fim, agora)) : null;
                return (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {f.arte_url && (
                          <img
                            src={f.arte_url}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            className="h-8 w-12 rounded object-cover"
                          />
                        )}
                        <span>{f.motivo || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(f.inicio).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {f.fim ? new Date(f.fim).toLocaleString("pt-BR") : "—"}
                      {urg && <span className="ml-1 text-muted-foreground">({urg})</span>}
                    </TableCell>
                    <TableCell>
                      {status.tom === "ativo" ? (
                        <Badge>{status.rotulo}</Badge>
                      ) : status.tom === "programado" ? (
                        <Badge variant="secondary" className="gap-1">
                          <CalendarClock className="h-3 w-3" aria-hidden="true" />
                          {status.rotulo}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{status.rotulo}</Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {f.ativo && status.tom !== "encerrado" && (
                          <Button size="sm" variant="ghost" onClick={() => onDesativar(f.id)}>
                            {status.tom === "programado" ? "Cancelar" : "Encerrar"}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
