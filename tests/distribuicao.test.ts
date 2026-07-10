import { describe, it, expect } from "vitest";
import {
  calcPctTrabalhado,
  dentroDoHorario,
  motivoExcecaoLabel,
  motivoInaptidaoLabel,
  participacaoPercentual,
  proximoDaVez,
  resolverRoletaPorOrigem,
  resumoDecisao,
  roletaLabel,
  MOTIVO_INAPTIDAO_LABEL,
  MOTIVO_EXCECAO_LABEL,
} from "@/lib/distribuicao";

// Mapa origem→roleta padrão semeado pela migration de fundação.
const MAPA_PADRAO: Record<string, string | null> = {
  facebook: "plantao",
  google_sheets: "plantao",
  site: "landing",
  indicacao: "plantao",
  captacao_corretor: "plantao",
  whatsapp: "plantao",
  telefone: "plantao",
  plantao: "plantao",
  agendamento_self_service: "plantao",
  chatbot: "marquinhos",
  outro: "plantao",
  importacao: "plantao",
};

describe("calcPctTrabalhado — mesma régua do banco", () => {
  it("carteira vazia → 100% (novato é apto)", () => {
    expect(calcPctTrabalhado(0, 0)).toBe(100);
  });

  it("exemplo da regra de negócio: 100 leads, 8 aguardando → 92%", () => {
    expect(calcPctTrabalhado(100, 8)).toBe(92);
  });

  it("fronteira do mínimo: 10 leads, 1 aguardando → exatamente 90%", () => {
    expect(calcPctTrabalhado(10, 1)).toBe(90);
  });

  it("tudo aguardando → 0%", () => {
    expect(calcPctTrabalhado(5, 5)).toBe(0);
  });

  it("arredonda para 1 casa decimal", () => {
    expect(calcPctTrabalhado(3, 1)).toBe(66.7);
    expect(calcPctTrabalhado(7, 2)).toBe(71.4);
  });
});

describe("resolverRoletaPorOrigem — triagem origem/canal → roleta", () => {
  it("chatbot → marquinhos; site → landing; demais → plantão", () => {
    for (const [origem, esperado] of Object.entries(MAPA_PADRAO)) {
      expect(resolverRoletaPorOrigem(origem, null, MAPA_PADRAO)).toBe(esperado);
    }
  });

  it("canal webhook_landing tem precedência sobre a origem", () => {
    expect(resolverRoletaPorOrigem("outro", "webhook_landing", MAPA_PADRAO)).toBe("landing");
    expect(resolverRoletaPorOrigem("chatbot", "webhook_landing", MAPA_PADRAO)).toBe("landing");
  });

  it("origem não mapeada → null (vira exceção no motor)", () => {
    expect(resolverRoletaPorOrigem("origem_futura", null, MAPA_PADRAO)).toBeNull();
    expect(resolverRoletaPorOrigem("outro", null, { ...MAPA_PADRAO, outro: null })).toBeNull();
  });
});

describe("proximoDaVez — rodízio menos-recente (NULLS FIRST)", () => {
  const p = (
    id: string,
    apto: boolean,
    ultimo: string | null,
    incluido = "2026-01-01T00:00:00Z",
  ) => ({ corretor_id: id, apto, ultimo_lead_em: ultimo, incluido_em: incluido });

  it("quem nunca recebeu vem primeiro", () => {
    const lista = [p("a", true, "2026-07-01T10:00:00Z"), p("b", true, null)];
    expect(proximoDaVez(lista)?.corretor_id).toBe("b");
  });

  it("entre quem já recebeu, ganha o há mais tempo sem receber", () => {
    const lista = [
      p("a", true, "2026-07-09T10:00:00Z"),
      p("b", true, "2026-07-08T10:00:00Z"),
      p("c", true, "2026-07-09T09:00:00Z"),
    ];
    expect(proximoDaVez(lista)?.corretor_id).toBe("b");
  });

  it("inaptos nunca são o próximo, mesmo sem nunca ter recebido", () => {
    const lista = [p("a", false, null), p("b", true, "2026-07-01T10:00:00Z")];
    expect(proximoDaVez(lista)?.corretor_id).toBe("b");
  });

  it("ninguém apto → null", () => {
    expect(proximoDaVez([p("a", false, null)])).toBeNull();
    expect(proximoDaVez([])).toBeNull();
  });

  it("empate no cursor desempata pela inclusão mais antiga", () => {
    const lista = [
      p("a", true, null, "2026-02-01T00:00:00Z"),
      p("b", true, null, "2026-01-01T00:00:00Z"),
    ];
    expect(proximoDaVez(lista)?.corretor_id).toBe("b");
  });
});

