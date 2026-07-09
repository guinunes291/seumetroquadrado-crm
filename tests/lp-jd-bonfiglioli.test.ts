import { describe, it, expect } from "vitest";
import {
  PLANTAS,
  menorPreco,
  avaliarPlantas,
  valorMaxFinanciavel,
  tetoImovelParaRenda,
  parcelaPrice,
  COMPROMETIMENTO_MAX,
  extractMarketing,
  buildLandingPayload,
  lpLeadSchema,
  lpWhatsAppHref,
  LP_CONFIG,
  formatBRL,
  SIM_DEFAULTS,
} from "@/lib/lp-jd-bonfiglioli";

describe("PLANTAS (material confirmado)", () => {
  it("tem as 7 tipologias do material, todas de 2 dorms", () => {
    expect(PLANTAS).toHaveLength(7);
    expect(PLANTAS.every((p) => p.dorms === 2)).toBe(true);
  });

  it("preço mínimo é o 32m² HIS1 e máximo o 41m² R2V", () => {
    expect(menorPreco()).toBe(237_900);
    expect(Math.max(...PLANTAS.map((p) => p.preco))).toBe(339_900);
    const menor = PLANTAS.find((p) => p.preco === 237_900)!;
    expect(menor.metragem).toBe(32);
    expect(menor.segmento).toBe("HIS1");
    const maior = PLANTAS.find((p) => p.preco === 339_900)!;
    expect(maior.metragem).toBe(41);
    expect(maior.segmento).toBe("R2V");
  });

  it("as duas plantas de 41m² carregam o destaque de planta inédita", () => {
    const de41 = PLANTAS.filter((p) => p.metragem === 41);
    expect(de41).toHaveLength(2);
    expect(de41.every((p) => p.destaque)).toBe(true);
  });
});

describe("avaliarPlantas", () => {
  it("renda alta aprova todas as plantas", () => {
    const res = avaliarPlantas(15_000);
    expect(res).toHaveLength(PLANTAS.length);
    expect(res.every((r) => r.cabe)).toBe(true);
  });

  it("renda muito baixa não aprova nenhuma", () => {
    const res = avaliarPlantas(500);
    expect(res.every((r) => !r.cabe)).toBe(true);
  });

  it("sem renda, nada 'cabe' e o comprometimento é null", () => {
    const res = avaliarPlantas(null);
    expect(res.every((r) => !r.cabe && r.comprometimento === null)).toBe(true);
  });

  it("rendaMinima = parcela / limite de comprometimento", () => {
    const [r] = avaliarPlantas(4_000);
    expect(r.rendaMinima).toBeCloseTo(r.parcela / COMPROMETIMENTO_MAX, 6);
  });

  it("parcela cresce com o preço da planta", () => {
    const res = avaliarPlantas(5_000);
    const ordenado = [...res].sort((a, b) => a.planta.preco - b.planta.preco);
    for (let i = 1; i < ordenado.length; i++) {
      expect(ordenado[i].parcela).toBeGreaterThan(ordenado[i - 1].parcela);
    }
  });

  it("entrada informada é limitada ao preço do imóvel", () => {
    const res = avaliarPlantas(5_000, { entrada: 1_000_000 });
    expect(res.every((r) => r.entrada === r.planta.preco && r.parcela === 0)).toBe(true);
  });
});

describe("valorMaxFinanciavel / tetoImovelParaRenda", () => {
  it("faz o round-trip com parcelaPrice", () => {
    const parcelaMax = 1_500;
    const teto = valorMaxFinanciavel(parcelaMax, 10, 360);
    const i = Math.pow(1 + 10 / 100, 1 / 12) - 1;
    expect(parcelaPrice(teto, i, 360)).toBeCloseTo(parcelaMax, 6);
  });

  it("com juros zero degrada para parcela × meses", () => {
    expect(valorMaxFinanciavel(1_000, 0, 100)).toBe(100_000);
  });

  it("teto do imóvel soma a entrada ao valor financiável", () => {
    const semEntrada = tetoImovelParaRenda(5_000);
    const comEntrada = tetoImovelParaRenda(5_000, { entrada: 20_000 });
    expect(comEntrada - semEntrada).toBeCloseTo(20_000, 6);
    expect(semEntrada).toBeGreaterThan(0);
  });

  it("usa as premissas padrão documentadas", () => {
    expect(SIM_DEFAULTS.jurosAnual).toBe(10);
    expect(SIM_DEFAULTS.meses).toBe(360);
    expect(SIM_DEFAULTS.entradaPct).toBe(0.1);
  });
});

