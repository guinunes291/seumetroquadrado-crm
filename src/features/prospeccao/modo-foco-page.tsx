// Modo Foco da Prospecção — a porta de entrada do sistema.
//
// O corretor não cai num quadro: cai numa DECISÃO. Escolhe em qual das três
// bases do topo do funil vai atuar agora (Aguardando Atendimento / Aguardando
// Retorno / Em Qualificação), o sistema monta a fila do foco (até 200 leads
// da sua carteira, na ordem operacional da base) e abre o Modo Foco existente
// (features/leads/focus-mode) para trabalhar um por um. Fechou o foco, volta
// para o seletor com as contagens atualizadas — a fila é sempre o estado vivo
// da base, nunca uma foto velha. (Na tela ela se chama "fila", e não "lote",
// para não confundir com o lote de prospecção do cartão do topo.)
//
// Ordem operacional por base:
// - Aguardando Atendimento: quem chegou primeiro é atendido primeiro (FIFO).
// - Aguardando Retorno: quem está há mais tempo sem contato vem primeiro.
// - Em Qualificação: FIFO (ordem de entrada na etapa ≈ ordem de criação).
//
// Identidade Lançamento (2026-10, como no vídeo de lançamento): a escolha da
// base e o primeiro lead dela ficam lado a lado — "Bases do dia" à esquerda,
// o próximo lead com Ligar / WhatsApp / Registrar à direita. O Modo Foco em
// tela cheia continua sendo onde se trabalha a fila inteira, um por um; ele
// abre a partir do card ("Trabalhar a fila", F).
//
// Lote de prospecção (migration 20261005120000): o cartão do topo pede até 30
// clientes do Bolsão. Enquanto estão na cadência eles ficam FORA da base ativa
// do corretor — e portanto fora das três bases daqui (e do badge, que o banco
// conta com a mesma regra). O trabalho deles é na Fila do Dia da cadência.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tray } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { PageHeader } from "@/components/page-header";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { FocusMode } from "@/features/leads/focus-mode";
import { LoteProspeccaoCard } from "@/features/prospeccao/lote-card";
import { ProximoLeadCard } from "@/features/prospeccao/proximo-lead-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fora das bases: cliente de lote de prospecção ainda na cadência. É a mesma
 *  regra de `_prospeccao_em_lote` no banco, escrita no filtro do PostgREST —
 *  etapa nula precisa entrar explícita, senão o `not.in` a descarta. */
export const FORA_DO_LOTE_ATIVO =
  "prospeccao_lote_id.is.null,cadencia_etapa.is.null,cadencia_etapa.not.in.(D0,D1,D2,D3)";

export type BaseProspeccao =
  "aguardando_atendimento" | "aguardando_retorno" | "qualificacao_corretor";

/** As três bases do topo do funil, com o texto curto do vídeo. */
const BASES: { status: BaseProspeccao; titulo: string; ordem: string }[] = [
  {
    status: "aguardando_atendimento",
    titulo: "Aguardando atendimento",
    ordem: "Quem chegou primeiro sai na frente",
  },
  {
    status: "aguardando_retorno",
    titulo: "Aguardando retorno",
    ordem: "Há mais tempo sem contato primeiro",
  },
  {
    status: "qualificacao_corretor",
    titulo: "Em qualificação",
    ordem: "Renda, FGTS e intenção",
  },
];

export function ModoFocoProspeccaoPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  // A base que o corretor escolheu; sem escolha, a primeira com lead.
  const [escolhida, setEscolhida] = useState<BaseProspeccao | null>(null);
  const [focoAberto, setFocoAberto] = useState(false);

  // Contagens da PRÓPRIA carteira (corretor_id = usuário): o Modo Foco é o
  // trabalho do dia do corretor — gestão enxerga o time na Distribuição e no BI.
  const contagensQ = useQuery({
    queryKey: ["prospeccao:contagens", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Record<BaseProspeccao, number>> => {
      const conta = async (status: BaseProspeccao) => {
        const { count, error } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("corretor_id", user!.id)
          .eq("status", status)
          .eq("na_lixeira", false)
          .is("deleted_at", null)
          .or(FORA_DO_LOTE_ATIVO);
        if (error) throw error;
        return count ?? 0;
      };
      const [atendimento, retorno, qualificacao] = await Promise.all(
        BASES.map((b) => conta(b.status)),
      );
      return {
        aguardando_atendimento: atendimento,
        aguardando_retorno: retorno,
        qualificacao_corretor: qualificacao,
      };
    },
  });

  // Só as contagens andam em tempo real. A fila NÃO: trocá-la por baixo do
  // Modo Foco aberto deslocaria o lead que o corretor está trabalhando (o
  // índice do J/K aponta para outro). Ela se refaz nas ações desta tela.
  useRealtimeInvalidate("leads", [["prospeccao:contagens"]]);

  const contagens = contagensQ.data;
  const temLead = (b: BaseProspeccao | null) => !!b && (contagens?.[b] ?? 0) > 0;
  // A escolha vale enquanto a base tem lead; zerou, a tela passa para a
  // próxima base com gente em vez de mostrar um card vazio.
  const base: BaseProspeccao | null = temLead(escolhida)
    ? escolhida
    : (BASES.find((b) => temLead(b.status))?.status ?? null);

  // O lote: até 200 ids da base escolhida, na ordem operacional. staleTime
  // curto — reabrir o foco na mesma base remonta o lote do estado atual.
  const loteQ = useQuery({
    queryKey: ["prospeccao:lote", user?.id, base],
    enabled: !!user && !!base,
    staleTime: 15_000,
    queryFn: async (): Promise<string[]> => {
      let q = supabase
        .from("leads")
        .select("id")
        .eq("corretor_id", user!.id)
        .eq("status", base!)
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .or(FORA_DO_LOTE_ATIVO)
        .limit(200);
      q =
        base === "aguardando_retorno"
          ? q.order("ultima_interacao", { ascending: true, nullsFirst: true })
          : q.order("created_at", { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((l) => l.id);
    },
  });

  const lote = loteQ.data ?? [];
  const proximo = lote[0] ?? null;

  const atualizarBases = () => {
    // O lote trabalhado mudou o mundo: contagens e listas refletem na volta.
    void qc.invalidateQueries({ queryKey: ["prospeccao:contagens"] });
    void qc.invalidateQueries({ queryKey: ["prospeccao:lote"] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["nav-badges"] });
  };

  const fecharFoco = (open: boolean) => {
    if (open) return;
    setFocoAberto(false);
    atualizarBases();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospecção"
        description="Modo Foco, Oferta Ativa e Discador. Um lead por vez, sem distração."
      />

      {contagensQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar as bases de prospecção."
          error={contagensQ.error}
          onRetry={() => void contagensQ.refetch()}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start">
          <section
            aria-labelledby="bases-do-dia"
            className="rounded-2xl border border-border-subtle bg-card p-4 md:p-5"
          >
            <h2 id="bases-do-dia" className="font-display text-lg font-bold">
              Bases do dia
            </h2>
            <ul className="mt-4 space-y-2.5">
              {BASES.map(({ status, titulo, ordem }) => {
                const total = contagens?.[status];
                const carregando = contagensQ.isLoading;
                const vazia = !carregando && (total ?? 0) === 0;
                const ativa = base === status;
                return (
                  <li key={status}>
                    <button
                      type="button"
                      aria-pressed={ativa}
                      disabled={carregando || vazia}
                      onClick={() => setEscolhida(status)}
                      className={cn(
                        "w-full rounded-xl border p-4 text-left transition-colors",
                        ativa
                          ? "border-gold-400 bg-gold-50 dark:border-gold-500/60 dark:bg-gold-500/10"
                          : "border-border-subtle bg-card hover:border-primary/30",
                        vazia && "opacity-60",
                      )}
                    >
                      {carregando ? (
                        <Skeleton className="h-8 w-10" />
                      ) : (
                        <span className="block font-display text-3xl font-bold leading-none tabular-nums">
                          {total}
                        </span>
                      )}
                      <span className="mt-2 block font-semibold">{titulo}</span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {vazia ? "Base zerada 🎉" : ordem}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-3">
            <section
              aria-label="Próximo lead da base"
              className="min-h-[300px] rounded-2xl border border-border-subtle bg-card p-5 md:p-6"
            >
              {contagensQ.isLoading || (!!base && loteQ.isLoading) ? (
                <div className="space-y-4" aria-busy="true">
                  <Skeleton className="h-6 w-56" />
                  <Skeleton className="h-10 w-72" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : loteQ.isError ? (
                <QueryErrorState
                  title="Não foi possível montar a fila desta base."
                  error={loteQ.error}
                  onRetry={() => void loteQ.refetch()}
                />
              ) : proximo ? (
                <ProximoLeadCard
                  key={proximo}
                  leadId={proximo}
                  posicao={1}
                  total={lote.length}
                  focoAberto={focoAberto}
                  onAbrirFoco={() => setFocoAberto(true)}
                  onTrabalhado={atualizarBases}
                />
              ) : (
                <div className="flex h-full min-h-[250px] flex-col items-center justify-center gap-3 text-center">
                  <Tray className="h-10 w-10 text-muted-foreground" />
                  <p className="font-semibold">Nenhum lead nas suas bases agora.</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Peça um lote do Bolsão aqui embaixo ou abra a Oferta Ativa para trabalhar uma
                    lista.
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/oferta-ativa">Abrir a Oferta Ativa</Link>
                  </Button>
                </div>
              )}
            </section>

            <p className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-xs text-muted-foreground md:flex">
              No foco: <Kbd>J</Kbd>
              <Kbd>K</Kbd> navegam · <Kbd>W</Kbd> WhatsApp · <Kbd>L</Kbd> ligar · <Kbd>R</Kbd>{" "}
              registrar · <Kbd>F</Kbd> abre a fila · <Kbd>Esc</Kbd> volta
            </p>
          </div>
        </div>
      )}

      {/* O lote do Bolsão é a porta de base NOVA — vem depois das bases que o
          corretor já tem, que são o trabalho do dia. */}
      <LoteProspeccaoCard />

      <FocusMode
        leadIds={lote}
        startId={proximo ?? undefined}
        open={focoAberto && lote.length > 0}
        onOpenChange={fecharFoco}
        origem="prospeccao"
      />
    </div>
  );
}
