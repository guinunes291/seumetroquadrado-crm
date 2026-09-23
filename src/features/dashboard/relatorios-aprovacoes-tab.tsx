// Sub-aba APROVAÇÕES dos Relatórios: a base de clientes com crédito APROVADO
// (aprovação vigente = última análise do lead, aprovada ou condicionada), com
// os valores que o banco aprovou em campos próprios.
//
// Responde a pergunta que motivou a feature: "quem está aprovado entre X e Y
// e cabe no produto novo?". Os filtros de valor rodam no banco (índices da
// migration 20260927120000); o filtro "cabe no produto" roda aqui com a MESMA
// conta do card do lead (features/leads/aprovacao-credito.ts) — escolhe-se um
// empreendimento do catálogo ou digita-se o preço do lançamento, e a lista
// mostra só quem cabe (ou cabe com esforço), com quanto sobra para a
// construtora. Exporta CSV para virar lista de disparo/ligação.
//
// Não usa o filtro de período da página: aprovação vigente é um ESTADO (vale
// até a validade), não um evento do período.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DownloadSimple, HandCoins, SealCheck, Wallet } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  supabaseAprovacao,
  type AprovacaoVigenteRow,
} from "@/integrations/supabase/aprovacao-pendente";
import { useCorretorNomes } from "@/features/dashboard/relatorios-nominais";
import {
  corretorNome,
  dataCurta,
  fmtBRL,
  LeadCell,
  NotaTeto,
} from "@/features/dashboard/relatorios-partes";
import {
  DADOS_APROVACAO_VAZIOS,
  encaixarProduto,
  type DadosAprovacao,
  type ProdutoCandidato,
  type ProdutoEncaixado,
} from "@/features/leads/aprovacao-credito";
import {
  NIVEL_LABEL,
  NIVEL_TONE,
  useCatalogoEncaixe,
} from "@/components/lead-stage/produtos-aprovacao";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import { parseValorBR } from "@/lib/simulador";
import { cn } from "@/lib/utils";

const TETO_LINHAS = 1000;

export type FiltrosAprovacao = {
  finMin: number | null;
  finMax: number | null;
  parcelaMax: number | null;
  poderMin: number | null;
  poderMax: number | null;
  comFgts: boolean;
  comSubsidio: boolean;
  faixa: "" | "1" | "2" | "3" | "4";
  incluirVencidas: boolean;
};

const FILTROS_VAZIOS: FiltrosAprovacao = {
  finMin: null,
  finMax: null,
  parcelaMax: null,
  poderMin: null,
  poderMax: null,
  comFgts: false,
  comSubsidio: false,
  faixa: "",
  incluirVencidas: false,
};

/** numeric pode chegar como string — a conta precisa de number. */
const n = (v: unknown): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** Linha da view → DadosAprovacao (entrada da conta de encaixe). */
export function dadosDaLinha(r: AprovacaoVigenteRow): DadosAprovacao {
  return {
    ...DADOS_APROVACAO_VAZIOS,
    banco: r.banco,
    valor_financiamento: n(r.valor_financiamento),
    valor_parcela: n(r.valor_parcela),
    valor_fgts: n(r.valor_fgts),
    valor_subsidio: n(r.valor_subsidio),
    valor_entrada: n(r.valor_entrada),
    valor_imovel_simulacao: n(r.valor_imovel_simulacao),
    renda_familiar: n(r.renda_familiar),
    prazo_meses: n(r.prazo_meses),
    faixa_mcmv: (r.faixa_mcmv as DadosAprovacao["faixa_mcmv"]) ?? null,
    validade_ate: r.validade_ate,
  };
}

