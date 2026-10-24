// Quadro Kanban — colunas recolhidas (preferência de layout persistida).
// Recortado de src/components/leads-kanban-board.tsx sem mudança de comportamento.

import { useState } from "react";
import { FUNNEL_STAGES, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";

// Colunas recolhidas são preferência de layout do usuário (não estado do
// funil) — persistem entre sessões no localStorage.
const CHAVE_COLAPSADAS = "smq:kanban-colapsadas";
function lerColapsadas(): Set<LeadStatus> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CHAVE_COLAPSADAS) ?? "[]");
    if (!Array.isArray(raw)) return new Set();
    // Filtra lixo/etapas antigas — um rename de etapa não pode quebrar o board.
    return new Set(
      raw.filter(
        (s): s is LeadStatus =>
          typeof s === "string" && (FUNNEL_STAGES as readonly string[]).includes(s),
      ),
    );
  } catch {
    return new Set();
  }
}

export function useColunasRecolhidas(setAnnouncement: (texto: string) => void) {
  const [colapsadas, setColapsadas] = useState<Set<LeadStatus>>(lerColapsadas);
  const toggleColapso = (id: LeadStatus) => {
    setColapsadas((atual) => {
      const next = new Set(atual);
      const recolhendo = !next.has(id);
      if (recolhendo) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(CHAVE_COLAPSADAS, JSON.stringify([...next]));
      } catch {
        /* storage indisponível (modo privado/quota) — a preferência só não persiste */
      }
      setAnnouncement(`Coluna ${LEAD_STATUS_LABEL[id]} ${recolhendo ? "recolhida" : "expandida"}.`);
      return next;
    });
  };
  return { colapsadas, toggleColapso };
}
