import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "documentacao";
const MAX_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_SECONDS = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function requestContext(request: Request) {
  const storageAuth = await import("@/lib/documentacao-storage.server");
  const auth = await storageAuth.authenticateDocumentRequest(request);
  return { storageAuth, auth };
}

async function handleError(error: unknown) {
  const { DocumentRequestError } = await import("@/lib/documentacao-storage.server");
  if (error instanceof DocumentRequestError) {
    return json({ ok: false, error: error.code }, error.status);
  }
  console.error("[documentacao-api] falha inesperada", error);
  return json({ ok: false, error: "internal_error" }, 500);
}

export const Route = createFileRoute("/api/documentacao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { storageAuth, auth } = await requestContext(request);
          const form = await request.formData();
          const documentacaoId = String(form.get("documentacao_id") ?? "");
          const file = form.get("arquivo");
          if (!UUID_RE.test(documentacaoId)) {
            return json({ ok: false, error: "invalid_document_id" }, 422);
          }
          if (!(file instanceof File)) {
            return json({ ok: false, error: "missing_file" }, 422);
          }
          const extension = MIME_EXTENSIONS[file.type];
          if (!extension || file.size < 1 || file.size > MAX_BYTES) {
            return json({ ok: false, error: "invalid_file" }, 422);
          }

          const doc = await storageAuth.requireAccessibleDocument(auth, documentacaoId);
          const objectPath = `${doc.lead_id}/${doc.id}/${crypto.randomUUID()}.${extension}`;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(objectPath, file, {
              cacheControl: "0",
              contentType: file.type,
              upsert: false,
            });
          if (uploadError) {
            console.error("[documentacao-api] upload falhou", uploadError.message);
            return json({ ok: false, error: "upload_failed" }, 502);
          }

          const { data: version, error: registerError } = await supabaseAdmin.rpc(
            "registrar_documentacao_upload",
            {
              _ator_id: auth.userId,
              _documentacao_id: doc.id,
              _lead_id: doc.lead_id,
              _mime_type: file.type,
              _nome_original: file.name.slice(0, 255) || `arquivo.${extension}`,
              _object_path: objectPath,
              _tamanho_bytes: file.size,
            },
          );
          if (registerError) {
            await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
            console.error("[documentacao-api] registro da versão falhou", registerError.message);
            return json({ ok: false, error: "register_failed" }, 500);
          }

          return json({ ok: true, path: objectPath, version }, 201);
        } catch (error) {
          return handleError(error);
        }
      },

      GET: async ({ request }) => {
        try {
          const { storageAuth, auth } = await requestContext(request);
          const documentacaoId = new URL(request.url).searchParams.get("documentacao_id") ?? "";
          if (!UUID_RE.test(documentacaoId)) {
            return json({ ok: false, error: "invalid_document_id" }, 422);
          }
          const doc = await storageAuth.requireAccessibleDocument(auth, documentacaoId);
          if (!doc.url || /^https?:\/\//i.test(doc.url)) {
            return json({ ok: false, error: "private_file_not_found" }, 404);
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // `documentacoes.url` é editável em schemas legados. Exigir a versão
          // ativa correspondente impede usar o signer como confused deputy
          // para outro objeto conhecido do bucket.
          const { data: activeVersion, error: versionError } = await supabaseAdmin
            .from("documentacao_versoes")
            .select("object_path")
            .eq("documentacao_id", doc.id)
            .eq("lead_id", doc.lead_id)
            .eq("object_path", doc.url)
            .eq("ativa", true)
            .maybeSingle();
          if (versionError || !activeVersion) {
            return json({ ok: false, error: "private_file_not_found" }, 404);
          }
          const { data, error } = await supabaseAdmin.storage
            .from(BUCKET)
            .createSignedUrl(activeVersion.object_path, SIGNED_URL_SECONDS);
          if (error || !data?.signedUrl) {
            console.error("[documentacao-api] assinatura falhou", error?.message);
            return json({ ok: false, error: "signed_url_failed" }, 502);
          }
          return json({ ok: true, signed_url: data.signedUrl, expires_in: SIGNED_URL_SECONDS });
        } catch (error) {
          return handleError(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          const { storageAuth, auth } = await requestContext(request);
          const params = new URL(request.url).searchParams;
          const documentacaoId = params.get("documentacao_id") ?? "";
          const purge = params.get("purge") === "true";
          if (!UUID_RE.test(documentacaoId)) {
            return json({ ok: false, error: "invalid_document_id" }, 422);
          }
          if (purge) {
            // Exclusão física não é uma operação do CRM: apagaria versões e a
            // trilha de auditoria. Retenção/purge exige processo administrativo
            // separado, com base legal e log próprio.
            return json({ ok: false, error: "purge_not_supported" }, 403);
          }

          const doc = await storageAuth.requireAccessibleDocument(auth, documentacaoId);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          if (!doc.url || /^https?:\/\//i.test(doc.url)) {
            return json({ ok: false, error: "private_file_not_found" }, 404);
          }
          const { data: objectPath, error: registerError } = await supabaseAdmin.rpc(
            "registrar_documentacao_remocao",
            { _ator_id: auth.userId, _documentacao_id: doc.id },
          );
          if (registerError || !objectPath) {
            console.error("[documentacao-api] remoção não registrada", registerError?.message);
            return json({ ok: false, error: "remove_failed" }, 500);
          }
          const { error: storageError } = await supabaseAdmin.storage
            .from(BUCKET)
            .remove([objectPath]);
          if (storageError) {
            // A versão já não é acessível e não há policy direta no bucket. O
            // objeto órfão pode ser removido por uma rotina de manutenção.
            console.error("[documentacao-api] objeto órfão após remoção", storageError.message);
          }
          return json({ ok: true });
        } catch (error) {
          return handleError(error);
        }
      },
    },
  },
});
