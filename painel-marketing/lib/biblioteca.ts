// Regras puras da Biblioteca de criativos (sem banco e sem rede, para testar).

type Texto = { text?: string };
export type CriativoMeta = {
  id?: string;
  object_type?: string;
  thumbnail_url?: string;
  image_url?: string;
  title?: string;
  body?: string;
  video_id?: string;
  instagram_permalink_url?: string;
  object_story_spec?: {
    link_data?: {
      message?: string;
      name?: string;
      picture?: string;
      child_attachments?: unknown[];
    };
    video_data?: { message?: string; title?: string; image_url?: string };
    photo_data?: { caption?: string; url?: string };
  };
  asset_feed_spec?: { bodies?: Texto[]; titles?: Texto[]; videos?: unknown[]; images?: unknown[] };
};

export type Tipo = "video" | "imagem" | "carrossel" | "outro";

export function tipoDoCriativo(c: CriativoMeta | undefined): Tipo {
  if (!c) return "outro";
  const s = c.object_story_spec;
  if (s?.link_data?.child_attachments?.length) return "carrossel";
  if (c.video_id || s?.video_data || c.object_type === "VIDEO" || c.asset_feed_spec?.videos?.length)
    return "video";
  if (
    c.image_url ||
    s?.photo_data ||
    s?.link_data ||
    c.object_type === "PHOTO" ||
    c.asset_feed_spec?.images?.length
  )
    return "imagem";
  return "outro";
}

// O texto do anúncio mora em lugares diferentes conforme o formato: no próprio
// criativo, na publicação que ele usa ou no conjunto de variações (dinâmico).
export function textosDoCriativo(c: CriativoMeta | undefined): {
  titulo: string | null;
  texto: string | null;
} {
  if (!c) return { titulo: null, texto: null };
  const s = c.object_story_spec;
  const f = c.asset_feed_spec;
  const texto =
    c.body ??
    s?.link_data?.message ??
    s?.video_data?.message ??
    s?.photo_data?.caption ??
    f?.bodies?.[0]?.text ??
    null;
  const titulo =
    c.title ?? s?.link_data?.name ?? s?.video_data?.title ?? f?.titles?.[0]?.text ?? null;
  return { titulo: titulo?.trim() || null, texto: texto?.trim() || null };
}

// Teto de custo por resultado da SMQ e volume mínimo para chamar de vencedor:
// com poucos resultados, um custo baixo pode ser só sorte.
export const CUSTO_TETO = 20;
export const VOLUME_MINIMO = 30;

export function ehVencedor(resultados: number, custo: number | null): boolean {
  return resultados >= VOLUME_MINIMO && custo !== null && custo <= CUSTO_TETO;
}
