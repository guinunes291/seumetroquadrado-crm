import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { conferirSenha, hashToken, novoToken } from "./senha";
import { registrar } from "./auditoria";

export const COOKIE = "painel_sessao";
const DIAS = 7;

export type Sessao = { email: string };

export async function sessaoAtual(): Promise<Sessao | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const [linha] = await sql()<{ email: string }[]>`
    select s.email from sessoes s
    join usuarios_permitidos u on u.email = s.email
    where s.id_hash = ${hashToken(id)} and s.revogada_em is null and s.expira_em > now()`;
  return linha ? { email: linha.email } : null;
}

export async function exigirSessao(): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  return s;
}

export async function abrirSessao(email: string) {
  const id = novoToken();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await sql()`
    insert into sessoes (id_hash, email, expira_em, user_agent)
    values (${hashToken(id)}, ${email}, now() + make_interval(days => ${DIAS}), ${ua})`;
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS * 24 * 3600,
  });
}

export async function encerrarSessao() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) {
    await sql()`update sessoes set revogada_em = now() where id_hash = ${hashToken(id)} and revogada_em is null`;
  }
  jar.delete(COOKIE);
}

// Mesma mensagem para e-mail desconhecido e senha errada: quem tenta adivinhar
// não descobre quais e-mails têm acesso.
export async function entrar(emailBruto: string, senha: string): Promise<boolean> {
  const email = emailBruto.trim().toLowerCase();
  // Trava simples contra tentativa em massa: 8 erros em 15 minutos bloqueiam o e-mail.
  const [{ erros }] = await sql()<{ erros: number }[]>`
    select count(*)::int as erros from auditoria
    where quem = ${email} and acao = 'login_recusado' and quando > now() - interval '15 minutes'`;
  if (erros >= 8) return false;
  const [cred] = await sql()<{ senha_hash: string }[]>`
    select c.senha_hash from credenciais c
    join usuarios_permitidos u on u.email = c.email
    where c.email = ${email}`;
  const ok = cred ? await conferirSenha(senha, cred.senha_hash) : false;
  await registrar(email || "desconhecido", ok ? "login" : "login_recusado", null, {});
  if (ok) await abrirSessao(email);
  return ok;
}

export async function conviteValido(token: string): Promise<string | null> {
  const [c] = await sql()<{ email: string }[]>`
    select email from convites
    where token_hash = ${hashToken(token)} and usado_em is null and expira_em > now()`;
  return c?.email ?? null;
}

// Convite de uso único: define a senha, queima o convite e já abre a sessão.
export async function definirSenhaPorConvite(
  token: string,
  senhaHash: string,
): Promise<string | null> {
  const email = await sql().begin(async (tx) => {
    const [c] = await tx<{ email: string }[]>`
      update convites set usado_em = now()
      where token_hash = ${hashToken(token)} and usado_em is null and expira_em > now()
      returning email`;
    if (!c) return null;
    await tx`
      insert into credenciais (email, senha_hash) values (${c.email}, ${senhaHash})
      on conflict (email) do update set senha_hash = excluded.senha_hash, atualizado_em = now()`;
    await tx`update sessoes set revogada_em = now() where email = ${c.email} and revogada_em is null`;
    return c.email;
  });
  if (!email) return null;
  await registrar(email, "senha_definida", null, {});
  await abrirSessao(email);
  return email;
}
