/**
 * A faixa `conversa` de `_carteira_classificar` (migration 20260915140000).
 *
 * `20260914190000` consertou o "sem próximo passo" e criou
 * `lead_sem_proximo_passo` como fonte única — mas só metade da função passou a
 * usá-la. O MOTIVO usava a regra nova; a FAIXA continuava perguntando
 * `proximo_followup > now()`, que é o espelho de `min(data_vencimento)` das
 * tarefas pendentes e portanto aponta para a dívida mais VELHA.
 *
 * Resultado medido antes do conserto: um lead com tarefa marcada para daqui a
 * 3 dias E uma dívida de 40 dias caía em `reserva` com motivo
 * 'sem conversa viva' — dentro da mesma função, a regra nova reconhecia o passo
 * e a faixa não.
 *
 * Isso importa porque a Reserva é de onde a régua de devolução tira lead: com a
 * faixa errada, a varredura devolveria leads que o corretor de fato agendou.
 *
 * Base em formação (20260925120000): os leads desta suíte são leads de
 * carteira EM CONVERSA, e em produção já teriam saído da cadência ao ganhar
 * passo. O fixture desliga os gatilhos (replica) para montar as tarefas, então
 * a saída é aplicada à mão. A exceção é `novo_recente`, que era o caso da
 * faixa `sla` e agora é o da formação.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  comGestaoConfig,
  comoSuperuser,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

type Linha = {
  lead_id: string;
  nome: string;
  faixa: string;
  ativa: boolean;
  motivo: string | null;
};

let corretor: UsuarioTeste;

async function faixas(): Promise<Map<string, Linha>> {
  await comoSuperuser(c);
  const r = await c.query(`SELECT * FROM public._carteira_classificar($1)`, [corretor.id]);
  return new Map((r.rows as Linha[]).map((l) => [l.nome, l]));
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  corretor = await criarUsuario(c, { nome: "Corretor Faixa", papel: "corretor" });

  const mk = (nome: string, status = "em_atendimento") =>
    criarLead(c, { nome, corretorId: corretor.id, status });
  const soFutura = await mk("so_tarefa_futura");
  const vencidaEFutura = await mk("vencida_e_futura");
  const soVencida = await mk("so_vencida");
  await mk("nada");
  await mk("agendado", "agendado");
  const comVisita = await mk("com_agendamento_futuro");
  const novoRecente = await mk("novo_recente", "novo");
  const novoVelho = await mk("novo_velho", "novo");

  await comoSuperuser(c);
  await c.query(
    `UPDATE public.leads
        SET cadencia_etapa = NULL, cadencia_prazo_ts = NULL, cadencia_inicio_ts = NULL
      WHERE corretor_id = $1 AND id <> $2`,
    [corretor.id, novoRecente],
  );
  await c.query(`SET session_replication_role = replica`);
  await c.query(`DELETE FROM public.tarefas`);
  // Todos tocados há 2 dias: dentro da janela de conversa (7 dias), então o que
  // separa as faixas é o próximo passo, não o relógio.
  await c.query(`UPDATE public.leads SET ultima_interacao = now() - interval '2 days'`);
  await c.query(
    `UPDATE public.leads SET data_distribuicao = now() - interval '2 hours' WHERE id = $1`,
    [novoRecente],
  );
  await c.query(
    `UPDATE public.leads SET data_distribuicao = now() - interval '10 days' WHERE id = $1`,
    [novoVelho],
  );
  const tarefa = (id: string, venc: string) =>
    c.query(
      `INSERT INTO public.tarefas (lead_id, corretor_id, titulo, tipo, status, prioridade, data_vencimento)
       VALUES ($1, $2, 'Follow-up', 'follow_up', 'pendente', 'media', now() + $3::interval)`,
      [id, corretor.id, venc],
    );
  await tarefa(soFutura, "3 days");
  await tarefa(vencidaEFutura, "-40 days");
  await tarefa(vencidaEFutura, "3 days");
  await tarefa(soVencida, "-40 days");
  await c.query(
    `INSERT INTO public.agendamentos (lead_id, corretor_id, titulo, data_inicio, data_fim)
     VALUES ($1, $2, 'Visita', now() + interval '3 days', now() + interval '3 days 1 hour')`,
    [comVisita, corretor.id],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  // O espelho, do jeito que o trigger o mantém: min(vencimento) das abertas.
  await c.query(
    `UPDATE public.leads l SET proximo_followup = s.prox FROM (
       SELECT lead_id, min(data_vencimento) AS prox FROM public.tarefas
        WHERE status IN ('pendente','em_andamento') AND deleted_at IS NULL
        GROUP BY lead_id) s WHERE l.id = s.lead_id`,
  );
});

describe("a faixa conversa", () => {
  it("dívida velha NÃO derruba quem tem compromisso marcado", async () => {
    // O caso do conserto. Com a regra antiga isto era faixa=reserva.
    const f = await faixas();
    expect(f.get("vencida_e_futura")?.faixa).toBe("conversa");
    expect(f.get("vencida_e_futura")?.ativa).toBe(true);
  });

  it("tarefa só no futuro é conversa", async () => {
    const f = await faixas();
    expect(f.get("so_tarefa_futura")?.faixa).toBe("conversa");
  });

  it("agendamento futuro também é conversa", async () => {
    const f = await faixas();
    expect(f.get("com_agendamento_futuro")?.faixa).toBe("conversa");
  });

  it("tarefa só vencida, ou nada, cai na Reserva", async () => {
    const f = await faixas();
    expect(f.get("so_vencida")?.faixa).toBe("reserva");
    expect(f.get("nada")?.faixa).toBe("reserva");
    // O motivo depende do corte `devolver_sem_proximo_passo_dias`, que a
    // operação move (foi de 2 para 7 em 15/09/2026). O teste declara o corte
    // que está exercitando em vez de herdar o de produção.
    const motivo = await comGestaoConfig(
      c,
      "carteira_ativa",
      { devolver_sem_proximo_passo_dias: 1 },
      async () => (await faixas()).get("so_vencida")?.motivo,
    );
    expect(motivo).toBe("sem próximo passo definido");
  });
});

describe("as outras faixas não mudaram", () => {
  it("o fundo continua como era; o recém-chegado está em formação, fora dos 65", async () => {
    const f = await faixas();
    expect(f.get("agendado")?.faixa).toBe("fundo");
    expect(f.get("agendado")?.ativa).toBe(true);
    // Era `sla` antes de 20260925120000. Agora está na cadência, que é onde
    // o lead que ninguém ainda conseguiu falar é trabalhado.
    expect(f.get("novo_recente")?.faixa).toBe("formacao");
    expect(f.get("novo_recente")?.ativa).toBe(false);
    expect(f.get("novo_velho")?.faixa).toBe("reserva");
  });
});

describe("o espelho proximo_followup", () => {
  it("escrito à mão, sem tarefa, ainda conta como próximo passo", async () => {
    // `transicionar_lead` (20260811151000) escreve leads.proximo_followup
    // direto, sem criar tarefa. A primeira versão desta migration ignorou esse
    // caso e a suíte pegou: o lead tinha passo de verdade e ia para a Reserva.
    // Espelho no FUTURO é condição suficiente; no passado não prova nada.
    await comoSuperuser(c);
    const id = await criarLead(c, {
      nome: "followup_na_mao",
      corretorId: corretor.id,
      status: "em_atendimento",
    });
    await comoSuperuser(c);
    await c.query(
      `UPDATE public.leads SET ultima_interacao = now() - interval '1 day',
                               proximo_followup = now() + interval '1 day'
        WHERE id = $1`,
      [id],
    );
    expect(await (async () => (await faixas()).get("followup_na_mao")?.faixa)()).toBe("conversa");
    const r = await c.query(`SELECT public.lead_sem_proximo_passo($1) AS v`, [id]);
    expect(r.rows[0].v).toBe(false);
    // O lead nasceu em D1 (gatilho de atribuição). Escrever o passo no lead
    // é "agendar para frente": ele saiu da cadência sozinho, pelo gatilho.
    const e = await c.query(`SELECT cadencia_etapa FROM public.leads WHERE id = $1`, [id]);
    expect(e.rows[0].cadencia_etapa).toBe("respondeu");
  });
});

describe("faixa e motivo param de discordar", () => {
  it("ninguém na Reserva tem próximo passo vivo", async () => {
    // A invariante que o defeito violava: a Reserva é de onde a régua de
    // devolução tira lead, então lead com compromisso marcado não pode estar lá.
    await comoSuperuser(c);
    const r = await c.query(
      `SELECT count(*)::int AS n
         FROM public._carteira_classificar($1) AS k
        WHERE k.faixa = 'reserva'
          AND NOT public.lead_sem_proximo_passo(k.lead_id)`,
      [corretor.id],
    );
    expect(r.rows[0].n).toBe(0);
  });
});
