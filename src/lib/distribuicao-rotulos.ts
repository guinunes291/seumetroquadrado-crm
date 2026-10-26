// Distribuição — vocabulário (labels pt-BR) dos códigos que o banco emite:
// motivos de inaptidão e de exceção, status, auditoria, resultado e gatilho.
// Recortado de distribuicao.ts sem mudança de comportamento.

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
  | "pct_trabalhado_abaixo_minimo"
  | "sem_modelo_contrato"
  | "onboarding_pendente"
  | "conflito_agenda"
  | "regra_65_sem_vaga"
  | "roleta_desativada"
  | "fora_da_regiao"
  | "sem_zona_no_perfil"
  | "vez_em_outra_zona";

export const MOTIVO_INAPTIDAO_LABEL: Record<MotivoInaptidao, string> = {
  nao_participante: "Não participa da roleta",
  participacao_inativa: "Desativado na roleta",
  pausado: "Pausado temporariamente",
  perfil_inativo: "Perfil inativo no CRM",
  sem_role_corretor: "Sem papel de corretor",
  sem_telefone: "Sem telefone cadastrado",
  // Desde a presença por filial (2026-10-13), "presente" = check-in que libera
  // a roleta: filial, ou em casa com o mínimo de vendas do mês anterior.
  ausente_hoje: "Sem check-in que libere a roleta hoje",
  cota_diaria_atingida: "Cota diária de leads atingida",
  pct_trabalhado_abaixo_minimo: "% de leads trabalhados abaixo do mínimo",
  sem_modelo_contrato: "Sem modelo de contrato definido",
  onboarding_pendente: "Onboarding não concluído",
  conflito_agenda: "Conflito de agenda no horário da visita",
  regra_65_sem_vaga: "Em atendimento no teto (regra dos 65)",
  roleta_desativada: "Roleta desligada",
  // Fila por zona (2026-10-15): a roleta só sorteia quem atende a zona.
  fora_da_regiao: "Não atende esta zona",
  sem_zona_no_perfil: "Sem zona no perfil (a gestão define a filial)",
  // A vez é uma só (2026-10-17): é o 1º da fila de outra zona — ou, desde as
  // roletas por filial (12/10), de outra filial.
  vez_em_outra_zona: "A vez agora é em outra zona ou filial",
};

export function motivoInaptidaoLabel(motivo: string): string {
  // Código dinâmico do disjuntor do v2: disjuntor_wip_<N leads ativos>.
  if (motivo.startsWith("disjuntor_wip_")) {
    const n = motivo.slice("disjuntor_wip_".length);
    return `Teto de leads ativos atingido (${n} no funil)`;
  }
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
  | "dados_incompletos"
  | "sem_corretor_na_zona"
  | "zona_sem_time"
  | "zona_sem_roleta";

export const MOTIVO_EXCECAO_LABEL: Record<MotivoExcecao, string> = {
  sem_corretor_ativo: "Nenhum corretor ativo na roleta",
  sem_corretor_elegivel: "Nenhum corretor apto no momento",
  duplicado_incerto: "Lead duplicado sem regra clara",
  origem_nao_mapeada: "Origem sem roleta vinculada",
  falha_tecnica: "Falha técnica na distribuição",
  corretor_anterior_inativo: "Corretor anterior inativo",
  dados_incompletos: "Lead sem dados mínimos",
  // Roletas por filial (12/10/2026): o time da zona é a(s) filial(is) que a atendem.
  sem_corretor_na_zona: "Esperando a filial da zona (ninguém da filial apto agora)",
  zona_sem_time: "Zona sem time na filial",
  zona_sem_roleta: "Zona sem roleta de filial",
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
  campanha_zona: "Campanha → roleta da filial da zona",
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
  manual_roleta: "Roleta manual (lista de leads)",
  manual_criacao: "Criação manual de lead",
  reprocesso: "Reprocessamento",
  teste: "Teste",
};

export function gatilhoLabel(gatilho: string | null | undefined): string {
  if (!gatilho) return "—";
  return GATILHO_LABEL[gatilho] ?? gatilho;
}
