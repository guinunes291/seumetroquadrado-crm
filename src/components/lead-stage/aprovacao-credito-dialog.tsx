// Dialog da APROVAÇÃO de crédito com dados: o corretor anexa a carta de
// aprovação (PDF/print), a IA lê os números e pré-preenche o formulário, o
// corretor confere e grava. Os valores vão para campos próprios de
// analises_credito (migration 20260927120000) — é deles que saem os produtos
// que encaixam e o relatório de aprovados.
//
// Três modos: aprovar, aprovar com condição (pede a condição) e editar os
// dados de uma aprovação já registrada (corrigir valor, anexar depois).

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CircleNotch, FileArrowUp, Paperclip, SealCheck } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SamiMark } from "@/components/ui/sami-mark";
import { supabase } from "@/integrations/supabase/client";
import { lerAprovacaoCredito, type LeituraAprovacao } from "@/lib/aprovacao-ia.functions";
import { anexarComprovanteAprovacao } from "@/lib/documentacao";
import { brl } from "@/lib/orcamento";
import type { Json } from "@/integrations/supabase/types";
import {
  atualizarDadosAprovacao,
  decidirAnalise,
  type AnaliseCredito,
} from "@/features/leads/analise-credito";
import {
  dadosParaForm,
  DADOS_APROVACAO_VAZIOS,
  formParaDados,
  MODALIDADE_LABEL,
  mesclarExtracao,
  poderDeCompra,
  tetoDeImovel,
  validarDadosAprovacao,
  type DadosAprovacao,
  type FormAprovacao,
  type Modalidade,
} from "@/features/leads/aprovacao-credito";

export type ModoAprovacao = "aprovada" | "aprovada_condicionada" | "editar";

type Props = {
  lead: { id: string; nome: string; corretor_id?: string | null };
  modo: ModoAprovacao;
  /** Modo editar: a análise atual (pré-preenche). */
  analise?: AnaliseCredito | null;
  /** Arquivo já escolhido no card ("Anexar aprovação"): anexa e lê ao abrir. */
  arquivoInicial?: File | null;
  onOpenChange: (open: boolean) => void;
};

function dadosDaAnalise(a: AnaliseCredito | null | undefined): Partial<DadosAprovacao> {
  if (!a) return {};
  const out: Partial<DadosAprovacao> = {};
  for (const k of Object.keys(DADOS_APROVACAO_VAZIOS) as (keyof DadosAprovacao)[]) {
    const v = a[k];
    // numeric chega como string do PostgREST em alguns drivers: normaliza.
    (out as Record<string, unknown>)[k] =
      typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : (v ?? null);
  }
  return out;
}

