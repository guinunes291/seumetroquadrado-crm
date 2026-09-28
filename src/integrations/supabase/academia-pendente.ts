// Fronteira tipada dos objetos criados pelas migrations da Academia SMQ
// (20261002120000_academia_fundacao, 20261002120100_academia_seed), que ainda
// NÃO estão em types.ts — types.ts é gerado pelo Lovable a partir do banco
// real, e estas migrations ainda não foram aplicadas.
//
// Mesmo padrão de integrations/supabase/higiene-pendente.ts e pendentes.ts,
// em arquivo separado de propósito: cada rodada de migrations tem o seu ciclo
// de vida e some quando a SUA rodada for refletida nos types.
//
// Ao regenerar os types do Supabase depois de aplicar estas migrations:
//   1. apagar este arquivo;
//   2. trocar `supabaseAcademia` por `supabase` nos consumidores;
//   3. baixar o teto do type-escape budget.
//
// Nesta fatia NADA no front consome isto ainda: a Fatia 1 é só camada de
// dados, e as flags academia_menu e academia_card_inicio nascem desligadas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database, Json } from "./types";

type Pub = Database["public"];
type Tabelas = Pub["Tables"];

/** Nível na trilha. NÃO é o "Apto" da roleta v2 (onboarding_concluido_em). */
export type AcademiaNivel =
  | "iniciante"
  | "habilitado"
  | "intermediario"
  | "especialista"
  | "mestre";

export type AcademiaStatusConteudo = "rascunho" | "publicado" | "arquivado";
export type AcademiaTipoAula = "texto" | "slides" | "video" | "pratica" | "material";
export type AcademiaStatusPratica = "pendente" | "aprovada" | "refazer";
export type AcademiaStatusRecomendacao =
  | "sombra"
  | "aberta"
  | "atribuida"
  | "concluida"
  | "descartada"
  | "expirada";

/** Origem da atribuição. 'integracao' é a fase 0 — a palavra "onboarding" já
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

export type AcademiaConfigRow = {
  id: boolean;
  nota_minima_padrao: number;
  quiz_tempo_limite_min: number;
  quiz_intervalo_min: number;
  quiz_max_tentativas_dia: number;
  recomendacao_modo: "desligado" | "sombra" | "ativo";
  recomendacao_validade_dias: number;
  /** 'ativo' não é aceito pelo CHECK: ligar o gate exige migration revisada. */
  gate_roleta_modo: "desligado" | "sombra";
  atualizado_em: string;
  atualizado_por: string | null;
};

export type AcademiaFaseRow = {
  numero: number;
  nome: string;
  periodo_texto: string | null;
  dia_inicio: number | null;
  dia_fim: number | null;
  foco: string | null;
  nivel_que_exige: AcademiaNivel | null;
};

export type AcademiaModuloRow = {
  id: string;
  codigo: string;
  numero: number;
  fase: number;
  titulo: string;
  objetivo_principal: string | null;
  objetivos: Json;
  pontos_chave: Json;
  pilares: string[];
  carga_horaria_h: number | null;
  carga_horaria_texto: string | null;
  prazo_dias: number | null;
  obrigatorio: boolean;
  exige_pratica: boolean;
  pratica_descricao: string | null;
  pratica_rubrica: Json;
  nota_minima: number | null;
  url_gamma: string | null;
  url_notion: string | null;
  notion_page_id: string | null;
  status: AcademiaStatusConteudo;
  versao: number;
  /** Enquanto não for null, academia_publicar_modulo recusa publicar. */
  revisao_pendente: string | null;
  revisar_em: string | null;
  criado_em: string;
  atualizado_em: string;
  publicado_em: string | null;
  publicado_por: string | null;
};

export type AcademiaAulaRow = {
  id: string;
  modulo_id: string;
  ordem: number;
  titulo: string;
  tipo: AcademiaTipoAula;
  conteudo_md: string | null;
  url_video: string | null;
  url_material: string | null;
  duracao_min: number | null;
  status: AcademiaStatusConteudo;
  criado_em: string;
  atualizado_em: string;
};

/** Gabarito. Só admin lê esta tabela — o aluno recebe as questões sem
 *  `correta` por academia_quiz_iniciar e o gabarito só no envio. */
