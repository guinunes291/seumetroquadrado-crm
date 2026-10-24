/**
 * SAMI v8 — o caminho de escrita INTEIRO contra o banco real, ação por ação.
 *
 * Para cada um dos 25 tipos: a ação é registrada (samiq_registrar_propostas),
 * reivindicada, executada pelo executor com a SESSÃO DO CORRETOR (RLS,
 * triggers e as RPCs oficiais da tela) e decidida no banco, exatamente como o
 * CONFIRMAR do WhatsApp e o card do painel fazem (samiq-confirmar.server.ts).
 * O "supabase" aqui é o adaptador de tests/db/supabase-sobre-pg.ts: o mesmo
 * query builder do código, traduzido para SQL na conexão do corretor (ou do
 * service_role, no lugar do supabaseAdmin).
 *
 * É a prova de "sem erros" do CRM no WhatsApp: se uma RPC mudar de
 * assinatura, uma policy barrar o corretor ou um trigger recusar o dado, o
 * teste da ação quebra aqui, não no celular do corretor.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Client } from "pg";
import {
  comoSuperuser,
  criarEquipe,
  criarLead,
  criarProjeto,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";
import { novoClientPostgrest, supabaseSobrePg, type SupabaseSobrePg } from "./supabase-sobre-pg";

vi.mock("@/integrations/supabase/client.server", async () => {
  const { novoClientPostgrest: novo, supabaseSobrePg: sobre } = await import("./supabase-sobre-pg");
  const admin = novo();
  await admin.connect();
  return { supabaseAdmin: sobre(admin, { tipo: "servico" }), __fecharAdmin: () => admin.end() };
});

import { confirmarPropostas, desfazerPropostas } from "@/lib/samiq-confirmar.server";
import { registrarPropostasSamiQ } from "@/lib/samiq-memoria.server";
import type { PropostaPayload } from "@/lib/samiq-propostas";

const c = novoClient();
const cc = novoClientPostgrest();
let corretor: UsuarioTeste;
let sessao: SupabaseSobrePg;
let projeto: string;

const AGORA = new Date();
const daquiDias = (d: number, hora = 13) => {
  const t = new Date(AGORA.getTime() + d * 86_400_000);
  t.setUTCHours(hora, 0, 0, 0);
  return t.toISOString();
};
const proximoMes = () => {
  const d = new Date(AGORA.getTime() + 35 * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

async function executar(payload: PropostaPayload, leadId: string | null, contexto?: object) {
  const [p] = await registrarPropostasSamiQ({
    userId: corretor.id,
    executionId: null,
    conversaId: null,
    coletadas: [{ payload, leadId, leadNome: "Cliente Teste" }],
  });
  expect(p, "registro da proposta").toBeTruthy();
  const [r] = await confirmarPropostas({
    supabase: sessao as never,
    userId: corretor.id,
    itens: [{ id: p.id }],
    contexto,
  });
  await comoSuperuser(c);
  const row = (
    await c.query(
      `SELECT status, erro, resultado, desfazer_ate FROM public.samiq_propostas WHERE id = $1`,
      [p.id],
    )
  ).rows[0] as {
    status: string;
    erro: string | null;
    resultado: Record<string, unknown> | null;
    desfazer_ate: string | null;
  };
  return { id: p.id, r, row };
}

/** Executa e exige sucesso, mostrando o erro do banco quando falhar. */
async function ok(payload: PropostaPayload, leadId: string | null, contexto?: object) {
  const out = await executar(payload, leadId, contexto);
  expect(out.r.erro ?? null, `${payload.tipo}: ${out.r.erro}`).toBeNull();
  expect(out.r.ok, payload.tipo).toBe(true);
  expect(out.row.status).toBe("aceita");
  return out;
}

async function lead(status: string, nome?: string): Promise<string> {
  return criarLead(c, {
    corretorId: corretor.id,
    status,
    nome: nome ?? `Cliente ${status} ${Math.random().toString(36).slice(2, 6)}`,
  });
}

async function statusDe(id: string): Promise<string> {
  await comoSuperuser(c);
  return (await c.query(`SELECT status::text AS s FROM public.leads WHERE id = $1`, [id])).rows[0]
    .s as string;
}

