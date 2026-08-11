// Guarda da quinta opção do filtro de análise (pedido do dono, 2026-08-11):
// 'nao_aprovada' = tem análise e a última NÃO é aprovação (nem plena, nem
// condicionada) — enviada/pendente/reprovada num recorte só. A migration
// remenda as DUAS funções v5 partindo do corpo VIVO (o da fiação, que já
// carrega o score da etapa Qualificação Corretor) — chips e lista nunca
// divergem, e valor desconhecido segue sendo erro 22023.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANALISE_FILTRO_OPCOES } from "@/lib/leads-views";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const mig = read("supabase/migrations/20260811160000_analise_filtro_nao_aprovada.sql").replace(
  /--[^\n]*/g,
  "",
);

const ocorrencias = (texto: string, re: RegExp) => (texto.match(re) ?? []).length;

describe("migration analise_filtro_nao_aprovada", () => {
  it("valor novo aceito na validação das DUAS funções (rigor mantido)", () => {
    expect(
      ocorrencias(
        mig,
        /\('all','em_andamento','aprovada','aprovada_condicionada','reprovada','nao_aprovada'\) THEN/g,
      ),
    ).toBe(2);
    expect(ocorrencias(mig, /RAISE EXCEPTION 'analise invalido/g)).toBe(2);
  });

  it("ramo 'nao_aprovada' nas DUAS funções: enviada/pendente/reprovada pela ÚLTIMA análise", () => {
    expect(ocorrencias(mig, /WHEN 'nao_aprovada' THEN/g)).toBe(2);
    expect(ocorrencias(mig, /IN \('enviada','pendente','reprovada'\)/g)).toBe(2);
  });

  it("parte do corpo VIVO da fiação: score da etapa nova preservado na filtered", () => {
    expect(mig).toContain("WHEN 'qualificacao_corretor' THEN 11");
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.leads_filtered_v5(");
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.leads_status_counts_v5(");
    expect(mig).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("opção compartilhada no front (grid, drawer da Consulta e URL herdam sozinhos)", () => {
    const opcao = ANALISE_FILTRO_OPCOES.find((o) => o.value === "nao_aprovada");
    expect(opcao?.label).toBe("Com análise, não aprovada");
  });
});
