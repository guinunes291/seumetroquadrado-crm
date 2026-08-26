// Distribuição v2 — contrato das migrations 20260826120000 (fundação) e
// 20260826121000 (motor). Política de Distribuição de Leads SMQ v1:
// quente ponderado por velocidade + base universal, atrás da flag
// modelo_v2_ativo (nasce DESLIGADA; rollback = 1 UPDATE em settings).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const FUND = "supabase/migrations/20260826120000_distribuicao_v2_fundacao.sql";
const MOTOR = "supabase/migrations/20260826121000_distribuicao_v2_motor.sql";
const fund = read(FUND);
const motor = read(MOTOR);
const fundCode = fund.replace(/--[^\n]*/g, "");
const motorCode = motor.replace(/--[^\n]*/g, "");
const motorFlat = motorCode.replace(/\s+/g, " ");
const fundFlat = fundCode.replace(/\s+/g, " ");

describe("ordem de replay", () => {
  it("fundação vem antes do motor, e o motor depois do último fix do ponderado (21/08)", () => {
    expect(FUND < MOTOR).toBe(true);
    expect(MOTOR > "supabase/migrations/20260821170000_ponderado_status_funil.sql").toBe(true);
  });
});

describe("fundação: flag e parâmetros nascem como dado, não código", () => {
  it("modelo_v2_ativo nasce DESLIGADO e a sanidade aborta se nascer ligado", () => {
    expect(fundFlat).toContain("('modelo_v2_ativo', 'false'::jsonb");
    expect(fund).toContain("modelo_v2_ativo precisa nascer DESLIGADO");
  });

  it("todos os limiares da política viram chaves de settings (mudar não exige deploy)", () => {
    for (const chave of [
      "sla_quente_minutos",
      "faixa_a_max_min",
      "faixa_b_max_min",
      "amostra_minima_faixa",
      "janela_faixa_dias",
      "disjuntor_wip",
      "posse_dias_atendimento",
      "posse_dias_avancado",
      "pausa_estouros_dia",
      "modelo_v2_sombra",
    ]) {
      expect(fundCode).toContain(`'${chave}'`);
    }
    // Valores aprovados na Fase 3: 15/60 min, amostra 5, janela 14, WIP 30, 7/30, 2 estouros.
    expect(fundFlat).toContain("('sla_quente_minutos', '15'::jsonb");
    expect(fundFlat).toContain("('faixa_a_max_min', '15'::jsonb");
    expect(fundFlat).toContain("('faixa_b_max_min', '60'::jsonb");
    expect(fundFlat).toContain("('amostra_minima_faixa', '5'::jsonb");
    expect(fundFlat).toContain("('janela_faixa_dias', '14'::jsonb");
    expect(fundFlat).toContain("('disjuntor_wip', '30'::jsonb");
    expect(fundFlat).toContain("('posse_dias_atendimento', '7'::jsonb");
    expect(fundFlat).toContain("('posse_dias_avancado', '30'::jsonb");
    expect(fundFlat).toContain("('pausa_estouros_dia', '2'::jsonb");
  });

  it("seed não sobrescreve valor existente (ON CONFLICT DO NOTHING)", () => {
    expect(fundFlat).toContain("ON CONFLICT (chave) DO NOTHING");
  });
});

