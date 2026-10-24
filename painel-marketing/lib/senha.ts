import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Funções puras de senha e token, sem banco, para poder testar isoladas.

const N = 16384;
const R = 8;
const P = 1;
const TAM = 64;

function scryptAsync(senha: string, sal: Buffer): Promise<Buffer> {
  return new Promise((ok, falha) =>
    scrypt(senha, sal, TAM, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (erro, chave) =>
      erro ? falha(erro) : ok(chave),
    ),
  );
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scryptAsync(senha, sal);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64url")}$${chave.toString("base64url")}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const sal = Buffer.from(partes[4], "base64url");
  const esperado = Buffer.from(partes[5], "base64url");
  const chave = await scryptAsync(senha, sal);
  return chave.length === esperado.length && timingSafeEqual(chave, esperado);
}

export function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Regra mínima: 12 caracteres. Frase longa vale mais que símbolo.
export function problemaNaSenha(senha: string): string | null {
  if (senha.length < 12) return "A senha precisa ter pelo menos 12 caracteres.";
  if (senha.length > 200) return "A senha passou de 200 caracteres.";
  return null;
}
