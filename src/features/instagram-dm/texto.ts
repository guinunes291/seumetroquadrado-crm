// Regras puras da automação de DM do Instagram (Zernio): achar a palavra-chave,
// ler as respostas da qualificação e decidir o próximo passo da conversa.
// Sem banco e sem rede, para ser testável em unidade — o servidor
// (src/lib/instagram-dm.server.ts) só executa o que este módulo decide.

/** Etapas da conversa. "aguardando_*" é a pergunta que a pessoa ainda deve responder. */
export const ETAPAS = [
  "aguardando_renda",
  "aguardando_regiao",
  "aguardando_prazo",
  "aguardando_whatsapp",
  "concluida",
  "sem_whatsapp",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export function etapaAberta(etapa: string): boolean {
  return etapa.startsWith("aguardando_");
}

/**
 * Textos da conversa depois da abertura. A abertura é de cada palavra-chave
 * (cada post tem seu assunto); o resto do roteiro é o mesmo para todas.
 * Placeholders: {nome} (primeiro nome) e {palavra}.
 */
export type TextosConversa = {
  renda_de_novo: string;
  regiao: string;
  prazo: string;
  whatsapp: string;
  whatsapp_invalido: string;
  fechamento: string;
  sem_whatsapp: string;
};

export const TEXTOS_PADRAO: TextosConversa = {
  renda_de_novo:
    "Oi! 😊 Pra eu já separar sua simulação: qual é a renda bruta da família, somando quem vai comprar junto?",
  regiao: "Anotado! E em qual região ou bairro você quer morar?",
  prazo:
    "Boa! Pra quando você pensa em se mudar? Pode ser 'o quanto antes', 'este ano' ou 'sem pressa'.",
  whatsapp:
    "Perfeito! Me passa seu WhatsApp com DDD? Um especialista do time te chama lá com a sua simulação.",
  whatsapp_invalido: "Acho que faltou algum número 😅 Me manda com DDD, tipo 11 91234-5678.",
  fechamento:
    "Pronto, {nome}! Já passei tudo pro time. Um especialista da SMQ vai te chamar no WhatsApp. Se tiver dúvida, é só responder aqui.",
  sem_whatsapp:
    "Sem problema, {nome}! Um especialista da SMQ vai continuar com você aqui pelo direct.",
};

export const ABERTURA_PADRAO =
  "Oi, {nome}! Aqui é o Gui, da Seu Metro Quadrado 👋\n" +
  "Vi seu comentário e vou separar sua simulação do Minha Casa Minha Vida.\n" +
  "São só 3 perguntas rápidas.\n" +
  "Primeira: qual é a renda bruta da família, somando quem vai comprar junto?";

export const RESPOSTA_PUBLICA_PADRAO =
  "Te chamei no direct! 📩 Se não aparecer, olha em Solicitações de mensagem.";

/** Junta textos salvos com os padrões: campo vazio ou ausente usa o padrão. */
export function textosComPadrao(salvos: Partial<Record<string, unknown>> | null | undefined) {
  const out: TextosConversa = { ...TEXTOS_PADRAO };
  if (!salvos) return out;
  for (const chave of Object.keys(TEXTOS_PADRAO) as Array<keyof TextosConversa>) {
    const v = salvos[chave];
    if (typeof v === "string" && v.trim()) out[chave] = v.trim();
  }
  return out;
}

/** Minúsculas e sem acento: "APÊ" e "apê" viram "ape". */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Forma canônica de uma palavra-chave para guardar e comparar ("Apê!" → "ape"). */
export function chavePalavra(palavra: string): string {
  return tokens(palavra).join(" ");
}

/**
 * A palavra aparece como PALAVRA INTEIRA no texto, em qualquer caixa, com ou
 * sem acento e em qualquer posição ("quero a faixa 2!" casa FAIXA).
 *
 * Por que palavra inteira e não "contém": com "contém", APÊ (→ "ape") casaria
 * "apenas" e "apelido", e a pessoa receberia uma DM que não pediu.
 * Aceita também expressões de mais de uma palavra ("quero simular").
 */
export function contemPalavra(texto: string, palavra: string): boolean {
  const alvo = chavePalavra(palavra);
  if (!alvo) return false;
  return ` ${tokens(texto).join(" ")} `.includes(` ${alvo} `);
}

/** A primeira palavra-chave ativa que aparece no texto (a lista já vem na ordem de prioridade). */
export function acharPalavra<T extends { palavra: string }>(
  texto: string | null | undefined,
  palavras: readonly T[],
): T | null {
  if (!texto) return null;
  return palavras.find((p) => contemPalavra(texto, p.palavra)) ?? null;
}

/** "Maria Silva" → "Maria"; vazio → "" (o texto continua natural: "Oi, !" vira "Oi!"). */
export function primeiroNome(nome: string | null | undefined): string {
  const n = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!n) return "";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Preenche {nome} e {palavra} e limpa a pontuação que sobra quando o nome falta. */
export function preencher(modelo: string, vars: { nome?: string | null; palavra?: string | null }) {
  const nome = primeiroNome(vars.nome);
  let out = modelo.replace(/\{nome\}/g, nome).replace(/\{palavra\}/g, vars.palavra ?? "");
  if (!nome) out = out.replace(/,\s*([!?.])/g, "$1").replace(/\s+([!?.,])/g, "$1");
  return out.trim();
}

/**
 * Lê a renda informada livremente. Devolve o valor mensal em reais ou null.
 * Nunca trava a conversa: se não der para ler, a resposta segue em texto
 * para o corretor e a próxima pergunta vai do mesmo jeito.
 *
 *   "3 mil" → 3000 · "R$ 3.500" → 3500 · "3,5 mil" → 3500 · "4k" → 4000
 *   "2500" → 2500 · "uns 3" → 3000 (número pequeno = milhares)
 */
export function lerRenda(texto: string): number | null {
  const t = normalizar(texto).replace(/r\$/g, " ");
  const m = t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil|k)?\b/);
  if (!m) return null;
  const inteiro = Number(m[1].replace(/[.\s]/g, ""));
  const decimal = m[2] ? Number(`0.${m[2]}`) : 0;
  let valor = inteiro + decimal;
  if (m[3]) valor *= 1000;
  else if (valor > 0 && valor <= 50) valor *= 1000;
  if (!Number.isFinite(valor) || valor < 100 || valor > 1_000_000) return null;
  return Math.round(valor);
}

