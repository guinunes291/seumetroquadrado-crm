import { describe, expect, it } from "vitest";
import { parseDelimitedText } from "@/lib/spreadsheets";

describe("parseDelimitedText", () => {
  it("lê CSV com vírgulas, aspas escapadas e quebra de linha", () => {
    const rows = parseDelimitedText(
      'Nome,Observação,Telefone\r\n"Ana Souza","Disse ""sim""\ne pediu retorno",11999990000',
    );

    expect(rows).toEqual([
      {
        Nome: "Ana Souza",
        Observação: 'Disse "sim"\ne pediu retorno',
        Telefone: "11999990000",
      },
    ]);
  });

  it("detecta ponto e vírgula e remove BOM do cabeçalho", () => {
    expect(parseDelimitedText("\ufeffNome;Renda\nJoão;4500")).toEqual([
      { Nome: "João", Renda: "4500" },
    ]);
  });

  it("ignora linhas totalmente vazias", () => {
    expect(parseDelimitedText("Nome,Telefone\n\nMaria,11\n,\n")).toEqual([
      { Nome: "Maria", Telefone: "11" },
    ]);
  });

  it("rejeita campo sem fechamento", () => {
    expect(() => parseDelimitedText('Nome,Nota\nAna,"aberta')).toThrow("sem fechamento");
  });
});
