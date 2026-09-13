/**
 * Lógica pura da carteira ativa (features/carteira-ativa/derive).
 *
 * A classificação é do banco; aqui se testa o que a TELA decide — e o que mais
 * importa é o caso do estouro: quem tem 45 leads no fundo do funil não perdeu
 * negócio nenhum, ele só parou de receber. Se a frase do placar disser o
 * contrário, o corretor conclui que o CRM tirou cliente dele e passa a
 * esconder lead do sistema, que é o risco nº 1 do documento.
 */
import { describe, expect, it } from "vitest";
import {
  agruparPorFaixa,
  agruparReservaPorMotivo,
  categoriaDoMotivo,
  fraseDoPlacar,
  resumoCarteira,
  type LinhaCarteira,
  type LinhaReserva,
} from "@/features/carteira-ativa/derive";

function linha(faixa: string, posicao: number, valor: number | null = null): LinhaCarteira {
  return {
    lead_id: `lead-${faixa}-${posicao}`,
    nome: `Lead ${posicao}`,
    telefone: "11999990000",
    status: faixa === "fundo" ? "analise_credito" : "em_atendimento",
    temperatura: "quente",
    projeto_nome: null,
    created_at: "2026-09-01T00:00:00Z",
    movimento: "2026-09-10T00:00:00Z",
    dias_parado: 3,
    proximo_followup: null,
    valor,
    faixa,
    posicao,
  };
}

function reserva(motivo: string): LinhaReserva {
  return {
    lead_id: `r-${motivo}`,
    nome: "Lead Reserva",
    telefone: null,
    status: "em_atendimento",
    temperatura: "frio",
    projeto_nome: null,
    created_at: "2026-07-01T00:00:00Z",
    movimento: "2026-07-01T00:00:00Z",
    dias_parado: 60,
    valor: null,
    motivo,
    total: 1,
  };
}

describe("resumoCarteira", () => {
  it("conta ocupadas, vagas e o VGV em jogo (ignorando lead sem preço)", () => {
    const r = resumoCarteira(
      [linha("fundo", 1, 250000), linha("conversa", 2, null), linha("sla", 3, 300000)],
      40,
    );
    expect(r.ocupadas).toBe(3);
    expect(r.vagas).toBe(37);
    expect(r.estourou).toBe(false);
    expect(r.emJogo).toBe(550000);
    expect(r.porFaixa).toEqual({ fundo: 1, resgate: 0, conversa: 1, sla: 1 });
  });

  it("carteira acima do teto: vagas nunca fica negativo", () => {
    const linhas = Array.from({ length: 45 }, (_, i) => linha("fundo", i + 1));
    const r = resumoCarteira(linhas, 40);
    expect(r.ocupadas).toBe(45);
    expect(r.vagas).toBe(0);
    expect(r.estourou).toBe(true);
    expect(r.fundo).toBe(45);
  });

  it("faixa desconhecida não quebra a contagem nem entra num balde errado", () => {
    const r = resumoCarteira([linha("fundo", 1), linha("faixa_nova_do_banco", 2)], 40);
    expect(r.ocupadas).toBe(2);
    expect(r.porFaixa.fundo).toBe(1);
    expect(Object.values(r.porFaixa).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("fraseDoPlacar", () => {
  it("no estouro, diz que nada foi devolvido — a regra §4.1 na voz da tela", () => {
    const linhas = Array.from({ length: 45 }, (_, i) => linha("fundo", i + 1));
    const frase = fraseDoPlacar(resumoCarteira(linhas, 40));
    expect(frase).toContain("45 na carteira");
    expect(frase).toContain("45 no fundo do funil");
    expect(frase).toContain("nenhum negócio avançado foi devolvido");
  });

  it("carteira exatamente cheia não é estouro, e a frase muda", () => {
    const linhas = Array.from({ length: 40 }, (_, i) => linha("conversa", i + 1));
    const r = resumoCarteira(linhas, 40);
    expect(r.estourou).toBe(false);
    expect(fraseDoPlacar(r)).toContain("Carteira cheia");
  });

  it("singular de vaga", () => {
    const linhas = Array.from({ length: 39 }, (_, i) => linha("conversa", i + 1));
    expect(fraseDoPlacar(resumoCarteira(linhas, 40))).toContain("1 vaga livre");
  });
});

describe("categoriaDoMotivo", () => {
  it("lê as frases que o banco produz", () => {
    expect(categoriaDoMotivo("sem movimento há 60 dias")).toBe("sem_movimento");
    expect(categoriaDoMotivo("sem próximo passo definido")).toBe("sem_passo");
    expect(categoriaDoMotivo("nunca respondeu ao primeiro contato")).toBe("sem_conversa");
    expect(categoriaDoMotivo("sem conversa viva")).toBe("sem_conversa");
    expect(categoriaDoMotivo("acima do teto de 40")).toBe("sem_vaga");
    expect(categoriaDoMotivo("faixa cheia (sla)")).toBe("sem_vaga");
  });

  it("motivo novo no banco cai num balde em vez de sumir da tela", () => {
    expect(categoriaDoMotivo("motivo que ainda não existe")).toBe("sem_vaga");
  });
});

describe("agrupamentos", () => {
  it("a Reserva agrupa por motivo, na ordem em que custa dinheiro", () => {
    const g = agruparReservaPorMotivo([
      reserva("sem movimento há 60 dias"),
      reserva("acima do teto de 40"),
      reserva("sem próximo passo definido"),
      reserva("sem movimento há 31 dias"),
    ]);
    expect(g.map((x) => x.categoria)).toEqual(["sem_passo", "sem_movimento", "sem_vaga"]);
    expect(g.find((x) => x.categoria === "sem_movimento")?.quantidade).toBe(2);
  });

  it("a carteira agrupa por faixa na precedência, e faixa vazia não vira seção", () => {
    const g = agruparPorFaixa([linha("sla", 3), linha("fundo", 1), linha("conversa", 2)]);
    expect(g.map((x) => x.faixa)).toEqual(["fundo", "conversa", "sla"]);
    expect(g[0].itens[0].posicao).toBe(1);
  });
});
