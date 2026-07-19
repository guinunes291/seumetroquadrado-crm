/**
 * Helpers da suíte de banco (tests/db).
 *
 * A conexão principal é superusuário (postgres) — usada por factories e
 * asserções "visão de fora do RLS". Para agir como um usuário do app, use
 * `comoUsuario(client, userId)`: replica o que o PostgREST faz por request
 * (SET ROLE authenticated + request.jwt.claims), fazendo `auth.uid()` e as
 * policies RLS valerem de verdade.
 */
import { Client, Pool } from "pg";
import { randomUUID } from "node:crypto";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/postgres";

export function novoClient(): Client {
  return new Client({ connectionString: DATABASE_URL });
}

export const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

/** Assume a identidade de um usuário autenticado nesta conexão. */
export async function comoUsuario(c: Client, userId: string): Promise<void> {
  await c.query(`RESET ROLE`);
  await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await c.query(`SET ROLE authenticated`);
}

/** Volta a conexão para o superusuário (fora do RLS). */
export async function comoSuperuser(c: Client): Promise<void> {
  await c.query(`RESET ROLE`);
  await c.query(`SELECT set_config('request.jwt.claims', '', false)`);
}

export type Papel = "admin" | "gestor" | "corretor" | "superintendente";

export interface UsuarioTeste {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  equipeId: string | null;
}

let seq = 0;

/**
 * Cria usuário direto (auth.users sem o trigger de convite + profile ativa +
 * papel). Para exercitar o fluxo real de convite use `criarUsuarioViaConvite`.
 */
export async function criarUsuario(
  c: Client,
  opts: { nome?: string; papel?: Papel; equipeId?: string | null } = {},
): Promise<UsuarioTeste> {
  const id = randomUUID();
  const nome = opts.nome ?? `Usuário ${++seq}`;
  const papel = opts.papel ?? "corretor";
  const email = `u${seq}-${id.slice(0, 8)}@teste.local`;
  await comoSuperuser(c);
  // replica: pula o trigger on_auth_user_created (fluxo invite-only).
  await c.query(`SET session_replication_role = replica`);
  await c.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data)
     VALUES ($1, $2, jsonb_build_object('nome', $3::text))`,
    [id, email, nome],
  );
  await c.query(`SET session_replication_role = DEFAULT`);
  await c.query(
    `INSERT INTO public.profiles (id, email, nome, equipe_id, status_conta)
     VALUES ($1, $2, $3, $4, 'ativa')
     ON CONFLICT (id) DO UPDATE SET status_conta = 'ativa', equipe_id = EXCLUDED.equipe_id`,
    [id, email, nome, opts.equipeId ?? null],
  );
  await c.query(
    `INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [id, papel],
  );
  return { id, email, nome, papel, equipeId: opts.equipeId ?? null };
}

export async function criarEquipe(
  c: Client,
  opts: { nome?: string; gestorId?: string | null } = {},
): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.equipes (nome, gestor_id) VALUES ($1, $2) RETURNING id`,
    [opts.nome ?? `Equipe ${++seq}`, opts.gestorId ?? null],
  );
  return r.rows[0].id as string;
}

export async function criarProjeto(
  c: Client,
  opts: { nome?: string } = {},
): Promise<string> {
  await comoSuperuser(c);
  const r = await c.query(
    `INSERT INTO public.projetos (nome) VALUES ($1) RETURNING id`,
    [opts.nome ?? `Projeto ${++seq}`],
  );
  return r.rows[0].id as string;
}

export async function criarLead(
  c: Client,
  opts: {
    nome?: string;
    telefone?: string;
    corretorId?: string | null;
    status?: string;
    projetoId?: string | null;
    origem?: string;
  } = {},
): Promise<string> {
  await comoSuperuser(c);
  const n = ++seq;
  const r = await c.query(
    `INSERT INTO public.leads (nome, telefone, corretor_id, status, projeto_id, origem)
     VALUES ($1, $2, $3, $4::public.lead_status, $5, $6::public.lead_origem)
     RETURNING id`,
    [
      opts.nome ?? `Lead ${n}`,
      opts.telefone ?? `1199${String(1000000 + n).slice(-7)}`,
      opts.corretorId ?? null,
      opts.status ?? "novo",
      opts.projetoId ?? null,
      opts.origem ?? "outro",
    ],
  );
  return r.rows[0].id as string;
}

/**
 * Limpa os dados de negócio entre arquivos de teste, preservando seeds de
 * configuração (copa_config, configuracao_pontuacao, templates etc.).
 */
export async function limparDados(c: Client): Promise<void> {
  await comoSuperuser(c);
  await c.query(`
    TRUNCATE
      public.lead_eventos, public.lead_status_transitions, public.interacoes,
      public.tarefas, public.alertas, public.agendamentos, public.visitas,
      public.comissao_ledger, public.venda_metricas_ledger,
      public.venda_integridade_conflitos, public.comissoes, public.vendas,
      public.analises_credito, public.propostas, public.documentacoes,
      public.distribution_log, public.distribuicao_log_contexto,
      public.distribuicao_excecoes, public.roleta_participantes_log,
      public.roleta_participantes, public.fila_distribuicao,
      public.oferta_ativa_leads, public.leads_landing, public.leads,
      public.metas, public.metas_diarias, public.atividades_diarias,
      public.convites_crm, public.user_roles, public.profiles
      RESTART IDENTITY CASCADE
  `);
  await c.query(`DELETE FROM auth.users`);
}

/** ErrCode Postgres de uma promise rejeitada (ou null se resolveu). */
export async function errCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}
