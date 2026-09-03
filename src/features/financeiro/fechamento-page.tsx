// Financeiro · Fechamento — Etapa 1.
// Caixa do mês, fila de decisão (unitária + lote), recebíveis, vendas sem
// corretor, integridade e histórico. Toda escrita passa pelas server functions
// que reutilizam o núcleo de validação das rotas públicas. Sem DELETE.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowCounterClockwise,
  CheckCircle,
  ClockCounterClockwise,
  Lock,
  Prohibit,
  Timer,
  UserGear,
  Wallet,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatTile, StatGrid } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  carregarPainelFinanceiroFn,
  carregarHistoricoFinanceiroFn,
  patchComissaoFinanceiroFn,
  patchComissoesLoteFinanceiroFn,
  definirCorretorVendaFn,
} from "@/lib/financeiro.functions";
import type { FilaItem, VendaItem } from "@/lib/financeiro-types";
import { ConciliacaoTab } from "@/features/financeiro/conciliacao-tab";

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const dataBR = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

const hojeISO = () => new Date().toISOString().slice(0, 10);

type AcaoAberta =
  | { tipo: "pagar"; item: FilaItem }
  | { tipo: "reabrir"; item: FilaItem }
  | { tipo: "cancelar"; id: string; rotulo: string; valor: number }
  | { tipo: "beneficiario"; item: FilaItem }
  | { tipo: "lote"; ids: string[] }
  | { tipo: "corretor"; venda: VendaItem }
  | { tipo: "historico"; entidade: string; entidadeId: string; titulo: string }
  | null;

