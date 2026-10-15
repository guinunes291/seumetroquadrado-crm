/**
 * LINK DE DOCUMENTAÇÃO DO CLIENTE (migration 20261024120000).
 *
 * O cliente abre /documentos/<slug> (link fixo do corretor), informa nome,
 * telefone, e-mail, CPF e o perfil de renda; o banco acha ou cria o lead e
 * abre a pasta dele (/pasta/<token>), onde os arquivos chegam aos poucos.
 * Esta suíte trava:
 *
 *  1. O corretor gerencia só o PRÓPRIO link; a pasta de um lead é de quem pode
 *     ver o lead; anon não executa nada e as funções públicas são do
 *     service_role.
 *  2. Pessoa nova → lead do corretor (origem documentacao_self_service) em Em
 *     atendimento, com checklist, tarefa, aviso e a pasta.
 *  3. As portas do registro mãe (as mesmas do link de agendamento).
 *  4. O envio: versão do cliente (sem usuário), item recebido, e a regra da
 *     pasta (3 documentos → Análise de crédito) seguindo sozinha.
 *  5. Limites por link e por pasta, itens fechados para o cliente e validade.
 */
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let ana: UsuarioTeste;
let bruno: UsuarioTeste;

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await c.query(
    `TRUNCATE public.clientes, public.documentacao_links, public.documentacao_pastas,
              public.push_outbox CASCADE`,
  );
  ana = await criarUsuario(c, { nome: "Ana Corretora", papel: "corretor" });
  bruno = await criarUsuario(c, { nome: "Bruno Corretor", papel: "corretor" });
});

/** O que o PostgREST faz com a chave de serviço: role service_role, sem uid. */
async function comoServico(cl: Client): Promise<void> {
  await cl.query(`RESET ROLE`);
  await cl.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ role: "service_role" }),
  ]);
  await cl.query(`SET ROLE service_role`);
}

const CLT = [
  "documento_identidade",
  "cpf",
  "comprovante_estado_civil",
  "comprovante_residencia",
  "carteira_trabalho",
  "holerites",
  "extrato_bancario_6m",
];

type Link = { id: string; slug: string; total_cadastros: number };

async function linkDaAna(): Promise<Link> {
  await comoUsuario(c, ana.id);
  const r = await c.query(`SELECT public.criar_meu_documentacao_link() AS l`);
  await comoSuperuser(c);
  return r.rows[0].l as Link;
}

type Item = { id: string; tipo: string; status: string; tem_arquivo: boolean };
type Pasta = {
  corretor_nome: string;
  corretor_whatsapp: string | null;
  expira_em: string;
  itens: Item[];
};

async function pasta(token: string): Promise<Pasta | null> {
  await comoServico(c);
  const r = await c.query(`SELECT public.obter_pasta_publica($1) AS p`, [token]);
  await comoSuperuser(c);
  return r.rows[0].p as Pasta | null;
}

type Resultado = { ok: boolean; motivo?: string; token?: string };

async function cadastrar(
  slug: string,
  over: Partial<{
    nome: string;
    telefone: string;
    email: string;
    cpf: string;
    perfil: string;
    casado: boolean;
    usaFgts: boolean;
    declaraIr: boolean;
    tipos: string[];
  }> = {},
): Promise<Resultado> {
  const p = {
    nome: "Marina Souza Lima",
    telefone: "11987650000",
    email: "marina@exemplo.com",
    cpf: "529.982.247-25",
    perfil: "clt",
    casado: false,
    usaFgts: true,
    declaraIr: false,
    tipos: [...CLT, "extrato_fgts", "autorizacao_fgts"],
    ...over,
  };
  await comoServico(c);
  const r = await c.query(
    `SELECT public.iniciar_documentacao_pelo_link($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS r`,
    [slug, p.nome, p.telefone, p.email, p.cpf, p.perfil, p.casado, p.usaFgts, p.declaraIr, p.tipos],
  );
  await comoSuperuser(c);
  return r.rows[0].r as Resultado;
}

