// Leitura da carteira por corretor, separada em ativa / prospecção / parada.
//
// A RPC `carteira_stats_por_corretor_v1` (migrations 20260914170000 e
// 20260914180000) responde uma pergunta diferente da antiga
// `leads_stats_por_corretor`: em vez de "quantos leads ele tem", ela diz
// **quantos estão em tratativa dentro do teto**, quantos passam do teto,
// quantos ainda são topo de funil e quantos são peso morto.
//
// Passa pela fronteira `rpc` de features/dashboard/queries para não gastar o
// budget de escapes de tipo (checado em CI), e o retorno é validado com zod
// FAIL-CLOSED. Banco antigo: `rpcWithFallback` devolve null e a tela cai na
// leitura anterior, nunca em zeros silenciosos.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";

export const CARTEIRA_STATS_KEY = "carteira-stats-corretor";

const linhaSchema = z.object({
  corretor_id: z.string().uuid().nullable(),
  // bigint chega como string pelo PostgREST.
  total: z.coerce.number().int(),
  ativa: z.coerce.number().int(),
  prospeccao: z.coerce.number().int(),
  parada: z.coerce.number().int(),
  fundo: z.coerce.number().int(),
  ganhos: z.coerce.number().int(),
  perdidos: z.coerce.number().int(),
  // Colunas do teto (20260914180000). OPCIONAIS de propósito: com a migration
  // anterior aplicada e esta não, a linha chega sem elas — e a tela tem que
  // continuar mostrando tratativa/parada em vez de quebrar inteira por causa
  // de um número a mais. Ausente ≠ zero: `teto` ausente esconde a leitura de
  // teto, não afirma que o teto é zero.
  acima_do_teto: z.coerce.number().int().optional(),
  teto: z.coerce.number().int().positive().optional(),
  dias_atendimento: z.coerce.number().int().positive().optional(),
  dias_avancado: z.coerce.number().int().positive().optional(),
});

export type CarteiraStats = z.infer<typeof linhaSchema>;

export function parseCarteiraStats(input: unknown): CarteiraStats[] {
  return z.array(linhaSchema).parse(input ?? []);
}

export const SEM_DONO = "__unassigned__";

/** Indexa por corretor, com os sem dono sob `SEM_DONO`. */
export function indexarPorCorretor(linhas: readonly CarteiraStats[]): Map<string, CarteiraStats> {
  const m = new Map<string, CarteiraStats>();
  for (const l of linhas) m.set(l.corretor_id ?? SEM_DONO, l);
  return m;
}

/** O que passa do teto. Banco antigo não manda a coluna: aí é zero conhecido. */
export function excedente(s: CarteiraStats): number {
  return s.acima_do_teto ?? 0;
}

/**
 * "32 de 65 em tratativa" — o teto entra na frase porque o número sozinho não
 * diz se o corretor está com espaço ou estourado, que é a única pergunta que
 * o gestor faz olhando esse card. Sem teto na resposta (banco antigo), volta a
 * ser só o número: melhor não dizer nada do que inventar um denominador.
 */
export function textoTratativa(s: CarteiraStats): string {
  return s.teto ? `${s.ativa} de ${s.teto} em tratativa` : `${s.ativa} em tratativa`;
}

/**
 * A frase do card. Ela existe para o gestor ler a carteira em uma linha, e a
 * ordem das partes é a ordem da conversa que ele vai ter com o corretor:
 * primeiro o que está vivo, depois o que estoura o teto, depois o que está
 * parando, depois o topo de funil.
 */
export function fraseDaCarteira(s: CarteiraStats): string {
  const partes = [textoTratativa(s)];
  const acima = excedente(s);
  if (acima > 0) partes.push(`+${acima} acima do teto`);
  if (s.parada > 0) partes.push(`${s.parada} parados`);
  if (s.prospeccao > 0) partes.push(`${s.prospeccao} em prospecção`);
  return partes.join(" · ");
}

/**
 * Quanto da carteira "de verdade" está parado. É o número que decide se a
 * conversa com o corretor é sobre volume ou sobre disciplina — e o
 * denominador exclui prospecção de propósito: lead que nunca teve primeiro
 * contato não está parado, está na fila.
 *
 * O excedente ENTRA no denominador. Ele é tratativa de verdade, só não cabe
 * no teto; deixá-lo de fora faria 10 parados em 100 tratativas aparecerem
 * como 13% em vez de 10%.
 */
export function pctParada(s: CarteiraStats): number | null {
  const denom = s.ativa + excedente(s) + s.parada;
  if (denom === 0) return null;
  return Math.round((100 * s.parada) / denom);
}

export type TomCarteira = "saudavel" | "atencao" | "critico";

