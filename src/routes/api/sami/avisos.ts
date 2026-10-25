// POST /api/sami/avisos — avisos do Link de Proposta para o WhatsApp da Sami 1898.
//
// Chamador: o fluxo n8n (servidor a servidor) com header `x-sami-key`.
// { acao: "pendentes", limite? } → { avisos: [{ id, telefone, canal, texto, template }] }
//   canal "sami_texto": texto livre (corretor dentro da janela de 24h).
//   canal "sami_template": enviar o template aprovado com os 4 parâmetros.
// { acao: "resultado", id, ok, erro? } → registra entrega; falha vira push na hora.
// Sem retorno do n8n em alguns minutos, a varredura do banco manda por push.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("pendentes"), limite: z.number().int().min(1).max(50).optional() }),
  z.object({ acao: z.literal("resultado"), id: z.string().uuid(), ok: z.boolean(), erro: z.string().max(400).optional() }),
]);

export const Route = createFileRoute("/api/sami/avisos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        try {
          canal.autenticarCanalSami(request);
          const text = await request.text();
          if (text.length > 4096) return canal.jsonCanal({ ok: false, erro: "corpo_grande" }, 413);
          const body = schema.parse(JSON.parse(text || "{}"));
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (body.acao === "resultado") {
            const { data, error } = await supabaseAdmin.rpc("proposta_aviso_resultado", {
              _id: body.id,
              _ok: body.ok,
              _erro: body.erro ?? "",
            });
            if (error) throw error;
            return canal.jsonCanal({ ok: true, status: data });
          }
          const [{ data, error }, { data: cfg }] = await Promise.all([
            supabaseAdmin.rpc("proposta_avisos_reivindicar", { _limite: body.limite ?? 20 }),
            supabaseAdmin.from("proposta_aviso_config").select("template_nome, template_idioma").maybeSingle(),
          ]);
          if (error) throw error;
          return canal.jsonCanal({
            ok: true,
            avisos: (data ?? []).map((a) => ({
              id: a.id,
              telefone: a.telefone,
              canal: a.canal,
              texto: a.mensagem,
              template:
                a.canal === "sami_template"
                  ? { nome: cfg?.template_nome, idioma: cfg?.template_idioma, parametros: a.template_parametros }
                  : null,
            })),
          });
        } catch (error) {
          if (error instanceof z.ZodError || error instanceof SyntaxError)
            return canal.jsonCanal({ ok: false, erro: "entrada_invalida" }, 422);
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});
