// Impressão dos documentos em PDF do CRM (raio-x, relatórios, comparativo).
//
// Padrão do repo: o documento é um HTML A4 auto-contido mandado à caixa de
// impressão do navegador; "Salvar como PDF" gera o arquivo com o nome do
// <title>. Sem lib de PDF no bundle. Antes vivia duplicado em cada gerador; o
// comparativo trouxe imagem (fotos e plantas), que precisa estar carregada
// antes do print() — senão sai em branco —, e a correção vale para todos.

export const escHtml = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const slugPdf = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Espera as <img> do documento terminarem (carregar ou falhar), com teto. */
async function aguardarImagens(doc: Document, timeoutMs: number): Promise<void> {
  const pendentes = Array.from(doc.images).map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
  );
  if (pendentes.length === 0) return;
  await Promise.race([
    Promise.all(pendentes),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Abre a caixa de impressão com o HTML renderizado. Usa iframe oculto (mesma
 * origem, sem bloqueio de pop-up); se o browser recusar, cai para uma aba nova.
 * Resolve quando a caixa de impressão foi chamada.
 */
export function imprimirHtml(
  html: string,
  opts: { tituloIframe?: string; timeoutImagensMs?: number } = {},
): Promise<void> {
  const timeout = opts.timeoutImagensMs ?? 15_000;
  const iframe = document.createElement("iframe");
  if (!("srcdoc" in iframe)) return abrirEmAba(html, timeout);
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", opts.tituloIframe ?? "Documento para impressão");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";

  return new Promise<void>((resolve, reject) => {
    let encerrado = false;
    const limpar = () => {
      if (encerrado) return;
      encerrado = true;
      // Um tick depois do print para o Safari não abortar o job.
      window.setTimeout(() => iframe.remove(), 1000);
    };

    iframe.onload = async () => {
      const win = iframe.contentWindow;
      if (!win) {
        iframe.remove();
        abrirEmAba(html, timeout).then(resolve, reject);
        return;
      }
      await aguardarImagens(win.document, timeout);
      win.addEventListener("afterprint", limpar, { once: true });
      win.focus();
      win.print();
      // Rede de segurança para browsers que não emitem afterprint.
      window.setTimeout(limpar, 60_000);
      resolve();
    };

    // srcdoc (e não document.write): o load só dispara com o documento pronto,
    // sem corrida com o about:blank inicial do iframe.
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

async function abrirEmAba(html: string, timeoutMs: number): Promise<void> {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Bloqueio de pop-up: libere pop-ups para gerar o PDF.");
  win.document.write(html);
  win.document.close();
  await aguardarImagens(win.document, timeoutMs);
  win.focus();
  win.setTimeout(() => win.print(), 300);
}
