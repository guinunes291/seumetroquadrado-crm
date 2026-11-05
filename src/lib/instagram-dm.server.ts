// Motor da automação de DM do Instagram (Zernio). Só servidor.
//
// Fluxo:
//  comentário com a palavra → DM privada de abertura (já com a 1ª pergunta)
//  DM com a palavra         → mesma abertura, na conversa
//  respostas na DM          → renda → região → prazo → WhatsApp → lead no CRM
//
// Garantias:
//  * uma resposta por mensagem: o id da mensagem/comentário é UNIQUE em
//    instagram_dm_eventos; repetido é ignorado. Só um evento cujo envio
//    FALHOU pode ser retomado (UPDATE condicional), e o Zernio reentrega
//    sozinho quando a rota responde 5xx;
//  * uma conversa aberta por pessoa (índice parcial no banco);
//  * o lead entra pelo webhook de leads da roleta escolhida, o mesmo caminho
//    do Meta Lead Ads (dedupe, registro mãe/filho, roleta, aviso ao corretor).
import {
  acharPalavra,
  ETAPAS,
  etapaAberta,
  preencher,
  proximoPasso,
  textosComPadrao,
  type Etapa,
} from "@/features/instagram-dm/texto";
import {
  assinaturaValida,
  lerEvento,
  type EventoComentario,
  type EventoMensagem,
} from "@/features/instagram-dm/zernio-webhook";
import {
  adminInstagram,
  type ConfigRow,
  type ConversaRow,
  type PalavraRow,
} from "@/integrations/supabase/instagram-dm-pendente";
import { captureServerError } from "@/lib/error-tracking.server";
import { agora, atualizarConversa, carregarConfig, msgErro } from "@/lib/instagram-dm-base.server";
import { enviarLeadAoCrm } from "@/lib/instagram-dm-lead.server";
import {
  enviarMensagem,
  responderComentarioEmPublico,
  responderComentarioNoPrivado,
} from "@/lib/zernio.server";

/** Conversa parada há mais que isso deixa de ser "aberta" e a pessoa pode recomeçar. */
const CONVERSA_EXPIRA_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TENTATIVAS_EVENTO = 5;

export type RespostaWebhook = { status: number; body: Record<string, unknown> };

async function palavrasAtivas(): Promise<PalavraRow[]> {
  const { data, error } = await adminInstagram()
    .from("instagram_dm_palavras")
    .select("*")
    .eq("ativo", true)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(`palavras: ${error.message}`);
  return data ?? [];
}

// --- Trava de evento --------------------------------------------------------

type Reivindicacao = { tipo: "nova"; eventoId: string } | { tipo: "duplicada" };

async function reivindicarEvento(
  mensagemId: string,
  tipo: "mensagem" | "comentario",
): Promise<Reivindicacao> {
  const db = adminInstagram();
  const { data, error } = await db
    .from("instagram_dm_eventos")
    .insert({ mensagem_id: mensagemId, tipo })
    .select("id")
    .single();
  if (data) return { tipo: "nova", eventoId: data.id };
  if (error?.code !== "23505") throw new Error(`evento: ${error?.message ?? "sem retorno"}`);

  // Já existe. Só retoma se o envio anterior falhou, e de forma atômica.
  const { data: atual } = await db
    .from("instagram_dm_eventos")
    .select("id, status, tentativas")
    .eq("mensagem_id", mensagemId)
    .maybeSingle();
  if (!atual || atual.status !== "erro" || atual.tentativas >= MAX_TENTATIVAS_EVENTO) {
    return { tipo: "duplicada" };
  }
  const { data: retomado } = await db
    .from("instagram_dm_eventos")
    .update({ status: "processando", tentativas: atual.tentativas + 1, atualizado_em: agora() })
    .eq("id", atual.id)
    .eq("status", "erro")
    .select("id")
    .maybeSingle();
  return retomado ? { tipo: "nova", eventoId: retomado.id } : { tipo: "duplicada" };
}

