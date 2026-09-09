import { z } from "zod";
import { agoraSaoPaulo, dateKey, startOfWeek } from "@/lib/periodo";
import {
  classificar,
  mapearRanking,
  ordenar,
  posicionar,
  type RankRow,
  type RankRowPosicionada,
} from "./ranking-derive";

const numero = z.coerce.number().finite();
const rowSchema = z.object({
  corretor_id: z.string(),
  nome: z.string().nullable(),
  foto: z.string().nullable(),
  equipe_id: z.string().nullable(),
  categoria: z.enum(["corretor", "gestao"]),
  pontuacao: numero,
  ligacoes: numero,
  whatsapps: numero,
  agendamentos: numero,
  visitas: numero,
  documentacoes: numero,
  vendas: numero,
  vgv: numero,
  leads: numero,
  alteracoes: numero,
});
export const snapshotSchema = z
  .object({
    versao: z.literal(1),
    gerado_em: z.string().datetime({ offset: true }),
    inicio: z.string(),
    fim: z.string(),
    escopo: z.enum(["operacao", "equipe", "individual"]),
    total_participantes: z.number().int().nonnegative(),
    rows: z.array(rowSchema),
    equipes: z.array(
      z.object({
        id: z.string(),
        nome: z.string(),
        gestor_id: z.string().nullable(),
        gestor_nome: z.string().nullable(),
        gestor_foto: z.string().nullable(),
      }),
    ),
    vendas: z.array(
      z.object({
        id: z.string(),
        corretor_id: z.string(),
        aprovado_em: z.string().nullable(),
        dia: z.string(),
        valor: numero,
      }),
    ),
    metas: z.array(
      z.object({
        corretor_id: z.string().nullable(),
        equipe_id: z.string().nullable(),
        meta_vendas: numero.nullable(),
        meta_visitas: numero.nullable(),
        meta_leads_atendidos: numero.nullable(),
        meta_gmv: numero.nullable(),
      }),
    ),
    pesos: z.array(
      z.object({ chave: z.string(), pontos: numero.nullable(), ativo: z.boolean().nullable() }),
    ),
    calendario: z.unknown(),
    coortes: z
      .array(z.object({ corretor_id: z.string(), leads: numero, convertidos: numero }))
      .default([]),
    coortes_desde: z.string().nullable().default(null),
  })
  .superRefine((s, ctx) => {
    if (
      s.rows.length !== s.total_participantes ||
      new Set(s.rows.map((r) => r.corretor_id)).size !== s.rows.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Classificação incompleta. Atualize para tentar novamente.",
      });
    }
  });
export type RankingSnapshot = z.infer<typeof snapshotSchema>;
export type Participante = RankRow & { categoria: "corretor" | "gestao" };
export type Classificado = RankRowPosicionada & { empatado: boolean };
export type GestorClassificado = Classificado & { equipes: string[]; integrantes: number };
export type VendaVerificada = RankingSnapshot["vendas"][number];

export function participantes(snapshot: RankingSnapshot): Participante[] {
  const perfis = new Map(
    snapshot.rows.map((r) => [
      r.corretor_id,
      { id: r.corretor_id, foto: r.foto, equipeId: r.equipe_id },
    ]),
  );
  const categorias = new Map(snapshot.rows.map((r) => [r.corretor_id, r.categoria]));
  return mapearRanking(snapshot.rows, perfis).map((r) => ({
    ...r,
    categoria: categorias.get(r.corretorId)!,
  }));
}

/** Sem vendas continua na lista, mas sem medalha ou posição comercial. */
export function classificacaoCompleta(
  rows: RankRow[],
  criterio: "vgv" | "pontos" = "vgv",
): Classificado[] {
  const classificados = posicionar(ordenar(rows, criterio), criterio);
  const contagem = new Map<number, number>();
  classificados.forEach((r) => contagem.set(r.pos, (contagem.get(r.pos) ?? 0) + 1));
  return classificados.map((r) => ({
    ...r,
    pos: r[criterio] > 0 ? r.pos : 0,
    empatado: r[criterio] > 0 && (contagem.get(r.pos) ?? 0) > 1,
  }));
}

