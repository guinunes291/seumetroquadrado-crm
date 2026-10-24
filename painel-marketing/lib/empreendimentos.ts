import "server-only";
import { sql } from "./db";
import { registrar } from "./auditoria";

export type Empreendimento = {
  id: number;
  nome: string;
  apelidos: string[];
  custo_teto: number | null;
};

export async function listar(): Promise<Empreendimento[]> {
  const linhas = await sql()<
    { id: number; nome: string; apelidos: string[] | null; custo_teto: number | null }[]
  >`
    select e.id::int as id, e.nome, e.custo_teto::float8 as custo_teto,
      array_remove(array_agg(a.apelido order by a.apelido), null) as apelidos
    from empreendimentos e left join empreendimento_apelidos a on a.empreendimento_id = e.id
    where e.ativo group by e.id order by e.nome`;
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    apelidos: l.apelidos ?? [],
    custo_teto: l.custo_teto,
  }));
}

export async function pendentes() {
  return sql()<{ fonte: string; nome_bruto: string; ocorrencias: number; ultimo_dia: string }[]>`
    select fonte, nome_bruto, ocorrencias, ultimo_dia::text from v_nomes_pendentes
    order by ocorrencias desc, ultimo_dia desc limit 60`;
}

export async function campanhas() {
  return sql()<
    {
      campaign_id: string;
      nome: string;
      status: string | null;
      empreendimento_id: number | null;
      vinculo: string;
      gasto: string | null;
    }[]
  >`
    select c.campaign_id, c.nome, c.status, c.empreendimento_id::int as empreendimento_id, c.vinculo,
      (select sum(gasto) from meta_insights i where i.campaign_id = c.campaign_id) as gasto
    from meta_campanhas c order by gasto desc nulls last`;
}

async function idPorNomeOuNovo(escolha: string, novoNome: string): Promise<number | null> {
  if (escolha === "novo") {
    const nome = novoNome.trim();
    if (!nome) return null;
    const [r] = await sql()<{ id: number }[]>`
      insert into empreendimentos (nome) values (${nome})
      on conflict (nome) do update set ativo = true returning id::int as id`;
    return r.id;
  }
  const id = Number(escolha);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// Ligar um nome solto a um empreendimento. O registro guarda o vínculo
// anterior para dar para desfazer.
export async function ligarApelido(
  quem: string,
  nomeBruto: string,
  escolha: string,
  novoNome: string,
) {
  const id = await idPorNomeOuNovo(escolha, novoNome);
  if (!id) return;
  const apelido = nomeBruto.trim().toLowerCase();
  const [antes] = await sql()<{ empreendimento_id: number }[]>`
    select empreendimento_id::int from empreendimento_apelidos where apelido = ${apelido}`;
  await sql()`
    insert into empreendimento_apelidos (apelido, empreendimento_id) values (${apelido}, ${id})
    on conflict (apelido) do update set empreendimento_id = excluded.empreendimento_id`;
  await registrar(quem, "apelido_ligado", apelido, {
    empreendimento_id: id,
    antes: antes?.empreendimento_id ?? null,
  });
}

export async function desligarApelido(quem: string, apelido: string) {
  const [antes] = await sql()<{ empreendimento_id: number }[]>`
    delete from empreendimento_apelidos where apelido = ${apelido} returning empreendimento_id::int`;
  if (antes)
    await registrar(quem, "apelido_desligado", apelido, { antes: antes.empreendimento_id });
}

export async function ligarCampanha(
  quem: string,
  campaignId: string,
  escolha: string,
  novoNome: string,
) {
  const fora = escolha === "fora";
  const id = fora ? null : await idPorNomeOuNovo(escolha, novoNome);
  if (!fora && !id) return;
  const [antes] = await sql()<{ empreendimento_id: number | null; vinculo: string }[]>`
    select empreendimento_id::int, vinculo from meta_campanhas where campaign_id = ${campaignId}`;
  await sql()`
    update meta_campanhas set empreendimento_id = ${id}, vinculo = ${fora ? "fora" : "manual"}, atualizado_em = now()
    where campaign_id = ${campaignId}`;
  await registrar(quem, "campanha_ligada", campaignId, {
    empreendimento_id: id,
    antes: antes ?? null,
  });
}

// Teto de custo por resultado do empreendimento, usado para marcar vencedores
// na Biblioteca. Vazio volta ao teto geral. O registro guarda o valor anterior.
export async function definirTeto(quem: string, id: number, valor: string) {
  const n = Number(valor.replace(",", "."));
  const teto = valor.trim() === "" ? null : Number.isFinite(n) && n > 0 ? n : undefined;
  if (teto === undefined || !Number.isFinite(id) || id <= 0) return;
  const [antes] = await sql()<{ custo_teto: number | null }[]>`
    select custo_teto::float8 from empreendimentos where id = ${id}`;
  if (!antes) return;
  await sql()`update empreendimentos set custo_teto = ${teto} where id = ${id}`;
  await registrar(quem, "teto_definido", String(id), { antes: antes.custo_teto, depois: teto });
}
