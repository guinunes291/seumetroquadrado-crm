/**
 * Leitura da carteira por corretor (src/features/gestao/carteira-stats).
 *
 * O que está em jogo: a tela de gestão mostrava `aguardando` como se fosse
 * carteira. Medido em 14/09/2026, são 6.186 leads com dono — e ele mistura
 * duas conversas diferentes: lead que ainda não teve primeiro contato (topo
 * de funil, mora em /prospeccao) e lead abandonado (o que a régua leva).
 *
 * `pctParada` é o número que decide qual conversa o gestor vai ter com o
 * corretor, e o denominador EXCLUI prospecção de propósito: lead que nunca
 * foi tocado não está parado, está na fila.
 */
import { describe, expect, it } from "vitest";
import {
  SEM_DONO,
  excedente,
  filtrarPorEscopo,
  fraseDaCarteira,
  grupoDoLead,
  indexarPorCorretor,
  pctParada,
  parseCarteiraStats,
  prazosDaCasa,
  textoTratativa,
  tomDaCarteira,
  type CarteiraStats,
  type LeadParaEscopo,
} from "@/features/gestao/carteira-stats";

function stats(p: Partial<CarteiraStats> = {}): CarteiraStats {
  return {
    corretor_id: "00000000-0000-4000-8000-000000000001",
    total: 0,
    ativa: 0,
    prospeccao: 0,
    parada: 0,
    fundo: 0,
    ganhos: 0,
    perdidos: 0,
    ...p,
  };
}

describe("pctParada", () => {
  it("não conta prospecção no denominador", () => {
    // 10 em tratativa, 10 parados, 980 em prospecção: a carteira está 50%
    // parada, não 1%. Incluir prospecção diluiria o problema até sumir.
    expect(pctParada(stats({ ativa: 10, parada: 10, prospeccao: 980 }))).toBe(50);
  });

  it("carteira sem tratativa nem parados não tem percentual", () => {
    expect(pctParada(stats({ prospeccao: 500 }))).toBeNull();
  });

  it("tudo parado é 100%", () => {
    expect(pctParada(stats({ ativa: 0, parada: 40 }))).toBe(100);
  });

  it("o excedente do teto entra no denominador", () => {
    // 90 em tratativa (65 dentro do teto + 25 acima) e 10 parados: 10%, não
    // os 13% que sairiam se o excedente ficasse de fora da conta.
    expect(pctParada(stats({ ativa: 65, acima_do_teto: 25, parada: 10 }))).toBe(10);
  });
});

describe("teto", () => {
  it("sem teto na resposta, a frase não inventa denominador", () => {
    expect(textoTratativa(stats({ ativa: 32 }))).toBe("32 em tratativa");
    expect(excedente(stats({ ativa: 32 }))).toBe(0);
  });

  it("com teto, o card mostra quanto cabe", () => {
    expect(textoTratativa(stats({ ativa: 32, teto: 65 }))).toBe("32 de 65 em tratativa");
    expect(textoTratativa(stats({ ativa: 65, teto: 65, acima_do_teto: 25 }))).toBe(
      "65 de 65 em tratativa",
    );
  });

  it("o teto vem do servidor, não de um 65 fixo no cliente", () => {
    // Se a gestão baixar a capacidade, a tela acompanha sozinha.
    expect(textoTratativa(stats({ ativa: 12, teto: 40 }))).toBe("12 de 40 em tratativa");
  });
});

describe("tomDaCarteira", () => {
  it("separa saudável, atenção e crítico", () => {
    expect(tomDaCarteira(stats({ ativa: 80, parada: 20 }))).toBe("saudavel");
    expect(tomDaCarteira(stats({ ativa: 70, parada: 30 }))).toBe("atencao");
    expect(tomDaCarteira(stats({ ativa: 30, parada: 70 }))).toBe("critico");
  });

  it("sem base para julgar, não julga", () => {
    expect(tomDaCarteira(stats({ prospeccao: 100 }))).toBeNull();
  });
});

