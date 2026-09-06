// Canal WhatsApp da Sami (Onda S4) — o lado do servidor: autenticação
// server-to-server, corpo, corretor pelo telefone, SESSÃO DO CORRETOR e a
// decisão de pacotes pendentes. Só rotas /api/sami/* usam este módulo.
//
// A sessão do corretor é o ponto central da decisão D15: em vez de reescrever
// as ferramentas para o service_role (com escopo "na mão", como as edge
// functions antigas), o CRM abre uma sessão REAL do corretor — magic link
// gerado pelo admin e trocado por um JWT — e roda o mesmo cérebro do painel
// com RLS, auth.uid() e trilha de auditoria idênticos. A sessão vive só
// durante a requisição (signOut no finally) e o token nunca sai do servidor.

import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rateLimit } from "@/lib/rate-limit";
import {
  SAMI_CANAL_HEADER,
  SAMI_CANAL_MAX_BODY_BYTES,
  SAMI_CANAL_MAX_POR_MINUTO,
  escolherCorretorUnico,
  textoDaDecisao,
  type DecisaoResultado,
  type IntencaoCurta,
} from "@/lib/samiq-canal";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";
import { SamiQQuotaError } from "./samiq-governance.server";
import { gravarTurnoSamiQ } from "./samiq-memoria.server";
import { confirmarPropostas, rejeitarPropostas } from "./samiq-confirmar.server";

type Db = SupabaseClient<Database>;

export class CanalSamiError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly retryAfterS?: number,
  ) {
    super(mensagem);
    this.name = "CanalSamiError";
  }
}

export type CorretorCanal = { id: string; nome: string | null; email: string };

export function jsonCanal(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** x-sami-key vs SAMI_WRITE_KEY (o mesmo segredo das edge functions), em tempo constante. */
export function autenticarCanalSami(request: Request): void {
  const esperado = process.env.SAMI_WRITE_KEY ?? "";
  if (esperado.length < 16) {
    throw new CanalSamiError(503, "canal_nao_configurado", "Canal da Sami não configurado.");
  }
  const recebido = request.headers.get(SAMI_CANAL_HEADER) ?? "";
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new CanalSamiError(401, "nao_autorizado", "Chave do canal inválida.");
  }
}

export async function lerCorpoCanalSami<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const raw = await request.text();
  if (raw.length > SAMI_CANAL_MAX_BODY_BYTES) {
    throw new CanalSamiError(413, "corpo_grande", "Mensagem grande demais.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new CanalSamiError(400, "json_invalido", "Corpo não é JSON válido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const campos = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(raiz)"))];
    throw new CanalSamiError(422, "corpo_invalido", `Campos inválidos: ${campos.join(", ")}.`);
  }
  return parsed.data;
}

/** Corretor ativo pelo telefone (sufixo único) + limite de mensagens por minuto. */
export async function resolverCorretorPorTelefone(telefone: string): Promise<CorretorCanal> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, nome, email, telefone")
    .eq("ativo", true)
    .eq("status_conta", "ativa")
    .not("telefone", "is", null)
    .limit(2000);
  if (error) {
    throw new CanalSamiError(503, "crm_indisponivel", "Não consegui consultar os corretores.");
  }
  const r = escolherCorretorUnico(data ?? [], telefone);
  if (!r.ok) {
    if (r.erro === "corretor_ambiguo") {
      throw new CanalSamiError(
        409,
        "corretor_ambiguo",
        "Mais de um corretor com esse telefone. Peça ao gestor para corrigir o cadastro.",
      );
    }
    throw new CanalSamiError(
      404,
      "corretor_nao_encontrado",
      "Não achei um corretor ativo com esse telefone. Confira o número no seu perfil do CRM.",
    );
  }
  const rl = rateLimit(`samiq-canal:${r.corretor.id}`, SAMI_CANAL_MAX_POR_MINUTO, 60_000);
  if (!rl.allowed) {
    throw new CanalSamiError(
      429,
      "muitas_mensagens",
      `Muitas mensagens seguidas. Tente de novo em ${rl.retryAfterS}s.`,
      rl.retryAfterS,
    );
  }
  if (!r.corretor.email) {
    throw new CanalSamiError(409, "corretor_sem_email", "Corretor sem e-mail cadastrado.");
  }
  return { id: r.corretor.id, nome: r.corretor.nome, email: r.corretor.email };
}

