// Modo Foco da Prospecção — a porta de entrada do sistema.
//
// O corretor não cai num quadro: cai numa DECISÃO. Escolhe em qual das três
// bases do topo do funil vai atuar agora (Aguardando Atendimento / Aguardando
// Retorno / Em Qualificação), o sistema monta o lote (até 200 leads da sua
// carteira, na ordem operacional da base) e abre o Modo Foco existente
// (features/leads/focus-mode) para trabalhar um por um. Fechou o foco, volta
// para o seletor com as contagens atualizadas — o "lote do dia" é sempre o
// estado vivo da base, nunca uma foto velha.
//
// Ordem operacional por base:
// - Aguardando Atendimento: quem chegou primeiro é atendido primeiro (FIFO).
// - Aguardando Retorno: quem está há mais tempo sem contato vem primeiro.
// - Em Qualificação: FIFO (ordem de entrada na etapa ≈ ordem de criação).

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Crosshair, PhoneCall, Sparkles, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { PageHeader } from "@/components/page-header";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { FocusMode } from "@/features/leads/focus-mode";
import { cn } from "@/lib/utils";

export type BaseProspeccao =
  | "aguardando_atendimento"
  | "aguardando_retorno"
  | "qualificacao_corretor";

const BASES: {
  status: BaseProspeccao;
  titulo: string;
  descricao: string;
  icon: typeof Sparkles;
  iconClass: string;
}[] = [
  {
    status: "aguardando_atendimento",
    titulo: "Clientes Aguardando Atendimento",
    descricao:
      "Leads novos na sua mesa, ainda sem o primeiro contato. Quem chegou primeiro sai na frente.",
    icon: Sparkles,
    iconClass: "bg-primary/10 text-primary",
  },
  {
    status: "aguardando_retorno",
    titulo: "Clientes Aguardando Retorno",
    descricao: "Quem ficou de receber um retorno seu. Os há mais tempo sem contato vêm primeiro.",
    icon: PhoneCall,
    iconClass: "bg-warning/15 text-warning",
  },
  {
    status: "qualificacao_corretor",
    titulo: "Clientes em Qualificação",
    descricao: "Confirmar renda, FGTS e intenção antes de avançar o lead no funil.",
    icon: UserCheck,
    iconClass: "bg-info/15 text-info",
  },
];

export function ModoFocoProspeccaoPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [base, setBase] = useState<BaseProspeccao | null>(null);
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
          .is("deleted_at", null);
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

  useRealtimeInvalidate("leads", [["prospeccao:contagens"]]);

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

  // O foco só abre com o lote pronto E não-vazio; base zerada avisa e fica.
  const lote = loteQ.data ?? [];
  const prontoParaAbrir = focoAberto && !!base && !loteQ.isLoading;
  const loteVazio = prontoParaAbrir && !loteQ.isError && loteQ.data?.length === 0;
  useEffect(() => {
    if (!loteVazio) return;
    // Corrida rara (contagem dizia >0, lote veio vazio): informa e rearma.
    toast.info("Base zerada — nenhum lead para montar o lote agora.");
    setFocoAberto(false);
    setBase(null);
  }, [loteVazio]);

  const escolherBase = (b: BaseProspeccao) => {
    setBase(b);
    setFocoAberto(true);
  };

  const fecharFoco = (open: boolean) => {
    if (open) return;
    setFocoAberto(false);
    setBase(null);
    // O lote trabalhado mudou o mundo: contagens e listas refletem na volta.
    void qc.invalidateQueries({ queryKey: ["prospeccao:contagens"] });
    void qc.invalidateQueries({ queryKey: ["prospeccao:lote"] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["nav-badges"] });
  };

  const contagens = contagensQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospecção — Modo Foco"
        description="Escolha a base do dia. O sistema monta o lote e você trabalha um lead por vez, sem distração."
      />

      {contagensQ.isError ? (
        <QueryErrorState
          title="Não foi possível carregar as bases de prospecção."
          error={contagensQ.error}
          onRetry={() => void contagensQ.refetch()}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {BASES.map(({ status, titulo, descricao, icon: Icon, iconClass }) => {
            const total = contagens?.[status];
            const carregando = contagensQ.isLoading;
            const vazia = !carregando && (total ?? 0) === 0;
            const montando = focoAberto && base === status && loteQ.isLoading;
            return (
              <button
                key={status}
                type="button"
                disabled={carregando || vazia || montando}
                onClick={() => escolherBase(status)}
                className={cn(
                  "group flex min-h-52 flex-col rounded-xl border border-border-subtle bg-card p-5 text-left shadow-elev-1 transition",
                  vazia
                    ? "opacity-60"
                    : "hover-lift press-scale hover:border-primary/40 cursor-pointer",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      iconClass,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  {carregando ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <span className="font-display text-3xl font-bold tabular-nums">{total}</span>
                  )}
                </div>
                <h3 className="mt-4 font-display font-semibold leading-snug">{titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
                <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-primary">
                  {montando ? (
                    "Montando o lote…"
                  ) : vazia ? (
                    "Base zerada 🎉"
                  ) : (
                    <>
                      Montar lote e focar
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Crosshair className="h-3.5 w-3.5" />
        No foco: <Kbd>J</Kbd>/<Kbd>K</Kbd> navegam, <Kbd>W</Kbd> WhatsApp, <Kbd>L</Kbd> ligar,{" "}
        <Kbd>R</Kbd> registrar contato, <Kbd>Esc</Kbd> volta para as bases.
      </p>

      <FocusMode
        leadIds={lote}
        open={prontoParaAbrir && lote.length > 0}
        onOpenChange={fecharFoco}
        origem="prospeccao"
      />
    </div>
  );
}
