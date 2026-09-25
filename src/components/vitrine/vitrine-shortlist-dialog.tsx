import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Check, Copy, FilePdf, Link, Scales, Trash, X } from "@phosphor-icons/react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { imagemExibivel } from "@/lib/imagem-url";
import { parsePlantas, type PlantaProjeto } from "@/lib/plantas";
import {
  formatBRL,
  formatDormsRange,
  formatEntrega,
  formatM2Range,
  formatVagasRange,
} from "@/lib/projetos";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import { cn } from "@/lib/utils";
import { createVitrineLink, listVitrineLinks, revokeVitrineLink } from "@/lib/vitrine-links-client";
import type { PerfilCliente } from "@/lib/vitrine/poder-de-compra";
import {
  avaliarEncaixe,
  perfilDoLead,
  perfilTemDados,
  resumoDoPerfil,
  ROTULO_NIVEL,
  type Encaixe,
  type NivelEncaixe,
  type PerfilComparativo,
} from "@/features/comparativo/encaixe";
import { buscarPerfilDoLead, leadPerfilQueryKey } from "@/features/comparativo/lead-perfil-query";
import { useRegistrarEventoProjeto } from "@/features/projetos/use-projeto-eventos";

type Props = {
  projects: ProjetoRow[];
  leadId: string | null;
  leadName?: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  /**
   * Simulador da Vitrine: quando o corretor preencheu renda ali, ele manda na
   * parte financeira do encaixe (é a conta que ele está olhando na tela).
   */
  perfilSimulador?: PerfilCliente | null;
  /** De onde veio o comparativo (evento da prateleira). */
  origem?: string;
};

/** Perfil do lead + simulador da Vitrine (o simulador manda no financeiro). */
function combinarPerfil(
  doLead: PerfilComparativo | null,
  simulador: PerfilCliente | null | undefined,
): PerfilComparativo | null {
  if (!simulador || simulador.renda == null || simulador.renda <= 0) return doLead;
  const base: PerfilComparativo = doLead ?? {
    renda: null,
    fgts: 0,
    entrada: 0,
    temDependente: false,
    carteira3anos: false,
    zona: null,
    bairro: null,
    dormsDesejados: null,
    precisaVaga: null,
    prioridades: [],
  };
  return {
    ...base,
    renda: simulador.renda,
    fgts: simulador.fgts,
    entrada: simulador.entrada + simulador.reforcoAnual,
    temDependente: simulador.temDependente,
    carteira3anos: simulador.carteira3anos,
  };
}

/** Plantas dos projetos (coluna nova: sem a migration, segue sem plantas). */
async function buscarPlantas(ids: string[]): Promise<Record<string, PlantaProjeto[]>> {
  const { data, error } = await supabase.from("projetos").select("id, plantas").in("id", ids);
  if (error) {
    if (isMissingBackendObject(error)) return {};
    throw error;
  }
  return Object.fromEntries((data ?? []).map((r) => [r.id, parsePlantas(r.plantas)]));
}

