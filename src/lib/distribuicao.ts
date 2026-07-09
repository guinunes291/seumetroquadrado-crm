// Distribuição v3 — lógica pura e vocabulário (labels pt-BR).
//
// Este módulo espelha, de forma testável, as regras que vivem no banco
// (migrations distribuicao_v3_*): cálculo do % trabalhado, resolução de
// roleta por origem/canal, ordem do rodízio e janela de funcionamento.
// A DECISÃO real é sempre do motor SQL (_distribuir_lead_v3) — aqui é a
// mesma régua para exibição, ordenação e testes, nunca uma segunda fonte
// de verdade para atribuir lead.

import type { Database } from "@/integrations/supabase/types";

export type LeadOrigem = Database["public"]["Enums"]["lead_origem"];

export type RoletaSlug = "plantao" | "marquinhos" | "landing";

export const ROLETA_LABEL: Record<RoletaSlug, string> = {
  plantao: "Roleta Plantão",
  marquinhos: "Roleta Marquinhos",
  landing: "Roleta Landing Page",
};

export function roletaLabel(slug: string | null | undefined): string {
  if (!slug) return "—";
  return ROLETA_LABEL[slug as RoletaSlug] ?? slug;
}

// ---------------------------------------------------------------------------
// Motivos de inaptidão (mesmos códigos emitidos por _elegibilidade_roleta)
// ---------------------------------------------------------------------------
export type MotivoInaptidao =
  | "nao_participante"
  | "participacao_inativa"
  | "pausado"
  | "perfil_inativo"
  | "sem_role_corretor"
  | "sem_telefone"
  | "ausente_hoje"
  | "cota_diaria_atingida"
  | "pct_trabalhado_abaixo_minimo";

export const MOTIVO_INAPTIDAO_LABEL: Record<MotivoInaptidao, string> = {
  nao_participante: "Não participa da roleta",
  participacao_inativa: "Desativado na roleta",
  pausado: "Pausado temporariamente",
  perfil_inativo: "Perfil inativo no CRM",
  sem_role_corretor: "Sem papel de corretor",
  sem_telefone: "Sem telefone cadastrado",
  ausente_hoje: "Ausente no plantão hoje",
  cota_diaria_atingida: "Cota diária de leads atingida",
  pct_trabalhado_abaixo_minimo: "% de leads trabalhados abaixo do mínimo",
};

export function motivoInaptidaoLabel(motivo: string): string {
  return MOTIVO_INAPTIDAO_LABEL[motivo as MotivoInaptidao] ?? motivo;
}

// ---------------------------------------------------------------------------
// Motivos de exceção (mesmos códigos de distribuicao_excecoes.motivo)
// ---------------------------------------------------------------------------
export type MotivoExcecao =
  | "sem_corretor_ativo"
  | "sem_corretor_elegivel"
  | "duplicado_incerto"
  | "origem_nao_mapeada"
  | "falha_tecnica"
  | "corretor_anterior_inativo"
  | "dados_incompletos";

export const MOTIVO_EXCECAO_LABEL: Record<MotivoExcecao, string> = {
  sem_corretor_ativo: "Nenhum corretor ativo na roleta",
  sem_corretor_elegivel: "Nenhum corretor apto no momento",
  duplicado_incerto: "Lead duplicado sem regra clara",
  origem_nao_mapeada: "Origem sem roleta vinculada",
  falha_tecnica: "Falha técnica na distribuição",
  corretor_anterior_inativo: "Corretor anterior inativo",
  dados_incompletos: "Lead sem dados mínimos",
};

export function motivoExcecaoLabel(motivo: string): string {
  return MOTIVO_EXCECAO_LABEL[motivo as MotivoExcecao] ?? motivo;
}

export const EXCECAO_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

// ---------------------------------------------------------------------------
// Auditoria de participação
// ---------------------------------------------------------------------------
export const ACAO_PARTICIPANTE_LABEL: Record<string, string> = {
  incluido: "Incluído",
  removido: "Removido",
  pausado: "Pausado",
  reativado: "Reativado",
  limite_alterado: "Limite alterado",
};

// ---------------------------------------------------------------------------
// Log de decisão
// ---------------------------------------------------------------------------
export const RESULTADO_LABEL: Record<string, string> = {
  sucesso: "Distribuído",
  sem_corretor: "Sem corretor",
  erro: "Erro",
  excecao: "Exceção",
};

export const GATILHO_LABEL: Record<string, string> = {
  webhook: "Webhook (chatbot)",
  webhook_landing: "Webhook (landing page)",
  edge_facebook: "Facebook Ads",
  cron: "Rotina automática",
  manual: "Manual",
  sla_webhook: "Repasse por SLA",
  sla_webhook_imediato: "Repasse por SLA (imediato)",
  lead_parado: "Redistribuição de parado",
  lead_perdido: "Repasse após perda",
  excecao_reprocesso: "Reprocessamento de exceção",
  excecao_manual: "Exceção — atribuição manual",
  excecao_roleta_forcada: "Exceção — roleta escolhida",
  excecao_corrigir_origem: "Exceção — origem corrigida",
  reprocesso: "Reprocessamento",
  teste: "Teste",
};

export function gatilhoLabel(gatilho: string | null | undefined): string {
  if (!gatilho) return "—";
  return GATILHO_LABEL[gatilho] ?? gatilho;
}