/** Campo de texto com rótulo — o formulário tem 15 destes. */
function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  lidoPelaIa,
  type = "text",
  obrigatorio,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  lidoPelaIa?: boolean;
  type?: "text" | "date";
  obrigatorio?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="flex items-center gap-1 text-xs">
        {label}
        {obrigatorio && <span className="text-destructive">*</span>}
        {lidoPelaIa && <SamiMark className="h-3 w-3" aria-label="lido pela IA" />}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={type === "text" && !id.endsWith("banco") ? "decimal" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function AprovacaoCreditoDialog({
  lead,
  modo,
  analise,
  arquivoInicial,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const ler = useServerFn(lerAprovacaoCredito);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormAprovacao>(() => dadosParaForm(dadosDaAnalise(analise)));
  const [condicao, setCondicao] = useState("");
  const [comprovanteId, setComprovanteId] = useState<string | null>(
    analise?.comprovante_doc_id ?? null,
  );
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraAprovacao | null>(null);
  const [editadoAposIa, setEditadoAposIa] = useState(false);
  const [erros, setErros] = useState<string[]>([]);

  const set = <K extends keyof FormAprovacao>(k: K, v: FormAprovacao[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (leitura) setEditadoAposIa(true);
  };
  const lido = (k: keyof DadosAprovacao) => leitura?.camposLidos.includes(k) ?? false;

  // 1) Anexa (upload mediado) e 2) pede a leitura à IA. Se a IA falhar, o
  //    anexo continua valendo — o corretor preenche à mão.
  const anexar = useMutation({
    mutationFn: async (file: File) => {
      const { data: u } = await supabase.auth.getUser();
      const docId = await anexarComprovanteAprovacao(
        lead.id,
        lead.corretor_id ?? u.user?.id ?? null,
        file,
      );
      setComprovanteId(docId);
      setArquivoNome(file.name);
      try {
        return await ler({ data: { documentacaoId: docId } });
      } catch (e) {
        toast.warning(
          `Carta anexada, mas a leitura automática falhou: ${(e as Error).message} Preencha os valores.`,
        );
        return null;
      }
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["documentacoes", lead.id] });
      if (!res) return;
      setLeitura(res);
      setEditadoAposIa(false);
      setForm((f) => mesclarExtracao(f, res.dados));
      if (res.camposLidos.length === 0) {
        toast.warning("A IA não encontrou valores na carta. Preencha manualmente.");
      } else {
        toast.success(`IA preencheu ${res.camposLidos.length} campos — confira antes de salvar.`);
      }
      if (res.observacoes && modo === "aprovada_condicionada" && !condicao) {
        setCondicao(res.observacoes);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Arquivo escolhido no card: sobe e lê uma vez só (o ref segura o
  // duplo-mount do StrictMode, que subiria o arquivo duas vezes).
  const iniciou = useRef(false);
  useEffect(() => {
    if (arquivoInicial && !iniciou.current) {
      iniciou.current = true;
      anexar.mutate(arquivoInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivoInicial]);

  const dados = formParaDados(form);
  const poder = poderDeCompra(dados);

  const salvar = useMutation({
    mutationFn: async () => {
      const problemas = validarDadosAprovacao(dados);
      if (modo === "aprovada_condicionada" && !condicao.trim()) {
        problemas.push("Descreva a condição imposta pelo banco.");
      }
      setErros(problemas);
      if (problemas.length) throw new Error(problemas[0]);

      const aprovacao = {
        dados,
        comprovanteDocId: comprovanteId,
        origem: leitura ? (editadoAposIa ? "ia_revisado" : "ia") : "manual",
        extraido: leitura ? (JSON.parse(JSON.stringify(leitura)) as Json) : null,
      } as const;

      if (modo === "editar") {
        if (!analise) throw new Error("Análise não encontrada.");
        await atualizarDadosAprovacao({ analiseId: analise.id, leadId: lead.id, aprovacao });
      } else {
        await decidirAnalise({
          leadId: lead.id,
          leadNome: lead.nome,
          resultado: modo,
          motivo: modo === "aprovada_condicionada" ? condicao : null,
          aprovacao,
        });
      }
    },
    onSuccess: () => {
      toast.success(
        modo === "editar"
          ? "Dados da aprovação atualizados."
          : "Aprovação registrada — veja os produtos que encaixam no card.",
      );
      void qc.invalidateQueries({ queryKey: ["analise-credito", lead.id] });
      void qc.invalidateQueries({ queryKey: ["lead-detail:interacoes", lead.id] });
      void qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      void qc.invalidateQueries({ queryKey: ["dash:kpis"] });
      void qc.invalidateQueries({ queryKey: ["relatorio-aprovacoes"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const titulo =
    modo === "editar"
      ? "Dados da aprovação"
      : modo === "aprovada_condicionada"
        ? "Aprovar com condição"
        : "Aprovar crédito";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {titulo} — {lead.nome}
          </DialogTitle>
          <DialogDescription>
            Anexe a carta de aprovação: a IA lê os valores e você confere. Os números ficam salvos
            em campos próprios — é deles que saem os produtos que encaixam e o relatório de
            aprovados.
          </DialogDescription>
        </DialogHeader>

        {/* Anexo + leitura automática */}
        <div className="rounded-md border border-dashed p-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) anexar.mutate(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={anexar.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {anexar.isPending ? (
                <>
                  <CircleNotch className="h-4 w-4 animate-spin" /> Lendo a carta…
                </>
              ) : (
                <>
                  <FileArrowUp className="h-4 w-4" />
                  {comprovanteId ? "Trocar carta de aprovação" : "Anexar carta de aprovação"}
                </>
              )}
            </Button>
            {comprovanteId && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {arquivoNome ?? "Carta anexada (aba Documentação)"}
              </span>
            )}
            {leitura && (
              <Badge variant="secondary" className="gap-1">
                <SamiMark className="h-3 w-3" /> {leitura.camposLidos.length} campos lidos ·
                confiança {Math.round(leitura.confianca * 100)}%
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            PDF, JPG, PNG ou WebP até 15 MB. O arquivo fica no cofre privado do lead (aba
            Documentação). A leitura só preenche campos vazios — o que você digitou é mantido.
          </p>
          {leitura?.observacoes && (
            <p className="mt-1 text-xs">
              <span className="font-medium">Observação da carta:</span> {leitura.observacoes}
            </p>
          )}
        </div>

        {/* Valores principais */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo
            id="ap-financiamento"
            label="Financiamento aprovado (R$)"
            obrigatorio
            value={form.valor_financiamento}
            onChange={(v) => set("valor_financiamento", v)}
            placeholder="185.000,00"
            lidoPelaIa={lido("valor_financiamento")}
          />
          <Campo
            id="ap-parcela"
            label="Parcela aprovada (R$)"
            obrigatorio
            value={form.valor_parcela}
            onChange={(v) => set("valor_parcela", v)}
            placeholder="1.350,00"
            lidoPelaIa={lido("valor_parcela")}
          />
          <Campo
            id="ap-prazo"
            label="Prazo (meses)"
            value={form.prazo_meses}
            onChange={(v) => set("prazo_meses", v)}
            placeholder="420"
            lidoPelaIa={lido("prazo_meses")}
          />
          <Campo
            id="ap-fgts"
            label="FGTS (R$)"
            value={form.valor_fgts}
            onChange={(v) => set("valor_fgts", v)}
            placeholder="0,00"
            lidoPelaIa={lido("valor_fgts")}
          />
          <Campo
            id="ap-subsidio"
            label="Subsídio (R$)"
            value={form.valor_subsidio}
            onChange={(v) => set("valor_subsidio", v)}
            placeholder="0,00"
            lidoPelaIa={lido("valor_subsidio")}
          />
          <Campo
            id="ap-entrada"
            label="Entrada / recursos próprios (R$)"
            value={form.valor_entrada}
            onChange={(v) => set("valor_entrada", v)}
            placeholder="0,00"
            lidoPelaIa={lido("valor_entrada")}
          />
          <Campo
            id="ap-imovel-max"
            label="Valor máx. do imóvel (R$)"
            value={form.valor_imovel_max}
            onChange={(v) => set("valor_imovel_max", v)}
            placeholder="compra e venda / avaliação"
            lidoPelaIa={lido("valor_imovel_max")}
          />
          <Campo
            id="ap-renda"
            label="Renda familiar considerada (R$)"
            value={form.renda_familiar}
            onChange={(v) => set("renda_familiar", v)}
            placeholder="4.500,00"
            lidoPelaIa={lido("renda_familiar")}
          />
          <Campo
            id="ap-taxa"
            label="Taxa de juros (% a.a.)"
            value={form.taxa_juros_anual}
            onChange={(v) => set("taxa_juros_anual", v)}
            placeholder="7,66"
            lidoPelaIa={lido("taxa_juros_anual")}
          />
        </div>

        {/* Condições */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo
            id="ap-banco"
            label="Banco / correspondente"
            value={form.banco}
            onChange={(v) => set("banco", v)}
            placeholder="Caixa"
            lidoPelaIa={lido("banco")}
          />
          <div className="space-y-1">
            <Label className="text-xs">Modalidade</Label>
            <Select
              value={form.modalidade || "none"}
              onValueChange={(v) => set("modalidade", v === "none" ? "" : (v as Modalidade))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(Object.keys(MODALIDADE_LABEL) as Modalidade[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODALIDADE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Faixa MCMV</Label>
            <Select
              value={form.faixa_mcmv || "none"}
              onValueChange={(v) =>
                set("faixa_mcmv", v === "none" ? "" : (v as FormAprovacao["faixa_mcmv"]))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(["1", "2", "3", "4"] as const).map((f) => (
                  <SelectItem key={f} value={f}>
                    Faixa {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amortização</Label>
            <Select
              value={form.sistema_amortizacao || "none"}
              onValueChange={(v) =>
                set(
                  "sistema_amortizacao",
                  v === "none" ? "" : (v as FormAprovacao["sistema_amortizacao"]),
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="price">PRICE</SelectItem>
                <SelectItem value="sac">SAC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Campo
            id="ap-participantes"
            label="Nº de participantes"
            value={form.qtd_participantes}
            onChange={(v) => set("qtd_participantes", v)}
            placeholder="1"
            lidoPelaIa={lido("qtd_participantes")}
          />
          <Campo
            id="ap-data"
            label="Data da aprovação"
            type="date"
            value={form.data_aprovacao}
            onChange={(v) => set("data_aprovacao", v)}
            lidoPelaIa={lido("data_aprovacao")}
          />
          <Campo
            id="ap-validade"
            label="Validade da aprovação"
            type="date"
            value={form.validade_ate}
            onChange={(v) => set("validade_ate", v)}
            lidoPelaIa={lido("validade_ate")}
          />
          <label className="flex items-center gap-2 pt-5 text-xs">
            <Switch checked={form.cotista_fgts} onCheckedChange={(v) => set("cotista_fgts", v)} />
            Cotista FGTS (3+ anos)
          </label>
          <label className="flex items-center gap-2 pt-5 text-xs">
            <Switch
              checked={form.possui_dependente}
              onCheckedChange={(v) => set("possui_dependente", v)}
            />
            Possui dependente
          </label>
        </div>

        {modo === "aprovada_condicionada" && (
          <div className="space-y-1.5">
            <Label>
              Condição imposta pelo banco <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={2}
              value={condicao}
              onChange={(e) => setCondicao(e.target.value)}
              placeholder="Ex.: crédito aprovado em R$ 180 mil (pretendia 220); exige entrada maior…"
            />
          </div>
        )}

        {/* Leitura rápida do resultado antes de salvar */}
        {poder > 0 && (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            Poder de compra <span className="font-semibold">{brl(poder)}</span> · imóvel até{" "}
            <span className="font-semibold">{brl(tetoDeImovel(dados))}</span> com a construtora
            parcelando até 20%.
          </div>
        )}

        {erros.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className={
              modo === "aprovada_condicionada"
                ? "bg-warning text-warning-foreground hover:bg-warning/90"
                : "bg-success text-success-foreground hover:bg-success/90"
            }
            disabled={salvar.isPending || anexar.isPending}
            onClick={() => salvar.mutate()}
          >
            <SealCheck className="h-4 w-4" />
            {salvar.isPending
              ? "Salvando…"
              : modo === "editar"
                ? "Salvar dados"
                : modo === "aprovada_condicionada"
                  ? "Aprovar com condição"
                  : "Aprovar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
