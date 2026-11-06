// Devolver ao Marquinhos (migration 20261106120000) — lógica pura.
//
// "Um número, uma voz": o 4099 é sempre o Marquinhos e o corretor fala do
// próprio WhatsApp. Depois do handoff o corretor pode devolver o cliente ao
// robô com UM objetivo fechado. Este módulo é a fonte única do que cada
// objetivo significa: o rótulo que o corretor vê, a missão que o n8n injeta
// no prompt do Marquinhos e a abertura sugerida para o cliente — a tela e o
// despacho do servidor leem daqui, então uma mudança de texto vale nos dois.

export const OBJETIVOS_DEVOLUCAO = [
  "remarcar_visita",
  "recolher_documentos",
  "tirar_duvidas",
] as const;
export type ObjetivoDevolucao = (typeof OBJETIVOS_DEVOLUCAO)[number];

export const STATUS_DEVOLUCAO = [
  "pendente",
  "com_marquinhos",
  "concluida",
  "cancelada",
  "falhou",
] as const;
export type StatusDevolucao = (typeof STATUS_DEVOLUCAO)[number];

export const DESFECHOS_DEVOLUCAO = [
  "objetivo_cumprido",
  "sem_resposta",
  "precisa_corretor",
] as const;
export type DesfechoDevolucao = (typeof DESFECHOS_DEVOLUCAO)[number];

export const OBSERVACAO_MAX = 500;

type DefinicaoObjetivo = {
  /** O botão/opção que o corretor escolhe. */
  rotulo: string;
  /** O que o Marquinhos vai fazer, dito ao corretor antes de confirmar. */
  oQueFaz: string;
  /** Exemplo de recado no campo opcional. */
  exemploRecado: string;
  /** Instrução ao Marquinhos (o n8n injeta no input do agente). */
  missao: string;
  /** Primeira mensagem sugerida ao cliente (dentro da janela de 24h). */
  abertura: string;
};

const OBJETIVOS: Record<ObjetivoDevolucao, DefinicaoObjetivo> = {
  remarcar_visita: {
    rotulo: "Cliente pediu para remarcar",
    oQueFaz: "Combina o novo dia e horário da visita e te devolve com a data confirmada.",
    exemploRecado: "Ex.: só consegue sábado; prefere o estande do Playball",
    missao:
      "Ajude o cliente a REMARCAR a visita. Peça o dia e o horário que ele consegue, confirme dia, hora e empreendimento numa mensagem só e encerre com desfecho objetivo_cumprido, com a nova data no resultado. Não reabra a qualificação nem ofereça outros empreendimentos.",
    abertura:
      "Oi, {cliente}! Aqui é o Marquinhos, assistente da Seu Metro Quadrado. {corretor} me pediu pra te ajudar a remarcar a visita 😊 Qual dia e horário ficam bons pra você?",
  },
  recolher_documentos: {
    rotulo: "Tentar recolher a documentação",
    oQueFaz:
      "Pede os documentos um por vez, confirma cada arquivo e te avisa quando a pasta fechar.",
    exemploRecado: "Ex.: falta o holerite de setembro e o comprovante de residência",
    missao:
      "Recolha a documentação que falta, UM documento por vez, seguindo a régua de documentos do seu prompt. Encerre com objetivo_cumprido quando a pasta fechar. Se o cliente resistir duas vezes, não insista: encerre com precisa_corretor e diga no resultado o que ele falou.",
    abertura:
      "Oi, {cliente}! Aqui é o Marquinhos, assistente da Seu Metro Quadrado. {corretor} me pediu pra te ajudar com a documentação da análise. Posso te dizer o que falta?",
  },
  tirar_duvidas: {
    rotulo: "Tirar dúvidas do cliente",
    oQueFaz:
      "Responde com a ficha do empreendimento. Preço, desconto e negociação voltam para você.",
    exemploRecado: "Ex.: quer saber a entrega e se aceita FGTS na entrada",
    missao:
      "Tire as dúvidas do cliente usando a ficha do empreendimento. Preço fora da tabela, desconto, condição especial ou negociação NÃO são com você: encerre com precisa_corretor, dizendo no resultado o que ele pediu. Encerre com objetivo_cumprido quando ele disser que não tem mais dúvidas.",
    abertura:
      "Oi, {cliente}! Aqui é o Marquinhos, assistente da Seu Metro Quadrado. {corretor} me pediu pra tirar suas dúvidas por aqui 😊 O que você quer saber?",
  },
};

/** Regras que valem para qualquer objetivo (vão junto da missão). */
const REGRAS_COMUNS =
  "Você está atendendo a pedido do consultor {corretor}, que continua sendo o consultor do cliente: diga isso na primeira mensagem e nunca se passe por ele. Ao encerrar, avise o cliente que {corretor} segue com ele pelo WhatsApp dele. Se o cliente não responder, encerre com sem_resposta.";

export function definicaoObjetivo(objetivo: ObjetivoDevolucao): DefinicaoObjetivo {
  return OBJETIVOS[objetivo];
}

export function isObjetivoDevolucao(v: unknown): v is ObjetivoDevolucao {
  return typeof v === "string" && (OBJETIVOS_DEVOLUCAO as readonly string[]).includes(v);
}

