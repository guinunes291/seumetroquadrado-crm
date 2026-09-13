import { describe, expect, it } from "vitest";
import {
  enderecoLegivel,
  temCoordenada,
  textoLocalizacao,
  urlComoChegar,
  urlGoogleMaps,
  type LocalizacaoProjeto,
} from "@/lib/projeto-localizacao";

const base: LocalizacaoProjeto = {
  nome: "Residencial Aurora",
  endereco: null,
  logradouro: null,
  numero: null,
  bairro: null,
  cidade: null,
};

describe("enderecoLegivel", () => {
  it("prefere logradouro + número e completa com bairro e cidade", () => {
    expect(
      enderecoLegivel({
        ...base,
        logradouro: "Rua das Flores",
        numero: "120",
        bairro: "Vila Mariana",
        cidade: "São Paulo",
        endereco: "texto antigo que deve ser ignorado",
      }),
    ).toBe("Rua das Flores, 120 · Vila Mariana · São Paulo");
  });

  it("cai no endereço livre quando não há logradouro estruturado", () => {
    expect(enderecoLegivel({ ...base, endereco: "Av. Paulista, 1000", cidade: "São Paulo" })).toBe(
      "Av. Paulista, 1000 · São Paulo",
    );
  });

  it("não repete bairro igual à cidade (importações da Vivaz)", () => {
    expect(enderecoLegivel({ ...base, bairro: "Sao Paulo", cidade: "sao paulo" })).toBe(
      "Sao Paulo",
    );
  });

  it("devolve null sem nenhum dado", () => {
    expect(enderecoLegivel({ ...base, logradouro: "  " })).toBeNull();
  });
});

describe("temCoordenada", () => {
  it("exige par numérico finito e diferente de 0,0", () => {
    expect(temCoordenada({ lat: -23.55, lng: -46.63 })).toBe(true);
    expect(temCoordenada({ lat: 0, lng: 0 })).toBe(false);
    expect(temCoordenada({ lat: null, lng: -46 })).toBe(false);
    expect(temCoordenada({ lat: Number.NaN, lng: -46 })).toBe(false);
  });
});

describe("links do Google Maps", () => {
  it("usa a coordenada quando existe", () => {
    const p = { ...base, lat: -23.55, lng: -46.63, endereco: "Rua X" };
    expect(urlGoogleMaps(p)).toBe(
      "https://www.google.com/maps/search/?api=1&query=-23.55%2C-46.63",
    );
    expect(urlComoChegar(p)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-23.55%2C-46.63",
    );
  });

  it("sem coordenada busca pelo nome + endereço", () => {
    const url = urlGoogleMaps({ ...base, logradouro: "Rua X", numero: "1", cidade: "Osasco" });
    expect(url).toContain(encodeURIComponent("Residencial Aurora, Rua X, 1, Osasco"));
  });

  it("sem coordenada nem endereço não há link", () => {
    expect(urlGoogleMaps(base)).toBeNull();
    expect(urlComoChegar(base)).toBeNull();
    expect(textoLocalizacao(base)).toBeNull();
  });
});

describe("textoLocalizacao", () => {
  it("monta nome, endereço em uma linha e o link", () => {
    const texto = textoLocalizacao({
      ...base,
      logradouro: "Rua X",
      numero: "1",
      bairro: "Centro",
      lat: -23.5,
      lng: -46.6,
    });
    expect(texto?.split("\n")).toEqual([
      "📍 *Residencial Aurora*",
      "Rua X, 1, Centro",
      "https://www.google.com/maps/search/?api=1&query=-23.5%2C-46.6",
    ]);
  });
});
