// Propostas de escrita da Sami (Onda S2) — a parte pura: contratos, descrição
// humana, regras de desfazer, edição no card e o que volta ao painel ao
// retomar a conversa. A execução com o banco é coberta pelo contrato em
// samiq-governance.test.ts e por tests/db/samiq-propostas.test.ts.
import { describe, expect, it } from "vitest";
import {
  AgendarVisitaPayload,
  AtualizarQualificacaoPayload,
  MOTIVOS_PERDA_PROPOSTA,
  MudarEtapaPayload,
  PropostaPayloadSchema,
  RegistrarContatoPayload,
  SAMIQ_FERRAMENTAS_PROPOSTA,
  SAMIQ_PROPOSTA_TIPOS,
  conteudoContato,
  descreverProposta,
  fimDaVisita,
  foiViaSami,
  metadataViaSami,
  podeDesfazerProposta,
  tituloDoPacote,
  tituloVisita,
  type PropostaPayload,
} from "@/lib/samiq-propostas";
import { MOTIVO_PERDA_CATEGORIAS } from "@/lib/leads";
import {
  aplicarEdicao,
  inputLocalParaIso,
  isoParaInputLocal,
  podeDesfazerAgora,
  rotuloPrazoDesfazer,
} from "@/components/samiq/samiq-propostas-form";
import { mapearMensagensPersistidas, mapearPropostasPersistidas } from "@/lib/samiq-memoria";

const LEAD = "123e4567-e89b-12d3-a456-426614174000";
const ID = "223e4567-e89b-12d3-a456-426614174000";

describe("contratos", () => {
  it("toda ferramenta propor_* aponta para um tipo do catálogo", () => {
    for (const tipo of Object.values(SAMIQ_FERRAMENTAS_PROPOSTA)) {
      expect(SAMIQ_PROPOSTA_TIPOS).toContain(tipo);
    }
    expect(Object.keys(SAMIQ_FERRAMENTAS_PROPOSTA)).toHaveLength(SAMIQ_PROPOSTA_TIPOS.length);
  });

  it("categorias de perda espelham o CHECK do banco (lib/leads)", () => {
    expect([...MOTIVOS_PERDA_PROPOSTA]).toEqual([...MOTIVO_PERDA_CATEGORIAS]);
  });

  it("registrar contato: canal e resultado do vocabulário, follow-up ISO ou null", () => {
    const ok = RegistrarContatoPayload.parse({
      tipo: "registrar_contato",
      leadId: LEAD,
      canal: "ligacao",
      resultado: "pediu_retorno",
      resumo: "  achou a parcela alta  ",
      followupEm: "2026-09-11T10:00:00-03:00",
      objecoes: ["parcela alta"],
    });
    expect(ok.resumo).toBe("achou a parcela alta");
    expect(() =>
      RegistrarContatoPayload.parse({
        tipo: "registrar_contato",
        leadId: LEAD,
        canal: "pombo",
        resultado: "atendeu",
      }),
    ).toThrow();
    expect(() =>
      RegistrarContatoPayload.parse({
        tipo: "registrar_contato",
        leadId: LEAD,
        canal: "whatsapp",
        resultado: "atendeu",
        followupEm: "sexta",
      }),
    ).toThrow();
  });

  it("mudar etapa: perder exige motivo; aguardando retorno exige follow-up; etapas fora da lista caem", () => {
    expect(() =>
      MudarEtapaPayload.parse({ tipo: "mudar_etapa", leadId: LEAD, novoStatus: "perdido" }),
    ).toThrow(/motivo/);
    expect(() =>
      MudarEtapaPayload.parse({
        tipo: "mudar_etapa",
        leadId: LEAD,
        novoStatus: "aguardando_retorno",
      }),
    ).toThrow(/follow-up/);
    expect(() =>
      MudarEtapaPayload.parse({
        tipo: "mudar_etapa",
        leadId: LEAD,
        novoStatus: "contrato_fechado",
      }),
    ).toThrow();
    expect(
      MudarEtapaPayload.parse({
        tipo: "mudar_etapa",
        leadId: LEAD,
        novoStatus: "perdido",
        motivo: "comprou com concorrente",
        motivoCategoria: "comprou_concorrente",
      }).motivoCategoria,
    ).toBe("comprou_concorrente");
  });

  it("qualificação: pelo menos um campo; visita: duração dentro da faixa", () => {
    expect(() =>
      AtualizarQualificacaoPayload.parse({ tipo: "atualizar_qualificacao", leadId: LEAD }),
    ).toThrow(/pelo menos/);
    expect(
      AtualizarQualificacaoPayload.parse({
        tipo: "atualizar_qualificacao",
        leadId: LEAD,
        usaFgts: true,
      }).usaFgts,
    ).toBe(true);
    expect(() =>
      AgendarVisitaPayload.parse({
        tipo: "agendar_visita",
        leadId: LEAD,
        inicioEm: "2026-09-10T10:00:00-03:00",
        duracaoMin: 5,
      }),
    ).toThrow();
  });

  it("a união discriminada rejeita tipo desconhecido", () => {
    expect(() => PropostaPayloadSchema.parse({ tipo: "apagar_lead", leadId: LEAD })).toThrow();
  });
});

