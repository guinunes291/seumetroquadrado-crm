// Guarda do item 2.10 (estrategia-2026-08): comparação LADO A LADO —
// tarefa #10 (funil do corretor CONTRA o time, não no lugar dele) e
// tarefa #11 (KPIs do período contra o anterior, valores absolutos junto
// dos deltas). Helpers puros testados em runtime; fiação por fonte-texto.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agregarCoortes,
  compararTaxasComTime,
  mediaPorCorretorSnapshot,
} from "@/features/inteligencia/funil-derive";
import { flattenDashboardKpis } from "@/features/dashboard/derive";
import type { FunilCoorteRow } from "@/features/inteligencia/queries";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const funilView = read("src/features/inteligencia/funil-view.tsx");
const relatorios = read("src/features/dashboard/relatorios-view.tsx");

function coorte(parcial: Partial<FunilCoorteRow>): FunilCoorteRow {
  return {
    mes_coorte: "2026-07-01",
    leads: 100,
    atingiu_atendimento: 80,
    atingiu_agendado: 40,
    atingiu_visita: 20,
    atingiu_analise: 10,
    vendas: 5,
    perdidos: 30,
    cobertura_pct: 90,
    atualizado_em: null,
    ...parcial,
  };
}

describe("tarefa #10 — compararTaxasComTime", () => {
  it("compara TAXAS (não volumes) e marca 'abaixo' só com as duas taxas medidas", () => {
    // João: 10 leads, 4 agendaram sobre 8 atendidos (50%).
    const joao = agregarCoortes([
      coorte({
        leads: 10,
        atingiu_atendimento: 8,
        atingiu_agendado: 4,
        atingiu_visita: 1,
        atingiu_analise: 1,
        vendas: 0,
      }),
    ])!;
    // Time: 100 leads, 61% de agendado→atendido... (80 atendidos, 60 agendaram = 75%).
    const time = agregarCoortes([
      coorte({
        leads: 100,
        atingiu_atendimento: 80,
        atingiu_agendado: 60,
        atingiu_visita: 30,
        atingiu_analise: 15,
        vendas: 8,
      }),
    ])!;
    const rows = compararTaxasComTime(joao, time);
    const agendaram = rows.find((r) => r.etapa.chave === "atingiu_agendado")!;
    expect(agendaram.taxa_passagem_pct).toBe(50);
    expect(agendaram.taxa_time_pct).toBe(75);
    expect(agendaram.abaixo).toBe(true);
    // Primeira etapa não tem "anterior" — nunca marca abaixo.
    const primeira = rows.find((r) => r.etapa.chave === "leads")!;
    expect(primeira.taxa_passagem_pct).toBeNull();
    expect(primeira.abaixo).toBe(false);
  });

  it("corretor acima do time não ganha marca", () => {
    const acima = agregarCoortes([
      coorte({
        leads: 10,
        atingiu_atendimento: 9,
        atingiu_agendado: 8,
        atingiu_visita: 6,
        atingiu_analise: 3,
        vendas: 2,
      }),
    ])!;
    const time = agregarCoortes([coorte({})])!;
    const rows = compararTaxasComTime(acima, time);
    expect(rows.some((r) => r.abaixo)).toBe(false);
  });
});

describe("tarefa #10 — mediaPorCorretorSnapshot", () => {
  it("divide o estoque do time pelo nº de perfis ativos (1 casa decimal)", () => {
    const media = mediaPorCorretorSnapshot(
      [
        { etapa: "agendado", quantidade: 22 },
        { etapa: "em_atendimento", quantidade: 7 },
      ],
      3,
    );
    expect(media.get("agendado")).toBe(7.3);
    expect(media.get("em_atendimento")).toBe(2.3);
  });

  it("sem divisor válido devolve mapa vazio — a UI não compara, nunca inventa", () => {
    expect(mediaPorCorretorSnapshot([{ etapa: "agendado", quantidade: 22 }], 0).size).toBe(0);
    expect(mediaPorCorretorSnapshot([{ etapa: "agendado", quantidade: 22 }], NaN).size).toBe(0);
  });
});

describe("tarefa #10 — fiação do FunilView", () => {
  it("com corretor filtrado, o TIME entra como segunda query — ao lado, não no lugar", () => {
    expect(funilView).toContain("const comparando = !!filtros.corretor");
    expect(funilView).toMatch(/useFunilCoorte\(\s*\{ \.\.\.filtros, corretor: null \}/);
    expect(funilView).toMatch(/useFunilSnapshot\(null, leitura === "snapshot" && comparando\)/);
    expect(funilView).toContain("compararTaxasComTime(agregada, agregadaTime)");
    expect(funilView).toContain("mediaPorCorretorSnapshot(");
    expect(funilView).toContain("⚠ abaixo");
    expect(funilView).toContain("média do time");
  });
});

describe("tarefa #11 — período anterior lado a lado", () => {
  const raw = {
    pipeline: { agendado: 4 },
    periodo: {
      leads_novos: 50,
      agendamentos: 12,
      visitas: 8,
      visitas_agendadas: 10,
      no_shows: 2,
      pastas: 3,
      analises: 4,
      vendas: 2,
      perdidos: 5,
      vgv: 400000,
    },
    prev: {
      leads_novos: 40,
      agendamentos: 10,
      visitas: 10,
      visitas_agendadas: 12,
      no_shows: 1,
      pastas: 4,
      analises: 2,
      vendas: 1,
      perdidos: 8,
      vgv: 200000,
    },
  };

  it("flatten expõe deltas de produção E os valores absolutos do anterior", () => {
    const flat = flattenDashboardKpis(raw);
    expect(flat.deltas.agendamentos).toBe(20);
    expect(flat.deltas.visitas).toBe(-20);
    expect(flat.deltas.pastas).toBe(-25);
    expect(flat.deltas.analises).toBe(100);
    expect(flat.anterior).toMatchObject({
      total: 40,
      contrato_fechado: 1,
      vgv: 200000,
      visitas_periodo: 10,
      visitas_agendadas_periodo: 12,
      pastas_periodo: 4,
      analises_periodo: 2,
      perdido: 8,
    });
  });

  it("sem prev (período aberto ou RPC antiga) o anterior é null e nada quebra", () => {
    const flat = flattenDashboardKpis({ pipeline: {}, periodo: { leads_novos: 5 } });
    expect(flat.anterior).toBeNull();
    expect(flat.deltas.agendamentos).toBeNull();
    // Shape plano legado idem.
    expect(flattenDashboardKpis({ total: 5 }).anterior).toBeNull();
  });

  it("os tiles mostram o número anterior junto do atual (lado a lado, não no lugar)", () => {
    for (const fragmento of [
      "anterior: ${ant.total.toLocaleString",
      "anterior: ${fmtBRLCompacto(ant.vgv)}",
      "anterior: ${ant.agendamentos_periodo}",
      "anterior: ${ant.visitas_periodo}",
      "anterior: ${ant.pastas_periodo}",
      "anterior: ${ant.analises_periodo}",
      "anterior: ${ant.perdido}",
      "anterior: ${comparecimentoAnterior}%",
      "anterior: ${fmtBRLCompacto(ticketAnterior)}",
    ]) {
      expect(relatorios).toContain(fragmento);
    }
    expect(relatorios).toMatch(/delta=\{data\?\.deltas\.agendamentos/);
    expect(relatorios).toMatch(/delta=\{data\?\.deltas\.visitas/);
  });
});
