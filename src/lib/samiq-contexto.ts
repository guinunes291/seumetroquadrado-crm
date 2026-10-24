// Memória de trabalho da conversa (v8) — PURO, sem rede.
//
// O histórico do WhatsApp é só texto: o id da Maria que buscar_clientes achou
// três mensagens atrás não volta para o modelo, e "ela", "a mesma", "o 2"
// ficavam sem dono. Aqui mora o que a Sami precisa lembrar ENTRE turnos,
// gravado em samiq_conversas.contexto pela RPC samiq_contexto_turno:
//  * clientes citados (id, nome, etapa), o mais recente primeiro;
//  * a numeração da última lista de pendentes (CONFIRMAR 2) e do último
//    recibo (DESFAZER 1) exatamente como o corretor viu;
//  * se a última mensagem da Sami pediu decisão (só então "sim"/"1"/"ok"
//    confirmam; senão "1" responde a uma pergunta, como "qual Maria?");
//  * a última localização e o último arquivo recebidos.

export type ClienteCitado = { id: string; nome: string | null; etapa?: string | null; em: string };

export type ContextoConversaSamiQ = {
  clientes?: ClienteCitado[];
  pendentes?: string[];
  executadas?: string[];
  pediu_decisao?: boolean;
  localizacao?: {
    latitude: number;
    longitude: number;
    precisao?: number | null;
    em: string;
  } | null;
  anexo_pendente?: string | null;
  /** Candidatos da última pergunta "qual Maria?" (a resposta "a 2" libera a trava). */
  ambiguos?: string[];
  /** Id da última mensagem do WhatsApp processada (retentativa do n8n não repete ação). */
  ultima_mensagem_id?: string | null;
  /** v8.2: marcadores [TELEFONE_n]/[EMAIL_n]/[CPF_n] da conversa, restauráveis por 30 min. */
  pii?: { mapa: Record<string, string>; em: string } | null;
};

export const SAMIQ_MAX_CLIENTES_CITADOS = 8;
/** Localização mandada há mais que isto não vale para o check-in. */
export const SAMIQ_LOCALIZACAO_VALIDA_MS = 15 * 60 * 1000;

export function lerContexto(valor: unknown): ContextoConversaSamiQ {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const v = valor as Record<string, unknown>;
  const ids = (x: unknown) =>
    Array.isArray(x) ? x.filter((i): i is string => typeof i === "string").slice(0, 20) : undefined;
  const clientes = Array.isArray(v.clientes)
    ? (v.clientes as unknown[])
        .filter(
          (c): c is ClienteCitado =>
            !!c && typeof c === "object" && typeof (c as ClienteCitado).id === "string",
        )
        .slice(0, SAMIQ_MAX_CLIENTES_CITADOS)
    : undefined;
  const loc = v.localizacao as ContextoConversaSamiQ["localizacao"];
  return {
    clientes,
    pendentes: ids(v.pendentes),
    executadas: ids(v.executadas),
    pediu_decisao: v.pediu_decisao === true,
    localizacao:
      loc &&
      typeof loc === "object" &&
      typeof loc.latitude === "number" &&
      typeof loc.longitude === "number"
        ? loc
        : null,
    anexo_pendente: typeof v.anexo_pendente === "string" ? v.anexo_pendente : null,
    ambiguos: ids(v.ambiguos),
    ultima_mensagem_id:
      typeof v.ultima_mensagem_id === "string" ? v.ultima_mensagem_id.slice(0, 200) : null,
    pii: lerPii(v.pii),
  };
}

function lerPii(valor: unknown): ContextoConversaSamiQ["pii"] {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as { mapa?: unknown; em?: unknown };
  if (!v.mapa || typeof v.mapa !== "object" || typeof v.em !== "string") return null;
  const mapa: Record<string, string> = {};
  for (const [k, val] of Object.entries(v.mapa as Record<string, unknown>)) {
    if (
      /^\[(TELEFONE|EMAIL|CPF)_\d{1,2}\]$/.test(k) &&
      typeof val === "string" &&
      val.length <= 200
    ) {
      mapa[k] = val;
    }
  }
  return Object.keys(mapa).length ? { mapa, em: v.em } : null;
}

