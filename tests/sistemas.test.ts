import { describe, expect, it } from "vitest";

import {
  SISTEMAS,
  badgeDoSistema,
  homeDoSistema,
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
  it("corretor vê os 8 sistemas, sem Configurações — o dia primeiro, a consulta depois", () => {
    expect(ids(corretor)).toEqual([
      "central-comando",
      "prospeccao",
      "atendimento-central",
      "carteira",
      "follow-up",
      "docs-projetos",
      "financeiro",
      "bi",
    ]);
  });

  it("portal por frequência (2026-08-30): o dia em 'operacao', a referência em 'consulta'", () => {
    const grupos = Object.fromEntries(SISTEMAS.map((s) => [s.id, s.grupo]));
    expect(grupos).toEqual({
      "central-comando": "operacao",
      prospeccao: "operacao",
      "atendimento-central": "operacao",
      carteira: "operacao",
      "follow-up": "operacao",
      "docs-projetos": "consulta",
      financeiro: "consulta",
      bi: "consulta",
      configuracoes: "gestao",
    });
  });

  it("corte 2026-08-30: Carteira com 4 seções e Docs sem Links Úteis no menu do corretor", () => {
    // Reta final fundiu com o Funil (aba interna do /pipeline) e o Match IA
    // virou ação dentro da ficha do lead; Links Úteis virou botão na home do
    // hub. Todas as rotas seguem vivas (dominioExtra + ⌘K).
    expect(secoesVisiveis(sistema("carteira"), corretor).map((s) => s.id)).toEqual([
      "funil-carteira",
      "atender",
      "agenda",
      "modo-visita",
    ]);
    expect(secoesVisiveis(sistema("docs-projetos"), corretor).map((s) => s.id)).toEqual([
      "projetos-foco",
      "catalogo",
      "vitrine",
    ]);
  });

  it("gestor vê os mesmos 7 (Configurações é só admin), com as seções de gestão dentro", () => {
    expect(ids(gestor)).not.toContain("configuracoes");
    const secoes = secoesVisiveis(sistema("prospeccao"), gestor).map((s) => s.id);
    expect(secoes).toContain("distribuicao");
    expect(secoes).toContain("captacao");
  });

  it("corretor vê na Prospecção SÓ o Modo Foco e a Base de leads (decisão 2026-08-27)", () => {
    const secoes = secoesVisiveis(sistema("prospeccao"), corretor).map((s) => s.id);
    expect(secoes).toEqual(["modo-foco", "base-leads"]);
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
  const badges = {
    atendimento: 4,
    tarefasVencidas: 2,
    agendaHoje: 3,
    aprovacoes: 5,
    followups: 6,
    mensagensAguardando: 7,
  };

  it("Prospecção carrega a fila de entrada; Carteira soma tarefas + agenda", () => {
    expect(badgeDoSistema(sistema("prospeccao"), badges, corretor)).toBe(4);
    expect(badgeDoSistema(sistema("carteira"), badges, corretor)).toBe(5);
  });

  it("Comunicações é dona única do aguardando resposta (Lote 3)", () => {
    // O rename dá ao hub a identidade mínima que justifica o card: o nome
    // não disputa mais com o /atendimento da Carteira, e o contador tem dono.
    expect(sistema("atendimento-central").titulo).toBe("Comunicações");
    expect(badgeDoSistema(sistema("atendimento-central"), badges, corretor)).toBe(7);
    // …e nenhum OUTRO sistema lê esse contador (dono único de verdade).
    const soMensagens = { ...badges, mensagensAguardando: 0 };
    for (const s of SISTEMAS.filter((x) => x.id !== "atendimento-central")) {
      expect(badgeDoSistema(s, badges, admin)).toBe(badgeDoSistema(s, soMensagens, admin));
    }
  });

  it("Follow-Up carrega os toques do dia (hoje + vencidos)", () => {
    expect(badgeDoSistema(sistema("follow-up"), badges, corretor)).toBe(6);
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

describe("home da Prospecção", () => {
  it("o card abre DIRETO no Modo Foco (/prospeccao), para todo papel", () => {
    expect(homeDoSistema(sistema("prospeccao"), corretor)).toEqual({ to: "/prospeccao" });
    expect(homeDoSistema(sistema("prospeccao"), gestor)).toEqual({ to: "/prospeccao" });
  });
});

describe("sistemaAtivo (pathname + search)", () => {
  const em = (pathname: string, search: Record<string, unknown> = {}) =>
    sistemaAtivo({ pathname, search })?.id ?? null;

  it("/pipeline cru pertence à Carteira (dominioExtra) — bookmark do quadro completo", () => {
    expect(em("/pipeline")).toBe("carteira");
  });

  it("/pipeline?fase=prospeccao pertence à Carteira — o funil de entrada saiu da sidebar da Prospecção", () => {
    // Sem a seção funil-entrada, o quadro (em qualquer fase) resolve pelo
    // dominioExtra da Carteira, dona do /pipeline.
    expect(em("/pipeline", { fase: "prospeccao" })).toBe("carteira");
  });

  it("/prospeccao é o Modo Foco — home e seção da Prospecção", () => {
    expect(em("/prospeccao")).toBe("prospeccao");
    expect(secaoAtiva(sistema("prospeccao"), { pathname: "/prospeccao", search: {} })?.id).toBe(
      "modo-foco",
    );
  });

  it("Reta final é aba interna: ?tab=fechamento resolve pela Carteira sem seção própria", () => {
    expect(em("/pipeline", { fase: "carteira" })).toBe("carteira");
    // A seção Fechamento saiu da sidebar (corte 2026-08-30) — o dominioExtra
    // segura o /pipeline em qualquer visão, e com fase=carteira o Funil da
    // carteira segue aceso enquanto o alternador interno mostra a Reta final.
    expect(em("/pipeline", { tab: "fechamento" })).toBe("carteira");
    const loc = { pathname: "/pipeline", search: { fase: "carteira", tab: "fechamento" } };
    expect(sistemaAtivo(loc)?.id).toBe("carteira");
    expect(secaoAtiva(sistema("carteira"), loc)?.id).toBe("funil-carteira");
  });

  it("portas sem menu continuam com dono: /match é da Carteira, /links-uteis dos Docs", () => {
    expect(em("/match")).toBe("carteira");
    expect(em("/links-uteis")).toBe("docs-projetos");
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
    expect(em("/follow-up")).toBe("follow-up");
    expect(em("/follow-up", { tab: "esgotados" })).toBe("follow-up");
    expect(secaoAtiva(sistema("follow-up"), { pathname: "/follow-up", search: {} })?.id).toBe(
      "fila",
    );
    expect(
      secaoAtiva(sistema("follow-up"), { pathname: "/follow-up", search: { tab: "kpis" } })?.id,
    ).toBe("kpis");
  });

  it("Cobertura do time do Follow-Up é só gestão", () => {
    const secoes = (ctx: PapelCtx) => secoesVisiveis(sistema("follow-up"), ctx).map((s) => s.id);
    expect(secoes(corretor)).toEqual(["fila", "esgotados", "kpis"]);
    expect(secoes(gestor)).toContain("cobertura");
  });

  it("rotas neutras não pertencem a sistema algum", () => {
    expect(em("/meu-perfil")).toBeNull();
  });

  it("Configurações deixou de ser card mudo: o cru é Integrações, as abas têm endereço", () => {
    expect(em("/configuracoes")).toBe("configuracoes");
    expect(
      secaoAtiva(sistema("configuracoes"), { pathname: "/configuracoes", search: {} })?.id,
    ).toBe("integracoes");
    expect(
      secaoAtiva(sistema("configuracoes"), {
        pathname: "/configuracoes",
        search: { tab: "pessoas" },
      })?.id,
    ).toBe("pessoas");
  });

  it("Config da régua é aba do Follow-Up (admin) — a régua se configura onde se opera", () => {
    expect(em("/follow-up", { tab: "config" })).toBe("follow-up");
    const secoes = (ctx: PapelCtx) => secoesVisiveis(sistema("follow-up"), ctx).map((s) => s.id);
    expect(secoes(gestor)).not.toContain("config");
    expect(secoes(admin)).toContain("config");
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
