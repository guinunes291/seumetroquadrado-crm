import { describe, expect, it } from "vitest";
import {
  comparecimentoSemana,
  inicioSemanaSdr,
  offsetPadraoSdr,
  rangeSemanaSdr,
  resumoSemanaSdr,
  sdrDoRegistro,
  semanaFechada,
  semanaSdr,
  semanasRecentesSdr,
  totalSemanaSdr,
} from "@/features/dashboard/semana-sdr";

// Setembro/2026: 19 é SÁBADO, 25 é sexta. A semana de pagamento que contém
// qualquer dia de 19/09 a 25/09 é sáb 19/09 → sex 25/09.
const d = (iso: string) => new Date(`${iso}T12:00:00`);

describe("inicioSemanaSdr", () => {
  it("volta para o SÁBADO em qualquer dia da semana", () => {
    const esperado = "2026-09-19";
    for (const dia of [
      "2026-09-19", // sábado — o próprio
      "2026-09-20", // domingo
      "2026-09-21", // segunda
      "2026-09-23", // quarta
      "2026-09-25", // sexta
    ]) {
      const inicio = inicioSemanaSdr(d(dia));
      expect(`${inicio.getFullYear()}-09-${String(inicio.getDate()).padStart(2, "0")}`).toBe(
        esperado,
      );
      expect(inicio.getDay()).toBe(6);
      expect(inicio.getHours()).toBe(0);
      expect(inicio.getMinutes()).toBe(0);
    }
  });

  it("o sábado seguinte já é OUTRA semana — é o dia do pagamento, não o fim dela", () => {
    const inicio = inicioSemanaSdr(d("2026-09-26"));
    expect(inicio.getDate()).toBe(26);
  });
});

describe("semanaSdr", () => {
  it("vai de sábado 00:00 a sexta 23:59:59.999", () => {
    const s = semanaSdr(0, d("2026-09-23"));
    expect(s.inicio.getDate()).toBe(19);
    expect(s.inicio.getDay()).toBe(6);
    expect(s.fim.getDate()).toBe(25);
    expect(s.fim.getDay()).toBe(5);
    expect(s.fim.getHours()).toBe(23);
    expect(s.fim.getMilliseconds()).toBe(999);
    expect(s.chave).toBe("2026-09-19");
    expect(s.label).toBe("19/09 a 25/09");
    expect(s.rotulo).toBe("sáb 19/09 → sex 25/09");
  });

  it("offset negativo anda para semanas anteriores", () => {
    expect(semanaSdr(-1, d("2026-09-23")).chave).toBe("2026-09-12");
    expect(semanaSdr(-2, d("2026-09-23")).chave).toBe("2026-09-05");
  });

  it("não deixa buraco nem sobreposição entre semanas seguidas", () => {
    const atual = semanaSdr(0, d("2026-09-23"));
    const anterior = semanaSdr(-1, d("2026-09-23"));
    expect(atual.inicio.getTime() - anterior.fim.getTime()).toBe(1);
  });

  it("atravessa a virada de mês e de ano", () => {
    // 02/01/2027 é sábado; a semana anterior começa em 26/12/2026.
    expect(semanaSdr(0, d("2027-01-04")).chave).toBe("2027-01-02");
    expect(semanaSdr(-1, d("2027-01-04")).chave).toBe("2026-12-26");
  });
});

describe("offsetPadraoSdr", () => {
  it("no SÁBADO abre a semana que acabou de fechar — é a que vai ser paga", () => {
    expect(offsetPadraoSdr(d("2026-09-26"))).toBe(-1);
  });

  it("nos outros dias abre a semana em curso", () => {
    for (const dia of ["2026-09-20", "2026-09-21", "2026-09-23", "2026-09-25"]) {
      expect(offsetPadraoSdr(d(dia))).toBe(0);
    }
  });
});

describe("semanasRecentesSdr / semanaFechada / rangeSemanaSdr", () => {
  it("lista da mais recente para a mais antiga, sem repetir", () => {
    const semanas = semanasRecentesSdr(4, d("2026-09-23"));
    expect(semanas.map((s) => s.chave)).toEqual([
      "2026-09-19",
      "2026-09-12",
      "2026-09-05",
      "2026-08-29",
    ]);
  });

  it("semana em curso não está fechada; a anterior está", () => {
    const agora = d("2026-09-23");
    expect(semanaFechada(semanaSdr(0, agora), agora)).toBe(false);
    expect(semanaFechada(semanaSdr(-1, agora), agora)).toBe(true);
  });

  it("o range cobre a semana inteira em ISO", () => {
    const s = semanaSdr(0, d("2026-09-23"));
    const r = rangeSemanaSdr(s);
    expect(new Date(r.di).getTime()).toBe(s.inicio.getTime());
    expect(new Date(r.df).getTime()).toBe(s.fim.getTime());
  });
});

describe("sdrDoRegistro", () => {
  const sdrs = new Set(["sdr-1", "sdr-2"]);

  it("o dono de pré-venda do lead manda — mesmo que outra pessoa tenha criado o registro", () => {
    expect(sdrDoRegistro("sdr-1", "corretor-9", sdrs)).toBe("sdr-1");
  });

  it("sem SDR no lead, vale quem criou — desde que seja SDR (carteira antiga)", () => {
    expect(sdrDoRegistro(null, "sdr-2", sdrs)).toBe("sdr-2");
    expect(sdrDoRegistro(null, "corretor-9", sdrs)).toBeNull();
    expect(sdrDoRegistro(null, null, sdrs)).toBeNull();
  });

  it("SDR que saiu do time continua dono do histórico dele", () => {
    expect(sdrDoRegistro("ex-sdr", "corretor-9", sdrs)).toBe("ex-sdr");
  });
});

