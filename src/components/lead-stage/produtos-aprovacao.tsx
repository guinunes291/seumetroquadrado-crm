// Produtos que encaixam na APROVAÇÃO do cliente: com o valor aprovado pelo
// banco (não a estimativa pela renda), o CRM varre o catálogo ativo — e o
// estoque de unidades disponíveis, quando cadastrado — e devolve ao corretor
// o que cabe, o que cabe com esforço e quanto sobra para parcelar com a
// construtora. Conta determinística (features/leads/aprovacao-credito.ts):
// nada de IA aqui, o número tem de bater com a tabela.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowSquareOut, Buildings } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllPaged } from "@/lib/fetch-all-paged";
import { brl } from "@/lib/orcamento";
import { cn } from "@/lib/utils";
import {
  rankearProdutos,
  tetoDeImovel,
  type DadosAprovacao,
  type NivelEncaixe,
  type ProdutoCandidato,
} from "@/features/leads/aprovacao-credito";

/** Catálogo ativo + valores das unidades disponíveis, agrupados por projeto. */
export async function fetchCatalogoEncaixe(): Promise<ProdutoCandidato[]> {
  const { data: projetos, error } = await supabase
    .from("projetos")
    .select("id, nome, construtora, bairro, cidade, preco_a_partir, renda_minima")
    .eq("ativo", true)
    .is("deleted_at", null)
    .limit(500);
  if (error) throw error;

  const unidades = await fetchAllPaged(async (from, to) => {
    const { data, error: uErr } = await supabase
      .from("unidades")
      .select("id, projeto_id, valor")
      .eq("status", "disponivel")
      .is("deleted_at", null)
      .not("valor", "is", null)
      .order("id")
      .range(from, to);
    if (uErr) throw uErr;
    return data ?? [];
  });
  const porProjeto = new Map<string, number[]>();
  for (const u of unidades) {
    if (u.valor == null) continue;
    const lista = porProjeto.get(u.projeto_id) ?? [];
    lista.push(Number(u.valor));
    porProjeto.set(u.projeto_id, lista);
  }

  return (projetos ?? []).map((p) => ({
    ...p,
    preco_a_partir: p.preco_a_partir == null ? null : Number(p.preco_a_partir),
    renda_minima: p.renda_minima == null ? null : Number(p.renda_minima),
    valores_unidades: porProjeto.get(p.id) ?? [],
  }));
}

export function useCatalogoEncaixe(enabled = true) {
  return useQuery({
    queryKey: ["catalogo-encaixe-aprovacao"],
    // Catálogo muda pouco ao longo do dia; 5 min evita refazer a cada card.
    staleTime: 5 * 60_000,
    enabled,
    queryFn: fetchCatalogoEncaixe,
  });
}

export const NIVEL_LABEL: Record<NivelEncaixe, string> = {
  cabe: "Cabe",
  esforco: "Cabe com esforço",
  nao_cabe: "Não cabe",
};

export const NIVEL_TONE: Record<NivelEncaixe, string> = {
  cabe: "bg-success/15 text-success",
  esforco: "bg-warning/15 text-warning",
  nao_cabe: "bg-destructive/15 text-destructive",
};

export function ProdutosAprovacao({ dados }: { dados: DadosAprovacao }) {
  const catalogo = useCatalogoEncaixe();
  const ranking = useMemo(
    () => (catalogo.data ? rankearProdutos(catalogo.data, dados) : null),
    [catalogo.data, dados],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <Buildings className="h-4 w-4 text-primary" />
        Produtos que encaixam nesta aprovação
        {ranking && (
          <span className="font-normal text-muted-foreground">
            {ranking.totalCabe} cabem · {ranking.totalEsforco} com esforço · de{" "}
            {ranking.totalAvaliados} avaliados
          </span>
        )}
      </div>

      {catalogo.isLoading && <Skeleton className="h-20 w-full" />}
      {catalogo.error && (
        <p className="text-xs text-destructive">
          Não foi possível carregar o catálogo: {(catalogo.error as Error).message}
        </p>
      )}
      {ranking && ranking.sugestoes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhum empreendimento ativo cabe nesta aprovação. Caminhos: compor renda, usar mais
          FGTS/entrada ou procurar produto até {brl(tetoDeImovel(dados))}.
        </p>
      )}

      {ranking && ranking.sugestoes.length > 0 && (
        <ul className="space-y-1.5">
          {ranking.sugestoes.map(({ produto, precoReferencia, unidadesQueCabem, encaixe }) => (
            <li key={produto.id}>
              <Link
                to="/projetos/$projetoId"
                params={{ projetoId: produto.id }}
                className="block rounded-md border p-2 hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 truncate text-sm font-medium">
                      {produto.nome}
                      <ArrowSquareOut className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[produto.construtora, produto.bairro, produto.cidade]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="mt-0.5 text-xs">
                      {unidadesQueCabem != null ? "Unidade até " : "A partir de "}
                      <span className="font-medium tabular-nums">{brl(precoReferencia)}</span>
                      {" · construtora "}
                      <span className="tabular-nums">
                        {brl(encaixe.saldoConstrutora)} ({encaixe.percentualConstrutora}%)
                      </span>
                      {unidadesQueCabem != null && unidadesQueCabem > 0 && (
                        <span className="text-muted-foreground">
                          {" · "}
                          {unidadesQueCabem} unidade{unidadesQueCabem > 1 ? "s" : ""} cabe
                          {unidadesQueCabem > 1 ? "m" : ""}
                        </span>
                      )}
                    </div>
                    {encaixe.alertas.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {encaixe.alertas.join(" ")}
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary" className={cn("shrink-0", NIVEL_TONE[encaixe.nivel])}>
                    {NIVEL_LABEL[encaixe.nivel]}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Conta: financiamento aprovado (até 80% do imóvel) + FGTS + subsídio + entrada; o restante é
        parcelado com a construtora (até 20% cabe, até 25% com esforço). Confirme a tabela vigente
        antes de propor.
      </p>
    </div>
  );
}