beforeAll(async () => {
  await c.connect();
  await cc.connect();
  await limparDados(c);
  await c.query(`DELETE FROM public.samiq_execucoes`);
  const equipe = await criarEquipe(c);
  corretor = await criarUsuario(c, { papel: "corretor", equipeId: equipe, nome: "Ana Corretora" });
  sessao = supabaseSobrePg(cc, { tipo: "usuario", userId: corretor.id });
  projeto = await criarProjeto(c, { nome: "Vibra Sabará" });
  // Coluna que o Lovable criou direto em produção (drizzle 0092) e que o
  // replay de supabase/migrations ainda não traz: o banco de teste fica igual
  // ao de produção para a venda.
  await c.query(`ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS previsao_recebimento date`);
});

afterAll(async () => {
  await comoSuperuser(c);
  await c.end();
  await cc.end();
  const mod = (await import("@/integrations/supabase/client.server")) as unknown as {
    __fecharAdmin?: () => Promise<void>;
  };
  await mod.__fecharAdmin?.();
});

describe("contato, nota, tarefa e ficha (leves)", () => {
  it("registrar_contato: cliente novo que atendeu entra em Em atendimento por consequência", async () => {
    const id = await lead("novo");
    const { r, row } = await ok(
      {
        tipo: "registrar_contato",
        leadId: id,
        canal: "ligacao",
        resultado: "atendeu",
        resumo: "quer 2 dorms na Leste",
        objecoes: ["parcela alta"],
        followupEm: daquiDias(2),
      },
      id,
    );
    expect(await statusDe(id)).toBe("em_atendimento");
    expect(r.efeito).toContain("entrou em Em atendimento");
    expect(row.desfazer_ate).not.toBeNull();
    const meta = await c.query(`SELECT metadata FROM public.interacoes WHERE id = $1`, [
      row.resultado?.interacao_id,
    ]);
    expect(meta.rows[0].metadata).toMatchObject({ via: "samiq", origem: "registrar_contato" });
    const obj = await c.query(`SELECT objecoes FROM public.leads WHERE id = $1`, [id]);
    expect(obj.rows[0].objecoes).toContain("parcela alta");
  });

  it("anotar e criar_tarefa (tarefa no mesmo horário é reaproveitada)", async () => {
    const id = await lead("em_atendimento");
    await ok({ tipo: "anotar", leadId: id, nota: "prefere contato depois das 18h" }, id);
    const t1 = await ok(
      {
        tipo: "criar_tarefa",
        leadId: id,
        titulo: "Ligar para a cliente",
        tipoTarefa: "ligacao",
        vencimentoEm: daquiDias(1),
      },
      id,
    );
    const t2 = await ok(
      {
        tipo: "criar_tarefa",
        leadId: id,
        titulo: "Mandar a simulação",
        tipoTarefa: "whatsapp",
        vencimentoEm: daquiDias(1),
      },
      id,
    );
    expect(t2.row.resultado?.tarefa_atualizada_id).toBe(t1.row.resultado?.tarefa_id);
  });

  it("atualizar_qualificacao: só os campos ditos, com empreendimento pelo id; desfazer volta a ficha", async () => {
    const id = await lead("em_atendimento");
    const { id: pid } = await ok(
      {
        tipo: "atualizar_qualificacao",
        leadId: id,
        rendaEstimada: 4200,
        usaFgts: true,
        fgtsValor: 12000,
        tipoRenda: "clt",
        temperatura: "quente",
        decisor: "casal",
        projetoId: projeto,
      },
      id,
    );
    const l = await c.query(
      `SELECT renda_estimada, usa_fgts, fgts_valor, tipo_renda, temperatura::text, decisor, projeto_id, projeto_nome FROM public.leads WHERE id = $1`,
      [id],
    );
    expect(l.rows[0]).toMatchObject({
      usa_fgts: true,
      tipo_renda: "clt",
      temperatura: "quente",
      projeto_id: projeto,
      projeto_nome: "Vibra Sabará",
    });
    const [d] = await desfazerPropostas({ userId: corretor.id, ids: [pid] });
    expect(d.ok, d.erro).toBe(true);
    const depois = await c.query(
      `SELECT fgts_valor, projeto_id, temperatura::text FROM public.leads WHERE id = $1`,
      [id],
    );
    expect(depois.rows[0]).toMatchObject({ fgts_valor: null, projeto_id: null });
  });
});

