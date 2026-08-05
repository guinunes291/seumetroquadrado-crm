// Renderiza o loop dos dois cards frame a frame e grava PNGs sequenciais.
// Uso: node shoot.mjs [preview]
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const previewOnly = process.argv[2] === "preview";

// o Chromium do ambiente é o 1194; aponta direto em vez de baixar outro
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto("file://" + join(here, "carousel.html"));
await page.evaluate(() => document.fonts.ready);

const meta = await page.evaluate(() => window.META);
console.log("meta:", meta);

async function shoot(card, t, file) {
  const data = await page.evaluate(([c, tt]) => {
    window.render(c, tt);
    return window.frameData();
  }, [card, t]);
  writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
}

if (previewOnly) {
  // amostras nos instantes que mais importam para conferir a arte
  mkdirSync(join(here, "preview"), { recursive: true });
  for (const [card, t, name] of [
    [1, 0.30, "c1-segura"],
    [1, 0.80, "c1-caindo"],
    [1, 1.05, "c1-saindo"],
    [2, 1.35, "c2-entrando"],
    [2, 2.02, "c2-pousa"],
    [2, 2.34, "c2-brilho"],
    [2, 2.95, "c2-some"],
    [2, 0.60, "c2-entre-chaves"],
  ]) {
    await shoot(card, t, join(here, "preview", name + ".png"));
  }
  console.log("preview pronto");
} else {
  for (const card of [1, 2]) {
    const dir = join(here, "frames" + card);
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < meta.FRAMES; f++) {
      await shoot(card, f / meta.FPS, join(dir, String(f).padStart(4, "0") + ".png"));
    }
    console.log("card", card, "->", meta.FRAMES, "frames");
  }
}

await browser.close();
