"use server";
import { redirect } from "next/navigation";
import { encerrarSessao, entrar } from "@/lib/auth";

export async function acaoEntrar(_: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "");
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return "Preencha e-mail e senha.";
  const ok = await entrar(email, senha);
  if (!ok)
    return "E-mail ou senha não conferem. Depois de 8 tentativas erradas, o acesso trava por 15 minutos.";
  redirect("/");
}

export async function acaoSair() {
  await encerrarSessao();
  redirect("/login");
}