describe("fundação: roleta base e classe do lead", () => {
  it("roleta 'base' é sistema, critério manual (sem a régua de % trabalhado do plantão) e exige presença", () => {
    expect(fundFlat).toContain("VALUES ('base', 'Roleta Base'");
    expect(fundFlat).toContain("true, 'manual', true, 'sistema')");
  });

  it("seed de participantes da base exclui docs-bot e quem não tem telefone ou role corretor", () => {
    expect(fundCode).toContain("lower(COALESCE(p.nome, '')) <> 'docs-bot'");
    expect(fundCode).toContain("COALESCE(p.telefone, '') <> ''");
    expect(fundCode).toContain("ur.role = 'corretor'");
  });

  it("leads.classe_lead nasce 'quente' com CHECK (quente|base)", () => {
    expect(fundFlat).toContain("classe_lead text NOT NULL DEFAULT 'quente'");
    expect(fundFlat).toContain("CHECK (classe_lead IN ('quente','base'))");
  });

  it("posse NÃO é retroativa: ultima_atividade_em nasce = now() e é renovada por interação, status e troca de dono", () => {
    expect(fundFlat).toContain("ultima_atividade_em timestamptz NOT NULL DEFAULT now()");
    expect(fundCode).toContain("trg_interacao_touch_lead");
    expect(fundCode).toContain("NEW.corretor_id IS DISTINCT FROM OLD.corretor_id");
  });
});

describe("fundação: régua extra e auditoria", () => {
  it("_apto_extra_v2 cobra vínculo, onboarding e disjuntor de WIP, com motivos nomeados", () => {
    for (const motivo of ["sem_modelo_contrato", "onboarding_pendente", "disjuntor_wip_"]) {
      expect(fundCode).toContain(motivo);
    }
  });

  it("sla_estouros e distribuicao_sombra: leitura via RLS, escrita só pelo motor (nenhuma policy de INSERT)", () => {
    expect(fundCode).toContain("CREATE TABLE IF NOT EXISTS public.sla_estouros");
    expect(fundCode).toContain("CREATE TABLE IF NOT EXISTS public.distribuicao_sombra");
    const policies = fundCode.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    for (const p of policies) {
      expect(p).toContain("FOR SELECT");
    }
  });

  it("views do painel semanal usam security_invoker (RLS de quem consulta)", () => {
    const views = fundCode.match(/CREATE OR REPLACE VIEW[\s\S]*?WITH \(security_invoker = true\)/g) ?? [];
    expect(views.length).toBe(4);
    for (const nome of ["v_velocidade_corretor", "v_wip_corretor", "v_leads_parados", "v_contato_efetivo"]) {
      expect(fundCode).toContain(nome);
    }
  });

  it("devolução por SLA vale 60 minutos na amostra de velocidade", () => {
    expect(fundCode).toContain("SELECT e.corretor_id, 60 AS minutos");
  });
});

describe("motor: os dois caminhos convivem atrás da flag", () => {
  it("com a flag desligada o caminho vigente continua inteiro (rodizio_menos_recente) — rollback de 1 UPDATE", () => {
    expect(motorCode).toContain("'rodizio_menos_recente'");
    expect(motor).toContain("rollback quebrado");
    expect(motorCode).not.toContain("DROP FUNCTION");
  });

  it("quente v2 = SWRR por faixa de velocidade com pesos 3/2/1 e advisory lock", () => {
    expect(motorFlat).toContain("CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END");
    expect(motorCode).toContain("pg_advisory_xact_lock(hashtext('roleta_swrr:' || _r.id::text))");
    expect(motorCode).toContain("'ponderado_velocidade'");
  });

  it("desempate do quente é declarado: cursor SWRR, depois há mais tempo sem receber, depois id", () => {
    expect(motorFlat).toContain(
      "ORDER BY rp.wrr_current DESC, rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC",
    );
  });

  it("lead de base roteia direto para a roleta 'base' (o piso), em rodízio puro", () => {
    expect(motorFlat).toContain("_classe = 'base' THEN _slug := 'base'");
    expect(motorCode).toContain("'rodizio_base'");
  });

  it("régua extra do v2 entra na seleção e fica auditada no contexto (inaptos_v2)", () => {
    expect(motorCode).toContain("_apto_extra_v2");
    expect(motorCode).toContain("'inaptos_v2', _inaptos_v2");
  });
});

