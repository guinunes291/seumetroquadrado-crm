// Empilha card 1 e card 2 no MESMO instante para conferir a costura.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const T = process.argv[2] ? Number(process.argv[2]) : 1.017;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1080, height: 2700 } });
await p.goto("file://" + process.cwd() + "/carousel.html");
await p.evaluate(() => document.fonts.ready);
const shot = await p.evaluate(async (t) => {
  const out = document.createElement("canvas");
  out.width = 1080; out.height = 2700;
  const o = out.getContext("2d");
  const src = document.getElementById("c");
  window.render(1, t); o.drawImage(src, 0, 0);
  window.render(2, t); o.drawImage(src, 0, 1350);
  o.strokeStyle = "rgba(255,0,0,.55)"; o.lineWidth = 3;
  o.beginPath(); o.moveTo(0, 1350); o.lineTo(1080, 1350); o.stroke();
  return out.toDataURL("image/png");
}, T);
writeFileSync("preview/costura.png", Buffer.from(shot.split(",")[1], "base64"));
await b.close();
console.log("costura em t =", T);
