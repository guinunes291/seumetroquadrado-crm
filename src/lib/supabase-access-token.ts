// Token de acesso fresco para chamar as rotas de servidor do próprio app.
//
// As rotas `/api/*` autenticam por `Authorization: Bearer <access_token>` do
// Supabase. Um token a poucos segundos do vencimento chega expirado no servidor,
// então renovamos antes de mandar — é o que evita o "sua sessão expirou"
// fantasma no meio de uma ação que o corretor acabou de disparar.

import { supabase } from "@/integrations/supabase/client";

/** Margem de segurança: renova quando falta menos de 1 min para expirar. */
const MARGEM_SEGUNDOS = 60;

export class SessaoExpiradaError extends Error {
  constructor() {
    super("Sua sessão expirou. Entre novamente.");
    this.name = "SessaoExpiradaError";
  }
}

export async function freshAccessToken(): Promise<string> {
  const atual = await supabase.auth.getSession();
  let session = atual.data.session;
  if (atual.error || !session) throw new SessaoExpiradaError();

  if ((session.expires_at ?? 0) - Math.floor(Date.now() / 1_000) <= MARGEM_SEGUNDOS) {
    const renovada = await supabase.auth.refreshSession();
    if (renovada.error || !renovada.data.session) throw new SessaoExpiradaError();
    session = renovada.data.session;
  }
  return session.access_token;
}
