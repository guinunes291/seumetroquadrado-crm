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

export const SAMIQ_TOOL_NAMES = [
  "buscar_clientes",
  "detalhe_cliente",
  "minha_agenda",
  "minhas_tarefas",
  "meu_funil",
  "minha_fila",
  "documentos_do_cliente",
  "catalogo_projetos",
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
  regiao: z.string().max(60).optional().describe("Região, zona ou bairro (busca parcial)"),
  dorms: z.number().int().min(1).max(5).optional().describe("Quantidade de dormitórios"),
  preco_max: z.number().positive().optional().describe("Preço máximo em reais"),
  limite: z.number().int().min(1).max(15).optional().describe("Padrão 10"),
});

/** Descrições em PT-BR — é o que o modelo lê para decidir quando chamar. */
export const SAMIQ_TOOL_DESCRIPTIONS: Record<SamiQToolName, string> = {
  buscar_clientes:
    "Procura clientes na carteira do corretor pelo nome ou pelo empreendimento de interesse. Devolve id, nome, etapa, temperatura e datas-chave. Use antes de detalhe_cliente quando só tiver o nome.",
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
    "Empreendimentos ativos da SMQ com região, tipologia, dormitórios, preço a partir de e renda mínima. Filtre por região, dormitórios ou preço máximo.",
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

/** Termo de busca seguro para o filtro `.or()` do PostgREST (vírgula e
 *  parênteses são sintaxe; `%`/`*` são curingas que o modelo não controla). */
export function termoBuscaSamiQ(termo: string): string {
  return termo
    .replace(/[,()%*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
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
