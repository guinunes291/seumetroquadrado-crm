// Guarda do item 2.7, PR (c), revista na regra dos 2 menus (2026-09-11): a
// porta do objeto lead no menu é a Base de leads (home da Gestão de Carteira);
// Atender/Trabalhar carteira segue viva SEM seção (dominioExtra + ⌘K + barra
// mobile), /blitz vira redirect e as rotas antigas continuam todas vivas
// (kanban, ações em massa e importação seguem em /leads).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// A taxonomia do menu vive no registro SISTEMAS (features/nav/sistemas.ts)
// desde a reorganização em sistemas — os guards leem a fonte de lá.
const sistemas = read("src/features/nav/sistemas.ts");
const blitz = read("src/routes/_authenticated/blitz.tsx");
const leadsIndex = read("src/routes/_authenticated/leads.index.tsx");
const bottomNav = read("src/components/bottom-nav.tsx");

describe("item 2.7c — porta única no menu", () => {
  it("Base de leads é a porta da Carteira; Trabalhar carteira segue viva sem seção", () => {
    // 2026-09-11: a Carteira abre na Base de leads e a lista é a 1ª seção.
    expect(sistemas).toMatch(/home: \{ to: "\/leads" \}/);
    expect(sistemas).toContain('label: "Base de leads", icon: UsersThree, to: "/leads"');
    // As filas por prioridade não morreram: dominioExtra da Carteira (a
    // sidebar não salta ao abrir) + atalho do ⌘K, só para a operação.
    expect(sistemas).toMatch(/dominioExtra: \[[^\]]*"\/atendimento"/);
    expect(sistemas).toMatch(
      /label: "Trabalhar carteira \(filas por prioridade\)",\s*icon: Briefcase,\s*to: "\/atendimento",\s*roles: OPERACAO/,
    );
    // O badge de tarefas vencidas continua da Carteira — agora na seção Tarefas.
    expect(sistemas).toMatch(
      /label: "Tarefas",\s*icon: ListChecks,\s*to: "\/agendamentos",\s*search: \{ tab: "tarefas" \},\s*roles: OPERACAO,\s*badge: \(b\) => b\.tarefasVencidas/,
    );
  });

  it("os antigos filhos de Leads foram realojados, não apagados", () => {
    // Oferta Ativa é prospecção de base — seção da Prospecção (2026-09-11).
    expect(sistemas).toMatch(/titulo: "Prospecção"[\s\S]{0,2000}to: "\/oferta-ativa"/);
    // Captação é gestão de aquisição — vive na Prospecção (gestão do volumão).
    // Janela de 2500: o bloco da Prospecção cresceu com as notas da regra dos
    // 2 menus; a Carteira (próximo sistema) começa bem depois disso.
    expect(sistemas).toMatch(/titulo: "Prospecção"[\s\S]{0,2500}to: "\/leads-landing"/);
    // O item de menu do Blitz morreu junto com a rota própria.
    expect(sistemas).not.toContain('to: "/blitz"');
  });

  it("/blitz redireciona e nenhum link interno aponta mais para lá", () => {
    expect(blitz).toMatch(/redirect\(\{ to: "\/atendimento", search: \{ modo: "volume" \} \}\)/);
    expect(leadsIndex).not.toContain('to="/blitz"');
    expect(bottomNav).not.toContain('"/blitz"');
  });

  it("/leads segue rota viva — massa, kanban e importação ainda moram lá", () => {
    expect(leadsIndex).toContain('createFileRoute("/_authenticated/leads/")');
    expect(leadsIndex).toContain("<BulkActionBar");
    expect(leadsIndex).toContain("ImportLeadsDialog");
    // A barra mobile mantém o atalho (wireframe 7.1 preserva o slot).
    expect(bottomNav).toContain('to: "/leads"');
  });
});