describe("extractMarketing", () => {
  it("captura os 7 parâmetros de campanha", () => {
    const mk = extractMarketing(
      "?utm_source=fb&utm_medium=cpc&utm_campaign=lancamento&utm_term=ape&utm_content=v1&gclid=g1&fbclid=f1",
    );
    expect(mk).toEqual({
      utm_source: "fb",
      utm_medium: "cpc",
      utm_campaign: "lancamento",
      utm_term: "ape",
      utm_content: "v1",
      gclid: "g1",
      fbclid: "f1",
    });
  });

  it("query vazia devolve tudo null e ignora parâmetros alheios", () => {
    const mk = extractMarketing("?foo=bar");
    expect(Object.values(mk).every((v) => v === null)).toBe(true);
  });
});

describe("buildLandingPayload", () => {
  const base = { nome: "  Maria Silva  ", whatsapp: "(11) 98765-4321" };

  it("normaliza nome/whatsapp e mantém honeypots vazios", () => {
    const p = buildLandingPayload(base);
    expect(p.nome).toBe("Maria Silva");
    expect(p.whatsapp).toBe("11987654321");
    expect(p.website).toBe("");
    expect(p.simHp).toBe("");
    expect(p.origem).toBe(LP_CONFIG.origem);
    expect(p.regiao).toBe(LP_CONFIG.regiao);
    expect(p.tipo).toBe("interesse");
    expect(p).not.toHaveProperty("simulacao");
  });

  it("com simulação, tipo vira 'simulacao' e o bloco é anexado", () => {
    const p = buildLandingPayload({
      ...base,
      simulacao: { renda: 4000, parcela: 1200, segmento: "HIS1" },
    });
    expect(p.tipo).toBe("simulacao");
    expect(p.simulacao).toMatchObject({ renda: 4000, parcela: 1200 });
  });

  it("marketing parcial é completado com null", () => {
    const p = buildLandingPayload({ ...base, marketing: { utm_source: "fb" } });
    expect(p.marketing).toMatchObject({ utm_source: "fb", gclid: null, fbclid: null });
  });
});

describe("lpLeadSchema", () => {
  it("rejeita nome curto e telefone com menos de 10 dígitos", () => {
    expect(lpLeadSchema.safeParse({ nome: "ab", whatsapp: "(11) 98765-4321" }).success).toBe(false);
    expect(lpLeadSchema.safeParse({ nome: "Maria", whatsapp: "987654321" }).success).toBe(false);
  });

  it("aceita telefone mascarado de 10 ou 11 dígitos", () => {
    expect(lpLeadSchema.safeParse({ nome: "Maria", whatsapp: "(11) 3456-7890" }).success).toBe(
      true,
    );
    expect(lpLeadSchema.safeParse({ nome: "Maria", whatsapp: "11 98765-4321" }).success).toBe(true);
  });
});

describe("lpWhatsAppHref", () => {
  it("sem número configurado devolve null (CTA degrada para o formulário)", () => {
    // LP_CONFIG.whatsapp começa vazio até o número oficial ser confirmado.
    if (LP_CONFIG.whatsapp === "") {
      expect(lpWhatsAppHref()).toBeNull();
    } else {
      expect(lpWhatsAppHref()).toContain("wa.me");
    }
  });
});

describe("formatBRL", () => {
  it("formata inteiro em BRL sem centavos", () => {
    expect(formatBRL(237_900)).toMatch(/^R\$\s237\.900$/);
  });
});
