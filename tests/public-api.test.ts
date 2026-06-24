import { describe, it, expect, beforeEach } from "vitest";
import {
  PUBLIC_LEAD_FIELDS,
  PUBLIC_LEAD_SELECT,
  checkRateLimit,
  __resetRateLimit,
} from "@/lib/public-api-auth";

describe("API pública de leitura — allowlist de campos do lead", () => {
  // Campos sensíveis (PII) que NÃO podem vazar pela API pública, que é
  // autenticada por uma única chave estática compartilhada (risco LGPD).
  const PII_PROIBIDA = [
    "cpf",
    "renda_informada",
    "entrada_disponivel",
    "observacoes",
  ];

  it("não inclui nenhum campo de PII sensível", () => {
    for (const campo of PII_PROIBIDA) {
      expect(PUBLIC_LEAD_FIELDS).not.toContain(campo);
      expect(PUBLIC_LEAD_SELECT.split(",")).not.toContain(campo);
    }
  });

  it("expõe os campos operacionais esperados", () => {
    for (const campo of ["id", "nome", "status", "corretor_id", "projeto_id"]) {
      expect(PUBLIC_LEAD_FIELDS).toContain(campo);
    }
  });

  it("PUBLIC_LEAD_SELECT é a lista de campos separada por vírgula", () => {
    expect(PUBLIC_LEAD_SELECT).toBe(PUBLIC_LEAD_FIELDS.join(","));
  });
});

describe("API pública de leitura — rate limit", () => {
  beforeEach(() => __resetRateLimit());

  function req(key = "chave-de-teste") {
    return new Request("https://app/api/public/leads", {
      headers: { "x-api-key": key },
    });
  }

  it("permite requisições abaixo do limite e bloqueia ao ultrapassar", () => {
    const t0 = 1_000_000;
    // Limite padrão = 60/min. As 60 primeiras passam (retornam null).
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit(req(), t0)).toBeNull();
    }
    // A 61ª é bloqueada com 429.
    const blocked = checkRateLimit(req(), t0);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it("zera a contagem após a janela de 1 minuto", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 60; i++) checkRateLimit(req(), t0);
    expect(checkRateLimit(req(), t0)!.status).toBe(429);
    // Passada a janela (>60s), volta a permitir.
    expect(checkRateLimit(req(), t0 + 61_000)).toBeNull();
  });

  it("isola buckets por chave de API distinta", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 60; i++) checkRateLimit(req("chave-A"), t0);
    expect(checkRateLimit(req("chave-A"), t0)!.status).toBe(429);
    // Outra chave tem seu próprio bucket.
    expect(checkRateLimit(req("chave-B"), t0)).toBeNull();
  });
});
