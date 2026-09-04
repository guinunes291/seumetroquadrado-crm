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
          auto_gerado: boolean
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
          auto_gerado?: boolean
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
          auto_gerado?: boolean
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
          {
            foreignKeyName: "agendamentos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
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
      alertas_produtividade: {
        Row: {
          corretor_id: string
          created_at: string
          dia: string
          id: string
          lida: boolean
          mensagem: string
          tipo: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          dia?: string
          id?: string
          lida?: boolean
          mensagem: string
          tipo: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          dia?: string
          id?: string
          lida?: boolean
          mensagem?: string
          tipo?: string
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
          {
            foreignKeyName: "analises_credito_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      api_alteracao_auditoria: {
        Row: {
          api_cliente_id: string | null
          api_cliente_nome: string | null
          campo: string
          criado_em: string
          entidade: string
          entidade_id: string
          id: string
          motivo: string | null
          origem: string
          usuario_id: string | null
          usuario_nome: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          api_cliente_id?: string | null
          api_cliente_nome?: string | null
          campo: string
          criado_em?: string
          entidade: string
          entidade_id: string
          id?: string
          motivo?: string | null
          origem?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          api_cliente_id?: string | null
          api_cliente_nome?: string | null
          campo?: string
          criado_em?: string
          entidade?: string
          entidade_id?: string
          id?: string
          motivo?: string | null
          origem?: string
          usuario_id?: string | null
          usuario_nome?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      api_cliente_auditoria: {
        Row: {
          cliente_id: string | null
          created_at: string
          escopo: Database["public"]["Enums"]["api_cliente_escopo"] | null
          http_status: number | null
          id: number
          ip_hash: string | null
          metodo: string
          request_id: string | null
          resultado: string
          rota: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          escopo?: Database["public"]["Enums"]["api_cliente_escopo"] | null
          http_status?: number | null
          id?: never
          ip_hash?: string | null
          metodo: string
          request_id?: string | null
          resultado: string
          rota: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          escopo?: Database["public"]["Enums"]["api_cliente_escopo"] | null
          http_status?: number | null
          id?: never
          ip_hash?: string | null
          metodo?: string
          request_id?: string | null
          resultado?: string
          rota?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_cliente_auditoria_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "api_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      api_cliente_escopos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          escopo: Database["public"]["Enums"]["api_cliente_escopo"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          escopo: Database["public"]["Enums"]["api_cliente_escopo"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          escopo?: Database["public"]["Enums"]["api_cliente_escopo"]
        }
        Relationships: [
          {
            foreignKeyName: "api_cliente_escopos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "api_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      api_clientes: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          equipe_id: string | null
          id: string
          last_used_at: string | null
          motivo_revogacao: string | null
          nome: string
          projeto_id: string | null
          revogado_em: string | null
          revogado_por: string | null
          rotacionado_de_id: string | null
          segredo_hash: string
          segredo_prefixo: string
          substituido_por_id: string | null
          updated_at: string
          valido_ate: string | null
          valido_de: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          equipe_id?: string | null
          id?: string
          last_used_at?: string | null
          motivo_revogacao?: string | null
          nome: string
          projeto_id?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          rotacionado_de_id?: string | null
          segredo_hash: string
          segredo_prefixo: string
          substituido_por_id?: string | null
          updated_at?: string
          valido_ate?: string | null
          valido_de?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          equipe_id?: string | null
          id?: string
          last_used_at?: string | null
          motivo_revogacao?: string | null
          nome?: string
          projeto_id?: string | null
          revogado_em?: string | null
          revogado_por?: string | null
          rotacionado_de_id?: string | null
          segredo_hash?: string
          segredo_prefixo?: string
          substituido_por_id?: string | null
          updated_at?: string
          valido_ate?: string | null
          valido_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_clientes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clientes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clientes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "api_clientes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "api_clientes_rotacionado_de_id_fkey"
            columns: ["rotacionado_de_id"]
            isOneToOne: false
            referencedRelation: "api_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_clientes_substituido_por_id_fkey"
            columns: ["substituido_por_id"]
            isOneToOne: false
            referencedRelation: "api_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      api_escrita_log: {
        Row: {
          acao: string | null
          agente: string | null
          ator: string | null
          diff: Json | null
          http_status: number | null
          id: string
          ip: string | null
          lead_id: string | null
          origem: string | null
          payload: Json | null
          registro_id: string | null
          resultado: string | null
          tabela: string | null
          ts: string
        }
        Insert: {
          acao?: string | null
          agente?: string | null
          ator?: string | null
          diff?: Json | null
          http_status?: number | null
          id?: string
          ip?: string | null
          lead_id?: string | null
          origem?: string | null
          payload?: Json | null
          registro_id?: string | null
          resultado?: string | null
          tabela?: string | null
          ts?: string
        }
        Update: {
          acao?: string | null
          agente?: string | null
          ator?: string | null
          diff?: Json | null
          http_status?: number | null
          id?: string
          ip?: string | null
          lead_id?: string | null
          origem?: string | null
          payload?: Json | null
          registro_id?: string | null
          resultado?: string | null
          tabela?: string | null
          ts?: string
        }
        Relationships: []
      }
      api_escrita_permissoes: {
        Row: {
          acao: string
          agente: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          acao: string
          agente: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          acao?: string
          agente?: string
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      atividades_diarias: {
        Row: {
          agendamentos: number
          corretor_id: string
          created_at: string
          dia: string
          documentacoes: number
          id: string
          ligacoes: number
          pontuacao_total: number
          updated_at: string
          vendas: number
          vgv_dia: number
          visitas: number
          whatsapps: number
        }
        Insert: {
          agendamentos?: number
          corretor_id: string
          created_at?: string
          dia: string
          documentacoes?: number
          id?: string
          ligacoes?: number
          pontuacao_total?: number
          updated_at?: string
          vendas?: number
          vgv_dia?: number
          visitas?: number
          whatsapps?: number
        }
        Update: {
          agendamentos?: number
          corretor_id?: string
          created_at?: string
          dia?: string
          documentacoes?: number
          id?: string
          ligacoes?: number
          pontuacao_total?: number
          updated_at?: string
          vendas?: number
          vgv_dia?: number
          visitas?: number
          whatsapps?: number
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
      bkp_f085_arquivadas_20260731: {
        Row: {
          arquivado_em: string | null
          id: string | null
          lead_id: string | null
          status_anterior: string | null
        }
        Insert: {
          arquivado_em?: string | null
          id?: string | null
          lead_id?: string | null
          status_anterior?: string | null
        }
        Update: {
          arquivado_em?: string | null
          id?: string | null
          lead_id?: string | null
          status_anterior?: string | null
        }
        Relationships: []
      }
      chamadas: {
        Row: {
          atualizado_em: string
          corretor_id: string | null
          criado_em: string
          direcao: string
          duracao_segundos: number | null
          gravacao_url: string | null
          id: string
          lead_id: string | null
          numero: string
          origem: string
          payload: Json
          provider: string
          provider_call_id: string | null
          ramal: string | null
          status: string
          tabulacao: string | null
        }
        Insert: {
          atualizado_em?: string
          corretor_id?: string | null
          criado_em?: string
          direcao: string
          duracao_segundos?: number | null
          gravacao_url?: string | null
          id?: string
          lead_id?: string | null
          numero: string
          origem?: string
          payload?: Json
          provider?: string
          provider_call_id?: string | null
          ramal?: string | null
          status?: string
          tabulacao?: string | null
        }
        Update: {
          atualizado_em?: string
          corretor_id?: string | null
          criado_em?: string
          direcao?: string
          duracao_segundos?: number | null
          gravacao_url?: string | null
          id?: string
          lead_id?: string | null
          numero?: string
          origem?: string
          payload?: Json
          provider?: string
          provider_call_id?: string | null
          ramal?: string | null
          status?: string
          tabulacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chamadas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamadas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "chamadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      comissao_ledger: {
        Row: {
          beneficiario_id: string | null
          beneficiario_tipo: string
          comissao_id: string
          created_at: string
          criado_por: string | null
          evento: string
          id: string
          idempotency_key: string
          metadata: Json
          valor: number
          venda_id: string
        }
        Insert: {
          beneficiario_id?: string | null
          beneficiario_tipo: string
          comissao_id: string
          created_at?: string
          criado_por?: string | null
          evento: string
          id?: string
          idempotency_key: string
          metadata?: Json
          valor: number
          venda_id: string
        }
        Update: {
          beneficiario_id?: string | null
          beneficiario_tipo?: string
          comissao_id?: string
          created_at?: string
          criado_por?: string | null
          evento?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissao_ledger_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissao_ledger_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "dre_vw_vendas_unidade"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "comissao_ledger_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "comissoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "comissoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "dre_vw_vendas_unidade"
            referencedColumns: ["venda_id"]
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
      conciliacoes: {
        Row: {
          comissao_id: string | null
          confirmado_por: string | null
          confirmado_por_nome: string | null
          created_at: string
          data_anterior: string | null
          data_aplicada: string | null
          desfeito_em: string | null
          desfeito_por: string | null
          desfeito_por_nome: string | null
          id: string
          tipo: string
          transacao_id: string
          updated_at: string
          venda_id: string | null
        }
        Insert: {
          comissao_id?: string | null
          confirmado_por?: string | null
          confirmado_por_nome?: string | null
          created_at?: string
          data_anterior?: string | null
          data_aplicada?: string | null
          desfeito_em?: string | null
          desfeito_por?: string | null
          desfeito_por_nome?: string | null
          id?: string
          tipo: string
          transacao_id: string
          updated_at?: string
          venda_id?: string | null
        }
        Update: {
          comissao_id?: string | null
          confirmado_por?: string | null
          confirmado_por_nome?: string | null
          created_at?: string
          data_anterior?: string | null
          data_aplicada?: string | null
          desfeito_em?: string | null
          desfeito_por?: string | null
          desfeito_por_nome?: string | null
          id?: string
          tipo?: string
          transacao_id?: string
          updated_at?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliacoes_comissao_id_fkey"
            columns: ["comissao_id"]
            isOneToOne: false
            referencedRelation: "comissoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "extrato_transacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "dre_vw_vendas_unidade"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "conciliacoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracao_pontuacao: {
        Row: {
          ativo: boolean
          chave: string
          label: string
          pontos: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          label: string
          pontos?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          label?: string
          pontos?: number
          updated_at?: string
        }
        Relationships: []
      }
      construtoras_parceiras: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          id: string
          logo_url: string | null
          nome: string
          observacao: string | null
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          observacao?: string | null
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          observacao?: string | null
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      conta_auditoria: {
        Row: {
          autor_id: string
          created_at: string
          id: string
          status_anterior: Database["public"]["Enums"]["status_conta"] | null
          status_novo: Database["public"]["Enums"]["status_conta"]
          usuario_id: string
        }
        Insert: {
          autor_id: string
          created_at?: string
          id?: string
          status_anterior?: Database["public"]["Enums"]["status_conta"] | null
          status_novo: Database["public"]["Enums"]["status_conta"]
          usuario_id: string
        }
        Update: {
          autor_id?: string
          created_at?: string
          id?: string
          status_anterior?: Database["public"]["Enums"]["status_conta"] | null
          status_novo?: Database["public"]["Enums"]["status_conta"]
          usuario_id?: string
        }
        Relationships: []
      }
      conversas_tratadas: {
        Row: {
          lead_id: string
          tratada_em: string
          tratada_por: string | null
        }
        Insert: {
          lead_id: string
          tratada_em?: string
          tratada_por?: string | null
        }
        Update: {
          lead_id?: string
          tratada_em?: string
          tratada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_tratadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_tratadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "conversas_tratadas_tratada_por_fkey"
            columns: ["tratada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_tratadas_tratada_por_fkey"
            columns: ["tratada_por"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
        ]
      }
      convites_crm: {
        Row: {
          aceito_em: string | null
          aceito_por: string | null
          created_at: string
          criado_por: string
          email: string
          email_normalizado: string | null
          equipe_id: string | null
          estado: Database["public"]["Enums"]["convite_crm_estado"]
          expira_em: string
          id: string
          papel: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          aceito_em?: string | null
          aceito_por?: string | null
          created_at?: string
          criado_por?: string
          email: string
          email_normalizado?: string | null
          equipe_id?: string | null
          estado?: Database["public"]["Enums"]["convite_crm_estado"]
          expira_em?: string
          id?: string
          papel: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          aceito_em?: string | null
          aceito_por?: string | null
          created_at?: string
          criado_por?: string
          email?: string
          email_normalizado?: string | null
          equipe_id?: string | null
          estado?: Database["public"]["Enums"]["convite_crm_estado"]
          expira_em?: string
          id?: string
          papel?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_crm_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
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
          {
            foreignKeyName: "copiloto_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      distribuicao_config: {
        Row: {
          origem: Database["public"]["Enums"]["lead_origem"]
          roleta_slug: string | null
          sla_minutos: number
          timeout_horas: number
          timeout_minutos: number | null
          updated_at: string
        }
        Insert: {
          origem: Database["public"]["Enums"]["lead_origem"]
          roleta_slug?: string | null
          sla_minutos?: number
          timeout_horas?: number
          timeout_minutos?: number | null
          updated_at?: string
        }
        Update: {
          origem?: Database["public"]["Enums"]["lead_origem"]
          roleta_slug?: string | null
          sla_minutos?: number
          timeout_horas?: number
          timeout_minutos?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribuicao_config_roleta_slug_fkey"
            columns: ["roleta_slug"]
            isOneToOne: false
            referencedRelation: "roletas"
            referencedColumns: ["slug"]
          },
        ]
      }
      distribuicao_excecoes: {
        Row: {
          contexto: Json | null
          created_at: string
          detalhe: string | null
          id: string
          lead_id: string
          motivo: string
          resolucao: string | null
          resolvida_em: string | null
          resolvida_por: string | null
          roleta_slug: string | null
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          contexto?: Json | null
          created_at?: string
          detalhe?: string | null
          id?: string
          lead_id: string
          motivo: string
          resolucao?: string | null
          resolvida_em?: string | null
          resolvida_por?: string | null
          roleta_slug?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          contexto?: Json | null
          created_at?: string
          detalhe?: string | null
          id?: string
          lead_id?: string
          motivo?: string
          resolucao?: string | null
          resolvida_em?: string | null
          resolvida_por?: string | null
          roleta_slug?: string | null
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribuicao_excecoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_excecoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      distribuicao_log_contexto: {
        Row: {
          contexto: Json
          created_at: string
          log_id: string
        }
        Insert: {
          contexto: Json
          created_at?: string
          log_id: string
        }
        Update: {
          contexto?: Json
          created_at?: string
          log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribuicao_log_contexto_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: true
            referencedRelation: "distribution_log"
            referencedColumns: ["id"]
          },
        ]
      }
      distribuicao_settings: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string
          updated_por: string | null
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string
          updated_por?: string | null
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string
          updated_por?: string | null
          valor?: Json
        }
        Relationships: []
      }
      distribuicao_sombra: {
        Row: {
          classe_lead: string | null
          contexto: Json
          criado_em: string
          faixa_v2: string | null
          id: string
          lead_id: string | null
          roleta_slug: string | null
          vencedor_real: string | null
          vencedor_v2: string | null
        }
        Insert: {
          classe_lead?: string | null
          contexto?: Json
          criado_em?: string
          faixa_v2?: string | null
          id?: string
          lead_id?: string | null
          roleta_slug?: string | null
          vencedor_real?: string | null
          vencedor_v2?: string | null
        }
        Update: {
          classe_lead?: string | null
          contexto?: Json
          criado_em?: string
          faixa_v2?: string | null
          id?: string
          lead_id?: string | null
          roleta_slug?: string | null
          vencedor_real?: string | null
          vencedor_v2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribuicao_sombra_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_sombra_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      distribution_log: {
        Row: {
          corretor_id: string | null
          created_at: string
          distribuido_por_id: string | null
          id: string
          lead_id: string
          motivo: string | null
          regra_aplicada: string | null
          resultado: string
          roleta_slug: string | null
          tipo: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          distribuido_por_id?: string | null
          id?: string
          lead_id: string
          motivo?: string | null
          regra_aplicada?: string | null
          resultado?: string
          roleta_slug?: string | null
          tipo: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          distribuido_por_id?: string | null
          id?: string
          lead_id?: string
          motivo?: string | null
          regra_aplicada?: string | null
          resultado?: string
          roleta_slug?: string | null
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
          {
            foreignKeyName: "distribution_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      documentacao_versoes: {
        Row: {
          ativa: boolean
          created_at: string
          documentacao_id: string
          enviado_por: string
          id: string
          lead_id: string
          mime_type: string
          nome_original: string
          object_path: string
          removido_em: string | null
          removido_por: string | null
          tamanho_bytes: number
          versao: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          documentacao_id: string
          enviado_por: string
          id?: string
          lead_id: string
          mime_type: string
          nome_original: string
          object_path: string
          removido_em?: string | null
          removido_por?: string | null
          tamanho_bytes: number
          versao: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          documentacao_id?: string
          enviado_por?: string
          id?: string
          lead_id?: string
          mime_type?: string
          nome_original?: string
          object_path?: string
          removido_em?: string | null
          removido_por?: string | null
          tamanho_bytes?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentacao_versoes_documentacao_id_fkey"
            columns: ["documentacao_id"]
            isOneToOne: false
            referencedRelation: "documentacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentacao_versoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentacao_versoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      documentacoes: {
        Row: {
          arquivo_nome: string | null
          arquivo_path: string | null
          classificado_por: string | null
          confianca_ia: number | null
          corretor_id: string | null
          created_at: string
          id: string
          lead_id: string
          message_id: string | null
          mime_type: string | null
          observacoes: string | null
          origem: string | null
          recebido_em: string | null
          status: string
          tamanho_bytes: number | null
          tipo: string
          updated_at: string
          url: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          classificado_por?: string | null
          confianca_ia?: number | null
          corretor_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          message_id?: string | null
          mime_type?: string | null
          observacoes?: string | null
          origem?: string | null
          recebido_em?: string | null
          status?: string
          tamanho_bytes?: number | null
          tipo: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_path?: string | null
          classificado_por?: string | null
          confianca_ia?: number | null
          corretor_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          message_id?: string | null
          mime_type?: string | null
          observacoes?: string | null
          origem?: string | null
          recebido_em?: string | null
          status?: string
          tamanho_bytes?: number | null
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
          {
            foreignKeyName: "documentacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      dre_categorias_despesa: {
        Row: {
          ativa: boolean
          grupo: string
          id: string
          nome: string
        }
        Insert: {
          ativa?: boolean
          grupo: string
          id?: string
          nome: string
        }
        Update: {
          ativa?: boolean
          grupo?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      dre_despesas: {
        Row: {
          categoria_id: string
          competencia: string
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          descricao: string
          fornecedor: string | null
          id: string
          observacoes: string | null
          recorrente: boolean
          unidade_id: string
          valor: number
        }
        Insert: {
          categoria_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          descricao: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          recorrente?: boolean
          unidade_id: string
          valor: number
        }
        Update: {
          categoria_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          descricao?: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          recorrente?: boolean
          unidade_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "dre_despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "dre_categorias_despesa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dre_despesas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dre_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_orcamento: {
        Row: {
          ano: number
          id: string
          linha: string
          mes: number
          unidade_id: string
          valor: number
        }
        Insert: {
          ano: number
          id?: string
          linha: string
          mes: number
          unidade_id: string
          valor: number
        }
        Update: {
          ano?: number
          id?: string
          linha?: string
          mes?: number
          unidade_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "dre_orcamento_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dre_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_parametros: {
        Row: {
          caixa_minimo_meses_custo_fixo: number
          comissao_total_pct: number
          consultor_pct: number
          created_at: string
          gerente_pct: number
          id: string
          imposto_sobre_faturamento_pct: number
          reinvestimento_pct_ebitda: number
          reserva_expansao_pct_ebitda: number
          socio_operador_pct: number
          unidade_id: string | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          caixa_minimo_meses_custo_fixo?: number
          comissao_total_pct: number
          consultor_pct: number
          created_at?: string
          gerente_pct: number
          id?: string
          imposto_sobre_faturamento_pct: number
          reinvestimento_pct_ebitda: number
          reserva_expansao_pct_ebitda: number
          socio_operador_pct: number
          unidade_id?: string | null
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          caixa_minimo_meses_custo_fixo?: number
          comissao_total_pct?: number
          consultor_pct?: number
          created_at?: string
          gerente_pct?: number
          id?: string
          imposto_sobre_faturamento_pct?: number
          reinvestimento_pct_ebitda?: number
          reserva_expansao_pct_ebitda?: number
          socio_operador_pct?: number
          unidade_id?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "dre_parametros_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dre_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_socios_participacao: {
        Row: {
          id: string
          percentual: number
          socio_nome: string
          unidade_id: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          id?: string
          percentual: number
          socio_nome: string
          unidade_id: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          id?: string
          percentual?: number
          socio_nome?: string
          unidade_id?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "dre_socios_participacao_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dre_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_unidade_membros: {
        Row: {
          id: string
          papel: string
          profile_id: string
          unidade_id: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          id?: string
          papel?: string
          profile_id: string
          unidade_id: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          id?: string
          papel?: string
          profile_id?: string
          unidade_id?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "dre_unidade_membros_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dre_unidade_membros_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "dre_unidade_membros_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dre_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_unidades: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          operador_nome: string | null
          ordem: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          operador_nome?: string | null
          ordem?: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          operador_nome?: string | null
          ordem?: number
        }
        Relationships: []
      }
      dre_venda_unidade: {
        Row: {
          definido_em: string
          definido_por: string | null
          unidade_id: string
          venda_id: string
        }
        Insert: {
          definido_em?: string
          definido_por?: string | null
          unidade_id: string
          venda_id: string
        }
        Update: {
          definido_em?: string
          definido_por?: string | null
          unidade_id?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dre_venda_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "dre_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dre_venda_unidade_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "dre_vw_vendas_unidade"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "dre_venda_unidade_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: true
            referencedRelation: "vendas"
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
      extrato_transacoes: {
        Row: {
          arquivo: string | null
          conta: string
          contraparte: string | null
          created_at: string
          data: string
          descricao: string
          fitid: string
          id: string
          importado_em: string
          importado_por: string | null
          motivo_ignorada: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          arquivo?: string | null
          conta: string
          contraparte?: string | null
          created_at?: string
          data: string
          descricao?: string
          fitid: string
          id?: string
          importado_em?: string
          importado_por?: string | null
          motivo_ignorada?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          arquivo?: string | null
          conta?: string
          contraparte?: string | null
          created_at?: string
          data?: string
          descricao?: string
          fitid?: string
          id?: string
          importado_em?: string
          importado_por?: string | null
          motivo_ignorada?: string | null
          status?: string
          updated_at?: string
          valor?: number
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
      gestao_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          descricao: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          descricao: string
          valor: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          descricao?: string
          valor?: Json
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
          {
            foreignKeyName: "interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      landing_webhook_idempotency: {
        Row: {
          created_at: string
          expires_at: string
          key_hash: string
          lease_expires_at: string | null
          lease_token: string | null
          request_hash: string
          response_body: Json | null
          response_status: number | null
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          key_hash: string
          lease_expires_at?: string | null
          lease_token?: string | null
          request_hash: string
          response_body?: Json | null
          response_status?: number | null
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          key_hash?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          request_hash?: string
          response_body?: Json | null
          response_status?: number | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      landing_webhook_rate_limits: {
        Row: {
          expires_at: string
          key_hash: string
          request_count: number
          window_started_at: string
        }
        Insert: {
          expires_at: string
          key_hash: string
          request_count: number
          window_started_at: string
        }
        Update: {
          expires_at?: string
          key_hash?: string
          request_count?: number
          window_started_at?: string
        }
        Relationships: []
      }
      lead_acessos: {
        Row: {
          ativo: boolean
          concedido_em: string
          concedido_por: string | null
          id: string
          lead_id: string
          motivo: string
          motivo_remocao: string | null
          papel: string
          removido_em: string | null
          removido_por: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          concedido_em?: string
          concedido_por?: string | null
          id?: string
          lead_id: string
          motivo: string
          motivo_remocao?: string | null
          papel?: string
          removido_em?: string | null
          removido_por?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          concedido_em?: string
          concedido_por?: string | null
          id?: string
          lead_id?: string
          motivo?: string
          motivo_remocao?: string | null
          papel?: string
          removido_em?: string | null
          removido_por?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_acessos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_acessos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
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
          {
            foreignKeyName: "lead_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
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
          {
            foreignKeyName: "lead_status_transitions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      leads: {
        Row: {
          bairro: string | null
          campanha: string | null
          canal_entrada: string | null
          classe_lead: string
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
          followup_esgotado_em: string | null
          followup_reativado_em: string | null
          handoff_em: string | null
          id: string
          import_batch_id: string | null
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
          pasta_montada_em: string | null
          projeto_id: string | null
          projeto_nome: string | null
          proxima_acao: string | null
          proximo_followup: string | null
          renda_estimada: number | null
          renda_informada: string | null
          resumo_qualificacao: string | null
          roleta_slug: string | null
          sdr_devolvido_em: string | null
          sdr_entregue_em: string | null
          sdr_id: string | null
          sdr_interesse_confirmado: boolean
          search_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164: string | null
          tem_fgts: boolean | null
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          tipo_renda: string | null
          ultima_atividade_em: string
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
          zona: string | null
        }
        Insert: {
          bairro?: string | null
          campanha?: string | null
          canal_entrada?: string | null
          classe_lead?: string
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
          followup_esgotado_em?: string | null
          followup_reativado_em?: string | null
          handoff_em?: string | null
          id?: string
          import_batch_id?: string | null
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
          pasta_montada_em?: string | null
          projeto_id?: string | null
          projeto_nome?: string | null
          proxima_acao?: string | null
          proximo_followup?: string | null
          renda_estimada?: number | null
          renda_informada?: string | null
          resumo_qualificacao?: string | null
          roleta_slug?: string | null
          sdr_devolvido_em?: string | null
          sdr_entregue_em?: string | null
          sdr_id?: string | null
          sdr_interesse_confirmado?: boolean
          search_text?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164?: string | null
          tem_fgts?: boolean | null
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao?: number
          timestamp_recebimento?: string | null
          tipo_renda?: string | null
          ultima_atividade_em?: string
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
          zona?: string | null
        }
        Update: {
          bairro?: string | null
          campanha?: string | null
          canal_entrada?: string | null
          classe_lead?: string
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
          followup_esgotado_em?: string | null
          followup_reativado_em?: string | null
          handoff_em?: string | null
          id?: string
          import_batch_id?: string | null
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
          pasta_montada_em?: string | null
          projeto_id?: string | null
          projeto_nome?: string | null
          proxima_acao?: string | null
          proximo_followup?: string | null
          renda_estimada?: number | null
          renda_informada?: string | null
          resumo_qualificacao?: string | null
          roleta_slug?: string | null
          sdr_devolvido_em?: string | null
          sdr_entregue_em?: string | null
          sdr_id?: string | null
          sdr_interesse_confirmado?: boolean
          search_text?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone?: string
          telefone_e164?: string | null
          tem_fgts?: boolean | null
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao?: number
          timestamp_recebimento?: string | null
          tipo_renda?: string | null
          ultima_atividade_em?: string
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
          zona?: string | null
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
      leads_import_tmp: {
        Row: {
          created_at: string
          email: string | null
          empreendimento: string | null
          id: number
          nome: string | null
          projeto_id: string | null
          telefone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          empreendimento?: string | null
          id?: number
          nome?: string | null
          projeto_id?: string | null
          telefone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          empreendimento?: string | null
          id?: number
          nome?: string | null
          projeto_id?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      leads_landing: {
        Row: {
          created_at: string
          fbclid: string | null
          gclid: string | null
          id: string
          idempotency_key_hash: string | null
          idempotency_request_hash: string | null
          lead_id: string | null
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
          idempotency_key_hash?: string | null
          idempotency_request_hash?: string | null
          lead_id?: string | null
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
          idempotency_key_hash?: string | null
          idempotency_request_hash?: string | null
          lead_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "leads_landing_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_landing_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      leads_merge_log: {
        Row: {
          chave_telefone: string
          created_at: string
          dados_mesclados: Json
          id: string
          lead_mantido: string
          lead_mesclado: string
          registros_repontados: Json
        }
        Insert: {
          chave_telefone: string
          created_at?: string
          dados_mesclados?: Json
          id?: string
          lead_mantido: string
          lead_mesclado: string
          registros_repontados?: Json
        }
        Update: {
          chave_telefone?: string
          created_at?: string
          dados_mesclados?: Json
          id?: string
          lead_mantido?: string
          lead_mesclado?: string
          registros_repontados?: Json
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
      mcp_config: {
        Row: {
          chave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      mcp_identidade: {
        Row: {
          ativo: boolean
          created_at: string
          nota: string | null
          uid: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          nota?: string | null
          uid: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          nota?: string | null
          uid?: string
          updated_at?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          atualizado_em: string
          canal: string
          conteudo: string | null
          corretor_id: string | null
          criado_em: string
          direcao: string
          erro: string | null
          id: string
          lead_id: string
          midia_url: string | null
          provider: string | null
          provider_message_id: string | null
          recebida_em: string
          status: string
          template_nome: string | null
        }
        Insert: {
          atualizado_em?: string
          canal?: string
          conteudo?: string | null
          corretor_id?: string | null
          criado_em?: string
          direcao: string
          erro?: string | null
          id?: string
          lead_id: string
          midia_url?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recebida_em?: string
          status?: string
          template_nome?: string | null
        }
        Update: {
          atualizado_em?: string
          canal?: string
          conteudo?: string | null
          corretor_id?: string | null
          criado_em?: string
          direcao?: string
          erro?: string | null
          id?: string
          lead_id?: string
          midia_url?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recebida_em?: string
          status?: string
          template_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "mensagens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
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
      metas_dia_corretor: {
        Row: {
          corretor_id: string
          created_at: string
          dia: string
          id: string
          meta_agendamentos: number
          meta_documentacoes: number
          meta_vendas_semana: number
          respondido_em: string
          semana_inicio: string
          updated_at: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          dia: string
          id?: string
          meta_agendamentos?: number
          meta_documentacoes?: number
          meta_vendas_semana?: number
          respondido_em?: string
          semana_inicio: string
          updated_at?: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          dia?: string
          id?: string
          meta_agendamentos?: number
          meta_documentacoes?: number
          meta_vendas_semana?: number
          respondido_em?: string
          semana_inicio?: string
          updated_at?: string
        }
        Relationships: []
      }
      metas_diarias: {
        Row: {
          ativo: boolean
          corretor_id: string
          created_at: string
          id: string
          meta_agendamentos: number
          meta_ligacoes: number
          meta_vendas: number
          meta_visitas: number
          meta_whatsapps: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          corretor_id: string
          created_at?: string
          id?: string
          meta_agendamentos?: number
          meta_ligacoes?: number
          meta_vendas?: number
          meta_visitas?: number
          meta_whatsapps?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          corretor_id?: string
          created_at?: string
          id?: string
          meta_agendamentos?: number
          meta_ligacoes?: number
          meta_vendas?: number
          meta_visitas?: number
          meta_whatsapps?: number
          updated_at?: string
        }
        Relationships: []
      }
      metric_webhook_settings: {
        Row: {
          enabled: boolean
          id: number
          token: string | null
          updated_at: string
          url: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          token?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          enabled?: boolean
          id?: number
          token?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
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
            foreignKeyName: "oferta_ativa_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
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
          {
            foreignKeyName: "ofertas_ativas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
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
          modelo_contrato: string | null
          nome: string
          numero: string | null
          onboarding_concluido_em: string | null
          perfil_completo: boolean
          presente: boolean
          presente_em: string | null
          ramal_sonax: string | null
          situacao: string | null
          sonax_id_atendente: string | null
          sonax_id_campanha: string | null
          status_conta: Database["public"]["Enums"]["status_conta"]
          telefone: string | null
          updated_at: string
          zonas: string[]
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
          modelo_contrato?: string | null
          nome?: string
          numero?: string | null
          onboarding_concluido_em?: string | null
          perfil_completo?: boolean
          presente?: boolean
          presente_em?: string | null
          ramal_sonax?: string | null
          situacao?: string | null
          sonax_id_atendente?: string | null
          sonax_id_campanha?: string | null
          status_conta?: Database["public"]["Enums"]["status_conta"]
          telefone?: string | null
          updated_at?: string
          zonas?: string[]
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
          modelo_contrato?: string | null
          nome?: string
          numero?: string | null
          onboarding_concluido_em?: string | null
          perfil_completo?: boolean
          presente?: boolean
          presente_em?: string | null
          ramal_sonax?: string | null
          situacao?: string | null
          sonax_id_atendente?: string | null
          sonax_id_campanha?: string | null
          status_conta?: Database["public"]["Enums"]["status_conta"]
          telefone?: string | null
          updated_at?: string
          zonas?: string[]
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
      projeto_eventos: {
        Row: {
          created_at: string
          detalhe: string | null
          id: string
          lead_id: string | null
          origem: string
          projeto_id: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detalhe?: string | null
          id?: string
          lead_id?: string | null
          origem?: string
          projeto_id: string
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detalhe?: string | null
          id?: string
          lead_id?: string | null
          origem?: string
          projeto_id?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projeto_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "projeto_eventos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_eventos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "projeto_eventos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      projeto_foco: {
        Row: {
          arte_url: string | null
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
          arte_url?: string | null
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
          arte_url?: string | null
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
          capa_url: string | null
          cidade: string | null
          construtora: string | null
          created_at: string
          criado_por: string | null
          deleted_at: string | null
          diferenciais: string[]
          disponibilidade_resumo: string | null
          dorms_max: number | null
          dorms_min: number | null
          endereco: string | null
          entrega_status: string | null
          fonte: string | null
          galeria_urls: string[]
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
          percentual_comissao: number | null
          perfil_ideal: string | null
          preco_a_partir: number | null
          preco_atualizado_em: string | null
          preco_inicial: string | null
          regiao: string | null
          renda_minima: number | null
          slug: string
          sob_consulta: boolean
          status_entrega: string | null
          status_preco: string
          suites: number | null
          tabela_atualizada_em: string | null
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
          capa_url?: string | null
          cidade?: string | null
          construtora?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          diferenciais?: string[]
          disponibilidade_resumo?: string | null
          dorms_max?: number | null
          dorms_min?: number | null
          endereco?: string | null
          entrega_status?: string | null
          fonte?: string | null
          galeria_urls?: string[]
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
          percentual_comissao?: number | null
          perfil_ideal?: string | null
          preco_a_partir?: number | null
          preco_atualizado_em?: string | null
          preco_inicial?: string | null
          regiao?: string | null
          renda_minima?: number | null
          slug: string
          sob_consulta?: boolean
          status_entrega?: string | null
          status_preco?: string
          suites?: number | null
          tabela_atualizada_em?: string | null
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
          capa_url?: string | null
          cidade?: string | null
          construtora?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          diferenciais?: string[]
          disponibilidade_resumo?: string | null
          dorms_max?: number | null
          dorms_min?: number | null
          endereco?: string | null
          entrega_status?: string | null
          fonte?: string | null
          galeria_urls?: string[]
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
          percentual_comissao?: number | null
          perfil_ideal?: string | null
          preco_a_partir?: number | null
          preco_atualizado_em?: string | null
          preco_inicial?: string | null
          regiao?: string | null
          renda_minima?: number | null
          slug?: string
          sob_consulta?: boolean
          status_entrega?: string | null
          status_preco?: string
          suites?: number | null
          tabela_atualizada_em?: string | null
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
      projetos_metragem_backup_20260902: {
        Row: {
          corrigido_em: string
          metragem_max: number | null
          metragem_min: number | null
          preco_a_partir: number | null
          projeto_id: string
        }
        Insert: {
          corrigido_em?: string
          metragem_max?: number | null
          metragem_min?: number | null
          preco_a_partir?: number | null
          projeto_id: string
        }
        Update: {
          corrigido_em?: string
          metragem_max?: number | null
          metragem_min?: number | null
          preco_a_partir?: number | null
          projeto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_metragem_backup_20260902_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_metragem_backup_20260902_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "projetos_metragem_backup_20260902_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      propostas: {
        Row: {
          condicoes: Json
          corretor_id: string
          created_at: string
          deleted_at: string | null
          id: string
          lead_id: string | null
          link_token: string | null
          observacoes: string | null
          projeto_id: string | null
          status: string
          unidade_id: string | null
          updated_at: string
          validade: string | null
          valor: number | null
        }
        Insert: {
          condicoes?: Json
          corretor_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id?: string | null
          link_token?: string | null
          observacoes?: string | null
          projeto_id?: string | null
          status?: string
          unidade_id?: string | null
          updated_at?: string
          validade?: string | null
          valor?: number | null
        }
        Update: {
          condicoes?: Json
          corretor_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_id?: string | null
          link_token?: string | null
          observacoes?: string | null
          projeto_id?: string | null
          status?: string
          unidade_id?: string | null
          updated_at?: string
          validade?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "propostas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "propostas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "propostas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas_visitantes: {
        Row: {
          convertido_lead_id: string | null
          corretor_id: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          projeto_id: string | null
          telefone: string | null
          valor: number | null
        }
        Insert: {
          convertido_lead_id?: string | null
          corretor_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          projeto_id?: string | null
          telefone?: string | null
          valor?: number | null
        }
        Update: {
          convertido_lead_id?: string | null
          corretor_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          projeto_id?: string | null
          telefone?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_visitantes_convertido_lead_id_fkey"
            columns: ["convertido_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_visitantes_convertido_lead_id_fkey"
            columns: ["convertido_lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "propostas_visitantes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_visitantes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "propostas_visitantes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          attempts: number
          body: string
          created_at: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_token: string | null
          next_attempt_at: string | null
          sent_at: string | null
          tag: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          next_attempt_at?: string | null
          sent_at?: string | null
          tag?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          next_attempt_at?: string | null
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
      roleta_participantes: {
        Row: {
          agendamentos_janela: number
          ativo: boolean
          corretor_id: string
          faixa_amostra: number
          id: string
          incluido_em: string
          incluido_por: string | null
          leads_janela: number
          limite_diario: number | null
          motivo_pausa: string | null
          pausado_ate: string | null
          roleta_id: string
          tier: string
          tier_score: number
          tier_updated_at: string | null
          ultimo_lead_em: string | null
          updated_at: string
          vendas_janela: number
          wrr_current: number
        }
        Insert: {
          agendamentos_janela?: number
          ativo?: boolean
          corretor_id: string
          faixa_amostra?: number
          id?: string
          incluido_em?: string
          incluido_por?: string | null
          leads_janela?: number
          limite_diario?: number | null
          motivo_pausa?: string | null
          pausado_ate?: string | null
          roleta_id: string
          tier?: string
          tier_score?: number
          tier_updated_at?: string | null
          ultimo_lead_em?: string | null
          updated_at?: string
          vendas_janela?: number
          wrr_current?: number
        }
        Update: {
          agendamentos_janela?: number
          ativo?: boolean
          corretor_id?: string
          faixa_amostra?: number
          id?: string
          incluido_em?: string
          incluido_por?: string | null
          leads_janela?: number
          limite_diario?: number | null
          motivo_pausa?: string | null
          pausado_ate?: string | null
          roleta_id?: string
          tier?: string
          tier_score?: number
          tier_updated_at?: string | null
          ultimo_lead_em?: string | null
          updated_at?: string
          vendas_janela?: number
          wrr_current?: number
        }
        Relationships: [
          {
            foreignKeyName: "roleta_participantes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleta_participantes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "roleta_participantes_roleta_id_fkey"
            columns: ["roleta_id"]
            isOneToOne: false
            referencedRelation: "roletas"
            referencedColumns: ["id"]
          },
        ]
      }
      roleta_participantes_log: {
        Row: {
          acao: string
          corretor_id: string
          created_at: string
          feito_por: string | null
          id: string
          motivo: string | null
          roleta_id: string
        }
        Insert: {
          acao: string
          corretor_id: string
          created_at?: string
          feito_por?: string | null
          id?: string
          motivo?: string | null
          roleta_id: string
        }
        Update: {
          acao?: string
          corretor_id?: string
          created_at?: string
          feito_por?: string | null
          id?: string
          motivo?: string | null
          roleta_id?: string
        }
        Relationships: []
      }
      roleta_tier_historico: {
        Row: {
          agendamentos_janela: number
          corretor_id: string
          criado_em: string
          gatilho: string
          id: string
          leads_janela: number
          roleta_id: string
          score: number
          tier_anterior: string | null
          tier_novo: string
          vendas_janela: number
        }
        Insert: {
          agendamentos_janela?: number
          corretor_id: string
          criado_em?: string
          gatilho?: string
          id?: string
          leads_janela?: number
          roleta_id: string
          score: number
          tier_anterior?: string | null
          tier_novo: string
          vendas_janela?: number
        }
        Update: {
          agendamentos_janela?: number
          corretor_id?: string
          criado_em?: string
          gatilho?: string
          id?: string
          leads_janela?: number
          roleta_id?: string
          score?: number
          tier_anterior?: string | null
          tier_novo?: string
          vendas_janela?: number
        }
        Relationships: [
          {
            foreignKeyName: "roleta_tier_historico_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleta_tier_historico_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "roleta_tier_historico_roleta_id_fkey"
            columns: ["roleta_id"]
            isOneToOne: false
            referencedRelation: "roletas"
            referencedColumns: ["id"]
          },
        ]
      }
      roletas: {
        Row: {
          amostra_minima: number
          ativo: boolean
          created_at: string
          criterio_participacao: string
          descricao: string | null
          equipe_fixa: boolean
          exigir_presenca: boolean
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          janela_ag_dias: number
          janela_venda_dias: number
          nome: string
          permitir_fora_horario: boolean
          peso_agendamento: number
          peso_tier_a: number
          peso_tier_b: number
          peso_tier_c: number
          peso_venda: number
          projeto_id: string | null
          slug: string
          threshold_a: number
          threshold_c: number
          tiers_recalculados_em: string | null
          tipo: string
          updated_at: string
          webhook_token: string | null
        }
        Insert: {
          amostra_minima?: number
          ativo?: boolean
          created_at?: string
          criterio_participacao?: string
          descricao?: string | null
          equipe_fixa?: boolean
          exigir_presenca?: boolean
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          janela_ag_dias?: number
          janela_venda_dias?: number
          nome: string
          permitir_fora_horario?: boolean
          peso_agendamento?: number
          peso_tier_a?: number
          peso_tier_b?: number
          peso_tier_c?: number
          peso_venda?: number
          projeto_id?: string | null
          slug: string
          threshold_a?: number
          threshold_c?: number
          tiers_recalculados_em?: string | null
          tipo?: string
          updated_at?: string
          webhook_token?: string | null
        }
        Update: {
          amostra_minima?: number
          ativo?: boolean
          created_at?: string
          criterio_participacao?: string
          descricao?: string | null
          equipe_fixa?: boolean
          exigir_presenca?: boolean
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          janela_ag_dias?: number
          janela_venda_dias?: number
          nome?: string
          permitir_fora_horario?: boolean
          peso_agendamento?: number
          peso_tier_a?: number
          peso_tier_b?: number
          peso_tier_c?: number
          peso_venda?: number
          projeto_id?: string | null
          slug?: string
          threshold_a?: number
          threshold_c?: number
          tiers_recalculados_em?: string | null
          tipo?: string
          updated_at?: string
          webhook_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roletas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roletas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "roletas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      samiq_execucoes: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string
          equipe_id: string | null
          error_code: string | null
          estimated_cost_micros: number | null
          expires_at: string
          id: string
          input_cost_micros_per_million: number | null
          input_tokens: number | null
          latency_ms: number | null
          model_id: string
          output_cost_micros_per_million: number | null
          output_tokens: number | null
          prompt_version: string
          reserved_input_tokens: number
          reserved_output_tokens: number
          status: string
          user_id: string
        }
        Insert: {
          action: string
          completed_at?: string | null
          created_at?: string
          equipe_id?: string | null
          error_code?: string | null
          estimated_cost_micros?: number | null
          expires_at: string
          id?: string
          input_cost_micros_per_million?: number | null
          input_tokens?: number | null
          latency_ms?: number | null
          model_id: string
          output_cost_micros_per_million?: number | null
          output_tokens?: number | null
          prompt_version: string
          reserved_input_tokens: number
          reserved_output_tokens: number
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string
          equipe_id?: string | null
          error_code?: string | null
          estimated_cost_micros?: number | null
          expires_at?: string
          id?: string
          input_cost_micros_per_million?: number | null
          input_tokens?: number | null
          latency_ms?: number | null
          model_id?: string
          output_cost_micros_per_million?: number | null
          output_tokens?: number | null
          prompt_version?: string
          reserved_input_tokens?: number
          reserved_output_tokens?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "samiq_execucoes_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samiq_execucoes_prompt_version_fkey"
            columns: ["prompt_version"]
            isOneToOne: false
            referencedRelation: "samiq_prompt_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      samiq_politica: {
        Row: {
          id: number
          max_cost_team_micros_day: number | null
          max_cost_user_micros_day: number | null
          max_requests_team_10m: number
          max_requests_user_10m: number
          max_tokens_team_day: number
          max_tokens_user_day: number
          reservation_ttl_seconds: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          max_cost_team_micros_day?: number | null
          max_cost_user_micros_day?: number | null
          max_requests_team_10m?: number
          max_requests_user_10m?: number
          max_tokens_team_day?: number
          max_tokens_user_day?: number
          reservation_ttl_seconds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          max_cost_team_micros_day?: number | null
          max_cost_user_micros_day?: number | null
          max_requests_team_10m?: number
          max_requests_user_10m?: number
          max_tokens_team_day?: number
          max_tokens_user_day?: number
          reservation_ttl_seconds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      samiq_prompt_versions: {
        Row: {
          action_prompts: Json
          active: boolean
          created_at: string
          created_by: string | null
          input_cost_micros_per_million: number | null
          max_output_tokens: number
          model_id: string
          output_cost_micros_per_million: number | null
          pricing_version: string | null
          system_prompt: string
          updated_at: string
          version: string
        }
        Insert: {
          action_prompts: Json
          active?: boolean
          created_at?: string
          created_by?: string | null
          input_cost_micros_per_million?: number | null
          max_output_tokens?: number
          model_id: string
          output_cost_micros_per_million?: number | null
          pricing_version?: string | null
          system_prompt: string
          updated_at?: string
          version: string
        }
        Update: {
          action_prompts?: Json
          active?: boolean
          created_at?: string
          created_by?: string | null
          input_cost_micros_per_million?: number | null
          max_output_tokens?: number
          model_id?: string
          output_cost_micros_per_million?: number | null
          pricing_version?: string | null
          system_prompt?: string
          updated_at?: string
          version?: string
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
      service_bots: {
        Row: {
          created_at: string
          descricao: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sla_estouros: {
        Row: {
          corretor_id: string
          criado_em: string
          id: string
          lead_id: string | null
          roleta_slug: string | null
          sla_minutos: number | null
        }
        Insert: {
          corretor_id: string
          criado_em?: string
          id?: string
          lead_id?: string | null
          roleta_slug?: string | null
          sla_minutos?: number | null
        }
        Update: {
          corretor_id?: string
          criado_em?: string
          id?: string
          lead_id?: string | null
          roleta_slug?: string | null
          sla_minutos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_estouros_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_estouros_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "sla_estouros_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_estouros_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
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
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
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
      user_preferences: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
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
      venda_integridade_conflitos: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          motivo: string
          venda_conflitante_id: string
          venda_preservada_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          motivo: string
          venda_conflitante_id: string
          venda_preservada_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          motivo?: string
          venda_conflitante_id?: string
          venda_preservada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_integridade_conflitos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_integridade_conflitos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "venda_integridade_conflitos_venda_conflitante_id_fkey"
            columns: ["venda_conflitante_id"]
            isOneToOne: true
            referencedRelation: "dre_vw_vendas_unidade"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "venda_integridade_conflitos_venda_conflitante_id_fkey"
            columns: ["venda_conflitante_id"]
            isOneToOne: true
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_integridade_conflitos_venda_preservada_id_fkey"
            columns: ["venda_preservada_id"]
            isOneToOne: false
            referencedRelation: "dre_vw_vendas_unidade"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "venda_integridade_conflitos_venda_preservada_id_fkey"
            columns: ["venda_preservada_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_metricas_ledger: {
        Row: {
          corretor_id: string
          created_at: string
          criado_por: string | null
          dia: string
          evento: string
          id: string
          idempotency_key: string
          origem: string
          venda_id: string
          vendas_delta: number
          vgv_delta: number
        }
        Insert: {
          corretor_id: string
          created_at?: string
          criado_por?: string | null
          dia: string
          evento: string
          id?: string
          idempotency_key: string
          origem: string
          venda_id: string
          vendas_delta: number
          vgv_delta: number
        }
        Update: {
          corretor_id?: string
          created_at?: string
          criado_por?: string | null
          dia?: string
          evento?: string
          id?: string
          idempotency_key?: string
          origem?: string
          venda_id?: string
          vendas_delta?: number
          vgv_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "venda_metricas_ledger_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "dre_vw_vendas_unidade"
            referencedColumns: ["venda_id"]
          },
          {
            foreignKeyName: "venda_metricas_ledger_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          apto_repasse: boolean
          apto_repasse_em: string | null
          ato_pago: boolean
          ato_pago_em: string | null
          contrato_assinado: boolean
          contrato_assinado_em: string | null
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
          motivo_decisao: string | null
          motivo_distrato: string | null
          observacoes: string | null
          percentual_comissao: number
          percentual_corretor: number
          percentual_gerente: number
          percentual_superintendente: number
          projeto_id: string | null
          projeto_nome: string | null
          status_recebimento: string
          status_venda: Database["public"]["Enums"]["status_venda"]
          status_venda_updated_at: string
          unidade: string | null
          updated_at: string
          valor_venda: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          apto_repasse?: boolean
          apto_repasse_em?: string | null
          ato_pago?: boolean
          ato_pago_em?: string | null
          contrato_assinado?: boolean
          contrato_assinado_em?: string | null
          corretor_id?: string | null
          created_at?: string
          criado_por_id?: string | null
          data_assinatura: string
          data_distrato?: string | null
          data_recebimento?: string | null
          distrato?: boolean
          id?: string
          lead_id?: string | null
          legacy_id?: number | null
          motivo_decisao?: string | null
          motivo_distrato?: string | null
          observacoes?: string | null
          percentual_comissao?: number
          percentual_corretor?: number
          percentual_gerente?: number
          percentual_superintendente?: number
          projeto_id?: string | null
          projeto_nome?: string | null
          status_recebimento?: string
          status_venda?: Database["public"]["Enums"]["status_venda"]
          status_venda_updated_at?: string
          unidade?: string | null
          updated_at?: string
          valor_venda?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          apto_repasse?: boolean
          apto_repasse_em?: string | null
          ato_pago?: boolean
          ato_pago_em?: string | null
          contrato_assinado?: boolean
          contrato_assinado_em?: string | null
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
          motivo_decisao?: string | null
          motivo_distrato?: string | null
          observacoes?: string | null
          percentual_comissao?: number
          percentual_corretor?: number
          percentual_gerente?: number
          percentual_superintendente?: number
          projeto_id?: string | null
          projeto_nome?: string | null
          status_recebimento?: string
          status_venda?: Database["public"]["Enums"]["status_venda"]
          status_venda_updated_at?: string
          unidade?: string | null
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
            foreignKeyName: "vendas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
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
      visita_execucoes: {
        Row: {
          agendamento_id: string
          atualizada_por: string
          checklist: Json
          concluida_em: string | null
          corretor_id: string
          created_at: string
          criada_por: string
          id: string
          iniciada_em: string
          interesse: string | null
          lead_id: string
          nota_transcrita: string | null
          objecao_principal: string | null
          observacoes: string | null
          proxima_acao: string | null
          proxima_etapa: Database["public"]["Enums"]["lead_status"] | null
          proximo_followup: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agendamento_id: string
          atualizada_por: string
          checklist?: Json
          concluida_em?: string | null
          corretor_id: string
          created_at?: string
          criada_por: string
          id?: string
          iniciada_em?: string
          interesse?: string | null
          lead_id: string
          nota_transcrita?: string | null
          objecao_principal?: string | null
          observacoes?: string | null
          proxima_acao?: string | null
          proxima_etapa?: Database["public"]["Enums"]["lead_status"] | null
          proximo_followup?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string
          atualizada_por?: string
          checklist?: Json
          concluida_em?: string | null
          corretor_id?: string
          created_at?: string
          criada_por?: string
          id?: string
          iniciada_em?: string
          interesse?: string | null
          lead_id?: string
          nota_transcrita?: string | null
          objecao_principal?: string | null
          observacoes?: string | null
          proxima_acao?: string | null
          proxima_etapa?: Database["public"]["Enums"]["lead_status"] | null
          proximo_followup?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visita_execucoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: true
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_execucoes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_execucoes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "v_wip_corretor"
            referencedColumns: ["corretor_id"]
          },
          {
            foreignKeyName: "visita_execucoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_execucoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      visitas: {
        Row: {
          agendamento_id: string | null
          corretor_id: string
          created_at: string
          data_visita: string
          id: string
          lead_id: string | null
          observacoes: string | null
          projeto_id: string | null
          registrado_por_id: string | null
          resultado: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          corretor_id: string
          created_at?: string
          data_visita?: string
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          projeto_id?: string | null
          registrado_por_id?: string | null
          resultado?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          corretor_id?: string
          created_at?: string
          data_visita?: string
          id?: string
          lead_id?: string | null
          observacoes?: string | null
          projeto_id?: string | null
          registrado_por_id?: string | null
          resultado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "visitas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "visitas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      vitrine_link_eventos: {
        Row: {
          created_at: string
          cta_tipo: string | null
          id: number
          idempotency_key: string
          link_id: string
          projeto_id: string | null
          tipo: Database["public"]["Enums"]["vitrine_evento_tipo"]
        }
        Insert: {
          created_at?: string
          cta_tipo?: string | null
          id?: number
          idempotency_key: string
          link_id: string
          projeto_id?: string | null
          tipo: Database["public"]["Enums"]["vitrine_evento_tipo"]
        }
        Update: {
          created_at?: string
          cta_tipo?: string | null
          id?: number
          idempotency_key?: string
          link_id?: string
          projeto_id?: string | null
          tipo?: Database["public"]["Enums"]["vitrine_evento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_link_eventos_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "vitrine_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitrine_link_eventos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitrine_link_eventos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "vitrine_link_eventos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      vitrine_link_projetos: {
        Row: {
          created_at: string
          link_id: string
          ordem: number
          projeto_id: string
        }
        Insert: {
          created_at?: string
          link_id: string
          ordem: number
          projeto_id: string
        }
        Update: {
          created_at?: string
          link_id?: string
          ordem?: number
          projeto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_link_projetos_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "vitrine_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitrine_link_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitrine_link_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["alternativa_id"]
          },
          {
            foreignKeyName: "vitrine_link_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_alternativa_regiao"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      vitrine_links: {
        Row: {
          created_at: string
          criado_por: string
          expira_em: string
          id: string
          lead_id: string
          limite_janela_inicio: string | null
          limite_janela_requisicoes: number
          revogado_em: string | null
          revogado_por: string | null
          token_hash: string
          total_aberturas: number
          total_eventos: number
          total_requisicoes: number
          ultimo_acesso_em: string | null
        }
        Insert: {
          created_at?: string
          criado_por: string
          expira_em: string
          id?: string
          lead_id: string
          limite_janela_inicio?: string | null
          limite_janela_requisicoes?: number
          revogado_em?: string | null
          revogado_por?: string | null
          token_hash: string
          total_aberturas?: number
          total_eventos?: number
          total_requisicoes?: number
          ultimo_acesso_em?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string
          expira_em?: string
          id?: string
          lead_id?: string
          limite_janela_inicio?: string | null
          limite_janela_requisicoes?: number
          revogado_em?: string | null
          revogado_por?: string | null
          token_hash?: string
          total_aberturas?: number
          total_eventos?: number
          total_requisicoes?: number
          ultimo_acesso_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitrine_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      zonas_bairros: {
        Row: {
          bairro: string
          criado_em: string
          zona: string
        }
        Insert: {
          bairro: string
          criado_em?: string
          zona: string
        }
        Update: {
          bairro?: string
          criado_em?: string
          zona?: string
        }
        Relationships: []
      }
      zonas_roletas: {
        Row: {
          criado_em: string
          roleta_slug: string
          zona: string
        }
        Insert: {
          criado_em?: string
          roleta_slug: string
          zona: string
        }
        Update: {
          criado_em?: string
          roleta_slug?: string
          zona?: string
        }
        Relationships: [
          {
            foreignKeyName: "zonas_roletas_roleta_slug_fkey"
            columns: ["roleta_slug"]
            isOneToOne: false
            referencedRelation: "roletas"
            referencedColumns: ["slug"]
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
      dre_vw_vendas_unidade: {
        Row: {
          cliente: string | null
          corretor_id: string | null
          corretor_nome: string | null
          data_assinatura: string | null
          data_recebimento: string | null
          distrato: boolean | null
          empreendimento: string | null
          lead_id: string | null
          origem_atribuicao: string | null
          status_venda: Database["public"]["Enums"]["status_venda"] | null
          unidade_id: string | null
          valor_venda: number | null
          venda_id: string | null
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
            foreignKeyName: "vendas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_parados"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      mcp_colunas_sem_grant: {
        Row: {
          coluna: string | null
          tabela: string | null
        }
        Relationships: []
      }
      mcp_escrita_hoje: {
        Row: {
          acao: string | null
          resultado: string | null
          tabela: string | null
          total: number | null
          ultima: string | null
        }
        Relationships: []
      }
      mcp_tabelas_sem_guarda: {
        Row: {
          tabela: string | null
        }
        Relationships: []
      }
      metric_webhook_status: {
        Row: {
          enabled: boolean | null
          id: number | null
          token_set: boolean | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          enabled?: boolean | null
          id?: number | null
          token_set?: never
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          enabled?: boolean | null
          id?: number | null
          token_set?: never
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
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
      v_contato_efetivo: {
        Row: {
          com_resposta: number | null
          corretor_id: string | null
          nome: string | null
          primeiros_contatos: number | null
        }
        Relationships: []
      }
      v_leads_parados: {
        Row: {
          classe_lead: string | null
          corretor_id: string | null
          corretor_nome: string | null
          dias_sem_registro: number | null
          lead_id: string | null
          nome: string | null
          regra_dias: number | null
          status: Database["public"]["Enums"]["lead_status"] | null
          ultima_atividade_em: string | null
        }
        Relationships: []
      }
      v_velocidade_corretor: {
        Row: {
          amostra: number | null
          corretor_id: string | null
          mediana_min: number | null
          nome: string | null
          p90_min: number | null
        }
        Relationships: []
      }
      v_wip_corretor: {
        Row: {
          corretor_id: string | null
          disjuntor: number | null
          leads_ativos: number | null
          nome: string | null
        }
        Insert: {
          corretor_id?: string | null
          disjuntor?: never
          leads_ativos?: never
          nome?: string | null
        }
        Update: {
          corretor_id?: string | null
          disjuntor?: never
          leads_ativos?: never
          nome?: string | null
        }
        Relationships: []
      }
      vw_leads_telefone_duplicado: {
        Row: {
          lead_ids: string[] | null
          projeto_id: string | null
          qtd: number | null
          telefone_digits: string | null
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
    }
    Functions: {
      _alertar_gestores_distribuicao: {
        Args: {
          _link?: string
          _mensagem: string
          _ref: string
          _titulo: string
        }
        Returns: undefined
      }
      _apto_extra_v2: {
        Args: { _corretor_id: string }
        Returns: {
          apto: boolean
          motivos: string[]
        }[]
      }
      _auditar_redistribuicao: {
        Args: {
          _anterior: string
          _lead_id: string
          _motivo: string
          _novo: string
        }
        Returns: undefined
      }
      _dentro_horario_comercial_brt: { Args: never; Returns: boolean }
      _devolver_lead_ao_sdr: {
        Args: { _gatilho: string; _lead_id: string; _motivo: string }
        Returns: boolean
      }
      _distribuir_lead_sdr: {
        Args: {
          _fim?: string
          _gatilho?: string
          _inicio?: string
          _lead_id: string
          _motivo: string
        }
        Returns: Json
      }
      _distribuir_lead_v3: {
        Args: {
          _contexto_extra?: Json
          _corretor_id?: string
          _distribuido_por?: string
          _gatilho?: string
          _lead_id: string
          _registrar_excecao?: boolean
          _roleta_slug?: string
          _tipo?: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Returns: Json
      }
      _dre_calcular_unidade: {
        Args: {
          p_ano: number
          p_modo_pct: string
          p_regime: string
          p_unidade_id: string
        }
        Returns: {
          linha: string
          mes: number
          valor: number
        }[]
      }
      _dre_pct: {
        Args: { p_modo: string; p_pct_param: number; p_pct_venda: number }
        Returns: number
      }
      _dre_vendas_calc: {
        Args: {
          p_ano: number
          p_modo_pct: string
          p_regime: string
          p_unidade_id: string
        }
        Returns: {
          cliente: string
          consultor: number
          corretor_nome: string
          data_assinatura: string
          data_recebimento: string
          empreendimento: string
          faturamento: number
          gerente: number
          impostos: number
          lead_id: string
          mes: number
          socio_operador: number
          venda_id: string
          vgv: number
        }[]
      }
      _elegibilidade_roleta: {
        Args: { _corretor_id?: string; _slug: string }
        Returns: {
          aguardando: number
          apto: boolean
          carteira_total: number
          corretor_id: string
          incluido_em: string
          incluido_por: string
          limite_diario: number
          motivo_pausa: string
          motivos: string[]
          nome: string
          participante_ativo: boolean
          pausado: boolean
          pct_trabalhado: number
          presente: boolean
          recebidos_hoje: number
          recebidos_mes: number
          ultimo_lead_em: string
        }[]
      }
      _elegibilidade_roleta_sdr: {
        Args: { _fim?: string; _inicio?: string; _slug: string }
        Returns: {
          aguardando: number
          apto: boolean
          carteira_total: number
          corretor_id: string
          incluido_em: string
          incluido_por: string
          limite_diario: number
          motivo_pausa: string
          motivos: string[]
          nome: string
          participante_ativo: boolean
          pausado: boolean
          pct_trabalhado: number
          presente: boolean
          recebidos_hoje: number
          recebidos_mes: number
          ultimo_lead_em: string
        }[]
      }
      _escalar_lead_gestor: {
        Args: { _lead_id: string; _tentativas: number }
        Returns: undefined
      }
      _gestao_escopo: { Args: never; Returns: Record<string, unknown> }
      _minutos_uteis_entre: {
        Args: { _ate: string; _de: string }
        Returns: number
      }
      _modelo_v2_ativo: { Args: never; Returns: boolean }
      _norm_bairro: { Args: { _t: string }; Returns: string }
      _norm_projeto_nome: { Args: { txt: string }; Returns: string }
      _notificar_handoff_novo_dono: {
        Args: { _corretor_id: string; _lead_id: string; _motivo: string }
        Returns: undefined
      }
      _oferta_ativa_query: {
        Args: { _corretor: string; _filtros: Json }
        Returns: {
          bairro: string | null
          campanha: string | null
          canal_entrada: string | null
          classe_lead: string
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
          followup_esgotado_em: string | null
          followup_reativado_em: string | null
          handoff_em: string | null
          id: string
          import_batch_id: string | null
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
          pasta_montada_em: string | null
          projeto_id: string | null
          projeto_nome: string | null
          proxima_acao: string | null
          proximo_followup: string | null
          renda_estimada: number | null
          renda_informada: string | null
          resumo_qualificacao: string | null
          roleta_slug: string | null
          sdr_devolvido_em: string | null
          sdr_entregue_em: string | null
          sdr_id: string | null
          sdr_interesse_confirmado: boolean
          search_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164: string | null
          tem_fgts: boolean | null
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          tipo_renda: string | null
          ultima_atividade_em: string
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
          zona: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      _proximo_sdr: { Args: never; Returns: string }
      _registrar_estouro_sla: {
        Args: { _corretor: string; _lead: string; _slug: string }
        Returns: undefined
      }
      _registrar_excecao_distribuicao: {
        Args: {
          _contexto?: Json
          _detalhe: string
          _lead_id: string
          _motivo: string
          _roleta_slug: string
        }
        Returns: string
      }
      _resolver_roleta_lead: {
        Args: {
          _canal: string
          _origem: Database["public"]["Enums"]["lead_origem"]
        }
        Returns: string
      }
      _roleta_pronta: { Args: { _slug: string }; Returns: boolean }
      _sdr_agenda_conflita: {
        Args: { _corretor_id: string; _fim: string; _inicio: string }
        Returns: boolean
      }
      _sdr_ativo: { Args: never; Returns: boolean }
      _sdr_gate_lead: {
        Args: {
          _lead: Database["public"]["Tables"]["leads"]["Row"]
          _uid: string
        }
        Returns: undefined
      }
      _sdr_log_base: {
        Args: {
          _extra?: Json
          _gatilho: string
          _lead_id: string
          _motivo: string
          _regra: string
          _sdr_id: string
        }
        Returns: undefined
      }
      _sdr_set_status: {
        Args: {
          _agente: string
          _forcar?: boolean
          _lead_id: string
          _motivo: string
          _novo: Database["public"]["Enums"]["lead_status"]
          _proxima_acao: string
        }
        Returns: undefined
      }
      _sdr_setting_int: {
        Args: { _chave: string; _default: number }
        Returns: number
      }
      _telefone_e164_br: { Args: { _telefone: string }; Returns: string }
      _wip_corretor: { Args: { _corretor_id: string }; Returns: number }
      agendar_visita_sdr: {
        Args: {
          _data_fim?: string
          _data_inicio: string
          _descricao?: string
          _lead_id: string
          _local?: string
          _proxima_acao?: string
          _titulo?: string
        }
        Returns: Json
      }
      alertar_leads_sem_atendimento: { Args: never; Returns: undefined }
      alertar_roletas_sem_apto: { Args: never; Returns: undefined }
      alertar_volume_desproporcional: { Args: never; Returns: undefined }
      alimentar_base_sdr_perdidos: { Args: never; Returns: number }
      alocar_espelho_lead: {
        Args: {
          _corretor_id: string
          _lead_id: string
          _modo: string
          _motivo: string
        }
        Returns: Json
      }
      aplicar_desconto_comissao: {
        Args: {
          _comissao_id: string
          _percentual_desconto: number
          _valor_liquido: number
        }
        Returns: undefined
      }
      aprovar_venda: {
        Args: {
          p_decisao: Database["public"]["Enums"]["status_venda"]
          p_motivo?: string
          p_venda_id: string
        }
        Returns: {
          aprovado_em: string | null
          aprovado_por: string | null
          apto_repasse: boolean
          apto_repasse_em: string | null
          ato_pago: boolean
          ato_pago_em: string | null
          contrato_assinado: boolean
          contrato_assinado_em: string | null
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
          motivo_decisao: string | null
          motivo_distrato: string | null
          observacoes: string | null
          percentual_comissao: number
          percentual_corretor: number
          percentual_gerente: number
          percentual_superintendente: number
          projeto_id: string | null
          projeto_nome: string | null
          status_recebimento: string
          status_venda: Database["public"]["Enums"]["status_venda"]
          status_venda_updated_at: string
          unidade: string | null
          updated_at: string
          valor_venda: number
        }
        SetofOptions: {
          from: "*"
          to: "vendas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      arquivar_leads_sem_contato_30d: { Args: never; Returns: number }
      atendimento_inbox_v2: {
        Args: { _corretor_id?: string; _limit_per_queue?: number }
        Returns: {
          fila: string
          items: Json
          total_count: number
        }[]
      }
      atendimento_inbox_v3: {
        Args: { _corretor_id?: string; _limit_per_queue?: number }
        Returns: {
          fila: string
          items: Json
          total_count: number
        }[]
      }
      atendimento_inbox_v4: {
        Args: { _corretor_id?: string; _limit_per_queue?: number }
        Returns: {
          fila: string
          items: Json
          total_count: number
        }[]
      }
      ativar_convite_por_email: {
        Args: { _convite_id: string }
        Returns: string
      }
      atribuir_lead_a_corretor: {
        Args: { _corretor_id: string; _lead_id: string }
        Returns: undefined
      }
      atribuir_oferta_ativa: {
        Args: { _corretor_ids: string[]; _oferta_id: string }
        Returns: Json
      }
      atribuir_oferta_ativa_lote: {
        Args: {
          _batch_size?: number
          _corretor_ids: string[]
          _oferta_id: string
        }
        Returns: Json
      }
      atualizar_corretor_distribuicao: {
        Args: {
          _corretor_id: string
          _limite_diario_webhook?: number
          _limpar_modelo_contrato?: boolean
          _modelo_contrato?: string
          _onboarding_concluido?: boolean
          _zonas?: string[]
        }
        Returns: Json
      }
      atualizar_distribuicao_config: {
        Args: {
          _limpar_roleta?: boolean
          _limpar_timeout_minutos?: boolean
          _origem: Database["public"]["Enums"]["lead_origem"]
          _roleta_slug?: string
          _sla_minutos?: number
          _timeout_horas?: number
          _timeout_minutos?: number
        }
        Returns: Json
      }
      atualizar_distribuicao_setting: {
        Args: { _chave: string; _valor: Json }
        Returns: Json
      }
      atualizar_efetivacao_venda: {
        Args: {
          p_apto_repasse?: boolean
          p_ato_pago?: boolean
          p_contrato_assinado?: boolean
          p_venda_id: string
        }
        Returns: {
          aprovado_em: string | null
          aprovado_por: string | null
          apto_repasse: boolean
          apto_repasse_em: string | null
          ato_pago: boolean
          ato_pago_em: string | null
          contrato_assinado: boolean
          contrato_assinado_em: string | null
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
          motivo_decisao: string | null
          motivo_distrato: string | null
          observacoes: string | null
          percentual_comissao: number
          percentual_corretor: number
          percentual_gerente: number
          percentual_superintendente: number
          projeto_id: string | null
          projeto_nome: string | null
          status_recebimento: string
          status_venda: Database["public"]["Enums"]["status_venda"]
          status_venda_updated_at: string
          unidade: string | null
          updated_at: string
          valor_venda: number
        }
        SetofOptions: {
          from: "*"
          to: "vendas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      atualizar_meu_perfil: {
        Args: { p_avatar_url?: string; p_nome: string; p_telefone?: string }
        Returns: {
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
          modelo_contrato: string | null
          nome: string
          numero: string | null
          onboarding_concluido_em: string | null
          perfil_completo: boolean
          presente: boolean
          presente_em: string | null
          ramal_sonax: string | null
          situacao: string | null
          sonax_id_atendente: string | null
          sonax_id_campanha: string | null
          status_conta: Database["public"]["Enums"]["status_conta"]
          telefone: string | null
          updated_at: string
          zonas: string[]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      atualizar_roleta: {
        Args: {
          _ativo?: boolean
          _equipe_fixa?: boolean
          _exigir_presenca?: boolean
          _horario_fim?: string
          _horario_inicio?: string
          _limpar_projeto?: boolean
          _permitir_fora_horario?: boolean
          _projeto_id?: string
          _slug: string
        }
        Returns: Json
      }
      begin_landing_webhook_request: {
        Args: {
          _key_hash: string
          _lease_seconds?: number
          _request_hash: string
          _ttl_seconds?: number
        }
        Returns: {
          disposition: string
          lease_token: string
          response_body: Json
          response_status: number
          retry_after_seconds: number
        }[]
      }
      bump_atividade: {
        Args: {
          _ag?: number
          _corretor: string
          _dia: string
          _doc?: number
          _lig?: number
          _ven?: number
          _vgv?: number
          _vis?: number
          _wa?: number
        }
        Returns: undefined
      }
      buscar_lead_ativo_por_telefone_global: {
        Args: { _telefone: string }
        Returns: string
      }
      buscar_lead_duplicado: {
        Args: { _projeto_id: string; _telefone: string }
        Returns: string
      }
      buscar_lead_por_telefone: { Args: { _telefone: string }; Returns: string }
      claim_push_outbox: {
        Args: { _lease_seconds?: number; _limit?: number }
        Returns: {
          attempts: number
          body: string
          id: string
          lease_token: string
          tag: string
          title: string
          url: string
          user_id: string
        }[]
      }
      cleanup_landing_webhook_state: {
        Args: { _batch_size?: number }
        Returns: {
          idempotency_deleted: number
          rate_limits_deleted: number
        }[]
      }
      complete_landing_webhook_request: {
        Args: {
          _key_hash: string
          _lease_token: string
          _request_hash: string
          _response_body: Json
          _response_status: number
          _ttl_seconds?: number
        }
        Returns: boolean
      }
      consume_landing_webhook_rate_limit: {
        Args: {
          _key_hash: string
          _max_requests: number
          _window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      consumir_vitrine_requisicao: {
        Args: { _token_hash: string }
        Returns: string
      }
      conta_atual_ativa: { Args: never; Returns: boolean }
      conversa_aguardando_resposta: {
        Args: { _lead_id: string }
        Returns: {
          aguardando: boolean
          ultima_entrada: string
        }[]
      }
      conversa_estado: { Args: { _lead_id: string }; Returns: Json }
      conversas_aguardando_resposta: {
        Args: { _lead_ids: string[] }
        Returns: {
          aguardando: boolean
          lead_id: string
          ultima_entrada: string
        }[]
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
      corretores_do_gestor: { Args: { _user_id: string }; Returns: string[] }
      create_oferta_ativa: {
        Args: {
          _corretor?: string
          _descricao: string
          _filtros: Json
          _nome: string
        }
        Returns: string
      }
      criar_lead_dedup: { Args: { _payload: Json }; Returns: Json }
      criar_roleta_campanha: {
        Args: {
          _equipe_fixa?: boolean
          _nome: string
          _projeto_id?: string
          _slug?: string
        }
        Returns: Json
      }
      criar_vitrine_link: {
        Args: {
          _ator_id: string
          _expira_em: string
          _lead_id: string
          _projeto_ids: string[]
          _token_hash: string
        }
        Returns: string
      }
      dashboard_atividade_periodo: {
        Args: { _campo_data?: string; _df: string; _di: string; _scope: string }
        Returns: Json
      }
      dashboard_funil: {
        Args: {
          _campo_data?: string
          _corretor?: string
          _df?: string
          _di?: string
        }
        Returns: {
          etapa: string
          ordem: number
          quantidade: number
        }[]
      }
      dashboard_kpis: {
        Args: {
          _campo_data?: string
          _corretor?: string
          _df?: string
          _di?: string
        }
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
        Args: { _campo_data?: string; _df: string; _di: string }
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
        Args: {
          _campo_data?: string
          _corretor?: string
          _df?: string
          _di?: string
        }
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
        Args: {
          _campo_data?: string
          _corretor?: string
          _df?: string
          _di?: string
        }
        Returns: {
          agendamentos: number
          dia: string
          leads: number
          vendas: number
          visitas: number
        }[]
      }
      definir_status_conta: {
        Args: {
          _autor_id: string
          _status: Database["public"]["Enums"]["status_conta"]
          _usuario_id: string
        }
        Returns: boolean
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
      devolver_lead_ao_sdr: {
        Args: { _lead_id: string; _motivo: string }
        Returns: Json
      }
      devolver_leads_followup_vencido: { Args: never; Returns: number }
      devolver_leads_posse_expirada: { Args: never; Returns: number }
      devolver_leads_sdr_parados: { Args: never; Returns: number }
      disparar_repasse_sla_lead: {
        Args: { _lead_id: string }
        Returns: boolean
      }
      distribuir_estoque_roleta: {
        Args: { _limite?: number; _roleta?: string }
        Returns: Json
      }
      distribuir_estoque_sdr: { Args: { _limite?: number }; Returns: Json }
      distribuir_lead: {
        Args: {
          _distribuido_por?: string
          _lead_id: string
          _tipo?: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Returns: string
      }
      distribuir_lead_ponderado: {
        Args: { _lead_id: string; _roleta_slug: string }
        Returns: Json
      }
      distribuir_lead_v3: {
        Args: {
          _corretor_id?: string
          _gatilho?: string
          _lead_id: string
          _roleta_slug?: string
          _tipo?: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Returns: Json
      }
      documentacao_storage_autorizado: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      documentacao_upload_valido: {
        Args: { _metadata: Json }
        Returns: boolean
      }
      dre_avisos: {
        Args: { p_ano: number; p_unidade_id: string }
        Returns: {
          pendentes_qtd: number
          pendentes_vgv: number
          sem_recebimento_qtd: number
          sem_recebimento_vgv: number
          sem_unidade_qtd: number
          sem_unidade_vgv: number
        }[]
      }
      dre_calcular: {
        Args: {
          p_ano: number
          p_modo_pct?: string
          p_regime?: string
          p_unidade_id: string
        }
        Returns: {
          linha: string
          mes: number
          ordem: number
          rotulo: string
          valor: number
        }[]
      }
      dre_drill_vendas: {
        Args: {
          p_ano: number
          p_mes: number
          p_modo_pct?: string
          p_regime?: string
          p_unidade_id: string
        }
        Returns: {
          cliente: string
          consultor: number
          corretor_nome: string
          data_assinatura: string
          data_recebimento: string
          empreendimento: string
          faturamento: number
          gerente: number
          impostos: number
          lead_id: string
          socio_operador: number
          unidade_nome: string
          venda_id: string
          vgv: number
        }[]
      }
      dre_param_vigente: {
        Args: { p_data: string; p_unidade_id: string }
        Returns: {
          caixa_minimo_meses_custo_fixo: number
          comissao_total_pct: number
          consultor_pct: number
          created_at: string
          gerente_pct: number
          id: string
          imposto_sobre_faturamento_pct: number
          reinvestimento_pct_ebitda: number
          reserva_expansao_pct_ebitda: number
          socio_operador_pct: number
          unidade_id: string | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        SetofOptions: {
          from: "*"
          to: "dre_parametros"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dre_renda_pessoas: {
        Args: { p_ano: number }
        Returns: {
          nome: string
          profile_id: string
          tipo: string
          total: number
        }[]
      }
      elegibilidade_roleta: {
        Args: { _slug: string }
        Returns: {
          aguardando: number
          apto: boolean
          carteira_total: number
          corretor_id: string
          incluido_em: string
          incluido_por: string
          limite_diario: number
          motivo_pausa: string
          motivos: string[]
          nome: string
          participante_ativo: boolean
          pausado: boolean
          pct_trabalhado: number
          presente: boolean
          recebidos_hoje: number
          recebidos_mes: number
          ultimo_lead_em: string
        }[]
      }
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
      entregar_lead_sdr: {
        Args: { _lead_id: string; _motivo: string }
        Returns: Json
      }
      equipe_metricas_campanha: {
        Args: { _roleta_id: string }
        Returns: {
          agendamentos_janela: number
          corretor_id: string
          leads_janela: number
          vendas_janela: number
        }[]
      }
      excluir_venda: {
        Args: { p_motivo?: string; p_venda_id: string }
        Returns: undefined
      }
      excluir_venda_lancamento_errado: {
        Args: { p_motivo: string; p_venda_id: string }
        Returns: undefined
      }
      expirar_lixeira_antiga: { Args: never; Returns: undefined }
      faixa_mcmv_norm: { Args: { _v: string }; Returns: string }
      fechamento_sinais_v1: { Args: { _limit?: number }; Returns: Json }
      followup_fila_v1: {
        Args: { _corretor?: string; _take?: number }
        Returns: Json
      }
      followup_tentativas: { Args: { _lead_id: string }; Returns: number }
      followup_toques_do_lead: {
        Args: { _lead_id: string }
        Returns: {
          canal: string
          quando: string
        }[]
      }
      funil_ordem: {
        Args: { _s: Database["public"]["Enums"]["lead_status"] }
        Returns: number
      }
      gerar_alertas_agendamentos_proximos: { Args: never; Returns: undefined }
      gerar_alertas_leads_parados: { Args: never; Returns: undefined }
      gerar_alertas_tarefas_atrasadas: { Args: never; Returns: undefined }
      gerar_comissoes_para_venda: {
        Args: { _venda_id: string }
        Returns: undefined
      }
      gerar_pushes_agendamentos_proximos: { Args: never; Returns: undefined }
      gerar_pushes_lembretes_visita: { Args: never; Returns: undefined }
      gerenciar_participante_roleta: {
        Args: {
          _acao: string
          _corretor_id: string
          _limite?: number
          _motivo?: string
          _pausado_ate?: string
          _slug: string
        }
        Returns: Json
      }
      gestao_config_valor: { Args: { _chave: string }; Returns: Json }
      gestao_followup_cobertura: {
        Args: never
        Returns: {
          corretor_id: string
          corretor_nome: string
          esgotados: number
          fila_hoje: number
          vencidos: number
        }[]
      }
      gestao_followup_tentativas: {
        Args: { _ate?: string; _corretor?: string; _de?: string }
        Returns: {
          atualizado_em: string
          avancaram: number
          enviados: number
          respondidos: number
          tentativa: number
        }[]
      }
      gestao_funil_coorte: {
        Args: {
          _ate?: string
          _corretor?: string
          _de?: string
          _origem?: string
        }
        Returns: {
          atingiu_agendado: number
          atingiu_analise: number
          atingiu_atendimento: number
          atingiu_visita: number
          atualizado_em: string
          cobertura_pct: number
          leads: number
          mes_coorte: string
          perdidos: number
          vendas: number
        }[]
      }
      gestao_funil_snapshot: {
        Args: { _corretor?: string }
        Returns: {
          etapa: string
          followups_vencidos: number
          ordem: number
          parados: number
          quantidade: number
          vgv: number
        }[]
      }
      gestao_gargalos: { Args: { _ate?: string; _de?: string }; Returns: Json }
      gestao_heatmap_corretor_etapa: {
        Args: { _ate?: string; _de?: string; _metrica?: string }
        Returns: {
          base: number
          corretor_id: string
          etapa: string
          nome: string
          ordem: number
          valor: number
        }[]
      }
      gestao_limiar_parado: { Args: { _temperatura: string }; Returns: number }
      gestao_metricas: {
        Args: {
          _campo_data?: string
          _periodo_end: string
          _periodo_start: string
        }
        Returns: Json
      }
      gestao_motivos_perda: {
        Args: { _ate?: string; _corretor?: string; _de?: string }
        Returns: {
          atualizado_em: string
          categoria: string
          quantidade: number
          vgv_estimado: number
        }[]
      }
      gestao_origens: {
        Args: { _ate?: string; _de?: string }
        Returns: {
          atualizado_em: string
          cobertura_pct: number
          conv_pct: number
          leads: number
          origem: string
          vendas: number
        }[]
      }
      gestao_pacing: { Args: { _ano?: number; _mes?: number }; Returns: Json }
      gestao_painel_dia: {
        Args: { _corretor?: string; _limite?: number; _tipos?: string[] }
        Returns: Json
      }
      gestao_performance_corretor_drill: {
        Args: { _corretor: string; _meses?: number }
        Returns: {
          agendamentos_criados: number
          analises: number
          atualizado_em: string
          contatos: number
          interacoes: number
          leads_recebidos: number
          mes: string
          no_shows: number
          primeira_resposta_p50_min: number
          tarefas_concluidas: number
          vendas: number
          vgv: number
          visitas_realizadas: number
        }[]
      }
      gestao_performance_corretores: {
        Args: { _mes?: string }
        Returns: {
          agendamentos_criados: number
          analises: number
          atualizado_em: string
          capacidade_pct: number
          carga_ativa: number
          contatos: number
          corretor_id: string
          interacoes: number
          leads_recebidos: number
          leads_respondidos: number
          limite_diario_leads: number
          no_shows: number
          nome: string
          presente: boolean
          primeira_resposta_p50_min: number
          tarefas_concluidas: number
          vendas: number
          vgv: number
          visitas_realizadas: number
        }[]
      }
      gestao_performance_corretores_janela: {
        Args: { _ate?: string; _de: string }
        Returns: {
          agendamentos_criados: number
          analises: number
          atualizado_em: string
          capacidade_pct: number
          carga_ativa: number
          contatos: number
          corretor_id: string
          interacoes: number
          leads_recebidos: number
          leads_respondidos: number
          limite_diario_leads: number
          no_shows: number
          nome: string
          presente: boolean
          primeira_resposta_p50_min: number
          tarefas_concluidas: number
          vendas: number
          vgv: number
          visitas_realizadas: number
        }[]
      }
      gestao_resumo_semanal: { Args: never; Returns: Json }
      gestao_tempo_etapa: {
        Args: { _ate?: string; _corretor?: string; _de?: string }
        Returns: {
          atualizado_em: string
          etapa: string
          horas_media: number
          horas_p50: number
          n: number
          ordem: number
        }[]
      }
      get_dist_setting: { Args: { _chave: string }; Returns: Json }
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
      is_active_member: { Args: { _user_id?: string }; Returns: boolean }
      is_mcp: { Args: never; Returns: boolean }
      is_service_bot: { Args: { _uid: string }; Returns: boolean }
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
      lead_reaquecivel_sdr: { Args: { _lead_id: string }; Returns: boolean }
      lead_ultima_atividade: {
        Args: {
          _ultima_interacao: string
          _ultimo_contato: string
          _updated_at: string
        }
        Returns: string
      }
      leads_com_sla: {
        Args: { _corretor?: string }
        Returns: {
          corretor_id: string
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
      leads_espelhados: { Args: { _user_id: string }; Returns: string[] }
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
      leads_filtered_v2: {
        Args: {
          _contato?: string
          _corretor?: string
          _limit?: number
          _na_lixeira?: boolean
          _offset?: number
          _origem?: string
          _periodo_end?: string
          _periodo_start?: string
          _search?: string
          _search_digits?: string
          _sort?: string
          _sort_dir?: string
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
          tem_followup: boolean
          temperatura: string
          total_count: number
          ultima_interacao: string
          usa_fgts: boolean
        }[]
      }
      leads_filtered_v3: {
        Args: {
          _contato?: string
          _corretor?: string
          _limit?: number
          _na_lixeira?: boolean
          _offset?: number
          _origem?: string
          _periodo_end?: string
          _periodo_start?: string
          _search?: string
          _search_digits?: string
          _sort?: string
          _sort_dir?: string
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
          proximo_followup: string
          renda_informada: string
          score: number
          status: string
          telefone: string
          tem_followup: boolean
          temperatura: string
          total_count: number
          ultima_interacao: string
          usa_fgts: boolean
        }[]
      }
      leads_filtered_v4: {
        Args: {
          _contato?: string
          _corretor?: string
          _limit?: number
          _na_lixeira?: boolean
          _offset?: number
          _origem?: string
          _parado_dias?: number
          _periodo_end?: string
          _periodo_start?: string
          _search?: string
          _search_digits?: string
          _sort?: string
          _sort_dir?: string
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
          proximo_followup: string
          renda_informada: string
          score: number
          status: string
          telefone: string
          tem_followup: boolean
          temperatura: string
          total_count: number
          ultima_interacao: string
          usa_fgts: boolean
        }[]
      }
      leads_filtered_v5: {
        Args: {
          _analise?: string
          _contato?: string
          _corretor?: string
          _limit?: number
          _na_lixeira?: boolean
          _offset?: number
          _origem?: string
          _parado_dias?: number
          _periodo_end?: string
          _periodo_start?: string
          _search?: string
          _search_digits?: string
          _sort?: string
          _sort_dir?: string
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
          proximo_followup: string
          renda_informada: string
          score: number
          status: string
          telefone: string
          tem_followup: boolean
          temperatura: string
          total_count: number
          ultima_interacao: string
          usa_fgts: boolean
        }[]
      }
      leads_search_v2: {
        Args: {
          _corretor_id?: string
          _cursor?: Json
          _limit?: number
          _na_lixeira?: boolean
          _origem?: Database["public"]["Enums"]["lead_origem"]
          _periodo_fim?: string
          _periodo_inicio?: string
          _projeto_id?: string
          _query?: string
          _somente_sem_corretor?: boolean
          _status?: Database["public"]["Enums"]["lead_status"]
          _temperatura?: Database["public"]["Enums"]["lead_temperatura"]
        }
        Returns: Json
      }
      leads_sem_acao: {
        Args: { _corretores?: string[]; _limit?: number }
        Returns: {
          id: string
          nome: string
          proximo_followup: string
          status: string
          telefone: string
          temperatura: Database["public"]["Enums"]["lead_temperatura"]
          ultima_interacao: string
        }[]
      }
      leads_sla_pendentes: {
        Args: { _corretor?: string }
        Returns: {
          corretor_id: string
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
      leads_stats_por_corretor: {
        Args: never
        Returns: {
          aguardando: number
          aguardando_retorno: number
          corretor_id: string
          em_atendimento: number
          ganhos: number
          perdidos: number
          total: number
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
      leads_status_counts_v2: {
        Args: {
          _contato?: string
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
      leads_status_counts_v3: {
        Args: {
          _contato?: string
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
      leads_status_counts_v4: {
        Args: {
          _contato?: string
          _corretor?: string
          _na_lixeira?: boolean
          _origem?: string
          _parado_dias?: number
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
      leads_status_counts_v5: {
        Args: {
          _analise?: string
          _contato?: string
          _corretor?: string
          _na_lixeira?: boolean
          _origem?: string
          _parado_dias?: number
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
      limpar_vitrine_eventos_expirados: {
        Args: { _antes?: string }
        Returns: number
      }
      listar_vitrine_links: {
        Args: { _ator_id: string; _lead_id: string }
        Returns: {
          created_at: string
          expira_em: string
          id: string
          projetos: Json
          revogado_em: string
        }[]
      }
      marcar_conversa_tratada: { Args: { _lead_id: string }; Returns: Json }
      marcar_followup_esgotado: {
        Args: { _lead_id: string }
        Returns: undefined
      }
      marcar_lead_perdido: {
        Args: { _categoria?: string; _detalhe?: string; _lead_id: string }
        Returns: string
      }
      marcar_lead_perdido_v2: {
        Args: { _categoria: string; _detalhe?: string; _lead_id: string }
        Returns: string
      }
      marcar_presenca: { Args: { _presente: boolean }; Returns: undefined }
      metas_dia_alerta_checkpoint: {
        Args: { _dia: string; _checkpoint: number; _titulo: string; _mensagem: string }
        Returns: boolean
      }
      metas_dia_taxas: { Args: { _dias?: number }; Returns: Json }
      marcar_presenca_admin: {
        Args: { _corretor_id: string; _presente: boolean }
        Returns: undefined
      }
      mcp_aplicar_guardas: {
        Args: never
        Returns: {
          acao: string
          tabela: string
        }[]
      }
      mcp_colunas_segredo: {
        Args: never
        Returns: {
          coluna: string
          tabela: string
        }[]
      }
      mcp_log_bloqueio: {
        Args: { _acao: string; _detalhe: string; _tabela: string }
        Returns: undefined
      }
      mcp_marcar_perdido: {
        Args: { _lead_id: string; _motivo: string; _motivo_categoria: string }
        Returns: Json
      }
      mcp_perdidos_orcamento: { Args: never; Returns: Record<string, unknown> }
      mcp_registrar_perdido: {
        Args: { _lead_id: string; _motivo: string; _motivo_categoria: string }
        Returns: undefined
      }
      mcp_sincronizar_grants_colunas: {
        Args: never
        Returns: {
          acao: string
          coluna: string
          tabela: string
        }[]
      }
      mesclar_duplicados_lote: { Args: { _limite?: number }; Returns: number }
      mesclar_leads: {
        Args: { _lead_destino: string; _lead_origem: string }
        Returns: boolean
      }
      mesclar_leads_dup_lote: { Args: { p_limite?: number }; Returns: number }
      mesclar_leads_por_telefone: { Args: { _chave: string }; Returns: string }
      metricas_periodo_v2: {
        Args: { _fim: string; _inicio: string }
        Returns: Json
      }
      meu_followup_tentativas: {
        Args: { _meses?: number }
        Returns: {
          atualizado_em: string
          avancaram: number
          enviados: number
          respondidos: number
          tentativa: number
        }[]
      }
      minha_elegibilidade: { Args: never; Returns: Json }
      nav_pendencias: { Args: never; Returns: Json }
      normalize_phone_smq: { Args: { _raw: string }; Returns: string }
      obter_vitrine_publica: {
        Args: { _token_hash: string }
        Returns: {
          expira_em: string
          projetos: Json
        }[]
      }
      painel_distribuicao_resumo: { Args: never; Returns: Json }
      pasta_min_documentos: { Args: never; Returns: number }
      pipeline_snapshot_v2: {
        Args: { _corretor_id?: string; _projeto_id?: string; _query?: string }
        Returns: {
          etapa: Database["public"]["Enums"]["lead_status"]
          followups_vencidos: number
          parados_ha_7_dias: number
          quantidade: number
          sem_proxima_acao: number
        }[]
      }
      pipeline_snapshot_v3: {
        Args: { _corretor_id?: string; _projeto_id?: string; _query?: string }
        Returns: {
          etapa: Database["public"]["Enums"]["lead_status"]
          followups_vencidos: number
          parados_ha_7_dias: number
          quantidade: number
          sem_proxima_acao: number
          vgv: number
        }[]
      }
      pipeline_stage_page_v2: {
        Args: {
          _corretor_id?: string
          _cursor?: Json
          _limit?: number
          _projeto_id?: string
          _query?: string
          _status: Database["public"]["Enums"]["lead_status"]
        }
        Returns: Json
      }
      pode_acessar_corretor: {
        Args: { _corretor_id: string; _user_id: string }
        Returns: boolean
      }
      pode_acessar_lead: {
        Args: { _lead_id: string; _user_id: string }
        Returns: boolean
      }
      pode_atribuir_lead: {
        Args: { _corretor_id: string; _user_id: string }
        Returns: boolean
      }
      pode_escrever: {
        Args: { _acao: string; _agente: string }
        Returns: boolean
      }
      pontos_de: { Args: { _chave: string }; Returns: number }
      preview_oferta_ativa: {
        Args: { _corretor?: string; _filtros: Json }
        Returns: Json
      }
      processar_distribuicao_automatica: { Args: never; Returns: Json }
      produtividade_corretores: {
        Args: never
        Returns: {
          aguardando: number
          corretor_id: string
          elegivel: boolean
          pct_trabalhado: number
          total_ativos: number
        }[]
      }
      projetos_demanda_v1: {
        Args: never
        Returns: {
          envios_30d: number
          envios_7d: number
          leads_30d: number
          leads_total: number
          projeto_id: string
          ultimo_envio: string
          vendas_total: number
        }[]
      }
      ranking_periodo_v2: {
        Args: { _fim: string; _inicio: string; _limit?: number }
        Returns: {
          agendamentos: number
          alteracoes: number
          corretor_id: string
          documentacoes: number
          leads: number
          ligacoes: number
          nome: string
          pontuacao: number
          posicao: number
          vendas: number
          vgv: number
          visitas: number
          whatsapps: number
        }[]
      }
      reativar_followup: { Args: { _lead_id: string }; Returns: undefined }
      recalcular_faixas_velocidade: {
        Args: { _gatilho?: string }
        Returns: number
      }
      recalcular_temperatura_leads: { Args: never; Returns: number }
      recalcular_tiers_roleta: {
        Args: { _gatilho?: string; _roleta_slug: string }
        Returns: number
      }
      recalcular_tiers_todas: { Args: { _gatilho?: string }; Returns: number }
      redistribuir_leads_parados: { Args: never; Returns: number }
      redistribuir_sla_webhook: { Args: never; Returns: number }
      regenerar_webhook_token: {
        Args: { _projeto_id: string }
        Returns: string
      }
      registrar_documentacao_remocao: {
        Args: { _ator_id: string; _documentacao_id: string }
        Returns: string
      }
      registrar_documentacao_upload: {
        Args: {
          _ator_id: string
          _documentacao_id: string
          _lead_id: string
          _mime_type: string
          _nome_original: string
          _object_path: string
          _tamanho_bytes: number
        }
        Returns: number
      }
      registrar_vitrine_evento: {
        Args: {
          _cta_tipo?: string
          _idempotency_key: string
          _projeto_id?: string
          _tipo: Database["public"]["Enums"]["vitrine_evento_tipo"]
          _token_hash: string
        }
        Returns: boolean
      }
      regua_followup_atual: { Args: never; Returns: Json }
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
      release_landing_webhook_request: {
        Args: { _key_hash: string; _lease_token: string; _request_hash: string }
        Returns: boolean
      }
      remover_espelho_lead: {
        Args: { _corretor_id: string; _lead_id: string; _motivo: string }
        Returns: Json
      }
      reprocessar_excecao: { Args: { _excecao_id: string }; Returns: Json }
      resetar_cotas_diarias: { Args: never; Returns: undefined }
      resetar_presenca_diaria: { Args: never; Returns: undefined }
      resolver_excecao: {
        Args: { _acao: string; _excecao_id: string; _params?: Json }
        Returns: Json
      }
      restaurar_registro: {
        Args: { _id: string; _tabela: string }
        Returns: boolean
      }
      revogar_vitrine_link: {
        Args: { _ator_id: string; _link_id: string }
        Returns: boolean
      }
      roleta_da_zona: { Args: { _zona: string }; Returns: string }
      salvar_modo_visita: {
        Args: {
          p_agendamento_id: string
          p_checklist?: Json
          p_compareceu?: boolean
          p_concluir?: boolean
          p_interesse?: string
          p_nota_transcrita?: string
          p_objecao_principal?: string
          p_observacoes?: string
          p_proxima_acao?: string
          p_proxima_etapa?: Database["public"]["Enums"]["lead_status"]
          p_proximo_followup?: string
          p_reagendar_para?: string
        }
        Returns: {
          agendamento_id: string
          atualizada_por: string
          checklist: Json
          concluida_em: string | null
          corretor_id: string
          created_at: string
          criada_por: string
          id: string
          iniciada_em: string
          interesse: string | null
          lead_id: string
          nota_transcrita: string | null
          objecao_principal: string | null
          observacoes: string | null
          proxima_acao: string | null
          proxima_etapa: Database["public"]["Enums"]["lead_status"] | null
          proximo_followup: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "visita_execucoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      samiq_finalizar_execucao: {
        Args: {
          _error_code?: string
          _execution_id: string
          _input_tokens?: number
          _latency_ms?: number
          _output_tokens?: number
          _status: string
          _user_id: string
        }
        Returns: boolean
      }
      samiq_reservar_execucao: {
        Args: {
          _action: string
          _estimated_input_tokens?: number
          _requested_output_tokens?: number
          _user_id: string
        }
        Returns: {
          action_prompt: string
          allowed: boolean
          denial_reason: string
          execution_id: string
          max_output_tokens: number
          model_id: string
          prompt_version: string
          retry_after_seconds: number
          system_prompt: string
        }[]
      }
      sdr_leads_reaquecer: {
        Args: { _limit?: number }
        Returns: {
          corretor_id: string
          corretor_nome: string
          dias_parado: number
          id: string
          nome: string
          projeto_nome: string
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          temperatura: Database["public"]["Enums"]["lead_temperatura"]
          ultima_atividade_em: string
          zona: string
        }[]
      }
      sdr_pegar_lead: {
        Args: { _lead_id: string }
        Returns: {
          bairro: string | null
          campanha: string | null
          canal_entrada: string | null
          classe_lead: string
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
          followup_esgotado_em: string | null
          followup_reativado_em: string | null
          handoff_em: string | null
          id: string
          import_batch_id: string | null
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
          pasta_montada_em: string | null
          projeto_id: string | null
          projeto_nome: string | null
          proxima_acao: string | null
          proximo_followup: string | null
          renda_estimada: number | null
          renda_informada: string | null
          resumo_qualificacao: string | null
          roleta_slug: string | null
          sdr_devolvido_em: string | null
          sdr_entregue_em: string | null
          sdr_id: string | null
          sdr_interesse_confirmado: boolean
          search_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164: string | null
          tem_fgts: boolean | null
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          tipo_renda: string | null
          ultima_atividade_em: string
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
          zona: string | null
        }
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sdr_raio_x: {
        Args: { _ate?: string; _de?: string; _sdr_id?: string }
        Returns: Json
      }
      set_metric_webhook_token: { Args: { _token: string }; Returns: undefined }
      sync_proximo_followup: { Args: { _lead_id: string }; Returns: undefined }
      telefone_digits: { Args: { _telefone: string }; Returns: string }
      tempo_primeira_resposta: {
        Args: { _corretor?: string; _df: string; _di: string }
        Returns: {
          corretor_id: string
          leads_dado_sujo: number
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
      transicao_lead_permitida: {
        Args: {
          p_de: Database["public"]["Enums"]["lead_status"]
          p_gestao: boolean
          p_para: Database["public"]["Enums"]["lead_status"]
        }
        Returns: boolean
      }
      transicionar_lead: {
        Args: {
          p_lead_id: string
          p_motivo?: string
          p_motivo_categoria?: string
          p_novo_status: Database["public"]["Enums"]["lead_status"]
          p_proxima_acao?: string
          p_proximo_followup?: string
        }
        Returns: {
          bairro: string | null
          campanha: string | null
          canal_entrada: string | null
          classe_lead: string
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
          followup_esgotado_em: string | null
          followup_reativado_em: string | null
          handoff_em: string | null
          id: string
          import_batch_id: string | null
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
          pasta_montada_em: string | null
          projeto_id: string | null
          projeto_nome: string | null
          proxima_acao: string | null
          proximo_followup: string | null
          renda_estimada: number | null
          renda_informada: string | null
          resumo_qualificacao: string | null
          roleta_slug: string | null
          sdr_devolvido_em: string | null
          sdr_entregue_em: string | null
          sdr_id: string | null
          sdr_interesse_confirmado: boolean
          search_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164: string | null
          tem_fgts: boolean | null
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          tipo_renda: string | null
          ultima_atividade_em: string
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
          zona: string | null
        }
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transicionar_lead_api_perda: {
        Args: {
          p_categoria: string
          p_data_perda?: string
          p_lead_id: string
          p_motivo?: string
        }
        Returns: {
          bairro: string | null
          campanha: string | null
          canal_entrada: string | null
          classe_lead: string
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
          followup_esgotado_em: string | null
          followup_reativado_em: string | null
          handoff_em: string | null
          id: string
          import_batch_id: string | null
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
          pasta_montada_em: string | null
          projeto_id: string | null
          projeto_nome: string | null
          proxima_acao: string | null
          proximo_followup: string | null
          renda_estimada: number | null
          renda_informada: string | null
          resumo_qualificacao: string | null
          roleta_slug: string | null
          sdr_devolvido_em: string | null
          sdr_entregue_em: string | null
          sdr_id: string | null
          sdr_interesse_confirmado: boolean
          search_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          telefone_e164: string | null
          tem_fgts: boolean | null
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_redistribuicao: number
          timestamp_recebimento: string | null
          tipo_renda: string | null
          ultima_atividade_em: string
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
          zona: string | null
        }
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      triar_e_distribuir_lead: {
        Args: { _gatilho?: string; _lead_id: string }
        Returns: Json
      }
      validar_visita: {
        Args: {
          _agendamento_id: string
          _compareceu?: boolean
          _observacoes?: string
          _proxima_etapa?: Database["public"]["Enums"]["lead_status"]
          _resultado?: string
        }
        Returns: {
          auto_gerado: boolean
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
        SetofOptions: {
          from: "*"
          to: "agendamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ve_carteira_completa: { Args: { _user_id: string }; Returns: boolean }
      vendas_mes_anterior: {
        Args: never
        Returns: {
          corretor_id: string
          qtd: number
          total: number
        }[]
      }
      vitrine_galeria_urls_validas: {
        Args: { _urls: string[] }
        Returns: boolean
      }
      zona_do_bairro: { Args: { _txt: string }; Returns: string }
      zona_do_lead: { Args: { _lead_id: string }; Returns: string }
      zona_normalizar: { Args: { _txt: string }; Returns: string }
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
        | "distribuicao"
      api_cliente_escopo:
        | "leads:read"
        | "leads:write"
        | "events:write"
        | "sales:read"
        | "commissions:read"
        | "metrics:read"
        | "commissions:write"
        | "commissions:write:beneficiary"
        | "sales:write"
      app_role: "admin" | "gestor" | "corretor" | "superintendente" | "sdr"
      convite_crm_estado: "pendente" | "aceito" | "revogado" | "expirado"
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
        | "investimento_corretor"
        | "impulso_smq"
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
        | "qualificacao_corretor"
      lead_temperatura: "quente" | "morno" | "frio"
      status_conta: "pendente" | "ativa" | "bloqueada"
      status_venda:
        | "rascunho"
        | "pendente"
        | "aprovada"
        | "rejeitada"
        | "cancelada"
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
      vitrine_evento_tipo: "abertura" | "projeto_visto" | "cta_clicado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "distribuicao",
      ],
      api_cliente_escopo: [
        "leads:read",
        "leads:write",
        "events:write",
        "sales:read",
        "commissions:read",
        "metrics:read",
        "commissions:write",
        "commissions:write:beneficiary",
        "sales:write",
      ],
      app_role: ["admin", "gestor", "corretor", "superintendente", "sdr"],
      convite_crm_estado: ["pendente", "aceito", "revogado", "expirado"],
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
        "investimento_corretor",
        "impulso_smq",
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
        "qualificacao_corretor",
      ],
      lead_temperatura: ["quente", "morno", "frio"],
      status_conta: ["pendente", "ativa", "bloqueada"],
      status_venda: [
        "rascunho",
        "pendente",
        "aprovada",
        "rejeitada",
        "cancelada",
      ],
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
      vitrine_evento_tipo: ["abertura", "projeto_visto", "cta_clicado"],
    },
  },
} as const
