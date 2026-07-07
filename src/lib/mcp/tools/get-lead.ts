// Busca um lead específico por id (RLS aplica — só devolve se o usuário tem acesso).
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-user";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineTool({
  name: "get_lead",
  title: "Detalhes de um lead",
  description:
    "Retorna os dados completos de um lead do CRM pelo id (UUID). Só devolve o lead se o usuário autenticado tem permissão.",
  inputSchema: {
    lead_id: z.string().describe("UUID do lead."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    if (!UUID_RE.test(lead_id)) {
      return { content: [{ type: "text", text: "lead_id inválido (esperado UUID)." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "Lead não encontrado ou sem acesso." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { lead: data },
    };
  },
});
