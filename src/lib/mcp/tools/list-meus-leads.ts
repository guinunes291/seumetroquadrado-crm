// Lista os leads do corretor autenticado (RLS aplica).
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-user";

const CAMPOS =
  "id, nome, telefone, email, status, etapa, temperatura, projeto_nome, campanha, origem, proximo_followup, ultimo_contato, created_at, updated_at";

export default defineTool({
  name: "list_meus_leads",
  title: "Listar meus leads",
  description:
    "Retorna leads do usuário autenticado no CRM Seu Metro Quadrado. Filtra por status opcional, ordena por atualização mais recente.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe(
        "Status do lead (ex.: novo, em_atendimento, agendado, visita_realizada, analise_credito, contrato_fechado, perdido).",
      ),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Máximo de leads a retornar. Padrão 25, máximo 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("leads")
      .select(CAMPOS)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(take);
    if (status && status.trim()) q = q.eq("status", status.trim() as never);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { total: data?.length ?? 0, leads: data ?? [] },
    };
  },
});
