/**
 * Devolução com destino por origem (migration 20260914160000).
 *
 * O problema que isto resolve é de dinheiro, não de arquitetura: a devolução
 * anterior mandava TODO lead de posse expirada para a base — inclusive o de
 * Facebook, que custou mídia. Mandar um lead pago para a fila do discador
 * quando um corretor o abandona é jogar fora o que a casa pagou; ele precisa
 * de outro humano.
 *
 * Três destinos, e cada um quebra de um jeito diferente se alguém trocar:
 *  - PAGO (facebook, chatbot, impulso_smq, SDR) → outro corretor. O teste
 *    olha `sdr_id IS NULL` e `classe_lead = 'quente'`, que é exatamente o
 *    estado que o cron de distribuição consome. Se virar 'base' ou ganhar um
 *    SDR, o lead sai da esteira de corretor sem ninguém perceber.
 *  - CONQUISTADO pelo corretor → não sai. Tirar por decurso de prazo é
 *    confisco, e é a regra que mais rápido destrói a confiança na ferramenta.
 *  - ESTOQUE → base, como antes.
 *
 * E a brecha fechada: lead com VENDA VIVA não sai nem em status anterior.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  comoSuperuser,
  criarLead,
  criarUsuario,
  limparDados,
  novoClient,
  type UsuarioTeste,
} from "./helpers";

const c = novoClient();

let corretor: UsuarioTeste;
let pagoFacebook: string;
let pagoImpulso: string;
let conquistadoIndicacao: string;
let estoqueImportacao: string;
let comVendaViva: string;
let avancadoRecente: string;

async function lead(id: string) {
  await comoSuperuser(c);
  const r = await c.query(
    `SELECT corretor_id, corretor_anterior_id, classe_lead, sdr_id, status
       FROM public.leads WHERE id = $1`,
    [id],
  );
  return r.rows[0] as {
    corretor_id: string | null;
    corretor_anterior_id: string | null;
    classe_lead: string;
    sdr_id: string | null;
    status: string;
  };
}

beforeAll(async () => {
  await c.connect();
  await limparDados(c);
  corretor = await criarUsuario(c, { nome: "Corretor Devolução", papel: "corretor" });

  pagoFacebook = await criarLead(c, {
    nome: "Anúncio",
    corretorId: corretor.id,
    origem: "facebook",
    status: "em_atendimento",
  });
  pagoImpulso = await criarLead(c, {
    nome: "Impulso",
    corretorId: corretor.id,
    origem: "impulso_smq",
    status: "em_atendimento",
  });
  conquistadoIndicacao = await criarLead(c, {
    nome: "Indicado",
    corretorId: corretor.id,
    origem: "indicacao",
    status: "em_atendimento",
  });
  estoqueImportacao = await criarLead(c, {
    nome: "Planilha",
    corretorId: corretor.id,
    origem: "importacao",
    status: "em_atendimento",
  });
  comVendaViva = await criarLead(c, {
    nome: "Vendendo",
    corretorId: corretor.id,
    origem: "facebook",
    status: "analise_credito",
  });
  // Avançado e parado há 10 dias: dentro dos 30 da regra, não sai.
  avancadoRecente = await criarLead(c, {
    nome: "Agendado recente",
    corretorId: corretor.id,
    origem: "facebook",
    status: "agendado",
  });

  await comoSuperuser(c);
  await c.query(
    `INSERT INTO public.vendas (lead_id, data_assinatura, valor_venda, status_venda)
     VALUES ($1, current_date, 250000, 'pendente'::public.status_venda)`,
    [comVendaViva],
  );
  // Liga o modelo v2 — sem ele a função sai na primeira linha.
  await c.query(
    `INSERT INTO public.distribuicao_settings (chave, valor)
     VALUES ('modelo_v2_ativo', 'true'::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
  );
  // Todo mundo parado há 60 dias, menos o agendado recente (10 dias).
  await c.query(
    `UPDATE public.leads SET ultima_atividade_em = now() - interval '60 days'
      WHERE corretor_id = $1`,
    [corretor.id],
  );
  await c.query(
    `UPDATE public.leads SET ultima_atividade_em = now() - interval '10 days'
      WHERE id = $1`,
    [avancadoRecente],
  );

  await c.query(`SELECT public.devolver_leads_posse_expirada()`);
});

describe("lead pago volta para a esteira de corretor", () => {
  it("Facebook sai do corretor sem SDR e como 'quente'", async () => {
    const l = await lead(pagoFacebook);
    expect(l.corretor_id).toBeNull();
    expect(l.corretor_anterior_id).toBe(corretor.id);
    // O cron de distribuição exige sdr_id NULL — é isto que o devolve a um
    // corretor em vez de ao discador.
    expect(l.sdr_id).toBeNull();
    expect(l.classe_lead).toBe("quente");
    expect(l.status).toBe("aguardando_atendimento");
  });

  it("impulso_smq é custeado pela empresa e segue a mesma regra", async () => {
    const l = await lead(pagoImpulso);
    expect(l.corretor_id).toBeNull();
    expect(l.classe_lead).toBe("quente");
    expect(l.sdr_id).toBeNull();
  });
});

describe("lead que o corretor trouxe não sai", () => {
  it("indicação fica com o dono, mesmo parada há 60 dias", async () => {
    const l = await lead(conquistadoIndicacao);
    expect(l.corretor_id).toBe(corretor.id);
  });
});

describe("estoque vai para a base", () => {
  it("importação sai como 'base' — material de discador e SDR", async () => {
    const l = await lead(estoqueImportacao);
    expect(l.corretor_id).toBeNull();
    expect(l.classe_lead).toBe("base");
  });
});

describe("o que não se mexe", () => {
  it("venda viva não sai, mesmo em status anterior ao fechamento", async () => {
    const l = await lead(comVendaViva);
    expect(l.status).toBe("analise_credito");
    expect(l.corretor_id).toBe(corretor.id);
  });

  it("fase avançada parada há 10 dias fica — a régua dela é 30", async () => {
    const l = await lead(avancadoRecente);
    expect(l.corretor_id).toBe(corretor.id);
  });
});
