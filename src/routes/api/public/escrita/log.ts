// GET /api/public/escrita/log
// Leitura da auditoria de escrita (api_escrita_log). A tabela não tem policy
// para `authenticated` de propósito — o rastro não pode ser lido nem reescrito
// pelo próprio ator. Este endpoint é a única janela de leitura, protegido pela
// chave de leitura (escopo metrics:read) e servido pelo cliente admin.
//
// Filtros: ?agente=&tabela=&acao=&resultado=&lead_id=&desde=&ate=&limite=
import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";
import { writeJson } from "@/lib/write-api-auth";

const LIMITE_PADRAO = 100;
const LIMITE_MAX = 500;

export const Route = createFileRoute("/api/public/escrita/log")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const auth = await requireApiClientScope(request, "metrics:read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const q = (k: string) => url.searchParams.get(k)?.trim() || null;

        const limiteBruto = Number(q("limite") ?? LIMITE_PADRAO);
        const limite =
          Number.isFinite(limiteBruto) && limiteBruto > 0
            ? Math.min(Math.floor(limiteBruto), LIMITE_MAX)
            : LIMITE_PADRAO;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("api_escrita_log")
          .select(
            "id, ts, agente, acao, tabela, registro_id, lead_id, resultado, http_status, ator, origem, diff",
          )
          .order("ts", { ascending: false })
          .limit(limite);

        const agente = q("agente");
        const tabela = q("tabela");
        const acao = q("acao");
        const resultado = q("resultado");
        const leadId = q("lead_id");
        const desde = q("desde");
        const ate = q("ate");

        if (agente) query = query.eq("agente", agente);
        if (tabela) query = query.eq("tabela", tabela);
        if (acao) query = query.eq("acao", acao);
        if (resultado) query = query.eq("resultado", resultado);
        if (leadId) query = query.eq("lead_id", leadId);
        if (desde) query = query.gte("ts", desde);
        if (ate) query = query.lte("ts", ate);

        const { data, error } = await query;
        if (error) {
          return writeJson({ ok: false, erro: "falha ao ler auditoria", detalhe: error.message }, 500);
        }

        return writeJson({ ok: true, total: data?.length ?? 0, limite, registros: data ?? [] });
      },
    },
  },
});
