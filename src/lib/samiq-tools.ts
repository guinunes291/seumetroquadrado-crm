// Núcleo PURO das ferramentas de LEITURA da Sami (Onda S1 — decisões D9/D10
// em docs/samiq/2026-09-05-decisoes-copiloto.md). Aqui vivem o catálogo
// (nomes, rótulos, contratos zod), a modelagem dos resultados que vão para o
// modelo (só campos seguros, com PII redigida) e as regras de telemetria
// (contar chamadas/erros por passo, detectar fallback). Sem rede nem Supabase:
// a execução com o banco fica em samiq-tools.server.ts.
//
// Doutrina: toda ferramenta LÊ; nenhuma grava. A escrita (Onda S2) entra por
// propostas confirmadas pelo corretor, nunca por aqui.

import { z } from "zod";
import { ATENDIMENTO_QUEUE_KEYS, type AtendimentoInbox } from "@/features/atendimento/inbox";
import type { QueueKey } from "@/features/atendimento/derive";
import {
  displayNameForSamiQ,
  minimizeSamiQContext,
  redactSamiQFreeText,
} from "@/lib/samiq-governance";
import { avisoTabelaSamiQ, situacaoTabelaSamiQ } from "@/lib/samiq-tabela";

export const SAMIQ_TOOL_NAMES = [
  "buscar_clientes",
  "detalhe_cliente",
  "minha_agenda",
  "minhas_tarefas",
  "meu_funil",
  "minha_fila",
  "documentos_do_cliente",
  "catalogo_projetos",
  // Onda S5 (D16): skills como ferramentas — determinísticas, só leitura.
  "pre_analise_mcmv",
  "avaliar_qualificacao",
  "curar_estoque",
  "preparar_visita",
  // v8 (CRM no WhatsApp): leituras que faltavam para o corretor não abrir o CRM.
  "listar_clientes",
  "minha_situacao",
  "material_do_projeto",
  "credito_do_cliente",
  "abrir_ferramentas",
] as const;

export type SamiQToolName = (typeof SAMIQ_TOOL_NAMES)[number];

/** Rótulo curto para o chip "Consultei: …" do painel. */
export const SAMIQ_TOOL_LABELS: Record<SamiQToolName, string> = {
  buscar_clientes: "clientes",
  detalhe_cliente: "cliente",
  minha_agenda: "agenda",
  minhas_tarefas: "tarefas",
  meu_funil: "funil",
  minha_fila: "fila",
  documentos_do_cliente: "documentos",
  catalogo_projetos: "projetos",
  pre_analise_mcmv: "pré-análise MCMV",
  avaliar_qualificacao: "qualificação",
  curar_estoque: "estoque",
  preparar_visita: "kit de visita",
  listar_clientes: "carteira",
  minha_situacao: "check-in e roleta",
  material_do_projeto: "empreendimento",
  credito_do_cliente: "crédito",
  abrir_ferramentas: "ferramentas",
};

