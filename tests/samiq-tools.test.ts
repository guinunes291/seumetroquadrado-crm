// Ferramentas de LEITURA da Sami (Onda S1) — a parte pura: contratos, janela
// de datas, modelagem do que o modelo vê (PII fora, nome completo dentro),
// telemetria do loop e detecção de fallback. O acesso ao banco fica em
// samiq-tools.server.ts e é coberto pelo contrato em samiq-governance.test.ts.
import { describe, expect, it } from "vitest";
import {
  BuscarClientesInput,
  MinhaAgendaInput,
  SAMIQ_TOOL_DESCRIPTIONS,
  SAMIQ_TOOL_LABELS,
  SAMIQ_TOOL_NAMES,
  contarFerramentasSamiQ,
  detectarFallbackSamiQ,
  hojeSaoPaulo,
  intervaloAgendaSamiQ,
  isSamiQToolName,
  modelarDetalheCliente,
  modelarFila,
  modelarProjetos,
  modelarTarefas,
  termoBuscaSamiQ,
} from "@/lib/samiq-tools";
import { displayNameForSamiQ } from "@/lib/samiq-governance";
import {
  SAMIQ_JANELA_RETOMAR_MS,
  deveRetomarConversa,
  mapearMensagensPersistidas,
} from "@/lib/samiq-memoria";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("catálogo", () => {
  it("toda ferramenta tem descrição em PT-BR e rótulo para o chip", () => {
    for (const name of SAMIQ_TOOL_NAMES) {
      expect(SAMIQ_TOOL_DESCRIPTIONS[name].length).toBeGreaterThan(30);
      expect(SAMIQ_TOOL_LABELS[name].length).toBeGreaterThan(2);
      expect(isSamiQToolName(name)).toBe(true);
    }
    expect(isSamiQToolName("registrar_contato")).toBe(false);
  });

  it("contratos rejeitam entrada fora do teto (o modelo não controla volume)", () => {
    expect(() => BuscarClientesInput.parse({ termo: "a" })).toThrow();
    expect(() => BuscarClientesInput.parse({ termo: "Maria", limite: 50 })).toThrow();
    expect(BuscarClientesInput.parse({ termo: "Maria", temperatura: "quente" }).temperatura).toBe(
      "quente",
    );
    expect(() => MinhaAgendaInput.parse({ de: "06/09/2026" })).toThrow();
  });
});

describe("datas no fuso de São Paulo", () => {
  it("hojeSaoPaulo vira o dia à meia-noite de SP, não de UTC", () => {
    expect(hojeSaoPaulo(new Date("2026-09-06T01:30:00Z"))).toBe("2026-09-05");
    expect(hojeSaoPaulo(new Date("2026-09-06T03:30:00Z"))).toBe("2026-09-06");
  });

  it("agenda: padrão hoje → +7 dias, com offset -03:00", () => {
    const j = intervaloAgendaSamiQ("2026-09-05");
    expect(j).toEqual({
      de: "2026-09-05",
      ate: "2026-09-12",
      inicioIso: "2026-09-05T00:00:00-03:00",
      fimIso: "2026-09-12T23:59:59-03:00",
    });
  });

  it("agenda: fim antes do início vira um dia só; janela máxima de 31 dias", () => {
    expect(intervaloAgendaSamiQ("2026-09-05", "2026-09-10", "2026-09-01").ate).toBe("2026-09-10");
    expect(intervaloAgendaSamiQ("2026-09-05", "2026-09-01", "2027-01-01").ate).toBe("2026-10-01");
    expect(intervaloAgendaSamiQ("2026-09-05", "hoje", "amanhã").de).toBe("2026-09-05");
  });
});

describe("termo de busca", () => {
  it("remove sintaxe do PostgREST e curingas", () => {
    expect(termoBuscaSamiQ("Maria, (Silva) %*")).toBe("Maria Silva");
    expect(termoBuscaSamiQ("x".repeat(200)).length).toBe(80);
  });
});

