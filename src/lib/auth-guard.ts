import { redirect } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { verificarContaAtiva } from "@/lib/conta-ativa";

let lastPresenceMark = 0;
const PRESENCE_MARK_INTERVAL_MS = 60 * 60 * 1000;

function markPresenceSafely() {
  const now = Date.now();
  if (now - lastPresenceMark < PRESENCE_MARK_INTERVAL_MS) return;
  lastPresenceMark = now;

  void (async () => {
    try {
      const { error } = await supabase.rpc("marcar_presenca", { _presente: true });
      if (error) {
        lastPresenceMark = 0;
        console.warn("Não foi possível atualizar presença do corretor", error.message);
      }
    } catch (error) {
      lastPresenceMark = 0;
      console.warn("Não foi possível atualizar presença do corretor", error);
    }
  })();
}

/**
 * Guard da porta autenticada: o shell /_authenticated (que desde a identidade
 * Lançamento, 2026-10, também abriga o hub /inicio). Concentra sessão, conta
 * ativa e presença num lugar só — inclusive o throttle de presença, que é
 * deste módulo.
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

  // Auto check-in para liberar a distribuição automática de leads.
  markPresenceSafely();
  return { user: data.user };
}
