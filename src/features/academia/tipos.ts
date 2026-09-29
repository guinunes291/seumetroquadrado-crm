// Tipos da Academia SMQ. A fonte é types.ts, gerado do banco pelo Lovable.
// Aqui ficam só os apelidos e o que o gerador não sabe dizer:
//   - texto que um CHECK fecha numa lista (o gerador devolve `string`);
//   - colunas de view que nunca vêm nulas (o gerador marca toda coluna de
//     view como `| null`);
//   - retornos jsonb das RPCs (o gerador devolve `Json`).
// Nas leituras, o resultado é estreitado uma vez, na fronteira dos hooks
// (academia-client.ts, gestao/gestao-client.ts, selo-habilitado.tsx).

import type { Enums, Json, Tables } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Enums do banco
// ---------------------------------------------------------------------------

/** Nível na trilha. NÃO é o "Apto" da roleta v2 (onboarding_concluido_em). */
export type AcademiaNivel = Enums<"academia_nivel">;
export type AcademiaStatusConteudo = Enums<"academia_status_conteudo">;
export type AcademiaTipoAula = Enums<"academia_tipo_aula">;
export type AcademiaStatusPratica = Enums<"academia_status_pratica">;
export type AcademiaStatusRecomendacao = Enums<"academia_status_recomendacao">;

// ---------------------------------------------------------------------------
// Texto fechado por CHECK
// ---------------------------------------------------------------------------

/** Origem da atribuição. 'integracao' é a fase 0: a palavra "onboarding" já
 *  quer dizer outra coisa no CRM (o gate da roleta). */
export type AcademiaOrigemAtribuicao = "gestor" | "recomendacao" | "integracao" | "nova_versao";

export type AcademiaTipoEncontro =
  | "roleplay_diario"
  | "maratona_objecoes"
  | "credito_quinzenal"
  | "revisao_mensal"
  | "integracao"
  | "construtora"
  | "outro";

export type AcademiaDirecaoRegra = "menor_e_pior" | "maior_e_pior";
export type AcademiaSituacaoGate = "habilitado" | "nao_habilitado" | "fora_da_academia";

// ---------------------------------------------------------------------------
// Tabelas iguais ao banco
// ---------------------------------------------------------------------------

export type AcademiaFaseRow = Tables<"academia_fases">;
/** `revisao_pendente` não nulo: academia_publicar_modulo recusa publicar. */
export type AcademiaModuloRow = Tables<"academia_modulos">;
export type AcademiaAulaRow = Tables<"academia_aulas">;
/** Gabarito. Só admin lê esta tabela: o aluno recebe as questões sem
 *  `correta` por academia_quiz_iniciar e o gabarito só no envio. */
export type AcademiaQuestaoRow = Tables<"academia_questoes">;
export type AcademiaParticipanteRow = Tables<"academia_participantes">;
export type AcademiaNivelHistoricoRow = Tables<"academia_niveis_historico">;
export type AcademiaProgressoAulaRow = Tables<"academia_progresso_aulas">;
export type AcademiaTentativaRow = Tables<"academia_tentativas">;
export type AcademiaCertificadoRow = Tables<"academia_certificados">;
/** O aluno NÃO lê esta tabela: número individual chega como recomendação de
 *  módulo, não como placar. */
export type AcademiaIndicadorRow = Tables<"academia_indicadores">;
export type AcademiaRecomendacaoRow = Tables<"academia_recomendacoes">;
export type AcademiaPresencaRow = Tables<"academia_presencas">;

// ---------------------------------------------------------------------------
// Tabelas com texto fechado (o resto das colunas vem do banco)
// ---------------------------------------------------------------------------

export type AcademiaConfigRow = Omit<
  Tables<"academia_config">,
  "recomendacao_modo" | "gate_roleta_modo"
> & {
  recomendacao_modo: "desligado" | "sombra" | "ativo";
  /** 'ativo' não é aceito pelo CHECK: ligar o gate exige migration revisada. */
  gate_roleta_modo: "desligado" | "sombra";
};

export type AcademiaPraticaRow = Omit<Tables<"academia_praticas">, "origem"> & {
  origem: "envio" | "roleplay_presencial";
};

export type AcademiaAtribuicaoRow = Omit<Tables<"academia_atribuicoes">, "origem"> & {
  origem: AcademiaOrigemAtribuicao;
};

