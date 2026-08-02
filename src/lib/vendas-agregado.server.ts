// Fonte única de verdade para leitura agregada de VENDAS por período.
// Regra central: o período é sempre filtrado pela DATA DA VENDA
// (`vendas.data_assinatura`), nunca pela criação do lead nem pela data de
// aprovação. Distratos entram na contagem e saem do VGV.
import type { ApiClientContext } from "@/lib/api-client-auth.server";
import { restrictedCorretorIds } from "@/lib/api-client-auth.server";

export type VendaAgregadaItem = {
  id: string;
  lead_id: string | null;
  lead_nome: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  construtora: string | null;
  unidade: string | null;
  valor: number;
  data_venda: string;
  distrato: boolean;
  data_distrato: string | null;
};

export type VendasAgregado = {
  periodo: { desde: string; ate: string };
  totais: {
    vendas: number;
    vgv: number;
    ticket_medio: number;
    distratos: number;
    vgv_liquido_de_distrato: number;
  };
  por_corretor: Array<{
    corretor_id: string | null;
    corretor_nome: string | null;
    vendas: number;
    vgv: number;
  }>;
  por_projeto: Array<{
    projeto_id: string | null;
    projeto_nome: string | null;
    construtora: string | null;
    vendas: number;
    vgv: number;
  }>;
  vendas: VendaAgregadaItem[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
  aviso?: string;
};

const MAX_ROWS = 5000;

export function mesCorrente(now = new Date()) {
  const ini = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { desde: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lê as vendas aprovadas do período e devolve totais, quebras e a página de
 * itens. Nunca devolve "zero silencioso": quando não há linha alguma, o campo
 * `aviso` explica o motivo.
 */
export async function lerVendasAgregado(args: {
  auth: ApiClientContext;
  desde: string;
  ate: string;
  limit: number;
  offset: number;
}): Promise<VendasAgregado> {
  const { auth, desde, ate } = args;
  const limit = Math.min(Math.max(args.limit, 1), 500);
  const offset = Math.max(args.offset, 0);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin
    .from("vendas")
    .select(
      "id,lead_id,corretor_id,projeto_id,projeto_nome,valor_venda,data_assinatura,distrato,data_distrato,status_venda",
    )
    .eq("status_venda", "aprovada")
    .gte("data_assinatura", desde)
    .lte("data_assinatura", ate)
    .order("data_assinatura", { ascending: false })
    .limit(MAX_ROWS);

  if (auth.projetoId) query = query.eq("projeto_id", auth.projetoId);
  const equipeCorretorIds = await restrictedCorretorIds(auth);
  if (equipeCorretorIds) {
    query = query.in(
      "corretor_id",
      equipeCorretorIds.length ? equipeCorretorIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const linhas = data ?? [];

  // Rótulos: resolvidos em lote, sem PII sensível (só nome).
  const leadIds = [...new Set(linhas.map((v) => v.lead_id).filter(Boolean))] as string[];
  const corretorIds = [...new Set(linhas.map((v) => v.corretor_id).filter(Boolean))] as string[];
  const projetoIds = [...new Set(linhas.map((v) => v.projeto_id).filter(Boolean))] as string[];

  const [leadsRes, profilesRes, projetosRes] = await Promise.all([
    leadIds.length
      ? supabaseAdmin.from("leads").select("id,nome").in("id", leadIds)
      : Promise.resolve({ data: [], error: null } as const),
    corretorIds.length
      ? supabaseAdmin.from("profiles").select("id,nome").in("id", corretorIds)
      : Promise.resolve({ data: [], error: null } as const),
    projetoIds.length
      ? supabaseAdmin.from("projetos").select("id,nome,construtora").in("id", projetoIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const leadNome = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l.nome as string | null]));
  const corretorNome = new Map(
    (profilesRes.data ?? []).map((p: any) => [p.id, p.nome as string | null]),
  );
  const projeto = new Map(
    (projetosRes.data ?? []).map((p: any) => [
      p.id,
      { nome: p.nome as string | null, construtora: p.construtora as string | null },
    ]),
  );

  const itens: VendaAgregadaItem[] = linhas.map((v) => ({
    id: v.id,
    lead_id: v.lead_id,
    lead_nome: v.lead_id ? (leadNome.get(v.lead_id) ?? null) : null,
    corretor_id: v.corretor_id,
    corretor_nome: v.corretor_id ? (corretorNome.get(v.corretor_id) ?? null) : null,
    projeto_id: v.projeto_id,
    projeto_nome: v.projeto_id ? (projeto.get(v.projeto_id)?.nome ?? null) : v.projeto_nome,
    construtora: v.projeto_id ? (projeto.get(v.projeto_id)?.construtora ?? null) : null,
    // O CRM ainda não vincula a unidade vendida à venda (ver proposta no chat).
    unidade: null,
    valor: Number(v.valor_venda) || 0,
    data_venda: v.data_assinatura,
    distrato: Boolean(v.distrato),
    data_distrato: v.data_distrato ?? null,
  }));

  const validas = itens.filter((i) => !i.distrato);
  const vgv = round2(validas.reduce((s, i) => s + i.valor, 0));
  const distratos = itens.length - validas.length;
  const vgvDistratado = round2(
    itens.filter((i) => i.distrato).reduce((s, i) => s + i.valor, 0),
  );

  const porCorretor = new Map<string, { corretor_nome: string | null; vendas: number; vgv: number }>();
  const porProjeto = new Map<
    string,
    { projeto_nome: string | null; construtora: string | null; vendas: number; vgv: number }
  >();
  for (const i of validas) {
    const ck = i.corretor_id ?? "(sem_corretor)";
    const c = porCorretor.get(ck) ?? { corretor_nome: i.corretor_nome, vendas: 0, vgv: 0 };
    c.vendas++;
    c.vgv = round2(c.vgv + i.valor);
    porCorretor.set(ck, c);

    const pk = i.projeto_id ?? i.projeto_nome ?? "(sem_projeto)";
    const p = porProjeto.get(pk) ?? {
      projeto_nome: i.projeto_nome,
      construtora: i.construtora,
      vendas: 0,
      vgv: 0,
    };
    p.vendas++;
    p.vgv = round2(p.vgv + i.valor);
    porProjeto.set(pk, p);
  }

  const pagina = itens.slice(offset, offset + limit);
  const hasMore = offset + pagina.length < itens.length;

  const resultado: VendasAgregado = {
    periodo: { desde, ate },
    totais: {
      vendas: validas.length,
      vgv,
      ticket_medio: validas.length ? round2(vgv / validas.length) : 0,
      distratos,
      vgv_liquido_de_distrato: vgv,
    },
    por_corretor: [...porCorretor.entries()]
      .map(([corretor_id, v]) => ({
        corretor_id: corretor_id === "(sem_corretor)" ? null : corretor_id,
        ...v,
      }))
      .sort((a, b) => b.vgv - a.vgv),
    por_projeto: [...porProjeto.entries()]
      .map(([projeto_id, v]) => ({
        projeto_id: projeto_id.includes("-") && projeto_id.length === 36 ? projeto_id : null,
        ...v,
      }))
      .sort((a, b) => b.vgv - a.vgv),
    vendas: pagina,
    limit,
    offset,
    has_more: hasMore,
    next_offset: hasMore ? offset + pagina.length : null,
  };

  if (itens.length === 0) {
    resultado.aviso =
      "Nenhuma venda aprovada com data_assinatura no período informado. " +
      "Confira: (1) o período; (2) se as vendas do período estão aprovadas " +
      "(vendas pendentes/rejeitadas não entram); (3) restrições de equipe/projeto da credencial.";
  } else if (vgvDistratado > 0) {
    resultado.aviso = `${distratos} venda(s) com distrato (R$ ${vgvDistratado}) foram excluídas do VGV.`;
  }

  return resultado;
}