export function FechamentoPage() {
  const queryClient = useQueryClient();
  const carregar = useServerFn(carregarPainelFinanceiroFn);
  const patchUnit = useServerFn(patchComissaoFinanceiroFn);
  const patchLote = useServerFn(patchComissoesLoteFinanceiroFn);
  const definirCorretor = useServerFn(definirCorretorVendaFn);

  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [acao, setAcao] = useState<AcaoAberta>(null);
  const [busca, setBusca] = useState("");

  const painel = useQuery({
    queryKey: ["financeiro-fechamento"],
    queryFn: () => carregar({}),
    staleTime: 30_000,
  });

  const invalidar = () => {
    setSelecionados([]);
    setAcao(null);
    void queryClient.invalidateQueries({ queryKey: ["financeiro-fechamento"] });
    void queryClient.invalidateQueries({ queryKey: ["financeiro-historico"] });
  };

  const mutUnit = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => patchUnit({ data: corpo }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Alteração registrada");
        invalidar();
      } else {
        toast.error("Não foi possível concluir", { description: r.erro });
      }
    },
    onError: (e: Error) => toast.error("Falha na operação", { description: e.message }),
  });

  const mutLote = useMutation({
    mutationFn: (payload: { ids: string[]; patch: Record<string, unknown> }) =>
      patchLote({ data: payload }),
    onSuccess: (r) => {
      if (r.falhas.length) {
        toast.warning(`${r.sucesso} de ${r.processados} concluídas`, {
          description: r.falhas
            .slice(0, 3)
            .map((f) => f.erro)
            .join(", "),
        });
      } else {
        toast.success(`${r.sucesso} comissões atualizadas`);
      }
      invalidar();
    },
    onError: (e: Error) => toast.error("Falha no lote", { description: e.message }),
  });

  const mutCorretor = useMutation({
    mutationFn: (p: { vendaId: string; corretorId: string; motivo: string }) =>
      definirCorretor({ data: p }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.mensagem ?? "Corretor definido");
        invalidar();
      } else {
        toast.error("Não foi possível definir o corretor", { description: r.erro });
      }
    },
    onError: (e: Error) => toast.error("Falha na operação", { description: e.message }),
  });

  const dados = painel.data;
  const filaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!dados) return [];
    if (!termo) return dados.fila;
    return dados.fila.filter((f) =>
      [f.beneficiario_nome, f.projeto_nome, f.cliente_nome, f.tipo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo)),
    );
  }, [dados, busca]);

  const aptosSelecionaveis = filaFiltrada.filter((f) => !f.travado && !f.aguardando_beneficiario);
  const todosMarcados =
    aptosSelecionaveis.length > 0 && aptosSelecionaveis.every((f) => selecionados.includes(f.id));

  if (painel.isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (painel.isError || !dados) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={Warning}
          title="Não foi possível carregar o fechamento"
          description="Recarregue a página. Se persistir, avise a gestão."
        />
      </div>
    );
  }

  const c = dados.cabecalho;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Financeiro · Fechamento"
        description={`Caixa e fila de decisão · referência ${c.referencia_mes}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              setAcao({
                tipo: "historico",
                entidade: "",
                entidadeId: "",
                titulo: "Histórico de auditoria (todas as alterações)",
              })
            }
          >
            <ClockCounterClockwise className="mr-2 h-4 w-4" />
            Histórico
          </Button>
        }
      />

      <StatGrid>
        <StatTile
          title="Em aberto"
          value={brl(c.em_aberto.valor)}
          hint={
            <>
              {c.em_aberto.qtd} comissões com venda vinculada
              {c.sem_venda.qtd > 0 && (
                <span className="mt-1 block text-warning">
                  +{c.sem_venda.qtd} sem venda vinculada ({brl(c.sem_venda.valor)}) — ver
                  Integridade
                </span>
              )}
            </>
          }
          icon={Wallet}
          intent="info"
        />
        <StatTile
          title="Travado por recebimento"
          value={brl(c.travado.valor)}
          hint={`${c.travado.qtd} com venda ainda não recebida`}
          icon={Lock}
          intent="danger"
        />
        <StatTile
          title="Apto a pagar"
          value={brl(c.apto.valor)}
          hint={
            c.apto_sem_beneficiario.qtd > 0 ? (
              <>
                {c.apto.qtd} liberadas
                <span className="mt-1 block text-warning">
                  {c.apto_sem_beneficiario.qtd} · {brl(c.apto_sem_beneficiario.valor)} — aguardando
                  beneficiário
                </span>
              </>
            ) : (
              `${c.apto.qtd} liberadas`
            )
          }
          icon={CheckCircle}
          intent="success"
        />
        <StatTile
          title="Pago no mês"
          value={brl(c.pago_mes.valor)}
          hint={`${c.pago_mes.qtd} pagamentos`}
          icon={Timer}
          intent="neutral"
        />
      </StatGrid>

      <Tabs defaultValue="fila" className="mt-6">
        <TabsList>
          <TabsTrigger value="fila">Fila de decisão ({dados.fila.length})</TabsTrigger>
          <TabsTrigger value="recebiveis">Recebíveis ({dados.recebiveis.length})</TabsTrigger>
          <TabsTrigger value="sem-corretor">
            Vendas sem corretor ({dados.vendas_sem_corretor.length})
          </TabsTrigger>
          <TabsTrigger value="integridade">Integridade</TabsTrigger>
          <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
        </TabsList>

        <TabsContent value="conciliacao" className="mt-4">
          <ConciliacaoTab />
        </TabsContent>

        <TabsContent value="fila" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por beneficiário, cliente ou empreendimento"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-sm"
            />
            {selecionados.length > 0 && (
              <Button onClick={() => setAcao({ tipo: "lote", ids: selecionados })}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Marcar {selecionados.length} como pagas
              </Button>
            )}
          </div>

          {filaFiltrada.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="Nada em aberto"
              description="Nenhuma comissão aguardando decisão."
            />
          ) : (
            <div className="rounded-xl border border-border-subtle overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={todosMarcados}
                        onCheckedChange={(v) =>
                          setSelecionados(v ? aptosSelecionaveis.map((f) => f.id) : [])
                        }
                        aria-label="Selecionar aptos"
                      />
                    </TableHead>
                    <TableHead>Beneficiário</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Cliente / Empreendimento</TableHead>
                    <TableHead className="text-right">Valor líquido</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filaFiltrada.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Checkbox
                          disabled={f.travado || f.aguardando_beneficiario}
                          checked={selecionados.includes(f.id)}
                          onCheckedChange={(v) =>
                            setSelecionados((prev) =>
                              v ? [...prev, f.id] : prev.filter((id) => id !== f.id),
                            )
                          }
                          aria-label={`Selecionar comissão de ${f.beneficiario_nome ?? "sem beneficiário"}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {f.beneficiario_nome ?? "— sem beneficiário —"}
                        {f.beneficiario_ativo === false && (
                          <Badge variant="outline" className="ml-2">
                            inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">{f.tipo}</TableCell>
                      <TableCell className="text-sm">
                        <div>{f.cliente_nome ?? "—"}</div>
                        <div className="text-muted-foreground">
                          {f.projeto_nome ?? "—"} · assinatura {dataBR(f.data_assinatura)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(f.valor_liquido)}
                      </TableCell>
                      <TableCell>
                        {f.travado ? (
                          <Badge variant="destructive" className="whitespace-normal">
                            {f.motivo_travamento}
                          </Badge>
                        ) : f.aguardando_beneficiario ? (
                          <Badge variant="outline" className="whitespace-normal">
                            Apto · aguardando beneficiário
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Apto</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={f.travado || f.aguardando_beneficiario}
                            onClick={() => setAcao({ tipo: "pagar", item: f })}
                          >
                            Pagar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAcao({ tipo: "beneficiario", item: f })}
                            title="Corrigir beneficiário"
                          >
                            <UserGear className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setAcao({
                                tipo: "cancelar",
                                id: f.id,
                                rotulo: f.beneficiario_nome ?? "sem beneficiário",
                                valor: f.valor_liquido,
                              })
                            }
                            title="Cancelar comissão"
                          >
                            <Prohibit className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setAcao({
                                tipo: "historico",
                                entidade: "comissoes",
                                entidadeId: f.id,
                                titulo: `Histórico · comissão de ${f.beneficiario_nome ?? "sem beneficiário"}`,
                              })
                            }
                            title="Histórico"
                          >
                            <ClockCounterClockwise className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="recebiveis" className="mt-4">
          <TabelaVendas
            vendas={dados.recebiveis}
            vazio="Todas as vendas com comissão aberta já foram recebidas."
            onHistorico={(v) =>
              setAcao({
                tipo: "historico",
                entidade: "venda",
                entidadeId: v.id,
                titulo: `Histórico · venda ${v.projeto_nome ?? v.id.slice(0, 8)}`,
              })
            }
          />
        </TabsContent>

        <TabsContent value="sem-corretor" className="mt-4">
          <TabelaVendas
            vendas={dados.vendas_sem_corretor}
            vazio="Nenhuma venda sem corretor."
            onDefinirCorretor={(v) => setAcao({ tipo: "corretor", venda: v })}
            onHistorico={(v) =>
              setAcao({
                tipo: "historico",
                entidade: "venda",
                entidadeId: v.id,
                titulo: `Histórico · venda ${v.projeto_nome ?? v.id.slice(0, 8)}`,
              })
            }
          />
        </TabsContent>

        <TabsContent value="integridade" className="mt-4 space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dados.integridade.map((i) => (
              <Card key={i.chave}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>{i.titulo}</span>
                    <Badge variant={i.qtd ? "destructive" : "secondary"}>{i.qtd}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{i.descricao}</CardContent>
              </Card>
            ))}
          </div>

          {dados.comissoes_sem_venda.length > 0 && (
            <section className="space-y-2">
              <div>
                <h2 className="text-base font-semibold">
                  Sem venda vinculada ({dados.comissoes_sem_venda.length})
                </h2>
                <p className="text-sm text-muted-foreground">
                  Fora da fila de pagamento — provável resíduo de vendas apagadas/recriadas. Nome do
                  beneficiário mostrado como está gravado, sem resolver. Única ação: cancelar com
                  motivo, linha a linha.
                </p>
              </div>
              <div className="rounded-xl border border-border-subtle overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>comissao_id</TableHead>
                      <TableHead>venda_id órfão</TableHead>
                      <TableHead>Beneficiário gravado</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead className="text-right">Valor líquido</TableHead>
                      <TableHead>Criada em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados.comissoes_sem_venda.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.id}</TableCell>
                        <TableCell className="font-mono text-xs">{o.venda_id ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {o.beneficiario_nome_bruto ?? "— sem beneficiário —"}
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">{o.tipo}</TableCell>
                        <TableCell className="text-right font-medium">
                          {brl(o.valor_liquido)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.created_at ? new Date(o.created_at).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setAcao({
                                  tipo: "cancelar",
                                  id: o.id,
                                  rotulo: o.beneficiario_nome_bruto ?? "sem beneficiário",
                                  valor: o.valor_liquido,
                                })
                              }
                            >
                              <Prohibit className="mr-2 h-4 w-4" />
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setAcao({
                                  tipo: "historico",
                                  entidade: "comissoes",
                                  entidadeId: o.id,
                                  titulo: `Histórico · comissão ${o.id.slice(0, 8)}`,
                                })
                              }
                              title="Histórico"
                            >
                              <ClockCounterClockwise className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </TabsContent>
      </Tabs>

      <DialogAcao
        acao={acao}
        pessoas={dados.pessoas}
        onFechar={() => setAcao(null)}
        salvando={mutUnit.isPending || mutLote.isPending || mutCorretor.isPending}
        onPagar={(id, data) =>
          mutUnit.mutate({ comissao_id: id, status: "paga", data_pagamento: data })
        }
        onReabrir={(id) => mutUnit.mutate({ comissao_id: id, status: "pendente" })}
        onCancelar={(id, motivo) =>
          mutUnit.mutate({ comissao_id: id, status: "cancelada", motivo })
        }
        onBeneficiario={(id, beneficiarioId, motivo) =>
          mutUnit.mutate({ comissao_id: id, beneficiario_id: beneficiarioId, motivo })
        }
        onLote={(ids, data) =>
          mutLote.mutate({ ids, patch: { status: "paga", data_pagamento: data } })
        }
        onCorretor={(vendaId, corretorId, motivo) =>
          mutCorretor.mutate({ vendaId, corretorId, motivo })
        }
      />
    </div>
  );
}

