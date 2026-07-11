import { describe, it, expect } from "vitest";
import { parseLandingPayload } from "@/routes/api/public/webhooks/landing";

describe("parseLandingPayload", () => {
  it("aceita um lead válido e normaliza campos", () => {
    const r = parseLandingPayload({
      nome: "João da Silva",
      whatsapp: "(11) 91234-5678",
      renda: 3500,
      marketing: { utm_source: "google", utm_campaign: "mcmv" },
      simulacao: { renda: 3500, temDependente: true, tetoImovel: 250000 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nome).toBe("João da Silva");
      expect(r.digits).toBe("11912345678");
      expect(r.row.utm_source).toBe("google");
      expect(r.row.renda).toBe("3500");
      expect(r.row.sim_tem_dependente).toBe(true);
      expect(r.row.sim_teto_imovel).toBe(250000);
    }
  });

  it("rejeita nome curto", () => {
    const r = parseLandingPayload({ nome: "Jo", whatsapp: "11912345678" });
    expect(r).toEqual({ ok: false, error: "nome_invalido" });
  });

  it("rejeita telefone inválido (poucos dígitos)", () => {
    const r = parseLandingPayload({ nome: "João Silva", whatsapp: "123" });
    expect(r).toEqual({ ok: false, error: "whatsapp_invalido" });
  });

  it("rejeita telefone com dígitos demais", () => {
    const r = parseLandingPayload({ nome: "João Silva", whatsapp: "551199999999999" });
    expect(r).toEqual({ ok: false, error: "whatsapp_invalido" });
  });

  it("aceita sem bloco de simulação", () => {
    const r = parseLandingPayload({ nome: "Maria Souza", whatsapp: "11987654321" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.sim_renda).toBeUndefined();
  });

  it("não persiste token Turnstile nem campos de honeypot no raw", () => {
    const r = parseLandingPayload({
      nome: "Maria Souza",
      whatsapp: "11987654321",
      turnstile_token: "token-publico",
      "cf-turnstile-response": "token-alternativo",
      website: "spam.example",
      simHp: "bot",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.raw).toEqual({ nome: "Maria Souza", whatsapp: "11987654321" });
    }
  });

  it("rejeita objetos em campos de texto e números fora do teto", () => {
    expect(parseLandingPayload({ nome: {}, whatsapp: "11987654321" })).toEqual({
      ok: false,
      error: "nome_invalido",
    });
    expect(
      parseLandingPayload({
        nome: "Maria Souza",
        whatsapp: "11987654321",
        simulacao: { tetoImovel: 2_000_000_000 },
      }),
    ).toEqual({ ok: false, error: "simulacao_invalida" });
  });
});
