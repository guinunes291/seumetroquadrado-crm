// Regras de casamento de telefone e de "lead vivo" compartilhadas pelas rotas
// públicas de lead. Este arquivo existe porque as rotas divergiram na prática:
//
//   F-071 — GET /api/public/leads filtrava `na_lixeira = false`; o resolvedor de
//           POST /api/public/documentos não filtrava. Consequência: documento de
//           cliente podia ser anexado a um lead na lixeira (onde ninguém olha),
//           e as duas rotas contavam quantidades diferentes para o mesmo telefone.
//
//   F-063 — o `q` do GET buscava substring no texto cru de `telefone`. Com o
//           telefone armazenado formatado ("(11) 98477-0862" — padrão dos leads
//           importados), procurar por dígitos ("984770862") devolvia total 0 para
//           um lead que EXISTE, enquanto o POST achava o mesmo lead sem problema.
//
// A correção das duas é a mesma: uma única definição, importada pelas duas rotas.
// Quem alterar o critério aqui altera nas duas ao mesmo tempo — que é o ponto.
// O contrato está travado por teste em tests/lead-busca-telefone.test.ts.

export function apenasDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Um lead só é alvo das rotas públicas se estiver VIVO: fora da lixeira e não
 * excluído. Usar isto em vez de repetir os dois filtros é o conserto do F-071.
 */
export function filtrarLeadVivo<Q>(query: Q): Q {
  // O builder do supabase-js tipa `eq` pelas colunas do schema; aqui ele chega
  // genérico (a rota já o construiu), então a chamada é destipada de propósito e
  // o tipo de entrada é devolvido intacto para o encadeamento seguir funcionando.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).eq("na_lixeira", false).is("deleted_at", null) as Q;
}

/**
 * Sufixos de busca, do mais específico para o menos: 9 dígitos (celular com o
 * 9º) e 8 dígitos (fixo / legado sem o 9º). Ignora 55 e DDD de propósito — o
 * mesmo número aparece na base com e sem eles.
 */
export function sufixosTelefone(telefone: string | null | undefined): string[] {
  const d = apenasDigitos(telefone);
  if (d.length < 8) return [];
  const out: string[] = [];
  if (d.length >= 9) out.push(d.slice(-9));
  out.push(d.slice(-8));
  return out;
}

/** Um termo de busca livre só é tratado como telefone se tiver dígitos suficientes. */
export function pareceTelefone(termo: string | null | undefined): boolean {
  return apenasDigitos(termo).length >= 8;
}

/**
 * Fragmento `.or()` do PostgREST que casa um sufixo em DUAS colunas:
 *   - `telefone_e164`, que a trigger `sync_lead_telefone_e164` mantém em dígitos
 *     puros — é ela que faz a busca por dígitos funcionar contra texto formatado;
 *   - `telefone`, o texto cru, para as linhas em que a normalização devolveu NULL
 *     (número curto/inválido, que `normalize_phone_smq` recusa).
 * O sufixo é dígito puro, então não há curinga de LIKE nem separador de `.or()`
 * para escapar.
 */
export function filtroOrTelefone(sufixo: string): string {
  return `telefone.ilike.%${sufixo},telefone_e164.ilike.%${sufixo}`;
}

/**
 * Confirmação em memória do que o banco devolveu por ILIKE. Compara dígito a
 * dígito, então "(11) 98477-0862" casa com "984770862" — a comparação que o
 * `q` do GET não fazia (F-063).
 */
export function casaTelefone(armazenado: string | null | undefined, sufixo: string): boolean {
  return apenasDigitos(armazenado).endsWith(sufixo);
}

/**
 * Filtro de busca livre do GET /api/public/leads. Quando o termo parece um
 * telefone, casa por dígitos nas duas colunas de telefone ALÉM da busca textual
 * de sempre — nome e e-mail continuam valendo, porque o mesmo `q` serve aos dois
 * usos e um termo numérico ainda pode aparecer num nome.
 *
 * `escapar` é injetado (escapeLike) para este módulo não depender de validators.
 */
export function filtroBuscaLead(termo: string, escapar: (v: string) => string): string {
  // `,` `(` `)` são separadores do .or() do PostgREST; `%` e `_` são curingas.
  const s = escapar(termo.trim().replace(/[,()]/g, " "));
  const like = `%${s}%`;
  const partes = [`nome.ilike.${like}`, `email.ilike.${like}`, `telefone.ilike.${like}`];
  if (pareceTelefone(termo)) {
    for (const suf of sufixosTelefone(termo)) partes.push(filtroOrTelefone(suf));
  }
  return partes.join(",");
}

export type LeadMin = {
  id: string;
  nome: string | null;
  telefone: string | null;
  corretor_id: string | null;
};

/**
 * Casa lead pelos últimos 8-9 dígitos do telefone (ignora 55, DDD e 9º).
 * Só considera lead VIVO (F-071). Quando mais de um casa, escolhe o de
 * `ultima_interacao` mais recente e sinaliza `ambiguo: true` — o automatizador
 * decide se prossegue ou pede confirmação.
 */
export async function resolverLeadPorTelefone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  telefone: string,
): Promise<{ lead: LeadMin; ambiguo: boolean } | null> {
  const sufixos = sufixosTelefone(telefone);
  if (!sufixos.length) return null;

  for (const suf of sufixos) {
    const { data } = await filtrarLeadVivo(
      supabase
        .from("leads")
        .select("id, nome, telefone, corretor_id, ultima_interacao, deleted_at, na_lixeira")
        .or(filtroOrTelefone(suf)),
    )
      .order("ultima_interacao", { ascending: false, nullsFirst: false })
      .limit(10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches = (data ?? []).filter((l: any) => casaTelefone(l.telefone, suf));
    if (matches.length >= 1) {
      return {
        lead: {
          id: matches[0].id,
          nome: matches[0].nome,
          telefone: matches[0].telefone,
          corretor_id: matches[0].corretor_id,
        },
        ambiguo: matches.length > 1,
      };
    }
  }
  return null;
}
