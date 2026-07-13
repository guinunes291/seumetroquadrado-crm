// Mutations da listagem de leads — extraídas de leads.index.tsx sem mudança de
// comportamento (mesmos payloads, invalidações, toasts e ordem de efeitos).
// Os estados (seleção, dialogs) continuam na página; o hook recebe callbacks.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildWhatsAppUrl } from "@/lib/templates";
import { mensagemPrimeiroContato } from "@/lib/whatsapp";
import { notaSistemaPayload } from "@/lib/interacoes";
import { transicionarLead } from "@/lib/lead-transitions";
import type { Lead } from "./types";

export function useLeadMutations(opts: {
  /** Limpa a seleção em lote — o que a página faz com setSelectedIds(new Set()). */
  clearSelection: () => void;
  /** Fecha (e reseta) os dialogs controlados pela página, na mesma ordem de antes. */
  fecharDialogs?: {
    /** Fecha o dialog de transferência em lote e limpa o corretor de destino. */
    transferir?: () => void;
    /** Fecha o dialog de follow-up em lote e limpa a data escolhida. */
    followup?: () => void;
    /** Fecha o dialog "Iniciar atendimento" (escolha de tipo de contato). */
    contato?: () => void;
  };
}) {
  const { clearSelection, fecharDialogs } = opts;
  const qc = useQueryClient();

  const distribuir = useMutation({
    mutationFn: async (leadId: string) => {
      // Distribuição v3: triagem única (origem → roleta → corretor apto).
      const { data, error } = await supabase.rpc("triar_e_distribuir_lead", {
        _lead_id: leadId,
        _gatilho: "manual_roleta",
      });
      if (error) throw error;
      const res = data as { ok?: boolean; corretor_id?: string; motivo?: string } | null;
      return { corretorId: res?.ok ? (res.corretor_id ?? null) : null, leadId, res };
    },
    onSuccess: async ({ corretorId, leadId, res }) => {
      if (!corretorId) {
        toast.warning(
          "Nenhum corretor apto na roleta agora — o lead entrou na fila de exceções da Distribuição e o sistema re-tenta a cada minuto." +
            (res?.motivo ? ` (${res.motivo})` : ""),
        );
      } else {
        toast.success("Lead atribuído via roleta");
        await supabase.functions.invoke("notify-lead-transfer", {
          body: { lead_id: leadId, corretor_id: corretorId },
        });
      }
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moverLixeira = useMutation({
    mutationFn: async ({ ids, lixeira }: { ids: string[]; lixeira: boolean }) => {
      const { error } = await supabase
        .from("leads")
        .update({
          na_lixeira: lixeira,
          data_movido_lixeira: lixeira ? new Date().toISOString() : null,
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.lixeira
          ? `${v.ids.length} lead(s) movido(s) para lixeira`
          : `${v.ids.length} lead(s) restaurado(s)`,
      );
      clearSelection();
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkTransferir = useMutation({
    mutationFn: async ({ ids, corretorId }: { ids: string[]; corretorId: string }) => {
      if (!ids.length) throw new Error("Selecione ao menos um lead.");
      if (!corretorId) throw new Error("Selecione o corretor de destino.");

      // RPC canônica: além do corretor_id, renova data_distribuicao (sem isso o
      // job de redistribuição desfazia a transferência) e registra no log.
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const lote = ids.slice(i, i + batchSize);
        const { error } = await supabase.rpc(
          "transferir_leads" as never,
          { _ids: lote, _corretor: corretorId } as never,
        );
        if (error) {
          console.error("[bulkTransferir]", { error, loteInicio: i, loteTamanho: lote.length });
          throw error;
        }
      }

      // Histórico: a transferência em lote pela UI só registrava no
      // distribution_log; agora deixa nota na timeline de cada lead (mesmo
      // rastro da realocação individual via API).
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      await supabase.from("interacoes").insert(
        ids.map((id) =>
          notaSistemaPayload({
            leadId: id,
            autorId: uid,
            titulo: "Lead transferido",
            conteudo: "Lead realocado em lote para outro corretor.",
            metadata: { acao: "transferencia_lote", corretor_novo: corretorId },
          }),
        ) as never,
      );

      // Notifica via WhatsApp leads com origem=facebook (best-effort).
      const notifyBatchSize = 20;
      for (let i = 0; i < ids.length; i += notifyBatchSize) {
        const lote = ids.slice(i, i + notifyBatchSize);
        await Promise.allSettled(
          lote.map((id) =>
            supabase.functions.invoke("notify-lead-transfer", {
              body: { lead_id: id, corretor_id: corretorId },
            }),
          ),
        );
      }
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} lead(s) transferido(s)`);
      clearSelection();
      fecharDialogs?.transferir?.();
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-status-counts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao transferir leads."),
  });

  // Muda a temperatura de todos os leads selecionados de uma vez.
  const bulkTemperatura = useMutation({
    mutationFn: async ({ ids, temp }: { ids: string[]; temp: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ temperatura: temp as never })
        .in("id", ids);
      if (error) throw error;

      // Histórico: mudança de temperatura em lote não deixava rastro.
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      await supabase.from("interacoes").insert(
        ids.map((id) =>
          notaSistemaPayload({
            leadId: id,
            autorId: uid,
            titulo: "Temperatura alterada",
            conteudo: `Temperatura definida como "${temp}" (ação em lote).`,
            metadata: { acao: "temperatura_lote", temperatura: temp },
          }),
        ) as never,
      );
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Temperatura atualizada em ${n} lead(s)`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Define o próximo follow-up dos leads selecionados: cria uma tarefa por
  // lead (a única fonte de verdade). `leads.proximo_followup` é espelho
  // derivado — atualizado sozinho pelo trigger do banco.
  const bulkFollowup = useMutation({
    mutationFn: async ({ ids, iso }: { ids: string[]; iso: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const autor = u.user?.id ?? null;
      // Carrega nome/corretor para gerar tarefas com título + dono corretos.
      const { data: leadsData, error: lErr } = await supabase
        .from("leads")
        .select("id, nome, corretor_id")
        .in("id", ids);
      if (lErr) throw lErr;
      const rows = (leadsData ?? []).map((l) => ({
        titulo: `Follow-up com ${l.nome}`,
        tipo: "follow_up" as const,
        prioridade: "media" as const,
        status: "pendente" as const,
        lead_id: l.id,
        corretor_id: l.corretor_id ?? autor,
        criado_por: autor,
        data_vencimento: iso,
      }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("tarefas").insert(rows as never);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Follow-up definido em ${n} lead(s)`);
      clearSelection();
      fecharDialogs?.followup?.();
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Registra uma ligação (interação) para todos os leads selecionados de uma vez.
  const bulkRegistrarLigacao = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: u } = await supabase.auth.getUser();
      const autor = u.user?.id ?? null;
      const rows = ids.map((leadId) => ({
        lead_id: leadId,
        autor_id: autor,
        tipo: "ligacao" as const,
        direcao: "saida" as const,
        titulo: "Ligação",
        conteudo: "Ligação registrada em lote pelo corretor.",
      }));
      const { error } = await supabase.from("interacoes").insert(rows as never);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Ligação registrada em ${n} lead(s)`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Iniciar atendimento + registrar interação do tipo de contato escolhido
  const iniciarAtendimento = useMutation({
    mutationFn: async ({ lead, tipo }: { lead: Lead; tipo: "ligacao" | "whatsapp" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error: e1 } = await supabase.from("interacoes").insert({
        lead_id: lead.id,
        autor_id: u.user?.id ?? null,
        tipo,
        direcao: "saida",
        titulo:
          tipo === "whatsapp" ? "Contato inicial via WhatsApp" : "Contato inicial por ligação",
        conteudo: `Atendimento iniciado pelo corretor (${tipo}).`,
      });
      if (e1) throw e1;
      await transicionarLead({ id: lead.id, nome: lead.nome, status: "em_atendimento" });
      return { lead, tipo };
    },
    onSuccess: ({ lead, tipo }) => {
      toast.success("Atendimento iniciado");
      if (tipo === "whatsapp") {
        const msg = mensagemPrimeiroContato(lead.nome, lead.projeto_nome);
        window.open(buildWhatsAppUrl(lead.telefone, msg), "_blank", "noopener,noreferrer");
      }
      fecharDialogs?.contato?.();
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    distribuir,
    moverLixeira,
    bulkTransferir,
    bulkTemperatura,
    bulkFollowup,
    bulkRegistrarLigacao,
    iniciarAtendimento,
  };
}
