import { describe, expect, it } from "vitest";
import { isMissingBackendObject, rpcWithFallback } from "@/lib/supabase-errors";

describe("isMissingBackendObject", () => {
  it("reconhece RPC ausente (PGRST202) e tabela ausente (42P01/PGRST205)", () => {
    expect(isMissingBackendObject({ code: "PGRST202", message: "x" })).toBe(true);
    expect(isMissingBackendObject({ code: "PGRST205", message: "x" })).toBe(true);
    expect(isMissingBackendObject({ code: "42P01", message: "x" })).toBe(true);
    expect(isMissingBackendObject({ code: "42883", message: "x" })).toBe(true);
  });

  it("reconhece pelas mensagens do PostgREST quando não há código", () => {
    expect(
      isMissingBackendObject({
        message: "Could not find the function public.nav_pendencias in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingBackendObject({ message: 'relation "public.user_preferences" does not exist' }),
    ).toBe(true);
  });

  it("NÃO trata erros reais como ausência de objeto", () => {
    expect(isMissingBackendObject({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingBackendObject({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingBackendObject(new Error("network timeout"))).toBe(false);
    expect(isMissingBackendObject(null)).toBe(false);
    expect(isMissingBackendObject("string")).toBe(false);
  });
});

describe("rpcWithFallback", () => {
  it("retorna o resultado da chamada nova quando ela funciona", async () => {
    const out = await rpcWithFallback(
      async () => "novo",
      () => "fallback",
    );
    expect(out).toBe("novo");
  });

  it("usa o fallback quando o objeto não existe no banco", async () => {
    const out = await rpcWithFallback(
      async () => {
        throw { code: "PGRST202", message: "not found" };
      },
      () => "fallback",
    );
    expect(out).toBe("fallback");
  });

  it("propaga erros reais em vez de mascará-los com o fallback", async () => {
    await expect(
      rpcWithFallback(
        async () => {
          throw { code: "42501", message: "permission denied" };
        },
        () => "fallback",
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
