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

type Link = { id: string; slug: string; endereco: string; dias_semana: number[] };

/** Link da Ana aberto o dia todo, todos os dias: sempre há horário livre. */
async function linkDaAna(endereco = ENDERECO): Promise<Link> {
  await comoUsuario(c, ana.id);
  const r = await c.query(
    `SELECT public.salvar_meu_agendamento_link($1, '00:00', '23:30', '{0,1,2,3,4,5,6}', 60) AS l`,
    [endereco],
  );
  await comoSuperuser(c);
  return r.rows[0].l as Link;
}

type Publico = {
  corretor_nome: string;
  endereco: string | null;
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

describe("o link é do corretor", () => {
  it("cria, ajusta, troca e desativa o próprio link", async () => {
    await comoUsuario(c, ana.id);
    expect((await c.query(`SELECT public.meu_agendamento_link() AS l`)).rows[0].l).toBeNull();

    const criado = await linkDaAna();
    expect(criado.slug).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(criado.endereco).toBe(ENDERECO);

    // Salvar de novo só ajusta: o slug (o link já divulgado) não muda.
    await comoUsuario(c, ana.id);
    const ajustado = (
      await c.query(
        `SELECT public.salvar_meu_agendamento_link('  Rua Nova,   10 ', '08:00', '12:00', '{6,1,1}', 90) AS l`,
      )
    ).rows[0].l;
    expect(ajustado.slug).toBe(criado.slug);
    expect(ajustado.endereco).toBe("Rua Nova, 10");
    expect(ajustado.dias_semana).toEqual([1, 6]);
    expect(ajustado.duracao_minutos).toBe(90);

    // Gerar novo: o antigo para de abrir na hora, a configuração vem junto.
    const novo = (await c.query(`SELECT public.gerar_novo_agendamento_link() AS l`)).rows[0].l;
    expect(novo.slug).not.toBe(criado.slug);
    expect(novo.endereco).toBe("Rua Nova, 10");
    expect(await publico(criado.slug)).toBeNull();
    expect(await publico(novo.slug)).not.toBeNull();

    await comoUsuario(c, ana.id);
    expect((await c.query(`SELECT public.desativar_meu_agendamento_link() AS ok`)).rows[0].ok).toBe(
      true,
    );
    expect((await c.query(`SELECT public.meu_agendamento_link() AS l`)).rows[0].l).toBeNull();
    expect(await publico(novo.slug)).toBeNull();
  });

  it("configuração inválida é recusada com 22023", async () => {
    await comoUsuario(c, ana.id);
    expect(
      await errCode(
        c.query(`SELECT public.salvar_meu_agendamento_link('', '18:00', '09:00', '{1}', 60)`),
      ),
    ).toBe("22023");
    expect(
      await errCode(
        c.query(`SELECT public.salvar_meu_agendamento_link('', '09:15', '18:00', '{1}', 60)`),
      ),
    ).toBe("22023");
    expect(
      await errCode(
        c.query(`SELECT public.salvar_meu_agendamento_link('', '09:00', '18:00', '{}', 60)`),
      ),
    ).toBe("22023");
  });

  it("só corretor ativo tem link; anon e authenticated não tocam nas funções públicas", async () => {
    const gestor = await criarUsuario(c, { nome: "Gil Gestor", papel: "gestor" });
    await comoUsuario(c, gestor.id);
    expect(await errCode(c.query(`SELECT public.meu_agendamento_link()`))).toBe("42501");

    const link = await linkDaAna();
    await comoUsuario(c, ana.id);
    expect(
      await errCode(c.query(`SELECT public.obter_agendamento_link_publico($1)`, [link.slug])),
    ).toBe("42501");
    await c.query(`RESET ROLE`);
    await c.query(`SET ROLE anon`);
    expect(await errCode(c.query(`SELECT public.meu_agendamento_link()`))).toBe("42501");
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
  it("mostra só nome do corretor, endereço e horários livres", async () => {
    const link = await linkDaAna();
    const p = await publico(link.slug);
    expect(Object.keys(p!).sort()).toEqual([
      "corretor_nome",
      "disponibilidade",
      "duracao_minutos",
      "endereco",
    ]);
    expect(p!.corretor_nome).toBe("Ana Corretora");
    expect(p!.endereco).toBe(ENDERECO);
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
    await c.query(`SELECT public.desativar_meu_agendamento_link()`);
    expect(await agendar(link.slug, quando)).toEqual({ ok: false, motivo: "not_found" });
  });

  it("comprovante: o hash devolve a visita até ela ser cancelada", async () => {
    const link = await linkDaAna();
    const token = randomBytes(32).toString("base64url");
    const r = await agendar(link.slug, await horarioLivre(link.slug), { comprovante: token });

    await comoServico(c);
    const ok = await c.query(`SELECT public.obter_agendamento_comprovante($1) AS p`, [
      hashDe(token),
    ]);
    expect(ok.rows[0].p.agendamento_id).toBe(r.agendamento_id);
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