async function fecharEvento(
  eventoId: string,
  status: "respondido" | "erro",
  extra: { erro?: string | null; conversaId?: string | null } = {},
) {
  await adminInstagram()
    .from("instagram_dm_eventos")
    .update({
      status,
      erro: extra.erro ?? null,
      ...(extra.conversaId ? { conversa_id: extra.conversaId } : {}),
      atualizado_em: agora(),
    })
    .eq("id", eventoId);
}

const ETAPAS_ABERTAS = ETAPAS.filter(etapaAberta);

/**
 * Conversa aberta da pessoa. Procura pela conversa do Zernio, depois pelo id
 * da pessoa no Instagram (o mesmo no comentário e na DM) e, por último, pelo
 * @ — só entre conversas de comentário que ainda não têm conversa do Zernio.
 * Conversa parada há mais de 7 dias vira "abandonada" e a pessoa recomeça.
 */
async function conversaAberta(args: {
  conversationId?: string | null;
  senderId?: string | null;
  username?: string | null;
}): Promise<ConversaRow | null> {
  const db = adminInstagram();
  const base = () =>
    db
      .from("instagram_dm_conversas")
      .select("*")
      .in("etapa", ETAPAS_ABERTAS)
      .order("criado_em", { ascending: false })
      .limit(1);

  let c: ConversaRow | null = null;
  if (args.conversationId) {
    const { data } = await base().eq("conversation_id", args.conversationId);
    c = data?.[0] ?? null;
  }
  if (!c && args.senderId) {
    const { data } = await base().eq("sender_id", args.senderId);
    c = data?.[0] ?? null;
  }
  if (!c && args.username) {
    const { data } = await base().eq("username", args.username).is("conversation_id", null);
    c = data?.[0] ?? null;
  }
  if (!c) return null;
  if (Date.now() - new Date(c.atualizado_em).getTime() > CONVERSA_EXPIRA_MS) {
    await atualizarConversa(c.id, { etapa: "abandonada" });
    return null;
  }
  return c;
}

/**
 * A abertura padrão fala do comentário; quem chegou por DM recebe o mesmo
 * texto com "Vi seu comentário" trocado, para não soar robótico.
 */
export function aberturaParaDm(texto: string): string {
  return texto.replace(/vi seu coment[aá]rio/i, "Recebi sua mensagem");
}

// --- Comentário -------------------------------------------------------------

async function processarComentario(ev: EventoComentario, cfg: ConfigRow): Promise<RespostaWebhook> {
  const palavras = (await palavrasAtivas()).filter((p) => !p.post_id || p.post_id === ev.postId);
  const palavra = acharPalavra(ev.texto, palavras);
  if (!palavra) return { status: 200, body: { ok: true, ignorado: "sem_palavra" } };
  if (!ev.postId) return { status: 200, body: { ok: true, ignorado: "comentario_sem_post" } };

  const claim = await reivindicarEvento(ev.comentarioId, "comentario");
  if (claim.tipo === "duplicada") return { status: 200, body: { ok: true, duplicada: true } };

  const db = adminInstagram();
  let conversa = await conversaAberta({ senderId: ev.autor.id });

  // Já está no questionário (comentou de novo): não manda outra DM, a não ser
  // que a abertura DESTE comentário tenha falhado antes (retry do Zernio).
  if (conversa && (conversa.resposta_enviada || conversa.comment_id !== ev.comentarioId)) {
    await fecharEvento(claim.eventoId, "respondido", {
      conversaId: conversa.id,
      erro: "pessoa já estava em conversa; nenhuma DM nova",
    });
    return { status: 200, body: { ok: true, ja_em_conversa: true } };
  }

  if (!conversa) {
    const { data, error } = await db
      .from("instagram_dm_conversas")
      .insert({
        palavra_id: palavra.id,
        palavra: palavra.palavra,
        origem: "comentario",
        sender_id: ev.autor.id,
        nome: ev.autor.nome,
        username: ev.autor.username,
        comment_id: ev.comentarioId,
        post_id: ev.postId,
      })
      .select("*")
      .single();
    if (error || !data) {
      // 23505: outro comentário da mesma pessoa abriu a conversa no mesmo instante.
      const msg = error?.code === "23505" ? "conversa aberta em paralelo" : (error?.message ?? "");
      await fecharEvento(claim.eventoId, error?.code === "23505" ? "respondido" : "erro", {
        erro: msg,
      });
      return error?.code === "23505"
        ? { status: 200, body: { ok: true, ja_em_conversa: true } }
        : { status: 500, body: { ok: false, error: "temporarily_unavailable" } };
    }
    conversa = data;
  }

  const texto = preencher(palavra.mensagem_abertura, {
    nome: ev.autor.nome ?? ev.autor.username,
    palavra: palavra.palavra,
  });
  const contaId = cfg.zernio_account_id ?? "";
  try {
    await responderComentarioNoPrivado({
      postId: ev.postId,
      commentId: ev.comentarioId,
      accountId: contaId,
      texto,
    });
  } catch (e) {
    const erro = msgErro(e);
    await atualizarConversa(conversa.id, { erro });
    await fecharEvento(claim.eventoId, "erro", { erro, conversaId: conversa.id });
    return { status: 502, body: { ok: false, error: "envio_falhou" } };
  }
  await atualizarConversa(conversa.id, {
    resposta_enviada: true,
    resposta_enviada_em: agora(),
    erro: null,
  });

  // Resposta pública: melhor esforço. Falhar aqui não desfaz a DM.
  let avisoPublico: string | null = null;
  if (palavra.resposta_publica?.trim()) {
    try {
      await responderComentarioEmPublico({
        postId: ev.postId,
        commentId: ev.comentarioId,
        accountId: contaId,
        texto: preencher(palavra.resposta_publica, {
          nome: ev.autor.nome ?? ev.autor.username,
          palavra: palavra.palavra,
        }),
      });
    } catch (e) {
      avisoPublico = `DM enviada; resposta pública falhou: ${msgErro(e)}`;
    }
  }
  await fecharEvento(claim.eventoId, "respondido", { conversaId: conversa.id, erro: avisoPublico });
  return { status: 200, body: { ok: true, respondido: true } };
}

