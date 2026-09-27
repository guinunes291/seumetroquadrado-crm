/**
 * MODO OBRIGATÓRIO (migration 20261002120000)
 *
 * O CRM trava o corretor até o processo do dia ser cumprido. O que está
 * testado aqui é a fonte da verdade da trava: QUAIS pendências entram, em QUE
 * ordem (lead novo sempre primeiro), QUANDO cada uma sai, e QUEM é travado.
 * A tela só obedece ao que modo_obrigatorio_v1 devolve.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarProjeto,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let corretor: UsuarioTeste;
let admin: UsuarioTeste;

type Item = {
  lead_id: string;
  tipo: string;
  grupo: number;
  etapa: string | null;
  atrasado: boolean | null;
  projeto_id: string | null;
  motivo: string;
  cadencia: Record<string, unknown> | null;
  lead: Record<string, unknown>;
};
type Modo = {
  aplica: boolean;
  travado: boolean;
  liberado_hoje: boolean;
  total: number;
  itens: Item[];
};

async function setModo(ativo: boolean, fundoDias = 5) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.gestao_config SET valor = $1::jsonb WHERE chave = 'modo_obrigatorio'`,
    [JSON.stringify({ ativo, fundo_parado_dias: fundoDias })],
  );
}

async function modo(userId = corretor.id): Promise<Modo> {
  await comoUsuario(c, userId);
  const r = await c.query(`SELECT public.modo_obrigatorio_v1() AS m`);
  await comoSuperuser(c);
  return r.rows[0].m as Modo;
}

const ids = (m: Modo) => m.itens.map((i) => i.lead_id);

/** Lead recém-chegado: o gatilho de atribuição o põe em D0 com prazo hoje. */
async function leadNovo(opts: { telefone?: string } = {}): Promise<string> {
  return criarLead(c, {
    status: "aguardando_atendimento",
    corretorId: corretor.id,
    telefone: opts.telefone,
  });
}

/** Move o lead no tempo da cadência: etapa, dias desde a chegada e do prazo. */
async function cadencia(id: string, etapa: string, prazoDiasAtras: number, chegouHaHoras = 0) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = $2,
            cadencia_prazo_ts = public.cadencia_fim_do_dia(now() - make_interval(days => $3::int), 0),
            cadencia_inicio_ts = now() - make_interval(hours => $4::int)
      WHERE id = $1`,
    [id, etapa, prazoDiasAtras, chegouHaHoras],
  );
}

/** Lead no fundo do funil, parado há N dias (movimento = ultima_interacao). */
async function fundo(status: string, diasParado: number): Promise<string> {
  const id = await criarLead(c, { status, corretorId: corretor.id });
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET ultima_interacao = now() - make_interval(days => $2::int),
            ultimo_contato = NULL,
            created_at = now() - make_interval(days => $2::int)
      WHERE id = $1`,
    [id, diasParado],
  );
  return id;
}

async function tarefaFutura(leadId: string) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento)
     VALUES ($1, $2, 'Retornar', 'follow_up', 'pendente', 'media', now() + interval '2 days')`,
    [leadId, corretor.id],
  );
}

async function fecharEtapa(leadId: string, etapa: string) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.cadencia_tentativas (lead_id, corretor_id, etapa, canal, resultado, ts, ciclo)
     VALUES ($1, $2, $3, 'ligacao', 'nao_atendeu', now() - interval '30 minutes', 1),
            ($1, $2, $3, 'ligacao', 'nao_atendeu', now() - interval '20 minutes', 1),
            ($1, $2, $3, 'whatsapp', 'enviada',    now() - interval '10 minutes', 1)`,
    [leadId, corretor.id, etapa],
  );
}

beforeAll(async () => {
  await c.connect();
});

afterAll(async () => {
  await setModo(false);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await comoSuperuser(c);
  await c.query(`TRUNCATE public.modo_obrigatorio_liberacoes`);
  await c.query(`UPDATE public.cadencia_config SET modo = 'sombra' WHERE id = 1`);
  await setModo(true);
  corretor = await criarUsuario(c, { papel: "corretor", nome: "Corretor Obrigado" });
  admin = await criarUsuario(c, { papel: "admin", nome: "Admin" });
});

