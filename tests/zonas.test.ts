import { describe, it, expect } from "vitest";
import {
  contarPorZona,
  GRANDE_SP,
  rotuloZona,
  SEM_ZONA,
  zonaDoProjeto,
  zonaOuSemZona,
} from "@/lib/zonas";

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
    expect(zonaDoProjeto({ regiao: "Interior" })).toBeNull();
  });

  // Decisão 4 de 2026-09-02: Grande SP é zona de primeira classe na prateleira.
  it("reconhece Grande SP pela zona, pela região, pela cidade e pelo bairro colado", () => {
    expect(zonaDoProjeto({ zona_smq: "Grande SP" })).toBe(GRANDE_SP);
    expect(zonaDoProjeto({ regiao: "ABC Paulista" })).toBe(GRANDE_SP);
    expect(zonaDoProjeto({ zona_smq: "Zona Norte", cidade: "Guarulhos" })).toBe(GRANDE_SP);
    expect(zonaDoProjeto({ bairro: "Ponte Grande (Guarulhos)" })).toBe(GRANDE_SP);
    expect(zonaDoProjeto({ cidade: "Osasco" })).toBe(GRANDE_SP);
  });

  it("cidade São Paulo não vira Grande SP e não confunde bairro com município", () => {
    expect(zonaDoProjeto({ zona_smq: "Zona Sul", cidade: "São Paulo" })).toBe("Sul");
    expect(zonaDoProjeto({ bairro: "Vila Mauá", cidade: "São Paulo", zona_smq: "Leste" })).toBe(
      "Leste",
    );
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

  it("Grande SP entra depois da capital e antes de Sem zona", () => {
    const contagem = contarPorZona([
      { cidade: "Guarulhos" },
      { regiao: "Zona Oeste" },
      { regiao: null },
    ]);
    expect(contagem.map((c) => c.zona)).toEqual(["Oeste", GRANDE_SP, SEM_ZONA]);
  });
});

describe("rotuloZona", () => {
  it("prefixa as cardeais com 'Zona' e deixa Centro, Grande SP e Sem zona como estão", () => {
    expect(rotuloZona("Sul")).toBe("Zona Sul");
    expect(rotuloZona("Centro")).toBe("Centro");
    expect(rotuloZona(GRANDE_SP)).toBe("Grande SP");
    expect(rotuloZona(SEM_ZONA)).toBe("Sem zona");
  });
});
