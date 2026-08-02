import { describe, expect, it } from "vitest";
import {
  gargaloPrincipal,
  impactoDoGap,
  montarRelatorioRaioX,
  planoDeAcao,
  pontoForte,
  tendenciaSerie,
  totaisDaSerie,
  type RaioXRelatorioInput,
} from "@/features/inteligencia/raio-x-relatorio";
import { montarHtmlRaioX } from "@/features/inteligencia/raio-x-pdf";
import type { PerformanceDrillRow } from "@/features/inteligencia/queries";
import type { PassagemComparada } from "@/features/inteligencia/raio-x-derive";

const mes = (p: Partial<PerformanceDrillRow> & { mes: string }): PerformanceDrillRow => ({
  leads_recebidos: 0,
  interacoes: 0,
  contatos: 0,
  agendamentos_criados: 0,
  visitas_realizadas: 0,
  no_shows: 0,
  analises: 0,
  tarefas_concluidas: 0,
  vendas: 0,
  vgv: 0,
  primeira_resposta_p50_min: null,
  atualizado_em: null,
  ...p,
});

const passagem = (p: Partial<PassagemComparada> & { etapa: string }): PassagemComparada => ({
  minhaTaxa: null,
  taxaTime: null,
  gapPp: null,
  ...p,
});

const inputBase = (over: Partial<RaioXRelatorioInput> = {}): RaioXRelatorioInput => ({
  nome: "Ana Souza",
  periodoLabel: "6 meses",
  de: "2026-02-01",
  ate: null,
  geradoEm: new Date("2026-07-15T12:00:00Z"),
  geradoPor: "Gestor",
  presente: true,
  cargaAtiva: 40,
  capacidadePct: 80,
  sinal: null,
  comparacoes: [],
  funil: [],
  funilIndisponivel: false,
  coorte: null,
  coberturaMinima: 60,
  serie: [],
  trimestres: [],
  carteira: [],
  excecoes: [],
  perdas: [],
  comissoes: { pago: 0, aberto: 0 },
  meta: null,
  atualizadoEm: null,
  ...over,
});

describe("gargaloPrincipal / pontoForte", () => {
  const funil = [
    passagem({ etapa: "Atendidos", minhaTaxa: 80, taxaTime: 82, gapPp: -2 }),
    passagem({ etapa: "Visitaram", minhaTaxa: 20, taxaTime: 35, gapPp: -15 }),
    passagem({ etapa: "Vendas", minhaTaxa: 30, taxaTime: 20, gapPp: 10 }),
  ];

  it("elege o gap negativo mais fundo", () => {
    expect(gargaloPrincipal(funil)?.etapa).toBe("Visitaram");
  });

  it("ignora gaps pequenos (ruído) nos dois sentidos", () => {
    const raso = [passagem({ etapa: "Atendidos", minhaTaxa: 80, taxaTime: 82, gapPp: -2 })];
    expect(gargaloPrincipal(raso)).toBeNull();
    expect(pontoForte(raso)).toBeNull();
  });

  it("elege o maior gap positivo como ponto forte", () => {
    expect(pontoForte(funil)?.etapa).toBe("Vendas");
  });
});

describe("totaisDaSerie", () => {
  it("soma o período e deriva ticket médio e conversão", () => {
    const t = totaisDaSerie([
      mes({ mes: "2026-05-01", leads_recebidos: 50, vendas: 1, vgv: 300000, no_shows: 2 }),
      mes({ mes: "2026-06-01", leads_recebidos: 50, vendas: 3, vgv: 900000 }),
    ]);
    expect(t.leads).toBe(100);
    expect(t.vendas).toBe(4);
    expect(t.vgv).toBe(1_200_000);
    expect(t.ticketMedio).toBe(300000);
    expect(t.conversaoPct).toBe(4);
    expect(t.noShows).toBe(2);
  });

  it("não inventa ticket médio sem vendas", () => {
    expect(totaisDaSerie([mes({ mes: "2026-06-01", leads_recebidos: 10 })]).ticketMedio).toBeNull();
  });
});

