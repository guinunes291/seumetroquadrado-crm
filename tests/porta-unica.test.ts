// Guarda do item 2.7, PR (c): UMA porta para o objeto lead no menu — Atender.
// O botão "Leads" sai do nível primário (vira subitem "Base de leads"),
// /blitz vira redirect e as rotas antigas continuam todas vivas (kanban,
// ações em massa e importação seguem em /leads até a Consulta absorvê-los).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const sidebar = read("src/components/app-sidebar.tsx");
const blitz = read("src/routes/_authenticated/blitz.tsx");
const leadsIndex = read("src/routes/_authenticated/leads.index.tsx");
const bottomNav = read("src/components/bottom-nav.tsx");

describe("item 2.7c — porta única no menu", () => {
  it("Atender é o botão primário e soma as pendências de atendimento", () => {
    expect(sidebar).toMatch(
      /to: "\/atendimento",\s*label: "Atender"[\s\S]{0,120}badge: \(b\) => b\.atendimento \+ b\.tarefasVencidas/,
    );
    // "Leads" não é mais botão de nível primário…
    expect(sidebar).not.toMatch(/to: "\/leads",\s*label: "Leads"/);
    // …mas a base completa segue acessível como subitem (nenhuma rota morre).
    expect(sidebar).toMatch(/to: "\/leads", label: "Base de leads"/);
  });

  it("os antigos filhos de Leads foram realojados, não apagados", () => {
    expect(sidebar).toContain('to: "/oferta-ativa"');
    // Captação é gestão de aquisição — mudou para o hub Operação.
    expect(sidebar).toMatch(/label: "Operação"[\s\S]{0,900}to: "\/leads-landing"/);
    // O item de menu do Blitz morreu junto com a rota própria.
    expect(sidebar).not.toContain('to: "/blitz"');
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
