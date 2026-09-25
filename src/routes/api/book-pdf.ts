import { createFileRoute } from "@tanstack/react-router";

// Proxy do book (PDF no Drive) para a extração de plantas no navegador.
//
// POR QUÊ existe: o navegador não baixa arquivo do Drive direto (CORS), e o
// servidor (Cloudflare) não tem canvas para rasterizar PDF — então o servidor
// só repassa os bytes e o pdf.js roda na tela de Materiais.
// Segurança: a URL NUNCA vem do cliente (SSRF) — lemos `book_url` do projeto
// no banco, com a sessão do usuário (RLS), e só aceitamos arquivo do Drive.
// Só gestão (admin/gestor), que é quem cura as plantas.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 150 * 1024 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/book-pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const projetoId = new URL(request.url).searchParams.get("projeto_id") ?? "";
          if (!UUID_RE.test(projetoId)) return json({ ok: false, error: "invalid_input" }, 422);

          const { authenticateDocumentRequest, DocumentRequestError } =
            await import("@/lib/documentacao-storage.server");
          let auth;
          try {
            auth = await authenticateDocumentRequest(request);
          } catch (e) {
            if (e instanceof DocumentRequestError)
              return json({ ok: false, error: e.code }, e.status);
            throw e;
          }

          const [admin, gestor] = await Promise.all([
            auth.supabase.rpc("has_role", { _user_id: auth.userId, _role: "admin" }),
            auth.supabase.rpc("has_role", { _user_id: auth.userId, _role: "gestor" }),
          ]);
          if (!admin.data && !gestor.data) return json({ ok: false, error: "forbidden" }, 403);

          const { data: projeto, error } = await auth.supabase
            .from("projetos")
            .select("id, book_url")
            .eq("id", projetoId)
            .maybeSingle();
          if (error) throw error;
          if (!projeto) return json({ ok: false, error: "not_found" }, 404);

          const { idDoDrive } = await import("@/lib/plantas");
          const driveId = idDoDrive(projeto.book_url);
          if (!driveId) return json({ ok: false, error: "book_not_drive" }, 422);

          // drive.usercontent + confirm=t pula a tela de "não foi possível verificar
          // vírus" que o Drive mostra para arquivo grande (todo book é grande).
          const upstream = await fetch(
            `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`,
            { redirect: "follow" },
          );
          const tipo = upstream.headers.get("content-type") ?? "";
          if (!upstream.ok || !upstream.body) {
            return json({ ok: false, error: "book_unavailable" }, 502);
          }
          // Arquivo privado volta como página HTML de login, com status 200.
          if (tipo.includes("text/html")) return json({ ok: false, error: "book_private" }, 403);
          if (!tipo.includes("pdf") && !tipo.includes("octet-stream")) {
            return json({ ok: false, error: "book_not_pdf" }, 422);
          }
          const tamanho = Number(upstream.headers.get("content-length") ?? "0");
          if (tamanho > MAX_BYTES) return json({ ok: false, error: "book_too_large" }, 413);

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              ...(tamanho > 0 ? { "content-length": String(tamanho) } : {}),
              "cache-control": "private, max-age=600",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (e) {
          console.error("[book-pdf] falha inesperada", e instanceof Error ? e.message : e);
          return json({ ok: false, error: "internal_error" }, 500);
        }
      },
    },
  },
});