/** CSV (separador ";" e BOM — abre direto no Excel pt-BR). */
export function montarCsvAprovacoes(
  linhas: { r: AprovacaoVigenteRow; corretor: string; encaixe?: ProdutoEncaixado | null }[],
): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const dec = (v: unknown) => (n(v) == null ? "" : String(n(v)).replace(".", ","));
  const cab = [
    "Cliente",
    "Telefone",
    "Corretor",
    "Etapa",
    "Banco",
    "Financiamento",
    "Parcela",
    "FGTS",
    "Subsídio",
    "Entrada",
    "Poder de compra",
    "Faixa",
    "Validade",
    "Encaixe",
    "Saldo construtora",
  ];
  const corpo = linhas.map(({ r, corretor, encaixe }) =>
    [
      esc(r.lead_nome),
      esc(r.lead_telefone),
      esc(corretor),
      esc(r.lead_status),
      esc(r.banco),
      dec(r.valor_financiamento),
      dec(r.valor_parcela),
      dec(r.valor_fgts),
      dec(r.valor_subsidio),
      dec(r.valor_entrada),
      dec(r.poder_compra),
      esc(r.faixa_mcmv),
      esc(r.validade_ate),
      esc(encaixe ? NIVEL_LABEL[encaixe.encaixe.nivel] : ""),
      encaixe ? dec(encaixe.encaixe.saldoConstrutora) : "",
    ].join(";"),
  );
  return "﻿" + [cab.join(";"), ...corpo].join("\n");
}

function useAprovacoesVigentes(filtros: FiltrosAprovacao, scope: string | null) {
  return useQuery({
    queryKey: ["relatorio-aprovacoes", filtros, scope],
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: AprovacaoVigenteRow[]; total: number } | null> => {
      let q = supabaseAprovacao
        .from("aprovacoes_credito_vigentes")
        .select("*", { count: "exact" })
        .not("valor_financiamento", "is", null)
        .order("poder_compra", { ascending: false })
        .order("analise_id")
        .limit(TETO_LINHAS);
      if (scope) q = q.eq("corretor_id", scope);
      if (filtros.finMin != null) q = q.gte("valor_financiamento", filtros.finMin);
      if (filtros.finMax != null) q = q.lte("valor_financiamento", filtros.finMax);
      if (filtros.parcelaMax != null) q = q.lte("valor_parcela", filtros.parcelaMax);
      if (filtros.poderMin != null) q = q.gte("poder_compra", filtros.poderMin);
      if (filtros.poderMax != null) q = q.lte("poder_compra", filtros.poderMax);
      if (filtros.comFgts) q = q.gt("valor_fgts", 0);
      if (filtros.comSubsidio) q = q.gt("valor_subsidio", 0);
      if (filtros.faixa) q = q.eq("faixa_mcmv", filtros.faixa);
      if (!filtros.incluirVencidas) q = q.eq("vencida", false);
      const { data, error, count } = await q;
      // View ainda não aplicada no banco: a aba avisa em vez de quebrar.
      if (error && isMissingBackendObject(error)) return null;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? data?.length ?? 0 };
    },
  });
}

/** Input de valor em R$ que devolve number|null (aceita "250.000", "250 mil" não). */
function CampoValor({
  label,
  onChange,
  placeholder,
}: {
  label: string;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        inputMode="decimal"
        placeholder={placeholder}
        onChange={(e) => onChange(parseValorBR(e.target.value))}
      />
    </div>
  );
}

