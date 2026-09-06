// Canal WhatsApp da Sami (Onda S4, decisões D8 parte 2 e D15) — a parte PURA.
//
// O n8n vira só transporte: recebe a mensagem do corretor no WhatsApp da Sami
// e chama /api/sami/mensagem; o CRM resolve o corretor pelo telefone, roda o
// MESMO cérebro do painel (samiq-core.server.ts) e devolve um texto pronto
// para enviar de volta. Aqui ficam contratos (zod), a resolução do corretor
// por sufixo de telefone, a leitura de respostas curtas ("CONFIRMAR" /
// "CANCELAR") e a formatação dos textos para o WhatsApp. Sem rede, sem banco.

import { z } from "zod";
import { descreverProposta, type PropostaSamiQ } from "@/lib/samiq-propostas";
import type { BriefingSamiQ } from "@/lib/samiq-briefing";

/** Header de autenticação server-to-server (o mesmo das edge functions sami-*). */
export const SAMI_CANAL_HEADER = "x-sami-key";
export const SAMI_CANAL_MAX_BODY_BYTES = 32 * 1024;
/** Mensagens por corretor por minuto no canal (a cota de IA é outra camada). */
export const SAMI_CANAL_MAX_POR_MINUTO = 20;

const TelefoneSchema = z.string().trim().min(8).max(30);

export const MensagemSamiInput = z.object({
  corretor_telefone: TelefoneSchema,
  /** Texto do corretor (ou a transcrição do áudio feita pelo n8n). */
  texto: z.string().trim().min(1).max(4000),
  origem_midia: z.enum(["texto", "audio"]).optional(),
  /** Cliente em foco, quando o fluxo souber (ex.: botão "falar da Maria"). */
  lead_id: z.string().uuid().optional(),
  /** true = ignora a conversa das últimas 12 h e começa outra. */
  nova_conversa: z.boolean().optional(),
});
export type MensagemSami = z.infer<typeof MensagemSamiInput>;

export const DecidirPropostasInput = z.object({
  corretor_telefone: TelefoneSchema,
  decisao: z.enum(["confirmar", "rejeitar"]),
  /** Ids das propostas (botões interativos); ausente = pendentes da conversa ativa. */
  ids: z.array(z.string().uuid()).min(1).max(10).optional(),
});
export type DecidirPropostas = z.infer<typeof DecidirPropostasInput>;

export const BriefingSamiInput = z.object({ corretor_telefone: TelefoneSchema });

// ---------------------------------------------------------------------------
// Corretor pelo telefone (mesma regra das edge functions sami-*: sufixo estável
// de 9 dígitos p/ celular ou 8 p/ fixo, comparado por igualdade, e só resolve
// se a correspondência for ÚNICA — nunca "o corretor mais parecido").
// ---------------------------------------------------------------------------

export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

export function sufixoTelefone(telefone: string | null | undefined): string | null {
  const d = soDigitos(telefone);
  if (d.length >= 9) return d.slice(-9);
  if (d.length >= 8) return d.slice(-8);
  return null;
}

export type CandidatoCorretor = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
};

export type ResolucaoCorretor =
  | { ok: true; corretor: CandidatoCorretor }
  | { ok: false; erro: "telefone_invalido" | "corretor_nao_encontrado" | "corretor_ambiguo" };

export function escolherCorretorUnico(
  candidatos: ReadonlyArray<CandidatoCorretor>,
  telefone: string,
): ResolucaoCorretor {
  const suf = sufixoTelefone(telefone);
  if (!suf) return { ok: false, erro: "telefone_invalido" };
  const casam = candidatos.filter((c) => {
    const d = soDigitos(c.telefone);
    return d.length >= suf.length && d.slice(-suf.length) === suf;
  });
  if (casam.length === 1) return { ok: true, corretor: casam[0] };
  if (casam.length === 0) return { ok: false, erro: "corretor_nao_encontrado" };
  return { ok: false, erro: "corretor_ambiguo" };
}

// ---------------------------------------------------------------------------
// Respostas curtas: "confirmar"/"cancelar" a um pacote pendente não passam
// pelo modelo — decidem na hora, de graça. Qualquer palavra fora do
// vocabulário (ex.: "sim, mas muda a data") vai para a Sami como pergunta.
// ---------------------------------------------------------------------------

const CONFIRMA = new Set([
  "confirmar",
  "confirma",
  "confirmo",
  "confirmado",
  "sim",
  "s",
  "ok",
  "okay",
  "pode",
  "registrar",
  "registra",
  "isso",
  "certo",
  "correto",
  "positivo",
  "manda",
  "vai",
  "1",
]);
const REJEITA = new Set([
  "cancelar",
  "cancela",
  "cancelado",
  "nao",
  "n",
  "descartar",
  "descarta",
  "descarte",
  "negativo",
  "para",
  "pare",
  "2",
]);

