// Venda por contrato — achar, criar e atualizar o CLIENTE.
//
// Busca na ordem pedida pelo dono: CPF → telefone → e-mail (o primeiro que
// casar vale). O usuário SEMPRE confirma o cliente achado (pergunta 4):
// juntar a venda no cliente errado estraga o histórico de dois clientes.
//
// Corretor: enxerga só a própria carteira (RLS), então a busca é a de
// "Buscar oportunidade" (`buscar_oportunidade`, registro mãe), que olha a base
// toda sem devolver dado de outra carteira. Cliente de outro corretor vira um
// registro filho do corretor (`criar_registro_filho`) — a mesma porta do
// Novo lead; cliente em negociação avançada com outro corretor bloqueia.
// Gestão: enxerga a base toda e escolhe entre os leads encontrados.
//
// Nada aqui grava antes de o usuário clicar em "Registrar venda": a tela só
// chama `resolverClienteDaVenda` dentro do envio da venda.

import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/features/dashboard/queries";
import {
  buscarOportunidade,
  criarRegistroFilho,
  type Oportunidade,
} from "@/features/leads/oportunidade";
import { criarLeadDedup } from "@/features/leads/novo-lead-queries";
import { anexarDocumento } from "@/lib/documentacao";
import { maskCPF } from "@/lib/masks";
import { onlyDigits } from "@/lib/validators";
import {
  CAMPOS_CLIENTE,
  payloadDadosCliente,
  type CampoCliente,
  type DadosClienteContrato,
  type LeituraContrato,
} from "./contrato-venda";
import { z } from "zod";

export type MatchPor = "cpf" | "telefone" | "email";

export type LeadCandidato = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  status: string;
};

export type ClienteAchado =
  | { tipo: "nenhum" }
  | {
      tipo: "oportunidade";
      matchPor: MatchPor;
      oportunidade: Extract<Oportunidade, { encontrado: true }>;
    }
  | { tipo: "candidatos"; matchPor: MatchPor; candidatos: LeadCandidato[] };

const ORDEM: MatchPor[] = ["cpf", "telefone", "email"];

function valorBusca(d: DadosClienteContrato, por: MatchPor): string {
  if (por === "cpf") return onlyDigits(d.cpf);
  if (por === "telefone") return onlyDigits(d.telefone);
  return d.email.trim().toLowerCase();
}

const CAMPOS_CANDIDATO = "id, nome, telefone, email, corretor_id, projeto_id, projeto_nome, status";

type LinhaCandidato = Omit<LeadCandidato, "corretor_nome">;

async function candidatosGestao(por: MatchPor, valor: string): Promise<LinhaCandidato[]> {
  const base = () =>
    supabase
      .from("leads")
      .select(CAMPOS_CANDIDATO)
      .is("deleted_at", null)
      .eq("na_lixeira", false)
      .limit(20);
  if (por === "cpf") {
    const { data, error } = await base().in("cpf", [valor, maskCPF(valor)]);
    if (error) throw error;
    return data ?? [];
  }
  if (por === "email") {
    const { data, error } = await base().ilike("email", valor);
    if (error) throw error;
    return data ?? [];
  }
  // Telefone é salvo com ou sem máscara/DDI: filtra pelos 4 finais no banco
  // e confere os 9 finais aqui (a mesma chave do registro mãe).
  const fim = valor.slice(-9);
  const { data, error } = await base().ilike("telefone", `%${fim.slice(-4)}%`);
  if (error) throw error;
  return (data ?? []).filter((l) => onlyDigits(l.telefone).endsWith(fim));
}

async function nomesCorretores(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, nome").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.nome ?? ""]));
}

/** Procura o cliente do contrato: CPF, depois telefone, depois e-mail. */
export async function acharClienteDoContrato(
  d: DadosClienteContrato,
  gestao: boolean,
): Promise<ClienteAchado> {
  for (const por of ORDEM) {
    const valor = valorBusca(d, por);
    if (!valor) continue;
    if (!gestao) {
      const r = await buscarOportunidade({
        cpf: por === "cpf" ? valor : "",
        telefone: por === "telefone" ? valor : "",
        email: por === "email" ? valor : "",
      });
      if (r.encontrado) return { tipo: "oportunidade", matchPor: por, oportunidade: r };
      continue;
    }
    const linhas = await candidatosGestao(por, valor);
    if (linhas.length > 0) {
      const nomes = await nomesCorretores([
        ...new Set(linhas.map((l) => l.corretor_id).filter((x): x is string => !!x)),
      ]);
      return {
        tipo: "candidatos",
        matchPor: por,
        candidatos: linhas.map((l) => ({
          ...l,
          corretor_nome: l.corretor_id ? (nomes.get(l.corretor_id) ?? null) : null,
        })),
      };
    }
  }
  return { tipo: "nenhum" };
}

