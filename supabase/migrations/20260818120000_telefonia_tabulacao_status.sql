-- Telefonia Sonax, parte 3: tabulação do discador -> etapa do funil.
--
-- A tabulação é aplicada pelo corretor no painel de agente do Sonax DEPOIS
-- que a chamada desliga — a URL de integração não tem variável para ela.
-- Por isso o caminho é sincronização: a edge function sonax-tabulacoes baixa
-- o arquivo de contatos da campanha (acao=download_arquivo_contato, cujo
-- id_contato é o UUID do lead no CRM), casa a tabulação nova com a chamada
-- registrada e move o lead pela RPC oficial transicionar_lead (máquina de
-- estados + timeline + follow-up na mesma transação).
--
-- Este mapeamento tabulação -> etapa é CONFIGURAÇÃO, não código: o admin
-- ajusta aqui (gestao_config) sem deploy quando criar/renomear tabulações no
-- painel do Sonax. Chaves são comparadas normalizadas (minúsculas, sem
-- acento, espaços colapsados) — "Não Perturbar" casa com "nao perturbar".
-- Tabulação sem entrada no mapeamento só fica registrada na chamada; o lead
-- não muda de etapa.

INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('telefonia_tabulacao_status',
   '{
     "mapeamento": {
       "interessado": "em_atendimento",
       "em atendimento": "em_atendimento",
       "qualificar": "qualificacao_corretor",
       "agendou visita": "agendado",
       "visita agendada": "agendado",
       "agendamento": "agendado",
       "pediu retorno": "aguardando_retorno",
       "retornar": "aguardando_retorno",
       "ligar depois": "aguardando_retorno",
       "sem interesse": "perdido",
       "nao perturbar": "perdido",
       "numero errado": "perdido"
     }
   }',
   'Tabulacao do discador Sonax -> etapa do funil (lead_status). Chaves normalizadas (minusculas, sem acento). Aplicado pela edge function sonax-tabulacoes via RPC transicionar_lead; tabulacao sem entrada aqui nao muda etapa. Alinhe os nomes com as tabulacoes criadas no painel do Sonax.')
ON CONFLICT (chave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