function TabelaVendas({
  vendas,
  vazio,
  onDefinirCorretor,
  onHistorico,
}: {
  vendas: VendaItem[];
  vazio: string;
  onDefinirCorretor?: (v: VendaItem) => void;
  onHistorico: (v: VendaItem) => void;
}) {
  if (!vendas.length) {
    return <EmptyState icon={CheckCircle} title="Nada por aqui" description={vazio} />;
  }
  return (
    <div className="rounded-xl border border-border-subtle overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente / Empreendimento</TableHead>
            <TableHead>Corretor</TableHead>
            <TableHead>Assinatura</TableHead>
            <TableHead className="text-right">VGV</TableHead>
            <TableHead className="text-right">Comissões abertas</TableHead>
            <TableHead>Recebimento</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendas.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="text-sm">
                <div className="font-medium">{v.cliente_nome ?? "—"}</div>
                <div className="text-muted-foreground">{v.projeto_nome ?? "—"}</div>
              </TableCell>
              <TableCell>
                {v.corretor_nome ?? <span className="text-destructive">sem corretor</span>}
              </TableCell>
              <TableCell>{dataBR(v.data_assinatura)}</TableCell>
              <TableCell className="text-right">{brl(v.valor_venda ?? 0)}</TableCell>
              <TableCell className="text-right">
                {v.comissoes_abertas > 0
                  ? `${v.comissoes_abertas} · ${brl(v.valor_comissoes_abertas)}`
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={v.status_recebimento === "recebido" ? "secondary" : "outline"}>
                  {v.status_recebimento === "recebido"
                    ? `recebido ${dataBR(v.data_recebimento)}`
                    : "pendente"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {onDefinirCorretor && (
                    <Button size="sm" variant="outline" onClick={() => onDefinirCorretor(v)}>
                      Definir corretor
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onHistorico(v)}
                    title="Histórico"
                  >
                    <ClockCounterClockwise className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DialogAcao({
  acao,
  pessoas,
  onFechar,
  salvando,
  onPagar,
  onReabrir,
  onCancelar,
  onBeneficiario,
  onLote,
  onCorretor,
}: {
  acao: AcaoAberta;
  pessoas: { id: string; nome: string; ativo: boolean }[];
  onFechar: () => void;
  salvando: boolean;
  onPagar: (id: string, data: string) => void;
  onReabrir: (id: string) => void;
  onCancelar: (id: string, motivo: string) => void;
  onBeneficiario: (id: string, beneficiarioId: string, motivo: string) => void;
  onLote: (ids: string[], data: string) => void;
  onCorretor: (vendaId: string, corretorId: string, motivo: string) => void;
}) {
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [motivo, setMotivo] = useState("");
  const [pessoaId, setPessoaId] = useState("");
  const carregarHistorico = useServerFn(carregarHistoricoFinanceiroFn);

  const historico = useQuery({
    queryKey: [
      "financeiro-historico",
      acao?.tipo === "historico" ? acao.entidade : null,
      acao?.tipo === "historico" ? acao.entidadeId : null,
    ],
    queryFn: () =>
      carregarHistorico({
        data: {
          entidade: acao?.tipo === "historico" ? acao.entidade || null : null,
          entidadeId: acao?.tipo === "historico" ? acao.entidadeId || null : null,
        },
      }),
    enabled: acao?.tipo === "historico",
  });

  if (!acao) return null;

  const fechar = () => {
    setMotivo("");
    setPessoaId("");
    setDataPagamento(hojeISO());
    onFechar();
  };

  const motivoValido = motivo.trim().length >= 10;

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-2xl">
        {acao.tipo === "pagar" && (
          <>
            <DialogHeader>
              <DialogTitle>Marcar comissão como paga</DialogTitle>
              <DialogDescription>
                {acao.item.beneficiario_nome ?? "Sem beneficiário"} · {brl(acao.item.valor_liquido)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="data-pagamento">Data do pagamento</Label>
              <Input
                id="data-pagamento"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
              <Button
                disabled={!dataPagamento || salvando}
                onClick={() => onPagar(acao.item.id, dataPagamento)}
              >
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </>
        )}

        {acao.tipo === "reabrir" && (
          <>
            <DialogHeader>
              <DialogTitle>Reabrir comissão</DialogTitle>
              <DialogDescription>
                A comissão volta para pendente, sem data de pagamento.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Voltar
              </Button>
              <Button disabled={salvando} onClick={() => onReabrir(acao.item.id)}>
                <ArrowCounterClockwise className="mr-2 h-4 w-4" />
                Reabrir
              </Button>
            </DialogFooter>
          </>
        )}

        {acao.tipo === "cancelar" && (
          <>
            <DialogHeader>
              <DialogTitle>Cancelar comissão</DialogTitle>
              <DialogDescription>
                {acao.rotulo} · {brl(acao.valor)}. Nada é apagado — a comissão fica com status
                cancelada e o motivo entra na auditoria.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="motivo-cancelar">Motivo (mínimo 10 caracteres)</Label>
              <Textarea
                id="motivo-cancelar"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                disabled={!motivoValido || salvando}
                onClick={() => onCancelar(acao.id, motivo.trim())}
              >
                Cancelar comissão
              </Button>
            </DialogFooter>
          </>
        )}

        {acao.tipo === "beneficiario" && (
          <>
            <DialogHeader>
              <DialogTitle>Corrigir beneficiário</DialogTitle>
              <DialogDescription>
                Atual: {acao.item.beneficiario_nome ?? "—"}. Pessoas inativas podem ser escolhidas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Novo beneficiário</Label>
                <Select value={pessoaId} onValueChange={setPessoaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a pessoa" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                        {p.ativo ? "" : " (inativo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="motivo-benef">Motivo (mínimo 10 caracteres)</Label>
                <Textarea
                  id="motivo-benef"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Voltar
              </Button>
              <Button
                disabled={!pessoaId || !motivoValido || salvando}
                onClick={() => onBeneficiario(acao.item.id, pessoaId, motivo.trim())}
              >
                Salvar correção
              </Button>
            </DialogFooter>
          </>
        )}

        {acao.tipo === "lote" && (
          <>
            <DialogHeader>
              <DialogTitle>Marcar {acao.ids.length} comissões como pagas</DialogTitle>
              <DialogDescription>
                Cada comissão passa pelas mesmas validações da ação unitária. Falhas individuais são
                relatadas ao final.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="data-lote">Data do pagamento</Label>
              <Input
                id="data-lote"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
              <Button
                disabled={!dataPagamento || salvando}
                onClick={() => onLote(acao.ids, dataPagamento)}
              >
                Confirmar lote
              </Button>
            </DialogFooter>
          </>
        )}

        {acao.tipo === "corretor" && (
          <>
            <DialogHeader>
              <DialogTitle>Definir corretor da venda</DialogTitle>
              <DialogDescription>
                {acao.venda.projeto_nome ?? "Venda"} · {brl(acao.venda.valor_venda ?? 0)}. Valores e
                percentuais não são recalculados.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Corretor</Label>
                <Select value={pessoaId} onValueChange={setPessoaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o corretor" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {pessoas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                        {p.ativo ? "" : " (inativo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="motivo-corretor">Motivo (mínimo 10 caracteres)</Label>
                <Textarea
                  id="motivo-corretor"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Voltar
              </Button>
              <Button
                disabled={!pessoaId || !motivoValido || salvando}
                onClick={() => onCorretor(acao.venda.id, pessoaId, motivo.trim())}
              >
                Salvar
              </Button>
            </DialogFooter>
          </>
        )}

        {acao.tipo === "historico" && (
          <>
            <DialogHeader>
              <DialogTitle>{acao.titulo}</DialogTitle>
              <DialogDescription>
                Trilha única: alterações feitas por esta tela e pelas rotas públicas.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              {historico.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !historico.data?.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead>De → Para</TableHead>
                      <TableHead>Autor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.data.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {l.criado_em ? new Date(l.criado_em).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{l.campo}</TableCell>
                        <TableCell className="text-xs">
                          {l.valor_anterior ?? "—"} → {l.valor_novo ?? "—"}
                          {l.motivo && (
                            <div className="text-muted-foreground">motivo: {l.motivo}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.autor}
                          <div className="text-muted-foreground">{l.origem}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={fechar}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
