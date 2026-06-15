import { describe, it, expect } from "vitest";
import {
  TAREFA_STATUS, TAREFA_TIPOS, TAREFA_PRIORIDADES,
  STATUS_LABEL, TIPO_LABEL, PRIORIDADE_LABEL,
  isAtrasada, statusBadgeClass, prioridadeBadgeClass,
} from "@/lib/tarefas";

describe("tarefas helpers", () => {
  it("expõe enums consistentes", () => {
    expect(TAREFA_STATUS).toContain("pendente");
    expect(TAREFA_STATUS).toContain("concluida");
    expect(TAREFA_TIPOS).toContain("follow_up");
    expect(TAREFA_PRIORIDADES).toContain("urgente");
  });

  it("traduz labels para todos os enums", () => {
    TAREFA_STATUS.forEach((s) => expect(STATUS_LABEL[s]).toBeTruthy());
    TAREFA_TIPOS.forEach((t) => expect(TIPO_LABEL[t]).toBeTruthy());
    TAREFA_PRIORIDADES.forEach((p) => expect(PRIORIDADE_LABEL[p]).toBeTruthy());
  });

  it("isAtrasada: tarefa pendente vencida", () => {
    const ontem = new Date(Date.now() - 86400000).toISOString();
    expect(isAtrasada({ status: "pendente", data_vencimento: ontem })).toBe(true);
  });

  it("isAtrasada: tarefa pendente futura não está atrasada", () => {
    const amanha = new Date(Date.now() + 86400000).toISOString();
    expect(isAtrasada({ status: "pendente", data_vencimento: amanha })).toBe(false);
  });

  it("isAtrasada: tarefa concluída nunca está atrasada", () => {
    const ontem = new Date(Date.now() - 86400000).toISOString();
    expect(isAtrasada({ status: "concluida", data_vencimento: ontem })).toBe(false);
  });

  it("isAtrasada: tarefa cancelada nunca está atrasada", () => {
    const ontem = new Date(Date.now() - 86400000).toISOString();
    expect(isAtrasada({ status: "cancelada", data_vencimento: ontem })).toBe(false);
  });

  it("isAtrasada: sem data não está atrasada", () => {
    expect(isAtrasada({ status: "pendente", data_vencimento: null })).toBe(false);
  });

  it("statusBadgeClass retorna classes diferentes por status", () => {
    expect(statusBadgeClass("pendente")).not.toBe(statusBadgeClass("concluida"));
    expect(statusBadgeClass("desconhecido")).toBe("");
  });

  it("prioridadeBadgeClass retorna classes diferentes por prioridade", () => {
    expect(prioridadeBadgeClass("urgente")).not.toBe(prioridadeBadgeClass("baixa"));
    expect(prioridadeBadgeClass("xx")).toBe("");
  });
});