describe("dentroDoHorario — janela de funcionamento BRT", () => {
  it("sem janela configurada → sempre aberto", () => {
    expect(dentroDoHorario(null, null, "03:00")).toBe(true);
    expect(dentroDoHorario("08:00", null, "03:00")).toBe(true);
  });

  it("janela normal 08:00–18:00", () => {
    expect(dentroDoHorario("08:00", "18:00", "07:59")).toBe(false);
    expect(dentroDoHorario("08:00", "18:00", "08:00")).toBe(true);
    expect(dentroDoHorario("08:00", "18:00", "12:30")).toBe(true);
    expect(dentroDoHorario("08:00", "18:00", "18:00")).toBe(true);
    expect(dentroDoHorario("08:00", "18:00", "18:01")).toBe(false);
  });

  it("janela atravessando a meia-noite 20:00–02:00", () => {
    expect(dentroDoHorario("20:00", "02:00", "21:00")).toBe(true);
    expect(dentroDoHorario("20:00", "02:00", "01:30")).toBe(true);
    expect(dentroDoHorario("20:00", "02:00", "03:00")).toBe(false);
    expect(dentroDoHorario("20:00", "02:00", "12:00")).toBe(false);
  });

  it("aceita HH:MM:SS vindo do banco", () => {
    expect(dentroDoHorario("08:00:00", "18:00:00", "09:15")).toBe(true);
  });
});

describe("participacaoPercentual", () => {
  it("fatia do corretor no volume da roleta", () => {
    expect(participacaoPercentual(5, 20)).toBe(25);
    expect(participacaoPercentual(1, 3)).toBe(33.3);
  });

  it("roleta sem volume → 0", () => {
    expect(participacaoPercentual(0, 0)).toBe(0);
    expect(participacaoPercentual(5, 0)).toBe(0);
  });
});

describe("labels pt-BR — vocabulário completo", () => {
  it("todo motivo de inaptidão tem label legível", () => {
    for (const [codigo, label] of Object.entries(MOTIVO_INAPTIDAO_LABEL)) {
      expect(label.length).toBeGreaterThan(3);
      expect(motivoInaptidaoLabel(codigo)).toBe(label);
    }
  });

  it("todo motivo de exceção tem label legível", () => {
    for (const [codigo, label] of Object.entries(MOTIVO_EXCECAO_LABEL)) {
      expect(label.length).toBeGreaterThan(3);
      expect(motivoExcecaoLabel(codigo)).toBe(label);
    }
  });

  it("código desconhecido cai no próprio código (nunca quebra)", () => {
    expect(motivoInaptidaoLabel("motivo_novo_do_futuro")).toBe("motivo_novo_do_futuro");
    expect(motivoExcecaoLabel("xyz")).toBe("xyz");
  });

  it("roletaLabel", () => {
    expect(roletaLabel("plantao")).toBe("Roleta Plantão");
    expect(roletaLabel("marquinhos")).toBe("Roleta Marquinhos");
    expect(roletaLabel(null)).toBe("—");
    expect(roletaLabel("desconhecida")).toBe("desconhecida");
  });
});

describe("resumoDecisao — parser do contexto jsonb", () => {
  it("estrutura completa", () => {
    const ctx = {
      roleta: "plantao",
      gatilho: "webhook",
      regra: "rodizio_menos_recente",
      percentual_minimo: 90,
      aptos: [{ corretor_id: "a", nome: "Ana", ultimo_lead_em: null }],
      inaptos: [
        { corretor_id: "b", nome: "Bruno", motivos: ["ausente_hoje"], pct_trabalhado: 70 },
      ],
      vencedor: { corretor_id: "a", nome: "Ana" },
      corretor_anterior: { corretor_id: "c", ativo: false, politica: "sempre_nova_roleta" },
      dedup: { duplicado_id: "lead-1" },
    };
    const r = resumoDecisao(ctx);
    expect(r.roleta).toBe("plantao");
    expect(r.percentualMinimo).toBe(90);
    expect(r.aptos).toHaveLength(1);
    expect(r.inaptos[0]!.motivos).toContain("ausente_hoje");
    expect(r.vencedor?.nome).toBe("Ana");
    expect(r.corretorAnterior?.politica).toBe("sempre_nova_roleta");
    expect(r.duplicadoId).toBe("lead-1");
  });

  it("contexto vazio/malformado não quebra", () => {
    expect(resumoDecisao(null).aptos).toEqual([]);
    expect(resumoDecisao(undefined).vencedor).toBeNull();
    expect(resumoDecisao({ aptos: "not-an-array" }).aptos).toEqual([]);
    expect(resumoDecisao("string").duplicadoId).toBeNull();
  });
});
