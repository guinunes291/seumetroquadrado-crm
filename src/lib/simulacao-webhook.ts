// Regras puras do webhook do Simulador Aluguel vs. Parcela
// (POST /api/public/webhooks/simulacao): autenticação por X-API-Key,
// validação do contrato, normalização de telefone e texto da timeline.
// A rota em src/routes/api/public/webhooks/simulacao.ts só orquestra HTTP + banco.
//
// Contrato (DESIGN §2.4 do simulador):
//   aluguel 200–20000 · renda 500–50000 · entrada 0–1000000 ·
//   cliente_telefone ^55\d{10,11}$ (ou ausente) · corretor_id ^COR\d+$ (ou null)
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { checkRateLimit, jsonResponse } from "@/lib/public-api-auth";

// ------------------------ auth ------------------------

/** Confere X-API-Key contra SIMULADOR_API_KEY (secret próprio do simulador —
 *  vazamento não expõe a API de leitura nem a de escrita do MCP).
 *  Retorna null quando OK; Response 500/401/429 caso contrário. */
export function checkSimuladorApiKey(request: Request): Response | null {
  const expected = process.env.SIMULADOR_API_KEY;
  if (!expected) {
    return jsonResponse({ ok: false, erro: "SIMULADOR_API_KEY não configurada no servidor" }, 500);
  }
  const provided = request.headers.get("x-api-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return jsonResponse({ ok: false, erro: "Unauthorized" }, 401);
  }
  return checkRateLimit(request);
}

// ------------------------ telefone ------------------------

/** Normaliza o telefone do cliente para 55 + DDD + número (só dígitos).
 *  Aceita 10–11 dígitos sem DDI (prefixa 55) e 12–13 com DDI.
 *  Vazio/ausente é válido (simulação anônima) → valor null. */
export function normalizarTelefoneCliente(
  v: unknown,
): { ok: true; valor: string | null } | { ok: false } {
  if (v === null || v === undefined || String(v).trim() === "") {
    return { ok: true, valor: null };
  }
  const d = String(v).replace(/\D+/g, "");
  const com55 = d.length === 10 || d.length === 11 ? `55${d}` : d;
  if (!/^55\d{10,11}$/.test(com55)) return { ok: false };
  return { ok: true, valor: com55 };
}

// ------------------------ payload ------------------------

const vazioParaNull = (v: unknown) =>
  v === undefined || (typeof v === "string" && v.trim() === "") ? null : v;

// Números estritos, sem coerção: o contrato manda números JSON, e coerção
// silenciosa mutilaria strings mascaradas ("20.000" viraria 20 reais).
const inputsSchema = z.object({
  aluguel: z.number().min(200).max(20000),
  renda: z.number().min(500).max(50000),
  entrada: z.number().min(0).max(1_000_000),
});

const resultadoSchema = z.object({
  faixa: z.string().trim().max(40).nullish(),
  taxa_aa: z.number().nullish(),
  parcela_estimada: z.number().nullish(),
  valor_imovel_max: z.number().nullish(),
  aluguel_10anos: z.number().nullish(),
  patrimonio_10anos: z.number().nullish(),
  // Definição do DESIGN §1.2: primeiro mês (1–120) em que o aluguel acumulado
  // ultrapassa o patrimônio; null quando o patrimônio fica à frente os 10 anos.
  mes_cruzamento: z.number().int().min(1).max(120).nullish(),
});

const payloadSchema = z.object({
  origem: z.string().trim().max(120).optional().default("simulador-aluguel-parcela"),
  versao_calculo: z.string().trim().max(60).nullish(),
  corretor_id: z.preprocess(
    vazioParaNull,
    z
      .string()
      .trim()
      .regex(/^COR\d+$/, "corretor_id deve ser COR<n> ou null")
      .nullish(),
  ),
  empreendimento: z.string().trim().max(255).nullish(),
  inputs: inputsSchema,
  resultado: resultadoSchema.nullish(),
  flags: z.array(z.string().max(60)).optional(),
  ts: z.string().max(64).nullish(),
});

export type SimulacaoValidada = {
  origem: string;
  versao_calculo: string | null;
  corretor_ref: string | null;
  cliente_telefone: string | null;
  empreendimento: string | null;
  inputs: z.infer<typeof inputsSchema>;
  resultado: z.infer<typeof resultadoSchema> | null;
  flags: string[];
  ts_origem: string | null;
};

export type ValidacaoSimulacao =
  | { ok: true; data: SimulacaoValidada }
  | { ok: false; status: number; erro: string; detalhes?: unknown };

/** Valida o corpo do webhook contra o contrato. Não toca no banco. */
export function validarPayloadSimulacao(body: unknown): ValidacaoSimulacao {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 422, erro: "corpo deve ser um objeto JSON" };
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      erro: "payload inválido",
      detalhes: parsed.error.flatten(),
    };
  }

  const tel = normalizarTelefoneCliente((body as Record<string, unknown>).cliente_telefone);
  if (!tel.ok) {
    return {
      ok: false,
      status: 422,
      erro: "cliente_telefone inválido — esperado 55 + DDD + número (só dígitos)",
    };
  }

  const d = parsed.data;
  const ts = typeof d.ts === "string" ? d.ts.trim() : "";
  const ts_origem = ts && !Number.isNaN(Date.parse(ts)) ? new Date(ts).toISOString() : null;

  return {
    ok: true,
    data: {
      origem: d.origem,
      versao_calculo: d.versao_calculo ?? null,
      corretor_ref: d.corretor_id ?? null,
      cliente_telefone: tel.valor,
      empreendimento: d.empreendimento ?? null,
      inputs: d.inputs,
      resultado: d.resultado ?? null,
      flags: d.flags ?? [],
      ts_origem,
    },
  };
}

// ------------------------ timeline ------------------------

function brl(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Texto da nota na timeline do lead (interacoes). Linguagem de estimativa —
 *  nunca "aprovado/garantido" (compliance do DESIGN §1.4). */
export function montarResumoSimulacao(d: SimulacaoValidada): string {
  const r = d.resultado;
  const linhas: (string | null)[] = [
    `• Aluguel hoje: ${brl(d.inputs.aluguel)}/mês`,
    `• Renda: ${brl(d.inputs.renda)} · Entrada: ${brl(d.inputs.entrada)}`,
    r?.faixa
      ? `• Faixa ${r.faixa}${r.taxa_aa != null ? ` · taxa estimada ${r.taxa_aa.toLocaleString("pt-BR")}% a.a.` : ""}`
      : null,
    r?.parcela_estimada != null ? `• Parcela estimada: ≈ ${brl(r.parcela_estimada)}` : null,
    r?.aluguel_10anos != null || r?.patrimonio_10anos != null
      ? `• Em 10 anos — aluguel: ${brl(r?.aluguel_10anos) ?? "—"} · patrimônio: ${brl(r?.patrimonio_10anos) ?? "—"}`
      : null,
    r?.mes_cruzamento != null ? `• Mês de cruzamento: ${r.mes_cruzamento}` : null,
    d.flags.length ? `• Flags: ${d.flags.join(", ")}` : null,
    d.corretor_ref ? `• Corretor na visita: ${d.corretor_ref}` : null,
    d.empreendimento ? `• Empreendimento: ${d.empreendimento}` : null,
  ];
  return [...linhas.filter(Boolean), "Estimativa comercial — a aprovação formal é da Caixa."].join(
    "\n",
  );
}
