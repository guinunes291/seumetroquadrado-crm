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

  // <RAMAL> chega com o id da conta Sonax colado no fim (ex.: "10300013004"
  // = ramal 103 + conta 00013004) — sem normalizar, o casamento com
  // profiles.ramal_sonax falha e a coluna Corretor mostra o número cru.
  // Tira o sufixo da conta (com e sem zeros à esquerda), validando que o que
  // sobra tem cara de ramal (1–6 dígitos).
  const idClienteSonax = (Deno.env.get("SONAX_ID_CLIENTE") ?? "").trim();
  function normalizarRamal(bruto: string | null): string | null {
    if (!bruto) return null;
    const sufixos = idClienteSonax ? [idClienteSonax.padStart(8, "0"), idClienteSonax] : [];
    for (const sufixo of sufixos) {
      if (sufixo && bruto.length > sufixo.length && bruto.endsWith(sufixo)) {
        const base = bruto.slice(0, bruto.length - sufixo.length);
        if (/^\d{1,6}$/.test(base)) return base;
      }
    }
    return bruto;
  }
  const ramalBruto = p("ramal") ?? p("aliasramal");
  const ramal = normalizarRamal(ramalBruto);
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

  // Status honesto: o desligamento dispara para TODA chamada, atendida ou
  // não — "concluida" só quando o atendimento pelo agente aconteceu antes
  // (evento_atendida/falando no payload). Sem isso, todo fim de chamada
  // contaria como conversa, inflando "Atendidas".
  const statusFinal = (foiAtendida: boolean): string => {
    if (evento === "finalizada") return foiAtendida ? "concluida" : "nao_atendida";
    return STATUS_POR_EVENTO[evento] ?? "atendida";
  };
  const eventoDeAtendimento = evento === "atendida" || evento === "falando";

  // Resolve lead pelo número do cliente — tentando variantes (com/sem DDI 55,
  // sem zeros de tronco): a base guarda formatos mistos e o PABX manda outro.
  let leadId: string | null = null;
  if (numero) {
    const semZeros = numero.replace(/^0+/, "");
    const candidatos = new Set<string>([semZeros]);
    if (semZeros.startsWith("55") && semZeros.length >= 12) candidatos.add(semZeros.slice(2));
    else if (semZeros.length >= 10 && semZeros.length <= 11) candidatos.add("55" + semZeros);
    for (const candidato of candidatos) {
      const { data } = await supabase.rpc("buscar_lead_ativo_por_telefone_global", {
        _telefone: candidato,
      });
      if (data) {
        leadId = data as string;
        break;
      }
    }
  }
  let corretorId: string | null = null;
  for (const candidato of new Set([ramal, ramalBruto])) {
    if (!candidato || corretorId) continue;
    const { data: profs } = await supabase
      .from("profiles")
      .select("id")
      .eq("ramal_sonax", candidato)
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
  // id_chamada) atualizam a linha em vez de duplicar.
  let chamadaExistenteId: string | null = null;
  let payloadAnterior: Record<string, unknown> = {};
  let leadExistente: string | null = null;
  if (idChamada) {
    const { data: existente } = await supabase
      .from("chamadas")
      .select("id, payload, lead_id")
      .eq("provider_call_id", idChamada)
      .maybeSingle();
    if (existente) {
      chamadaExistenteId = existente.id as string;
      payloadAnterior = (existente.payload as Record<string, unknown>) ?? {};
      leadExistente = (existente.lead_id as string | null) ?? null;
    }
  }

  // A timeline só ganha a ligação quando o agente ATENDEU de fato — no
  // primeiro evento de atendimento da chamada. Chamada que ninguém atendeu
  // fica só no histórico do Discador (`chamadas`), sem virar "contato" do
  // lead nem atualizar ultimo_contato.
  const jaAtendidaAntes = Boolean(
    payloadAnterior["evento_atendida"] || payloadAnterior["evento_falando"],
  );
  const ecoarNaTimeline = eventoDeAtendimento && !jaAtendidaAntes;
  const leadDoEco = leadId ?? leadExistente;

  async function ecoarInteracao(chamadaId: string | null): Promise<string> {
    if (!ecoarNaTimeline || !leadDoEco) return "nao_aplicavel";
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
      lead_id: leadDoEco,
      autor_id: corretorId,
      tipo: "ligacao",
      direcao,
      titulo,
      conteudo: partes.join(" ") || "Chamada atendida no PABX.",
      metadata: {
        fonte: "sonax_webhook",
        ...(idChamada ? { id_chamada: idChamada } : {}),
        ...(chamadaId ? { chamada_id: chamadaId } : {}),
        evento,
      },
    });
    if (ecoErr) console.error("sonax-webhook interacao_failed:", ecoErr);
    return ecoErr ? "falhou" : "ok";
  }

  if (chamadaExistenteId) {
    const { error: updErr } = await supabase
      .from("chamadas")
      .update({
        status: statusFinal(jaAtendidaAntes || eventoDeAtendimento),
        ...(leadId ? { lead_id: leadId } : {}),
        ...(corretorId ? { corretor_id: corretorId } : {}),
        ...(duracao ? { duracao_segundos: Number(duracao) } : {}),
        ...(tabulacao ? { tabulacao } : {}),
        payload: { ...payloadAnterior, [`evento_${evento}`]: payloadEvento },
      })
      .eq("id", chamadaExistenteId);
    if (updErr) console.error("sonax-webhook update_failed:", updErr);
    const timeline = await ecoarInteracao(chamadaExistenteId);
    return json({
      ok: true,
      chamada_id: chamadaExistenteId,
      atualizada: true,
      lead: leadDoEco ?? "nao_encontrado",
      timeline,
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
      status: statusFinal(eventoDeAtendimento),
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

  const timeline = await ecoarInteracao(nova?.id ?? null);

  return json({
    ok: true,
    chamada_id: nova?.id ?? null,
    lead: leadId ?? "nao_encontrado",
    corretor: corretorId ?? "nao_encontrado",
    timeline,
  });
}
