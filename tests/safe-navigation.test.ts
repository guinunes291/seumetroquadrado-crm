import { describe, expect, it } from "vitest";

import { safeSameOriginPath } from "@/lib/safe-navigation";

const ORIGIN = "https://crm.seumetroquadrado.com.br";

describe("retorno seguro pós-login", () => {
  it("preserva apenas caminho, busca e fragmento da mesma origem", () => {
    expect(safeSameOriginPath("/leads/123?tab=docs#arquivo", ORIGIN)).toBe(
      "/leads/123?tab=docs#arquivo",
    );
  });

  it.each([
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%5cevil.example",
    "javascript:alert(1)",
  ])("rejeita destino externo ou ambíguo: %s", (value) => {
    expect(safeSameOriginPath(value, ORIGIN)).toBe("/");
  });
});