export type AcademiaQuestaoRow = {
  id: string;
  modulo_id: string;
  ordem: number;
  enunciado: string;
  alternativas: Json;
  correta: number;
  explicacao: string | null;
  ativa: boolean;
  criado_em: string;
};

export type AcademiaParticipanteRow = {
  corretor_id: string;
  participa: boolean;
  inicio_trilha: string;
  nivel: AcademiaNivel;
  nivel_em: string;
  habilitado_override: boolean | null;
  override_motivo: string | null;
  override_por: string | null;
  override_em: string | null;
  criado_em: string;
};

export type AcademiaNivelHistoricoRow = {
  id: number;
  corretor_id: string;
  de: AcademiaNivel | null;
  para: AcademiaNivel;
  motivo: string;
  por: string | null;
  em: string;
};

export type AcademiaProgressoAulaRow = {
  corretor_id: string;
  aula_id: string;
  concluida_em: string;
};

export type AcademiaTentativaRow = {
  id: string;
  corretor_id: string;
  modulo_id: string;
  versao_modulo: number;
  questoes_ids: string[];
  iniciada_em: string;
  enviada_em: string | null;
  respostas: Json | null;
  acertos: number | null;
  total: number | null;
  nota: number | null;
  aprovado: boolean | null;
};

export type AcademiaPraticaRow = {
  id: string;
  corretor_id: string;
  modulo_id: string;
  origem: "envio" | "roleplay_presencial";
  evidencia_texto: string | null;
  evidencia_url: string | null;
  enviado_em: string;
  status: AcademiaStatusPratica;
  avaliador_id: string | null;
  avaliado_em: string | null;
  rubrica_resultado: Json | null;
  feedback: string | null;
};

export type AcademiaAtribuicaoRow = {
  id: string;
  corretor_id: string;
  modulo_id: string;
  origem: AcademiaOrigemAtribuicao;
  recomendacao_id: string | null;
  motivo: string | null;
  prazo: string | null;
  atribuido_por: string | null;
  criado_em: string;
  concluida_em: string | null;
  cancelada_em: string | null;
};

export type AcademiaCertificadoRow = {
  id: string;
  corretor_id: string;
  nivel: AcademiaNivel;
  codigo: string;
  emitido_em: string;
};

/** O aluno NÃO lê esta tabela: número individual chega como recomendação de
 *  módulo, não como placar. */
export type AcademiaIndicadorRow = {
  corretor_id: string;
  indicador: string;
  data_ref: string;
  janela_dias: number;
  valor: number | null;
  amostra: number;
  referencia_time: number | null;
  calculado_em: string;
};

export type AcademiaRegraRecomendacaoRow = {
  id: string;
  codigo: string;
  indicador: string;
  descricao: string;
  modulo_codigo: string;
  direcao: "menor_e_pior" | "maior_e_pior";
  limiar_relativo: number;
  janela_dias: number;
  amostra_minima: number;
  ativa: boolean;
  observacao: string | null;
};

export type AcademiaRecomendacaoRow = {
  id: string;
  regra_id: string;
  corretor_id: string;
  modulo_id: string;
  indicador: string;
  valor_corretor: number | null;
  valor_referencia: number | null;
  amostra: number | null;
  data_ref: string;
  status: AcademiaStatusRecomendacao;
  gerada_em: string;
  decidido_por: string | null;
  decidido_em: string | null;
  motivo_decisao: string | null;
  expira_em: string | null;
};

export type AcademiaEncontroRow = {
  id: string;
  tipo: AcademiaTipoEncontro;
  titulo: string;
  inicio: string;
  duracao_min: number | null;
  facilitador_id: string | null;
  modulo_id: string | null;
  descricao: string | null;
  acao_registrada: string | null;
  criado_por: string | null;
  criado_em: string;
};

export type AcademiaPresencaRow = {
  encontro_id: string;
  corretor_id: string;
  presente: boolean;
  observacao: string | null;
};

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

type SomenteLeitura<R> = { Row: R; Insert: never; Update: never; Relationships: [] };
/** Escrita só por RPC: sem Insert/Update mesmo para quem tem papel. */
type SoRpc<R> = SomenteLeitura<R>;
/** Conteúdo: a RLS só deixa admin escrever, mas o tipo permite. */
type AdminEscreve<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

