// Cliente da rota `/api/mercado-planilha` (proxy da planilha de mercado).

import { freshAccessToken } from "@/lib/supabase-access-token";
import type { PlanilhaEmpreendimento } from "@/lib/vitrine/planilha-mercado";

type Resposta =
  | { ok: true; empreendimentos: PlanilhaEmpreendimento[]; doCache: boolean }
  | { ok: false; error: string };

export async function buscarPlanilhaMercado(): Promise<PlanilhaEmpreendimento[]> {
  const token = await freshAccessToken();
  const resposta = await fetch("/api/mercado-planilha", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await resposta.json().catch(() => null)) as Resposta | null;
  if (!resposta.ok || !payload || payload.ok === false) {
    throw new Error(
      payload && payload.ok === false && payload.error === "unauthorized"
        ? "Sua sessão expirou. Entre novamente."
        : "Não foi possível ler a planilha de mercado.",
    );
  }
  return payload.empreendimentos;
}
