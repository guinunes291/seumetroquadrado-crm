// Quadro "Quem está em qual roleta" — a aba Corretores da Central (decisão do
// dono, 13/10/2026: "precisamos deixar as roletas mais simples de entender
// quem está em qual roleta"). Uma linha por corretor e uma coluna por roleta:
// Filial · Campanhas · SDR · Marquinhos. A régua (quem conta, pausa, família)
// é a de lib/quadro-roletas; toda escrita vai pelas RPCs auditadas de sempre:
//   * filial     → atualizar_corretor_distribuicao (admin);
//   * campanhas  → gerenciar_participante_roleta (admin; gestor só o time dele);
//   * SDR        → gerenciar_participante_roleta, só com a regra semanal
//                  desligada ou em sombra (ligada, o time é da apuração);
//   * Marquinhos → só leitura: automática (top em vendas), mexe-se na aba
//                  Roletas (bloquear / devolver à regra).

import { useMemo, useState } from "react";
import { Check, MagnifyingGlass, UserMinus } from "@phosphor-icons/react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { agruparFiliais } from "@/lib/distribuicao";
import {
  FILTRO_QUADRO_PADRAO,
  filtrarQuadro,
  montarQuadro,
  rotuloMarquinhos,
  totaisDoQuadro,
  type FiltroQuadro,
  type PosicaoNaRoleta,
} from "@/lib/quadro-roletas";
import { FiliaisBadges, FiliaisEditor } from "./filiais-editor";
import {
  useAtualizarCorretorDistribuicao,
  useCorretoresDaMinhaEquipe,
  useCorretoresDistribuicao,
  useGerenciarParticipante,
  useMarcarPresencaAdmin,
  useMarquinhosRanking,
  useParticipacoesQuadro,
  useRoletas,
  useWipCorretores,
  useZonasRoletas,
  type CorretorDistribuicao,
  type RoletaRow,
} from "./queries";
import { useRoletaSdrConfig } from "./roleta-sdr-semanal-queries";

const SDR_SLUG = "agendados-sdr";
const SEM_MODELO = "__pendente__";

