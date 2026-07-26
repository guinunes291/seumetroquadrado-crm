// Aba "Conciliação" da tela Financeiro · Fechamento (Etapa 2).
// Importa OFX, sugere vínculos (nunca aplica sozinho), confirma linha a linha,
// permite desfazer e ignorar com motivo, e mostra o caixa conciliado por conta.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  CheckCircle2,
  Landmark,
  RotateCcw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile, StatGrid } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  carregarPainelConciliacaoFn,
  conciliarComissoesFn,
  conciliarVendasFn,
  desconciliarTransacaoFn,
  ignorarTransacaoFn,
  importarExtratoFn,
  reativarTransacaoFn,
} from "@/lib/conciliacao.functions";
import {
  CONTAS,
  MOTIVOS_IGNORAR,
  type ContaBancaria,
  type TransacaoItem,
} from "@/lib/conciliacao-types";

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const dataBR = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const mesBR = (m: string) => {
  const [ano, mes] = m.split("-");
  return `${mes}/${ano}`;
};
const contaLabel = (c: ContaBancaria) => (c === "itau_ltda" ? "Itaú LTDA" : "C6 EI");

type Filtro = "pendentes" | "conciliadas" | "ignoradas";

export function ConciliacaoTab() {
  const queryClient = useQueryClient();
  const carregar = useServerFn(carregarPainelConciliacaoFn);
  const importar = useServerFn(importarExtratoFn);
  const conciliarComissoes = useServerFn(conciliarComissoesFn);
  const conciliarVendas = useServerFn(conciliarVendasFn);
  const desconciliar = useServerFn(desconciliarTransacaoFn);
  const ignorar = useServerFn(ignorarTransacaoFn);
  const reativar = useServerFn(reativarTransacaoFn);

  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [importOpen, setImportOpen] = useState(false);
  const [conta, setConta] = useState<ContaBancaria>("itau_ltda");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ignorarAlvo, setIgnorarAlvo] = useState<TransacaoItem | null>(null);
  const [motivoIgnorar, setMotivoIgnorar] = useState("");
  const [creditoAlvo, setCreditoAlvo] = useState<TransacaoItem | null>(null);
  const [vendasSelecionadas, setVendasSelecionadas] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const painel = useQuery({
    queryKey: ["financeiro-conciliacao"],
    queryFn: () => carregar({}),
    staleTime: 30_000,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["financeiro-conciliacao"] });
    void queryClient.invalidateQueries({ queryKey: ["financeiro-fechamento"] });
    void queryClient.invalidateQueries({ queryKey: ["financeiro-historico"] });
  };

  const trataResultado = (r: { ok: boolean; mensagem?: string; erro?: string; detalhe?: string }) => {
    if (r.ok) {
      toast.success(r.mensagem ?? "Concluído");
      invalidar();
    } else {
      toast.error("Não foi possível concluir", { description: r.detalhe ?? r.erro });
    }
  };

  const mutImportar = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error("Escolha um arquivo OFX");
      const conteudo = await arquivo.text();
      return importar({ data: { conta, arquivo: arquivo.name, conteudo } });
    },
    onSuccess: (r: any) => {
      if (r.ok) {
        toast.success(
          `${r.inseridas} lançamento(s) importado(s)`,
          { description: `${r.duplicadas} já existiam e foram ignorados.` },
        );
        setImportOpen(false);
        setArquivo(null);
        if (inputRef.current) inputRef.current.value = "";
        invalidar();
      } else {
        toast.error("Importação recusada", { description: r.detalhe ?? r.erro });
      }
    },
    onError: (e: Error) => toast.error("Falha na importação", { description: e.message }),
  });

  const mutComissoes = useMutation({
    mutationFn: (p: { transacaoId: string; comissaoIds: string[] }) =>
      conciliarComissoes({ data: p }),
    onSuccess: trataResultado,
    onError: (e: Error) => toast.error("Falha", { description: e.message }),
  });

  const mutVendas = useMutation({
    mutationFn: (p: { transacaoId: string; vendaIds: string[] }) => conciliarVendas({ data: p }),
    onSuccess: (r) => {
      trataResultado(r);
      setCreditoAlvo(null);
      setVendasSelecionadas([]);
    },
    onError: (e: Error) => toast.error("Falha", { description: e.message }),
  });

  const mutDesconciliar = useMutation({
    mutationFn: (transacaoId: string) => desconciliar({ data: { transacaoId } }),
    onSuccess: trataResultado,
    onError: (e: Error) => toast.error("Falha", { description: e.message }),
  });

  const mutIgnorar = useMutation({
    mutationFn: (p: { transacaoId: string; motivo: string }) => ignorar({ data: p }),
    onSuccess: (r) => {
      trataResultado(r);
      setIgnorarAlvo(null);
      setMotivoIgnorar("");
    },
    onError: (e: Error) => toast.error("Falha", { description: e.message }),
  });

  const mutReativar = useMutation({
    mutationFn: (transacaoId: string) => reativar({ data: { transacaoId } }),
    onSuccess: trataResultado,
    onError: (e: Error) => toast.error("Falha", { description: e.message }),
  });

  const dados = painel.data;

  const lista = useMemo(() => {
    if (!dados) return [];
    const alvo =
      filtro === "pendentes" ? "pendente" : filtro === "conciliadas" ? "conciliada" : "ignorada";
    return dados.transacoes.filter((t) => t.status === alvo);
  }, [dados, filtro]);

  if (painel.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (painel.isError || !dados) {
    return (
      <EmptyState
        icon={Landmark}
        title="Não foi possível carregar a conciliação"
        description="Tente novamente em instantes."
      />
    );
  }

  const p = dados.progresso;

  return (
    <div className="space-y-4">
      <StatGrid>
        <StatTile
          icon={CheckCircle2}
          title="Comissões conciliadas"
          value={`${p.comissoes_conciliadas} de ${p.comissoes_pagas}`}
          hint={`${brl(p.valor_conciliado)} de ${brl(p.valor_total)}`}
        />
        <StatTile
          icon={ArrowDownCircle}
          title="Débitos pendentes"
          value={String(
            dados.transacoes.filter((t) => t.status === "pendente" && t.valor < 0).length,
          )}
          hint="Saídas do extrato ainda sem vínculo"
        />
        <StatTile
          icon={ArrowUpCircle}
          title="Créditos pendentes"
          value={String(
            dados.transacoes.filter((t) => t.status === "pendente" && t.valor >= 0).length,
          )}
          hint="Entradas de construtora a identificar"
        />
        <StatTile
          icon={Landmark}
          title="Lançamentos no extrato"
          value={String(dados.transacoes.length)}
          hint="Itaú LTDA + C6 EI"
        />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setImportOpen(true)}>
          <Upload className="mr-2 h-4 w-4" /> Importar extrato
        </Button>
        {(["pendentes", "conciliadas", "ignoradas"] as Filtro[]).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filtro === f ? "secondary" : "ghost"}
            onClick={() => setFiltro(f)}
          >
            {f === "pendentes" ? "Pendentes" : f === "conciliadas" ? "Conciliadas" : "Ignoradas"}
          </Button>
        ))}
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nada por aqui"
          description={
            filtro === "pendentes"
              ? "Importe um extrato OFX do Itaú ou do C6 para começar."
              : "Nenhum lançamento neste filtro."
          }
        />
      ) : (
        <div className="space-y-3">
          {lista.map((t) => {
            const sug = dados.sugestoes[t.id];
            return (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {t.valor < 0 ? "− " : "+ "}
                        {brl(Math.abs(t.valor))}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {dataBR(t.data)} · {contaLabel(t.conta)} · {t.descricao}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === "conciliada" ? "secondary" : "outline"}>
                        {t.status}
                      </Badge>
                      {t.status === "pendente" && (
                        <Button size="sm" variant="ghost" onClick={() => setIgnorarAlvo(t)}>
                          <Ban className="mr-1 h-4 w-4" /> Ignorar
                        </Button>
                      )}
                      {t.status === "ignorada" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => mutReativar.mutate(t.id)}
                          disabled={mutReativar.isPending}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Voltar à fila
                        </Button>
                      )}
                      {t.status === "conciliada" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => mutDesconciliar.mutate(t.id)}
                          disabled={mutDesconciliar.isPending}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Desconciliar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {t.status === "ignorada" && (
                    <p className="text-muted-foreground">Motivo: {t.motivo_ignorada}</p>
                  )}

                  {t.vinculos.length > 0 && (
                    <ul className="space-y-1">
                      {t.vinculos.map((v) => (
                        <li key={v.id} className="text-muted-foreground">
                          {v.tipo === "comissao" ? "Comissão" : "Venda"}: {v.rotulo}
                          {v.data_anterior ? ` · data anterior ${dataBR(v.data_anterior)}` : ""}
                          {v.confirmado_por_nome ? ` · por ${v.confirmado_por_nome}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}

                  {t.status === "pendente" && t.gemeo_transferencia && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-2">
                      <p className="text-muted-foreground">
                        Existe um crédito de mesmo valor e mesma data em outra conta — provável
                        transferência entre contas próprias.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutIgnorar.mutate({
                            transacaoId: t.id,
                            motivo: MOTIVO_TRANSFERENCIA_PROPRIA,
                          })
                        }
                        disabled={mutIgnorar.isPending}
                      >
                        Marcar como transferência própria
                      </Button>
                    </div>
                  )}

                  {t.status === "pendente" && t.valor < 0 && (
                    <div className="space-y-2">
                      {sug?.debito?.length ? (
                        sug.debito.map((s, i) => (
                          <div
                            key={`${t.id}-${i}`}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 ${
                              s.forca === "quase" ? "border-dashed opacity-90" : ""
                            }`}
                          >
                            <div className="space-y-1">
                              <p className="font-medium">
                                {s.tipo === "exato" ? "Match exato" : `Lote de ${s.comissoes.length}`}
                                {" · "}
                                {s.beneficiario_nome}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {s.modo === "liquido_nf" && (
                                  <Badge variant="secondary">líquido NF (−6%)</Badge>
                                )}
                                {s.cita_venda && (
                                  <Badge variant="secondary">mensagem do PIX cita a venda</Badge>
                                )}
                                {s.forca === "quase" && (
                                  <Badge variant="outline">
                                    possível — confira · dif {brl(s.diferenca)}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-muted-foreground">
                                {brl(s.total)} ·{" "}
                                {s.comissoes
                                  .map(
                                    (c) =>
                                      `${c.projeto_nome ?? "sem projeto"} ${brl(c.valor_liquido)}`,
                                  )
                                  .join(" · ")}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant={s.forca === "quase" ? "outline" : "default"}
                              onClick={() => pedirConfirmacao(t, s)}
                              disabled={mutComissoes.isPending}
                            >
                              {s.forca === "quase"
                                ? `Confirmar mesmo assim (dif ${brl(s.diferenca)})`
                                : "Confirmar"}
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">
                          Nenhuma comissão paga bate com este débito. Ignore com motivo se não for
                          pagamento de comissão.
                        </p>
                      )}
                    </div>
                  )}


                  {t.status === "pendente" && t.valor >= 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted-foreground">
                        {sug?.credito?.length
                          ? `${sug.credito.length} venda(s) sugerida(s) pela contraparte.`
                          : "Sem sugestão pela contraparte — selecione a venda manualmente."}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCreditoAlvo(t);
                          setVendasSelecionadas([]);
                        }}
                      >
                        Vincular venda
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Caixa conciliado</CardTitle>
        </CardHeader>
        <CardContent>
          {dados.caixa.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há transação conciliada — o caixa aparece aqui conforme você confirma os
              vínculos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.caixa.map((c) => (
                  <TableRow key={`${c.conta}-${c.mes}`}>
                    <TableCell>{contaLabel(c.conta)}</TableCell>
                    <TableCell>{mesBR(c.mes)}</TableCell>
                    <TableCell className="text-right">{brl(c.entradas)}</TableCell>
                    <TableCell className="text-right">{brl(c.saidas)}</TableCell>
                    <TableCell className="text-right">{brl(c.entradas - c.saidas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Importação */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar extrato</DialogTitle>
            <DialogDescription>
              Somente OFX. Escolha a conta — nunca inferimos do arquivo. Reimportar o mesmo período
              não duplica lançamentos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Conta</Label>
              <Select value={conta} onValueChange={(v) => setConta(v as ContaBancaria)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTAS.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CONTAS.find((c) => c.valor === conta)?.detalhe}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Arquivo OFX</Label>
              <Input
                ref={inputRef}
                type="file"
                accept=".ofx,application/x-ofx,text/plain"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => mutImportar.mutate()} disabled={!arquivo || mutImportar.isPending}>
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ignorar */}
      <Dialog open={!!ignorarAlvo} onOpenChange={(o) => !o && setIgnorarAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ignorar lançamento</DialogTitle>
            <DialogDescription>
              A transação some das pendentes, mas continua recuperável pelo filtro "Ignoradas".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_IGNORAR.map((m) => (
                <Button key={m} size="sm" variant="outline" onClick={() => setMotivoIgnorar(m)}>
                  {m}
                </Button>
              ))}
            </div>
            <Textarea
              value={motivoIgnorar}
              onChange={(e) => setMotivoIgnorar(e.target.value)}
              placeholder="Motivo (obrigatório)"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIgnorarAlvo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                ignorarAlvo &&
                mutIgnorar.mutate({ transacaoId: ignorarAlvo.id, motivo: motivoIgnorar })
              }
              disabled={motivoIgnorar.trim().length < 4 || mutIgnorar.isPending}
            >
              Ignorar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Crédito ↔ venda */}
      <Dialog open={!!creditoAlvo} onOpenChange={(o) => !o && setCreditoAlvo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular recebimento de construtora</DialogTitle>
            <DialogDescription>
              O valor é sugestão fraca (o CRM ainda não conhece o % da SMQ sobre o VGV). Escolha a
              venda manualmente — confirmar marca como recebido com a data real do extrato.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {(creditoAlvo ? (dados.sugestoes[creditoAlvo.id]?.credito ?? []) : []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma venda sugerida pela descrição desta entrada.
              </p>
            )}
            {(creditoAlvo ? (dados.sugestoes[creditoAlvo.id]?.credito ?? []) : []).map((v) => {
              const marcada = vendasSelecionadas.includes(v.venda_id);
              return (
                <button
                  key={v.venda_id}
                  type="button"
                  onClick={() =>
                    setVendasSelecionadas((atual) =>
                      marcada
                        ? atual.filter((id) => id !== v.venda_id)
                        : [...atual, v.venda_id],
                    )
                  }
                  className={`w-full rounded-md border p-2 text-left text-sm ${
                    marcada ? "border-primary bg-accent" : ""
                  }`}
                >
                  <span className="font-medium">{v.projeto_nome ?? "Sem empreendimento"}</span>{" "}
                  <span className="text-muted-foreground">
                    · {v.cliente_nome ?? "sem cliente"} · {brl(v.valor_venda ?? 0)} ·{" "}
                    {dataBR(v.data_assinatura)} · {v.status_recebimento ?? "—"}
                  </span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreditoAlvo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                creditoAlvo &&
                mutVendas.mutate({ transacaoId: creditoAlvo.id, vendaIds: vendasSelecionadas })
              }
              disabled={!vendasSelecionadas.length || mutVendas.isPending}
            >
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