describe("fraseDaCarteira", () => {
  it("abre pelo que está vivo, e omite o que é zero", () => {
    expect(fraseDaCarteira(stats({ ativa: 12, parada: 40, prospeccao: 300 }))).toBe(
      "12 em tratativa · 40 parados · 300 em prospecção",
    );
    expect(fraseDaCarteira(stats({ ativa: 12 }))).toBe("12 em tratativa");
  });

  it("quem estoura o teto aparece, não some", () => {
    expect(fraseDaCarteira(stats({ ativa: 65, teto: 65, acima_do_teto: 25, parada: 40 }))).toBe(
      "65 de 65 em tratativa · +25 acima do teto · 40 parados",
    );
  });
});

describe("indexarPorCorretor", () => {
  it("guarda os sem dono sob a chave própria", () => {
    const m = indexarPorCorretor([
      stats({ corretor_id: null, ativa: 3 }),
      stats({ corretor_id: "00000000-0000-4000-8000-000000000002", ativa: 7 }),
    ]);
    expect(m.get(SEM_DONO)?.ativa).toBe(3);
    expect(m.get("00000000-0000-4000-8000-000000000002")?.ativa).toBe(7);
  });
});

describe("parseCarteiraStats", () => {
  it("aceita bigint como string — é assim que o PostgREST manda", () => {
    const [linha] = parseCarteiraStats([
      {
        corretor_id: null,
        total: "1200",
        ativa: "32",
        prospeccao: "900",
        parada: "260",
        fundo: "6",
        ganhos: "1",
        perdidos: "1",
      },
    ]);
    expect(linha.ativa).toBe(32);
    expect(linha.parada).toBe(260);
  });

  it("derruba linha malformada em vez de renderizar carteira errada", () => {
    expect(() => parseCarteiraStats([{ corretor_id: null }])).toThrow();
  });

  it("aceita a linha do banco sem as colunas de teto (migration não aplicada)", () => {
    // Ausente ≠ zero: a tela some com a leitura de teto em vez de afirmar que
    // o teto é zero ou que ninguém está acima dele.
    const [linha] = parseCarteiraStats([
      {
        corretor_id: null,
        total: "10",
        ativa: "4",
        prospeccao: "3",
        parada: "2",
        fundo: "0",
        ganhos: "1",
        perdidos: "0",
      },
    ]);
    expect(linha.teto).toBeUndefined();
    expect(linha.acima_do_teto).toBeUndefined();
    expect(textoTratativa(linha)).toBe("4 em tratativa");
  });

  it("lê teto e prazos como string, do jeito que o PostgREST manda", () => {
    const [linha] = parseCarteiraStats([
      {
        corretor_id: null,
        total: "10",
        ativa: "4",
        prospeccao: "3",
        parada: "2",
        fundo: "0",
        ganhos: "1",
        perdidos: "0",
        acima_do_teto: "25",
        teto: "65",
        dias_atendimento: "7",
        dias_avancado: "30",
      },
    ]);
    expect(linha.teto).toBe(65);
    expect(linha.acima_do_teto).toBe(25);
    expect(prazosDaCasa([linha])).toEqual({ atendimento: 7, avancado: 30 });
  });
});

describe("prazosDaCasa", () => {
  it("sem prazos na resposta, não há escopo", () => {
    expect(prazosDaCasa([stats(), stats()])).toBeNull();
  });

  it("qualquer linha serve — o prazo é da casa, não do corretor", () => {
    expect(prazosDaCasa([stats(), stats({ dias_atendimento: 7, dias_avancado: 30 })])).toEqual({
      atendimento: 7,
      avancado: 30,
    });
  });
});