describe("quem é travado", () => {
  it("modo desligado: nunca trava, mas a lista continua disponível", async () => {
    await leadNovo();
    await setModo(false);
    const m = await modo();
    expect(m.aplica).toBe(false);
    expect(m.travado).toBe(false);
    expect(m.total).toBe(1);
  });

  it("corretor com pendência é travado; sem pendência, não", async () => {
    expect((await modo()).travado).toBe(false);
    await leadNovo();
    const m = await modo();
    expect(m.aplica).toBe(true);
    expect(m.travado).toBe(true);
  });

  it("gestão e SDR nunca são travados, mesmo com lead na carteira", async () => {
    const gestorCorretor = await criarUsuario(c, { papel: "gestor", nome: "Gestor que vende" });
    await comoSuperuser(c);
    await c.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'corretor')`, [
      gestorCorretor.id,
    ]);
    await criarLead(c, { status: "aguardando_atendimento", corretorId: gestorCorretor.id });
    const m = await modo(gestorCorretor.id);
    expect(m.aplica).toBe(false);
    expect(m.travado).toBe(false);

    const sdr = await criarUsuario(c, { papel: "sdr" });
    expect((await modo(sdr.id)).aplica).toBe(false);
  });
});

describe("a ordem: lead novo sempre primeiro", () => {
  it("os 5 grupos na ordem do dono", async () => {
    const d1Hoje = await leadNovo();
    await cadencia(d1Hoje, "D1", 0, 30);
    const d2Hoje = await leadNovo();
    await cadencia(d2Hoje, "D2", 0, 50);
    const fundoAgendado = await fundo("agendado", 8);
    const fundoProposta = await fundo("proposta_enviada", 6);
    const d1Atrasado = await leadNovo();
    await cadencia(d1Atrasado, "D1", 3, 90);
    const d0AtrasadoVelho = await leadNovo();
    await cadencia(d0AtrasadoVelho, "D0", 4, 96);
    const d0AtrasadoRecente = await leadNovo();
    await cadencia(d0AtrasadoRecente, "D0", 2, 48);
    const d0HojeCedo = await leadNovo();
    await cadencia(d0HojeCedo, "D0", 0, 3);
    const d0HojeAgora = await leadNovo();
    await cadencia(d0HojeAgora, "D0", 0, 0);

    const m = await modo();
    expect(ids(m)).toEqual([
      d0HojeCedo, // 1. Lead chegou hoje, esperando há mais tempo
      d0HojeAgora,
      d0AtrasadoRecente, // 2. Lead chegou atrasado, o mais recente primeiro
      d0AtrasadoVelho,
      d1Atrasado, // 3. demais etapas atrasadas
      fundoProposta, // 4. fundo parado: proposta antes de agendado
      fundoAgendado,
      d1Hoje, // 5. etapas de hoje: 1º follow-up antes do 2º
      d2Hoje,
    ]);
    expect(m.itens.map((i) => i.grupo)).toEqual([1, 1, 2, 2, 3, 4, 4, 5, 5]);
  });

  it("lead que chega depois fura a fila de tudo que não é lead novo de hoje", async () => {
    const atrasado = await leadNovo();
    await cadencia(atrasado, "D1", 3, 90);
    const parado = await fundo("proposta_enviada", 10);
    expect(ids(await modo())).toEqual([atrasado, parado]);

    const chegou = await leadNovo();
    expect(ids(await modo())[0]).toBe(chegou);
  });
});

describe("quando cada pendência sai", () => {
  it("cadência: sai quando a etapa do dia fecha (mesmo com o motor em sombra)", async () => {
    const lead = await leadNovo();
    expect(ids(await modo())).toContain(lead);
    await fecharEtapa(lead, "D0");
    const m = await modo();
    expect(ids(m)).not.toContain(lead);
    expect(m.travado).toBe(false);
  });

  it("cadência que vence amanhã não entra", async () => {
    const lead = await leadNovo();
    await cadencia(lead, "D1", -1, 30);
    expect(ids(await modo())).not.toContain(lead);
  });

  it("telefone suspeito e opt-out ficam fora: nunca poderiam ser cumpridos", async () => {
    const suspeito = await leadNovo({ telefone: "11999999999" });
    const optOut = await leadNovo();
    await comoSuperuser(c);
    await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [optOut]);
    const m = await modo();
    expect(ids(m)).not.toContain(suspeito);
    expect(ids(m)).not.toContain(optOut);
  });

  it("fundo parado: entra por dias sem movimento ou por falta de passo, sai com contato + passo", async () => {
    // Movimentado ontem, mas sem próximo passo: entra por falta de passo.
    const semPasso = await fundo("visita_realizada", 1);
    // Parado há 8 dias com passo futuro: entra pelos dias.
    const paradoComPasso = await fundo("analise_credito", 8);
    await tarefaFutura(paradoComPasso);
    // Movimentado ontem e com passo: em dia, não entra.
    const emDia = await fundo("agendado", 1);
    await tarefaFutura(emDia);

    let m = await modo();
    expect(ids(m)).toEqual(expect.arrayContaining([semPasso, paradoComPasso]));
    expect(ids(m)).not.toContain(emDia);
    const item = m.itens.find((i) => i.lead_id === semPasso)!;
    expect(item.motivo).toBe("Sem próximo passo com data");

    // O corretor liga (a interação atualiza ultima_interacao) e marca o passo.
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo)
       VALUES ($1, $2, 'ligacao', 'saida', 'Falei com o cliente'),
              ($3, $2, 'ligacao', 'saida', 'Falei com o cliente')`,
      [semPasso, corretor.id, paradoComPasso],
    );
    await tarefaFutura(semPasso);

    m = await modo();
    expect(ids(m)).not.toContain(semPasso);
    expect(ids(m)).not.toContain(paradoComPasso);
  });

  it("o limiar de dias do fundo parado sai da configuração", async () => {
    const lead = await fundo("proposta_enviada", 3);
    await tarefaFutura(lead);
    expect(ids(await modo())).not.toContain(lead);
    await setModo(true, 2);
    expect(ids(await modo())).toContain(lead);
  });

  it("o card de cadência traz o progresso e o projeto do lead", async () => {
    const proj = await criarProjeto(c, { nome: "Residencial Teste" });
    const lead = await criarLead(c, {
      status: "aguardando_atendimento",
      corretorId: corretor.id,
      projetoId: proj,
    });
    const item = (await modo()).itens.find((i) => i.lead_id === lead)!;
    expect(item.projeto_id).toBe(proj);
    expect(item.cadencia).toMatchObject({ etapa: "D0", projeto_id: proj, ligacoes_validas: 0 });
    expect(item.lead).toMatchObject({
      id: lead,
      projeto_id: proj,
      status: "aguardando_atendimento",
    });
  });
});

