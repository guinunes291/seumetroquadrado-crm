// Canal WhatsApp da Sami (Onda S4, D8/D15) — regra pura: contratos, corretor
// pelo telefone (sufixo único), respostas curtas CONFIRMAR/CANCELAR e os
// textos que o n8n manda de volta.
import { describe, expect, it } from "vitest";
import {
  BriefingSamiInput,
  DecidirPropostasInput,
  MensagemSamiInput,
  SAMI_CANAL_HEADER,
  escolherCorretorUnico,
  interpretarRespostaCurta,
  primeiroNome,
  sufixoTelefone,
  textoDaDecisao,
  textoDoBriefingWhatsApp,
  textoParaWhatsApp,
  type CandidatoCorretor,
} from "@/lib/samiq-canal";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";

const LEAD = "123e4567-e89b-12d3-a456-426614174000";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

const corretores: CandidatoCorretor[] = [
  { id: "a", nome: "Ana Souza", email: "ana@smq.com", telefone: "(11) 91234-5678" },
  { id: "b", nome: "Bruno Lima", email: "bruno@smq.com", telefone: "+55 11 99876-5432" },
  { id: "c", nome: "Sem telefone", email: "c@smq.com", telefone: null },
];

describe("contratos", () => {
  it("header e mensagem mínima", () => {
    expect(SAMI_CANAL_HEADER).toBe("x-sami-key");
    const m = MensagemSamiInput.parse({
      corretor_telefone: "5511912345678",
      texto: "  Falei com a Maria, ela topou visitar sábado 10h  ",
      origem_midia: "audio",
    });
    expect(m.texto).toBe("Falei com a Maria, ela topou visitar sábado 10h");
    expect(MensagemSamiInput.safeParse({ corretor_telefone: "11", texto: "oi" }).success).toBe(
      false,
    );
    expect(MensagemSamiInput.safeParse({ corretor_telefone: "5511912345678" }).success).toBe(false);
    expect(
      MensagemSamiInput.safeParse({ corretor_telefone: "5511912345678", texto: "x".repeat(4001) })
        .success,
    ).toBe(false);
  });

  it("decisão exige confirmar|rejeitar e no máximo 10 ids", () => {
    expect(
      DecidirPropostasInput.parse({ corretor_telefone: "5511912345678", decisao: "confirmar" }),
    ).toMatchObject({ decisao: "confirmar" });
    expect(
      DecidirPropostasInput.safeParse({ corretor_telefone: "5511912345678", decisao: "talvez" })
        .success,
    ).toBe(false);
    expect(
      DecidirPropostasInput.safeParse({
        corretor_telefone: "5511912345678",
        decisao: "rejeitar",
        ids: Array.from({ length: 11 }, () => P1),
      }).success,
    ).toBe(false);
    expect(BriefingSamiInput.safeParse({ corretor_telefone: "11912345678" }).success).toBe(true);
  });
});

describe("corretor pelo telefone", () => {
  it("sufixo: 9 dígitos para celular, 8 para fixo, nada abaixo disso", () => {
    expect(sufixoTelefone("+55 (11) 91234-5678")).toBe("912345678");
    expect(sufixoTelefone("1132345678")).toBe("132345678");
    expect(sufixoTelefone("32345678")).toBe("32345678");
    expect(sufixoTelefone("1234567")).toBeNull();
    expect(sufixoTelefone(null)).toBeNull();
  });

  it("resolve com ou sem DDI/DDD e exige correspondência ÚNICA", () => {
    expect(escolherCorretorUnico(corretores, "5511912345678")).toEqual({
      ok: true,
      corretor: corretores[0],
    });
    expect(escolherCorretorUnico(corretores, "912345678")).toEqual({
      ok: true,
      corretor: corretores[0],
    });
    expect(escolherCorretorUnico(corretores, "11999999999")).toEqual({
      ok: false,
      erro: "corretor_nao_encontrado",
    });
    expect(escolherCorretorUnico(corretores, "123")).toEqual({
      ok: false,
      erro: "telefone_invalido",
    });
    const duplicado = [...corretores, { ...corretores[0], id: "a2" }];
    expect(escolherCorretorUnico(duplicado, "11912345678")).toEqual({
      ok: false,
      erro: "corretor_ambiguo",
    });
  });
});

