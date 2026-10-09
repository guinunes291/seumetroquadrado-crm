import { redirect } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { verificarContaAtiva } from "@/lib/conta-ativa";

/**
 * Guard da porta autenticada: o shell /_authenticated (que desde a identidade
 * Lançamento, 2026-10, também abriga o hub /inicio). Concentra sessão e conta
 * ativa num lugar só.
 *
 * Presença NÃO é mais marcada aqui (2026-10-13). O auto check-in a cada login
 * colocava na roleta quem abrisse o CRM de casa, sem dizer onde estava. Agora
 * o corretor faz o check-in na filial (ou em casa) em /presenca — a faixa do
 * topo do shell avisa enquanto ele não fizer — e o banco aplica a regra do
 * plantão (menos de 3 vendas no mês anterior: só na filial). Ver
 * docs/ops/presenca-filiais.md.
 */
export async function guardarRotaAutenticada(locationHref: string): Promise<{ user: User }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw redirect({ to: "/auth", search: { next: locationHref } });
  }

  // Verifica o estado da conta distinguindo NEGAÇÃO REAL (conta inativa/
  // bloqueada) de FALHA DE INFRAESTRUTURA (RPC ausente/PGRST202, timeout,
  // 5xx, rede). Só a negação real encerra a sessão — decisão centralizada
  // e testada em verificarContaAtiva (tests/auth-guard.test.ts).
  const resultado = await verificarContaAtiva(async () => {
    const res = await supabase.rpc("conta_atual_ativa");
    return { data: res.data as boolean | null, error: res.error };
  });

  if (resultado === "inativa") {
    // Resposta definitiva do banco: conta inativa/bloqueada. Encerra apenas a
    // sessão LOCAL (escopo local não revoga os outros dispositivos) e redireciona.
    await supabase.auth.signOut({ scope: "local" });
    throw redirect({ to: "/auth", search: { next: "", motivo: "inativa" } });
  }

  if (resultado === "indisponivel") {
    // Indisponibilidade do RPC: não desloga. Segue com a sessão atual; a RLS
    // barra o acesso a dados caso a conta não esteja realmente ativa.
    console.warn(
      "conta_atual_ativa indisponível; seguindo com a sessão (RLS permanece como barreira)",
    );
  }

  return { user: data.user };
}
