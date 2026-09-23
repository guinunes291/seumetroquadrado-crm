// Card de decisão da análise de crédito (item 3.1): no lead em
// analise_credito, o corretor/gestor APROVA, aprova COM CONDIÇÃO (crédito
// menor que o pretendido, exigência do banco) ou REPROVA (com motivo) sem
// sair da tela — e cada desfecho já oferece o próximo passo do fluxo:
// aprovada → registrar a venda; condicionada → registrar a venda (ajustada)
// ou nova análise; reprovada → nova análise (outro banco / docs novos) ou
// perda. É a resposta operacional ao "quantos negócios estão liberados?".
//
// Aprovar (com ou sem condição) abre o dialog da APROVAÇÃO COM DADOS: carta
// anexada, valores lidos pela IA e conferidos pelo corretor. Depois de
// aprovado, o card SEGUE visível nas etapas seguintes (venda, pós-venda) com
// os valores, o comprovante e os produtos que encaixam na aprovação.

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  FileArrowUp,
  FileMagnifyingGlass,
  Paperclip,
  PencilSimple,
  SealCheck,
  XCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ANALISE_DECIDIDA,
  ANALISE_STATUS_LABEL,
  decidirAnalise,
  fetchAnaliseAtual,
  type AnaliseCredito,
  type AnaliseResultado,
  type AnaliseStatus,
} from "@/features/leads/analise-credito";
import { formatRelativeTime } from "@/lib/interacoes";
import { urlAssinadaDoc } from "@/lib/documentacao";
import { brl } from "@/lib/orcamento";
import { cn } from "@/lib/utils";
import {
  aprovacaoVencida,
  DADOS_APROVACAO_VAZIOS,
  MODALIDADE_LABEL,
  poderDeCompra,
  temDadosDeAprovacao,
  type DadosAprovacao,
  type Modalidade,
} from "@/features/leads/aprovacao-credito";
import {
  AprovacaoCreditoDialog,
  type ModoAprovacao,
} from "@/components/lead-stage/aprovacao-credito-dialog";
import { ProdutosAprovacao } from "@/components/lead-stage/produtos-aprovacao";

/** Colunas numeric podem vir como string do PostgREST — normaliza para number. */
function dadosDe(a: AnaliseCredito): DadosAprovacao {
  const out = { ...DADOS_APROVACAO_VAZIOS };
  for (const k of Object.keys(out) as (keyof DadosAprovacao)[]) {
    const v = a[k];
    (out as Record<string, unknown>)[k] =
      typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : (v ?? null);
  }
  return out;
}

/** Etapas em que o retorno do banco já pode chegar (atendimento em diante). */
const ETAPAS_COM_ANEXO = new Set([
  "em_atendimento",
  "agendado",
  "visita_realizada",
  "analise_credito",
  "contrato_fechado",
  "pos_venda",
]);

const hojeIso = () => new Date().toISOString().slice(0, 10);

/** Grade compacta com os valores aprovados. */
function ValoresAprovados({ d }: { d: DadosAprovacao }) {
  const itens: [string, string | null][] = [
    ["Financiamento", d.valor_financiamento != null ? brl(d.valor_financiamento) : null],
    ["Parcela", d.valor_parcela != null ? brl(d.valor_parcela) : null],
    ["Prazo", d.prazo_meses != null ? `${d.prazo_meses} meses` : null],
    ["FGTS", d.valor_fgts ? brl(d.valor_fgts) : null],
    ["Subsídio", d.valor_subsidio ? brl(d.valor_subsidio) : null],
    ["Entrada", d.valor_entrada ? brl(d.valor_entrada) : null],
    ["Imóvel máx.", d.valor_imovel_max ? brl(d.valor_imovel_max) : null],
    ["Renda", d.renda_familiar ? brl(d.renda_familiar) : null],
    [
      "Taxa",
      d.taxa_juros_anual != null ? `${d.taxa_juros_anual.toLocaleString("pt-BR")}% a.a.` : null,
    ],
    ["Banco", d.banco],
    ["Modalidade", d.modalidade ? MODALIDADE_LABEL[d.modalidade as Modalidade] : null],
    ["Faixa", d.faixa_mcmv ? `Faixa ${d.faixa_mcmv}` : null],
  ];
  return (
    <div className="space-y-1">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        {itens
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-medium tabular-nums">{v}</dd>
            </div>
          ))}
      </dl>
      <div className="text-xs">
        Poder de compra: <span className="font-semibold">{brl(poderDeCompra(d))}</span>
        {d.validade_ate && (
          <span
            className={cn(
              "ml-2",
              aprovacaoVencida(d.validade_ate, hojeIso())
                ? "font-medium text-destructive"
                : "text-muted-foreground",
            )}
          >
            {aprovacaoVencida(d.validade_ate, hojeIso()) ? "vencida em " : "válida até "}
            {d.validade_ate.split("-").reverse().join("/")}
          </span>
        )}
      </div>
    </div>
  );
}

