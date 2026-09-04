import { describe, expect, it } from "vitest";
import {
  acoesDisponiveis,
  aguardaValidacao,
  classificarAgenda,
  fraseResumo,
  janelaDaAgenda,
  mensagemConfirmacao,
  mensagemContato,
  payloadSalvarVisita,
  registroVisitaInicial,
  remarcarPayload,
  resumoDoDia,
  rotuloDoDia,
  sugestaoProximoContato,
  validarRegistroVisita,
  validarRemarcacao,
  type ItemAgendaDia,
  type RegistroVisita,
} from "@/features/agenda/agenda-do-dia";

// Sexta-feira, 4 de setembro de 2026, 15h (fuso local do teste).
const AGORA = new Date(2026, 8, 4, 15, 0, 0, 0);

const local = (dia: number, hora: number, minuto = 0, mes = 8) =>
  new Date(2026, mes, dia, hora, minuto, 0, 0);

let seq = 0;
function item(over: Partial<ItemAgendaDia> & { inicio?: Date; duracaoMin?: number } = {}) {
  const inicio = over.inicio ?? local(4, 10);
  const fim = new Date(inicio.getTime() + (over.duracaoMin ?? 60) * 60_000);
  const { inicio: _i, duracaoMin: _d, ...resto } = over;
  return {
    id: `ag-${++seq}`,
    lead_id: "lead-1",
    corretor_id: "c1",
    tipo: "visita",
    status: "agendado",
    titulo: "Visita - Vibra Mooca",
    descricao: null,
    local: "Rua da Mooca, 100",
    data_inicio: inicio.toISOString(),
    data_fim: fim.toISOString(),
    lembrete_minutos: 30,
    lead: { id: "lead-1", nome: "Ivi Camila Souza", telefone: "11999998888" },
    ...resto,
  } as ItemAgendaDia;
}

describe("janelaDaAgenda", () => {
  it("vai de 7 dias atrás 00:00 até amanhã 23:59:59.999, no fuso local", () => {
    const { inicio, fim } = janelaDaAgenda(AGORA);
    expect(inicio.getTime()).toBe(local(4 - 7, 0).getTime());
    expect(fim.getTime()).toBe(local(6, 0).getTime() - 1);
  });
});

describe("classificarAgenda", () => {
  it("separa pendentes (visitas passadas sem validação), hoje e amanhã", () => {
    const ontemSemValidar = item({ inicio: local(3, 14) });
    const hoje10 = item({ inicio: local(4, 10), status: "confirmado" });
    const hoje18 = item({ inicio: local(4, 18), tipo: "reuniao" });
    const amanha = item({ inicio: local(5, 10) });
    const cancelado = item({ inicio: local(4, 11), status: "cancelado" });
    const ontemRealizado = item({ inicio: local(3, 9), status: "realizado" });
    const ontemLigacao = item({ inicio: local(3, 9), tipo: "ligacao" });
    const depoisDeAmanha = item({ inicio: local(6, 10) });

    const cls = classificarAgenda(
      [
        depoisDeAmanha,
        hoje18,
        amanha,
        cancelado,
        ontemRealizado,
        ontemLigacao,
        hoje10,
        ontemSemValidar,
      ],
      AGORA,
    );

    expect(cls.pendentes.map((i) => i.id)).toEqual([ontemSemValidar.id]);
    expect(cls.hoje.map((i) => i.id)).toEqual([hoje10.id, hoje18.id]);
    expect(cls.amanha.map((i) => i.id)).toEqual([amanha.id]);
  });

  it("mantém concluídos de hoje na lista (o dia inteiro, em ordem de hora)", () => {
    const feita = item({ inicio: local(4, 9), status: "realizado" });
    const faltou = item({ inicio: local(4, 11), status: "nao_compareceu" });
    const proxima = item({ inicio: local(4, 16) });
    const cls = classificarAgenda([proxima, faltou, feita], AGORA);
    expect(cls.hoje.map((i) => i.id)).toEqual([feita.id, faltou.id, proxima.id]);
    expect(cls.pendentes).toHaveLength(0);
  });

  it("ignora data inválida em vez de quebrar a tela", () => {
    const quebrado = item({ data_inicio: "não-é-data" });
    expect(classificarAgenda([quebrado], AGORA).hoje).toHaveLength(0);
  });
});

