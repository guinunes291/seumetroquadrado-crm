import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Sparkles, Loader2, ExternalLink, Check, X } from "lucide-react";
import { buscarProjetosIA } from "@/lib/match-ia.functions";
import { calcularOrcamento, avaliarAderencia, brl, type ResultadoOrcamento } from "@/lib/orcamento";
import { parseValorBR } from "@/lib/simulador";

const fmtBRL = (n: number | null) => (n == null ? null : brl(n));

export type LeadPerfil = {
  id: string;
  renda_informada?: string | null;
  entrada_disponivel?: string | null;
  usa_fgts?: boolean | null;
  faixa_mcmv?: string | null;
  projeto_nome?: string | null;
  observacoes?: string | null;
};

/** Orçamento conservador do lead pela tabela APROVE 2026: usa o que o lead
 *  informou (renda/entrada), sem assumir redutor nem dependente nem FGTS — assim
 *  o teto é o piso seguro para filtrar empreendimentos. */
export function orcamentoDoLead(l: LeadPerfil): ResultadoOrcamento {
  return calcularOrcamento({
    renda: parseValorBR(l.renda_informada ?? null) ?? 0,
    tem36MesesRegistro: false,
    temDependente: false,
    fgts: 0,
    entrada: parseValorBR(l.entrada_disponivel ?? null) ?? 0,
  });
}

/** Monta uma descrição em PT-BR do perfil do lead para o Match IA, já incluindo
 *  a pré-qualificação APROVE (faixa, segmento e teto de imóvel) quando enquadra. */
export function montarDescricao(l: LeadPerfil): string {
  const orc = orcamentoDoLead(l);
  const partes = [
    l.renda_informada ? `renda informada ${l.renda_informada}` : null,
    l.entrada_disponivel ? `entrada de ${l.entrada_disponivel}` : null,
    l.usa_fgts ? "usa FGTS" : null,
    l.faixa_mcmv ? `faixa MCMV ${l.faixa_mcmv}` : null,
    orc.enquadra
      ? `pré-qualificação APROVE 2026: Faixa ${orc.faixa} (${orc.segmento}), ` +
        `teto de imóvel ~${brl(orc.tetoImovel)}, parcela estimada ${brl(orc.parcelaEstimada)}`
      : null,
    l.projeto_nome ? `interesse em ${l.projeto_nome}` : null,
    l.observacoes ? `observações: ${l.observacoes}` : null,
  ].filter(Boolean);
  return `Cliente para imóvel${partes.length ? ": " + partes.join("; ") : " (perfil pouco informado)"}.`;
}

/** Sugere, sob demanda, os empreendimentos do catálogo mais aderentes ao perfil
 *  do lead — reusa o Match IA (buscarProjetosIA) e cruza com o orçamento APROVE
 *  2026 para marcar quais imóveis cabem de fato no poder de compra do cliente. */
export function EmpreendimentoRecomendado({ lead }: { lead: LeadPerfil }) {
  const buscar = useServerFn(buscarProjetosIA);
  const orc = orcamentoDoLead(lead);
  const mutation = useMutation({
    mutationFn: () => buscar({ data: { descricao: montarDescricao(lead), leadId: lead.id } }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-primary" /> Empreendimento recomendado (IA)
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Buscando…
              </>
            ) : mutation.data ? (
              "Atualizar"
            ) : (
              <>
                <Sparkles className="mr-1 h-3 w-3" /> Sugerir
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {orc.enquadra && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Poder de compra (APROVE):</span>
            <Badge variant="secondary">Faixa {orc.faixa}</Badge>
            <Badge variant="outline">{orc.segmento}</Badge>
            <span className="font-medium">teto {brl(orc.tetoImovel)}</span>
          </div>
        )}
        {mutation.error && (
          <div className="text-sm text-destructive">{(mutation.error as Error).message}</div>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <p className="text-xs text-muted-foreground">
            Sugere os empreendimentos do catálogo com mais aderência ao perfil do lead e marca quais
            cabem no orçamento.
          </p>
        )}
        {mutation.data && (
          <>
            {mutation.data.resumo && (
              <p className="text-xs text-muted-foreground">{mutation.data.resumo}</p>
            )}
            {mutation.data.projetos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum empreendimento aderente encontrado.
              </p>
            ) : (
              <div className="space-y-2">
                {mutation.data.projetos.map((p) => {
                  const aderencia =
                    orc.enquadra && p.preco_a_partir ? avaliarAderencia(p.preco_a_partir, orc) : null;
                  return (
                    <Link
                      key={p.id}
                      to="/projetos/$projetoId"
                      params={{ projetoId: p.id }}
                      className="block rounded-md border p-2 hover:bg-accent"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 truncate text-sm font-medium">
                            {p.nome}
                            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[p.construtora, p.bairro, p.cidade].filter(Boolean).join(" · ")}
                            {p.preco_a_partir ? ` · a partir de ${fmtBRL(p.preco_a_partir)}` : ""}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{p.motivo}</div>
                          {aderencia && (
                            <div
                              className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                                aderencia.cabe ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {aderencia.cabe ? (
                                <>
                                  <Check className="h-3 w-3" /> Cabe no orçamento · folga{" "}
                                  {brl(aderencia.folga)}
                                </>
                              ) : (
                                <>
                                  <X className="h-3 w-3" />{" "}
                                  {aderencia.folga < 0
                                    ? `${brl(-aderencia.folga)} acima do teto`
                                    : `parcelamento ${aderencia.percentualConstrutora}% > 20%`}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {p.pontuacao}/10
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