/** Um gestor aparece uma vez, somando cada uma de suas equipes visíveis uma vez. */
export function classificarGestores(snapshot: RankingSnapshot): GestorClassificado[] {
  const rows = participantes(snapshot);
  const grupos = new Map<string, { row: RankRow; equipes: string[]; integrantes: number }>();
  for (const equipe of snapshot.equipes) {
    if (!equipe.gestor_id) continue;
    let grupo = grupos.get(equipe.gestor_id);
    if (!grupo) {
      grupo = {
        row: {
          corretorId: equipe.gestor_id,
          nome: equipe.gestor_nome || "Gestor sem nome",
          foto: equipe.gestor_foto,
          equipeId: null,
          pontos: 0,
          ligacoes: 0,
          whatsapp: 0,
          agendamentos: 0,
          visitas: 0,
          documentacoes: 0,
          vendas: 0,
          vgv: 0,
          leads: 0,
          alteracoes: 0,
        },
        equipes: [],
        integrantes: 0,
      };
      grupos.set(equipe.gestor_id, grupo);
    }
    grupo.equipes.push(equipe.nome);
    for (const r of rows.filter((r) => r.equipeId === equipe.id)) {
      grupo.row.vgv += r.vgv;
      grupo.row.vendas += r.vendas;
      grupo.integrantes++;
    }
  }
  return classificacaoCompleta([...grupos.values()].map((g) => g.row)).map((r) => ({
    ...r,
    equipes: grupos.get(r.corretorId)!.equipes,
    integrantes: grupos.get(r.corretorId)!.integrantes,
  }));
}

export function destaques(
  snapshot: RankingSnapshot,
  hoje: Date,
  janela: "dia" | "semana",
): Classificado[] {
  const inicio = janela === "dia" ? dateKey(hoje) : dateKey(startOfWeek(hoje));
  const fim = dateKey(hoje);
  const rows = participantes(snapshot)
    .filter((r) => r.categoria === "corretor")
    .map((r) => ({ ...r, vendas: 0, vgv: 0 }));
  const mapa = new Map(rows.map((r) => [r.corretorId, r]));
  for (const v of snapshot.vendas) {
    if (v.dia < inicio || v.dia > fim) continue;
    const r = mapa.get(v.corretor_id);
    if (r) {
      r.vendas++;
      r.vgv += v.valor;
    }
  }
  return classificacaoCompleta(rows).filter((r) => r.pos === 1);
}

export type TelaTV = {
  id: string;
  tipo: "podio" | "corretores" | "gestores" | "metas" | "produtividade" | "produtividade-resumo";
  pagina: number;
};
export const LINHAS_TV = 6;
/** Intercala as quatro famílias: listas longas não monopolizam a rotação. */
export function roteiroTV(corretores: number, gestores: number, paginasPodio = 1): TelaTV[] {
  const paginas = Math.max(1, Math.ceil(corretores / LINHAS_TV));
  const pgGestores = Math.max(1, Math.ceil(gestores / LINHAS_TV));
  const telas: TelaTV[] = [];
  for (let i = 0; i < Math.max(paginas, pgGestores, paginasPodio); i++) {
    if (i < paginas) telas.push({ id: `corretores-${i}`, tipo: "corretores", pagina: i });
    telas.push({ id: `podio-${i}`, tipo: "podio", pagina: i });
    if (i < pgGestores) telas.push({ id: `gestores-${i}`, tipo: "gestores", pagina: i });
    telas.push({ id: `metas-${i}`, tipo: "metas", pagina: 0 });
    if (i < paginas) telas.push({ id: `produtividade-${i}`, tipo: "produtividade", pagina: i });
  }
  // Começa pelo pódio, mantendo cada página das listas no ciclo.
  const primeiroPodio = telas.splice(1, 1)[0];
  return [
    primeiroPodio,
    { id: "produtividade-resumo", tipo: "produtividade-resumo", pagina: 0 },
    ...telas,
  ];
}

