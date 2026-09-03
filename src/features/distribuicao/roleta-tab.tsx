// Aba de roleta (compartilhada pelas 3): tabela de participantes com
// aptidão + MOTIVO visível, contadores dia/mês derivados do log, próximo da
// vez calculado com dados do servidor, e ações auditadas (incluir/pausar/
// remover/limite) via RPC gerenciar_participante_roleta.

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarSlash,
  Crown,
  DotsThree,
  PauseCircle,
  PlayCircle,
  Plus,
  SealCheck,
  Trash,
  UserCheck,
  UserMinus,
  Warning,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
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
  motivoInaptidaoLabel,
  participacaoPercentual,
  proximoDaVez,
  roletaLabel,
} from "@/lib/distribuicao";
import {
  useCorretoresDisponiveis,
  useElegibilidadeRoleta,
  useEscoarEstoque,
  useGerenciarParticipante,
  useMarcarPresencaAdmin,
  useNomesPerfis,
  useRecebidosSemana,
  useRoletasPorCorretor,
  useVendasMesAnterior,
  type ElegibilidadeLinha,
  type RoletaDoCorretor,
} from "./queries";

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  return format(parseISO(iso), "dd/MM HH:mm", { locale: ptBR });
}

/**
 * Onde MAIS este corretor recebe lead.
 *
 * Cada aba mostra a verdade da sua roleta, e é fácil ler "Inapto" como "parou
 * de receber". Não para: um corretor costuma estar em várias roletas ao mesmo
 * tempo — inclusive nas de CAMPANHA, que entram por webhook próprio e são
 * geridas em outra tela. Desligar numa não desliga nas outras, e é aí que a
 * gestão se perde.
 */
function OutrasRoletas({
  slugAtual,
  roletas,
  aptoAqui,
}: {
  slugAtual: string;
  roletas: RoletaDoCorretor[] | undefined;
  aptoAqui: boolean;
}) {
  const outras = (roletas ?? []).filter((r) => r.slug !== slugAtual);
  if (outras.length === 0) return null;
  const nomes = outras.map((r) => r.nome).join(", ");

  if (aptoAqui) {
    return (
      <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">Também em: {nomes}</p>
    );
  }
  return (
    <p className="mt-0.5 flex items-start gap-1 text-[11px] font-normal text-warning">
      <Warning className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Inapto aqui, mas continua recebendo em: {nomes}</span>
    </p>
  );
}

// Slug é string genérica: a elegibilidade do servidor cobre QUALQUER roleta
// (zonas, origem, base e campanhas) — o gerenciamento auditado é o mesmo.
export function RoletaTab({
  slug,
  nome,
  somenteLeitura,
}: {
  slug: string;
  nome?: string | null;
  somenteLeitura: boolean;
}) {
  if (slug === "marquinhos") {
    return <MarquinhosSimpleTab somenteLeitura={somenteLeitura} />;
  }
  return <RoletaTabPadrao slug={slug} nome={nome} somenteLeitura={somenteLeitura} />;
}

