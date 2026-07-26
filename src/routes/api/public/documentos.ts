// Rotas públicas de documentação (chamadas por automatizador externo — n8n).
//
//   POST /api/public/documentos  → sami-anexar-documento (spec 4.4 v2)
//   GET  /api/public/documentos  → sami-listar-documentos
//
// Auth: X-API-Key contra api_clientes (mesmo padrão de /api/public/leads/*).
// Escopo: leads:write para POST, leads:read para GET.
//
// Bucket: privado "documentacao", caminho `${lead_id}/${doc_id}/${nome}`
// — exatamente o padrão que o CRM já usa em src/lib/documentacao.ts.
//
// Erros são explícitos no corpo (não retornamos 404 genérico): o n8n toma
// decisões diferentes em cada caso.

import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import { apiClientAgent, requireApiClientScope } from "@/lib/api-client-auth.server";

const BUCKET = "documentacao";
const MAX_BYTES = 20 * 1024 * 1024;
const MIMES_OK = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

// Catálogo canônico (src/lib/documentacao.ts DOC_LABEL). Fora daqui vira "outro".
const TIPOS_CANONICOS = new Set([
  "documento_identidade",
  "cpf",
  "comprovante_estado_civil",
  "comprovante_residencia",
  "carteira_trabalho",
  "holerites",
  "extrato_bancario_6m",
  "decore",
  "contrato_social",
  "pro_labore",
  "irpj",
  "extrato_pj",
  "extrato_beneficio",
  "extrato_fgts",
  "autorizacao_fgts",
  "declaracao_ir",
  "conjuge_identidade",
  "conjuge_renda",
  "nao_classificado",
  "outro",
]);

type ParsedFile = {
  telefone: string;
  nome: string | null;
  origem: string | null;
  tipoBruto: string;
  caption: string | null;
  messageId: string | null;
  confianca: number | null;
  bytes: Uint8Array;
  nome_arquivo: string;
  mime_type: string;
};

