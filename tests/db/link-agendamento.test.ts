/**
 * LINK DE AGENDAMENTO DO CORRETOR (migration 20261022120000).
 *
 * O cliente abre /agendar/<slug>, escolhe um horário livre e informa nome,
 * telefone, e-mail e CPF; o banco cria numa transação o lead na carteira do
 * corretor em Agendado e a visita na agenda dele. Esta suíte trava:
 *
 *  1. O corretor gerencia só o PRÓPRIO link; anon não executa nada e as
 *     funções públicas são só do service_role.
 *  2. Pessoa nova → lead do corretor (origem agendamento_self_service), mãe
 *     criada, Agendado com transição registrada, visita como produção dele
 *     (criado_por_id = corretor: pontua e não vira esteira "marquinhos").
 *  3. As portas do registro mãe: reaproveita o registro do próprio corretor
 *     sem sobrescrever a ficha; cria filho quando a pessoa é de outro; recusa
 *     quando o outro já está em Visita realizada.
 *  4. Horário: só os livres, sem choque com a agenda, no fuso de São Paulo.
 *  5. Reenvio idempotente, tetos por link e comprovante (.ics) pelo hash.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
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

const ENDERECO = "Av. Paulista, 1000 - Bela Vista, São Paulo";

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
  await c.query(`TRUNCATE public.clientes, public.agendamento_links, public.push_outbox CASCADE`);
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

type Link = {
  id: string;
  slug: string;
  endereco: string;
  local_id: string | null;
  local_nome: string;
  dias_semana: number[];
  duracao_minutos: number;
  ja_existia?: boolean;
};

const STAND = { id: "cury-av-paulista-1000", nome: "Cury · Stand Paulista" };

/** Link da Ana aberto o dia todo, todos os dias: sempre há horário livre. */
async function linkDaAna(
  endereco = ENDERECO,
  local: { id: string | null; nome: string } = { id: null, nome: "" },
): Promise<Link> {
  await comoUsuario(c, ana.id);
  const r = await c.query(
    `SELECT public.criar_agendamento_link($1, $2, $3, '00:00', '23:30', '{0,1,2,3,4,5,6}', 60) AS l`,
    [endereco, local.id, local.nome],
  );
  await comoSuperuser(c);
  return r.rows[0].l as Link;
}

async function linksDaAna(): Promise<Link[]> {
  await comoUsuario(c, ana.id);
  const r = await c.query(`SELECT public.meus_agendamento_links() AS l`);
  await comoSuperuser(c);
  return r.rows[0].l as Link[];
}

type Publico = {
  corretor_nome: string;
  endereco: string | null;
  local_nome: string | null;
  duracao_minutos: number;
  disponibilidade: Array<{ data: string; horarios: string[] }>;
};

async function publico(slug: string): Promise<Publico | null> {
  await comoServico(c);
  const r = await c.query(`SELECT public.obter_agendamento_link_publico($1) AS p`, [slug]);
  await comoSuperuser(c);
  return r.rows[0].p as Publico | null;
}

/** Um horário livre de amanhã em diante (o primeiro do dia seguinte ao de hoje). */
async function horarioLivre(slug: string, pular = 0): Promise<{ data: string; horario: string }> {
  const p = await publico(slug);
  const dia = p!.disponibilidade[1] ?? p!.disponibilidade[0];
  return { data: dia.data, horario: dia.horarios[pular] };
}

const hashDe = (token: string) => createHash("sha256").update(token).digest("hex");

type Resultado = {
  ok: boolean;
  motivo?: string;
  agendamento_id?: string;
  inicio?: string;
  fim?: string;
  endereco?: string;
  local_nome?: string | null;
  corretor_nome?: string;
  corretor_whatsapp?: string | null;
};

