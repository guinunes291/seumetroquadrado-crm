// Sami — catálogo das ferramentas de LEITURA: nomes, rótulos, contratos de
// entrada (zod), grupos que o modelo abre e as descrições que ele lê.
// Recortado de samiq-tools.ts sem mudança de comportamento.

import { z } from "zod";
import { ATENDIMENTO_QUEUE_KEYS } from "@/features/atendimento/inbox";

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

export const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

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
