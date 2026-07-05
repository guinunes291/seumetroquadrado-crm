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
          google_event_id: string | null
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
          google_event_id?: string | null
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
          google_event_id?: string | null
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
      analises_credito: {
        Row: {
          agendamento_id: string | null
          corretor_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          legacy_id: number | null
          observacoes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          corretor_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          legacy_id?: number | null
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          corretor_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          legacy_id?: number | null
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analises_credito_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_credito_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
      comissoes: {
        Row: {
          beneficiario_id: string | null
          beneficiario_nome: string | null
          contrato_vgv: number
          created_at: string
          data_pagamento: string | null
          id: string
          lead_id: string | null
          legacy_id: number | null
          observacoes: string | null
          percentual: number
          percentual_desconto: number
          status: string
          tipo: string
          updated_at: string
          valor_base: number
          valor_comissao: number
          valor_liquido: number
          venda_id: string | null
        }
        Insert: {
          beneficiario_id?: string | null
          beneficiario_nome?: string | null
          contrato_vgv?: number
          created_at?: string
          data_pagamento?: string | null
          id?: string
          lead_id?: string | null
          legacy_id?: number | null
          observacoes?: string | null
          percentual?: number
          percentual_desconto?: number
          status?: string
          tipo?: string
          updated_at?: string
          valor_base?: number
          valor_comissao?: number
          valor_liquido?: number
          venda_id?: string | null
        }
        Update: {
          beneficiario_id?: string | null
          beneficiario_nome?: string | null
          contrato_vgv?: number
          created_at?: string
          data_pagamento?: string | null
          id?: string
          lead_id?: string | null
          legacy_id?: number | null
          observacoes?: string | null
          percentual?: number
          percentual_desconto?: number
          status?: string
          tipo?: string
          updated_at?: string
          valor_base?: number
          valor_comissao?: number
          valor_liquido?: number
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
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
          bonus_observacao: string | null
          corretor_id: string
          created_at: string
          edicao_id: string
          id: string
          observacao: string | null
          semana: number
          total: number
          updated_at: string
          vendas: number
          visitas: number
        }
        Insert: {
          agendamentos?: number
          analise?: number
          bonus_observacao?: string | null
          corretor_id: string
          created_at?: string
          edicao_id: string
          id?: string
          observacao?: string | null
          semana: number
          total?: number
          updated_at?: string
          vendas?: number
          visitas?: number
        }
        Update: {
          agendamentos?: number
          analise?: number
          bonus_observacao?: string | null
          corretor_id?: string
          created_at?: string
          edicao_id?: string
          id?: string
          observacao?: string | null
          semana?: number
          total?: number
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
      copiloto_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      copiloto_eventos: {
        Row: {
          criado_em: string
          id: string
          lead_id: string | null
          payload: Json | null
          resposta: string | null
          status_http: number | null
          sucesso: boolean
          tentativa: number
        }
        Insert: {
          criado_em?: string
          id?: string
          lead_id?: string | null
          payload?: Json | null
          resposta?: string | null
          status_http?: number | null
          sucesso?: boolean
          tentativa?: number
        }
        Update: {
          criado_em?: string
          id?: string
          lead_id?: string | null
          payload?: Json | null
          resposta?: string | null
          status_http?: number | null
          sucesso?: boolean
          tentativa?: number
        }
        Relationships: [
          {
            foreignKeyName: "copiloto_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      distribuicao_config: {
        Row: {
          origem: Database["public"]["Enums"]["lead_origem"]
          sla_minutos: number
          timeout_horas: number
          timeout_minutos: number | null
          updated_at: string
        }
        Insert: {
          origem: Database["public"]["Enums"]["lead_origem"]
          sla_minutos?: number
          timeout_horas?: number
          timeout_minutos?: number | null
          updated_at?: string
        }
        Update: {
          origem?: Database["public"]["Enums"]["lead_origem"]
          sla_minutos?: number
          timeout_horas?: number
          timeout_minutos?: number | null
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
      documentacoes: {
        Row: {
          corretor_id: string | null
          created_at: string
          id: string
          lead_id: string
          observacoes: string | null
          status: string
          tipo: string
          updated_at: string
          url: string | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          observacoes?: string | null
          status?: string
          tipo: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          observacoes?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentacoes_lead_id_fkey"
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
          posicao_facebook: number | null
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
          posicao_facebook?: number | null
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
          posicao_facebook?: number | null
          ultima_distribuicao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      google_calendar_connections: {
        Row: {
          access_token: string | null
          access_token_expira_em: string | null
          calendar_id: string
          created_at: string
          espelho_global: boolean
          google_email: string | null
          refresh_token: string
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_expira_em?: string | null
          calendar_id?: string
          created_at?: string
          espelho_global?: boolean
          google_email?: string | null
          refresh_token: string
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_expira_em?: string | null
          calendar_id?: string
          created_at?: string
          espelho_global?: boolean
          google_email?: string | null
          refresh_token?: string
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_event_mirrors: {
        Row: {
          agendamento_id: string
          created_at: string
          google_event_id: string
          user_id: string
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          google_event_id: string
          user_id: string
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          google_event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_event_mirrors_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
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
      lead_eventos: {
        Row: {
          agente: string | null
          created_at: string
          descricao: string | null
          id: string
          lead_id: string
          payload: Json | null
          tipo: string
        }
        Insert: {
          agente?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id: string
          payload?: Json | null
          tipo: string
        }
        Update: {
          agente?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lead_id?: string
          payload?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_eventos_lead_id_fkey"
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
          consentimento_lgpd: boolean | null
          construtora: string | null
          copiloto_notificado_em: string | null
          corretor_anterior_id: string | null
          corretor_id: string | null
          corretores_que_tentaram: string[]
          cpf: string | null
          created_at: string
          data_distribuicao: string | null
          data_movido_lixeira: string | null
          data_perda: string | null
          decisor: string | null
          deleted_at: string | null
          desfecho: string | null
          docs_pendentes: Json | null
          docs_recebidos: Json | null
          email: string | null
          entrada_disponivel: string | null
          estado: Database["public"]["Enums"]["lead_estado"] | null
          etapa: string | null
          faixa_mcmv: string | null
          fase: string | null
          fgts_valor: number | null
          handoff_em: string | null
          id: string
          legacy_id: number | null
          motivo_handoff: string | null
          motivo_perda_categoria: string | null
          motivo_perdido: string | null
          na_lixeira: boolean
          nome: string
          objecoes: string[]
          observacoes: string | null
          opt_out: boolean
          origem: Database["public"]["Enums"]["lead_origem"]
          projeto_id: string | null
          projeto_nome: string | null
          proxima_acao: string | null
          proximo_followup: string | null
          renda_estimada: number | null
          renda_informada: string | null
          resumo_qualificacao: string | null
          search_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164: string | null
          tem_fgts: boolean | null
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          tipo_renda: string | null
          ultima_interacao: string | null
          ultimo_contato: string | null
          updated_at: string
          usa_fgts: boolean
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          via_webhook: boolean
          visita_data: string | null
          visita_empreendimento: string | null
          visita_hora: string | null
        }
        Insert: {
          campanha?: string | null
          consentimento_lgpd?: boolean | null
          construtora?: string | null
          copiloto_notificado_em?: string | null
          corretor_anterior_id?: string | null
          corretor_id?: string | null
          corretores_que_tentaram?: string[]
          cpf?: string | null
          created_at?: string
          data_distribuicao?: string | null
          data_movido_lixeira?: string | null
          data_perda?: string | null
          decisor?: string | null
          deleted_at?: string | null
          desfecho?: string | null
          docs_pendentes?: Json | null
          docs_recebidos?: Json | null
          email?: string | null
          entrada_disponivel?: string | null
          estado?: Database["public"]["Enums"]["lead_estado"] | null
          etapa?: string | null
          faixa_mcmv?: string | null
          fase?: string | null
          fgts_valor?: number | null
          handoff_em?: string | null
          id?: string
          legacy_id?: number | null
          motivo_handoff?: string | null
          motivo_perda_categoria?: string | null
          motivo_perdido?: string | null
          na_lixeira?: boolean
          nome: string
          objecoes?: string[]
          observacoes?: string | null
          opt_out?: boolean
          origem?: Database["public"]["Enums"]["lead_origem"]
          projeto_id?: string | null
          projeto_nome?: string | null
          proxima_acao?: string | null
          proximo_followup?: string | null
          renda_estimada?: number | null
          renda_informada?: string | null
          resumo_qualificacao?: string | null
          search_text?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164?: string | null
          tem_fgts?: boolean | null
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao?: number
          timestamp_recebimento?: string | null
          tipo_renda?: string | null
          ultima_interacao?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          usa_fgts?: boolean
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          via_webhook?: boolean
          visita_data?: string | null
          visita_empreendimento?: string | null
          visita_hora?: string | null
        }
        Update: {
          campanha?: string | null
          consentimento_lgpd?: boolean | null
          construtora?: string | null
          copiloto_notificado_em?: string | null
          corretor_anterior_id?: string | null
          corretor_id?: string | null
          corretores_que_tentaram?: string[]
          cpf?: string | null
          created_at?: string
          data_distribuicao?: string | null
          data_movido_lixeira?: string | null
          data_perda?: string | null
          decisor?: string | null
          deleted_at?: string | null
          desfecho?: string | null
          docs_pendentes?: Json | null
          docs_recebidos?: Json | null
          email?: string | null
          entrada_disponivel?: string | null
          estado?: Database["public"]["Enums"]["lead_estado"] | null
          etapa?: string | null
          faixa_mcmv?: string | null
          fase?: string | null
          fgts_valor?: number | null
          handoff_em?: string | null
          id?: string
          legacy_id?: number | null
          motivo_handoff?: string | null
          motivo_perda_categoria?: string | null
          motivo_perdido?: string | null
          na_lixeira?: boolean
          nome?: string
          objecoes?: string[]
          observacoes?: string | null
          opt_out?: boolean
          origem?: Database["public"]["Enums"]["lead_origem"]
          projeto_id?: string | null
          projeto_nome?: string | null
          proxima_acao?: string | null
          proximo_followup?: string | null
          renda_estimada?: number | null
          renda_informada?: string | null
          resumo_qualificacao?: string | null
          search_text?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone?: string
          telefone_e164?: string | null
          tem_fgts?: boolean | null
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao?: number
          timestamp_recebimento?: string | null
          tipo_renda?: string | null
          ultima_interacao?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          usa_fgts?: boolean
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          via_webhook?: boolean
          visita_data?: string | null
          visita_empreendimento?: string | null
          visita_hora?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "leads_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      leads_landing: {
        Row: {
          created_at: string
          fbclid: string | null
          gclid: string | null
          id: string
          nome: string | null
          origem: string | null
          pagina: string | null
          raw: Json | null
          recebido_em: string
          referrer: string | null
          regiao: string | null
          renda: string | null
          sim_aluguel: number | null
          sim_carteira36m: boolean | null
          sim_entrada: number | null
          sim_faixa: number | null
          sim_fgts: number | null
          sim_financiamento: number | null
          sim_parcela: number | null
          sim_renda: number | null
          sim_segmento: string | null
          sim_subsidio: number | null
          sim_tem_dependente: boolean | null
          sim_teto_imovel: number | null
          status: string
          timestamp_cliente: string | null
          tipo: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          fbclid?: string | null
          gclid?: string | null
          id?: string
          nome?: string | null
          origem?: string | null
          pagina?: string | null
          raw?: Json | null
          recebido_em?: string
          referrer?: string | null
          regiao?: string | null
          renda?: string | null
          sim_aluguel?: number | null
          sim_carteira36m?: boolean | null
          sim_entrada?: number | null
          sim_faixa?: number | null
          sim_fgts?: number | null
          sim_financiamento?: number | null
          sim_parcela?: number | null
          sim_renda?: number | null
          sim_segmento?: string | null
          sim_subsidio?: number | null
          sim_tem_dependente?: boolean | null
          sim_teto_imovel?: number | null
          status?: string
          timestamp_cliente?: string | null
          tipo?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          fbclid?: string | null
          gclid?: string | null
          id?: string
          nome?: string | null
          origem?: string | null
          pagina?: string | null
          raw?: Json | null
          recebido_em?: string
          referrer?: string | null
          regiao?: string | null
          renda?: string | null
          sim_aluguel?: number | null
          sim_carteira36m?: boolean | null
          sim_entrada?: number | null
          sim_faixa?: number | null
          sim_fgts?: number | null
          sim_financiamento?: number | null
          sim_parcela?: number | null
          sim_renda?: number | null
          sim_segmento?: string | null
          sim_subsidio?: number | null
          sim_tem_dependente?: boolean | null
          sim_teto_imovel?: number | null
          status?: string
          timestamp_cliente?: string | null
          tipo?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      links_uteis: {
        Row: {
          categoria: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          status: string
          titulo: string
          updated_at: string
          url: string
        }
        Insert: {
          categoria: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo: string
          updated_at?: string
          url: string
        }
        Update: {
          categoria?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      links_uteis_acessos: {
        Row: {
          created_at: string
          id: string
          link_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_uteis_acessos_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links_uteis"
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
      oferta_ativa_leads: {
        Row: {
          avancado: boolean
          contatado: boolean
          contatado_em: string | null
          created_at: string
          id: string
          lead_id: string
          oferta_id: string
        }
        Insert: {
          avancado?: boolean
          contatado?: boolean
          contatado_em?: string | null
          created_at?: string
          id?: string
          lead_id: string
          oferta_id: string
        }
        Update: {
          avancado?: boolean
          contatado?: boolean
          contatado_em?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          oferta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oferta_ativa_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_ativa_leads_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "ofertas_ativas"
            referencedColumns: ["id"]
          },
        ]
      }
      ofertas_ativas: {
        Row: {
          corretor_id: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          filtros: Json
          id: string
          nome: string
          status: string
          updated_at: string
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          filtros?: Json
          id?: string
          nome: string
          status?: string
          updated_at?: string
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          filtros?: Json
          id?: string
          nome?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ofertas_ativas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          last_lead_assigned_at: string | null
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
          last_lead_assigned_at?: string | null
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
          last_lead_assigned_at?: string | null
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
          {
            foreignKeyName: "projeto_foco_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "projeto_foco_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      projetos: {
        Row: {
          ano_entrega: number | null
          argumentos_venda: string[]
          ativo: boolean
          bairro: string | null
          book_url: string | null
          cidade: string | null
          construtora: string | null
          created_at: string
          criado_por: string | null
          deleted_at: string | null
          diferenciais: string[]
          dorms_max: number | null
          dorms_min: number | null
          endereco: string | null
          entrega_status: string | null
          fonte: string | null
          id: string
          lat: number | null
          lng: number | null
          logradouro: string | null
          mes_entrega: number | null
          metragem_max: number | null
          metragem_min: number | null
          nome: string
          numero: string | null
          observacoes: string | null
          perfil_ideal: string | null
          preco_a_partir: number | null
          preco_inicial: string | null
          regiao: string | null
          renda_minima: number | null
          slug: string
          sob_consulta: boolean
          status_entrega: string | null
          status_preco: string
          suites: number | null
          tabela_precos_url: string | null
          tipo_extra: string | null
          tipologia: string | null
          updated_at: string
          vagas: string | null
          vagas_max: number | null
          vagas_min: number | null
          vagas_observacao: string | null
          webhook_token: string
          zona_smq: string | null
        }
        Insert: {
          ano_entrega?: number | null
          argumentos_venda?: string[]
          ativo?: boolean
          bairro?: string | null
          book_url?: string | null
          cidade?: string | null
          construtora?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          diferenciais?: string[]
          dorms_max?: number | null
          dorms_min?: number | null
          endereco?: string | null
          entrega_status?: string | null
          fonte?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          logradouro?: string | null
          mes_entrega?: number | null
          metragem_max?: number | null
          metragem_min?: number | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          perfil_ideal?: string | null
          preco_a_partir?: number | null
          preco_inicial?: string | null
          regiao?: string | null
          renda_minima?: number | null
          slug: string
          sob_consulta?: boolean
          status_entrega?: string | null
          status_preco?: string
          suites?: number | null
          tabela_precos_url?: string | null
          tipo_extra?: string | null
          tipologia?: string | null
          updated_at?: string
          vagas?: string | null
          vagas_max?: number | null
          vagas_min?: number | null
          vagas_observacao?: string | null
          webhook_token?: string
          zona_smq?: string | null
        }
        Update: {
          ano_entrega?: number | null
          argumentos_venda?: string[]
          ativo?: boolean
          bairro?: string | null
          book_url?: string | null
          cidade?: string | null
          construtora?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          diferenciais?: string[]
          dorms_max?: number | null
          dorms_min?: number | null
          endereco?: string | null
          entrega_status?: string | null
          fonte?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          logradouro?: string | null
          mes_entrega?: number | null
          metragem_max?: number | null
          metragem_min?: number | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          perfil_ideal?: string | null
          preco_a_partir?: number | null
          preco_inicial?: string | null
          regiao?: string | null
          renda_minima?: number | null
          slug?: string
          sob_consulta?: boolean
          status_entrega?: string | null
          status_preco?: string
          suites?: number | null
          tabela_precos_url?: string | null
          tipo_extra?: string | null
          tipologia?: string | null
          updated_at?: string
          vagas?: string | null
          vagas_max?: number | null
          vagas_min?: number | null
          vagas_observacao?: string | null
          webhook_token?: string
          zona_smq?: string | null
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
          {
            foreignKeyName: "templates_mensagem_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "templates_mensagem_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
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
          {
            foreignKeyName: "unidades_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "unidades_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
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
      vendas: {
        Row: {
          corretor_id: string | null
          created_at: string
          criado_por_id: string | null
          data_assinatura: string
          data_distrato: string | null
          data_recebimento: string | null
          distrato: boolean
          id: string
          lead_id: string | null
          legacy_id: number | null
          motivo_distrato: string | null
          observacoes: string | null
          percentual_comissao: number
          percentual_corretor: number
          percentual_gerente: number
          percentual_superintendente: number
          projeto_id: string | null
          projeto_nome: string | null
          status_recebimento: string
          updated_at: string
          valor_venda: number
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          criado_por_id?: string | null
          data_assinatura?: string
          data_distrato?: string | null
          data_recebimento?: string | null
          distrato?: boolean
          id?: string
          lead_id?: string | null
          legacy_id?: number | null
          motivo_distrato?: string | null
          observacoes?: string | null
          percentual_comissao?: number
          percentual_corretor?: number
          percentual_gerente?: number
          percentual_superintendente?: number
          projeto_id?: string | null
          projeto_nome?: string | null
          status_recebimento?: string
          updated_at?: string
          valor_venda?: number
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          criado_por_id?: string | null
          data_assinatura?: string
          data_distrato?: string | null
          data_recebimento?: string | null
          distrato?: boolean
          id?: string
          lead_id?: string | null
          legacy_id?: number | null
          motivo_distrato?: string | null
          observacoes?: string | null
          percentual_comissao?: number
          percentual_corretor?: number
          percentual_gerente?: number
          percentual_superintendente?: number
          projeto_id?: string | null
          projeto_nome?: string | null
          status_recebimento?: string
          updated_at?: string
          valor_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "vendas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
    }
    Views: {
      copa_pontuacao_semanal: {
        Row: {
          agendamentos: number | null
          analise: number | null
          bonus: number | null
          bonus_observacao: string | null
          corretor_id: string | null
          edicao_id: string | null
          nome: string | null
          observacao: string | null
          semana: number | null
          total_semana: number | null
          vendas: number | null
          visitas: number | null
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
      projetos_alternativa_regiao: {
        Row: {
          alternativa_bairro: string | null
          alternativa_id: string | null
          alternativa_nome: string | null
          alternativa_preco: number | null
          projeto_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _norm_bairro: { Args: { _t: string }; Returns: string }
      _norm_projeto_nome: { Args: { txt: string }; Returns: string }
      _oferta_ativa_query: {
        Args: { _corretor: string; _filtros: Json }
        Returns: {
          campanha: string | null
          consentimento_lgpd: boolean | null
          construtora: string | null
          copiloto_notificado_em: string | null
          corretor_anterior_id: string | null
          corretor_id: string | null
          corretores_que_tentaram: string[]
          cpf: string | null
          created_at: string
          data_distribuicao: string | null
          data_movido_lixeira: string | null
          data_perda: string | null
          decisor: string | null
          deleted_at: string | null
          desfecho: string | null
          docs_pendentes: Json | null
          docs_recebidos: Json | null
          email: string | null
          entrada_disponivel: string | null
          estado: Database["public"]["Enums"]["lead_estado"] | null
          etapa: string | null
          faixa_mcmv: string | null
          fase: string | null
          fgts_valor: number | null
          handoff_em: string | null
          id: string
          legacy_id: number | null
          motivo_handoff: string | null
          motivo_perda_categoria: string | null
          motivo_perdido: string | null
          na_lixeira: boolean
          nome: string
          objecoes: string[]
          observacoes: string | null
          opt_out: boolean
          origem: Database["public"]["Enums"]["lead_origem"]
          projeto_id: string | null
          projeto_nome: string | null
          proxima_acao: string | null
          proximo_followup: string | null
          renda_estimada: number | null
          renda_informada: string | null
          resumo_qualificacao: string | null
          search_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164: string | null
          tem_fgts: boolean | null
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          tipo_renda: string | null
          ultima_interacao: string | null
          ultimo_contato: string | null
          updated_at: string
          usa_fgts: boolean
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          via_webhook: boolean
          visita_data: string | null
          visita_empreendimento: string | null
          visita_hora: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      arquivar_leads_sem_contato_30d: { Args: never; Returns: number }
      atribuir_lead_a_corretor: {
        Args: { _corretor_id: string; _lead_id: string }
        Returns: undefined
      }
      atribuir_oferta_ativa: {
        Args: { _corretor_ids: string[]; _oferta_id: string }
        Returns: Json
      }
      buscar_lead_duplicado: {
        Args: { _projeto_id: string; _telefone: string }
        Returns: string
      }
      copa_apurar_fase: { Args: { _fase_id: string }; Returns: undefined }
      copa_avancar_fase: { Args: never; Returns: string }
      copa_definir_vencedor: {
        Args: { _confronto_id: string; _corretor_id: string }
        Returns: undefined
      }
      copa_get_ajuste_manual: {
        Args: { _corretor_id: string; _semana: number }
        Returns: {
          agendamentos: number
          documentacao: number
          vendas: number
          visitas: number
        }[]
      }
      copa_inicializar_dados: { Args: never; Returns: Json }
      copa_pontos_corretor: {
        Args: { _corretor_id: string; _df: string; _di: string }
        Returns: number
      }
      copa_pontos_por_semana: {
        Args: never
        Returns: {
          corretor_id: string
          pontos: number
          semana: number
        }[]
      }
      copa_ranking: {
        Args: never
        Returns: {
          bandeira: string
          corretor_id: string
          grupo: string
          nome: string
          selecao_id: string
          selecao_nome: string
          total_agendamentos: number
          total_documentacao: number
          total_pontos: number
          total_vendas: number
          total_visitas: number
        }[]
      }
      copa_realizar_sorteio:
        | { Args: never; Returns: undefined }
        | { Args: { _edicao_id: string }; Returns: undefined }
      copa_salvar_pontuacao: {
        Args: {
          _ag: number
          _corretor_id: string
          _doc: number
          _semana: number
          _ve: number
          _vi: number
        }
        Returns: undefined
      }
      copa_salvar_pontuacao_lote: {
        Args: { _edicao_id: string; _rows: Json; _semana: number }
        Returns: number
      }
      copa_set_participante: {
        Args: {
          _ativo: boolean
          _corretor_id: string
          _edicao_id: string
          _grupo: string
          _selecao_id: string
        }
        Returns: undefined
      }
      copa_set_participantes:
        | { Args: { _edicao_id: string; _ids: string[] }; Returns: undefined }
        | { Args: { _ids: string[] }; Returns: undefined }
      copa_set_vencedor: {
        Args: { _confronto_id: string; _vencedor_id: string }
        Returns: undefined
      }
      copa_status_chaveamento: {
        Args: never
        Returns: {
          fase_atual: string
          pode_avancar: boolean
        }[]
      }
      copiloto_set_secret: { Args: { _secret: string }; Returns: undefined }
      corretor_elegivel: { Args: { _corretor_id: string }; Returns: boolean }
      create_oferta_ativa: {
        Args: {
          _corretor?: string
          _descricao: string
          _filtros: Json
          _nome: string
        }
        Returns: string
      }
      dashboard_atividade_periodo: {
        Args: { _df: string; _di: string; _scope: string }
        Returns: Json
      }
      dashboard_funil: {
        Args: { _corretor?: string; _df?: string; _di?: string }
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
          distribuido: boolean
          lead_id: string
          minutos_parado: number
          nome: string
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          total_count: number
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
        Args: { _corretor?: string; _df?: string; _di?: string }
        Returns: {
          motivo: string
          quantidade: number
        }[]
      }
      dashboard_origem: {
        Args: { _corretor?: string; _df?: string; _di?: string }
        Returns: {
          chave: string
          conv_pct: number
          leads: number
          nivel: string
          vendas: number
        }[]
      }
      dashboard_receita: {
        Args: { _corretor?: string; _df?: string; _di?: string }
        Returns: Json
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
        Args: { _corretor?: string; _df?: string; _di?: string }
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
      distribuir_lead_elegivel: {
        Args: { _contar_como_novo?: boolean; _lead_id: string }
        Returns: string
      }
      distribuir_lead_webhook: { Args: never; Returns: string }
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
      gerar_alertas_leads_parados: { Args: never; Returns: undefined }
      gerar_alertas_tarefas_atrasadas: { Args: never; Returns: undefined }
      gerar_comissoes_para_venda: {
        Args: { _venda_id: string }
        Returns: undefined
      }
      gerar_pushes_agendamentos_proximos: { Args: never; Returns: undefined }
      gerar_pushes_lembretes_visita: { Args: never; Returns: undefined }
      gestor_fallback_webhook: { Args: never; Returns: string }
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
      immutable_unaccent: { Args: { "": string }; Returns: string }
      isleadavancado_status:
        | {
            Args: { _status: Database["public"]["Enums"]["lead_status"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.isleadavancado_status(_status => text), public.isleadavancado_status(_status => lead_status). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { _status: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.isleadavancado_status(_status => text), public.isleadavancado_status(_status => lead_status). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      leads_com_sla:
        | {
            Args: { _corretor?: string }
            Returns: {
              lead_id: string
              minutos_decorridos: number
              nome: string
              sla_minutos: number
              sla_status: string
              status: string
              telefone: string
              temperatura_calc: Database["public"]["Enums"]["lead_temperatura"]
            }[]
          }
        | {
            Args: { _corretor?: string; _df?: string; _di?: string }
            Returns: {
              lead_id: string
              minutos_decorridos: number
              nome: string
              sla_minutos: number
              sla_status: string
              status: string
              telefone: string
              temperatura_calc: Database["public"]["Enums"]["lead_temperatura"]
            }[]
          }
      leads_filtered: {
        Args: {
          _corretor?: string
          _limit?: number
          _na_lixeira?: boolean
          _offset?: number
          _origem?: string
          _periodo_end?: string
          _periodo_start?: string
          _search?: string
          _search_digits?: string
          _status?: string
          _temperatura?: string
        }
        Returns: {
          corretor_id: string
          created_at: string
          data_venda: string
          email: string
          entrada_disponivel: string
          id: string
          na_lixeira: boolean
          nome: string
          observacoes: string
          origem: string
          projeto_id: string
          projeto_nome: string
          renda_informada: string
          status: string
          telefone: string
          temperatura: string
          total_count: number
          ultima_interacao: string
          usa_fgts: boolean
        }[]
      }
      leads_status_counts: {
        Args: {
          _corretor?: string
          _na_lixeira?: boolean
          _origem?: string
          _periodo_end?: string
          _periodo_start?: string
          _search?: string
          _search_digits?: string
          _temperatura?: string
        }
        Returns: {
          quantidade: number
          status: string
        }[]
      }
      marcar_lead_perdido: {
        Args: { _categoria?: string; _detalhe?: string; _lead_id: string }
        Returns: string
      }
      marcar_presenca: { Args: { _presente: boolean }; Returns: undefined }
      mesclar_leads: {
        Args: { _lead_destino: string; _lead_origem: string }
        Returns: boolean
      }
      normalize_phone_smq: { Args: { _raw: string }; Returns: string }
      preview_oferta_ativa: {
        Args: { _corretor?: string; _filtros: Json }
        Returns: Json
      }
      processar_distribuicao_automatica: { Args: never; Returns: Json }
      recalcular_temperatura_leads: { Args: never; Returns: number }
      redistribuir_leads_parados: { Args: never; Returns: number }
      redistribuir_sla_webhook: { Args: never; Returns: number }
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
      tempo_primeira_resposta: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          corretor_id: string
          leads_no_periodo: number
          leads_respondidos: number
          tempo_mediana_min: number
          tempo_medio_min: number
        }[]
      }
      transferir_leads: {
        Args: { _corretor: string; _ids: string[] }
        Returns: number
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
      distribuicao_tipo: "automatica" | "manual" | "inicial" | "redistribuicao"
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
      lead_estado:
        | "EM_QUALIFICACAO"
        | "AGUARDANDO_HORARIO"
        | "COM_CORRETOR"
        | "ATENDIMENTO_HUMANO"
        | "EM_FOLLOWUP"
        | "FRIO_REATIVACAO"
        | "ENCERRADO_OPTOUT"
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
        | "aguardando_retorno"
        | "aguardando_corretor"
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
      distribuicao_tipo: ["automatica", "manual", "inicial", "redistribuicao"],
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
      lead_estado: [
        "EM_QUALIFICACAO",
        "AGUARDANDO_HORARIO",
        "COM_CORRETOR",
        "ATENDIMENTO_HUMANO",
        "EM_FOLLOWUP",
        "FRIO_REATIVACAO",
        "ENCERRADO_OPTOUT",
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
        "aguardando_retorno",
        "aguardando_corretor",
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