export function QuadroRoletas({
  somenteLeitura,
  escopoEquipe = false,
}: {
  somenteLeitura: boolean;
  /** Gestor: inclui e remove (campanhas, SDR) só os corretores do time dele. */
  escopoEquipe?: boolean;
}) {
  const corretoresQ = useCorretoresDistribuicao();
  const partQ = useParticipacoesQuadro();
  const mapaQ = useZonasRoletas();
  const roletasQ = useRoletas();
  const rankingQ = useMarquinhosRanking();
  const sdrCfgQ = useRoletaSdrConfig();
  const wipQ = useWipCorretores();
  const minhaEquipeQ = useCorretoresDaMinhaEquipe(escopoEquipe);
  const presenca = useMarcarPresencaAdmin();
  const atualizar = useAtualizarCorretorDistribuicao();
  const gerenciar = useGerenciarParticipante();
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<FiltroQuadro>(FILTRO_QUADRO_PADRAO);

  const filiais = useMemo(() => agruparFiliais(mapaQ.data ?? []), [mapaQ.data]);
  const campanhas = useMemo(
    () =>
      (roletasQ.data ?? [])
        .filter((r) => r.tipo === "campanha" && r.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [roletasQ.data],
  );
  const ranking = rankingQ.data ?? null;
  const linhas = useMemo(
    () =>
      montarQuadro(
        (corretoresQ.data ?? []).map((c) => ({
          id: c.id,
          nome: c.nome,
          ativo: c.ativo,
          presente: c.presente,
          telefone: c.telefone,
          zonas: c.zonas,
        })),
        partQ.data ?? [],
        filiais,
        ranking,
      ),
    [corretoresQ.data, partQ.data, filiais, ranking],
  );
  const visiveis = useMemo(() => filtrarQuadro(linhas, filtro), [linhas, filtro]);
  const totais = useMemo(() => totaisDoQuadro(linhas), [linhas]);
  const porId = useMemo(
    () => new Map((corretoresQ.data ?? []).map((c) => [c.id, c])),
    [corretoresQ.data],
  );

  const sdrAutomatico = !!sdrCfgQ.data?.regra_ativa && !sdrCfgQ.data?.modo_sombra;
  const temWip = wipQ.data !== null && wipQ.data !== undefined;
  const temV2 = (corretoresQ.data ?? []).some((c) => c.v2 !== null);
  // Admin opera tudo; gestor, só participação (campanhas e SDR) do time dele.
  const podeGerirParticipacao = (corretorId: string) =>
    !somenteLeitura || (escopoEquipe && !!minhaEquipeQ.data?.has(corretorId));

  const salvarCampanhas = async (corretorId: string, antes: Set<string>, depois: Set<string>) => {
    for (const slug of depois) {
      if (!antes.has(slug)) {
        await gerenciar.mutateAsync({
          slug,
          corretorId,
          acao: "incluir",
          motivo: "Quadro de roletas",
        });
      }
    }
    for (const slug of antes) {
      if (!depois.has(slug)) {
        await gerenciar.mutateAsync({
          slug,
          corretorId,
          acao: "remover",
          motivo: "Quadro de roletas",
        });
      }
    }
  };

  if (corretoresQ.isLoading || partQ.isLoading) {
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
          Uma linha por corretor e uma coluna por roleta. <b>Filial</b>: o time da loja — recebe os
          leads das zonas dela e o rodízio do lead sem zona. <b>Campanhas</b>: a equipe recebe o
          lead do anúncio, de qualquer zona e filial. <b>SDR</b>: as visitas que o SDR agenda.{" "}
          <b>Marquinhos</b>: automática — os {ranking?.top_n ?? 6} com mais vendas nos últimos{" "}
          {ranking?.janela_dias ?? 30} dias.
        </p>

        <ResumoQuadro
          filiais={filiais}
          campanhas={campanhas}
          totais={totais}
          filtro={filtro}
          setFiltro={setFiltro}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filtro.filial}
            onValueChange={(v) => setFiltro((f) => ({ ...f, filial: v }))}
          >
            <SelectTrigger className="h-8 w-44" aria-label="Filtrar por filial">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as filiais</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f.slug} value={f.slug}>
                  {f.nome}
                </SelectItem>
              ))}
              <SelectItem value="sem">Sem filial</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filtro.campanha}
            onValueChange={(v) => setFiltro((f) => ({ ...f, campanha: v }))}
          >
            <SelectTrigger className="h-8 w-56" aria-label="Filtrar por campanha">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as campanhas</SelectItem>
              {campanhas.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.nome}
                </SelectItem>
              ))}
              <SelectItem value="sem">Em nenhuma campanha</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={filtro.soSemRoleta}
              onCheckedChange={(v) => setFiltro((f) => ({ ...f, soSemRoleta: v }))}
              aria-label="Só quem está sem roleta"
            />
            Só quem está sem roleta
          </label>
          <div className="relative ml-auto w-full sm:w-56">
            <MagnifyingGlass className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filtro.busca}
              onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))}
              placeholder="Buscar corretor"
              className="h-8 pl-8"
              aria-label="Buscar corretor"
            />
          </div>
        </div>

        <Card>
          <CardContent className="overflow-x-auto pt-4">
            {linhas.length === 0 ? (
              <EmptyState
                icon={UserMinus}
                title="Nenhum corretor com papel de corretor"
                description="Convide e ative corretores em Configurações → Pessoas."
              />
            ) : visiveis.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ninguém com esse filtro.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corretor</TableHead>
                    <TableHead>Presença hoje</TableHead>
                    <TableHead>Filial</TableHead>
                    <TableHead>Campanhas</TableHead>
                    <TableHead>SDR</TableHead>
                    <TableHead>Marquinhos</TableHead>
                    {temWip && <TableHead className="text-right">Carteira</TableHead>}
                    {temV2 && !somenteLeitura && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((l) => {
                    const c = l.corretor;
                    const original = porId.get(c.id);
                    const wip = wipQ.data?.[c.id];
                    const gere = podeGerirParticipacao(c.id);
                    const marq = rotuloMarquinhos(l.marquinhos, ranking);
                    return (
                      <TableRow key={c.id} data-testid="quadro-linha">
                        <TableCell className="font-medium">
                          {c.nome}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {!c.ativo && <StatusBadge intent="neutral">Inativo</StatusBadge>}
                            {!c.telefone && (
                              <StatusBadge intent="warning">Sem telefone</StatusBadge>
                            )}
                            {l.semRoleta && <StatusBadge intent="warning">Sem roleta</StatusBadge>}
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
                                // A mesma condição do aviso abaixo (só fora da
                                // leitura): nunca apontar para um id ausente.
                                c.id === user?.id && !c.presente && !somenteLeitura
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
                        <TableCell>
                          <CelulaCampanhas
                            nome={c.nome}
                            minhas={l.campanhas}
                            campanhas={campanhas}
                            editavel={gere}
                            pending={gerenciar.isPending}
                            onSalvar={(antes, depois) => salvarCampanhas(c.id, antes, depois)}
                          />
                        </TableCell>
                        <TableCell>
                          <CelulaSdr
                            nome={c.nome}
                            sdr={l.sdr}
                            automatico={sdrAutomatico}
                            editavel={gere}
                            pending={gerenciar.isPending}
                            onAlternar={(entra) =>
                              gerenciar.mutate({
                                slug: SDR_SLUG,
                                corretorId: c.id,
                                acao: entra ? "incluir" : "remover",
                                motivo: "Quadro de roletas",
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span data-testid="celula-marquinhos">
                                <StatusBadge intent={marq.dentro ? "success" : "neutral"}>
                                  {marq.texto}
                                </StatusBadge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {ranking?.regra_ativa
                                ? `${l.marquinhos.ranking?.vendas ?? 0} venda(s) nos últimos ${ranking.janela_dias} dias. Automática: bloquear ou devolver à regra na aba Roletas → Marquinhos.`
                                : "Regra automática desligada: o time da Marquinhos é montado na aba Roletas."}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        {temWip && (
                          <TableCell className="text-right tabular-nums">
                            {wip ? (
                              <span
                                className={
                                  wip.leads_ativos >= wip.disjuntor
                                    ? "font-semibold text-destructive"
                                    : undefined
                                }
                                title={`${wip.leads_ativos} leads ativos · teto de ${wip.disjuntor}`}
                              >
                                {wip.leads_ativos}/{wip.disjuntor}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {temV2 && !somenteLeitura && (
                          <TableCell>
                            {original?.v2 && (
                              <DetalhesCadastro
                                corretor={original}
                                pending={atualizar.isPending}
                                onModelo={(m) =>
                                  atualizar.mutate({ corretorId: c.id, modeloContrato: m })
                                }
                                onOnboarding={(v) =>
                                  atualizar.mutate({ corretorId: c.id, onboardingConcluido: v })
                                }
                              />
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

/** Os totais por roleta — clicar filtra. */
function ResumoQuadro({
  filiais,
  campanhas,
  totais,
  filtro,
  setFiltro,
}: {
  filiais: ReturnType<typeof agruparFiliais>;
  campanhas: RoletaRow[];
  totais: ReturnType<typeof totaisDoQuadro>;
  filtro: FiltroQuadro;
  setFiltro: (f: (x: FiltroQuadro) => FiltroQuadro) => void;
}) {
  const pessoasEmCampanha = campanhas.reduce(
    (n, c) => n + (totais.porCampanha.get(c.slug) ?? 0),
    0,
  );
  return (
    <div className="flex flex-wrap gap-2 text-xs" data-testid="quadro-resumo">
      {filiais.map((f) => (
        <button
          key={f.slug}
          type="button"
          onClick={() =>
            setFiltro((x) => ({ ...x, filial: x.filial === f.slug ? "todas" : f.slug }))
          }
          className={`rounded-full border px-3 py-1 ${filtro.filial === f.slug ? "border-primary bg-primary/10" : "border-border"}`}
        >
          {f.nome} <b className="tabular-nums">{totais.porFilial.get(f.slug) ?? 0}</b>
        </button>
      ))}
      <span className="rounded-full border border-border px-3 py-1">
        Campanhas <b className="tabular-nums">{campanhas.length}</b> · {pessoasEmCampanha} vaga(s)
      </span>
      <span className="rounded-full border border-border px-3 py-1">
        SDR <b className="tabular-nums">{totais.sdr}</b>
      </span>
      <span className="rounded-full border border-border px-3 py-1">
        Marquinhos <b className="tabular-nums">{totais.marquinhos}</b>
      </span>
      <button
        type="button"
        onClick={() => setFiltro((x) => ({ ...x, soSemRoleta: !x.soSemRoleta }))}
        className={`rounded-full border px-3 py-1 ${filtro.soSemRoleta ? "border-warning bg-warning/10" : "border-border"}`}
      >
        Sem roleta <b className="tabular-nums">{totais.semRoleta}</b>
      </button>
    </div>
  );
}

/** Campanhas do corretor; editável = popover com as campanhas ativas,
 *  rascunho + Salvar (cada mudança vai pela RPC auditada). */
function CelulaCampanhas({
  nome,
  minhas,
  campanhas,
  editavel,
  pending,
  onSalvar,
}: {
  nome: string;
  minhas: PosicaoNaRoleta[];
  campanhas: RoletaRow[];
  editavel: boolean;
  pending: boolean;
  onSalvar: (antes: Set<string>, depois: Set<string>) => Promise<void>;
}) {
  const [rascunho, setRascunho] = useState<Set<string> | null>(null);
  const atual = new Set(minhas.map((m) => m.slug));
  const marcadas = rascunho ?? atual;
  const mudou =
    rascunho !== null && (rascunho.size !== atual.size || [...rascunho].some((s) => !atual.has(s)));

  const badges =
    minhas.length === 0 ? (
      <span className="text-xs text-muted-foreground">—</span>
    ) : (
      <div className="flex max-w-64 flex-wrap gap-1">
        {minhas.map((m) => (
          <Badge key={m.slug} variant="secondary" className="text-[10px]">
            {m.nome}
            {m.pausado ? " · pausado" : ""}
          </Badge>
        ))}
      </div>
    );

  if (!editavel) return badges;

  return (
    <Popover onOpenChange={(o) => !o && setRascunho(null)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-left hover:bg-muted"
          aria-label={`Campanhas de ${nome}`}
        >
          {badges}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          Na equipe da campanha, recebe o lead do anúncio de qualquer zona e de qualquer filial.
        </p>
        {campanhas.length === 0 && (
          <p className="px-1 py-1.5 text-xs text-muted-foreground">Nenhuma campanha ativa.</p>
        )}
        <div className="max-h-64 overflow-y-auto">
          {campanhas.map((c) => (
            <label
              key={c.slug}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={marcadas.has(c.slug)}
                onCheckedChange={() => {
                  const next = new Set(marcadas);
                  if (next.has(c.slug)) next.delete(c.slug);
                  else next.add(c.slug);
                  setRascunho(next);
                }}
                aria-label={c.nome}
              />
              {c.nome}
            </label>
          ))}
        </div>
        {mudou && (
          <div className="pt-2">
            <Button
              size="sm"
              className="w-full"
              disabled={pending}
              onClick={async () => {
                const depois = rascunho;
                setRascunho(null);
                if (depois) await onSalvar(atual, depois);
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

function CelulaSdr({
  nome,
  sdr,
  automatico,
  editavel,
  pending,
  onAlternar,
}: {
  nome: string;
  sdr: PosicaoNaRoleta | null;
  automatico: boolean;
  editavel: boolean;
  pending: boolean;
  onAlternar: (entra: boolean) => void;
}) {
  const status = sdr ? (
    <StatusBadge intent="success">{sdr.pausado ? "No time · pausado" : "No time"}</StatusBadge>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );
  if (automatico || !editavel) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        {status}
        {automatico && (
          <span className="text-[11px] text-muted-foreground">automático (regra semanal)</span>
        )}
      </div>
    );
  }
  return (
    <label className="flex items-center gap-2">
      <Checkbox
        checked={!!sdr}
        disabled={pending}
        onCheckedChange={(v) => onAlternar(v === true)}
        aria-label={`SDR: ${nome}`}
      />
      {status}
    </label>
  );
}

/** Vínculo e onboarding (régua extra do modelo v2) — fora das colunas para o
 *  quadro ficar nas quatro roletas. */
function DetalhesCadastro({
  corretor,
  pending,
  onModelo,
  onOnboarding,
}: {
  corretor: CorretorDistribuicao;
  pending: boolean;
  onModelo: (m: "fixo" | "autonomo" | null) => void;
  onOnboarding: (v: boolean) => void;
}) {
  const v2 = corretor.v2;
  if (!v2) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          aria-label={`Cadastro de ${corretor.nome}`}
        >
          Cadastro
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3 p-3">
        <div className="space-y-1">
          <p className="text-xs font-medium">Vínculo</p>
          <Select
            value={v2.modelo_contrato ?? SEM_MODELO}
            disabled={pending}
            onValueChange={(v) => onModelo(v === SEM_MODELO ? null : (v as "fixo" | "autonomo"))}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_MODELO}>Pendente</SelectItem>
              <SelectItem value="fixo">Fixo</SelectItem>
              <SelectItem value="autonomo">Autônomo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={!!v2.onboarding_concluido_em}
            disabled={pending}
            onCheckedChange={(v) => onOnboarding(v === true)}
          />
          Onboarding concluído
        </label>
      </PopoverContent>
    </Popover>
  );
}
