// Fundação da camada de escrita da API pública (MCP v2).
// Todos os endpoints /api/public/escrita/* e endpoints de escrita de negócio
// (interações, tarefas, etapa, corretor, análise, pasta, visita) reusam este
// arquivo — nunca reimplementar auth/allowlist/audit em endpoint específico.
//
// Ordem de defesa (obrigatória): guard (401) → allowlist (403) → validação (422)
// → escreve → audita. Guard e allowlist devolvem Response; auditoria é fire-and-log.
import { timingSafeEqual } from "crypto";
import { PUBLIC_API_CORS_HEADERS } from "@/lib/public-api-auth";

// ------------------------ tipos utilitários ------------------------

export type AuditEntry = {
  agente: string | null;
  acao: string;
  lead_id?: string | null;
  payload?: unknown;
  resultado: "ok" | "erro";
  http_status: number;
  ip?: string | null;
};

// ------------------------ helpers HTTP ------------------------

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...PUBLIC_API_CORS_HEADERS,
    },
  });
}

export function writeJson(data: unknown, status = 200): Response {
  return json(data, status);
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// ------------------------ guard: chave única de escrita ------------------------

/** Confere X-API-Key contra MCP_WRITE_API_KEY (secret separado do de leitura).
 *  Retorna null quando OK; Response 401 quando inválida/ausente. */
export function requireWriteKey(request: Request): Response | null {
  const expected = process.env.MCP_WRITE_API_KEY;
  if (!expected) {
    return json(
      { ok: false, erro: "MCP_WRITE_API_KEY não configurada no servidor" },
      500,
    );
  }
  const provided = request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json({ ok: false, erro: "api key inválida" }, 401);
  }
  return null;
}

// ------------------------ allowlist agente × ação ------------------------

/** Confere agente na allowlist. Devolve { ok: true } ou Response 403/422. */
export async function requireAgentePermitido(
  agente: unknown,
  acao: string,
): Promise<{ ok: true; agente: string } | Response> {
  if (typeof agente !== "string" || !agente.trim()) {
    return json(
      { ok: false, erro: "campo 'agente' é obrigatório no corpo da requisição" },
      422,
    );
  }
  const nome = agente.trim().toLowerCase();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("pode_escrever", {
    _agente: nome,
    _acao: acao,
  });
  if (error) {
    return json({ ok: false, erro: "falha ao verificar permissão", detalhe: error.message }, 500);
  }
  if (!data) {
    return json(
      { ok: false, erro: `agente '${nome}' não autorizado para '${acao}'` },
      403,
    );
  }
  return { ok: true, agente: nome };
}

// ------------------------ auditoria ------------------------

/** Grava 1 linha em api_escrita_log. NUNCA lança — falha de auditoria só loga. */
export async function auditarEscrita(entry: AuditEntry): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("api_escrita_log")
      .insert({
        agente: entry.agente,
        acao: entry.acao,
        lead_id: entry.lead_id ?? null,
        payload: (entry.payload ?? null) as never,
        resultado: entry.resultado,
        http_status: entry.http_status,
        ip: entry.ip ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[api_escrita_log] insert falhou:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("[api_escrita_log] exceção:", e);
    return null;
  }
}