describe("motor: SLA de 15 minutos úteis com pausa automática", () => {
  it("estouro conta uma vez por (corretor, lead) — o retry do cron não duplica", () => {
    expect(motorFlat).toContain(
      "EXISTS (SELECT 1 FROM public.sla_estouros e WHERE e.corretor_id = _corretor AND e.lead_id = _lead)",
    );
  });

  it("2 estouros no dia pausam até o dia seguinte, mas a BASE continua (piso preservado)", () => {
    expect(motorCode).toContain("pausa_estouros_dia");
    const pausas = motorCode.match(/r\.slug <> 'base'/g) ?? [];
    expect(pausas.length).toBeGreaterThanOrEqual(2);
  });

  it("SLA v2 é global (sla_quente_minutos) em minutos ÚTEIS, e o ramo vigente por origem sobrevive para o rollback", () => {
    expect(motorCode).toContain("sla_quente_minutos");
    expect(motorCode).toContain("_minutos_uteis_entre(_lead.data_distribuicao, now())");
    expect(motorCode).toContain("dc.timeout_minutos IS NOT NULL");
  });

  it("guarda de virada: repasse por SLA só olha lead distribuído nos últimos 7 dias (estoque antigo é assunto da posse)", () => {
    expect(motorFlat).toContain("l.data_distribuicao >= now() - interval '7 days'");
  });
});

describe("motor: posse 7/30 e recálculo semanal", () => {
  it("posse devolve como BASE, gradual (10 por corretor, 50 por rodada), e zera a lista de tentativas para o ciclo novo", () => {
    expect(motorCode).toContain("classe_lead = 'base'");
    expect(motorFlat).toContain("WHERE rn <= 10");
    expect(motorFlat).toContain("LIMIT 50");
    expect(motorFlat).toContain("corretores_que_tentaram = ARRAY[corretor_id]");
  });

  it("etapas avançadas usam a régua de 30 dias; iniciais, a de 7", () => {
    expect(motorFlat).toContain(
      "l.status IN ('agendado','qualificado','visita_realizada','proposta_enviada','analise_credito')",
    );
    expect(motorCode).toContain("posse_dias_avancado");
    expect(motorCode).toContain("posse_dias_atendimento");
  });

  it("com a flag desligada a posse é um no-op (retorna 0)", () => {
    expect(motorFlat).toContain("IF NOT public._modelo_v2_ativo() THEN RETURN 0; END IF;");
  });

  it("o cron semanal roteia pela flag: faixas de velocidade no v2, cálculo de campanha vigente no rollback", () => {
    expect(motorFlat).toContain("IF public._modelo_v2_ativo() THEN RETURN public.recalcular_faixas_velocidade(_gatilho);");
    expect(motorCode).toContain("recalcular_tiers_roleta(_r.slug, _gatilho)");
  });

  it("novato sem amostra fica na faixa B (neutra), nunca punido nem premiado de largada", () => {
    expect(motorFlat).toContain("WHEN amostra < _amin THEN 'B'");
    expect(motorFlat).toContain("SET tier = 'B', tier_score = NULL");
  });

  it("cron diário da posse agendado (09:00 BRT = 12:00 UTC)", () => {
    expect(motorCode).toContain("'posse-expirada-diaria'");
    expect(motorCode).toContain("'0 12 * * *'");
  });
});

describe("motor: sombra e sanidade", () => {
  it("modo sombra só roda com o v2 DESLIGADO, nunca em atribuição manual, e não pode derrubar a distribuição real", () => {
    expect(motorFlat).toContain("IF NOT _v2 AND _sombra AND _regra <> 'manual_direta'");
    expect(motorCode).toContain("EXCEPTION WHEN OTHERS THEN NULL;");
    expect(motorCode).toContain("distribuicao_sombra");
  });

  it("sanidade embutida aborta o deploy se um ramo sumir, e o schema recarrega", () => {
    for (const guarda of [
      "motor sem a flag do v2",
      "rollback quebrado",
      "SLA sem os dois ramos",
      "recalculo semanal sem o roteamento por flag",
    ]) {
      expect(motor).toContain(guarda);
    }
    expect(motor).toContain("NOTIFY pgrst, 'reload schema'");
    expect(fund).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
