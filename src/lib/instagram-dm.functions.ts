// Server functions do painel "DM do Instagram". Admin e gestor veem; só admin
// conecta, edita palavras e textos. Leitura e escrita com service role DEPOIS
// da checagem de papel: as tabelas instagram_dm_* não têm política de RLS
// (guardam o segredo do webhook e dados de quem ainda não é lead).
import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  ABERTURA_PADRAO,
  RESPOSTA_PUBLICA_PADRAO,
  TEXTOS_PADRAO,
  chavePalavra,
  textosComPadrao,
  type TextosConversa,
} from "@/features/instagram-dm/texto";

type Ctx = { userId: string; supabase: SupabaseClient<Database> };

async function papel(ctx: Ctx): Promise<{ admin: boolean; gestor: boolean }> {
  const [a, g] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "gestor" }),
  ]);
  return { admin: Boolean(a.data), gestor: Boolean(g.data) };
}

async function exigirLeitura(ctx: Ctx) {
  const p = await papel(ctx);
  if (!p.admin && !p.gestor) throw new Error("Apenas admin ou gestor.");
  return p;
}

async function exigirAdmin(ctx: Ctx) {
  const p = await papel(ctx);
  if (!p.admin) throw new Error("Apenas administradores podem alterar a automação.");
}

export type PalavraPainel = {
  id: string;
  palavra: string;
  ativo: boolean;
  mensagem_abertura: string;
  resposta_publica: string | null;
  post_id: string | null;
  roleta_id: string | null;
  roleta_nome: string | null;
  assunto: string | null;
};

export type ConversaPainel = {
  id: string;
  criado_em: string;
  nome: string | null;
  username: string | null;
  palavra: string;
  origem: "comentario" | "dm";
  resposta_enviada: boolean;
  resposta_enviada_em: string | null;
  etapa: string;
  renda_texto: string | null;
  regiao: string | null;
  prazo: string | null;
  tem_whatsapp: boolean;
  lead_id: string | null;
  lead_status: string | null;
  erro: string | null;
};

export type ErroPainel = { id: string; quando: string; origem: string; erro: string };

export type PainelInstagramDm = {
  podeEditar: boolean;
  chaveConfigurada: boolean;
  conexao: {
    conectado: boolean;
    username: string | null;
    accountId: string | null;
    webhookUrl: string | null;
    conectadoEm: string | null;
  };
  totais: {
    conversas: number;
    respondidas: number;
    qualificadas: number;
    leads: number;
    erros: number;
  };
  palavras: PalavraPainel[];
  roletas: Array<{ id: string; nome: string }>;
  conversas: ConversaPainel[];
  erros: ErroPainel[];
  textos: TextosConversa;
  padroes: { abertura: string; respostaPublica: string; textos: TextosConversa };
};

