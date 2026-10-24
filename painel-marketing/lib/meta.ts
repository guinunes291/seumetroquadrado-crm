import "server-only";
import { sql } from "./db";
import { semTravessao } from "./formato";
import { registrar } from "./auditoria";

// Leitura da Meta (Fase 1 só lê). O token fica em META_ACCESS_TOKEN, no servidor.
// Nunca entra em URL de log, mensagem de erro ou resposta ao navegador.

const VERSAO = "v23.0";

type Acao = { action_type: string; value: string };
type Insight = {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions?: string;
  clicks?: string;
  actions?: Acao[];
  date_start: string;
  date_stop: string;
};
type Campanha = { id: string; name: string; effective_status: string; objective: string };

export class ErroMeta extends Error {
  constructor(
    public traduzido: string,
    public codigo?: number,
  ) {
    super(traduzido);
  }
}

// Tradução dos erros mais comuns da Graph API para o que fazer.
export function traduzirErroMeta(codigo?: number, sub?: number): string {
  if (codigo === 190)
    return "O acesso à Meta expirou ou foi revogado. Gere um token novo para o usuário do sistema.";
  if (codigo === 200 || codigo === 10 || codigo === 294)
    return "O token não tem a permissão necessária (ads_read para ler, ads_management para alterar). Libere a permissão no usuário do sistema.";
  if (codigo === 368)
    return "A Meta bloqueou a ação por política ou por segurança da conta. Veja a Qualidade da Conta no Business Suite.";
  if (codigo === 2635 || codigo === 2654)
    return "A Meta recusou a configuração do público (lista pequena demais, origem inválida ou termos pendentes).";
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613 || codigo === 80004)
    return "A Meta limitou o número de consultas. Tente de novo em alguns minutos.";
  if (codigo === 100) return "A Meta recusou a consulta (parâmetro inválido ou conta errada).";
  if (codigo === 2 || codigo === 1)
    return "A Meta ficou indisponível. Tente de novo em alguns minutos.";
  return `A Meta devolveu um erro (código ${codigo ?? "?"}${sub ? `/${sub}` : ""}).`;
}

function tokenMeta(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new ErroMeta("O Painel ainda não tem o token da Meta configurado.");
  return token;
}

export function contaAnuncios(): string {
  return process.env.META_AD_ACCOUNT_ID ?? "382684244661295";
}

type CorpoGraph = { error?: { code?: number; error_subcode?: number; error_user_msg?: string } };

function erroDoCorpo(corpo: CorpoGraph): ErroMeta {
  const e = corpo.error;
  const base = traduzirErroMeta(e?.code, e?.error_subcode);
  // error_user_msg é o texto que a própria Meta escreve para o anunciante; ajuda
  // a entender recusas de política ou de configuração.
  return new ErroMeta(
    e?.error_user_msg ? `${base} Detalhe da Meta: ${e.error_user_msg}` : base,
    e?.code,
  );
}

export async function graph<T>(caminho: string, params: Record<string, string>): Promise<T[]> {
  const token = tokenMeta();
  const itens: T[] = [];
  let url: string | null =
    `https://graph.facebook.com/${VERSAO}/${caminho}?` +
    new URLSearchParams({ ...params, limit: "500" });
  while (url) {
    const r: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const corpo = (await r.json()) as {
      data?: T[];
      paging?: { next?: string };
    } & CorpoGraph;
    if (!r.ok || corpo.error) throw erroDoCorpo(corpo);
    itens.push(...(corpo.data ?? []));
    url = corpo.paging?.next ?? null;
  }
  return itens;
}

// Resultado = lead de formulário; se não houver, conversa iniciada no WhatsApp
// (campanha de clique para conversar não conta "lead").
export function resultadoDe(acoes: Acao[] | undefined): { valor: number; tipo: string } {
  const pega = (t: string) => acoes?.find((a) => a.action_type === t);
  const lead = pega("lead") ?? pega("onsite_conversion.lead_grouped") ?? pega("leadgen.other");
  if (lead) return { valor: Number(lead.value), tipo: "lead_form" };
  const conversa = pega("onsite_conversion.messaging_conversation_started_7d");
  if (conversa) return { valor: Number(conversa.value), tipo: "conversa_whatsapp" };
  return { valor: 0, tipo: "nenhum" };
}

