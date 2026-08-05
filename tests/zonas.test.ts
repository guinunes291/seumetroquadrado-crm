import { describe, it, expect } from "vitest";
import { contarPorZona, SEM_ZONA, zonaDoProjeto, zonaOuSemZona } from "@/lib/zonas";

describe("zonaDoProjeto", () => {
  it("prefere zona_smq quando os dois campos estão preenchidos", () => {
    expect(zonaDoProjeto({ zona_smq: "Leste", regiao: "Zona Sul" })).toBe("Leste");
  });

  it("cai em regiao — é lá que a importação por planilha grava a zona", () => {
    expect(zonaDoProjeto({ zona_smq: null, regiao: "Zona Norte" })).toBe("Norte");
    expect(zonaDoProjeto({ zona_smq: "  ", regiao: "oeste" })).toBe("Oeste");
  });

  it("normaliza acento e texto ao redor", () => {
    expect(zonaDoProjeto({ regiao: "Zona Sul (SP)" })).toBe("Sul");
    expect(zonaDoProjeto({ regiao: "CENTRO" })).toBe("Centro");
  });

  it("devolve null quando nenhum campo diz onde é", () => {
    expect(zonaDoProjeto({ zona_smq: null, regiao: null })).toBeNull();
    expect(zonaDoProjeto({ regiao: "ABC Paulista" })).toBeNull();
  });
});

describe("zonaOuSemZona", () => {
  it("dá um balde para o projeto sem zona em vez de sumir com ele", () => {
    expect(zonaOuSemZona({ regiao: null })).toBe(SEM_ZONA);
  });
});

describe("contarPorZona", () => {
  it("ordena pelos pontos cardeais e joga Sem zona para o fim", () => {
    const contagem = contarPorZona([
      { regiao: "Zona Sul" },
      { regiao: null },
      { regiao: "Zona Norte" },
      { regiao: "Zona Sul" },
      { zona_smq: "Centro" },
    ]);
    expect(contagem).toEqual([
      { zona: "Norte", total: 1 },
      { zona: "Sul", total: 2 },
      { zona: "Centro", total: 1 },
      { zona: SEM_ZONA, total: 1 },
    ]);
  });

  it("não gera chip de zona sem projeto", () => {
    const contagem = contarPorZona([{ regiao: "Zona Leste" }]);
    expect(contagem).toEqual([{ zona: "Leste", total: 1 }]);
  });
});
