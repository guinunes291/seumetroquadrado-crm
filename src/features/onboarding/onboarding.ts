// Onboarding do corretor no primeiro acesso — lógica PURA (sem React, sem
// banco) e a copy da trilha.
//
// Regras de abertura, conclusão e persistência do passo ficam aqui porque são
// testáveis. Nenhum número de conversão vive neste arquivo: o passo 4 e o
// passo 5 leem do banco (fila_funil_v1 e metas_dia_taxas). A única tabela com
// números fixos é a de origem do lead, safra medida de 6 meses, carimbada com
// a data — e está explicitamente marcada como tal.

export const ONBOARDING_TOTAL_PASSOS = 6;

/** Evento global para reabrir a trilha (menu "Como usar o CRM"). */
export const EVENTO_ABRIR_ONBOARDING = "open-onboarding";

export type OnboardingStatus = {
  concluido_em: string | null;
  origem: "onboarding" | "manual" | null;
  eh_corretor: boolean;
  tem_interacao: boolean;
};

/**
 * Abre sozinho apenas para quem tem o papel corretor e ainda não concluiu.
 * Gestão, admin e SDR nunca veem — mesmo que também sejam corretores? Sim,
 * veem: o papel corretor é o que define o trabalho de fila. O filtro é o
 * papel, não a ausência dos outros.
 */
export function deveAbrirSozinho(input: {
  status: OnboardingStatus | null | undefined;
  ehCorretor: boolean;
  fechadoNestaSessao: boolean;
}): boolean {
  if (!input.status) return false;
  if (!input.ehCorretor) return false;
  if (input.status.concluido_em) return false;
  return !input.fechadoNestaSessao;
}

/** O passo 6 só fecha com pelo menos uma interação registrada pelo corretor. */
export function podeConcluir(status: OnboardingStatus | null | undefined): boolean {
  return !!status && (status.tem_interacao || !!status.concluido_em);
}

// ---------------------------------------------------------------------------
// Progresso por dispositivo (conveniência). A CONCLUSÃO vive no banco.
// ---------------------------------------------------------------------------

export function chavePasso(uid: string): string {
  return `smq:onboarding:passo:${uid}`;
}

export function lerPasso(uid: string): number {
  try {
    const n = Number(localStorage.getItem(chavePasso(uid)));
    return Number.isFinite(n) && n >= 1 && n <= ONBOARDING_TOTAL_PASSOS ? Math.floor(n) : 1;
  } catch {
    return 1;
  }
}

export function gravarPasso(uid: string, passo: number): void {
  try {
    localStorage.setItem(chavePasso(uid), String(passo));
  } catch {
    /* modo privado: recomeça do passo 1 na próxima abertura */
  }
}

export function limparPasso(uid: string): void {
  try {
    localStorage.removeItem(chavePasso(uid));
  } catch {
    /* nada a fazer */
  }
}

// ---------------------------------------------------------------------------
// Copy da trilha
// ---------------------------------------------------------------------------

export const TELAS_QUE_IMPORTAM: Array<{
  tela: string;
  responde: string;
  quando: string;
  to: string;
}> = [
  {
    tela: "Fila Única",
    responde: "“o que eu faço agora?”",
    quando: "é a sua casa. O dia inteiro",
    to: "/fila",
  },
  {
    tela: "Follow-Up",
    responde: "“quem eu combinei de retomar?”",
    quando: "a régua dos 13 toques",
    to: "/follow-up",
  },
  {
    tela: "Agenda",
    responde: "“quais visitas eu tenho?”",
    quando: "de manhã e ao fechar o dia",
    to: "/agendamentos",
  },
  {
    tela: "Ficha do cliente",
    responde: "“quem é essa pessoa?”",
    quando: "antes de ligar",
    to: "/leads",
  },
  {
    tela: "Projetos em Foco",
    responde: "“o que eu vendo?”",
    quando: "primeira semana, e sempre que entrar produto novo",
    to: "/projetos-foco",
  },
];

export const BLOCOS_DO_DIA: Array<{ hora: string; bloco: string; oque: string }> = [
  { hora: "08:50", bloco: "Abrir", oque: "Presença → metas do dia → ler o placar da fila" },
  {
    hora: "09:00",
    bloco: "O dinheiro na mesa",
    oque: "Fundo do funil parado → chegaram agora → cliente respondeu",
  },
  { hora: "10:30", bloco: "A régua", oque: "Follow-up vencido ou de hoje → sem próximo passo" },
  {
    hora: "13:30",
    bloco: "Agendar",
    oque: "Esfriando → pasta travada → oferecer visita em toda conversa",
  },
  { hora: "15:30", bloco: "Anti-ociosidade", oque: "Reserva → Modo Foco → Discador → Bolsão" },
  { hora: "17:30", bloco: "Fechar", oque: "Os dois zeros: vencidos = 0, sem próximo passo = 0" },
];

/** Safra medida de 6 meses — não muda toda semana. A data vai na tela. */
export const ORIGEM_DA_VENDA_MEDICAO = "safra de 6 meses, medida em setembro de 2026";

export const ORIGEM_DA_VENDA: Array<{ origem: string; aCada: string; destaque?: boolean }> = [
  { origem: "Lead que você mesmo capta", aCada: "6 leads", destaque: true },
  { origem: "Indicação / carteira própria", aCada: "3 leads" },
  { origem: "Facebook", aCada: "413 leads" },
  { origem: "Base importada", aCada: "6.550 leads" },
];
