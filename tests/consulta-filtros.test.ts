// Guarda do item 2.7, PR (b): o modo Consulta de Atender ganha o conjunto
// COMPLETO de filtros de /leads num drawer, e a lógica compartilhada
// (vocabulário de período + recortes transitórios v1/v2) passa a ter fonte
// única — /leads e Consulta leem os mesmos módulos.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recortesClientSide } from "@/features/leads/leads-query";
import type { Lead } from "@/features/leads/types";
import { rangeDoPeriodo } from "@/lib/leads-views";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const consulta = read("src/features/atendimento/consulta-view.tsx");
const leadsIndex = read("src/routes/_authenticated/leads.index.tsx");

describe("item 2.7b — drawer com os filtros completos", () => {
  it("o drawer cobre todos os recortes de /leads", () => {
    expect(consulta).toContain("<Sheet");
    for (const fragmento of [
      "Filtrar por etapa",
      "Filtrar por temperatura",
      "Filtrar por origem",
      "Filtrar por contato",
      "Filtrar por tempo parado",
      "Filtrar por período",
      "Filtrar por corretor",
      "Ver lixeira",
    ]) {
      expect(consulta).toContain(fragmento);
    }
    // Período custom com as duas datas, como em /leads.
    expect(consulta).toContain('aria-label="Data inicial"');
    expect(consulta).toContain('aria-label="Data final"');
    // Corretor e lixeira só para a gestão (mesma regra de /leads).
    expect(consulta).toMatch(/\{canManage && \([\s\S]{0,500}Filtrar por corretor/);
  });

  it("fonte única: período e recortes transitórios saem dos MESMOS módulos", () => {
    for (const src of [consulta, leadsIndex]) {
      expect(src).toContain("rangeDoPeriodo");
      expect(src).toContain("recortesClientSide");
      expect(src).toContain("PERIODO_OPTIONS");
    }
    // /leads não redeclara o vocabulário localmente.
    expect(leadsIndex).not.toContain("const PERIODO_OPTIONS = [");
    expect(leadsIndex).not.toMatch(/function periodoStart\(/);
  });

  it("espelho do v1: com follow-up busca os ids de tarefas como /leads", () => {
    expect(consulta).toContain('"followup-lead-ids"');
    expect(consulta).toContain('=== "com_followup" && source === "v1"');
    // Paginação client-side no v1 com contato ativo, como lá.
    expect(consulta).toContain('source !== "v1" || filtros.contato === "all"');
  });
});

const leadBase: Lead = {
  id: "l1",
  nome: "Ana",
  email: null,
  telefone: "11999990000",
  status: "em_atendimento",
  origem: "site",
  corretor_id: "c1",
  projeto_id: null,
  projeto_nome: null,
  temperatura: null,
  ultima_interacao: null,
  ultimo_contato: null,
  na_lixeira: false,
  created_at: "2026-08-01T12:00:00Z",
  data_venda: null,
} as unknown as Lead;

describe("recortesClientSide (função compartilhada)", () => {
  it("v4: devolve as linhas intactas — o servidor já filtrou tudo", () => {
    const rows = [leadBase, { ...leadBase, id: "l2" }];
    expect(recortesClientSide(rows, "v4", "sem_contato_30d", "15")).toEqual(rows);
  });

  it("v3: re-filtra só o parado (que a v3 não conhece)", () => {
    const parado = { ...leadBase, id: "p", ultima_interacao: null };
    const ativo = { ...leadBase, id: "a", ultima_interacao: new Date().toISOString() };
    const out = recortesClientSide([parado, ativo], "v3", "all", "15");
    expect(out.map((l) => l.id)).toEqual(["p"]);
  });

  it("v1: aplica contato/parado e a ordenação de prioridade antiga", () => {
    const ads = {
      ...leadBase,
      id: "ads",
      status: "aguardando_atendimento",
      origem: "facebook",
      created_at: "2026-08-01T12:00:00Z",
    };
    const comProjeto = {
      ...leadBase,
      id: "proj",
      status: "aguardando_atendimento",
      origem: "site",
      projeto_nome: "Residencial Sol",
      created_at: "2026-08-05T12:00:00Z",
    };
    const comum = { ...leadBase, id: "comum", created_at: "2026-08-08T12:00:00Z" };
    const out = recortesClientSide([comum, comProjeto, ads], "v1", "all", "all");
    // Aguardando+ADS vence Aguardando+projeto, que vence os demais —
    // mesmo com created_at mais antigo.
    expect(out.map((l) => l.id)).toEqual(["ads", "proj", "comum"]);
  });

  it("v1 + com_followup usa o Set de ids (espelho da query de tarefas)", () => {
    const com = { ...leadBase, id: "tem" };
    const sem = { ...leadBase, id: "nao" };
    const out = recortesClientSide([com, sem], "v1", "com_followup", "all", new Set(["tem"]));
    expect(out.map((l) => l.id)).toEqual(["tem"]);
  });
});

describe("rangeDoPeriodo (vocabulário compartilhado)", () => {
  it("hoje devolve [00:00, 23:59] do dia corrente", () => {
    const { start, end } = rangeDoPeriodo("hoje", "", "");
    expect(start?.getHours()).toBe(0);
    expect(end?.getHours()).toBe(23);
  });

  it("custom usa as datas informadas (dia local inteiro) e ignora inválidas", () => {
    const ok = rangeDoPeriodo("custom", "2026-08-01", "2026-08-09");
    expect([ok.start?.getDate(), ok.start?.getMonth(), ok.start?.getHours()]).toEqual([1, 7, 0]);
    expect([ok.end?.getDate(), ok.end?.getMonth(), ok.end?.getHours()]).toEqual([9, 7, 23]);
    const invalido = rangeDoPeriodo("custom", "nada", "");
    expect(invalido.start).toBeNull();
    expect(invalido.end).toBeNull();
  });

  it("all não recorta nada", () => {
    expect(rangeDoPeriodo("all", "", "")).toEqual({ start: null, end: null });
  });
});
