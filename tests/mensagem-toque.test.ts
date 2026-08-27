import { describe, expect, it } from "vitest";

import {
  escolherTemplateDoToque,
  fallbackMensagemToque,
  mensagemDoToque,
} from "@/features/followup/mensagem-toque";

describe("escolherTemplateDoToque (convenção 'Régua N')", () => {
  it("casa pelo prefixo, case-insensitive e com sufixo livre", () => {
    const templates = [
      { nome: "Boas-vindas", conteudo: "oi" },
      { nome: "régua 3 — morno", conteudo: "toque 3" },
      { nome: "RÉGUA 5", conteudo: "toque 5" },
    ];
    expect(escolherTemplateDoToque(templates, 3)).toBe("toque 3");
    expect(escolherTemplateDoToque(templates, 5)).toBe("toque 5");
  });

  it("'Régua 12' NÃO casa o toque 1 (prefixo numérico exato)", () => {
    const templates = [{ nome: "Régua 12", conteudo: "toque 12" }];
    expect(escolherTemplateDoToque(templates, 1)).toBeNull();
    expect(escolherTemplateDoToque(templates, 12)).toBe("toque 12");
  });

  it("empate → primeiro da lista; nenhum → null", () => {
    const templates = [
      { nome: "Régua 2 (A)", conteudo: "primeiro" },
      { nome: "Régua 2 (B)", conteudo: "segundo" },
    ];
    expect(escolherTemplateDoToque(templates, 2)).toBe("primeiro");
    expect(escolherTemplateDoToque(templates, 7)).toBeNull();
    expect(escolherTemplateDoToque([], 1)).toBeNull();
  });

  it("tolera nome sem acento ('Regua 4')", () => {
    expect(escolherTemplateDoToque([{ nome: "Regua 4", conteudo: "x" }], 4)).toBe("x");
  });
});

describe("mensagemDoToque (template → render; senão fallback)", () => {
  const templates = [{ nome: "Régua 1", conteudo: "Oi {{nome}}, novidades do {{projeto}}!" }];

  it("renderiza o template com primeiro nome e projeto", () => {
    const msg = mensagemDoToque({
      toque: 1,
      maxToques: 13,
      nome: "Maria Souza",
      projetoNome: "Vibra Itaquera",
      templates,
    });
    expect(msg).toBe("Oi Maria, novidades do Vibra Itaquera!");
  });

  it("{{primeiro_nome}} também é suportado; projeto ausente fica visível", () => {
    const msg = mensagemDoToque({
      toque: 1,
      maxToques: 13,
      nome: "João Pedro Lima",
      projetoNome: null,
      templates: [{ nome: "Régua 1", conteudo: "{{primeiro_nome}}: {{projeto}}" }],
    });
    // Placeholder sem valor permanece visível (contrato do renderTemplate).
    expect(msg).toBe("João: {{projeto}}");
  });

  it("sem template do toque, cai no fallback embutido", () => {
    const msg = mensagemDoToque({
      toque: 2,
      maxToques: 13,
      nome: "Maria Souza",
      projetoNome: "Vibra Itaquera",
      templates, // só tem "Régua 1"
    });
    expect(msg).toBe(fallbackMensagemToque(2, 13, "Maria Souza", "Vibra Itaquera"));
  });
});

describe("fallbackMensagemToque (G.P.V.A. por fase)", () => {
  it("toque 1 tem no máximo 4 linhas", () => {
    const msg = fallbackMensagemToque(1, 13, "Maria Souza", "Vibra Itaquera");
    expect(msg.split("\n").length).toBeLessThanOrEqual(4);
  });

  it("todos os toques da régua padrão ficam em até 4 linhas", () => {
    for (let toque = 1; toque <= 13; toque++) {
      const comProjeto = fallbackMensagemToque(toque, 13, "Maria Souza", "Vibra Itaquera");
      const semProjeto = fallbackMensagemToque(toque, 13, "Maria Souza", null);
      expect(comProjeto.split("\n").length).toBeLessThanOrEqual(4);
      expect(semProjeto.split("\n").length).toBeLessThanOrEqual(4);
    }
  });

  it("personaliza com primeiro nome e projeto quando houver", () => {
    const msg = fallbackMensagemToque(1, 13, "Maria Souza", "Vibra Itaquera");
    expect(msg).toContain("Maria");
    expect(msg).not.toContain("Souza");
    expect(msg).toContain("Vibra Itaquera");
    // Sem projeto a mensagem continua inteira (sem buraco de template).
    expect(fallbackMensagemToque(1, 13, "Maria Souza", null)).not.toContain("{{");
  });

  it("fases da régua padrão de 13: 1–4 abertura, 5–9 consultiva, 10–13 encerramento", () => {
    const encerra = (t: number) => /encerr/i.test(fallbackMensagemToque(t, 13, "Ana"));
    for (const t of [1, 2, 3, 4, 5, 6, 7, 8, 9]) expect(encerra(t)).toBe(false);
    for (const t of [10, 11, 12, 13]) expect(encerra(t)).toBe(true);

    // Abertura fala de valor/próximo passo; consultiva traz conteúdo/prova.
    const abertura = [1, 2, 3, 4].map((t) => fallbackMensagemToque(t, 13, "Ana"));
    const consultiva = [5, 6, 7, 8, 9].map((t) => fallbackMensagemToque(t, 13, "Ana"));
    expect(new Set(abertura).size).toBeGreaterThan(1); // varia dentro da fase
    for (const msg of consultiva) expect(abertura).not.toContain(msg);
  });

  it("fase de encerramento acompanha um max_toques menor", () => {
    // Numa régua curta o último toque também é a chamada honesta.
    expect(/encerr/i.test(fallbackMensagemToque(5, 5, "Ana"))).toBe(true);
    expect(/encerr/i.test(fallbackMensagemToque(1, 5, "Ana"))).toBe(false);
  });
});
