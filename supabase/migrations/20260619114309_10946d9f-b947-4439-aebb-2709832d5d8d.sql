CREATE INDEX IF NOT EXISTS idx_leads_temperatura ON public.leads (temperatura);
CREATE INDEX IF NOT EXISTS idx_leads_origem ON public.leads (origem);
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON public.profiles (ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_projetos_ativo ON public.projetos (ativo) WHERE ativo = true;

INSERT INTO public.templates_mensagem (nome, canal, conteudo, ativo)
SELECT v.nome, 'whatsapp'::public.template_canal, v.conteudo, true
FROM (
  VALUES
    ('Primeiro contato', 'Olá, {{nome}}! Aqui é da Seu Metro Quadrado 😊 Recebemos seu contato e quero te ajudar a encontrar o imóvel ideal. Posso te ligar agora ou prefere conversar por aqui mesmo?'),
    ('Lembrete de visita', 'Oi, {{nome}}! Passando para confirmar nossa visita ao {{projeto}}. Está tudo certo para o horário combinado? Qualquer coisa, me avise por aqui. 🔑'),
    ('Pós-visita', '{{nome}}, foi um prazer te receber na visita ao {{projeto}}! O que você achou? Posso te enviar as condições e simular as parcelas para você decidir com calma?'),
    ('Cobrança de documentos', 'Olá, {{nome}}! Para dar andamento na sua proposta, preciso de alguns documentos: RG/CPF, comprovante de renda e comprovante de residência. Pode me enviar por aqui quando puder? Assim agilizamos sua aprovação. 📄'),
    ('Reativação de lead', 'Oi, {{nome}}! Faz um tempo que não conversamos. Surgiram novas oportunidades e condições no {{projeto}} e lembrei de você. Ainda tem interesse em realizar esse sonho? Posso te atualizar?')
) AS v(nome, conteudo)
WHERE NOT EXISTS (SELECT 1 FROM public.templates_mensagem t WHERE t.nome = v.nome AND t.canal = 'whatsapp');

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'aguardando_retorno';