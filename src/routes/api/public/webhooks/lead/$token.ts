import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const optStr = (max = 2000) => z.string().trim().max(max).optional().nullable();

const payloadSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  telefone: z
    .string()
    .trim()
    .min(5)
    .max(30)
    .refine((v) => {
      const d = v.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 13;
    }, "telefone inválido"),
  email: z.string().trim().email().max(320).optional().nullable(),
  origem: z
    .enum([
      "facebook",
      "google_sheets",
      "site",
      "indicacao",
      "captacao_corretor",
      "whatsapp",
      "telefone",
      "plantao",
      "agendamento_self_service",
      "chatbot",
      "outro",
    ])
    .optional()
    .default("outro"),
  campanha: optStr(255),
  observacoes: optStr(),
  observacao: optStr(),
  resumo: optStr(4000),
  utm_source: optStr(255),
  utm_medium: optStr(255),
  utm_campaign: optStr(255),
  utm_content: optStr(255),
  distribuir: z.boolean().optional().default(true),
  // Qualificação IA (handoff)
  faixaRenda: optStr(120),
  finalidadeImovel: optStr(120),
  empreendimentoInteresse: optStr(255),
  regiao: optStr(255),
  fgts: optStr(255),
  decisor: optStr(255),
  temperatura: z
    .union([z.enum(["FRIO", "MORNO", "QUENTE", "PRONTO", "frio", "morno", "quente", "pronto"]), z.literal("")])
    .optional()
    .nullable(),
  motivoHandoff: z.enum(["analise", "visita", "humano"]).optional().nullable(),
  aceitouAnalise: z.boolean().optional().nullable(),
  aceitouVisita: z.boolean().optional().nullable(),
});

function mapTemperatura(t: string | null | undefined): "quente" | "morno" | "frio" | null {
  if (!t) return null;
  const v = t.toLowerCase();
  if (v === "quente" || v === "pronto") return "quente";
  if (v === "morno") return "morno";
  if (v === "frio") return "frio";
  return null;
}

function montarBlocoQualificacao(d: {
  faixaRenda?: string | null;
  finalidadeImovel?: string | null;
  empreendimentoInteresse?: string | null;
  regiao?: string | null;
  fgts?: string | null;
  decisor?: string | null;
  temperatura?: string | null;
  motivoHandoff?: string | null;
  aceitouAnalise?: boolean | null;
  aceitouVisita?: boolean | null;
}): string {
  const linhas: string[] = [];
  if (d.faixaRenda) linhas.push(`• Renda: ${d.faixaRenda}`);
  if (d.fgts) linhas.push(`• FGTS: ${d.fgts}`);
  if (d.finalidadeImovel) linhas.push(`• Finalidade: ${d.finalidadeImovel}`);
  if (d.empreendimentoInteresse) linhas.push(`• Empreendimento: ${d.empreendimentoInteresse}`);
  if (d.regiao) linhas.push(`• Região: ${d.regiao}`);
  if (d.decisor) linhas.push(`• Decisor: ${d.decisor}`);
  if (d.temperatura) linhas.push(`• Temperatura: ${d.temperatura}`);
  if (d.motivoHandoff) linhas.push(`• Motivo do handoff: ${d.motivoHandoff}`);
  if (d.aceitouAnalise) linhas.push(`• Aceitou análise de crédito: sim`);
  if (d.aceitouVisita) linhas.push(`• Aceitou agendar visita: sim`);
  return linhas.join("\n");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/webhooks/lead/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request, params }) => {
        const token = params.token?.trim();
        if (!token || token.length < 16) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Lookup do projeto pelo token
        const { data: projeto, error: projErr } = await supabaseAdmin
          .from("projetos")
          .select("id, nome, ativo")
          .eq("webhook_token", token)
          .maybeSingle();

        if (projErr || !projeto || !projeto.ativo) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400, headers: corsHeaders },
          );
        }
        const data = parsed.data;

        // Deduplicação: mesmo telefone (só dígitos) dentro do mesmo projeto.
        const { data: dupId } = await supabaseAdmin.rpc("buscar_lead_duplicado", {
          _projeto_id: projeto.id,
          _telefone: data.telefone,
        });
        if (dupId) {
          return Response.json(
            { ok: true, duplicate: true, projeto: projeto.nome, lead_id: dupId },
            { headers: corsHeaders },
          );
        }

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            nome: data.nome,
            telefone: data.telefone,
            email: data.email ?? null,
            origem: data.origem,
            projeto_id: projeto.id,
            projeto_nome: projeto.nome,
            campanha: data.campanha ?? null,
            observacoes: data.observacoes ?? null,
            utm_source: data.utm_source ?? null,
            utm_medium: data.utm_medium ?? null,
            utm_campaign: data.utm_campaign ?? null,
            utm_content: data.utm_content ?? null,
          })
          .select("id")
          .single();

        if (error) {
          return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
        }

        let corretorId: string | null = null;
        let motivo: string | null = null;
        if (data.distribuir) {
          const { data: c } = await supabaseAdmin.rpc("distribuir_lead", {
            _lead_id: lead.id,
            _tipo: "automatica",
          });
          corretorId = (c as string | null) ?? null;
          if (!corretorId) motivo = "sem_corretor_disponivel";
        }

        return Response.json(
          {
            ok: true,
            projeto: projeto.nome,
            lead_id: lead.id,
            corretor_id: corretorId,
            distributed: !!corretorId,
            motivo,
          },
          { headers: corsHeaders },
        );
      },
    },
  },
});
