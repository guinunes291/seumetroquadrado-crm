/**
 * DEVOLVER AO MARQUINHOS (migration 20261106120000_marquinhos_devolucao).
 *
 * Pedido do dono (06/11/2026): depois do handoff, o corretor devolve o
 * cliente ao robô do 4099 com um objetivo definido — remarcar a visita,
 * recolher a documentação ou tirar dúvidas — e o Marquinhos devolve o cliente
 * com um resumo. O que esta suíte trava:
 *
 *  1. Quem devolve: o corretor dono ou a gestão; outro corretor nem enxerga.
 *     Opt-out, lead sem corretor e objetivo fora da lista são recusados.
 *  2. Uma devolução ativa por lead (o índice é a autoridade).
 *  3. Fila de envio ao n8n: reivindica uma vez, ok → com_marquinhos; falha
 *     tenta 3 vezes e então avisa o corretor por push (nada some em silêncio).
 *  4. Retomar: antes de o n8n saber cancela na hora; depois enfileira a pausa;
 *     retomar com o envio no ar não deixa o robô solto.
 *  5. Encerrar (n8n): concluída, nota na timeline sem autor, push ao dono,
 *     replay ignorado.
 *  6. Fila Responder: mensagem do robô fora de devolução não conta como
 *     resposta; dentro de devolução conta; entrada durante devolução ativa não
 *     cobra o corretor.
 *  7. Escrita só por RPC; fila e encerramento só por service role.
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

let ana: UsuarioTeste; // corretora dona dos leads
let bia: UsuarioTeste; // corretora de outra equipe
let gestor: UsuarioTeste; // gestor da equipe da Ana

async function comoService<T>(fn: () => Promise<T>): Promise<T> {
  await comoSuperuser(c);
  await c.query(`SET ROLE service_role`);
  try {
    return await fn();
  } finally {
    await c.query(`RESET ROLE`);
  }
}

async function devolver(
  u: UsuarioTeste,
  leadId: string,
  objetivo = "remarcar_visita",
  obs?: string,
) {
  await comoUsuario(c, u.id);
  try {
    const r = await c.query(`SELECT public.marquinhos_devolver($1, $2, $3) AS id`, [
      leadId,
      objetivo,
      obs ?? null,
    ]);
    return r.rows[0].id as string;
  } finally {
    await comoSuperuser(c);
  }
}

async function retomar(u: UsuarioTeste, id: string) {
  await comoUsuario(c, u.id);
  try {
    const r = await c.query(`SELECT public.marquinhos_retomar($1) AS s`, [id]);
    return r.rows[0].s as string;
  } finally {
    await comoSuperuser(c);
  }
}

type Reivindicada = {
  id: string;
  acao: string;
  telefone: string;
  cliente_nome: string;
  corretor_nome: string;
  tentativa: number;
};

async function reivindicar(): Promise<Reivindicada[]> {
  return comoService(async () => {
    const r = await c.query(`SELECT * FROM public.marquinhos_devolucoes_reivindicar_envio(20)`);
    return r.rows as Reivindicada[];
  });
}

async function registrar(id: string, acao: string, ok: boolean, erro?: string) {
  return comoService(async () => {
    const r = await c.query(
      `SELECT public.marquinhos_devolucao_registrar_envio($1, $2, $3, $4) AS s`,
      [id, acao, ok, erro ?? null],
    );
    return r.rows[0].s as string;
  });
}

async function linha(id: string) {
  await comoSuperuser(c);
  const r = await c.query(`SELECT * FROM public.marquinhos_devolucoes WHERE id = $1`, [id]);
  return r.rows[0];
}

/** Simula a passagem dos 5 min de espera entre tentativas. */
async function envelhecerTentativa(id: string) {
  await comoSuperuser(c);
  await c.query(
    `UPDATE public.marquinhos_devolucoes SET ultima_tentativa_em = now() - interval '6 minutes' WHERE id = $1`,
    [id],
  );
}

