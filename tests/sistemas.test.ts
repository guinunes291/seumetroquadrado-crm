import { describe, expect, it } from "vitest";

import {
  ATALHOS_EXTRAS,
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
const sdr: PapelCtx = { roles: ["sdr"], isAdmin: false };

const sistema = (id: string): Sistema => {
  const s = SISTEMAS.find((x) => x.id === id);
  if (!s) throw new Error(`sistema ${id} não existe no registro`);
  return s;
};

const ids = (ctx: PapelCtx) => sistemasVisiveis(ctx).map((s) => s.id);

describe("visibilidade por papel", () => {
  it("corretor vê os 8 sistemas, sem Configurações — o dia primeiro, a consulta depois", () => {
    // Regra dos 2 menus (2026-09-11): Comunicações saiu, Modo Visita entrou
    // como módulo — o dia do corretor segue com 5 cards.
    expect(ids(corretor)).toEqual([
      "central-comando",
      "prospeccao",
      "carteira",
      "visita",
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
      carteira: "operacao",
      visita: "operacao",
      "follow-up": "operacao",
      sdr: "operacao",
      "docs-projetos": "consulta",
      financeiro: "consulta",
      bi: "consulta",
      configuracoes: "gestao",
    });
  });

  it("regra dos 2 menus: Carteira = Base de leads · Kanban · Agenda · Tarefas; Docs sem Links Úteis", () => {
    // Trabalhar carteira (filas) e a Central de Mensagens saíram da sidebar
    // (rotas vivas via dominioExtra + ⌘K); o Modo Visita virou módulo.
    expect(secoesVisiveis(sistema("carteira"), corretor).map((s) => s.id)).toEqual([
      "base-leads",
      "kanban",
      "agenda",
      "tarefas",
    ]);
    expect(secoesVisiveis(sistema("docs-projetos"), corretor).map((s) => s.id)).toEqual([
      "projetos-foco",
      "catalogo",
      "vitrine",
    ]);
  });

  it("regra dos 2 menus: nenhum módulo do dia passa de 4 seções para o corretor", () => {
    // Só os sistemas que o corretor de fato abre (o hub do SDR nem aparece).
    for (const s of sistemasVisiveis(corretor).filter((x) => x.grupo === "operacao")) {
      expect(
        secoesVisiveis(s, corretor).length,
        `${s.id} estourou as 4 seções`,
      ).toBeLessThanOrEqual(4);
    }
  });

  it("gestor vê os mesmos 8 (Configurações é só admin), com as seções de gestão dentro", () => {
    expect(ids(gestor)).not.toContain("configuracoes");
    const secoes = secoesVisiveis(sistema("prospeccao"), gestor).map((s) => s.id);
    expect(secoes).toContain("distribuicao");
    expect(secoes).toContain("captacao");
  });

  it("corretor vê na Prospecção SÓ Modo Foco, Oferta Ativa e Discador (decisão 2026-09-11)", () => {
    const secoes = secoesVisiveis(sistema("prospeccao"), corretor).map((s) => s.id);
    expect(secoes).toEqual(["modo-foco", "oferta-ativa", "discador"]);
  });

  it("Modo Visita é módulo próprio: um card, uma tela, sem menu interno", () => {
    expect(secoesVisiveis(sistema("visita"), corretor).map((s) => s.id)).toEqual(["modo-visita"]);
    expect(homeDoSistema(sistema("visita"), corretor)).toEqual({ to: "/modo-visita" });
    // …e a Carteira não o lista mais como seção.
    expect(sistema("carteira").secoes.map((s) => s.to)).not.toContain("/modo-visita");
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

  it("SDR (2026-09-04): Modo Foco + Base de leads (carteira antiga), hub próprio e Docs", () => {
    // A Base de leads mudou de módulo (Carteira) na regra dos 2 menus, mas a
    // superfície do SDR é a mesma de 2026-09-04: só Modo Foco e Base de leads
    // — nada de Oferta Ativa, Discador, Kanban, Agenda ou Tarefas.
    expect(ids(sdr)).toEqual(["prospeccao", "carteira", "sdr", "docs-projetos"]);
    expect(secoesVisiveis(sistema("prospeccao"), sdr).map((s) => s.id)).toEqual(["modo-foco"]);
    expect(secoesVisiveis(sistema("carteira"), sdr).map((s) => s.id)).toEqual(["base-leads"]);
    expect(secoesVisiveis(sistema("sdr"), sdr).map((s) => s.id)).toEqual([
      "base",
      "reaquecer",
      "entregues",
      "agenda",
      "raio-x",
    ]);
    // …e nenhum papel de venda enxerga o hub do SDR (admin enxerga tudo).
    expect(ids(corretor)).not.toContain("sdr");
    expect(ids(gestor)).not.toContain("sdr");
    expect(ids(superintendente)).not.toContain("sdr");
    expect(ids(admin)).toContain("sdr");
    expect(homeDoSistema(sistema("sdr"), sdr)).toEqual({ to: "/sdr" });
    // Modo Visita é da operação de venda — o SDR confirma visitas no hub /sdr.
    expect(ids(sdr)).not.toContain("visita");
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

  it("o badge da Carteira é só da operação: o SDR (que só vê a Base) não tem onde cair", () => {
    expect(badgeDoSistema(sistema("carteira"), badges, sdr)).toBe(0);
    expect(badgeDoSistema(sistema("carteira"), badges, gestor)).toBe(5);
  });

  it("Modo Visita não tem badge: agenda_hoje conta todo compromisso e continua da Agenda", () => {
    expect(badgeDoSistema(sistema("visita"), badges, corretor)).toBe(0);
  });

  it("aguardando resposta ficou sem card (Comunicações saiu) — nenhum sistema lê o contador", () => {
    // Cada contador tem UM dono; este não tem nenhum desde 2026-09-11. A
    // contagem segue in-page (fila Responder do /atendimento e Central de
    // Mensagens), sem acender card algum.
    const soMensagens = { ...badges, mensagensAguardando: 0 };
    for (const s of SISTEMAS) {
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

describe("home da Prospecção e da Carteira", () => {
  it("Prospecção abre DIRETO no Modo Foco (/prospeccao), para todo papel", () => {
    expect(homeDoSistema(sistema("prospeccao"), corretor)).toEqual({ to: "/prospeccao" });
    expect(homeDoSistema(sistema("prospeccao"), gestor)).toEqual({ to: "/prospeccao" });
  });

  it("Carteira abre na Base de leads — a 1ª seção é a porta (2026-09-11)", () => {
    expect(homeDoSistema(sistema("carteira"), corretor)).toEqual({ to: "/leads" });
    expect(sistema("carteira").secoes[0]?.to).toBe("/leads");
  });
});

describe("sistemaAtivo (pathname + search)", () => {
  const em = (pathname: string, search: Record<string, unknown> = {}) =>
    sistemaAtivo({ pathname, search })?.id ?? null;

  it("/pipeline (quadro completo) é a seção Kanban da Carteira", () => {
    expect(em("/pipeline")).toBe("carteira");
    expect(secaoAtiva(sistema("carteira"), { pathname: "/pipeline", search: {} })?.id).toBe(
      "kanban",
    );
  });

  it("/pipeline?fase=… (bookmarks antigos das fases) também acende o Kanban", () => {
    // A seção não fixa fase: qualquer recorte do quadro é o mesmo Kanban.
    expect(em("/pipeline", { fase: "prospeccao" })).toBe("carteira");
    expect(em("/pipeline", { fase: "carteira" })).toBe("carteira");
    expect(
      secaoAtiva(sistema("carteira"), { pathname: "/pipeline", search: { fase: "carteira" } })?.id,
    ).toBe("kanban");
  });

  it("/prospeccao é o Modo Foco — home e seção da Prospecção", () => {
    expect(em("/prospeccao")).toBe("prospeccao");
    expect(secaoAtiva(sistema("prospeccao"), { pathname: "/prospeccao", search: {} })?.id).toBe(
      "modo-foco",
    );
  });

  it("Reta final é aba interna do Kanban: ?tab=fechamento mantém o Kanban aceso", () => {
    expect(em("/pipeline", { tab: "fechamento" })).toBe("carteira");
    const loc = { pathname: "/pipeline", search: { fase: "carteira", tab: "fechamento" } };
    expect(sistemaAtivo(loc)?.id).toBe("carteira");
    expect(secaoAtiva(sistema("carteira"), loc)?.id).toBe("kanban");
  });

  it("portas sem menu continuam com dono: filas, mensagens e match são da Carteira; links dos Docs", () => {
    expect(em("/atendimento")).toBe("carteira");
    expect(em("/atendimento", { modo: "consulta" })).toBe("carteira");
    expect(em("/mensagens")).toBe("carteira");
    expect(em("/match")).toBe("carteira");
    expect(em("/links-uteis")).toBe("docs-projetos");
    // …sem acender seção alguma (a sidebar mostra o módulo, nada marcado).
    expect(secaoAtiva(sistema("carteira"), { pathname: "/atendimento", search: {} })).toBeNull();
    expect(secaoAtiva(sistema("carteira"), { pathname: "/mensagens", search: {} })).toBeNull();
  });

  it("ficha de lead cai na Carteira por prefixo (fallback); /leads-landing NÃO (fronteira de segmento)", () => {
    // Enquanto a etapa do lead carrega, /leads/$id resolve pelo prefixo da
    // Base de leads — com a etapa, sistemaAtivoContextual segue a jornada
    // (tests/contexto-jornada.test.ts).
    expect(em("/leads/abc-123")).toBe("carteira");
    expect(em("/leads-landing")).toBe("prospeccao"); // via seção Captação, não via prefixo /leads
    expect(secaoAtiva(sistema("prospeccao"), { pathname: "/leads-landing", search: {} })?.id).toBe(
      "captacao",
    );
  });

  it("Agenda e Tarefas são duas seções da mesma rota — ?tab=tarefas decide", () => {
    expect(em("/agendamentos")).toBe("carteira");
    expect(secaoAtiva(sistema("carteira"), { pathname: "/agendamentos", search: {} })?.id).toBe(
      "agenda",
    );
    expect(em("/agendamentos", { tab: "tarefas" })).toBe("carteira");
    expect(
      secaoAtiva(sistema("carteira"), { pathname: "/agendamentos", search: { tab: "tarefas" } })
        ?.id,
    ).toBe("tarefas");
  });

  it("rotas dos demais sistemas resolvem para seus donos", () => {
    expect(em("/fila")).toBe("central-comando");
    expect(em("/discador")).toBe("prospeccao");
    expect(em("/oferta-ativa")).toBe("prospeccao");
    expect(em("/oferta-ativa/nova")).toBe("prospeccao");
    expect(em("/modo-visita")).toBe("visita");
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

  it("/sdr e suas abas resolvem para o hub do SDR", () => {
    expect(em("/sdr")).toBe("sdr");
    expect(secaoAtiva(sistema("sdr"), { pathname: "/sdr", search: {} })?.id).toBe("base");
    expect(secaoAtiva(sistema("sdr"), { pathname: "/sdr", search: { tab: "reaquecer" } })?.id).toBe(
      "reaquecer",
    );
    expect(secaoAtiva(sistema("sdr"), { pathname: "/sdr", search: { tab: "raio-x" } })?.id).toBe(
      "raio-x",
    );
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

describe("atalhos do ⌘K (portas sem menu)", () => {
  const rotulos = (ctx: PapelCtx) =>
    ATALHOS_EXTRAS.filter((a) => !a.roles || a.roles.some((r) => ctx.roles.includes(r))).map(
      (a) => a.to,
    );

  it("Trabalhar carteira e Mensagens seguem alcançáveis pela operação, não pelo SDR", () => {
    expect(rotulos(corretor)).toContain("/atendimento");
    expect(rotulos(corretor)).toContain("/mensagens");
    expect(rotulos(sdr)).not.toContain("/atendimento");
    expect(rotulos(sdr)).not.toContain("/mensagens");
  });

  it("Tarefas deixou de ser atalho — virou seção (o invariante abaixo pegaria a duplicata)", () => {
    expect(ATALHOS_EXTRAS.some((a) => a.to === "/agendamentos")).toBe(false);
  });
});

describe("invariantes do registro", () => {
  it("nenhum destino (to + search) se repete — entre sistemas NEM com os atalhos do ⌘K", () => {
    // ATALHOS_EXTRAS entrou no invariante junto com o corte de 2026-08-30:
    // o padrão "seção cortada vira atalho" torna colisão futura provável.
    const vistos = new Set<string>();
    const registrar = (to: string, search?: Record<string, string>) => {
      const chave = `${to}?${JSON.stringify(search ?? {})}`;
      expect(vistos.has(chave), `destino duplicado: ${chave}`).toBe(false);
      vistos.add(chave);
    };
    for (const s of SISTEMAS) for (const secao of s.secoes) registrar(secao.to, secao.search);
    for (const a of ATALHOS_EXTRAS) registrar(a.to, a.search);
  });

  it("toda rota viva sem seção tem dono (dominioExtra) — nenhuma sidebar em branco", () => {
    for (const a of ATALHOS_EXTRAS) {
      const dono = sistemaAtivo({ pathname: a.to, search: a.search ?? {} });
      expect(dono, `${a.to} ficou sem sistema`).not.toBeNull();
    }
  });

  it("cada sistema tem no máximo 6 seções (teto por sistema)", () => {
    for (const s of SISTEMAS) {
      expect(s.secoes.length, `${s.id} estourou o teto`).toBeLessThanOrEqual(6);
    }
  });
});