export const carregarPainelInstagramDm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PainelInstagramDm> => {
    const p = await exigirLeitura(context);
    const { adminInstagram } = await import("@/integrations/supabase/instagram-dm-pendente");
    const { zernioConfigurado } = await import("@/lib/zernio.server");
    const db = adminInstagram();

    const contar = async (filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
      const { count } = await filtro(base());
      return count ?? 0;
    };
    const base = () =>
      db.from("instagram_dm_conversas").select("id", { count: "exact", head: true });

    const [
      cfgR,
      palavrasR,
      roletasR,
      conversasR,
      errosEvR,
      conversas,
      respondidas,
      qualificadas,
      leads,
      errosConv,
      errosEv,
    ] = await Promise.all([
      db.from("instagram_dm_config").select("*").eq("id", 1).maybeSingle(),
      db.from("instagram_dm_palavras").select("*").order("criado_em", { ascending: true }),
      db
        .from("roletas")
        .select("id, nome, tipo, webhook_token")
        .in("tipo", ["campanha", "zona"])
        .order("nome", { ascending: true }),
      db
        .from("instagram_dm_conversas")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(200),
      db
        .from("instagram_dm_eventos")
        .select("id, recebido_em, atualizado_em, tipo, erro, status")
        .not("erro", "is", null)
        .order("atualizado_em", { ascending: false })
        .limit(50),
      contar((q) => q),
      contar((q) => q.eq("resposta_enviada", true)),
      contar((q) => q.eq("etapa", "concluida")),
      contar((q) => q.not("lead_id", "is", null)),
      contar((q) => q.not("erro", "is", null)),
      db
        .from("instagram_dm_eventos")
        .select("id", { count: "exact", head: true })
        .eq("status", "erro"),
    ]);

    const cfg = cfgR.data;
    const roletas = (roletasR.data ?? [])
      .filter((r) => Boolean(r.webhook_token))
      .map((r) => ({ id: r.id, nome: r.nome }));
    const nomeRoleta = new Map((roletasR.data ?? []).map((r) => [r.id, r.nome]));

    const erros: ErroPainel[] = [
      ...(conversasR.data ?? [])
        .filter((c) => c.erro)
        .map((c) => ({
          id: `c-${c.id}`,
          quando: c.atualizado_em,
          origem: `${c.nome || (c.username ? `@${c.username}` : "Sem nome")} · ${c.palavra}`,
          erro: c.erro ?? "",
        })),
      ...(errosEvR.data ?? []).map((e) => ({
        id: `e-${e.id}`,
        quando: e.atualizado_em,
        origem: e.tipo === "comentario" ? "Comentário" : "Mensagem",
        erro: `${e.status === "respondido" ? "Aviso: " : ""}${e.erro ?? ""}`,
      })),
    ]
      .sort((a, b) => b.quando.localeCompare(a.quando))
      .slice(0, 50);

    return {
      podeEditar: p.admin,
      chaveConfigurada: zernioConfigurado(),
      conexao: {
        conectado: Boolean(cfg?.zernio_account_id && cfg?.webhook_secret && cfg?.webhook_url),
        username: cfg?.zernio_username ?? null,
        accountId: cfg?.zernio_account_id ?? null,
        webhookUrl: cfg?.webhook_url ?? null,
        conectadoEm: cfg?.conectado_em ?? null,
      },
      totais: {
        conversas,
        respondidas,
        qualificadas,
        leads,
        erros: errosConv + (errosEv.count ?? 0),
      },
      palavras: (palavrasR.data ?? []).map((w) => ({
        id: w.id,
        palavra: w.palavra,
        ativo: w.ativo,
        mensagem_abertura: w.mensagem_abertura,
        resposta_publica: w.resposta_publica,
        post_id: w.post_id,
        roleta_id: w.roleta_id,
        roleta_nome: w.roleta_id ? (nomeRoleta.get(w.roleta_id) ?? null) : null,
        assunto: w.assunto,
      })),
      roletas,
      conversas: (conversasR.data ?? []).map((c) => ({
        id: c.id,
        criado_em: c.criado_em,
        nome: c.nome,
        username: c.username,
        palavra: c.palavra,
        origem: c.origem,
        resposta_enviada: c.resposta_enviada,
        resposta_enviada_em: c.resposta_enviada_em,
        etapa: c.etapa,
        renda_texto: c.renda_texto,
        regiao: c.regiao,
        prazo: c.prazo,
        tem_whatsapp: Boolean(c.whatsapp),
        lead_id: c.lead_id,
        lead_status: c.lead_status,
        erro: c.erro,
      })),
      erros,
      textos: textosComPadrao(
        cfg?.textos && typeof cfg.textos === "object" && !Array.isArray(cfg.textos)
          ? cfg.textos
          : null,
      ),
      padroes: {
        abertura: ABERTURA_PADRAO,
        respostaPublica: RESPOSTA_PUBLICA_PADRAO,
        textos: TEXTOS_PADRAO,
      },
    };
  });

/** Origem publicada do CRM (https). Endereço de preview não recebe webhook. */
function validarOrigem(origem: unknown): string {
  if (typeof origem !== "string") throw new Error("Informe o endereço publicado do CRM.");
  let url: URL;
  try {
    url = new URL(origem.trim());
  } catch {
    throw new Error("Endereço do CRM inválido.");
  }
  if (url.protocol !== "https:") throw new Error("O endereço do CRM precisa ser https.");
  if (/(^|[.-])preview|localhost/i.test(url.hostname)) {
    throw new Error("Use o endereço PUBLICADO do CRM, não o de preview.");
  }
  return url.origin;
}