export function VitrineShortlist({
  projects,
  leadId,
  leadName,
  onRemove,
  onClear,
  perfilSimulador,
  origem = "prateleira",
}: Props) {
  const [open, setOpen] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [mensagemTocada, setMensagemTocada] = useState(false);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const { user } = useAuth();
  const registrarEvento = useRegistrarEventoProjeto();
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

  const perfilQ = useQuery({
    queryKey: leadPerfilQueryKey(leadId),
    enabled: open && !!leadId,
    staleTime: 30_000,
    queryFn: () => buscarPerfilDoLead(leadId!),
  });

  const corretorQ = useQuery({
    queryKey: ["comparativo-corretor", user?.id],
    enabled: open && !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, telefone, creci")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // A nota do perfil do lead é o ponto de partida da mensagem da capa; depois
  // que o corretor mexe no texto, a nota do banco não sobrescreve mais.
  const notaPerfil = perfilQ.data?.nota_perfil_cliente ?? "";
  useEffect(() => {
    if (!mensagemTocada) setMensagem(notaPerfil);
  }, [notaPerfil, mensagemTocada]);

  const perfil = useMemo(
    () => combinarPerfil(perfilQ.data ? perfilDoLead(perfilQ.data) : null, perfilSimulador),
    [perfilQ.data, perfilSimulador],
  );
  const temPerfil = perfilTemDados(perfil);
  const encaixes = useMemo(
    () => new Map(projects.map((p) => [p.id, avaliarEncaixe(perfil, p)])),
    [projects, perfil],
  );

  const gerarPdf = async () => {
    setGerandoPdf(true);
    try {
      const [{ montarComparativo }, { imprimirComparativo }, plantas] = await Promise.all([
        import("@/features/comparativo/comparativo"),
        import("@/features/comparativo/comparativo-pdf"),
        buscarPlantas(projects.map((p) => p.id)),
      ]);
      const comparativo = montarComparativo({
        clienteNome: perfilQ.data?.nome ?? leadName ?? null,
        corretor: {
          nome: corretorQ.data?.nome ?? null,
          telefone: corretorQ.data?.telefone ?? null,
          creci: corretorQ.data?.creci ?? null,
        },
        perfil,
        projetos: projects.map((p) => ({ ...p, plantas: plantas[p.id] ?? [] })),
        mensagem,
        notasPorProjeto: notas,
        geradoEm: new Date(),
      });
      await imprimirComparativo(comparativo);
      for (const p of projects) {
        registrarEvento({ tipo: "comparativo_pdf", projetoId: p.id, leadId, origem });
      }
      toast.success("Comparativo pronto — escolha “Salvar como PDF” na impressão.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

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
      setMensagemTocada(false);
      setNotas({});
    }
  };

  return (
    <>
      <aside className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 mx-auto flex max-w-4xl flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center md:bottom-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
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
            <Scales className="mr-2 h-4 w-4" /> Comparar
          </Button>
        </div>
      </aside>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comparar empreendimentos</DialogTitle>
            <DialogDescription>
              Compare lado a lado, gere o PDF para o cliente (com fotos, plantas e o encaixe no
              perfil) ou crie um link temporário sem dados pessoais.
            </DialogDescription>
          </DialogHeader>

          {leadId && (
            <PerfilResumo
              carregando={perfilQ.isLoading}
              resumo={resumoDoPerfil(perfil)}
              leadId={leadId}
            />
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-36 px-3 py-3 text-left text-xs text-muted-foreground">
                    Critério
                  </th>
                  {projects.map((project) => {
                    const capa = imagemExibivel(project.capa_url);
                    return (
                      <th
                        key={project.id}
                        className="px-3 py-3 text-left align-bottom font-semibold"
                      >
                        {capa ? (
                          <img
                            src={capa}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="mb-2 h-20 w-full rounded-md object-cover"
                          />
                        ) : (
                          <div className="mb-2 h-20 w-full rounded-md border border-dashed bg-muted/40" />
                        )}
                        {project.nome}
                      </th>
                    );
                  })}
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
                  label="Vagas"
                  projects={projects}
                  value={(p) =>
                    formatVagasRange(p.vagas_min, p.vagas_max, p.vagas_observacao) ?? "A confirmar"
                  }
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
                <CompareRow
                  label="Diferenciais"
                  projects={projects}
                  value={(p) => {
                    const d = (p.diferenciais ?? []).filter(Boolean);
                    return d.length
                      ? d.slice(0, 4).join(" · ") + (d.length > 4 ? ` +${d.length - 4}` : "")
                      : "A confirmar";
                  }}
                />
                {temPerfil && (
                  <tr className="border-b last:border-0">
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                      Encaixe no perfil
                    </th>
                    {projects.map((project) => (
                      <td key={project.id} className="px-3 py-3 align-top">
                        <EncaixeCelula encaixe={encaixes.get(project.id) ?? null} />
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-semibold">PDF para o cliente</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Fotos, plantas, ficha, lazer e o porquê de cada indicação. Vai só o primeiro nome do
                cliente — sem telefone, comissão ou dado interno.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="comparativo-mensagem" className="text-xs font-medium">
                Mensagem para o cliente (capa)
              </label>
              <Textarea
                id="comparativo-mensagem"
                rows={3}
                maxLength={1200}
                placeholder="Ex.: Separei três opções na Zona Leste que cabem no que conversamos, todas com lazer para as crianças. A primeira é a que eu mais recomendo pelo prazo de entrega."
                value={mensagem}
                onChange={(e) => {
                  setMensagemTocada(true);
                  setMensagem(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {projects.map((project) => (
                <div key={project.id} className="space-y-1">
                  <label
                    htmlFor={`comparativo-nota-${project.id}`}
                    className="block truncate text-xs font-medium"
                  >
                    Por que indico o {project.nome}
                  </label>
                  <Input
                    id={`comparativo-nota-${project.id}`}
                    maxLength={300}
                    placeholder={project.perfil_ideal?.slice(0, 80) || "Opcional"}
                    value={notas[project.id] ?? ""}
                    onChange={(e) => setNotas({ ...notas, [project.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button type="button" disabled={gerandoPdf} onClick={gerarPdf}>
                <FilePdf className="mr-2 h-4 w-4" />
                {gerandoPdf ? "Preparando PDF…" : "Gerar PDF"}
              </Button>
            </div>
          </section>

          {!leadId ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Para gerar o link público (e usar o perfil do cliente no PDF), abra a Vitrine pelo
              dossiê de um lead.
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
                  <Trash className="mr-2 h-4 w-4" /> Revogar agora
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
                <Link className="mr-2 h-4 w-4" />
                {createMutation.isPending ? "Criando…" : "Criar link"}
              </Button>
            </div>
          )}

          {leadId && activeLinks.length > 0 && !generated && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Links ativos recentes</p>
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

const TOM_NIVEL: Record<NivelEncaixe, string> = {
  otimo: "border-success/40 bg-success/10 text-success",
  bom: "border-primary/40 bg-primary/10 text-primary",
  parcial: "border-warning/40 bg-warning/10 text-warning",
  sem_dados: "border-border bg-muted text-muted-foreground",
};

function EncaixeCelula({ encaixe }: { encaixe: Encaixe | null }) {
  const nivel = encaixe?.nivel ?? "sem_dados";
  return (
    <div className="space-y-1.5">
      <span
        className={cn(
          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          TOM_NIVEL[nivel],
        )}
      >
        {ROTULO_NIVEL[nivel]}
      </span>
      {encaixe && (
        <ul className="space-y-0.5 text-xs">
          {encaixe.pontos.slice(0, 3).map((t) => (
            <li key={t} className="text-foreground">
              ✓ {t}
            </li>
          ))}
          {encaixe.atencao.slice(0, 2).map((t) => (
            <li key={t} className="text-warning">
              ! {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PerfilResumo({
  carregando,
  resumo,
  leadId,
}: {
  carregando: boolean;
  resumo: string[];
  leadId: string;
}) {
  if (carregando) return null;
  if (resumo.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Este lead ainda não tem perfil mapeado — o PDF sai sem a parte “por que combina com você”.
        Preencha quartos, vaga e prioridades em{" "}
        <RouterLink className="underline" to="/leads/$leadId" params={{ leadId }}>
          Qualificação → Perfil do cliente
        </RouterLink>
        .
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-xs">
      <span className="font-medium">O cliente procura: </span>
      {resumo.join(" · ")}
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