describe("tendenciaSerie", () => {
  it("exige 4 meses para opinar sobre trajetória", () => {
    expect(tendenciaSerie([mes({ mes: "2026-06-01" }), mes({ mes: "2026-07-01" })])).toBeNull();
  });

  it("detecta queda comparando as metades por média mensal", () => {
    const t = tendenciaSerie([
      mes({ mes: "2026-03-01", vendas: 4 }),
      mes({ mes: "2026-04-01", vendas: 4 }),
      mes({ mes: "2026-05-01", vendas: 1 }),
      mes({ mes: "2026-06-01", vendas: 1 }),
    ]);
    expect(t?.direcao).toBe("caindo");
    expect(t?.deltaVendasPct).toBe(-75);
  });

  it("detecta alta", () => {
    const t = tendenciaSerie([
      mes({ mes: "2026-03-01", vendas: 1 }),
      mes({ mes: "2026-04-01", vendas: 1 }),
      mes({ mes: "2026-05-01", vendas: 3 }),
      mes({ mes: "2026-06-01", vendas: 3 }),
    ]);
    expect(t?.direcao).toBe("subindo");
  });
});

describe("impactoDoGap", () => {
  it("projeta o ganho de levar a etapa travada ao patamar do time", () => {
    const g = passagem({ etapa: "Visitaram", minhaTaxa: 20, taxaTime: 30, gapPp: -10 });
    const i = impactoDoGap(g, 4, 300000);
    // 4 vendas * (30/20) = 6 → +2 vendas, ~R$ 600 mil.
    expect(i?.vendasExtras).toBe(2);
    expect(i?.vgvExtra).toBe(600000);
  });

  it("não projeta sem base (taxa zero, sem venda ou sem gargalo)", () => {
    expect(impactoDoGap(null, 4, 300000)).toBeNull();
    expect(
      impactoDoGap(passagem({ etapa: "X", minhaTaxa: 0, taxaTime: 30, gapPp: -30 }), 4, 300000),
    ).toBeNull();
    expect(
      impactoDoGap(passagem({ etapa: "X", minhaTaxa: 10, taxaTime: 30, gapPp: -20 }), 0, 300000),
    ).toBeNull();
  });

  it("omite o VGV quando não há ticket médio", () => {
    const i = impactoDoGap(passagem({ etapa: "X", minhaTaxa: 20, taxaTime: 30 }), 4, null);
    expect(i?.vendasExtras).toBe(2);
    expect(i?.vgvExtra).toBeNull();
  });
});

describe("planoDeAcao", () => {
  const ctxVazio = {
    totais: totaisDaSerie([]),
    gargalo: null,
    impacto: null,
    tendencia: null,
    paradosNaCarteira: 0,
  };

  it("prioriza o gargalo do funil e limita a 4 ações", () => {
    const gargalo = passagem({ etapa: "Visitaram", minhaTaxa: 20, taxaTime: 35, gapPp: -15 });
    const acoes = planoDeAcao(
      inputBase({
        excecoes: [{ tipo: "sla_estourado", tipoLabel: "SLA estourado", leadNome: "João" }],
        perdas: [
          {
            categoria: "sem_contato",
            quantidade: 9,
            vgv_estimado: 500000,
            atualizado_em: null,
            label: "Sumiu",
          },
        ],
      }),
      {
        ...ctxVazio,
        gargalo,
        impacto: impactoDoGap(gargalo, 4, 300000),
        paradosNaCarteira: 12,
        tendencia: {
          recentes: { meses: 2, vendas: 1, vgv: 1 },
          anteriores: { meses: 2, vendas: 4, vgv: 4 },
          deltaVendasPct: -75,
          direcao: "caindo",
        },
      },
    );
    expect(acoes).toHaveLength(4);
    expect(acoes[0].titulo).toContain("Visitaram");
    expect(acoes.map((a) => a.prioridade)).toEqual([1, 2, 3, 4]);
  });

  it("nunca devolve plano vazio", () => {
    const acoes = planoDeAcao(inputBase(), ctxVazio);
    expect(acoes).toHaveLength(1);
    expect(acoes[0].prioridade).toBe(1);
  });
});

