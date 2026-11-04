// Peças comuns da automação de DM do Instagram (motor do webhook e envio do
// lead). Só servidor.
import {
  adminInstagram,
  type ConfigRow,
  type ConversaRow,
} from "@/integrations/supabase/instagram-dm-pendente";

export function msgErro(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

export function agora(): string {
  return new Date().toISOString();
}

export async function carregarConfig(): Promise<ConfigRow | null> {
  const { data } = await adminInstagram()
    .from("instagram_dm_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return data;
}

export async function atualizarConversa(id: string, campos: Partial<ConversaRow>) {
  const { error } = await adminInstagram()
    .from("instagram_dm_conversas")
    .update({ ...campos, atualizado_em: agora() })
    .eq("id", id);
  if (error) throw new Error(`conversa: ${error.message}`);
}
