import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const assetsDirectory = join(process.cwd(), ".output", "public", "assets");
const maxGzipBytes = Number(process.env.ROUTE_CHUNK_GZIP_BUDGET ?? 250 * 1024);
const chunks = readdirSync(assetsDirectory)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    file,
    gzipBytes: gzipSync(readFileSync(join(assetsDirectory, file))).byteLength,
  }))
  .sort((a, b) => b.gzipBytes - a.gzipBytes);

const overBudget = chunks.filter((chunk) => chunk.gzipBytes > maxGzipBytes);
const largest = chunks.slice(0, 10);
console.log(
  `Maiores chunks gzip:\n${largest
    .map((chunk) => `- ${chunk.file}: ${(chunk.gzipBytes / 1024).toFixed(1)} KB`)
    .join("\n")}`,
);

if (overBudget.length > 0) {
  console.error(`Budget excedido: máximo ${(maxGzipBytes / 1024).toFixed(0)} KB gzip por chunk.`);
  process.exit(1);
}
