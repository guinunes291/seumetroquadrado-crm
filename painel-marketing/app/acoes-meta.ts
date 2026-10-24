"use server";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/lib/auth";
import { ErroMeta, sincronizarMeta } from "@/lib/meta";
import { registrar } from "@/lib/auditoria";

// Só leitura da Meta. Em erro, mostra a tradução e não tenta de novo sozinho.
export async function acaoSincronizarMeta(): Promise<string> {
  const s = await exigirSessao();
  try {
    const r = await sincronizarMeta(s.email);
    revalidatePath("/");
    return `Atualizado: ${r.campanhas} campanhas com gasto nos últimos 30 dias.`;
  } catch (e) {
    const msg = e instanceof ErroMeta ? e.traduzido : "Não consegui falar com a Meta agora.";
    await registrar(s.email, "meta_sincronizacao_falhou", null, { motivo: msg });
    return msg;
  }
}
