"use server";
import { redirect } from "next/navigation";
import { definirSenhaPorConvite } from "@/lib/auth";
import { gerarHashSenha, problemaNaSenha } from "@/lib/senha";

export async function acaoDefinirSenha(_: string | null, form: FormData): Promise<string | null> {
  const token = String(form.get("token") ?? "");
  const senha = String(form.get("senha") ?? "");
  const confirma = String(form.get("confirma") ?? "");
  const problema = problemaNaSenha(senha);
  if (problema) return problema;
  if (senha !== confirma) return "As duas senhas não são iguais.";
  const email = await definirSenhaPorConvite(token, await gerarHashSenha(senha));
  if (!email) return "Este link já foi usado ou expirou. Peça um novo.";
  redirect("/");
}