describe("montarRelatorioRaioX", () => {
  it("descarta as taxas do funil quando a coorte não tem cobertura", () => {
    const r = montarRelatorioRaioX(
      inputBase({
        funilIndisponivel: true,
        funil: [passagem({ etapa: "Visitaram", minhaTaxa: 20, taxaTime: 35, gapPp: -15 })],
      }),
    );
    expect(r.gargalo).toBeNull();
    expect(r.impacto).toBeNull();
    expect(r.leituras.some((l) => l.titulo.includes("sem base confiável"))).toBe(true);
  });

  it("consolida totais, parados e leituras do período", () => {
    const r = montarRelatorioRaioX(
      inputBase({
        serie: [
          mes({ mes: "2026-05-01", leads_recebidos: 40, vendas: 2, vgv: 600000 }),
          mes({ mes: "2026-06-01", leads_recebidos: 40, vendas: 2, vgv: 600000 }),
        ],
        carteira: [
          { etapa: "novo", label: "Novo", quantidade: 10, parados: 4, vgv: null },
          { etapa: "visita", label: "Visita", quantidade: 6, parados: 1, vgv: null },
        ],
      }),
    );
    expect(r.totais.vendas).toBe(4);
    expect(r.paradosNaCarteira).toBe(5);
    expect(r.leituras.length).toBeGreaterThan(0);
    expect(r.acoes.length).toBeGreaterThan(0);
  });
});

describe("montarHtmlRaioX", () => {
  const relatorio = montarRelatorioRaioX(
    inputBase({
      nome: 'Ana "A" <Souza>',
      funil: [
        passagem({ etapa: "Atendidos", minhaTaxa: 80, taxaTime: 82, gapPp: -2 }),
        passagem({ etapa: "Visitaram", minhaTaxa: 20, taxaTime: 35, gapPp: -15 }),
      ],
      serie: [
        mes({ mes: "2026-05-01", leads_recebidos: 40, vendas: 2, vgv: 600000, no_shows: 1 }),
        mes({ mes: "2026-06-01", leads_recebidos: 40, vendas: 2, vgv: 600000 }),
      ],
      carteira: [{ etapa: "novo", label: "Novo", quantidade: 10, parados: 4, vgv: null }],
      perdas: [
        {
          categoria: "sem_contato",
          quantidade: 5,
          vgv_estimado: 400000,
          atualizado_em: null,
          label: "Sumiu",
        },
      ],
      comissoes: { pago: 12000, aberto: 3000 },
    }),
  );
  const html = montarHtmlRaioX(relatorio);

  it("gera um documento completo com todas as seções", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    for (const secao of [
      "Placar do período",
      "Leitura do período",
      "Onde o funil dele(a) trava",
      "Evolução mês a mês",
      "Carteira agora",
      "Exceções abertas",
      "Onde ele(a) mais perde",
      "Comissões e meta",
      "Plano de ação da 1:1",
      "Metodologia",
    ]) {
      expect(html).toContain(secao);
    }
    expect(html).toContain("<svg");
  });

  it("escapa o conteúdo vindo do banco", () => {
    expect(html).not.toContain('Ana "A" <Souza>');
    expect(html).toContain("Ana &quot;A&quot; &lt;Souza&gt;");
  });

  it("usa o título como nome do arquivo do PDF", () => {
    expect(html).toContain("<title>raio-x-ana-a-souza-2026-07-15</title>");
  });

  it("marca a etapa gargalo na tabela do funil", () => {
    expect(html).toContain("tag-risco");
  });
});
