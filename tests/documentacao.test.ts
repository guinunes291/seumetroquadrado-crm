import { describe, it, expect } from "vitest";
import {
  checklistPorPerfil,
  docLabel,
  docResolvido,
  DOC_STATUS,
  DOC_STATUS_LABEL,
  PERFIL_RENDA,
  PERFIL_LABEL,
} from "@/lib/documentacao";

describe("documentação — checklist por perfil", () => {
  it("inclui os documentos comuns em todos os perfis", () => {
    const comuns = ["documento_identidade", "cpf", "comprovante_estado_civil", "comprovante_residencia"];
    for (const perfil of PERFIL_RENDA) {
      const tipos = checklistPorPerfil(perfil).map((i) => i.tipo);
      for (const c of comuns) expect(tipos).toContain(c);
    }
  });

  it("CLT pede carteira de trabalho e holerites", () => {
    const tipos = checklistPorPerfil("clt").map((i) => i.tipo);
    expect(tipos).toContain("carteira_trabalho");
    expect(tipos).toContain("holerites");
  });

  it("autônomo pede DECORE e extrato de 6 meses (não holerite)", () => {
    const tipos = checklistPorPerfil("autonomo").map((i) => i.tipo);
    expect(tipos).toContain("decore");
    expect(tipos).toContain("extrato_bancario_6m");
    expect(tipos).not.toContain("holerites");
  });

  it("empresário pede contrato social e IRPJ", () => {
    const tipos = checklistPorPerfil("empresario").map((i) => i.tipo);
    expect(tipos).toContain("contrato_social");
    expect(tipos).toContain("irpj");
  });

  it("FGTS acrescenta extrato e autorização do FGTS", () => {
    const semFgts = checklistPorPerfil("clt", { usaFgts: false }).map((i) => i.tipo);
    const comFgts = checklistPorPerfil("clt", { usaFgts: true }).map((i) => i.tipo);
    expect(semFgts).not.toContain("extrato_fgts");
    expect(comFgts).toContain("extrato_fgts");
    expect(comFgts).toContain("autorizacao_fgts");
  });

  it("casado acrescenta documentos do cônjuge", () => {
    const tipos = checklistPorPerfil("clt", { casado: true }).map((i) => i.tipo);
    expect(tipos).toContain("conjuge_identidade");
    expect(tipos).toContain("conjuge_renda");
  });

  it("declara IR acrescenta a declaração de IR", () => {
    const tipos = checklistPorPerfil("autonomo", { declaraIr: true }).map((i) => i.tipo);
    expect(tipos).toContain("declaracao_ir");
  });

  it("não duplica tipos e todo item tem rótulo", () => {
    const itens = checklistPorPerfil("clt", { usaFgts: true, casado: true, declaraIr: true });
    const tipos = itens.map((i) => i.tipo);
    expect(new Set(tipos).size).toBe(tipos.length);
    itens.forEach((i) => expect(i.label).toBeTruthy());
  });

  it("docLabel devolve um rótulo legível e cai no próprio slug se desconhecido", () => {
    expect(docLabel("holerites")).toBe("3 últimos holerites / contracheques");
    expect(docLabel("inexistente_xyz")).toBe("inexistente_xyz");
  });

  it("docResolvido só para recebido/aprovado", () => {
    expect(docResolvido("recebido")).toBe(true);
    expect(docResolvido("aprovado")).toBe(true);
    expect(docResolvido("pendente")).toBe(false);
    expect(docResolvido("reprovado")).toBe(false);
  });

  it("enums têm rótulo", () => {
    DOC_STATUS.forEach((s) => expect(DOC_STATUS_LABEL[s]).toBeTruthy());
    PERFIL_RENDA.forEach((p) => expect(PERFIL_LABEL[p]).toBeTruthy());
  });
});
