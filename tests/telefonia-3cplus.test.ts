// Guarda da telefonia 3C Plus (discador atual, decisão 2026-09-15): migration
// `telefonia_agentes` (token write-only por privilégio de coluna), fiação das
// edge functions tcplus-discar / tcplus-campanha / tcplus-webhook, fiação da
// aba Discador, e testes de UNIDADE dos helpers compartilhados (número,
// parser de eventos, desfecho) — o _shared/tcplus.ts é TS puro justamente
// para poder ser importado aqui.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  classificarDesfecho,
  eventoDeConexao,
  eventoDeHistorico,
  extrairChamadaDoEvento,
  mensagemDeErroTcplus,
  normalizarNome,
  parseDuracaoSeg,
  tcplusRequest,
  toTcplusDial,
  toTcplusNumero,
  variantesTelefone,
} from "../supabase/functions/_shared/tcplus";

const root = process.cwd();
const ler = (p: string) => readFileSync(join(root, p), "utf8");
const sql = ler("supabase/migrations/20260915120000_telefonia_3cplus.sql").replace(/--[^\n]*/g, "");
const configToml = ler("supabase/config.toml");
const fnDiscar = ler("supabase/functions/tcplus-discar/index.ts");
const fnCampanha = ler("supabase/functions/tcplus-campanha/index.ts");
const fnWebhook = ler("supabase/functions/tcplus-webhook/index.ts");
const shared = ler("supabase/functions/_shared/tcplus.ts");

const UUID = "0f9c2c1e-1b2a-4c3d-9e8f-123456789abc";

// ---------------------------------------------------------------------------
// Unidade: número
// ---------------------------------------------------------------------------
describe("_shared/tcplus — número", () => {
  it("normaliza para o formato do mailing (nacional, sem DDI, celular com 9)", () => {
    expect(toTcplusNumero("+55 (11) 99999-8888")).toBe("11999998888");
    expect(toTcplusNumero("5511999998888")).toBe("11999998888");
    expect(toTcplusNumero("0011999998888")).toBe("11999998888");
    // Fixo tem 10 dígitos e FICA com 10 — inserir o 9 quebraria o número.
    expect(toTcplusNumero("(11) 3333-4444")).toBe("1133334444");
    // Celular antigo (3º dígito 6–9) sem o nono dígito ganha o 9.
    expect(toTcplusNumero("11 8888-7777")).toBe("11988887777");
    expect(toTcplusNumero("123")).toBeNull();
    expect(toTcplusNumero("")).toBeNull();
    expect(toTcplusNumero(null)).toBeNull();
  });

  it("discagem manual: nacional por default, DDI quando configurado", () => {
    expect(toTcplusDial("11999998888", "nacional")).toBe("11999998888");
    expect(toTcplusDial("11999998888", "ddi")).toBe("5511999998888");
  });

  it("variantes para casar o lead: com/sem 55 e com/sem nono dígito, nacional primeiro", () => {
    const v = variantesTelefone("+55 11 99999-8888");
    expect(v[0]).toBe("11999998888");
    expect(v).toEqual(
      expect.arrayContaining(["11999998888", "5511999998888", "1199998888", "551199998888"]),
    );
    expect(variantesTelefone("1133334444")).toEqual(["1133334444", "551133334444"]);
    expect(variantesTelefone("12")).toEqual([]);
  });

  it("duração aceita segundos, mm:ss e hh:mm:ss", () => {
    expect(parseDuracaoSeg(83)).toBe(83);
    expect(parseDuracaoSeg("83")).toBe(83);
    expect(parseDuracaoSeg("1:23")).toBe(83);
    expect(parseDuracaoSeg("00:01:23")).toBe(83);
    expect(parseDuracaoSeg("abc")).toBeNull();
    expect(parseDuracaoSeg(null)).toBeNull();
  });

  it("nomes de qualificação comparam sem acento/maiúsculas/espaços extras", () => {
    expect(normalizarNome("  Não   Perturbar ")).toBe("nao perturbar");
  });
});

