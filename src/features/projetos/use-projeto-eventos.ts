// Eventos da prateleira — o que o corretor faz com o produto (abre book/tabela,
// copia resumo, envia ao lead, põe na sacola, reporta erro). Fonte das
// métricas da decisão 28 (docs/revisao-projetos-foco.md).
//
// Registro best-effort: nunca trava a ação do corretor e nunca mostra erro. Sem
// a migration 20260902120000 aplicada, a tabela não existe e o insert falha em
// silêncio (isMissingBackendObject); qualquer outro erro vai só para o console.

import { useCallback } from "react";
import { supabasePendente, type ProjetoEventoTipo } from "@/integrations/supabase/pendentes";
import { useAuth } from "@/hooks/use-auth";
import { isMissingBackendObject } from "@/lib/supabase-errors";

export type { ProjetoEventoTipo };

export type EventoProjeto = {
  tipo: ProjetoEventoTipo;
  projetoId: string;
  leadId?: string | null;
  detalhe?: string | null;
  origem?: string;
};

export function useRegistrarEventoProjeto() {
  const { user } = useAuth();
  return useCallback(
    (evento: EventoProjeto) => {
      if (!user) return;
      void supabasePendente
        .from("projeto_eventos")
        .insert({
          projeto_id: evento.projetoId,
          lead_id: evento.leadId ?? null,
          user_id: user.id,
          tipo: evento.tipo,
          origem: evento.origem ?? "prateleira",
          detalhe: evento.detalhe?.slice(0, 500) ?? null,
        })
        .then(({ error }) => {
          if (error && !isMissingBackendObject(error)) {
            console.warn("[prateleira] evento não registrado:", error.message);
          }
        });
    },
    [user],
  );
}
