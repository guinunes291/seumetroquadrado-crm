// supabase/functions/sami-anexar-documento/index.ts
//
// Recebe documentos enviados por WhatsApp e anexa ao lead na aba de documentação.
// Auth: header `x-sami-key` (secret SAMI_WRITE_KEY) — mesmo padrão da
// sami-agendar-visita. Sobe com verify_jwt = false.
//
// Aceita:
//   - multipart/form-data com arquivo binário no campo "arquivo" e metadados
//     como campos de texto (preferido);
//   - application/json com { arquivo_base64, nome_arquivo, mime_type, ... }.
//
// Dedup: se message_id já foi processado, devolve {ok:true, duplicado:true}.
// Upsert por (lead_id, tipo): promove linha "pendente" existente para "recebido"
// em vez de criar duplicata.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sami-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "documentos-leads";
const MAX_BYTES = 20 * 1024 * 1024;
const MIMES_OK = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

// Vocabulário canônico da aba de documentação. Fora daqui vai como "outro"
// (preservando o valor original em observações) — nunca rejeitamos o arquivo.
const TIPOS_CANONICOS = new Set([
  "documento_identidade",
  "cpf",
  "comprovante_residencia",
  "comprovante_estado_civil",
  "carteira_trabalho",
  "holerites",
  "extrato_bancario_6m",
  "decore",
  "nao_classificado",
  "outro",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ ok: false, erro: "metodo_invalido", detalhe: "use POST" }, 405);

  // 1) Auth
  const key = req.headers.get("x-sami-key") ?? "";
  const esperado = Deno.env.get("SAMI_WRITE_KEY") ?? "";
  if (!esperado || !(await timingSafeEqualStr(key, esperado)))
    return json({ ok: false, erro: "auth", detalhe: "x-sami-key ausente ou inválida" }, 401);

  // 2) Parse body — multipart ou JSON
  let payload: Payload;
  try {
    payload = await parseBody(req);
  } catch (e) {
    return json({ ok: false, erro: "body_invalido", detalhe: String((e as Error).message) }, 400);
  }

  // 3) Validações básicas
  const telefone = onlyDigits(payload.telefone);
  if (!telefone) return json({ ok: false, erro: "telefone_ausente" }, 422);
  if (!MIMES_OK.has(payload.mime_type))
    return json(
      { ok: false, erro: "mime_nao_suportado", detalhe: payload.mime_type },
      422,
    );
  if (payload.tamanho_bytes < 1 || payload.tamanho_bytes > MAX_BYTES)
    return json(
      { ok: false, erro: "tamanho_invalido", detalhe: `máx ${MAX_BYTES} bytes` },
      422,
    );

  const tipoBruto = String(payload.tipo ?? "").trim() || "nao_classificado";
  const tipoNorm = TIPOS_CANONICOS.has(tipoBruto) ? tipoBruto : "outro";
  const tipoOriginal = tipoNorm === "outro" && tipoBruto !== "outro" ? tipoBruto : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 4) Dedup por message_id (antes de resolver o lead, para responder rápido)
    if (payload.message_id) {
      const { data: jaExiste } = await supabase
        .from("documentacoes")
        .select("id, lead_id, tipo, arquivo_path")
        .eq("message_id", payload.message_id)
        .maybeSingle();
      if (jaExiste) {
        const lead = await carregarLead(supabase, jaExiste.lead_id);
        const corretor = lead?.corretor_id ? await carregarCorretor(supabase, lead.corretor_id) : null;
        const signed = jaExiste.arquivo_path
          ? await assinar(supabase, jaExiste.arquivo_path)
          : null;
        return json({
          ok: true,
          duplicado: true,
          documento_id: jaExiste.id,
          lead: lead ? { id: lead.id, nome: lead.nome, telefone: lead.telefone } : null,
          corretor,
          tipo: jaExiste.tipo,
          arquivo_path: jaExiste.arquivo_path,
          url_assinada: signed,
          url_aba_documentacao: lead ? urlAba(lead.id) : null,
          docs_pendentes_restantes: lead ? await listarPendentes(supabase, lead.id) : [],
        });
      }
    }

    // 5) Resolve o lead pelo telefone
    const lead = await resolverLeadPorTelefone(supabase, telefone);
    if (!lead)
      return json(
        { ok: false, erro: "lead_nao_encontrado", detalhe: `telefone ${payload.telefone}` },
        404,
      );

    const corretor = lead.corretor_id
      ? await carregarCorretor(supabase, lead.corretor_id)
      : null;
    const docsPendentes = await listarPendentes(supabase, lead.id);

    // 6) dry_run: devolve o que faria sem tocar em nada
    if (payload.dry_run) {
      return json({
        ok: true,
        duplicado: false,
        dry_run: true,
        documento_id: null,
        lead: { id: lead.id, nome: lead.nome, telefone: lead.telefone },
        corretor,
        tipo: tipoNorm,
        arquivo_path: null,
        url_assinada: null,
        url_aba_documentacao: urlAba(lead.id),
        docs_pendentes_restantes: docsPendentes,
      });
    }

    // 7) Upload no bucket privado
    const ext = EXT[payload.mime_type];
    const nomeSanitizado = sanitizeName(payload.nome_arquivo || `arquivo.${ext}`);
    const timestamp = Date.now();
    const objectPath = `${lead.id}/${timestamp}_${tipoNorm}_${nomeSanitizado}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, payload.bytes, {
        contentType: payload.mime_type,
        cacheControl: "0",
        upsert: false,
      });
    if (upErr) {
      console.error("[sami-anexar-documento] upload falhou:", upErr.message);
      return json({ ok: false, erro: "upload_falhou", detalhe: upErr.message }, 502);
    }

    // 8) Upsert em documentacoes por (lead_id, tipo): promove pendente existente.
    const patch = {
      lead_id: lead.id,
      corretor_id: lead.corretor_id,
      tipo: tipoNorm,
      status: "recebido" as const,
      arquivo_path: objectPath,
      arquivo_nome: nomeSanitizado,
      mime_type: payload.mime_type,
      tamanho_bytes: payload.tamanho_bytes,
      origem: payload.origem ?? "whatsapp",
      recebido_em: new Date().toISOString(),
      message_id: payload.message_id ?? null,
      classificado_por: payload.classificado_por ?? null,
      confianca_ia: payload.confianca_ia ?? null,
      url: objectPath, // mantém coluna legada apontando para o arquivo
      observacoes: [payload.caption, tipoOriginal ? `Tipo original: ${tipoOriginal}` : null]
        .filter(Boolean)
        .join("\n") || null,
    };

    const { data: existente } = await supabase
      .from("documentacoes")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("tipo", tipoNorm)
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let documentoId: string;
    if (existente) {
      const { error: updErr } = await supabase
        .from("documentacoes")
        .update(patch)
        .eq("id", existente.id);
      if (updErr) throw updErr;
      documentoId = existente.id;
    } else {
      const { data: inserido, error: insErr } = await supabase
        .from("documentacoes")
        .insert(patch)
        .select("id")
        .single();
      if (insErr) throw insErr;
      documentoId = inserido.id;
    }

    // 9) Interação na timeline (não bloqueante — não desfaz o upload)
    await supabase
      .from("interacoes")
      .insert({
        lead_id: lead.id,
        corretor_id: lead.corretor_id,
        tipo: "documento",
        canal: "whatsapp",
        descricao: `Documento recebido pelo WhatsApp: ${tipoLabel(tipoNorm)} (${nomeSanitizado})`,
      })
      .then(({ error }) => {
        if (error) console.warn("[sami-anexar-documento] interação não gravada:", error.message);
      });

    const signed = await assinar(supabase, objectPath);
    const pendentesRestantes = await listarPendentes(supabase, lead.id);

    return json(
      {
        ok: true,
        duplicado: false,
        documento_id: documentoId,
        lead: { id: lead.id, nome: lead.nome, telefone: lead.telefone },
        corretor,
        tipo: tipoNorm,
        arquivo_path: objectPath,
        url_assinada: signed,
        url_aba_documentacao: urlAba(lead.id),
        docs_pendentes_restantes: pendentesRestantes,
      },
      201,
    );
  } catch (e) {
    console.error("[sami-anexar-documento] erro inesperado:", e);
    return json(
      { ok: false, erro: "erro_interno", detalhe: String((e as Error)?.message ?? e) },
      500,
    );
  }
});

// ---------------- helpers ----------------

type Payload = {
  telefone: string;
  nome?: string;
  tipo?: string;
  bytes: Uint8Array;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  caption?: string | null;
  message_id?: string | null;
  origem?: string | null;
  classificado_por?: string | null;
  confianca_ia?: number | null;
  dry_run?: boolean;
};

async function parseBody(req: Request): Promise<Payload> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const arquivo = fd.get("arquivo");
    if (!(arquivo instanceof File)) throw new Error("campo 'arquivo' ausente");
    const buf = new Uint8Array(await arquivo.arrayBuffer());
    return {
      telefone: String(fd.get("telefone") ?? ""),
      nome: (fd.get("nome") as string) ?? undefined,
      tipo: (fd.get("tipo") as string) ?? undefined,
      bytes: buf,
      nome_arquivo: (fd.get("nome_arquivo") as string) || arquivo.name || "arquivo",
      mime_type: (fd.get("mime_type") as string) || arquivo.type,
      tamanho_bytes: Number(fd.get("tamanho_bytes") ?? arquivo.size),
      caption: (fd.get("caption") as string) ?? null,
      message_id: (fd.get("message_id") as string) ?? null,
      origem: (fd.get("origem") as string) ?? null,
      classificado_por: (fd.get("classificado_por") as string) ?? null,
      confianca_ia: fd.get("confianca_ia") != null ? Number(fd.get("confianca_ia")) : null,
      dry_run: String(fd.get("dry_run") ?? "").toLowerCase() === "true",
    };
  }

  // JSON com base64
  const body = await req.json();
  const b64 = String(body.arquivo_base64 ?? "");
  if (!body.dry_run && !b64) throw new Error("arquivo_base64 ausente");
  const bytes = b64 ? decodeBase64(b64) : new Uint8Array(0);
  return {
    telefone: String(body.telefone ?? ""),
    nome: body.nome,
    tipo: body.tipo,
    bytes,
    nome_arquivo: String(body.nome_arquivo ?? "arquivo"),
    mime_type: String(body.mime_type ?? ""),
    tamanho_bytes: Number(body.tamanho_bytes ?? bytes.byteLength),
    caption: body.caption ?? null,
    message_id: body.message_id ?? null,
    origem: body.origem ?? null,
    classificado_por: body.classificado_por ?? null,
    confianca_ia: body.confianca_ia != null ? Number(body.confianca_ia) : null,
    dry_run: body.dry_run === true,
  };
}

function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sanitizeName(name: string): string {
  return (name || "arquivo")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function urlAba(leadId: string): string {
  return `/leads/${leadId}?tab=documentacao`;
}

function tipoLabel(tipo: string): string {
  const m: Record<string, string> = {
    documento_identidade: "RG/CNH",
    cpf: "CPF",
    comprovante_residencia: "Comprovante de residência",
    comprovante_estado_civil: "Estado civil",
    carteira_trabalho: "Carteira de trabalho",
    holerites: "Holerites",
    extrato_bancario_6m: "Extrato bancário (6m)",
    decore: "DECORE",
    nao_classificado: "Documento não classificado",
    outro: "Outro documento",
  };
  return m[tipo] ?? tipo;
}

async function assinar(supabase: any, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

async function carregarLead(supabase: any, leadId: string) {
  const { data } = await supabase
    .from("leads")
    .select("id, nome, telefone, corretor_id")
    .eq("id", leadId)
    .maybeSingle();
  return data;
}

async function carregarCorretor(supabase: any, id: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, nome, telefone")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function listarPendentes(supabase: any, leadId: string): Promise<string[]> {
  const { data } = await supabase
    .from("documentacoes")
    .select("tipo")
    .eq("lead_id", leadId)
    .eq("status", "pendente");
  return (data ?? []).map((r: { tipo: string }) => r.tipo);
}

async function resolverLeadPorTelefone(supabase: any, digits: string) {
  if (digits.length < 8) return null;
  // Tolera com/sem 55 e com/sem 9º dígito: compara pelos últimos 8 (fixo) ou
  // 10 (celular sem DDI). Ambiguidade → não resolve.
  const sufixos = new Set<string>();
  if (digits.length >= 10) sufixos.add(digits.slice(-10));
  if (digits.length >= 8) sufixos.add(digits.slice(-8));

  for (const suf of sufixos) {
    const { data } = await supabase
      .from("leads")
      .select("id, nome, telefone, corretor_id, deleted_at")
      .or(`telefone.ilike.%${suf},telefone_e164.ilike.%${suf}`)
      .is("deleted_at", null)
      .limit(5);
    const matches = (data ?? []).filter((l: any) => {
      const d = onlyDigits(l.telefone);
      return d.endsWith(suf);
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      // Prefere lead com corretor atribuído
      const comCorretor = matches.filter((m: any) => m.corretor_id);
      if (comCorretor.length === 1) return comCorretor[0];
    }
  }
  return null;
}

function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}