export const Route = createFileRoute("/api/public/documentos")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      // ---------------------------------------------------------------- LISTAR
      GET: async ({ request }) => {
        const auth = await requireApiClientScope(request, "leads:read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const leadIdParam = url.searchParams.get("lead_id");
        const telefoneParam = url.searchParams.get("telefone");

        if (!leadIdParam && !telefoneParam) {
          return jsonResponse(
            { ok: false, erro: "parametros_ausentes", detalhe: "informe lead_id ou telefone" },
            422,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let leadId = leadIdParam ?? null;
        let ambiguo = false;
        if (!leadId && telefoneParam) {
          const resolved = await resolverLeadPorTelefone(supabaseAdmin, telefoneParam);
          if (!resolved) {
            return jsonResponse(
              { ok: false, erro: "lead_nao_encontrado", detalhe: `telefone ${telefoneParam}` },
              404,
            );
          }
          leadId = resolved.lead.id;
          ambiguo = resolved.ambiguo;
        }

        const { data, error } = await (supabaseAdmin as any)
          .from("documentacoes")
          .select("id, tipo, arquivo_nome, status, created_at")
          .eq("lead_id", leadId!)
          .order("created_at", { ascending: true });
        if (error) {
          return jsonResponse({ ok: false, erro: "leitura_falhou", detalhe: error.message }, 500);
        }

        return jsonResponse({
          ok: true,
          lead_id: leadId,
          ambiguo,
          documentos: (data ?? []).map((r: any) => ({
            id: r.id,
            tipo: r.tipo,
            nome_arquivo: r.arquivo_nome ?? null,
            status: r.status,
            criado_em: r.created_at,
          })),
        });
      },

      // ---------------------------------------------------------------- ANEXAR
      POST: async ({ request }) => {
        const auth = await requireApiClientScope(request, "leads:write");
        if (auth instanceof Response) return auth;
        const agente = apiClientAgent(auth);

        let parsed: ParsedFile;
        try {
          parsed = await parseBody(request);
        } catch (err) {
          return jsonResponse(
            { ok: false, erro: "body_invalido", detalhe: (err as Error).message },
            400,
          );
        }

        if (!parsed.telefone || onlyDigits(parsed.telefone).length < 8) {
          return jsonResponse(
            { ok: false, erro: "telefone_ausente", detalhe: "telefone com ao menos 8 dígitos" },
            422,
          );
        }
        if (!MIMES_OK.has(parsed.mime_type)) {
          return jsonResponse(
            {
              ok: false,
              erro: "mime_nao_suportado",
              detalhe: parsed.mime_type,
              aceitos: [...MIMES_OK],
            },
            415,
          );
        }
        if (parsed.bytes.byteLength < 1) {
          return jsonResponse({ ok: false, erro: "arquivo_vazio", detalhe: "0 bytes" }, 422);
        }
        if (parsed.bytes.byteLength > MAX_BYTES) {
          return jsonResponse(
            {
              ok: false,
              erro: "arquivo_grande_demais",
              detalhe: `máximo ${MAX_BYTES} bytes`,
              tamanho: parsed.bytes.byteLength,
            },
            413,
          );
        }

        const tipoNorm = TIPOS_CANONICOS.has(parsed.tipoBruto) ? parsed.tipoBruto : "outro";
        const tipoOriginal = tipoNorm === "outro" && parsed.tipoBruto ? parsed.tipoBruto : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Idempotência por messageId — devolve o registro existente.
        if (parsed.messageId) {
          const { data: dup } = await (supabaseAdmin as any)
            .from("documentacoes")
            .select("id, lead_id, tipo, arquivo_path, arquivo_nome")
            .eq("message_id", parsed.messageId)
            .maybeSingle();
          if (dup) {
            const signed = dup.arquivo_path ? await assinar(supabaseAdmin, dup.arquivo_path) : null;
            return jsonResponse({
              ok: true,
              duplicado: true,
              ambiguo: false,
              documento_id: dup.id,
              lead_id: dup.lead_id,
              tipo: dup.tipo,
              nome_arquivo: dup.arquivo_nome,
              url: signed,
              arquivo_path: dup.arquivo_path,
            });
          }
        }

        // 2) Resolve lead pelo telefone (últimos 8-9 dígitos).
        const resolved = await resolverLeadPorTelefone(supabaseAdmin, parsed.telefone);
        if (!resolved) {
          return jsonResponse(
            { ok: false, erro: "lead_nao_encontrado", detalhe: `telefone ${parsed.telefone}` },
            404,
          );
        }
        const lead = resolved.lead;
        const ambiguo = resolved.ambiguo;

        // 3) Gera doc_id primeiro (path do bucket precisa dele).
        const docId = crypto.randomUUID();
        const nomeSan = sanitizeName(parsed.nome_arquivo);
        const objectPath = `${lead.id}/${docId}/${nomeSan}`;

        // 4) Upload no bucket privado.
        const { error: upErr } = await (supabaseAdmin as any).storage
          .from(BUCKET)
          .upload(objectPath, parsed.bytes, {
            contentType: parsed.mime_type,
            upsert: false,
            cacheControl: "0",
          });
        if (upErr) {
          return jsonResponse({ ok: false, erro: "upload_falhou", detalhe: upErr.message }, 502);
        }

        // 5) Upsert em documentacoes: promove "pendente" existente do mesmo tipo.
        const { data: existente } = await (supabaseAdmin as any)
          .from("documentacoes")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("tipo", tipoNorm)
          .eq("status", "pendente")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        const observacoes =
          [parsed.caption, tipoOriginal ? `Tipo original: ${tipoOriginal}` : null, `via ${agente}`]
            .filter(Boolean)
            .join("\n") || null;

        const patch = {
          lead_id: lead.id,
          corretor_id: lead.corretor_id,
          tipo: tipoNorm,
          status: "recebido",
          arquivo_path: objectPath,
          arquivo_nome: nomeSan,
          mime_type: parsed.mime_type,
          tamanho_bytes: parsed.bytes.byteLength,
          origem: parsed.origem ?? "whatsapp",
          recebido_em: new Date().toISOString(),
          message_id: parsed.messageId,
          classificado_por: parsed.confianca != null ? "ia" : null,
          confianca_ia: parsed.confianca,
          url: objectPath,
          observacoes,
        };

        let documentoId: string;
        if (existente) {
          const { error: updErr } = await (supabaseAdmin as any)
            .from("documentacoes")
            .update(patch)
            .eq("id", existente.id);
          if (updErr) {
            // best-effort rollback
            await (supabaseAdmin as any).storage.from(BUCKET).remove([objectPath]);
            return jsonResponse(
              { ok: false, erro: "gravacao_falhou", detalhe: updErr.message },
              500,
            );
          }
          documentoId = existente.id;
        } else {
          const { error: insErr } = await (supabaseAdmin as any)
            .from("documentacoes")
            .insert({ id: docId, ...patch });
          if (insErr) {
            await (supabaseAdmin as any).storage.from(BUCKET).remove([objectPath]);
            return jsonResponse(
              { ok: false, erro: "gravacao_falhou", detalhe: insErr.message },
              500,
            );
          }
          documentoId = docId;
        }

        // 6) Timeline (best-effort).
        await (supabaseAdmin as any)
          .from("interacoes")
          .insert({
            lead_id: lead.id,
            corretor_id: lead.corretor_id,
            tipo: "documento",
            canal: parsed.origem ?? "whatsapp",
            descricao: `Documento recebido: ${tipoNorm} (${nomeSan})`,
          })
          .then(({ error }: { error: unknown }) => {
            if (error) console.warn("[api/public/documentos] interação não gravada", error);
          });

        const signed = await assinar(supabaseAdmin, objectPath);

        return jsonResponse(
          {
            ok: true,
            duplicado: false,
            ambiguo,
            documento_id: documentoId,
            lead_id: lead.id,
            tipo: tipoNorm,
            nome_arquivo: nomeSan,
            url: signed,
            arquivo_path: objectPath,
          },
          201,
        );
      },
    },
  },
});

