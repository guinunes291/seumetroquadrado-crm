import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({ leadId: z.string().uuid() });

export type LeadResumoIA = {
  resumo: string;
  totalInteracoes: number;
};

export const gerarResumoLeadIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<LeadResumoIA> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const { supabase } = context;

    const [{ data: lead, error: leadErr }, { data: interacoes, error: intErr }] = await Promise.all(
      [
        supabase
          .from("leads")
          .select(
            "nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, observacoes, created_at, motivo_perdido",
          )
          .eq("id", data.leadId)
          .maybeSingle(),
        supabase
          .from("interacoes")
          .select("tipo, direcao, titulo, conteudo, ocorreu_em")
          .eq("lead_id", data.leadId)
          .is("deleted_at", null)
          .order("ocorreu_em", { ascending: true })
          .limit(50),
      ],
    );
    if (leadErr) throw new Error(leadErr.message);
    if (intErr) throw new Error(intErr.message);

    const lista = interacoes ?? [];
    if (!lead) return { resumo: "Lead não encontrado.", totalInteracoes: 0 };

    if (lista.length === 0) {
      return {
        resumo:
          "Sem interações registradas ainda. Faça o primeiro contato priorizando entender o momento de compra, renda e uso de FGTS.",
        totalInteracoes: 0,
      };
    }

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const ctx = {
      lead: {
        nome: lead.nome,
        origem: lead.origem,
        status: lead.status,
        temperatura: lead.temperatura,
        projeto: lead.projeto_nome,
        renda: lead.renda_informada,
        entrada: lead.entrada_disponivel,
        fgts: lead.usa_fgts,
        observacoes: lead.observacoes?.slice(0, 500),
        motivo_perdido: lead.motivo_perdido,
      },
      interacoes: lista.map((i) => ({
        em: i.ocorreu_em,
        tipo: i.tipo,
        direcao: i.direcao,
        titulo: i.titulo,
        conteudo: i.conteudo?.slice(0, 400),
      })),
    };

    const { text } = await generateText({
      model,
      system:
        "Você é assistente de corretor MCMV em São Paulo. Resuma o histórico do lead em PT-BR, no MÁXIMO 6 linhas curtas, em bullets começando com '•'. Foque em: estágio atual, principais objeções, próximo passo recomendado. Sem markdown além dos bullets, sem títulos.",
      prompt: `Dados do lead e interações (JSON):\n${JSON.stringify(ctx)}`,
    });

    return { resumo: text.trim(), totalInteracoes: lista.length };
  });
