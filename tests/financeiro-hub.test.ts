// Guarda do item 2.4 (auditoria ux-ia-2026-08): o hub Dinheiro (/financeiro)
// absorve fechamento + comissões + aprovação, e o badge de aprovações aponta
// para a tela que aprova (tarefa #15). Fonte lida como texto, padrão da casa.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const hub = read("src/routes/_authenticated/financeiro/index.tsx");
// O menu vem do registro SISTEMAS desde a reorganização em sistemas.
const sistemas = read("src/features/nav/sistemas.ts");
const ranking = read("src/routes/_authenticated/ranking.tsx");
const aprovacao = read("src/components/pending-sales-approval.tsx");

describe("item 2.4 — hub Dinheiro (/financeiro)", () => {
  it("a rota monta fechamento, comissões e DRE (aprovação vem dentro da ComissoesPage)", () => {
    expect(hub).toContain('createFileRoute("/_authenticated/financeiro/")');
    expect(hub).toContain("<FechamentoPage />");
    expect(hub).toContain("<ComissoesPage />");
    expect(hub).toContain("<DrePage />");
  });

  it("guard por ABA, não por rota — corretor mantém acesso às próprias comissões", () => {
    // Fechamento e DRE são admin/gestor; sem o papel, degradam para Comissões
    // (RLS recorta os dados) em vez de redirecionar ou mostrar tela vazia.
    expect(hub).toContain("podeFechamento");
    expect(hub).toMatch(/\(tab === "fechamento" \|\| tab === "dre"\) && !podeFechamento/);
    expect(hub).not.toMatch(/throw redirect\(\{ to: "\/" \}\)/);
  });

  it("o badge de aprovações vive no card Assinaturas & Comissões e cai na aba que aprova (#15)", () => {
    expect(sistemas).toMatch(
      /home: \{ to: "\/financeiro", search: \{ tab: "comissoes" \} \},\s*badge: \(b\) => b\.aprovacoes/,
    );
    // O antigo destino (Desempenho com badge) morreu — o badge nunca mais mente.
    expect(sistemas).not.toMatch(/to: "\/ranking"[\s\S]{0,120}badge: \(b\) => b\.aprovacoes/);
  });

  it("Desempenho não tem mais aba Comissões; o deep-link antigo redireciona", () => {
    expect(ranking).not.toContain('<TabsTrigger value="comissoes"');
    expect(ranking).not.toContain("<ComissoesPage");
    expect(ranking).toMatch(/redirect\(\{ to: "\/financeiro", search: \{ tab: "comissoes" \} \}\)/);
    // "comissoes" continua na whitelist do validateSearch — o beforeLoad
    // precisa lê-lo cru para redirecionar (lição da aba distribuicao).
    expect(ranking).toMatch(/DESEMPENHO_TABS[\s\S]{0,120}"comissoes"/);
  });

  it("rotas legadas apontam para o hub (URL nenhuma morre)", () => {
    const fechamento = read("src/routes/_authenticated/financeiro/fechamento.tsx");
    expect(fechamento).toContain('to: "/financeiro"');
    expect(fechamento).toContain('tab: "fechamento"');
    const comissoes = read("src/routes/_authenticated/comissoes.tsx");
    expect(comissoes).toContain('to: "/financeiro"');
    expect(comissoes).toContain('tab: "comissoes"');
  });

  it("aprovar venda atualiza o fechamento e o badge na mesma tela", () => {
    expect(aprovacao).toContain('["financeiro-fechamento"]');
    expect(aprovacao).toContain('["nav-badges"]');
  });
});
