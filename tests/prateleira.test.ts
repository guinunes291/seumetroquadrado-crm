import { describe, it, expect } from "vitest";
import type { ProjetoRow } from "@/components/projeto-card";
import {
  aplicarFiltros,
  cabeNaRenda,
  construtoraChave,
  contarPorConstrutora,
  diasRestantes,
  FILTROS_VAZIOS,
  focoProgramado,
  focosPorProjeto,
  focoVigente,
  iniciais,
  montarItem,
  montarPrateleira,
  ordenar,
  rotuloUrgencia,
  type FocoRow,
  type ItemPrateleira,
  type ParceiraPrateleira,
  type ProjetoPrateleiraRow,
} from "@/lib/prateleira";
import { GRANDE_SP, SEM_ZONA } from "@/lib/zonas";

const AGORA = new Date("2026-09-02T12:00:00Z").getTime();
const dia = (n: number) => new Date(AGORA + n * 86_400_000).toISOString();

const parceiras: ParceiraPrateleira[] = [
  { id: "mundo", nome: "Mundo Apto", ordem: 10, ativo: true, logo_url: null },
  { id: "cury", nome: "Cury", ordem: 20, ativo: true, logo_url: null },
];

function linha(
  over: Partial<ProjetoPrateleiraRow> & { id: string; nome: string },
): ProjetoPrateleiraRow {
  const base: ProjetoRow = {
    id: over.id,
    nome: over.nome,
    slug: over.id,
    construtora: null,
    cidade: null,
    regiao: null,
    bairro: null,
    endereco: null,
    logradouro: null,
    numero: null,
    observacoes: null,
    ativo: true,
    metragem_min: null,
    metragem_max: null,
    dorms_min: null,
    dorms_max: null,
    suites: null,
    tipologia: null,
    tipo_extra: null,
    vagas_min: null,
    vagas_max: null,
    vagas_observacao: null,
    preco_a_partir: null,
    sob_consulta: false,
    status_entrega: null,
    mes_entrega: null,
    ano_entrega: null,
    fonte: null,
    zona_smq: null,
  };
  return { ...base, ...over };
}

function item(
  over: Partial<ProjetoPrateleiraRow> & { id: string; nome: string },
  focos: Map<
    string,
    ReturnType<typeof focosPorProjeto> extends Map<string, infer V> ? V : never
  > = new Map(),
): ItemPrateleira {
  return montarItem(linha(over), { parceiras, focos, agora: AGORA });
}

// Um produto "vendável": zona + tabela. É o mínimo da prateleira.
const vendavel = (over: Partial<ProjetoPrateleiraRow> & { id: string; nome: string }) =>
  item({ zona_smq: "Zona Sul", tabela_precos_url: "https://t/x.pdf", ...over });

describe("campanha em foco", () => {
  it("vale quando ativa, já iniciada e sem fim ou com fim no futuro", () => {
    expect(focoVigente({ ativo: true, inicio: dia(-1), fim: null }, AGORA)).toBe(true);
    expect(focoVigente({ ativo: true, inicio: dia(-1), fim: dia(3) }, AGORA)).toBe(true);
    expect(focoVigente({ ativo: true, inicio: dia(-1), fim: dia(-1) }, AGORA)).toBe(false);
    expect(focoVigente({ ativo: false, inicio: dia(-1), fim: null }, AGORA)).toBe(false);
  });

  it("campanha programada (início no futuro) ainda não aparece — decisão 22", () => {
    expect(focoVigente({ ativo: true, inicio: dia(2), fim: null }, AGORA)).toBe(false);
    expect(focoProgramado({ ativo: true, inicio: dia(2) }, AGORA)).toBe(true);
  });

  it("conta os dias e escreve a urgência", () => {
    expect(diasRestantes(dia(5), AGORA)).toBe(5);
    expect(diasRestantes(null, AGORA)).toBeNull();
    expect(rotuloUrgencia(5)).toBe("termina em 5 dias");
    expect(rotuloUrgencia(1)).toBe("termina amanhã");
    expect(rotuloUrgencia(0)).toBe("termina hoje");
    expect(rotuloUrgencia(null)).toBeNull();
  });

  it("fica com a campanha vigente mais recente de cada projeto", () => {
    const focos: FocoRow[] = [
      { id: "a", projeto_id: "p1", motivo: "Antiga", inicio: dia(-10), fim: null, ativo: true },
      { id: "b", projeto_id: "p1", motivo: "Nova", inicio: dia(-1), fim: dia(4), ativo: true },
      { id: "c", projeto_id: "p2", motivo: "Programada", inicio: dia(3), fim: null, ativo: true },
      {
        id: "d",
        projeto_id: "p3",
        motivo: "Encerrada",
        inicio: dia(-9),
        fim: dia(-2),
        ativo: true,
      },
    ];
    const map = focosPorProjeto(focos, AGORA);
    expect(map.get("p1")?.motivo).toBe("Nova");
    expect(map.get("p1")?.diasRestantes).toBe(4);
    expect(map.has("p2")).toBe(false);
    expect(map.has("p3")).toBe(false);
  });
});

