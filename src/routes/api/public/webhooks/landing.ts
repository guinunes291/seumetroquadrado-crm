// POST /api/public/webhooks/landing
// Intake publico da landing: CORS por allowlist, Turnstile validado no servidor,
// rate limit distribuido e Idempotency-Key persistida. Nenhum segredo e enviado
// ao browser e a resposta publica nunca inclui IDs ou dados do lead.
import { createFileRoute } from "@tanstack/react-router";
import {
  canonicalLandingPayload,
  hashLandingValue,
  isJsonObject,
  landingResponseHeaders,
  MAX_LANDING_BYTES,
  parseAllowedOrigins,
  readRequestBodyLimited,
  requestOriginAllowed,
  sanitizeLandingPayload,
  validIdempotencyKey,
  verifyTurnstileToken,
  type JsonObject,
} from "@/lib/landing-security";

const INVALID = Symbol("invalid");
const ACCEPTED_RESPONSE = { ok: true, accepted: true } as const;

type LandingConfig = {
  allowedOrigins: Set<string>;
  hashSecret: string;
  rateLimit: number;
  rateWindowSeconds: number;
  turnstileSecret: string;
};

type PublicResponse = {
  ok: boolean;
  accepted?: boolean;
  error?: string;
  retry_after_s?: number;
};

type RpcError = { code?: string };
type RpcResult<T> = { data: T | null; error: RpcError | null };
type RpcHolder = { rpc: unknown };
type FromHolder = { from: unknown };
type UntypedRpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult<unknown>>;

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

type IdempotencyRow = {
  disposition: "acquired" | "conflict" | "in_progress" | "replay";
  response_status: number | null;
  response_body: unknown;
  lease_token: string | null;
  retry_after_seconds: number;
};

type StagingRow = {
  id: string;
  lead_id: string | null;
  idempotency_request_hash: string | null;
};

type StagingMaybeSingle = {
  maybeSingle: () => PromiseLike<RpcResult<StagingRow>>;
};
type StagingSelect = {
  eq: (column: string, value: unknown) => StagingMaybeSingle;
};
type StagingInsertSelect = {
  single: () => PromiseLike<RpcResult<StagingRow>>;
};
type StagingMutation = {
  eq: (column: string, value: unknown) => PromiseLike<RpcResult<unknown>>;
};
type StagingTable = {
  select: (columns: string) => StagingSelect;
  insert: (row: Record<string, unknown>) => {
    select: (columns: string) => StagingInsertSelect;
  };
  update: (row: Record<string, unknown>) => StagingMutation;
};
type UntypedFrom = (table: string) => StagingTable;

function envInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function loadConfig(): LandingConfig | null {
  const allowedOrigins = parseAllowedOrigins(process.env.LANDING_ALLOWED_ORIGINS);
  const hashSecret = process.env.LANDING_HASH_SECRET ?? "";
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (allowedOrigins.size === 0 || hashSecret.length < 32 || turnstileSecret.length < 8) {
    return null;
  }
  return {
    allowedOrigins,
    hashSecret,
    turnstileSecret,
    rateLimit: envInteger(process.env.LANDING_RATE_LIMIT, 12, 1, 100),
    rateWindowSeconds: envInteger(process.env.LANDING_RATE_WINDOW_SECONDS, 60, 10, 3600),
  };
}

function jsonResp(
  data: PublicResponse | JsonObject,
  status: number,
  headers: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, ...extraHeaders },
  });
}

function clientFingerprint(request: Request): string {
  const value =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return value.slice(0, 128);
}

async function callAdminRpc<T>(
  client: RpcHolder,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const result = await (client.rpc as UntypedRpc).call(client, name, args);
  return { data: result.data as T | null, error: result.error };
}

function landingStagingTable(client: FromHolder): StagingTable {
  return (client.from as UntypedFrom).call(client, "leads_landing");
}

async function releaseIdempotency(
  client: RpcHolder,
  keyHash: string,
  requestHash: string,
  leaseToken: string,
): Promise<void> {
  await callAdminRpc<boolean>(client, "release_landing_webhook_request", {
    _key_hash: keyHash,
    _request_hash: requestHash,
    _lease_token: leaseToken,
  });
}

