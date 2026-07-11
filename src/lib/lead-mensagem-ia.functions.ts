import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { montarInstrucao } from "@/lib/lead-mensagem";

const InputSchema = z.object({
  leadId: z.string().uuid(),
  objetivo: z.string().max(40).optional(),
  objecao: z.string().max(200).optional(),
});

export type LeadMensagemIA = {
  mensagem: string;
};

/**
 * Rascunha UMA mensagem de WhatsApp pronta para enviar, em PT-BR, a partir do
 * perfil do lead, das últimas interações, da biblioteca de objeções (resposta
 * sugerida) e do objetivo comercial escolhido pelo corretor. A IA SUGERE — o
 * corretor sempre revisa antes de enviar.
 */
export const sugerirMensagemLeadIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<LeadMensagemIA> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const { supabase } = context;

    const [{ data: lead, error: leadErr }, { data: interacoes }, { data: objecoesLib }] =
      await Promise.all([
        supabase
          .from("leads")
          .select(
            "nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, observacoes, proximo_followup, visita_data, visita_hora, visita_empreendimento",
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
        // Biblioteca de objeções: usada para munir a IA com a resposta-padrão
        // quando o corretor aponta a objeção do cliente.
        supabase
          .from("objecoes")
          .select("objecao, resposta, categoria")
          .eq("ativo", true)
          .order("ordem"),
      ]);
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead não encontrado.");

    // Casa a objeção informada com a melhor resposta da biblioteca (match simples
    // por substring, sem depender de acentuação perfeita).
    const lib = (objecoesLib ?? []) as Array<{
      objecao: string;
      resposta: string;
      categoria: string | null;
    }>;
    let respostaBiblioteca: string | null = null;
    if (data.objecao) {
      const alvo = data.objecao.toLowerCase();
      const hit =
        lib.find((o) => alvo.includes(o.objecao.toLowerCase())) ??
        lib.find((o) => o.objecao.toLowerCase().includes(alvo));
      respostaBiblioteca = hit?.resposta ?? null;
    }

    const instrucao = montarInstrucao({
      objetivo: data.objetivo,
      objecao: data.objecao,
      respostaBiblioteca,
    });

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const ctx = {
      lead: {
        nome: lead.nome,
        origem: lead.origem,
        status: lead.status,
        temperatura: lead.temperatura,
        projeto: lead.projeto_nome ?? lead.visita_empreendimento,
        renda: lead.renda_informada,
        entrada: lead.entrada_disponivel,
        fgts: lead.usa_fgts,
        visita_data: lead.visita_data,
        visita_hora: lead.visita_hora,
        observacoes: lead.observacoes?.slice(0, 400),
      },
      ultimasInteracoes: (interacoes ?? []).map((i) => ({
        em: i.ocorreu_em,
        tipo: i.tipo,
        direcao: i.direcao,
        titulo: i.titulo,
        conteudo: i.conteudo?.slice(0, 300),
      })),
    };

    const { text } = await generateText({
      model,
      system:
        "Você é um corretor de imóveis MCMV experiente em São Paulo, escrevendo uma mensagem de WhatsApp para um cliente. " +
        "Escreva UMA única mensagem em português do Brasil, pronta para enviar. " +
        "Regras: use o primeiro nome do cliente; tom cordial, próximo e profissional; no MÁXIMO 5 linhas curtas; " +
        "termine com uma chamada clara para o próximo passo; NÃO use markdown, asteriscos, emojis em excesso (no máximo 1) nem rótulos como 'Mensagem:'. " +
        "Responda apenas com o texto da mensagem.",
      prompt:
        `Objetivo desta mensagem: ${instrucao}\n\n` +
        `Contexto do lead e histórico (JSON):\n${JSON.stringify(ctx)}`,
    });

    return { mensagem: text.trim() };
  });
