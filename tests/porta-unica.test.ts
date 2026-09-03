// Guarda do item 2.7, PR (c): UMA porta para o objeto lead no menu — Atender.
// O botão "Leads" sai do nível primário (vira subitem "Base de leads"),
// /blitz vira redirect e as rotas antigas continuam todas vivas (kanban,
// ações em massa e importação seguem em /leads até a Consulta absorvê-los).
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
  it("Trabalhar carteira segue porta única, com badge só do que é da carteira", () => {
    // Renomeada de "Atender" e badge sem b.atendimento (auditoria 2026-08-27):
    // a entrada é da Prospecção — cada contador tem UM dono.
    expect(sistemas).toMatch(
      /label: "Trabalhar carteira",\s*icon: Briefcase,\s*to: "\/atendimento",\s*badge: \(b\) => b\.tarefasVencidas/,
    );
    // "Leads" não é home de sistema algum…
    expect(sistemas).not.toMatch(/home: \{ to: "\/leads" \}/);
    // …mas a base completa segue acessível como seção (nenhuma rota morre).
    expect(sistemas).toContain('label: "Base de leads", icon: UsersThree, to: "/leads"');
  });

  it("os antigos filhos de Leads foram realojados, não apagados", () => {
    expect(sistemas).toContain('to: "/oferta-ativa"');
    // Captação é gestão de aquisição — vive na Prospecção (gestão do volumão).
    expect(sistemas).toMatch(/titulo: "Prospecção"[\s\S]{0,2000}to: "\/leads-landing"/);
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