async function pushes(userId: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT title, body, url FROM public.push_outbox WHERE user_id = $1 AND tag LIKE 'devolucao-%' ORDER BY created_at`,
    [userId],
  );
  return r.rows as { title: string; body: string; url: string }[];
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  gestor = await criarUsuario(c, { nome: "Gestor Leste", papel: "gestor" });
  const equipe = await criarEquipe(c, { nome: "Leste", gestorId: gestor.id });
  await comoSuperuser(c);
  await c.query(`UPDATE public.profiles SET equipe_id = $1 WHERE id = $2`, [equipe, gestor.id]);
  ana = await criarUsuario(c, { nome: "Ana Souza", papel: "corretor", equipeId: equipe });
  bia = await criarUsuario(c, { nome: "Bia Lima", papel: "corretor" });
});

beforeEach(async () => {
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.marquinhos_devolucoes`);
  await c.query(`DELETE FROM public.push_outbox`);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.query(`DELETE FROM public.push_outbox`);
  await limparDados(c);
  await c.end();
});

describe("quem pode devolver", () => {
  it("corretora dona devolve: pendente, envio 'devolver', telefone com DDI", async () => {
    const lead = await criarLead(c, {
      nome: "Regina Alves",
      telefone: "(11) 98765-4321",
      corretorId: ana.id,
      status: "agendado",
    });
    const id = await devolver(ana, lead, "remarcar_visita", "Prefere sábado de manhã");
    const d = await linha(id);
    expect(d.status).toBe("pendente");
    expect(d.envio_pendente).toBe("devolver");
    expect(d.telefone).toBe("5511987654321");
    expect(d.solicitante_id).toBe(ana.id);
    expect(d.corretor_id).toBe(ana.id);
    expect(d.observacao).toBe("Prefere sábado de manhã");
  });

  it("gestor da equipe também devolve", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    const id = await devolver(gestor, lead, "tirar_duvidas");
    expect((await linha(id)).solicitante_id).toBe(gestor.id);
  });

  it("outra corretora não devolve nem enxerga a devolução", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    expect(await errCode(devolver(bia, lead))).toBe("22023");
    await devolver(ana, lead);
    await comoUsuario(c, bia.id);
    const r = await c.query(`SELECT count(*)::int AS n FROM public.marquinhos_devolucoes`);
    await comoSuperuser(c);
    expect(r.rows[0].n).toBe(0);
  });

  it("recusa objetivo fora da lista, opt-out, lead sem corretor e perdido", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    expect(await errCode(devolver(ana, lead, "vender_o_apartamento"))).toBe("22023");

    const opt = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    await c.query(`UPDATE public.leads SET opt_out = true WHERE id = $1`, [opt]);
    expect(await errCode(devolver(ana, opt))).toBe("22023");

    const semDono = await criarLead(c, { corretorId: null, status: "novo" });
    expect(await errCode(devolver(gestor, semDono))).toBe("22023");

    // perdido exige motivo pelos gatilhos de leads; aqui só importa o status
    const perdido = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    await c.query(`SET session_replication_role = replica`);
    await c.query(`UPDATE public.leads SET status = 'perdido' WHERE id = $1`, [perdido]);
    await c.query(`SET session_replication_role = DEFAULT`);
    expect(await errCode(devolver(ana, perdido))).toBe("22023");
  });

  it("uma devolução ativa por cliente", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    await devolver(ana, lead, "remarcar_visita");
    expect(await errCode(devolver(ana, lead, "tirar_duvidas"))).toBe("23505");
  });

  it("corretor não escreve direto na tabela nem roda a fila", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    await comoUsuario(c, ana.id);
    const ins = await errCode(
      c.query(
        `INSERT INTO public.marquinhos_devolucoes (lead_id, solicitante_id, objetivo, telefone)
         VALUES ($1, $2, 'tirar_duvidas', '5511999998888')`,
        [lead, ana.id],
      ),
    );
    const fila = await errCode(
      c.query(`SELECT * FROM public.marquinhos_devolucoes_reivindicar_envio(5)`),
    );
    const enc = await errCode(
      c.query(
        `SELECT public.marquinhos_devolucao_encerrar(gen_random_uuid(), 'objetivo_cumprido', 'x')`,
      ),
    );
    await comoSuperuser(c);
    expect(ins).toBe("42501");
    expect(fila).toBe("42501");
    expect(enc).toBe("42501");
  });
});