describe("montarItem", () => {
  it("aplica o saneamento, resolve zona pela cidade e casa a parceira pelo nome", () => {
    const i = item({
      id: "x",
      nome: "Mundo APTO Voluntários da Pátria",
      bairro: "Ponte Grande (Guarulhos)",
      metragem_min: 240,
      metragem_max: 240,
      preco_a_partir: 175_560,
    });
    expect(i.metragem).toEqual({ metragem_min: 24, metragem_max: 24, corrigida: true });
    expect(i.local).toEqual({ bairro: "Ponte Grande", cidade: "Guarulhos" });
    expect(i.zona).toBe(GRANDE_SP);
    expect(i.parceira?.id).toBe("mundo");
    expect(i.parceiraInferida).toBe(true);
    expect(i.completude.faltando).toContain("book");
  });

  it("marca 'atualizado recentemente' pelo carimbo de preço ou tabela dentro de 7 dias", () => {
    expect(item({ id: "a", nome: "A", preco_atualizado_em: dia(-2) }).atualizadoRecentemente).toBe(
      true,
    );
    expect(
      item({ id: "b", nome: "B", tabela_atualizada_em: dia(-10) }).atualizadoRecentemente,
    ).toBe(false);
    expect(item({ id: "c", nome: "C" }).atualizadoRecentemente).toBe(false);
  });
});

describe("aplicarFiltros", () => {
  const incompleto = item({ id: "inc", nome: "Sem nada" });
  const foco = focosPorProjeto(
    [
      {
        id: "f",
        projeto_id: "emfoco",
        motivo: "Lançamento",
        inicio: dia(-1),
        fim: null,
        ativo: true,
      },
    ],
    AGORA,
  );
  const emFocoIncompleto = item({ id: "emfoco", nome: "Em foco sem material" }, foco);
  const sul = vendavel({
    id: "sul",
    nome: "Sul 2 dorms",
    preco_a_partir: 250_000,
    dorms_min: 2,
    dorms_max: 2,
    bairro: "Campo Limpo",
  });
  const sobConsulta = vendavel({
    id: "sc",
    nome: "Sob consulta",
    sob_consulta: true,
    zona_smq: "Leste",
  });
  const caro = vendavel({ id: "caro", nome: "Caro", preco_a_partir: 900_000, zona_smq: "Oeste" });
  const todos = [incompleto, emFocoIncompleto, sul, sobConsulta, caro];

  it("esconde o incompleto, mas nunca a campanha; gestor pode abrir tudo", () => {
    const ids = aplicarFiltros(todos, FILTROS_VAZIOS).map((i) => i.id);
    expect(ids).not.toContain("inc");
    expect(ids).toContain("emfoco");
    expect(aplicarFiltros(todos, { ...FILTROS_VAZIOS, mostrarIncompletos: true })).toHaveLength(5);
  });

  it("filtra por zona, inclusive o balde Sem zona", () => {
    expect(aplicarFiltros(todos, { ...FILTROS_VAZIOS, zona: "Sul" }).map((i) => i.id)).toEqual([
      "sul",
    ]);
    expect(
      aplicarFiltros(todos, { ...FILTROS_VAZIOS, zona: SEM_ZONA, mostrarIncompletos: true }).map(
        (i) => i.id,
      ),
    ).toEqual(["inc", "emfoco"]);
  });

  it("preço máximo derruba o caro e preserva o 'sob consulta'", () => {
    const ids = aplicarFiltros(todos, { ...FILTROS_VAZIOS, precoMax: 300_000 }).map((i) => i.id);
    expect(ids).toContain("sul");
    expect(ids).toContain("sc");
    expect(ids).not.toContain("caro");
  });

  it("dormitórios, material, favoritos e busca por bairro", () => {
    expect(
      aplicarFiltros(todos, { ...FILTROS_VAZIOS, dorms: "3+" }).map((i) => i.id),
    ).not.toContain("sul");
    expect(aplicarFiltros(todos, { ...FILTROS_VAZIOS, dorms: "2" }).map((i) => i.id)).toContain(
      "sul",
    );
    expect(
      aplicarFiltros(todos, { ...FILTROS_VAZIOS, comMaterial: true }).map((i) => i.id),
    ).not.toContain("emfoco");
    expect(
      aplicarFiltros(todos, { ...FILTROS_VAZIOS, soFavoritos: true }, new Set(["caro"])).map(
        (i) => i.id,
      ),
    ).toEqual(["caro"]);
    expect(
      aplicarFiltros(todos, { ...FILTROS_VAZIOS, busca: "campo limpo" }).map((i) => i.id),
    ).toEqual(["sul"]);
  });

  it("com renda e 'só o que cabe', esconde o que a estimativa recusa e mantém o sem preço", () => {
    const ids = aplicarFiltros(todos, { ...FILTROS_VAZIOS, renda: 4_000, soQueCabe: true }).map(
      (i) => i.id,
    );
    expect(ids).not.toContain("caro");
    expect(ids).toContain("sc");
  });
});

