/**
 * Transferência de carteira: o dossiê do copiloto (POST para o webhook n8n
 * feito por _notificar_handoff_novo_dono) vale na transferência AVULSA e
 * some na transferência em LOTE.
 *
 * Por quê: transferir_leads chamava o handoff dentro do loop, um POST por
 * lead. Uma transferência de 21 leads rendia 21 mensagens de WhatsApp em
 * sequência para o mesmo corretor — rajada que o WhatsApp trata como spam e
 * que arrisca bloqueio da instância Z-API. Em lote quem avisa é a mensagem
 * única de resumo da edge function notify-lead-transfer.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let equipeId: string;
let gestor: UsuarioTeste;
let origem: UsuarioTeste;
let destino: UsuarioTeste;

/** POSTs de handoff já enfileirados para estes leads (fila fake do pg_net). */
async function handoffsDe(leadIds: string[]): Promise<string[]> {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT body->>'lead_id' AS lead_id
       FROM net.http_request_queue
      WHERE url LIKE '%/webhook/copiloto/handoff'
        AND body->>'lead_id' = ANY($1::text[])`,
    [leadIds],
  );
  return r.rows.map((row) => String(row.lead_id));
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  equipeId = await criarEquipe(c);
  gestor = await criarUsuario(c, { nome: "Gina Gestora", papel: "gestor", equipeId });
  origem = await criarUsuario(c, { nome: "Ana Origem", papel: "corretor", equipeId });
  destino = await criarUsuario(c, { nome: "Bruno Destino", papel: "corretor", equipeId });
  await comoSuperuser(c);
  await c.query(`UPDATE public.equipes SET gestor_id = $1 WHERE id = $2`, [gestor.id, equipeId]);
  await c.query(`UPDATE public.profiles SET telefone = '11999990001' WHERE id = $1`, [destino.id]);
});

afterAll(async () => {
  await c.end();
});

describe("transferir_leads e o dossiê do copiloto", () => {
  it("avulsa (1 lead): dispara o handoff, como sempre", async () => {
    const leadId = await criarLead(c, { corretorId: origem.id, status: "em_atendimento" });

    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT public.transferir_leads(ARRAY[$1::uuid], $2::uuid) AS n`, [
      leadId,
      destino.id,
    ]);
    expect(r.rows[0].n).toBe(1);

    expect(await handoffsDe([leadId])).toEqual([leadId]);
  });

  it("lote (3 leads): nenhum handoff — o aviso é a mensagem única de resumo", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await criarLead(c, { corretorId: origem.id, status: "em_atendimento" }));
    }

    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT public.transferir_leads($1::uuid[], $2::uuid) AS n`, [
      ids,
      destino.id,
    ]);
    expect(r.rows[0].n).toBe(3);

    // A transferência aconteceu inteira…
    await comoSuperuser(c);
    const donos = await c.query(
      `SELECT count(*)::int AS n FROM public.leads WHERE id = ANY($1::uuid[]) AND corretor_id = $2`,
      [ids, destino.id],
    );
    expect(donos.rows[0].n).toBe(3);
    const log = await c.query(
      `SELECT count(*)::int AS n FROM public.distribution_log
        WHERE lead_id = ANY($1::uuid[]) AND regra_aplicada = 'transferencia_manual'`,
      [ids],
    );
    expect(log.rows[0].n).toBe(3);

    // …e nenhum POST de dossiê saiu.
    expect(await handoffsDe(ids)).toEqual([]);
  });

  it("lote em que só um lead troca de dono: volta a ser avulsa", async () => {
    const jaEhDoDestino = await criarLead(c, { corretorId: destino.id, status: "em_atendimento" });
    const trocaDeDono = await criarLead(c, { corretorId: origem.id, status: "em_atendimento" });

    await comoUsuario(c, gestor.id);
    const r = await c.query(`SELECT public.transferir_leads($1::uuid[], $2::uuid) AS n`, [
      [jaEhDoDestino, trocaDeDono],
      destino.id,
    ]);
    expect(r.rows[0].n).toBe(2);

    expect(await handoffsDe([jaEhDoDestino, trocaDeDono])).toEqual([trocaDeDono]);
  });
});
