// Briefing de campo do Modo Visita: o que o corretor precisa saber antes de
// cumprimentar o cliente, e o potencial de crédito dele.
//
// Nada aqui é dado novo — é `leads` + `interacoes` + a tabela APROVE 2026 que
// já existiam, reunidos no momento em que a informação vale alguma coisa. O
// corretor que revisa isso no carro chega sabendo a renda, o que foi
// prometido no último contato e quanto o cliente consegue comprar.
//
// Na identidade Lançamento (como no vídeo), o briefing de 30 segundos — como
// o cliente está e o que ficou combinado — mora no cartão da visita, e o
// potencial de crédito é um cartão próprio (PotencialDeCreditoCard). Aqui fica
// a ficha: faixa, renda, objeções e o que já foi conversado.

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calculator, ChatText, Warning } from "@phosphor-icons/react";
import { SamiMark } from "@/components/ui/sami-mark";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { brl, calcularOrcamento, type ResultadoOrcamento } from "@/lib/orcamento";
import { RENDA_MIN_APROVE } from "@/lib/aprove2026";

export type LeadBriefing = {
  id: string;
  nome: string;
  status: string;
  projeto_nome: string | null;
  renda_informada: string | null;
  proxima_acao: string | null;
  proximo_followup: string | null;
  temperatura: string | null;
  tipo_renda: string | null;
  faixa_mcmv: string | null;
  entrada_disponivel: string | number | null;
  fgts_valor: string | number | null;
  usa_fgts: boolean | null;
  objecoes: string[] | null;
  observacoes: string | null;
  ultima_interacao: string | null;
  created_at: string | null;
};

/** Campos de dinheiro chegam como texto do formulário ("2.500,00", "R$ 3 mil"). */
export function paraNumero(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const limpo = valor
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Potencial de crédito do lead pela tabela APROVE 2026 — a mesma régua do
 * orçamento, não uma conta paralela. Sem renda informada não há estimativa:
 * chutar número na frente do cliente é pior que não ter número.
 */
export function orcamentoDoLead(lead: LeadBriefing): ResultadoOrcamento | null {
  const renda = paraNumero(lead.renda_informada);
  if (renda === null || renda < RENDA_MIN_APROVE) return null;
  return calcularOrcamento({
    renda,
    // Conservador de propósito: sem o dado de carteira/dependente registrado,
    // usa a hipótese que dá o MENOR poder de compra. Prometer a mais na visita
    // é o erro caro.
    tem36MesesRegistro: false,
    temDependente: false,
    fgts: lead.usa_fgts ? (paraNumero(lead.fgts_valor) ?? 0) : 0,
    entrada: paraNumero(lead.entrada_disponivel) ?? 0,
  });
}

function desde(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });
  } catch {
    return null;
  }
}

/** Últimas interações do lead — o "o que já foi conversado" do briefing. */
function useUltimasInteracoes(leadId: string | undefined, ativo: boolean) {
  return useQuery({
    queryKey: ["modo-visita", "briefing-interacoes", leadId],
    enabled: Boolean(leadId) && ativo,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interacoes")
        .select("id, tipo, titulo, conteudo, created_at")
        .eq("lead_id", leadId!)
        .is("deleted_at", null)
        .neq("tipo", "mudanca_status")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        tipo: string;
        titulo: string | null;
        conteudo: string | null;
        created_at: string;
      }>;
    },
  });
}

