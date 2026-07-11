import { describe, it, expect } from "vitest";
import { decidirDisposicao, backoffMs, PUSH_MAX_ATTEMPTS } from "@/lib/push/outbox";

const NOW = 1_700_000_000_000;

describe("decidirDisposicao", () => {
  it("marca 'sent' quando houve pelo menos uma entrega", () => {
    const d = decidirDisposicao({ attempts: 0 }, { delivered: 1, subscriptions: 2 }, NOW);
    expect(d.acao).toBe("sent");
  });

  it("reagenda (retry) quando o usuário não tem subscriptions", () => {
    const d = decidirDisposicao({ attempts: 0 }, { delivered: 0, subscriptions: 0 }, NOW);
    expect(d.acao).toBe("retry");
    if (d.acao === "retry") {
      expect(d.attempts).toBe(1);
      expect(new Date(d.nextAttemptAt).getTime()).toBe(NOW + backoffMs(1));
      expect(d.lastError).toContain("sem_subscriptions");
    }
  });

  it("reagenda quando havia subscriptions mas nada foi entregue (falha transitória)", () => {
    const d = decidirDisposicao({ attempts: 2 }, { delivered: 0, subscriptions: 3 }, NOW);
    expect(d.acao).toBe("retry");
    if (d.acao === "retry") {
      expect(d.attempts).toBe(3);
      expect(d.lastError).toContain("falha_de_entrega");
    }
  });

  it("descarta após o teto de tentativas (não fica em loop eterno)", () => {
    const d = decidirDisposicao(
      { attempts: PUSH_MAX_ATTEMPTS - 1 },
      { delivered: 0, subscriptions: 0 },
      NOW,
    );
    expect(d.acao).toBe("discard");
    if (d.acao === "discard") {
      expect(d.attempts).toBe(PUSH_MAX_ATTEMPTS);
      expect(d.lastError).toContain("descartado");
    }
  });

  it("nunca perde silenciosamente: 0 entregas na 1ª tentativa vira retry, não sent", () => {
    const d = decidirDisposicao({ attempts: 0 }, { delivered: 0, subscriptions: 1 }, NOW);
    expect(d.acao).not.toBe("sent");
  });
});

describe("backoffMs", () => {
  it("cresce exponencialmente a partir de 5min", () => {
    expect(backoffMs(1)).toBe(5 * 60_000);
    expect(backoffMs(2)).toBe(10 * 60_000);
    expect(backoffMs(3)).toBe(20 * 60_000);
  });

  it("satura em 6h", () => {
    expect(backoffMs(50)).toBe(6 * 60 * 60_000);
  });
});
