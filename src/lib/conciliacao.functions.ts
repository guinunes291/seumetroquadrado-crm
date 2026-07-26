// Server functions da aba "Financeiro · Conciliação" (Etapa 2).
// Módulo fino: só imports, tipos e declarações. Admin/gestor apenas.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const carregarPainelConciliacaoFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { podeOperarFinanceiro } = await import("@/lib/financeiro.server");
    if (!(await podeOperarFinanceiro(context.supabase as any, context.userId))) {
      throw new Error("forbidden");
    }
    const { carregarPainelConciliacao } = await import("@/lib/conciliacao.server");
    return carregarPainelConciliacao();
  });

export const importarExtratoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conta: string; arquivo: string; conteudo: string }) => input)
  .handler(async ({ data, context }) => {
    const { contextoFinanceiroOuNulo } = await import("@/lib/conciliacao-guard.server");
    const ctx = await contextoFinanceiroOuNulo(context.supabase, context.userId);
    if (!ctx) return { ok: false as const, erro: "forbidden" };
    const { importarExtrato } = await import("@/lib/conciliacao.server");
    return importarExtrato(data.conta, data.arquivo ?? "extrato.ofx", data.conteudo, context.userId);
  });

export const conciliarComissoesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { transacaoId: string; comissaoIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { contextoFinanceiroOuNulo } = await import("@/lib/conciliacao-guard.server");
    const ctx = await contextoFinanceiroOuNulo(context.supabase, context.userId);
    if (!ctx) return { ok: false as const, erro: "forbidden" };
    const { conciliarComissoes } = await import("@/lib/conciliacao.server");
    return conciliarComissoes(data.transacaoId, data.comissaoIds ?? [], ctx);
  });

export const conciliarVendasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { transacaoId: string; vendaIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { contextoFinanceiroOuNulo } = await import("@/lib/conciliacao-guard.server");
    const ctx = await contextoFinanceiroOuNulo(context.supabase, context.userId);
    if (!ctx) return { ok: false as const, erro: "forbidden" };
    const { conciliarVendas } = await import("@/lib/conciliacao.server");
    return conciliarVendas(data.transacaoId, data.vendaIds ?? [], ctx);
  });

export const desconciliarTransacaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { transacaoId: string }) => input)
  .handler(async ({ data, context }) => {
    const { contextoFinanceiroOuNulo } = await import("@/lib/conciliacao-guard.server");
    const ctx = await contextoFinanceiroOuNulo(context.supabase, context.userId);
    if (!ctx) return { ok: false as const, erro: "forbidden" };
    const { desconciliarTransacao } = await import("@/lib/conciliacao.server");
    return desconciliarTransacao(data.transacaoId, ctx);
  });

export const ignorarTransacaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { transacaoId: string; motivo: string }) => input)
  .handler(async ({ data, context }) => {
    const { contextoFinanceiroOuNulo } = await import("@/lib/conciliacao-guard.server");
    const ctx = await contextoFinanceiroOuNulo(context.supabase, context.userId);
    if (!ctx) return { ok: false as const, erro: "forbidden" };
    const { ignorarTransacao } = await import("@/lib/conciliacao.server");
    return ignorarTransacao(data.transacaoId, data.motivo ?? "", ctx);
  });

export const reativarTransacaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { transacaoId: string }) => input)
  .handler(async ({ data, context }) => {
    const { contextoFinanceiroOuNulo } = await import("@/lib/conciliacao-guard.server");
    const ctx = await contextoFinanceiroOuNulo(context.supabase, context.userId);
    if (!ctx) return { ok: false as const, erro: "forbidden" };
    const { reativarTransacao } = await import("@/lib/conciliacao.server");
    return reativarTransacao(data.transacaoId, ctx);
  });
