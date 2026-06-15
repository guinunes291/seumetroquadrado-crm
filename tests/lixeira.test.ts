import { describe, it, expect } from "vitest";
import {
  LIXEIRA_TABELAS,
  LIXEIRA_LABEL,
  diasAteExpiracao,
  resumoRegistro,
} from "../src/lib/lixeira";

describe("lixeira", () => {
  describe("LIXEIRA_TABELAS", () => {
    it("cobre as 6 tabelas operacionais", () => {
      expect(LIXEIRA_TABELAS).toEqual([
        "leads",
        "projetos",
        "unidades",
        "agendamentos",
        "tarefas",
        "interacoes",
      ]);
    });

    it("tem label para cada tabela", () => {
      LIXEIRA_TABELAS.forEach((t) => {
        expect(LIXEIRA_LABEL[t]).toBeTruthy();
      });
    });
  });

  describe("diasAteExpiracao", () => {
    it("retorna 0 quando deletedAt é null", () => {
      expect(diasAteExpiracao(null)).toBe(0);
    });

    it("retorna ~90 dias para deleção recente", () => {
      const agora = new Date().toISOString();
      const dias = diasAteExpiracao(agora);
      expect(dias).toBeGreaterThanOrEqual(89);
      expect(dias).toBeLessThanOrEqual(90);
    });

    it("retorna 0 para deleção há mais de 90 dias", () => {
      const antigo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      expect(diasAteExpiracao(antigo)).toBe(0);
    });

    it("retorna ~60 dias para deleção há 30 dias", () => {
      const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const dias = diasAteExpiracao(trintaDiasAtras);
      expect(dias).toBeGreaterThanOrEqual(59);
      expect(dias).toBeLessThanOrEqual(60);
    });
  });

  describe("resumoRegistro", () => {
    it("usa nome para leads", () => {
      expect(resumoRegistro("leads", { nome: "João Silva" })).toBe("João Silva");
    });

    it("fallback para leads sem nome", () => {
      expect(resumoRegistro("leads", {})).toBe("Lead sem nome");
    });

    it("usa nome para projetos", () => {
      expect(resumoRegistro("projetos", { nome: "Edifício Aurora" })).toBe("Edifício Aurora");
    });

    it("usa identificador para unidades", () => {
      expect(resumoRegistro("unidades", { identificador: "101" })).toBe("Unidade 101");
    });

    it("usa titulo para agendamentos e tarefas", () => {
      expect(resumoRegistro("agendamentos", { titulo: "Visita" })).toBe("Visita");
      expect(resumoRegistro("tarefas", { titulo: "Ligar para cliente" })).toBe(
        "Ligar para cliente",
      );
    });

    it("usa tipo para interações", () => {
      expect(resumoRegistro("interacoes", { tipo: "ligacao" })).toBe("ligacao");
    });
  });
});
