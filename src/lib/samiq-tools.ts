// Núcleo PURO das ferramentas de LEITURA da Sami (Onda S1 — decisões D9/D10
// em docs/samiq/2026-09-05-decisoes-copiloto.md). Aqui vivem o catálogo
// (nomes, rótulos, contratos zod), a modelagem dos resultados que vão para o
// modelo (só campos seguros, com PII redigida) e as regras de telemetria
// (contar chamadas/erros por passo, detectar fallback). Sem rede nem Supabase:
// a execução com o banco fica em samiq-tools.server.ts.
//
// Doutrina: toda ferramenta LÊ; nenhuma grava. A escrita (Onda S2) entra por
// propostas confirmadas pelo corretor, nunca por aqui.
//
// Desde a quebra em módulos (2026-10): catálogo e contratos em
// samiq-tools-catalogo.ts, datas e busca em samiq-tools-busca.ts e a
// modelagem em samiq-tools-modelos.ts (cliente) e
// samiq-tools-modelos-projeto.ts (empreendimento, crédito, situação). Aqui
// fica a telemetria do loop e a reexportação de tudo.

export {
  SAMIQ_TOOL_NAMES,
  SAMIQ_TOOL_LABELS,
  isSamiQToolName,
  BuscarClientesInput,
  DetalheClienteInput,
  MinhaAgendaInput,
  MinhasTarefasInput,
  MeuFunilInput,
  MinhaFilaInput,
  DocumentosDoClienteInput,
  CatalogoProjetosInput,
  ListarClientesInput,
  MinhaSituacaoInput,
  MaterialDoProjetoInput,
  CreditoDoClienteInput,
  GRUPOS_FERRAMENTAS,
  AbrirFerramentasInput,
  SAMIQ_TOOL_DESCRIPTIONS,
} from "./samiq-tools-catalogo";
export type { SamiQToolName, GrupoFerramentas } from "./samiq-tools-catalogo";

export {
  SAMIQ_FUSO,
  MAX_DIAS_AGENDA,
  hojeSaoPaulo,
  intervaloAgendaSamiQ,
  separarTermoBuscaSamiQ,
  termoBuscaSamiQ,
  termoSemAcentoSamiQ,
} from "./samiq-tools-busca";

export {
  modelarClientes,
  modelarInteracoes,
  modelarTarefas,
  modelarAgendamentos,
  modelarDocumentos,
  modelarDetalheCliente,
  modelarFunil,
  modelarFila,
} from "./samiq-tools-modelos";
export type {
  ClienteResumoRow,
  LeadDetalheRow,
  InteracaoRow,
  TarefaRow,
  AgendamentoRow,
  DocumentoRow,
  FunilRow,
} from "./samiq-tools-modelos";

export {
  modelarProjetos,
  modelarMaterialProjeto,
  modelarCredito,
  modelarSituacao,
} from "./samiq-tools-modelos-projeto";
export type {
  ProjetoRow,
  MaterialProjetoRow,
  AnaliseCreditoRow,
  SituacaoCorretor,
} from "./samiq-tools-modelos-projeto";

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