describe("descrição humana e regras", () => {
  const contato: PropostaPayload = {
    tipo: "registrar_contato",
    leadId: LEAD,
    canal: "ligacao",
    resultado: "atendeu",
    resumo: "achou a parcela alta",
    followupEm: "2026-09-11T10:00:00-03:00",
    objecoes: ["parcela alta"],
  };

  it("descreve contato com resultado, resumo, objeções e follow-up no fuso de SP", () => {
    const d = descreverProposta(contato, "Maria da Silva");
    expect(d.titulo).toBe("Registrar contato com Maria da Silva");
    expect(d.detalhes[0]).toBe("ligacao · Atendeu");
    expect(d.detalhes).toContain("achou a parcela alta");
    expect(d.detalhes).toContain("Objeções: parcela alta");
    expect(d.detalhes.at(-1)).toMatch(/^Follow-up: .*11\/09.*10:00/);
    expect(descreverProposta({ ...contato, followupEm: null }, null).detalhes.at(-1)).toBe(
      "Sem follow-up",
    );
  });

  it("conteúdo do contato cai no rótulo do resultado quando não há resumo", () => {
    expect(conteudoContato({ ...contato, resumo: "" })).toBe("Atendeu");
  });

  it("visita: fim = início + duração; título usa o local ou o nome", () => {
    const visita: PropostaPayload = {
      tipo: "agendar_visita",
      leadId: LEAD,
      inicioEm: "2026-09-10T10:00:00-03:00",
      local: "Vista Verde",
    };
    expect(fimDaVisita(visita)).toBe("2026-09-10T14:00:00.000Z");
    expect(fimDaVisita({ ...visita, duracaoMin: 90 })).toBe("2026-09-10T14:30:00.000Z");
    expect(tituloVisita(visita, "Maria")).toBe("Visita - Vista Verde");
    expect(tituloVisita({ ...visita, local: undefined }, "Maria")).toBe("Visita - Maria");
    expect(descreverProposta(visita, "Maria").detalhes).toContain("Move o cliente para Agendado");
  });

  it("pacote: título conta itens e nomeia o cliente quando é um só", () => {
    expect(tituloDoPacote([{ leadNome: "Maria" }])).toBe("Registrar 1 item para Maria?");
    expect(
      tituloDoPacote([{ leadNome: "Maria" }, { leadNome: "Maria" }, { leadNome: "Maria" }]),
    ).toBe("Registrar 3 itens para Maria?");
    expect(tituloDoPacote([{ leadNome: "Maria" }, { leadNome: "João" }])).toBe(
      "Registrar 2 itens?",
    );
  });

  it("desfazer: tudo menos mudança de etapa; marca via Sami na metadata", () => {
    expect(podeDesfazerProposta("registrar_contato")).toBe(true);
    expect(podeDesfazerProposta("mudar_etapa")).toBe(false);
    const meta = metadataViaSami({ executionId: ID, propostaId: LEAD });
    expect(meta).toEqual({ origem: "samiq", proposta_id: LEAD, execution_id: ID });
    expect(foiViaSami(meta)).toBe(true);
    expect(foiViaSami({})).toBe(false);
    expect(foiViaSami(null)).toBe(false);
  });
});

