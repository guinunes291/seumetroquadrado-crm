// Smoke test do ARTEFATO DE PRODUÇÃO. Boota o build e valida no navegador real
// aquilo que `vite build`/vitest não veem: render, hidratação, chunks e console.
// Pré-requisito: `NITRO_PRESET=node-server npm run build` (server entry em
// .output/server/index.mjs). O bundle client é idêntico ao preset Cloudflare
// (mesmos hashes de asset), então o que é exercitado aqui é o que embarca.
//
// Falha (exit 1) se: página não renderiza, erro de console fatal (tela branca /
// useSyncExternalStore / ChunkLoadError / hidratação), chunk 404, /auth sem
// formulário, `/` não redireciona para /auth, ou segredo no JS servido.
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_ENTRY = ".output/server/index.mjs";
const ASSETS_DIR = ".output/public/assets";

// Ruído de ambiente: em CI o app não tem credenciais reais, então chamadas ao
// Supabase falham. Registramos mas não reprovamos por isso.
const ENV_NOISE = [
  /supabase\.co/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /load failed/i,
  /401|403|400 \(/i,
];
// Assinaturas do incidente — qualquer uma reprova.
const FATAL = [
  /Cannot set properties of undefined/i,
  /useSyncExternalStore/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Minified React error/i,
  /Hydration failed/i,
  /Text content does not match/i,
  /Cannot read properties of undefined/i,
];
const SECRET_RE =
  /sb_secret|service_role|SUPABASE_SERVICE_ROLE|sk_live|VAPID_PRIVATE|LANDING_HASH_SECRET|TURNSTILE_SECRET|MCP_WRITE_API_KEY/;

const isNoise = (t) => ENV_NOISE.some((r) => r.test(t));
const isFatal = (t) => FATAL.some((r) => r.test(t));

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/auth`, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function checkRoute(browser, path) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const chunk404 = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e?.message ?? e)));
  page.on("response", (r) => {
    if (/\/assets\/.*\.(js|css)(\?|$)/.test(r.url()) && r.status() >= 400) {
      chunk404.push(`${r.status()} ${r.url()}`);
    }
  });
  let status = null;
  try {
    const resp = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 20000 });
    status = resp ? resp.status() : null;
  } catch (e) {
    fail(`${path}: navegação falhou (${String(e).slice(0, 120)})`);
  }
  await page.waitForTimeout(2500);
  const url = page.url();
  const bodyLen = (await page.evaluate(() => document.body?.innerText ?? "")).trim().length;
  const rootLen = await page.evaluate(() => {
    const el = document.querySelector("#root, #app, main") ?? document.body;
    return el ? el.innerHTML.length : 0;
  });
  const emailInput = await page.$("input[type=email], input[name=email]");
  const pwInput = await page.$("input[type=password]");
  await ctx.close();

  for (const t of consoleErrors) {
    if (isFatal(t)) fail(`${path}: erro fatal de console → ${t.slice(0, 160)}`);
    else if (!isNoise(t)) fail(`${path}: erro de console não permitido → ${t.slice(0, 160)}`);
  }
  for (const c of chunk404) fail(`${path}: chunk 404 → ${c}`);

  return { path, status, url, bodyLen, rootLen, hasLoginForm: !!emailInput && !!pwInput };
}

// Watchdog: nunca deixa o smoke pendurar o CI. Reprova se estourar o teto.
const watchdog = setTimeout(() => {
  console.error("\n✗ SMOKE excedeu o tempo limite (120s).");
  process.exit(1);
}, 120000);
watchdog.unref();

(async () => {
  if (!existsSync(SERVER_ENTRY)) {
    console.error(
      `Artefato ausente: ${SERVER_ENTRY}. Rode 'NITRO_PRESET=node-server npm run build' antes do smoke.`,
    );
    process.exit(2);
  }

  console.log(`▶ subindo servidor (${SERVER_ENTRY}) na porta ${PORT}…`);
  const server = spawn("node", [SERVER_ENTRY], {
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  // Garante que o servidor filho morra em qualquer saída do processo.
  const matarServidor = () => {
    try {
      server.kill("SIGKILL");
    } catch {
      // já encerrado
    }
  };
  process.on("exit", matarServidor);
  server.on("error", (e) => {
    console.error("Falha ao subir o servidor:", e);
    process.exit(2);
  });

  const up = await waitForServer();
  if (!up) {
    console.error("Servidor não respondeu a tempo.");
    server.kill("SIGTERM");
    process.exit(2);
  }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    console.log("▶ /auth (render + formulário de login)");
    const auth = await checkRoute(browser, "/auth");
    if (auth.rootLen > 200 || auth.bodyLen > 20) ok("render não vazio");
    else fail("/auth: tela vazia (sem render)");
    if (auth.hasLoginForm) ok("formulário de login presente");
    else fail("/auth: formulário de login ausente");

    console.log("▶ /vitrine-publica (rota pública)");
    const vit = await checkRoute(browser, "/vitrine-publica");
    if (vit.rootLen > 100 || vit.bodyLen > 10) ok("render não vazio");
    else fail("/vitrine-publica: tela vazia");

    console.log("▶ / (rota protegida → redirect p/ /auth)");
    const root = await checkRoute(browser, "/");
    if (/\/auth/.test(root.url)) ok("redireciona para /auth sem sessão");
    else fail(`/: não redirecionou para /auth (url=${root.url})`);

    console.log("▶ varredura de segredos no JS servido");
    let leaked = 0;
    if (existsSync(ASSETS_DIR)) {
      for (const f of readdirSync(ASSETS_DIR).filter((x) => x.endsWith(".js"))) {
        const m = readFileSync(`${ASSETS_DIR}/${f}`, "utf8").match(SECRET_RE);
        if (m) {
          leaked++;
          fail(`segredo no bundle (${f}): ${m[0]}`);
        }
      }
    }
    if (leaked === 0) ok("nenhum segredo no bundle client");
  } finally {
    await browser.close();
    server.kill("SIGKILL");
    clearTimeout(watchdog);
  }

  // Usa exitCode (não process.exit) para o event loop drenar e o stdout esvaziar
  // — process.exit() com stdout em pipe trunca a saída.
  if (failures.length > 0) {
    console.error(`\n✗ SMOKE FALHOU (${failures.length} problema(s)).`);
    process.exitCode = 1;
    return;
  }
  console.log("\n✓ SMOKE OK — render, redirect, console, chunks e segredos validados.");
  process.exitCode = 0;
})().catch((e) => {
  console.error("SMOKE_CRASH", e);
  process.exitCode = 2;
});
