import { supabase } from "@/integrations/supabase/client";
import type { VitrineLinkSummary } from "@/lib/vitrine-publica";

type ApiErrorPayload = { ok?: false; error?: string };

async function freshAccessToken(): Promise<string> {
  const current = await supabase.auth.getSession();
  let session = current.data.session;
  if (current.error || !session) throw new Error("Sua sessão expirou. Entre novamente.");

  if ((session.expires_at ?? 0) - Math.floor(Date.now() / 1_000) <= 60) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      throw new Error("Sua sessão expirou. Entre novamente.");
    }
    session = refreshed.data.session;
  }
  return session.access_token;
}

async function vitrineLinksRequest<T extends object>(path: string, init?: RequestInit): Promise<T> {
  const token = await freshAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as T | ApiErrorPayload | null;
  if (!response.ok || !payload || ("ok" in payload && payload.ok === false)) {
    const code = payload && "error" in payload ? payload.error : undefined;
    const messages: Record<string, string> = {
      account_inactive: "Sua conta está pendente ou bloqueada.",
      forbidden: "Este lead não está na sua carteira.",
      invalid_input: "Selecione dois ou três empreendimentos válidos.",
      not_found: "O link não existe ou não está mais acessível.",
      unauthorized: "Sua sessão expirou. Entre novamente.",
    };
    throw new Error(messages[code ?? ""] ?? "Não foi possível concluir a operação.");
  }
  return payload as T;
}

export async function createVitrineLink(args: {
  leadId: string;
  projectIds: string[];
  expiresInDays?: number;
}): Promise<{ id: string; path: string; expires_at: string }> {
  const payload = await vitrineLinksRequest<{
    ok: true;
    id: string;
    path: string;
    expires_at: string;
  }>("/api/vitrine-links", {
    method: "POST",
    body: JSON.stringify({
      lead_id: args.leadId,
      project_ids: args.projectIds,
      expires_in_days: args.expiresInDays ?? 7,
    }),
  });
  return payload;
}

export async function listVitrineLinks(leadId: string): Promise<VitrineLinkSummary[]> {
  const payload = await vitrineLinksRequest<{ ok: true; links: VitrineLinkSummary[] }>(
    `/api/vitrine-links?lead_id=${encodeURIComponent(leadId)}`,
  );
  return payload.links;
}

export async function revokeVitrineLink(linkId: string): Promise<void> {
  await vitrineLinksRequest<{ ok: true }>("/api/vitrine-links", {
    method: "DELETE",
    body: JSON.stringify({ link_id: linkId }),
  });
}
