import { describe, expect, it } from "vitest";
import { fixtureRanking } from "./fixtures/ranking";
import {
  classificacaoCompleta,
  classificarGestores,
  conversaoCorretor,
  destaques,
  novasConquistas,
  participantes,
  roteiroTV,
  snapshotSchema,
  LINHAS_TV,
} from "@/features/ranking/ranking-campeonato";
import { agoraSaoPaulo, dateKey } from "@/lib/periodo";

export function comNovaVenda() {
  const anterior = fixtureRanking();
  const atual = structuredClone(anterior);
  atual.gerado_em = "2026-09-08T15:01:00Z";
  atual.vendas.push({
    id: "v-nova",
    corretor_id: "c1",
    aprovado_em: "2026-09-08T15:00:30Z",
    dia: "2026-09-08",
    valor: 400000,
  });
  atual.rows[1].vendas++;
  atual.rows[1].vgv += 400000;
  return { anterior, atual };
}

describe("Campeonato — integridade comercial", () => {
  it("usa somente VGV e vendas para posições e inclui quem não vendeu", () => {
    const s = fixtureRanking();
    s.rows[0].vgv = s.rows[1].vgv;
    s.rows[0].pontuacao = 1;
    const rows = classificacaoCompleta(participantes(s));
    expect(rows).toHaveLength(30);
    expect(rows.slice(0, 2).map((r) => [r.pos, r.empatado])).toEqual([
      [1, true],
      [1, true],
    ]);
    expect(rows.find((r) => r.corretorId === "c29")?.pos).toBe(0);
  });
  it("não corta pessoas empatadas e o roteiro mostra todos os 30, inclusive no pódio", () => {
    const roteiro = roteiroTV(30, 3, 10);
    for (const tipo of ["corretores", "produtividade"] as const) {
      const indices = roteiro
        .filter((s) => s.tipo === tipo)
        .flatMap((s) => Array.from({ length: LINHAS_TV }, (_, i) => s.pagina * LINHAS_TV + i));
      expect(indices).toEqual(Array.from({ length: 30 }, (_, i) => i));
    }
    expect(roteiro.filter((s) => s.tipo === "podio")).toHaveLength(10);
    expect(roteiro[0].tipo).toBe("podio");
    expect(new Set(roteiro.map((s) => s.id)).size).toBe(roteiro.length);
  });
  it("soma múltiplas equipes uma vez por gestor, com desempate igual ao dos corretores", () => {
    const s = fixtureRanking();
    s.equipes[1].gestor_id = s.equipes[0].gestor_id;
    const gestores = classificarGestores(s);
    expect(gestores).toHaveLength(2);
    const g = gestores.find((r) => r.corretorId === "g0")!;
    expect(g.equipes).toEqual(["Horizonte", "Essência"]);
    expect(g.integrantes).toBe(20);
    expect(g.vgv).toBe(s.rows.filter((r) => r.equipe_id !== "e2").reduce((a, r) => a + r.vgv, 0));
  });
  it("rejeita snapshots truncados e IDs duplicados em vez de exibir totais parciais", () => {
    const s = fixtureRanking();
    expect(snapshotSchema.safeParse(s).success).toBe(true);
    s.rows.pop();
    expect(snapshotSchema.safeParse(s).success).toBe(false);
    s.rows.push(s.rows[0]);
    expect(snapshotSchema.safeParse(s).success).toBe(false);
  });
  it("destaques usam aprovações do dia SP e semana dentro do ciclo", () => {
    const s = fixtureRanking();
    const d = agoraSaoPaulo(new Date("2026-09-09T02:59:00Z"));
    expect(dateKey(d)).toBe("2026-09-08");
    expect(destaques(s, d, "dia")[0].corretorId).toBe("c0");
    expect(destaques(s, new Date(2026, 8, 9), "dia")).toEqual([]);
  });
  it("conversão exige a mesma coorte, base positiva e período confiável", () => {
    const s = fixtureRanking();
    expect(conversaoCorretor(s, "c0")).toMatchObject({ leads: 30, convertidos: 5 });
    s.coortes[0].convertidos = 31;
    expect(conversaoCorretor(s, "c0")).toBeNull();
    s.coortes[0].convertidos = 5;
    s.coortes_desde = "2026-10-01";
    expect(conversaoCorretor(s, "c0")).toBeNull();
    s.coortes_desde = null;
    expect(conversaoCorretor(s, "c0")).toBeNull();
  });
});
describe("Campeonato — celebrações verificadas", () => {
  it("primeira leitura e recarga estabelecem baseline, sem celebração retroativa", () => {
    const { atual } = comNovaVenda();
    expect(novasConquistas(null, atual, new Set())).toEqual([]);
    expect(novasConquistas(atual, atual, new Set())).toEqual([]);
  });
  it("celebra aprovação nova e ultrapassagem, deduplicadas por venda", () => {
    const { anterior, atual } = comNovaVenda();
    const eventos = novasConquistas(anterior, atual, new Set());
    expect(eventos).toHaveLength(1);
    expect(eventos[0].detalhes).toContain("Subiu para a 1ª posição");
    expect(novasConquistas(anterior, atual, new Set([eventos[0].id]))).toEqual([]);
  });
  it("não celebra histórico, venda antiga, cancelamento, troca de equipe ou alteração sem evidência", () => {
    for (const mudar of [
      (s: ReturnType<typeof fixtureRanking>) => {
        s.inicio = "2026-08-01";
      },
      (s: ReturnType<typeof fixtureRanking>) => {
        s.vendas.at(-1)!.aprovado_em = "2026-09-08T14:00:00Z";
      },
      (s: ReturnType<typeof fixtureRanking>) => {
        s.rows[1].vendas -= 2;
      },
      (s: ReturnType<typeof fixtureRanking>) => {
        s.rows[1].equipe_id = "e0";
      },
      (s: ReturnType<typeof fixtureRanking>) => {
        s.vendas.pop();
      },
      (s: ReturnType<typeof fixtureRanking>) => {
        s.gerado_em = "2026-09-08T16:00:00Z";
      },
    ]) {
      const { anterior, atual } = comNovaVenda();
      mudar(atual);
      expect(novasConquistas(anterior, atual, new Set())).toEqual([]);
    }
  });
  it("meta só cruza com nova venda e denominador inalterado", () => {
    const { anterior, atual } = comNovaVenda();
    anterior.metas[1].meta_gmv = 2400000;
    atual.metas[1].meta_gmv = 2400000;
    expect(novasConquistas(anterior, atual, new Set())[0].titulo).toBe("Meta conquistada!");
    anterior.metas[1].meta_gmv = 3000000;
    expect(novasConquistas(anterior, atual, new Set())[0].titulo).toBe("Nova venda aprovada!");
  });
});
