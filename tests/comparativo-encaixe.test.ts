// Encaixe do empreendimento no perfil do cliente (texto que vai no PDF). A
// regra de ouro: critério só entra com dado dos DOIS lados — sem dado, sem
// ponto e sem alerta.
import { describe, expect, it } from "vitest";
import {
  avaliarEncaixe,
  perfilDoLead,
  perfilTemDados,
  resumoDoPerfil,
  type PerfilComparativo,
} from "@/features/comparativo/encaixe";
import { calcularPoderDeCompra } from "@/lib/vitrine/poder-de-compra";
import { mkProjeto } from "./helpers/projeto";

function perfil(over: Partial<PerfilComparativo> = {}): PerfilComparativo {
  return {
    renda: null,
    fgts: 0,
    entrada: 0,
    temDependente: false,
    carteira3anos: false,
    zona: null,
    bairro: null,
    dormsDesejados: null,
    precisaVaga: null,
    prioridades: [],
    ...over,
  };
}

describe("perfilDoLead", () => {
  it("lê renda/entrada em texto BR, FGTS, zona e os campos novos", () => {
    const p = perfilDoLead({
      renda_informada: "R$ 4.500,00",
      entrada_disponivel: "10 mil",
      fgts_valor: 12000,
      zona: "Zona Leste",
      bairro: " Itaquera ",
      dorms_desejados: 2,
      precisa_vaga: true,
      prioridades: ["pet", "lixo_desconhecido", "lazer_completo"],
    });
    expect(p.renda).toBe(4500);
    expect(p.fgts).toBe(12000);
    expect(p.bairro).toBe("Itaquera");
    expect(p.dormsDesejados).toBe(2);
    expect(p.precisaVaga).toBe(true);
    // Chave fora do vocabulário é descartada, não vira texto no PDF.
    expect(p.prioridades).toEqual(["pet", "lazer_completo"]);
  });

  it("renda estimada entra quando a informada não existe; dorms fora de 1..4 é ignorado", () => {
    const p = perfilDoLead({ renda_informada: null, renda_estimada: 3200, dorms_desejados: 9 });
    expect(p.renda).toBe(3200);
    expect(p.dormsDesejados).toBeNull();
  });

  it("lead sem nada = sem perfil (o PDF sai sem a seção)", () => {
    const p = perfilDoLead({});
    expect(perfilTemDados(p)).toBe(false);
    expect(avaliarEncaixe(p, mkProjeto({ preco_a_partir: 200000 }))).toBeNull();
    expect(resumoDoPerfil(p)).toEqual([]);
  });
});

describe("avaliarEncaixe — financeiro (mesmo motor da Vitrine)", () => {
  const renda = 4500;
  const fgts = 15000;
  const entrada = 10000;
  const poder = calcularPoderDeCompra({
    renda,
    fgts,
    entrada,
    temDependente: false,
    carteira3anos: false,
    reforcoAnual: 0,
  })!;
  const p = perfil({ renda, fgts, entrada });

  it("preço dentro do teto → cabe no orçamento", () => {
    const e = avaliarEncaixe(p, mkProjeto({ preco_a_partir: Math.floor(poder.teto * 0.9) }))!;
    expect(e.pontos[0]).toMatch(/Cabe no seu orçamento com seu FGTS e entrada/);
    expect(e.nivel).toBe("otimo");
  });

  it("muito acima do teto → atenção e nível no máximo 'parcial'", () => {
    const e = avaliarEncaixe(
      perfil({ renda, fgts, entrada, zona: "Leste", dormsDesejados: 2 }),
      mkProjeto({
        preco_a_partir: Math.ceil(poder.tetoOtimista * 1.6),
        zona_smq: "Leste",
        dorms_min: 2,
        dorms_max: 2,
      }),
    )!;
    expect(e.atencao.some((t) => /Acima do orçamento/.test(t))).toBe(true);
    // Região e quartos batem, mas fora do orçamento não é "bom".
    expect(e.atendidos).toBe(2);
    expect(e.nivel).toBe("parcial");
  });

  it("sob consulta usa a renda sugerida da construtora", () => {
    const ok = avaliarEncaixe(p, mkProjeto({ sob_consulta: true, renda_minima: 4000 }))!;
    expect(ok.pontos).toContain("Sua renda atende a renda sugerida pela construtora");
    const nao = avaliarEncaixe(p, mkProjeto({ sob_consulta: true, renda_minima: 6000 }))!;
    expect(nao.atencao[0]).toMatch(/Renda sugerida pela construtora/);
  });

  it("sem preço e sem renda sugerida → não avalia (nada inventado)", () => {
    const e = avaliarEncaixe(p, mkProjeto({ sob_consulta: true }))!;
    expect(e.avaliados).toBe(0);
    expect(e.nivel).toBe("sem_dados");
  });
});

