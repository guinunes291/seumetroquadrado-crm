// Arquivos que o corretor manda no WhatsApp da Sami (v8, "CRM no WhatsApp").
//
// 1) POST /api/sami/anexo (n8n, x-sami-key) guarda o arquivo numa ÁREA DE
//    ESPERA: bucket privado `documentacao`, pasta samiq-anexos/<corretor>/,
//    e uma linha em samiq_anexos. Nada vai para a ficha de ninguém ainda.
// 2) A ação anexar_documento (samiq-executar.server.ts) leva o arquivo para a
//    ficha do cliente. Antes de qualquer coisa privilegiada, a SESSÃO DO
//    CORRETOR prova que ele enxerga o lead e o item do checklist (RLS); só
//    então o arquivo é copiado com o admin e registrado pela mesma RPC da tela
//    (registrar_documentacao_upload, com o corretor como ator). É o mesmo
//    desenho de /api/documentacao: autorização pelo usuário, storage pelo
//    servidor, porque o bucket não tem política de escrita para o browser.
//
// Documento do cliente NUNCA vai para o modelo (CPF, RG, holerite): a Sami
// só sabe que chegou "um PDF de 1,2 MB com a legenda X".

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { COLUNAS_ANEXO_SAMIQ, tabelaAnexosSamiQ } from "@/lib/samiq-anexos-tabela";

type Db = SupabaseClient<Database>;

export const SAMIQ_ANEXO_BUCKET = "documentacao";
export const SAMIQ_ANEXO_MAX_BYTES = 15 * 1024 * 1024;
export const SAMIQ_ANEXO_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class AnexoSamiError extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "AnexoSamiError";
  }
}