/** Acima de 70% parada a carteira é um cemitério; abaixo de 30% está sob
 *  controle. Os cortes são de leitura, não de regra — quem devolve lead é a
 *  régua de posse, não esta tela. */
export function tomDaCarteira(s: CarteiraStats): TomCarteira | null {
  const pct = pctParada(s);
  if (pct === null) return null;
  if (pct >= 70) return "critico";
  if (pct >= 30) return "atencao";
  return "saudavel";
}

// ---------------------------------------------------------------------------
// Escopo da LISTA de leads
// ---------------------------------------------------------------------------
// Os cards contam; a lista mostra. Enquanto a lista mostrar a base inteira,
// ela continua sendo dominada por "Aguardando Atendimento" — que é prospecção,
// não carteira. O escopo abaixo é a mesma classificação da RPC, reproduzida no
// cliente para filtrar a tabela.
//
// Os prazos NÃO são fixados aqui: vêm da própria resposta da RPC
// (`dias_atendimento` / `dias_avancado`), que por sua vez os lê de
// `distribuicao_settings`. Sem os prazos na resposta, não há escopo — a tela
// mostra tudo, como antes, em vez de filtrar por um prazo chutado.

export const STATUS_PROSPECCAO = ["novo", "aguardando_atendimento", "aguardando_corretor"] as const;
export const STATUS_FUNDO = [
  "agendado",
  "visita_realizada",
  "proposta_enviada",
  "analise_credito",
] as const;
export const STATUS_FECHADO = ["contrato_fechado", "pos_venda", "perdido"] as const;

export type GrupoCarteira = "prospeccao" | "tratativa" | "parado" | "fechado";
export type EscopoCarteira = "tratativa" | "parados" | "todos";

export type LeadParaEscopo = {
  status: string;
  created_at: string;
  ultima_interacao?: string | null;
  ultimo_contato?: string | null;
};

export type PrazosDaCasa = { atendimento: number; avancado: number };

/** Os prazos são da casa, não do corretor: qualquer linha serve, e a primeira
 *  que os traz responde. Nenhuma linha traz (banco antigo) → sem escopo. */
export function prazosDaCasa(linhas: readonly CarteiraStats[]): PrazosDaCasa | null {
  for (const l of linhas) {
    if (l.dias_atendimento && l.dias_avancado) {
      return { atendimento: l.dias_atendimento, avancado: l.dias_avancado };
    }
  }
  return null;
}

/** Mesmo relógio da higiene, da Fila Única e do Bolsão:
 *  `COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at)`. */
export function paradoDesde(l: LeadParaEscopo): number {
  const t = (s: string | null | undefined) => (s ? Date.parse(s) : Number.NaN);
  const ultimos = [t(l.ultima_interacao), t(l.ultimo_contato)].filter((n) => !Number.isNaN(n));
  if (ultimos.length > 0) return Math.max(...ultimos);
  return Date.parse(l.created_at);
}

/** A classificação da RPC, lead a lead. O prazo depende da fase: fundo do
 *  funil tem `avancado` dias, o resto tem `atendimento`. */
export function grupoDoLead(
  l: LeadParaEscopo,
  prazos: PrazosDaCasa,
  agora: number = Date.now(),
): GrupoCarteira {
  if ((STATUS_FECHADO as readonly string[]).includes(l.status)) return "fechado";
  if ((STATUS_PROSPECCAO as readonly string[]).includes(l.status)) return "prospeccao";
  const dias = (STATUS_FUNDO as readonly string[]).includes(l.status)
    ? prazos.avancado
    : prazos.atendimento;
  const limite = agora - dias * 86_400_000;
  return paradoDesde(l) > limite ? "tratativa" : "parado";
}

/** Filtra a lista pelo escopo escolhido. "todos" não filtra nada — é a saída
 *  de emergência do gestor que precisa achar um lead que não está em nenhum
 *  dos dois grupos (prospecção, ganho, perdido). */
export function filtrarPorEscopo<T extends LeadParaEscopo>(
  leads: readonly T[],
  escopo: EscopoCarteira,
  prazos: PrazosDaCasa | null,
  agora: number = Date.now(),
): T[] {
  if (escopo === "todos" || prazos === null) return [...leads];
  const alvo: GrupoCarteira = escopo === "tratativa" ? "tratativa" : "parado";
  return leads.filter((l) => grupoDoLead(l, prazos, agora) === alvo);
}

export function useCarteiraStats() {
  return useQuery({
    queryKey: [CARTEIRA_STATS_KEY],
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<CarteiraStats[] | null>(
        async () => {
          const { data, error } = await rpc("carteira_stats_por_corretor_v1", {});
          if (error) throw error;
          return parseCarteiraStats(data);
        },
        () => null,
      ),
  });
}