describe("cabeNaRenda", () => {
  it("renda mínima cadastrada pela gestão vence a estimativa", () => {
    const i = vendavel({ id: "r", nome: "R", preco_a_partir: 900_000, renda_minima: 3_500 });
    expect(cabeNaRenda(i, 4_000)).toBe(true);
    expect(cabeNaRenda(i, 3_000)).toBe(false);
  });

  it("sem renda ou sem preço não opina", () => {
    const i = vendavel({ id: "r", nome: "R", sob_consulta: true });
    expect(cabeNaRenda(i, 4_000)).toBeNull();
    expect(cabeNaRenda(vendavel({ id: "s", nome: "S", preco_a_partir: 200_000 }), null)).toBeNull();
  });
});

describe("ordenar", () => {
  const foco = focosPorProjeto(
    [{ id: "f", projeto_id: "c1", motivo: null, inicio: dia(-1), fim: null, ativo: true }],
    AGORA,
  );
  const cury = item(
    {
      id: "c1",
      nome: "Cury Z",
      construtora: "Cury",
      zona_smq: "Sul",
      tabela_precos_url: "https://t",
      preco_a_partir: 300_000,
    },
    foco,
  );
  const mundo = vendavel({
    id: "m1",
    nome: "Mundo A",
    construtora: "Mundo Apto",
    preco_a_partir: 250_000,
  });
  const outra = vendavel({
    id: "o1",
    nome: "Outra B",
    construtora: "Vibra",
    preco_a_partir: 200_000,
  });
  const semPreco = vendavel({
    id: "s1",
    nome: "Sem preço",
    construtora: "Vibra",
    sob_consulta: true,
  });

  it("relevância: campanha primeiro, depois a ordem das parceiras, depois o resto", () => {
    expect(
      ordenar([outra, mundo, cury, semPreco], "relevancia", parceiras).map((i) => i.id),
    ).toEqual(["c1", "m1", "o1", "s1"]);
  });

  it("preço: crescente e decrescente, sempre com 'sob consulta' no fim", () => {
    expect(
      ordenar([cury, mundo, outra, semPreco], "preco-asc", parceiras).map((i) => i.id),
    ).toEqual(["o1", "m1", "c1", "s1"]);
    expect(
      ordenar([cury, mundo, outra, semPreco], "preco-desc", parceiras).map((i) => i.id),
    ).toEqual(["c1", "m1", "o1", "s1"]);
  });
});

describe("corredores", () => {
  const foco = focosPorProjeto(
    [{ id: "f", projeto_id: "c1", motivo: null, inicio: dia(-1), fim: null, ativo: true }],
    AGORA,
  );
  const cury = item(
    {
      id: "c1",
      nome: "Cury Z",
      construtora: "Cury",
      zona_smq: "Sul",
      tabela_precos_url: "https://t",
    },
    foco,
  );
  const mundo = vendavel({ id: "m1", nome: "Mundo A", construtora: "Mundo Apto" });
  const outra = vendavel({ id: "o1", nome: "Outra B", construtora: "Vibra" });
  const semConstrutora = vendavel({ id: "x1", nome: "Avulso" });

  it("campanha no topo, parceiras na ordem da gestão, o resto numa grade só", () => {
    const p = montarPrateleira([outra, mundo, cury, semConstrutora], parceiras);
    expect(p.emFoco.map((i) => i.id)).toEqual(["c1"]);
    expect(p.parceiras.map((c) => c.titulo)).toEqual(["Mundo Apto", "Cury"]);
    expect(p.outras.map((i) => i.id)).toEqual(["o1", "x1"]);
  });

  it("contagem por construtora: parceiras primeiro, depois por volume, com chave estável", () => {
    const c = contarPorConstrutora([outra, outra, mundo, cury, semConstrutora], parceiras);
    expect(c.map((x) => x.titulo)).toEqual([
      "Mundo Apto",
      "Cury",
      "Vibra",
      "Sem construtora informada",
    ]);
    expect(c[2].total).toBe(2);
    expect(construtoraChave(mundo)).toBe("p:mundo");
    expect(construtoraChave(outra)).toBe("c:vibra");
  });
});

describe("iniciais", () => {
  it("pega as iniciais das duas primeiras palavras", () => {
    expect(iniciais("Mundo Apto")).toBe("MA");
    expect(iniciais("Cury")).toBe("CU");
    expect(iniciais("Vivaz (Cyrela)")).toBe("VC");
    expect(iniciais(null)).toBe("•");
  });
});
