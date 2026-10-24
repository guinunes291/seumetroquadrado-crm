// Trava de homônimos da Sami — a parte PURA (sem rede, sem banco).
//
// Problema: o corretor diz "liguei pro Lucas" e a carteira tem dois Lucas. A
// regra "pergunte qual antes de propor" vivia só no prompt, então dependia do
// modelo obedecer. Aqui ela vira código: uma proposta para um cliente que tem
// homônimo (mesmo primeiro nome) na carteira só é aceita se o texto do
// corretor trouxer algo que aponte para AQUELE cliente e não para os outros:
//   - um pedaço do nome que só ele tem (sobrenome);
//   - uma palavra do empreendimento de interesse que só ele tem;
//   - os 4 últimos dígitos do telefone dele.
// Sem isso, a ferramenta de proposta devolve `cliente_ambiguo` com a lista de
// candidatos e o modelo é obrigado a perguntar.
//
// O texto avaliado é o texto CRU do corretor (antes da redação de PII), porque
// a redação troca nome completo por [NOME] e telefone por [TELEFONE]. Ele não
// vai para o modelo: só é comparado aqui, no servidor.

export type ClienteParaDesambiguar = {
  id: string;
  nome: string | null;
  projeto_nome: string | null;
  status?: string | null;
  telefone?: string | null;
  telefone_e164?: string | null;
};

export type ResultadoDesambiguacao =
  | { ok: true; motivo: "sem_homonimo" | "sobrenome" | "empreendimento" | "final_telefone" }
  | { ok: false; motivo: "ambiguo" };

/** Palavras que nunca distinguem um cliente de outro. */
const PALAVRAS_NEUTRAS = new Set([
  "da",
  "de",
  "do",
  "das",
  "dos",
  "e",
  "di",
  "du",
  "del",
  "van",
  "von",
  "residencial",
  "condominio",
  "edificio",
  "torre",
  "parque",
  "jardim",
  "vila",
  "home",
  "club",
  "clube",
  "the",
]);

export function normalizarTexto(valor: string | null | undefined): string {
  return (valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Palavras (só letras) com 3+ caracteres, sem acento e em minúsculas. */
export function tokensDe(valor: string | null | undefined): string[] {
  return normalizarTexto(valor)
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3 && !PALAVRAS_NEUTRAS.has(t));
}

export function primeiroNomeNormalizado(nome: string | null | undefined): string | null {
  const primeiro = normalizarTexto(nome)
    .trim()
    .split(/[^a-z]+/)
    .find(Boolean);
  return primeiro && primeiro.length >= 2 ? primeiro : null;
}

function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Últimos 4 dígitos do telefone do cliente (e164 primeiro, texto cru depois). */
export function finalTelefone(cliente: {
  telefone?: string | null;
  telefone_e164?: string | null;
}): string | null {
  const d = soDigitos(cliente.telefone_e164) || soDigitos(cliente.telefone);
  return d.length >= 8 ? d.slice(-4) : null;
}

/** Sequências numéricas do texto (aceita "98765-4321", "4321", "9 8765 4321"). */
function numerosDoTexto(texto: string): string[] {
  return (texto.match(/\d[\d\s.-]*\d|\d/g) ?? []).map(soDigitos).filter((d) => d.length >= 4);
}

/** Mesmo primeiro nome, ids diferentes. */
export function filtrarHomonimos<T extends ClienteParaDesambiguar>(
  alvo: ClienteParaDesambiguar,
  candidatos: ReadonlyArray<T>,
): T[] {
  const primeiro = primeiroNomeNormalizado(alvo.nome);
  if (!primeiro) return [];
  return candidatos.filter((c) => c.id !== alvo.id && primeiroNomeNormalizado(c.nome) === primeiro);
}

/**
 * O texto do corretor aponta para o `alvo` e não para os `homonimos`?
 * Só conta o que é EXCLUSIVO do alvo: sobrenome ou palavra de empreendimento
 * que nenhum homônimo tem, ou o final de telefone que só ele tem.
 */
export function avaliarDesambiguacao(args: {
  alvo: ClienteParaDesambiguar;
  homonimos: ReadonlyArray<ClienteParaDesambiguar>;
  texto: string;
}): ResultadoDesambiguacao {
  const { alvo, homonimos, texto } = args;
  if (homonimos.length === 0) return { ok: true, motivo: "sem_homonimo" };

  const doTexto = new Set(tokensDe(texto));
  const primeiro = primeiroNomeNormalizado(alvo.nome);

  const dosOutros = new Set<string>();
  for (const h of homonimos) {
    for (const t of tokensDe(h.nome)) dosOutros.add(t);
    for (const t of tokensDe(h.projeto_nome)) dosOutros.add(t);
  }

  const sobrenomes = tokensDe(alvo.nome).filter((t) => t !== primeiro && !dosOutros.has(t));
  if (sobrenomes.some((t) => doTexto.has(t))) return { ok: true, motivo: "sobrenome" };

  const doProjeto = tokensDe(alvo.projeto_nome).filter((t) => !dosOutros.has(t));
  if (doProjeto.some((t) => doTexto.has(t))) return { ok: true, motivo: "empreendimento" };

  const final = finalTelefone(alvo);
  if (final && !homonimos.some((h) => finalTelefone(h) === final)) {
    if (numerosDoTexto(texto).some((n) => n.endsWith(final))) {
      return { ok: true, motivo: "final_telefone" };
    }
  }

  return { ok: false, motivo: "ambiguo" };
}

/**
 * O que o modelo recebe para perguntar ao corretor. Telefone fica de fora,
 * nem os últimos dígitos (contrato de governança: contato do cliente nunca vai
 * ao modelo). O final do telefone continua valendo do lado do corretor: se ele
 * responder "o final 4321", a trava confere aqui no servidor.
 */
export function candidatosParaPergunta(
  clientes: ReadonlyArray<ClienteParaDesambiguar>,
  nomeSeguro: (nome: string | null) => string | null,
): Array<{
  id: string;
  nome: string | null;
  empreendimento: string | null;
  etapa: string | null;
}> {
  return clientes.slice(0, 8).map((c) => ({
    id: c.id,
    nome: nomeSeguro(c.nome),
    empreendimento: c.projeto_nome ?? null,
    etapa: c.status ?? null,
  }));
}

export const INSTRUCAO_CLIENTE_AMBIGUO =
  "Existe mais de um cliente com esse nome na carteira e o corretor ainda não disse qual. Não proponha nada agora. Pergunte qual é, listando cada candidato com nome completo, empreendimento e etapa, e peça para ele responder com o sobrenome, o empreendimento ou os 4 últimos dígitos do telefone do cliente.";