describe("fila de envio ao n8n", () => {
  it("reivindica uma vez; ok vira com_marquinhos com nome do cliente e do corretor", async () => {
    const lead = await criarLead(c, {
      nome: "Regina Alves",
      corretorId: ana.id,
      status: "agendado",
    });
    const id = await devolver(ana, lead);
    const lote = await reivindicar();
    expect(lote).toHaveLength(1);
    expect(lote[0]).toMatchObject({
      id,
      acao: "devolver",
      cliente_nome: "Regina Alves",
      corretor_nome: "Ana Souza",
      tentativa: 1,
    });
    expect(await reivindicar()).toHaveLength(0);

    expect(await registrar(id, "devolver", true)).toBe("com_marquinhos");
    const d = await linha(id);
    expect(d.status).toBe("com_marquinhos");
    expect(d.envio_pendente).toBeNull();
    expect(d.enviado_em).not.toBeNull();
  });

  it("falha 3 vezes: falhou e o corretor recebe push", async () => {
    const lead = await criarLead(c, { nome: "Alex Prado", corretorId: ana.id, status: "agendado" });
    const id = await devolver(ana, lead);
    for (let i = 1; i <= 2; i++) {
      expect((await reivindicar()).map((x) => x.id)).toEqual([id]);
      expect(await registrar(id, "devolver", false, "HTTP 500")).toBe("nova_tentativa");
      // logo depois da falha não tenta de novo (espera a varredura de 5 min)
      expect(await reivindicar()).toHaveLength(0);
      await envelhecerTentativa(id);
    }
    expect((await reivindicar()).map((x) => x.tentativa)).toEqual([3]);
    expect(await registrar(id, "devolver", false, "HTTP 500")).toBe("falhou");
    const d = await linha(id);
    expect(d.status).toBe("falhou");
    expect(d.ultimo_erro).toContain("HTTP 500");
    const p = await pushes(ana.id);
    expect(p).toHaveLength(1);
    expect(p[0].body).toContain("Alex");
    expect(p[0].url).toBe(`/leads/${lead}`);
    // falhou libera o cliente para uma nova devolução
    await devolver(ana, lead, "tirar_duvidas");
  });
});

describe("retomar o atendimento", () => {
  it("antes de o n8n saber: cancela na hora, sem envio", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "agendado" });
    const id = await devolver(ana, lead);
    expect(await retomar(ana, id)).toBe("cancelada");
    expect((await linha(id)).envio_pendente).toBeNull();
    expect(await reivindicar()).toHaveLength(0);
  });

  it("com o Marquinhos: enfileira a pausa e só cancela quando o n8n confirma", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "agendado" });
    const id = await devolver(ana, lead);
    await reivindicar();
    await registrar(id, "devolver", true);

    expect(await retomar(ana, id)).toBe("retomando");
    expect((await linha(id)).status).toBe("com_marquinhos");
    const lote = await reivindicar();
    expect(lote.map((x) => x.acao)).toEqual(["retomar"]);
    expect(await registrar(id, "retomar", true)).toBe("cancelada");
    expect((await linha(id)).status).toBe("cancelada");
  });

  it("retomar com o envio no ar: o robô despausado ainda recebe a pausa", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "agendado" });
    const id = await devolver(ana, lead);
    await reivindicar(); // n8n recebendo o 'devolver'
    expect(await retomar(ana, id)).toBe("retomando");
    expect(await registrar(id, "devolver", true)).toBe("com_marquinhos");
    const d = await linha(id);
    expect(d.envio_pendente).toBe("retomar");
    expect((await reivindicar()).map((x) => x.acao)).toEqual(["retomar"]);
  });

  it("pausa que falha 3 vezes: continua com_marquinhos e avisa o corretor", async () => {
    const lead = await criarLead(c, {
      nome: "Hamilton Reis",
      corretorId: ana.id,
      status: "agendado",
    });
    const id = await devolver(ana, lead);
    await reivindicar();
    await registrar(id, "devolver", true);
    await retomar(ana, id);
    for (let i = 1; i <= 3; i++) {
      await reivindicar();
      await registrar(id, "retomar", false, "timeout");
      await envelhecerTentativa(id);
    }
    const d = await linha(id);
    expect(d.status).toBe("com_marquinhos");
    expect(d.envio_pendente).toBeNull();
    expect(d.ultimo_erro).toContain("pausar");
    expect((await pushes(ana.id)).map((p) => p.title)).toEqual(["Marquinhos continua atendendo"]);
  });

  it("outra corretora não retoma", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "agendado" });
    const id = await devolver(ana, lead);
    expect(await errCode(retomar(bia, id))).toBe("22023");
  });
});

