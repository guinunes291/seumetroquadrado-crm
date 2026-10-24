"use server";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/lib/auth";
import { ErroMeta } from "@/lib/meta";
import { registrar } from "@/lib/auditoria";
import { anotarCriativo, marcarCriativo, sincronizarCriativos } from "@/lib/criativos";

// Só leitura da Meta. Em erro, mostra a tradução e não tenta de novo sozinho.
export async function acaoSincronizarCriativos(): Promise<string> {
  const s = await exigirSessao();
  try {
    const r = await sincronizarCriativos(s.email);
    revalidatePath("/criativos");
    return `Atualizado: ${r.anuncios} anúncios lidos, ${r.comGasto} com gasto em todo o período.`;
  } catch (e) {
    const msg = e instanceof ErroMeta ? e.traduzido : "Não consegui falar com a Meta agora.";
    await registrar(s.email, "criativos_sincronizacao_falhou", null, { motivo: msg });
    return msg;
  }
}

const idValido = (v: FormDataEntryValue | null) =>
  typeof v === "string" && /^\d+$/.test(v) ? v : null;

export async function acaoMarcar(form: FormData) {
  const s = await exigirSessao();
  const id = idValido(form.get("ad_id"));
  const campo = form.get("campo");
  if (!id || (campo !== "favorito" && campo !== "oculto")) return;
  await marcarCriativo(s.email, id, campo, form.get("valor") === "sim");
  revalidatePath("/criativos");
}

export async function acaoNota(form: FormData) {
  const s = await exigirSessao();
  const id = idValido(form.get("ad_id"));
  if (!id) return;
  await anotarCriativo(s.email, id, String(form.get("nota") ?? ""));
  revalidatePath("/criativos");
}
