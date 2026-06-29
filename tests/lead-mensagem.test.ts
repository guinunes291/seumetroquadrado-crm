import { describe, it, expect } from "vitest";
import {
  OBJETIVOS_MENSAGEM,
  resolverObjetivo,
  montarInstrucao,
} from "@/lib/lead-mensagem";

describe("resolverObjetivo", () => {
  it("resolve chave conhecida", () => {
    expect(resolverObjetivo("confirmar_visita").label).toBe("Confirmar visita");
  });
  it("faz fallback para o primeiro objetivo quando desconhecido/nulo", () => {
    expect(resolverObjetivo(undefined).value).toBe(OBJETIVOS_MENSAGEM[0].value);
    expect(resolverObjetivo("inexistente").value).toBe(OBJETIVOS_MENSAGEM[0].value);
  });
});

describe("montarInstrucao", () => {
  it("usa a instrução do objetivo escolhido", () => {
    const i = montarInstrucao({ objetivo: "reativar" });
    expect(i).toContain("Reative");
    expect(i).not.toContain("objeção");
  });

  it("inclui a objeção quando informada", () => {
    const i = montarInstrucao({ objetivo: "quebrar_objecao", objecao: "achei caro" });
    expect(i).toContain('"achei caro"');
  });

  it("anexa a resposta da biblioteca como base de argumento", () => {
    const i = montarInstrucao({
      objetivo: "quebrar_objecao",
      objecao: "vou pensar",
      respostaBiblioteca: "O subsídio pode mudar até o mês que vem.",
    });
    expect(i).toContain("base de argumento");
    expect(i).toContain("subsídio");
  });

  it("ignora objeção em branco", () => {
    const i = montarInstrucao({ objetivo: "primeiro_contato", objecao: "   " });
    expect(i).not.toContain("objeção");
  });
});