async function completeIdempotency(
  client: RpcHolder,
  keyHash: string,
  requestHash: string,
  leaseToken: string,
  status: number,
  body: PublicResponse,
): Promise<boolean> {
  const result = await callAdminRpc<boolean>(client, "complete_landing_webhook_request", {
    _key_hash: keyHash,
    _request_hash: requestHash,
    _lease_token: leaseToken,
    _response_status: status,
    _response_body: body,
    _ttl_seconds: 86_400,
  });
  return !result.error && result.data === true;
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function optionalText(value: unknown, max: number): string | null | typeof INVALID {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return INVALID;
  const normalized = value.trim();
  return normalized.length <= max ? normalized || null : INVALID;
}

function optionalNumber(value: unknown, integer = false): number | null | typeof INVALID {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000) return INVALID;
  if (integer && !Number.isInteger(parsed)) return INVALID;
  return parsed;
}

function optionalBoolean(value: unknown): boolean | null | typeof INVALID {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return INVALID;
}

export type LandingParse =
  | { ok: true; nome: string; digits: string; row: Record<string, unknown> }
  | { ok: false; error: string };

/** Valida e normaliza somente os dados de negocio; token/honeypot nao sao persistidos. */
export function parseLandingPayload(input: unknown): LandingParse {
  if (!isJsonObject(input)) return { ok: false, error: "payload_invalido" };

  const nome = optionalText(input.nome, 120);
  const whatsapp = optionalText(input.whatsapp, 40);
  if (nome === INVALID || nome === null || nome.length < 3) {
    return { ok: false, error: "nome_invalido" };
  }
  if (whatsapp === INVALID || whatsapp === null) {
    return { ok: false, error: "whatsapp_invalido" };
  }
  const digits = onlyDigits(whatsapp);
  if (digits.length < 10 || digits.length > 11) {
    return { ok: false, error: "whatsapp_invalido" };
  }

  const marketingValue = input.marketing;
  const simulationValue = input.simulacao;
  if (marketingValue != null && !isJsonObject(marketingValue)) {
    return { ok: false, error: "marketing_invalido" };
  }
  if (simulationValue != null && !isJsonObject(simulationValue)) {
    return { ok: false, error: "simulacao_invalida" };
  }
  const marketing = marketingValue ?? {};
  const simulation = simulationValue ?? null;

  const tipo = optionalText(input.tipo, 80);
  const regiao = optionalText(input.regiao, 120);
  const origem = optionalText(input.origem, 80);
  const pagina = optionalText(input.pagina, 2_048);
  const referrer = optionalText(input.referrer, 2_048);
  const timestampCliente = optionalText(input.timestamp_cliente, 80);
  const rendaText =
    typeof input.renda === "number"
      ? Number.isFinite(input.renda) && input.renda >= 0 && input.renda <= 1_000_000_000
        ? String(input.renda)
        : INVALID
      : optionalText(input.renda, 80);
  const textValues = [tipo, regiao, origem, pagina, referrer, timestampCliente, rendaText];
  if (textValues.includes(INVALID)) return { ok: false, error: "campo_texto_invalido" };
  if (
    timestampCliente !== null &&
    timestampCliente !== INVALID &&
    Number.isNaN(Date.parse(timestampCliente))
  ) {
    return { ok: false, error: "timestamp_invalido" };
  }

  const marketingFields = {
    utm_source: optionalText(marketing.utm_source, 255),
    utm_medium: optionalText(marketing.utm_medium, 255),
    utm_campaign: optionalText(marketing.utm_campaign, 255),
    utm_term: optionalText(marketing.utm_term, 255),
    utm_content: optionalText(marketing.utm_content, 255),
    gclid: optionalText(marketing.gclid, 255),
    fbclid: optionalText(marketing.fbclid, 255),
  };
  if (Object.values(marketingFields).includes(INVALID)) {
    return { ok: false, error: "marketing_invalido" };
  }

  const row: Record<string, unknown> = {
    tipo,
    nome,
    whatsapp,
    renda: rendaText,
    regiao,
    origem,
    pagina,
    referrer,
    timestamp_cliente: timestampCliente,
    ...marketingFields,
    raw: sanitizeLandingPayload(input),
  };

  if (simulation) {
    const simulationFields = {
      sim_renda: optionalNumber(simulation.renda),
      sim_tem_dependente: optionalBoolean(simulation.temDependente),
      sim_carteira36m: optionalBoolean(simulation.carteira36m),
      sim_fgts: optionalNumber(simulation.fgts),
      sim_entrada: optionalNumber(simulation.entrada),
      sim_aluguel: optionalNumber(simulation.aluguelAtual),
      sim_faixa: optionalNumber(simulation.faixa, true),
      sim_segmento: optionalText(simulation.segmento, 120),
      sim_subsidio: optionalNumber(simulation.subsidio),
      sim_financiamento: optionalNumber(simulation.financiamento),
      sim_parcela: optionalNumber(simulation.parcela),
      sim_teto_imovel: optionalNumber(simulation.tetoImovel),
    };
    if (Object.values(simulationFields).includes(INVALID)) {
      return { ok: false, error: "simulacao_invalida" };
    }
    Object.assign(row, simulationFields);
  }

  return { ok: true, nome, digits, row };
}

