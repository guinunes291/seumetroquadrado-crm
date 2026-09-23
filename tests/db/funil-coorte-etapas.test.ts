/**
 * FUNIL DE COORTE DA GESTÃO — cada coluna conta a etapa que o nome diz
 * (migration 20260928120000).
 *
 * O bug que este arquivo trava: a MV comparava o ordinal de funil_ordem com
 * limiares fixos; quando 'qualificacao_corretor' entrou no meio do funil, todas
 * as colunas passaram a contar uma etapa atrás ("Vendas" = quem chegou à
 * análise). A suíte existente só olhava "atendimento" — a única coluna que
 * continuou certa por coincidência — e o deslocamento passou verde.
 *
 * Aqui há um lead PARADO em cada etapa: cada coluna tem de contar exatamente
 * os leads que chegaram até ela, nem um a mais.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

let admin: UsuarioTeste;
let corretor: UsuarioTeste;

type Linha = {
  leads: number;
  atingiu_atendimento: number;
  atingiu_agendado: number;
  atingiu_visita: number;
  atingiu_analise: number;
  vendas: number;
  perdidos: number;
};

/** Lead com status final e histórico postos com os triggers desligados. */
async function leadEm(status: string, historico: string[] = []): Promise<string> {
  const id = await criarLead(c, { corretorId: corretor.id, origem: "facebook" });
  await comoSuperuser(c);
  await c.query(`SET session_replication_role = replica`);
  await c.query(`UPDATE public.leads SET status = $2::public.lead_status WHERE id = $1`, [
    id,
    status,
  ]);
  for (const para of historico) {
    await c.query(
      `INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status)
       VALUES ($1, $2, 'aguardando_atendimento', $3::public.lead_status)`,
      [id, corretor.id, para],
    );
  }
  await c.query(`SET session_replication_role = DEFAULT`);
  return id;
}

async function coorte(): Promise<Linha> {
  await comoSuperuser(c);
  await c.query(`SELECT metrics.refresh_all()`);
  await comoUsuario(c, admin.id);
  const r = await c.query(
    `SELECT sum(leads)::int AS leads,
            sum(atingiu_atendimento)::int AS atingiu_atendimento,
            sum(atingiu_agendado)::int AS atingiu_agendado,
            sum(atingiu_visita)::int AS atingiu_visita,
            sum(atingiu_analise)::int AS atingiu_analise,
            sum(vendas)::int AS vendas,
            sum(perdidos)::int AS perdidos
       FROM public.gestao_funil_coorte(NULL, NULL, NULL, NULL)`,
  );
  await comoSuperuser(c);
  return r.rows[0] as Linha;
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { papel: "admin" });
  corretor = await criarUsuario(c, { papel: "corretor" });
});

afterAll(async () => {
  await limparDados(c);
  await c.end();
});

describe("gestao_funil_coorte — uma etapa por coluna", () => {
  it("lead parado em cada etapa conta só até onde chegou", async () => {
    await leadEm("aguardando_atendimento");
    await leadEm("em_atendimento");
    await leadEm("agendado");
    await leadEm("visita_realizada");
    await leadEm("analise_credito");
    await leadEm("contrato_fechado");

    expect(await coorte()).toEqual({
      leads: 6,
      atingiu_atendimento: 5,
      atingiu_agendado: 4,
      atingiu_visita: 3,
      atingiu_analise: 2,
      // Antes da correção: 2 (a análise contava como venda) — e o fechado sem
      // histórico ficava de fora do corte BETWEEN 1 AND 7.
      vendas: 1,
      perdidos: 0,
    });
  });

  it("perdido conta a etapa mais alta do histórico, e análise não vira venda", async () => {
    await limparDados(c);
    admin = await criarUsuario(c, { papel: "admin" });
    corretor = await criarUsuario(c, { papel: "corretor" });

    await leadEm("perdido", ["em_atendimento", "agendado"]);
    await leadEm("perdido", ["em_atendimento", "agendado", "visita_realizada", "analise_credito"]);

    const r = await coorte();
    expect(r).toMatchObject({
      leads: 2,
      atingiu_agendado: 2,
      atingiu_visita: 1,
      atingiu_analise: 1,
      vendas: 0,
      perdidos: 2,
    });
  });
});
