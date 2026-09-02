// Leitura com colunas novas degrada quando a coluna não existe (42703) OU
// quando ainda não tem GRANT (42501) — o caso real de 2026-09-02: `projetos`
// tem privilégios por coluna e as colunas da prateleira nasceram sem grant.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isColumnNotAccessible,
  isMissingColumn,
  selectWithColumnFallback,
} from "@/lib/supabase-errors";

describe("isMissingColumn / isColumnNotAccessible", () => {
  it("reconhece coluna inexistente pelo código ou pela mensagem", () => {
    expect(isMissingColumn({ code: "42703", message: "x" })).toBe(true);
    expect(isMissingColumn({ message: "column projetos.foo does not exist" })).toBe(true);
    expect(isMissingColumn({ code: "42501", message: "permission denied" })).toBe(false);
  });

  it("reconhece coluna sem GRANT pelo código ou pela mensagem do PostgREST", () => {
    expect(
      isColumnNotAccessible({ code: "42501", message: "permission denied for table projetos" }),
    ).toBe(true);
    expect(isColumnNotAccessible({ message: "permission denied for table projetos" })).toBe(true);
    expect(isColumnNotAccessible({ code: "PGRST116", message: "not found" })).toBe(false);
    expect(isColumnNotAccessible(null)).toBe(false);
  });
});

describe("selectWithColumnFallback", () => {
  it("cai no caminho antigo quando a coluna não existe", async () => {
    const r = await selectWithColumnFallback(
      async () => {
        throw { code: "42703", message: "column does not exist" };
      },
      () => "antigo",
    );
    expect(r).toBe("antigo");
  });

  it("cai no caminho antigo quando a coluna existe mas não tem GRANT (42501)", async () => {
    const r = await selectWithColumnFallback(
      async () => {
        throw { code: "42501", message: "permission denied for table projetos" };
      },
      () => "antigo",
    );
    expect(r).toBe("antigo");
  });

  it("devolve o caminho novo quando funciona e propaga outros erros", async () => {
    expect(
      await selectWithColumnFallback(
        async () => "novo",
        () => "antigo",
      ),
    ).toBe("novo");
    await expect(
      selectWithColumnFallback(
        async () => {
          throw { code: "PGRST301", message: "JWT expired" };
        },
        () => "antigo",
      ),
    ).rejects.toMatchObject({ code: "PGRST301" });
  });
});

describe("migration de GRANT das colunas novas", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const grants = read("supabase/migrations/20260902130000_prateleira_grants_colunas.sql");
  const lockdown = read("supabase/migrations/20260711136000_projetos_webhook_token_lockdown.sql");

  it("libera SELECT das duas colunas da prateleira para authenticated, e nada de UPDATE", () => {
    expect(grants).toMatch(
      /GRANT SELECT \(preco_atualizado_em, tabela_atualizada_em\)\s+ON TABLE public\.projetos TO authenticated;/,
    );
    expect(grants).not.toMatch(/GRANT (UPDATE|INSERT)/);
  });

  it("nunca reabre o webhook_token", () => {
    // Só o SQL conta: o cabeçalho comentado cita o lockdown do webhook_token de propósito.
    const sqlSemComentario = grants.replace(/--[^\n]*/g, "");
    expect(sqlSemComentario).not.toContain("webhook_token");
    expect(lockdown).toContain(
      "REVOKE SELECT, INSERT, UPDATE ON TABLE public.projetos FROM authenticated",
    );
  });
});
