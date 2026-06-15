import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  telefone: z.string().trim().min(5).max(30),
  email: z.string().trim().email().max(320).optional().nullable(),
  origem: z
    .enum([
      "facebook", "google_sheets", "site", "indicacao", "captacao_corretor",
      "whatsapp", "telefone", "plantao", "agendamento_self_service", "chatbot", "outro",
    ])
    .optional()
    .default("outro"),
  campanha: z.string().trim().max(255).optional().nullable(),
  observacoes: z.string().trim().max(2000).optional().nullable(),
  utm_source: z.string().trim().max(255).optional().nullable(),
  utm_medium: z.string().trim().max(255).optional().nullable(),
  utm_campaign: z.string().trim().max(255).optional().nullable(),
  utm_content: z.string().trim().max(255).optional().nullable(),
  distribuir: z.boolean().optional().default(true),
});

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
        if (data.distribuir) {
          const { data: c } = await supabaseAdmin.rpc("distribuir_lead", {
            _lead_id: lead.id,
            _tipo: "automatica",
          });
          corretorId = (c as string | null) ?? null;
        }

        return Response.json(
          {
            ok: true,
            projeto: projeto.nome,
            lead_id: lead.id,
            corretor_id: corretorId,
            distributed: !!corretorId,
          },
          { headers: corsHeaders },
        );
      },
    },
  },
});
