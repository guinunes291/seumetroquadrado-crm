// Documentação do cliente: hoje a tabela `documentacoes` existe no banco mas não
// tem nenhuma tela. Este módulo dá a ela uma camada utilizável — checklist por
// perfil de renda (CLT/autônomo/etc.), rótulos e CRUD — para que o corretor
// acompanhe a pasta dentro do CRM, em vez de controlar por fora.
//
// `checklistPorPerfil` é uma função PURA (testável). O CRUD usa o cliente
// Supabase destipado, pois a tabela ainda não está nos tipos gerados.

import { supabase } from "@/integrations/supabase/client";

export type DocStatus = "pendente" | "recebido" | "aprovado" | "reprovado";

export const DOC_STATUS: DocStatus[] = ["pendente", "recebido", "aprovado", "reprovado"];

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

/** Classe de badge (borda + texto) por status — segue o padrão das tarefas. */
export const DOC_STATUS_TONE: Record<DocStatus, string> = {
  pendente: "border-amber-500 text-amber-700",
  recebido: "border-blue-500 text-blue-700",
  aprovado: "border-green-500 text-green-700",
  reprovado: "border-red-500 text-red-700",
};

/** Um documento conta como "resolvido" quando já chegou e não foi reprovado. */
export function docResolvido(status: DocStatus): boolean {
  return status === "recebido" || status === "aprovado";
}

export type PerfilRenda = "clt" | "autonomo" | "empresario" | "aposentado";

export const PERFIL_RENDA: PerfilRenda[] = ["clt", "autonomo", "empresario", "aposentado"];

export const PERFIL_LABEL: Record<PerfilRenda, string> = {
  clt: "CLT",
  autonomo: "Autônomo / Informal",
  empresario: "Empresário / PJ",
  aposentado: "Aposentado / Pensionista",
};

export type ChecklistFlags = {
  casado?: boolean;
  usaFgts?: boolean;
  declaraIr?: boolean;
};

/** Rótulo legível para cada tipo de documento (slug → texto). */
export const DOC_LABEL: Record<string, string> = {
  documento_identidade: "RG ou CNH",
  cpf: "CPF",
  comprovante_estado_civil: "Certidão de nascimento ou casamento",
  comprovante_residencia: "Comprovante de residência atualizado",
  carteira_trabalho: "Carteira de trabalho (CTPS)",
  holerites: "3 últimos holerites / contracheques",
  extrato_bancario: "Extrato bancário (3 meses)",
  decore: "DECORE ou declaração de renda",
  extrato_bancario_6m: "Extrato bancário (6 meses)",
  contrato_social: "Contrato social",
  pro_labore: "Comprovante de pró-labore",
  irpj: "IRPJ / faturamento",
  extrato_pj: "Extrato bancário PJ",
  extrato_beneficio: "Extrato do benefício (INSS)",
  extrato_fgts: "Extrato do FGTS",
  autorizacao_fgts: "Autorização de movimentação do FGTS",
  declaracao_ir: "Declaração de IR (completa) + recibo",
  conjuge_identidade: "Documento de identidade do cônjuge",
  conjuge_renda: "Comprovante de renda do cônjuge",
  outro: "Outro documento",
};

export function docLabel(tipo: string): string {
  return DOC_LABEL[tipo] ?? tipo;
}

export type DocItem = { tipo: string; label: string };

/**
 * Checklist de documentos esperado para o perfil de renda + situação do cliente.
 * Pura e determinística. Os tipos comuns valem para todos; o perfil e os flags
 * (casado, usa FGTS, declara IR) acrescentam os específicos.
 */
export function checklistPorPerfil(perfil: PerfilRenda, flags: ChecklistFlags = {}): DocItem[] {
  const tipos: string[] = [
    "documento_identidade",
    "cpf",
    "comprovante_estado_civil",
    "comprovante_residencia",
  ];

  switch (perfil) {
    case "clt":
      tipos.push("carteira_trabalho", "holerites", "extrato_bancario");
      break;
    case "autonomo":
      tipos.push("decore", "extrato_bancario_6m");
      break;
    case "empresario":
      tipos.push("contrato_social", "pro_labore", "irpj", "extrato_pj");
      break;
    case "aposentado":
      tipos.push("extrato_beneficio", "extrato_bancario");
      break;
  }

  if (flags.usaFgts) tipos.push("extrato_fgts", "autorizacao_fgts");
  if (flags.declaraIr) tipos.push("declaracao_ir");
  if (flags.casado) tipos.push("conjuge_identidade", "conjuge_renda");

  const vistos = new Set<string>();
  return tipos
    .filter((t) => (vistos.has(t) ? false : (vistos.add(t), true)))
    .map((tipo) => ({ tipo, label: docLabel(tipo) }));
}

// ---------------------------------------------------------------------------
// CRUD — `documentacoes` ainda não está nos tipos gerados do Supabase, então o
// acesso é feito por um cliente destipado, isolado neste único ponto.
// ---------------------------------------------------------------------------

