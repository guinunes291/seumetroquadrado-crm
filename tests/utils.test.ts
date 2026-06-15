import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (class merger)", () => {
  it("mescla classes simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("ignora falsy", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("resolve conflitos do tailwind", () => {
    // tailwind-merge: a última prevalece
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