// ---------------------------------------------------------------------------
// % trabalhado — mesma fórmula de _elegibilidade_roleta:
//   pct = 100 × (carteira − aguardando) / carteira  · carteira 0 → 100
// ---------------------------------------------------------------------------
export function calcPctTrabalhado(carteiraTotal: number, aguardando: number): number {
  if (carteiraTotal <= 0) return 100;
  const pct = (100 * (carteiraTotal - aguardando)) / carteiraTotal;
  return Math.round(pct * 10) / 10;
}

// ---------------------------------------------------------------------------
// Resolução origem/canal → roleta (mesma regra de _resolver_roleta_lead):
// canal 'webhook_landing' tem precedência; senão vale o mapa configurável.
// ---------------------------------------------------------------------------
export function resolverRoletaPorOrigem(
  origem: string,
  canalEntrada: string | null,
  mapa: Partial<Record<string, string | null>>,
): RoletaSlug | null {
  if (canalEntrada === "webhook_landing") return "landing";
  const slug = mapa[origem];
  return (slug as RoletaSlug | null | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Rodízio: próximo da vez = apto há mais tempo sem receber (NULLS FIRST),
// desempate por inclusão mais antiga. Dados vêm do SERVIDOR
// (elegibilidade_roleta) — nunca do relógio do navegador.
// ---------------------------------------------------------------------------
export interface ParticipanteRodizio {
  corretor_id: string;
  apto: boolean;
  ultimo_lead_em: string | null;
  incluido_em?: string | null;
}

export function proximoDaVez<T extends ParticipanteRodizio>(participantes: T[]): T | null {
  const aptos = participantes.filter((p) => p.apto);
  if (aptos.length === 0) return null;
  const sorted = [...aptos].sort((a, b) => {
    if (a.ultimo_lead_em === null && b.ultimo_lead_em !== null) return -1;
    if (a.ultimo_lead_em !== null && b.ultimo_lead_em === null) return 1;
    if (a.ultimo_lead_em !== b.ultimo_lead_em) {
      return (a.ultimo_lead_em ?? "") < (b.ultimo_lead_em ?? "") ? -1 : 1;
    }
    return (a.incluido_em ?? "") < (b.incluido_em ?? "") ? -1 : 1;
  });
  return sorted[0] ?? null;
}

// ---------------------------------------------------------------------------
// Janela de funcionamento (horários em "HH:MM" ou "HH:MM:SS", relógio BRT
// vindo do servidor). Janela atravessando a meia-noite é suportada
// (ex.: 20:00 → 02:00).
// ---------------------------------------------------------------------------
function toMinutos(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export function dentroDoHorario(
  inicio: string | null,
  fim: string | null,
  agoraHHMM: string,
): boolean {
  if (!inicio || !fim) return true; // sem janela = 24h
  const a = toMinutos(agoraHHMM);
  const i = toMinutos(inicio);
  const f = toMinutos(fim);
  if (i <= f) return a >= i && a <= f;
  return a >= i || a <= f; // janela overnight
}

// ---------------------------------------------------------------------------
// Participação percentual (aba Landing): fatia de cada corretor no volume.
// ---------------------------------------------------------------------------
export function participacaoPercentual(recebidos: number, totalRoleta: number): number {
  if (totalRoleta <= 0) return 0;
  return Math.round((1000 * recebidos) / totalRoleta) / 10;
}

// ---------------------------------------------------------------------------
// Contexto da decisão (distribuicao_log_contexto.contexto) → estrutura de
// exibição para o dialog "por que este corretor?".
// ---------------------------------------------------------------------------
export interface DecisaoContexto {
  roleta: string | null;
  gatilho: string | null;
  regra: string | null;
  percentualMinimo: number | null;
  aptos: Array<{ corretor_id: string; nome: string; ultimo_lead_em: string | null }>;
  inaptos: Array<{
    corretor_id: string;
    nome: string;
    motivos: string[];
    pct_trabalhado?: number;
    recebidos_hoje?: number;
    limite_diario?: number;
  }>;
  vencedor: { corretor_id: string; nome: string } | null;
  corretorAnterior: { corretor_id: string; ativo: boolean; politica?: string } | null;
  duplicadoId: string | null;
}

export function resumoDecisao(contexto: unknown): DecisaoContexto {
  const c = (contexto ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const obj = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const vencedor = obj(c.vencedor);
  const anterior = obj(c.corretor_anterior);
  const dedup = obj(c.dedup);

  return {
    roleta: typeof c.roleta === "string" ? c.roleta : null,
    gatilho: typeof c.gatilho === "string" ? c.gatilho : null,
    regra: typeof c.regra === "string" ? c.regra : null,
    percentualMinimo: typeof c.percentual_minimo === "number" ? c.percentual_minimo : null,
    aptos: arr(c.aptos) as DecisaoContexto["aptos"],
    inaptos: arr(c.inaptos) as DecisaoContexto["inaptos"],
    vencedor: vencedor
      ? { corretor_id: String(vencedor.corretor_id ?? ""), nome: String(vencedor.nome ?? "") }
      : null,
    corretorAnterior: anterior
      ? {
          corretor_id: String(anterior.corretor_id ?? ""),
          ativo: Boolean(anterior.ativo),
          politica: typeof anterior.politica === "string" ? anterior.politica : undefined,
        }
      : null,
    duplicadoId:
      dedup && typeof dedup.duplicado_id === "string" ? (dedup.duplicado_id as string) : null,
  };
}