async function agendar(
  slug: string,
  quando: { data: string; horario: string },
  over: Partial<{
    idem: string;
    nome: string;
    telefone: string;
    email: string;
    cpf: string;
    endereco: string | null;
    comprovante: string;
  }> = {},
): Promise<Resultado> {
  const p = {
    idem: randomUUID(),
    nome: "Marina Souza Lima",
    telefone: "11987650000",
    email: "marina@exemplo.com",
    cpf: "529.982.247-25",
    endereco: null,
    comprovante: randomBytes(32).toString("base64url"),
    ...over,
  };
  await comoServico(c);
  const r = await c.query(
    `SELECT public.agendar_pelo_link($1, $2, $3, $4, $5, $6, $7::date, $8::time, $9, $10) AS r`,
    [
      slug,
      p.idem,
      p.nome,
      p.telefone,
      p.email,
      p.cpf,
      quando.data,
      quando.horario,
      p.endereco,
      hashDe(p.comprovante),
    ],
  );
  await comoSuperuser(c);
  return r.rows[0].r as Resultado;
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

describe("os links são do corretor, um por endereço", () => {
  it("cria um link por local; o mesmo endereço devolve o mesmo link", async () => {
    expect(await linksDaAna()).toEqual([]);

    const stand = await linkDaAna(ENDERECO, STAND);
    expect(stand.slug).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(stand).toMatchObject({
      endereco: ENDERECO,
      local_id: STAND.id,
      local_nome: STAND.nome,
      ja_existia: false,
    });

    // Mesmo endereço (caixa e espaços não contam): o link já divulgado volta.
    const deNovo = await linkDaAna(`  ${ENDERECO.toUpperCase().replace(" ", "   ")} `, STAND);
    expect(deNovo.id).toBe(stand.id);
    expect(deNovo.ja_existia).toBe(true);

    // Outro endereço: outro link, ao lado do primeiro.
    const outro = await linkDaAna("Rua Tuiuti, 2000 - Tatuapé, São Paulo", {
      id: "cury-rua-tuiuti-2000",
      nome: "Cury · Stand Tatuapé",
    });
    expect(outro.slug).not.toBe(stand.slug);
    const lista = await linksDaAna();
    expect(lista.map((l) => l.id)).toEqual([outro.id, stand.id]);

    // Sem endereço (o cliente informa) também é um link só; o local some.
    const semEndereco = await linkDaAna("", { id: "x", nome: "ignorado" });
    expect(semEndereco).toMatchObject({ endereco: "", local_id: null, local_nome: "" });
    expect((await linkDaAna("   ")).id).toBe(semEndereco.id);
  });

  it("ajusta, troca e desativa um link sem mexer nos outros", async () => {
    const stand = await linkDaAna(ENDERECO, STAND);
    const outro = await linkDaAna("Rua Tuiuti, 2000 - Tatuapé, São Paulo");

    // Ajustar mantém o slug (o link já divulgado não muda).
    await comoUsuario(c, ana.id);
    const ajustado = (
      await c.query(
        `SELECT public.atualizar_agendamento_link($1, '  Rua Nova,   10 ', NULL, '', '08:00', '12:00', '{6,1,1}', 90) AS l`,
        [stand.id],
      )
    ).rows[0].l as Link;
    expect(ajustado.slug).toBe(stand.slug);
    expect(ajustado).toMatchObject({
      endereco: "Rua Nova, 10",
      local_id: null,
      dias_semana: [1, 6],
      duracao_minutos: 90,
    });

    // Levar para o endereço de outro link ativo é recusado.
    expect(
      await errCode(
        c.query(
          `SELECT public.atualizar_agendamento_link($1, 'rua tuiuti, 2000 - tatuapé, são paulo', NULL, '', '08:00', '12:00', '{1}', 60)`,
          [stand.id],
        ),
      ),
    ).toBe("23505");

    // Trocar: o antigo para de abrir na hora; endereço e local vêm junto.
    await comoUsuario(c, ana.id);
    const novo = (await c.query(`SELECT public.trocar_agendamento_link($1) AS l`, [stand.id]))
      .rows[0].l as Link;
    expect(novo.slug).not.toBe(stand.slug);
    expect(novo.endereco).toBe("Rua Nova, 10");
    expect(await publico(stand.slug)).toBeNull();
    expect(await publico(novo.slug)).not.toBeNull();

    await comoUsuario(c, ana.id);
    expect(
      (await c.query(`SELECT public.desativar_agendamento_link($1) AS ok`, [novo.id])).rows[0].ok,
    ).toBe(true);
    expect((await linksDaAna()).map((l) => l.id)).toEqual([outro.id]);
    expect(await publico(novo.slug)).toBeNull();
    expect(await publico(outro.slug)).not.toBeNull();
  });

  it("não mexe no link de outro corretor", async () => {
    const stand = await linkDaAna(ENDERECO, STAND);
    await comoUsuario(c, bruno.id);
    expect(await errCode(c.query(`SELECT public.trocar_agendamento_link($1)`, [stand.id]))).toBe(
      "P0002",
    );
    expect(
      await errCode(
        c.query(
          `SELECT public.atualizar_agendamento_link($1, 'Rua X, 1', NULL, '', '08:00', '12:00', '{1}', 60)`,
          [stand.id],
        ),
      ),
    ).toBe("P0002");
    expect(
      (await c.query(`SELECT public.desativar_agendamento_link($1) AS ok`, [stand.id])).rows[0].ok,
    ).toBe(false);
    expect(await publico(stand.slug)).not.toBeNull();
  });

  it("configuração inválida e o teto de 20 links são recusados com 22023", async () => {
    await comoUsuario(c, ana.id);
    for (const [ini, fim, dias] of [
      ["18:00", "09:00", "{1}"],
      ["09:15", "18:00", "{1}"],
      ["09:00", "18:00", "{}"],
    ]) {
      expect(
        await errCode(
          c.query(`SELECT public.criar_agendamento_link('Rua A, 1', NULL, '', $1, $2, $3, 60)`, [
            ini,
            fim,
            dias,
          ]),
        ),
      ).toBe("22023");
    }
    for (let i = 1; i <= 20; i++) {
      await c.query(
        `SELECT public.criar_agendamento_link($1, NULL, '', '09:00', '18:00', '{1}', 60)`,
        [`Rua Teste, ${i}`],
      );
    }
    expect(
      await errCode(
        c.query(
          `SELECT public.criar_agendamento_link('Rua Teste, 21', NULL, '', '09:00', '18:00', '{1}', 60)`,
        ),
      ),
    ).toBe("22023");
    await comoSuperuser(c);
  });

  it("só corretor ativo tem link; anon e authenticated não tocam nas funções públicas", async () => {
    const gestor = await criarUsuario(c, { nome: "Gil Gestor", papel: "gestor" });
    await comoUsuario(c, gestor.id);
    expect(await errCode(c.query(`SELECT public.meus_agendamento_links()`))).toBe("42501");

    const link = await linkDaAna();
    await comoUsuario(c, ana.id);
    expect(
      await errCode(c.query(`SELECT public.obter_agendamento_link_publico($1)`, [link.slug])),
    ).toBe("42501");
    await c.query(`RESET ROLE`);
    await c.query(`SET ROLE anon`);
    expect(await errCode(c.query(`SELECT public.meus_agendamento_links()`))).toBe("42501");
    expect(
      await errCode(c.query(`SELECT public.consumir_agendamento_link_requisicao($1)`, [link.slug])),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT count(*) FROM public.agendamento_links`))).toBe("42501");
    await comoSuperuser(c);

    // Corretor bloqueado: o link dele para de abrir sem ninguém revogar.
    await c.query(`UPDATE public.profiles SET status_conta = 'bloqueada' WHERE id = $1`, [ana.id]);
    expect(await publico(link.slug)).toBeNull();
  });
});

describe("a página pública", () => {
  it("mostra só corretor, local, endereço e horários livres", async () => {
    const link = await linkDaAna(ENDERECO, STAND);
    const p = await publico(link.slug);
    expect(Object.keys(p!).sort()).toEqual([
      "corretor_nome",
      "disponibilidade",
      "duracao_minutos",
      "endereco",
      "local_nome",
    ]);
    expect(p!.corretor_nome).toBe("Ana Corretora");
    expect(p!.endereco).toBe(ENDERECO);
    expect(p!.local_nome).toBe(STAND.nome);
    expect(p!.disponibilidade.length).toBeGreaterThanOrEqual(30);
    expect(p!.disponibilidade[1].horarios).toContain("10:00");
  });

  it("o limite por minuto vale por link", async () => {
    const link = await linkDaAna();
    await comoServico(c);
    const r = await c.query(
      `SELECT public.consumir_agendamento_link_requisicao($1) AS s FROM generate_series(1, 121)`,
      [link.slug],
    );
    await comoSuperuser(c);
    const s = r.rows.map((x) => x.s as string);
    expect(s.slice(0, 120).every((v) => v === "allowed")).toBe(true);
    expect(s[120]).toBe("rate_limited");
  });
});

describe("agendar pelo link", () => {
  it("pessoa nova: lead do corretor em Agendado e a visita na agenda dele", async () => {
    const link = await linkDaAna();
    const quando = await horarioLivre(link.slug);
    const r = await agendar(link.slug, quando);
    expect(r.ok).toBe(true);
    expect(r.corretor_nome).toBe("Ana Corretora");
    expect(r.endereco).toBe(ENDERECO);
    expect(r.local_nome).toBeNull();
    // 10:00 em São Paulo é 13:00 UTC.
    expect(new Date(r.inicio!).toISOString()).toBe(`${quando.data}T${horaUtc(quando.horario)}`);

    const [lead] = await leadsDa(ana.id);
    expect(lead.org).toBe("agendamento_self_service");
    expect(lead.st).toBe("agendado");
    expect(lead.nome).toBe("Marina Souza Lima");
    expect(lead.telefone).toBe("(11) 98765-0000");
    expect(lead.email).toBe("marina@exemplo.com");
    expect(lead.cpf).toBe("529.982.247-25");
    expect(lead.consentimento_lgpd).toBe(true);
    expect(lead.cliente_id).toBeTruthy();
    // Saiu da cadência pelo compromisso marcado, como qualquer agendamento.
    expect(lead.cadencia_etapa).toBe("respondeu");

    const ag = (
      await c.query(`SELECT *, tipo::text AS t, status::text AS s FROM public.agendamentos`)
    ).rows;
    expect(ag).toHaveLength(1);
    expect(ag[0]).toMatchObject({
      lead_id: lead.id,
      corretor_id: ana.id,
      criado_por_id: ana.id,
      t: "visita",
      s: "agendado",
      local: ENDERECO,
    });
    expect(ag[0].id).toBe(r.agendamento_id);

    // A transição fica no histórico (Aguardando atendimento → Agendado).
    const tr = await c.query(
      `SELECT de_status::text AS de, para_status::text AS para FROM public.lead_status_transitions
        WHERE lead_id = $1`,
      [lead.id],
    );
    expect(tr.rows).toEqual([{ de: "aguardando_atendimento", para: "agendado" }]);

    // Produção do corretor: pontua, e a comissão não cai na esteira do robô.
    const pont = await c.query(
      `SELECT COALESCE(sum(agendamentos), 0)::int AS n FROM public.atividades_diarias
        WHERE corretor_id = $1`,
      [ana.id],
    );
    expect(pont.rows[0].n).toBe(1);
    const esteira = await c.query(`SELECT public.lead_esteira_comissao($1) AS e`, [lead.id]);
    expect(esteira.rows[0].e).not.toBe("marquinhos");

    // Corretor avisado (sino + celular) e com a confirmação D-1 na lista.
    const push = await c.query(`SELECT title FROM public.push_outbox WHERE user_id = $1`, [ana.id]);
    expect(push.rows.map((x) => x.title)).toContain("Visita agendada pelo seu link");
    const tarefas = await c.query(`SELECT titulo FROM public.tarefas WHERE lead_id = $1`, [
      lead.id,
    ]);
    expect(tarefas.rows.map((x) => x.titulo)).toContain(
      "Confirmar visita de Marina Souza Lima (D-1)",
    );

    // O horário saiu da página.
    const depois = await publico(link.slug);
    const dia = depois!.disponibilidade.find((d) => d.data === quando.data);
    expect(dia?.horarios ?? []).not.toContain(quando.horario);
  });

  it("os links do corretor dividem a mesma agenda", async () => {
    const stand = await linkDaAna(ENDERECO, STAND);
    const outro = await linkDaAna("Rua Tuiuti, 2000 - Tatuapé, São Paulo");
    const quando = await horarioLivre(stand.slug);
    expect((await agendar(stand.slug, quando)).ok).toBe(true);

    // Ninguém está em dois stands ao mesmo tempo: o horário some do outro link.
    const dia = (await publico(outro.slug))!.disponibilidade.find((d) => d.data === quando.data);
    expect(dia?.horarios ?? []).not.toContain(quando.horario);
    const r = await agendar(outro.slug, quando, {
      telefone: "11912340000",
      cpf: "111.444.777-35",
    });
    expect(r).toEqual({ ok: false, motivo: "horario_indisponivel" });
  });

  it("reenvio com a mesma chave devolve a mesma visita, sem duplicar", async () => {
    const link = await linkDaAna();
    const quando = await horarioLivre(link.slug);
    const idem = randomUUID();
    const a = await agendar(link.slug, quando, { idem });
    const b = await agendar(link.slug, quando, { idem });
    expect(b.ok).toBe(true);
    expect(b.agendamento_id).toBe(a.agendamento_id);
    expect((await c.query(`SELECT count(*)::int AS n FROM public.agendamentos`)).rows[0].n).toBe(1);
    expect((await leadsDa(ana.id)).length).toBe(1);
  });

  it("horário ocupado e horário fora da grade são recusados", async () => {
    const link = await linkDaAna();
    const quando = await horarioLivre(link.slug);
    expect((await agendar(link.slug, quando)).ok).toBe(true);
    const outro = await agendar(link.slug, quando, {
      telefone: "11912340000",
      cpf: "111.444.777-35",
    });
    expect(outro).toEqual({ ok: false, motivo: "horario_indisponivel" });
    const torto = await agendar(
      link.slug,
      { data: quando.data, horario: "03:15" },
      { telefone: "11912340000", cpf: "111.444.777-35" },
    );
    expect(torto).toEqual({ ok: false, motivo: "horario_invalido" });
  });

  it("registro do próprio corretor: reaproveita e não sobrescreve a ficha", async () => {
    const link = await linkDaAna();
    const id = await criarLead(c, {
      nome: "Marina S.",
      telefone: "(11) 98765-0000",
      corretorId: ana.id,
      status: "em_atendimento",
    });
    const r = await agendar(link.slug, await horarioLivre(link.slug));
    expect(r.ok).toBe(true);

    const leads = await leadsDa(ana.id);
    expect(leads).toHaveLength(1);
    expect(leads[0].id).toBe(id);
    expect(leads[0].nome).toBe("Marina S.");
    // Campo vazio é completado; o que diverge vai para a visita.
    expect(leads[0].email).toBe("marina@exemplo.com");
    expect(leads[0].st).toBe("agendado");
    const ag = await c.query(`SELECT descricao FROM public.agendamentos WHERE lead_id = $1`, [id]);
    expect(ag.rows[0].descricao).toContain("Nome informado: Marina Souza Lima");
  });

  it("telefone fixo de 10 dígitos acha o registro existente (chave normalizada)", async () => {
    const link = await linkDaAna();
    const id = await criarLead(c, {
      nome: "Escritório Cliente",
      telefone: "(11) 3265-4321",
      corretorId: ana.id,
      status: "aguardando_atendimento",
    });
    const r = await agendar(link.slug, await horarioLivre(link.slug), {
      telefone: "1132654321",
    });
    expect(r.ok).toBe(true);
    const leads = await leadsDa(ana.id);
    expect(leads.map((l) => l.id)).toEqual([id]);
  });

  it("cliente de outro corretor: nasce o registro filho deste corretor", async () => {
    const link = await linkDaAna();
    const doBruno = await criarLead(c, {
      nome: "Marina Souza",
      telefone: "11987650000",
      corretorId: bruno.id,
      status: "aguardando_atendimento",
    });
    // A região do Bruno não importa para a Ana: o link é captação própria.
    await c.query(
      `UPDATE public.leads SET zona = 'Norte', renda_informada = 'R$ 4.000'
                    WHERE id = $1`,
      [doBruno],
    );

    const r = await agendar(link.slug, await horarioLivre(link.slug));
    expect(r.ok).toBe(true);

    const [filho] = await leadsDa(ana.id);
    expect(filho.registro_adicional).toBe(true);
    expect(filho.st).toBe("agendado");
    // Herdou da mãe (renda) e o formulário completou o que faltava (CPF).
    expect(filho.renda_informada).toBe("R$ 4.000");
    expect(filho.cpf).toBe("529.982.247-25");
    const bru = await leadsDa(bruno.id);
    expect(bru[0].st).toBe("aguardando_atendimento");
    expect(bru[0].cliente_id).toBe(filho.cliente_id);
  });

  it("outro corretor já em Visita realizada: recusa sem criar nada", async () => {
    const link = await linkDaAna();
    await criarLead(c, {
      nome: "Marina Souza",
      telefone: "11987650000",
      corretorId: bruno.id,
      status: "visita_realizada",
    });
    const r = await agendar(link.slug, await horarioLivre(link.slug));
    expect(r).toEqual({ ok: false, motivo: "nao_permitido" });
    expect(await leadsDa(ana.id)).toHaveLength(0);
    expect((await c.query(`SELECT count(*)::int AS n FROM public.agendamentos`)).rows[0].n).toBe(0);
  });

  it("endereço: o do corretor manda; sem ele, o do cliente é obrigatório", async () => {
    const link = await linkDaAna("");
    const quando = await horarioLivre(link.slug);
    expect(await agendar(link.slug, quando)).toEqual({
      ok: false,
      motivo: "endereco_obrigatorio",
    });
    const r = await agendar(link.slug, quando, { endereco: "Rua do Cliente, 45" });
    expect(r.ok).toBe(true);
    expect(r.endereco).toBe("Rua do Cliente, 45");

    const comEndereco = await linkDaAna(ENDERECO);
    const r2 = await agendar(comEndereco.slug, await horarioLivre(comEndereco.slug, 2), {
      telefone: "11912340000",
      cpf: "111.444.777-35",
      endereco: "Outro lugar",
    });
    expect(r2.endereco).toBe(ENDERECO);
  });

  it("entrada inválida, link revogado e teto de envios", async () => {
    const link = await linkDaAna();
    const quando = await horarioLivre(link.slug);
    expect(await agendar(link.slug, quando, { cpf: "123.456.789-00" })).toEqual({
      ok: false,
      motivo: "invalid_input",
    });
    expect(await agendar(link.slug, quando, { nome: "Marina" })).toEqual({
      ok: false,
      motivo: "invalid_input",
    });

    // 10 envios na última hora seguram o 11º.
    await c.query(
      `INSERT INTO public.agendamento_link_envios (link_id, idempotency_key, comprovante_hash)
       SELECT $1, gen_random_uuid(), encode(sha256(gen_random_uuid()::text::bytea), 'hex')
         FROM generate_series(1, 10)`,
      [link.id],
    );
    expect(await agendar(link.slug, quando)).toEqual({ ok: false, motivo: "limite_link" });

    await comoUsuario(c, ana.id);
    await c.query(`SELECT public.desativar_agendamento_link($1)`, [link.id]);
    expect(await agendar(link.slug, quando)).toEqual({ ok: false, motivo: "not_found" });
  });

  it("comprovante: o hash devolve a visita (com o local) até ela ser cancelada", async () => {
    const link = await linkDaAna(ENDERECO, STAND);
    const token = randomBytes(32).toString("base64url");
    const r = await agendar(link.slug, await horarioLivre(link.slug), { comprovante: token });

    await comoServico(c);
    const ok = await c.query(`SELECT public.obter_agendamento_comprovante($1) AS p`, [
      hashDe(token),
    ]);
    expect(ok.rows[0].p.agendamento_id).toBe(r.agendamento_id);
    expect(ok.rows[0].p.local_nome).toBe(STAND.nome);
    await comoSuperuser(c);

    await c.query(`UPDATE public.agendamentos SET status = 'cancelado' WHERE id = $1`, [
      r.agendamento_id,
    ]);
    await comoServico(c);
    const cancelado = await c.query(`SELECT public.obter_agendamento_comprovante($1) AS p`, [
      hashDe(token),
    ]);
    await comoSuperuser(c);
    expect(cancelado.rows[0].p).toBeNull();
  });
});

/** "10:00" em São Paulo (UTC-3) → "13:00:00.000Z". */
function horaUtc(horario: string): string {
  const [h, m] = horario.split(":").map(Number);
  const total = (h + 3) * 60 + m;
  if (total >= 24 * 60) throw new Error("use um horário que não vira o dia em UTC");
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00.000Z`;
}