/** O que o servidor faz: valida, sobe o objeto (aqui não há storage) e registra. */
async function enviar(
  token: string,
  alvo: { documentacaoId: string } | { tipo: string },
  over: Partial<{ caminho: string; mime: string; tamanho: number }> = {},
): Promise<{ ok: boolean; motivo?: string; documentacao_id?: string; versao?: number }> {
  const docId = "documentacaoId" in alvo ? alvo.documentacaoId : null;
  const tipo = "tipo" in alvo ? alvo.tipo : null;
  await comoServico(c);
  const v = (
    await c.query(`SELECT public.validar_upload_pasta($1, $2, $3) AS v`, [token, docId, tipo])
  ).rows[0].v as { ok: boolean; motivo?: string; lead_id?: string };
  if (!v.ok) {
    await comoSuperuser(c);
    return v;
  }
  const novo = docId ? null : randomUUID();
  const caminho = over.caminho ?? `${v.lead_id}/${docId ?? novo}/${randomUUID()}.pdf`;
  const r = await c.query(
    `SELECT public.registrar_upload_pasta($1, $2, $3, $4, $5, $6, $7, $8) AS r`,
    [
      token,
      caminho,
      "holerite-setembro.pdf",
      over.mime ?? "application/pdf",
      over.tamanho ?? 120_000,
      docId,
      novo,
      tipo,
    ],
  );
  await comoSuperuser(c);
  return r.rows[0].r;
}

