// Sessão do usuário: o único acesso ao Supabase Auth da barra lateral.
// Recortado de src/components/app-sidebar.tsx sem mudança de comportamento.

import { supabase } from "@/integrations/supabase/client";

/** Encerra a sessão; quem chama decide para onde vai depois. */
export async function encerrarSessao() {
  await supabase.auth.signOut();
}
