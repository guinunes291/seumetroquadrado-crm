// Contrato do webhook do Zernio (POST /api/public/zernio-webhook).
// Puro: validação da assinatura e leitura tolerante dos eventos.
//
// Assinatura (docs do Zernio, "Signatures"): X-Zernio-Signature é o HMAC-SHA256
// em hex minúsculo do CORPO CRU, com o segredo cadastrado no webhook.
//
// Por que a leitura é tolerante: a doc pública do Zernio mostra o formato de
// message.received completo, mas o de comment.received só em parte. Para não
// perder comentário por causa de um nome de campo, cada dado é procurado nos
// nomes conhecidos (comment.id | comment.commentId, comment.text |
// comment.message, author | from...). Faltando o essencial, o evento é
// ignorado com motivo, nunca derruba a rota.
import { createHmac, timingSafeEqual } from "node:crypto";

export function assinaturaValida(
  corpoCru: string,
  assinatura: string | null | undefined,
  segredo: string,
): boolean {
  if (!assinatura || !segredo) return false;
  const esperado = createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex");
  const recebido = assinatura
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function str(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

export type Pessoa = { id: string | null; nome: string | null; username: string | null };

export type EventoMensagem = {
  tipo: "mensagem";
  eventoId: string | null;
  /** id da mensagem no Zernio: a chave de "responder uma vez por mensagem". */
  mensagemId: string;
  conversaId: string;
  contaId: string | null;
  texto: string | null;
  remetente: Pessoa;
  teste: boolean;
};

export type EventoComentario = {
  tipo: "comentario";
  eventoId: string | null;
  comentarioId: string;
  /** Id do post/mídia usado nas rotas de comentário do Zernio. */
  postId: string | null;
  contaId: string | null;
  texto: string | null;
  autor: Pessoa;
  teste: boolean;
};

export type EventoIgnorado = { tipo: "ignorado"; motivo: string; eventoId: string | null };

export type EventoZernio = EventoMensagem | EventoComentario | EventoIgnorado;

function pessoa(o: Obj | null): Pessoa {
  return {
    id: str(o?.id, o?.platformId, o?.userId),
    nome: str(o?.name, o?.displayName, o?.fullName),
    username: str(o?.username, o?.handle, o?.userName)?.replace(/^@/, "") ?? null,
  };
}

export function lerEvento(body: unknown): EventoZernio {
  const b = obj(body);
  if (!b) return { tipo: "ignorado", motivo: "corpo_invalido", eventoId: null };
  const eventoId = str(b.id);
  const evento = str(b.event, b.type);
  const teste = b.test === true;
  const conta = obj(b.account);
  const contaId = str(conta?.accountId, conta?.id, b.accountId);

  if (evento === "message.received") {
    const m = obj(b.message);
    if (!m) return { tipo: "ignorado", motivo: "sem_mensagem", eventoId };
    if (str(m.direction) === "outgoing") {
      return { tipo: "ignorado", motivo: "mensagem_enviada_por_nos", eventoId };
    }
    const plataforma = str(m.platform);
    if (plataforma && plataforma !== "instagram") {
      return { tipo: "ignorado", motivo: `plataforma_${plataforma}`, eventoId };
    }
    const mensagemId = str(m.id, m.platformMessageId);
    const conversaId = str(m.conversationId, obj(b.conversation)?.id);
    if (!mensagemId || !conversaId) {
      return { tipo: "ignorado", motivo: "mensagem_sem_id", eventoId };
    }
    return {
      tipo: "mensagem",
      eventoId,
      mensagemId,
      conversaId,
      contaId,
      texto: str(m.text),
      remetente: pessoa(obj(m.sender)),
      teste,
    };
  }

  if (evento === "comment.received") {
    const c = obj(b.comment);
    if (!c) return { tipo: "ignorado", motivo: "sem_comentario", eventoId };
    const plataforma = str(c.platform, b.platform, obj(b.post)?.platform);
    if (plataforma && plataforma !== "instagram") {
      return { tipo: "ignorado", motivo: `plataforma_${plataforma}`, eventoId };
    }
    const comentarioId = str(c.id, c.commentId, c.platformCommentId);
    if (!comentarioId) return { tipo: "ignorado", motivo: "comentario_sem_id", eventoId };
    const post = obj(b.post) ?? obj(c.post);
    return {
      tipo: "comentario",
      eventoId,
      comentarioId,
      postId: str(
        c.platformPostId,
        post?.platformPostId,
        c.postId,
        post?.id,
        c.mediaId,
        b.platformPostId,
      ),
      contaId,
      texto: str(c.text, c.message, c.content),
      autor: pessoa(obj(c.author) ?? obj(c.from) ?? obj(c.user)),
      teste,
    };
  }

  return { tipo: "ignorado", motivo: `evento_${evento ?? "desconhecido"}`, eventoId };
}
