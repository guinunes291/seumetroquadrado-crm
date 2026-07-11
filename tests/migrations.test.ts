import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const all = files.map(read).join("\n");
const inviteOnlySecurity = read("20260711120000_invite_only_lead_access.sql");

function fileMatching(re: RegExp): string {
  const f = files.find((name) => re.test(read(name)));
  if (!f) throw new Error(`nenhuma migração casa ${re}`);
  return read(f);
}

describe("segurança das migrações", () => {
  it("todas as tabelas de staging (PII) recebem RLS", () => {
    // A migração de segurança de julho/2026 deve ligar RLS nas 4 stg_*.
    for (const t of ["stg_leads", "stg_agendamentos", "stg_visitas", "stg_analises"]) {
      expect(all).toContain(t);
    }
    expect(all).toMatch(/ENABLE ROW LEVEL SECURITY/);
    // O loop da migração de segurança cobre as 4 tabelas de staging.
    const seg = fileMatching(/stg_leads[\s\S]*ENABLE ROW LEVEL SECURITY/);
    expect(seg).toContain("REVOKE ALL");
  });

  it("a policy aberta de INSERT de vendas é removida", () => {
    expect(all).toContain('DROP POLICY IF EXISTS "vendas_insert_auth"');
    // e a substituta exige criado_por_id = auth.uid()
    const seg = fileMatching(/vendas_insert_own_or_gestor/);
    expect(seg).toContain("criado_por_id = auth.uid()");
  });

  it("existe o índice único parcial de dedup de telefone (guardado)", () => {
    const dedup = fileMatching(/uq_leads_projeto_telefone_ativo/);
    expect(dedup).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_projeto_telefone_ativo/);
    // guardado num DO-block que não trava se houver duplicatas
    expect(dedup).toContain("WHEN unique_violation THEN");
  });
});
describe("dedup: FK de auditoria", () => {
  it("adiciona FK guardada em leads.corretor_anterior_id", () => {
    const fk = fileMatching(/leads_corretor_anterior_fk/);
    expect(fk).toContain("REFERENCES auth.users(id)");
    expect(fk).toContain("ON DELETE SET NULL");
    // NOT VALID + validate guardado (não trava em órfãos legados)
    expect(fk).toContain("NOT VALID");
    expect(fk).toContain("VALIDATE CONSTRAINT");
  });
});

