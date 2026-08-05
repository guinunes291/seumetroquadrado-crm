import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  chaveConstrutora,
  mesmaConstrutora,
  ordenarParceiras,
  parceiraDoProjeto,
  PARCEIRAS_PADRAO,
} from "@/lib/construtoras";

const MIGRACOES = join(process.cwd(), "supabase", "migrations");
const migracaoParceiras = readFileSync(
  join(
    MIGRACOES,
    readdirSync(MIGRACOES).find((f) => f.includes("construtoras_parceiras"))!,
  ),
  "utf8",
);

describe("chaveConstrutora", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(chaveConstrutora("  CURY Construtora S.A. ")).toBe("cury construtora s a");
    expect(chaveConstrutora("Direcional")).toBe(chaveConstrutora("DIRECIONAL"));
  });

  it("devolve string vazia para nome ausente", () => {
    expect(chaveConstrutora(null)).toBe("");
    expect(chaveConstrutora(undefined)).toBe("");
  });
});

describe("mesmaConstrutora", () => {
  it("casa o nome curto da parceira com a razão social da planilha", () => {
    expect(mesmaConstrutora("Cury Construtora S.A.", "Cury")).toBe(true);
    expect(mesmaConstrutora("RIVA INCORPORADORA", "Riva")).toBe(true);
    expect(mesmaConstrutora("Direcional Engenharia", "Direcional")).toBe(true);
    expect(mesmaConstrutora("Mundo Apto Incorporadora", "Mundo Apto")).toBe(true);
  });

  it("não casa nome que apenas começa igual", () => {
    expect(mesmaConstrutora("Rivalda Empreendimentos", "Riva")).toBe(false);
    expect(mesmaConstrutora("Curytiba Imóveis", "Cury")).toBe(false);
  });

  it("não casa construtora ausente", () => {
    expect(mesmaConstrutora(null, "Vibra")).toBe(false);
    expect(mesmaConstrutora("Vibra", "")).toBe(false);
  });
});

describe("parceiraDoProjeto", () => {
  const parceiras = PARCEIRAS_PADRAO.map((nome, i) => ({
    id: String(i),
    nome,
    ordem: i * 10,
    ativo: true,
  }));

  it("encontra a parceira pela construtora do projeto", () => {
    expect(parceiraDoProjeto("Longitude Empreendimentos", parceiras)?.nome).toBe("Longitude");
    expect(parceiraDoProjeto("VIBRA", parceiras)?.nome).toBe("Vibra");
  });

  it("devolve null para construtora fora da lista", () => {
    expect(parceiraDoProjeto("Tegra", parceiras)).toBeNull();
    expect(parceiraDoProjeto(null, parceiras)).toBeNull();
  });
});

describe("ordenarParceiras", () => {
  it("obedece a ordem da gestão e desempata pelo nome", () => {
    const ordenadas = ordenarParceiras([
      { nome: "Vibra", ordem: 30, ativo: true },
      { nome: "Cury", ordem: 10, ativo: true },
      { nome: "Alfa", ordem: 10, ativo: true },
    ]);
    expect(ordenadas.map((p) => p.nome)).toEqual(["Alfa", "Cury", "Vibra"]);
  });
});

describe("migração das construtoras parceiras", () => {
  it("semeia as seis parceiras na ordem da operação", () => {
    for (const nome of PARCEIRAS_PADRAO) {
      expect(migracaoParceiras).toContain(`'${nome}'`);
    }
    // O seed roda no replay das migrations do CI; não pode explodir na segunda vez.
    expect(migracaoParceiras).toContain("ON CONFLICT DO NOTHING");
  });

  it("protege a tabela com RLS e escrita só para gestão", () => {
    expect(migracaoParceiras).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migracaoParceiras).toMatch(/FOR INSERT[\s\S]*has_role\(auth\.uid\(\),'admin'\)/);
    expect(migracaoParceiras).toMatch(/FOR DELETE[\s\S]*has_role\(auth\.uid\(\),'admin'\)/);
  });

  it("impede parceira duplicada por diferença de caixa ou espaço", () => {
    expect(migracaoParceiras).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_construtoras_parceiras_nome[\s\S]*lower\(btrim\(nome\)\)/,
    );
  });
});
