import { supabase } from "@/integrations/supabase/client";

export const LIXEIRA_TABELAS = [
  "leads",
  "projetos",
  "unidades",
  "agendamentos",
  "tarefas",
  "interacoes",
] as const;

export type LixeiraTabela = (typeof LIXEIRA_TABELAS)[number];

export const LIXEIRA_LABEL: Record<LixeiraTabela, string> = {
  leads: "Leads",
  projetos: "Empreendimentos",
  unidades: "Unidades",
  agendamentos: "Agendamentos",
  tarefas: "Tarefas",
  interacoes: "Interações",
};

/** Soft delete: marca registro com deleted_at = now() */
export async function softDelete(tabela: LixeiraTabela, id: string) {
  const { error } = await supabase
    .from(tabela)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Restaura registro da lixeira (apenas admin) */
export async function restaurar(tabela: LixeiraTabela, id: string) {
  const { error } = await supabase.rpc("restaurar_registro", {
    _tabela: tabela,
    _id: id,
  });
  if (error) throw error;
}

/** Calcula quantos dias restam até a expiração (90 dias após delete) */
export function diasAteExpiracao(deletedAt: string | null): number {
  if (!deletedAt) return 0;
  const d = new Date(deletedAt).getTime();
  const limite = d + 90 * 24 * 60 * 60 * 1000;
  const ms = limite - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Resumo amigável para o card de listagem da lixeira */
export function resumoRegistro(tabela: LixeiraTabela, row: Record<string, unknown>): string {
  switch (tabela) {
    case "leads":
      return String(row.nome ?? "Lead sem nome");
    case "projetos":
      return String(row.nome ?? "Projeto sem nome");
    case "unidades":
      return `Unidade ${String(row.identificador ?? row.id)}`;
    case "agendamentos":
      return String(row.titulo ?? "Agendamento");
    case "tarefas":
      return String(row.titulo ?? "Tarefa");
    case "interacoes":
      return String(row.tipo ?? "Interação");
  }
}
