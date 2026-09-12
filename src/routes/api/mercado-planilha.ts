// Proxy de leitura da planilha de mercado (Google Sheets) para o Mapa de Mercado.
//
// Por que existe: o endpoint gviz do Google não manda cabeçalho CORS, então o
// browser não consegue lê-lo direto. O mapa standalone contornava isso com JSONP
// — injetar <script> de terceiro e executar o que voltar —, o que não entra no
// app autenticado. Aqui a busca acontece no servidor e o browser recebe JSON.

import { createFileRoute } from "@tanstack/react-router";
import {
  PLANILHA_MERCADO,
  gvizUrl,
  gvizToRows,
  rowsToEmpreendimentos,
  unwrapGviz,
  type PlanilhaEmpreendimento,
} from "@/lib/vitrine/planilha-mercado";

/** A planilha é atualizada mês a mês; 5 min de cache já poupa o Google. */
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 12_000;
/** Teto de resposta: a aba tem centenas de linhas, não megabytes. */
const MAX_BYTES = 4 * 1024 * 1024;

type Cache = { em: number; empreendimentos: PlanilhaEmpreendimento[] };
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

async function buscarPlanilha(): Promise<PlanilhaEmpreendimento[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(gvizUrl(PLANILHA_MERCADO.id, PLANILHA_MERCADO.gid), {
      signal: controller.signal,
      headers: { accept: "text/plain,*/*" },
    });
    if (!resposta.ok) throw new Error(`gviz_status_${resposta.status}`);
    const corpo = await resposta.text();
    if (corpo.length > MAX_BYTES) throw new Error("gviz_resposta_grande");
    const empreendimentos = rowsToEmpreendimentos(gvizToRows(unwrapGviz(corpo)));
    // Sem o cabeçalho "Construtora" a aba mudou de forma: falhar é melhor do que
    // servir uma lista vazia que o mapa mostraria como "planilha sem estoque".
    if (!empreendimentos) throw new Error("cabecalho_ausente");
    return empreendimentos;
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/mercado-planilha")({
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
          return json({ ok: true, empreendimentos: cache.empreendimentos, doCache: true });
        }

        try {
          const empreendimentos = await buscarPlanilha();
          cache = { em: agora, empreendimentos };
          return json({ ok: true, empreendimentos, doCache: false });
        } catch (erro) {
          // Planilha fora do ar não pode derrubar o mapa: se houver cache, ainda
          // que vencido, ele vale mais do que um erro na tela do corretor.
          if (cache) {
            return json({ ok: true, empreendimentos: cache.empreendimentos, doCache: true });
          }
          console.error("[mercado-planilha] falha ao ler a planilha", erro);
          return json({ ok: false, error: "planilha_indisponivel" }, 502);
        }
      },
    },
  },
});
