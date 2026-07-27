// Mutations da listagem de leads — extraídas de leads.index.tsx sem mudança de
// comportamento (mesmos payloads, invalidações, toasts e ordem de efeitos).
// Os estados (seleção, dialogs) continuam na página; o hook recebe callbacks.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUndoableMutation } from "@/hooks/use-undoable-mutation";
import { buildWhatsAppUrl } from "@/lib/templates";
import { mensagemPrimeiroContato } from "@/lib/whatsapp";
import { notaSistemaPayload } from "@/lib/interacoes";
import { garantirFollowUpAberto } from "@/lib/follow-up";
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

  // Mover PARA a lixeira usa o padrão universal de Desfazer (delayed): as
  // linhas somem do cache na hora, o toast oferece [Desfazer] por 5s e o
  // servidor só é chamado quando a janela expira (flush no unmount garante
  // que a intenção não se perde). Restaurar continua uma mutation comum.
  const enviarLixeira = useUndoableMutation<{ ids: string[]; nome?: string }>({
    mode: "delayed",
    message: (v) =>
      v.ids.length === 1
        ? `${v.nome ?? "Lead"} movido para a lixeira`
        : `${v.ids.length} leads movidos para a lixeira`,
    mutationFn: async ({ ids }) => {
      const { error } = await supabase
        .from("leads")
        .update({
          na_lixeira: true,
          data_movido_lixeira: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
    },
    optimistic: {
      keys: [["leads"]],
      // Defensivo: as queries sob ["leads"] podem guardar um array puro de
      // leads OU o shape { rows: Lead[]; source } da listagem — remove os ids
      // nos dois formatos e devolve qualquer outro shape intacto.
      apply: (cached, { ids }) => {
        const alvo = new Set(ids);
        const semAlvo = (rows: unknown[]) =>
          rows.filter((r) => {
            const id = r && typeof r === "object" ? (r as { id?: unknown }).id : undefined;
            return typeof id !== "string" || !alvo.has(id);
          });
        if (Array.isArray(cached)) return semAlvo(cached);
        if (cached && typeof cached === "object") {
          const c = cached as { rows?: unknown };
          if (Array.isArray(c.rows)) return { ...cached, rows: semAlvo(c.rows) };
        }
        return cached;
      },
    },
    invalidateKeys: [["leads"]],
    errorMessage: "Não foi possível mover para a lixeira",
  });

  const restaurarLixeira = useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const { error } = await supabase
        .from("leads")
        .update({
          na_lixeira: false,
          data_movido_lixeira: null,
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.ids.length} lead(s) restaurado(s)`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mesma interface dos call-sites de antes ({ ids, lixeira }): o rumo decide
  // entre o fluxo adiado com Desfazer e a restauração imediata. A seleção é
  // limpa já no disparo do envio — o efeito é otimista.
  const moverLixeira = {
    mutate: ({ ids, lixeira, nome }: { ids: string[]; lixeira: boolean; nome?: string }) => {
      if (lixeira) {
        enviarLixeira.mutate({ ids, nome });
        clearSelection();
      } else {
        restaurarLixeira.mutate({ ids });
      }
    },
  };

  const bulkTransferir = useMutation({
    mutationFn: async ({ ids, corretorId }: { ids: string[]; corretorId: string }) => {
      if (!ids.length) throw new Error("Selecione ao menos um lead.");
      if (!corretorId) throw new Error("Selecione o corretor de destino.");

      // RPC canônica: além do corretor_id, renova data_distribuicao (sem isso o
      // job de redistribuição desfazia a transferência) e registra no log.
      // Um chunk que falha NÃO aborta os demais — o resultado reporta o
      // parcial ("X de N") em vez de fingir tudo-ou-nada.
      const batchSize = 100;
      const okIds: string[] = [];
      let primeiroErro: string | null = null;
      for (let i = 0; i < ids.length; i += batchSize) {
        const lote = ids.slice(i, i + batchSize);
        const { error } = await supabase.rpc(
          "transferir_leads" as never,
          { _ids: lote, _corretor: corretorId } as never,
        );
        if (error) {
          console.error("[bulkTransferir]", { error, loteInicio: i, loteTamanho: lote.length });
          primeiroErro ??= error.message;
        } else {
          okIds.push(...lote);
        }
      }
      if (okIds.length === 0) {
        throw new Error(primeiroErro ?? "Falha ao transferir leads.");
      }

      // Histórico: a transferência em lote pela UI só registrava no
      // distribution_log; agora deixa nota na timeline de cada lead (mesmo
      // rastro da realocação individual via API). Em chunks e best-effort —
      // a transferência já aconteceu; a nota não pode derrubá-la.
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      for (let i = 0; i < okIds.length; i += 500) {
        const lote = okIds.slice(i, i + 500);
        const { error: notaErr } = await supabase.from("interacoes").insert(
          lote.map((id) =>
            notaSistemaPayload({
              leadId: id,
              autorId: uid,
              titulo: "Lead transferido",
              conteudo: "Lead realocado em lote para outro corretor.",
              metadata: { acao: "transferencia_lote", corretor_novo: corretorId },
            }),
          ) as never,
        );
        if (notaErr) console.error("[bulkTransferir] nota de timeline falhou", notaErr);
      }

      // Notifica via WhatsApp (best-effort; a edge function decide por origem).
      const notifyBatchSize = 20;
      for (let i = 0; i < okIds.length; i += notifyBatchSize) {
        const lote = okIds.slice(i, i + notifyBatchSize);
        await Promise.allSettled(
          lote.map((id) =>
            supabase.functions.invoke("notify-lead-transfer", {
              body: { lead_id: id, corretor_id: corretorId },
            }),
          ),
        );
      }
      return { ok: okIds.length, total: ids.length, erro: primeiroErro };
    },
    onSuccess: ({ ok, total, erro }) => {
      if (ok < total) {
        toast.warning(`${ok} de ${total} lead(s) transferido(s) — o restante falhou.`, {
          description: erro ?? undefined,
        });
      } else {
        toast.success(`${ok} lead(s) transferido(s)`);
      }
      clearSelection();
      fecharDialogs?.transferir?.();
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-status-counts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao transferir leads."),
  });

  // Descarte em lote COM motivo — a peça que faltava para a higiene do funil
  // (7 perdidos em 55 mil leads): marca perdido via transicionar_lead com a
  // categoria oficial, SEM a redistribuição do fluxo individual (descartar
  // 300 leads mortos não pode reinjetá-los na roleta do time).
  const bulkDescartar = useMutation({
    mutationFn: async ({
      ids,
      categoria,
      detalhe,
    }: {
      ids: string[];
      categoria: string;
      detalhe?: string;
    }) => {
      if (!ids.length) throw new Error("Selecione ao menos um lead.");
      if (!categoria) throw new Error("Escolha o motivo da perda.");
      let ok = 0;
      let primeiroErro: string | null = null;
      // Concorrência limitada (10 por vez): cada transição é uma RPC própria.
      const paralelo = 10;
      for (let i = 0; i < ids.length; i += paralelo) {
        const lote = ids.slice(i, i + paralelo);
        const resultados = await Promise.allSettled(
          lote.map((id) =>
            transicionarLead({
              id,
              status: "perdido",
              motivo: detalhe?.trim() || categoria,
              motivoCategoria: categoria,
            }),
          ),
        );
        for (const r of resultados) {
          if (r.status === "fulfilled") ok++;
          else primeiroErro ??= (r.reason as Error)?.message ?? String(r.reason);
        }
      }
      if (ok === 0) throw new Error(primeiroErro ?? "Nenhum lead pôde ser descartado.");
      return { ok, total: ids.length, erro: primeiroErro };
    },
    onSuccess: ({ ok, total, erro }) => {
      if (ok < total) {
        toast.warning(`${ok} de ${total} lead(s) descartado(s) — o restante falhou.`, {
          description: erro ?? undefined,
        });
      } else {
        toast.success(`${ok} lead(s) marcados como perdidos`);
      }
      clearSelection();
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-status-counts"] });
      qc.invalidateQueries({ queryKey: ["pipeline-stage-v2"] });
      qc.invalidateQueries({ queryKey: ["pipeline-snapshot-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Roleta em lote (admin): triagem v3 lead a lead, com placar no final.
  // Leads que a roleta recusar caem na fila de exceções da Distribuição.
  const bulkRoleta = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) throw new Error("Selecione ao menos um lead.");
      let distribuidos = 0;
      let semCorretor = 0;
      let falhas = 0;
      const paralelo = 5;
      for (let i = 0; i < ids.length; i += paralelo) {
        const lote = ids.slice(i, i + paralelo);
        const resultados = await Promise.allSettled(
          lote.map(async (id) => {
            const { data, error } = await supabase.rpc("triar_e_distribuir_lead", {
              _lead_id: id,
              _gatilho: "manual_roleta",
            });
            if (error) throw error;
            const res = data as { ok?: boolean; corretor_id?: string } | null;
            return res?.ok ? (res.corretor_id ?? null) : null;
          }),
        );
        for (const r of resultados) {
          if (r.status === "rejected") falhas++;
          else if (r.value) distribuidos++;
          else semCorretor++;
        }
      }
      return { distribuidos, semCorretor, falhas, total: ids.length };
    },
    onSuccess: ({ distribuidos, semCorretor, falhas }) => {
      const partes = [`${distribuidos} distribuído(s)`];
      if (semCorretor) partes.push(`${semCorretor} na fila de exceções`);
      if (falhas) partes.push(`${falhas} falha(s)`);
      (falhas ? toast.warning : toast.success)(`Roleta: ${partes.join(" · ")}`);
      clearSelection();
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-status-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
      // Passa pelo dedup canônico (garantirFollowUpAberto): reaplicar o lote
      // ou já existir follow-up aberto próximo ATUALIZA em vez de duplicar.
      let n = 0;
      for (const l of leadsData ?? []) {
        await garantirFollowUpAberto({
          leadId: l.id,
          tipo: "follow_up",
          titulo: `Follow-up com ${l.nome}`,
          prioridade: "media",
          vencimento: iso,
          corretorId: l.corretor_id ?? autor,
          criadoPorId: autor,
        });
        n++;
      }
      return n;
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
    bulkDescartar,
    bulkRoleta,
    iniciarAtendimento,
  };
}
