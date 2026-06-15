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
          email: string | null
          entrada_disponivel: string | null
          id: string
          motivo_perdido: string | null
          na_lixeira: boolean
          nome: string
          observacoes: string | null
          origem: Database["public"]["Enums"]["lead_origem"]
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
          email?: string | null
          entrada_disponivel?: string | null
          id?: string
          motivo_perdido?: string | null
          na_lixeira?: boolean
          nome: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["lead_origem"]
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
          email?: string | null
          entrada_disponivel?: string | null
          id?: string
          motivo_perdido?: string | null
          na_lixeira?: boolean
          nome?: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["lead_origem"]
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
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          bio: string | null
          cargo: string | null
          created_at: string
          data_admissao: string | null
          email: string
          equipe_id: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          bio?: string | null
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          email: string
          equipe_id?: string | null
          id: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          bio?: string | null
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          email?: string
          equipe_id?: string | null
          id?: string
          nome?: string
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
      tarefas: {
        Row: {
          corretor_id: string
          created_at: string
          criado_por: string | null
          data_conclusao: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string
          lead_id: string | null
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
          descricao?: string | null
          id?: string
          lead_id?: string | null
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
          descricao?: string | null
          id?: string
          lead_id?: string | null
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
      distribuir_lead: {
        Args: {
          _distribuido_por?: string
          _lead_id: string
          _tipo?: Database["public"]["Enums"]["distribuicao_tipo"]
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      resetar_cotas_diarias: { Args: never; Returns: undefined }
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
      app_role: "admin" | "gestor" | "corretor"
      distribuicao_tipo: "automatica" | "manual" | "inicial"
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
      app_role: ["admin", "gestor", "corretor"],
      distribuicao_tipo: ["automatica", "manual", "inicial"],
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
    },
  },
} as const
