import "server-only";
import { conexaoAvulsa, sql } from "./db";
import { registrar } from "./auditoria";
import { ErroMeta, contaAnuncios, graph, resultadoDe } from "./meta";
import { textosDoCriativo, tipoDoCriativo, type CriativoMeta } from "./biblioteca";

// Biblioteca de criativos: retrato de todos os anúncios da conta com o
// desempenho de todo o período. Só lê a Meta. Favoritar, esconder e anotar
// ficam no banco do Painel e não mudam nada na Meta.

type AnuncioMeta = {
  id: string;
  name: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
  created_time?: string;
  campaign?: { name?: string };
  creative?: CriativoMeta;
};
type InsightAnuncio = {
  ad_id: string;
  spend: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
};

const CAMPOS_CRIATIVO =
  "id,object_type,thumbnail_url,image_url,title,body,video_id,instagram_permalink_url,object_story_spec,asset_feed_spec";
const CAMPOS_ANUNCIO = "id,name,effective_status,campaign_id,adset_id,created_time,campaign{name}";

async function lerAnuncios(conta: string): Promise<AnuncioMeta[]> {
  // Pede a miniatura em 480px; se a Meta recusar o modificador, cai para a padrão.
  try {
    return await graph<AnuncioMeta>(
      `act_${conta}/ads`,
      {
        fields: `${CAMPOS_ANUNCIO},creative.thumbnail_width(480).thumbnail_height(480){${CAMPOS_CRIATIVO}}`,
      },
      100,
    );
  } catch (e) {
    if (!(e instanceof ErroMeta) || e.codigo !== 100) throw e;
    return graph<AnuncioMeta>(
      `act_${conta}/ads`,
      { fields: `${CAMPOS_ANUNCIO},creative{${CAMPOS_CRIATIVO}}` },
      100,
    );
  }
}

export async function sincronizarCriativos(quem: string) {
  const conta = contaAnuncios();
  const [anuncios, insights] = await Promise.all([
    lerAnuncios(conta),
    graph<InsightAnuncio>(
      `act_${conta}/insights`,
      {
        level: "ad",
        date_preset: "maximum",
        fields: "ad_id,spend,impressions,clicks,actions",
      },
      200,
    ),
  ]);
  const desempenho = new Map(insights.map((i) => [i.ad_id, i]));
  const linhas = anuncios.map((a) => {
    const i = desempenho.get(a.id);
    const r = resultadoDe(i?.actions);
    const c = a.creative;
    const { titulo, texto } = textosDoCriativo(c);
    const s = c?.object_story_spec;
    return {
      ad_id: a.id,
      nome: a.name,
      status: a.effective_status ?? null,
      campaign_id: a.campaign_id ?? null,
      campanha_nome: a.campaign?.name ?? null,
      adset_id: a.adset_id ?? null,
      criado_na_meta: a.created_time ?? null,
      creative_id: c?.id ?? null,
      tipo: tipoDoCriativo(c),
      miniatura: c?.thumbnail_url ?? null,
      imagem: c?.image_url ?? s?.link_data?.picture ?? s?.video_data?.image_url ?? null,
      titulo,
      texto,
      link_publicacao: c?.instagram_permalink_url ?? null,
      gasto: i ? Number(i.spend) : 0,
      impressoes: i?.impressions ? Number(i.impressions) : null,
      cliques: i?.clicks ? Number(i.clicks) : null,
      resultados: r.valor,
      tipo_resultado: r.tipo,
    };
  });
  // Em lotes pequenos e numa conexão própria: com 200 linhas (cerca de 4 mil
  // parâmetros) na conexão compartilhada, a página seguinte ficou presa esperando
  // o banco. Favorito, oculto e nota são do Painel e nunca são sobrescritos aqui.
  const db = conexaoAvulsa();
  try {
    for (let k = 0; k < linhas.length; k += 50) {
      const lote = linhas.slice(k, k + 50);
      await db`
      insert into criativos ${db(lote)}
      on conflict (ad_id) do update set nome = excluded.nome, status = excluded.status,
        campaign_id = excluded.campaign_id, campanha_nome = excluded.campanha_nome,
        adset_id = excluded.adset_id, criado_na_meta = excluded.criado_na_meta,
        creative_id = excluded.creative_id, tipo = excluded.tipo, miniatura = excluded.miniatura,
        imagem = excluded.imagem, titulo = excluded.titulo, texto = excluded.texto,
        link_publicacao = excluded.link_publicacao, gasto = excluded.gasto,
        impressoes = excluded.impressoes, cliques = excluded.cliques,
        resultados = excluded.resultados, tipo_resultado = excluded.tipo_resultado,
        sincronizado_em = now()`;
    }
  } finally {
    await db.end({ timeout: 5 });
  }
  await registrar(quem, "criativos_sincronizados", `act_${conta}`, {
    anuncios: linhas.length,
    com_gasto: linhas.filter((l) => l.gasto > 0).length,
  });
  return { anuncios: linhas.length, comGasto: linhas.filter((l) => l.gasto > 0).length };
}

