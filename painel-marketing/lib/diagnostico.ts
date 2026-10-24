import "server-only";
import { sql } from "./db";

export type Periodo = { inicio: string; fim: string; capturadoEm: string; fonte: string };

export type LinhaDiagnostico = {
  empreendimentoId: number | null;
  nome: string;
  campanhas: number;
  temAtiva: boolean;
  gasto: number;
  leadsMeta: number;
  leadsFunil: number;
  visitas: number;
  vendas: number;
};

export type Diagnostico = {
  periodo: Periodo | null;
  linhas: LinhaDiagnostico[];
  semVinculo: { leads: number; visitas: number; vendas: number };
  campanhasSemEmpreendimento: { campaignId: string; nome: string; gasto: number }[];
};

export async function periodos(): Promise<Periodo[]> {
  const linhas = await sql()<{ inicio: string; fim: string; capturado_em: Date; fonte: string }[]>`
    select data_inicio::text as inicio, data_fim::text as fim,
      max(capturado_em) as capturado_em, min(fonte) as fonte
    from meta_insights group by 1, 2 order by 2 desc, 1 desc`;
  return linhas.map((l) => ({
    inicio: l.inicio,
    fim: l.fim,
    capturadoEm: l.capturado_em.toISOString(),
    fonte: l.fonte,
  }));
}

export async function diagnostico(p: Periodo | null): Promise<Diagnostico> {
  if (!p) {
    return {
      periodo: null,
      linhas: [],
      semVinculo: { leads: 0, visitas: 0, vendas: 0 },
      campanhasSemEmpreendimento: [],
    };
  }
  const db = sql();
  const linhas = await db<
    {
      empreendimento_id: number | null;
      nome: string | null;
      campanhas: number;
      tem_ativa: boolean;
      gasto: string;
      leads_meta: string;
      leads_funil: number;
      visitas: number;
      vendas: number;
    }[]
  >`
    with g as (
      select empreendimento_id, sum(gasto) gasto, sum(resultados_meta) leads_meta,
        sum(campanhas)::int campanhas, bool_or(tem_ativa) tem_ativa
      from v_gasto_empreendimento
      where data_inicio = ${p.inicio}::date and data_fim = ${p.fim}::date
      group by 1
    ),
    l as (select empreendimento_id, count(*)::int n from v_leads_funil
          where dia between ${p.inicio}::date and ${p.fim}::date group by 1),
    v as (select empreendimento_id, count(*)::int n from v_visitas
          where dia between ${p.inicio}::date and ${p.fim}::date
            and coalesce(status,'') not in ('cancelado','cancelada') group by 1),
    s as (select empreendimento_id, count(*)::int n from v_vendas_funil
          where dia between ${p.inicio}::date and ${p.fim}::date group by 1),
    ids as (select empreendimento_id from g union select empreendimento_id from l
            union select empreendimento_id from v union select empreendimento_id from s)
    select ids.empreendimento_id, e.nome,
      coalesce(g.campanhas, 0) campanhas, coalesce(g.tem_ativa, false) tem_ativa,
      coalesce(g.gasto, 0) gasto, coalesce(g.leads_meta, 0) leads_meta,
      coalesce(l.n, 0) leads_funil, coalesce(v.n, 0) visitas, coalesce(s.n, 0) vendas
    from ids
    left join empreendimentos e on e.id = ids.empreendimento_id
    left join g on g.empreendimento_id is not distinct from ids.empreendimento_id
    left join l on l.empreendimento_id is not distinct from ids.empreendimento_id
    left join v on v.empreendimento_id is not distinct from ids.empreendimento_id
    left join s on s.empreendimento_id is not distinct from ids.empreendimento_id
    order by coalesce(g.gasto, 0) desc, coalesce(l.n, 0) desc`;

  const semId = linhas.find((l) => l.empreendimento_id === null);
  const comId = linhas.filter((l) => l.empreendimento_id !== null);

  const campanhasSem = await db<{ campaign_id: string; nome: string; gasto: string }[]>`
    select c.campaign_id, c.nome, i.gasto
    from meta_campanhas c join meta_insights i using (campaign_id)
    where c.empreendimento_id is null and i.data_inicio = ${p.inicio}::date and i.data_fim = ${p.fim}::date
    order by i.gasto desc`;

  return {
    periodo: p,
    linhas: comId.map((l) => ({
      empreendimentoId: l.empreendimento_id,
      nome: l.nome ?? "Sem nome",
      campanhas: l.campanhas,
      temAtiva: l.tem_ativa,
      gasto: Number(l.gasto),
      leadsMeta: Number(l.leads_meta),
      leadsFunil: l.leads_funil,
      visitas: l.visitas,
      vendas: l.vendas,
    })),
    semVinculo: {
      leads: semId?.leads_funil ?? 0,
      visitas: semId?.visitas ?? 0,
      vendas: semId?.vendas ?? 0,
    },
    campanhasSemEmpreendimento: campanhasSem.map((c) => ({
      campaignId: c.campaign_id,
      nome: c.nome,
      gasto: Number(c.gasto),
    })),
  };
}
