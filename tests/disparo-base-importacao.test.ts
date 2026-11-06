// Disparo da base do corretor — leitura da planilha e contrato da importação.
// As regras de quem entra estão no banco (tests/db/disparo-base.test.ts);
// aqui se trava o que a tela manda e como ela lê a resposta.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RESULTADO_VAZIO,
  bloqueiosPorMotivo,
  colunasFaltando,
  funilDoDisparo,
  lerResultadoImportacao,
  linhasDaPlanilha,
  resumoImportacao,
  somarResultados,
} from "@/features/disparo-base/importacao";
import { SISTEMAS } from "@/features/nav/sistemas";
import { secoesVisiveis } from "@/features/nav/sistemas-visibilidade";

describe("planilha do corretor", () => {
  it("aceita os nomes de coluna do mundo real (Celular, WhatsApp, Nome completo, Região)", () => {
    const linhas = linhasDaPlanilha([
      {
        "Nome completo": "Maria Souza",
        Celular: "(11) 98111-0001",
        "E-mail": "m@x.com",
        Região: "Zona Leste",
      },
      { Nome: "João", WhatsApp: "11981110002", Zona: "centro", Renda: "R$ 4.000" },
    ]);
    expect(linhas).toEqual([
      {
        linha: 2,
        nome: "Maria Souza",
        telefone: "(11) 98111-0001",
        email: "m@x.com",
        zona: "Leste",
        renda: null,
      },
      {
        linha: 3,
        nome: "João",
        telefone: "11981110002",
        email: null,
        zona: "Centro",
        renda: "R$ 4.000",
      },
    ]);
  });

  it("zona desconhecida vira vazio (o banco resolve pelo bairro/empreendimento depois)", () => {
    expect(linhasDaPlanilha([{ nome: "A", telefone: "11", zona: "Marte" }])[0].zona).toBeNull();
  });

  it("linha totalmente vazia não conta, mas mantém a numeração da planilha", () => {
    const l = linhasDaPlanilha([
      { nome: "", telefone: "" },
      { nome: "B", telefone: "11981110003" },
    ]);
    expect(l).toHaveLength(1);
    expect(l[0].linha).toBe(3);
  });

  it("acusa a coluna obrigatória que falta", () => {
    expect(colunasFaltando([{ Nome: "A", Celular: "1" }])).toEqual([]);
    expect(colunasFaltando([{ Cliente: "A", Cidade: "SP" }])).toEqual(["Telefone"]);
    expect(colunasFaltando([{ fone: "1" }])).toEqual(["Nome"]);
  });
});

describe("resposta do banco (importar_base_corretor_lote)", () => {
  const ok = {
    novos: 2,
    ja_na_carteira: 1,
    bloqueados: [
      { linha: 4, nome: "Da Bia", telefone: "11", motivo: "outra_carteira" },
      { linha: 5, nome: "Saiu", telefone: "11", motivo: "pediu_para_sair" },
      { linha: 6, nome: "Outra", telefone: "11", motivo: "outra_carteira" },
    ],
    erros: [{ linha: 7, nome: null, telefone: "98", motivo: "telefone sem DDD ou inválido" }],
  };

  it("lê o contrato e agrupa os bloqueios por motivo", () => {
    const r = lerResultadoImportacao(ok);
    expect(r).not.toBeNull();
    expect(bloqueiosPorMotivo(r!)).toEqual([
      { motivo: "outra_carteira", qtd: 2 },
      { motivo: "pediu_para_sair", qtd: 1 },
    ]);
    expect(resumoImportacao(r!)).toBe("3 contatos no disparo; 4 ficaram de fora.");
  });

  it("fail-closed: motivo desconhecido ou forma errada vira null", () => {
    expect(lerResultadoImportacao(null)).toBeNull();
    expect(
      lerResultadoImportacao({ ...ok, bloqueados: [{ linha: 1, motivo: "qualquer" }] }),
    ).toBeNull();
    expect(lerResultadoImportacao({ inseridos: 1 })).toBeNull();
  });

  it("soma os lotes", () => {
    const r = lerResultadoImportacao(ok)!;
    const s = somarResultados(somarResultados(RESULTADO_VAZIO, r), r);
    expect(s.novos).toBe(4);
    expect(s.bloqueados).toHaveLength(6);
    expect(resumoImportacao({ ...RESULTADO_VAZIO, novos: 1 })).toBe("1 contato no disparo.");
  });
});

describe("funil do disparo", () => {
  it("quem está adiante passou pelas etapas de trás; falha e saída contam à parte", () => {
    const f = funilDoDisparo(["na_fila", "enviado", "lido", "qualificado", "falha", "saiu", "x"]);
    expect(f).toMatchObject({
      na_fila: 1,
      enviado: 3,
      entregue: 2,
      lido: 2,
      respondeu: 1,
      qualificado: 1,
      falha: 1,
      saiu: 1,
    });
  });
});

describe("menu", () => {
  const prospeccao = SISTEMAS.find((s) => s.id === "prospeccao")!;
  const ids = (flags: string[]) =>
    secoesVisiveis(prospeccao, {
      roles: ["corretor"],
      isAdmin: false,
      flagsLigadas: new Set(flags),
    }).map((s) => s.id);

  it("o Disparo da base só aparece para quem está no piloto", () => {
    expect(ids([])).not.toContain("disparo-base");
    expect(ids(["disparo_base"])).toContain("disparo-base");
  });
});

describe("server function", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/disparo-base.functions.ts"), "utf8");

  it("o corretor vem do token, nunca do corpo da requisição", () => {
    expect(src).toContain("_corretor: context.userId");
    expect(src).not.toMatch(/_corretor:\s*data\./);
  });
});
