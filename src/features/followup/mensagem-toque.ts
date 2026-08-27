// Mensagem do toque da régua de follow-up — módulo puro (sem React/Supabase).
//
// O texto de cada toque vem, por convenção, da biblioteca de templates
// (Comunicação): um template cujo nome começa com "Régua {toque}" veste o
// toque correspondente (ex.: "Régua 3 — morno"). Sem template, cai num
// fallback G.P.V.A. embutido (Gancho + Personalização + Valor + Ação),
// calibrado por fase da régua — denso em valor no começo, consultivo no
// meio, e uma chamada honesta de encerramento no fim (nunca pressão).
//
// Consumido pela fila de follow-up (que importa `mensagemDoToque`) e coberto
// por tests/mensagem-toque.test.ts.

import { renderTemplate } from "@/lib/templates";

export type TemplateToque = { nome: string; conteudo: string };

/** Compara nomes de template sem acento e sem caixa ("RÉGUA" ≡ "regua"). */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Template do toque pela convenção de nome: começa com "Régua {toque}"
 * (case-insensitive; acento opcional), seguido de fim de nome ou de um
 * caractere NÃO numérico — assim "Régua 12" nunca casa o toque 1.
 * Empate → primeiro da lista; nenhum → null.
 */
export function escolherTemplateDoToque(templates: TemplateToque[], toque: number): string | null {
  const prefixo = normalizar(`régua ${toque}`);
  for (const t of templates) {
    const nome = normalizar(t.nome.trim());
    if (!nome.startsWith(prefixo)) continue;
    const seguinte = nome.charAt(prefixo.length);
    if (seguinte === "" || !/\d/.test(seguinte)) return t.conteudo;
  }
  return null;
}

function primeiroNomeDe(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

type FaseRegua = "abertura" | "consultiva" | "encerramento";

/**
 * Fase do toque, proporcional ao teto da régua. Calibrada para reproduzir a
 * régua padrão de 13 toques: 1–4 abertura (valor/novidade), 5–9 consultiva
 * (conteúdo/prova), 10–13 encerramento (chamada honesta) — e continuar
 * fazendo sentido quando o gestor muda o max_toques.
 */
function faseDoToque(toque: number, maxToques: number): FaseRegua {
  const teto = Math.max(1, maxToques);
  const pos = Math.min(toque, teto) / teto;
  if (pos <= 1 / 3) return "abertura";
  if (pos <= 0.7) return "consultiva";
  return "encerramento";
}

type CtxFallback = { saud: string; p: string; proj: string | null };

// 3 variantes por fase, todas ≤ 4 linhas e no formato G.P.V.A. — a variante
// gira com o número do toque para o lead não receber o mesmo texto duas
// vezes seguidas dentro da mesma fase.
const VARIANTES: Record<FaseRegua, ((c: CtxFallback) => string)[]> = {
  abertura: [
    ({ saud, proj }) =>
      `${saud} Vi seu interesse${proj ? ` no ${proj}` : " em sair do aluguel"} e separei as condições atualizadas.\n` +
      `Consigo te passar valores e simulação sem compromisso.\n` +
      `Posso te mandar um resumo por aqui?`,
    ({ saud, proj }) =>
      `${saud} Saiu novidade${proj ? ` no ${proj}` : " nos empreendimentos da sua região"} que combina com o que você procurava.\n` +
      `Vale ver antes que as melhores unidades saiam.\n` +
      `Quer que eu te envie os detalhes?`,
    ({ saud, proj }) =>
      `${saud} Passando pra te ajudar a dar o próximo passo${proj ? ` no ${proj}` : ""}.\n` +
      `Consigo simular entrada e parcela no seu perfil, rapidinho e de graça.\n` +
      `Faz sentido pra você?`,
  ],
  consultiva: [
    ({ saud, proj }) =>
      `${saud} Uma informação que pode te ajudar: muita gente que achava que não aprovava conseguiu usando FGTS e subsídio.\n` +
      `Posso verificar se o seu caso se encaixa${proj ? ` no ${proj}` : ""}?`,
    ({ saud, proj }) =>
      `${saud} Esta semana um cliente com perfil parecido com o seu saiu do aluguel${proj ? ` comprando no ${proj}` : ""}.\n` +
      `Se quiser, te mostro a conta que fizemos pra parcela caber no bolso.\n` +
      `Te interessa?`,
    ({ saud, proj }) =>
      `${saud} Dica rápida: as condições de financiamento mudaram e a parcela pode ficar menor do que você imagina.\n` +
      `Quer que eu refaça sua simulação${proj ? ` do ${proj}` : ""} com os números de agora?`,
  ],
  encerramento: [
    ({ saud, proj }) =>
      `${saud} Tentei falar com você algumas vezes e não quero ser inconveniente.\n` +
      `Se a compra${proj ? ` no ${proj}` : ""} não faz mais sentido agora, tudo bem — posso encerrar seu atendimento?\n` +
      `Se ainda faz, é só me responder por aqui.`,
    ({ saud, proj }) =>
      `${saud} Este é um dos meus últimos contatos por aqui.\n` +
      `Sigo à disposição se a ideia${proj ? ` do ${proj}` : " do imóvel próprio"} continua de pé — se preferir, encerro seu atendimento sem problema algum.\n` +
      `O que prefere?`,
    ({ saud, proj }) =>
      `${saud} Pra não lotar seu WhatsApp: ainda quer receber novidades${proj ? ` do ${proj}` : ""}?\n` +
      `Um "sim" mantém seu atendimento ativo; um "não" e eu encerro por aqui, combinado?`,
  ],
};

/**
 * Fallback embutido quando não há template "Régua N" na biblioteca.
 * Sempre ≤ 4 linhas, personalizado com primeiro nome e projeto quando houver.
 */
export function fallbackMensagemToque(
  toque: number,
  maxToques: number,
  nome: string,
  projetoNome?: string | null,
): string {
  const p = primeiroNomeDe(nome);
  const ctx: CtxFallback = {
    p,
    saud: p ? `Oi, ${p}!` : "Oi!",
    proj: projetoNome?.trim() || null,
  };
  const fase = faseDoToque(toque, maxToques);
  const variantes = VARIANTES[fase];
  const idx = (Math.max(1, Math.floor(toque)) - 1) % variantes.length;
  return variantes[idx](ctx);
}

/**
 * Mensagem final do toque: template da biblioteca pela convenção "Régua N"
 * (renderizado com {{nome}} = primeiro nome, {{primeiro_nome}} e {{projeto}},
 * como nos demais envios de WhatsApp), senão o fallback G.P.V.A. embutido.
 * ATENÇÃO: a fila de follow-up importa exatamente esta assinatura.
 */
export function mensagemDoToque(args: {
  toque: number;
  maxToques: number;
  nome: string;
  projetoNome?: string | null;
  templates: { nome: string; conteudo: string }[];
}): string {
  const { toque, maxToques, nome, projetoNome, templates } = args;
  const conteudo = escolherTemplateDoToque(templates, toque);
  if (conteudo === null) return fallbackMensagemToque(toque, maxToques, nome, projetoNome);

  const primeiroNome = primeiroNomeDe(nome) || nome;
  return renderTemplate(conteudo, {
    nome: primeiroNome,
    primeiro_nome: primeiroNome,
    projeto: projetoNome ?? "",
  });
}
