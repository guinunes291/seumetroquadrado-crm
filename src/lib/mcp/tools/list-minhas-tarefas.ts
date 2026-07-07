// Lista as tarefas abertas do usuário autenticado.
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-user";

export default defineTool({
  name: "list_minhas_tarefas",
  title: "Listar minhas tarefas",
  description:
    "Retorna as tarefas do usuário autenticado. Por padrão só pendentes, ordenadas pela data de vencimento.",
  inputSchema: {
    incluir_concluidas: z
      .boolean()
      .optional()
      .describe("Se true, também retorna tarefas concluídas. Padrão false."),
    limit: z.number().int().optional().describe("Máximo de tarefas. Padrão 25, máximo 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ incluir_concluidas, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("tarefas")
      .select("id, lead_id, titulo, descricao, tipo, prioridade, status, due_at, concluida_em, created_at")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(take);
    if (!incluir_concluidas) q = q.neq("status", "concluida");
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { total: data?.length ?? 0, tarefas: data ?? [] },
    };
  },
});