// --- Mensagem (DM) ----------------------------------------------------------

async function processarMensagem(ev: EventoMensagem, cfg: ConfigRow): Promise<RespostaWebhook> {
  const contaId = cfg.zernio_account_id ?? "";
  const conversa = await conversaAberta({
    conversationId: ev.conversaId,
    senderId: ev.remetente.id,
    username: ev.remetente.username,
  });

  // 1) Resposta de quem está no questionário.
  if (conversa) {
    if (!ev.texto) return { status: 200, body: { ok: true, ignorado: "sem_texto" } };
    const claim = await reivindicarEvento(ev.mensagemId, "mensagem");
    if (claim.tipo === "duplicada") return { status: 200, body: { ok: true, duplicada: true } };

    const cfgTextos = textosComPadrao(
      cfg.textos && typeof cfg.textos === "object" && !Array.isArray(cfg.textos)
        ? cfg.textos
        : null,
    );
    const passo = proximoPasso(
      { etapa: conversa.etapa as Etapa, tentativas_whatsapp: conversa.tentativas_whatsapp },
      ev.texto,
      cfgTextos,
      { nome: conversa.nome ?? ev.remetente.nome ?? conversa.username, palavra: conversa.palavra },
    );
    if (!passo) {
      await fecharEvento(claim.eventoId, "respondido", { conversaId: conversa.id });
      return { status: 200, body: { ok: true, ignorado: "conversa_encerrada" } };
    }

    try {
      await enviarMensagem({
        conversationId: ev.conversaId,
        accountId: contaId,
        texto: passo.resposta,
      });
    } catch (e) {
      const erro = msgErro(e);
      await atualizarConversa(conversa.id, { erro, conversation_id: ev.conversaId });
      await fecharEvento(claim.eventoId, "erro", { erro, conversaId: conversa.id });
      return { status: 502, body: { ok: false, error: "envio_falhou" } };
    }

    await atualizarConversa(conversa.id, {
      ...passo.respostas,
      etapa: passo.proximaEtapa,
      tentativas_whatsapp: passo.tentativasWhatsapp,
      conversation_id: ev.conversaId,
      nome: conversa.nome ?? ev.remetente.nome,
      username: conversa.username ?? ev.remetente.username,
      sender_id: conversa.sender_id ?? ev.remetente.id,
      erro: null,
    });
    await fecharEvento(claim.eventoId, "respondido", { conversaId: conversa.id });

    if (passo.criarLead) await enviarLeadAoCrm(conversa.id);
    return { status: 200, body: { ok: true, etapa: passo.proximaEtapa } };
  }

  // 2) DM nova com a palavra-chave.
  const palavra = acharPalavra(ev.texto, await palavrasAtivas());
  if (!palavra) return { status: 200, body: { ok: true, ignorado: "sem_palavra" } };

  const claim = await reivindicarEvento(ev.mensagemId, "mensagem");
  if (claim.tipo === "duplicada") return { status: 200, body: { ok: true, duplicada: true } };

  const db = adminInstagram();
  const { data: nova, error } = await db
    .from("instagram_dm_conversas")
    .insert({
      palavra_id: palavra.id,
      palavra: palavra.palavra,
      origem: "dm",
      sender_id: ev.remetente.id,
      nome: ev.remetente.nome,
      username: ev.remetente.username,
      conversation_id: ev.conversaId,
    })
    .select("*")
    .single();
  if (error || !nova) {
    const paralelo = error?.code === "23505";
    await fecharEvento(claim.eventoId, paralelo ? "respondido" : "erro", {
      erro: paralelo ? "conversa aberta em paralelo" : (error?.message ?? ""),
    });
    return paralelo
      ? { status: 200, body: { ok: true, ja_em_conversa: true } }
      : { status: 500, body: { ok: false, error: "temporarily_unavailable" } };
  }

  const texto = preencher(aberturaParaDm(palavra.mensagem_abertura), {
    nome: ev.remetente.nome ?? ev.remetente.username,
    palavra: palavra.palavra,
  });
  try {
    await enviarMensagem({ conversationId: ev.conversaId, accountId: contaId, texto });
  } catch (e) {
    const erro = msgErro(e);
    // Sem a abertura a pessoa não sabe que está num questionário: a conversa
    // fecha como abandonada para o retry do Zernio abrir outra limpa.
    await atualizarConversa(nova.id, { erro, etapa: "abandonada" });
    await fecharEvento(claim.eventoId, "erro", { erro, conversaId: nova.id });
    return { status: 502, body: { ok: false, error: "envio_falhou" } };
  }
  await atualizarConversa(nova.id, { resposta_enviada: true, resposta_enviada_em: agora() });
  await fecharEvento(claim.eventoId, "respondido", { conversaId: nova.id });
  return { status: 200, body: { ok: true, respondido: true } };
}