export type IntencaoCurta = "confirmar" | "rejeitar";

export function interpretarRespostaCurta(texto: string): IntencaoCurta | null {
  const bruto = (texto ?? "").trim();
  if (!bruto || bruto.length > 40) return null;
  if (/[✅👍]/u.test(bruto) && !/[❌👎]/u.test(bruto)) return "confirmar";
  if (/[❌👎]/u.test(bruto) && !/[✅👍]/u.test(bruto)) return "rejeitar";
  const palavras = bruto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (palavras.length === 0 || palavras.length > 3) return null;
  if (palavras.every((p) => CONFIRMA.has(p))) return "confirmar";
  if (palavras.every((p) => REJEITA.has(p))) return "rejeitar";
  return null;
}

// ---------------------------------------------------------------------------
// Textos para o WhatsApp (sem markdown; o n8n envia como está).
// ---------------------------------------------------------------------------

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

/** Lista numerada do pacote: "1) Registrar contato com Maria — whatsapp · Atendeu". */
export function textoDasPropostas(propostas: ReadonlyArray<PropostaSamiQ>): string {
  return propostas
    .map((p, i) => {
      const d = descreverProposta(p.payload, p.leadNome);
      const detalhes = d.detalhes.filter(Boolean).slice(0, 3).join(" · ");
      return `${i + 1}) ${d.titulo}${detalhes ? ` — ${detalhes}` : ""}`;
    })
    .join("\n");
}

/** Resposta da Sami + pacote pendente, prontos para o WhatsApp. */
export function textoParaWhatsApp(resposta: {
  texto: string;
  propostas?: ReadonlyArray<PropostaSamiQ>;
}): string {
  const texto = resposta.texto.trim();
  const propostas = resposta.propostas ?? [];
  if (propostas.length === 0) return texto;
  const partes = [
    texto,
    "",
    `📝 Preparei ${plural(propostas.length, "registro", "registros")}:`,
    textoDasPropostas(propostas),
  ];
  if (!/confirmar/i.test(texto)) {
    partes.push("", "Responda CONFIRMAR para registrar ou CANCELAR para descartar.");
  }
  return partes.join("\n");
}

export type DecisaoResultado = {
  id: string;
  ok: boolean;
  status: string;
  erro?: string;
};

/** Texto do resultado de CONFIRMAR/CANCELAR sobre o pacote. */
export function textoDaDecisao(
  decisao: IntencaoCurta,
  resultados: ReadonlyArray<DecisaoResultado>,
  propostas: ReadonlyArray<PropostaSamiQ>,
): string {
  if (propostas.length === 0) {
    return "Não há registros pendentes para confirmar. Me conte o que aconteceu com o cliente que eu preparo os registros.";
  }
  const titulo = (id: string) => {
    const p = propostas.find((x) => x.id === id);
    return p ? descreverProposta(p.payload, p.leadNome).titulo : "item";
  };
  if (decisao === "rejeitar") {
    return `🗑️ Descartei ${plural(propostas.length, "registro", "registros")}. Nada foi gravado.`;
  }
  const feitos = resultados.filter((r) => r.ok);
  const falhas = resultados.filter((r) => !r.ok);
  const linhas: string[] = [];
  if (feitos.length > 0) {
    linhas.push(
      `✅ Registrei ${plural(feitos.length, "item", "itens")}: ${feitos.map((r) => titulo(r.id)).join("; ")}.`,
    );
  }
  if (falhas.length > 0) {
    linhas.push(
      `⚠️ Não consegui: ${falhas
        .map((r) => `${titulo(r.id)}${r.erro ? ` (${r.erro})` : ""}`)
        .join("; ")}.`,
    );
  }
  if (feitos.length > 0)
    linhas.push('Tudo com a marca "via Sami" na timeline; dá para desfazer no CRM em 24 h.');
  return linhas.join("\n");
}

export function primeiroNome(nome: string | null | undefined): string | null {
  const n = nome?.trim().split(/\s+/)[0];
  return n || null;
}

/** "Bom dia, Maria! Seu dia: • 1 visita hoje: Ana 10h00 • ..." */
export function textoDoBriefingWhatsApp(nome: string | null, briefing: BriefingSamiQ): string {
  const abertura = `${briefing.saudacao}${nome ? `, ${nome}` : ""}!`;
  if (briefing.vazio) return `${abertura} Tudo em dia por aqui. Me chame quando precisar.`;
  return [
    `${abertura} Seu dia:`,
    ...briefing.linhas.map((l) => `• ${l.texto}`),
    "",
    "Me pergunte por quem começar ou me conte o que já fez que eu registro.",
  ].join("\n");
}
