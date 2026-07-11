// SamiQ — execução server-side do copiloto. Segue o padrão dos demais
// *-ia.functions.ts: auth por middleware, zod, rate limit por usuário,
// contexto RLS-scoped truncado e modelo flash via Lovable AI Gateway.
// O SamiQ nunca escreve no banco — só devolve texto + sugestões estruturadas.

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateLimit } from "@/lib/rate-limit";
import { scoreLead } from "@/lib/priority";
import {
  SAMIQ_ACTION_META,
  SAMIQ_SYSTEM_PROMPT,
  SamiQInputSchema,
  sugestoesPara,
  type SamiQResposta,
} from "@/lib/samiq";

// Teto de custo: 20 chamadas por usuário a cada 10 minutos.
const RATE_MAX = 20;
const RATE_WINDOW_MS = 10 * 60_000;
const MAX_OUTPUT_TOKENS = 700;

export const perguntarSamiQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SamiQInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SamiQResposta> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const { supabase, userId } = context;

    const rl = rateLimit(`samiq:${userId}`, RATE_MAX, RATE_WINDOW_MS);
    if (!rl.allowed) {
      throw new Error(
        `O SamiQ precisa de uma pausa — muitas consultas seguidas. Tente de novo em ${rl.retryAfterS}s.`,
      );
    }

    const meta = SAMIQ_ACTION_META[data.action];
    if (meta.precisaLead && !data.leadId) {
      throw new Error("Abra um lead (ou selecione um) para usar esta ação do SamiQ.");
    }

    // ----- Contexto por ação (RLS-scoped; campos e volumes truncados) -----
    const ctx: Record<string, unknown> = {};

    if (data.leadId) {
      const [{ data: lead, error: leadErr }, { data: interacoes }] = await Promise.all([
        supabase
          .from("leads")
          .select(
            "nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, observacoes, proximo_followup, ultima_interacao, visita_data, visita_hora, visita_empreendimento, tipo_renda, faixa_mcmv",
          )
          .eq("id", data.leadId)
          .maybeSingle(),
        supabase
          .from("interacoes")
          .select("tipo, direcao, titulo, conteudo, ocorreu_em")
          .eq("lead_id", data.leadId)
          .is("deleted_at", null)
          .order("ocorreu_em", { ascending: false })
          .limit(12),
      ]);
      if (leadErr) throw new Error(leadErr.message);
      if (!lead) throw new Error("Lead não encontrado.");
      ctx.cliente = {
        ...lead,
        observacoes: lead.observacoes?.slice(0, 400),
      };
      ctx.ultimasInteracoes = (interacoes ?? []).map((i) => ({
        em: i.ocorreu_em,
        tipo: i.tipo,
        direcao: i.direcao,
        titulo: i.titulo,
        conteudo: i.conteudo?.slice(0, 300),
      }));
    }

    if (data.action === "checklist_docs" && data.leadId) {
      const { data: docs } = await supabase
        .from("documentacoes")
        .select("documento, status, observacoes")
        .eq("lead_id", data.leadId)
        .limit(40);
      ctx.documentacao = docs ?? [];
    }

    if (data.action === "responder_objecao") {
      const { data: objecoesLib } = await supabase
        .from("objecoes")
        .select("objecao, resposta")
        .eq("ativo", true)
        .order("ordem")
        .limit(30);
      const alvo = (data.pergunta ?? "").toLowerCase();
      const lib = (objecoesLib ?? []) as Array<{ objecao: string; resposta: string }>;
      const hit = alvo
        ? (lib.find((o) => alvo.includes(o.objecao.toLowerCase())) ??
          lib.find((o) => o.objecao.toLowerCase().includes(alvo)))
        : null;
      if (hit) ctx.respostaBiblioteca = hit.resposta;
    }

    if (data.action === "projeto_ideal") {
      const { data: projetos } = await supabase
        .from("projetos")
        .select("nome, bairro, cidade, regiao, tipologia, dorms_min, dorms_max, preco_a_partir")
        .eq("ativo", true)
        .is("deleted_at", null)
        .limit(40);
      ctx.catalogo = projetos ?? [];
    }

    if (data.action === "analise_funil") {
      const { data: leads } = await supabase
        .from("leads")
        .select("status")
        .eq("corretor_id", userId)
        .eq("na_lixeira", false)
        .limit(1000);
      const contagens: Record<string, number> = {};
      (leads ?? []).forEach((l: { status: string }) => {
        contagens[l.status] = (contagens[l.status] ?? 0) + 1;
      });
      ctx.funil = contagens;
    }

    if (data.action === "prioridade_dia") {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, nome, status, temperatura, ultima_interacao, projeto_nome")
        .eq("corretor_id", userId)
        .eq("na_lixeira", false)
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .limit(300);
      ctx.fila = (leads ?? [])
        .map((l) => ({
          nome: l.nome,
          status: l.status,
          temperatura: l.temperatura,
          projeto: l.projeto_nome,
          score: scoreLead({
            temperatura: l.temperatura,
            status: l.status,
            ultimaInteracao: l.ultima_interacao,
          }).score,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }

    // ----- Prompt -----
    const partes: string[] = [`Ação solicitada: ${meta.label}.`, meta.instrucao];
    if (data.pergunta) partes.push(`Detalhe do corretor: ${data.pergunta.slice(0, 500)}`);
    if (Object.keys(ctx).length > 0) partes.push(`Contexto (JSON):\n${JSON.stringify(ctx)}`);
    if (data.historico?.length) {
      partes.push(
        `Conversa recente:\n${data.historico
          .map((m) => `${m.role === "user" ? "Corretor" : "SamiQ"}: ${m.content.slice(0, 600)}`)
          .join("\n")}`,
      );
    }

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const { text } = await generateText({
      model,
      system: SAMIQ_SYSTEM_PROMPT,
      prompt: partes.join("\n\n"),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return {
      texto: text.trim(),
      sugestoes: sugestoesPara(data.action, text, data.leadId),
    };
  });
