/**
 * Cadência Lead chegou/D1/D2/D3 — a parte que o cliente final enxerga.
 *
 * O que está testado aqui é o texto que sai no WhatsApp dele e o número para
 * onde vai. Erro nessas duas coisas não aparece como erro: aparece como
 * mensagem esquisita ou conversa aberta com número errado, e o corretor acha
 * que mandou.
 */
import { describe, expect, it } from "vitest";
import {
  acaoPrimaria,
  aplicarPlaceholders,
  CONTEXTO_POR_ETAPA,
  ETAPAS_CADENCIA,
  linkWhatsApp,
  rotuloEtapa,
  rotuloPrazo,
  rotuloProgresso,
} from "@/features/cadencia/templates";
import { agruparPorEtapa, parseKanbanCadencia } from "@/features/cadencia/client";

const D1 =
  "Oi, {nome}! Tudo bem? Aqui é da Seu Metro Quadrado. Você pediu informações sobre o {empreendimento} e acabei de tentar te ligar.";

describe("aplicarPlaceholders", () => {
  it("usa o PRIMEIRO nome, não o nome completo", () => {
    const texto = aplicarPlaceholders(D1, {
      nome: "Maria das Graças Silva",
      empreendimento: "Cury Leopoldina",
    });
    expect(texto).toContain("Oi, Maria!");
    expect(texto).not.toContain("das Graças");
  });

  it("troca todas as ocorrências da mesma chave", () => {
    const t = aplicarPlaceholders(
      "{nome}, o {empreendimento} é seu, {nome}. Veja o {empreendimento}.",
      {
        nome: "João Pedro",
        empreendimento: "Vibra Vila Maria",
      },
    );
    expect(t).toBe("João, o Vibra Vila Maria é seu, João. Veja o Vibra Vila Maria.");
  });

  it("não deixa placeholder cru vazar quando falta o dado", () => {
    const t = aplicarPlaceholders(D1, { nome: null, empreendimento: null });
    expect(t).not.toContain("{nome}");
    expect(t).not.toContain("{empreendimento}");
    expect(t).toContain("o empreendimento");
  });

  it("nome só com espaços não vira string vazia no meio da frase", () => {
    const t = aplicarPlaceholders("Oi, {nome}!", { nome: "   " });
    expect(t).toBe("Oi, tudo bem!");
  });
});

describe("linkWhatsApp", () => {
  it("prefixa o 55 num celular sem DDI", () => {
    expect(linkWhatsApp("(11) 98765-4321", "oi")).toBe("https://wa.me/5511987654321?text=oi");
  });

  it("NÃO duplica o 55 num número que já vem em E.164", () => {
    expect(linkWhatsApp("+55 11 98765-4321", "oi")).toBe("https://wa.me/5511987654321?text=oi");
  });

  it("aceita fixo com DDD (10 dígitos)", () => {
    expect(linkWhatsApp("1134567890", "oi")).toBe("https://wa.me/551134567890?text=oi");
  });

  it("recusa número curto demais para ser discável", () => {
    expect(linkWhatsApp("98765432", "oi")).toBeNull();
    expect(linkWhatsApp("", "oi")).toBeNull();
    expect(linkWhatsApp(null, "oi")).toBeNull();
  });

  it("escapa o texto, inclusive quebra de linha e acento", () => {
    const url = linkWhatsApp("11987654321", "Olá, João!\nTudo bem?");
    expect(url).toContain("text=Ol%C3%A1%2C%20Jo%C3%A3o!%0ATudo%20bem%3F");
  });
});

describe("rotuloProgresso", () => {
  it("mostra o contador de ligações na chegada e nos dois follow-ups, pelo nome da etapa", () => {
    expect(rotuloProgresso({ etapa: "D0", ligacoes_validas: 1, whatsapp_enviado: false })).toBe(
      "Lead chegou · 1 de 2 ligações · WhatsApp pendente",
    );
    expect(rotuloProgresso({ etapa: "D1", ligacoes_validas: 2, whatsapp_enviado: false })).toBe(
      "1º follow-up · 2 de 2 ligações · WhatsApp pendente",
    );
    expect(rotuloProgresso({ etapa: "D2", ligacoes_validas: 0, whatsapp_enviado: true })).toBe(
      "2º follow-up · 0 de 2 ligações · WhatsApp enviado",
    );
  });

  it("D3 não tem ligação no rótulo — é só a mensagem de encerramento", () => {
    expect(rotuloProgresso({ etapa: "D3", ligacoes_validas: 0, whatsapp_enviado: true })).toBe(
      "Encerramento · WhatsApp enviado",
    );
  });

  it("no Kanban o card não repete a etapa, que já é a coluna", () => {
    expect(
      rotuloProgresso(
        { etapa: "D1", ligacoes_validas: 1, whatsapp_enviado: false },
        { semEtapa: true },
      ),
    ).toBe("1 de 2 ligações · WhatsApp pendente");
  });

  it("não passa de 2 no contador, mesmo com ligação extra registrada", () => {
    expect(
      rotuloProgresso({ etapa: "D2", ligacoes_validas: 5, whatsapp_enviado: false }),
    ).toContain("2 de 2 ligações");
  });
});

