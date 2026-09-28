// Embed de slides e vídeo das aulas.
//
// Só o Gamma tem embed hoje: as aulas do seed apontam para gamma.app quando
// apontam para alguma coisa. Qualquer outro domínio vira botão "Abrir slides",
// porque iframe de origem desconhecida numa tela autenticada é risco de
// clickjacking sem ganho nenhum.

/** URL de embed do Gamma, ou null quando o link não é um doc do Gamma. */
export function urlDeEmbedGamma(url: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.hostname !== "gamma.app" && u.hostname !== "www.gamma.app") return null;
  if (u.pathname.startsWith("/embed/")) return `https://gamma.app${u.pathname}`;
  const m = u.pathname.match(/^\/docs\/([^/]+)/);
  return m ? `https://gamma.app/embed/${m[1]}` : null;
}

/** `true` para URL de vídeo que dá para tocar direto na tag <video>. */
export function ehVideoDireto(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /\.(mp4|webm|ogg)$/i.test(u.pathname);
  } catch {
    return false;
  }
}
