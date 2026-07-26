import { describe, expect, it } from "vitest";
import {
  compararComTime,
  evolucaoTrimestral,
  funilLadoALado,
  resumoComissoes,
  raioXParaSheets,
} from "@/features/inteligencia/raio-x-derive";
import { agregarCoortes } from "@/features/inteligencia/funil-derive";
import type { PerformanceDrillRow, PerformanceRow } from "@/features/inteligencia/queries";

const row = (p: Partial<PerformanceRow>): PerformanceRow => ({
  corretor_id: "x",
  nome: "X",
  presente: true,
  limite_diario_leads: 50,
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
  leads_respondidos: 0,
  carga_ativa: 0,
  capacidade_pct: null,
  atualizado_em: null,
  ...p,
});

describe("compararComTime", () => {
  const time = [
    row({ corretor_id: "a", leads_recebidos: 10, vendas: 4, primeira_resposta_p50_min: 20 }),
    row({ corretor_id: "b", leads_recebidos: 10, vendas: 2, primeira_resposta_p50_min: 40 }),
    row({ corretor_id: "c", leads_recebidos: 10, vendas: 0, primeira_resposta_p50_min: 60 }),
    row({ corretor_id: "eu", leads_recebidos: 10, vendas: 6, primeira_resposta_p50_min: 10 }),
  ];

  it("compara com a média dos DEMAIS (exclui o próprio corretor)", () => {
    const comp = compararComTime(time[3], time);
    const vendas = comp.find((c) => c.chave === "vendas")!;
    expect(vendas.mediaTime).toBe(2); // (4+2+0)/3, sem o "eu"
    expect(vendas.deltaPct).toBe(200);
    const resposta = comp.find((c) => c.chave === "primeira_resposta")!;
    expect(resposta.menorMelhor).toBe(true);
    expect(resposta.deltaPct).toBe(-75); // 10 vs média 40 — menor = melhor
  });

  it("amostra pequena do time não gera média falsa", () => {
    const pequeno = [time[3], row({ corretor_id: "a", leads_recebidos: 5, vendas: 1 })];
    const comp = compararComTime(pequeno[0], pequeno);
    expect(comp.find((c) => c.chave === "vendas")!.mediaTime).toBeNull();
    expect(comp.find((c) => c.chave === "vendas")!.deltaPct).toBeNull();
  });
});

describe("funilLadoALado", () => {
  const coorte = (leads: number, atend: number, agend: number, visita: number, analise: number, vendas: number) =>
    agregarCoortes([
      {
        mes_coorte: "2026-07-01",
        leads,
        atingiu_atendimento: atend,
        atingiu_agendado: agend,
        atingiu_visita: visita,
        atingiu_analise: analise,
        vendas,
        perdidos: 0,
        cobertura_pct: 100,
        atualizado_em: null,
      },
    ]);

  it("mostra gap em pontos percentuais por etapa", () => {
    const lado = funilLadoALado(coorte(100, 80, 40, 20, 10, 5), coorte(1000, 600, 300, 180, 90, 45));
    const agendou = lado.find((l) => l.etapa === "Agendaram")!;
    expect(agendou.minhaTaxa).toBe(50); // 40/80
    expect(agendou.taxaTime).toBe(50); // 300/600
    expect(agendou.gapPp).toBe(0);
    const atendeu = lado.find((l) => l.etapa === "Atendidos")!;
    expect(atendeu.gapPp).toBe(20); // 80% vs 60%
  });

  it("sem coorte do corretor devolve taxas null (sem dado, não zero)", () => {
    const lado = funilLadoALado(null, coorte(100, 60, 30, 18, 9, 4));
    expect(lado[0].minhaTaxa).toBeNull();
    expect(lado[0].gapPp).toBeNull();
  });
});

describe("evolucaoTrimestral", () => {
  it("agrupa a série mensal por trimestre", () => {
    const mes = (m: string, vendas: number, vgv: number): PerformanceDrillRow => ({
      mes: m,
      leads_recebidos: 0,
      interacoes: 0,
      contatos: 0,
      agendamentos_criados: 0,
      visitas_realizadas: 1,
      no_shows: 0,
      analises: 0,
      tarefas_concluidas: 0,
      vendas,
      vgv,
      primeira_resposta_p50_min: null,
      atualizado_em: null,
    });
    const tri = evolucaoTrimestral([
      mes("2026-02-01", 1, 100),
      mes("2026-03-01", 2, 200),
      mes("2026-04-01", 3, 300),
    ]);
    expect(tri).toEqual([
      { trimestre: "2026-T1", vendas: 3, vgv: 300, visitas: 2 },
      { trimestre: "2026-T2", vendas: 3, vgv: 300, visitas: 1 },
    ]);
  });
});

describe("resumoComissoes", () => {
  it("separa pago de aberto e ignora canceladas", () => {
    const r = resumoComissoes([
      { status: "paga", valor_liquido: 5000, valor_comissao: null },
      { status: "pendente", valor_liquido: null, valor_comissao: 3000 },
      { status: "cancelada", valor_liquido: 9999, valor_comissao: null },
    ]);
    expect(r.pago).toBe(5000);
    expect(r.aberto).toBe(3000);
  });
});

describe("raioXParaSheets", () => {
  it("gera as 4 abas do export", () => {
    const sheets = raioXParaSheets({
      nome: "Ana",
      comparacoes: [],
      serie: [],
      funil: [],
      perdas: [{ categoria: "sem_contato", quantidade: 3, vgv_estimado: 100000 }],
    });
    expect(sheets.map((s) => s.name)).toEqual([
      "Resumo",
      "Evolução mensal",
      "Funil vs time",
      "Perdas",
    ]);
    expect(sheets[3].rows[0].Leads).toBe(3);
  });
});
