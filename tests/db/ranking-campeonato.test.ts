/** Integração no harness PostgreSQL: aprovação/estorno reais e escopo de cada papel. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  comoUsuario,
  criarEquipe,
  criarLead,
  criarUsuario,
  limparDados,
  marcarEfetivacao,
  novoClient,
  type UsuarioTeste,
} from "./helpers";
import { snapshotSchema } from "../../src/features/ranking/ranking-campeonato";
const c = novoClient();
let admin: UsuarioTeste, gestor: UsuarioTeste, corretor: UsuarioTeste, fora: UsuarioTeste;
let de: string, ate: string;
let vendaId: string;
async function snapshot(user: UsuarioTeste) {
  await comoUsuario(c, user.id);
  const r = await c.query("select public.ranking_campeonato($1::date,$2::date) as snapshot", [
    de,
    ate,
  ]);
  return snapshotSchema.parse(r.rows[0].snapshot);
}
beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  admin = await criarUsuario(c, { papel: "admin" });
  gestor = await criarUsuario(c, { papel: "gestor" });
  const a = await criarEquipe(c, { gestorId: gestor.id });
  const b = await criarEquipe(c);
  const users: UsuarioTeste[] = [];
  for (let i = 0; i < 60; i++)
    users.push(await criarUsuario(c, { nome: `Corretor ${i}`, equipeId: i % 2 === 0 ? a : b }));
  corretor = users[0];
  fora = users[1];
  const range = await c.query(
    "select to_char(date_trunc('month',now() at time zone 'America/Sao_Paulo'),'YYYY-MM-DD') as de,to_char(date_trunc('month',now() at time zone 'America/Sao_Paulo')+interval '1 month - 1 day','YYYY-MM-DD') as ate",
  );
  de = range.rows[0].de;
  ate = range.rows[0].ate;
  const lead = await criarLead(c, { corretorId: corretor.id });
  const sale = await c.query(
    "insert into public.vendas(lead_id,corretor_id,valor_venda,data_assinatura) values($1,$2,500000,current_date) returning id",
    [lead, corretor.id],
  );
  vendaId = sale.rows[0].id;
  await marcarEfetivacao(c, vendaId);
  await comoUsuario(c, admin.id);
  await c.query("select public.aprovar_venda($1,'aprovada')", [vendaId]);
}, 30000);
afterAll(async () => {
  await comoSuperuser(c);
  await limparDados(c);
  await c.end();
});
describe("ranking_campeonato", () => {
  it("retorna mais de 50 sem truncamento, incluindo zero atividade", async () => {
    const s = await snapshot(admin);
    expect(s.total_participantes).toBe(62);
    expect(s.rows).toHaveLength(62);
    expect(s.rows.filter((r) => r.categoria === "corretor")).toHaveLength(60);
    expect(s.vendas.find((v) => v.id === vendaId)?.valor).toBe(500000);
    expect(s.rows.find((r) => r.corretor_id === corretor.id)).toMatchObject({
      vendas: 1,
      vgv: 500000,
    });
  });
  it("gestor só recebe suas equipes; corretor só a própria linha e evidências", async () => {
    const g = await snapshot(gestor);
    expect(g.rows).toHaveLength(31);
    expect(g.rows.some((r) => r.corretor_id === fora.id)).toBe(false);
    expect(g.equipes).toHaveLength(1);
    const own = await snapshot(corretor);
    expect(own.rows).toHaveLength(1);
    expect(own.equipes).toEqual([]);
    expect(own.escopo).toBe("individual");
    expect((await snapshot(fora)).vendas).toEqual([]);
  });
  it("recusa períodos misturando meses", async () => {
    await comoUsuario(c, admin.id);
    await expect(
      c.query("select public.ranking_campeonato('2026-08-01','2026-09-30')"),
    ).rejects.toMatchObject({ code: "22023" });
  });
  it("cancelamento remove evidência e estorna VGV do mês de aprovação", async () => {
    await comoUsuario(c, admin.id);
    await c.query("select public.aprovar_venda($1,'cancelada','Cancelamento de teste')", [vendaId]);
    const s = await snapshot(admin);
    expect(s.vendas).toEqual([]);
    expect(s.rows.find((r) => r.corretor_id === corretor.id)).toMatchObject({ vendas: 0, vgv: 0 });
  });
});
