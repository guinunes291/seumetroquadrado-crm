/**
 * Guard de conta ativa (P1-1 da auditoria de 2026-07-11).
 *
 * A regressão que este teste blinda: o guard antigo tratava QUALQUER erro do
 * RPC conta_atual_ativa (timeout, 5xx, RPC ausente) como conta inativa e fazia
 * signOut global — um soluço de banco deslogava todos os usuários. A decisão
 * correta (verificarContaAtiva, consumida por _authenticated/route.tsx):
 * só a negação definitiva do banco desloga; falha de infra degrada mantendo a
 * sessão (a RLS continua sendo a barreira real no servidor).
 */
import { describe, expect, it, vi } from "vitest";
import { verificarContaAtiva } from "@/lib/conta-ativa";

const ok = (data: boolean | null) => ({ data, error: null });
const falha = () => ({ data: null, error: { message: "timeout" } });

describe("verificarContaAtiva", () => {
  it("conta ativa: banco responde true", async () => {
    const rpc = vi.fn().mockResolvedValue(ok(true));
    await expect(verificarContaAtiva(rpc, { esperaMs: 0 })).resolves.toBe("ativa");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("negação real: banco responde false — e só isso pode deslogar", async () => {
    const rpc = vi.fn().mockResolvedValue(ok(false));
    await expect(verificarContaAtiva(rpc, { esperaMs: 0 })).resolves.toBe("inativa");
  });

  it("falha transitória em TODAS as tentativas NÃO vira 'inativa' (P1-1)", async () => {
    const rpc = vi.fn().mockResolvedValue(falha());
    await expect(verificarContaAtiva(rpc, { esperaMs: 0 })).resolves.toBe("indisponivel");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("retry: falha na 1ª tentativa e sucesso na 2ª segue como ativa", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(falha())
      .mockResolvedValueOnce(ok(true));
    await expect(verificarContaAtiva(rpc, { esperaMs: 0 })).resolves.toBe("ativa");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("retry: falha na 1ª e negação real na 2ª desloga", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(falha())
      .mockResolvedValueOnce(ok(false));
    await expect(verificarContaAtiva(rpc, { esperaMs: 0 })).resolves.toBe("inativa");
  });

  it("data null sem erro é tratado como negação (conta não encontrada)", async () => {
    // O RPC retorna null p.ex. quando o perfil não existe mais — sem erro de
    // infra não há motivo para manter a sessão.
    const rpc = vi.fn().mockResolvedValue(ok(null));
    await expect(verificarContaAtiva(rpc, { esperaMs: 0 })).resolves.toBe("inativa");
  });
});
