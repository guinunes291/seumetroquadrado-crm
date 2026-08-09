// Guarda do item 2.1 (auditoria ux-ia-2026-08) e da métrica M3: o hub de
// Operação (/painel-gestor) tem 7 abas — o bloco administrativo vive em
// /configuracoes e os deep-links antigos redirecionam. Fonte lida como texto,
// padrão da casa (final-regressions).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const painel = read("src/routes/_authenticated/painel-gestor.tsx");
const config = read("src/routes/_authenticated/configuracoes.tsx");

const ABAS_ADMIN = ["pessoas", "estoque", "campanhas", "comunicacao", "qualidade"] as const;

describe("itens 2.1–2.3 — admin em Configurações e hub de Operação com 5 abas (M3)", () => {
  it("GESTAO_TABS tem exatamente 5 abas (a métrica M3 manda contar aqui)", () => {
    const match = painel.match(/const GESTAO_TABS: GestaoTab\[\] = \[([^\]]+)\]/);
    expect(match, "GESTAO_TABS presente").toBeTruthy();
    const abas = match![1]
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean);
    expect(abas).toEqual(["dia", "relatorios", "funil", "time", "metas"]);
  });

  it("fusões 2.2/2.3: Gargalos vive no Funil e Leads por Corretor no Time", () => {
    // Sem abas próprias…
    expect(painel).not.toContain('<TabsTrigger value="gargalos"');
    expect(painel).not.toContain('<TabsTrigger value="leads-corretor"');
    // …mas o conteúdo continua montado dentro das abas fundidas.
    expect(painel).toMatch(/value="funil"[\s\S]{0,400}<GargalosView/);
    expect(painel).toMatch(/value="time"[\s\S]{0,600}<LeadsPorCorretorPage/);
    // Deep-links antigos caem na aba fundida via mapa de legado.
    expect(painel).toMatch(/gargalos: "funil"/);
    expect(painel).toMatch(/"leads-corretor": "time"/);
  });

  it("nenhuma aba admin renderiza no hub de Operação", () => {
    for (const aba of ABAS_ADMIN) {
      expect(painel).not.toContain(`<TabsTrigger value="${aba}"`);
      expect(painel).not.toContain(`<TabsContent value="${aba}"`);
    }
  });

  it("deep-link antigo ?tab=admin redireciona para /configuracoes (URL nenhuma morre)", () => {
    expect(painel).toContain("TABS_ADMIN_MOVIDAS");
    expect(painel).toMatch(/redirect\(\{ to: "\/configuracoes", search: \{ tab: search\.tab/);
    // O validateSearch deixa os ids admin passarem CRUS até o beforeLoad —
    // sem isso o deep-link cairia mudo na aba Dia (lição da aba distribuicao).
    expect(painel).toMatch(/TABS_ADMIN_MOVIDAS\.includes\(search\.tab as TabAdminMovida\)/);
  });

  it("Configurações renderiza as 5 abas admin (trigger + content)", () => {
    for (const aba of ABAS_ADMIN) {
      expect(config).toContain(`<TabsTrigger value="${aba}"`);
      expect(config).toContain(`<TabsContent value="${aba}"`);
    }
    // Continua admin-only.
    expect(config).toContain("if (!isAdmin)");
  });

  it("as 5 rotas-casca legadas apontam para /configuracoes", () => {
    const cascas: Array<[string, string]> = [
      ["src/routes/_authenticated/corretores.tsx", "pessoas"],
      ["src/routes/_authenticated/equipes.tsx", "pessoas"],
      ["src/routes/_authenticated/duplicatas.tsx", "qualidade"],
      ["src/routes/_authenticated/lixeira.tsx", "qualidade"],
      ["src/routes/_authenticated/templates.tsx", "comunicacao"],
    ];
    for (const [arquivo, tab] of cascas) {
      const fonte = read(arquivo);
      expect(fonte).toContain('to: "/configuracoes"');
      expect(fonte).toContain(`tab: "${tab}"`);
    }
  });
});
