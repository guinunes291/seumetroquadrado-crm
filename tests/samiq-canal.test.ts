// Canal WhatsApp da Sami (Onda S4, D8/D15; v8 "CRM no WhatsApp") — regra
// pura: contratos, corretor pelo telefone (sufixo único), comandos curtos
// (CONFIRMAR 2, CANCELAR, DESFAZER 1), consentimento natural, escolha "a 2",
// arquivo pelos bytes e os textos que o n8n manda de volta.
import { describe, expect, it } from "vitest";
import {
  AnexoSamiInput,
  BriefingSamiInput,
  DecidirPropostasInput,
  MensagemSamiInput,
  SAMI_CANAL_HEADER,
  SAMIQ_AVISO_SEM_REGISTRO,
  consentimentoExplicito,
  escolherCorretorUnico,
  executadasDaDecisao,
  interpretarComandoCurto,
  interpretarRespostaCurta,
  mimePelosBytes,
  numerosSoltos,
  escolherCandidato,
  primeiroNome,
  semRegistroFantasma,
  sufixoTelefone,
  textoDaDecisao,
  textoDasExecutadas,
  textoDoAnexoRecebido,
  textoDoBriefingWhatsApp,
  textoDoDesfazer,
  textoNumeroSemComando,
  textoParaWhatsApp,
  type CandidatoCorretor,
} from "@/lib/samiq-canal";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";

