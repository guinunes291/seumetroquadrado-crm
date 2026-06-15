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
  projeto_nome: z.string().trim().max(255).optional().nullable(),
  campanha: z.string().trim().max(255).optional().nullable(),
  observacoes: z.string().trim().max(2000).optional().nullable(),
  utm_source: z.string().trim().max(255).optional().nullable(),
  utm_medium: z.string().trim().max(255).optional().nullable(),
  utm_campaign: z.string().trim().max(255).optional().nullable(),
  utm_content: z.string().trim().max(255).optional().nullable(),
  distribuir: z.boolean().optional().default(true),
});

export const Route = createFileRoute("/api/public/webhooks/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400 },
          );
        }
        const data = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            nome: data.nome,
            telefone: data.telefone,
            email: data.email ?? null,
            origem: data.origem,
            projeto_nome: data.projeto_nome ?? null,
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
          return Response.json({ error: error.message }, { status: 500 });
        }

        let corretorId: string | null = null;
        if (data.distribuir) {
          const { data: c } = await supabaseAdmin.rpc("distribuir_lead", {
            _lead_id: lead.id,
            _tipo: "automatica",
          });
          corretorId = (c as string | null) ?? null;
        }

        return Response.json({
          ok: true,
          lead_id: lead.id,
          corretor_id: corretorId,
          distributed: !!corretorId,
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