describe("avaliarEncaixe — região, quartos, vaga, entrega, prioridades", () => {
  it("bairro igual ganha de zona; zona diferente vira atenção explicada", () => {
    const noBairro = avaliarEncaixe(
      perfil({ bairro: "Itaquera", zona: "Leste" }),
      mkProjeto({ bairro: "ITAQUERA", zona_smq: "Leste" }),
    )!;
    expect(noBairro.pontos).toEqual(["Fica em ITAQUERA, o bairro que você procura"]);

    const outraZona = avaliarEncaixe(
      perfil({ zona: "Zona Leste" }),
      mkProjeto({ zona_smq: "Sul" }),
    )!;
    expect(outraZona.atencao).toEqual(["Fica na Zona Sul (você procura Zona Leste)"]);
  });

  it("quartos: dentro da faixa, a menos e a mais", () => {
    const dois = perfil({ dormsDesejados: 2 });
    expect(avaliarEncaixe(dois, mkProjeto({ dorms_min: 1, dorms_max: 2 }))!.pontos).toEqual([
      "Tem opção de 2 dormitórios",
    ]);
    expect(avaliarEncaixe(dois, mkProjeto({ dorms_min: 1, dorms_max: 1 }))!.atencao[0]).toMatch(
      /até 1 dormitório — menos quartos/,
    );
    expect(avaliarEncaixe(dois, mkProjeto({ dorms_min: 3, dorms_max: 3 }))!.atencao[0]).toBe(
      "Unidades a partir de 3 dormitórios",
    );
    // Projeto sem dorms cadastrado: nada sobre quartos.
    expect(avaliarEncaixe(dois, mkProjeto())!.avaliados).toBe(0);
  });

  it("vaga: inclusa, em parte das unidades, sem vaga, desconhecida", () => {
    const quer = perfil({ precisaVaga: true });
    expect(avaliarEncaixe(quer, mkProjeto({ vagas_min: 1, vagas_max: 1 }))!.pontos).toEqual([
      "Vaga de garagem inclusa",
    ]);
    expect(avaliarEncaixe(quer, mkProjeto({ vagas_min: 0, vagas_max: 1 }))!.pontos[0]).toMatch(
      /Tem unidades com vaga/,
    );
    expect(avaliarEncaixe(quer, mkProjeto({ vagas_min: 0, vagas_max: 0 }))!.atencao).toEqual([
      "Não tem vaga de garagem",
    ]);
    expect(avaliarEncaixe(quer, mkProjeto())!.avaliados).toBe(0);
  });

  it("pronto para morar vem da situação de entrega", () => {
    const quer = perfil({ prioridades: ["pronto_para_morar"] });
    expect(avaliarEncaixe(quer, mkProjeto({ status_entrega: "Pronto" }))!.pontos).toEqual([
      "Pronto para morar",
    ]);
    expect(
      avaliarEncaixe(
        quer,
        mkProjeto({ status_entrega: "Em obras", mes_entrega: 6, ano_entrega: 2028 }),
      )!.atencao,
    ).toEqual(["Ainda em obra: entrega prevista para 06/2028"]);
  });

  it("prioridades casam com diferenciais por sinônimo; o que não acha não vira alerta", () => {
    const e = avaliarEncaixe(
      perfil({ prioridades: ["pet", "lazer_completo", "escola_perto"] }),
      mkProjeto({ diferenciais: ["Pet Place", "Piscina adulto", "Academia", "Bicicletário"] }),
    )!;
    expect(e.pontos).toEqual(["Tem o que você valoriza: Pet Place, Piscina adulto"]);
    expect(e.atencao).toEqual([]);
    expect(e.atendidos).toBe(2);
    expect(e.nivel).toBe("otimo");
  });
});

describe("resumoDoPerfil", () => {
  it("frase curta do que o cliente procura, na ordem da capa", () => {
    expect(
      resumoDoPerfil(
        perfil({
          dormsDesejados: 2,
          zona: "leste",
          renda: 4500,
          fgts: 10000,
          entrada: 5000,
          precisaVaga: true,
          prioridades: ["pet", "varanda"],
        }),
      ),
    ).toEqual([
      "2 dormitórios",
      "Zona Leste",
      expect.stringMatching(/^Renda familiar de R\$\s?4\.500$/),
      expect.stringMatching(/^R\$\s?15\.000 entre FGTS e entrada$/),
      "Vaga de garagem",
      "Prioriza: Aceita pet, Varanda",
    ]);
  });
});
