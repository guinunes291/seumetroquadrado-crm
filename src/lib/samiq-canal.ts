// Canal WhatsApp da Sami (Onda S4 → v8 "CRM no WhatsApp") — a parte PURA.
//
// O n8n é só transporte: recebe a mensagem do corretor no WhatsApp da Sami
// e chama /api/sami/mensagem; o CRM resolve o corretor pelo telefone, roda o
// MESMO cérebro do painel (samiq-core.server.ts) e devolve um texto pronto
// para enviar de volta. Aqui ficam contratos (zod), a resolução do corretor
// por sufixo de telefone, a leitura dos comandos curtos (CONFIRMAR,
// CANCELAR, DESFAZER, com número de item) e os textos do WhatsApp.
// Sem rede, sem banco. Textos sem travessão e sem emoji (padrão SMQ).

import { z } from "zod";
import {
  descreverProposta,
  SAMIQ_PROPOSTA_LABEL,
  MOTIVO_SEM_DESFAZER_LABEL,
  type MotivoSemDesfazer,
  type PropostaSamiQ,
} from "@/lib/samiq-propostas";
import type { BriefingSamiQ } from "@/lib/samiq-briefing";
import { SAMIQ_TOOL_LABELS } from "@/lib/samiq-tools";

/** Header de autenticação server-to-server (o mesmo das edge functions sami-*). */
export const SAMI_CANAL_HEADER = "x-sami-key";
export const SAMI_CANAL_MAX_BODY_BYTES = 32 * 1024;
/** Mensagens por corretor por minuto no canal (a cota de IA é outra camada). */
export const SAMI_CANAL_MAX_POR_MINUTO = 20;

const TelefoneSchema = z.string().trim().min(8).max(30);

export const LocalizacaoSamiInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  precisao: z.number().min(0).max(100_000).optional(),
});

export const MensagemSamiInput = z.object({
  corretor_telefone: TelefoneSchema,
  /** Texto do corretor (ou a transcrição do áudio; "[arquivo]"/"[localização]" quando só veio mídia). */
  texto: z.string().trim().min(1).max(4000),
  origem_midia: z.enum(["texto", "audio"]).optional(),
  /** Cliente em foco, quando o fluxo souber (ex.: botão "falar da Maria"). */
  lead_id: z.string().uuid().optional(),
  /** true = ignora a conversa das últimas 12 h e começa outra. */
  nova_conversa: z.boolean().optional(),
  /** v8: arquivo que o n8n já guardou em /api/sami/anexo. */
  anexo_id: z.string().uuid().optional(),
  /** v8: localização compartilhada pelo corretor (check-in na filial). */
  localizacao: LocalizacaoSamiInput.optional(),
  /** v8: id da mensagem no WhatsApp (retentativa do n8n não repete ação). */
  mensagem_id: z.string().trim().max(200).optional(),
  /**
   * v8: o que o n8n sabe e o CRM não (material enviado fora do CRM, últimas
   * mensagens do WhatsApp). Vai SEPARADO do texto: assim "CONFIRMAR 2" chega
   * puro ao interpretador de comandos e o contexto vai só para o cabeçalho.
   */
  contexto_canal: z.string().trim().max(3000).optional(),
});
export type MensagemSami = z.infer<typeof MensagemSamiInput>;

export const DecidirPropostasInput = z.object({
  corretor_telefone: TelefoneSchema,
  decisao: z.enum(["confirmar", "rejeitar"]),
  /** Ids das propostas (botões interativos); ausente = pendentes da conversa ativa. */
  ids: z.array(z.string().uuid()).min(1).max(20).optional(),
});
export type DecidirPropostas = z.infer<typeof DecidirPropostasInput>;

export const BriefingSamiInput = z.object({ corretor_telefone: TelefoneSchema });

/** Campos de texto do multipart de /api/sami/anexo (o arquivo vai no campo `arquivo`). */
export const AnexoSamiInput = z.object({
  corretor_telefone: TelefoneSchema,
  legenda: z.string().trim().max(1000).optional(),
  mensagem_id: z.string().trim().max(200).optional(),
  nome: z.string().trim().max(255).optional(),
});
export type AnexoSami = z.infer<typeof AnexoSamiInput>;

/** Teto do corpo de /api/sami/anexo (arquivo de 15 MB + campos). */
export const SAMI_ANEXO_MAX_REQUEST_BYTES = 16 * 1024 * 1024;