// ---------------------------------------------------------------------------
// Unidade: cliente HTTP
// ---------------------------------------------------------------------------
describe("_shared/tcplus — cliente HTTP", () => {
  function fetchFake(status: number, body: string) {
    // 204 não aceita corpo (nem string vazia) no construtor de Response.
    return vi.fn(async () => new Response(body || null, { status })) as unknown as typeof fetch;
  }

  it("bearer (default): token no header, NUNCA na query; 204 é ok sem corpo", async () => {
    const f = fetchFake(204, "");
    const r = await tcplusRequest(
      { baseUrl: "https://app.3c.plus/api/v1", token: "tok", authMode: "bearer", fetchImpl: f },
      "POST",
      "/agent/manual_call/dial",
      { body: { phone: "11999998888" } },
    );
    expect(r.ok).toBe(true);
    expect(r.status).toBe(204);
    expect(r.body).toBeNull();
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toBe("https://app.3c.plus/api/v1/agent/manual_call/dial");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect(init.body).toBe(JSON.stringify({ phone: "11999998888" }));
  });

  it("query (válvula de escape): ?api_token= e sem header", async () => {
    const f = fetchFake(200, '{"data":{"id":1}}');
    const r = await tcplusRequest(
      { baseUrl: "https://app.3c.plus/api/v1/", token: "tok", authMode: "query", fetchImpl: f },
      "GET",
      "/me",
    );
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toBe("https://app.3c.plus/api/v1/me?api_token=tok");
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    expect(r.body).toEqual({ data: { id: 1 } });
  });

  it("erro HTTP não lança e vira mensagem legível nos dois formatos do 3C Plus", async () => {
    const r1 = await tcplusRequest(
      {
        baseUrl: "https://x",
        token: "t",
        authMode: "bearer",
        fetchImpl: fetchFake(
          422,
          '{"status_code":422,"title":"Agente em ACW","detail":"qualifique a chamada"}',
        ),
      },
      "POST",
      "/agent/manual_call/dial",
    );
    expect(r1.ok).toBe(false);
    expect(mensagemDeErroTcplus(r1)).toBe("Agente em ACW — qualifique a chamada");
    const r2 = await tcplusRequest(
      {
        baseUrl: "https://x",
        token: "t",
        authMode: "bearer",
        fetchImpl: fetchFake(422, '{"detail":"inválido","errors":{"phone":["obrigatório"]}}'),
      },
      "POST",
      "/x",
    );
    expect(mensagemDeErroTcplus(r2)).toBe("inválido — phone: obrigatório");
  });

  it("falha de rede vira status 0 (quem chama decide), sem exceção", async () => {
    const f = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const r = await tcplusRequest(
      { baseUrl: "https://x", token: "t", authMode: "bearer", fetchImpl: f },
      "GET",
      "/me",
    );
    expect(r).toMatchObject({ ok: false, status: 0 });
    expect(mensagemDeErroTcplus(r)).toBe("ECONNRESET");
  });
});