async function leadsDa(corretorId: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT *, status::text AS st, origem::text AS org FROM public.leads
      WHERE corretor_id = $1 ORDER BY created_at`,
    [corretorId],
  );
  return r.rows;
}

const itemDe = (p: Pasta, tipo: string) => p.itens.find((i) => i.tipo === tipo)!;

describe("o link fixo é do corretor", () => {
  it("cria uma vez, troca e desativa", async () => {
    await comoUsuario(c, ana.id);
    expect((await c.query(`SELECT public.meu_documentacao_link() AS l`)).rows[0].l).toBeNull();

    const link = await linkDaAna();
    expect(link.slug).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await linkDaAna()).id).toBe(link.id);

    await comoUsuario(c, ana.id);
    const novo = (await c.query(`SELECT public.trocar_meu_documentacao_link() AS l`)).rows[0]
      .l as Link;
    expect(novo.slug).not.toBe(link.slug);
    await comoServico(c);
    expect(
      (await c.query(`SELECT public.obter_documentacao_link_publico($1) AS p`, [link.slug])).rows[0]
        .p,
    ).toBeNull();
    expect(
      (await c.query(`SELECT public.obter_documentacao_link_publico($1) AS p`, [novo.slug])).rows[0]
        .p,
    ).toEqual({ corretor_nome: "Ana Corretora" });

    await comoUsuario(c, ana.id);
    expect(
      (await c.query(`SELECT public.desativar_meu_documentacao_link() AS ok`)).rows[0].ok,
    ).toBe(true);
    expect((await c.query(`SELECT public.meu_documentacao_link() AS l`)).rows[0].l).toBeNull();
    await comoSuperuser(c);
  });

  it("só corretor ativo tem link; anon e authenticated não tocam nas funções públicas", async () => {
    const gestor = await criarUsuario(c, { nome: "Gil Gestor", papel: "gestor" });
    await comoUsuario(c, gestor.id);
    expect(await errCode(c.query(`SELECT public.criar_meu_documentacao_link()`))).toBe("42501");

    const link = await linkDaAna();
    await comoUsuario(c, ana.id);
    expect(
      await errCode(c.query(`SELECT public.obter_documentacao_link_publico($1)`, [link.slug])),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT public.obter_pasta_publica('x')`))).toBe("42501");
    expect(await errCode(c.query(`SELECT count(*) FROM public.documentacao_pastas`))).toBe("42501");
    await c.query(`RESET ROLE`);
    await c.query(`SET ROLE anon`);
    expect(await errCode(c.query(`SELECT public.meu_documentacao_link()`))).toBe("42501");
    expect(
      await errCode(
        c.query(`SELECT public.consumir_documentacao_link_requisicao($1)`, [link.slug]),
      ),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT count(*) FROM public.documentacao_links`))).toBe("42501");
    await comoSuperuser(c);

    // Corretor bloqueado: o link dele para de abrir sem ninguém revogar.
    await c.query(`UPDATE public.profiles SET status_conta = 'bloqueada' WHERE id = $1`, [ana.id]);
    await comoServico(c);
    expect(
      (await c.query(`SELECT public.obter_documentacao_link_publico($1) AS p`, [link.slug])).rows[0]
        .p,
    ).toBeNull();
    await comoSuperuser(c);
  });

  it("o limite por minuto vale por link", async () => {
    const link = await linkDaAna();
    await comoServico(c);
    const r = await c.query(
      `SELECT public.consumir_documentacao_link_requisicao($1) AS s FROM generate_series(1, 121)`,
      [link.slug],
    );
    await comoSuperuser(c);
    const s = r.rows.map((x) => x.s as string);
    expect(s.slice(0, 120).every((v) => v === "allowed")).toBe(true);
    expect(s[120]).toBe("rate_limited");
  });
});

describe("o cadastro pelo link fixo", () => {
  it("pessoa nova: lead em Em atendimento, checklist, tarefa, aviso e a pasta", async () => {
    const link = await linkDaAna();
    const r = await cadastrar(link.slug);
    expect(r.ok).toBe(true);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const [lead] = await leadsDa(ana.id);
    expect(lead.org).toBe("documentacao_self_service");
    expect(lead.st).toBe("em_atendimento");
    expect(lead.nome).toBe("Marina Souza Lima");
    expect(lead.telefone).toBe("(11) 98765-0000");
    expect(lead.cpf).toBe("529.982.247-25");
    expect(lead.tipo_renda).toBe("CLT");
    expect(lead.usa_fgts).toBe(true);
    expect(lead.consentimento_lgpd).toBe(true);
    expect(lead.cliente_id).toBeTruthy();
    // Respondeu: saiu da cadência como qualquer cliente que fala.
    expect(lead.cadencia_etapa).toBe("respondeu");

    const tr = await c.query(
      `SELECT de_status::text AS de, para_status::text AS para FROM public.lead_status_transitions
        WHERE lead_id = $1`,
      [lead.id],
    );
    expect(tr.rows).toEqual([{ de: "aguardando_atendimento", para: "em_atendimento" }]);

    const docs = await c.query(
      `SELECT tipo, status FROM public.documentacoes WHERE lead_id = $1 ORDER BY tipo`,
      [lead.id],
    );
    expect(docs.rows.map((d) => d.tipo)).toEqual(
      [...CLT, "extrato_fgts", "autorizacao_fgts"].sort(),
    );
    expect(docs.rows.every((d) => d.status === "pendente")).toBe(true);

    const tarefas = await c.query(
      `SELECT titulo, tipo::text AS t FROM public.tarefas WHERE lead_id = $1`,
      [lead.id],
    );
    expect(tarefas.rows).toEqual([
      { titulo: "Conferir os documentos de Marina Souza Lima", t: "documentacao" },
    ]);
    // O próximo passo do lead é a tarefa (espelho proximo_followup).
    expect((await leadsDa(ana.id))[0].proximo_followup).not.toBeNull();

    const push = await c.query(`SELECT title FROM public.push_outbox WHERE user_id = $1`, [ana.id]);
    expect(push.rows.map((x) => x.title)).toContain("Cliente no seu link de documentos");
    const nota = await c.query(
      `SELECT conteudo FROM public.interacoes WHERE lead_id = $1 AND titulo LIKE 'Sistema:%'`,
      [lead.id],
    );
    expect(nota.rows[0].conteudo).toContain("perfil CLT, vai usar FGTS");

    // A pasta pública: o corretor e os itens — nada do cliente.
    const p = (await pasta(r.token!))!;
    expect(Object.keys(p).sort()).toEqual([
      "corretor_nome",
      "corretor_whatsapp",
      "expira_em",
      "itens",
    ]);
    expect(p.corretor_nome).toBe("Ana Corretora");
    expect(p.itens).toHaveLength(9);
    expect(JSON.stringify(p)).not.toContain("Marina");
    expect(new Date(p.expira_em).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it("voltar com o mesmo telefone cai na mesma pasta, sem duplicar o checklist", async () => {
    const link = await linkDaAna();
    const a = await cadastrar(link.slug);
    // Agora casado: só os itens do cônjuge entram.
    const b = await cadastrar(link.slug, {
      casado: true,
      tipos: [...CLT, "extrato_fgts", "autorizacao_fgts", "conjuge_identidade", "conjuge_renda"],
    });
    expect(b.token).toBe(a.token);
    expect(await leadsDa(ana.id)).toHaveLength(1);
    const p = (await pasta(b.token!))!;
    expect(p.itens).toHaveLength(11);
    const t = await c.query(`SELECT count(*)::int AS n FROM public.tarefas`);
    expect(t.rows[0].n).toBe(1);
  });

  it("registro do próprio corretor: reaproveita, completa vazios e não sobrescreve", async () => {
    const link = await linkDaAna();
    const id = await criarLead(c, {
      nome: "Marina S.",
      telefone: "(11) 98765-0000",
      corretorId: ana.id,
      status: "aguardando_retorno",
    });
    await c.query(`UPDATE public.leads SET tipo_renda = 'Autônomo' WHERE id = $1`, [id]);
    const r = await cadastrar(link.slug);
    expect(r.ok).toBe(true);

    const leads = await leadsDa(ana.id);
    expect(leads.map((l) => l.id)).toEqual([id]);
    expect(leads[0].nome).toBe("Marina S.");
    expect(leads[0].tipo_renda).toBe("Autônomo");
    expect(leads[0].email).toBe("marina@exemplo.com");
    expect(leads[0].st).toBe("em_atendimento");
    const nota = await c.query(
      `SELECT conteudo FROM public.interacoes WHERE lead_id = $1 AND titulo LIKE 'Sistema:%'`,
      [id],
    );
    expect(nota.rows[0].conteudo).toContain("Nome informado: Marina Souza Lima");
  });

  it("lead adiante no funil não regride", async () => {
    const link = await linkDaAna();
    const id = await criarLead(c, {
      nome: "Marina Souza Lima",
      telefone: "11987650000",
      corretorId: ana.id,
      status: "visita_realizada",
    });
    expect((await cadastrar(link.slug)).ok).toBe(true);
    expect((await leadsDa(ana.id))[0]).toMatchObject({ id, st: "visita_realizada" });
  });

  it("cliente de outro corretor: registro filho; outro em Visita realizada: recusa", async () => {
    const link = await linkDaAna();
    const doBruno = await criarLead(c, {
      nome: "Marina Souza",
      telefone: "11987650000",
      corretorId: bruno.id,
      status: "aguardando_atendimento",
    });
    await c.query(`UPDATE public.leads SET renda_informada = 'R$ 4.000' WHERE id = $1`, [doBruno]);
    expect((await cadastrar(link.slug)).ok).toBe(true);
    const [filho] = await leadsDa(ana.id);
    expect(filho.registro_adicional).toBe(true);
    expect(filho.st).toBe("em_atendimento");
    expect(filho.renda_informada).toBe("R$ 4.000");
    expect((await leadsDa(bruno.id))[0].st).toBe("aguardando_atendimento");

    await criarLead(c, {
      nome: "Paulo Lima",
      telefone: "11912340000",
      corretorId: bruno.id,
      status: "visita_realizada",
    });
    const r = await cadastrar(link.slug, {
      nome: "Paulo Lima Neto",
      telefone: "11912340000",
      cpf: "111.444.777-35",
    });
    expect(r).toEqual({ ok: false, motivo: "nao_permitido" });
    expect(await leadsDa(ana.id)).toHaveLength(1);
  });

  it("entrada inválida, tipo fechado, link revogado e teto de cadastros", async () => {
    const link = await linkDaAna();
    for (const over of [
      { cpf: "123.456.789-00" },
      { nome: "Marina" },
      { perfil: "estagiario" },
      { tipos: [] },
      { tipos: ["aprovacao_credito"] },
      { tipos: ["Cpf; DROP"] },
    ]) {
      expect(await cadastrar(link.slug, over)).toEqual({ ok: false, motivo: "invalid_input" });
    }

    // 10 pastas novas na última hora seguram a 11ª.
    for (let i = 0; i < 10; i++) {
      const lead = await criarLead(c, { corretorId: ana.id });
      await c.query(
        `INSERT INTO public.documentacao_pastas (lead_id, link_id, token, expira_em)
         VALUES ($1, $2, public._documentacao_novo_token(), now() + interval '1 day')`,
        [lead, link.id],
      );
    }
    expect(await cadastrar(link.slug)).toEqual({ ok: false, motivo: "limite_link" });

    await comoUsuario(c, ana.id);
    await c.query(`SELECT public.desativar_meu_documentacao_link()`);
    expect(await cadastrar(link.slug)).toEqual({ ok: false, motivo: "not_found" });
  });
});

describe("os envios para a pasta", () => {
  it("o arquivo vira versão do cliente e o 3º documento leva à Análise de crédito", async () => {
    const link = await linkDaAna();
    const { token } = await cadastrar(link.slug);
    const p = (await pasta(token!))!;
    const [lead] = await leadsDa(ana.id);

    const r1 = await enviar(token!, { documentacaoId: itemDe(p, "documento_identidade").id });
    expect(r1).toMatchObject({ ok: true, versao: 1 });

    const doc = (
      await c.query(`SELECT * FROM public.documentacoes WHERE id = $1`, [r1.documentacao_id])
    ).rows[0];
    expect(doc).toMatchObject({
      status: "recebido",
      origem: "link_cliente",
      arquivo_nome: "holerite-setembro.pdf",
      arquivo_path: null,
    });
    expect(doc.url).toMatch(new RegExp(`^${lead.id}/${doc.id}/[0-9a-f-]{36}\\.pdf$`));
    const v = (
      await c.query(`SELECT * FROM public.documentacao_versoes WHERE documentacao_id = $1`, [
        doc.id,
      ])
    ).rows[0];
    expect(v).toMatchObject({ enviado_por: null, pelo_cliente: true, ativa: true });

    expect((await enviar(token!, { documentacaoId: itemDe(p, "cpf").id })).ok).toBe(true);
    expect((await leadsDa(ana.id))[0].st).toBe("em_atendimento");
    expect((await enviar(token!, { documentacaoId: itemDe(p, "holerites").id })).ok).toBe(true);

    // A regra da pasta, sem mudança: 3 resolvidos → Análise de crédito.
    const depois = (await leadsDa(ana.id))[0];
    expect(depois.st).toBe("analise_credito");
    expect(depois.pasta_montada_em).not.toBeNull();

    // A página mostra o andamento.
    const p2 = (await pasta(token!))!;
    expect(itemDe(p2, "cpf")).toMatchObject({ status: "recebido", tem_arquivo: true });
    expect(itemDe(p2, "comprovante_residencia")).toMatchObject({
      status: "pendente",
      tem_arquivo: false,
    });

    // O corretor remove a versão do cliente pelo caminho de sempre do CRM.
    const rem = await c.query(`SELECT public.registrar_documentacao_remocao($1, $2) AS p`, [
      doc.id,
      ana.id,
    ]);
    expect(rem.rows[0].p).toBe(doc.url);
  });

  it("arquivo a mais do mesmo item, troca de arquivo e o que o cliente não pode tocar", async () => {
    const link = await linkDaAna();
    const { token } = await cadastrar(link.slug);
    const p = (await pasta(token!))!;
    const hol = itemDe(p, "holerites");

    // Primeiro holerite no item; o segundo vira um item a mais do mesmo tipo.
    expect((await enviar(token!, { documentacaoId: hol.id })).ok).toBe(true);
    const extra = await enviar(token!, { tipo: "holerites" });
    expect(extra.ok).toBe(true);
    expect(extra.documentacao_id).not.toBe(hol.id);
    // Trocar o arquivo de um item recebido é versão nova do mesmo item.
    expect(await enviar(token!, { documentacaoId: hol.id })).toMatchObject({
      ok: true,
      versao: 2,
    });
    const p2 = (await pasta(token!))!;
    expect(p2.itens.filter((i) => i.tipo === "holerites")).toHaveLength(2);

    // Aprovado não se troca; item de outro lead e tipos fechados são recusados.
    await c.query(`UPDATE public.documentacoes SET status = 'aprovado' WHERE id = $1`, [hol.id]);
    expect(await enviar(token!, { documentacaoId: hol.id })).toEqual({
      ok: false,
      motivo: "item_invalido",
    });
    const outroLead = await criarLead(c, { corretorId: ana.id });
    const alheio = (
      await c.query(
        `INSERT INTO public.documentacoes (lead_id, tipo, status) VALUES ($1, 'cpf', 'pendente')
         RETURNING id`,
        [outroLead],
      )
    ).rows[0].id as string;
    expect(await enviar(token!, { documentacaoId: alheio })).toEqual({
      ok: false,
      motivo: "item_invalido",
    });
    for (const tipo of ["aprovacao_credito", "nao_classificado"]) {
      expect(await enviar(token!, { tipo })).toEqual({ ok: false, motivo: "item_invalido" });
    }

    // Caminho fora da pasta do lead, mime fora da lista e tamanho acima de 15 MB.
    const cpf = itemDe(p, "cpf");
    for (const over of [
      { caminho: `${outroLead}/${cpf.id}/${randomUUID()}.pdf` },
      { caminho: `x/${cpf.id}/${randomUUID()}.pdf` },
      { mime: "image/heic" },
      { tamanho: 16 * 1024 * 1024 },
    ]) {
      expect(await enviar(token!, { documentacaoId: cpf.id }, over)).toEqual({
        ok: false,
        motivo: "invalid_input",
      });
    }
  });

  it("tetos: 12 arquivos por item e 40 envios por hora", async () => {
    const link = await linkDaAna();
    const { token } = await cadastrar(link.slug);
    for (let i = 0; i < 11; i++) {
      expect((await enviar(token!, { tipo: "outro" })).ok).toBe(true);
    }
    expect((await enviar(token!, { tipo: "outro" })).ok).toBe(true);
    expect(await enviar(token!, { tipo: "outro" })).toEqual({ ok: false, motivo: "limite_item" });

    for (let i = 0; i < 28; i++) {
      expect(
        (await enviar(token!, { tipo: `extra_${String.fromCharCode(97 + (i % 26))}` })).ok,
      ).toBe(true);
    }
    expect(await enviar(token!, { tipo: "outro_x" })).toEqual({
      ok: false,
      motivo: "limite_pasta",
    });
  });

  it("um aviso ao corretor por leva de envios", async () => {
    const link = await linkDaAna();
    const { token } = await cadastrar(link.slug);
    const p = (await pasta(token!))!;
    for (const tipo of ["documento_identidade", "cpf"]) {
      expect((await enviar(token!, { documentacaoId: itemDe(p, tipo).id })).ok).toBe(true);
    }
    const push = await c.query(
      `SELECT title FROM public.push_outbox WHERE user_id = $1 AND title = 'Documentos chegando'`,
      [ana.id],
    );
    expect(push.rows).toHaveLength(1);
  });
});

describe("a pasta mandada pela aba Documentação", () => {
  it("quem vê o lead gera, renova e troca o link; o cliente responde o perfil", async () => {
    const id = await criarLead(c, {
      nome: "Carla Dias",
      telefone: "11955550000",
      corretorId: ana.id,
      status: "aguardando_atendimento",
    });

    await comoUsuario(c, bruno.id);
    expect(await errCode(c.query(`SELECT public.link_pasta_do_lead($1)`, [id]))).toBe("42501");

    await comoUsuario(c, ana.id);
    expect(
      (await c.query(`SELECT public.consultar_pasta_do_lead($1) AS p`, [id])).rows[0].p,
    ).toBeNull();
    const a = (await c.query(`SELECT public.link_pasta_do_lead($1) AS p`, [id])).rows[0].p as {
      token: string;
      pelo_link_fixo: boolean;
    };
    expect(a.pelo_link_fixo).toBe(false);
    const b = (await c.query(`SELECT public.link_pasta_do_lead($1) AS p`, [id])).rows[0].p as {
      token: string;
    };
    expect(b.token).toBe(a.token);
    await comoSuperuser(c);

    // Sem checklist: a página pede o perfil.
    expect((await pasta(a.token))!.itens).toEqual([]);
    await comoServico(c);
    const def = (
      await c.query(
        `SELECT public.definir_perfil_pasta($1, 'autonomo', false, false, true, $2) AS p`,
        [
          a.token,
          ["documento_identidade", "cpf", "decore", "extrato_bancario_6m", "declaracao_ir"],
        ],
      )
    ).rows[0].p as { ok: boolean; itens: Item[] };
    await comoSuperuser(c);
    expect(def.ok).toBe(true);
    expect(def.itens.map((i) => i.tipo)).toContain("decore");
    const lead = (await leadsDa(ana.id))[0];
    expect(lead).toMatchObject({ st: "em_atendimento", tipo_renda: "Autônomo / Informal" });

    // Trocar o link: o antigo para de abrir; os itens ficam.
    await comoUsuario(c, ana.id);
    const novo = (await c.query(`SELECT public.trocar_link_pasta_do_lead($1) AS p`, [id])).rows[0]
      .p as { token: string };
    await comoSuperuser(c);
    expect(await pasta(a.token)).toBeNull();
    expect((await pasta(novo.token))!.itens).toHaveLength(5);

    // Vencida: não abre, e o envio também não entra.
    await c.query(
      `UPDATE public.documentacao_pastas SET expira_em = now() - interval '1 minute'
        WHERE token = $1`,
      [novo.token],
    );
    expect(await pasta(novo.token)).toBeNull();
    expect(await enviar(novo.token, { tipo: "outro" })).toEqual({
      ok: false,
      motivo: "not_found",
    });
    // Mandar o link de novo dá mais 30 dias.
    await comoUsuario(c, ana.id);
    await c.query(`SELECT public.link_pasta_do_lead($1)`, [id]);
    await comoSuperuser(c);
    expect(await pasta(novo.token)).not.toBeNull();
  });
});