describe("segurança invite-only e isolamento de carteira", () => {
  it("separa estado da conta da elegibilidade operacional e expõe gate booleano", () => {
    expect(inviteOnlySecurity).toContain(
      "CREATE TYPE public.status_conta AS ENUM ('pendente', 'ativa', 'bloqueada')",
    );
    expect(inviteOnlySecurity).toContain("ALTER COLUMN status_conta SET DEFAULT 'pendente'");
    expect(inviteOnlySecurity).toMatch(
      /CREATE OR REPLACE FUNCTION public\.conta_atual_ativa\(\)[\s\S]*RETURNS boolean[\s\S]*public\.is_active_member\(auth\.uid\(\)\)/,
    );
    expect(inviteOnlySecurity).toMatch(
      /CREATE OR REPLACE FUNCTION public\.has_role[\s\S]*public\.is_active_member\(_user_id\)/,
    );
    expect(inviteOnlySecurity).not.toMatch(/profiles\.ativo\s*=\s*true[\s\S]*is_active_member/);
  });

  it("só concede papel e equipe ao consumir convite válido", () => {
    expect(inviteOnlySecurity).toContain("CREATE TABLE IF NOT EXISTS public.convites_crm");
    expect(inviteOnlySecurity).toContain("uq_convites_crm_email_pendente");
    expect(inviteOnlySecurity).toMatch(
      /CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*c\.estado = 'pendente'[\s\S]*c\.expira_em > now\(\)[\s\S]*IF FOUND THEN[\s\S]*equipe_id = _convite\.equipe_id[\s\S]*VALUES \(NEW\.id, _convite\.papel\)/,
    );
    expect(inviteOnlySecurity).not.toContain("Primeiro usuário do sistema vira admin");
    expect(inviteOnlySecurity).not.toMatch(
      /INSERT INTO public\.user_roles \(user_id, role\) VALUES \(NEW\.id, 'corretor'\)/,
    );
  });

  it("centraliza acesso ao lead por dono, equipe do gestor ou papel global", () => {
    expect(inviteOnlySecurity).toMatch(
      /FUNCTION public\.pode_acessar_lead[\s\S]*l\.corretor_id = _user_id[\s\S]*'superintendente'[\s\S]*gestor\.equipe_id = corretor\.equipe_id/,
    );
    expect(inviteOnlySecurity).toMatch(
      /FUNCTION public\.pode_atribuir_lead[\s\S]*_corretor_id = _user_id[\s\S]*corretor\.id = _corretor_id/,
    );
    expect(inviteOnlySecurity).toMatch(
      /CREATE POLICY "leads_update_carteira"[\s\S]*USING \(public\.pode_acessar_lead\(auth\.uid\(\), id\)\)[\s\S]*WITH CHECK \(public\.pode_atribuir_lead\(auth\.uid\(\), corretor_id\)\)/,
    );
    for (const table of ["public.leads", "public.documentacoes", "public.lead_eventos"]) {
      expect(inviteOnlySecurity).toMatch(
        new RegExp(
          `ON ${table.replace(".", "\\.")} FOR (SELECT|UPDATE|INSERT)[\\s\\S]*pode_acessar_lead`,
        ),
      );
    }
    expect(inviteOnlySecurity).toContain('DROP POLICY IF EXISTS "Autenticados veem leads landing"');
    expect(inviteOnlySecurity).toMatch(/lead_id IS NULL[\s\S]*has_role\(auth\.uid\(\), 'admin'\)/);
  });

  it("remove o UPDATE próprio amplo e oferece RPC de campos pessoais", () => {
    expect(inviteOnlySecurity).toContain(
      'DROP POLICY IF EXISTS "Usuário pode atualizar o próprio profile"',
    );
    const rpc = inviteOnlySecurity.match(
      /CREATE OR REPLACE FUNCTION public\.atualizar_meu_perfil[\s\S]*?REVOKE ALL ON FUNCTION public\.atualizar_meu_perfil/,
    )?.[0];
    expect(rpc).toBeTruthy();
    expect(rpc).toContain("SET nome = btrim(p_nome)");
    expect(rpc).toContain("telefone = NULLIF(btrim(p_telefone), '')");
    expect(rpc).toContain("avatar_url = NULLIF(btrim(p_avatar_url), '')");
    expect(rpc).not.toMatch(/SET[\s\S]*(status_conta|equipe_id|ativo)\s*=/);
  });

  it("fecha o Storage direto e deixa validadores para mediação server-side", () => {
    expect(inviteOnlySecurity).toMatch(
      /FUNCTION public\.documentacao_storage_autorizado[\s\S]*_partes\[1\]::uuid[\s\S]*_partes\[2\]::uuid[\s\S]*d\.lead_id = _lead_id/,
    );
    expect(inviteOnlySecurity).toContain("FUNCTION public.documentacao_upload_valido");
    expect(inviteOnlySecurity).toContain("15728640");
    for (const mime of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) {
      expect(inviteOnlySecurity).toContain(mime);
    }
    const storageLockdown = inviteOnlySecurity.slice(
      inviteOnlySecurity.indexOf('DROP POLICY IF EXISTS "documentacao_objects_select"'),
    );
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(storageLockdown).toContain(
        `DROP POLICY IF EXISTS "documentacao_objects_${operation}"`,
      );
    }
    expect(storageLockdown).not.toMatch(/CREATE POLICY[\s\S]*TO authenticated/i);
    expect(inviteOnlySecurity).toMatch(
      /REVOKE ALL ON FUNCTION public\.documentacao_storage_autorizado\(uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
  });
});

// NOTA: a consolidação das migrações duplicadas de comissoes/vendas/analises
// (schemas divergentes entre 20260616* e 20260619185115 que quebram
// `supabase db reset`) exige introspecção do banco vivo e está documentada como
// follow-up em docs/auditoria/2026-07-diagnostico.md — não é coberta por teste
// estático porque muitas "duplicatas" no repo são DROP TABLE IF EXISTS + CREATE
// (reproduzíveis), e distingui-las sem o schema vivo geraria falso positivo.
