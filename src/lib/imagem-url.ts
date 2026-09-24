/**
 * Links do Google Drive (uc?id=, open?id=, /file/d/ID/view) não carregam
 * dentro de <img> no navegador — o Drive redireciona para download e o
 * navegador bloqueia. O endpoint de miniatura serve a imagem direto.
 */
export function imagemExibivel(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url.trim();
  try {
    const u = new URL(s);
    if (u.hostname === "drive.google.com" || u.hostname === "docs.google.com") {
      const id = u.searchParams.get("id") ?? u.pathname.match(/\/d\/([^/]+)/)?.[1] ?? null;
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
    }
    return s;
  } catch {
    return s;
  }
}
