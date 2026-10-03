/**
 * REGRA DOS 65 EM "EM ATENDIMENTO" — Fatia 1, modo sombra
 * (migration 20261009120600, desenho em docs/ops/em-atendimento-teto-65.md).
 *
 * Decisões do dono (03/10/2026) que esta suíte trava, na ordem em que
 * quebrariam a operação se a regra errasse:
 *
 *  1. NADA SE MOVE. Esta fatia só calcula. Um snapshot dos leads antes e
 *     depois de todas as leituras tem de ser idêntico.
 *  2. O 65 é o STATUS `em_atendimento`. Disputa a vaga só quem teve toque nos
 *     últimos 5 dias e não está em cadência; a ordem é passo com data futura >
 *     cliente escreveu em 7 dias > quente > toque mais recente > origem paga.
 *  3. 5 dias sem toque em Em atendimento PERDE A VAGA (vai para a Minha base),
 *     mesmo com passo marcado — o corretor perde a vaga antes de perder o
 *     cliente.
 *  4. Na Minha base, 5 dias sem toque SAI do corretor, com destino pela origem:
 *     pago -> roleta, estoque -> Bolsão, próprio -> fica, com alerta ao gestor.
 *  5. Retorno combinado é protegido até a data + 2 dias; depois, sem toque
 *     desde a data, sai. Data além de 30 dias -> reativação.
 *  6. Qualificação Corretor tem 1 dia para virar atendimento.
 *  7. Fundo do funil nunca sai por robô: só escala para o gestor (3/5/10 dias).
 *  8. Contas sem papel de corretor (SDR, admin) ficam fora; corretor só vê a si.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  errCode,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let admin: UsuarioTeste;
let corretor: UsuarioTeste;

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
  admin = await criarUsuario(c, { nome: "Admin 65", papel: "admin" });
  corretor = await criarUsuario(c, { nome: "Corretor 65", papel: "corretor" });
});

type Opts = {
  status?: string;
  origem?: string;
  /** Horas desde o último toque (o relógio da casa). */
  horasSemToque?: number;
  temperatura?: string | null;
  corretorId?: string;
  /** Mantém a etapa de cadência que o gatilho de atribuição pôs (D0). */
  emCadencia?: boolean;
  /** Horas desde a criação (fallback de "entrou em Qualificação Corretor"). */
  criadoHaHoras?: number;
  /** Tarefas pendentes, em horas a partir de agora (negativo = vencida). */
  tarefasEmHoras?: number[];
};

/**
 * Lead com o relógio controlado. O gatilho de atribuição põe todo lead novo
 * com dono em D0; aqui ele sai da cadência a menos que o teste peça, senão
 * todo "em atendimento" do fixture seria uma porta de cadência e a suíte
 * deixaria de medir a disputa das vagas.
 *
 * As tarefas vêm ANTES do relógio: criar tarefa (e interação) mexe nas
 * colunas de movimento, e o teste precisa do relógio exato que pediu.
 */