export function RelatoriosAprovacoesTab({
  scope,
  canSeeAll,
}: {
  scope: string | null;
  canSeeAll: boolean;
}) {
  const [filtros, setFiltros] = useState<FiltrosAprovacao>(FILTROS_VAZIOS);
  const set = <K extends keyof FiltrosAprovacao>(k: K, v: FiltrosAprovacao[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  // Produto-alvo: empreendimento do catálogo OU preço digitado.
  const [projetoId, setProjetoId] = useState<string>("none");
  const [precoAlvo, setPrecoAlvo] = useState<number | null>(null);
  const [soQuemCabe, setSoQuemCabe] = useState(true);

  const q = useAprovacoesVigentes(filtros, scope);
  const nomes = useCorretorNomes(canSeeAll);
  const catalogo = useCatalogoEncaixe();

  const produtoAlvo: ProdutoCandidato | null = useMemo(() => {
    if (projetoId !== "none") return catalogo.data?.find((p) => p.id === projetoId) ?? null;
    if (precoAlvo && precoAlvo > 0) {
      return {
        id: "preco-digitado",
        nome: "Preço informado",
        construtora: null,
        bairro: null,
        cidade: null,
        preco_a_partir: precoAlvo,
        renda_minima: null,
      };
    }
    return null;
  }, [projetoId, precoAlvo, catalogo.data]);

  const linhas = useMemo(() => {
    const rows = q.data?.rows ?? [];
    return rows
      .map((r) => ({
        r,
        corretor: corretorNome(r.corretor_id, nomes.data),
        encaixe: produtoAlvo ? encaixarProduto(produtoAlvo, dadosDaLinha(r)) : null,
      }))
      .filter(
        (l) => !produtoAlvo || !soQuemCabe || (l.encaixe && l.encaixe.encaixe.nivel !== "nao_cabe"),
      );
  }, [q.data, nomes.data, produtoAlvo, soQuemCabe]);

  const totais = useMemo(() => {
    const soma = (k: keyof AprovacaoVigenteRow) =>
      linhas.reduce((acc, l) => acc + (n(l.r[k]) ?? 0), 0);
    const qtd = linhas.length;
    return {
      qtd,
      mediaFin: qtd ? soma("valor_financiamento") / qtd : 0,
      mediaPoder: qtd ? soma("poder_compra") / qtd : 0,
      comFgts: linhas.filter((l) => (n(l.r.valor_fgts) ?? 0) > 0).length,
    };
  }, [linhas]);

  const baixarCsv = () => {
    const blob = new Blob([montarCsvAprovacoes(linhas)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aprovacoes-credito-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (q.data === null) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          O relatório de aprovações depende da migration de dados da aprovação, que ainda não foi
          aplicada neste banco.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros da aprovação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <CampoValor
              label="Financiamento de (R$)"
              placeholder="150.000"
              onChange={(v) => set("finMin", v)}
            />
            <CampoValor
              label="Financiamento até (R$)"
              placeholder="250.000"
              onChange={(v) => set("finMax", v)}
            />
            <CampoValor
              label="Parcela até (R$)"
              placeholder="1.800"
              onChange={(v) => set("parcelaMax", v)}
            />
            <CampoValor label="Poder de compra de (R$)" onChange={(v) => set("poderMin", v)} />
            <CampoValor label="Poder de compra até (R$)" onChange={(v) => set("poderMax", v)} />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-36 space-y-1">
              <Label className="text-xs">Faixa MCMV</Label>
              <Select
                value={filtros.faixa || "todas"}
                onValueChange={(v) =>
                  set("faixa", v === "todas" ? "" : (v as FiltrosAprovacao["faixa"]))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {(["1", "2", "3", "4"] as const).map((f) => (
                    <SelectItem key={f} value={f}>
                      Faixa {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={filtros.comFgts} onCheckedChange={(v) => set("comFgts", v)} />
              Com FGTS
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={filtros.comSubsidio}
                onCheckedChange={(v) => set("comSubsidio", v)}
              />
              Com subsídio
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={filtros.incluirVencidas}
                onCheckedChange={(v) => set("incluirVencidas", v)}
              />
              Incluir aprovações vencidas
            </label>
          </div>

          <div className="rounded-md border border-dashed p-3">
            <div className="mb-2 text-xs font-semibold">Cabe no produto?</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Empreendimento do catálogo</Label>
                <Select value={projetoId} onValueChange={setProjetoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— nenhum —</SelectItem>
                    {(catalogo.data ?? [])
                      .slice()
                      .sort((a, b) => a.nome.localeCompare(b.nome))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <CampoValor
                label="…ou preço do imóvel (R$)"
                placeholder="265.000"
                onChange={setPrecoAlvo}
              />
              <label className="flex items-center gap-2 self-end pb-2 text-xs">
                <Switch checked={soQuemCabe} onCheckedChange={setSoQuemCabe} />
                Mostrar só quem cabe
              </label>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Mesma conta do card do lead, sobre o "a partir de" do empreendimento: financiamento
              aprovado (até 80% do imóvel) + FGTS + subsídio + entrada; construtora até 20% cabe,
              até 25% com esforço. O valor do imóvel da carta (teto da faixa) não entra na conta.
            </p>
          </div>
        </CardContent>
      </Card>

      <StatGrid>
        <StatTile
          title="Clientes aprovados"
          value={totais.qtd}
          icon={SealCheck}
          loading={q.isLoading}
        />
        <StatTile
          title="Financiamento médio"
          value={fmtBRL(totais.mediaFin)}
          icon={HandCoins}
          loading={q.isLoading}
        />
        <StatTile
          title="Poder de compra médio"
          value={fmtBRL(totais.mediaPoder)}
          icon={Wallet}
          loading={q.isLoading}
        />
        <StatTile title="Com FGTS" value={totais.comFgts} loading={q.isLoading} />
      </StatGrid>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm">
            Aprovações vigentes{produtoAlvo ? ` · encaixe em ${produtoAlvo.nome}` : ""}
          </CardTitle>
          <Button size="sm" variant="outline" disabled={!linhas.length} onClick={baixarCsv}>
            <DownloadSimple className="h-4 w-4" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : q.error ? (
            <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum cliente aprovado com esses filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    {canSeeAll && <TableHead>Corretor</TableHead>}
                    <TableHead>Banco</TableHead>
                    <TableHead className="text-right">Financiamento</TableHead>
                    <TableHead className="text-right">Parcela</TableHead>
                    <TableHead className="text-right">FGTS</TableHead>
                    <TableHead className="text-right">Subsídio</TableHead>
                    <TableHead className="text-right">Poder de compra</TableHead>
                    <TableHead>Faixa</TableHead>
                    <TableHead>Validade</TableHead>
                    {produtoAlvo && <TableHead>Encaixe</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(({ r, corretor, encaixe }) => (
                    <TableRow key={r.analise_id}>
                      <TableCell>
                        <LeadCell
                          leadId={r.lead_id}
                          nome={r.lead_nome}
                          telefone={r.lead_telefone}
                        />
                      </TableCell>
                      {canSeeAll && <TableCell className="text-xs">{corretor}</TableCell>}
                      <TableCell className="text-xs">{r.banco ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(n(r.valor_financiamento) ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(r.valor_parcela) != null ? fmtBRL(n(r.valor_parcela)!) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(r.valor_fgts) ? fmtBRL(n(r.valor_fgts)!) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(r.valor_subsidio) ? fmtBRL(n(r.valor_subsidio)!) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtBRL(n(r.poder_compra) ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.faixa_mcmv ? `F${r.faixa_mcmv}` : "—"}
                      </TableCell>
                      <TableCell
                        className={cn("text-xs", r.vencida && "font-medium text-destructive")}
                      >
                        {dataCurta(r.validade_ate)}
                      </TableCell>
                      {produtoAlvo && (
                        <TableCell>
                          {encaixe ? (
                            <div className="space-y-0.5">
                              <Badge
                                variant="secondary"
                                className={NIVEL_TONE[encaixe.encaixe.nivel]}
                              >
                                {NIVEL_LABEL[encaixe.encaixe.nivel]}
                              </Badge>
                              <div className="text-[11px] text-muted-foreground tabular-nums">
                                construtora {fmtBRL(encaixe.encaixe.saldoConstrutora)} (
                                {encaixe.encaixe.percentualConstrutora}%)
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <NotaTeto mostrando={q.data?.rows.length ?? 0} total={q.data?.total ?? 0} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
