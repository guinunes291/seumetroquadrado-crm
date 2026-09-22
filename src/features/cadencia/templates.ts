// Cadência D1/D2/D3 — a parte pura: texto do template, link do WhatsApp e o
// rótulo de progresso da etapa.
//
// Vive separado da tela porque é o que dá para testar sem montar React, e
// porque é onde mora a decisão que o cliente final enxerga: a mensagem que sai
// no WhatsApp dele. Ver tests/cadencia-templates.test.ts.

/** Etapas da cadência que o corretor trabalha. */
export type EtapaCadencia = "D1" | "D2" | "D3";

export const CONTEXTO_POR_ETAPA: Record<EtapaCadencia, string> = {
  D1: "cadencia_D1",
  D2: "cadencia_D2",
  D3: "cadencia_D3",
};

/**
 * Troca {nome} pelo PRIMEIRO nome e {empreendimento} pelo nome comercial.
 *
 * Primeiro nome, e não o nome completo, porque a mensagem é de WhatsApp: "Oi,
 * Maria das Graças Silva!" denuncia o disparo automático na primeira linha, e
 * a etapa D1 inteira depende de não parecer robô.
 *
 * Sem empreendimento conhecido, o texto cai para "o empreendimento" em vez de
 * deixar a chave crua na mensagem — placeholder vazando para o cliente é pior
 * do que uma frase genérica.
 */
export function aplicarPlaceholders(
  texto: string,
  dados: { nome?: string | null; empreendimento?: string | null },
): string {
  const primeiroNome = (dados.nome ?? "").trim().split(/\s+/)[0] || "tudo bem";
  const empreendimento = (dados.empreendimento ?? "").trim() || "o empreendimento";
  return texto.replaceAll("{nome}", primeiroNome).replaceAll("{empreendimento}", empreendimento);
}

/**
 * Link wa.me com DDI do Brasil.
 *
 * O número vai só com dígitos e com o 55 na frente — mas só quando ele já não
 * está lá. Prefixar sempre transformaria 5511999999999 em 555511999999999, e
 * o wa.me abre uma conversa com um número que não existe, sem erro nenhum na
 * tela: o corretor acha que mandou.
 *
 * Retorna null quando não há número discável (10 dígitos é o piso de um fixo
 * com DDD) — o chamador esconde o botão em vez de abrir uma aba morta.
 */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const comDDI = digitos.startsWith("55") && digitos.length >= 12 ? digitos : `55${digitos}`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(texto)}`;
}

/**
 * "D1 · 1 de 2 ligações · WhatsApp pendente".
 *
 * As ligações contadas aqui são as VÁLIDAS (o servidor já descartou as que
 * caíram dentro do intervalo mínimo). Mostrar o total bruto faria o contador
 * dizer 2 enquanto a etapa não fecha — e o corretor não teria como entender
 * por quê.
 */
export function rotuloProgresso(item: {
  etapa: EtapaCadencia;
  ligacoes_validas: number;
  whatsapp_enviado: boolean;
}): string {
  const partes: string[] = [item.etapa];
  if (item.etapa !== "D3") {
    partes.push(`${Math.min(item.ligacoes_validas, 2)} de 2 ligações`);
  }
  partes.push(item.whatsapp_enviado ? "WhatsApp enviado" : "WhatsApp pendente");
  return partes.join(" · ");
}

/**
 * O próximo movimento sugerido da etapa, que é o que destaca o botão certo.
 *
 * Regra da tela: com as 2 ligações feitas, o WhatsApp vira a ação primária.
 * Antes disso, ligar é o que importa — a mensagem do D1 diz "acabei de tentar
 * te ligar", e mandá-la sem ter ligado é uma mentira que o cliente confere.
 */
export function acaoPrimaria(item: {
  etapa: EtapaCadencia;
  ligacoes_validas: number;
  whatsapp_enviado: boolean;
  telefone_suspeito: boolean;
}): "ligar" | "whatsapp" | "nenhuma" {
  if (item.telefone_suspeito) return "nenhuma";
  if (item.etapa === "D3") return item.whatsapp_enviado ? "nenhuma" : "whatsapp";
  if (item.ligacoes_validas < 2) return "ligar";
  return item.whatsapp_enviado ? "nenhuma" : "whatsapp";
}