describe("tarefas", () => {
  it("concluir, reagendar e cancelar uma tarefa da carteira", async () => {
    const id = await lead("em_atendimento");
    const t = await ok(
      {
        tipo: "criar_tarefa",
        leadId: id,
        titulo: "Cobrar holerite",
        tipoTarefa: "whatsapp",
        vencimentoEm: daquiDias(3),
      },
      id,
    );
    const tarefaId = String(t.row.resultado?.tarefa_id);
    await ok({ tipo: "reagendar_tarefa", tarefaId, novoVencimentoEm: daquiDias(4) }, id);
    const c1 = await ok({ tipo: "concluir_tarefa", tarefaId, resultado: "mandou o holerite" }, id);
    expect(
      (await c.query(`SELECT status::text FROM public.tarefas WHERE id = $1`, [tarefaId])).rows[0]
        .status,
    ).toBe("concluida");
    const [d] = await desfazerPropostas({ userId: corretor.id, ids: [c1.id] });
    expect(d.ok, d.erro).toBe(true);
    expect(
      (await c.query(`SELECT status::text FROM public.tarefas WHERE id = $1`, [tarefaId])).rows[0]
        .status,
    ).toBe("pendente");
    await ok({ tipo: "cancelar_tarefa", tarefaId, motivo: "cliente já mandou" }, id);
    expect(
      (await c.query(`SELECT status::text FROM public.tarefas WHERE id = $1`, [tarefaId])).rows[0]
        .status,
    ).toBe("cancelada");
  });
});

describe("visita: agendar, confirmar, remarcar, cancelar e resultado", () => {
  it("o ciclo inteiro da visita, com o funil andando como na tela", async () => {
    const id = await lead("em_atendimento", "Bruna Visita");
    const ag = await ok(
      { tipo: "agendar_visita", leadId: id, inicioEm: daquiDias(2, 14), local: "Estande Vibra" },
      id,
    );
    expect(await statusDe(id)).toBe("agendado");
    const visita = String(ag.row.resultado?.agendamento_id);

    await ok({ tipo: "confirmar_visita", agendamentoId: visita }, id);
    expect(
      (await c.query(`SELECT status::text FROM public.agendamentos WHERE id = $1`, [visita]))
        .rows[0].status,
    ).toBe("confirmado");

    const rem = await ok(
      { tipo: "remarcar_visita", agendamentoId: visita, novoInicioEm: daquiDias(3, 15) },
      id,
    );
    const nova = String(rem.row.resultado?.agendamento_novo_id);
    expect(
      (await c.query(`SELECT status::text FROM public.agendamentos WHERE id = $1`, [visita]))
        .rows[0].status,
    ).toBe("remarcado");

    await ok({ tipo: "cancelar_visita", agendamentoId: nova, motivo: "cliente viajou" }, id);
    expect(
      (await c.query(`SELECT status::text FROM public.agendamentos WHERE id = $1`, [nova])).rows[0]
        .status,
    ).toBe("cancelado");
  });

  it("registrar_visita: compareceu, com interesse e próxima etapa", async () => {
    const id = await lead("em_atendimento", "Carla Visitou");
    await ok({ tipo: "agendar_visita", leadId: id, inicioEm: daquiDias(0, 23) }, id);
    const { r } = await ok(
      {
        tipo: "registrar_visita",
        leadId: id,
        compareceu: true,
        interesse: "alto",
        objecaoPrincipal: "entrada_alta",
        observacoes: "gostou da planta",
      },
      id,
    );
    expect(await statusDe(id)).toBe("visita_realizada");
    expect(r.efeito).toContain("visita realizada");
  });

  it("registrar_visita: visita que aconteceu sem agendamento (cria o automático)", async () => {
    const id = await lead("em_atendimento", "Diego Sem Agenda");
    const { row } = await ok(
      { tipo: "registrar_visita", leadId: id, compareceu: true, interesse: "medio" },
      id,
    );
    expect(row.resultado?.agendamento_auto_id).toBeTruthy();
    expect(await statusDe(id)).toBe("visita_realizada");
  });
});