// O cadastro atual do lead para o "atual → novo". `select("*")` traz também as
// colunas novas da migration 20261101120000 (ainda fora dos types gerados);
// o zod lê só o que interessa, e antes da migration elas simplesmente faltam.
const textoOuVazio = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null ? "" : String(v)));
const AtualSchema = z.object(
  Object.fromEntries(CAMPOS_CLIENTE.map((c) => [c, textoOuVazio])) as Record<
    CampoCliente,
    typeof textoOuVazio
  >,
);

export async function carregarDadosAtuais(leadId: string): Promise<Record<CampoCliente, string>> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (error) throw error;
  return AtualSchema.parse(data);
}

export class ClienteBloqueado extends Error {}

const aplicarSchema = z.object({ ok: z.literal(true), campos: z.number() });

/** Grava os campos escolhidos num UPDATE só (RPC com a RLS de quem chama). */
export async function aplicarDadosCliente(
  leadId: string,
  d: DadosClienteContrato,
  campos: readonly CampoCliente[],
): Promise<number> {
  const payload = payloadDadosCliente(d, campos, maskCPF);
  if (Object.keys(payload).length === 0) return 0;
  const { data, error } = await rpc("aplicar_dados_contrato_lead", {
    _lead_id: leadId,
    _dados: payload,
  });
  if (error) {
    // Migration ainda não aplicada: grava ao menos o que o lead já tinha
    // coluna (nome, telefone, e-mail, CPF, renda), pelo caminho do "Editar
    // dados". Os campos novos ficam para depois — a venda não trava por isso.
    if (error.code === "PGRST202" || error.code === "42883") {
      const txt = (k: string) =>
        typeof payload[k] === "string" ? (payload[k] as string) : undefined;
      const basicos: {
        nome?: string;
        telefone?: string;
        email?: string;
        cpf?: string;
        renda_estimada?: number;
      } = {
        nome: txt("nome"),
        telefone: txt("telefone"),
        email: txt("email"),
        cpf: txt("cpf"),
        renda_estimada:
          typeof payload.renda_estimada === "number" ? payload.renda_estimada : undefined,
      };
      for (const k of Object.keys(basicos) as (keyof typeof basicos)[]) {
        if (basicos[k] === undefined) delete basicos[k];
      }
      if (Object.keys(basicos).length === 0) return 0;
      const { error: e2 } = await supabase.from("leads").update(basicos).eq("id", leadId);
      if (e2) throw e2;
      return Object.keys(basicos).length;
    }
    throw error;
  }
  return aplicarSchema.parse(data).campos;
}

export type DecisaoCliente =
  /** Lead já escolhido (card) ou confirmado na busca. */
  | { tipo: "existente"; leadId: string; corretorId: string | null; campos: CampoCliente[] }
  /** Corretor: cliente de outro corretor → registro filho na carteira dele. */
  | { tipo: "registro_filho"; clienteId: string; campos: CampoCliente[] }
  /** Ninguém casou (ou o usuário disse "não é ele"): cliente novo. */
  | { tipo: "novo"; corretorId: string; origem: string };

export type ClienteResolvido = { leadId: string; corretorId: string | null; criado: boolean };

/**
 * Executa a decisão do usuário — chamado dentro do envio da venda, então só
 * grava quando ele clica em "Registrar venda".
 */