/**
 * Tipo real do arquivo pelos primeiros bytes (o content-type declarado pelo
 * WhatsApp/n8n não é confiável). Só PDF, JPEG, PNG e WEBP passam.
 */
export function mimePelosBytes(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Resposta ao arquivo sem legenda (sem modelo): pergunta de quem é, uma vez por rajada. */
export function textoDoAnexoRecebido(args: { mime: string; tamanho: number }): string {
  const tipo = args.mime === "application/pdf" ? "o PDF" : "a imagem";
  const kb = Math.max(1, Math.round(args.tamanho / 1024));
  const tamanho = kb >= 1024 ? `${(kb / 1024).toFixed(1).replace(".", ",")} MB` : `${kb} KB`;
  return `Recebi ${tipo} (${tamanho}). De qual cliente e qual documento é? Ex.: "RG e holerite da Maria Silva". Se mandar mais de um, eu espero e anexo todos de uma vez.`;
}

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
// Comandos curtos: decidem sem gastar modelo. v8 aceita número de item
// ("CONFIRMAR 1 e 3", "cancela o 2", "DESFAZER 2"). Qualquer palavra fora do
// vocabulário ("sim, mas muda a data") vai para a Sami como mensagem normal.
// ---------------------------------------------------------------------------

const CONFIRMA = new Set([
  "confirmar",
  "confirma",
  "confirmo",
  "confirmado",
  "confirmada",
  "sim",
  "s",
  "ok",
  "okay",
  "pode",
  "registrar",
  "registra",
  "grava",
  "gravar",
  "isso",
  "certo",
  "correto",
  "positivo",
  "manda",
  "vai",
  "fechado",
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
  "tira",
  "tirar",
]);
const DESFAZ = new Set([
  "desfazer",
  "desfaz",
  "desfaca",
  "desfazendo",
  "anula",
  "anular",
  "reverte",
  "reverter",
]);
/**
 * Palavras que SÓ podem ser comando ("CONFIRMAR", "cancela", "desfaz"): valem
 * sempre que há algo para decidir. As fracas ("sim", "ok", "pode", emoji) só
 * decidem quando a última mensagem da Sami pediu o OK; fora disso "sim" pode
 * ser resposta a outra pergunta e vai para a Sami com o contexto.
 */
const FORTES = new Set([
  "confirmar",
  "confirma",
  "confirmo",
  "confirmado",
  "confirmada",
  "registrar",
  "registra",
  "grava",
  "gravar",
  "cancelar",
  "cancela",
  "cancelado",
  "descartar",
  "descarta",
  "descarte",
  ...DESFAZ,
]);
/** Palavras neutras que podem acompanhar o comando e os números. */
const NEUTRAS = new Set([
  "o",
  "a",
  "os",
  "as",
  "e",
  "so",
  "somente",
  "apenas",
  "item",
  "itens",
  "numero",
  "num",
  "tudo",
  "todos",
  "todas",
  "por",
  "favor",
  "pf",
  "pfv",
]);

export type ComandoCurto = {
  acao: "confirmar" | "rejeitar" | "desfazer";
  itens: number[];
  /** true = palavra que só serve de comando (CONFIRMAR, CANCELAR, DESFAZER). */
  forte: boolean;
};

/** Compatível com a v4-v7: "confirmar"/"rejeitar" sem itens. */
export type IntencaoCurta = "confirmar" | "rejeitar";

function palavrasDe(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function interpretarComandoCurto(texto: string): ComandoCurto | null {
  const bruto = (texto ?? "").trim();
  if (!bruto || bruto.length > 60) return null;
  const temSim = /[✅👍]/u.test(bruto);
  const temNao = /[❌👎]/u.test(bruto);
  if (temSim && temNao) return null;
  const palavras = palavrasDe(bruto.replace(/[✅👍❌👎]/gu, " "));
  const itens: number[] = [];
  let acao: ComandoCurto["acao"] | null = temSim ? "confirmar" : temNao ? "rejeitar" : null;
  let forte = false;
  for (const p of palavras) {
    if (/^\d{1,2}$/.test(p)) {
      const n = Number(p);
      if (n >= 1 && n <= 20 && !itens.includes(n)) itens.push(n);
      continue;
    }
    if (NEUTRAS.has(p)) continue;
    const esta: ComandoCurto["acao"] | null = CONFIRMA.has(p)
      ? "confirmar"
      : REJEITA.has(p)
        ? "rejeitar"
        : DESFAZ.has(p)
          ? "desfazer"
          : null;
    if (!esta) return null;
    if (acao && acao !== esta) return null;
    acao = esta;
    if (FORTES.has(p)) forte = true;
  }
  if (!acao) return null;
  // "tira o 2" sem número não é comando (tira o quê?).
  if (
    acao === "rejeitar" &&
    itens.length === 0 &&
    palavras.some((p) => p === "tira" || p === "tirar")
  ) {
    return null;
  }
  return { acao, itens, forte };
}

// Consentimento em linguagem natural ("pode marcar", "isso, grava a visita"):
// a Sami só confirma um item pesado por conta própria quando a mensagem do
// corretor tem uma palavra de OK e nenhuma de correção. "Sim, mas muda para
// 15h" NÃO é OK: é correção (a Sami refaz o item e descarta o antigo).
// Sem formas que também são substantivo ("agenda", "marca", "segue o print").
const OK_NATURAL = new Set([
  ...CONFIRMA,
  "confirmar",
  "marcar",
  "agendar",
  "enviar",
  "mandar",
  "bora",
  "perfeito",
  "beleza",
  "blz",
  "show",
  "fechou",
  "combinado",
  "autorizo",
  "autorizado",
  "aprovado",
  "aprovo",
]);
const CORRECAO = new Set([
  "nao",
  "n",
  "mas",
  "porem",
  "muda",
  "mudar",
  "troca",
  "trocar",
  "corrige",
  "corrigir",
  "errado",
  "errada",
  "erro",
  "espera",
  "aguarda",
  "calma",
  "antes",
  "cancela",
  "cancelar",
  "descarta",
  "tira",
  "outro",
  "outra",
  "ainda",
]);

/** Marcas de relato (fato novo), não de OK: "ela disse que vai pensar". */
const RELATO = new Set([
  "disse",
  "falou",
  "ficou",
  "pensar",
  "acha",
  "achou",
  "talvez",
  "liguei",
  "ligou",
  "atendeu",
  "pediu",
  "quer",
  "queria",
  "vai",
  "vou",
  "depois",
  "quando",
  "se",
  "comprou",
  "desistiu",
  "veio",
  "visitou",
]);

/**
 * OK em linguagem natural para itens que esperam confirmação: mensagem curta
 * (até 10 palavras) que ABRE com a palavra de OK ("pode marcar", "isso, grava
 * a visita", "👍"), sem correção ("mas", "muda") e sem relato ("ela disse que
 * vai pensar"). Relato com "registra" no meio é fato novo, não OK.
 */
export function consentimentoExplicito(texto: string): boolean {
  const bruto = (texto ?? "").trim();
  if (!bruto || bruto.length > 120) return false;
  if (/[❌👎?]/u.test(bruto)) return false;
  const palavras = palavrasDe(bruto.replace(/[✅👍]/gu, " ok "));
  if (palavras.length === 0 || palavras.length > 10) return false;
  if (palavras.some((p) => CORRECAO.has(p))) return false;
  if (palavras.slice(1).some((p) => RELATO.has(p))) return false;
  return OK_NATURAL.has(palavras[0]);
}

const ORDINAIS: Record<string, number> = {
  primeira: 1,
  primeiro: 1,
  segunda: 2,
  segundo: 2,
  terceira: 3,
  terceiro: 3,
  quarta: 4,
  quarto: 4,
  quinta: 5,
  quinto: 5,
};
/** Palavras que podem cercar a escolha sem mudar o sentido ("é a 2", "a da segunda", "opção 3"). */
const MOLDURA_DA_ESCOLHA = new Set([
  "a",
  "o",
  "e",
  "eh",
  "da",
  "do",
  "de",
  "na",
  "no",
  "numero",
  "num",
  "n",
  "opcao",
  "item",
  "sim",
  "isso",
  "mesmo",
  "mesma",
  "pode",
  "ser",
  "essa",
  "esse",
]);

const DIA_OU_ORDINAL = new Set(["segunda", "quarta", "quinta"]);
const FALA_DE_DATA = new Set([
  "na",
  "no",
  "de",
  "da",
  "do",
  "dia",
  "feira",
  "ate",
  "proxima",
  "proximo",
]);

/**
 * Resposta à pergunta "qual Maria? 1) ... 2) ...": o ÚNICO candidato que o
 * corretor escolheu ("2", "a 2", "é a segunda", "a última", "opção 3"), na
 * ordem da lista que a Sami mostrou. Qualquer outra coisa devolve null e a
 * trava continua: frase com número ("liguei 3 vezes"), pronome ("ela
 * atendeu"), ou "essa" sem dizer qual.
 */
export function escolherCandidato(texto: string, candidatos: ReadonlyArray<string>): string | null {
  if (candidatos.length === 0) return null;
  const palavras = palavrasDe(texto ?? "");
  if (palavras.length === 0 || palavras.length > 5) return null;
  const resto = palavras.filter((p) => !MOLDURA_DA_ESCOLHA.has(p));
  if (resto.length !== 1) return null;
  const w = resto[0];
  // "segunda", "quarta" e "quinta" também são dias da semana: "na segunda",
  // "a de quinta" falam de data, não da opção 2 ou 5 da lista.
  if (DIA_OU_ORDINAL.has(w) && palavras.some((p) => FALA_DE_DATA.has(p))) return null;
  const n = /^\d{1,2}$/.test(w)
    ? Number(w)
    : (ORDINAIS[w] ?? (w === "ultima" || w === "ultimo" ? candidatos.length : null));
  if (!n || n < 1 || n > candidatos.length) return null;
  return candidatos[n - 1] ?? null;
}

/** A fala da Sami terminou perguntando outra coisa? Então "sim"/"não" não decidem a lista. */
export function falaComPergunta(texto: string): boolean {
  return /\?/.test(texto ?? "");
}

/** "1", "1 e 3", "2,3": só números (resposta à lista, sem dizer o que fazer com ela). */
export function numerosSoltos(texto: string): number[] | null {
  const t = (texto ?? "").trim();
  if (!/^\d{1,2}(\s*(,|e|\/)\s*\d{1,2})*[.!]?$/i.test(t)) return null;
  const nums = [...t.matchAll(/\d{1,2}/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n >= 1 && n <= 20);
  return nums.length ? [...new Set(nums)] : null;
}

/** Número solto depois de "Preciso do seu OK": pergunta o que fazer, sem gastar modelo. */
export function textoNumeroSemComando(itens: ReadonlyArray<number>): string {
  const n = itens.join(" e ");
  const um = itens.length === 1;
  return `Para gravar ${um ? "o item" : "os itens"} ${n}, responda CONFIRMAR ${n}. Para descartar, CANCELAR ${n}.`;
}

/** Atalho legado (testes e chamadas antigas): só confirmar/rejeitar sem itens. */
export function interpretarRespostaCurta(texto: string): IntencaoCurta | null {
  const c = interpretarComandoCurto(texto);
  if (!c || c.acao === "desfazer" || c.itens.length > 0) return null;
  return c.acao;
}

// ---------------------------------------------------------------------------
// Textos para o WhatsApp (sem markdown; o n8n envia como está).
// ---------------------------------------------------------------------------

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

/** O mínimo para descrever uma ação (pendente ainda não tem id). */
export type ItemDescritivel = Pick<PropostaSamiQ, "payload" | "leadNome">;
/** O mínimo para o recibo de uma ação gravada. */
export type ItemExecutado = ItemDescritivel &
  Pick<PropostaSamiQ, "status"> &
  Partial<Pick<PropostaSamiQ, "efeito" | "erro" | "desfazerAte">>;

function linha(p: ItemDescritivel, extra?: string | null): string {
  const d = descreverProposta(p.payload, p.leadNome);
  const detalhes = [extra || null, ...d.detalhes].filter(Boolean).slice(0, 3).join(", ");
  return `${d.titulo}${detalhes ? ` (${detalhes})` : ""}`;
}

/** Lista numerada: "1) Contato com Maria Silva (Ligação, atendeu, Follow-up sex 31/10 10:00)". */
export function textoDasPropostas(propostas: ReadonlyArray<ItemDescritivel>): string {
  return propostas.map((p, i) => `${i + 1}) ${linha(p)}`).join("\n");
}

/** Recibo do que já foi gravado neste turno (numerado para o DESFAZER). */
export function textoDasExecutadas(executadas: ReadonlyArray<ItemExecutado>): string | null {
  const ok = executadas.filter((p) => p.status === "aceita" || p.status === "editada");
  const falhas = executadas.filter((p) => p.status === "falhou");
  const partes: string[] = [];
  if (ok.length) {
    partes.push(
      `Gravei no CRM:\n${ok.map((p, i) => `${i + 1}) ${linha(p, p.efeito)}`).join("\n")}`,
    );
    if (ok.some((p) => !!p.desfazerAte)) {
      partes.push(
        ok.length > 1
          ? "Algo errado? Responda DESFAZER (ou DESFAZER 2)."
          : "Algo errado? Responda DESFAZER.",
      );
    }
  }
  if (falhas.length) {
    partes.push(
      `Não consegui gravar: ${falhas
        .map(
          (p) =>
            `${descreverProposta(p.payload, p.leadNome).titulo}${p.erro ? ` (${p.erro})` : ""}`,
        )
        .join("; ")}.`,
    );
  }
  return partes.length ? partes.join("\n") : null;
}

/** O que espera o OK do corretor (todas as pendentes da conversa, na numeração do CONFIRMAR N). */
export function textoDasPendentes(pendentes: ReadonlyArray<ItemDescritivel>): string | null {
  if (pendentes.length === 0) return null;
  const instrucao =
    pendentes.length > 1
      ? "Responda CONFIRMAR para gravar tudo, CONFIRMAR 1 para só um item, ou CANCELAR."
      : "Responda CONFIRMAR para gravar ou CANCELAR para descartar.";
  return `Preciso do seu OK para:\n${textoDasPropostas(pendentes)}\n${instrucao}`;
}

// Nome interno de ferramenta não é para o corretor ("veja sua fila (minha_fila)").
const ROTULO_DA_FERRAMENTA: Record<string, string> = {
  ...SAMIQ_TOOL_LABELS,
  ...Object.fromEntries(Object.entries(SAMIQ_PROPOSTA_LABEL).map(([k, v]) => [k, v.toLowerCase()])),
};
const NOME_ENTRE_PARENTESES = /\s*[(`]\s*[a-z]+(?:_[a-z]+)+\s*[)`]/g;
const NOME_SOLTO = /(?<![\w/.-])([a-z]+(?:_[a-z]+)+)(?![\w/-])/g;

/** Tira nomes de ferramenta do texto: entre parênteses some, solto vira o rótulo. */
export function semNomeDeFerramenta(texto: string): string {
  return texto
    .replace(NOME_ENTRE_PARENTESES, "")
    .replace(NOME_SOLTO, (nome: string) => ROTULO_DA_FERRAMENTA[nome] ?? nome);
}

/** Resposta da Sami + recibo + pendentes, prontos para o WhatsApp. */
export function textoParaWhatsApp(resposta: {
  texto: string;
  propostas?: ReadonlyArray<ItemDescritivel>;
  executadas?: ReadonlyArray<ItemExecutado>;
  /** v8: todas as pendentes da conversa (inclui as de turnos anteriores). */
  pendentes?: ReadonlyArray<ItemDescritivel>;
  /** v8: o que a Sami desfez ou descartou neste turno, a pedido do corretor. */
  desfeitas?: ReadonlyArray<ItemDescritivel>;
  descartadas?: ReadonlyArray<ItemDescritivel>;
}): string {
  const executadas = resposta.executadas ?? [];
  const pendentes = resposta.pendentes ?? resposta.propostas ?? [];
  const desfeitas = resposta.desfeitas ?? [];
  const descartadas = resposta.descartadas ?? [];
  const texto = semNomeDeFerramenta(resposta.texto.trim());
  const titulos = (itens: ReadonlyArray<ItemDescritivel>) =>
    itens.map((p) => descreverProposta(p.payload, p.leadNome).titulo).join("; ");
  const extras = [
    desfeitas.length ? `Desfeito: ${titulos(desfeitas)}.` : null,
    descartadas.length ? `Descartado sem gravar: ${titulos(descartadas)}.` : null,
  ];
  if (executadas.length === 0 && pendentes.length === 0 && !extras.some(Boolean)) {
    return semRegistroFantasma(texto);
  }
  const limpo = semComandoRepetido(texto);
  return [limpo, textoDasExecutadas(executadas), ...extras, textoDasPendentes(pendentes)]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join("\n\n");
}

/** O código já manda a instrução de CONFIRMAR/DESFAZER: tira a do modelo para não repetir. */
function semComandoRepetido(texto: string): string {
  const frases = texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);
  const restantes = frases.filter((f) => !/\b(CONFIRMAR|CANCELAR|DESFAZER)\b/.test(f));
  return restantes.join(" ").trim();
}

// Trava (23/10/2026, ampliada na v8): sem ação real no turno, a promessa de
// registro sai do texto e entra um aviso. Pega "preparei os registros,
// responda CONFIRMAR" e também "registrei", "agendei", "gravei" na primeira
// pessoa quando NADA foi gravado.
const COMANDO_DE_DECISAO = /\b(CONFIRMAR|CANCELAR|DESFAZER)\b/;
// v8.1 (teste real de 24/10): "preparei dois passos pro Guilherme: a criação
// do lead..." e "Preparei a criação do lead" passavam. "Visita" fica de fora de
// propósito: "preparei o roteiro da visita" é o kit (leitura) e é verdade.
const JA_PREPAREI =
  /\bprepar(ei|ado|ados|ada|adas)\b[^.!?\n]{0,90}\b(registros?|pacotes?|propostas?|tarefas?|contatos?|lan[çc]amentos?|leads?|cadastros?|cria[çc](ão|ao|ões|oes)|passos|lembretes?|follow-?ups?|agendamentos?|retornos?|anota[çc](ão|ao|ões|oes))\b/i;
// "Confirma pra mim que eu gravo os dois?" sem nada pendente é a mesma promessa.
const PEDE_CONFIRMACAO =
  /\bconfirm(a|e|ar|as)\b[^.!?\n]{0,50}\b(grav|registr|cri|salv|cadastr|lan[çc]|agend)|^confirma(s|r)? (pra|para) mim\W*$/i;
const JA_GRAVEI =
  /\b(registrei|gravei|agendei|anotei|lancei|lancei|marquei|remarquei|cancelei|conclu[ií]|atualizei|cadastrei|anexei|criei a tarefa|criei um lembrete|fiz o check-?in|movi|perdi o cliente|enviei para (a )?an[aá]lise)\b/i;
const PROMESSA_DE_REGISTRO = {
  test: (f: string) =>
    COMANDO_DE_DECISAO.test(f) ||
    JA_PREPAREI.test(f) ||
    JA_GRAVEI.test(f) ||
    PEDE_CONFIRMACAO.test(f),
};

export const SAMIQ_AVISO_SEM_REGISTRO =
  "Atenção: nesta resposta eu não gravei nada no CRM e não há nada esperando o seu CONFIRMAR. Me peça de novo (com o nome do cliente) que eu faço.";

export function semRegistroFantasma(texto: string): string {
  if (!PROMESSA_DE_REGISTRO.test(texto)) return texto;
  const frases = texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);
  const restantes = frases.filter((f) => !PROMESSA_DE_REGISTRO.test(f));
  return [restantes.join(" ").trim(), SAMIQ_AVISO_SEM_REGISTRO].filter(Boolean).join("\n\n");
}

export type DecisaoResultado = {
  id: string;
  ok: boolean;
  status: string;
  erro?: string;
  efeito?: string | null;
  desfazerAte?: string | null;
};

/** As ações confirmadas viram o recibo (mesmo formato e numeração do DESFAZER). */
export function executadasDaDecisao<T extends ItemDescritivel & { id: string }>(
  propostas: ReadonlyArray<T>,
  resultados: ReadonlyArray<DecisaoResultado>,
): Array<T & ItemExecutado> {
  return propostas.map((p) => {
    const r = resultados.find((x) => x.id === p.id);
    const status: PropostaSamiQ["status"] = r?.ok
      ? r.status === "editada"
        ? "editada"
        : "aceita"
      : "falhou";
    return {
      ...p,
      status,
      efeito: r?.efeito ?? null,
      erro: r?.ok
        ? null
        : (r?.erro ??
          (r?.status === "indisponivel" ? "já foi decidida ou está sendo gravada" : null)),
      desfazerAte: r?.desfazerAte ?? null,
    };
  });
}

/** Texto do resultado de CONFIRMAR/CANCELAR sobre o pacote (ou parte dele). */
export function textoDaDecisao(
  decisao: IntencaoCurta,
  resultados: ReadonlyArray<DecisaoResultado>,
  propostas: ReadonlyArray<ItemDescritivel & { id: string }>,
  restantes: ReadonlyArray<ItemDescritivel> = [],
): string {
  if (propostas.length === 0) {
    return "Não há nada esperando confirmação. Me conte o que aconteceu com o cliente que eu registro.";
  }
  const linhas: Array<string | null> = [];
  if (decisao === "rejeitar") {
    const sairam = propostas.filter((p) => resultados.some((r) => r.id === p.id && r.ok));
    const ficaram = propostas.filter((p) => !sairam.includes(p));
    if (sairam.length) {
      linhas.push(`Descartei ${plural(sairam.length, "item", "itens")}. Nada disso foi gravado.`);
    }
    if (ficaram.length) {
      linhas.push(
        `Não consegui descartar: ${ficaram
          .map((p) => descreverProposta(p.payload, p.leadNome).titulo)
          .join("; ")} (já estava sendo gravado ou o CRM não respondeu).`,
      );
    }
  } else {
    linhas.push(textoDasExecutadas(executadasDaDecisao(propostas, resultados)));
  }
  if (restantes.length > 0) linhas.push(textoDasPendentes(restantes));
  return linhas.filter((l): l is string => !!l).join("\n\n");
}

/** Texto do DESFAZER. */
const MANTIDO_LABEL: Record<string, string> = {
  tarefa: "a tarefa (já foi feita ou cancelada)",
  tarefa_restaurada: "a tarefa (mudou depois)",
  agendamento: "a visita (já foi realizada ou cancelada)",
  agendamento_novo: "a visita nova (já foi realizada ou cancelada)",
  agendamento_restaurado: "a visita (mudou depois)",
  documento: "o documento (mudou depois ou já tem arquivo)",
};

function rotuloMantido(m: string): string {
  if (m.startsWith("ficha:")) return `${m.slice(6).replace(/_/g, " ")} na ficha`;
  return MANTIDO_LABEL[m] ?? m.replace(/_/g, " ");
}

export function textoDoDesfazer(
  resultados: ReadonlyArray<{ id: string; ok: boolean; erro?: string; mantidos?: string[] }>,
  acoes: ReadonlyArray<PropostaSamiQ>,
  /** Itens que o corretor apontou e que não voltam (já desfeitos, fora do prazo, tipo que não volta). */
  ignoradas: ReadonlyArray<{ acao: PropostaSamiQ; motivo: MotivoSemDesfazer }> = [],
): string {
  const linhasIgnoradas = ignoradas.map(
    ({ acao, motivo }) =>
      `${descreverProposta(acao.payload, acao.leadNome).titulo}: ${MOTIVO_SEM_DESFAZER_LABEL[motivo]}.`,
  );
  if (acoes.length === 0) {
    return linhasIgnoradas.length
      ? linhasIgnoradas.join("\n")
      : "Não achei nada recente para desfazer nesta conversa (o desfazer vale por 24 h).";
  }
  const titulo = (id: string) => {
    const p = acoes.find((x) => x.id === id);
    return p ? descreverProposta(p.payload, p.leadNome).titulo : "item";
  };
  const feitos = resultados.filter((r) => r.ok);
  const falhas = resultados.filter((r) => !r.ok);
  const linhas: string[] = [];
  if (feitos.length) linhas.push(`Desfeito: ${feitos.map((r) => titulo(r.id)).join("; ")}.`);
  if (falhas.length) {
    linhas.push(
      `Não desfiz: ${falhas.map((r) => `${titulo(r.id)}${r.erro ? ` (${r.erro})` : ""}`).join("; ")}.`,
    );
  }
  const mantidos = [...new Set(feitos.flatMap((r) => (r.mantidos ?? []).map(rotuloMantido)))];
  if (mantidos.length) {
    linhas.push(`Deixei como está o que mudou depois: ${mantidos.join("; ")}.`);
  }
  const mexeuEtapa = acoes.some(
    (a) =>
      feitos.some((f) => f.id === a.id) &&
      (a.tipo === "registrar_contato" ||
        a.tipo === "agendar_visita" ||
        /entrou em|foi para/.test(a.efeito ?? "")),
  );
  if (mexeuEtapa)
    linhas.push("A etapa do funil não volta sozinha; se precisar, me diga para onde.");
  return [...linhas, ...linhasIgnoradas].join("\n");
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