// ------------------------------------------------------------------- helpers

async function parseBody(req: Request): Promise<ParsedFile> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const arquivo = fd.get("arquivo");
    if (!(arquivo instanceof File)) throw new Error("campo 'arquivo' ausente");
    const buf = new Uint8Array(await arquivo.arrayBuffer());
    return {
      telefone: String(fd.get("telefone") ?? ""),
      nome: (fd.get("nome") as string) || null,
      origem: (fd.get("origem") as string) || null,
      tipoBruto: String(fd.get("tipo") ?? "").trim() || "nao_classificado",
      caption: (fd.get("caption") as string) || null,
      messageId: (fd.get("messageId") as string) || (fd.get("message_id") as string) || null,
      confianca:
        fd.get("confianca") != null
          ? Number(fd.get("confianca"))
          : fd.get("confianca_ia") != null
            ? Number(fd.get("confianca_ia"))
            : null,
      bytes: buf,
      nome_arquivo: (fd.get("nome_arquivo") as string) || arquivo.name || "arquivo",
      mime_type: (fd.get("mime_type") as string) || arquivo.type || "",
    };
  }

  const body = (await req.json()) as Record<string, unknown>;
  const b64 = String(body.arquivo_base64 ?? "");
  if (!b64) throw new Error("arquivo_base64 ausente");
  const bytes = decodeBase64(b64);
  return {
    telefone: String(body.telefone ?? ""),
    nome: (body.nome as string) ?? null,
    origem: (body.origem as string) ?? null,
    tipoBruto: String(body.tipo ?? "").trim() || "nao_classificado",
    caption: (body.caption as string) ?? null,
    messageId: (body.messageId as string) ?? (body.message_id as string) ?? null,
    confianca:
      body.confianca != null
        ? Number(body.confianca)
        : body.confianca_ia != null
          ? Number(body.confianca_ia)
          : null,
    bytes,
    nome_arquivo: String(body.nome_arquivo ?? "arquivo"),
    mime_type: String(body.mime_type ?? ""),
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
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

type LeadMin = {
  id: string;
  nome: string | null;
  telefone: string | null;
  corretor_id: string | null;
};

/**
 * Casa lead pelos últimos 8-9 dígitos do telefone (ignora 55, DDD e 9º).
 * Quando mais de um casa, escolhe o de ultima_interacao mais recente e sinaliza
 * `ambiguo: true` — o automatizador decide se prossegue ou pede confirmação.
 */
async function resolverLeadPorTelefone(
  supabase: any,
  telefone: string,
): Promise<{ lead: LeadMin; ambiguo: boolean } | null> {
  const digits = onlyDigits(telefone);
  if (digits.length < 8) return null;
  const sufixos: string[] = [];
  if (digits.length >= 9) sufixos.push(digits.slice(-9));
  if (digits.length >= 8) sufixos.push(digits.slice(-8));

  for (const suf of sufixos) {
    const { data } = await supabase
      .from("leads")
      .select("id, nome, telefone, corretor_id, ultima_interacao, deleted_at")
      .or(`telefone.ilike.%${suf},telefone_e164.ilike.%${suf}`)
      .is("deleted_at", null)
      .order("ultima_interacao", { ascending: false, nullsFirst: false })
      .limit(10);
    const matches = (data ?? []).filter((l: any) => onlyDigits(l.telefone).endsWith(suf));
    if (matches.length >= 1) {
      return {
        lead: {
          id: matches[0].id,
          nome: matches[0].nome,
          telefone: matches[0].telefone,
          corretor_id: matches[0].corretor_id,
        },
        ambiguo: matches.length > 1,
      };
    }
  }
  return null;
}

async function assinar(supabase: any, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