export async function resolverClienteDaVenda(
  decisao: DecisaoCliente,
  d: DadosClienteContrato,
): Promise<ClienteResolvido> {
  if (decisao.tipo === "existente") {
    await aplicarDadosCliente(decisao.leadId, d, decisao.campos);
    return { leadId: decisao.leadId, corretorId: decisao.corretorId, criado: false };
  }

  if (decisao.tipo === "registro_filho") {
    const r = await criarRegistroFilho(decisao.clienteId);
    if (!r.ok) {
      throw new ClienteBloqueado(
        r.motivo === "negociacao_avancada"
          ? "Este cliente está em negociação avançada com outro corretor. Fale com a gestão."
          : "Não foi possível trazer o cliente para a sua carteira.",
      );
    }
    // O registro filho herda os dados da mãe; o contrato completa por cima
    // só o que o usuário deixou marcado (telefone é a identidade da mãe).
    await aplicarDadosCliente(
      r.lead_id,
      d,
      decisao.campos.filter((c) => c !== "telefone"),
    );
    const { data: u } = await supabase.auth.getUser();
    return { leadId: r.lead_id, corretorId: u.user?.id ?? null, criado: !r.ja_existia };
  }

  // Cliente novo: nasce JÁ na carteira do corretor, aguardando atendimento.
  // Sem roleta — ele chega vendido (pergunta 9). A RPC decide o dedupe de
  // telefone com lock transacional.
  const criacao = await criarLeadDedup({
    nome: d.nome.trim(),
    telefone: d.telefone,
    email: d.email.trim().toLowerCase() || null,
    origem: decisao.origem,
    corretor_id: decisao.corretorId,
    status: "aguardando_atendimento",
    observacoes: "Cadastrado pela venda por contrato (IA).",
  });
  const res = criacao as { duplicado?: boolean; lead_id?: string; nome?: string | null } | null;
  if (!res?.lead_id) throw new Error("Falha ao criar o cliente. Tente novamente.");
  if (res.duplicado) {
    throw new ClienteBloqueado(
      `Já existe um cliente com este telefone${res.nome ? ` ("${res.nome}")` : ""}. Volte e confirme o cliente encontrado.`,
    );
  }
  const resto = CAMPOS_CLIENTE.filter((c) => !["nome", "telefone", "email"].includes(c));
  await aplicarDadosCliente(res.lead_id, d, resto);
  return { leadId: res.lead_id, corretorId: decisao.corretorId, criado: true };
}

/**
 * Depois de registrada a venda: anexa o contrato na Documentação do cliente
 * e grava no histórico de onde veio a venda e quanto a IA acertou (pergunta
 * 10: "venda cadastrada a partir de contrato lido por IA — N campos
 * corrigidos"). A venda já existe: falha aqui vira aviso, nunca desfaz nada.
 */
export async function finalizarVendaContrato(a: {
  vendaId: string;
  leadId: string;
  corretorId: string | null;
  arquivo: File | null;
  leitura: LeituraContrato | null;
  dados: DadosClienteContrato;
  paginasEnviadas: number[];
}): Promise<void> {
  const falhas: string[] = [];
  let anexado = false;
  if (a.arquivo) {
    try {
      await anexarDocumento(a.leadId, a.corretorId, "contrato_compra_venda", a.arquivo);
      anexado = true;
    } catch (e) {
      falhas.push(`o contrato não foi anexado (${(e as Error).message})`);
    }
  }
  const lidos = a.leitura?.camposLidos ?? [];
  const corrigidos = lidos.filter((c) => (a.leitura?.cliente[c] ?? "") !== a.dados[c]);
  const conteudo = [
    a.leitura
      ? `A IA leu ${lidos.length} campos do cliente; ${corrigidos.length} corrigidos pelo usuário.`
      : "A leitura automática falhou; dados preenchidos à mão.",
    a.arquivo ? `Arquivo: ${a.arquivo.name}.` : "",
    anexado ? "Contrato anexado em Documentação." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("interacoes").insert({
    lead_id: a.leadId,
    autor_id: u.user?.id ?? null,
    tipo: "nota",
    direcao: "interna",
    titulo: "Venda cadastrada a partir do contrato (IA)",
    conteudo,
    metadata: {
      origem: "contrato_ia",
      venda_id: a.vendaId,
      campos_lidos: lidos.length,
      campos_corrigidos: corrigidos,
      confianca: a.leitura?.confianca ?? null,
      paginas_enviadas: a.paginasEnviadas,
    },
  });
  if (error) falhas.push("a nota do histórico não foi gravada");
  if (falhas.length > 0) throw new Error(`${falhas.join("; ")}.`);
}