describe("modelagem para o modelo (D12: nome completo sim, contato não)", () => {
  const lead = {
    id: UUID,
    nome: "Maria da Silva Santos",
    origem: "meta_ads",
    status: "em_atendimento",
    temperatura: "quente",
    projeto_nome: "Residencial Vista Verde",
    renda_informada: "4500",
    entrada_disponivel: "10000",
    usa_fgts: true,
    tem_fgts: true,
    fgts_valor: 12000,
    tipo_renda: "clt",
    faixa_mcmv: "F2",
    proximo_followup: "2026-09-08",
    ultima_interacao: "2026-09-04T12:00:00Z",
    visita_data: "2026-09-10",
    visita_hora: "10:00",
    visita_empreendimento: "Vista Verde",
    proxima_acao: "Ligar e confirmar",
    objecoes: Array.from({ length: 15 }, (_, i) => `objeção ${i}`),
    observacoes: "Ligar no (11) 98888-7777, CPF 123.456.789-00, mora na Rua das Flores 12",
    motivo_perdido: null,
    bairro: "Itaquera",
    zona: "Leste",
    created_at: "2026-08-01T00:00:00Z",
  };

  it("detalhe do cliente mantém o nome completo e redige telefone/CPF/endereço", () => {
    const out = modelarDetalheCliente({
      lead,
      interacoes: Array.from({ length: 20 }, (_, i) => ({
        tipo: "ligacao",
        direcao: "saida",
        titulo: `Contato ${i}`,
        conteudo: "Cliente pediu retorno no 11 97777-6666",
        ocorreu_em: "2026-09-01T00:00:00Z",
      })),
      tarefas: [],
      agendamentos: [],
      documentos: [{ tipo: "cpf", status: "pendente", recebido_em: null }],
    }) as {
      cliente: Record<string, unknown>;
      ultimas_interacoes: Array<{ resumo?: string }>;
      documentos: unknown[];
    };
    expect(out.cliente.nome).toBe("Maria da Silva Santos");
    expect(out.cliente.regiao).toBe("Itaquera / Leste");
    const json = JSON.stringify(out);
    expect(json).not.toContain("98888-7777");
    expect(json).not.toContain("123.456.789-00");
    expect(json).not.toContain("Rua das Flores");
    expect(json).not.toContain("97777-6666");
    expect(json).toContain("[TELEFONE]");
    expect(out.ultimas_interacoes).toHaveLength(12);
    expect((out.cliente.objecoes as string[]).length).toBe(10);
    expect(out.documentos).toHaveLength(1);
  });

  it("fila: totais por fila e itens limitados, com nome completo", () => {
    const item = (nome: string, score: number) => ({
      lead: {
        id: UUID,
        nome,
        telefone: "11999999999",
        email: "x@y.z",
        status: "novo",
        temperatura: "quente",
        ultima_interacao: null,
        proximo_followup: null,
        projeto_nome: null,
        created_at: "2026-09-01T00:00:00Z",
        corretor_id: null,
        origem: "outro",
        renda_informada: null,
        entrada_disponivel: null,
        usa_fgts: null,
      },
      score,
      tier: "alta" as const,
      motivo: "Chegou há 2h",
      docsPendentes: 0,
    });
    const inbox = {
      filas: {
        novos: [item("Ana Costa", 90), item("Bruno Lima", 80), item("Carla Dias", 70)],
        responder: [],
        followups: [],
        esfriando: [],
        confirmar_visita: [],
        docs: [],
      },
      counts: { novos: 3, responder: 0, followups: 0, esfriando: 0, confirmar_visita: 0, docs: 0 },
    };
    const out = modelarFila(inbox, "novos", 2) as {
      totais: Record<string, number>;
      filas: Record<string, Array<{ nome: string }>>;
    };
    expect(out.totais).toEqual({ novos: 3 });
    expect(out.filas.novos.map((i) => i.nome)).toEqual(["Ana Costa", "Bruno Lima"]);
    expect(JSON.stringify(out)).not.toContain("11999999999");
    expect(JSON.stringify(out)).not.toContain("x@y.z");
  });

  it("tarefas trazem o cliente pelo nome e sem dados de contato", () => {
    const out = modelarTarefas([
      {
        id: UUID,
        titulo: "Follow-up com Maria",
        tipo: "follow_up",
        prioridade: "media",
        status: "pendente",
        data_vencimento: "2026-09-06",
        lead: { id: UUID, nome: "Maria da Silva" },
      },
    ]) as Array<{ cliente: { nome: string } }>;
    expect(out[0].cliente.nome).toBe("Maria da Silva");
  });

  it("projetos: dormitórios como faixa e diferenciais em lista viram texto", () => {
    const out = modelarProjetos([
      {
        id: UUID,
        nome: "Residencial Vista Verde",
        bairro: "Itaquera",
        cidade: "São Paulo",
        regiao: "Leste",
        zona_smq: null,
        tipologia: "apartamento",
        dorms_min: 2,
        dorms_max: 3,
        preco_a_partir: 189000,
        renda_minima: 2800,
        status_entrega: "em_obras",
        ano_entrega: 2027,
        mes_entrega: 6,
        diferenciais: ["piscina", "churrasqueira"],
      },
    ]) as Array<Record<string, unknown>>;
    expect(out[0].dormitorios).toBe("2 a 3");
    expect(out[0].localizacao).toBe("Itaquera · Leste · São Paulo");
    expect(out[0].entrega).toBe("em_obras · 6/2027");
    expect(out[0].diferenciais).toBe("piscina, churrasqueira");
  });

  it("displayNameForSamiQ: nome inteiro, espaços normalizados, número vira null", () => {
    expect(displayNameForSamiQ("  Maria   da  Silva ")).toBe("Maria da Silva");
    expect(displayNameForSamiQ("11999999999")).toBeNull();
    expect(displayNameForSamiQ("M".repeat(120))?.length).toBe(80);
    expect(displayNameForSamiQ(null)).toBeNull();
  });
});

