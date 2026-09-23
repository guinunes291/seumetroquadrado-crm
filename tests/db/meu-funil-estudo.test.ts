/**
 * MEU FUNIL — estudo diário do corretor (migration 20260927120000).
 *
 * Dados CONSTRUÍDOS. O que cada bloco protege:
 *  - base importada fora do funil real: é o que impede a "matemática da venda"
 *    de dizer ao corretor que ele precisa de 400 leads para 1 venda quando,
 *    no lead que chega quente, precisa de 30;
 *  - etapas cumulativas: quem chegou à pasta conta como quem agendou e visitou
 *    (senão "agendamentos por venda" sai abaixo de 1);
 *  - escopo: o corretor só vê o próprio funil — o time chega só agregado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let corretor: UsuarioTeste;
let outro: UsuarioTeste;

type LinhaOrigem = {
  origem: string;
  grupo: "real" | "base";
  recebidos: number;
  conversou: number;
  agendou: number;
  visitou: number;
  pasta: number;
  vendas: number;
  perdidos: number;
};

type Resultado = {
  dias: number;
  minhas: LinhaOrigem[];
  time: Array<Omit<LinhaOrigem, "origem"> & { corretores: number }>;
  mes: { vendas: number; meta_vendas: number | null };
};

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`TRUNCATE public.funil_estudo_diario`);
  await limparDados(c);
  await c.end();
});

beforeEach(async () => {
  await limparDados(c);
  await c.query(`TRUNCATE public.funil_estudo_diario`);
  corretor = await criarUsuario(c, { papel: "corretor" });
  outro = await criarUsuario(c, { papel: "corretor" });
});

async function lead(opts: {
  corretorId: string;
  origem: string;
  status?: string;
  diasAtras?: number;
  sdrEntregue?: boolean;
}): Promise<string> {
  const id = await criarLead(c, {
    corretorId: opts.corretorId,
    origem: opts.origem,
    status: "aguardando_atendimento",
  });
  await comoSuperuser(c);
  // Status final posto com os triggers desligados: as guardas de transição
  // (perdido exige motivo, fechado exige venda aprovada) têm testes próprios;
  // aqui o alvo é só a LEITURA do funil.
  await c.query(`SET session_replication_role = replica`);
  await c.query(
    `UPDATE public.leads
        SET status = $4::public.lead_status,
            data_distribuicao = now() - make_interval(days => $2::int),
            sdr_entregue_em = CASE WHEN $3::boolean THEN now() ELSE NULL END
      WHERE id = $1`,
    [id, opts.diasAtras ?? 1, opts.sdrEntregue ?? false, opts.status ?? "aguardando_atendimento"],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  return id;
}

async function transicao(leadId: string, corretorId: string, para: string) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status)
     VALUES ($1, $2, 'em_atendimento', $3::public.lead_status)`,
    [leadId, corretorId, para],
  );
}

async function venda(leadId: string, corretorId: string, opts: { distrato?: boolean } = {}) {
  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.vendas (lead_id, corretor_id, valor_venda, status_venda, data_assinatura, distrato)
     VALUES ($1, $2, 250000, 'pendente'::public.status_venda, current_date, $3)`,
    [leadId, corretorId, opts.distrato ?? false],
  );
}

async function estudo(dias = 90): Promise<Resultado> {
  await comoUsuario(c, corretor.id);
  const r = await c.query(`SELECT public.meu_funil_estudo($1) AS j`, [dias]);
  await comoSuperuser(c);
  return r.rows[0].j as Resultado;
}

function soma(linhas: LinhaOrigem[], grupo: "real" | "base") {
  return linhas
    .filter((l) => l.grupo === grupo)
    .reduce(
      (acc, l) => ({
        recebidos: acc.recebidos + l.recebidos,
        conversou: acc.conversou + l.conversou,
        agendou: acc.agendou + l.agendou,
        visitou: acc.visitou + l.visitou,
        pasta: acc.pasta + l.pasta,
        vendas: acc.vendas + l.vendas,
        perdidos: acc.perdidos + l.perdidos,
      }),
      { recebidos: 0, conversou: 0, agendou: 0, visitou: 0, pasta: 0, vendas: 0, perdidos: 0 },
    );
}

describe("meu_funil_estudo — base importada x funil real", () => {
  it("importação e Google Sheets vão para a base; SDR entregue volta ao funil real", async () => {
    await lead({ corretorId: corretor.id, origem: "facebook" });
    await lead({ corretorId: corretor.id, origem: "importacao" });
    await lead({ corretorId: corretor.id, origem: "importacao" });
    await lead({ corretorId: corretor.id, origem: "google_sheets" });
    await lead({ corretorId: corretor.id, origem: "importacao", sdrEntregue: true });

    const r = await estudo();
    expect(soma(r.minhas, "real").recebidos).toBe(2);
    expect(soma(r.minhas, "base").recebidos).toBe(3);
    // A linha do SDR entregue é 'importacao' no grupo real — a origem não muda,
    // só o grupo.
    expect(r.minhas.find((l) => l.origem === "importacao" && l.grupo === "real")?.recebidos).toBe(
      1,
    );
  });
});

describe("meu_funil_estudo — etapas cumulativas", () => {
  it("lead em pasta conta como conversou, agendou e visitou", async () => {
    await lead({ corretorId: corretor.id, origem: "facebook", status: "analise_credito" });
    const t = soma((await estudo()).minhas, "real");
    expect(t).toMatchObject({
      recebidos: 1,
      conversou: 1,
      agendou: 1,
      visitou: 1,
      pasta: 1,
      vendas: 0,
    });
  });

  it("perdido depois de visitar continua contando a visita (histórico) e entra em perdidos", async () => {
    const id = await lead({ corretorId: corretor.id, origem: "facebook", status: "perdido" });
    await transicao(id, corretor.id, "visita_realizada");
    const t = soma((await estudo()).minhas, "real");
    expect(t).toMatchObject({ visitou: 1, pasta: 0, perdidos: 1 });
  });

  it("cliente que respondeu (interação de entrada) conta como conversa, mesmo sem mover o card", async () => {
    const id = await lead({ corretorId: corretor.id, origem: "whatsapp" });
    await c.query(
      `INSERT INTO public.interacoes (lead_id, tipo, direcao, conteudo)
       VALUES ($1, 'whatsapp', 'entrada', 'oi, tenho interesse')`,
      [id],
    );
    const t = soma((await estudo()).minhas, "real");
    expect(t).toMatchObject({ recebidos: 1, conversou: 1, agendou: 0 });
  });

  it("visita realizada na agenda conta como visita; agendamento cancelado não conta", async () => {
    const visitou = await lead({
      corretorId: corretor.id,
      origem: "facebook",
      status: "em_atendimento",
    });
    const cancelou = await lead({
      corretorId: corretor.id,
      origem: "facebook",
      status: "em_atendimento",
    });
    await c.query(`SET session_replication_role = replica`);
    await c.query(
      `INSERT INTO public.agendamentos (lead_id, corretor_id, titulo, data_inicio, data_fim, status)
       VALUES ($1, $3, 'Visita', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'realizado'),
              ($2, $3, 'Visita', now() + interval '2 days', now() + interval '2 days 1 hour', 'cancelado')`,
      [visitou, cancelou, corretor.id],
    );
    await c.query(`SET session_replication_role = DEFAULT`);
    const t = soma((await estudo()).minhas, "real");
    expect(t).toMatchObject({ recebidos: 2, conversou: 2, agendou: 1, visitou: 1 });
  });

  it("venda vem da tabela vendas; distrato não conta mesmo com o card em contrato fechado", async () => {
    const vendeu = await lead({
      corretorId: corretor.id,
      origem: "facebook",
      status: "analise_credito",
    });
    await venda(vendeu, corretor.id);
    const distratou = await lead({
      corretorId: corretor.id,
      origem: "facebook",
      status: "contrato_fechado",
    });
    await venda(distratou, corretor.id, { distrato: true });
    const legado = await lead({
      corretorId: corretor.id,
      origem: "indicacao",
      status: "contrato_fechado",
    });
    expect(legado).toBeTruthy();

    const r = await estudo();
    const t = soma(r.minhas, "real");
    // vendeu (linha em vendas) + legado (card fechado sem venda registrada).
    expect(t.vendas).toBe(2);
    // O distratado ainda chegou à pasta — o histórico comercial não some.
    expect(t.pasta).toBe(3);
    // Vendas do mês: só a válida com data de assinatura no mês.
    expect(r.mes.vendas).toBe(1);
  });
});

describe("meu_funil_estudo — janela e escopo", () => {
  it("lead recebido fora da janela não entra", async () => {
    await lead({ corretorId: corretor.id, origem: "facebook", diasAtras: 5 });
    await lead({ corretorId: corretor.id, origem: "facebook", diasAtras: 120 });
    expect(soma((await estudo(90)).minhas, "real").recebidos).toBe(1);
    expect(soma((await estudo(180)).minhas, "real").recebidos).toBe(2);
  });

  it("o corretor só vê o próprio funil; o time vem agregado com os dois", async () => {
    await lead({ corretorId: corretor.id, origem: "facebook" });
    await lead({ corretorId: outro.id, origem: "facebook" });
    await lead({ corretorId: outro.id, origem: "facebook" });
    const r = await estudo();
    expect(soma(r.minhas, "real").recebidos).toBe(1);
    const timeReal = r.time.find((g) => g.grupo === "real");
    expect(timeReal).toMatchObject({ recebidos: 3, corretores: 2 });
  });

  it("devolve a meta mensal lançada pela gestão", async () => {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.metas (corretor_id, ano, mes, meta_vendas)
       VALUES ($1,
               EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int,
               EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int,
               4)`,
      [corretor.id],
    );
    expect((await estudo()).mes.meta_vendas).toBe(4);
  });

  it("sem sessão: recusa", async () => {
    await comoSuperuser(c);
    await expect(c.query(`SELECT public.meu_funil_estudo(90)`)).rejects.toThrow(/não autenticado/);
  });

  it("a coorte interna não é chamável direto pelo app", async () => {
    await comoUsuario(c, corretor.id);
    await expect(
      c.query(
        `SELECT * FROM public._meu_funil_coorte(now() - interval '1 day', now(), ARRAY[$1]::uuid[])`,
        [outro.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await comoSuperuser(c);
  });
});

describe("funil_estudo_diario — RLS", () => {
  it("corretor registra o próprio estudo e não o de outro; outro corretor não lê", async () => {
    await comoUsuario(c, corretor.id);
    await c.query(
      `INSERT INTO public.funil_estudo_diario (corretor_id, dia, foco, segundos_na_tela)
       VALUES ($1, current_date, 'agendar', 75)`,
      [corretor.id],
    );
    await expect(
      c.query(
        `INSERT INTO public.funil_estudo_diario (corretor_id, dia, foco) VALUES ($1, current_date, 'agendar')`,
        [outro.id],
      ),
    ).rejects.toThrow(/row-level security/);

    await comoUsuario(c, outro.id);
    const r = await c.query(`SELECT count(*)::int AS n FROM public.funil_estudo_diario`);
    expect(r.rows[0].n).toBe(0);
    await comoSuperuser(c);
  });

  it("foco fora da lista é recusado", async () => {
    await comoUsuario(c, corretor.id);
    await expect(
      c.query(
        `INSERT INTO public.funil_estudo_diario (corretor_id, dia, foco) VALUES ($1, current_date, 'qualquer')`,
        [corretor.id],
      ),
    ).rejects.toThrow(/check constraint/);
    await comoSuperuser(c);
  });
});
