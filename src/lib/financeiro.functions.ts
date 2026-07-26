// Server functions da tela "Financeiro · Fechamento".
// Módulo fino: só imports, tipos e declarações — toda a lógica vive em
// `@/lib/financeiro.server`. Admin/gestor apenas; nenhuma rota de DELETE.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const carregarPainelFinanceiroFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { podeOperarFinanceiro, carregarPainel } = await import("@/lib/financeiro.server");
    if (!(await podeOperarFinanceiro(context.supabase as any, context.userId))) {
      throw new Error("forbidden");
    }
    return carregarPainel();
  });

export const carregarHistoricoFinanceiroFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entidade?: string | null; entidadeId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { podeOperarFinanceiro, carregarHistorico } = await import("@/lib/financeiro.server");
    if (!(await podeOperarFinanceiro(context.supabase as any, context.userId))) {
      throw new Error("forbidden");
    }
    return carregarHistorico(data.entidade ?? null, data.entidadeId ?? null);
  });

export const patchComissaoFinanceiroFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => input)
  .handler(async ({ data, context }) => {
    const { podeOperarFinanceiro, contextoTela, patchComissaoTela } = await import(
      "@/lib/financeiro.server"
    );
    if (!(await podeOperarFinanceiro(context.supabase as any, context.userId))) {
      return { ok: false as const, erro: "forbidden" };
    }
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome")
      .eq("id", context.userId)
      .maybeSingle();
    return patchComissaoTela(
      data,
      contextoTela(context.userId, (perfil as any)?.nome ?? "Usuário"),
    );
  });

export const patchComissoesLoteFinanceiroFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; patch: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const { podeOperarFinanceiro, contextoTela, patchComissoesLoteTela } = await import(
      "@/lib/financeiro.server"
    );
    if (!(await podeOperarFinanceiro(context.supabase as any, context.userId))) {
      return { processados: 0, sucesso: 0, falhas: [{ id: "-", erro: "forbidden" }] };
    }
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome")
      .eq("id", context.userId)
      .maybeSingle();
    return patchComissoesLoteTela(
      data.ids ?? [],
      data.patch ?? {},
      contextoTela(context.userId, (perfil as any)?.nome ?? "Usuário"),
    );
  });

export const definirCorretorVendaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vendaId: string; corretorId: string; motivo: string }) => input)
  .handler(async ({ data, context }) => {
    const { podeOperarFinanceiro, contextoTela, definirCorretorVendaTela } = await import(
      "@/lib/financeiro.server"
    );
    if (!(await podeOperarFinanceiro(context.supabase as any, context.userId))) {
      return { ok: false as const, erro: "forbidden" };
    }
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("nome")
      .eq("id", context.userId)
      .maybeSingle();
    return definirCorretorVendaTela(
      data.vendaId,
      data.corretorId,
      data.motivo ?? "",
      contextoTela(context.userId, (perfil as any)?.nome ?? "Usuário"),
    );
  });