describe("telemetria do loop (D17)", () => {
  it("conta chamadas e erros e guarda nomes únicos na ordem", () => {
    const t = contarFerramentasSamiQ([
      { content: [{ type: "tool-call", toolName: "minha_agenda" }] },
      {
        content: [
          { type: "tool-call", toolName: "detalhe_cliente" },
          { type: "tool-error", toolName: "detalhe_cliente" },
          { type: "tool-call", toolName: "minha_agenda" },
        ],
      },
      { content: [{ type: "text" }] },
    ]);
    expect(t).toEqual({ chamadas: 3, erros: 1, nomes: ["minha_agenda", "detalhe_cliente"] });
  });

  it("fallback = resposta vazia ou aberta com 'Não consegui'", () => {
    expect(detectarFallbackSamiQ("")).toBe(true);
    expect(detectarFallbackSamiQ("   ")).toBe(true);
    expect(detectarFallbackSamiQ("Não consegui achar a Maria na sua carteira.")).toBe(true);
    expect(detectarFallbackSamiQ("nao consegui…")).toBe(true);
    expect(detectarFallbackSamiQ("Amanhã você tem 2 visitas: Ana às 10h e Bruno às 14h.")).toBe(
      false,
    );
    expect(detectarFallbackSamiQ("Consegui: a Maria está em análise de crédito.")).toBe(false);
  });
});

describe("memória (D11) — regras puras", () => {
  it("retoma só conversa recente (12h)", () => {
    const agora = new Date("2026-09-06T12:00:00Z");
    expect(deveRetomarConversa("2026-09-06T08:00:00Z", agora)).toBe(true);
    expect(
      deveRetomarConversa(
        new Date(agora.getTime() - SAMIQ_JANELA_RETOMAR_MS - 1).toISOString(),
        agora,
      ),
    ).toBe(false);
    expect(deveRetomarConversa(null, agora)).toBe(false);
    expect(deveRetomarConversa("data inválida", agora)).toBe(false);
  });

  it("mapeia linhas persistidas com avaliação e só ferramentas conhecidas", () => {
    const out = mapearMensagensPersistidas(
      [
        {
          papel: "user",
          conteudo: "quem tem visita amanhã?",
          ferramentas: null,
          execution_id: null,
          criado_em: "1",
        },
        {
          papel: "assistant",
          conteudo: "Ana às 10h.",
          ferramentas: ["minha_agenda", "ferramenta_que_nao_existe"],
          execution_id: UUID,
          criado_em: "2",
        },
        {
          papel: "system",
          conteudo: "ignorar",
          ferramentas: null,
          execution_id: null,
          criado_em: "3",
        },
      ],
      [{ execution_id: UUID, nota: -1 }],
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      role: "assistant",
      ferramentas: ["minha_agenda"],
      executionId: UUID,
      avaliacao: -1,
    });
    expect(out[0].avaliacao).toBeNull();
  });
});
