import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Scale, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ProjetoRow } from "@/components/projeto-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatDormsRange, formatEntrega, formatM2Range } from "@/lib/projetos";
import { createVitrineLink, listVitrineLinks, revokeVitrineLink } from "@/lib/vitrine-links-client";

type Props = {
  projects: ProjetoRow[];
  leadId: string | null;
  leadName?: string;
  onRemove: (id: string) => void;
  onClear: () => void;
};

export function VitrineShortlist({ projects, leadId, leadName, onRemove, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [generated, setGenerated] = useState<{
    id: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const queryClient = useQueryClient();

  const linksQ = useQuery({
    queryKey: ["vitrine-links", leadId],
    enabled: open && !!leadId,
    staleTime: 30_000,
    queryFn: () => listVitrineLinks(leadId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createVitrineLink({
        leadId: leadId!,
        projectIds: projects.map((project) => project.id),
        expiresInDays,
      }),
    onSuccess: (result) => {
      const url = new URL(result.path, window.location.origin).toString();
      setGenerated({ id: result.id, url, expiresAt: result.expires_at });
      void queryClient.invalidateQueries({ queryKey: ["vitrine-links", leadId] });
      toast.success("Link seguro criado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao criar link"),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeVitrineLink,
    onSuccess: (_, linkId) => {
      if (generated?.id === linkId) setGenerated(null);
      void queryClient.invalidateQueries({ queryKey: ["vitrine-links", leadId] });
      toast.success("Link revogado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao revogar"),
  });

  if (projects.length === 0) return null;

  const canCompare = projects.length >= 2;
  const activeLinks = (linksQ.data ?? []).filter(
    (link) => !link.revoked_at && new Date(link.expires_at).getTime() > Date.now(),
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setGenerated(null);
      createMutation.reset();
    }
  };

  return (
    <>
      <aside className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 mx-auto flex max-w-4xl flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center md:bottom-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Comparação · {projects.length}/3
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {projects.map((project) => (
              <span
                key={project.id}
                className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-accent py-1 pl-3 text-xs"
              >
                <span className="truncate">{project.nome}</span>
                <button
                  type="button"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-background"
                  aria-label={`Remover ${project.nome} da comparação`}
                  onClick={() => onRemove(project.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          {!canCompare && (
            <p className="mt-1 text-xs text-muted-foreground">Escolha mais um empreendimento.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Limpar
          </Button>
          <Button type="button" size="sm" disabled={!canCompare} onClick={() => setOpen(true)}>
            <Scale className="mr-2 h-4 w-4" /> Comparar
          </Button>
        </div>
      </aside>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comparar shortlist</DialogTitle>
            <DialogDescription>
              Compare os pontos principais e crie um link temporário sem dados pessoais.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-36 px-3 py-3 text-left text-xs text-muted-foreground">
                    Critério
                  </th>
                  {projects.map((project) => (
                    <th key={project.id} className="px-3 py-3 text-left font-semibold">
                      {project.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  label="Local"
                  projects={projects}
                  value={(p) =>
                    [p.bairro, p.zona_smq ? `Zona ${p.zona_smq}` : null]
                      .filter(Boolean)
                      .join(" · ") || "A confirmar"
                  }
                />
                <CompareRow
                  label="Preço"
                  projects={projects}
                  value={(p) =>
                    p.sob_consulta || p.preco_a_partir == null
                      ? "Sob consulta"
                      : formatBRL(p.preco_a_partir)
                  }
                />
                <CompareRow
                  label="Dormitórios"
                  projects={projects}
                  value={(p) => formatDormsRange(p.dorms_min, p.dorms_max) ?? "A confirmar"}
                />
                <CompareRow
                  label="Metragem"
                  projects={projects}
                  value={(p) => formatM2Range(p.metragem_min, p.metragem_max) ?? "A confirmar"}
                />
                <CompareRow
                  label="Entrega"
                  projects={projects}
                  value={(p) =>
                    formatEntrega(p.status_entrega, p.mes_entrega, p.ano_entrega) ?? "A confirmar"
                  }
                />
                <CompareRow
                  label="Renda sugerida"
                  projects={projects}
                  value={(p) =>
                    p.renda_minima == null ? "A confirmar" : formatBRL(p.renda_minima)
                  }
                />
              </tbody>
            </table>
          </div>

          {!leadId ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              A comparação está pronta. Para gerar o link, abra a Vitrine pelo dossiê de um lead.
            </div>
          ) : generated ? (
            <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
              <p className="flex items-center gap-2 font-semibold">
                <Check className="h-4 w-4" /> Link pronto para {leadName || "o lead"}
              </p>
              <p className="break-all rounded-md bg-white/80 p-2 font-mono text-xs">
                {generated.url}
              </p>
              <p className="text-xs">
                Expira em {formatDateTime(generated.expiresAt)}. O endereço não poderá ser
                recuperado depois que esta janela fechar.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generated.url);
                      toast.success("Link copiado");
                    } catch {
                      toast.error("Não foi possível copiar. Selecione o endereço manualmente.");
                    }
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copiar link
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(generated.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Revogar agora
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <p className="font-semibold">Link público temporário</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sem nome, telefone ou qualquer outro dado do lead. O token é exibido uma única
                  vez.
                </p>
              </div>
              <div className="w-full sm:w-40">
                <span className="mb-1 block text-xs font-medium">Validade</span>
                <Select
                  value={String(expiresInDays)}
                  onValueChange={(value) => setExpiresInDays(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 dia</SelectItem>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="14">14 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                <Link2 className="mr-2 h-4 w-4" />
                {createMutation.isPending ? "Criando…" : "Criar link"}
              </Button>
            </div>
          )}

          {leadId && activeLinks.length > 0 && !generated && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Links ativos recentes
              </p>
              {activeLinks.slice(0, 3).map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div>
                    <p>{link.projects.map((project) => project.name).join(" · ")}</p>
                    <p className="text-xs text-muted-foreground">
                      Expira em {formatDateTime(link.expires_at)} · o endereço não é armazenado
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(link.id)}
                  >
                    Revogar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {leadId && linksQ.isError && !generated && (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível consultar os links ativos. A comparação continua disponível; tente
              reabrir esta janela antes de criar outro link.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CompareRow({
  label,
  projects,
  value,
}: {
  label: string;
  projects: ProjetoRow[];
  value: (project: ProjetoRow) => string;
}) {
  return (
    <tr className="border-b last:border-0">
      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">{label}</th>
      {projects.map((project) => (
        <td key={project.id} className="px-3 py-3 font-medium">
          {value(project)}
        </td>
      ))}
    </tr>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