describe("aguardaValidacao", () => {
  it("só visita com lead, ainda aberta, cujo horário já acabou", () => {
    expect(aguardaValidacao(item({ inicio: local(4, 13) }), AGORA)).toBe(true);
    expect(aguardaValidacao(item({ inicio: local(4, 14, 30) }), AGORA)).toBe(false); // termina 15:30
    expect(aguardaValidacao(item({ inicio: local(4, 13), lead_id: null, lead: null }), AGORA)).toBe(
      false,
    );
    expect(aguardaValidacao(item({ inicio: local(4, 13), tipo: "reuniao" }), AGORA)).toBe(false);
    expect(aguardaValidacao(item({ inicio: local(4, 13), status: "realizado" }), AGORA)).toBe(
      false,
    );
  });
});

describe("acoesDisponiveis", () => {
  it("visita agendada no futuro: confirmar + remarcar", () => {
    expect(acoesDisponiveis(item({ inicio: local(4, 17) }), AGORA)).toEqual([
      "confirmar",
      "remarcar",
    ]);
  });
  it("visita já confirmada: só remarcar (validar ainda não, porque não começou)", () => {
    expect(acoesDisponiveis(item({ inicio: local(4, 17), status: "confirmado" }), AGORA)).toEqual([
      "remarcar",
    ]);
  });
  it("visita que já começou: validar + remarcar (confirmar não faz mais sentido)", () => {
    expect(acoesDisponiveis(item({ inicio: local(4, 14, 30) }), AGORA)).toEqual([
      "validar",
      "remarcar",
    ]);
    expect(acoesDisponiveis(item({ inicio: local(3, 14) }), AGORA)).toEqual([
      "validar",
      "remarcar",
    ]);
  });
  it("ligação/follow-up não têm 'confirmar com o cliente'", () => {
    expect(acoesDisponiveis(item({ inicio: local(4, 17), tipo: "ligacao" }), AGORA)).toEqual([
      "remarcar",
    ]);
    expect(acoesDisponiveis(item({ inicio: local(4, 17), tipo: "follow_up" }), AGORA)).toEqual([
      "remarcar",
    ]);
  });
  it("sem lead não há quem confirmar nem visita a validar", () => {
    expect(
      acoesDisponiveis(item({ inicio: local(4, 17), lead_id: null, lead: null }), AGORA),
    ).toEqual(["remarcar"]);
    expect(
      acoesDisponiveis(item({ inicio: local(4, 13), lead_id: null, lead: null }), AGORA),
    ).toEqual(["remarcar"]);
  });
  it("concluído, cancelado ou remarcado: nenhuma ação", () => {
    for (const status of ["realizado", "nao_compareceu", "cancelado", "remarcado"] as const) {
      expect(acoesDisponiveis(item({ inicio: local(4, 13), status }), AGORA)).toEqual([]);
    }
  });
});

