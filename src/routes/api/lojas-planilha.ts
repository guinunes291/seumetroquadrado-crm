// Proxy de leitura da planilha de stands (Google Sheets) para o Mapa de Lojas.
//
// Mesmo motivo do /api/mercado-planilha: o gviz do Google não manda CORS, e o
// mapa standalone contornava isso com JSONP — injetar <script> de terceiro —,
// o que não entra no app autenticado. Aqui a busca é no servidor e o browser
// recebe JSON já convertido em lojas.

import { createFileRoute } from "@tanstack/react-router";
import { PLANILHA_LOJAS, rowsToLojas, type Loja } from "@/lib/lojas/lojas";
import { gvizToRows, gvizUrl, unwrapGviz } from "@/lib/vitrine/planilha-mercado";

/** Stand abre e fecha devagar; 5 min de cache já poupa o Google. */
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 12_000;
/** A aba tem dezenas de linhas, não megabytes. */
const MAX_BYTES = 2 * 1024 * 1024;

type Cache = { em: number; lojas: Loja[] };
let cache: Cache | null = null;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function buscarPlanilha(): Promise<Loja[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(gvizUrl(PLANILHA_LOJAS.id), {
      signal: controller.signal,
      headers: { accept: "text/plain,*/*" },
    });
    if (!resposta.ok) throw new Error(`gviz_status_${resposta.status}`);
    const corpo = await resposta.text();
    if (corpo.length > MAX_BYTES) throw new Error("gviz_resposta_grande");
    const lojas = rowsToLojas(gvizToRows(unwrapGviz(corpo)));
    // Planilha sem nenhuma loja é aba trocada ou compartilhamento revogado, não
    // "todos os stands fecharam": falhar deixa o cliente na base de segurança
    // em vez de mostrar um mapa vazio.
    if (lojas.length === 0) throw new Error("planilha_sem_lojas");
    return lojas;
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/lojas-planilha")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const server = await import("@/lib/vitrine-publica.server");
          await server.authenticateVitrineRequest(request);
        } catch {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const agora = Date.now();
        if (cache && agora - cache.em < CACHE_MS) {
          return json({ ok: true, lojas: cache.lojas, doCache: true });
        }

        try {
          const lojas = await buscarPlanilha();
          cache = { em: agora, lojas };
          return json({ ok: true, lojas, doCache: false });
        } catch (erro) {
          // Cache vencido ainda vale mais do que um erro na tela do corretor.
          if (cache) return json({ ok: true, lojas: cache.lojas, doCache: true });
          console.error("[lojas-planilha] falha ao ler a planilha", erro);
          return json({ ok: false, error: "planilha_indisponivel" }, 502);
        }
      },
    },
  },
});