async function lead(opts: Opts = {}): Promise<string> {
  const id = await criarLead(c, {
    corretorId: opts.corretorId ?? corretor.id,
    status: opts.status ?? "em_atendimento",
    origem: opts.origem ?? "outro",
  });
  await comoSuperuser(c);
  for (const h of opts.tarefasEmHoras ?? []) {
    await c.query(
      `INSERT INTO public.tarefas
         (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento, origem_automatica)
       VALUES ($1, $2, 'Retornar', 'follow_up', 'pendente', 'media',
               now() + make_interval(hours => $3::int), false)`,
      [id, opts.corretorId ?? corretor.id, h],
    );
  }
  const horas = opts.horasSemToque ?? 1;
  // O toque é CONTATO real (ultimo_contato). `ultima_interacao` fica sempre em
  // "agora", como se o motor tivesse acabado de gravar uma mudança de status:
  // todo teste de lead parado só passa se a regra ignorar o relógio da casa.
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa   = CASE WHEN $2 THEN cadencia_etapa ELSE NULL END,
            ultimo_contato   = now() - make_interval(hours => $3::int),
            ultima_interacao = now(),
            temperatura      = $4::public.lead_temperatura,
            created_at       = now() - make_interval(hours => GREATEST($3::int, COALESCE($5::int, 0)))
      WHERE id = $1`,
    [id, opts.emCadencia ?? false, horas, opts.temperatura ?? null, opts.criadoHaHoras ?? null],
  );
  return id;
}

type Linha = {
  lead_id: string;
  camada: string;
  grupo: string;
  posicao: number | null;
  acao: string;
  destino: string | null;
  motivo: string | null;
  dias_sem_toque: number;
};

async function classificar(corretorId = corretor.id): Promise<Map<string, Linha>> {
  await comoUsuario(c, admin.id);
  const r = await c.query(`SELECT * FROM public.em_atendimento_sombra_leads_v1($1)`, [corretorId]);
  await comoSuperuser(c);
  return new Map((r.rows as Linha[]).map((l) => [l.lead_id, l]));
}

async function resumo(comoQuem = admin.id) {
  await comoUsuario(c, comoQuem);
  const r = await c.query(`SELECT * FROM public.em_atendimento_sombra_v1()`);
  await comoSuperuser(c);
  return r.rows as Array<Record<string, unknown> & { corretor_id: string }>;
}

// ---------------------------------------------------------------------------
// 1. A disputa das 65 vagas
// ---------------------------------------------------------------------------

describe("os 65 são o status Em atendimento", () => {
  it("70 em atendimento com toque recente: 65 ficam, 5 vão para a Minha base", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 70; i++) ids.push(await lead({ horasSemToque: 1 + i }));

    const cl = await classificar();
    const fica = [...cl.values()].filter((l) => l.acao === "fica");
    const excedente = [...cl.values()].filter((l) => l.acao === "excedente");
    expect(fica).toHaveLength(65);
    expect(excedente).toHaveLength(5);
    // Sem outro critério, ganha o toque mais recente: os 5 de fora são os 5
    // tocados há mais tempo.
    expect(new Set(excedente.map((l) => l.lead_id))).toEqual(new Set(ids.slice(65)));
    expect(excedente.every((l) => l.destino === "minha_base")).toBe(true);
    expect(excedente[0].motivo).toMatch(/acima do teto de 65/);

    const linha = (await resumo()).find((r) => r.corretor_id === corretor.id)!;
    expect(linha).toMatchObject({ em_atendimento: 70, ficam: 65, excedente: 5, perde_vaga: 0 });
  });

  it("a ordem da disputa é a do dono: passo futuro > escreveu > quente > toque recente > pago", async () => {
    // Do último para o primeiro critério, cada lead perde para o de cima
    // mesmo tendo o toque MAIS recente — prova que o critério de cima manda.
    const pago = await lead({ horasSemToque: 90, origem: "facebook" });
    const recente = await lead({ horasSemToque: 2 });
    const quente = await lead({ horasSemToque: 80, temperatura: "quente" });
    const escreveu = await lead({ horasSemToque: 70 });
    const comPasso = await lead({ horasSemToque: 100, tarefasEmHoras: [48] });

    // "Escreveu": mensagem do cliente há 3 dias. Ela mexe no relógio, então
    // o relógio é reposto depois para isolar o critério.
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.interacoes (lead_id, tipo, direcao, conteudo, ocorreu_em)
       VALUES ($1, 'whatsapp', 'entrada', 'oi, ainda tenho interesse', now() - interval '3 days')`,
      [escreveu],
    );
    await c.query(
      `UPDATE public.leads SET ultimo_contato = now() - interval '70 hours' WHERE id = $1`,
      [escreveu],
    );

    const cl = await classificar();
    expect(cl.get(comPasso)!.posicao).toBe(1);
    expect(cl.get(escreveu)!.posicao).toBe(2);
    expect(cl.get(quente)!.posicao).toBe(3);
    expect(cl.get(recente)!.posicao).toBe(4);
    expect(cl.get(pago)!.posicao).toBe(5);
  });

  it("origem paga só desempata: com o mesmo toque, o pago vence", async () => {
    const outro = await lead({ horasSemToque: 10, origem: "importacao" });
    const pago = await lead({ horasSemToque: 10, origem: "chatbot" });
    const cl = await classificar();
    expect(cl.get(pago)!.posicao).toBeLessThan(cl.get(outro)!.posicao!);
  });
});

