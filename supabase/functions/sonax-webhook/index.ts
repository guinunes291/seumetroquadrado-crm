// Webhook de eventos de chamada do Sonax PABX Virtual ("URL de integração").
// O PABX chama esta URL nos eventos de chamada com variáveis de template
// (<ID_CHAMADA>, <NUMERO>, <RAMAL>, <ID_FILA>, <ID_CAMPANHA>, ...):
//
//   https://<projeto>.supabase.co/functions/v1/sonax-webhook?secret=<SEGREDO>
//     &evento=atendida&id_chamada=<ID_CHAMADA>&numero=<NUMERO>&ramal=<RAMAL>
//     &id_atendente=<ID_ATENDENTE>&id_fila=<ID_FILA>&id_campanha=<ID_CAMPANHA>
//     &numero_rec=<NUMERO_REC>
//
// Fluxo: valida o secret; resolve o lead pelo número (RPC
// buscar_lead_ativo_por_telefone_global) e o corretor pelo ramal
// (profiles.ramal_sonax); grava/atualiza `chamadas` (idempotente por
// id_chamada) e, na primeira vez que a chamada casa com um lead, ecoa uma
// interação `ligacao` na timeline (o trigger do banco atualiza
// leads.ultima_interacao/ultimo_contato).
//
// Autenticação: header x-webhook-secret OU ?secret= na query. A exceção ao
// P-3 ("nunca secret em query") é deliberada e documentada: a URL de
// integração do Sonax é um template estático sem suporte a headers. Use um
// secret exclusivo desta função (rotacionável sem afetar mais nada) e o
// kill-switch SONAX_ALLOW_QUERY_SECRET=false caso o dia em que o tráfego
// passe por um intermediário com headers (ex.: n8n) chegue.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   SONAX_WEBHOOK_SECRET       (obrigatório) — segredo compartilhado com o PABX
//   SONAX_ALLOW_QUERY_SECRET   (opcional, default "true")
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — injetadas automaticamente
//
// config: verify_jwt = false (supabase/config.toml).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { comCapturaDeErro } from "../_shared/error-tracking.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante via digest (não vaza o tamanho nem o prefixo). */
async function secretsIguais(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Variável de template que o PABX não substituiu chega literal ("<NUMERO>").
function limpar(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s || /^<.*>$/.test(s)) return null;
  return s;
}

function onlyDigits(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  return d || null;
}

// Evento (configurado na própria URL de integração) -> status da chamada.
const STATUS_POR_EVENTO: Record<string, string> = {
  chamando: "chamando",
  atendida: "atendida",
  falando: "falando",
  finalizada: "concluida",
  nao_atendida: "nao_atendida",
  falha: "falha",
};