// --- Entrada do webhook -----------------------------------------------------

export async function processarWebhookZernio(
  corpoCru: string,
  assinatura: string | null,
): Promise<RespostaWebhook> {
  const cfg = await carregarConfig();
  const segredo = (cfg?.webhook_secret || process.env.ZERNIO_WEBHOOK_SECRET || "").trim();
  if (!cfg || !segredo) return { status: 503, body: { ok: false, error: "nao_conectado" } };
  if (!assinaturaValida(corpoCru, assinatura, segredo)) {
    return { status: 401, body: { ok: false, error: "assinatura_invalida" } };
  }

  let body: unknown;
  try {
    body = JSON.parse(corpoCru);
  } catch {
    return { status: 400, body: { ok: false, error: "invalid_json" } };
  }

  const ev = lerEvento(body);
  if (ev.tipo === "ignorado") return { status: 200, body: { ok: true, ignorado: ev.motivo } };
  // Evento de teste do painel do Zernio: confirma a conexão e não age.
  if (ev.teste) return { status: 200, body: { ok: true, teste: true } };
  if (cfg.zernio_account_id && ev.contaId && ev.contaId !== cfg.zernio_account_id) {
    return { status: 200, body: { ok: true, ignorado: "outra_conta" } };
  }

  try {
    return ev.tipo === "comentario"
      ? await processarComentario(ev, cfg)
      : await processarMensagem(ev, cfg);
  } catch (e) {
    await captureServerError(e, { mechanism: "zernio-webhook" });
    return { status: 500, body: { ok: false, error: "temporarily_unavailable" } };
  }
}
