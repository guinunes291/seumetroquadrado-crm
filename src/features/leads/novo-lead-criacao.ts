// Novo lead — as regras da criação: validações, conferência final do
// corretor, e-mail duplicado, payload do criar_lead_dedup (ação de rua, zona,
// auto-atribuição ou atribuição manual), cada resposta da RPC, o CPF da busca
// e a roleta do admin.
// Recortado de novo-lead-dialog.tsx sem mudança de comportamento.

import { isValidBrazilPhone, isValidCPF, isValidEmail } from "@/lib/validators";
import { maskCPF } from "@/lib/masks";
import type { ClienteEncontrado } from "@/features/leads/buscar-oportunidade";
import { buscarOportunidade, type BuscaCliente } from "@/features/leads/oportunidade";
import {
  criarLeadDedup,
  gravarCpfDoLead,
  leadsComEmail,
  triarEDistribuirLead,
} from "./novo-lead-queries";

/** O telefone já existe na carteira de outro corretor: em vez de erro, o
 *  corretor volta ao "Buscar oportunidade" para criar o registro dele. */
export class DuplicadoEmOutraCarteira extends Error {
  constructor() {
    super("Este cliente já existe no CRM.");
  }
}

/** A conferência final do cadastro achou o cliente (o corretor mudou telefone,
 *  e-mail ou CPF depois da busca): volta para a busca, com o resultado. */
export class ClienteJaCadastrado extends Error {
  constructor(readonly resultado: ClienteEncontrado) {
    super("Este cliente já tem cadastro no CRM.");
  }
}

export const ORIGEM_OPTIONS = [
  "facebook",
  "google_sheets",
  "site",
  "indicacao",
  "captacao_corretor",
  "investimento_corretor",
  "whatsapp",
  "telefone",
  "plantao",
  "agendamento_self_service",
  "chatbot",
  "impulso_smq",
  "acao_rua",
  "portal",
  "outro",
] as const;

// Sentinel do select "Atribuir a": Radix Select não aceita value="", então o
// item "Sem corretor (triagem manual)" usa este valor reservado.
export const SEM_CORRETOR = "__sem_corretor__";

export type FormNovoLead = {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  origem: string;
  projeto_nome: string;
  bairro: string;
  zona: string;
  observacoes: string;
  acao_rua: string;
};

export type ContextoCriacao = {
  form: FormNovoLead;
  identidade: BuscaCliente;
  mostrarOportunidade: boolean;
  mostrarAtribuirA: boolean;
  corretorId: string;
  canManage: boolean;
  currentUserId: string | null;
  podeDistribuir: boolean;
  distribuirAuto: boolean;
  corretores: { id: string; nome: string }[] | undefined;
  validarTelefone: (args: { data: { telefone: string } }) => Promise<unknown>;
};

