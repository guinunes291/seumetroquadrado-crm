import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  descricao: z.string().min(10).max(2000),
  leadId: z.string().optional(),
});

const AiSchema = z.object({
  resumo: z.string(),
  filtrosUsados: z.object({
    regiao: z.string().nullable().optional(),
    dorms: z.string().nullable().optional(),
    vagas: z.string().nullable().optional(),
    precoMax: z.string().nullable().optional(),
    programa: z.string().nullable().optional(),
    entrega: z.string().nullable().optional(),
  }),
  projetos: z
    .array(
      z.object({
        id: z.string(),
        pontuacao: z.number().min(0).max(10),
        motivo: z.string(),
        tipologiaRecomendada: z.string().nullable().optional(),
      }),
    )
    .max(6),
});

export type BuscaIAResultado = {
  resumo: string;
  filtrosUsados: Record<string, string | null | undefined>;
  totalFiltrados: number;
  projetos: Array<{
    id: string;
    nome: string;
    construtora: string | null;
    bairro: string | null;
    cidade: string | null;
    preco_a_partir: number | null;
    pontuacao: number;
    motivo: string;
    tipologiaRecomendada?: string | null;
  }>;
};

export const buscarProjetosIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<BuscaIAResultado> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const { supabase } = context;
    const { data: projetos, error } = await supabase
      .from("projetos")
      .select(
        "id, nome, construtora, bairro, cidade, regiao, zona_smq, tipologia, dorms_min, dorms_max, vagas_min, vagas_max, metragem_min, metragem_max, preco_a_partir, status_entrega, mes_entrega, ano_entrega, observacoes",
      )
      .eq("ativo", true)
      .is("deleted_at", null)
      .limit(200);

    if (error) throw new Error(error.message);
    const lista = projetos ?? [];

    if (lista.length === 0) {
      return { resumo: "Nenhum empreendimento ativo cadastrado.", filtrosUsados: {}, totalFiltrados: 0, projetos: [] };
    }

    const catalogo = lista.map((p) => ({
      id: p.id,
      nome: p.nome,
      construtora: p.construtora,
      regiao: p.regiao ?? p.zona_smq,
      bairro: p.bairro,
      cidade: p.cidade,
      tipologia: p.tipologia,
      dorms: [p.dorms_min, p.dorms_max].filter(Boolean).join("-") || null,
      vagas: [p.vagas_min, p.vagas_max].filter(Boolean).join("-") || null,
      metragem: [p.metragem_min, p.metragem_max].filter(Boolean).join("-") || null,
      preco_a_partir: p.preco_a_partir,
      entrega: [p.status_entrega, p.mes_entrega, p.ano_entrega].filter(Boolean).join("/") || null,
      obs: p.observacoes?.slice(0, 200) ?? null,
    }));

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const { object } = await generateObject({
      model,
      schema: AiSchema,
      system:
        "Você é um especialista em imóveis MCMV em São Paulo. Analise a descrição do corretor e o catálogo de empreendimentos. Retorne JSON com: resumo curto em PT-BR (1-2 frases), filtros detectados (região, dorms, vagas, preço máximo, programa, entrega) e até 6 projetos rankeados por aderência (pontuação 0-10). Use APENAS ids existentes no catálogo. Justifique em PT-BR em 'motivo' (1 frase).",
      prompt: `Descrição do corretor:\n${data.descricao}\n\nCatálogo (JSON):\n${JSON.stringify(catalogo)}`,
    });

    const byId = new Map(lista.map((p) => [p.id, p]));
    const projetosOut = object.projetos
      .filter((p) => byId.has(p.id))
      .sort((a, b) => b.pontuacao - a.pontuacao)
      .map((p) => {
        const proj = byId.get(p.id)!;
        return {
          id: proj.id,
          nome: proj.nome,
          construtora: proj.construtora,
          bairro: proj.bairro,
          cidade: proj.cidade,
          preco_a_partir: proj.preco_a_partir,
          pontuacao: Math.round(p.pontuacao),
          motivo: p.motivo,
          tipologiaRecomendada: p.tipologiaRecomendada ?? null,
        };
      });

    return {
      resumo: object.resumo,
      filtrosUsados: object.filtrosUsados,
      totalFiltrados: projetosOut.length,
      projetos: projetosOut,
    };
  });
