import { describe, it, expect } from "vitest";
import { onlyDigits, isValidBrazilPhone, isValidEmail, isValidCPF } from "@/lib/validators";

describe("validators", () => {
  it("onlyDigits remove não-dígitos", () => {
    expect(onlyDigits("(11) 91234-5678")).toBe("11912345678");
    expect(onlyDigits(null)).toBe("");
    expect(onlyDigits(undefined)).toBe("");
  });

  it("isValidBrazilPhone aceita 10/11 dígitos e DDI 55", () => {
    expect(isValidBrazilPhone("11912345678")).toBe(true); // 11 dígitos
    expect(isValidBrazilPhone("1133224455")).toBe(true); // 10 dígitos
    expect(isValidBrazilPhone("(11) 91234-5678")).toBe(true);
    expect(isValidBrazilPhone("5511912345678")).toBe(true); // 13 com DDI
    expect(isValidBrazilPhone("123")).toBe(false);
    expect(isValidBrazilPhone("abc")).toBe(false);
    expect(isValidBrazilPhone("")).toBe(false);
  });

  it("isValidEmail valida formato", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail(" joao@exemplo.com.br ")).toBe(true);
    expect(isValidEmail("semarroba.com")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("isValidCPF valida dígitos verificadores", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true); // CPF válido
    expect(isValidCPF("52998224725")).toBe(true);
    expect(isValidCPF("111.111.111-11")).toBe(false); // todos iguais
    expect(isValidCPF("123.456.789-00")).toBe(false);
    expect(isValidCPF("123")).toBe(false);
  });
});