// Leitura de um objeto só (campanha, conjunto, público).
export async function graphObjeto<T>(caminho: string, campos: string): Promise<T> {
  const r = await fetch(
    `https://graph.facebook.com/${VERSAO}/${caminho}?` + new URLSearchParams({ fields: campos }),
    { headers: { Authorization: `Bearer ${tokenMeta()}` }, cache: "no-store" },
  );
  const corpo = (await r.json()) as T & CorpoGraph;
  if (!r.ok || corpo.error) throw erroDoCorpo(corpo);
  return corpo;
}

// Escrita na Meta. Nunca repete sozinha: se a resposta não chega, a mudança pode
// já ter sido aplicada, e repetir poderia duplicar campanha ou orçamento.
export class SemResposta extends ErroMeta {}

export async function graphPost<T>(caminho: string, params: Record<string, unknown>): Promise<T> {
  const corpoForm = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    corpoForm.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  let r: Response;
  try {
    r = await fetch(`https://graph.facebook.com/${VERSAO}/${caminho}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenMeta()}` },
      body: corpoForm,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new SemResposta(
      "A Meta não respondeu a tempo. A mudança pode ter sido aplicada: confira no Gerenciador de Anúncios antes de pedir de novo.",
    );
  }
  const corpo = (await r.json().catch(() => ({}))) as T & CorpoGraph;
  if (!r.ok || corpo.error) throw erroDoCorpo(corpo);
  return corpo;
}

export async function sincronizarMeta(quem: string) {
  const conta = contaAnuncios();
  const [campanhas, insights] = await Promise.all([
    graph<Campanha>(`act_${conta}/campaigns`, { fields: "id,name,effective_status,objective" }),
    graph<Insight>(`act_${conta}/insights`, {
      level: "campaign",
      date_preset: "last_30d",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
    }),
  ]);
  const porId = new Map(campanhas.map((c) => [c.id, c]));
  const db = sql();
  await db.begin(async (tx) => {
    for (const i of insights) {
      const c = porId.get(i.campaign_id);
      const nome = semTravessao(c?.name ?? i.campaign_name);
      await tx`
        insert into meta_campanhas (campaign_id, nome, status, objetivo)
        values (${i.campaign_id}, ${nome}, ${c?.effective_status ?? null}, ${c?.objective ?? null})
        on conflict (campaign_id) do update set nome = excluded.nome, status = excluded.status,
          objetivo = excluded.objetivo, atualizado_em = now()`;
      const r = resultadoDe(i.actions);
      await tx`
        insert into meta_insights (campaign_id, data_inicio, data_fim, gasto, impressoes, cliques, resultados, tipo_resultado, fonte)
        values (${i.campaign_id}, ${i.date_start}, ${i.date_stop}, ${Number(i.spend)},
          ${i.impressions ? Number(i.impressions) : null}, ${i.clicks ? Number(i.clicks) : null},
          ${r.valor}, ${r.tipo}, 'graph_api')
        on conflict (campaign_id, data_inicio, data_fim) do update set gasto = excluded.gasto,
          impressoes = excluded.impressoes, cliques = excluded.cliques, resultados = excluded.resultados,
          tipo_resultado = excluded.tipo_resultado, fonte = excluded.fonte, capturado_em = now()`;
    }
    // Campanha nova cujo nome bate com um apelido conhecido já entra ligada.
    await tx`
      update meta_campanhas c set empreendimento_id = a.empreendimento_id, vinculo = 'nome'
      from empreendimento_apelidos a
      where c.vinculo = 'pendente' and position(a.apelido in lower(c.nome)) > 0`;
  });
  await registrar(quem, "meta_sincronizada", `act_${conta}`, { campanhas: insights.length });
  return { campanhas: insights.length };
}