/**
 * WhatsApp brasileiro com DDD. Aceita qualquer formatação e o 55 na frente.
 * Devolve no formato +55DDDNÚMERO (o mesmo do Meta Lead Ads) ou null.
 */
export function lerWhatsapp(texto: string): string | null {
  let d = texto.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return null;
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return `+55${d}`;
}

export type EstadoConversa = {
  etapa: Etapa;
  tentativas_whatsapp: number;
};

export type Respostas = {
  renda_texto?: string;
  renda_valor?: number | null;
  regiao?: string;
  prazo?: string;
  whatsapp?: string;
};

export type Passo = {
  proximaEtapa: Etapa;
  /** Texto a enviar (já com placeholders preenchidos). */
  resposta: string;
  respostas: Respostas;
  tentativasWhatsapp: number;
  /** true quando a qualificação terminou com WhatsApp: hora de criar o lead. */
  criarLead: boolean;
};

const MAX_RESPOSTA = 500;

const SAUDACAO =
  /^(oi+|ola|opa|eai|e ai|hey|bom dia|boa tarde|boa noite|tudo bem|tudo bom|blz|beleza|ok|faixa|simular|ape|quero|sim)\b/;

/**
 * "Oi", "bom dia, tudo bem?" ou a própria palavra-chave em resposta à DM de
 * abertura não são a renda: quem comenta costuma cumprimentar antes de
 * responder. Só vale quando não há número nenhum na mensagem e ela é curta.
 */
export function pareceSaudacao(texto: string): boolean {
  const t = normalizar(texto).trim();
  if (!t || /\d/.test(t)) return false;
  if (t.split(/\s+/).length > 6) return false;
  return SAUDACAO.test(t);
}

/**
 * Próximo passo da qualificação a partir da resposta da pessoa.
 * Regra de ouro: não ser maçante. Renda, região e prazo aceitam qualquer
 * resposta (o corretor lê o texto). Só o WhatsApp é conferido, porque sem
 * ele o CRM não cria o lead — e mesmo assim são só 2 tentativas.
 */
export function proximoPasso(
  estado: EstadoConversa,
  textoRecebido: string,
  textos: TextosConversa,
  vars: { nome?: string | null; palavra?: string | null },
): Passo | null {
  const texto = textoRecebido.trim().slice(0, MAX_RESPOSTA);
  const p = (m: string) => preencher(m, vars);
  switch (estado.etapa) {
    case "aguardando_renda":
      if (pareceSaudacao(texto)) {
        return {
          proximaEtapa: "aguardando_renda",
          resposta: p(textos.renda_de_novo),
          respostas: {},
          tentativasWhatsapp: estado.tentativas_whatsapp,
          criarLead: false,
        };
      }
      return {
        proximaEtapa: "aguardando_regiao",
        resposta: p(textos.regiao),
        respostas: { renda_texto: texto, renda_valor: lerRenda(texto) },
        tentativasWhatsapp: estado.tentativas_whatsapp,
        criarLead: false,
      };
    case "aguardando_regiao":
      return {
        proximaEtapa: "aguardando_prazo",
        resposta: p(textos.prazo),
        respostas: { regiao: texto },
        tentativasWhatsapp: estado.tentativas_whatsapp,
        criarLead: false,
      };
    case "aguardando_prazo":
      return {
        proximaEtapa: "aguardando_whatsapp",
        resposta: p(textos.whatsapp),
        respostas: { prazo: texto },
        tentativasWhatsapp: estado.tentativas_whatsapp,
        criarLead: false,
      };
    case "aguardando_whatsapp": {
      const whatsapp = lerWhatsapp(texto);
      if (whatsapp) {
        return {
          proximaEtapa: "concluida",
          resposta: p(textos.fechamento),
          respostas: { whatsapp },
          tentativasWhatsapp: estado.tentativas_whatsapp,
          criarLead: true,
        };
      }
      const tentativas = estado.tentativas_whatsapp + 1;
      if (tentativas >= 2) {
        return {
          proximaEtapa: "sem_whatsapp",
          resposta: p(textos.sem_whatsapp),
          respostas: {},
          tentativasWhatsapp: tentativas,
          criarLead: false,
        };
      }
      return {
        proximaEtapa: "aguardando_whatsapp",
        resposta: p(textos.whatsapp_invalido),
        respostas: {},
        tentativasWhatsapp: tentativas,
        criarLead: false,
      };
    }
    default:
      return null;
  }
}

/** Rótulos do painel. */
export const ROTULO_ETAPA: Record<Etapa, string> = {
  aguardando_renda: "Esperando a renda",
  aguardando_regiao: "Esperando a região",
  aguardando_prazo: "Esperando o prazo",
  aguardando_whatsapp: "Esperando o WhatsApp",
  concluida: "Qualificado",
  sem_whatsapp: "Sem WhatsApp (seguir no direct)",
};
