import { describe, expect, it } from "vitest";

import {
  SISTEMAS,
  badgeDoSistema,
  homeDoSistema,
  searchDaSecao,
  secaoAtiva,
  secoesVisiveis,
  sistemaAtivo,
  sistemasVisiveis,
  type PapelCtx,
  type Sistema,
} from "@/features/nav/sistemas";

const corretor: PapelCtx = { roles: ["corretor"], isAdmin: false };
const gestor: PapelCtx = { roles: ["gestor"], isAdmin: false };
const superintendente: PapelCtx = { roles: ["superintendente"], isAdmin: false };
const admin: PapelCtx = { roles: ["admin"], isAdmin: true };

const sistema = (id: string): Sistema => {
  const s = SISTEMAS.find((x) => x.id === id);
  if (!s) throw new Error(`sistema ${id} não existe no registro`);
  return s;
};

const ids = (ctx: PapelCtx) => sistemasVisiveis(ctx).map((s) => s.id);

describe("visibilidade por papel", () => {
  it("corretor vê os 7 sistemas de operação, sem Configurações", () => {
    expect(ids(corretor)).toEqual([
      "central-comando",
      "prospeccao",
      "atendimento-central",
      "carteira",
      "financeiro",
      "docs-projetos",
      "bi",
    ]);
  });

  it("gestor vê os mesmos 7 (Configurações é só admin), com as seções de gestão dentro", () => {
    expect(ids(gestor)).not.toContain("configuracoes");
    const secoes = secoesVisiveis(sistema("prospeccao"), gestor).map((s) => s.id);
    expect(secoes).toContain("distribuicao");
    expect(secoes).toContain("captacao");
  });

  it("corretor não vê as seções de gestão da Prospecção", () => {
    const secoes = secoesVisiveis(sistema("prospeccao"), corretor).map((s) => s.id);
    expect(secoes).toEqual(["funil-entrada", "base-leads"]);
  });

  it("superintendente: sem Distribuição/Captação, mas com o painel da Operação no BI", () => {
    const prospeccao = secoesVisiveis(sistema("prospeccao"), superintendente).map((s) => s.id);
    expect(prospeccao).not.toContain("distribuicao");
    expect(prospeccao).not.toContain("captacao");
    const bi = secoesVisiveis(sistema("bi"), superintendente).map((s) => s.id);
    expect(bi).toContain("operacao");
  });

  it("admin vê todos os sistemas, Configurações incluída", () => {
    expect(ids(admin)).toEqual(SISTEMAS.map((s) => s.id));
  });
});

describe("badges dos cards", () => {
  const badges = { atendimento: 4, tarefasVencidas: 2, agendaHoje: 3, aprovacoes: 5 };

  it("Prospecção carrega a fila de entrada; Carteira soma tarefas + agenda", () => {
    expect(badgeDoSistema(sistema("prospeccao"), badges, corretor)).toBe(4);
    expect(badgeDoSistema(sistema("carteira"), badges, corretor)).toBe(5);
  });

  it("aprovações respeitam badgeRoles: somem para o corretor, aparecem para a gestão", () => {
    expect(badgeDoSistema(sistema("financeiro"), badges, corretor)).toBe(0);
    expect(badgeDoSistema(sistema("financeiro"), badges, gestor)).toBe(5);
    expect(badgeDoSistema(sistema("financeiro"), badges, superintendente)).toBe(5);
  });

  it("badges null (RPC indisponível) zera tudo", () => {
    expect(badgeDoSistema(sistema("prospeccao"), null, corretor)).toBe(0);
  });
});

describe("home do BI por papel", () => {
  it("corretor cai no Meu Raio-X; gestão cai no painel", () => {
    expect(homeDoSistema(sistema("bi"), corretor)).toEqual({ to: "/meu-raio-x" });
    expect(homeDoSistema(sistema("bi"), gestor)).toEqual({ to: "/painel-gestor" });
    expect(homeDoSistema(sistema("bi"), superintendente)).toEqual({ to: "/painel-gestor" });
    expect(homeDoSistema(sistema("bi"), admin)).toEqual({ to: "/painel-gestor" });
  });
});