describe("interpretarRespostaCurta", () => {
  it("confirma e cancela com o vocabulário curto, acentos e emoji", () => {
    for (const t of ["CONFIRMAR", "confirma", "Sim", "ok!", "pode registrar", "1", "✅", "👍"]) {
      expect(interpretarRespostaCurta(t), t).toBe("confirmar");
    }
    for (const t of ["cancelar", "Não", "nao", "descarta", "2", "❌", "não, cancela"]) {
      expect(interpretarRespostaCurta(t), t).toBe("rejeitar");
    }
  });

  it("qualquer coisa fora do vocabulário vai para a Sami (null)", () => {
    for (const t of [
      "sim, mas muda a data para sexta",
      "confirmar a visita da Maria e ligar pro João",
      "quem tem visita hoje?",
      "",
      "   ",
      "✅ mas só o primeiro ❌",
    ]) {
      expect(interpretarRespostaCurta(t), t).toBeNull();
    }
  });
});

const propostas: PropostaSamiQ[] = [
  {
    id: P1,
    tipo: "registrar_contato",
    payload: {
      tipo: "registrar_contato",
      leadId: LEAD,
      canal: "whatsapp",
      resultado: "atendeu",
      resumo: "Topou visitar sábado",
      followupEm: null,
    },
    leadNome: "Maria da Silva",
    status: "pendente",
  },
  {
    id: P2,
    tipo: "agendar_visita",
    payload: {
      tipo: "agendar_visita",
      leadId: LEAD,
      inicioEm: "2026-09-12T13:00:00.000Z",
      local: "Reserva Guarulhos",
    },
    leadNome: "Maria da Silva",
    status: "pendente",
  },
];

describe("textos para o WhatsApp", () => {
  it("resposta sem propostas vai como está; com propostas ganha lista numerada e instrução", () => {
    expect(textoParaWhatsApp({ texto: "Hoje você tem 2 visitas." })).toBe(
      "Hoje você tem 2 visitas.",
    );
    const t = textoParaWhatsApp({ texto: "Preparei os registros da Maria.", propostas });
    expect(t).toContain("📝 Preparei 2 registros:");
    expect(t).toMatch(/1\) Registrar contato com Maria da Silva — whatsapp · Atendeu/);
    expect(t).toMatch(/2\) Agendar visita com Maria da Silva — Quando: /);
    expect(t).toContain("Responda CONFIRMAR para registrar ou CANCELAR para descartar.");
    expect(t).not.toContain("**");
  });

  it("não repete a instrução quando a Sami já pediu para CONFIRMAR", () => {
    const t = textoParaWhatsApp({
      texto: "Preparei 2 registros. Responda CONFIRMAR para gravar.",
      propostas,
    });
    expect(t.match(/CONFIRMAR/g)).toHaveLength(1);
    expect(t).toContain("📝 Preparei 2 registros:");
  });

  it("resultado da decisão: feitos, falhas, descarte e nada pendente", () => {
    expect(
      textoDaDecisao(
        "confirmar",
        [
          { id: P1, ok: true, status: "aceita" },
          { id: P2, ok: false, status: "falhou", erro: "Data no passado" },
        ],
        propostas,
      ),
    ).toBe(
      [
        "✅ Registrei 1 item: Registrar contato com Maria da Silva.",
        "⚠️ Não consegui: Agendar visita com Maria da Silva (Data no passado).",
        'Tudo com a marca "via Sami" na timeline; dá para desfazer no CRM em 24 h.',
      ].join("\n"),
    );
    expect(textoDaDecisao("rejeitar", [], propostas)).toBe(
      "🗑️ Descartei 2 registros. Nada foi gravado.",
    );
    expect(textoDaDecisao("confirmar", [], [])).toMatch(/^Não há registros pendentes/);
  });

  it("briefing: saudação com primeiro nome, linhas com •, e o caso vazio", () => {
    expect(primeiroNome("Maria da Silva")).toBe("Maria");
    expect(primeiroNome("  ")).toBeNull();
    const cheio = textoDoBriefingWhatsApp("Maria", {
      saudacao: "Bom dia",
      vazio: false,
      geradoEm: "2026-09-10T12:00:00Z",
      linhas: [
        { chave: "visitas_hoje", icone: "agenda", tom: "info", texto: "1 visita hoje: Ana 10h00" },
        { chave: "esfriando", icone: "esfriando", tom: "neutral", texto: "3 clientes esfriando" },
      ],
    });
    expect(cheio).toBe(
      [
        "Bom dia, Maria! Seu dia:",
        "• 1 visita hoje: Ana 10h00",
        "• 3 clientes esfriando",
        "",
        "Me pergunte por quem começar ou me conte o que já fez que eu registro.",
      ].join("\n"),
    );
    expect(
      textoDoBriefingWhatsApp(null, {
        saudacao: "Boa tarde",
        vazio: true,
        geradoEm: "x",
        linhas: [],
      }),
    ).toBe("Boa tarde! Tudo em dia por aqui. Me chame quando precisar.");
  });
});