// ---------------------------------------------------------------------------
// Unidade: eventos do webhook
// ---------------------------------------------------------------------------
describe("_shared/tcplus — parser de eventos", () => {
  it("lê o CallHistory no envelope {event, data:{callHistory}}", () => {
    const c = extrairChamadaDoEvento({
      event: "call-history-was-created",
      data: {
        callHistory: {
          sid: "abc123",
          number: "5511999998888",
          agent: { id: 12, name: "Ana", email: "ANA@Smq.com", extension_number: "1012" },
          campaign: { id: 3 },
          mailing_data: { identifier: UUID, phone: "11999998888" },
          qualification: {
            id: 7,
            name: "Agendou visita",
            conversion: true,
            should_insert_blacklist: false,
          },
          qualification_note: "quer sábado",
          status_id: 7,
          speaking_time: "00:01:23",
          recording: "https://cdn.3c.plus/rec/x.mp3",
          call_date_rfc3339: "2026-09-15T10:00:00-03:00",
        },
      },
    });
    expect(c.evento).toBe("call-history-was-created");
    expect(c.sid).toBe("abc123");
    expect(c.numero).toBe("5511999998888");
    expect(c.agentId).toBe("12");
    expect(c.agentEmail).toBe("ana@smq.com");
    expect(c.agentExtension).toBe("1012");
    expect(c.campaignId).toBe("3");
    expect(c.identifier).toBe(UUID);
    expect(c.qualificacao).toMatchObject({ id: "7", nome: "Agendou visita", conversion: true });
    expect(c.qualificacaoNota).toBe("quer sábado");
    expect(c.statusId).toBe(7);
    expect(c.duracaoSeg).toBe(83);
    expect(c.gravacao).toBe("https://cdn.3c.plus/rec/x.mp3");
    expect(c.dataChamada).toBe("2026-09-15T10:00:00-03:00");
    expect(c.manual).toBe(false);
    expect(c.receptivo).toBe(false);
    expect(eventoDeHistorico(c.evento)).toBe(true);
    expect(eventoDeConexao(c.evento)).toBe(false);
  });

  it("tolera o envelope {type, payload}, snake_case e campos alternativos", () => {
    const c = extrairChamadaDoEvento({
      type: "call_was_connected",
      payload: { id: 99, phone: "+55 11 9999-8888", agent_id: "5", campaign_id: 8, mode: "manual" },
    });
    expect(c.evento).toBe("call-was-connected");
    expect(eventoDeConexao(c.evento)).toBe(true);
    expect(c.sid).toBe("99");
    expect(c.numero).toBe("551199998888");
    expect(c.agentId).toBe("5");
    expect(c.campaignId).toBe("8");
    expect(c.manual).toBe(true);
    expect(c.qualificacao).toBeNull();
  });

  it("identifier: UUID em qualquer valor do mailing_data serve; receptivo é reconhecido", () => {
    const c = extrairChamadaDoEvento({
      event: "call-history-was-created",
      data: {
        call: { sid: "r1", number: "1133334444", mailing_data: { codigo: UUID }, receptive: true },
      },
    });
    expect(c.identifier).toBe(UUID);
    expect(c.receptivo).toBe(true);
  });

  it("payload sem chamada não explode: tudo null", () => {
    const c = extrairChamadaDoEvento("nada");
    expect(c.sid).toBeNull();
    expect(c.numero).toBeNull();
    expect(c.evento).toBe("desconhecido");
  });
});

describe("_shared/tcplus — desfecho", () => {
  const base = extrairChamadaDoEvento({
    event: "call-history-was-created",
    data: { callHistory: { sid: "x" } },
  });
  const com = (extra: Partial<typeof base>) => ({ ...base, ...extra });

  it("status negativo vence, mesmo com qualificação", () => {
    expect(classificarDesfecho(com({ statusId: 5 }))).toBe("nao_atendida");
    expect(classificarDesfecho(com({ statusId: 14 }))).toBe("falha");
    expect(
      classificarDesfecho(
        com({
          statusId: 6,
          qualificacao: {
            id: "1",
            nome: "x",
            conversion: null,
            should_insert_blacklist: null,
            dmc: null,
            callback: null,
          },
        }),
      ),
    ).toBe("nao_atendida");
  });

  it("status 8 decide pela causa de desligamento; sem causa conhecida, pelo tempo de conversa", () => {
    expect(classificarDesfecho(com({ statusId: 8, hangupCause: 17 }))).toBe("nao_atendida");
    expect(classificarDesfecho(com({ statusId: 8, hangupCause: 34 }))).toBe("falha");
    expect(classificarDesfecho(com({ statusId: 8, hangupCause: 16, duracaoSeg: 30 }))).toBe(
      "atendida",
    );
    expect(classificarDesfecho(com({ statusId: 8, hangupCause: 16, duracaoSeg: 0 }))).toBe(
      "nao_atendida",
    );
  });

  it("qualificação aplicada, status 7 ou conversa > 0 = atendida; sem pista = desconhecido", () => {
    expect(
      classificarDesfecho(
        com({
          qualificacao: {
            id: "1",
            nome: "Interessado",
            conversion: null,
            should_insert_blacklist: null,
            dmc: null,
            callback: null,
          },
        }),
      ),
    ).toBe("atendida");
    expect(classificarDesfecho(com({ statusId: 7 }))).toBe("atendida");
    expect(classificarDesfecho(com({ duracaoSeg: 12 }))).toBe("atendida");
    expect(classificarDesfecho(base)).toBe("desconhecido");
  });
});