export type DatabaseAcademia = Omit<Database, "public"> & {
  public: Omit<Pub, "Tables" | "Functions"> & {
    Tables: Tabelas & {
      academia_config: {
        Row: AcademiaConfigRow;
        Insert: never;
        Update: Partial<Omit<AcademiaConfigRow, "id">>;
        Relationships: [];
      };
      academia_fases: AdminEscreve<AcademiaFaseRow>;
      academia_modulos: AdminEscreve<AcademiaModuloRow>;
      academia_aulas: AdminEscreve<AcademiaAulaRow>;
      academia_questoes: AdminEscreve<AcademiaQuestaoRow>;
      academia_encontros: AdminEscreve<AcademiaEncontroRow>;
      academia_regras_recomendacao: {
        Row: AcademiaRegraRecomendacaoRow;
        Insert: never;
        Update: Partial<Omit<AcademiaRegraRecomendacaoRow, "id" | "codigo">>;
        Relationships: [];
      };
      academia_participantes: SoRpc<AcademiaParticipanteRow>;
      academia_niveis_historico: SoRpc<AcademiaNivelHistoricoRow>;
      academia_progresso_aulas: SoRpc<AcademiaProgressoAulaRow>;
      academia_tentativas: SoRpc<AcademiaTentativaRow>;
      academia_praticas: SoRpc<AcademiaPraticaRow>;
      academia_atribuicoes: SoRpc<AcademiaAtribuicaoRow>;
      academia_certificados: SoRpc<AcademiaCertificadoRow>;
      academia_presencas: SoRpc<AcademiaPresencaRow>;
      academia_indicadores: SoRpc<AcademiaIndicadorRow>;
      academia_recomendacoes: SoRpc<AcademiaRecomendacaoRow>;
      v_academia_modulo_status: SomenteLeitura<AcademiaModuloStatusRow>;
      v_academia_fase_status: SomenteLeitura<AcademiaFaseStatusRow>;
      v_academia_corretor_resumo: SomenteLeitura<AcademiaCorretorResumoRow>;
    };
    Functions: Pub["Functions"] & {
      academia_marcar_aula: { Args: { _aula: string; _concluida?: boolean }; Returns: void };
      academia_quiz_iniciar: { Args: { _modulo: string }; Returns: AcademiaQuizIniciarRetorno };
      academia_quiz_enviar: {
        Args: { _tentativa: string; _respostas: Json };
        Returns: AcademiaQuizEnviarRetorno;
      };
      academia_pratica_enviar: {
        Args: { _modulo: string; _texto: string; _url?: string | null };
        Returns: string;
      };
      academia_pratica_avaliar: {
        Args: {
          _pratica: string;
          _status: AcademiaStatusPratica;
          _rubrica: Json;
          _feedback: string;
        };
        Returns: void;
      };
      academia_registrar_roleplay: {
        Args: {
          _corretor: string;
          _modulo: string;
          _status: AcademiaStatusPratica;
          _rubrica: Json;
          _feedback: string;
        };
        Returns: string;
      };
      academia_definir_habilitado: {
        Args: { _corretor: string; _habilitado: boolean | null; _motivo: string };
        Returns: void;
      };
      academia_promover_mestre: { Args: { _corretor: string; _motivo: string }; Returns: void };
      academia_atribuir: {
        Args: { _corretor: string; _modulo: string; _prazo: string | null; _motivo: string };
        Returns: string;
      };
      academia_decidir_recomendacao: {
        Args: {
          _rec: string;
          _acao: "atribuir" | "descartar";
          _motivo: string;
          _prazo?: string | null;
        };
        Returns: void;
      };
      academia_publicar_modulo: { Args: { _modulo: string }; Returns: void };
      academia_definir_participacao: {
        Args: { _pessoa: string; _participa: boolean; _inicio_trilha?: string | null };
        Returns: void;
      };
    };
  };
};

/** O MESMO cliente (mesma sessão, mesmo storage), só com o schema estendido. */
export const supabaseAcademia = supabase as unknown as SupabaseClient<DatabaseAcademia>;