const LEAD = "123e4567-e89b-12d3-a456-426614174000";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

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

  it("v8: anexo, localização e id da mensagem entram validados", () => {
    const m = MensagemSamiInput.parse({
      corretor_telefone: "5511912345678",
      texto: "[localização]",
      anexo_id: P1,
      localizacao: { latitude: -23.52, longitude: -46.66, precisao: 12 },
      mensagem_id: "wamid.ABC",
    });
    expect(m.localizacao?.latitude).toBe(-23.52);
    expect(
      MensagemSamiInput.safeParse({
        corretor_telefone: "5511912345678",
        texto: "x",
        localizacao: { latitude: -123, longitude: 0 },
      }).success,
    ).toBe(false);
    expect(
      MensagemSamiInput.safeParse({
        corretor_telefone: "5511912345678",
        texto: "x",
        anexo_id: "nao-uuid",
      }).success,
    ).toBe(false);
    expect(
      AnexoSamiInput.safeParse({ corretor_telefone: "5511912345678", legenda: "RG da Maria" })
        .success,
    ).toBe(true);
  });

  it("decisão exige confirmar|rejeitar e no máximo 20 ids", () => {
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
        ids: Array.from({ length: 20 }, () => P1),
      }).success,
    ).toBe(true);
    expect(
      DecidirPropostasInput.safeParse({
        corretor_telefone: "5511912345678",
        decisao: "rejeitar",
        ids: Array.from({ length: 21 }, () => P1),
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

describe("comandos curtos (decidem sem gastar modelo)", () => {
  it("CONFIRMAR/CANCELAR fortes e fracos, com acento e emoji", () => {
    for (const t of ["CONFIRMAR", "confirma", "Confirmo!", "grava", "pode registrar"]) {
      expect(interpretarComandoCurto(t), t).toMatchObject({
        acao: "confirmar",
        itens: [],
        forte: true,
      });
    }
    for (const t of ["Sim", "ok!", "pode", "✅", "👍", "isso"]) {
      expect(interpretarComandoCurto(t), t).toMatchObject({
        acao: "confirmar",
        itens: [],
        forte: false,
      });
    }
    for (const t of ["cancelar", "descarta", "não, cancela"]) {
      expect(interpretarComandoCurto(t), t).toMatchObject({ acao: "rejeitar", forte: true });
    }
    for (const t of ["Não", "nao", "❌"]) {
      expect(interpretarComandoCurto(t), t).toMatchObject({ acao: "rejeitar", forte: false });
    }
  });

  it("número escolhe o item da lista: CONFIRMAR 1 e 3, cancela o 2, DESFAZER 2", () => {
    expect(interpretarComandoCurto("CONFIRMAR 1 e 3")).toEqual({
      acao: "confirmar",
      itens: [1, 3],
      forte: true,
    });
    expect(interpretarComandoCurto("confirma só o 2")).toEqual({
      acao: "confirmar",
      itens: [2],
      forte: true,
    });
    expect(interpretarComandoCurto("cancela o 2")).toEqual({
      acao: "rejeitar",
      itens: [2],
      forte: true,
    });
    expect(interpretarComandoCurto("tira o 2")).toEqual({
      acao: "rejeitar",
      itens: [2],
      forte: false,
    });
    expect(interpretarComandoCurto("DESFAZER")).toEqual({
      acao: "desfazer",
      itens: [],
      forte: true,
    });
    expect(interpretarComandoCurto("desfaz o 2")).toEqual({
      acao: "desfazer",
      itens: [2],
      forte: true,
    });
  });

  it("número sozinho e frase fora do vocabulário vão para a Sami (com o contexto)", () => {
    for (const t of [
      "1",
      "2",
      "tira",
      "sim, mas muda a data para sexta",
      "confirmar a visita da Maria e ligar pro João",
      "quem tem visita hoje?",
      "volta amanhã",
      "",
      "   ",
      "✅ mas só o primeiro ❌",
      "confirma e desfaz",
    ]) {
      expect(interpretarComandoCurto(t), t).toBeNull();
    }
  });

  it("número solto depois do pedido de OK: pergunta se confirma ou descarta", () => {
    expect(numerosSoltos("2")).toEqual([2]);
    expect(numerosSoltos("1 e 3")).toEqual([1, 3]);
    expect(numerosSoltos("1,2.")).toEqual([1, 2]);
    expect(numerosSoltos("2 visitas")).toBeNull();
    expect(numerosSoltos("liguei 2 vezes")).toBeNull();
    expect(textoNumeroSemComando([2])).toBe(
      "Para gravar o item 2, responda CONFIRMAR 2. Para descartar, CANCELAR 2.",
    );
    expect(textoNumeroSemComando([1, 3])).toContain("CONFIRMAR 1 e 3");
  });

  it("atalho legado (painel/testes antigos): só confirmar/rejeitar sem número", () => {
    expect(interpretarRespostaCurta("CONFIRMAR")).toBe("confirmar");
    expect(interpretarRespostaCurta("Não")).toBe("rejeitar");
    expect(interpretarRespostaCurta("CONFIRMAR 2")).toBeNull();
    expect(interpretarRespostaCurta("DESFAZER")).toBeNull();
  });
});

describe("consentimento natural e escolha pela lista", () => {
  it("OK claro libera; correção, pergunta e negação não", () => {
    for (const t of [
      "pode marcar",
      "isso, grava a visita",
      "beleza, manda",
      "perfeito 👍",
      "fechou, pode agendar",
    ]) {
      expect(consentimentoExplicito(t), t).toBe(true);
    }
    for (const t of [
      "sim, mas muda para 15h",
      "pode marcar?",
      "não pode",
      "espera, antes liga pra ela",
      "ok mas é outra Maria",
      "",
      "quero ver a agenda",
    ]) {
      expect(consentimentoExplicito(t), t).toBe(false);
    }
  });

  it("escolha na lista de homônimos libera UM candidato; frase comum não libera ninguém", () => {
    const ids = ["m1", "m2", "m3"];
    const casos: Array<[string, string | null]> = [
      ["2", "m2"],
      ["a 2", "m2"],
      ["opção 3", "m3"],
      ["o primeiro", "m1"],
      ["é a segunda", "m2"],
      ["a da última", "m3"],
      ["a 2 mesmo", "m2"],
      ["a segunda", "m2"],
      // dia da semana não é opção da lista
      ["na segunda", null],
      ["a de quinta", null],
      ["segunda-feira", null],
      // não escolhem: número no meio de um relato, pronome, "essa" sem dizer qual
      ["liguei 3 vezes hoje", null],
      ["ela atendeu e quer visitar sabado", null],
      ["ele nao atendeu", null],
      ["essa", null],
      ["5", null],
      ["", null],
    ];
    for (const [t, esperado] of casos) expect(escolherCandidato(t, ids), t).toBe(esperado);
    expect(escolherCandidato("2", [])).toBeNull();
  });

  it("relato com palavra de OK no meio não é OK", () => {
    for (const t of [
      "A Maria disse que vai pensar, registra",
      "registra o contato com o João, ele vai visitar sábado",
      "ok, ela atendeu e quer visitar",
      "pode marcar, depois eu vejo o horário com ela",
    ]) {
      expect(consentimentoExplicito(t), t).toBe(false);
    }
    expect(consentimentoExplicito("sim, pode marcar a visita da Maria")).toBe(true);
  });
});

describe("arquivo pelos bytes (não confia no tipo declarado)", () => {
  const b = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);
  it("reconhece PDF, JPEG, PNG e WEBP; recusa o resto", () => {
    expect(mimePelosBytes(b(0x25, 0x50, 0x44, 0x46))).toBe("application/pdf");
    expect(mimePelosBytes(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(mimePelosBytes(b(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
    expect(mimePelosBytes(b(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe(
      "image/webp",
    );
    expect(mimePelosBytes(b(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip/docx
    expect(mimePelosBytes(new Uint8Array([]))).toBeNull();
  });

  it("arquivo sem legenda: pergunta de quem é, sem travessão", () => {
    const t = textoDoAnexoRecebido({ mime: "application/pdf", tamanho: 1_300_000 });
    expect(t).toContain("Recebi o PDF (1,2 MB)");
    expect(t).toContain("De qual cliente e qual documento é?");
    expect(t).not.toContain("—");
  });
});

const contato: PropostaSamiQ = {
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
};
const visita: PropostaSamiQ = {
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
};
const tarefa: PropostaSamiQ = {
  id: P3,
  tipo: "criar_tarefa",
  payload: {
    tipo: "criar_tarefa",
    leadId: LEAD,
    titulo: "Cobrar holerite",
    tipoTarefa: "whatsapp",
    vencimentoEm: "2026-09-14T13:00:00.000Z",
  },
  leadNome: "Maria da Silva",
  status: "aceita",
  efeito: null,
  desfazerAte: "2026-09-15T13:00:00.000Z",
};

describe("textos para o WhatsApp", () => {
  it("resposta sem ação vai como está", () => {
    expect(textoParaWhatsApp({ texto: "Hoje você tem 2 visitas." })).toBe(
      "Hoje você tem 2 visitas.",
    );
  });

  it("gravado na hora: recibo numerado com o efeito e o DESFAZER", () => {
    const t = textoParaWhatsApp({
      texto: "Fechado, a Maria topou.",
      executadas: [
        { ...contato, status: "aceita", efeito: "entrou em Em atendimento", desfazerAte: "x" },
        tarefa,
      ],
    });
    expect(t).toContain("Fechado, a Maria topou.");
    expect(t).toContain(
      "Gravei no CRM:\n1) Contato com Maria da Silva (entrou em Em atendimento, WhatsApp, atendeu, Topou visitar sábado)",
    );
    expect(t).toContain("2) Tarefa de Maria da Silva: Cobrar holerite (Vence");
    expect(t).toContain("Algo errado? Responda DESFAZER (ou DESFAZER 2).");
    expect(t).not.toMatch(/\*\*|—/);
  });

  it("pesada espera o OK: lista numerada e uma instrução só (a do modelo sai)", () => {
    const t = textoParaWhatsApp({
      texto: "Preparei a visita da Maria. Responda CONFIRMAR para gravar.",
      pendentes: [visita],
    });
    expect(t.match(/CONFIRMAR/g)).toHaveLength(1);
    expect(t).toContain(
      "Preciso do seu OK para:\n1) Visita de Maria da Silva (sáb 12/09 10:00, Reserva Guarulhos",
    );
    expect(t).toContain("Responda CONFIRMAR para gravar ou CANCELAR para descartar.");
  });

  it("várias pendentes: CONFIRMAR 1 para só um item", () => {
    const t = textoParaWhatsApp({ texto: "", pendentes: [contato, visita] });
    expect(t).toContain("CONFIRMAR 1 para só um item");
    expect(t.startsWith("Preciso do seu OK")).toBe(true);
  });

  it("falha aparece com o motivo; desfeito e descartado entram no recibo", () => {
    const t = textoParaWhatsApp({
      texto: "Pronto.",
      executadas: [{ ...tarefa, status: "falhou", erro: "Data no passado", desfazerAte: null }],
      desfeitas: [contato],
      descartadas: [visita],
    });
    expect(t).toContain(
      "Não consegui gravar: Tarefa de Maria da Silva: Cobrar holerite (Data no passado).",
    );
    expect(t).toContain("Desfeito: Contato com Maria da Silva.");
    expect(t).toContain("Descartado sem gravar: Visita de Maria da Silva.");
  });

  it("decisão: recibo numerado, falha com motivo, descarte e o que sobrou", () => {
    const t = textoDaDecisao(
      "confirmar",
      [
        {
          id: P1,
          ok: true,
          status: "aceita",
          efeito: "entrou em Em atendimento",
          desfazerAte: "x",
        },
        { id: P2, ok: false, status: "falhou", erro: "Data no passado" },
      ],
      [contato, visita],
    );
    expect(t).toContain("Gravei no CRM:\n1) Contato com Maria da Silva (entrou em Em atendimento");
    expect(t).toContain("Não consegui gravar: Visita de Maria da Silva (Data no passado).");
    expect(
      textoDaDecisao(
        "rejeitar",
        [
          { id: P1, ok: true, status: "rejeitada" },
          { id: P2, ok: true, status: "rejeitada" },
        ],
        [contato, visita],
      ),
    ).toBe("Descartei 2 itens. Nada disso foi gravado.");
    // descarte que não pegou (já estava sendo gravado) não vira "descartei"
    expect(
      textoDaDecisao(
        "rejeitar",
        [
          { id: P1, ok: true, status: "rejeitada" },
          { id: P2, ok: false, status: "indisponivel" },
        ],
        [contato, visita],
      ),
    ).toBe(
      "Descartei 1 item. Nada disso foi gravado.\n\nNão consegui descartar: Visita de Maria da Silva (já estava sendo gravado ou o CRM não respondeu).",
    );
    expect(textoDaDecisao("confirmar", [], [])).toMatch(/^Não há nada esperando confirmação/);
    const parcial = textoDaDecisao(
      "confirmar",
      [{ id: P1, ok: true, status: "aceita" }],
      [contato],
      [visita],
    );
    expect(parcial).toContain("Preciso do seu OK para:\n1) Visita de Maria da Silva");
  });

  it("indisponível (já decidida ou em execução) vira falha explicada", () => {
    const [p] = executadasDaDecisao([visita], [{ id: P2, ok: false, status: "indisponivel" }]);
    expect(p.status).toBe("falhou");
    expect(p.erro).toBe("já foi decidida ou está sendo gravada");
    expect(textoDasExecutadas([p])).toContain("já foi decidida ou está sendo gravada");
  });

  it("desfazer: o que voltou, o que não voltou e o aviso da etapa", () => {
    const t = textoDoDesfazer(
      [
        { id: P1, ok: true },
        { id: P3, ok: false, erro: "A janela de 24 h para desfazer já passou." },
      ],
      [{ ...contato, status: "aceita" }, tarefa],
    );
    expect(t).toContain("Desfeito: Contato com Maria da Silva.");
    expect(t).toContain(
      "Não desfiz: Tarefa de Maria da Silva: Cobrar holerite (A janela de 24 h para desfazer já passou.)",
    );
    expect(t).toContain("A etapa do funil não volta sozinha");
    expect(textoDoDesfazer([], [])).toMatch(/^Não achei nada recente para desfazer/);
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

describe("trava de registro fantasma (nada gravado, nada pendente)", () => {
  it("tira a promessa e avisa quando não há ação", () => {
    const t = textoParaWhatsApp({
      texto:
        "Achei o Eduardo certo. Preparei o pacote: registro da ligação e tarefa para segunda. Aguardando você responder CONFIRMAR ou CANCELAR.",
    });
    expect(t).toContain("Achei o Eduardo certo.");
    expect(t).not.toContain("Preparei o pacote");
    expect(t).toContain(SAMIQ_AVISO_SEM_REGISTRO);
  });

  it("v8: 'registrei', 'agendei' e 'gravei' sem ação real também saem", () => {
    const t = textoParaWhatsApp({
      texto: "Registrei o contato da Ana. Agendei a visita para sábado. Boa venda!",
    });
    expect(t).not.toMatch(/Registrei|Agendei/);
    expect(t).toContain("Boa venda!");
    expect(t).toContain(SAMIQ_AVISO_SEM_REGISTRO);
  });

  it("não mexe em resposta comum, nem em 'cancelar' minúsculo", () => {
    const comum = "O cliente pode cancelar a visita até 24h antes. Quer que eu prepare o registro?";
    expect(semRegistroFantasma(comum)).toBe(comum);
  });

  it("com ação real, o recibo segue sem o aviso", () => {
    const t = textoParaWhatsApp({ texto: "Registrei a tarefa.", executadas: [tarefa] });
    expect(t).toContain("Gravei no CRM");
    expect(t).not.toContain(SAMIQ_AVISO_SEM_REGISTRO);
  });
});