type LeadMin = { id: string; nome: string; status: string; corretor_id?: string | null };

export function AnaliseCreditoCard({
  lead,
  onRegistrarVenda,
  onNovaAnalise,
  onPerdido,
}: {
  lead: LeadMin;
  /** Abre o modal de venda (aprovada → fechar). */
  onRegistrarVenda?: () => void;
  /** Reabre o modal de análise (reprovada → outro banco/docs novos). */
  onNovaAnalise?: () => void;
  /** Abre o fluxo de perda existente. */
  onPerdido?: () => void;
}) {
  const qc = useQueryClient();
  // Reprovar pede o motivo; aprovar (com ou sem condição) abre o dialog da
  // aprovação com dados.
  const [dialogo, setDialogo] = useState<null | "reprovada">(null);
  const [motivo, setMotivo] = useState("");
  const [aprovacaoModo, setAprovacaoModo] = useState<ModoAprovacao | null>(null);
  const [arquivoInicial, setArquivoInicial] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analiseQ = useQuery({
    queryKey: ["analise-credito", lead.id],
    staleTime: 15_000,
    queryFn: () => fetchAnaliseAtual(lead.id),
  });

  const decidir = useMutation({
    mutationFn: (args: { resultado: AnaliseResultado; motivo?: string }) =>
      decidirAnalise({ leadId: lead.id, leadNome: lead.nome, ...args }),
    onSuccess: (_r, args) => {
      toast.success(
        args.resultado === "aprovada"
          ? "Análise aprovada — negócio liberado para fechamento."
          : args.resultado === "aprovada_condicionada"
            ? "Aprovação com condição registrada — ajuste o produto/valor e feche."
            : "Análise reprovada registrada.",
      );
      setDialogo(null);
      setMotivo("");
      void qc.invalidateQueries({ queryKey: ["analise-credito", lead.id] });
      void qc.invalidateQueries({ queryKey: ["lead-detail:interacoes", lead.id] });
      void qc.invalidateQueries({ queryKey: ["dash:kpis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analise = analiseQ.data;
  const status = (analise?.status ?? "enviada") as AnaliseStatus;
  const decidida = ANALISE_DECIDIDA.some((s) => s === status);
  const aprovada = status === "aprovada" || status === "aprovada_condicionada";
  const dados = analise && aprovada ? dadosDe(analise) : null;
  const comDados = temDadosDeAprovacao(dados);
  const naEtapa = lead.status === "analise_credito";

  // O retorno do banco (ex.: "Simulador – Detalhamento" da Caixa) às vezes
  // chega antes de o lead ser movido para a etapa de análise: o botão
  // "Anexar aprovação" fica disponível do atendimento em diante.
  const podeAnexar = ETAPAS_COM_ANEXO.has(lead.status);

  // Fora da etapa de análise, o card aparece para mostrar uma aprovação com
  // dados (acompanha o lead até a venda) ou para oferecer o anexo.
  if (!naEtapa && !comDados && !podeAnexar) return null;

  /** Abre o seletor NO gesto do clique; escolhido o arquivo, o dialog abre lendo. */
  const escolherArquivo = () => fileRef.current?.click();
  const modoDoAnexo: ModoAprovacao = comDados || (aprovada && analise) ? "editar" : "aprovada";
  const label = ANALISE_STATUS_LABEL[status] ?? analise?.status ?? "Em análise";
  // Fora da etapa e sem aprovação com dados, o card é só o convite ao anexo:
  // nada de selo "Enviada ao banco" num lead que ainda está em atendimento.
  const soAnexo = !naEtapa && !comDados;

  return (
    <Card
      className={cn(
        status === "aprovada" && "border-success/50",
        status === "aprovada_condicionada" && "border-warning/50",
        status === "reprovada" && "border-destructive/50",
        !decidida && !soAnexo && "border-info/40",
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileMagnifyingGlass className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {soAnexo ? "Aprovação de crédito" : "Análise de crédito"}
          </span>
          {soAnexo ? null : analiseQ.isLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <Badge
              variant="secondary"
              className={cn(
                status === "aprovada" && "bg-success/15 text-success",
                status === "aprovada_condicionada" && "bg-warning/15 text-warning",
                status === "reprovada" && "bg-destructive/15 text-destructive",
              )}
            >
              {label}
            </Badge>
          )}
          {analise && !soAnexo && (
            <span className="text-xs text-muted-foreground">
              {decidida ? "decidida" : "registrada"} {formatRelativeTime(analise.updated_at)}
            </span>
          )}
          {!analise && !analiseQ.isLoading && naEtapa && (
            <span className="text-xs text-muted-foreground">
              sem registro — decida aqui mesmo (vale para análises antigas)
            </span>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setArquivoInicial(f);
            setAprovacaoModo(modoDoAnexo);
          }}
        />
        {!comDados && podeAnexar && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
            <Button size="sm" onClick={escolherArquivo}>
              <FileArrowUp className="h-4 w-4" /> Anexar aprovação
            </Button>
            <span className="text-xs text-muted-foreground">
              PDF ou print do retorno do banco — a IA lê financiamento, parcela, FGTS e renda.
            </span>
          </div>
        )}

        {analise?.observacoes && !soAnexo && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{analise.observacoes}</p>
        )}

        {/* A decisão OU o próximo passo — nunca os dois ao mesmo tempo. */}
        {dados && comDados && (
          <>
            <ValoresAprovados d={dados} />
            <div className="flex flex-wrap gap-2">
              {analise?.comprovante_doc_id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={async () => {
                    try {
                      const url = await urlAssinadaDoc(analise.comprovante_doc_id!);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Paperclip className="h-3.5 w-3.5" /> Ver carta de aprovação
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setAprovacaoModo("editar")}
              >
                <PencilSimple className="h-3.5 w-3.5" /> Editar dados
              </Button>
            </div>
            <ProdutosAprovacao dados={dados} />
          </>
        )}

        {!naEtapa ? null : !decidida ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90"
              disabled={decidir.isPending}
              onClick={() => setAprovacaoModo("aprovada")}
            >
              <SealCheck className="h-4 w-4" /> Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-warning/50 text-warning hover:bg-warning/10"
              disabled={decidir.isPending}
              onClick={() => setAprovacaoModo("aprovada_condicionada")}
            >
              <SealCheck className="h-4 w-4" /> Aprovar c/ condição
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={decidir.isPending}
              onClick={() => setDialogo("reprovada")}
            >
              <XCircle className="h-4 w-4" /> Reprovar
            </Button>
          </div>
        ) : status === "aprovada" || status === "aprovada_condicionada" ? (
          <div className="flex flex-wrap gap-2">
            {onRegistrarVenda && (
              <Button size="sm" onClick={onRegistrarVenda}>
                Registrar venda
              </Button>
            )}
            {/* Condicionada: se a condição não fechar, cabe nova rodada. */}
            {status === "aprovada_condicionada" && onNovaAnalise && (
              <Button size="sm" variant="outline" onClick={onNovaAnalise}>
                <ArrowCounterClockwise className="h-4 w-4" /> Nova análise
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {onNovaAnalise && (
              <Button size="sm" variant="outline" onClick={onNovaAnalise}>
                <ArrowCounterClockwise className="h-4 w-4" /> Nova análise
              </Button>
            )}
            {onPerdido && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={onPerdido}
              >
                Marcar como perdido
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogo !== null} onOpenChange={(open) => !open && setDialogo(null)}>
        <DialogContent className="max-w-md">
          {dialogo === "reprovada" && (
            <>
              <DialogHeader>
                <DialogTitle>Reprovar análise — {lead.nome}</DialogTitle>
                <DialogDescription>
                  O motivo fica na análise e na timeline — é o que orienta a próxima tentativa
                  (outro banco, renda composta, docs novos).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label>Motivo da reprovação</Label>
                <Textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: restrição no CPF do cônjuge; renda insuficiente para a faixa…"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogo(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={decidir.isPending}
                  onClick={() => decidir.mutate({ resultado: "reprovada", motivo })}
                >
                  {decidir.isPending ? "Salvando…" : "Reprovar análise"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {aprovacaoModo && (
        <AprovacaoCreditoDialog
          lead={lead}
          modo={aprovacaoModo}
          analise={analise}
          arquivoInicial={arquivoInicial}
          onOpenChange={(o) => {
            if (o) return;
            setAprovacaoModo(null);
            setArquivoInicial(null);
          }}
        />
      )}
    </Card>
  );
}