export const conectarInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origem: string }) => ({ origem: validarOrigem(input?.origem) }))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { adminInstagram } = await import("@/integrations/supabase/instagram-dm-pendente");
    const zernio = await import("@/lib/zernio.server");
    if (!zernio.zernioConfigurado()) {
      throw new Error("Falta o secret ZERNIO_API_KEY no servidor do CRM.");
    }
    const db = adminInstagram();
    const { data: atual } = await db
      .from("instagram_dm_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const conta = await zernio.descobrirContaInstagram(atual?.zernio_account_id);
    // Segredo novo a cada conexão: 32 bytes aleatórios. Fica só no banco
    // (tabela sem acesso pelo navegador) e no cadastro do webhook no Zernio.
    const secret = randomBytes(32).toString("hex");
    const webhookUrl = `${data.origem}/api/public/zernio-webhook`;
    const webhook = await zernio.cadastrarWebhook({
      url: webhookUrl,
      secret,
      accountId: conta.id,
      webhookIdAtual: atual?.zernio_webhook_id,
    });

    const { error } = await db.from("instagram_dm_config").upsert({
      id: 1,
      zernio_account_id: conta.id,
      zernio_username: conta.username,
      zernio_webhook_id: webhook.id,
      webhook_url: webhookUrl,
      webhook_secret: secret,
      app_origin: data.origem,
      conectado_em: new Date().toISOString(),
      conectado_por: context.userId,
      atualizado_em: new Date().toISOString(),
    });
    if (error) {
      throw new Error(
        `Webhook cadastrado no Zernio, mas não consegui salvar a conexão: ${error.message}. Clique de novo.`,
      );
    }
    return { username: conta.username, accountId: conta.id, webhookUrl, acao: webhook.acao };
  });

export type PalavraInput = {
  id?: string | null;
  palavra: string;
  ativo: boolean;
  mensagem_abertura: string;
  resposta_publica?: string | null;
  post_id?: string | null;
  roleta_id?: string | null;
  assunto?: string | null;
};

const LIMITE_DM = 1000;

export const salvarPalavraInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PalavraInput) => {
    const palavra = String(input?.palavra ?? "").trim();
    const chave = chavePalavra(palavra);
    if (!chave) throw new Error("Digite a palavra-chave (letras ou números).");
    if (chave.length > 40) throw new Error("Palavra-chave longa demais.");
    const abertura = String(input?.mensagem_abertura ?? "").trim();
    if (!abertura) throw new Error("Escreva a mensagem de abertura.");
    if (abertura.length > LIMITE_DM) throw new Error("A mensagem passa de 1000 caracteres.");
    const vazio = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const roleta = vazio(input?.roleta_id);
    if (roleta && !/^[0-9a-f-]{36}$/i.test(roleta)) throw new Error("Roleta inválida.");
    const id = vazio(input?.id);
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Palavra inválida.");
    return {
      id,
      palavra: palavra.slice(0, 60),
      palavra_chave: chave,
      ativo: input?.ativo !== false,
      mensagem_abertura: abertura,
      resposta_publica: vazio(input?.resposta_publica)?.slice(0, 300) ?? null,
      post_id: vazio(input?.post_id)?.slice(0, 100) ?? null,
      roleta_id: roleta,
      assunto: vazio(input?.assunto)?.slice(0, 200) ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { adminInstagram } = await import("@/integrations/supabase/instagram-dm-pendente");
    const db = adminInstagram();
    const { id, ...campos } = data;
    const r = id
      ? await db
          .from("instagram_dm_palavras")
          .update({ ...campos, atualizado_em: new Date().toISOString() })
          .eq("id", id)
      : await db.from("instagram_dm_palavras").insert(campos);
    if (r.error) {
      if (r.error.code === "23505") throw new Error(`A palavra ${data.palavra} já existe.`);
      throw new Error(r.error.message);
    }
    return { ok: true };
  });

export const salvarTextosInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<TextosConversa>) => {
    const out: Partial<TextosConversa> = {};
    for (const chave of Object.keys(TEXTOS_PADRAO) as Array<keyof TextosConversa>) {
      const v = input?.[chave];
      if (typeof v === "string" && v.trim()) out[chave] = v.trim().slice(0, LIMITE_DM);
    }
    return out;
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { adminInstagram } = await import("@/integrations/supabase/instagram-dm-pendente");
    const { error } = await adminInstagram()
      .from("instagram_dm_config")
      .update({ textos: data, atualizado_em: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reenviarLeadInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversaId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(input?.conversaId ?? "")))
      throw new Error("Conversa inválida.");
    return { conversaId: input.conversaId };
  })
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { enviarLeadAoCrm } = await import("@/lib/instagram-dm-lead.server");
    return enviarLeadAoCrm(data.conversaId);
  });