describe("acaoPrimaria", () => {
  const base = { telefone_suspeito: false } as const;

  it("antes das 2 ligações, ligar é o destaque", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D1", ligacoes_validas: 1, whatsapp_enviado: false }),
    ).toBe("ligar");
  });

  it("com as 2 ligações feitas, o WhatsApp vira o destaque", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D1", ligacoes_validas: 2, whatsapp_enviado: false }),
    ).toBe("whatsapp");
  });

  it("etapa cumprida não destaca nada", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D2", ligacoes_validas: 2, whatsapp_enviado: true }),
    ).toBe("nenhuma");
  });

  it("D3 começa direto no WhatsApp", () => {
    expect(
      acaoPrimaria({ ...base, etapa: "D3", ligacoes_validas: 0, whatsapp_enviado: false }),
    ).toBe("whatsapp");
  });

  it("telefone suspeito não sugere canal nenhum", () => {
    expect(
      acaoPrimaria({
        etapa: "D1",
        ligacoes_validas: 0,
        whatsapp_enviado: false,
        telefone_suspeito: true,
      }),
    ).toBe("nenhuma");
  });
});

describe("as quatro etapas", () => {
  it("cada etapa tem o seu texto de WhatsApp, e D0 é o da chegada", () => {
    expect(ETAPAS_CADENCIA).toEqual(["D0", "D1", "D2", "D3"]);
    expect(CONTEXTO_POR_ETAPA.D0).toBe("cadencia_D0");
    expect(new Set(Object.values(CONTEXTO_POR_ETAPA)).size).toBe(4);
  });

  it("o corretor nunca lê 'D0': a etapa aparece pelo nome", () => {
    expect(rotuloEtapa("D0")).toBe("Lead chegou");
    expect(rotuloEtapa("D3")).toBe("Encerramento");
    // Etapa que o front ainda não conhece aparece crua, não some.
    expect(rotuloEtapa("D9")).toBe("D9");
  });
});

describe("rotuloPrazo", () => {
  // 26/09/2026 10h em São Paulo (13h UTC).
  const agora = new Date("2026-09-26T13:00:00Z");

  it("conta em dias do calendário de São Paulo", () => {
    // Fim do dia de hoje em SP = 02:59:59 UTC do dia seguinte.
    expect(rotuloPrazo("2026-09-27T02:59:59Z", false, agora)).toBe("vence hoje");
    expect(rotuloPrazo("2026-09-28T02:59:59Z", false, agora)).toBe("vence amanhã");
    expect(rotuloPrazo("2026-10-03T02:59:59Z", false, agora)).toBe("vence 02/10");
  });

  it("atrasado mostra quando venceu", () => {
    expect(rotuloPrazo("2026-09-25T02:59:59Z", true, agora)).toBe("venceu 24/09");
  });

  it("lead sem prazo não quebra o card", () => {
    expect(rotuloPrazo(null, null, agora)).toBe("sem prazo");
  });
});

describe("Kanban", () => {
  const item = (id: string, etapa: string) => ({
    id,
    nome: "Maria",
    telefone: "11987654321",
    email: null,
    status: "aguardando_atendimento",
    etapa,
    ciclo: 1,
    reativado: false,
    projeto_nome: null,
    faixa_mcmv: null,
    renda_estimada: null,
    prazo: "2026-09-27T02:59:59Z",
    atrasado: false,
    proxima_acao: null,
    telefone_suspeito: false,
    ligacoes_validas: 0,
    whatsapp_enviado: false,
    etapa_completa: false,
  });
  const payload = (itens: unknown[]) => ({
    gerado_em: "2026-09-26T13:00:00Z",
    corretor_id: "11111111-1111-4111-8111-111111111111",
    total: itens.length,
    itens,
  });

  it("agrupa nas quatro colunas, na ordem das etapas, sem perder ninguém", () => {
    const k = parseKanbanCadencia(
      payload([
        item("00000000-0000-4000-8000-000000000001", "D0"),
        item("00000000-0000-4000-8000-000000000002", "D2"),
        item("00000000-0000-4000-8000-000000000003", "D0"),
      ]),
    );
    const c = agruparPorEtapa(k.itens);
    expect(Object.keys(c)).toEqual(["D0", "D1", "D2", "D3"]);
    expect(c.D0).toHaveLength(2);
    expect(c.D1).toHaveLength(0);
    expect(c.D2).toHaveLength(1);
  });

  it("recusa etapa fora da cadência em vez de sumir com o card", () => {
    expect(() =>
      parseKanbanCadencia(payload([item("00000000-0000-4000-8000-000000000001", "respondeu")])),
    ).toThrow();
  });

  it("aceita lead sem prazo (defeito que a auditoria acusa) sem derrubar a tela", () => {
    const semPrazo = {
      ...item("00000000-0000-4000-8000-000000000001", "D1"),
      prazo: null,
      atrasado: null,
    };
    expect(parseKanbanCadencia(payload([semPrazo])).itens[0].prazo).toBeNull();
  });
});
