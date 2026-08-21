// Roleta ponderada × funil — contrato da migration 20260821170000.
// Bug de 21/08: lead de campanha nascia 'em_atendimento' (4ª etapa) em vez de
// 'aguardando_atendimento' (1ª etapa), pulando o kanban e ficando invisível
// para o repasse por SLA (que só olha aguardando_atendimento).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIG = "supabase/migrations/20260821170000_ponderado_status_funil.sql";
const mig = read(MIG);
const migSemComentario = mig.replace(/--[^\n]*/g, "");

describe("ordem e escopo", () => {
  it("ordena DEPOIS da equipe fixa de 19/08 — o replay termina com o status certo", () => {
    expect(MIG > "supabase/migrations/20260819100000_campanhas_equipe_fixa.sql").toBe(true);
  });
});

describe("status de entrega no funil", () => {
  it("lead recém-distribuído cai em aguardando_atendimento (1ª etapa), como o motor v3", () => {
    expect(migSemComentario).toContain("THEN 'aguardando_atendimento'::public.lead_status");
    expect(migSemComentario).not.toContain("'em_atendimento'::public.lead_status)");
    expect(migSemComentario).not.toContain("THEN 'em_atendimento'");
  });

  it("lead que já avançou no funil não regride (CASE preserva os demais status)", () => {
    const bloco = migSemComentario.replace(/\s+/g, " ");
    expect(bloco).toContain(
      "status = CASE WHEN status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status, 'aguardando_atendimento'::public.lead_status) THEN 'aguardando_atendimento'::public.lead_status ELSE status END",
    );
  });
});

describe("não regride os fixes anteriores", () => {
  it("equipe_fixa continua respeitada (fix de 19/08)", () => {
    const bloco = migSemComentario.replace(/\s+/g, " ");
    expect(bloco).toContain("IF NOT _roleta.equipe_fixa THEN");
    expect(bloco).toContain("IF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN");
  });

  it("idempotência, advisory lock do SWRR e resultado 'sucesso' preservados", () => {
    expect(migSemComentario).toContain("'ja_atribuido'");
    expect(migSemComentario).toContain("pg_advisory_xact_lock(hashtext('roleta_swrr:'");
    expect(migSemComentario).toContain("'roleta_ponderada'");
    expect(migSemComentario).toMatch(/'sucesso'/);
  });

  it("sanidade embutida: aborta o deploy se em_atendimento voltar", () => {
    expect(mig).toContain("RAISE EXCEPTION 'roleta ponderada ainda grava em_atendimento'");
    expect(mig).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
