// Guarda da telefonia Sonax (discador): migration `chamadas` +
// profiles.ramal_sonax + fiação das edge functions sonax-discar (click-to-call,
// JWT/RLS) e sonax-webhook (URL de integração do PABX, secret + service_role).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/migrations/20260816120000_telefonia_sonax.sql"),
  "utf8",
);
const codigo = sql.replace(/--[^\n]*/g, "");
const sqlCampanha = readFileSync(
  join(root, "supabase/migrations/20260817120000_telefonia_sonax_campanha.sql"),
  "utf8",
).replace(/--[^\n]*/g, "");
const configToml = readFileSync(join(root, "supabase/config.toml"), "utf8");
const fnDiscar = readFileSync(join(root, "supabase/functions/sonax-discar/index.ts"), "utf8");
const fnCampanha = readFileSync(join(root, "supabase/functions/sonax-campanha/index.ts"), "utf8");
const fnWebhook = readFileSync(join(root, "supabase/functions/sonax-webhook/index.ts"), "utf8");

describe("migration telefonia (chamadas + ramal_sonax)", () => {
  it("idempotência do webhook: provider_call_id com UNIQUE parcial", () => {
    expect(codigo).toContain("CREATE TABLE IF NOT EXISTS public.chamadas");
    expect(codigo).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*\(provider_call_id\)\s*WHERE provider_call_id IS NOT NULL/,
    );
  });

  it("checks fechados de direção/origem/status; dossiê e corretor indexados", () => {
    expect(codigo).toContain("CHECK (direcao IN ('entrada', 'saida'))");
    expect(codigo).toContain(
      "CHECK (origem IN ('click2call', 'campanha', 'receptivo', 'agendada'))",
    );
    expect(codigo).toMatch(/CHECK \(status IN \('iniciada', 'chamando', 'falando', 'atendida'/);
    expect(codigo).toMatch(/ON public\.chamadas \(lead_id, criado_em DESC\)/);
    expect(codigo).toMatch(/ON public\.chamadas \(corretor_id, criado_em DESC\)/);
  });

  it("RLS: leitura espelha o lead (receptivo sem lead não vaza entre carteiras)", () => {
    expect(codigo).toContain("ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY");
    expect(codigo).toMatch(
      /chamadas_select[\s\S]*lead_id IS NOT NULL AND public\.pode_acessar_lead/,
    );
    expect(codigo).toMatch(/chamadas_select[\s\S]*corretor_id = \(SELECT auth\.uid\(\)\)/);
    expect(codigo).toContain("REVOKE ALL ON TABLE public.chamadas FROM PUBLIC, anon");
    expect(codigo).toContain("GRANT ALL ON TABLE public.chamadas TO service_role");
  });

  it("escrita do usuário: só SAÍDA, em nome próprio, no lead da carteira; UPDATE é do webhook", () => {
    expect(codigo).toMatch(
      /chamadas_insert_saida[\s\S]*WITH CHECK \(\s*direcao = 'saida'\s*AND corretor_id = \(SELECT auth\.uid\(\)\)/,
    );
    expect(codigo).not.toMatch(/FOR UPDATE TO authenticated/);
  });

  it("realtime ligado (status da chamada ao vivo), idempotente", () => {
    expect(codigo).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.chamadas");
    expect(codigo).toContain("WHEN duplicate_object THEN NULL");
  });

  it("ramal do corretor entra em profiles; trigger de mensagens é consertado", () => {
    expect(codigo).toContain(
      "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ramal_sonax text",
    );
    // Os helpers antigos gravam NEW.updated_at; tabelas com `atualizado_em`
    // precisam do tg_touch_atualizado_em (mensagens explodia em UPDATE).
    expect(codigo).toMatch(/tg_touch_atualizado_em[\s\S]*NEW\.atualizado_em := now\(\)/);
    expect(codigo).toMatch(/CREATE TRIGGER mensagens_set_updated_at[\s\S]*tg_touch_atualizado_em/);
    expect(codigo).toMatch(
      /CREATE TRIGGER chamadas_touch_atualizado_em[\s\S]*tg_touch_atualizado_em/,
    );
  });
});

describe("fiação das edge functions (config.toml)", () => {
  it("sonax-webhook é público (secret próprio); sonax-discar e sonax-campanha exigem JWT", () => {
    expect(configToml).toMatch(/\[functions\.sonax-webhook\]\s*\nverify_jwt = false/);
    expect(configToml).toMatch(/\[functions\.sonax-discar\]\s*\nverify_jwt = true/);
    expect(configToml).toMatch(/\[functions\.sonax-campanha\]\s*\nverify_jwt = true/);
  });
});

describe("sonax-campanha (discador automático)", () => {
  it("vínculos do corretor no PABX entram em profiles (migration parte 2)", () => {
    expect(sqlCampanha).toContain(
      "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sonax_id_atendente text",
    );
    expect(sqlCampanha).toContain(
      "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sonax_id_campanha text",
    );
  });

  it("fila lida com a RLS do corretor, com as exclusões de compliance", () => {
    expect(fnCampanha).toContain("SUPABASE_ANON_KEY");
    expect(fnCampanha).toContain("conta_atual_ativa");
    expect(fnCampanha).toContain('.eq("opt_out", false)');
    expect(fnCampanha).toContain('.eq("na_lixeira", false)');
    expect(fnCampanha).toContain('.is("deleted_at", null)');
    // A fila de leads vem do client com o JWT do corretor; a service role
    // existe SÓ para a contagem da guarda de campanha compartilhada.
    expect(fnCampanha).toMatch(/await supabase\s*\.from\("leads"\)/);
  });

  it("campanha compartilhada entre corretores é recusada (409) antes de mexer na fila", () => {
    // Dois corretores na mesma campanha se atropelam: a higiene do lote de um
    // apaga a fila do outro. Recusar cedo > corromper em silêncio.
    expect(fnCampanha).toContain("campanha_compartilhada");
    expect(fnCampanha).toMatch(/eq\("sonax_id_campanha", idCampanha\)[\s\S]*?neq\("id", uid\)/);
    expect(fnCampanha.indexOf("campanha_compartilhada")).toBeLessThan(
      fnCampanha.indexOf("Higiene do lote"),
    );
    // E o front traduz o código para o corretor.
    const sessao = readFileSync(join(root, "src/features/telefonia/sessao-discagem.tsx"), "utf8");
    expect(sessao).toContain("campanha_compartilhada:");
  });

  it("parar tolera campanha já parada (contrato v1 devolve 404) — o cockpit sempre fecha", () => {
    expect(fnCampanha).toContain("ja_parada_ou_recusada");
    expect(fnCampanha).toMatch(/ok: true,\s*parada: true/);
  });

  it("base completa em lotes: acao=adicionar enfileira SEM repetir a higiene", () => {
    expect(fnCampanha).toContain('"adicionar"');
    // A higiene (stop+limpa) roda só no iniciar — repetida em cada lote,
    // apagaria os lotes anteriores da mesma sessão.
    expect(fnCampanha).toMatch(/if \(!adicionar\) \{\s*await acaoSonax\("stop_campanha"/);
    // O front fatia a base inteira: 1º lote inicia, os demais adicionam.
    const sessao = readFileSync(join(root, "src/features/telefonia/sessao-discagem.tsx"), "utf8");
    expect(sessao).toContain('"adicionar"');
    expect(sessao).toContain("LOTE_CAMPANHA");
  });

  it("normalização de número é ÚNICA (_shared/sonax.ts) — discar e campanha importam a mesma", () => {
    const shared = readFileSync(join(root, "supabase/functions/_shared/sonax.ts"), "utf8");
    expect(shared).toContain("export function toSonaxNumero");
    expect(fnDiscar).toContain('from "../_shared/sonax.ts"');
    expect(fnCampanha).toContain('from "../_shared/sonax.ts"');
  });

  it("credenciais só por env; enfileira (acao=chamada), dá play e sabe parar/limpar", () => {
    expect(fnCampanha).toContain('Deno.env.get("SONAX_TOKEN")');
    expect(fnCampanha).toContain('Deno.env.get("SONAX_ID_CLIENTE")');
    expect(fnCampanha).toMatch(/acaoSonax\("chamada"/);
    expect(fnCampanha).toMatch(/acaoSonax\("play_campanha"/);
    expect(fnCampanha).toMatch(/acaoSonax\("stop_campanha"/);
    expect(fnCampanha).toMatch(/acaoSonax\("limpa_contatos_campanha"/);
    expect(fnCampanha).toContain("MAX_LEADS_POR_LOTE");
  });

  it("webhook casa o corretor também pelo ID do atendente (eventos de campanha sem ramal)", () => {
    expect(fnWebhook).toContain('eq("sonax_id_atendente", idAtendente)');
  });

  it("ramal do evento é normalizado (tira o sufixo da conta) antes de casar o corretor", () => {
    // <RAMAL> vem como "10300013004" (103 + conta 00013004); sem normalizar,
    // o corretor nunca resolve e a coluna mostra o número cru.
    expect(fnWebhook).toContain("normalizarRamal");
    expect(fnWebhook).toMatch(/idClienteSonax\.padStart\(8, "0"\)/);
    // O que sobra precisa ter cara de ramal — nunca truncar às cegas.
    expect(fnWebhook).toMatch(/\\d\{1,6\}/);
    // Fallback por prefixo mais longo: casa contra o cadastro dos corretores
    // sem depender do formato exato do secret (zeros, conta diferente).
    expect(fnWebhook).toMatch(/ramalBruto\.startsWith\(r\)/);
    expect(fnWebhook).toMatch(/r\.length > melhor\.ramal\.length/);
    // A linha grava sempre o ramal limpo (e eventos seguintes corrigem a linha).
    expect(fnWebhook).toContain("ramal: ramalFinal");
    expect(fnWebhook).toMatch(/ramalFinal \? \{ ramal: ramalFinal \}/);
  });

  it("iniciar limpa a sobra da campanha antes de enfileirar (sem rediscagem fantasma no login)", () => {
    expect(fnCampanha).toContain("Higiene do lote");
    const daHigieneEmDiante = fnCampanha.slice(fnCampanha.indexOf("Higiene do lote"));
    expect(daHigieneEmDiante).toMatch(
      /stop_campanha[\s\S]*limpa_contatos_campanha[\s\S]*play_campanha/,
    );
  });
});

describe("sonax-tabulacoes (tabulação do discador -> etapa do funil)", () => {
  const fnTab = readFileSync(join(root, "supabase/functions/sonax-tabulacoes/index.ts"), "utf8");
  const sqlTab = readFileSync(
    join(root, "supabase/migrations/20260818120000_telefonia_tabulacao_status.sql"),
    "utf8",
  ).replace(/--[^\n]*/g, "");
  const paginaDiscador = readFileSync(
    join(root, "src/features/telefonia/discador-page.tsx"),
    "utf8",
  );

  it("mapeamento é configuração (gestao_config), semeado sem sobrescrever ajustes do admin", () => {
    expect(sqlTab).toContain("'telefonia_tabulacao_status'");
    expect(sqlTab).toContain("ON CONFLICT (chave) DO NOTHING");
  });

  it("fonte é o arquivo da campanha; transição pela RPC oficial com o JWT do corretor", () => {
    expect(fnTab).toContain("download_arquivo_contato");
    expect(fnTab).toContain('rpc("transicionar_lead"');
    expect(fnTab).toContain("telefonia_tabulacao_status");
    // Idempotência: só tabulação DIFERENTE da gravada na chamada processa —
    // o sync nunca briga com uma etapa ajustada manualmente depois.
    expect(fnTab).toMatch(/normalizar\(chamada\.tabulacao\) === normalizar\(tabulacao\)/);
    // Alvo restrito ao enum do funil — mapeamento inválido não passa.
    expect(fnTab).toContain("STATUS_VALIDOS");
  });

  it("exige JWT e a aba dispara o sync (automático + botão)", () => {
    expect(configToml).toMatch(/\[functions\.sonax-tabulacoes\]\s*\nverify_jwt = true/);
    expect(paginaDiscador).toContain('invoke("sonax-tabulacoes"');
    expect(paginaDiscador).toContain("Sincronizar tabulações");
    expect(paginaDiscador).toContain("refetchInterval");
  });

  it("transição vem ANTES do marcador — falha na RPC fica sem marcar e o próximo sync retenta", () => {
    // Marcar primeiro engoliria a falha para sempre: a tabulação constaria
    // como processada e o lead nunca mudaria de etapa.
    expect(fnTab.indexOf('rpc("transicionar_lead"')).toBeLessThan(
      fnTab.indexOf(".update({ tabulacao })"),
    );
    expect(fnTab).toMatch(
      /bloqueadas\.push\(\{ lead_id: leadId, tabulacao, erro: r\.erro \?\? "rpc_falhou" \}\);\s*continue;/,
    );
    // Lead fora da carteira (campanha compartilhada de outrora) também não
    // marca — o sync do corretor certo processa depois.
    expect(fnTab).toContain("lead_fora_da_carteira");
  });

  it("transição envia o template de follow-up e destrava etapas com pulo intermediário", () => {
    // A RPC exige próxima ação/follow-up nas etapas ativas — o sync espelha
    // os templates do front (followUpParaStatus) em vez de falhar sempre.
    expect(fnTab).toContain("templateFollowUp");
    expect(fnTab).toContain("p_proxima_acao");
    expect(fnTab).toContain("p_proximo_followup");
    // aguardando_atendimento não vai direto para agendado/aguardando_retorno:
    // o pulo por em_atendimento espelha o atendimento que aconteceu na ligação.
    expect(fnTab).toMatch(/n\.o permitida/);
    expect(fnTab).toMatch(/chamarRpc\("em_atendimento"\)/);
  });

  it('"não perturbar" descarta de verdade: perdido + opt-out (nunca mais discado)', () => {
    expect(fnTab).toMatch(/alvo === "perdido" && \/nao \(perturbar\|ligar\)\|descadastr\//);
    expect(fnTab).toContain("opt_out: true");
  });

  it("arquivo grande não estoura: cap reportado e lookup de chamadas em lote (sem N+1)", () => {
    expect(fnTab).toContain("MAX_PARES");
    expect(fnTab).toContain("processados");
    expect(fnTab).toContain("chamadaPorLead");
    expect(fnTab).toMatch(/\.in\("lead_id", fatia\)/);
  });
});

describe("sonax-discar (click-to-call)", () => {
  it("sem service_role: leitura do lead e inserts passam pela RLS do corretor", () => {
    expect(fnDiscar).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fnDiscar).toContain("SUPABASE_ANON_KEY");
    expect(fnDiscar).toMatch(/Authorization: authorization/);
    expect(fnDiscar).toContain("conta_atual_ativa");
  });

  it("token do Sonax só via secret de env; opt-out do lead bloqueia a discagem", () => {
    expect(fnDiscar).toContain('Deno.env.get("SONAX_TOKEN")');
    expect(fnDiscar).toContain("lead_opt_out");
  });

  it("registra a chamada e ecoa na timeline como ligação de saída", () => {
    expect(fnDiscar).toMatch(/from\("chamadas"\)[\s\S]*origem: "click2call"/);
    expect(fnDiscar).toMatch(/from\("interacoes"\)[\s\S]*tipo: "ligacao"[\s\S]*direcao: "saida"/);
  });

  it("protocolo nunca é o número discado ecoado (colidiria no UNIQUE na rediscagem)", () => {
    // A v1 devolve texto e costuma ecoar o número; capturá-lo como protocolo
    // faria a 2ª ligação ao mesmo lead sumir (provider_call_id duplicado).
    expect(fnDiscar).toContain("semNumeroDiscado");
    expect(fnDiscar).toMatch(/replaceAll\("55" \+ numero/);
  });
});

describe("sonax-webhook (URL de integração do PABX)", () => {
  it("secret com comparação em tempo constante; query aceita por limitação do PABX, com kill-switch", () => {
    expect(fnWebhook).toContain("secretsIguais");
    expect(fnWebhook).toContain("SONAX_WEBHOOK_SECRET");
    expect(fnWebhook).toContain("SONAX_ALLOW_QUERY_SECRET");
    expect(fnWebhook).toContain('req.headers.get("x-webhook-secret")');
  });

  it("resolve lead pelo dedup global e corretor pelo ramal; idempotente por id_chamada", () => {
    expect(fnWebhook).toContain("buscar_lead_ativo_por_telefone_global");
    expect(fnWebhook).toContain("ramal_sonax");
    expect(fnWebhook).toContain("23505");
  });

  it("timeline e status só refletem atendimento REAL do agente", () => {
    // Desligamento dispara para toda chamada: sem atendimento prévio é
    // "não atendida", nunca "concluída" — senão tudo conta como conversa.
    expect(fnWebhook).toMatch(/foiAtendida \? "concluida" : "nao_atendida"/);
    // Eco na timeline só no primeiro evento de atendimento com lead casado —
    // chamada perdida fica no histórico do Discador, sem virar "contato".
    expect(fnWebhook).toMatch(/eventoDeAtendimento && !jaAtendidaAntes/);
    expect(fnWebhook).toContain("ecoarInteracao");
    // Casamento do lead tenta variantes do número (com/sem DDI 55).
    expect(fnWebhook).toContain('"55" + semZeros');
    // Variável de template não substituída ("<NUMERO>") nunca vira dado.
    expect(fnWebhook).toMatch(/\^<\.\*>\$/);
  });

  it("lead resolve primeiro pelo <ID_CONTATO> (UUID plantado no enfileiramento)", () => {
    // Telefone repetido (recadastro, cônjuge) não confunde: o id_contato é
    // autoritativo; o telefone com variantes é fallback do receptivo.
    expect(fnWebhook).toMatch(/UUID_RE\.test\(idContato\)/);
    expect(fnWebhook.indexOf("UUID_RE.test(idContato)")).toBeLessThan(
      fnWebhook.indexOf('rpc("buscar_lead_ativo_por_telefone_global"'),
    );
  });

  it("corrida de insert (23505): o evento perdedor é aplicado na linha vencedora", () => {
    expect(fnWebhook).toContain("aplicarAtualizacao");
    expect(fnWebhook).toMatch(/23505[\s\S]*?buscarExistente\(\)/);
    // Status sem regressão: evento atrasado nunca desfaz estado terminal.
    expect(fnWebhook).toContain("TERMINAIS");
    // Eco na timeline com a direção DA LINHA — click2call atualizado por
    // evento sem id_campanha continua "saída".
    expect(fnWebhook).toContain("existente.direcao");
  });
});

describe("aba Discador (fiação)", () => {
  const rota = readFileSync(join(root, "src/routes/_authenticated/discador.tsx"), "utf8");
  const pagina = readFileSync(join(root, "src/features/telefonia/discador-page.tsx"), "utf8");
  const clienteChamadas = readFileSync(
    join(root, "src/features/telefonia/chamadas-client.ts"),
    "utf8",
  );
  // O menu vem do registro SISTEMAS desde a reorganização em sistemas.
  const sistemas = readFileSync(join(root, "src/features/nav/sistemas.ts"), "utf8");
  const routeTree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");

  it("rota /discador existe, está na árvore gerada e no menu da Central de Atendimento", () => {
    expect(rota).toContain('createFileRoute("/_authenticated/discador")');
    expect(routeTree).toContain("discador");
    expect(sistemas).toMatch(/label: "Discador",\s*icon: Phone,\s*to: "\/discador"/);
  });

  it("página vive de `chamadas` com realtime e rediscagem pelo hook único", () => {
    expect(pagina).toContain('useRealtimeInvalidate("chamadas"');
    expect(pagina).toContain("useLigarLead");
    expect(pagina).toContain("listarChamadasRecentes");
    // Migration pendente mostra estado explicativo em vez de quebrar.
    expect(pagina).toContain("tabelaAusente");
    expect(clienteChamadas).toContain("tabelaAusente");
  });

  it("KPIs do dia contam no servidor; lookups .in() vão em lotes; telefone formata sem truncar", () => {
    // A lista é uma janela das 500 mais recentes — os cartões contam TODAS as
    // chamadas de hoje (head:true), senão dia de campanha pesada subconta.
    expect(pagina).toContain("contarChamadasHoje");
    expect(clienteChamadas).toContain('count: "exact", head: true');
    // Centenas de UUIDs num .in() só cabem na URL em lotes.
    expect(pagina).toContain("buscarEmLotes");
    // Exibição única de telefone (lib/masks) — sem cópia local que trunca.
    expect(pagina).toContain("formatPhoneBR");
  });

  it("sessão de discagem: fila só da carteira, sem opt-out/lixeira, uma chamada por vez", () => {
    const sessao = readFileSync(join(root, "src/features/telefonia/sessao-discagem.tsx"), "utf8");
    expect(rota).toContain("SessaoDiscagem");
    expect(sessao).toContain("Iniciar agora");
    // A fila respeita a carteira e as exclusões de compliance.
    expect(sessao).toContain('.eq("corretor_id", user.id)');
    expect(sessao).toContain('.eq("opt_out", false)');
    expect(sessao).toContain('.eq("na_lixeira", false)');
    expect(sessao).toContain('.is("deleted_at", null)');
    // Régua fixa da operação: Aguardando atendimento OU follow-up vencido
    // (em etapa ativa) — nunca uma fila arbitrária.
    expect(sessao).toContain("status.eq.aguardando_atendimento");
    expect(sessao).toContain("proximo_followup.lt.");
    // Base COMPLETA, sem teto de quantidade: pagina o banco até o fim.
    expect(sessao).toContain(".range(de, de + PAGINA - 1)");
    // Prioridade: quem está há mais tempo sem contato entra primeiro.
    expect(sessao).toMatch(/order\("ultima_interacao", \{ ascending: true, nullsFirst: true \}\)/);
    // Disca pelo fluxo único (click-to-call com fallback) e registra resultado
    // pelo diálogo padrão — nada de caminho paralelo sem histórico.
    expect(sessao).toContain("useLigarLead");
    expect(sessao).toContain("RegistrarContatoDialog");
  });

  it("pop-up global de chamada ativa: filtro do corretor, som e ficha do cliente", () => {
    const host = readFileSync(join(root, "src/features/telefonia/chamada-ativa-host.tsx"), "utf8");
    const layout = readFileSync(join(root, "src/routes/_authenticated/route.tsx"), "utf8");
    // Montado no layout autenticado — a ficha aparece em QUALQUER tela do CRM.
    expect(layout).toContain("ChamadaAtivaHost");
    // Só as chamadas do PRÓPRIO corretor acordam o pop-up: a RLS deixa a
    // gestão ver tudo, e sem o filtro o sino tocaria a cada chamada alheia.
    expect(host).toContain("corretor_id=eq.");
    expect(clienteChamadas).toContain('.eq("corretor_id", corretorId)');
    // Campainha sintetizada (sem asset externo) com preferência persistida.
    expect(host).toContain("tocarCampainha");
    expect(host).toContain("localStorage");
    // Ficha + ações: atender no CRM (dossiê) e registrar o resultado.
    expect(host).toContain("RegistrarContatoDialog");
    expect(host).toContain("Atender no CRM");
  });
});
