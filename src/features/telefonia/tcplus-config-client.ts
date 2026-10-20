// Fronteira tipada da edge function tcplus-config: conexão do corretor (o
// token é conferido no 3C Plus antes de gravar) e o diagnóstico/configuração
// da gestão (campanha única, vínculo dos agentes por e-mail, webhook).

import { supabase } from "@/integrations/supabase/client";
import { erroDaFunction } from "@/hooks/use-ligar-lead";

export type ResultadoConectar = {
  agente: { id: string | null; nome: string | null; email: string | null };
  email_confere: boolean;
};

export type CorretorDiagnostico = {
  user_id: string;
  nome: string;
  agent_id: string | null;
  agente_3c: { id: string; nome: string | null } | null;
  token_conectado: boolean;
  token_atualizado_em: string | null;
  campanha: string | null;
};

export type Diagnostico = {
  ambiente: {
    base_url: string;
    auth_mode: string;
    token_gestor_configurado: boolean;
    webhook_secret_configurado: boolean;
  };
  gestor: {
    ok: boolean;
    base_url_funcional: string | null;
    sugerir_base_url: string | null;
    usuario: { id: string | null; nome: string | null; email: string | null } | null;
    tentativas: Array<{ base_url: string; status: number; detalhe: string | null }>;
  };
  campanhas: Array<{ id: string; nome: string }>;
  campanha_unica: { id: string; nome: string | null; existe: boolean | null } | null;
  agentes_3c: number;
  agentes_sem_corretor: string[];
  corretores: CorretorDiagnostico[];
  webhook: {
    url: string;
    url_com_segredo: boolean;
    autoteste: { status: number; ok: boolean } | null;
    ultimo_evento_em: string | null;
  };
};

export const MENSAGENS_TCPLUS_CONFIG: Record<string, string> = {
  token_formato_invalido: "Esse não parece um token do 3C Plus. Copie o token de API completo.",
  token_e_do_gestor:
    "Esse é o token do GESTOR (o da integração). Cole o token do SEU usuário de agente no 3C Plus.",
  tcplus_token_invalido:
    "O 3C Plus recusou esse token. Confira se copiou o token do seu usuário inteiro e tente de novo.",
  tcplus_indisponivel: "O 3C Plus não respondeu — tente de novo em instantes.",
  tcplus_recusou: "O 3C Plus recusou a operação.",
  tcplus_token_gestor_invalido:
    "O 3C Plus recusou o token do gestor (secret TCPLUS_API_TOKEN) — rode o diagnóstico.",
  campanha_invalida: "Informe o ID numérico da campanha.",
  campanha_inexistente: "Essa campanha não existe na conta do 3C Plus.",
  forbidden: "Só a gestão pode ver o diagnóstico (e só o admin altera a configuração).",
  account_inactive: "Sua conta está inativa.",
};

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("tcplus-config", { body });
  if (error) {
    const { codigo, detalhe } = await erroDaFunction(error);
    const base =
      (codigo && MENSAGENS_TCPLUS_CONFIG[codigo]) ||
      `Não foi possível falar com a integração 3C Plus (${codigo ?? error.message}).`;
    throw new Error(detalhe ? `${base} (${detalhe})` : base);
  }
  return data as T;
}

export const conectarTcplus = (token: string) =>
  invocar<ResultadoConectar>({ acao: "conectar", token });

export const diagnosticarTcplus = () => invocar<Diagnostico>({ acao: "diagnostico" });

export const salvarCampanhaTcplus = (campaignId: string) =>
  invocar<{ campaign_id: string; nome: string | null }>({
    acao: "salvar_campanha",
    campaign_id: campaignId,
  });

export const vincularAgentesTcplus = () =>
  invocar<{ agentes: number; vinculados: number; sem_corretor: string[] }>({
    acao: "vincular_agentes",
  });