describe("card: datas e edição", () => {
  it("datetime-local ida e volta no fuso de São Paulo", () => {
    expect(isoParaInputLocal("2026-09-10T13:00:00.000Z")).toBe("2026-09-10T10:00");
    expect(inputLocalParaIso("2026-09-10T10:00")).toBe("2026-09-10T10:00:00-03:00");
    expect(inputLocalParaIso("")).toBeNull();
    expect(inputLocalParaIso("10/09/2026 10:00")).toBeNull();
    expect(isoParaInputLocal(null)).toBe("");
  });

  it("edição aplica só os campos permitidos e revalida", () => {
    const original: PropostaPayload = {
      tipo: "registrar_contato",
      leadId: LEAD,
      canal: "ligacao",
      resultado: "atendeu",
      resumo: "x",
      followupEm: "2026-09-11T10:00:00-03:00",
    };
    const r = aplicarEdicao(original, {
      resumo: " novo resumo ",
      followupEm: null,
      resultado: "pediu_retorno",
    });
    expect("payload" in r && r.payload).toMatchObject({
      tipo: "registrar_contato",
      leadId: LEAD,
      resumo: "novo resumo",
      followupEm: null,
      resultado: "pediu_retorno",
    });
    const ruim = aplicarEdicao(original, { resultado: "explodiu" });
    expect("erro" in ruim).toBe(true);
  });

  it("perder sem motivo continua barrado mesmo editando", () => {
    const original: PropostaPayload = {
      tipo: "mudar_etapa",
      leadId: LEAD,
      novoStatus: "perdido",
      motivo: "sumiu",
    };
    const r = aplicarEdicao(original, { motivo: "   " });
    expect("erro" in r && r.erro).toMatch(/motivo/);
  });

  it("podeDesfazerAgora respeita status, tipo e prazo", () => {
    const agora = new Date("2026-09-10T12:00:00Z");
    const base = {
      status: "aceita" as const,
      tipo: "anotar" as const,
      desfazerAte: "2026-09-11T11:00:00Z",
    };
    expect(podeDesfazerAgora(base, agora)).toBe(true);
    expect(podeDesfazerAgora({ ...base, desfazerAte: "2026-09-10T11:00:00Z" }, agora)).toBe(false);
    expect(podeDesfazerAgora({ ...base, tipo: "mudar_etapa" }, agora)).toBe(false);
    expect(podeDesfazerAgora({ ...base, status: "pendente" }, agora)).toBe(false);
    expect(rotuloPrazoDesfazer("2026-09-11T11:00:00Z")).toMatch(/^desfazer até 11\/09 08:00$/);
  });
});

describe("memória: propostas que voltam ao painel", () => {
  const agora = new Date("2026-09-10T12:00:00Z");
  const payload = { tipo: "anotar", leadId: LEAD, nota: "lembrar" };
  const row = (over: Partial<Parameters<typeof mapearPropostasPersistidas>[0][number]>) => ({
    id: ID,
    tipo: "anotar",
    payload,
    status: "pendente",
    execution_id: LEAD,
    lead_nome: "Maria",
    desfazer_ate: null,
    erro: null,
    ...over,
  });

  it("mantém pendentes, falhas e registradas dentro da janela; descarta o resto", () => {
    const out = mapearPropostasPersistidas(
      [
        row({ id: "a" }),
        row({ id: "b", status: "falhou", erro: "x" }),
        row({ id: "c", status: "aceita", desfazer_ate: "2026-09-11T00:00:00Z" }),
        row({ id: "d", status: "aceita", desfazer_ate: "2026-09-10T00:00:00Z" }),
        row({ id: "e", status: "rejeitada" }),
        row({ id: "f", status: "desfeita" }),
        row({ id: "g", tipo: "registrar_contato" }), // payload de outro tipo
        row({ id: "h", payload: { tipo: "anotar" } }), // inválido
      ],
      agora,
    );
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out[1].erro).toBe("x");
  });

  it("liga as propostas à resposta pela execução", () => {
    const propostas = mapearPropostasPersistidas([row({ id: "a" })], agora);
    const msgs = mapearMensagensPersistidas(
      [
        {
          papel: "user",
          conteudo: "liguei pra Maria",
          ferramentas: null,
          execution_id: null,
          criado_em: "1",
        },
        {
          papel: "assistant",
          conteudo: "Preparei 1 registro.",
          ferramentas: null,
          execution_id: LEAD,
          criado_em: "2",
        },
      ],
      [],
      propostas,
      new Map([["a", LEAD]]),
    );
    expect(msgs[0].propostas).toEqual([]);
    expect(msgs[1].propostas.map((p) => p.id)).toEqual(["a"]);
  });
});
