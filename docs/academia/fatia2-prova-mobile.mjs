// Prova das telas da Academia num celular de verdade (Chromium, 390x844).
//
// Por que aqui e não em e2e/: a Fatia 2 só pode criar arquivo em
// src/features/academia, src/routes, src/hooks/use-app-flags.ts, tests/
// academia* e docs/academia. Quando a Academia sair da flag, mova este
// arquivo para e2e/ junto com o smoke.
//
// Como funciona: sobe o vite dev com credenciais FALSAS de Supabase, semeia
// uma sessão no localStorage e responde TODA chamada de rede do Supabase com
// fixture (page.route). Nenhum byte sai para a internet e nenhum banco é
// tocado. Reprova (exit 1) se qualquer erro aparecer no console.
//
//   node docs/academia/fatia2-prova-mobile.mjs
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.ACADEMIA_PORT ?? 5199);
const BASE = `http://127.0.0.1:${PORT}`;
const REF = "academiateste";
const SUPA = `https://${REF}.supabase.co`;
const PRINTS = "docs/academia/fatia2-prints";
const UID = "11111111-1111-4111-8111-111111111111";

const ok = (body) => ({
  status: 200,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

// --- fixtures --------------------------------------------------------------
const MODULO = {
  id: "m-o01",
  codigo: "O01",
  numero: 1,
  fase: 0,
  titulo: "Integração: pronto para atender",
  objetivo_principal:
    "Em 5 dias, atender um lead real no padrão SMQ: ligar conduzindo e registrar tudo no CRM.",
  objetivos: ["Conduzir a ligação com as 6 perguntas na ordem", "Executar a cadência D1, D2 e D3"],
  pontos_chave: [],
  pilares: ["Comercial"],
  obrigatorio: true,
  exige_pratica: true,
  pratica_descricao: "Roleplay de ligação com o gestor, usando um lead que só perguntou o preço.",
  pratica_rubrica: [{ criterio: "Perguntou se é o primeiro imóvel", peso: 1 }],
  nota_minima: null,
  status: "publicado",
  versao: 1,
  revisao_pendente: null,
  url_gamma: null,
  url_notion: null,
  url_material: null,
};

const AULAS = [
  {
    id: "a1",
    modulo_id: "m-o01",
    ordem: 1,
    titulo: "A SMQ e a regra de ouro",
    tipo: "texto",
    duracao_min: 10,
    status: "publicado",
    conteudo_md:
      "### Quem somos\n\nA Seu Metro Quadrado atende quem vai comprar o **primeiro imóvel**.\n\n1. Assessoria no crédito\n2. Curadoria de produto\n3. Acompanhamento até as chaves\n",
    url_material: null,
    url_video: null,
  },
  {
    id: "a2",
    modulo_id: "m-o01",
    ordem: 2,
    titulo: "As 6 perguntas de qualificação",
    tipo: "texto",
    duracao_min: 10,
    status: "publicado",
    conteudo_md: "1. É o seu primeiro imóvel?\n2. Está buscando há quanto tempo?\n",
    url_material: null,
    url_video: null,
  },
];

const STATUS_MODULO = {
  corretor_id: UID,
  modulo_id: "m-o01",
  codigo: "O01",
  fase: 0,
  numero: 1,
  titulo: MODULO.titulo,
  obrigatorio: true,
  exige_pratica: true,
  aulas_total: 2,
  aulas_feitas: 1,
  melhor_nota: null,
  quiz_aprovado: false,
  tentativas: 0,
  pratica_status: "nao_enviada",
  concluido: false,
  concluido_em: null,
  prazo_em: "2026-10-10",
  ultima_atividade: "2026-10-01T15:00:00Z",
};

const QUIZ_ABERTO = {
  tentativa_id: "t-1",
  tempo_limite_min: 30,
  nota_minima: 80,
  questoes: [
    {
      id: "q1",
      enunciado: "Qual é a primeira pergunta da sequência obrigatória de qualificação?",
      alternativas: ["Qual a sua renda?", "É o seu primeiro imóvel?"],
    },
    {
      id: "q2",
      enunciado: "Quando falar de preço?",
      alternativas: ["Logo na abertura", "Depois de descobrir a parcela ideal"],
    },
  ],
};

const QUIZ_RESULTADO = {
  nota: 100,
  nota_minima: 80,
  aprovado: true,
  acertos: 2,
  total: 2,
  gabarito: [
    {
      id: "q1",
      enunciado: QUIZ_ABERTO.questoes[0].enunciado,
      alternativas: QUIZ_ABERTO.questoes[0].alternativas,
      correta: 1,
      marcada: 1,
      explicacao: "A pergunta 1 revela a elegibilidade ao MCMV e abre a jornada.",
    },
    {
      id: "q2",
      enunciado: QUIZ_ABERTO.questoes[1].enunciado,
      alternativas: QUIZ_ABERTO.questoes[1].alternativas,
      correta: 1,
      marcada: 1,
      explicacao: "Ordem trocada é venda perdida: renda antes de preço.",
    },
  ],
};

const TABELAS = {
  app_flags: [
    { chave: "academia_menu", ativo: true },
    { chave: "academia_card_inicio", ativo: true },
  ],
  // ADMIN de propósito. O dia do corretor tem diálogos BLOQUEANTES antes de
  // qualquer tela (estudo do funil, metas do dia), todos gateados por
  // isCorretor. Eles não têm nada a ver com a Academia, e as telas da
  // Academia não olham papel: olham PARTICIPAÇÃO, que aqui está ativa. O
  // roteiro de aceite da seção 6 do fatia2-telas-corretor.md é que exercita o
  // corretor de verdade, no celular.
  user_roles: [{ user_id: UID, role: "admin" }],
  academia_participantes: [
    { corretor_id: UID, participa: true, inicio_trilha: "2026-09-28", nivel: "iniciante" },
  ],
  academia_fases: [
    {
      numero: 0,
      nome: "Integração",
      periodo_texto: "Dias 1-5",
      foco: "Pronto para atender lead no padrão SMQ",
      nivel_que_exige: "habilitado",
    },
    {
      numero: 1,
      nome: "Fundação",
      periodo_texto: "Dias 1-30",
      foco: "Mentalidade, papel, mercado e MCMV",
      nivel_que_exige: "intermediario",
    },
  ],
  v_academia_corretor_resumo: [
    {
      corretor_id: UID,
      corretor_nome: "Corretor de teste",
      participa: true,
      inicio_trilha: "2026-09-28",
      nivel: "iniciante",
      habilitado_override: null,
      habilitado: false,
      modulos_concluidos: 0,
      modulos_obrigatorios: 1,
      modulos_atrasados: 0,
      praticas_pendentes: 0,
      ultima_atividade: "2026-10-01T15:00:00Z",
    },
  ],
  v_academia_fase_status: [
    { corretor_id: UID, fase: 0, obrigatorios: 1, concluidos: 0, completa: false },
  ],
  v_academia_modulo_status: [STATUS_MODULO],
  academia_atribuicoes: [
    {
      id: "at-1",
      corretor_id: UID,
      modulo_id: "m-o01",
      origem: "gestor",
      recomendacao_id: null,
      motivo: "Comece pela Integração",
      prazo: "2026-10-10",
      atribuido_por: null,
      criado_em: "2026-10-01T12:00:00Z",
      concluida_em: null,
      cancelada_em: null,
    },
  ],
  academia_modulos: [MODULO],
  academia_aulas: AULAS,
  academia_progresso_aulas: [
    { corretor_id: UID, aula_id: "a1", concluida_em: "2026-10-01T15:00:00Z" },
  ],
  academia_praticas: [],
  academia_encontros: [
    {
      id: "e1",
      tipo: "roleplay_diario",
      titulo: "Roleplay da manhã",
      inicio: "2030-01-10T12:00:00Z",
      duracao_min: 30,
      facilitador_id: null,
      modulo_id: null,
      descricao: null,
      acao_registrada: null,
      criado_por: null,
      criado_em: "2026-10-01T12:00:00Z",
    },
  ],
  academia_certificados: [
    {
      id: "c1",
      corretor_id: UID,
      nivel: "habilitado",
      codigo: "A1B2C3D4",
      emitido_em: "2026-10-02T12:00:00Z",
    },
  ],
  profiles: [
    {
      id: UID,
      nome: "Corretor de teste",
      email: "corretor@teste.local",
      status_conta: "ativa",
      avatar_url: null,
      equipe_id: null,
    },
  ],
  user_preferences: [],
  alertas: [],
  chamadas: [],
  funil_estudo_diario: [],
  metas_dia_corretor: [],
  metas_diarias: [],
  academia_niveis_historico: [
    {
      id: 1,
      corretor_id: UID,
      de: "iniciante",
      para: "habilitado",
      motivo: "regra automatica: fases concluidas",
      por: null,
      em: "2026-10-02T12:00:00Z",
    },
  ],
};

const RPCS = {
  conta_atual_ativa: true,
  nav_pendencias: {},
  marcar_presenca: null,
  academia_quiz_iniciar: QUIZ_ABERTO,
  academia_quiz_enviar: QUIZ_RESULTADO,
  academia_marcar_aula: null,
  academia_pratica_enviar: "p-1",
  onboarding_corretor_status: null,
  metas_dia_taxas: null,
  meu_funil_estudo: null,
};

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

// O estudo diário do funil é um modal BLOQUEANTE que abre antes de qualquer
// tela do corretor (e não fecha com Escape, de propósito). Aqui ele já está
// feito: a Fatia 2 prova as telas da Academia, não o porteiro do Meu Funil.
TABELAS.funil_estudo_diario = [
  {
    dia: DIA_SP,
    foco: "agendamento",
    compromisso: "Ligar para 5 leads do estoque",
    segundos_na_tela: 120,
    concluido_em: new Date().toISOString(),
  },
];

const desconhecidas = new Set();

async function main() {
  mkdirSync(PRINTS, { recursive: true });

  const dev = spawn("npx", ["vite", "dev", "--port", String(PORT), "--strictPort"], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: SUPA,
      VITE_SUPABASE_PUBLISHABLE_KEY: "chave-falsa-de-teste",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout.on("data", () => {});
  dev.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

  const pronto = await esperarServidor(BASE, 90_000);
  if (!pronto) {
    dev.kill("SIGTERM");
    throw new Error("vite dev não subiu a tempo");
  }

  // channel "chromium" usa o build completo que o `playwright install
  // chromium` baixa; sem ele o Playwright procura o headless_shell separado.
  const browser = await chromium.launch({ channel: "chromium" });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const sessao = {
    access_token: "token-falso",
    refresh_token: "refresh-falso",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: UID, email: "corretor@teste.local", user_metadata: { nome: "Corretor de teste" } },
  };
  // O CRM abre um modal BLOQUEANTE ("Antes de começar: estude o seu funil")
  // antes de qualquer tela do corretor. Ele não fecha com Escape, de propósito.
  // Em vez de fingir dados do Meu Funil, usamos a válvula que o próprio app
  // oferece para o caso de falha de gravação: a liberação do dia neste
  // aparelho. É o caminho documentado em use-estudo-pendente.ts.
  await ctx.addInitScript(
    ([chaveSessao, valorSessao, chaveEstudo]) => {
      window.localStorage.setItem(chaveSessao, valorSessao);
      window.localStorage.setItem(chaveEstudo, "1");
    },
    [
      `sb-${REF}-auth-token`,
      JSON.stringify(sessao),
      `smq:meu-funil:liberado-por-falha:${UID}:${DIA_SP}`,
    ],
  );

  // O realtime abre websocket para um host que não existe e polui o console
  // com ERR_NAME_NOT_RESOLVED. Não é defeito da tela: corta na origem.
  await ctx.route("**/realtime/v1/**", (route) => route.abort());

  await ctx.route("**/*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;

    if (p.startsWith("/auth/v1/user")) return route.fulfill(ok(sessao.user));
    if (p.startsWith("/auth/v1/token")) return route.fulfill(ok(sessao));
    if (p.startsWith("/auth/v1/logout")) return route.fulfill(ok({}));

    if (p.startsWith("/rest/v1/rpc/")) {
      const nome = p.replace("/rest/v1/rpc/", "");
      if (!(nome in RPCS)) desconhecidas.add(`rpc:${nome}`);
      return route.fulfill(ok(nome in RPCS ? RPCS[nome] : null));
    }
    if (p.startsWith("/rest/v1/")) {
      const tabela = p.replace("/rest/v1/", "").split("?")[0];
      if (!(tabela in TABELAS)) desconhecidas.add(`tabela:${tabela}`);
      const linhas = TABELAS[tabela] ?? [];
      // maybeSingle/single pedem objeto, não array.
      const aceita = route.request().headers()["accept"] ?? "";
      if (aceita.includes("vnd.pgrst.object")) return route.fulfill(ok(linhas[0] ?? null));
      return route.fulfill(ok(linhas));
    }
    return route.fulfill(ok({}));
  });

  const page = await ctx.newPage();
  const erros = [];
  // Ruído de AMBIENTE (host falso de Supabase), não da tela.
  const RUIDO = [/ERR_NAME_NOT_RESOLVED/i, /realtime/i, /WebSocket/i];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (RUIDO.some((r) => r.test(t))) return;
    erros.push(t);
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

  const passos = [
    ["01-trilha", "/academia", "Minha trilha"],
    ["02-modulo", "/academia/modulo/O01", "Integração: pronto para atender"],
    ["03-aula", "/academia/modulo/O01/aula/1", "A SMQ e a regra de ouro"],
    ["04-quiz", "/academia/modulo/O01/quiz", "Quiz do módulo"],
    ["06-progresso", "/academia/progresso", "Meu progresso"],
  ];

  for (const [nome, rota, esperado] of passos) {
    await page.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(() => document.body.innerText.trim().length > 0, { timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(800);
    await dispensarModais(page);
    const texto = await page.locator("body").innerText();
    if (!texto.includes(esperado)) {
      await page.screenshot({ path: `${PRINTS}/ERRO-${nome}.png`, fullPage: true });
      console.error(`\n--- diagnóstico de ${rota} ---`);
      console.error(`url final: ${page.url()}`);
      console.error(`título: ${await page.title()}`);
      console.error(`corpo (600): ${JSON.stringify(texto.slice(0, 600))}`);
      console.error(`body html (1500): ${(await page.locator("body").innerHTML()).slice(0, 1500)}`);
      console.error(`console: ${erros.slice(0, 10).join(" | ") || "(vazio)"}`);
      console.error(`sem fixture: ${[...desconhecidas].join(", ") || "(nenhuma)"}`);
      throw new Error(`${rota}: não encontrei "${esperado}" na tela.`);
    }
    await page.screenshot({ path: `${PRINTS}/${nome}.png`, fullPage: true });
    console.log(`  ok ${rota}`);

    // o quiz vai até o resultado, que é a tela que prova a correção comentada
    if (nome === "04-quiz") {
      await page.getByRole("button", { name: "Começar o quiz" }).click();
      await page.waitForTimeout(300);
      await page.getByText("É o seu primeiro imóvel?").click();
      await page.getByRole("button", { name: "Próxima" }).click();
      await page.getByText("Depois de descobrir a parcela ideal").click();
      await page.getByRole("button", { name: "Revisar e enviar" }).click();
      await page.screenshot({ path: `${PRINTS}/05-quiz-confirmacao.png`, fullPage: true });
      await page.getByRole("button", { name: "Enviar agora" }).click();
      await page.waitForTimeout(400);
      const res = await page.locator("body").innerText();
      if (!res.includes("Correção")) throw new Error("o quiz não chegou ao resultado");
      await page.screenshot({ path: `${PRINTS}/05-quiz-resultado.png`, fullPage: true });
      console.log("  ok /academia/modulo/O01/quiz (até o resultado)");
    }
  }

  // o card no /inicio
  await page.goto(`${BASE}/inicio`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await dispensarModais(page);
  const inicio = await page.locator("body").innerText();
  if (!inicio.includes("Sua próxima aula")) throw new Error("o card não apareceu no /inicio");
  await page.screenshot({ path: `${PRINTS}/07-card-inicio.png`, fullPage: true });
  console.log("  ok /inicio (card Sua próxima aula)");

  await browser.close();
  dev.kill("SIGTERM");

  if (desconhecidas.size > 0) {
    console.log(`\nChamadas sem fixture (responderam vazio): ${[...desconhecidas].join(", ")}`);
  }
  if (erros.length > 0) {
    console.error(`\n${erros.length} erro(s) no console:`);
    for (const e of erros) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`\nSem erros no console. Prints em ${PRINTS}/`);
}

/**
 * O CRM abre diálogos globais por cima de qualquer tela (o estudo diário do
 * Meu Funil, o onboarding). Eles deixam o resto da página aria-hidden, e aí
 * nenhum seletor por papel alcança a tela de baixo. Dispensa antes de medir.
 */
/**
 * Diálogo que eventualmente apareça por cima (aviso, onboarding) sai pelo
 * Escape. Sem cirurgia no DOM: remover overlay à força quebra a página, e uma
 * prova que mexe no que está medindo não prova nada.
 */
async function dispensarModais(page) {
  for (let volta = 0; volta < 3; volta++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

async function esperarServidor(base, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    try {
      const r = await fetch(base, { signal: AbortSignal.timeout(2000) });
      if (r.ok || r.status === 404) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