export type Criativo = {
  ad_id: string;
  nome: string;
  status: string | null;
  campaign_id: string | null;
  campanha_nome: string | null;
  criado_na_meta: string | null;
  tipo: "video" | "imagem" | "carrossel" | "outro";
  miniatura: string | null;
  imagem: string | null;
  titulo: string | null;
  texto: string | null;
  link_publicacao: string | null;
  gasto: number;
  impressoes: number | null;
  resultados: number;
  tipo_resultado: string | null;
  favorito: boolean;
  oculto: boolean;
  nota: string | null;
  empreendimento_id: number | null;
  custo_por_resultado: number | null;
  ctr: number | null;
  sincronizado_em: string;
  categoria: "vendas" | "recrutamento";
  custo_teto: number | null;
};

export type Filtro = {
  empreendimento?: number;
  tipo?: string;
  ordem?: "custo" | "resultados" | "gasto" | "recentes";
  favoritos?: boolean;
  ocultos?: boolean;
  noAr?: boolean;
  // Anúncios de vagas de corretor ficam à parte: não entram como vencedores
  // nem se misturam aos de imóvel.
  categoria?: "vendas" | "recrutamento";
};

export async function listarCriativos(f: Filtro): Promise<Criativo[]> {
  const db = sql();
  const ordem = {
    // Custo só vale com volume: quem tem menos de 10 resultados vai para o fim.
    custo: db`(resultados >= 10) desc, custo_por_resultado asc nulls last, resultados desc`,
    resultados: db`resultados desc, custo_por_resultado asc nulls last`,
    gasto: db`gasto desc`,
    recentes: db`criado_na_meta desc nulls last`,
  }[f.ordem ?? "custo"];
  return db<Criativo[]>`
    select ad_id, nome, status, campaign_id, campanha_nome, criado_na_meta::text, tipo, miniatura, imagem,
      titulo, texto, link_publicacao, gasto::float8 as gasto, impressoes::float8 as impressoes,
      resultados::float8 as resultados, tipo_resultado, favorito, oculto, nota,
      empreendimento_id::int as empreendimento_id, custo_por_resultado::float8 as custo_por_resultado,
      ctr::float8 as ctr, sincronizado_em::text, categoria, custo_teto::float8 as custo_teto
    from v_criativos
    where gasto > 0
      and oculto = ${f.ocultos ?? false}
      and categoria = ${f.categoria ?? "vendas"}
      ${f.empreendimento ? db`and empreendimento_id = ${f.empreendimento}` : db``}
      ${f.tipo ? db`and tipo = ${f.tipo}` : db``}
      ${f.favoritos ? db`and favorito` : db``}
      ${f.noAr ? db`and status = 'ACTIVE'` : db``}
    order by ${ordem}
    limit 120`;
}

export async function resumoBiblioteca() {
  const [r] = await sql()<
    { total: number; com_gasto: number; ultima: string | null }[]
  >`select count(*)::int total, count(*) filter (where gasto > 0)::int com_gasto,
      max(sincronizado_em)::text ultima from criativos`;
  return r;
}

export async function marcarCriativo(
  quem: string,
  adId: string,
  campo: "favorito" | "oculto",
  valor: boolean,
) {
  const db = sql();
  const [antes] = await db<{ favorito: boolean; oculto: boolean }[]>`
    select favorito, oculto from criativos where ad_id = ${adId}`;
  if (!antes) return;
  if (campo === "favorito")
    await db`update criativos set favorito = ${valor} where ad_id = ${adId}`;
  else await db`update criativos set oculto = ${valor} where ad_id = ${adId}`;
  await registrar(quem, `criativo_${campo}`, adId, { antes: antes[campo], depois: valor });
}

export async function anotarCriativo(quem: string, adId: string, nota: string) {
  const db = sql();
  const [antes] = await db<
    { nota: string | null }[]
  >`select nota from criativos where ad_id = ${adId}`;
  if (!antes) return;
  const nova = nota.trim().slice(0, 500) || null;
  await db`update criativos set nota = ${nova} where ad_id = ${adId}`;
  await registrar(quem, "criativo_nota", adId, { antes: antes.nota, depois: nova });
}
