// Sami — as ferramentas do turno: leitura (RLS), skills, ações (proposta ou
// execução imediata por risco), controle da fila da conversa e
// abrir_ferramentas, com os grupos abertos pela mensagem.
// Recortado de samiq-core.server.ts sem mudança de comportamento.

import { tool, type ToolSet } from "ai";
import type { MapaPiiCorretor } from "@/lib/samiq-governance";
import type { SamiQCanal, SamiQInput } from "@/lib/samiq";
import {
  AbrirFerramentasInput,
  SAMIQ_TOOL_DESCRIPTIONS,
  type GrupoFerramentas,
} from "@/lib/samiq-tools";
import type { ModoEscritaSamiQ } from "@/lib/samiq-propostas";
import type { ExecutorImediato, PropostaColetada } from "@/lib/samiq-propostas.server";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import { compatibilizarFerramentasSamiQ } from "@/lib/samiq-ferramentas-compat";
import { ferramentasAtivas, gruposPelaMensagem } from "@/lib/samiq-grupos";
import { anotarAmbiguos, type AmbiguosDoTurno } from "@/lib/samiq-contexto";
import type { AcaoExecutada } from "./samiq-acoes.server";
import type { ControleDoTurno } from "./samiq-controle.server";
import {
  FERRAMENTAS_DE_CONTROLE,
  type Db,
  type LocalizacaoDoTurno,
  type RecentesDaConversa,
  type ResponderSamiQArgs,
} from "./samiq-core-config";

export async function montarFerramentasDoTurno({
  supabase,
  userId,
  agora,
  mapaPii,
  citar,
  reservation,
  args,
  coletor,
  textoDoCorretor,
  data,
  liberados,
  ambiguos,
  canal,
  recentes,
  contextoExecucao,
  controle,
  historicoSeguro,
  perguntaSegura,
  localizacao,
}: {
  supabase: Db;
  userId: string;
  agora: Date;
  mapaPii: MapaPiiCorretor;
  citar: CitarClienteSamiQ;
  reservation: { executionId: string; propostasEnabled: boolean };
  args: ResponderSamiQArgs;
  coletor: PropostaColetada[];
  textoDoCorretor: string;
  data: SamiQInput;
  liberados: Set<string> | undefined;
  ambiguos: AmbiguosDoTurno;
  canal: SamiQCanal;
  recentes: RecentesDaConversa;
  contextoExecucao: {
    localizacao: { latitude: number; longitude: number; precisao: number | null } | null;
  };
  controle: ControleDoTurno;
  historicoSeguro: Array<{ role: "user" | "assistant"; content: string }>;
  perguntaSegura: string;
  localizacao: LocalizacaoDoTurno | null;
}): Promise<{
  ferramentas: ReturnType<typeof compatibilizarFerramentasSamiQ>;
  ativas: () => string[];
  executadas: AcaoExecutada[] | null;
}> {
  // Ações gravadas na hora (só no modo por risco): quem chama guarda a lista.
  let executadas: AcaoExecutada[] | null = null;
  const { criarFerramentasSamiQ } = await import("./samiq-tools.server");
  const tools: ToolSet = criarFerramentasSamiQ({ supabase, userId, agora, mapaPii, citar });
  // Onda S5 (D16): skills determinísticas, também só de leitura.
  const { criarFerramentasDeSkillsSamiQ } = await import("./samiq-skills.server");
  Object.assign(tools, criarFerramentasDeSkillsSamiQ({ supabase, userId }));
  if (reservation.propostasEnabled) {
    const modo: ModoEscritaSamiQ = args.modoEscrita ?? "confirmar_tudo";
    let executarAgora: ExecutorImediato | undefined;
    if (modo === "por_risco") {
      const { criarExecucaoImediata } = await import("./samiq-acoes.server");
      const execucao = criarExecucaoImediata({
        supabase,
        userId,
        executionId: reservation.executionId,
        contexto: contextoExecucao,
      });
      executarAgora = execucao.executar;
      executadas = execucao.executadas;
    }
    const { criarFerramentasDePropostaSamiQ } = await import("./samiq-propostas.server");
    Object.assign(
      tools,
      criarFerramentasDePropostaSamiQ({
        supabase,
        userId,
        coletor,
        modo,
        executarAgora,
        textoDoCorretor,
        leadIdEmContexto: data.leadId,
        liberados,
        aoAmbiguo: (ids) => anotarAmbiguos(ambiguos, ids),
        mapaPii,
        citar,
        agora,
      }),
    );
    if (canal === "whatsapp" && (recentes.pendentes.length > 0 || recentes.executadas.length > 0)) {
      const { criarFerramentasDeControleSamiQ } = await import("./samiq-controle.server");
      Object.assign(
        tools,
        criarFerramentasDeControleSamiQ({
          supabase,
          userId,
          textoDoCorretor: data.pergunta ?? "",
          pendentes: recentes.pendentes,
          executadas: recentes.executadas,
          contexto: contextoExecucao,
          registro: controle,
          agora,
        }),
      );
    }
  }

  // Ferramentas por intenção: a mensagem escolhe os grupos do 1º passo e o
  // modelo abre outros com abrir_ferramentas (economia de ~70% de tokens).
  const ultimaDaSami = [...historicoSeguro].reverse().find((m) => m.role === "assistant")?.content;
  const gruposAbertos = new Set<GrupoFerramentas>(
    gruposPelaMensagem({
      texto: perguntaSegura,
      contextoRecente: ultimaDaSami,
      temAnexo: (args.anexos?.length ?? 0) > 0,
      temLocalizacao: !!localizacao,
      temTelefone: Object.keys(mapaPii).some((k) => k.startsWith("[TELEFONE_")),
    }),
  );
  tools.abrir_ferramentas = tool({
    description: SAMIQ_TOOL_DESCRIPTIONS.abrir_ferramentas,
    inputSchema: AbrirFerramentasInput,
    execute: async ({ grupos }) => {
      for (const g of grupos) gruposAbertos.add(g);
      return {
        abertos: [...gruposAbertos],
        aviso: "As ferramentas desses grupos ficam disponíveis a partir do próximo passo.",
      };
    },
  });

  // Schemas no menor denominador comum: o gateway não pode rejeitar a
  // chamada por "$schema", "format: uuid" ou "additionalProperties".
  const ferramentas = compatibilizarFerramentasSamiQ(tools);
  const disponiveis = new Set(Object.keys(ferramentas));
  const ativas = () => [
    ...ferramentasAtivas(gruposAbertos, disponiveis),
    ...FERRAMENTAS_DE_CONTROLE.filter((n) => disponiveis.has(n)),
  ];

  return { ferramentas, ativas, executadas };
}
