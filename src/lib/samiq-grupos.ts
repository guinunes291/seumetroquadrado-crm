// Ferramentas por intenção (v8) — PURO.
//
// Com o CRM inteiro no WhatsApp a Sami tem mais de 40 ferramentas. Mandar
// todas em cada passo custa ~17 mil tokens só de schema (a cota de 1 milhão
// por corretor viraria ~25 mensagens por dia). Aqui a mensagem do corretor
// escolhe os GRUPOS que entram no primeiro passo; o modelo abre outros com
// `abrir_ferramentas` quando precisar. Errar para mais é barato (um grupo a
// mais); errar para menos custa um passo (o modelo abre o grupo).

import type { GrupoFerramentas } from "@/lib/samiq-tools";

/** Sempre ativas: achar o cliente, os registros do dia a dia e o botão de abrir grupos. */
export const FERRAMENTAS_BASE = [
  "buscar_clientes",
  "detalhe_cliente",
  "abrir_ferramentas",
  "registrar_contato",
  "anotar",
  "criar_tarefa",
] as const;

export const FERRAMENTAS_POR_GRUPO: Record<GrupoFerramentas, readonly string[]> = {
  carteira: [
    "listar_clientes",
    "minha_fila",
    "meu_funil",
    "minha_situacao",
    "minhas_tarefas",
    "minha_agenda",
  ],
  agenda: [
    "minha_agenda",
    "agendar_visita",
    "confirmar_visita",
    "remarcar_visita",
    "cancelar_visita",
    "registrar_visita",
    "preparar_visita",
    "material_do_projeto",
  ],
  tarefas: ["minhas_tarefas", "concluir_tarefa", "reagendar_tarefa", "cancelar_tarefa"],
  funil: [
    "registrar_retorno",
    "marcar_perdido",
    "trocar_vaga",
    "mudar_etapa",
    "listar_clientes",
    "minha_situacao",
  ],
  qualificacao: ["atualizar_qualificacao", "avaliar_qualificacao", "pre_analise_mcmv"],
  produtos: ["catalogo_projetos", "material_do_projeto", "curar_estoque", "pre_analise_mcmv"],
  documentos: [
    "documentos_do_cliente",
    "documentos_checklist",
    "atualizar_documento",
    "anexar_documento",
  ],
  credito: [
    "credito_do_cliente",
    "enviar_analise_credito",
    "registrar_resultado_credito",
    "pre_analise_mcmv",
    "documentos_do_cliente",
  ],
  venda: ["registrar_venda", "credito_do_cliente", "catalogo_projetos", "material_do_projeto"],
  presenca: ["minha_situacao", "fazer_checkin"],
  prospeccao: ["criar_lead", "pedir_lote", "minha_situacao"],
};

/** Quando a mensagem não dá pista nenhuma: o que mais aparece no dia a dia. */
export const GRUPOS_PADRAO: readonly GrupoFerramentas[] = [
  "carteira",
  "agenda",
  "tarefas",
  "qualificacao",
];

function normalizar(texto: string): string {
  return (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Pistas por grupo (texto já sem acento). Ordem não importa: todos que casam entram.
const PISTAS: Array<[GrupoFerramentas, RegExp]> = [
  [
    "agenda",
    /\b(visita|visitar|agend|remarc|reagend|desmarc|estande|plantao|compareceu|nao veio|furou|veio na|foi na visita|confirm(ou|ar|a) (a |o )?(visita|horario)|agenda)/,
  ],
  [
    "agenda",
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|hoje)\b.{0,20}\b\d{1,2}(h|:\d{2})/,
  ],
  [
    "tarefas",
    /\b(tarefa|lembr|follow|pendenc|atrasad|vencid|conclu|ja fiz|feito|cancela a tarefa|adia|adiar)/,
  ],
  [
    "funil",
    /\b(etapa|perd|desist|sem interesse|nao quer|esfri|pediu (pra |para )?(retornar|retorno|ligar)|retorn|lotad|65|vaga|qualificacao|mover|passa (ele|ela|o|a) pra)/,
  ],
  [
    "qualificacao",
    /\b(renda|salario|ganha|clt|registrad|autonom|informal|fgts|entrada|subsidio|faixa|quente|frio|morno|temperatura|perfil|dorm|quarto|garagem|decisor|esposa|marido|noiv|casad|solteir|objec|filho|pet|metro)/,
  ],
  [
    "produtos",
    /\b(empreendimento|projeto|book|tabela|planta|endereco|preco|valor do|unidade|estoque|opcoes|opcao|lancamento|construtora|cury|vibra|trisul|plano|mrv|vivaz|direcional|tenda|novvo|elev|well|parque|jardim|reserva|metragem)/,
  ],
  [
    "documentos",
    /\b(document|docs?\b|rg\b|cnh|cpf|holerite|contracheque|comprovante|extrato|pasta|ctps|carteira de trabalho|imposto|declaracao|anex|foto|pdf|certidao|decore)/,
  ],
  [
    "credito",
    /\b(credito|analise|aprov|reprov|correspondente|caixa|banco|simulac|sicaq|siric|carta|financiamento|parcela)/,
  ],
  ["venda", /\b(vend(i|eu|a)|fech(ou|ei|amos|amento)|contrato|assin|ato pago|repasse|comissao)/],
  [
    "presenca",
    /\b(check|presen|cheguei|to na|estou na|barra funda|liberdade|belem|em casa|roleta|nao recebi lead|nao (to|estou) recebendo|sai(ndo)? (agora|do plantao)|fui embora)/,
  ],
  [
    "prospeccao",
    /\b(lead novo|cadastr|novo cliente|indicacao|indicou|captei|captacao|lote|prospec|base nova|pedir leads?|mais leads)/,
  ],
  [
    "carteira",
    /\b(fila|quem (eu )?ligo|prioridad|meu dia|resumo|funil|carteira|meus clientes|quantos|parad|esfriando|lista|quem falta|o que tenho)/,
  ],
];

/**
 * Grupos do primeiro passo a partir do que o corretor escreveu (e do que a
 * Sami acabou de perguntar, para "sim, pode" continuar no mesmo assunto).
 * Arquivo recebido abre documentos; localização abre presença.
 */
export function gruposPelaMensagem(args: {
  texto: string;
  contextoRecente?: string;
  temAnexo?: boolean;
  temLocalizacao?: boolean;
}): GrupoFerramentas[] {
  const alvo = normalizar(`${args.texto}\n${args.contextoRecente ?? ""}`);
  const grupos = new Set<GrupoFerramentas>();
  for (const [grupo, re] of PISTAS) if (re.test(alvo)) grupos.add(grupo);
  if (args.temAnexo) grupos.add("documentos");
  if (args.temLocalizacao) grupos.add("presenca");
  if (grupos.size === 0) for (const g of GRUPOS_PADRAO) grupos.add(g);
  return [...grupos];
}

/** Nomes ativos para o passo: base + grupos, só os que existem no catálogo montado. */
export function ferramentasAtivas(
  grupos: Iterable<GrupoFerramentas>,
  disponiveis: ReadonlySet<string>,
): string[] {
  const nomes = new Set<string>(FERRAMENTAS_BASE);
  for (const g of grupos) for (const n of FERRAMENTAS_POR_GRUPO[g] ?? []) nomes.add(n);
  return [...nomes].filter((n) => disponiveis.has(n));
}
