// Aba Corretores — os dados de DISTRIBUIÇÃO de cada corretor num lugar só:
// presença de hoje, zonas atendidas, vínculo (fixo/autônomo), onboarding,
// filas em que participa e carteira (WIP) contra o disjuntor. A edição de
// zonas saiu da página de Pessoas (lá virou leitura) e presença deixou de
// ser exclusividade da aba Plantão. Escrita SEMPRE por RPC auditada:
// marcar_presenca_admin e atualizar_corretor_distribuicao.

import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserX } from "lucide-react";
import { ZONAS_ORDEM, type Zona } from "@/lib/zonas";
import {
  useAtualizarCorretorDistribuicao,
  useCorretoresDistribuicao,
  useMarcarPresencaAdmin,
  useRoletasPorCorretor,
  useWipCorretores,
  type CorretorDistribuicao,
} from "./queries";

const SEM_MODELO = "__pendente__";

export function TabCorretores({ somenteLeitura }: { somenteLeitura: boolean }) {
  const corretoresQ = useCorretoresDistribuicao();
  const roletasQ = useRoletasPorCorretor();
  const wipQ = useWipCorretores();
  const presenca = useMarcarPresencaAdmin();
  const atualizar = useAtualizarCorretorDistribuicao();

  const linhas = corretoresQ.data ?? [];
  const temWip = wipQ.data !== null && wipQ.data !== undefined;
  const temV2 = linhas.some((c) => c.v2 !== null);

  if (corretoresQ.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Elegibilidade do corretor para TODAS as filas: presença do dia, zonas atendidas, vínculo e
          onboarding (exigidos pelo motor v2) e carteira contra o teto. O cadastro geral (telefone,
          equipe, papel) continua em Configurações → Pessoas.
        </p>

        <Card>
          <CardContent className="overflow-x-auto pt-4">
            {linhas.length === 0 ? (
              <EmptyState
                icon={UserX}
                title="Nenhum corretor com papel de corretor"
                description="Convide e ative corretores em Configurações → Pessoas."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corretor</TableHead>
                    <TableHead>Presença hoje</TableHead>
                    <TableHead>Zonas</TableHead>
                    {temV2 && <TableHead>Vínculo</TableHead>}
                    {temV2 && <TableHead>Onboarding</TableHead>}
                    <TableHead>Filas em que participa</TableHead>
                    {temWip && <TableHead className="text-right">Carteira (WIP)</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((c) => {
                    const filas = roletasQ.data?.get(c.id) ?? [];
                    const wip = wipQ.data?.[c.id];
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {c.nome}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {!c.ativo && <StatusBadge intent="neutral">Inativo</StatusBadge>}
                            {!c.telefone && (
                              <StatusBadge intent="warning">Sem telefone</StatusBadge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={c.presente}
                              disabled={somenteLeitura || presenca.isPending}
                              onCheckedChange={(v) =>
                                presenca.mutate({ corretorId: c.id, presente: v })
                              }
                              aria-label={`Presença de ${c.nome}`}
                            />
                            {c.presente ? (
                              <StatusBadge intent="success">Presente</StatusBadge>
                            ) : (
                              <StatusBadge intent="neutral">Ausente</StatusBadge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {somenteLeitura ? (
                            <ZonasBadges zonas={c.zonas} />
                          ) : (
                            <ZonasEditor
                              corretor={c}
                              onSalvar={(zonas) => atualizar.mutate({ corretorId: c.id, zonas })}
                              pending={atualizar.isPending}
                            />
                          )}
                        </TableCell>
                        {temV2 && (
                          <TableCell>
                            {c.v2 ? (
                              <Select
                                value={c.v2.modelo_contrato ?? SEM_MODELO}
                                disabled={somenteLeitura || atualizar.isPending}
                                onValueChange={(v) =>
                                  atualizar.mutate({
                                    corretorId: c.id,
                                    modeloContrato:
                                      v === SEM_MODELO ? null : (v as "fixo" | "autonomo"),
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={SEM_MODELO}>
                                    <span className="text-warning">Pendente</span>
                                  </SelectItem>
                                  <SelectItem value="fixo">Fixo</SelectItem>
                                  <SelectItem value="autonomo">Autônomo</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {temV2 && (
                          <TableCell>
                            {c.v2 ? (
                              <label className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={!!c.v2.onboarding_concluido_em}
                                  disabled={somenteLeitura || atualizar.isPending}
                                  onCheckedChange={(v) =>
                                    atualizar.mutate({
                                      corretorId: c.id,
                                      onboardingConcluido: v === true,
                                    })
                                  }
                                />
                                {c.v2.onboarding_concluido_em ? (
                                  <span className="tabular-nums">
                                    {new Date(c.v2.onboarding_concluido_em).toLocaleDateString(
                                      "pt-BR",
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-warning">Pendente</span>
                                )}
                              </label>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          {filas.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Nenhuma</span>
                          ) : (
                            <div className="flex max-w-64 flex-wrap gap-1">
                              {filas.map((f) => (
                                <Badge key={f.slug} variant="secondary" className="text-[10px]">
                                  {f.nome}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        {temWip && (
                          <TableCell className="text-right tabular-nums">
                            {wip ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={
                                      wip.leads_ativos >= wip.disjuntor
                                        ? "font-semibold text-destructive"
                                        : undefined
                                    }
                                  >
                                    {wip.leads_ativos}/{wip.disjuntor}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {wip.leads_ativos} leads ativos · teto (disjuntor) de{" "}
                                  {wip.disjuntor}. No teto, o corretor para de receber até dar
                                  baixa.
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function ZonasBadges({ zonas }: { zonas: string[] }) {
  if (zonas.length === 0) return <span className="text-muted-foreground">Todas</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {zonas.map((z) => (
        <Badge key={z} variant="secondary">
          {z}
        </Badge>
      ))}
    </div>
  );
}

/** Zonas atendidas — rascunho + Salvar (padrão da casa), gravando pela RPC
 *  auditada. Nenhuma marcada = recebe de todas. */
function ZonasEditor({
  corretor,
  onSalvar,
  pending,
}: {
  corretor: CorretorDistribuicao;
  onSalvar: (zonas: string[]) => void;
  pending: boolean;
}) {
  const [rascunho, setRascunho] = useState<Set<string> | null>(null);
  const atual = new Set(corretor.zonas);
  const marcadas = rascunho ?? atual;
  const mudou =
    rascunho !== null && (rascunho.size !== atual.size || [...rascunho].some((z) => !atual.has(z)));

  const toggle = (z: Zona) => {
    const next = new Set(marcadas);
    if (next.has(z)) next.delete(z);
    else next.add(z);
    setRascunho(next);
  };

  return (
    <Popover onOpenChange={(o) => !o && setRascunho(null)}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 min-w-[120px] justify-start gap-1">
          {corretor.zonas.length === 0 ? (
            <span className="text-muted-foreground">Todas</span>
          ) : (
            <span className="truncate">{corretor.zonas.join(", ")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          Sem marcação, recebe leads de todas as zonas.
        </p>
        {ZONAS_ORDEM.map((z) => (
          <label
            key={z}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
          >
            <Checkbox checked={marcadas.has(z)} onCheckedChange={() => toggle(z)} />
            {z}
          </label>
        ))}
        {mudou && (
          <div className="pt-2">
            <Button
              size="sm"
              className="w-full"
              disabled={pending}
              onClick={() => {
                onSalvar(ZONAS_ORDEM.filter((z) => marcadas.has(z)));
                setRascunho(null);
              }}
            >
              <Check className="mr-1 h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
