import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const prettierExtensions = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function refExists(ref) {
  if (!ref || /^0+$/.test(ref)) return false;
  try {
    git("rev-parse", "--verify", `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function lines(value) {
  return value ? value.split("\n").filter(Boolean) : [];
}

const candidates = [
  process.env.FORMAT_BASE_SHA,
  process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined,
  process.env.GITHUB_EVENT_BEFORE,
  "origin/main",
  "HEAD^",
];
const baseCandidate = candidates.find(refExists);
const base = baseCandidate?.startsWith("origin/")
  ? git("merge-base", "HEAD", baseCandidate)
  : baseCandidate;

const files = new Set();
if (base) {
  lines(git("diff", "--name-only", "--diff-filter=ACMR", base, "HEAD")).forEach((file) =>
    files.add(file),
  );
}
for (const args of [
  ["diff", "--name-only", "--diff-filter=ACMR"],
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
  ["ls-files", "--others", "--exclude-standard"],
]) {
  lines(git(...args)).forEach((file) => files.add(file));
}

const selected = [...files]
  .filter((file) => existsSync(file))
  .filter((file) => prettierExtensions.has(file.slice(file.lastIndexOf("."))))
  .sort();

if (selected.length === 0) {
  console.log("Nenhum arquivo formatável alterado.");
  process.exit(0);
}

const prettier = resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prettier.cmd" : "prettier",
);
execFileSync(prettier, ["--check", ...selected], { stdio: "inherit" });
