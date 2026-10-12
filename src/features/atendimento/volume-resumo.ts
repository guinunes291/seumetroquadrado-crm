// Os três números do topo do modo Volume de Atender (padrão Lançamento, Fase 2,
// 12/10/2026): na carteira · com SLA estourado · sem contato há 5+ dias.
// Lógica pura, contada da fila que o Volume JÁ carrega (["blitz-queue"]) e do
// leads_com_sla (["blitz-sla"]) — nenhuma consulta nova.

import { diasDesde } from "@/lib/priority";

/** "Sem contato há 5+ dias": o terceiro número do topo. */
export const DIAS_SEM_CONTATO = 5;

type LeadDoVolume = {
  id: string;
  ultima_interacao: string | null;
  ultimo_contato: string | null;
  created_at: string;
};

type SlaDoLead = { sla_status: string; minutos_decorridos: number };

function maisRecente(...isos: (string | null | undefined)[]): string | null {
  let melhor: string | null = null;
  let melhorT = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t > melhorT) {
      melhorT = t;
      melhor = iso;
    }
  }
  return melhor;
}

/** O toque mais recente (interação ou contato registrado) — o mesmo relógio
 *  da Higiene do Funil e da Fila Única; sem toque, null. */
export function ultimoToque(
  lead: Pick<LeadDoVolume, "ultima_interacao" | "ultimo_contato">,
): string | null {
  return maisRecente(lead.ultima_interacao, lead.ultimo_contato);
}

export type ResumoDoVolume = {
  naCarteira: number;
  slaEstourado: number;
  /** Minutos decorridos do SLA estourado mais antigo; null sem nenhum. */
  slaMaisAntigoMin: number | null;
  semContato: number;
  /** Dias sem contato do mais parado entre os 5+; null sem nenhum. */
  semContatoMaisAntigoDias: number | null;
};

/**
 * Os três números do topo do Volume. "SLA estourado" só conta leads da fila
 * (o leads_com_sla pode trazer outros). "Sem contato" usa o relógio da
 * Higiene do Funil: o toque mais recente (ultima_interacao/ultimo_contato) e,
 * sem toque nenhum, a chegada do lead.
 */
export function resumoDoVolume(
  fila: LeadDoVolume[],
  slaPorLead: Map<string, SlaDoLead>,
  agora: Date,
): ResumoDoVolume {
  let slaEstourado = 0;
  let slaMaisAntigoMin: number | null = null;
  let semContato = 0;
  let semContatoMaisAntigoDias: number | null = null;
  for (const lead of fila) {
    const sla = slaPorLead.get(lead.id);
    if (sla?.sla_status === "estourado") {
      slaEstourado++;
      if (slaMaisAntigoMin === null || sla.minutos_decorridos > slaMaisAntigoMin)
        slaMaisAntigoMin = sla.minutos_decorridos;
    }
    const dias = diasDesde(ultimoToque(lead) ?? lead.created_at, agora);
    if (dias !== null && dias >= DIAS_SEM_CONTATO) {
      semContato++;
      if (semContatoMaisAntigoDias === null || dias > semContatoMaisAntigoDias)
        semContatoMaisAntigoDias = dias;
    }
  }
  return {
    naCarteira: fila.length,
    slaEstourado,
    slaMaisAntigoMin,
    semContato,
    semContatoMaisAntigoDias,
  };
}
