import { MIDIA_PREFIXO, PROPOSTA_TOKEN_RE, type PropostaSnapshot } from "@/lib/proposta-link";

// Leitura pública do Link de Proposta (servidor, service role). Nunca logar o
// token bruto; só o hash vai ao banco.

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type PropostaPublica =
  | { estado: "nao_encontrada" | "revogada" | "limite" }
  | {
      estado: "ativa" | "expirada" | "aceita";
      modelo: "apresentacao" | "proposta";
      expira_em: string;
      snapshot: PropostaSnapshot;
      agendar_slug: string | null;
    };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function consumirRequisicao(tokenHash: string): Promise<string> {
  const db = await admin();
  const { data, error } = await db.rpc("consumir_proposta_requisicao", { _token_hash: tokenHash });
  if (error) throw new Error("indisponivel");
  return String(data);
}

async function assinar(db: Awaited<ReturnType<typeof admin>>, urls: string[]): Promise<Map<string, string>> {
  const paths = [...new Set(urls.filter((u) => u?.startsWith(MIDIA_PREFIXO)).map((u) => u.slice(MIDIA_PREFIXO.length)))];
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data } = await db.storage.from("propostas-midia").createSignedUrls(paths, 60 * 60 * 6);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(MIDIA_PREFIXO + item.path, item.signedUrl);
  }
  return map;
}

export async function carregarPropostaPublica(token: string): Promise<PropostaPublica> {
  if (!PROPOSTA_TOKEN_RE.test(token)) return { estado: "nao_encontrada" };
  const tokenHash = await hashToken(token);
  const consumo = await consumirRequisicao(tokenHash);
  if (consumo === "not_found") return { estado: "nao_encontrada" };
  if (consumo !== "allowed") return { estado: "limite" };
  const db = await admin();
  const { data, error } = await db.rpc("obter_proposta_publica", { _token_hash: tokenHash });
  if (error) throw new Error("indisponivel");
  const r = data as Record<string, unknown> | null;
  if (!r) return { estado: "nao_encontrada" };
  if (r.estado === "revogada") return { estado: "revogada" };

  const snapshot = r.snapshot as PropostaSnapshot;
  const imgs = [
    snapshot.projeto.capa_url ?? "",
    ...(snapshot.projeto.fotos ?? []),
    ...(snapshot.plantas ?? []).map((p) => p.imagem_url),
    snapshot.unidade?.planta_url ?? "",
    snapshot.corretor.foto_url ?? "",
  ];
  const assinadas = await assinar(db, imgs);
  const troca = (u: string | null | undefined) => (u ? (assinadas.get(u) ?? (u.startsWith(MIDIA_PREFIXO) ? null : u)) : null);
  const resolvido: PropostaSnapshot = {
    ...snapshot,
    corretor: { ...snapshot.corretor, foto_url: troca(snapshot.corretor.foto_url) },
    projeto: {
      ...snapshot.projeto,
      capa_url: troca(snapshot.projeto.capa_url),
      fotos: (snapshot.projeto.fotos ?? []).map(troca).filter((u): u is string => !!u),
    },
    plantas: (snapshot.plantas ?? [])
      .map((p) => ({ ...p, imagem_url: troca(p.imagem_url) ?? "" }))
      .filter((p) => p.imagem_url),
    unidade: snapshot.unidade ? { ...snapshot.unidade, planta_url: troca(snapshot.unidade.planta_url) } : null,
  };

  // CTA de visita: link de agendamento ativo do corretor dono da proposta.
  let agendarSlug: string | null = null;
  if (snapshot.modelo === "apresentacao") {
    const { data: p } = await db.from("propostas").select("corretor_id").eq("token_hash", tokenHash).maybeSingle();
    if (p?.corretor_id) {
      const { data: link } = await db
        .from("agendamento_links")
        .select("slug")
        .eq("corretor_id", p.corretor_id)
        .is("revogado_em", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      agendarSlug = link?.slug ?? null;
    }
  }

  return {
    estado: r.estado as "ativa" | "expirada" | "aceita",
    modelo: r.modelo as "apresentacao" | "proposta",
    expira_em: String(r.expira_em),
    snapshot: resolvido,
    agendar_slug: agendarSlug,
  };
}