describe("mensagens de WhatsApp", () => {
  it("rotula o dia como hoje, amanhã ou dia da semana com data", () => {
    expect(rotuloDoDia(local(4, 10).toISOString(), AGORA)).toBe("hoje");
    expect(rotuloDoDia(local(5, 10).toISOString(), AGORA)).toBe("amanhã");
    expect(rotuloDoDia(local(7, 10).toISOString(), AGORA)).toBe("na segunda-feira (07/09)");
    expect(rotuloDoDia(local(6, 10).toISOString(), AGORA)).toBe("no domingo (06/09)");
  });

  it("confirmação traz primeiro nome, dia, hora e local", () => {
    const msg = mensagemConfirmacao(item({ inicio: local(5, 10, 30) }), AGORA);
    expect(msg).toContain("Oi, Ivi!");
    expect(msg).toContain("nossa visita amanhã às 10:30 (Rua da Mooca, 100)");
    expect(msg).toContain("me avisa que a gente reagenda");
  });

  it("reunião e compromisso sem lead/local também têm mensagem coerente", () => {
    const msg = mensagemConfirmacao(
      item({ inicio: local(4, 17), tipo: "reuniao", local: null, lead: null }),
      AGORA,
    );
    expect(
      msg.startsWith("Oi, tudo bem? Passando para confirmar nossa reunião hoje às 17:00 —"),
    ).toBe(true);
  });

  it("mensagem de contato muda com o momento do compromisso", () => {
    expect(mensagemContato(item({ inicio: local(4, 17) }), AGORA)).toContain(
      "confirmar nossa visita",
    );
    expect(mensagemContato(item({ inicio: local(4, 17), status: "confirmado" }), AGORA)).toBe(
      "Oi, Ivi! Estou a caminho da nossa visita — te vejo às 17:00.",
    );
    expect(mensagemContato(item({ inicio: local(4, 9), status: "realizado" }), AGORA)).toBe(
      "Oi, Ivi!",
    );
    expect(mensagemContato(item({ inicio: local(5, 9), status: "confirmado" }), AGORA)).toBe(
      "Oi, Ivi!",
    );
  });
});

describe("remarcar", () => {
  it("rejeita horário no passado ou inválido", () => {
    expect(validarRemarcacao(local(4, 14), AGORA)).toMatch(/futuro/);
    expect(validarRemarcacao(new Date("x"), AGORA)).toMatch(/Informe/);
    expect(validarRemarcacao(local(5, 10), AGORA)).toBeNull();
  });

  it("novo agendamento preserva duração, lead, local e título; nasce 'agendado'", () => {
    const original = item({ inicio: local(4, 10), duracaoMin: 90 });
    const novo = remarcarPayload(original, local(5, 14), "user-9");
    expect(novo).toMatchObject({
      lead_id: "lead-1",
      corretor_id: "c1",
      criado_por_id: "user-9",
      tipo: "visita",
      status: "agendado",
      titulo: "Visita - Vibra Mooca",
      local: "Rua da Mooca, 100",
      timezone: "America/Sao_Paulo",
      lembrete_minutos: 30,
    });
    expect(novo.data_inicio).toBe(local(5, 14).toISOString());
    expect(novo.data_fim).toBe(local(5, 15, 30).toISOString());
  });

  it("duração inválida cai em 1 hora", () => {
    const original = item({
      data_inicio: local(4, 10).toISOString(),
      data_fim: local(4, 9).toISOString(),
    });
    const novo = remarcarPayload(original, local(5, 14), "u");
    expect(novo.data_fim).toBe(local(5, 15).toISOString());
  });
});

