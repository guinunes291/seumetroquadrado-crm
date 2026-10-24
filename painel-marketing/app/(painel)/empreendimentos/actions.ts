"use server";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/lib/auth";
import { desligarApelido, ligarApelido, ligarCampanha } from "@/lib/empreendimentos";

export async function acaoLigarApelido(form: FormData) {
  const s = await exigirSessao();
  await ligarApelido(
    s.email,
    String(form.get("nome")),
    String(form.get("escolha")),
    String(form.get("novo") ?? ""),
  );
  revalidatePath("/", "layout");
}

export async function acaoDesligarApelido(form: FormData) {
  const s = await exigirSessao();
  await desligarApelido(s.email, String(form.get("apelido")));
  revalidatePath("/", "layout");
}

export async function acaoLigarCampanha(form: FormData) {
  const s = await exigirSessao();
  await ligarCampanha(
    s.email,
    String(form.get("campanha")),
    String(form.get("escolha")),
    String(form.get("novo") ?? ""),
  );
  revalidatePath("/", "layout");
}
