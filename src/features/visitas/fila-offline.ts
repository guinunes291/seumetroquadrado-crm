// Fila de sincronização do Modo Visita.
//
// A visita acontece em estande, decorado e subsolo — lugares onde a conexão
// cai no meio do atendimento. Antes, concluir sem sinal devolvia um toast de
// erro e o corretor tinha que lembrar de refazer tudo depois; na prática, a
// visita não era registrada e o número não chegava ao relatório.
//
// Aqui a conclusão que falhou por FALTA DE REDE vira item de fila no próprio
// aparelho e sobe sozinha quando a conexão volta. Erro de REGRA (follow-up
// faltando, visita fora da carteira) não entra na fila: repetir não resolve, e
// enfileirar esconderia do corretor um problema que ele precisa corrigir agora.

const CHAVE = "modo-visita:fila";
/** Item mais velho que isto não sobe mais: subir visita de duas semanas atrás
 *  às cegas causaria mais confusão do que a perda do registro. */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

export type ItemFila = {
  /** Idempotência: a RPC já ignora reconclusão do mesmo agendamento. */
  agendamentoId: string;
  leadNome: string;
  payload: Record<string, unknown>;
  enfileiradoEm: number;
  tentativas: number;
};

function ler(): ItemFila[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const itens = JSON.parse(bruto) as ItemFila[];
    if (!Array.isArray(itens)) return [];
    return itens.filter((i) => Date.now() - i.enfileiradoEm <= VALIDADE_MS);
  } catch {
    return [];
  }
}

function gravar(itens: ItemFila[]) {
  if (typeof window === "undefined") return;
  try {
    if (itens.length === 0) window.localStorage.removeItem(CHAVE);
    else window.localStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch {
    // Storage cheio/bloqueado: seguir sem fila é melhor que travar a visita.
  }
}

export function listarFila(): ItemFila[] {
  return ler();
}

/** Enfileira (ou substitui) a conclusão pendente de um agendamento. */
export function enfileirar(item: Omit<ItemFila, "enfileiradoEm" | "tentativas">) {
  const itens = ler().filter((i) => i.agendamentoId !== item.agendamentoId);
  itens.push({ ...item, enfileiradoEm: Date.now(), tentativas: 0 });
  gravar(itens);
}

export function removerDaFila(agendamentoId: string) {
  gravar(ler().filter((i) => i.agendamentoId !== agendamentoId));
}

function marcarTentativa(agendamentoId: string) {
  gravar(
    ler().map((i) =>
      i.agendamentoId === agendamentoId ? { ...i, tentativas: i.tentativas + 1 } : i,
    ),
  );
}

/**
 * Falha que vale retentar depois: sem rede, servidor fora do ar, timeout.
 * Erro de regra do banco vem com `code` (PostgREST/Postgres) e é definitivo —
 * repetir só adiaria o problema para o corretor.
 */
export function ehFalhaDeRede(erro: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!erro || typeof erro !== "object") return false;
  const e = erro as { code?: unknown; message?: unknown; status?: unknown };
  // Erro do Postgres/PostgREST tem code alfanumérico ('22023', 'PGRST116').
  if (typeof e.code === "string" && e.code.trim() !== "") return false;
  const status = typeof e.status === "number" ? e.status : 0;
  if (status >= 500) return true;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout")
  );
}

export type ResultadoSincronizacao = { enviados: number; pendentes: number };

/**
 * Sobe a fila inteira. Item que falha de novo por rede permanece; item que
 * falha por regra sai da fila e é reportado — ele nunca vai subir sozinho.
 */
export async function sincronizarFila(
  enviar: (payload: Record<string, unknown>) => Promise<void>,
  aoDescartar?: (item: ItemFila, erro: unknown) => void,
): Promise<ResultadoSincronizacao> {
  const itens = ler();
  let enviados = 0;
  for (const item of itens) {
    try {
      await enviar(item.payload);
      removerDaFila(item.agendamentoId);
      enviados += 1;
    } catch (erro) {
      if (ehFalhaDeRede(erro)) {
        marcarTentativa(item.agendamentoId);
      } else {
        removerDaFila(item.agendamentoId);
        aoDescartar?.(item, erro);
      }
    }
  }
  return { enviados, pendentes: ler().length };
}
