// Exclusivo de testes e da prévia local. Nunca importado pela rota /ranking.
import type { RankingSnapshot } from "../../src/features/ranking/ranking-campeonato";
export const NOMES_FICTICIOS = [
  "Mariana Costa",
  "Rafael Almeida",
  "Beatriz Santos",
  "Lucas Ferreira",
  "Camila Oliveira",
  "Gabriel Lima",
  "Juliana Ribeiro",
  "Thiago Rocha",
  "Fernanda Martins",
  "Bruno Carvalho",
  "Larissa Gomes",
  "Pedro Moreira",
  "Ana Paula de Albuquerque e Vasconcelos",
  "Diego Barbosa",
  "Isabela Nunes",
  "Felipe Araújo",
  "Renata Souza",
  "Gustavo Dias",
  "Patrícia Lopes",
  "Vinícius Castro",
  "Amanda Melo",
  "Ricardo Freitas",
  "Natália Cardoso",
  "André Teixeira",
  "Letícia Ramos",
  "Eduardo Mendes",
  "Vanessa Vieira",
  "Caio Fernandes",
  "Priscila Correia",
  "Daniel Batista",
];
export function fixtureRanking(): RankingSnapshot {
  const rows = NOMES_FICTICIOS.map((nome, i) => {
    const vendas = Math.max(0, 7 - Math.floor(i / 3));
    const vgv = vendas
      ? ([2480000, 2160000, 1940000][i] ?? Math.round((1850000 - i * 67000) / 1000) * 1000)
      : 0;
    return {
      corretor_id: `c${i}`,
      nome,
      foto: null,
      equipe_id: `e${i % 3}`,
      categoria: "corretor" as const,
      pontuacao: 60 * 2 + 100 * 1 + 8 * 20 + 4 * 50 + 2 * 100 + vendas * 1000,
      ligacoes: 60,
      whatsapps: 100,
      agendamentos: 8,
      visitas: 4,
      documentacoes: 2,
      vendas,
      vgv,
      leads: 30,
      alteracoes: 15,
    };
  });
  return {
    versao: 1,
    gerado_em: "2026-09-08T15:00:00Z",
    inicio: "2026-09-01",
    fim: "2026-09-30",
    escopo: "operacao",
    total_participantes: rows.length,
    rows,
    equipes: ["Horizonte", "Essência", "Prime"].map((nome, i) => ({
      id: `e${i}`,
      nome,
      gestor_id: `g${i}`,
      gestor_nome: ["Alexandre Barros", "Cristina Machado", "Marcelo Duarte"][i],
      gestor_foto: null,
    })),
    vendas: rows.flatMap((r) =>
      Array.from({ length: r.vendas }, (_, i) => ({
        id: `${r.corretor_id}-v${i}`,
        corretor_id: r.corretor_id,
        aprovado_em: `2026-09-${String(i + 2).padStart(2, "0")}T13:00:00Z`,
        dia: `2026-09-${String(i + 2).padStart(2, "0")}`,
        valor: r.vgv / r.vendas,
      })),
    ),
    metas: rows.map((r) => ({
      corretor_id: r.corretor_id,
      equipe_id: null,
      meta_vendas: 4,
      meta_visitas: 12,
      meta_leads_atendidos: 40,
      meta_gmv: 1100000,
    })),
    pesos: [
      { chave: "ligacao", pontos: 2, ativo: true },
      { chave: "whatsapp", pontos: 1, ativo: true },
      { chave: "agendamento", pontos: 20, ativo: true },
      { chave: "visita", pontos: 50, ativo: true },
      { chave: "documentacao", pontos: 100, ativo: true },
      { chave: "venda", pontos: 1000, ativo: true },
    ],
    coortes: rows.map((r) => ({
      corretor_id: r.corretor_id,
      leads: 30,
      convertidos: Math.min(r.vendas, 5),
    })),
    coortes_desde: "2026-06-01",
    calendario: { dias_uteis: [1, 2, 3, 4, 5, 6], feriados: [] },
  };
}
