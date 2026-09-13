/**
 * Guardas de fonte da tela do Bolsão.
 *
 * Duas coisas que precisam continuar verdadeiras, e que nenhum teste de
 * renderização pega com a mesma força — porque o risco não é a tela mostrar
 * errado hoje, é alguém adicionar a coluna amanhã sem saber por que ela não
 * estava lá:
 *
 *  1. A TELA NÃO SABE DE QUEM O LEAD ERA. A RPC `bolsao_v1` não devolve
 *     corretor, e a tela não pode ir buscar em outro lugar. O §5.2 do
 *     documento é explícito, e o motivo é operacional: a briga por lead
 *     começa no instante em que se sabe de quem ele era.
 *  2. A TELA NÃO PUXA LEAD. É o passo 2 do §9, e a ordem é a parte que
 *     importa — soltar o botão antes da regra de comissão publicada troca uma
 *     decisão comercial por um clique.
 *
 * Ver docs/ops/bolsao-oportunidades-fatia4.md §5, §7 e §9.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Só o código. Os comentários desta feature falam justamente sobre autor,
 *  dono anterior e histórico — explicar por que algo não está lá exige
 *  nomear a coisa, e uma guarda que lê prosa acusa a própria documentação. */
function codigo(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const pagina = codigo("src/features/bolsao/bolsao-page.tsx");
const hooks = codigo("src/features/bolsao/use-bolsao.ts");
const derive = codigo("src/features/bolsao/derive.ts");
/** A tela inteira, comentários incluídos — para checar o texto que o usuário lê. */
const paginaBruta = readFileSync("src/features/bolsao/bolsao-page.tsx", "utf8");

describe("o Bolsão não revela o dono anterior", () => {
  it("nem a tela nem o hook leem campo de corretor", () => {
    for (const [nome, fonte] of [
      ["tela", pagina],
      ["hook", hooks],
      ["derive", derive],
    ] as const) {
      expect(fonte, `${nome} não pode ler corretor`).not.toMatch(
        /corretor_id|corretor_anterior_id|dono_anterior/,
      );
    }
  });

  it("o telefone vem mascarado do banco — a tela nunca pede o campo cru", () => {
    // `telefone_mascarado` sim; `telefone:` (o campo cru do lead) não.
    expect(hooks).toContain("telefone_mascarado");
    expect(hooks).not.toMatch(/^\s*telefone:/m);
    expect(pagina).not.toMatch(/\.telefone\b(?!_mascarado)/);
  });

  it("o histórico aparece agregado, sem autor e sem texto", () => {
    // Os únicos sinais que a linha mostra são booleanos vindos da RPC.
    expect(derive).toContain("tem_interacao");
    expect(derive).toContain("tem_contato");
    expect(derive).not.toMatch(/autor|conteudo|observacoes/);
  });
});

describe("o passo 2 não puxa lead", () => {
  it("a tela não chama nenhuma RPC de escrita", () => {
    expect(pagina).not.toMatch(/carteira_puxar|carteira_resgatar|transferir_leads|useMutation/);
    expect(hooks).not.toMatch(/carteira_puxar|useMutation/);
  });

  it("a tela explica que a ausência do botão é proposital", () => {
    // Sem essa frase, a tela lê como funcionalidade quebrada e alguém
    // "conserta" adicionando o botão.
    expect(paginaBruta).toMatch(/só consulta/i);
    expect(paginaBruta).toMatch(/comissão/i);
  });
});

describe("indisponível não é vazio", () => {
  it("a tela distingue RPC ausente de Bolsão sem leads", () => {
    expect(hooks).toContain("rpcWithFallback");
    expect(pagina).toContain("Bolsão indisponível neste ambiente");
    expect(pagina).toContain("Bolsão vazio");
  });
});