/**
 * Sessão real do corretor: magic link gerado pelo admin (não envia e-mail) e
 * trocado por um JWT via verifyOtp. Devolve o cliente do usuário (RLS) e o
 * encerramento (signOut local revoga o refresh token na hora).
 */
export async function abrirSessaoDoCorretor(
  corretor: Pick<CorretorCanal, "id" | "email">,
): Promise<{ supabase: Db; encerrar: () => Promise<void> }> {
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishable) {
    throw new CanalSamiError(503, "sessao_indisponivel", "Sessão do corretor indisponível.");
  }
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: corretor.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.error(JSON.stringify({ event: "samiq_canal_sessao_failed", etapa: "link" }));
    throw new CanalSamiError(503, "sessao_indisponivel", "Não consegui abrir sua sessão.");
  }
  const semSessao = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const anon = createClient<Database>(url, publishable, { auth: semSessao });
  const { data: verif, error: verifErr } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  const token = verif?.session?.access_token;
  if (verifErr || !token || verif?.user?.id !== corretor.id) {
    console.error(JSON.stringify({ event: "samiq_canal_sessao_failed", etapa: "verify" }));
    throw new CanalSamiError(503, "sessao_indisponivel", "Não consegui abrir sua sessão.");
  }
  const supabase = createClient<Database>(url, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: semSessao,
  });
  const encerrar = async () => {
    try {
      await anon.auth.signOut({ scope: "local" });
    } catch {
      /* melhor esforço: o JWT expira sozinho */
    }
  };
  return { supabase, encerrar };
}

export async function comSessaoDoCorretor<T>(
  corretor: Pick<CorretorCanal, "id" | "email">,
  fn: (supabase: Db) => Promise<T>,
): Promise<T> {
  const sessao = await abrirSessaoDoCorretor(corretor);
  try {
    return await fn(sessao.supabase);
  } finally {
    await sessao.encerrar();
  }
}

/**
 * CONFIRMAR/CANCELAR um pacote pendente pelo WhatsApp — a mesma execução do
 * botão do card (samiq-confirmar.server.ts), com a sessão do corretor.
 */
export async function decidirPendentes(args: {
  corretor: CorretorCanal;
  decisao: IntencaoCurta;
  pendentes: PropostaSamiQ[];
  conversaId: string | null;
  mensagem: string;
}): Promise<{ texto: string; resultados: DecisaoResultado[] }> {
  const { corretor, decisao, pendentes } = args;
  let resultados: DecisaoResultado[] = [];
  if (pendentes.length > 0) {
    if (decisao === "confirmar") {
      resultados = await comSessaoDoCorretor(corretor, (supabase) =>
        confirmarPropostas({
          supabase,
          userId: corretor.id,
          itens: pendentes.map((p) => ({ id: p.id })),
        }),
      );
    } else {
      await rejeitarPropostas({ userId: corretor.id, ids: pendentes.map((p) => p.id) });
      resultados = pendentes.map((p) => ({ id: p.id, ok: true, status: "rejeitada" }));
    }
  }
  const texto = textoDaDecisao(decisao, resultados, pendentes);
  if (args.conversaId && pendentes.length > 0) {
    await gravarTurnoSamiQ({
      userId: corretor.id,
      conversaId: args.conversaId,
      pergunta: args.mensagem,
      resposta: texto,
      canal: "whatsapp",
    });
  }
  return { texto, resultados };
}

/** Erro → resposta JSON com um `texto` que o n8n pode mandar ao corretor. */
export function responderErroCanal(error: unknown): Response {
  if (error instanceof CanalSamiError) {
    return jsonCanal(
      {
        ok: false,
        erro: error.codigo,
        texto: error.message,
        ...(error.retryAfterS ? { retry_after: error.retryAfterS } : {}),
      },
      error.status,
    );
  }
  if (error instanceof SamiQQuotaError) {
    return jsonCanal(
      { ok: false, erro: "cota", texto: error.message, retry_after: error.retryAfterSeconds },
      429,
    );
  }
  console.error(
    JSON.stringify({
      event: "samiq_canal_failed",
      mensagem: error instanceof Error ? error.message.slice(0, 200) : "erro",
    }),
  );
  return jsonCanal(
    {
      ok: false,
      erro: "sami_indisponivel",
      texto: "A Sami está indisponível agora. Tente de novo em instantes.",
    },
    502,
  );
}