Deno.serve((req: Request) => comCapturaDeErro("sonax-webhook", () => handleRequest(req)));

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const reqUrl = new URL(req.url);

  const secret = Deno.env.get("SONAX_WEBHOOK_SECRET");
  const allowQuerySecret =
    (Deno.env.get("SONAX_ALLOW_QUERY_SECRET") ?? "true").toLowerCase() !== "false";
  const viaHeader = req.headers.get("x-webhook-secret");
  const viaQuery = allowQuerySecret ? reqUrl.searchParams.get("secret") : null;
  const provided = viaHeader ?? viaQuery;
  if (!secret || !provided || !(await secretsIguais(provided, secret))) {
    return json({ error: "unauthorized" }, 401);
  }

  // Parâmetros: query string (template do PABX) tem precedência; um POST com
  // corpo JSON/form (ex.: reenvio manual, n8n) complementa.
  const params = new Map<string, string>();
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    try {
      if (ct.includes("application/json")) {
        const body = (await req.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) {
          if (v !== null && v !== undefined) params.set(k, String(v));
        }
      } else if (ct.includes("form")) {
        const form = await req.formData();
        for (const [k, v] of form.entries()) {
          if (typeof v === "string") params.set(k, v);
        }
      }
    } catch {
      // corpo ilegível não invalida o evento — os dados canônicos vêm da query
    }
  }
  for (const [k, v] of reqUrl.searchParams.entries()) params.set(k, v);
  const p = (k: string) => limpar(params.get(k));

  const idChamada = p("id_chamada");
  const numero = onlyDigits(p("numero"));
  const numeroRec = onlyDigits(p("numero_rec"));
  const ramal = p("ramal") ?? p("aliasramal");
  const idAtendente = p("id_atendente");
  const atLogin = p("at_login");
  const idFila = p("id_fila");
  const idCampanha = p("id_campanha");
  const idContato = p("id_contato");
  const tabulacao = p("tabulacao");
  const duracao = onlyDigits(p("duracao"));
  const evento = (p("evento") ?? "atendida").toLowerCase();

  if (!numero && !idChamada) return json({ error: "missing_numero_or_id_chamada" }, 422);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // <NUMERO> em campanha é o DESTINO discado (saída); receptivo é o originador
  // (entrada). A presença de ID_CAMPANHA distingue os dois.
  const direcao = idCampanha ? "saida" : "entrada";
  const origem = idCampanha ? "campanha" : "receptivo";
  const status = STATUS_POR_EVENTO[evento] ?? "atendida";

  // Resolve lead pelo número do cliente e corretor pelo ramal.
  let leadId: string | null = null;
  if (numero) {
    const { data } = await supabase.rpc("buscar_lead_ativo_por_telefone_global", {
      _telefone: numero,
    });
    leadId = (data as string | null) ?? null;
  }
  let corretorId: string | null = null;
  if (ramal) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id")
      .eq("ramal_sonax", ramal)
      .limit(1);
    corretorId = profs?.[0]?.id ?? null;
  }
  // Fallback: eventos de campanha nem sempre trazem o ramal — o vínculo pelo
  // ID do atendente (profiles.sonax_id_atendente) cobre esse caso.
  if (!corretorId && idAtendente) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id")
      .eq("sonax_id_atendente", idAtendente)
      .limit(1);
    corretorId = profs?.[0]?.id ?? null;
  }

  const payloadEvento = {
    evento,
    id_chamada: idChamada,
    numero,
    numero_rec: numeroRec,
    ramal,
    id_atendente: idAtendente,
    at_login: atLogin,
    id_fila: idFila,
    id_campanha: idCampanha,
    id_contato: idContato,
    recebido_em: new Date().toISOString(),
  };

  // Idempotência/atualização: eventos seguintes da mesma chamada (mesmo
  // id_chamada) atualizam a linha em vez de duplicar — e não ecoam de novo
  // na timeline.
  let chamadaExistenteId: string | null = null;
  let payloadAnterior: Record<string, unknown> = {};
  if (idChamada) {
    const { data: existente } = await supabase
      .from("chamadas")
      .select("id, payload")
      .eq("provider_call_id", idChamada)
      .maybeSingle();
    if (existente) {
      chamadaExistenteId = existente.id as string;
      payloadAnterior = (existente.payload as Record<string, unknown>) ?? {};
    }
  }

  if (chamadaExistenteId) {
    const { error: updErr } = await supabase
      .from("chamadas")
      .update({
        status,
        ...(leadId ? { lead_id: leadId } : {}),
        ...(corretorId ? { corretor_id: corretorId } : {}),
        ...(duracao ? { duracao_segundos: Number(duracao) } : {}),
        ...(tabulacao ? { tabulacao } : {}),
        payload: { ...payloadAnterior, [`evento_${evento}`]: payloadEvento },
      })
      .eq("id", chamadaExistenteId);
    if (updErr) console.error("sonax-webhook update_failed:", updErr);
    return json({
      ok: true,
      chamada_id: chamadaExistenteId,
      atualizada: true,
      lead: leadId ?? "nao_encontrado",
    });
  }

  const { data: nova, error: insErr } = await supabase
    .from("chamadas")
    .insert({
      lead_id: leadId,
      corretor_id: corretorId,
      direcao,
      origem,
      numero: numero ?? numeroRec ?? "-",
      ramal,
      provider_call_id: idChamada,
      status,
      ...(duracao ? { duracao_segundos: Number(duracao) } : {}),
      ...(tabulacao ? { tabulacao } : {}),
      payload: { [`evento_${evento}`]: payloadEvento },
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    // Corrida entre dois eventos da mesma chamada: o UNIQUE parcial barrou o
    // segundo insert — trata como atualização.
    if ((insErr as { code?: string }).code === "23505" && idChamada) {
      const { data: dup } = await supabase
        .from("chamadas")
        .select("id")
        .eq("provider_call_id", idChamada)
        .maybeSingle();
      return json({
        ok: true,
        chamada_id: dup?.id ?? null,
        atualizada: true,
        lead: leadId ?? "nao_encontrado",
      });
    }
    console.error("sonax-webhook insert_failed:", insErr);
    return json({ error: "insert_failed", detail: insErr.message }, 500);
  }

  // Eco na timeline — só na primeira gravação da chamada e só com lead casado.
  let timeline = "sem_lead";
  if (leadId) {
    const titulo =
      direcao === "entrada" ? "Ligação recebida (PABX Sonax)" : "Ligação de campanha (discador)";
    const partes = [
      numero ? `Número: ${numero}.` : null,
      ramal ? `Ramal: ${ramal}.` : null,
      (atLogin ?? idAtendente) ? `Atendente: ${atLogin ?? idAtendente}.` : null,
      idFila ? `Fila: ${idFila}.` : null,
      idCampanha ? `Campanha: ${idCampanha}.` : null,
    ].filter(Boolean);
    const { error: ecoErr } = await supabase.from("interacoes").insert({
      lead_id: leadId,
      autor_id: corretorId,
      tipo: "ligacao",
      direcao,
      titulo,
      conteudo: partes.join(" ") || "Evento de chamada do PABX.",
      metadata: {
        fonte: "sonax_webhook",
        ...(idChamada ? { id_chamada: idChamada } : {}),
        ...(nova?.id ? { chamada_id: nova.id } : {}),
        evento,
      },
    });
    timeline = ecoErr ? "falhou" : "ok";
    if (ecoErr) console.error("sonax-webhook interacao_failed:", ecoErr);
  }

  return json({
    ok: true,
    chamada_id: nova?.id ?? null,
    lead: leadId ?? "nao_encontrado",
    corretor: corretorId ?? "nao_encontrado",
    timeline,
  });
}