describe("encerramento pelo Marquinhos", () => {
  it("concluída: nota sem autor na timeline, push ao dono, replay ignorado", async () => {
    const lead = await criarLead(c, {
      nome: "Regina Alves",
      corretorId: ana.id,
      status: "agendado",
    });
    const id = await devolver(gestor, lead, "remarcar_visita");
    await reivindicar();
    await registrar(id, "devolver", true);

    const encerrar = () =>
      comoService(async () => {
        const r = await c.query(`SELECT public.marquinhos_devolucao_encerrar($1, $2, $3) AS s`, [
          id,
          "objetivo_cumprido",
          "Visita remarcada para sábado 14/11 às 10h no Playball.",
        ]);
        return r.rows[0].s as string;
      });
    expect(await encerrar()).toBe("concluida");
    expect(await encerrar()).toBe("ignorado");

    const d = await linha(id);
    expect(d.status).toBe("concluida");
    expect(d.desfecho).toBe("objetivo_cumprido");

    const nota = await c.query(
      `SELECT autor_id, tipo::text, titulo, conteudo FROM public.interacoes WHERE lead_id = $1`,
      [lead],
    );
    expect(nota.rows).toHaveLength(1);
    expect(nota.rows[0]).toMatchObject({
      autor_id: null,
      tipo: "nota",
      titulo: "Marquinhos concluiu: remarcar a visita",
    });
    expect(nota.rows[0].conteudo).toContain("14/11");

    // o push vai para o DONO do lead, mesmo quando quem pediu foi o gestor
    const p = await pushes(ana.id);
    expect(p).toHaveLength(1);
    expect(p[0].title).toContain("Regina");
  });
});

describe("fila Responder com mensagens do robô", () => {
  async function msg(
    leadId: string,
    direcao: "entrada" | "saida",
    minutos: number,
    extra: { agente?: string; devolucaoId?: string; corretorId?: string } = {},
  ) {
    await comoSuperuser(c);
    await c.query(
      `INSERT INTO public.mensagens (lead_id, corretor_id, direcao, status, conteudo, agente, devolucao_id, criado_em, recebida_em)
       VALUES ($1, $2, $3, $4, 'oi', $5, $6, now() - make_interval(mins => $7), now() - make_interval(mins => $7))`,
      [
        leadId,
        extra.corretorId ?? null,
        direcao,
        direcao === "entrada" ? "recebida" : "enviada",
        extra.agente ?? null,
        extra.devolucaoId ?? null,
        minutos,
      ],
    );
  }
  async function aguardando(leadId: string): Promise<boolean> {
    await comoSuperuser(c);
    const r = await c.query(`SELECT aguardando FROM public.conversa_aguardando_resposta($1)`, [
      leadId,
    ]);
    return r.rows[0].aguardando as boolean;
  }

  it("resposta automática pós-handoff NÃO tira o cliente da fila do corretor", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    await msg(lead, "entrada", 10);
    await msg(lead, "saida", 9, { agente: "marquinhos" });
    expect(await aguardando(lead)).toBe(true);
  });

  it("durante a devolução: resposta do robô conta e entrada não cobra o corretor", async () => {
    const lead = await criarLead(c, { corretorId: ana.id, status: "em_atendimento" });
    const id = await devolver(ana, lead);
    await reivindicar();
    await registrar(id, "devolver", true);
    await msg(lead, "entrada", 10, { devolucaoId: id });
    expect(await aguardando(lead)).toBe(false);
    await msg(lead, "saida", 9, { agente: "marquinhos", devolucaoId: id });
    await msg(lead, "entrada", 8, { devolucaoId: id });
    expect(await aguardando(lead)).toBe(false);

    // encerrada a devolução, a última fala do cliente sem resposta volta a cobrar
    await comoService(() =>
      c.query(
        `SELECT public.marquinhos_devolucao_encerrar($1, 'precisa_corretor', 'Quer negociar desconto')`,
        [id],
      ),
    );
    expect(await aguardando(lead)).toBe(true);
  });
});