function RoletaTabPadrao({
  slug,
  nome,
  somenteLeitura,
}: {
  slug: string;
  nome?: string | null;
  somenteLeitura: boolean;
}) {
  const q = useElegibilidadeRoleta(slug);
  const vendasQ = useVendasMesAnterior(slug === "marquinhos");
  const semanaQ = useRecebidosSemana(slug, slug === "landing");
  const nomesQ = useNomesPerfis();
  const outrasRoletasQ = useRoletasPorCorretor();
  const gerenciar = useGerenciarParticipante();
  const presencaAdmin = useMarcarPresencaAdmin();
  const escoar = useEscoarEstoque(slug);

  const [incluirAberto, setIncluirAberto] = useState(false);
  const [pausarAlvo, setPausarAlvo] = useState<ElegibilidadeLinha | null>(null);
  const [limiteAlvo, setLimiteAlvo] = useState<ElegibilidadeLinha | null>(null);
  const [removerAlvo, setRemoverAlvo] = useState<ElegibilidadeLinha | null>(null);

  const linhas = q.data ?? [];
  const vendasMap = useMemo(
    () => new Map((vendasQ.data ?? []).map((v) => [v.corretor_id, v])),
    [vendasQ.data],
  );
  const proximo = proximoDaVez(linhas);
  const totalMesRoleta = useMemo(
    () => linhas.reduce((acc, l) => acc + l.recebidos_mes, 0),
    [linhas],
  );

  const ehPlantao = slug === "plantao";
  const ehMarquinhos = slug === "marquinhos";
  const ehLanding = slug === "landing";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {ehPlantao &&
              "Participação automática por presença: recebe quem está no plantão hoje, dentro da cota e com % de leads trabalhados acima do mínimo."}
            {ehMarquinhos &&
              "Participação MANUAL: inclua apenas corretores com venda no mês anterior (badge abaixo). Toda inclusão/remoção fica auditada."}
            {ehLanding &&
              "Exclusiva para leads da Landing Page (origem site). Configure os participantes e acompanhe o equilíbrio da distribuição."}
            {!ehPlantao &&
              !ehMarquinhos &&
              !ehLanding &&
              "Participação manual: quem está aqui entra no rodízio desta fila. Toda inclusão, pausa e remoção fica auditada."}
          </p>
          {!somenteLeitura && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={escoar.isPending}
                title="Envia 30 leads do estoque para cada corretor apto desta fila. A rotina automática já faz isso a cada 10 minutos."
                onClick={() => escoar.mutate(30)}
              >
                <PlayCircle className="mr-1.5 h-4 w-4" />
                {escoar.isPending ? "Escoando…" : "Escoar estoque"}
              </Button>
              <Button size="sm" onClick={() => setIncluirAberto(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Incluir corretor
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="overflow-x-auto pt-4">
            {q.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : linhas.length === 0 ? (
              <EmptyState
                icon={UserMinus}
                title={`Nenhum participante na ${roletaLabel(slug, nome)}`}
                description="Sem participantes ativos, todo lead desta roleta vai para a fila de exceções."
                action={
                  somenteLeitura ? undefined : (
                    <Button size="sm" onClick={() => setIncluirAberto(true)}>
                      <Plus className="mr-1.5 h-4 w-4" /> Incluir corretor
                    </Button>
                  )
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corretor</TableHead>
                    {ehPlantao && <TableHead>Presença</TableHead>}
                    <TableHead>Status na roleta</TableHead>
                    {ehPlantao && <TableHead className="text-right">Carteira</TableHead>}
                    {ehPlantao && <TableHead className="text-right">% trabalhado</TableHead>}
                    {ehMarquinhos && <TableHead>Venda mês anterior</TableHead>}
                    {ehMarquinhos && <TableHead>Incluído por</TableHead>}
                    <TableHead
                      className="text-right"
                      title="Leads NOVOS recebidos hoje nesta roleta, contra a cota diária. Repasses/redistribuições de leads já existentes não entram nesta conta — veja a coluna 'Último lead'."
                    >
                      Novos hoje
                    </TableHead>
                    {ehLanding && <TableHead className="text-right">Semana</TableHead>}
                    <TableHead className="text-right">Mês</TableHead>
                    {ehLanding && <TableHead className="text-right">Participação</TableHead>}
                    <TableHead>Último lead</TableHead>
                    {!somenteLeitura && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const ehProximo = proximo?.corretor_id === l.corretor_id;
                    const venda = vendasMap.get(l.corretor_id);
                    return (
                      <TableRow
                        key={l.corretor_id}
                        className={ehProximo ? "bg-primary/5" : undefined}
                      >
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {ehProximo && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Crown className="h-3.5 w-3.5 text-gold-500" />
                                </TooltipTrigger>
                                <TooltipContent>Próximo da vez nesta roleta</TooltipContent>
                              </Tooltip>
                            )}
                            {l.nome}
                          </span>
                          <OutrasRoletas
                            slugAtual={slug}
                            roletas={outrasRoletasQ.data?.get(l.corretor_id)}
                            aptoAqui={l.apto}
                          />
                        </TableCell>
                        {ehPlantao && (
                          <TableCell>
                            {l.presente ? (
                              <StatusBadge intent="success">Presente</StatusBadge>
                            ) : (
                              <StatusBadge intent="neutral">Ausente</StatusBadge>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {l.apto ? (
                              <StatusBadge intent="success">Apto</StatusBadge>
                            ) : (
                              <StatusBadge intent={l.participante_ativo ? "warning" : "neutral"}>
                                Inapto
                              </StatusBadge>
                            )}
                            {!l.apto &&
                              l.motivos.map((m) => (
                                <Tooltip key={m}>
                                  <TooltipTrigger asChild>
                                    <span className="max-w-44 truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                      {motivoInaptidaoLabel(m)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{motivoInaptidaoLabel(m)}</TooltipContent>
                                </Tooltip>
                              ))}
                            {l.pausado && l.motivo_pausa && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[11px] text-muted-foreground">
                                    ({l.motivo_pausa})
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Motivo da pausa: {l.motivo_pausa}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        {ehPlantao && (
                          <TableCell className="text-right text-xs tabular-nums">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  {l.carteira_total - l.aguardando}/{l.carteira_total}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {l.carteira_total} leads ativos · {l.carteira_total - l.aguardando}{" "}
                                trabalhados · {l.aguardando} aguardando atendimento
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        )}
                        {ehPlantao && (
                          <TableCell className="text-right tabular-nums">
                            <span
                              className={
                                l.pct_trabalhado < 90
                                  ? "font-semibold text-warning"
                                  : "text-success"
                              }
                            >
                              {l.pct_trabalhado}%
                            </span>
                          </TableCell>
                        )}
                        {ehMarquinhos && (
                          <TableCell>
                            {venda ? (
                              <StatusBadge intent="success">
                                <SealCheck className="mr-1 h-3 w-3" />
                                Sim ({venda.qtd})
                              </StatusBadge>
                            ) : (
                              <StatusBadge intent="warning">Não</StatusBadge>
                            )}
                          </TableCell>
                        )}
                        {ehMarquinhos && (
                          <TableCell className="text-xs text-muted-foreground">
                            {l.incluido_por
                              ? (nomesQ.data?.get(l.incluido_por) ?? "—")
                              : "migração"}
                            {l.incluido_em ? ` · ${fmtDataHora(l.incluido_em)}` : ""}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">
                          {l.recebidos_hoje}
                          <span className="text-muted-foreground">/{l.limite_diario}</span>
                        </TableCell>
                        {ehLanding && (
                          <TableCell className="text-right tabular-nums">
                            {semanaQ.data?.get(l.corretor_id) ?? 0}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">{l.recebidos_mes}</TableCell>
                        {ehLanding && (
                          <TableCell className="text-right tabular-nums">
                            {participacaoPercentual(l.recebidos_mes, totalMesRoleta)}%
                          </TableCell>
                        )}
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {fmtDataHora(l.ultimo_lead_em)}
                        </TableCell>
                        {!somenteLeitura && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-11 w-11"
                                  aria-label={`Ações de ${l.nome}`}
                                >
                                  <DotsThree className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {ehPlantao && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      presencaAdmin.mutate({
                                        corretorId: l.corretor_id,
                                        presente: !l.presente,
                                      })
                                    }
                                  >
                                    {l.presente ? (
                                      <>
                                        <UserMinus className="mr-2 h-4 w-4" /> Marcar ausente
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="mr-2 h-4 w-4" /> Marcar presente hoje
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                )}
                                {l.participante_ativo && !l.pausado && (
                                  <DropdownMenuItem onClick={() => setPausarAlvo(l)}>
                                    <PauseCircle className="mr-2 h-4 w-4" /> Pausar temporariamente
                                  </DropdownMenuItem>
                                )}
                                {(l.pausado || !l.participante_ativo) && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      gerenciar.mutate({
                                        slug,
                                        corretorId: l.corretor_id,
                                        acao: "reativar",
                                        motivo: "Reativado pela gestão",
                                      })
                                    }
                                  >
                                    <PlayCircle className="mr-2 h-4 w-4" /> Reativar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setLimiteAlvo(l)}>
                                  <UserCheck className="mr-2 h-4 w-4" /> Ajustar limite diário
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setRemoverAlvo(l)}
                                >
                                  <Trash className="mr-2 h-4 w-4" /> Remover da roleta
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        <IncluirParticipanteDialog
          slug={slug}
          nome={nome}
          aberto={incluirAberto}
          onFechar={() => setIncluirAberto(false)}
          participantesAtuais={linhas}
        />
        <PausarDialog slug={slug} alvo={pausarAlvo} onFechar={() => setPausarAlvo(null)} />
        <LimiteDialog slug={slug} alvo={limiteAlvo} onFechar={() => setLimiteAlvo(null)} />

        <AlertDialog open={!!removerAlvo} onOpenChange={(o) => !o && setRemoverAlvo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remover {removerAlvo?.nome} da {roletaLabel(slug, nome)}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                O corretor deixa de receber leads desta roleta imediatamente. A remoção fica
                registrada na auditoria com seu usuário e pode ser desfeita incluindo-o de novo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (removerAlvo) {
                    gerenciar.mutate({
                      slug,
                      corretorId: removerAlvo.corretor_id,
                      acao: "remover",
                      motivo: "Removido pela gestão",
                    });
                  }
                  setRemoverAlvo(null);
                }}
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Dialogs auxiliares
// ---------------------------------------------------------------------------
function IncluirParticipanteDialog({
  slug,
  nome,
  aberto,
  onFechar,
  participantesAtuais,
}: {
  slug: string;
  nome?: string | null;
  aberto: boolean;
  onFechar: () => void;
  participantesAtuais: ElegibilidadeLinha[];
}) {
  const corretoresQ = useCorretoresDisponiveis(aberto);
  const vendasQ = useVendasMesAnterior(aberto && slug === "marquinhos");
  const gerenciar = useGerenciarParticipante();
  const [corretorId, setCorretorId] = useState<string>("");
  const [motivo, setMotivo] = useState("");

  const jaAtivos = new Set(
    participantesAtuais.filter((p) => p.participante_ativo).map((p) => p.corretor_id),
  );
  const disponiveis = (corretoresQ.data ?? []).filter((c) => !jaAtivos.has(c.id));
  const vendasMap = new Map((vendasQ.data ?? []).map((v) => [v.corretor_id, v]));
  const vendaSelecionado = corretorId ? vendasMap.get(corretorId) : undefined;

  const incluir = () => {
    if (!corretorId) return;
    gerenciar.mutate(
      {
        slug,
        corretorId,
        acao: "incluir",
        motivo:
          motivo.trim() ||
          (slug === "marquinhos"
            ? vendaSelecionado
              ? `Venda no mês anterior validada (${vendaSelecionado.qtd})`
              : "Incluído sem venda no mês anterior (decisão da gestão)"
            : "Incluído pela gestão"),
      },
      { onSuccess: () => onFechar() },
    );
    setCorretorId("");
    setMotivo("");
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Incluir corretor na {roletaLabel(slug, nome)}</DialogTitle>
          <DialogDescription>
            {slug === "marquinhos"
              ? "Critério: pelo menos 1 venda no mês anterior. O sistema mostra o critério, mas a decisão é sua e fica auditada."
              : "O corretor entra no rodízio imediatamente (se estiver apto)."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Corretor</Label>
            <Select value={corretorId} onValueChange={setCorretorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o corretor" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((c) => {
                  const venda = vendasMap.get(c.id);
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                      {slug === "marquinhos"
                        ? venda
                          ? ` — ✓ ${venda.qtd} venda(s) mês anterior`
                          : " — sem venda no mês anterior"
                        : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {slug === "marquinhos" && corretorId && !vendaSelecionado && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              Este corretor não tem venda registrada no mês anterior. A inclusão é permitida, mas
              ficará marcada na auditoria.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Motivo (auditoria)</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: venda validada em junho"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={incluir} disabled={!corretorId || gerenciar.isPending}>
            Incluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PausarDialog({
  slug,
  alvo,
  onFechar,
}: {
  slug: string;
  alvo: ElegibilidadeLinha | null;
  onFechar: () => void;
}) {
  const gerenciar = useGerenciarParticipante();
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");

  const pausar = () => {
    if (!alvo || !ate) return;
    gerenciar.mutate(
      {
        slug,
        corretorId: alvo.corretor_id,
        acao: "pausar",
        motivo: motivo.trim() || "Pausa temporária",
        pausadoAte: new Date(ate).toISOString(),
      },
      { onSuccess: () => onFechar() },
    );
    setAte("");
    setMotivo("");
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <CalendarSlash className="mr-1.5 inline h-4 w-4" />
            Pausar {alvo?.nome}
          </DialogTitle>
          <DialogDescription>
            O corretor não recebe leads desta roleta até a data escolhida — depois volta
            automaticamente. A pausa fica registrada na auditoria.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Pausar até</Label>
            <Input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: férias, treinamento, sobrecarga"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={pausar} disabled={!ate || gerenciar.isPending}>
            Pausar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimiteDialog({
  slug,
  alvo,
  onFechar,
}: {
  slug: string;
  alvo: ElegibilidadeLinha | null;
  onFechar: () => void;
}) {
  const gerenciar = useGerenciarParticipante();
  const [limite, setLimite] = useState<string>("");

  const salvar = () => {
    if (!alvo) return;
    const n = limite.trim() === "" ? null : Number(limite);
    if (n !== null && (!Number.isInteger(n) || n <= 0)) return;
    gerenciar.mutate(
      { slug, corretorId: alvo.corretor_id, acao: "limite", limite: n },
      { onSuccess: () => onFechar() },
    );
    setLimite("");
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Limite diário de {alvo?.nome}</DialogTitle>
          <DialogDescription>
            Máximo de leads por dia nesta roleta. Vazio = usar o padrão do sistema (
            {alvo?.limite_diario ?? "—"} hoje).
          </DialogDescription>
        </DialogHeader>
        <Input
          type="number"
          min={1}
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          placeholder={`Padrão do sistema`}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={gerenciar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Marquinhos — visão simplificada
// Único critério gerenciável: Apto/Inapto (via pausar/reativar) + inclusão/remoção.
// Mostra a quantidade de vendas no mês anterior como peso para calibragem futura.
// ---------------------------------------------------------------------------

const INAPTO_ATE = "2099-12-31T23:59:59.000Z";

function MarquinhosSimpleTab({ somenteLeitura }: { somenteLeitura: boolean }) {
  const slug = "marquinhos";
  const q = useElegibilidadeRoleta(slug);
  const vendasQ = useVendasMesAnterior(true);
  const outrasRoletasQ = useRoletasPorCorretor();
  const gerenciar = useGerenciarParticipante();

  const [incluirAberto, setIncluirAberto] = useState(false);
  const [removerAlvo, setRemoverAlvo] = useState<ElegibilidadeLinha | null>(null);

  const linhas = q.data ?? [];
  const vendasMap = useMemo(
    () => new Map((vendasQ.data ?? []).map((v) => [v.corretor_id, v])),
    [vendasQ.data],
  );

  const toggleApto = (l: ElegibilidadeLinha, novoApto: boolean) => {
    if (novoApto) {
      gerenciar.mutate({
        slug,
        corretorId: l.corretor_id,
        acao: "reativar",
        motivo: "Marcado como Apto pela gestão",
      });
    } else {
      gerenciar.mutate({
        slug,
        corretorId: l.corretor_id,
        acao: "pausar",
        motivo: "Marcado como Inapto pela gestão",
        pausadoAte: INAPTO_ATE,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Gestão simples: inclua ou remova corretores e alterne Apto/Inapto. As vendas do mês
          anterior ficam visíveis como peso — quanto maior, mais leads o corretor tende a receber
          nas próximas rodadas.
        </p>
        {!somenteLeitura && (
          <Button size="sm" onClick={() => setIncluirAberto(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Incluir corretor
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          {q.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : linhas.length === 0 ? (
            <EmptyState
              icon={UserMinus}
              title="Nenhum participante na Roleta Marquinhos"
              description="Inclua corretores para começar a distribuir leads desta roleta."
              action={
                somenteLeitura ? undefined : (
                  <Button size="sm" onClick={() => setIncluirAberto(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Incluir corretor
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corretor</TableHead>
                  <TableHead className="text-right">Vendas mês anterior</TableHead>
                  <TableHead>Status</TableHead>
                  {!somenteLeitura && <TableHead className="w-24 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => {
                  const venda = vendasMap.get(l.corretor_id);
                  const apto = l.participante_ativo && !l.pausado;
                  return (
                    <TableRow key={l.corretor_id}>
                      <TableCell className="font-medium">
                        {l.nome}
                        <OutrasRoletas
                          slugAtual={slug}
                          roletas={outrasRoletasQ.data?.get(l.corretor_id)}
                          aptoAqui={apto}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="font-semibold">{venda?.qtd ?? 0}</span>
                        <span className="ml-1 text-xs text-muted-foreground">venda(s)</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={apto}
                            disabled={somenteLeitura || gerenciar.isPending}
                            onCheckedChange={(v) => toggleApto(l, v)}
                            aria-label={apto ? "Marcar como Inapto" : "Marcar como Apto"}
                          />
                          {apto ? (
                            <StatusBadge intent="success">Apto</StatusBadge>
                          ) : (
                            <StatusBadge intent="neutral">Inapto</StatusBadge>
                          )}
                        </div>
                      </TableCell>
                      {!somenteLeitura && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            aria-label={`Remover ${l.nome}`}
                            onClick={() => setRemoverAlvo(l)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
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

      <IncluirParticipanteDialog
        slug={slug}
        aberto={incluirAberto}
        onFechar={() => setIncluirAberto(false)}
        participantesAtuais={linhas}
      />

      <AlertDialog open={!!removerAlvo} onOpenChange={(o) => !o && setRemoverAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {removerAlvo?.nome} da Roleta Marquinhos?</AlertDialogTitle>
            <AlertDialogDescription>
              O corretor deixa de receber leads desta roleta imediatamente. A remoção fica
              registrada na auditoria e pode ser desfeita incluindo-o novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removerAlvo) {
                  gerenciar.mutate({
                    slug,
                    corretorId: removerAlvo.corretor_id,
                    acao: "remover",
                    motivo: "Removido pela gestão",
                  });
                }
                setRemoverAlvo(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