describe("grupoDoLead", () => {
  const prazos = { atendimento: 7, avancado: 30 };
  const agora = Date.parse("2026-09-14T12:00:00Z");
  const diasAtras = (n: number) => new Date(agora - n * 86_400_000).toISOString();

  function lead(p: Partial<LeadParaEscopo> = {}): LeadParaEscopo {
    return {
      status: "em_atendimento",
      created_at: diasAtras(120),
      ultima_interacao: null,
      ultimo_contato: null,
      ...p,
    };
  }

  it("o prazo depende da fase: agendado tem 30 dias, atendimento tem 7", () => {
    // O mesmo lead, parado há 20 dias, cai em grupos diferentes conforme a
    // fase. É a regra da régua de posse, e a lista não pode discordar dela.
    expect(grupoDoLead(lead({ ultima_interacao: diasAtras(20) }), prazos, agora)).toBe("parado");
    expect(
      grupoDoLead(lead({ status: "agendado", ultima_interacao: diasAtras(20) }), prazos, agora),
    ).toBe("tratativa");
    expect(
      grupoDoLead(lead({ status: "agendado", ultima_interacao: diasAtras(40) }), prazos, agora),
    ).toBe("parado");
  });

  it("prospecção velha é prospecção, não carteira parada", () => {
    expect(grupoDoLead(lead({ status: "aguardando_atendimento" }), prazos, agora)).toBe(
      "prospeccao",
    );
    expect(grupoDoLead(lead({ status: "novo" }), prazos, agora)).toBe("prospeccao");
  });

  it("ganho e perdido saem da carteira", () => {
    expect(grupoDoLead(lead({ status: "contrato_fechado" }), prazos, agora)).toBe("fechado");
    expect(grupoDoLead(lead({ status: "perdido" }), prazos, agora)).toBe("fechado");
  });

  it("o relógio é o mais recente entre interação e contato, e cai em created_at", () => {
    // Mesmo relógio da higiene, da Fila Única e do Bolsão.
    expect(
      grupoDoLead(
        lead({ ultima_interacao: diasAtras(30), ultimo_contato: diasAtras(2) }),
        prazos,
        agora,
      ),
    ).toBe("tratativa");
    expect(grupoDoLead(lead({ created_at: diasAtras(2) }), prazos, agora)).toBe("tratativa");
    expect(grupoDoLead(lead({ created_at: diasAtras(30) }), prazos, agora)).toBe("parado");
  });
});

describe("filtrarPorEscopo", () => {
  const prazos = { atendimento: 7, avancado: 30 };
  const agora = Date.parse("2026-09-14T12:00:00Z");
  const diasAtras = (n: number) => new Date(agora - n * 86_400_000).toISOString();

  const base = [
    {
      id: "vivo",
      status: "em_atendimento",
      created_at: diasAtras(1),
      ultima_interacao: null,
      ultimo_contato: null,
    },
    {
      id: "parado",
      status: "em_atendimento",
      created_at: diasAtras(40),
      ultima_interacao: null,
      ultimo_contato: null,
    },
    {
      id: "prospec",
      status: "aguardando_atendimento",
      created_at: diasAtras(40),
      ultima_interacao: null,
      ultimo_contato: null,
    },
    {
      id: "perdido",
      status: "perdido",
      created_at: diasAtras(40),
      ultima_interacao: null,
      ultimo_contato: null,
    },
  ];

  it("em tratativa deixa de fora prospecção, parados e fechados", () => {
    // É o ponto da mudança: a lista era dominada por "Aguardando Atendimento".
    expect(filtrarPorEscopo(base, "tratativa", prazos, agora).map((l) => l.id)).toEqual(["vivo"]);
  });

  it("parados mostra só o que a régua de devolução leva", () => {
    expect(filtrarPorEscopo(base, "parados", prazos, agora).map((l) => l.id)).toEqual(["parado"]);
  });

  it("todos não filtra nada — é a saída de emergência do gestor", () => {
    expect(filtrarPorEscopo(base, "todos", prazos, agora)).toHaveLength(4);
  });

  it("sem prazos do servidor, mostra tudo em vez de filtrar por prazo chutado", () => {
    expect(filtrarPorEscopo(base, "tratativa", null, agora)).toHaveLength(4);
  });
});
