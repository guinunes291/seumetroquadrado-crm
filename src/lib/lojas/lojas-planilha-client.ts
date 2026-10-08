// Cliente da rota `/api/lojas-planilha` (proxy da planilha de stands).

import { freshAccessToken } from "@/lib/supabase-access-token";
import type { Loja } from "@/lib/lojas/lojas";

type Resposta = { ok: true; lojas: Loja[]; doCache: boolean } | { ok: false; error: string };

export async function buscarPlanilhaLojas(): Promise<Loja[]> {
  const token = await freshAccessToken();
  const resposta = await fetch("/api/lojas-planilha", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await resposta.json().catch(() => null)) as Resposta | null;
  if (!resposta.ok || !payload || payload.ok === false) {
    throw new Error(
      payload && payload.ok === false && payload.error === "unauthorized"
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível ler a planilha de lojas.",
    );
  }
  return payload.lojas;
}
