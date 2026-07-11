import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  __resetRateLimit,
  __rateLimitBucketCountForTests,
  __RATE_LIMIT_MAX_BUCKETS_FOR_TESTS,
} from "@/lib/rate-limit";

describe("rateLimit — janela fixa em memória", () => {
  beforeEach(() => __resetRateLimit());

  it("permite até o máximo e bloqueia em seguida", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000, t0).allowed).toBe(true);
    }
    const blocked = rateLimit("k", 5, 60_000, t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBeGreaterThan(0);
  });

  it("decrementa remaining a cada chamada", () => {
    const t0 = 2_000_000;
    expect(rateLimit("k", 3, 60_000, t0).remaining).toBe(2);
    expect(rateLimit("k", 3, 60_000, t0).remaining).toBe(1);
    expect(rateLimit("k", 3, 60_000, t0).remaining).toBe(0);
  });

  it("reinicia a cota após a janela", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 60_000, t0);
    expect(rateLimit("k", 3, 60_000, t0).allowed).toBe(false);
    expect(rateLimit("k", 3, 60_000, t0 + 60_001).allowed).toBe(true);
  });

  it("isola chaves distintas", () => {
    const t0 = 4_000_000;
    for (let i = 0; i < 3; i++) rateLimit("a", 3, 60_000, t0);
    expect(rateLimit("a", 3, 60_000, t0).allowed).toBe(false);
    expect(rateLimit("b", 3, 60_000, t0).allowed).toBe(true);
  });

  it("mantém um teto rígido de buckets sob flood de chaves", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < __RATE_LIMIT_MAX_BUCKETS_FOR_TESTS + 25; i++) {
      rateLimit(`flood:${i}`, 3, 60_000, t0);
    }
    expect(__rateLimitBucketCountForTests()).toBe(__RATE_LIMIT_MAX_BUCKETS_FOR_TESTS);
  });

  it("remove buckets expirados durante a varredura periódica", () => {
    const t0 = 6_000_000;
    rateLimit("expirado", 3, 1_000, t0);
    for (let i = 0; i < 255; i++) {
      rateLimit(`novo:${i}`, 3, 60_000, t0 + 1_001);
    }
    expect(__rateLimitBucketCountForTests()).toBe(255);
  });
});