export type AcademiaRegraRecomendacaoRow = Omit<
  Tables<"academia_regras_recomendacao">,
  "direcao"
> & {
  direcao: AcademiaDirecaoRegra;
};

export type AcademiaEncontroRow = Omit<Tables<"academia_encontros">, "tipo"> & {
  tipo: AcademiaTipoEncontro;
};

// ---------------------------------------------------------------------------
// Views: o gerador marca toda coluna como nullable; estas nunca vêm nulas
// ---------------------------------------------------------------------------

export type AcademiaModuloStatusRow = {
  corretor_id: string;
  modulo_id: string;
  codigo: string;
  fase: number;
  numero: number;
  titulo: string;
  obrigatorio: boolean;
  exige_pratica: boolean;
  aulas_total: number;
  aulas_feitas: number;
  melhor_nota: number | null;
  quiz_aprovado: boolean;
  tentativas: number;
  pratica_status: "dispensada" | "aprovada" | "pendente" | "refazer" | "nao_enviada";
  concluido: boolean;
  concluido_em: string | null;
  prazo_em: string | null;
  ultima_atividade: string | null;
};

export type AcademiaFaseStatusRow = {
  corretor_id: string;
  fase: number;
  obrigatorios: number;
  concluidos: number;
  completa: boolean;
};

export type AcademiaCorretorResumoRow = {
  corretor_id: string;
  corretor_nome: string;
  participa: boolean;
  inicio_trilha: string;
  nivel: AcademiaNivel;
  habilitado_override: boolean | null;
  habilitado: boolean;
  modulos_concluidos: number;
  modulos_obrigatorios: number;
  modulos_atrasados: number;
  praticas_pendentes: number;
  ultima_atividade: string | null;
};

/** Antes (a janela que disparou a recomendação) x depois (a mesma janela
 *  contada da conclusão do módulo). `valor_depois` nulo = janela ainda aberta. */
export type AcademiaEfeitoRow = {
  recomendacao_id: string;
  corretor_id: string;
  regra_codigo: string;
  indicador: string;
  direcao: AcademiaDirecaoRegra;
  janela_dias: number;
  modulo_id: string;
  modulo_codigo: string | null;
  modulo_titulo: string | null;
  data_antes: string;
  valor_antes: number | null;
  referencia_antes: number | null;
  amostra_antes: number | null;
  concluida_em: string;
  data_depois: string;
  valor_depois: number | null;
  referencia_depois: number | null;
  amostra_depois: number | null;
};

/** Uma linha por corretor que recebeu lead nos últimos 30 dias. */
export type AcademiaGateSombraRow = {
  corretor_id: string;
  corretor_nome: string | null;
  situacao: AcademiaSituacaoGate;
  leads_30d: number;
  pct_do_total: number | null;
};

// ---------------------------------------------------------------------------
// Retornos de RPC
// ---------------------------------------------------------------------------

/** academia_candidatos. O gerador diz que nada vem nulo, mas quem nunca foi
 *  inscrito chega sem início, sem nível e às vezes sem nome. */
export type AcademiaCandidatoRow = {
  pessoa_id: string;
  nome: string | null;
  email: string | null;
  papeis: string[];
  conta_ativa: boolean;
  eh_bot: boolean;
  eh_mcp: boolean;
  participa: boolean;
  inicio_trilha: string | null;
  nivel: AcademiaNivel | null;
};

/** Questão como o aluno recebe: sem `correta`. */
export type AcademiaQuizQuestao = {
  id: string;
  enunciado: string;
  alternativas: Json;
};

export type AcademiaQuizIniciarRetorno = {
  tentativa_id: string;
  tempo_limite_min: number;
  nota_minima: number;
  questoes: AcademiaQuizQuestao[] | null;
};

/** O gabarito sai SÓ aqui, no retorno do envio. */
export type AcademiaQuizEnviarRetorno = {
  nota: number;
  nota_minima: number;
  aprovado: boolean;
  acertos: number;
  total: number;
  gabarito: Array<{
    id: string;
    enunciado: string;
    alternativas: Json;
    correta: number;
    marcada: number | null;
    explicacao: string | null;
  }> | null;
};

export type AcademiaMotorRetorno = { indicadores: number; recomendacoes: number };
