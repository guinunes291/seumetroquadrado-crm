// Aba Corretores — os dados de DISTRIBUIÇÃO de cada corretor num lugar só:
// presença de hoje, região de atuação (por filial), vínculo (fixo/autônomo),
// onboarding, filas em que participa e carteira (WIP) contra o disjuntor. A
// edição de zonas saiu da página de Pessoas (lá virou leitura) e presença
// deixou de ser exclusividade da aba Plantão. Escrita SEMPRE por RPC
// auditada: marcar_presenca_admin e atualizar_corretor_distribuicao.
//
// Roletas por filial (decisão do dono, 12/10/2026): a região passa a ser
// escolhida por FILIAL — três caixas "Belém — Leste, Grande SP" —, porque o
// time é da filial inteira (acabou a "região só Oeste"). Por baixo é a mesma
// RPC recebendo a UNIÃO das zonas das filiais marcadas; mandar só parte das
// zonas de uma filial o banco recusa ("a região é por filial").

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Check, UserMinus } from "@phosphor-icons/react";
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
import {
  agruparFiliais,
  filiaisDaRegiao,
  rotuloFilial,
  uniaoDasZonas,
  zonasSoltas,
  type FilialRoleta,
} from "@/lib/distribuicao";
import {
  useAtualizarCorretorDistribuicao,
  useCorretoresDistribuicao,
  useMarcarPresencaAdmin,
  useRoletasPorCorretor,
  useWipCorretores,
  useZonasRoletas,
  type CorretorDistribuicao,
} from "./queries";

const SEM_MODELO = "__pendente__";