export async function criarNovoLead({
  form,
  identidade,
  mostrarOportunidade,
  mostrarAtribuirA,
  corretorId,
  canManage,
  currentUserId,
  podeDistribuir,
  distribuirAuto,
  corretores,
  validarTelefone,
}: ContextoCriacao) {
  if (!form.nome.trim() || !form.telefone.trim()) {
    throw new Error("Nome e telefone são obrigatórios");
  }
  if (!isValidBrazilPhone(form.telefone)) {
    throw new Error("Telefone inválido. Informe DDD + número (ex.: 11 91234-5678).");
  }
  await validarTelefone({ data: { telefone: form.telefone } });
  if (form.email.trim() && !isValidEmail(form.email)) {
    throw new Error("E-mail inválido.");
  }
  const cpf = mostrarOportunidade ? form.cpf.trim() : "";
  if (cpf && !isValidCPF(cpf)) {
    throw new Error("CPF inválido: confira os 11 dígitos.");
  }

  // Conferência final do corretor: telefone, e-mail ou CPF podem ter
  // mudado depois da busca. Só nasce cadastro mãe novo se ninguém casa.
  if (mostrarOportunidade) {
    const achado = await buscarOportunidade(identidade);
    if (achado.encontrado) throw new ClienteJaCadastrado(achado);
  }

  // Duplicidade por e-mail: checagem client-side (best-effort, sob RLS).
  // A duplicidade por TELEFONE é decidida no servidor pela RPC abaixo,
  // com lock transacional — imune a corrida e a variações de máscara/DDI.
  const emailNorm = form.email.trim().toLowerCase();
  if (emailNorm) {
    const dup = await leadsComEmail(emailNorm);
    if (dup && dup.length > 0) {
      throw new Error(`Lead duplicado: já existe "${dup[0].nome}" com este e-mail.`);
    }
  }

  // Ação de rua: a descrição é opcional e entra como observação, no topo,
  // sem substituir o que o corretor escreveu.
  const acaoRua = form.origem === "acao_rua" ? form.acao_rua.trim() : "";
  const observacoes = [acaoRua ? `Ação de rua: ${acaoRua}` : "", form.observacoes.trim()]
    .filter(Boolean)
    .join("\n");

  const payload: Record<string, unknown> = {
    nome: form.nome.trim(),
    telefone: form.telefone.trim(),
    email: emailNorm || null,
    origem: form.origem,
    projeto_nome: form.projeto_nome.trim() || null,
    // Filas por zona: zona explícita manda; sem ela, o trigger do banco
    // resolve pelo bairro (tabela zonas_bairros) ou pelo projeto.
    bairro: form.bairro.trim() || null,
    zona: form.zona || null,
    observacoes: observacoes || null,
  };
  // Corretor: atribui automaticamente a si mesmo e já entra como "aguardando atendimento"
  const atribuicaoManual = mostrarAtribuirA && corretorId !== SEM_CORRETOR;
  if (!canManage && currentUserId) {
    payload.corretor_id = currentUserId;
    payload.status = "aguardando_atendimento";
  } else if (atribuicaoManual) {
    // Gestor/admin escolheu um corretor: mesmo padrão da auto-atribuição
    // acima — o lead já nasce na carteira dele, aguardando atendimento.
    payload.corretor_id = corretorId;
    payload.status = "aguardando_atendimento";
  }

  const criacao = await criarLeadDedup(payload);
  const resultado = criacao as {
    duplicado: boolean;
    lead_id: string;
    nome?: string | null;
    na_carteira?: boolean;
    /** SDR: o lead já existia e entrou na base de pré-venda (RPC decide). */
    sdr_pegou?: boolean;
    /** SDR: lead existe mas está de agendado para frente — só gestão move. */
    bloqueado_etapa?: boolean;
  } | null;
  if (!resultado?.lead_id) throw new Error("Falha ao criar o lead. Tente novamente.");
  if (resultado.duplicado && resultado.sdr_pegou) {
    return {
      id: resultado.lead_id,
      corretor: null,
      corretorNome: resultado.nome ?? null,
      selfAssigned: false,
      sdrPegou: true,
      cpfPendente: false,
    };
  }
  if (resultado.duplicado && resultado.bloqueado_etapa) {
    throw new Error(
      `"${resultado.nome ?? "Este cliente"}" já existe e está em etapa avançada (agendamento em diante, venda ou perdido). Só a gestão pode mover — peça ao seu gestor.`,
    );
  }
  if (resultado.duplicado && mostrarOportunidade && !resultado.na_carteira) {
    throw new DuplicadoEmOutraCarteira();
  }
  if (resultado.duplicado) {
    throw new Error(
      resultado.na_carteira && resultado.nome
        ? `Lead duplicado: já existe "${resultado.nome}" com este telefone.`
        : "Lead duplicado: já existe um lead com este telefone em outra carteira.",
    );
  }
  const data = { id: resultado.lead_id };

  // CPF da busca: o criar_lead_dedup não recebe CPF, então ele entra logo
  // depois, pelo mesmo caminho do "Editar dados" — e o gatilho do
  // registro mãe o leva para a mãe (é o que a busca por CPF encontra).
  // Falhar aqui não desfaz o lead: o corretor completa na ficha.
  let cpfPendente = false;
  if (cpf) {
    const cpfErr = await gravarCpfDoLead(data.id, maskCPF(cpf));
    cpfPendente = !!cpfErr;
  }

  if (podeDistribuir && distribuirAuto && data?.id) {
    // Distribuição v3: triagem única (origem → roleta → corretor apto).
    const triagem = await triarEDistribuirLead(data.id);
    const res = triagem as { ok?: boolean; corretor_id?: string } | null;
    return {
      id: data.id,
      corretor: res?.ok ? (res.corretor_id ?? null) : null,
      corretorNome: null as string | null,
      selfAssigned: false,
      sdrPegou: false,
      cpfPendente,
    };
  }
  return {
    id: data.id,
    corretor: atribuicaoManual ? corretorId : null,
    // Nome para o toast — resolvido da lista já carregada no select.
    corretorNome: atribuicaoManual
      ? ((corretores ?? []).find((c) => c.id === corretorId)?.nome ?? null)
      : null,
    selfAssigned: !canManage,
    sdrPegou: false,
    cpfPendente,
  };
}