async function finishResponse(
  client: RpcHolder,
  context: { keyHash: string; requestHash: string; leaseToken: string },
  body: PublicResponse,
  status: number,
  headers: Record<string, string>,
): Promise<Response> {
  const completed = await completeIdempotency(
    client,
    context.keyHash,
    context.requestHash,
    context.leaseToken,
    status,
    body,
  );
  if (!completed) {
    return jsonResp({ ok: false, error: "temporarily_unavailable" }, 503, headers, {
      "Retry-After": "5",
    });
  }
  return jsonResp(body, status, headers);
}

export const Route = createFileRoute("/api/public/webhooks/landing")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const config = loadConfig();
        const origin = request.headers.get("origin");
        const allowed = config?.allowedOrigins ?? new Set<string>();
        const headers = landingResponseHeaders(origin, allowed);
        delete headers["Content-Type"];
        if (!config) return new Response(null, { status: 503, headers });
        if (!origin || !requestOriginAllowed(origin, allowed)) {
          return new Response(null, { status: 403, headers });
        }
        return new Response(null, { status: 204, headers });
      },
      POST: async ({ request }) => {
        const config = loadConfig();
        const origin = request.headers.get("origin");
        const allowedOrigins = config?.allowedOrigins ?? new Set<string>();
        const headers = landingResponseHeaders(origin, allowedOrigins);
        if (!config) {
          return jsonResp({ ok: false, error: "service_unavailable" }, 503, headers);
        }
        if (!requestOriginAllowed(origin, config.allowedOrigins)) {
          return jsonResp({ ok: false, error: "origin_not_allowed" }, 403, headers);
        }
        const mediaType = request.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
        if (
          mediaType !== "application/json" ||
          (contentEncoding && contentEncoding !== "identity")
        ) {
          return jsonResp({ ok: false, error: "unsupported_media_type" }, 415, headers);
        }

        const idempotencyKey = request.headers.get("idempotency-key");
        if (!validIdempotencyKey(idempotencyKey)) {
          return jsonResp({ ok: false, error: "idempotency_key_required" }, 400, headers);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ipHash = hashLandingValue(
          config.hashSecret,
          "landing-ip",
          clientFingerprint(request),
        );
        const rateResult = await callAdminRpc<RateLimitRow[]>(
          supabaseAdmin,
          "consume_landing_webhook_rate_limit",
          {
            _key_hash: ipHash,
            _max_requests: config.rateLimit,
            _window_seconds: config.rateWindowSeconds,
          },
        );
        const rate = rateResult.data?.[0];
        if (rateResult.error || !rate) {
          return jsonResp({ ok: false, error: "temporarily_unavailable" }, 503, headers);
        }
        if (!rate.allowed) {
          const retryAfter = Math.max(1, rate.retry_after_seconds);
          return jsonResp(
            { ok: false, error: "rate_limit_exceeded", retry_after_s: retryAfter },
            429,
            headers,
            { "Retry-After": String(retryAfter) },
          );
        }

        const limitedBody = await readRequestBodyLimited(request, MAX_LANDING_BYTES);
        if (!limitedBody.ok) {
          const status = limitedBody.error === "payload_too_large" ? 413 : 400;
          return jsonResp({ ok: false, error: limitedBody.error }, status, headers);
        }

        let body: unknown;
        try {
          body = JSON.parse(limitedBody.raw);
        } catch {
          return jsonResp({ ok: false, error: "invalid_json" }, 400, headers);
        }
        if (!isJsonObject(body)) {
          return jsonResp({ ok: false, error: "payload_invalido" }, 400, headers);
        }

        const keyHash = hashLandingValue(config.hashSecret, "idempotency-key", idempotencyKey);
        const requestHash = hashLandingValue(
          config.hashSecret,
          "idempotency-request",
          canonicalLandingPayload(body),
        );
        const beginResult = await callAdminRpc<IdempotencyRow[]>(
          supabaseAdmin,
          "begin_landing_webhook_request",
          {
            _key_hash: keyHash,
            _request_hash: requestHash,
            _ttl_seconds: 86_400,
            _lease_seconds: 180,
          },
        );
        const claim = beginResult.data?.[0];
        if (beginResult.error || !claim) {
          return jsonResp({ ok: false, error: "temporarily_unavailable" }, 503, headers);
        }
        if (claim.disposition === "conflict") {
          return jsonResp({ ok: false, error: "idempotency_conflict" }, 409, headers);
        }
        if (claim.disposition === "in_progress") {
          const retryAfter = Math.max(1, claim.retry_after_seconds);
          return jsonResp(
            { ok: false, error: "request_in_progress", retry_after_s: retryAfter },
            409,
            headers,
            { "Retry-After": String(retryAfter) },
          );
        }
        if (claim.disposition === "replay") {
          if (!isJsonObject(claim.response_body) || claim.response_status === null) {
            return jsonResp({ ok: false, error: "temporarily_unavailable" }, 503, headers);
          }
          return jsonResp(claim.response_body, claim.response_status, headers);
        }
        if (!claim.lease_token) {
          return jsonResp({ ok: false, error: "temporarily_unavailable" }, 503, headers);
        }
        const idempotencyContext = {
          keyHash,
          requestHash,
          leaseToken: claim.lease_token,
        };

        const parsed = parseLandingPayload(body);
        if (!parsed.ok) {
          return finishResponse(
            supabaseAdmin,
            idempotencyContext,
            { ok: false, error: parsed.error },
            400,
            headers,
          );
        }

        // Honeypot responde como sucesso sem gravar nada e sem revelar a deteccao.
        if (body.website || body.simHp) {
          return finishResponse(supabaseAdmin, idempotencyContext, ACCEPTED_RESPONSE, 200, headers);
        }

        const existingResult = await landingStagingTable(supabaseAdmin)
          .select("id, lead_id, idempotency_request_hash")
          .eq("idempotency_key_hash", keyHash)
          .maybeSingle();
        if (existingResult.error) {
          await releaseIdempotency(supabaseAdmin, keyHash, requestHash, claim.lease_token);
          return jsonResp({ ok: false, error: "temporarily_unavailable" }, 503, headers);
        }
        let staging = existingResult.data as unknown as StagingRow | null;
        if (staging && staging.idempotency_request_hash !== requestHash) {
          return finishResponse(
            supabaseAdmin,
            idempotencyContext,
            { ok: false, error: "idempotency_conflict" },
            409,
            headers,
          );
        }

        if (!staging) {
          const turnstileToken = body.turnstile_token ?? body["cf-turnstile-response"];
          const turnstile = await verifyTurnstileToken(turnstileToken, config.turnstileSecret);
          if (!turnstile.ok) {
            // O token e efemero e nao faz parte da hash logica. Libera o claim
            // para que o browser possa renovar o Turnstile usando a mesma key.
            await releaseIdempotency(supabaseAdmin, keyHash, requestHash, claim.lease_token);
            if (turnstile.transient) {
              return jsonResp({ ok: false, error: "turnstile_unavailable" }, 503, headers, {
                "Retry-After": "5",
              });
            }
            const error =
              turnstile.error === "required" ? "turnstile_required" : "turnstile_invalid";
            return jsonResp(
              { ok: false, error },
              turnstile.error === "required" ? 400 : 403,
              headers,
            );
          }

          const insertResult = await landingStagingTable(supabaseAdmin)
            .insert({
              ...parsed.row,
              idempotency_key_hash: keyHash,
              idempotency_request_hash: requestHash,
            })
            .select("id, lead_id, idempotency_request_hash")
            .single();
          if (insertResult.error) {
            // Uma corrida unica e recuperavel pela linha vencedora; qualquer
            // outro erro libera o claim para uma nova tentativa.
            const recovered = await landingStagingTable(supabaseAdmin)
              .select("id, lead_id, idempotency_request_hash")
              .eq("idempotency_key_hash", keyHash)
              .maybeSingle();
            staging = recovered.data as unknown as StagingRow | null;
            if (recovered.error || !staging) {
              await releaseIdempotency(supabaseAdmin, keyHash, requestHash, claim.lease_token);
              return jsonResp({ ok: false, error: "temporarily_unavailable" }, 503, headers);
            }
          } else {
            staging = insertResult.data as unknown as StagingRow;
          }
        }

        if (staging.idempotency_request_hash !== requestHash) {
          return finishResponse(
            supabaseAdmin,
            idempotencyContext,
            { ok: false, error: "idempotency_conflict" },
            409,
            headers,
          );
        }

        const { nome, digits, row } = parsed;
        const stagingId = staging.id;
        let leadId = staging.lead_id;

        // Distribuicao v3 preservada. Falhas posteriores ao staging continuam
        // reprocessaveis e nao fazem o formulario perder o aceite.
        if (!leadId) {
          try {
            const { data: dupId, error: dupErr } = await supabaseAdmin.rpc(
              "buscar_lead_por_telefone" as never,
              { _telefone: digits } as never,
            );
            const existingId = dupErr ? null : ((dupId as string | null) ?? null);

            if (existingId) {
              leadId = existingId;
              await landingStagingTable(supabaseAdmin)
                .update({ lead_id: existingId })
                .eq("id", stagingId);

              const { data: existente } = await supabaseAdmin
                .from("leads")
                .select("corretor_id")
                .eq("id", existingId)
                .maybeSingle();
              if (existente && !existente.corretor_id) {
                await supabaseAdmin.rpc("triar_e_distribuir_lead", {
                  _lead_id: existingId,
                  _gatilho: "webhook_landing",
                });
              }
            } else {
              const simResumo = [
                row.sim_renda != null ? `Renda: R$ ${row.sim_renda}` : null,
                row.sim_faixa != null ? `Faixa MCMV: ${row.sim_faixa}` : null,
                row.sim_subsidio != null ? `Subsídio estimado: R$ ${row.sim_subsidio}` : null,
                row.sim_teto_imovel != null ? `Teto do imóvel: R$ ${row.sim_teto_imovel}` : null,
                row.sim_parcela != null ? `Parcela estimada: R$ ${row.sim_parcela}` : null,
                row.regiao ? `Região de interesse: ${row.regiao}` : null,
              ]
                .filter(Boolean)
                .join("\n");

              const { data: leadIns, error: leadErr } = await supabaseAdmin
                .from("leads")
                .insert({
                  nome,
                  telefone: digits,
                  origem: "site",
                  canal_entrada: "webhook_landing",
                  via_webhook: true,
                  renda_informada: row.renda ?? null,
                  observacoes: simResumo
                    ? `📥 Lead da Landing Page (simulador)\n${simResumo}`
                    : "📥 Lead da Landing Page",
                  utm_source: (row.utm_source as string | null) ?? "landing",
                  utm_medium: row.utm_medium ?? null,
                  utm_campaign: row.utm_campaign ?? null,
                  utm_content: row.utm_content ?? null,
                  campanha: row.utm_campaign ?? null,
                } as never)
                .select("id")
                .single();

              if (!leadErr && leadIns) {
                leadId = leadIns.id;
                await landingStagingTable(supabaseAdmin)
                  .update({ lead_id: leadIns.id })
                  .eq("id", stagingId);
                await supabaseAdmin.rpc("triar_e_distribuir_lead", {
                  _lead_id: leadIns.id,
                  _gatilho: "webhook_landing",
                });
              }
            }
          } catch {
            // Staging preservado; o intake pode ser reprocessado sem expor PII.
          }
        }

        return finishResponse(supabaseAdmin, idempotencyContext, ACCEPTED_RESPONSE, 200, headers);
      },
    },
  },
});