// ---------------------------------------------------------------------------
// Guarda: migration
// ---------------------------------------------------------------------------
describe("migration telefonia_agentes (vínculo com o 3C Plus)", () => {
  it("cria a tabela por corretor, com o token e a campanha dedicada", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.telefonia_agentes");
    expect(sql).toMatch(
      /user_id uuid PRIMARY KEY REFERENCES public\.profiles\(id\) ON DELETE CASCADE/,
    );
    expect(sql).toContain("api_token text");
    expect(sql).toContain("campaign_id text");
    expect(sql).toContain("agent_id text");
  });

  it("token é WRITE-ONLY para o app: fora do GRANT SELECT, dentro do INSERT/UPDATE", () => {
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.telefonia_agentes FROM PUBLIC, anon, authenticated",
    );
    const grantSelect = sql.match(
      /GRANT SELECT \(([^)]*)\)\s*ON public\.telefonia_agentes TO authenticated/,
    );
    expect(grantSelect).not.toBeNull();
    expect(grantSelect![1]).not.toContain("api_token");
    expect(grantSelect![1]).toContain("token_atualizado_em");
    expect(sql).toMatch(
      /GRANT INSERT \([^)]*api_token[^)]*\)\s*ON public\.telefonia_agentes TO authenticated/,
    );
    const grantUpdate = sql.match(
      /GRANT UPDATE \(([^)]*)\)\s*ON public\.telefonia_agentes TO authenticated/,
    );
    expect(grantUpdate![1]).toContain("api_token");
    // O carimbo é do trigger — o app não o edita.
    expect(grantUpdate![1]).not.toContain("token_atualizado_em");
    expect(sql).toContain("GRANT ALL ON TABLE public.telefonia_agentes TO service_role");
  });

  it("RLS: o próprio corretor e o admin escrevem; gestão lê o status; só admin apaga", () => {
    expect(sql).toContain("ALTER TABLE public.telefonia_agentes ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(
      /telefonia_agentes_select[\s\S]*user_id = \(SELECT auth\.uid\(\)\)[\s\S]*'gestor'/,
    );
    expect(sql).toMatch(
      /telefonia_agentes_insert[\s\S]*WITH CHECK \(\s*user_id = \(SELECT auth\.uid\(\)\)\s*OR public\.has_role\(\(SELECT auth\.uid\(\)\), 'admin'/,
    );
    expect(sql).toMatch(/telefonia_agentes_update[\s\S]*FOR UPDATE TO authenticated/);
    expect(sql).toMatch(
      /telefonia_agentes_delete[\s\S]*USING \(public\.has_role\(\(SELECT auth\.uid\(\)\), 'admin'/,
    );
  });

  it("trigger normaliza vazio -> NULL e carimba a troca do token", () => {
    expect(sql).toMatch(
      /tg_telefonia_agentes_touch[\s\S]*NEW\.api_token := NULLIF\(btrim\(NEW\.api_token\), ''\)/,
    );
    expect(sql).toMatch(/NEW\.api_token IS DISTINCT FROM OLD\.api_token/);
    expect(sql).toMatch(
      /CREATE TRIGGER telefonia_agentes_touch\s*BEFORE INSERT OR UPDATE ON public\.telefonia_agentes/,
    );
  });

  it("mapeamento qualificação -> etapa ganha o default de follow-up sem sobrescrever ajustes", () => {
    expect(sql).toMatch(
      /UPDATE public\.gestao_config[\s\S]*followup_padrao_horas[\s\S]*WHERE chave = 'telefonia_tabulacao_status'\s*AND NOT \(valor \? 'followup_padrao_horas'\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// Guarda: fiação das functions
// ---------------------------------------------------------------------------
describe("fiação das edge functions (config.toml)", () => {
  it("tcplus-webhook é público (secret próprio); tcplus-discar e tcplus-campanha exigem JWT", () => {
    expect(configToml).toMatch(/\[functions\.tcplus-webhook\]\s*\nverify_jwt = false/);
    expect(configToml).toMatch(/\[functions\.tcplus-discar\]\s*\nverify_jwt = true/);
    expect(configToml).toMatch(/\[functions\.tcplus-campanha\]\s*\nverify_jwt = true/);
  });
});

describe("tcplus-discar (click-to-call pelo agente)", () => {
  it("lead lido e inserts feitos com a RLS do corretor; service_role SÓ para o token do agente", () => {
    expect(fnDiscar).toContain("SUPABASE_ANON_KEY");
    expect(fnDiscar).toMatch(/Authorization: authorization/);
    expect(fnDiscar).toContain("conta_atual_ativa");
    expect(fnDiscar).toMatch(/await supabase\s*\.from\("leads"\)/);
    expect(fnDiscar).toMatch(/admin\s*\.from\("telefonia_agentes"\)[\s\S]*?\.eq\("user_id", uid\)/);
    expect(fnDiscar).not.toMatch(/admin\s*\.from\("leads"\)/);
    expect(fnDiscar).not.toMatch(/admin\s*\.from\("chamadas"\)/);
    // O token do GESTOR não disca: ação de agente usa o token do agente.
    expect(fnDiscar).not.toContain("TCPLUS_API_TOKEN");
  });

  it("sequência do 3C Plus: login manual (tolerante) -> manual_call/enter -> dial (com fallback ACW)", () => {
    expect(fnDiscar).toMatch(/"\/agent\/login"[\s\S]*mode: "manual"/);
    expect(fnDiscar).toContain('"/agent/manual_call/enter"');
    expect(fnDiscar).toContain('"/agent/manual_call/dial"');
    expect(fnDiscar).toContain('"/agent/manual_call_acw/dial"');
    // Token inválido é erro claro; "já logado" não derruba a discagem.
    expect(fnDiscar).toMatch(
      /login\.status === 401 \|\| login\.status === 403[\s\S]*tcplus_token_invalido/,
    );
    expect(fnDiscar).toContain("tcplus_recusou");
    expect(fnDiscar).toContain("lead_opt_out");
    expect(fnDiscar).toContain("token_nao_configurado");
    expect(fnDiscar).toContain("campanha_nao_configurada");
  });

  it("registra a chamada como 3cplus/click2call e ecoa na timeline como ligação de saída", () => {
    expect(fnDiscar).toMatch(
      /from\("chamadas"\)[\s\S]*origem: "click2call"[\s\S]*provider: "3cplus"/,
    );
    expect(fnDiscar).toMatch(/from\("interacoes"\)[\s\S]*tipo: "ligacao"[\s\S]*direcao: "saida"/);
    expect(fnDiscar).toContain('fonte: "tcplus_click2call"');
  });
});

describe("tcplus-campanha (discador automático por lista de mailing)", () => {
  it("dois tokens: gestor (secret) para mailing/listas, agente (telefonia_agentes) para login/logout", () => {
    expect(fnCampanha).toContain('Deno.env.get("TCPLUS_API_TOKEN")');
    expect(fnCampanha).toMatch(
      /admin\s*\.from\("telefonia_agentes"\)[\s\S]*?\.eq\("user_id", uid\)/,
    );
    expect(fnCampanha).toMatch(/tcplusRequest\(agenteCfg, "POST", "\/agent\/login"/);
    expect(fnCampanha).toMatch(/tcplusRequest\(agenteCfg, "POST", "\/agent\/logout"/);
    expect(fnCampanha).toMatch(
      /tcplusRequest\(gestor, "POST", `\$\{base\}\/lists\/\$\{listId\}\/mailing_sync\.json`/,
    );
  });

  it("fila lida com a RLS do corretor, com as exclusões de compliance; identifier = UUID do lead", () => {
    expect(fnCampanha).toContain("SUPABASE_ANON_KEY");
    expect(fnCampanha).toContain("conta_atual_ativa");
    expect(fnCampanha).toMatch(/await supabase\s*\.from\("leads"\)/);
    expect(fnCampanha).toContain('.eq("opt_out", false)');
    expect(fnCampanha).toContain('.eq("na_lixeira", false)');
    expect(fnCampanha).toContain('.is("deleted_at", null)');
    expect(fnCampanha).toContain("identifier: l.id as string");
    expect(fnCampanha).toContain("MAX_LEADS_POR_LOTE");
  });

  it("campanha compartilhada entre corretores é recusada (409) antes de mexer na lista", () => {
    expect(fnCampanha).toContain("campanha_compartilhada");
    expect(fnCampanha).toMatch(/eq\("campaign_id", campaignId\)[\s\S]*?neq\("user_id", uid\)/);
    expect(fnCampanha.indexOf("campanha_compartilhada")).toBeLessThan(
      fnCampanha.indexOf("Higiene do lote"),
    );
  });

  it("higiene só no iniciar (logout + apaga listas do CRM); adicionar exige list_id e só sobe", () => {
    expect(fnCampanha).toContain("[crm:");
    expect(fnCampanha).toContain("missing_list_id");
    const higiene = fnCampanha.indexOf("listasApagadas = await apagarListasDoCrm()");
    expect(higiene).toBeGreaterThan(fnCampanha.indexOf("if (adicionar) {"));
    expect(fnCampanha).toMatch(/\} else \{[\s\S]*?apagarListasDoCrm\(\)/);
    // Peso >= 1 senão a lista não é discada; login do agente fecha o ciclo.
    expect(fnCampanha).toMatch(/weight: 1/);
    expect(fnCampanha).toMatch(/if \(!adicionar\) \{[\s\S]*"\/agent\/login"/);
  });

  it("parar tolera agente já deslogado — o cockpit sempre fecha", () => {
    expect(fnCampanha).toContain("ja_deslogado_ou_recusado");
    expect(fnCampanha).toMatch(/ok: true,\s*parada: true/);
  });
});

describe("tcplus-webhook (eventos do 3C Plus)", () => {
  it("secret com comparação em tempo constante; header, Bearer ou query (com kill-switch)", () => {
    expect(fnWebhook).toContain("secretsIguais");
    expect(fnWebhook).toContain("TCPLUS_WEBHOOK_SECRET");
    expect(fnWebhook).toContain("TCPLUS_ALLOW_QUERY_SECRET");
    expect(fnWebhook).toContain('req.headers.get("x-webhook-secret")');
    // GET é só liveness (validação de URL), sem dado.
    expect(fnWebhook).toMatch(/req\.method === "GET"[\s\S]*servico: "tcplus-webhook"/);
  });

  it("resolve lead pelo identifier (UUID) e depois pelo telefone com variantes; corretor por agent_id/e-mail", () => {
    expect(fnWebhook).toMatch(/UUID_RE\.test\(c\.identifier\)/);
    expect(fnWebhook.indexOf("UUID_RE.test(c.identifier)")).toBeLessThan(
      fnWebhook.indexOf('rpc("buscar_lead_ativo_por_telefone_global"'),
    );
    expect(fnWebhook).toContain("variantesTelefone(c.numero)");
    expect(fnWebhook).toContain('.eq("agent_id", c.agentId)');
    expect(fnWebhook).toContain('.ilike("email", c.agentEmail)');
  });

  it("adota a linha do click-to-call sem sid (número + corretor, janela) e é idempotente por sid", () => {
    expect(fnWebhook).toContain("buscarClick2callPendente");
    expect(fnWebhook).toMatch(
      /\.eq\("origem", "click2call"\)[\s\S]*\.is\("provider_call_id", null\)/,
    );
    expect(fnWebhook).toContain("JANELA_CLICK2CALL_MS");
    expect(fnWebhook).toContain("23505");
    expect(fnWebhook).toContain("aplicarAtualizacao");
  });

  it("status honesto: conexão = atendida; histórico decide pelo desfecho; nunca regride", () => {
    expect(fnWebhook).toContain("classificarDesfecho(c)");
    expect(fnWebhook).toMatch(
      /if \(conexao\) return atual && TERMINAIS\.has\(atual\) \? "concluida" : "atendida"/,
    );
    expect(fnWebhook).toMatch(/jaAtendida \|\| desfecho === "atendida"\) return "concluida"/);
    // Timeline só no primeiro atendimento real (dedupe por chamada_id).
    expect(fnWebhook).toContain("ecoarInteracao");
    expect(fnWebhook).toMatch(/!jaAtendidaAntes && \(conexao \|\| desfecho === "atendida"\)/);
    expect(fnWebhook).toContain('fonte: "tcplus_webhook"');
  });

  it("qualificação -> etapa em tempo de evento, pela RPC oficial, idempotente e sem fechar venda", () => {
    expect(fnWebhook).toContain('rpc("transicionar_lead"');
    expect(fnWebhook).toContain("telefonia_tabulacao_status");
    expect(fnWebhook).toContain("followup_padrao_horas");
    expect(fnWebhook).toMatch(/normalizarNome\(anterior\) === normalizarNome\(nome\)/);
    const alvos = fnWebhook.slice(
      fnWebhook.indexOf("ALVOS_VALIDOS = new Set(["),
      fnWebhook.indexOf("]);", fnWebhook.indexOf("ALVOS_VALIDOS = new Set([")),
    );
    expect(alvos).not.toContain("contrato_fechado");
    expect(alvos).not.toContain("pos_venda");
    expect(alvos).toContain('"perdido"');
    // Ação/follow-up do corretor não são sobrescritos: só preenche o que falta.
    expect(fnWebhook).toContain("precisaAcao");
    expect(fnWebhook).toContain("precisaFollowup");
  });
});

// ---------------------------------------------------------------------------
// Guarda: aba Discador e fiação do app
// ---------------------------------------------------------------------------
describe("aba Discador (fiação 3C Plus)", () => {
  const hook = ler("src/hooks/use-ligar-lead.ts");
  const sessao = ler("src/features/telefonia/sessao-discagem.tsx");
  const pagina = ler("src/features/telefonia/discador-page.tsx");
  const conectar = ler("src/features/telefonia/conectar-tcplus.tsx");
  const cliente = ler("src/features/telefonia/telefonia-3cplus-client.ts");
  const clienteChamadas = ler("src/features/telefonia/chamadas-client.ts");
  const host = ler("src/features/telefonia/chamada-ativa-host.tsx");
  const rota = ler("src/routes/_authenticated/discador.tsx");
  const layout = ler("src/routes/_authenticated/route.tsx");
  const corretores = ler("src/features/gestao/corretores-page.tsx");
  const sistemas = ler("src/features/nav/sistemas.ts");
  const routeTree = ler("src/routeTree.gen.ts");

  it("Ligar dispara tcplus-discar com fallback tel: e traduz os códigos do 3C Plus", () => {
    expect(hook).toContain('invoke("tcplus-discar"');
    expect(hook).not.toContain("sonax");
    expect(hook).toContain("token_nao_configurado");
    expect(hook).toContain("tcplus_token_invalido");
    expect(hook).toMatch(/window\.location\.href = href/);
  });

  it("sessão de discagem: base completa em lotes na MESMA lista (list_id), fila só da carteira", () => {
    expect(sessao).toContain('invoke("tcplus-campanha"');
    expect(sessao).not.toContain("sonax");
    expect(sessao).toContain('"adicionar"');
    expect(sessao).toContain("list_id: listId");
    expect(sessao).toContain("LOTE_CAMPANHA");
    expect(sessao).toContain("campanha_compartilhada:");
    expect(sessao).toContain("token_nao_configurado:");
    expect(sessao).toContain('.eq("corretor_id", user.id)');
    expect(sessao).toContain('.eq("opt_out", false)');
    expect(sessao).toContain('.eq("na_lixeira", false)');
    expect(sessao).toContain('.is("deleted_at", null)');
    expect(sessao).toContain("status.eq.aguardando_atendimento");
    expect(sessao).toContain("proximo_followup.lt.");
    expect(sessao).toContain(".range(de, de + PAGINA - 1)");
    expect(sessao).toContain("useLigarLead");
    expect(sessao).toContain("RegistrarContatoDialog");
    // Login do agente não confirmado é avisado, não engolido.
    expect(sessao).toContain("loginDetalhe");
  });

  it("página: sem sync por polling (a qualificação chega pelo webhook), status do 3C Plus e gravação", () => {
    expect(pagina).not.toContain("sonax-tabulacoes");
    expect(pagina).not.toContain("Sincronizar tabulações");
    expect(pagina).toContain("buscarMeuAgenteTcplus");
    expect(pagina).toContain('useRealtimeInvalidate("chamadas"');
    expect(pagina).toContain("useLigarLead");
    expect(pagina).toContain("listarChamadasRecentes");
    expect(pagina).toContain("contarChamadasHoje");
    expect(pagina).toContain("buscarEmLotes");
    expect(pagina).toContain("formatPhoneBR");
    expect(pagina).toContain("tabelaAusente");
    expect(pagina).toContain("gravacao_url");
    expect(pagina).toContain("3cplus-discador.md");
  });

  it("token do agente: self-service no card (input password), gravado sem nunca ser lido de volta", () => {
    expect(conectar).toContain("salvarAgenteTcplus");
    expect(conectar).toMatch(/type="password"/);
    expect(conectar).toContain("api_token");
    // A fronteira só pede as colunas com GRANT — api_token fora do SELECT.
    expect(cliente).toMatch(
      /const COLUNAS = "user_id, agent_id, campaign_id, token_atualizado_em"/,
    );
    expect(cliente).not.toContain(".upsert(");
    expect(cliente).toContain('"telefonia_agentes"');
  });

  it("rota /discador monta conexão + sessão + central; layout monta o pop-up; menu na Prospecção", () => {
    expect(rota).toContain('createFileRoute("/_authenticated/discador")');
    expect(rota).toContain("ConectarTcplus");
    expect(rota).toContain("SessaoDiscagem");
    expect(rota).toContain("DiscadorCentral");
    expect(routeTree).toContain("discador");
    expect(layout).toContain("ChamadaAtivaHost");
    expect(sistemas).toMatch(
      /titulo: "Prospecção"[\s\S]{0,2500}label: "Discador",\s*icon: Phone,\s*to: "\/discador"/,
    );
  });

  it("pop-up global de chamada ativa: filtro do corretor, som e ficha do cliente", () => {
    expect(host).toContain("corretor_id=eq.");
    expect(clienteChamadas).toContain('.eq("corretor_id", corretorId)');
    expect(host).toContain("tocarCampainha");
    expect(host).toContain("localStorage");
    expect(host).toContain("RegistrarContatoDialog");
    expect(host).toContain("Atender no CRM");
  });

  it("Gestão → Corretores configura agente/campanha/token pela fronteira 3C Plus; o shim Sonax saiu", () => {
    expect(corretores).toContain("listarAgentesTcplus");
    expect(corretores).toContain("salvarAgenteTcplus");
    expect(corretores).toContain("TelefoniaTcplusCell");
    expect(corretores).not.toContain("ramal-sonax-client");
    expect(existsSync(join(root, "src/features/gestao/ramal-sonax-client.ts"))).toBe(false);
  });

  it("shared é TS puro (importável pela suíte) e as três functions importam dele", () => {
    // Sem globais do Deno no código (comentários podem citá-lo).
    expect(shared.replace(/\/\/[^\n]*/g, "")).not.toMatch(/\bDeno\./);
    expect(fnDiscar).toContain('from "../_shared/tcplus.ts"');
    expect(fnCampanha).toContain('from "../_shared/tcplus.ts"');
    expect(fnWebhook).toContain('from "../_shared/tcplus.ts"');
  });
});
