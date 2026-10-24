// Dados falsos do teste de caracterização das ações rápidas da Sami
// (tests/samiq-core-acoes-caracterizacao.test.ts): o lead em contexto e a
// inbox de atendimento com as 6 filas.

export const LEAD_ROW = {
  nome: "Maria Aparecida Silva",
  origem: "facebook",
  status: "em_atendimento",
  temperatura: "quente",
  projeto_nome: "Vibra Lapa",
  renda_informada: "4500",
  entrada_disponivel: null,
  usa_fgts: true,
  proximo_followup: null,
  ultima_interacao: "2026-10-20T10:00:00Z",
  visita_data: null,
  visita_hora: null,
  visita_empreendimento: null,
  tipo_renda: "clt",
  faixa_mcmv: "F2",
};

const itemFila = (n: number, nome: string, score: number) => ({
  lead: {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    nome,
    telefone: "11900000000",
    email: null,
    status: "aguardando_atendimento",
    temperatura: "morno",
    ultima_interacao: null,
    proximo_followup: null,
    projeto_nome: "Cury Interlagos",
    created_at: "2026-10-20T10:00:00Z",
    corretor_id: null,
    origem: "facebook",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
  },
  score,
  tier: "alta",
  motivo: "Chegou agora",
  docsPendentes: 0,
});
export const INBOX = [
  "novos",
  "responder",
  "followups",
  "esfriando",
  "confirmar_visita",
  "docs",
].map((fila) =>
  fila === "novos"
    ? {
        fila,
        total_count: 2,
        items: [itemFila(1, "Paulo Lima", 40), itemFila(2, "Rita Gomes", 90)],
      }
    : { fila, total_count: 0, items: [] },
);