export type Documentacao = {
  id: string;
  lead_id: string;
  corretor_id: string | null;
  tipo: string;
  status: DocStatus;
  url: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docsTable = () => (supabase as any).from("documentacoes");

export async function listarDocs(leadId: string): Promise<Documentacao[]> {
  const { data, error } = await docsTable()
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Documentacao[];
}

export async function criarDocs(
  leadId: string,
  corretorId: string | null,
  tipos: string[],
): Promise<number> {
  if (tipos.length === 0) return 0;
  const rows = tipos.map((tipo) => ({
    lead_id: leadId,
    corretor_id: corretorId,
    tipo,
    status: "pendente" as DocStatus,
  }));
  const { error } = await docsTable().insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function atualizarDoc(
  id: string,
  patch: { status?: DocStatus; url?: string | null; observacoes?: string | null },
): Promise<void> {
  const { error } = await docsTable().update(patch).eq("id", id);
  if (error) throw error;
}

export async function removerDoc(id: string): Promise<void> {
  const { error } = await docsTable().delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Arquivos (Supabase Storage). O campo `url` guarda OU um link externo
// (Drive etc., começando com http) OU o caminho do objeto no bucket privado
// `documentacao`. Arquivos do bucket são abertos por signed URL temporária.
// ---------------------------------------------------------------------------

export const DOC_BUCKET = "documentacao";

/** Um `url` é link externo quando é http(s); caso contrário é caminho do Storage. */
export function isLinkExterno(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

/** Último segmento do caminho — o nome do arquivo, para exibição. */
export function nomeArquivo(path: string): string {
  return path.split("/").pop() || path;
}

function sanitizeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Sobe o arquivo para o bucket e devolve o caminho do objeto. */
export async function uploadDocArquivo(leadId: string, docId: string, file: File): Promise<string> {
  const path = `${leadId}/${docId}/${sanitizeNome(file.name)}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

/** Signed URL temporária para abrir um arquivo privado do bucket. */
export async function urlAssinadaDoc(path: string, expiraSegundos = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(path, expiraSegundos);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

/** Remove o objeto do Storage (best-effort). */
export async function removerDocArquivo(path: string): Promise<void> {
  await supabase.storage.from(DOC_BUCKET).remove([path]);
}

// ---------------------------------------------------------------------------
// Empreendimento de destino: registra na própria lead para qual projeto e
// construtora o cliente deve ser direcionado. Reaproveita o par já existente
// `leads.projeto_id` (FK) + `leads.projeto_nome` (texto) — "selecionar OU
// digitar" — somando `leads.construtora`. O corretor pode escolher um projeto
// cadastrado ou inserir manualmente.
// ---------------------------------------------------------------------------

export type ProjetoMin = { id: string; nome: string; construtora: string | null };

/** Projetos para o seletor (id + nome + construtora, para pré-preencher). */
export async function listarProjetosMin(): Promise<ProjetoMin[]> {
  const { data, error } = await supabase
    .from("projetos")
    .select("id, nome, construtora")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as ProjetoMin[];
}

export type EmpreendimentoPatch = {
  projeto_id: string | null;
  projeto_nome: string | null;
  construtora: string | null;
};

/**
 * Deriva o patch do lead a partir do estado da UI do card de empreendimento.
 * Pura e testável. A construtora é sempre o valor do campo editável (pré-
 * preenchido a partir do projeto, mas livre para o corretor ajustar).
 *  - manual: usa o texto digitado (exige empreendimento OU construtora);
 *  - projeto selecionado: vincula o projeto e usa seu nome;
 *  - "none": desvincula o projeto (mantém a construtora se digitada).
 */
export function derivarEmpreendimentoPatch(args: {
  manual: boolean;
  projetoId: string; // "none" = sem projeto vinculado
  empreendimentoManual: string;
  construtora: string;
  projetos: ProjetoMin[];
  leadProjetoNome: string | null;
}): EmpreendimentoPatch {
  const construtora = args.construtora.trim() || null;
  if (args.manual) {
    const nome = args.empreendimentoManual.trim() || null;
    if (!nome && !construtora) throw new Error("Informe o empreendimento ou a construtora");
    return { projeto_id: null, projeto_nome: nome, construtora };
  }
  if (args.projetoId !== "none") {
    const p = args.projetos.find((x) => x.id === args.projetoId);
    return {
      projeto_id: args.projetoId,
      projeto_nome: p?.nome ?? args.leadProjetoNome ?? null,
      construtora,
    };
  }
  return { projeto_id: null, projeto_nome: null, construtora };
}

/** Salva o empreendimento/construtora de destino no lead. */
export async function atualizarEmpreendimentoLead(
  leadId: string,
  patch: EmpreendimentoPatch,
): Promise<void> {
  // `as never`: o update de `leads` é tipado, mas seguimos o padrão do repo
  // (ver contract-sale-dialog) para evitar atrito com os tipos gerados.
  const { error } = await supabase
    .from("leads")
    .update(patch as never)
    .eq("id", leadId);
  if (error) throw error;
}
