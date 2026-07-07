// Lista os próximos agendamentos (visitas/ligações) do usuário autenticado.
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-user";

export default defineTool({
  name: "list_meus_agendamentos",
  title: "Listar meus agendamentos",
  description:
    "Retorna os próximos agendamentos (visitas, ligações) do usuário autenticado, ordenados pela data de início.",
  inputSchema: {
    dias: z
      .number()
      .int()
      .optional()
      .describe("Janela para frente em dias a partir de agora. Padrão 7, máximo 60."),
    limit: z.number().int().optional().describe("Máximo de itens. Padrão 25, máximo 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dias, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const janela = Math.min(Math.max(dias ?? 7, 1), 60);
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    const agora = new Date();
    const fim = new Date(agora.getTime() + janela * 86_400_000);
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id, lead_id, tipo, status, titulo, descricao, local, data_inicio, data_fim")
      .gte("data_inicio", agora.toISOString())
      .lte("data_inicio", fim.toISOString())
      .order("data_inicio", { ascending: true })
      .limit(take);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { total: data?.length ?? 0, agendamentos: data ?? [] },
    };
  },
});