describe("liberação do gestor", () => {
  it("libera só hoje, exige motivo e só a gestão pode", async () => {
    await leadNovo();
    expect((await modo()).travado).toBe(true);

    // O próprio corretor não se libera.
    await comoUsuario(c, corretor.id);
    expect(
      await errCode(
        c.query(`SELECT public.modo_obrigatorio_liberar($1, 'quero sair')`, [corretor.id]),
      ),
    ).toBe("42501");

    // Sem motivo, recusado.
    await comoUsuario(c, admin.id);
    expect(
      await errCode(c.query(`SELECT public.modo_obrigatorio_liberar($1, ' ')`, [corretor.id])),
    ).toBe("22023");

    await c.query(`SELECT public.modo_obrigatorio_liberar($1, 'Plantão no estande o dia todo')`, [
      corretor.id,
    ]);
    const m = await modo();
    expect(m.liberado_hoje).toBe(true);
    expect(m.travado).toBe(false);
    expect(m.total).toBe(1); // a lista continua lá, só não trava

    // Ontem não vale para hoje.
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.modo_obrigatorio_liberacoes SET dia = dia - 1 WHERE corretor_id = $1`,
      [corretor.id],
    );
    expect((await modo()).travado).toBe(true);
  });
});

describe("visão da gestão", () => {
  it("conta as pendências por corretor, mesmo com o modo desligado (ensaio)", async () => {
    await leadNovo();
    const atrasado = await leadNovo();
    await cadencia(atrasado, "D1", 2, 60);
    await fundo("proposta_enviada", 9);
    await setModo(false);

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.modo_obrigatorio_equipe_v1()`);
    await comoSuperuser(c);
    const linha = r.rows.find((x) => x.corretor_id === corretor.id);
    expect(linha).toMatchObject({
      total: 3,
      cadencia: 2,
      lead_chegou: 1,
      fundo_parado: 1,
      atrasados: 1,
      liberado_hoje: false,
      modo_ativo: false,
    });
  });

  it("corretor não lê a visão da equipe", async () => {
    await comoUsuario(c, corretor.id);
    expect(await errCode(c.query(`SELECT * FROM public.modo_obrigatorio_equipe_v1()`))).not.toBe(
      null,
    );
  });
});
