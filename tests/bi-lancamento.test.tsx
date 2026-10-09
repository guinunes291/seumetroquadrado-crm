// BI · Relatórios na identidade Lançamento (2026-10): a aba Dia como no vídeo
// de lançamento — os quatro números do mês, as vendas das últimas 12 semanas
// (a atual em dourado) e as três exceções mais graves, com o feed completo
// logo abaixo. Os números vêm das mesmas consultas do dashboard.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Excecao, PainelDia } from "@/features/gestao/painel-dia/derive";
import {
  conversaoDoMes,
  inicioDasSemanas,
  vendasPorSemana,
} from "@/features/gestao/painel-dia/dia-resumo";

const dados = vi.hoisted(() => ({
  serie: [] as { dia: string; vendas: number }[],
}));
vi.mock("@/features/dashboard/queries", () => ({
  useDashboardKpis: () => ({
    data: { contrato_fechado: 12, total: 162, vgv: 2_900_000, visitas_periodo: 48 },
    isPending: false,
  }),
  useDashboardSerie: () => ({ data: dados.serie, isPending: false, isError: false }),
}));

import { DiaTopo } from "@/features/gestao/painel-dia/dia-topo";

afterEach(() => cleanup());

// Sexta, 9/10/2026, meio-dia (calendário de São Paulo, já convertido).
const AGORA = new Date(2026, 9, 9, 12, 0, 0);

describe("vendasPorSemana", () => {
  it("12 semanas de segunda a domingo, terminando na semana de hoje", () => {
    expect(inicioDasSemanas(AGORA).getDate()).toBe(20); // 20/07/2026, segunda
    const s = vendasPorSemana([], AGORA);
    expect(s).toHaveLength(12);
    expect(s[0].inicio).toBe("2026-07-20");
    expect(s[11].inicio).toBe("2026-10-05");
    expect(s.filter((x) => x.atual).map((x) => x.inicio)).toEqual(["2026-10-05"]);
  });

  it("soma cada dia na sua semana e ignora o que está fora da janela", () => {
    const s = vendasPorSemana(
      [
        { dia: "2026-07-19", vendas: 9 }, // domingo antes da janela
        { dia: "2026-07-20", vendas: 1 }, // segunda da 1ª semana
        { dia: "2026-07-26", vendas: 2 }, // domingo da 1ª semana
        { dia: "2026-10-05", vendas: 3 }, // segunda da semana atual
        { dia: "2026-10-09", vendas: 1 }, // hoje
      ],
      AGORA,
    );
    expect(s[0].vendas).toBe(3);
    expect(s[11].vendas).toBe(4);
    expect(s.reduce((a, b) => a + b.vendas, 0)).toBe(7);
  });
});

describe("conversaoDoMes", () => {
  it("vendas ÷ leads do mês, em %, com uma casa; sem leads, sem número", () => {
    expect(conversaoDoMes(12, 162)).toBe(7.4);
    expect(conversaoDoMes(0, 40)).toBe(0);
    expect(conversaoDoMes(3, 0)).toBeNull();
  });
});

function excecao(tipo: Excecao["tipo"], nome: string, valor: number): Excecao {
  return {
    tipo,
    severidade: 1,
    lead_id: `lead-${nome}`,
    lead_nome: nome,
    telefone: null,
    corretor_id: null,
    corretor_nome: null,
    etapa: "em_atendimento",
    temperatura: null,
    valor_potencial: valor,
    detalhe: {},
  };
}

const PAINEL: PainelDia = {
  excecoes: [
    excecao("sla_estourado", "Juliana Melo", 239_900),
    excecao("visita_sem_confirmacao", "Paulo Reis", 251_500),
    excecao("followup_vencido", "Carla Dias", 228_700),
    excecao("parado", "Sérgio Nunes", 205_000),
  ],
  resumo: { por_tipo: {}, total: 4, vgv_em_risco: 925_100, corretores_sem_interacao: [] },
  atualizado_em: null,
  degradado: false,
};

describe("DiaTopo", () => {
  it("os quatro números do mês, as 12 barras e as três exceções mais graves", () => {
    dados.serie = [{ dia: "2026-10-05", vendas: 2 }];
    render(<DiaTopo painel={PAINEL} />);

    expect(screen.getByText("Vendas no mês").nextElementSibling?.textContent).toBe("12");
    expect(screen.getByText("Visitas no mês").nextElementSibling?.textContent).toBe("48");
    expect(screen.getByText("Conversão").nextElementSibling?.textContent).toBe("7,4%");

    const barras = screen.getAllByTestId("barra-semana");
    expect(barras).toHaveLength(12);
    expect(barras.filter((b) => b.dataset.atual)).toHaveLength(1);

    const topo = screen.getAllByTestId("excecao-topo");
    expect(topo.map((t) => t.textContent)).toEqual([
      expect.stringContaining("SLA estourado"),
      expect.stringContaining("Visita sem confirmação"),
      expect.stringContaining("Follow-up vencido"),
    ]);
    expect(screen.getByRole("link", { name: /Ver todas \(4\)/ }).getAttribute("href")).toBe(
      "#excecoes",
    );
  });

  it("sem exceções, diz que a operação está em dia", () => {
    render(
      <DiaTopo painel={{ ...PAINEL, excecoes: [], resumo: { ...PAINEL.resumo, total: 0 } }} />,
    );
    expect(screen.getByText("Nenhuma exceção agora — operação em dia.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Ver todas/ })).toBeNull();
  });
});

describe("painel da gestão", () => {
  const painel = readFileSync(
    resolve(process.cwd(), "src/routes/_authenticated/painel-gestor.tsx"),
    "utf8",
  );

  it("mostra o título do módulo e o selo 'ao vivo' só na aba Dia", () => {
    expect(painel).toContain('title="BI · Relatórios"');
    const selo = painel.indexOf("ao vivo\n");
    expect(selo).toBeGreaterThan(-1);
    expect(painel.lastIndexOf('activeTab === "dia" && (', selo)).toBeGreaterThan(-1);
  });
});