describe("sistemaAtivo (pathname + search)", () => {
  const em = (pathname: string, search: Record<string, unknown> = {}) =>
    sistemaAtivo({ pathname, search })?.id ?? null;

  it("/pipeline cru pertence à Carteira (dominioExtra) — bookmark do quadro completo", () => {
    expect(em("/pipeline")).toBe("carteira");
  });

  it("/pipeline?fase=prospeccao pertence à Prospecção", () => {
    expect(em("/pipeline", { fase: "prospeccao" })).toBe("prospeccao");
  });

  it("/pipeline?fase=carteira e ?tab=fechamento pertencem à Carteira", () => {
    expect(em("/pipeline", { fase: "carteira" })).toBe("carteira");
    expect(em("/pipeline", { tab: "fechamento" })).toBe("carteira");
  });

  it("com fase E tab juntos, a visão (tab) decide a seção acesa", () => {
    const loc = { pathname: "/pipeline", search: { fase: "carteira", tab: "fechamento" } };
    expect(sistemaAtivo(loc)?.id).toBe("carteira");
    expect(secaoAtiva(sistema("carteira"), loc)?.id).toBe("fechamento");
  });

  it("/pipeline cru não acende nenhuma seção da Carteira (não é nenhuma das fases)", () => {
    expect(secaoAtiva(sistema("carteira"), { pathname: "/pipeline", search: {} })).toBeNull();
  });

  it("ficha de lead herda a Prospecção por prefixo; /leads-landing NÃO (fronteira de segmento)", () => {
    expect(em("/leads/abc-123")).toBe("prospeccao");
    expect(em("/leads-landing")).toBe("prospeccao"); // via seção Captação, não via prefixo /leads
    expect(secaoAtiva(sistema("prospeccao"), { pathname: "/leads-landing", search: {} })?.id).toBe(
      "captacao",
    );
  });

  it("rotas dos demais sistemas resolvem para seus donos", () => {
    expect(em("/hoje")).toBe("central-comando");
    expect(em("/mensagens")).toBe("atendimento-central");
    expect(em("/discador")).toBe("atendimento-central");
    expect(em("/oferta-ativa/nova")).toBe("atendimento-central");
    expect(em("/atendimento", { modo: "consulta" })).toBe("carteira");
    expect(em("/agendamentos", { tab: "tarefas" })).toBe("carteira");
    expect(em("/financeiro", { tab: "dre" })).toBe("financeiro");
    expect(em("/projetos/xyz")).toBe("docs-projetos");
    expect(em("/vitrine")).toBe("docs-projetos");
    expect(em("/meu-raio-x")).toBe("bi");
    expect(em("/ranking")).toBe("bi");
    expect(em("/painel-gestor", { tab: "time" })).toBe("bi");
  });

  it("rotas neutras não pertencem a sistema algum", () => {
    expect(em("/meu-perfil")).toBeNull();
    expect(em("/configuracoes")).toBeNull();
  });
});

describe("searchDaSecao (search do link com contexto da fase)", () => {
  const secaoDe = (sistemaId: string, secaoId: string) => {
    const s = sistema(sistemaId).secoes.find((x) => x.id === secaoId);
    if (!s) throw new Error(`seção ${secaoId} não existe em ${sistemaId}`);
    return s;
  };

  it("entrar no Modo Fechamento estando na Carteira preserva fase=carteira", () => {
    expect(searchDaSecao(secaoDe("carteira", "fechamento"), { fase: "carteira" })).toEqual({
      tab: "fechamento",
      fase: "carteira",
    });
  });

  it("não injeta fase quando a atual é prospeccao ou ausente", () => {
    const fechamento = secaoDe("carteira", "fechamento");
    expect(searchDaSecao(fechamento, { fase: "prospeccao" })).toEqual({ tab: "fechamento" });
    expect(searchDaSecao(fechamento, {})).toEqual({ tab: "fechamento" });
  });

  it("seções sem tab passam intactas (com e sem search declarada)", () => {
    expect(searchDaSecao(secaoDe("carteira", "funil-carteira"), { fase: "carteira" })).toEqual({
      fase: "carteira",
    });
    expect(
      searchDaSecao(secaoDe("prospeccao", "base-leads"), { fase: "carteira" }),
    ).toBeUndefined();
  });
});

describe("invariantes do registro", () => {
  it("nenhum destino (to + search) se repete entre sistemas", () => {
    const vistos = new Set<string>();
    for (const s of SISTEMAS) {
      for (const secao of s.secoes) {
        const chave = `${secao.to}?${JSON.stringify(secao.search ?? {})}`;
        expect(vistos.has(chave), `destino duplicado: ${chave}`).toBe(false);
        vistos.add(chave);
      }
    }
  });

  it("cada sistema tem no máximo 6 seções (teto por sistema)", () => {
    for (const s of SISTEMAS) {
      expect(s.secoes.length, `${s.id} estourou o teto`).toBeLessThanOrEqual(6);
    }
  });
});