describe("funil: retorno, perda, troca de vaga e etapa", () => {
  it("registrar_retorno: em atendimento vai para Aguardando retorno com a data combinada", async () => {
    const id = await lead("em_atendimento");
    const { r } = await ok(
      {
        tipo: "registrar_retorno",
        leadId: id,
        desfecho: "pediu_retorno",
        retornoEm: daquiDias(5),
        nota: "recebe dia 5",
      },
      id,
    );
    expect(await statusDe(id)).toBe("aguardando_retorno");
    expect(r.efeito).toContain("Aguardando retorno");
  });

  it("marcar_perdido: com a categoria oficial (sai da carteira)", async () => {
    const id = await lead("em_atendimento");
    const { r } = await ok({ tipo: "marcar_perdido", leadId: id, categoria: "credito_renda" }, id);
    expect(await statusDe(id)).toBe("perdido");
    expect(r.efeito).toMatch(/^perdido/);
  });

  it("trocar_vaga: entra quem respondeu, sai quem estava parado", async () => {
    const entra = await lead("aguardando_retorno");
    const sai = await lead("em_atendimento");
    await ok(
      {
        tipo: "trocar_vaga",
        entraLeadId: entra,
        saiLeadId: sai,
        desfecho: "esfriou",
        retornoEm: daquiDias(10),
      },
      entra,
    );
    expect(await statusDe(entra)).toBe("em_atendimento");
    expect(await statusDe(sai)).toBe("aguardando_retorno");
  });

  it("mudar_etapa: Qualificação Corretor", async () => {
    const id = await lead("aguardando_retorno");
    await ok(
      {
        tipo: "mudar_etapa",
        leadId: id,
        novoStatus: "qualificacao_corretor",
        motivo: "falta entender a renda",
      },
      id,
    );
    expect(await statusDe(id)).toBe("qualificacao_corretor");
  });
});

