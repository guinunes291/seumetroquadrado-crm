// O dinheiro em jogo nasce do preço de tabela do projeto de interesse — e só
// quando o preço é um número honesto (não "sob consulta", não zero).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { valorDoProjeto } from "@/features/fila-unica/use-fila-unica";
import { formatarEmJogo } from "@/features/fila-unica/derive";

describe("valorDoProjeto", () => {
  it("usa preco_a_partir quando há número; sob consulta, zero ou sem projeto viram null", () => {
    expect(valorDoProjeto({ preco_a_partir: 250_000, sob_consulta: false })).toBe(250_000);
    expect(valorDoProjeto({ preco_a_partir: 250_000, sob_consulta: null })).toBe(250_000);
    expect(valorDoProjeto({ preco_a_partir: 250_000, sob_consulta: true })).toBeNull();
    expect(valorDoProjeto({ preco_a_partir: 0, sob_consulta: false })).toBeNull();
    expect(valorDoProjeto({ preco_a_partir: null, sob_consulta: false })).toBeNull();
    expect(valorDoProjeto(null)).toBeNull();
    expect(valorDoProjeto(undefined)).toBeNull();
  });
});

describe("formatarEmJogo", () => {
  it("cabe no espaço de um número: milhares sem decimais, milhões com uma casa", () => {
    expect(formatarEmJogo(250_000)).toMatch(/^R\$\s?250\s?mil$/);
    expect(formatarEmJogo(1_240_000)).toMatch(/^R\$\s?1,2\s?mi$/);
    expect(formatarEmJogo(9_800)).toMatch(/^R\$\s?9,8\s?mil$|^R\$\s?10\s?mil$/);
  });
});
