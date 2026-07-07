// Servidor MCP do CRM Seu Metro Quadrado.
//
// IMPORTANTE: nada de leitura de env ou I/O no top-level deste módulo — ele é
// carregado durante o build (para gerar o manifest) e no cold-start do Worker,
// onde secrets podem não existir. Cada tool lê process.env dentro do handler.
import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMeusLeads from "./tools/list-meus-leads";
import getLead from "./tools/get-lead";
import listMeusAgendamentos from "./tools/list-meus-agendamentos";
import listMinhasTarefas from "./tools/list-minhas-tarefas";

// O issuer OAuth precisa ser o host direto do Supabase (rejeitado pelo mcp-js
// se apontar para o proxy .lovable.cloud). VITE_SUPABASE_PROJECT_ID é inlineado
// pelo Vite no build. O fallback só cobre o eval descartável do extractor.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "seu-metro-quadrado-crm",
  title: "Seu Metro Quadrado — CRM",
  version: "0.1.0",
  instructions:
    "Ferramentas do CRM imobiliário Seu Metro Quadrado. Cada chamada roda como o corretor autenticado (RLS aplica). Use 'list_meus_leads' para listar leads do corretor, 'get_lead' para detalhes, 'list_meus_agendamentos' para próximas visitas e 'list_minhas_tarefas' para o backlog de tarefas.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMeusLeads, getLead, listMeusAgendamentos, listMinhasTarefas],
});
