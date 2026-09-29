// Fronteira tipada dos objetos da Academia SMQ que ainda NÃO estão em
// types.ts. types.ts é gerado pelo Lovable a partir do banco real, e a
// plataforma bloqueia edição manual dele.
//
// Histórico: nasceu para a fundação e o seed (20261002120000/20261002120100).
// Essas duas já foram aplicadas e o Lovable regenerou os types; as tabelas
// abaixo continuam descritas aqui porque os tipos à mão são MAIS ESTREITOS
// que os gerados (uniões de texto em vez de string, colunas de view sem
// null), e a interseção com os gerados só estreita.
//
// O que ainda depende desta fronteira é a migration da gestão
// (20261003120000_academia_gestao): motor de indicadores, recomendações,
// efeito, encontros, gate em sombra e candidatos. Ao aplicá-la em produção e
// regenerar os types:
//   1. trocar `supabaseAcademia` por `supabase` nos consumidores;
//   2. mover os tipos estreitos que ainda fizerem falta para features/academia;
//   3. apagar este arquivo e baixar o teto do type-escape budget para 145.

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
  /** Distância absoluta mínima até a mediana, além do limiar relativo. */
  diferenca_minima: number | null;
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

/** Antes (a janela que disparou a recomendação) x depois (a mesma janela
 *  contada da conclusão do módulo). `valor_depois` nulo = janela ainda aberta. */
export type AcademiaEfeitoRow = {
  recomendacao_id: string;
  corretor_id: string;
  regra_codigo: string;
  indicador: string;
  direcao: "menor_e_pior" | "maior_e_pior";
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

export type AcademiaSituacaoGate = "habilitado" | "nao_habilitado" | "fora_da_academia";

/** Uma linha por corretor que recebeu lead nos últimos 30 dias. */
export type AcademiaGateSombraRow = {
  corretor_id: string;
  corretor_nome: string | null;
  situacao: AcademiaSituacaoGate;
  leads_30d: number;
  pct_do_total: number | null;
};

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

export type AcademiaMotorRetorno = { indicadores: number; recomendacoes: number };

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
      v_academia_efeito: SomenteLeitura<AcademiaEfeitoRow>;
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
      academia_rodar_motor: { Args: { _data_ref?: string | null }; Returns: AcademiaMotorRetorno };
      academia_salvar_encontro: {
        Args: {
          _id: string | null;
          _tipo: AcademiaTipoEncontro;
          _titulo: string;
          _inicio: string;
          _duracao_min: number | null;
          _facilitador: string | null;
          _modulo: string | null;
          _descricao: string | null;
          _acao_registrada: string | null;
        };
        Returns: string;
      };
      academia_registrar_presenca: {
        Args: {
          _encontro: string;
          _corretor: string;
          _presente: boolean | null;
          _observacao?: string | null;
        };
        Returns: void;
      };
      academia_gate_sombra: { Args: Record<string, never>; Returns: AcademiaGateSombraRow[] };
      academia_candidatos: { Args: Record<string, never>; Returns: AcademiaCandidatoRow[] };
    };
  };
};

/** O MESMO cliente (mesma sessão, mesmo storage), só com o schema estendido. */
export const supabaseAcademia = supabase as unknown as SupabaseClient<DatabaseAcademia>;
