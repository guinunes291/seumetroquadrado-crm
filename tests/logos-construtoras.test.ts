// Logos locais das construtoras (decisão 13): casamento por nome, precedência
// da logo cadastrada pela gestão e integridade do manifesto x arquivos.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  LOGOS_CONSTRUTORAS,
  logoDaConstrutora,
  logoDoProjeto,
  urlLogo,
} from "@/lib/logos-construtoras";
import { logoDoItem, type ParceiraPrateleira } from "@/lib/prateleira";

const slug = (nome: string | null) => logoDaConstrutora(nome)?.slug ?? null;

describe("logoDaConstrutora", () => {
  it("casa pelo núcleo do nome, ignorando sufixo societário e caixa", () => {
    expect(slug("Cury")).toBe("cury");
    expect(slug("CURY CONSTRUTORA S.A.")).toBe("cury");
    expect(slug("Cury Construtora e Incorporadora")).toBe("cury");
    expect(slug("Mundo APTO")).toBe("mundo-apto");
    expect(slug("Plano&Plano")).toBe("plano-e-plano");
    expect(slug("Plano e Plano Construtora")).toBe("plano-e-plano");
    expect(slug("Vitta Bild")).toBe("vitta");
    expect(slug("Magik JC Empreendimentos")).toBe("magik-jc");
  });

  it("marca com duas grifes no nome cai na grife principal: Vivaz antes de Cyrela", () => {
    expect(slug("Vivaz (Cyrela)")).toBe("vivaz");
    expect(slug("Cyrela Vivaz")).toBe("vivaz");
    expect(slug("Cyrela Brazil Realty")).toBe("cyrela");
  });

  it("não casa por prefixo solto nem sem nome", () => {
    expect(slug("Rivalda Empreendimentos")).toBeNull();
    expect(slug("Construtora Desconhecida")).toBeNull();
    expect(slug("")).toBeNull();
    expect(slug(null)).toBeNull();
  });
});

describe("logoDoProjeto", () => {
  it("com construtora preenchida ela manda, mesmo que o nome cite outra marca", () => {
    expect(logoDoProjeto({ construtora: "Tenda", nome: "Mundo Apto Brooklin" })?.slug).toBe(
      "tenda",
    );
  });

  it("sem construtora, tenta pelo nome do empreendimento", () => {
    expect(
      logoDoProjeto({ construtora: null, nome: "Mundo APTO Voluntários da Pátria" })?.slug,
    ).toBe("mundo-apto");
    expect(logoDoProjeto({ construtora: "  ", nome: "NeoConx Elisio 660" })?.slug).toBe("conx");
    expect(logoDoProjeto({ construtora: null, nome: "Residencial Jardim das Flores" })).toBeNull();
  });
});

describe("logoDoItem (precedência na prateleira)", () => {
  const parceira: ParceiraPrateleira = {
    id: "p1",
    nome: "Cury",
    ordem: 10,
    ativo: true,
    logo_url: "https://cdn.exemplo/cury.png",
  };

  it("a logo cadastrada pela gestão vence a local", () => {
    const logo = logoDoItem({ construtora: "Cury", nome: "Cury Vila Prudente" }, parceira);
    expect(logo).toEqual({
      url: "https://cdn.exemplo/cury.png",
      fundo: "claro",
      origem: "parceira",
    });
  });

  it("sem logo cadastrada, usa a local pelo nome da construtora", () => {
    const logo = logoDoItem(
      { construtora: "Cury", nome: "Cury Vila Prudente" },
      { ...parceira, logo_url: null },
    );
    expect(logo).toEqual({
      url: "/logos/construtoras/cury.png",
      fundo: logoDaConstrutora("Cury")?.fundo,
      origem: "local",
    });
  });

  it("parceira casada pelo nome do projeto ainda ganha a logo local da marca", () => {
    const logo = logoDoItem(
      { construtora: null, nome: "Residencial Sem Marca" },
      { ...parceira, nome: "Tenda", logo_url: null },
    );
    expect(logo?.url).toBe("/logos/construtoras/tenda.png");
    expect(logo?.fundo).toBe("escuro");
  });

  it("sem parceira e sem marca conhecida, null (o card mostra as iniciais)", () => {
    expect(logoDoItem({ construtora: "Construtora Zeta", nome: "Zeta Home" }, null)).toBeNull();
  });
});

describe("manifesto x arquivos em public/", () => {
  it("slugs únicos, fundo válido e arquivo presente para cada logo", () => {
    const slugs = new Set<string>();
    for (const l of LOGOS_CONSTRUTORAS) {
      expect(slugs.has(l.slug), `slug duplicado: ${l.slug}`).toBe(false);
      slugs.add(l.slug);
      expect(["claro", "escuro"]).toContain(l.fundo);
      expect(l.nomes.length).toBeGreaterThan(0);
      const caminho = join(process.cwd(), "public", urlLogo(l));
      expect(existsSync(caminho), `arquivo ausente: ${caminho}`).toBe(true);
    }
  });
});