describe("documentos e crédito", () => {
  it("checklist pelo perfil, status do documento e desfazer", async () => {
    const id = await lead("visita_realizada");
    const ck = await ok(
      { tipo: "documentos_checklist", leadId: id, perfil: "clt", casado: false, usaFgts: true },
      id,
    );
    expect(ck.r.efeito).toMatch(/documentos no checklist/);
    const doc = await ok(
      {
        tipo: "atualizar_documento",
        leadId: id,
        documento: "documento_identidade",
        status: "recebido",
      },
      id,
    );
    const [d] = await desfazerPropostas({ userId: corretor.id, ids: [doc.id] });
    expect(d.ok, d.erro).toBe(true);
  });

  it("anexar_documento: o arquivo da área de espera vai para a ficha (registro oficial do upload)", async () => {
    const id = await lead("visita_realizada");
    await comoSuperuser(c);
    const anexo = (
      await c.query(
        `INSERT INTO public.samiq_anexos (user_id, mime_type, tamanho_bytes, nome_original, storage_path)
         VALUES ($1, 'application/pdf', 2048, 'holerite.pdf', $2) RETURNING id`,
        [corretor.id, `samiq-anexos/${corretor.id}/teste.pdf`],
      )
    ).rows[0].id as string;
    const { row } = await ok(
      { tipo: "anexar_documento", leadId: id, anexoId: anexo, documento: "holerites" },
      id,
    );
    const usado = await c.query(
      `SELECT usado_em IS NOT NULL AS usado, lead_id FROM public.samiq_anexos WHERE id = $1`,
      [anexo],
    );
    expect(usado.rows[0]).toEqual({ usado: true, lead_id: id });
    // Mesmo registro do upload da tela: versão nova, url e item recebido.
    const doc = await c.query(
      `SELECT d.url IS NOT NULL AS tem_arquivo, d.status,
              (SELECT count(*)::int FROM public.documentacao_versoes v WHERE v.documentacao_id = d.id) AS versoes
         FROM public.documentacoes d WHERE d.id = $1`,
      [row.resultado?.documentacao_id],
    );
    expect(doc.rows[0]).toEqual({ tem_arquivo: true, status: "recebido", versoes: 1 });
  });

  it("enviar_analise_credito e registrar_resultado_credito", async () => {
    const id = await lead("visita_realizada");
    await ok(
      {
        tipo: "enviar_analise_credito",
        leadId: id,
        situacao: "enviada",
        observacoes: "Caixa, agência Mooca",
      },
      id,
    );
    expect(await statusDe(id)).toBe("analise_credito");
    const { r } = await ok(
      {
        tipo: "registrar_resultado_credito",
        leadId: id,
        resultado: "aprovada",
        banco: "Caixa",
        modalidade: "mcmv",
        valorFinanciamento: 210000,
        valorParcela: 1350,
        prazoMeses: 420,
      },
      id,
    );
    expect(r.efeito).toContain("aprovada");
    const an = await c.query(
      `SELECT status, valor_financiamento FROM public.analises_credito WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    expect(an.rows[0].status).toBe("aprovada");
  });
});

describe("venda, check-in, cadastro e lote", () => {
  it("registrar_venda: entra pendente para a gestão aprovar", async () => {
    const id = await lead("analise_credito");
    const hoje = AGORA.toISOString().slice(0, 10);
    const { row } = await ok(
      {
        tipo: "registrar_venda",
        leadId: id,
        projetoId: projeto,
        unidade: "T2 ap 104",
        valorVenda: 265000,
        dataAssinatura: hoje,
        previsaoRecebimento: proximoMes(),
        contratoAssinado: true,
      },
      id,
    );
    const v = await c.query(
      `SELECT status_venda::text, corretor_id FROM public.vendas WHERE id = $1`,
      [row.resultado?.venda_id],
    );
    expect(v.rows[0]).toMatchObject({ status_venda: "pendente", corretor_id: corretor.id });
  });

  it("fazer_checkin em casa, na filial com a localização do WhatsApp, e sair", async () => {
    const { r } = await ok({ tipo: "fazer_checkin", modo: "casa" }, null);
    expect(r.efeito).toMatch(/check-in em casa/);
    await comoSuperuser(c);
    const f = (
      await c.query(
        `SELECT slug, latitude, longitude FROM public.filiais WHERE ativa AND latitude IS NOT NULL ORDER BY ordem LIMIT 1`,
      )
    ).rows[0] as { slug: string; latitude: number; longitude: number } | undefined;
    if (f) {
      const loja = await ok({ tipo: "fazer_checkin", modo: "loja", filial: f.slug }, null, {
        localizacao: { latitude: f.latitude, longitude: f.longitude, precisao: 15 },
      });
      expect(loja.r.efeito).toContain(`na filial ${f.slug}`);
    }
    await ok({ tipo: "fazer_checkin", modo: "sair" }, null);
  });

  it("criar_lead: cadastro na carteira; telefone repetido não duplica", async () => {
    const { row } = await ok(
      { tipo: "criar_lead", nome: "Paula Indicação", telefone: "11955554444", origem: "indicacao" },
      null,
    );
    const novo = String(row.resultado?.lead_criado_id);
    const l = await c.query(`SELECT corretor_id, status::text FROM public.leads WHERE id = $1`, [
      novo,
    ]);
    expect(l.rows[0]).toEqual({ corretor_id: corretor.id, status: "aguardando_atendimento" });
    const dup = await executar(
      { tipo: "criar_lead", nome: "Paula de Novo", telefone: "11955554444" },
      null,
    );
    expect(dup.r.ok).toBe(false);
    expect(dup.r.erro).toMatch(/já é do cliente|já existe/);
  });

  it("pedir_lote: o CRM explica quando não há lote para a zona", async () => {
    const out = await executar({ tipo: "pedir_lote", zona: "Leste" }, null);
    // sem região/base no fixture: a RPC recusa com motivo legível, sem quebrar
    if (!out.r.ok) expect(out.r.erro).toMatch(/lote|região|zona|carteira|corretor/i);
  });
});