export function isSamiQToolName(value: string): value is SamiQToolName {
  return (SAMIQ_TOOL_NAMES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Contratos de entrada (o modelo preenche; o servidor valida antes de consultar)
// ---------------------------------------------------------------------------

const LEAD_STATUS = [
  "novo",
  "aguardando_atendimento",
  "em_atendimento",
  "qualificado",
  "agendado",
  "visita_realizada",
  "proposta_enviada",
  "analise_credito",
  "contrato_fechado",
  "pos_venda",
  "perdido",
  "aguardando_retorno",
  "aguardando_corretor",
  "qualificacao_corretor",
] as const;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const BuscarClientesInput = z.object({
  termo: z
    .string()
    .min(2)
    .max(80)
    .describe("Parte do nome do cliente ou do empreendimento de interesse"),
  status: z.enum(LEAD_STATUS).optional().describe("Etapa do funil para filtrar"),
  temperatura: z.enum(["quente", "morno", "frio"]).optional(),
  limite: z.number().int().min(1).max(20).optional().describe("Padrão 8"),
});

export const DetalheClienteInput = z.object({
  leadId: z
    .string()
    .uuid()
    .describe("id do cliente (vem de buscar_clientes, da fila ou da agenda)"),
});

export const MinhaAgendaInput = z.object({
  de: z.string().regex(DATA_ISO).optional().describe("AAAA-MM-DD; padrão hoje"),
  ate: z.string().regex(DATA_ISO).optional().describe("AAAA-MM-DD; padrão 7 dias após 'de'"),
  apenas_abertos: z
    .boolean()
    .optional()
    .describe("true (padrão) = só agendado/confirmado; false = inclui realizados e cancelados"),
});

export const MinhasTarefasInput = z.object({
  apenas_vencidas: z.boolean().optional().describe("true = só as com vencimento no passado"),
  limite: z.number().int().min(1).max(30).optional().describe("Padrão 15"),
});

export const MeuFunilInput = z.object({});

export const MinhaFilaInput = z.object({
  fila: z
    .enum(ATENDIMENTO_QUEUE_KEYS)
    .optional()
    .describe("novos | responder | followups | esfriando | confirmar_visita | docs; vazio = todas"),
  limite: z.number().int().min(1).max(10).optional().describe("Por fila; padrão 5"),
});

export const DocumentosDoClienteInput = z.object({
  leadId: z.string().uuid(),
});

export const CatalogoProjetosInput = z.object({
  nome: z
    .string()
    .max(80)
    .optional()
    .describe("Nome do empreendimento ou construtora (busca parcial)"),
  regiao: z.string().max(60).optional().describe("Região, zona ou bairro (busca parcial)"),
  dorms: z.number().int().min(1).max(5).optional().describe("Quantidade de dormitórios"),
  preco_max: z.number().positive().optional().describe("Preço máximo em reais"),
  limite: z.number().int().min(1).max(15).optional().describe("Padrão 10"),
});

export const ListarClientesInput = z.object({
  etapa: z
    .array(z.enum(LEAD_STATUS))
    .max(6)
    .optional()
    .describe("Etapas do funil para filtrar (ex.: ['em_atendimento'])"),
  temperatura: z.enum(["quente", "morno", "frio"]).optional(),
  parados_dias: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Só quem está sem interação há N dias ou mais"),
  ordem: z
    .enum(["mais_parados", "mais_recentes"])
    .optional()
    .describe("mais_parados = sem contato há mais tempo primeiro; padrão mais_recentes"),
  limite: z.number().int().min(1).max(20).optional().describe("Padrão 10"),
});

export const MinhaSituacaoInput = z.object({});

export const MaterialDoProjetoInput = z.object({
  projetoId: z.string().uuid().optional().describe("id do empreendimento (de catalogo_projetos)"),
  nome: z.string().max(80).optional().describe("Nome do empreendimento, quando não tiver o id"),
});

export const CreditoDoClienteInput = z.object({
  leadId: z.string().uuid(),
});

/** Grupos de ferramentas que a Sami pode abrir no meio da resposta (samiq-grupos.ts). */
export const GRUPOS_FERRAMENTAS = [
  "carteira",
  "agenda",
  "tarefas",
  "funil",
  "qualificacao",
  "produtos",
  "documentos",
  "credito",
  "venda",
  "presenca",
  "prospeccao",
] as const;
export type GrupoFerramentas = (typeof GRUPOS_FERRAMENTAS)[number];

export const AbrirFerramentasInput = z.object({
  grupos: z
    .array(z.enum(GRUPOS_FERRAMENTAS))
    .min(1)
    .max(6)
    .describe(
      "carteira | agenda | tarefas | funil | qualificacao | produtos | documentos | credito | venda | presenca | prospeccao",
    ),
});

/** Descrições em PT-BR — é o que o modelo lê para decidir quando chamar. */
export const SAMIQ_TOOL_DESCRIPTIONS: Record<SamiQToolName, string> = {
  buscar_clientes:
    'Procura clientes na carteira do corretor pelo nome (com sobrenome, de preferência), pelo empreendimento de interesse e/ou pelo telefone (marcador [TELEFONE_n] da mensagem ou os últimos dígitos, ex.: "Lucas 4321"). Devolve id, nome, etapa, temperatura e datas-chave; o telefone nunca aparece. Se vierem dois ou mais clientes com o mesmo nome, pergunte qual antes de gravar.',
  detalhe_cliente:
    "Traz o dossiê resumido de um cliente: perfil financeiro, momento no funil, últimas interações, tarefas abertas, próximos compromissos e status dos documentos.",
  minha_agenda:
    "Lista os compromissos do corretor (visitas, reuniões, ligações) num intervalo de datas, com o cliente de cada um.",
  minhas_tarefas:
    "Lista tarefas e follow-ups pendentes do corretor, com vencimento e cliente. Use apenas_vencidas para 'o que está atrasado'.",
  meu_funil:
    "Contagem de clientes por etapa do funil do corretor, com follow-ups vencidos, parados há 7 dias e sem próxima ação por etapa.",
  minha_fila:
    "Fila priorizada de atendimento do corretor: quem procurar agora e por quê (novos, responder, follow-ups, esfriando, confirmar visita, documentação travada).",
  documentos_do_cliente:
    "Checklist de documentação de um cliente para o financiamento: cada documento com o status (pendente, recebido, aprovado, reprovado).",
  catalogo_projetos:
    "Empreendimentos ativos da SMQ com região, tipologia, dormitórios, preço a partir de e renda mínima. Filtre por nome do empreendimento ou construtora, região, dormitórios ou preço máximo.",
  pre_analise_mcmv:
    "Pré-análise MCMV determinística (tabela APROVE 2026): faixa, parcela estimada, financiamento máximo, subsídio, teto do imóvel e, se informar preco_imovel, se cabe e quanto parcelar com a construtora. SEMPRE use esta ferramenta para qualquer número de parcela, teto ou faixa — nunca calcule por conta própria.",
  avaliar_qualificacao:
    "Scorecard de qualificação do cliente em 7 dimensões (renda, entrada/FGTS, crédito, região, necessidade, urgência, motivação): o que já está no CRM, o que falta e a pergunta certa para cada lacuna. Use antes de sugerir imóvel ou quando o corretor perguntar 'o que falta para qualificar'.",
  curar_estoque:
    "Curadoria de empreendimentos com estoque real: unidades disponíveis, campanha vigente e se cabe na renda informada, ordenados por aderência e com o motivo de cada posição. Use quando o corretor pedir opções para um cliente.",
  preparar_visita:
    "Kit de preparação para a visita de um cliente: visita agendada, empreendimento com argumentos, documentos pendentes, objeções, simulação rápida e checklist do que confirmar e perguntar. Use na véspera ou quando o corretor disser 'me prepara para a visita'.",
  listar_clientes:
    "Lista clientes da carteira do corretor SEM precisar de nome: por etapa, temperatura ou parados há N dias (ex.: 'quem está em atendimento parado há 5 dias', 'meus quentes'). Use para escolher quem sai na troca de vaga ou montar a lista do dia.",
  minha_situacao:
    "Situação do corretor hoje: check-in (onde, se está apto para a roleta e por quê), Em atendimento (ocupação x teto, se está lotado, se recebe lead), base e se pode pedir lote de prospecção. Use para 'por que não recebi lead?', 'fiz check-in?', 'quantos tenho em atendimento?'.",
  material_do_projeto:
    "Ficha de venda de UM empreendimento: endereço, construtora, entrega, preço a partir de, renda mínima, metragem, vagas, argumentos de venda e se há book e tabela (com a data da tabela e aviso_tabela quando ela não é do mês, do dia 5 em diante). Book, tabela e planta o próprio canal envia quando o corretor pede pelo nome.",
  credito_do_cliente:
    "Análise de crédito atual de um cliente: situação (enviada, pendente, aprovada, condicionada, reprovada), banco, financiamento, parcela, prazo, FGTS, subsídio, validade. Valores aprovados são para o corretor, nunca para mensagem ao cliente.",
  abrir_ferramentas:
    "Abre mais grupos de ferramentas para os próximos passos desta resposta. Toda ação do CRM existe em algum grupo: se a que você precisa não está disponível, abra o grupo e use no passo seguinte (nunca diga que não consegue, nem que preparou algo sem a ferramenta). Grupos: carteira (fila, funil, lista de clientes, situação, tarefas, agenda), agenda (agendar, confirmar, remarcar, cancelar e registrar visita), tarefas (concluir, reagendar, cancelar), funil (retorno, perdido, troca de vaga, mudar etapa), qualificacao, produtos (catálogo, material, estoque), documentos, credito, venda, presenca (check-in), prospeccao (criar_lead para cadastrar cliente novo, pedir lote).",
};

// ---------------------------------------------------------------------------
// Datas (o servidor roda em UTC; a operação vive em São Paulo)
// ---------------------------------------------------------------------------

export const SAMIQ_FUSO = "America/Sao_Paulo";
const OFFSET_SP = "-03:00";
export const MAX_DIAS_AGENDA = 31;

/** AAAA-MM-DD de `agora` no fuso de São Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAMIQ_FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function somarDiasIso(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/**
 * Intervalo [inicio, fim] em ISO com fuso de SP para a consulta da agenda.
 * Padrão: hoje → hoje + 7 dias. Janela máxima de 31 dias; `ate` antes de `de`
 * vira o próprio `de` (um dia só) em vez de erro — o modelo erra datas.
 */
export function intervaloAgendaSamiQ(
  hoje: string,
  de?: string,
  ate?: string,
): { de: string; ate: string; inicioIso: string; fimIso: string } {
  const inicio = de && DATA_ISO.test(de) ? de : hoje;
  let fim = ate && DATA_ISO.test(ate) ? ate : somarDiasIso(inicio, 7);
  if (fim < inicio) fim = inicio;
  const limite = somarDiasIso(inicio, MAX_DIAS_AGENDA - 1);
  if (fim > limite) fim = limite;
  return {
    de: inicio,
    ate: fim,
    inicioIso: `${inicio}T00:00:00${OFFSET_SP}`,
    fimIso: `${fim}T23:59:59${OFFSET_SP}`,
  };
}

/**
 * Separa o que é nome/empreendimento do que é telefone no termo do
 * buscar_clientes ("Lucas 4321", "final 4321", "lucas final 98765-4321").
 * Os 4 últimos dígitos bastam para separar homônimos e não expõem o número.
 * Menos de 4 dígitos não vira filtro de telefone (fica no texto, como antes).
 */
export function separarTermoBuscaSamiQ(termo: string): {
  texto: string;
  finalTelefone: string | null;
} {
  const digitos = (termo.match(/\d[\d\s.-]*\d|\d/g) ?? [])
    .map((d) => d.replace(/\D/g, ""))
    .filter((d) => d.length >= 4);
  if (digitos.length === 0) return { texto: termoBuscaSamiQ(termo), finalTelefone: null };
  const ultimo = digitos[digitos.length - 1];
  const texto = termoBuscaSamiQ(
    termo
      .replace(/\d[\d\s.-]*\d|\d/g, " ")
      .replace(/\b(?:final|finais|terminado|termina|tel|telefone|cel|celular|em|com|o|a)\b/gi, " "),
  );
  return { texto, finalTelefone: ultimo.slice(-Math.min(ultimo.length, 9)) };
}

/** Termo de busca seguro para o filtro `.or()` do PostgREST (vírgula e
 *  parênteses são sintaxe; `%`/`*` são curingas que o modelo não controla). */
export function termoBuscaSamiQ(termo: string): string {
  return termo
    .replace(/[,()%*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Mesmo formato das colunas de busca normalizadas no banco. */
export function termoSemAcentoSamiQ(termo: string): string {
  return termoBuscaSamiQ(termo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Modelagem dos resultados (o que o modelo vê)
// ---------------------------------------------------------------------------

const MAX_STRING = 300;
const MAX_ARRAY = 40;

/** Passa o objeto pela minimização padrão (chaves de PII fora, strings redigidas e truncadas). */
function minimizar<T>(value: T, maxArray = MAX_ARRAY): unknown {
  return minimizeSamiQContext(value, { maxArray, maxString: MAX_STRING });
}

export type ClienteResumoRow = {
  id: string;
  nome: string | null;
  status: string | null;
  temperatura: string | null;
  projeto_nome: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
  origem: string | null;
  created_at: string | null;
};

export function modelarClientes(rows: ClienteResumoRow[], limite: number): unknown {
  return minimizar(
    rows.slice(0, limite).map((r) => ({
      id: r.id,
      nome: displayNameForSamiQ(r.nome),
      etapa: r.status,
      temperatura: r.temperatura,
      projeto: r.projeto_nome,
      proximo_followup: r.proximo_followup,
      ultima_interacao: r.ultima_interacao,
      origem: r.origem,
      entrou_em: r.created_at,
    })),
  );
}

export type LeadDetalheRow = {
  id: string;
  nome: string | null;
  origem: string | null;
  status: string | null;
  temperatura: string | null;
  projeto_nome: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
  tem_fgts: boolean | null;
  fgts_valor: number | null;
  tipo_renda: string | null;
  faixa_mcmv: string | null;
  proximo_followup: string | null;
  ultima_interacao: string | null;
  visita_data: string | null;
  visita_hora: string | null;
  visita_empreendimento: string | null;
  proxima_acao: string | null;
  objecoes: string[] | null;
  observacoes: string | null;
  motivo_perdido: string | null;
  bairro: string | null;
  zona: string | null;
  created_at: string | null;
};

export type InteracaoRow = {
  tipo: string | null;
  direcao: string | null;
  titulo: string | null;
  conteudo: string | null;
  ocorreu_em: string | null;
};

export type TarefaRow = {
  id: string;
  titulo: string | null;
  tipo: string | null;
  prioridade: string | null;
  status: string | null;
  data_vencimento: string | null;
  lead_id?: string | null;
  lead?: { id: string; nome: string | null } | null;
};

export type AgendamentoRow = {
  id: string;
  tipo: string | null;
  status: string | null;
  titulo: string | null;
  local: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  lead_id?: string | null;
  lead?: { id: string; nome: string | null; projeto_nome?: string | null } | null;
};

export type DocumentoRow = {
  tipo: string | null;
  status: string | null;
  recebido_em: string | null;
  observacoes?: string | null;
};

export function modelarInteracoes(rows: InteracaoRow[], limite = 12): unknown[] {
  return rows.slice(0, limite).map((i) => ({
    em: i.ocorreu_em,
    tipo: i.tipo,
    direcao: i.direcao,
    titulo: redactSamiQFreeText(i.titulo ?? "", 120) || undefined,
    resumo: redactSamiQFreeText(i.conteudo ?? "", 200) || undefined,
  }));
}

export function modelarTarefas(rows: TarefaRow[], limite = 15): unknown {
  return minimizar(
    rows.slice(0, limite).map((t) => ({
      id: t.id,
      titulo: redactSamiQFreeText(t.titulo ?? "", 120) || undefined,
      tipo: t.tipo,
      prioridade: t.prioridade,
      status: t.status,
      vence_em: t.data_vencimento,
      cliente: t.lead
        ? { id: t.lead.id, nome: displayNameForSamiQ(t.lead.nome) }
        : t.lead_id
          ? { id: t.lead_id }
          : undefined,
    })),
  );
}

export function modelarAgendamentos(rows: AgendamentoRow[], limite = 40): unknown {
  return minimizar(
    rows.slice(0, limite).map((a) => ({
      id: a.id,
      tipo: a.tipo,
      status: a.status,
      titulo: redactSamiQFreeText(a.titulo ?? "", 120) || undefined,
      local: redactSamiQFreeText(a.local ?? "", 120) || undefined,
      inicio: a.data_inicio,
      fim: a.data_fim,
      cliente: a.lead
        ? {
            id: a.lead.id,
            nome: displayNameForSamiQ(a.lead.nome),
            projeto: a.lead.projeto_nome ?? undefined,
          }
        : a.lead_id
          ? { id: a.lead_id }
          : undefined,
    })),
  );
}

export function modelarDocumentos(rows: DocumentoRow[]): unknown {
  return minimizar(
    rows.slice(0, MAX_ARRAY).map((d) => ({
      documento: d.tipo,
      status: d.status,
      recebido_em: d.recebido_em,
      observacao: redactSamiQFreeText(d.observacoes ?? "", 120) || undefined,
    })),
  );
}

export function modelarDetalheCliente(args: {
  lead: LeadDetalheRow;
  interacoes: InteracaoRow[];
  tarefas: TarefaRow[];
  agendamentos: AgendamentoRow[];
  documentos: DocumentoRow[];
}): unknown {
  const { lead } = args;
  return minimizar({
    cliente: {
      id: lead.id,
      nome: displayNameForSamiQ(lead.nome),
      origem: lead.origem,
      etapa: lead.status,
      temperatura: lead.temperatura,
      projeto_interesse: lead.projeto_nome,
      renda_informada: lead.renda_informada,
      entrada_disponivel: lead.entrada_disponivel,
      usa_fgts: lead.usa_fgts,
      tem_fgts: lead.tem_fgts,
      fgts_valor: lead.fgts_valor,
      tipo_renda: lead.tipo_renda,
      faixa_mcmv: lead.faixa_mcmv,
      regiao: [lead.bairro, lead.zona].filter(Boolean).join(" / ") || undefined,
      proximo_followup: lead.proximo_followup,
      ultima_interacao: lead.ultima_interacao,
      visita: lead.visita_data
        ? {
            data: lead.visita_data,
            hora: lead.visita_hora,
            empreendimento: lead.visita_empreendimento,
          }
        : undefined,
      proxima_acao: redactSamiQFreeText(lead.proxima_acao ?? "", 160) || undefined,
      objecoes: (lead.objecoes ?? []).slice(0, 10),
      observacoes: redactSamiQFreeText(lead.observacoes ?? "", 400) || undefined,
      motivo_perdido: lead.motivo_perdido ?? undefined,
      entrou_em: lead.created_at,
    },
    ultimas_interacoes: modelarInteracoes(args.interacoes),
    tarefas_abertas: modelarTarefas(args.tarefas, 10),
    compromissos: modelarAgendamentos(args.agendamentos, 5),
    documentos: modelarDocumentos(args.documentos),
  });
}

export type FunilRow = {
  etapa: string;
  quantidade: number;
  followups_vencidos: number | null;
  parados_ha_7_dias: number | null;
  sem_proxima_acao: number | null;
};

export function modelarFunil(rows: FunilRow[]): unknown {
  return rows.slice(0, 20).map((r) => ({
    etapa: r.etapa,
    clientes: r.quantidade,
    followups_vencidos: r.followups_vencidos ?? 0,
    parados_7d: r.parados_ha_7_dias ?? 0,
    sem_proxima_acao: r.sem_proxima_acao ?? 0,
  }));
}

export function modelarFila(inbox: AtendimentoInbox, fila?: QueueKey, limite = 5): unknown {
  const chaves = fila ? [fila] : [...ATENDIMENTO_QUEUE_KEYS];
  return {
    totais: Object.fromEntries(chaves.map((k) => [k, inbox.counts[k] ?? 0])),
    filas: Object.fromEntries(
      chaves.map((k) => [
        k,
        minimizar(
          (inbox.filas[k] ?? []).slice(0, limite).map((item) => ({
            id: item.lead.id,
            nome: displayNameForSamiQ(item.lead.nome),
            etapa: item.lead.status,
            temperatura: item.lead.temperatura,
            projeto: item.lead.projeto_nome,
            score: item.score,
            motivo: item.motivo,
            docs_pendentes: item.docsPendentes || undefined,
            visita_em: item.visitaEm ?? undefined,
          })),
          limite,
        ),
      ]),
    ),
  };
}

export type ProjetoRow = {
  id: string;
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  zona_smq: string | null;
  tipologia: string | null;
  dorms_min: number | null;
  dorms_max: number | null;
  preco_a_partir: number | null;
  renda_minima: number | null;
  status_entrega: string | null;
  ano_entrega: number | null;
  mes_entrega: number | null;
  /** Coluna livre no banco (texto ou lista): só passa por String() e corte. */
  diferenciais: unknown;
};

export function modelarProjetos(rows: ProjetoRow[], limite = 10): unknown {
  // Catálogo é dado PÚBLICO da imobiliária: não passa pela redação de nomes
  // (nomes de empreendimento parecem nomes de pessoa para o regex).
  return rows.slice(0, limite).map((p) => ({
    id: p.id,
    nome: p.nome,
    localizacao: [p.bairro, p.regiao ?? p.zona_smq, p.cidade].filter(Boolean).join(" · "),
    tipologia: p.tipologia,
    dormitorios:
      p.dorms_min != null && p.dorms_max != null && p.dorms_min !== p.dorms_max
        ? `${p.dorms_min} a ${p.dorms_max}`
        : (p.dorms_min ?? p.dorms_max ?? undefined),
    preco_a_partir: p.preco_a_partir,
    renda_minima: p.renda_minima,
    entrega:
      p.status_entrega || p.ano_entrega
        ? [
            p.status_entrega,
            p.mes_entrega && p.ano_entrega ? `${p.mes_entrega}/${p.ano_entrega}` : p.ano_entrega,
          ]
            .filter(Boolean)
            .join(" · ")
        : undefined,
    diferenciais: p.diferenciais
      ? (Array.isArray(p.diferenciais) ? p.diferenciais.join(", ") : String(p.diferenciais)).slice(
          0,
          200,
        )
      : undefined,
  }));
}

// ---------------------------------------------------------------------------
// v8: leituras novas (o que o modelo vê)
// ---------------------------------------------------------------------------

export type MaterialProjetoRow = {
  id: string;
  nome: string | null;
  construtora: string | null;
  endereco: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  zona_smq: string | null;
  tipologia: string | null;
  dorms_min: number | null;
  dorms_max: number | null;
  metragem_min: number | null;
  metragem_max: number | null;
  vagas: string | null;
  preco_a_partir: number | null;
  renda_minima: number | null;
  status_entrega: string | null;
  mes_entrega: number | null;
  ano_entrega: number | null;
  status_preco: string | null;
  disponibilidade_resumo: string | null;
  perfil_ideal: string | null;
  argumentos_venda: string[] | null;
  book_url: string | null;
  tabela_precos_url: string | null;
  tabela_atualizada_em: string | null;
  preco_atualizado_em: string | null;
};

function intervalo(min: number | null, max: number | null, sufixo = ""): string | undefined {
  if (min == null && max == null) return undefined;
  if (min != null && max != null && min !== max) return `${min} a ${max}${sufixo}`;
  return `${min ?? max}${sufixo}`;
}

/** Ficha do empreendimento: dado público da imobiliária (sem redação de nomes). */
export function modelarMaterialProjeto(p: MaterialProjetoRow, agora: Date = new Date()): unknown {
  const ondeFica =
    p.endereco?.trim() ||
    [p.logradouro, p.numero, p.bairro, p.cidade].filter(Boolean).join(", ") ||
    undefined;
  const diasTabela = p.tabela_atualizada_em
    ? Math.floor((agora.getTime() - Date.parse(p.tabela_atualizada_em)) / 86_400_000)
    : null;
  // Do dia 5 em diante só vale a tabela do mês (samiq-tabela.ts). Sem link de
  // tabela não há o que avisar.
  const situacaoTabela = p.tabela_precos_url
    ? situacaoTabelaSamiQ(p.tabela_atualizada_em, agora)
    : null;
  return {
    id: p.id,
    nome: p.nome,
    construtora: p.construtora,
    onde_fica: ondeFica,
    regiao: [p.bairro, p.regiao ?? p.zona_smq].filter(Boolean).join(" · ") || undefined,
    tipologia: p.tipologia,
    dormitorios: intervalo(p.dorms_min, p.dorms_max),
    metragem: intervalo(p.metragem_min, p.metragem_max, " m²"),
    vagas: p.vagas ?? undefined,
    preco_a_partir: p.preco_a_partir,
    renda_minima: p.renda_minima,
    entrega:
      [
        p.status_entrega,
        p.mes_entrega && p.ano_entrega ? `${p.mes_entrega}/${p.ano_entrega}` : p.ano_entrega,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    status_preco: p.status_preco ?? undefined,
    disponibilidade: p.disponibilidade_resumo?.slice(0, 200) || undefined,
    perfil_ideal: p.perfil_ideal?.slice(0, 200) || undefined,
    argumentos: (p.argumentos_venda ?? []).slice(0, 4).map((a) => String(a).slice(0, 160)),
    tem_book: !!p.book_url,
    tem_tabela: !!p.tabela_precos_url,
    tabela_atualizada_em: p.tabela_atualizada_em,
    tabela_dias: diasTabela,
    tabela_situacao: situacaoTabela?.estado,
    aviso_tabela: situacaoTabela ? avisoTabelaSamiQ(situacaoTabela) : undefined,
  };
}

export type AnaliseCreditoRow = {
  status: string | null;
  banco: string | null;
  modalidade: string | null;
  sistema_amortizacao: string | null;
  valor_financiamento: number | null;
  valor_parcela: number | null;
  prazo_meses: number | null;
  taxa_juros_anual: number | null;
  valor_fgts: number | null;
  valor_subsidio: number | null;
  valor_entrada: number | null;
  valor_imovel_simulacao: number | null;
  renda_familiar: number | null;
  faixa_mcmv: string | null;
  data_aprovacao: string | null;
  validade_ate: string | null;
  observacoes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export function modelarCredito(rows: AnaliseCreditoRow[]): unknown {
  if (rows.length === 0) return { analise: null, aviso: "Nenhuma análise de crédito registrada." };
  const [atual, ...anteriores] = rows;
  return {
    analise: minimizar({
      situacao: atual.status,
      banco: atual.banco,
      modalidade: atual.modalidade,
      amortizacao: atual.sistema_amortizacao,
      financiamento: atual.valor_financiamento,
      parcela: atual.valor_parcela,
      prazo_meses: atual.prazo_meses,
      taxa_ano: atual.taxa_juros_anual,
      fgts: atual.valor_fgts,
      subsidio: atual.valor_subsidio,
      entrada: atual.valor_entrada,
      imovel_simulacao: atual.valor_imovel_simulacao,
      renda_familiar: atual.renda_familiar,
      faixa: atual.faixa_mcmv,
      aprovada_em: atual.data_aprovacao,
      validade_ate: atual.validade_ate,
      observacoes: redactSamiQFreeText(atual.observacoes ?? "", 300) || undefined,
      registrada_em: atual.created_at,
      atualizada_em: atual.updated_at,
    }),
    rodadas_anteriores: anteriores.length,
  };
}

export type SituacaoCorretor = {
  presenca: unknown;
  emAtendimento: unknown;
  lote: unknown;
};

/** Situação do corretor (check-in, Em atendimento, lote) em formato curto. */
export function modelarSituacao(s: SituacaoCorretor): unknown {
  const p = (s.presenca ?? {}) as Record<string, unknown>;
  const c = (p.checkin ?? null) as Record<string, unknown> | null;
  const e = (s.emAtendimento ?? {}) as Record<string, unknown>;
  const l = (s.lote ?? {}) as Record<string, unknown>;
  const filiais = Array.isArray(p.filiais)
    ? (p.filiais as Array<Record<string, unknown>>).map((f) => ({ slug: f.slug, nome: f.nome }))
    : undefined;
  return {
    checkin_hoje: c
      ? {
          modo: c.modo,
          filial: c.filial_nome ?? c.filial_slug ?? undefined,
          apto_roleta: c.apto_roleta,
          motivo: c.motivo ?? undefined,
          localizacao: c.localizacao ?? undefined,
          encerrado: !!c.encerrado_em,
        }
      : null,
    presente: p.presente ?? false,
    vendas_mes_anterior: p.vendas_mes_anterior,
    vendas_minimas_para_casa: p.vendas_minimas,
    casa_liberada: p.casa_liberada,
    exige_localizacao_na_filial: p.exige_localizacao,
    filiais,
    em_atendimento: {
      ocupacao: e.em_atendimento,
      teto: e.teto,
      lotado: e.lotado,
      recebe_lead: e.recebe_lead,
      minha_base: e.minha_base,
      teto_base: e.teto_base,
      retorno_max_dias: e.retorno_max_dias,
    },
    lote_prospeccao: {
      pode_pedir: l.pode_pedir,
      motivo: l.motivo ?? undefined,
      vagas: l.vagas ?? undefined,
      regiao: l.regiao ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Telemetria do loop de ferramentas (D17)
// ---------------------------------------------------------------------------

/** Recorte mínimo do StepResult do AI SDK que a contagem precisa. */
export type PassoSamiQ = {
  content: ReadonlyArray<{ type: string; toolName?: string }>;
};

export type TelemetriaFerramentas = {
  chamadas: number;
  erros: number;
  /** Nomes únicos, na ordem em que foram chamadas (para o chip da UI). */
  nomes: string[];
};

export function contarFerramentasSamiQ(passos: ReadonlyArray<PassoSamiQ>): TelemetriaFerramentas {
  let chamadas = 0;
  let erros = 0;
  const nomes: string[] = [];
  for (const passo of passos) {
    for (const parte of passo.content) {
      if (parte.type === "tool-call") {
        chamadas += 1;
        if (parte.toolName && !nomes.includes(parte.toolName)) nomes.push(parte.toolName);
      } else if (parte.type === "tool-error") {
        erros += 1;
      }
    }
  }
  return { chamadas: Math.min(chamadas, 100), erros: Math.min(erros, 100), nomes };
}

const FALLBACK_PATTERN = /^\s*["“']?n[ãa]o consegui/i;

/**
 * Fallback = a Sami não entregou resposta útil: texto vazio (o loop parou no
 * teto de passos ainda chamando ferramenta) ou a abertura combinada no system
 * prompt ("Não consegui …"). É a métrica de 0,4% da Elô.
 */
export function detectarFallbackSamiQ(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo) return true;
  return FALLBACK_PATTERN.test(limpo);
}

/** Texto que o painel mostra quando o loop terminou sem resposta final. */
export const SAMIQ_TEXTO_SEM_RESPOSTA =
  "Não consegui fechar uma resposta com as consultas que fiz. Tente perguntar de forma mais específica (por exemplo, o nome do cliente ou o período da agenda).";