export function BriefingVisita({ lead, ativo = true }: { lead: LeadBriefing; ativo?: boolean }) {
  const interacoesQ = useUltimasInteracoes(lead.id, ativo);
  const renda = paraNumero(lead.renda_informada);
  const temSelos = Boolean(lead.faixa_mcmv || lead.tipo_renda || lead.usa_fgts);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SamiMark className="h-4 w-4 text-primary" /> Antes de cumprimentar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {temSelos && (
          <div className="flex flex-wrap gap-1.5">
            {lead.faixa_mcmv && <Badge variant="outline">Faixa {lead.faixa_mcmv}</Badge>}
            {lead.tipo_renda && <Badge variant="outline">{lead.tipo_renda}</Badge>}
            {lead.usa_fgts && <Badge variant="outline">Usa FGTS</Badge>}
          </div>
        )}

        {(lead.objecoes?.length ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
            <Warning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Objeções já registradas</p>
              <ul className="list-inside list-disc">
                {lead.objecoes?.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Renda</dt>
          <dd>{renda !== null ? brl(renda) : "não informada"}</dd>
          {paraNumero(lead.entrada_disponivel) !== null && (
            <>
              <dt className="text-muted-foreground">Entrada</dt>
              <dd>{brl(paraNumero(lead.entrada_disponivel)!)}</dd>
            </>
          )}
          {lead.usa_fgts && paraNumero(lead.fgts_valor) !== null && (
            <>
              <dt className="text-muted-foreground">FGTS</dt>
              <dd>{brl(paraNumero(lead.fgts_valor)!)}</dd>
            </>
          )}
          {lead.projeto_nome && (
            <>
              <dt className="text-muted-foreground">Empreendimento</dt>
              <dd>{lead.projeto_nome}</dd>
            </>
          )}
        </dl>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <ChatText className="h-3.5 w-3.5" /> O que já foi conversado
          </p>
          {interacoesQ.isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : (interacoesQ.data?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">Sem interações registradas até aqui.</p>
          ) : (
            <ul className="space-y-1.5">
              {interacoesQ.data?.map((i) => (
                <li key={i.id} className="border-l-2 border-border-subtle pl-2">
                  <p className="font-medium">
                    {i.titulo || i.tipo}{" "}
                    <span className="font-normal text-muted-foreground">{desde(i.created_at)}</span>
                  </p>
                  {i.conteudo && <p className="line-clamp-2 text-muted-foreground">{i.conteudo}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Poder de compra pela tabela oficial — o cartão "Potencial de crédito" do
 * vídeo: a faixa, o "compra até" em destaque, parcela e financiamento.
 * Sempre rotulado como estimativa: o número que vale é o da análise da Caixa,
 * e prometer aprovação na visita é exatamente o erro que a operação não pode
 * cometer. Sem renda (ou fora da tabela) não há número — chutar na frente do
 * cliente é pior que não ter.
 */
/** Real sem centavos: é estimativa — "R$ 1.049,99" sugere uma precisão que a
 *  conta não tem. */
function brlInteiro(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function PotencialDeCreditoCard({ lead }: { lead: LeadBriefing }) {
  const orcamento = orcamentoDoLead(lead);
  const renda = paraNumero(lead.renda_informada);

  return (
    <section
      aria-label="Potencial de crédito"
      className="flex h-full flex-col rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground"
    >
      <h2 className="font-display text-lg font-bold">Potencial de crédito</h2>
      {!orcamento || !orcamento.enquadra ? (
        <div className="mt-3 flex flex-1 flex-col justify-center rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          <Calculator className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
          {renda !== null
            ? (orcamento?.motivoNaoEnquadra ?? "Renda fora da tabela APROVE 2026.")
            : "Informe a renda do cliente para estimar o poder de compra."}
        </div>
      ) : (
        <>
          <span className="mt-2 w-fit rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
            Faixa {orcamento.faixa}
          </span>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Compra até
          </p>
          <p className="font-display text-4xl font-bold tabular-nums tracking-tight">
            {brlInteiro(orcamento.tetoImovel)}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border-subtle px-3 py-2.5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Parcela
              </dt>
              <dd className="font-display text-lg font-bold tabular-nums">
                {brlInteiro(orcamento.parcelaEstimada)}
              </dd>
            </div>
            <div className="rounded-xl border border-border-subtle px-3 py-2.5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Financia
              </dt>
              <dd className="font-display text-lg font-bold tabular-nums">
                {brlInteiro(orcamento.financiamento)}
              </dd>
            </div>
          </dl>
          {orcamento.subsidio > 0 && (
            <p className="mt-2 text-sm">
              Subsídio estimado:{" "}
              <strong className="text-success tabular-nums">
                {brlInteiro(orcamento.subsidio)}
              </strong>
            </p>
          )}
          <p className="mt-auto pt-4 text-xs text-muted-foreground">
            Renda de {brl(renda!)} ({orcamento.segmento}). Estimativa conservadora pela tabela
            APROVE 2026, sem redutor e sem dependente. Não é aprovação — quem aprova é a Caixa.
          </p>
        </>
      )}
    </section>
  );
}