export function TabCorretores({ somenteLeitura }: { somenteLeitura: boolean }) {
  const corretoresQ = useCorretoresDistribuicao();
  const roletasQ = useRoletasPorCorretor();
  const wipQ = useWipCorretores();
  const mapaQ = useZonasRoletas();
  const presenca = useMarcarPresencaAdmin();
  const atualizar = useAtualizarCorretorDistribuicao();
  const { user } = useAuth();

  const linhas = corretoresQ.data ?? [];
  const filiais = useMemo(() => agruparFiliais(mapaQ.data ?? []), [mapaQ.data]);
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
          Elegibilidade do corretor para TODAS as filas: presença do dia, região de atuação (as
          filiais em que ele está — só recebe lead das zonas delas, de qualquer origem), vínculo e
          onboarding (exigidos pelo motor v2) e carteira contra o teto. O cadastro geral (telefone,
          equipe, papel) continua em Configurações → Pessoas.
        </p>

        <Card>
          <CardContent className="overflow-x-auto pt-4">
            {linhas.length === 0 ? (
              <EmptyState
                icon={UserMinus}
                title="Nenhum corretor com papel de corretor"
                description="Convide e ative corretores em Configurações → Pessoas."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corretor</TableHead>
                    <TableHead>Presença hoje</TableHead>
                    <TableHead>Região de atuação</TableHead>
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
                              // A própria linha: a gestão não liga a si mesma
                              // (decisão do dono, 13/10/2026) — só desliga.
                              disabled={
                                somenteLeitura ||
                                presenca.isPending ||
                                (c.id === user?.id && !c.presente)
                              }
                              onCheckedChange={(v) =>
                                presenca.mutate({ corretorId: c.id, presente: v })
                              }
                              aria-label={`Presença de ${c.nome}`}
                              aria-describedby={
                                c.id === user?.id && !c.presente
                                  ? `presenca-propria-${c.id}`
                                  : undefined
                              }
                            />
                            {c.presente ? (
                              <StatusBadge intent="success">Presente</StatusBadge>
                            ) : (
                              <StatusBadge intent="neutral">Ausente</StatusBadge>
                            )}
                          </div>
                          {c.id === user?.id && !c.presente && !somenteLeitura && (
                            <p
                              id={`presenca-propria-${c.id}`}
                              className="mt-1 max-w-[16rem] text-xs text-muted-foreground"
                            >
                              Você: o seu check-in é pelo Check-in da barra lateral, com a
                              localização do celular.
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {somenteLeitura ? (
                            <FiliaisBadges zonas={c.zonas} filiais={filiais} />
                          ) : (
                            <FiliaisEditor
                              corretor={c}
                              filiais={filiais}
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
                                    <span className="ml-1 text-muted-foreground">
                                      (
                                      {c.v2.onboarding_concluido_origem === "onboarding"
                                        ? "pela trilha"
                                        : "marcado à mão"}
                                      )
                                    </span>
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

/** Região de atuação: as FILIAIS em que o corretor está inteiro (todas as
 *  zonas da filial na região — o banco espelha as roletas em profiles.zonas).
 *  Zona solta sem filial completa não deve acontecer; se vier, aparece a
 *  zona. Sem região = só recebe lead sem zona. */
function FiliaisBadges({ zonas, filiais }: { zonas: string[]; filiais: FilialRoleta[] }) {
  if (zonas.length === 0) return <StatusBadge intent="warning">Sem região</StatusBadge>;
  const minhas = filiaisDaRegiao(filiais, zonas);
  const soltas = zonasSoltas(filiais, zonas);
  return (
    <div className="flex flex-wrap gap-1">
      {minhas.map((f) => (
        <Badge key={f.slug} variant="secondary">
          {rotuloFilial(f, " · ")}
        </Badge>
      ))}
      {soltas.map((z) => (
        <Badge key={z} variant="outline">
          {z}
        </Badge>
      ))}
    </div>
  );
}

/** Região de atuação por filial — rascunho + Salvar (padrão da casa),
 *  gravando pela RPC auditada, que inclui/remove o corretor da roleta da
 *  filial inteira (a região é uma só: a aba Filas mostra o mesmo time). A
 *  caixa vem marcada quando todas as zonas da filial estão na região; salvar
 *  manda a UNIÃO das zonas das filiais marcadas. Nenhuma marcada = só lead
 *  sem zona. Quem atende a Leste pode estar em duas (Liberdade e Belém). */
function FiliaisEditor({
  corretor,
  filiais,
  onSalvar,
  pending,
}: {
  corretor: CorretorDistribuicao;
  filiais: FilialRoleta[];
  onSalvar: (zonas: string[]) => void;
  pending: boolean;
}) {
  const [rascunho, setRascunho] = useState<Set<string> | null>(null);
  const atual = new Set(filiaisDaRegiao(filiais, corretor.zonas).map((f) => f.slug));
  const marcadas = rascunho ?? atual;
  const mudou =
    rascunho !== null && (rascunho.size !== atual.size || [...rascunho].some((f) => !atual.has(f)));
  const soltas = zonasSoltas(filiais, corretor.zonas);

  const toggle = (slug: string) => {
    const next = new Set(marcadas);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setRascunho(next);
  };

  const resumo = [...filiais.filter((f) => atual.has(f.slug)).map((f) => f.nome), ...soltas].join(
    ", ",
  );

  return (
    <Popover onOpenChange={(o) => !o && setRascunho(null)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-[120px] justify-start gap-1"
          aria-label={`Região de ${corretor.nome}`}
        >
          {corretor.zonas.length === 0 ? (
            <span className="text-warning">Sem região</span>
          ) : (
            <span className="truncate">{resumo || corretor.zonas.join(", ")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          Entra no time da filial e recebe lead das zonas dela, de qualquer origem. Sem marcação, só
          lead sem zona.
        </p>
        {filiais.length === 0 && (
          <p className="px-1 py-1.5 text-xs text-muted-foreground">
            Nenhuma roleta de filial ativa.
          </p>
        )}
        {filiais.map((f) => (
          <label
            key={f.slug}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={marcadas.has(f.slug)}
              onCheckedChange={() => toggle(f.slug)}
              aria-label={rotuloFilial(f)}
            />
            {rotuloFilial(f)}
          </label>
        ))}
        {soltas.length > 0 && (
          <p className="px-1 pt-1 text-xs text-warning">
            Zona sem filial completa: {soltas.join(", ")}. Salvar refaz a região pelas filiais
            marcadas.
          </p>
        )}
        {mudou && (
          <div className="pt-2">
            <Button
              size="sm"
              className="w-full"
              disabled={pending}
              onClick={() => {
                onSalvar(uniaoDasZonas(filiais, marcadas));
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