/** Guarda o arquivo na área de espera do corretor (idempotente por id da mensagem). */
export async function guardarAnexoDoWhatsApp(args: {
  corretorId: string;
  arquivo: Blob;
  mime: string;
  nomeOriginal?: string | null;
  legenda?: string | null;
  mensagemId?: string | null;
}): Promise<{ id: string; reaproveitado: boolean }> {
  const ext = SAMIQ_ANEXO_MIMES[args.mime];
  if (!ext) throw new AnexoSamiError("tipo_invalido", "Por aqui eu anexo PDF, JPG, PNG ou WEBP.");
  if (args.arquivo.size < 1 || args.arquivo.size > SAMIQ_ANEXO_MAX_BYTES) {
    throw new AnexoSamiError("tamanho_invalido", "O arquivo precisa ter até 15 MB.");
  }
  const tabela = tabelaAnexosSamiQ(supabaseAdmin);
  if (args.mensagemId) {
    const { data: ja } = await tabela
      .select("id")
      .eq("user_id", args.corretorId)
      .eq("mensagem_id", args.mensagemId)
      .maybeSingle();
    if (ja) return { id: ja.id, reaproveitado: true };
  }
  const caminho = `samiq-anexos/${args.corretorId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(SAMIQ_ANEXO_BUCKET)
    .upload(caminho, args.arquivo, { contentType: args.mime, cacheControl: "0", upsert: false });
  if (upErr) throw new AnexoSamiError("upload_falhou", "Não consegui guardar o arquivo agora.");
  const { data, error } = await tabela
    .insert({
      user_id: args.corretorId,
      mime_type: args.mime,
      tamanho_bytes: args.arquivo.size,
      nome_original: args.nomeOriginal?.slice(0, 255) || null,
      legenda: args.legenda?.slice(0, 1000) || null,
      storage_path: caminho,
      mensagem_id: args.mensagemId?.slice(0, 200) || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    await supabaseAdmin.storage.from(SAMIQ_ANEXO_BUCKET).remove([caminho]);
    throw new AnexoSamiError("registro_falhou", "Não consegui registrar o arquivo agora.");
  }
  return { id: data.id, reaproveitado: false };
}

export type AnexoPendenteSamiQ = {
  id: string;
  mime: string;
  tamanho: number;
  legenda: string | null;
  nome: string | null;
  criadoEm: string;
};

/**
 * Arquivos ainda não anexados do corretor, do mais novo para o mais velho
 * (para o cabeçalho do turno: "RG frente", "RG verso" e "holerite" mandados em
 * sequência chegam juntos à Sami). Falha de leitura = lista vazia.
 */
export async function anexosPendentes(args: {
  corretorId: string;
  maxIdadeMs?: number;
  limite?: number;
}): Promise<AnexoPendenteSamiQ[]> {
  try {
    const { data } = await tabelaAnexosSamiQ(supabaseAdmin)
      .select(COLUNAS_ANEXO_SAMIQ)
      .eq("user_id", args.corretorId)
      .is("usado_em", null)
      .order("criado_em", { ascending: false })
      .limit(Math.min(Math.max(1, args.limite ?? 5), 10));
    const maxIdade = args.maxIdadeMs ?? 30 * 60 * 1000;
    return (data ?? [])
      .filter((a) => Date.now() - Date.parse(a.criado_em) <= maxIdade)
      .map((a) => ({
        id: a.id,
        mime: a.mime_type,
        tamanho: a.tamanho_bytes,
        legenda: a.legenda,
        nome: a.nome_original,
        criadoEm: a.criado_em,
      }));
  } catch {
    return [];
  }
}

/** Arquivo da área de espera pelo id (do próprio corretor). */
export async function anexoPorId(args: {
  corretorId: string;
  id: string;
}): Promise<AnexoPendenteSamiQ | null> {
  try {
    const { data: a } = await tabelaAnexosSamiQ(supabaseAdmin)
      .select(COLUNAS_ANEXO_SAMIQ)
      .eq("id", args.id)
      .eq("user_id", args.corretorId)
      .maybeSingle();
    if (!a || a.usado_em) return null;
    return {
      id: a.id,
      mime: a.mime_type,
      tamanho: a.tamanho_bytes,
      legenda: a.legenda,
      nome: a.nome_original,
      criadoEm: a.criado_em,
    };
  } catch {
    return null;
  }
}

/**
 * Faxina da área de espera: arquivo que ninguém anexou em 7 dias sai do
 * storage e da tabela (documento de cliente não fica parado à toa). Roda no
 * upload do próprio corretor; melhor esforço, nunca derruba o upload.
 */
export async function limparAnexosVencidos(corretorId: string): Promise<number> {
  try {
    const tabela = tabelaAnexosSamiQ(supabaseAdmin);
    const { data } = await tabela
      .select(COLUNAS_ANEXO_SAMIQ)
      .eq("user_id", corretorId)
      .is("usado_em", null)
      .order("criado_em", { ascending: true })
      .limit(20);
    const limite = Date.now() - 7 * 24 * 3600_000;
    const vencidos = (data ?? []).filter((a) => Date.parse(a.criado_em) < limite);
    if (vencidos.length === 0) return 0;
    await supabaseAdmin.storage
      .from(SAMIQ_ANEXO_BUCKET)
      .remove(vencidos.map((a) => a.storage_path));
    for (const a of vencidos) await tabela.delete().eq("id", a.id);
    return vencidos.length;
  } catch {
    return 0;
  }
}

/**
 * Leva o arquivo da área de espera para a ficha do cliente. `supabase` é a
 * sessão do corretor (RLS): é ela que prova o acesso ao lead e ao item.
 */
export async function anexarArquivoDoWhatsApp(args: {
  supabase: Db;
  userId: string;
  leadId: string;
  corretorId: string | null;
  anexoId: string;
  tipoDocumento: string;
}): Promise<{ documentacaoId: string }> {
  const { supabase, userId, leadId } = args;
  const tabela = tabelaAnexosSamiQ(supabaseAdmin);
  const { data: anexo, error: aErr } = await tabela
    .select(COLUNAS_ANEXO_SAMIQ)
    .eq("id", args.anexoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (aErr || !anexo)
    throw new Error("O arquivo não está mais disponível; peça para o corretor reenviar.");
  if (anexo.usado_em) throw new Error("Esse arquivo já foi anexado.");
  const ext = SAMIQ_ANEXO_MIMES[anexo.mime_type] ?? "bin";

  // Item do checklist com a sessão do corretor (RLS = acesso ao lead).
  const { data: existente, error: dErr } = await supabase
    .from("documentacoes")
    .select("id")
    .eq("lead_id", leadId)
    .eq("tipo", args.tipoDocumento)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (dErr) throw new Error("Não consegui ler o checklist do cliente.");
  let documentacaoId = existente?.id ?? null;
  if (!documentacaoId) {
    const { data: criado, error: cErr } = await supabase
      .from("documentacoes")
      .insert({
        lead_id: leadId,
        corretor_id: args.corretorId,
        tipo: args.tipoDocumento,
        status: "pendente",
      })
      .select("id")
      .single();
    if (cErr || !criado) throw new Error("Não consegui criar o item do documento na ficha.");
    documentacaoId = criado.id;
  }

  const destino = `${leadId}/${documentacaoId}/${crypto.randomUUID()}.${ext}`;
  const { error: cpErr } = await supabaseAdmin.storage
    .from(SAMIQ_ANEXO_BUCKET)
    .copy(anexo.storage_path, destino);
  if (cpErr) throw new Error("Não consegui mover o arquivo para a ficha.");
  const { error: rErr } = await supabaseAdmin.rpc("registrar_documentacao_upload", {
    _documentacao_id: documentacaoId,
    _lead_id: leadId,
    _object_path: destino,
    _nome_original: anexo.nome_original || `whatsapp.${ext}`,
    _mime_type: anexo.mime_type,
    _tamanho_bytes: anexo.tamanho_bytes,
    _ator_id: userId,
  });
  if (rErr) {
    await supabaseAdmin.storage.from(SAMIQ_ANEXO_BUCKET).remove([destino]);
    throw new Error("O CRM recusou registrar o documento.");
  }
  await tabela
    .update({
      usado_em: new Date().toISOString(),
      lead_id: leadId,
      documentacao_id: documentacaoId,
    })
    .eq("id", anexo.id);
  await supabaseAdmin.storage.from(SAMIQ_ANEXO_BUCKET).remove([anexo.storage_path]);
  return { documentacaoId };
}