describe("resumoSemanaSdr", () => {
  const sdrs = [
    { id: "a", nome: "Ana" },
    { id: "b", nome: "Bruno" },
  ];

  it("conta os quatro números por SDR e separa no-show de visita realizada", () => {
    const linhas = resumoSemanaSdr({
      sdrs,
      agendamentos: [{ sdr_id: "a" }, { sdr_id: "a" }, { sdr_id: "b" }, { sdr_id: null }],
      visitas: [
        { sdr_id: "a", status: "realizado" },
        { sdr_id: "a", status: "nao_compareceu" },
        { sdr_id: "a", status: "agendado" }, // sem desfecho: não paga nem pune
        { sdr_id: "b", status: "realizado" },
        { sdr_id: null, status: "realizado" },
      ],
      pastas: [{ sdr_id: "a" }, { sdr_id: "b" }, { sdr_id: "b" }],
      vendas: [{ sdr_id: "b", valor: 300000 }],
      vendasRecebidas: [{ sdr_id: "a", valor: 250000 }],
    });
    const ana = linhas.find((l) => l.sdr_id === "a")!;
    const bruno = linhas.find((l) => l.sdr_id === "b")!;

    expect(ana).toMatchObject({
      agendamentos: 2,
      visitas_realizadas: 1,
      no_show: 1,
      pastas: 1,
      vendas: 0,
      vgv: 0,
      vendas_recebidas: 1,
      vgv_recebido: 250000,
    });
    expect(bruno).toMatchObject({
      agendamentos: 1,
      visitas_realizadas: 1,
      no_show: 0,
      pastas: 2,
      vendas: 1,
      vgv: 300000,
      vendas_recebidas: 0,
    });
  });

  it("registro sem SDR não vira linha nem entra em ninguém", () => {
    const linhas = resumoSemanaSdr({
      sdrs,
      agendamentos: [{ sdr_id: null }],
      visitas: [{ sdr_id: null, status: "realizado" }],
      pastas: [{ sdr_id: null }],
      vendas: [{ sdr_id: null, valor: 999 }],
    });
    expect(linhas).toHaveLength(2);
    expect(totalSemanaSdr(linhas)).toMatchObject({
      agendamentos: 0,
      visitas_realizadas: 0,
      pastas: 0,
      vendas: 0,
      vgv: 0,
    });
  });

  it("SDR sem produção aparece zerado — zero é informação na folha", () => {
    const linhas = resumoSemanaSdr({
      sdrs,
      agendamentos: [{ sdr_id: "a" }],
      visitas: [],
      pastas: [],
      vendas: [],
    });
    const bruno = linhas.find((l) => l.sdr_id === "b")!;
    expect(bruno.nome).toBe("Bruno");
    expect(bruno.agendamentos).toBe(0);
  });

  it("quem produziu sem estar na lista de SDRs entra com o nome do perfil", () => {
    const linhas = resumoSemanaSdr({
      sdrs,
      agendamentos: [],
      visitas: [{ sdr_id: "c", status: "realizado" }],
      pastas: [],
      vendas: [],
      nomes: new Map([["c", "Carla (ex-SDR)"]]),
    });
    expect(linhas.find((l) => l.sdr_id === "c")?.nome).toBe("Carla (ex-SDR)");
  });

  it("ordena por visita realizada, o item que o SDR recebe por unidade", () => {
    const linhas = resumoSemanaSdr({
      sdrs,
      agendamentos: [{ sdr_id: "a" }, { sdr_id: "a" }, { sdr_id: "a" }],
      visitas: [
        { sdr_id: "b", status: "realizado" },
        { sdr_id: "b", status: "realizado" },
        { sdr_id: "a", status: "realizado" },
      ],
      pastas: [],
      vendas: [],
    });
    expect(linhas.map((l) => l.sdr_id)).toEqual(["b", "a"]);
  });
});

describe("totalSemanaSdr / comparecimentoSemana", () => {
  it("soma a equipe inteira", () => {
    const linhas = resumoSemanaSdr({
      sdrs: [
        { id: "a", nome: "Ana" },
        { id: "b", nome: "Bruno" },
      ],
      agendamentos: [{ sdr_id: "a" }, { sdr_id: "b" }],
      visitas: [
        { sdr_id: "a", status: "realizado" },
        { sdr_id: "b", status: "nao_compareceu" },
      ],
      pastas: [{ sdr_id: "a" }],
      vendas: [
        { sdr_id: "a", valor: 100000 },
        { sdr_id: "b", valor: 200000 },
      ],
      vendasRecebidas: [{ sdr_id: "b", valor: 200000 }],
    });
    expect(totalSemanaSdr(linhas)).toEqual({
      agendamentos: 2,
      visitas_realizadas: 1,
      no_show: 1,
      pastas: 1,
      vendas: 2,
      vgv: 300000,
      vendas_recebidas: 1,
      vgv_recebido: 200000,
    });
  });

  it("comparecimento é null sem visita com desfecho", () => {
    expect(comparecimentoSemana(0, 0)).toBeNull();
    expect(comparecimentoSemana(3, 1)).toBe(75);
    expect(comparecimentoSemana(1, 2)).toBe(33.3);
  });
});
