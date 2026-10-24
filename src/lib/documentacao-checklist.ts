// Parte PURA da documentação do cliente (checklist por perfil, rótulos e
// status), sem Supabase: usada pela tela (via documentacao.ts) e pelo servidor
// da Sami (samiq-executar.server.ts), que não pode importar o client do browser.

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
  pendente: "border-aviso-500 text-aviso-700",
  recebido: "border-azul-500 text-azul-700",
  aprovado: "border-verde-500 text-verde-700",
  reprovado: "border-vermelho-500 text-vermelho-700",
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
  extrato_bancario: "Extrato bancário (6 meses)",
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
  aprovacao_credito: "Carta de aprovação de crédito",
  nao_classificado: "Documento não classificado (revisar)",
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
      tipos.push("carteira_trabalho", "holerites", "extrato_bancario_6m");
      break;
    case "autonomo":
      tipos.push("decore", "extrato_bancario_6m");
      break;
    case "empresario":
      tipos.push("contrato_social", "pro_labore", "irpj", "extrato_pj");
      break;
    case "aposentado":
      tipos.push("extrato_beneficio", "extrato_bancario_6m");
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