export function isStatusDevolucao(v: unknown): v is StatusDevolucao {
  return typeof v === "string" && (STATUS_DEVOLUCAO as readonly string[]).includes(v);
}

/** Primeiro nome legível ("Ana Souza" → "Ana"); vazio → alternativa. */
export function primeiroNome(nome: string | null | undefined, alternativa: string): string {
  const p = (nome ?? "").trim().split(/\s+/)[0];
  return p ? p : alternativa;
}

function preencher(modelo: string, cliente: string, corretor: string): string {
  return modelo.replaceAll("{cliente}", cliente).replaceAll("{corretor}", corretor);
}

/** O que o CRM manda ao n8n (webhook) para cada item da fila. */
export type PedidoN8n =
  | {
      acao: "devolver";
      devolucao_id: string;
      lead_id: string;
      telefone: string;
      objetivo: ObjetivoDevolucao;
      objetivo_rotulo: string;
      cliente_nome: string;
      corretor_nome: string;
      recado_do_corretor: string | null;
      missao: string;
      abertura_sugerida: string;
      tentativa: number;
    }
  | {
      acao: "retomar";
      devolucao_id: string;
      lead_id: string;
      telefone: string;
      corretor_nome: string;
      tentativa: number;
    };

export type ItemFila = {
  id: string;
  acao: string;
  lead_id: string;
  telefone: string;
  objetivo: string;
  observacao: string | null;
  cliente_nome: string | null;
  corretor_nome: string | null;
  tentativa: number;
};

/** Monta o corpo do webhook; item com ação/objetivo desconhecido → null. */
export function montarPedidoN8n(item: ItemFila): PedidoN8n | null {
  const corretor = primeiroNome(item.corretor_nome, "seu consultor");
  if (item.acao === "retomar") {
    return {
      acao: "retomar",
      devolucao_id: item.id,
      lead_id: item.lead_id,
      telefone: item.telefone,
      corretor_nome: corretor,
      tentativa: item.tentativa,
    };
  }
  if (item.acao !== "devolver" || !isObjetivoDevolucao(item.objetivo)) return null;
  const def = OBJETIVOS[item.objetivo];
  const cliente = primeiroNome(item.cliente_nome, "tudo bem");
  const recado = item.observacao?.trim() || null;
  const missao = [
    preencher(def.missao, cliente, corretor),
    preencher(REGRAS_COMUNS, cliente, corretor),
    recado ? `Recado do consultor: ${recado}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    acao: "devolver",
    devolucao_id: item.id,
    lead_id: item.lead_id,
    telefone: item.telefone,
    objetivo: item.objetivo,
    objetivo_rotulo: def.rotulo,
    cliente_nome: cliente,
    corretor_nome: corretor,
    recado_do_corretor: recado,
    missao,
    abertura_sugerida: preencher(def.abertura, cliente, corretor),
    tentativa: item.tentativa,
  };
}

/** A devolução como a tela lê (linha da tabela, recorte de colunas). */
export type Devolucao = {
  id: string;
  lead_id: string;
  objetivo: ObjetivoDevolucao;
  observacao: string | null;
  status: StatusDevolucao;
  envio_pendente: "devolver" | "retomar" | null;
  ultimo_erro: string | null;
  enviado_em: string | null;
  encerrado_em: string | null;
  desfecho: DesfechoDevolucao | null;
  resultado: string | null;
  criado_em: string;
};

export function devolucaoAtiva(d: Pick<Devolucao, "status"> | null | undefined): boolean {
  return !!d && (d.status === "pendente" || d.status === "com_marquinhos");
}

/** Uma linha honesta do estado, para o cartão da conversa. */
export function resumoEstado(d: Devolucao): string {
  const rotulo = OBJETIVOS[d.objetivo]?.rotulo ?? "devolução";
  if (d.status === "pendente") {
    return d.envio_pendente === "retomar"
      ? "Retomando: avisando o Marquinhos para parar."
      : `Enviando ao Marquinhos · ${rotulo}`;
  }
  if (d.status === "com_marquinhos") {
    return d.envio_pendente === "retomar"
      ? "Retomando: avisando o Marquinhos para parar."
      : `Com o Marquinhos · ${rotulo}`;
  }
  if (d.status === "concluida") {
    const fim =
      d.desfecho === "objetivo_cumprido"
        ? "concluiu"
        : d.desfecho === "sem_resposta"
          ? "não teve resposta do cliente"
          : "precisa de você";
    return `Marquinhos ${fim} · ${rotulo}`;
  }
  if (d.status === "falhou") return "Não chegou ao Marquinhos: o atendimento continua com você.";
  return "Você retomou o atendimento.";
}

/** Erros das RPCs (mensagem em português do banco) → texto para o toast. */
export function mensagemErroDevolucao(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (/marquinhos_devol|function .* does not exist|PGRST202/i.test(msg)) {
    return "Devolver ao Marquinhos ainda não está disponível neste ambiente (migração pendente).";
  }
  return msg.trim() || "Não foi possível falar com o Marquinhos agora. Tente de novo.";
}