/** Junta os citados agora com os de antes: sem repetir, o mais recente na frente. */
export function mesclarClientes(
  antes: ReadonlyArray<ClienteCitado> | undefined,
  agora: ReadonlyArray<Omit<ClienteCitado, "em">>,
  quando: Date = new Date(),
): ClienteCitado[] {
  const out: ClienteCitado[] = [];
  const vistos = new Set<string>();
  for (const c of agora) {
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    out.push({ ...c, em: quando.toISOString() });
  }
  for (const c of antes ?? []) {
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    out.push(c);
  }
  return out.slice(0, SAMIQ_MAX_CLIENTES_CITADOS);
}

/** "Maria Silva (id …, Agendado) · João Souza (id …)" — vai no cabeçalho do turno. */
export function textoClientesCitados(
  clientes: ReadonlyArray<ClienteCitado> | undefined,
  rotuloEtapa: (s: string) => string,
): string | null {
  if (!clientes?.length) return null;
  return clientes
    .map((c) => `${c.nome ?? "cliente"} (id ${c.id}${c.etapa ? `, ${rotuloEtapa(c.etapa)}` : ""})`)
    .join(" · ");
}

export function localizacaoValida(
  ctx: ContextoConversaSamiQ,
  agora: Date = new Date(),
): ContextoConversaSamiQ["localizacao"] {
  const l = ctx.localizacao;
  if (!l) return null;
  const t = Date.parse(l.em);
  if (Number.isNaN(t) || agora.getTime() - t > SAMIQ_LOCALIZACAO_VALIDA_MS) return null;
  return l;
}

/** Itens escolhidos ("1 e 3") sobre uma lista numerada; fora da faixa devolve null. */
export function escolherPorNumero(
  ids: ReadonlyArray<string>,
  numeros: ReadonlyArray<number>,
): string[] | null {
  if (numeros.length === 0) return [...ids];
  const out: string[] = [];
  for (const n of numeros) {
    const id = ids[n - 1];
    if (!id) return null;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fronteira tipada de samiq_conversas.contexto (coluna nova, fora dos types
// gerados até a plataforma regenerar) — holder estrutural, sem escape.

type ResultadoBanco<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;

type ConversaContextoQuery = {
  select(colunas: "contexto"): {
    eq(
      coluna: "id",
      valor: string,
    ): {
      eq(
        coluna: "user_id",
        valor: string,
      ): { maybeSingle(): ResultadoBanco<{ contexto: unknown }> };
    };
  };
};

export function conversasComContexto(client: { from: unknown }): ConversaContextoQuery {
  const from = client.from as (tabela: string) => ConversaContextoQuery;
  return from.call(client, "samiq_conversas");
}

/**
 * Candidatos das perguntas "qual cliente?" de UM turno. Duas listas
 * diferentes (duas Marias e dois Joões na mesma mensagem) = conflito: "a 2"
 * não saberia de qual lista, então nenhuma vale e o corretor diz o nome.
 */
export type CandidatoDaPergunta = {
  id: string;
  nome: string | null;
  empreendimento: string | null;
  etapa: string | null;
};

export type AmbiguosDoTurno = {
  lista: string[];
  conflito: boolean;
  /** v8.2: os candidatos com nome, para o canal imprimir a lista numerada. */
  candidatos?: CandidatoDaPergunta[];
};

export function anotarAmbiguos(
  estado: AmbiguosDoTurno,
  candidatos: ReadonlyArray<string | CandidatoDaPergunta>,
): void {
  const ids = candidatos.map((c) => (typeof c === "string" ? c : c.id));
  const outraLista =
    estado.lista.length > 0 &&
    (estado.lista.length !== ids.length || estado.lista.some((x, i) => x !== ids[i]));
  if (outraLista) estado.conflito = true;
  estado.lista = [...ids];
  const comNome = candidatos.filter((c): c is CandidatoDaPergunta => typeof c !== "string");
  estado.candidatos = comNome.length === ids.length ? comNome : undefined;
}

/** v8.2: candidatos que o canal deve listar (nenhum quando houve conflito). */
export function candidatosParaOCanal(estado: AmbiguosDoTurno): CandidatoDaPergunta[] {
  if (estado.conflito || !estado.candidatos) return [];
  return estado.candidatos;
}

/** O que vai para a memória da conversa (vazio quando houve conflito). */
export function ambiguosParaMemoria(estado: AmbiguosDoTurno): string[] {
  return estado.conflito ? [] : estado.lista;
}