// ---------------------------------------------------------------------------
// 2. O relógio de 5 dias em Em atendimento
// ---------------------------------------------------------------------------

describe("Em atendimento com 5 dias sem toque perde a vaga", () => {
  it("5 dias completos perde; 4 dias e 23 h fica", async () => {
    const parado = await lead({ horasSemToque: 5 * 24 + 1 });
    const quase = await lead({ horasSemToque: 5 * 24 - 1 });
    const cl = await classificar();
    expect(cl.get(parado)).toMatchObject({
      acao: "perde_vaga",
      destino: "minha_base",
      posicao: null,
      dias_sem_toque: 5,
    });
    expect(cl.get(quase)).toMatchObject({ acao: "fica", posicao: 1 });
  });

  it("registro automático não é toque; contato real é", async () => {
    const soMotor = await lead({ horasSemToque: 8 * 24 });
    const comLigacao = await lead({ horasSemToque: 8 * 24 });
    const nunca = await lead({ horasSemToque: 8 * 24 });
    await comoSuperuser(c);
    // O motor muda o status e anota, sem autor: não é contato com o cliente.
    await c.query(
      `INSERT INTO public.interacoes (lead_id, tipo, direcao, conteudo, ocorreu_em)
       VALUES ($1, 'mudanca_status', 'interna', 'redistribuído', now() - interval '1 hour'),
              ($1, 'nota', 'interna', 'nota do sistema', now() - interval '1 hour')`,
      [soMotor],
    );
    // Ligação feita pelo corretor (tabela de telefonia) é contato.
    await c.query(
      `INSERT INTO public.chamadas (lead_id, corretor_id, direcao, status, numero, criado_em)
       VALUES ($1, $2, 'saida', 'atendida', '11999990000', now() - interval '1 hour')`,
      [comLigacao, corretor.id],
    );
    // Lead que nunca teve contato: o relógio corre desde a chegada.
    await c.query(
      `UPDATE public.leads SET ultimo_contato = NULL, created_at = now() - interval '9 days' WHERE id = $1`,
      [nunca],
    );

    const cl = await classificar();
    expect(cl.get(soMotor)!.acao).toBe("perde_vaga");
    expect(cl.get(comLigacao)!.acao).toBe("fica");
    expect(cl.get(nunca)).toMatchObject({ acao: "perde_vaga", dias_sem_toque: 9 });
  });

  it("passo marcado não protege a vaga: sem toque em 5 dias, perde do mesmo jeito", async () => {
    const id = await lead({ horasSemToque: 6 * 24, tarefasEmHoras: [72] });
    expect((await classificar()).get(id)!.acao).toBe("perde_vaga");
  });

  it("quem perdeu a vaga não ocupa posição: a vaga vai para o próximo", async () => {
    for (let i = 0; i < 65; i++) await lead({ horasSemToque: 1 + i });
    // Com passo marcado, o parado seria o 1º da disputa — se disputasse,
    // empurraria um dos 65 com toque recente para fora.
    const parado = await lead({ horasSemToque: 10 * 24, tarefasEmHoras: [72] });
    const cl = await classificar();
    expect([...cl.values()].filter((l) => l.acao === "fica")).toHaveLength(65);
    expect(cl.get(parado)!.acao).toBe("perde_vaga");
    expect([...cl.values()].some((l) => l.acao === "excedente")).toBe(false);
  });

  it("em atendimento em cadência sem resposta é porta, não conversa: não disputa vaga", async () => {
    const id = await lead({ emCadencia: true, horasSemToque: 1 });
    expect((await classificar()).get(id)).toMatchObject({
      acao: "porta_cadencia",
      destino: "aguardando_atendimento",
      posicao: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Minha base: o relógio de 5 dias com destino pela origem
// ---------------------------------------------------------------------------

describe("Minha base: 5 dias sem toque sai do corretor", () => {
  it("Portal é pago nesta regra: volta à roleta, não ao Bolsão", async () => {
    const portal = await lead({
      status: "aguardando_atendimento",
      origem: "portal",
      horasSemToque: 6 * 24,
    });
    expect((await classificar()).get(portal)).toMatchObject({
      grupo: "pago",
      acao: "sem_toque",
      destino: "roleta",
    });
  });

  it("estoque vai para o Bolsão, pago para a roleta, próprio fica com alerta", async () => {
    const h = 6 * 24;
    const estoque = await lead({
      status: "aguardando_atendimento",
      origem: "importacao",
      horasSemToque: h,
    });
    const pago = await lead({
      status: "aguardando_atendimento",
      origem: "facebook",
      horasSemToque: h,
    });
    const proprio = await lead({
      status: "aguardando_atendimento",
      origem: "indicacao",
      horasSemToque: h,
    });
    const vivo = await lead({
      status: "aguardando_atendimento",
      origem: "importacao",
      horasSemToque: 4 * 24,
    });

    const cl = await classificar();
    expect(cl.get(estoque)).toMatchObject({
      camada: "base",
      grupo: "estoque",
      acao: "sem_toque",
      destino: "bolsao",
    });
    expect(cl.get(pago)).toMatchObject({ grupo: "pago", acao: "sem_toque", destino: "roleta" });
    expect(cl.get(proprio)).toMatchObject({
      grupo: "proprio",
      acao: "sem_toque",
      destino: "fica_alerta_gestor",
    });
    expect(cl.get(vivo)).toMatchObject({ acao: "base_ok", destino: null });
  });

  it("lead na cadência segue a regra da cadência, não o relógio", async () => {
    const id = await lead({
      status: "aguardando_atendimento",
      emCadencia: true,
      horasSemToque: 10 * 24,
    });
    expect((await classificar()).get(id)).toMatchObject({ acao: "cadencia", destino: null });
  });
});

describe("retorno combinado", () => {
  it("protegido até a data, mesmo sem toque há 20 dias", async () => {
    const id = await lead({
      status: "aguardando_retorno",
      horasSemToque: 20 * 24,
      tarefasEmHoras: [10 * 24],
    });
    expect((await classificar()).get(id)).toMatchObject({
      acao: "retorno_protegido",
      destino: null,
    });
  });

  it("dentro da tolerância de 2 dias depois da data, ainda protegido", async () => {
    const id = await lead({
      status: "aguardando_retorno",
      horasSemToque: 10 * 24,
      tarefasEmHoras: [-24],
    });
    expect((await classificar()).get(id)!.acao).toBe("retorno_protegido");
  });

  it("data + 2 dias e ninguém ligou desde a data: sai pela origem", async () => {
    const id = await lead({
      status: "aguardando_retorno",
      origem: "facebook",
      horasSemToque: 4 * 24,
      tarefasEmHoras: [-3 * 24],
    });
    expect((await classificar()).get(id)).toMatchObject({
      acao: "retorno_vencido",
      destino: "roleta",
    });
  });

  it("ligou depois da data: volta ao relógio normal de 5 dias", async () => {
    const id = await lead({
      status: "aguardando_retorno",
      horasSemToque: 24,
      tarefasEmHoras: [-3 * 24],
    });
    expect((await classificar()).get(id)!.acao).toBe("base_ok");
  });

  it("data além de 30 dias vai para a reativação; a do lead próprio, não", async () => {
    const longe = await lead({
      status: "aguardando_retorno",
      horasSemToque: 24,
      tarefasEmHoras: [40 * 24],
    });
    const proprio = await lead({
      status: "aguardando_retorno",
      origem: "captacao_corretor",
      horasSemToque: 24,
      tarefasEmHoras: [40 * 24],
    });
    const cl = await classificar();
    expect(cl.get(longe)).toMatchObject({ acao: "retorno_acima_maximo", destino: "reativacao" });
    expect(cl.get(proprio)).toMatchObject({
      acao: "retorno_acima_maximo",
      destino: "fica_alerta_gestor",
    });
  });
});

describe("Qualificação Corretor tem 1 dia para virar atendimento", () => {
  it("entregue há 25 h vence; há 2 h não", async () => {
    const vencido = await lead({
      status: "qualificacao_corretor",
      origem: "chatbot",
      criadoHaHoras: 25,
    });
    const novo = await lead({
      status: "qualificacao_corretor",
      origem: "chatbot",
      criadoHaHoras: 2,
    });
    const cl = await classificar();
    expect(cl.get(vencido)).toMatchObject({ acao: "qualificacao_vencida", destino: "roleta" });
    expect(cl.get(novo)!.acao).toBe("base_ok");
  });
});

// ---------------------------------------------------------------------------
// 4. Fundo do funil: fora do teto, nunca sai, escala para o gestor
// ---------------------------------------------------------------------------

describe("fundo do funil", () => {
  it("3, 5 e 10 dias parado sobem a escada; nenhum sai do corretor", async () => {
    const topo = await lead({ status: "agendado", horasSemToque: 3 * 24 + 1 });
    const gestor = await lead({ status: "visita_realizada", horasSemToque: 5 * 24 + 1 });
    const desfecho = await lead({ status: "analise_credito", horasSemToque: 40 * 24 });
    const ok = await lead({ status: "agendado", horasSemToque: 24 });

    const cl = await classificar();
    expect(cl.get(topo)).toMatchObject({ camada: "fundo", acao: "fundo_topo", destino: null });
    expect(cl.get(gestor)).toMatchObject({ acao: "fundo_gestor", destino: "gestor" });
    expect(cl.get(desfecho)).toMatchObject({ acao: "fundo_desfecho", destino: "gestor" });
    expect(cl.get(ok)!.acao).toBe("fundo_ok");
    for (const l of cl.values())
      expect(["roleta", "bolsao", "reativacao"]).not.toContain(l.destino);
  });

  it("o fundo não ocupa vaga dos 65", async () => {
    for (let i = 0; i < 65; i++) await lead({ horasSemToque: 1 + i });
    await lead({ status: "analise_credito", horasSemToque: 1 });
    const cl = await classificar();
    expect([...cl.values()].filter((l) => l.acao === "fica")).toHaveLength(65);
    expect([...cl.values()].some((l) => l.acao === "excedente")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. A linha do gestor e a trava da roleta
// ---------------------------------------------------------------------------

describe("resumo por corretor", () => {
  it("trava a roleta com 60 em atendimento e soma o que desce dos 65 na Minha base", async () => {
    for (let i = 0; i < 60; i++) await lead({ horasSemToque: 1 + i });
    await lead({ horasSemToque: 8 * 24 }); // perde a vaga, desce para a base
    await lead({ status: "aguardando_atendimento", origem: "importacao", horasSemToque: 6 * 24 }); // sai
    await lead({ status: "aguardando_atendimento", horasSemToque: 24 }); // fica

    const linha = (await resumo()).find((r) => r.corretor_id === corretor.id)!;
    expect(linha).toMatchObject({
      teto: 65,
      trava_roleta: 60,
      em_atendimento: 61,
      ficam: 60,
      perde_vaga: 1,
      base: 2,
      sai_bolsao: 1,
      base_depois: 2,
      recebe_lead: false,
    });
    expect(linha.trava).toBe("em atendimento em 60 (trava em 60)");
  });

  it("59 em atendimento ainda recebe", async () => {
    for (let i = 0; i < 59; i++) await lead({ horasSemToque: 1 + i });
    const linha = (await resumo()).find((r) => r.corretor_id === corretor.id)!;
    expect(linha).toMatchObject({ ficam: 59, recebe_lead: true, trava: null });
  });

  it("contas sem papel de corretor ficam fora do resumo", async () => {
    const sdr = await criarUsuario(c, { papel: "sdr" });
    await lead({ corretorId: sdr.id });
    const ids = (await resumo()).map((r) => r.corretor_id);
    expect(ids).toContain(corretor.id);
    expect(ids).not.toContain(sdr.id);
    expect(ids).not.toContain(admin.id);
  });
});

// ---------------------------------------------------------------------------
// 6. Acesso
// ---------------------------------------------------------------------------

describe("quem vê o quê", () => {
  it("corretor vê o próprio detalhe, não o de outro, e não vê o resumo da casa", async () => {
    const outro = await criarUsuario(c, { papel: "corretor" });
    await lead();

    await comoUsuario(c, corretor.id);
    const meu = await c.query(`SELECT * FROM public.em_atendimento_sombra_leads_v1()`);
    expect(meu.rows).toHaveLength(1);
    expect(
      await errCode(c.query(`SELECT * FROM public.em_atendimento_sombra_leads_v1($1)`, [outro.id])),
    ).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.em_atendimento_sombra_v1()`))).toBe("42501");
    expect(await errCode(c.query(`SELECT * FROM public.em_atendimento_portas_v1()`))).toBe("42501");
    await comoSuperuser(c);
  });

  it("gestor vê só a própria equipe", async () => {
    const gestor = await criarUsuario(c, { papel: "gestor" });
    const equipe = await criarEquipe(c, { gestorId: gestor.id });
    const daEquipe = await criarUsuario(c, { papel: "corretor", equipeId: equipe });
    const ids = (await resumo(gestor.id)).map((r) => r.corretor_id);
    expect(ids).toEqual([daEquipe.id]);
  });

  it("a regra interna não é RPC pública", async () => {
    await comoUsuario(c, admin.id);
    expect(
      await errCode(
        c.query(`SELECT * FROM public._em_atendimento_classificar(ARRAY[$1::uuid])`, [corretor.id]),
      ),
    ).toBe("42501");
    await comoSuperuser(c);
  });
});

// ---------------------------------------------------------------------------
// 7. Fora das carteiras e a garantia da sombra
// ---------------------------------------------------------------------------

describe("portas", () => {
  it("conta em atendimento sem dono e com dono inativo", async () => {
    await lead({ corretorId: undefined }); // com o corretor ativo: não conta
    await criarLead(c, { corretorId: null, status: "em_atendimento" });
    const saiu = await criarUsuario(c, { papel: "corretor" });
    await lead({ corretorId: saiu.id });
    await comoSuperuser(c);
    await c.query(`UPDATE public.profiles SET ativo = false WHERE id = $1`, [saiu.id]);

    await comoUsuario(c, admin.id);
    const r = await c.query(`SELECT * FROM public.em_atendimento_portas_v1()`);
    await comoSuperuser(c);
    expect(r.rows[0]).toMatchObject({ em_atendimento_sem_dono: 1, em_atendimento_dono_inativo: 1 });
    // O índice único de telefone (leads_telefone_unico_ativo_uidx) impede dois
    // leads ativos do mesmo cliente, então o duplicado é sempre zero hoje; a
    // contagem fica como guarda caso o índice um dia seja relaxado.
    expect(r.rows[0].registros_encerrariam).toBe(0);
  });
});

describe("modo sombra", () => {
  it("nenhuma leitura altera lead algum", async () => {
    for (let i = 0; i < 67; i++) await lead({ horasSemToque: 1 + i });
    await lead({ horasSemToque: 9 * 24 });
    await lead({ status: "aguardando_atendimento", origem: "facebook", horasSemToque: 9 * 24 });
    await lead({ status: "qualificacao_corretor", origem: "chatbot", criadoHaHoras: 48 });

    const foto = async () =>
      (
        await c.query(
          `SELECT id, status::text, corretor_id, cadencia_etapa, updated_at
             FROM public.leads ORDER BY id`,
        )
      ).rows;
    await comoSuperuser(c);
    const antes = await foto();

    await classificar();
    await resumo();
    await comoUsuario(c, admin.id);
    await c.query(`SELECT * FROM public.em_atendimento_portas_v1()`);
    await comoSuperuser(c);

    expect(await foto()).toEqual(antes);
  });
});
