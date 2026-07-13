// Aba Timeline do dossiê do lead: nota rápida (registro em 1 passo) + histórico
// de interações no componente Timeline do design system (agrupado por dia,
// ícone/tom por tipo — mesma paleta INTERACAO_TONE do restante do CRM).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  DIRECAO_LABEL,
  INTERACAO_ICON,
  INTERACAO_LABEL,
  INTERACAO_TONE,
  describeInteracao,
  type InteracaoDirecao,
  type InteracaoTipo,
} from "@/lib/interacoes";

export type Interacao = {
  id: string;
  lead_id: string;
  autor_id: string | null;
  tipo: InteracaoTipo;
  direcao: InteracaoDirecao;
  titulo: string | null;
  conteudo: string;
  ocorreu_em: string;
};

/**
 * Histórico de interações do lead. Exportado para o shell da rota reaproveitar
 * a MESMA query (mesma queryKey → um único fetch) no contador da aba.
 */
export function useInteracoesLead(leadId: string) {
  return useQuery({
    queryKey: ["interacoes", leadId],
    queryFn: async (): Promise<Interacao[]> => {
      const { data, error } = await supabase
        .from("interacoes")
        .select("*")
        .eq("lead_id", leadId)
        .order("ocorreu_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Interacao[];
    },
  });
}

export function TimelineTab({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { data: interacoes = [], isLoading, isError, error, refetch } = useInteracoesLead(leadId);
  const [notaRapida, setNotaRapida] = useState("");

  // Nota rápida: registra uma interação (nota interna) em 1 passo, sem o modal completo.
  const criarNotaRapida = useMutation({
    mutationFn: async () => {
      const txt = notaRapida.trim();
      if (txt.length === 0) throw new Error("Escreva a nota.");
      if (txt.length > 2000) throw new Error("Nota muito longa (máx 2000).");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("interacoes").insert({
        lead_id: leadId,
        autor_id: u.user?.id ?? null,
        tipo: "nota",
        direcao: "interna",
        conteudo: txt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNotaRapida("");
      qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items: TimelineItem[] = interacoes.map((i) => ({
    id: i.id,
    icon: INTERACAO_ICON[i.tipo],
    iconClassName: INTERACAO_TONE[i.tipo],
    title: i.titulo || describeInteracao(i.tipo, i.direcao),
    meta: `${INTERACAO_LABEL[i.tipo]} · ${DIRECAO_LABEL[i.direcao]}`,
    content: i.conteudo ? <p className="whitespace-pre-wrap">{i.conteudo}</p> : undefined,
    timestamp: i.ocorreu_em,
  }));

  return (
    <>
      {/* Nota rápida: registra em 1 passo, sem abrir o modal de interação. */}
      <Card className="mb-4">
        <CardContent className="pt-4 space-y-2">
          <Textarea
            value={notaRapida}
            onChange={(e) => setNotaRapida(e.target.value)}
            placeholder="Nota rápida (Ctrl+Enter para salvar)…"
            rows={2}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && notaRapida.trim()) {
                e.preventDefault();
                criarNotaRapida.mutate();
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!notaRapida.trim() || criarNotaRapida.isPending}
              onClick={() => criarNotaRapida.mutate()}
            >
              Salvar nota
            </Button>
          </div>
        </CardContent>
      </Card>
      {isError ? (
        <QueryErrorState
          title="Não foi possível carregar a timeline."
          error={error}
          onRetry={() => refetch()}
        />
      ) : (
        <Timeline
          items={items}
          groupByDay
          loading={isLoading}
          empty={
            <EmptyState
              icon={MessageCircle}
              title="Nenhuma interação registrada ainda"
              description="Registre o primeiro contato — uma ligação, um WhatsApp ou uma nota rápida acima."
            />
          }
        />
      )}
    </>
  );
}