describe("registro da visita (mini-registro)", () => {
  const base = (over: Partial<RegistroVisita> = {}): RegistroVisita => ({
    ...registroVisitaInicial(AGORA),
    ...over,
  });

  it("sugere o próximo contato para amanhã às 10h", () => {
    expect(sugestaoProximoContato(AGORA)).toBe("2026-09-05T10:00");
    expect(registroVisitaInicial(AGORA).proximoFollowup).toBe("2026-09-05T10:00");
  });

  it("visita realizada exige a leitura de interesse", () => {
    expect(validarRegistroVisita(base(), AGORA)).toEqual({
      interesse: "Diga como o cliente saiu da visita.",
    });
    expect(validarRegistroVisita(base({ interesse: "alto" }), AGORA)).toEqual({});
  });

  it("não comparecimento exige próximo contato futuro (regra da RPC)", () => {
    expect(validarRegistroVisita(base({ compareceu: false, proximoFollowup: "" }), AGORA)).toEqual({
      proximoFollowup: "Escolha uma data futura para o próximo contato.",
    });
    expect(
      validarRegistroVisita(
        base({ compareceu: false, proximoFollowup: "2026-09-04T09:00" }),
        AGORA,
      ),
    ).toHaveProperty("proximoFollowup");
    expect(validarRegistroVisita(base({ compareceu: false }), AGORA)).toEqual({});
  });

  it("aguardando retorno (mesmo com comparecimento) exige próximo contato", () => {
    expect(
      validarRegistroVisita(
        base({ interesse: "medio", proximaEtapa: "aguardando_retorno", proximoFollowup: "" }),
        AGORA,
      ),
    ).toHaveProperty("proximoFollowup");
  });

  it("reagendamento precisa ser no futuro", () => {
    expect(
      validarRegistroVisita(base({ compareceu: false, reagendarPara: "2026-09-01T10:00" }), AGORA),
    ).toHaveProperty("reagendarPara");
    expect(
      validarRegistroVisita(base({ compareceu: false, reagendarPara: "2026-09-08T10:00" }), AGORA),
    ).toEqual({});
  });

  it("payload da RPC: compareceu leva interesse/objeção e etapa escolhida", () => {
    const visita = item({ inicio: local(4, 13) });
    const p = payloadSalvarVisita(
      visita,
      base({ interesse: "alto", objecao: "entrada_alta", observacoes: "  gostou da planta  " }),
    );
    expect(p).toMatchObject({
      p_agendamento_id: visita.id,
      p_checklist: {},
      p_concluir: true,
      p_compareceu: true,
      p_interesse: "alto",
      p_objecao_principal: "entrada_alta",
      p_proxima_etapa: "visita_realizada",
      p_observacoes: "gostou da planta",
    });
    expect(p.p_proximo_followup).toBe(new Date("2026-09-05T10:00").toISOString());
    expect(p.p_reagendar_para).toBeUndefined();
    expect(p.p_proxima_acao).toMatch(/próximo passo/);
  });

  it("payload da RPC: no-show força aguardando retorno, sem interesse, com reagendamento", () => {
    const visita = item({ inicio: local(4, 13) });
    const p = payloadSalvarVisita(
      visita,
      base({
        compareceu: false,
        interesse: "alto", // ignorado: sem comparecimento não há leitura
        proximaEtapa: "visita_realizada", // ignorado: regra da RPC
        reagendarPara: "2026-09-08T10:00",
      }),
    );
    expect(p.p_compareceu).toBe(false);
    expect(p.p_interesse).toBeUndefined();
    expect(p.p_objecao_principal).toBeUndefined();
    expect(p.p_proxima_etapa).toBe("aguardando_retorno");
    expect(p.p_reagendar_para).toBe(new Date("2026-09-08T10:00").toISOString());
    expect(p.p_proxima_acao).toMatch(/remarcar/);
    expect(p.p_observacoes).toBeUndefined();
  });
});

describe("resumo do cabeçalho", () => {
  it("conta compromissos, o que falta confirmar e o que falta validar", () => {
    const cls = classificarAgenda(
      [
        item({ inicio: local(3, 14) }), // pendente de validação (ontem)
        item({ inicio: local(4, 9), status: "realizado" }),
        item({ inicio: local(4, 13) }), // hoje, já passou → validar
        item({ inicio: local(4, 17) }), // hoje, futuro → a confirmar
        item({ inicio: local(4, 18), status: "confirmado" }),
        item({ inicio: local(5, 10) }), // amanhã não entra no total de hoje
      ],
      AGORA,
    );
    const r = resumoDoDia(cls, AGORA);
    expect(r).toEqual({ total: 4, semConfirmacao: 1, paraValidar: 2, concluidos: 1 });
    expect(fraseResumo(r)).toBe(
      "4 compromissos hoje · 1 sem confirmação · 2 visitas para validar.",
    );
  });

  it("frases dos casos de borda", () => {
    expect(fraseResumo({ total: 0, semConfirmacao: 0, paraValidar: 0, concluidos: 0 })).toBe(
      "Sem compromissos hoje.",
    );
    expect(fraseResumo({ total: 1, semConfirmacao: 0, paraValidar: 0, concluidos: 0 })).toBe(
      "1 compromisso hoje.",
    );
    expect(fraseResumo({ total: 0, semConfirmacao: 0, paraValidar: 1, concluidos: 0 })).toBe(
      "1 visita para validar.",
    );
  });
});
