import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CsvLeadRow = {
  linha: number;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  zona: string | null;
  renda: string | null;
};

export type CsvLoteErro = {
  linha: number;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  motivo: string;
};

export type CsvLoteResult = { inseridos: number; duplicados: number; erros: CsvLoteErro[] };

/**
 * Processa um lote (até 500 linhas) do import CSV de leads. Só admin.
 * Roda com service role chamando `importar_leads_csv_lote`, que insere linha a
 * linha em `leads` (mesmos gatilhos, incluindo a zona automática), pula
 * duplicados por telefone (ou e-mail sem telefone) e não chama a roleta.
 */
export const importarLeadsCsvLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rows: CsvLeadRow[]; batchId: string }) => {
    if (!Array.isArray(input?.rows) || input.rows.length > 500)
      throw new Error("Lote inválido (máx. 500 linhas).");
    if (!/^[0-9a-f-]{36}$/i.test(input.batchId)) throw new Error("Lote sem identificador.");
    return input;
  })
  .handler(async ({ data, context }): Promise<CsvLoteResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem importar leads.");

    // Chama como o próprio admin: a função confere has_role(auth.uid(), 'admin').
    const { data: res, error } = await context.supabase.rpc("importar_leads_csv_lote", {
      _rows: data.rows as unknown as never,
      _batch: data.batchId,
    });
    if (error) throw new Error(error.message);
    const r = res as unknown as CsvLoteResult;
    return { inseridos: r.inseridos ?? 0, duplicados: r.duplicados ?? 0, erros: r.erros ?? [] };
  });
