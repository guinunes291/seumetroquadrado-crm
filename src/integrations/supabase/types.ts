export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          corretor_id: string
          created_at: string
          criado_por_id: string | null
          data_fim: string
          data_inicio: string
          deleted_at: string | null
          descricao: string | null
          id: string
          lead_id: string | null
          lembrete_minutos: number
          local: string | null
          motivo_cancelamento: string | null
          realizado_em: string | null
          status: Database["public"]["Enums"]["agendamento_status"]
          timezone: string
          tipo: Database["public"]["Enums"]["agendamento_tipo"]
          titulo: string
          updated_at: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          criado_por_id?: string | null
          data_fim: string
          data_inicio: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          lembrete_minutos?: number
          local?: string | null
          motivo_cancelamento?: string | null
          realizado_em?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          timezone?: string
          tipo?: Database["public"]["Enums"]["agendamento_tipo"]
          titulo: string
          updated_at?: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          criado_por_id?: string | null
          data_fim?: string
          data_inicio?: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          lembrete_minutos?: number
          local?: string | null
          motivo_cancelamento?: string | null
          realizado_em?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          timezone?: string
          tipo?: Database["public"]["Enums"]["agendamento_tipo"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          link: string | null
          mensagem: string | null
          ref_id: string | null
          tipo: Database["public"]["Enums"]["alerta_tipo"]
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          ref_id?: string | null
          tipo: Database["public"]["Enums"]["alerta_tipo"]
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          ref_id?: string | null
          tipo?: Database["public"]["Enums"]["alerta_tipo"]
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          created_at: string
          diff: Json | null
          id: string
          operacao: string
          registro_id: string
          tabela: string
          usuario_id: string | null
          valores_antigos: Json | null
          valores_novos: Json | null
        }
        Insert: {
          created_at?: string
          diff?: Json | null
          id?: string
          operacao: string
          registro_id: string
          tabela: string
          usuario_id?: string | null
          valores_antigos?: Json | null
          valores_novos?: Json | null
        }
        Update: {
          created_at?: string
          diff?: Json | null
          id?: string
          operacao?: string
          registro_id?: string
          tabela?: string
          usuario_id?: string | null
          valores_antigos?: Json | null
          valores_novos?: Json | null
        }
        Relationships: []
      }
      copa_config_pontos: {
        Row: {
          chave: string
          id: string
          label: string
          pontos: number
        }
        Insert: {
          chave: string
          id?: string
          label: string
          pontos?: number
        }
        Update: {
          chave?: string
          id?: string
          label?: string
          pontos?: number
        }
        Relationships: []
      }
      copa_config_premios: {
        Row: {
          descricao: string | null
          icone: string | null
          id: string
          ordem: number
          posicao: string
          valor: string | null
        }
        Insert: {
          descricao?: string | null
          icone?: string | null
          id?: string
          ordem?: number
          posicao: string
          valor?: string | null
        }
        Update: {
          descricao?: string | null
          icone?: string | null
          id?: string
          ordem?: number
          posicao?: string
          valor?: string | null
        }
        Relationships: []
      }
      copa_confrontos: {
        Row: {
          corretor_a_id: string | null
          corretor_b_id: string | null
          created_at: string
          definido_manual: boolean
          fase_id: string
          id: string
          is_wo: boolean
          posicao: number
          semana_ref: number | null
          vencedor_id: string | null
        }
        Insert: {
          corretor_a_id?: string | null
          corretor_b_id?: string | null
          created_at?: string
          definido_manual?: boolean
          fase_id: string
          id?: string
          is_wo?: boolean
          posicao?: number
          semana_ref?: number | null
          vencedor_id?: string | null
        }
        Update: {
          corretor_a_id?: string | null
          corretor_b_id?: string | null
          created_at?: string
          definido_manual?: boolean
          fase_id?: string
          id?: string
          is_wo?: boolean
          posicao?: number
          semana_ref?: number | null
          vencedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copa_confrontos_fase_id_fkey"
            columns: ["fase_id"]
            isOneToOne: false
            referencedRelation: "copa_fases"
            referencedColumns: ["id"]
          },
        ]
      }
      copa_edicao: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim: string
          data_inicio: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      copa_fases: {
        Row: {
          edicao_id: string
          id: string
          nome: string
          ordem: number
          semana_fim: number
          semana_inicio: number
          tipo: string | null
        }
        Insert: {
          edicao_id: string
          id?: string
          nome: string
          ordem: number
          semana_fim: number
          semana_inicio: number
          tipo?: string | null
        }
        Update: {
          edicao_id?: string
          id?: string
          nome?: string
          ordem?: number
          semana_fim?: number
          semana_inicio?: number
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copa_fases_edicao_id_fkey"
            columns: ["edicao_id"]
            isOneToOne: false
            referencedRelation: "copa_edicao"
            referencedColumns: ["id"]
          },
        ]
      }
      copa_participantes: {
        Row: {
          ativo: boolean
          corretor_id: string
          created_at: string
          edicao_id: string
          grupo: string | null
          id: string
          selecao_id: string | null
        }
        Insert: {
          ativo?: boolean
          corretor_id: string
          created_at?: string
          edicao_id: string
          grupo?: string | null
          id?: string
          selecao_id?: string | null
        }
        Update: {
          ativo?: boolean
          corretor_id?: string
          created_at?: string
          edicao_id?: string
          grupo?: string | null
          id?: string
          selecao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copa_participantes_edicao_id_fkey"
            columns: ["edicao_id"]
            isOneToOne: false
            referencedRelation: "copa_edicao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copa_participantes_selecao_id_fkey"
            columns: ["selecao_id"]
            isOneToOne: false
            referencedRelation: "copa_selecoes"
            referencedColumns: ["id"]
          },
        ]
      }
      copa_pontuacoes: {
        Row: {
          agendamentos: number
          analise: number
          corretor_id: string
          created_at: string
          edicao_id: string
          id: string
          observacao: string | null
          semana: number
          updated_at: string
          vendas: number
          visitas: number
        }
        Insert: {
          agendamentos?: number
          analise?: number
          corretor_id: string
          created_at?: string
          edicao_id: string
          id?: string
          observacao?: string | null
          semana: number
          updated_at?: string
          vendas?: number
          visitas?: number
        }
        Update: {
          agendamentos?: number
          analise?: number
          corretor_id?: string
          created_at?: string
          edicao_id?: string
          id?: string
          observacao?: string | null
          semana?: number
          updated_at?: string
          vendas?: number
          visitas?: number
        }
        Relationships: [
          {
            foreignKeyName: "copa_pontuacoes_edicao_id_fkey"
            columns: ["edicao_id"]
            isOneToOne: false
            referencedRelation: "copa_edicao"
            referencedColumns: ["id"]
          },
        ]
      }
      copa_selecoes: {
        Row: {
          ativo: boolean
          bandeira: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          bandeira: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          bandeira?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      distribuicao_config: {
        Row: {
          origem: Database["public"]["Enums"]["lead_origem"]
          sla_minutos: number
          timeout_horas: number
          updated_at: string
        }
        Insert: {
          origem: Database["public"]["Enums"]["lead_origem"]
          sla_minutos?: number
          timeout_horas?: number
          updated_at?: string
        }
        Update: {
          origem?: Database["public"]["Enums"]["lead_origem"]
          sla_minutos?: number
          timeout_horas?: number
          updated_at?: string
        }
        Relationships: []
      }
      distribution_log: {
        Row: {
          corretor_id: string
          created_at: string
          distribuido_por_id: string | null
          id: string
          lead_id: string
          motivo: string | null
          tipo: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Insert: {
          corretor_id: string
          created_at?: string
          distribuido_por_id?: string | null
          id?: string
          lead_id: string
          motivo?: string | null
          tipo: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Update: {
          corretor_id?: string
          created_at?: string
          distribuido_por_id?: string | null
          id?: string
          lead_id?: string
          motivo?: string | null
          tipo?: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "distribution_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          gestor_id: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          gestor_id?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          gestor_id?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      fila_distribuicao: {
        Row: {
          ativo: boolean
          corretor_id: string
          created_at: string
          id: string
          leads_recebidos_hoje: number
          max_leads_dia: number
          posicao: number
          ultima_distribuicao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          corretor_id: string
          created_at?: string
          id?: string
          leads_recebidos_hoje?: number
          max_leads_dia?: number
          posicao: number
          ultima_distribuicao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          corretor_id?: string
          created_at?: string
          id?: string
          leads_recebidos_hoje?: number
          max_leads_dia?: number
          posicao?: number
          ultima_distribuicao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      historico_precos: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          id: string
          unidade_id: string
          valor_anterior: number | null
          valor_novo: number
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          id?: string
          unidade_id: string
          valor_anterior?: number | null
          valor_novo: number
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          id?: string
          unidade_id?: string
          valor_anterior?: number | null
          valor_novo?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_precos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes: {
        Row: {
          autor_id: string | null
          conteudo: string
          created_at: string
          deleted_at: string | null
          direcao: Database["public"]["Enums"]["interacao_direcao"]
          id: string
          lead_id: string
          metadata: Json
          ocorreu_em: string
          tipo: Database["public"]["Enums"]["interacao_tipo"]
          titulo: string | null
          updated_at: string
        }
        Insert: {
          autor_id?: string | null
          conteudo: string
          created_at?: string
          deleted_at?: string | null
          direcao?: Database["public"]["Enums"]["interacao_direcao"]
          id?: string
          lead_id: string
          metadata?: Json
          ocorreu_em?: string
          tipo?: Database["public"]["Enums"]["interacao_tipo"]
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          autor_id?: string | null
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          direcao?: Database["public"]["Enums"]["interacao_direcao"]
          id?: string
          lead_id?: string
          metadata?: Json
          ocorreu_em?: string
          tipo?: Database["public"]["Enums"]["interacao_tipo"]
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_transitions: {
        Row: {
          alterado_por: string | null
          corretor_id: string | null
          created_at: string
          de_status: Database["public"]["Enums"]["lead_status"] | null
          id: string
          lead_id: string
          para_status: Database["public"]["Enums"]["lead_status"]
        }
        Insert: {
          alterado_por?: string | null
          corretor_id?: string | null
          created_at?: string
          de_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_id: string
          para_status: Database["public"]["Enums"]["lead_status"]
        }
        Update: {
          alterado_por?: string | null
          corretor_id?: string | null
          created_at?: string
          de_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_id?: string
          para_status?: Database["public"]["Enums"]["lead_status"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_status_transitions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          campanha: string | null
          corretor_anterior_id: string | null
          corretor_id: string | null
          corretores_que_tentaram: string[]
          cpf: string | null
          created_at: string
          data_distribuicao: string | null
          data_movido_lixeira: string | null
          deleted_at: string | null
          email: string | null
          entrada_disponivel: string | null
          id: string
          legacy_id: number | null
          motivo_perdido: string | null
          na_lixeira: boolean
          nome: string
          observacoes: string | null
          origem: Database["public"]["Enums"]["lead_origem"]
          projeto_id: string | null
          projeto_nome: string | null
          proximo_followup: string | null
          renda_informada: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          ultima_interacao: string | null
          ultimo_contato: string | null
          updated_at: string
          usa_fgts: boolean
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          campanha?: string | null
          corretor_anterior_id?: string | null
          corretor_id?: string | null
          corretores_que_tentaram?: string[]
          cpf?: string | null
          created_at?: string
          data_distribuicao?: string | null
          data_movido_lixeira?: string | null
          deleted_at?: string | null
          email?: string | null
          entrada_disponivel?: string | null
          id?: string
          legacy_id?: number | null
          motivo_perdido?: string | null
          na_lixeira?: boolean
          nome: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["lead_origem"]
          projeto_id?: string | null
          projeto_nome?: string | null
          proximo_followup?: string | null
          renda_informada?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone: string
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao?: number
          timestamp_recebimento?: string | null
          ultima_interacao?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          usa_fgts?: boolean
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          campanha?: string | null
          corretor_anterior_id?: string | null
          corretor_id?: string | null
          corretores_que_tentaram?: string[]
          cpf?: string | null
          created_at?: string
          data_distribuicao?: string | null
          data_movido_lixeira?: string | null
          deleted_at?: string | null
          email?: string | null
          entrada_disponivel?: string | null
          id?: string
          legacy_id?: number | null
          motivo_perdido?: string | null
          na_lixeira?: boolean
          nome?: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["lead_origem"]
          projeto_id?: string | null
          projeto_nome?: string | null
          proximo_followup?: string | null
          renda_informada?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone?: string
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao?: number
          timestamp_recebimento?: string | null
          ultima_interacao?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          usa_fgts?: boolean
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          ano: number
          corretor_id: string | null
          created_at: string
          criado_por: string | null
          equipe_id: string | null
          id: string
          mes: number
          meta_gmv: number
          meta_leads_atendidos: number
          meta_vendas: number
          meta_visitas: number
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          ano: number
          corretor_id?: string | null
          created_at?: string
          criado_por?: string | null
          equipe_id?: string | null
          id?: string
          mes: number
          meta_gmv?: number
          meta_leads_atendidos?: number
          meta_vendas?: number
          meta_visitas?: number
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          ano?: number
          corretor_id?: string | null
          created_at?: string
          criado_por?: string | null
          equipe_id?: string | null
          id?: string
          mes?: number
          meta_gmv?: number
          meta_leads_atendidos?: number
          meta_vendas?: number
          meta_visitas?: number
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      objecoes: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          id: string
          objecao: string
          ordem: number
          resposta: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          objecao: string
          ordem?: number
          resposta: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          objecao?: string
          ordem?: number
          resposta?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          acessa_links_uteis: boolean
          ativo: boolean
          avatar_url: string | null
          bairro: string | null
          bio: string | null
          cargo: string | null
          cep: string | null
          cidade: string | null
          codigo_indicacao: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          creci: string | null
          data_admissao: string | null
          data_credenciamento: string | null
          data_descredenciamento: string | null
          data_nascimento: string | null
          email: string
          equipe_id: string | null
          estado: string | null
          foto_url: string | null
          google_calendar_enabled: boolean
          id: string
          legacy_user_id: number | null
          limite_diario_leads: number
          limite_diario_webhook: number
          logradouro: string | null
          nome: string
          numero: string | null
          perfil_completo: boolean
          presente: boolean
          presente_em: string | null
          situacao: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          acessa_links_uteis?: boolean
          ativo?: boolean
          avatar_url?: string | null
          bairro?: string | null
          bio?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_indicacao?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          creci?: string | null
          data_admissao?: string | null
          data_credenciamento?: string | null
          data_descredenciamento?: string | null
          data_nascimento?: string | null
          email: string
          equipe_id?: string | null
          estado?: string | null
          foto_url?: string | null
          google_calendar_enabled?: boolean
          id: string
          legacy_user_id?: number | null
          limite_diario_leads?: number
          limite_diario_webhook?: number
          logradouro?: string | null
          nome?: string
          numero?: string | null
          perfil_completo?: boolean
          presente?: boolean
          presente_em?: string | null
          situacao?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          acessa_links_uteis?: boolean
          ativo?: boolean
          avatar_url?: string | null
          bairro?: string | null
          bio?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_indicacao?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          creci?: string | null
          data_admissao?: string | null
          data_credenciamento?: string | null
          data_descredenciamento?: string | null
          data_nascimento?: string | null
          email?: string
          equipe_id?: string | null
          estado?: string | null
          foto_url?: string | null
          google_calendar_enabled?: boolean
          id?: string
          legacy_user_id?: number | null
          limite_diario_leads?: number
          limite_diario_webhook?: number
          logradouro?: string | null
          nome?: string
          numero?: string | null
          perfil_completo?: boolean
          presente?: boolean
          presente_em?: string | null
          situacao?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      projeto_foco: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          fim: string | null
          id: string
          inicio: string
          motivo: string | null
          projeto_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          projeto_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          projeto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projeto_foco_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      projetos: {
        Row: {
          ativo: boolean
          bairro: string | null
          cidade: string | null
          construtora: string | null
          created_at: string
          criado_por: string | null
          deleted_at: string | null
          endereco: string | null
          entrega_status: string | null
          id: string
          nome: string
          observacoes: string | null
          preco_inicial: string | null
          regiao: string | null
          slug: string
          tipologia: string | null
          updated_at: string
          vagas: string | null
          webhook_token: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cidade?: string | null
          construtora?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          endereco?: string | null
          entrega_status?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          preco_inicial?: string | null
          regiao?: string | null
          slug: string
          tipologia?: string | null
          updated_at?: string
          vagas?: string | null
          webhook_token?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cidade?: string | null
          construtora?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          endereco?: string | null
          entrega_status?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          preco_inicial?: string | null
          regiao?: string | null
          slug?: string
          tipologia?: string | null
          updated_at?: string
          vagas?: string | null
          webhook_token?: string
        }
        Relationships: []
      }
      push_outbox: {
        Row: {
          body: string
          created_at: string
          id: string
          sent_at: string | null
          tag: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sent_at?: string | null
          tag?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sent_at?: string | null
          tag?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scripts_vendas: {
        Row: {
          ativo: boolean
          categoria: string | null
          conteudo: string
          created_at: string
          etapa: Database["public"]["Enums"]["lead_status"] | null
          id: string
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          conteudo: string
          created_at?: string
          etapa?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          ordem?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          conteudo?: string
          created_at?: string
          etapa?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      stg_agendamentos: {
        Row: {
          construtora: string | null
          corretor_legacy: number | null
          created_at: string | null
          data_agendamento: string | null
          lead_legacy: number | null
          legacy_id: number | null
          observacoes: string | null
          status: string | null
        }
        Insert: {
          construtora?: string | null
          corretor_legacy?: number | null
          created_at?: string | null
          data_agendamento?: string | null
          lead_legacy?: number | null
          legacy_id?: number | null
          observacoes?: string | null
          status?: string | null
        }
        Update: {
          construtora?: string | null
          corretor_legacy?: number | null
          created_at?: string | null
          data_agendamento?: string | null
          lead_legacy?: number | null
          legacy_id?: number | null
          observacoes?: string | null
          status?: string | null
        }
        Relationships: []
      }
      stg_analises: {
        Row: {
          corretor_legacy: number | null
          created_at: string | null
          lead_legacy: number | null
          status: string | null
        }
        Insert: {
          corretor_legacy?: number | null
          created_at?: string | null
          lead_legacy?: number | null
          status?: string | null
        }
        Update: {
          corretor_legacy?: number | null
          created_at?: string | null
          lead_legacy?: number | null
          status?: string | null
        }
        Relationships: []
      }
      stg_leads: {
        Row: {
          campanha: string | null
          corretor_anterior_legacy: number | null
          corretor_legacy: number | null
          cpf: string | null
          created_at: string | null
          data_distribuicao: string | null
          data_movido_lixeira: string | null
          email: string | null
          entrada_disponivel: string | null
          legacy_id: number | null
          motivo_perdido: string | null
          na_lixeira: string | null
          nome: string | null
          observacoes: string | null
          origem: string | null
          projeto_custom: string | null
          proximo_followup: string | null
          renda_informada: string | null
          status: string | null
          telefone: string | null
          temperatura: string | null
          timestamp_recebimento: string | null
          ultima_interacao: string | null
          ultimo_contato: string | null
          updated_at: string | null
          usa_fgts: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          campanha?: string | null
          corretor_anterior_legacy?: number | null
          corretor_legacy?: number | null
          cpf?: string | null
          created_at?: string | null
          data_distribuicao?: string | null
          data_movido_lixeira?: string | null
          email?: string | null
          entrada_disponivel?: string | null
          legacy_id?: number | null
          motivo_perdido?: string | null
          na_lixeira?: string | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          projeto_custom?: string | null
          proximo_followup?: string | null
          renda_informada?: string | null
          status?: string | null
          telefone?: string | null
          temperatura?: string | null
          timestamp_recebimento?: string | null
          ultima_interacao?: string | null
          ultimo_contato?: string | null
          updated_at?: string | null
          usa_fgts?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          campanha?: string | null
          corretor_anterior_legacy?: number | null
          corretor_legacy?: number | null
          cpf?: string | null
          created_at?: string | null
          data_distribuicao?: string | null
          data_movido_lixeira?: string | null
          email?: string | null
          entrada_disponivel?: string | null
          legacy_id?: number | null
          motivo_perdido?: string | null
          na_lixeira?: string | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          projeto_custom?: string | null
          proximo_followup?: string | null
          renda_informada?: string | null
          status?: string | null
          telefone?: string | null
          temperatura?: string | null
          timestamp_recebimento?: string | null
          ultima_interacao?: string | null
          ultimo_contato?: string | null
          updated_at?: string | null
          usa_fgts?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      stg_visitas: {
        Row: {
          corretor_legacy: number | null
          created_at: string | null
          data_visita: string | null
          lead_legacy: number | null
        }
        Insert: {
          corretor_legacy?: number | null
          created_at?: string | null
          data_visita?: string | null
          lead_legacy?: number | null
        }
        Update: {
          corretor_legacy?: number | null
          created_at?: string | null
          data_visita?: string | null
          lead_legacy?: number | null
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          corretor_id: string
          created_at: string
          criado_por: string | null
          data_conclusao: string | null
          data_vencimento: string | null
          deleted_at: string | null
          descricao: string | null
          id: string
          lead_id: string | null
          origem_automatica: boolean
          prioridade: Database["public"]["Enums"]["tarefa_prioridade"]
          resultado: string | null
          status: Database["public"]["Enums"]["tarefa_status"]
          tipo: Database["public"]["Enums"]["tarefa_tipo"]
          titulo: string
          updated_at: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          criado_por?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          origem_automatica?: boolean
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          resultado?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          tipo?: Database["public"]["Enums"]["tarefa_tipo"]
          titulo: string
          updated_at?: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          criado_por?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          origem_automatica?: boolean
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          resultado?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          tipo?: Database["public"]["Enums"]["tarefa_tipo"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_mensagem: {
        Row: {
          assunto: string | null
          ativo: boolean
          canal: Database["public"]["Enums"]["template_canal"]
          conteudo: string
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          projeto_id: string | null
          updated_at: string
        }
        Insert: {
          assunto?: string | null
          ativo?: boolean
          canal?: Database["public"]["Enums"]["template_canal"]
          conteudo: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          projeto_id?: string | null
          updated_at?: string
        }
        Update: {
          assunto?: string | null
          ativo?: boolean
          canal?: Database["public"]["Enums"]["template_canal"]
          conteudo?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          projeto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_mensagem_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          andar: string | null
          area_privativa: number | null
          bloco: string | null
          created_at: string
          criado_por: string | null
          deleted_at: string | null
          dormitorios: number | null
          id: string
          identificador: string
          observacoes: string | null
          projeto_id: string
          status: Database["public"]["Enums"]["unidade_status"]
          suites: number | null
          tipologia: string | null
          updated_at: string
          vagas: number | null
          valor: number | null
        }
        Insert: {
          andar?: string | null
          area_privativa?: number | null
          bloco?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          dormitorios?: number | null
          id?: string
          identificador: string
          observacoes?: string | null
          projeto_id: string
          status?: Database["public"]["Enums"]["unidade_status"]
          suites?: number | null
          tipologia?: string | null
          updated_at?: string
          vagas?: number | null
          valor?: number | null
        }
        Update: {
          andar?: string | null
          area_privativa?: number | null
          bloco?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          dormitorios?: number | null
          id?: string
          identificador?: string
          observacoes?: string | null
          projeto_id?: string
          status?: Database["public"]["Enums"]["unidade_status"]
          suites?: number | null
          tipologia?: string | null
          updated_at?: string
          vagas?: number | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atribuir_lead_a_corretor: {
        Args: { _corretor_id: string; _lead_id: string }
        Returns: undefined
      }
      buscar_lead_duplicado: {
        Args: { _projeto_id: string; _telefone: string }
        Returns: string
      }
      copa_apurar_fase: { Args: { _fase_id: string }; Returns: undefined }
      copa_definir_vencedor: {
        Args: { _confronto_id: string; _corretor_id: string }
        Returns: undefined
      }
      copa_inicializar_dados: { Args: never; Returns: Json }
      copa_pontos_corretor: {
        Args: { _corretor_id: string; _df: string; _di: string }
        Returns: number
      }
      copa_ranking: {
        Args: { _edicao_id: string }
        Returns: {
          agendamentos: number
          analise: number
          bandeira: string
          corretor_id: string
          nome: string
          total: number
          vendas: number
          visitas: number
        }[]
      }
      copa_realizar_sorteio:
        | { Args: never; Returns: undefined }
        | { Args: { _edicao_id: string }; Returns: undefined }
      copa_set_participantes:
        | { Args: { _edicao_id: string; _ids: string[] }; Returns: undefined }
        | { Args: { _ids: string[] }; Returns: undefined }
      corretor_elegivel: { Args: { _corretor_id: string }; Returns: boolean }
      dashboard_funil: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          etapa: string
          ordem: number
          quantidade: number
        }[]
      }
      dashboard_kpis: {
        Args: { _corretor?: string; _df?: string; _di?: string }
        Returns: Json
      }
      dashboard_leads_urgentes: {
        Args: { _corretor?: string; _min_minutos?: number }
        Returns: {
          corretor_id: string
          corretor_nome: string
          lead_id: string
          minutos_parado: number
          nome: string
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
        }[]
      }
      dashboard_metricas_por_corretor: {
        Args: { _df: string; _di: string }
        Returns: {
          agendamentos: number
          analise: number
          conversao: number
          corretor_id: string
          fechados: number
          leads: number
          nome: string
          perdidos: number
          visitas: number
        }[]
      }
      dashboard_motivos_perda: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          motivo: string
          quantidade: number
        }[]
      }
      dashboard_redistribuicoes: {
        Args: { _df: string; _di: string }
        Returns: {
          corretor_id: string
          corretor_nome: string
          lead_id: string
          lead_nome: string
          motivo: string
          quando: string
          tipo: Database["public"]["Enums"]["distribuicao_tipo"]
        }[]
      }
      dashboard_serie_diaria: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          agendamentos: number
          dia: string
          leads: number
          vendas: number
          visitas: number
        }[]
      }
      detectar_duplicatas_leads: {
        Args: never
        Returns: {
          grupo_chave: string
          lead_ids: string[]
          quantidade: number
          tipo: string
        }[]
      }
      distribuir_lead: {
        Args: {
          _distribuido_por?: string
          _lead_id: string
          _tipo?: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Returns: string
      }
      distribuir_lead_elegivel: { Args: { _lead_id: string }; Returns: string }
      enqueue_push: {
        Args: {
          _body: string
          _tag: string
          _title: string
          _url: string
          _user_id: string
        }
        Returns: undefined
      }
      expirar_lixeira_antiga: { Args: never; Returns: undefined }
      gerar_alertas_agendamentos_proximos: { Args: never; Returns: undefined }
      gerar_alertas_tarefas_atrasadas: { Args: never; Returns: undefined }
      gerar_pushes_agendamentos_proximos: { Args: never; Returns: undefined }
      get_projeto_webhook_token: {
        Args: { _projeto_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      leads_com_sla: {
        Args: { _corretor?: string }
        Returns: {
          lead_id: string
          minutos_decorridos: number
          sla_minutos: number
          sla_status: string
          temperatura_calc: Database["public"]["Enums"]["lead_temperatura"]
        }[]
      }
      marcar_presenca: { Args: { _presente: boolean }; Returns: undefined }
      mesclar_leads: {
        Args: { _lead_destino: string; _lead_origem: string }
        Returns: boolean
      }
      processar_distribuicao_automatica: { Args: never; Returns: Json }
      recalcular_temperatura_leads: { Args: never; Returns: number }
      redistribuir_leads_parados: { Args: never; Returns: number }
      regenerar_webhook_token: {
        Args: { _projeto_id: string }
        Returns: string
      }
      rel_conversao_por_corretor: {
        Args: { _df: string; _di: string }
        Returns: {
          conv_pct: number
          corretor_id: string
          fechados: number
          leads: number
          nome: string
        }[]
      }
      rel_evolucao_vendas: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          mes: string
          vendas: number
        }[]
      }
      rel_origem_efetiva: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          conv_pct: number
          fechados: number
          leads: number
          origem: string
        }[]
      }
      rel_tempo_medio_por_etapa: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          etapa: string
          media_horas: number
          n: number
          p50_horas: number
        }[]
      }
      resetar_cotas_diarias: { Args: never; Returns: undefined }
      resetar_presenca_diaria: { Args: never; Returns: undefined }
      restaurar_registro: {
        Args: { _id: string; _tabela: string }
        Returns: boolean
      }
    }
    Enums: {
      agendamento_status:
        | "agendado"
        | "confirmado"
        | "realizado"
        | "cancelado"
        | "nao_compareceu"
        | "remarcado"
      agendamento_tipo: "visita" | "reuniao" | "ligacao" | "follow_up" | "outro"
      alerta_tipo:
        | "tarefa_atrasada"
        | "lead_novo"
        | "agendamento_proximo"
        | "follow_up"
        | "sistema"
      app_role: "admin" | "gestor" | "corretor" | "superintendente"
      distribuicao_tipo: "automatica" | "manual" | "inicial"
      interacao_direcao: "entrada" | "saida" | "interna"
      interacao_tipo:
        | "ligacao"
        | "whatsapp"
        | "email"
        | "sms"
        | "visita"
        | "reuniao"
        | "nota"
        | "mudanca_status"
        | "proposta"
        | "outro"
      lead_origem:
        | "facebook"
        | "google_sheets"
        | "site"
        | "indicacao"
        | "captacao_corretor"
        | "whatsapp"
        | "telefone"
        | "plantao"
        | "agendamento_self_service"
        | "chatbot"
        | "outro"
        | "importacao"
      lead_status:
        | "novo"
        | "aguardando_atendimento"
        | "em_atendimento"
        | "qualificado"
        | "agendado"
        | "visita_realizada"
        | "proposta_enviada"
        | "analise_credito"
        | "contrato_fechado"
        | "pos_venda"
        | "perdido"
      lead_temperatura: "quente" | "morno" | "frio"
      tarefa_prioridade: "baixa" | "media" | "alta" | "urgente"
      tarefa_status: "pendente" | "em_andamento" | "concluida" | "cancelada"
      tarefa_tipo:
        | "ligacao"
        | "whatsapp"
        | "email"
        | "visita"
        | "follow_up"
        | "documentacao"
        | "outro"
      template_canal: "whatsapp" | "email" | "sms" | "interno"
      unidade_status: "disponivel" | "reservada" | "vendida" | "bloqueada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: [
        "agendado",
        "confirmado",
        "realizado",
        "cancelado",
        "nao_compareceu",
        "remarcado",
      ],
      agendamento_tipo: ["visita", "reuniao", "ligacao", "follow_up", "outro"],
      alerta_tipo: [
        "tarefa_atrasada",
        "lead_novo",
        "agendamento_proximo",
        "follow_up",
        "sistema",
      ],
      app_role: ["admin", "gestor", "corretor", "superintendente"],
      distribuicao_tipo: ["automatica", "manual", "inicial"],
      interacao_direcao: ["entrada", "saida", "interna"],
      interacao_tipo: [
        "ligacao",
        "whatsapp",
        "email",
        "sms",
        "visita",
        "reuniao",
        "nota",
        "mudanca_status",
        "proposta",
        "outro",
      ],
      lead_origem: [
        "facebook",
        "google_sheets",
        "site",
        "indicacao",
        "captacao_corretor",
        "whatsapp",
        "telefone",
        "plantao",
        "agendamento_self_service",
        "chatbot",
        "outro",
        "importacao",
      ],
      lead_status: [
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
      ],
      lead_temperatura: ["quente", "morno", "frio"],
      tarefa_prioridade: ["baixa", "media", "alta", "urgente"],
      tarefa_status: ["pendente", "em_andamento", "concluida", "cancelada"],
      tarefa_tipo: [
        "ligacao",
        "whatsapp",
        "email",
        "visita",
        "follow_up",
        "documentacao",
        "outro",
      ],
      template_canal: ["whatsapp", "email", "sms", "interno"],
      unidade_status: ["disponivel", "reservada", "vendida", "bloqueada"],
    },
  },
} as const