export type Conquista = {
  id: string;
  corretorId: string;
  titulo: string;
  detalhes: string[];
  valor: number;
};
/** Só uma aprovação nova, identificada no ledger e posterior ao snapshot anterior, pode celebrar. */
export function novasConquistas(
  anterior: RankingSnapshot | null,
  atual: RankingSnapshot,
  vistos: ReadonlySet<string>,
): Conquista[] {
  if (
    !anterior ||
    anterior.inicio !== atual.inicio ||
    anterior.fim !== atual.fim ||
    anterior.escopo !== atual.escopo
  )
    return [];
  const agora = agoraSaoPaulo(new Date(atual.gerado_em));
  if (!atual.inicio.startsWith(dateKey(agora).slice(0, 7))) return [];
  const antes = participantes(anterior);
  const depois = participantes(atual);
  // Troca de escopo, função ou equipe não é conquista comercial.
  const assinatura = (s: Participante[]) =>
    s
      .map((r) => `${r.corretorId}:${r.equipeId}:${r.categoria}`)
      .sort()
      .join("|");
  if (assinatura(antes) !== assinatura(depois)) return [];
  const idsAntes = new Set(anterior.vendas.map((v) => v.id));
  const posAntes = new Map(
    classificar(
      antes.filter((r) => r.categoria === "corretor"),
      "vgv",
    ).map((r) => [r.corretorId, r.pos]),
  );
  const posDepois = new Map(
    classificar(
      depois.filter((r) => r.categoria === "corretor"),
      "vgv",
    ).map((r) => [r.corretorId, r.pos]),
  );
  return atual.vendas.flatMap((v) => {
    const id = `${atual.inicio}:venda:${v.id}`;
    const quando = Date.parse(v.aprovado_em ?? "");
    const atualizado = Date.parse(atual.gerado_em);
    if (
      idsAntes.has(v.id) ||
      vistos.has(id) ||
      !Number.isFinite(quando) ||
      quando <= Date.parse(anterior.gerado_em) ||
      quando > atualizado ||
      atualizado - quando > 10 * 60_000
    )
      return [];
    const a = antes.find((r) => r.corretorId === v.corretor_id);
    const b = depois.find((r) => r.corretorId === v.corretor_id);
    if (!a || !b || b.vendas <= a.vendas || b.vgv <= a.vgv) return [];
    const detalhes: string[] = [];
    const p1 = posAntes.get(b.corretorId);
    const p2 = posDepois.get(b.corretorId);
    if (p1 && p2 && p2 < p1) detalhes.push(`Subiu para a ${p2}ª posição`);
    if (a.vendas === 0) detalhes.push("Primeira venda do mês");
    const meta = atual.metas.find((m) => m.corretor_id === b.corretorId);
    const metaAntes = anterior.metas.find((m) => m.corretor_id === b.corretorId);
    const mesmaMeta =
      meta &&
      metaAntes &&
      meta.meta_gmv === metaAntes.meta_gmv &&
      meta.meta_vendas === metaAntes.meta_vendas;
    const cruzou =
      mesmaMeta &&
      ((Number(meta.meta_gmv) > 0 &&
        a.vgv < Number(meta.meta_gmv) &&
        b.vgv >= Number(meta.meta_gmv)) ||
        (Number(meta.meta_vendas) > 0 &&
          a.vendas < Number(meta.meta_vendas) &&
          b.vendas >= Number(meta.meta_vendas)));
    if (cruzou) detalhes.push("Meta individual atingida");
    return [
      {
        id,
        corretorId: b.corretorId,
        titulo: cruzou ? "Meta conquistada!" : "Nova venda aprovada!",
        detalhes,
        valor: v.valor,
      },
    ];
  });
}

/** Taxa observada na mesma coorte de leads; nenhuma etapa é inferida de eventos. */
export function conversaoCorretor(snapshot: RankingSnapshot, id: string) {
  const coorte = snapshot.coortes.find((c) => c.corretor_id === id);
  if (
    !snapshot.coortes_desde ||
    snapshot.inicio < snapshot.coortes_desde ||
    !coorte ||
    coorte.leads <= 0 ||
    coorte.convertidos < 0 ||
    coorte.convertidos > coorte.leads
  )
    return null;
  return { ...coorte, pct: (coorte.convertidos / coorte.leads) * 100 };
}

/** Código PostgREST/Postgres da falha do RPC, quando o erro veio do banco. */
export function codigoDaFalha(erro: unknown): string {
  return typeof erro === "object" && erro !== null && "code" in erro
    ? String((erro as { code?: unknown }).code ?? "")
    : "";
}

/**
 * Cada causa pede uma ação diferente, e mandar "verifique a conexão" quando a
 * função não existe no banco faz o operador procurar no lugar errado — foi o
 * que aconteceu com a migration do campeonato que não chegou a rodar. Só rede
 * e indisponibilidade justificam nova tentativa; o resto nomeia o bloqueio.
 */
export function mensagemDeFalha(erro: unknown, temSnapshot: boolean): string {
  if (temSnapshot) return "Não foi possível atualizar. A última leitura válida permanece na tela.";
  const codigo = codigoDaFalha(erro);
  if (codigo === "PGRST202")
    return "O campeonato ainda não está disponível neste ambiente: a função ranking_campeonato não existe no banco. Não é a sua conexão — avise a gestão para aplicar a migration pendente.";
  if (codigo === "42501" || codigo === "PGRST301")
    return "Sua conta não tem acesso ao campeonato agora. Se isso é inesperado, fale com a gestão.";
  if (codigo === "22023") return "Período inválido para o campeonato. Escolha outro mês.";
  if (erro instanceof z.ZodError)
    return "A leitura do campeonato veio incompleta. Atualize para tentar novamente.";
  return "Não foi possível carregar o campeonato. Verifique a conexão e tente novamente.";
}

/** Função ausente ou acesso negado não muda por insistência: repetir só atrasa a tela. */
export function valeTentarDeNovo(erro: unknown): boolean {
  return !["PGRST202", "PGRST301", "42501", "22023"].includes(codigoDaFalha(erro));
}
