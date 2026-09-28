-- ===========================================================================
-- ACADEMIA SMQ · Fatia 1 · carga inicial (seed)
-- ===========================================================================
-- Origem: docs/academia/apoio/02-seed-academia.sql, com os nomes decididos
-- pelo dono e as regras redefinidas pelo diagnóstico da Fatia 0
-- (docs/academia/fatia0-fechamento.md, seções 2 e 5).
--
-- Idempotente de propósito: rodar duas vezes não duplica nada nem sobrescreve
-- módulo já publicado (ON CONFLICT DO NOTHING / DO UPDATE ... WHERE rascunho).
--
-- Todos os módulos entram como RASCUNHO: nada aparece para o aluno até o dono
-- revisar e publicar (academia_publicar_modulo, só admin).
--
-- Fonte do conteúdo: Notion "Módulos da Academia SMQ" (22/04/2026) + O01
-- escrito a partir do método oficial de ligação (set/2026), Playbook Método
-- Marquinhos e cadência D1/D2/D3.
-- ===========================================================================

insert into public.academia_fases (numero, nome, periodo_texto, dia_inicio, dia_fim, foco, nivel_que_exige) values
  (0, 'Integração', 'Dias 1-5', 1, 5, 'Pronto para atender lead no padrão SMQ', 'habilitado'),
  (1, 'Fundação', 'Dias 1-30', 1, 30, 'Mentalidade, papel, mercado e MCMV', 'intermediario'),
  (2, 'Domínio Técnico', 'Dias 31-90', 31, 90, 'Faixas, crédito, simulação, FGTS', 'intermediario'),
  (3, 'Domínio Comercial', 'Dias 91-180', 91, 180, 'Funil, prospecção, qualificação, fechamento', 'especialista'),
  (4, 'Alta Performance', 'Recorrente', null, null, 'Marca pessoal, IA, tecnologia', 'mestre'),
  (5, 'Excelência', 'Recorrente', null, null, 'Ética, cultura, legado', 'mestre')
on conflict (numero) do update set nome = excluded.nome, periodo_texto = excluded.periodo_texto,
  dia_inicio = excluded.dia_inicio, dia_fim = excluded.dia_fim, foco = excluded.foco,
  nivel_que_exige = excluded.nivel_que_exige;

-- O01 · Integração: pronto para atender
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('O01', 0, 0, 'Integração: pronto para atender', 'Em 5 dias, atender um lead real no padrão SMQ: ligar conduzindo, escrever no WhatsApp sem perder o lead, nunca prometer aprovação e deixar tudo registrado no CRM.',
  '["Conduzir a ligação com as 6 perguntas na ordem oficial", "Escrever no WhatsApp com 1 pergunta por mensagem e próximo passo concreto", "Usar o disclaimer de estimativa em toda conversa de crédito", "Executar a cadência D1, D2 e D3 e registrar tudo no CRM no mesmo dia", "Pedir os documentos certos para a visita"]'::jsonb, '["Quem pergunta conduz, quem só responde obedece.", "Ordem trocada é venda perdida: renda antes de preço.", "Nunca prometer aprovação, taxa ou prazo: quem confirma é a Caixa.", "Nenhum lead sem próximo passo. Registro no mesmo dia.", "Ligação boa termina com dia, hora e nome no documento."]'::jsonb, array['Comercial','Operacional']::text[], 10, '10h em 5 dias (aulas + roleplay + 1 atendimento acompanhado)',
  5, true, true, 'Roleplay de ligação com o gestor (ou na reunião da manhã) usando um lead de anúncio que só perguntou o preço. Avaliado pela rubrica das 6 saídas da ligação. Depois, 1 atendimento real acompanhado, registrado no CRM de ponta a ponta.', '[{"criterio": "Jornada: perguntou se é o primeiro imóvel", "peso": 1}, {"criterio": "Simulação: perguntou se já simulou financiamento", "peso": 1}, {"criterio": "Parcela: descobriu a parcela ideal antes de falar preço", "peso": 1}, {"criterio": "Conexão: apresentou o conceito SMQ (valor antes de preço)", "peso": 1}, {"criterio": "Decisor: descobriu se compra com mais alguém", "peso": 1}, {"criterio": "Agenda: fechou com dia, hora, quem vai e documentos", "peso": 1}, {"criterio": "Nenhum dos 4 erros fatais", "peso": 2}]'::jsonb,
  null, null, null, 'rascunho', 'Conteúdo novo escrito a partir do método oficial. Guilherme revisa o texto antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'A SMQ e a regra de ouro', 'texto', '### Quem somos
A Seu Metro Quadrado atende quem vai comprar o **primeiro imóvel** pelo Minha Casa Minha Vida em São Paulo. O cliente não compra só o apartamento: compra a assessoria que faz o financiamento passar.

### Os 4 pilares do conceito SMQ
1. **Assessoria no crédito**
2. **Curadoria de estoque**
3. **Segurança jurídica**
4. **Acompanhamento até a chave**

> "Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar."

### A regra de ouro
**Nunca prometa aprovação, taxa ou prazo.** Toda conta que você faz é estimativa.

Fala padrão, decore:
> "O que eu te passo é uma simulação. Seu perfil indica que dá certo, mas quem confirma é a Caixa."

Por que isso é inegociável: promessa que não se cumpre vira cliente perdido, reclamação e risco jurídico para a empresa. O cliente confia mais em quem é honesto sobre o processo.', null, 15 from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Método de ligação: "Não sou conduzido. Eu conduzo."', 'texto', '### O princípio
Quem pergunta conduz. Quem só responde obedece. Se o cliente pergunta "quanto custa?" e você responde o preço, a conversa passou a ser dele.

### O mapa da conversa: 6 perguntas, ordem fixa
1. **Vai ser seu primeiro imóvel?**
2. **Você já fez uma simulação de financiamento?**
3. **Qual a parcela ideal para você pagar?**
4. **Conceito Seu Metro Quadrado** (valor antes de preço)
5. **Você vai comprar com mais alguém?**
6. **Documentação e visita** (fechamento)

**Regra dura: ordem trocada é venda perdida.** Falar de preço antes de saber a renda entrega o controle da conversa ao cliente.

### A ligação só termina com 6 coisas
Jornada, simulação, parcela, conexão, decisor e **agenda** (data, hora, quem vai, documentos, canal de envio).

### Objeções: nunca sem horário pronto
Toda objeção sai com alternativa de horário. Urgência real + agilidade ("a visita leva 20 a 30 minutos") + opção específica: **dois horários, nunca "quando você pode?"**.

### Os 4 erros que matam a ligação
1. Falar preço antes de saber a renda.
2. Aceitar "vou pensar" sem oferecer horário.
3. Apresentar unidade sem saber quem decide.
4. Encerrar sem data, hora e documento.

> "Ligação boa não termina em ''vou pensar''. Termina com dia, hora e nome no documento."', null, 30 from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'WhatsApp: as 10 regras de escrita', 'texto', 'Estas regras vêm do que converte em produção no atendimento da SMQ (Método Marquinhos). Valem igual para o corretor.

1. **Uma pergunta por mensagem.** Nunca duas. Nunca questionário.
2. **No máximo 3 a 4 linhas.** Uma ideia por mensagem. No máximo 1 emoji.
3. **Comece pelo nome da pessoa** sempre que natural.
4. **Âncora antes da pergunta:** explique por que está perguntando.
5. **Nunca resposta oca:** reaja ao que a pessoa disse e termine com um próximo passo concreto.
6. **Nada de linguagem de banco.** Troque "renda bruta familiar" por "quanto vocês ganham por mês, somando todo mundo que entraria na compra?".
7. **Sem urgência falsa** ("últimas unidades", "só hoje"). Urgência só quando for fato.
8. **Português impecável.** Erro de português destrói credibilidade.
9. **Nunca prometa aprovação, taxa ou prazo.**
10. **Levou um SIM, entregue na mensagem seguinte.** Se o lead aceitou "te mando 2 opções?", a próxima mensagem TEM as 2 opções.

### Os 2 caminhos de conversão
Visita com dia e hora é o caminho A. Quando a visita não encaixa, a **análise de crédito gratuita** é o caminho B. Corretor que só oferece visita perde metade do funil.', null, 20 from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Cadência de contato e CRM', 'texto', '### A cadência oficial
- **D1:** mensagem de abertura + 2 ligações + 1 WhatsApp.
- **D2** (dia seguinte, sem retorno): mais 2 ligações + 1 mensagem.
- **D3** (ainda sem retorno): follow-up de encerramento.

Lead que cumpriu D1, D2 e D3 sem retorno vai para a base de reativação, não fica parado na sua carteira.

### Regras de higiene no CRM
- **Nenhum lead sem próximo passo.**
- **Registrar o atendimento no mesmo dia.**
- Lead sem interação há **7 dias ou mais** conta como parado e pode voltar para a roleta.

Por que isso importa para você: carteira limpa é o que mostra sua conversão real. Lead morto na carteira derruba seus números e tira lead novo de você.', null, 20 from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Documentos para a visita', 'texto', 'Peça antes da visita, sempre. Visita sem documento vira segunda visita.

- RG e CPF
- Comprovante de renda
- Comprovante de residência
- CTPS digital, se for CLT
- Extrato do FGTS, se tiver

Dica: combine também **quem vai** (o decisor precisa estar) e **por onde os documentos serão enviados**.', null, 10 from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'O cliente liga e a primeira coisa que pergunta é o preço. Pelo método SMQ, o que você faz?', '["Passa o preço e depois pergunta a renda", "Conduz com a pergunta 1: se vai ser o primeiro imóvel", "Manda a tabela completa no WhatsApp", "Diz que só passa preço na visita e desliga"]'::jsonb, 1, 'Quem pergunta conduz. Preço antes de renda entrega o controle da conversa ao cliente.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual a ordem correta das 3 primeiras perguntas da ligação?', '["Parcela, simulação, primeiro imóvel", "Simulação, primeiro imóvel, parcela", "Primeiro imóvel, simulação, parcela", "Primeiro imóvel, parcela, decisor"]'::jsonb, 2, 'O mapa é fixo: jornada, simulação, parcela, conceito SMQ, decisor, documentação e visita.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'O cliente diz "vou pensar". Qual resposta segue o método?', '["\"Tudo bem, fico no aguardo\"", "\"Quando você puder, me avisa\"", "Oferecer dois horários específicos de visita de 20 a 30 minutos", "Mandar mensagem de follow-up em 7 dias"]'::jsonb, 2, 'Nunca deixar objeção sem alternativa de horário pronta: urgência real, agilidade e duas opções.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Um cliente pergunta se vai ser aprovado. Qual a resposta correta?', '["\"Com esse perfil, é aprovação certa\"", "\"Seu perfil indica que dá certo, mas quem confirma é a Caixa\"", "\"Depende, não sei dizer\"", "\"Se não aprovar, a gente devolve o sinal\""]'::jsonb, 1, 'Nunca prometer aprovação, taxa ou prazo. Toda conta é estimativa.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'No WhatsApp, quantas perguntas você faz por mensagem?', '["Uma", "Duas, para ganhar tempo", "Todas as de qualificação de uma vez", "Nenhuma, só informação"]'::jsonb, 0, 'Exatamente uma pergunta por mensagem. Questionário mata a conversa.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 6, 'O lead respondeu "sim" para "te mando 2 opções?". O que vem na próxima mensagem?', '["\"Legal! Me conta mais sobre você?\"", "As 2 opções: nome, região e a partir de quanto", "Um áudio explicando o MCMV", "A pergunta sobre renda"]'::jsonb, 1, 'Regra da oferta aceita: levou um SIM, entregue na mensagem seguinte.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 7, 'O lead não respondeu no D1. O que a cadência manda no D2?', '["Esperar uma semana", "Mais 2 ligações e 1 mensagem", "Passar o lead para outro corretor", "Marcar como perdido"]'::jsonb, 1, 'D1: abertura + 2 ligações + 1 WhatsApp. D2: mais 2 ligações + 1 mensagem. D3: encerramento.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 8, 'Qual destes NÃO está na lista de documentos para a visita?', '["Comprovante de renda", "Extrato do FGTS, se tiver", "Certidão de casamento dos pais", "Comprovante de residência"]'::jsonb, 2, 'A lista: RG e CPF, comprovante de renda, comprovante de residência, CTPS digital se CLT, extrato do FGTS se tiver.' from public.academia_modulos where codigo = 'O01'
on conflict (modulo_id, ordem) do nothing;

-- M01 · Mentalidade e Identidade do Corretor
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M01', 1, 1, 'Mentalidade e Identidade do Corretor', 'Construir a identidade profissional do corretor SMQ, estabelecer mentalidade de crescimento e eliminar crenças limitantes sobre a profissão e o mercado.',
  '["Descrever o perfil do Corretor SMQ em 3 sentenças", "Identificar 2 crenças limitantes que carregava antes deste módulo", "Explicar o conceito de responsabilidade radical com exemplo prático", "Listar os 5 valores inegociáveis do Corretor SMQ", "Definir a própria identidade profissional em voz alta, com convicção"]'::jsonb, '["O mercado não está ruim. Você está despreparado.", "Consistência antes de talento.", "Responsabilidade radical: o resultado é sempre seu.", "Venda perdida = análise de processo, não autopunição.", "Quem prospecta todos os dias nunca depende de um único lead."]'::jsonb, array['Mentalidade']::text[], 3, '3h',
  7, true, false, 'Checklist ''Eu sou capaz de'' (5 itens) e pergunta de reflexão: se o resultado do mês passado dependesse 100% da sua disciplina e processo, e zero de sorte, lead ou mercado, o que você teria feito diferente? Inclui definir a própria identidade profissional em voz alta.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/QEJqCvrSz884fiZoSJM3e', 'https://app.notion.com/p/34a3220f693281378203ec37a15a7cdb', '34a3220f693281378203ec37a15a7cdb', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Por que este módulo existe', 'texto', 'A maioria dos corretores fracassa antes de dominar a técnica, por causa de como pensa sobre si e sobre a profissão. O módulo existe para quebrar esse padrão antes que ele se instale. Frase âncora: o mercado não está ruim, você está despreparado.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'A Identidade do Corretor SMQ', 'texto', 'Diferencia o tirador de pedido do consultor imobiliário. Mostra que a profissão é nobre porque realiza o maior sonho financeiro de uma família. O profissional de elite se define por consistência antes de talento.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Mentalidade de Crescimento', 'texto', 'Aplica fixed mindset versus growth mindset ao mercado imobiliário. Uma venda perdida deve gerar análise de processo, não autopunição. Introduz a responsabilidade radical: o resultado é sempre seu, e não do mercado, do lead ou da empresa.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Crenças Limitantes do Corretor', 'texto', 'Tabela de crenças com o reframing SMQ: ''o mercado está ruim'' vira ''quantas ligações você fez essa semana?''; ''não tenho leads'' vira ''você prospecta todos os dias?''; ''não sou bom para vender'' vira ''você treina roleplay semanal?''; ''o cliente não tem dinheiro'' vira ''você qualificou antes de apresentar?''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Os 5 Valores do Corretor SMQ', 'texto', 'Honestidade técnica (nunca prometer o que a Caixa não confirmará), comprometimento (do lead às chaves), responsabilidade radical (protagonismo, não vitimismo), excelência contínua (o Mestre SMQ ainda estuda) e cultura de grandeza (ser referência eleva todos ao redor).

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'A Disciplina como Diferencial', 'texto', 'Talento sem rotina não gera resultado consistente. A rotina diária protege contra a dependência da sorte. Quem prospecta todos os dias nunca depende de um único lead.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/QEJqCvrSz884fiZoSJM3e', 20 from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 8, 'Prática do módulo', 'pratica', 'Checklist ''Eu sou capaz de'' (5 itens) e pergunta de reflexão: se o resultado do mês passado dependesse 100% da sua disciplina e processo, e zero de sorte, lead ou mercado, o que você teria feito diferente? Inclui definir a própria identidade profissional em voz alta.', null, null from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Segundo o M01, o que define o profissional de elite?', '["Quantidade de leads recebidos", "Tempo de mercado", "Consistência antes de talento", "Talento natural para vender"]'::jsonb, 2, 'O módulo afirma que o profissional de elite se define por consistência antes de talento.' from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Um corretor diz: ''o mercado está ruim''. Qual é o reframing SMQ para essa crença?', '["Espere o próximo lançamento", "Mude de região de atuação", "Quantas ligações você fez essa semana?", "Peça mais leads à gestão"]'::jsonb, 2, 'A tabela de crenças limitantes responde ''o mercado está ruim'' com a pergunta sobre quantas ligações foram feitas.' from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Como o corretor SMQ deve reagir a uma venda perdida?', '["Culpar a qualidade do lead", "Analisar o processo, sem autopunição", "Esquecer e partir para o próximo", "Reclamar do preço da construtora"]'::jsonb, 1, 'A mentalidade de crescimento pede análise de processo, não autopunição.' from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'O valor ''honestidade técnica'' significa, na prática:', '["Evitar falar de crédito com o cliente", "Informar o cliente só depois da assinatura", "Nunca prometer o que a Caixa não confirmará", "Mostrar sempre a unidade mais barata"]'::jsonb, 2, 'O módulo define honestidade técnica como nunca prometer o que a Caixa não confirmará.' from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Por que a disciplina é um diferencial, segundo o módulo?', '["Porque permite trabalhar menos horas", "Porque garante leads da empresa", "Porque a rotina diária protege contra a dependência da sorte", "Porque substitui o conhecimento técnico"]'::jsonb, 2, 'A rotina diária é apresentada como proteção contra a dependência da sorte e de um único lead.' from public.academia_modulos where codigo = 'M01'
on conflict (modulo_id, ordem) do nothing;

-- M02 · O Papel do Corretor no Ecossistema Imobiliário
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M02', 2, 1, 'O Papel do Corretor no Ecossistema Imobiliário', 'Entender o papel consultivo do corretor na cadeia imobiliária e a diferença entre tirador de pedido e consultor SMQ.',
  '["Explicar a diferença entre tirador de pedido e consultor SMQ com exemplos", "Descrever as 3 responsabilidades do Corretor SMQ", "Explicar por que a decisão de compra é 70% emocional", "Identificar em qual perfil se enquadra hoje e o que precisa mudar"]'::jsonb, '["O corretor é o único elo humano entre o sonho e a realização.", "Decisão de compra: 70% emocional + 30% lógica.", "Três responsabilidades: técnica, comercial e humana.", "Não vendemos apartamentos. Mudamos trajetórias."]'::jsonb, array['Mentalidade','Comercial']::text[], 3, '3h',
  14, true, false, 'Checklist ''Eu sou capaz de'' com autoavaliação: identificar em qual perfil (tirador de pedido ou consultor SMQ) você se enquadra hoje e o que precisa mudar.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/eyBe1m93Sex5rgIHRy9St', 'https://app.notion.com/p/34a3220f6932810fadd0c27449f7c894', '34a3220f6932810fadd0c27449f7c894', 'rascunho', 'Existem 2 versões no Notion (3 responsabilidades x 4 funções). Confirmar qual é a oficial.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'O Ecossistema Imobiliário', 'texto', 'A cadeia vai de Construtora, Incorporadora, Imobiliária e Corretor até o Cliente. O corretor é o único elo humano entre o sonho do cliente e a realização. Ele não é um intermediário, é um consultor de decisão de vida.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'O Tirador de Pedido vs. O Consultor SMQ', 'texto', 'Comparativo em seis critérios: o tirador espera o lead, improvisa a qualificação, depende de terceiros no crédito, some após a assinatura, vende por sorte e é invisível. O consultor SMQ cria demanda, qualifica com 7 dimensões + D7, simula ao vivo, fica presente até as chaves, vende por método e é referência local.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'O que o Cliente Realmente Compra', 'texto', 'O cliente não compra metros quadrados, compra segurança, pertencimento e estilo de vida. A decisão é 70% emocional e 30% lógica. Quem só fala de parcela perde para quem gerou conexão emocional.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'As 3 Responsabilidades do Corretor SMQ', 'texto', 'Técnica: dominar crédito, MCMV e simulação. Comercial: qualificar, apresentar e fechar com método. Humana: acompanhar, celebrar e gerar indicações.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'O Impacto Real da Profissão', 'texto', 'Exemplos do impacto: uma família sai do aluguel após anos tentando, um casal realiza o primeiro patrimônio, uma mãe vê os filhos crescerem num espaço que é deles. Lema: não vendemos apartamentos, mudamos trajetórias.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/eyBe1m93Sex5rgIHRy9St', 20 from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Checklist ''Eu sou capaz de'' com autoavaliação: identificar em qual perfil (tirador de pedido ou consultor SMQ) você se enquadra hoje e o que precisa mudar.', null, null from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Segundo o M02, qual a proporção da decisão de compra?', '["30% emocional e 70% lógica", "70% emocional e 30% lógica", "50% emocional e 50% lógica", "100% financeira"]'::jsonb, 1, 'O módulo afirma que a decisão é 70% emocional e 30% lógica.' from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Na qualificação, qual comportamento é do consultor SMQ?', '["Deixar a qualificação para o correspondente", "Qualificar com as 7 dimensões + D7", "Improvisar conforme a conversa", "Perguntar só a renda"]'::jsonb, 1, 'A tabela mostra que o consultor SMQ qualifica com 7 dimensões + D7, enquanto o tirador de pedido improvisa.' from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'No pós-venda, o que diferencia o consultor SMQ?', '["Encerra o contato após a assinatura", "Só retorna se o cliente ligar", "Fica presente até as chaves", "Passa o cliente para a construtora"]'::jsonb, 2, 'O tirador de pedido some após a assinatura; o consultor SMQ fica presente até as chaves.' from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual NÃO é uma das 3 responsabilidades do Corretor SMQ?', '["Comercial", "Técnica", "Humana", "Jurídica"]'::jsonb, 3, 'As três responsabilidades são técnica, comercial e humana.' from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Um cliente hesita e o corretor só repete o valor da parcela. Segundo o módulo, o que tende a acontecer?', '["Nada muda, parcela é o que importa", "Ele perde para quem gerou conexão emocional", "Ele fecha mais rápido", "O cliente pede nova simulação"]'::jsonb, 1, 'O corretor que só fala de parcela perde para quem gerou conexão emocional, porque o cliente compra segurança, pertencimento e estilo de vida.' from public.academia_modulos where codigo = 'M02'
on conflict (modulo_id, ordem) do nothing;

-- M03 · Fundamentos do Mercado Imobiliário
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M03', 3, 1, 'Fundamentos do Mercado Imobiliário', 'Dominar os dados do mercado imobiliário brasileiro 2025, entender o ciclo de lançamentos e o papel do MCMV como motor da demanda.',
  '["Citar os principais números do mercado imobiliário de 2025", "Explicar por que o déficit habitacional cria demanda estrutural", "Usar os dados de mercado como argumento com o cliente hesitante", "Explicar o papel do FGTS e do orçamento 2026 no setor"]'::jsonb, '["MCMV = 52% dos lançamentos no Brasil e 66% em SP capital (2025).", "Déficit habitacional: 5,97 milhões de famílias.", "Estoque MCMV absorvido em 7,9 meses.", "FGTS habitação 2026: R$ 144,5 bi (recorde).", "Não falta oportunidade, falta preparo."]'::jsonb, array['Técnico']::text[], 4, '4h',
  14, true, false, 'Checklist ''Eu sou capaz de'', com destaque para usar os dados de mercado como argumento com um cliente hesitante.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/8F6W7QTF2MWDwMFOQEo5y', 'https://app.notion.com/p/34a3220f6932818d93bdce9d8d1cea25', '34a3220f6932818d93bdce9d8d1cea25', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'O Mercado em Números 2025 (CBIC / Brain)', 'texto', 'Em 2025 foram lançadas 453.005 unidades (+10,6% vs 2024), com VGL recorde de R$ 292,3 bi e VGV de R$ 264,2 bi (+3,5%). Foram vendidas 426.260 unidades (+5,4%). O MCMV respondeu por 52% dos lançamentos e 49% das vendas, e o déficit habitacional é de 5,97 milhões.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Por que o MCMV é o Motor do Mercado', 'texto', '52% de todos os lançamentos de 2025 foram MCMV, chegando a 66% em SP capital. 50% dos brasileiros declaram intenção de comprar imóvel em 24 meses e 37% ainda não iniciaram a busca. O estoque MCMV é absorvido em apenas 7,9 meses.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'O Déficit Habitacional como Oportunidade Estrutural', 'texto', 'São 5,97 milhões de famílias sem moradia adequada (FJP, 2023) e 61% das famílias gastam mais de 30% da renda com aluguel. A demanda é estrutural e duradoura, não conjuntural. O FGTS para habitação em 2026 é de R$ 144,5 bilhões e a meta do governo é de 3 milhões de unidades MCMV até 2026.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'O Ciclo do Mercado Imobiliário', 'texto', 'Do lançamento à entrega passam de 24 a 48 meses. Essa janela entre lançamento e entrega é onde o corretor constrói o relacionamento. A valorização média em 12 meses foi de 18,6% (IGMI-R/Abecip).

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'O Que Isso Significa para o Corretor', 'texto', 'O mercado criou a maior janela de oportunidade da história recente: não falta oportunidade, falta preparo. O corretor que domina MCMV, crédito e processo está no segmento certo, na hora certa.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/8F6W7QTF2MWDwMFOQEo5y', 20 from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Checklist ''Eu sou capaz de'', com destaque para usar os dados de mercado como argumento com um cliente hesitante.', null, null from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual foi a participação do MCMV nos lançamentos de 2025 no Brasil?', '["80%", "25%", "38%", "52%"]'::jsonb, 3, 'Segundo os dados CBIC/Brain do módulo, 52% dos lançamentos foram MCMV.' from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Um cliente acha que ''agora não é hora de comprar''. Qual dado do M03 mostra que a demanda é estrutural?', '["O preço médio do m² em outras capitais", "O déficit de 5,97 milhões de famílias e 61% gastando mais de 30% da renda com aluguel", "A taxa Selic do mês", "O número de corretores no mercado"]'::jsonb, 1, 'O módulo usa o déficit habitacional e o peso do aluguel para mostrar demanda estrutural e duradoura.' from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Em quanto tempo o estoque MCMV é absorvido, segundo o módulo?', '["7,9 meses", "3 meses", "18 meses", "24 meses"]'::jsonb, 0, 'O módulo informa absorção do estoque MCMV em 7,9 meses.' from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual o prazo típico entre lançamento e entrega de um empreendimento?', '["60 a 72 meses", "24 a 48 meses", "12 a 18 meses", "6 a 12 meses"]'::jsonb, 1, 'O ciclo lançamento, obra e entrega leva de 24 a 48 meses.' from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Qual é a conclusão do módulo sobre o momento de mercado para o corretor?', '["Só vale atuar fora do MCMV", "O mercado está saturado", "Não falta oportunidade, falta preparo", "Falta oportunidade, sobra preparo"]'::jsonb, 2, 'A mensagem final é que não falta oportunidade, falta preparo.' from public.academia_modulos where codigo = 'M03'
on conflict (modulo_id, ordem) do nothing;

-- M04 · Fundamentos do MCMV
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M04', 4, 1, 'Fundamentos do MCMV', 'Dominar o programa MCMV como produto técnico: faixas, subsídios, taxas, elegibilidade e impacto das atualizações CCFGTS de março/2026.',
  '["Listar as 4 faixas com renda, taxa e teto atualizados (março/2026)", "Explicar o que mudou com as novas regras do CCFGTS", "Identificar clientes na base que agora se reenquadram", "Comunicar a atualização com transparência (aguardando DOU)", "Calcular a parcela máxima de qualquer renda em segundos"]'::jsonb, '["Parcela máxima = renda bruta familiar × 30%.", "Novas faixas CCFGTS mar/2026 só valem após publicação no DOU.", "Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS não contam como renda.", "Componente de renda com imóvel no município pode derrubar FGTS e subsídio de todos.", "Tetos novos: F3 R$ 400 mil, F4 R$ 600 mil."]'::jsonb, array['Técnico']::text[], 5, '5h',
  14, true, false, 'Checklist ''Eu sou capaz de'', incluindo identificar clientes da própria base que se reenquadram nas novas faixas e calcular a parcela máxima de qualquer renda em segundos.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/4nI4EXNmlERMWHSEcvoc6', 'https://app.notion.com/p/34a3220f693281cf8003d635c66a0593', '34a3220f693281cf8003d635c66a0593', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  current_date + 90)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Atualização CCFGTS 24/03/2026', 'texto', 'As novas regras foram aprovadas pelo Conselho Curador do FGTS e aguardam publicação no Diário Oficial da União para entrar em vigor. Até lá, as regras anteriores permanecem vigentes.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'As 4 Faixas do MCMV (versão atualizada)', 'texto', 'F1: renda até R$ 3.200 (era R$ 2.850), subsídio até 95%, taxa 4% a.a. ou 4,50% entre R$ 2.851 e R$ 3.200. F2: até R$ 5.000 (era R$ 4.700), subsídio progressivo até R$ 55k, taxa 5% a 7%. F3: até R$ 9.600, taxa 7,66% a 8,16%, teto R$ 400.000. F4: até R$ 13.000, taxa 10% a 10,5%, teto R$ 600.000. Tetos de F1/F2 entre R$ 210k e R$ 275k.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Impacto Prático das Novas Faixas', 'texto', 'Renda de R$ 4.800 passa a caber na F2 com subsídio. Produto de R$ 370.000 passa a ser elegível na F3 (teto R$ 400k). Cliente com R$ 12.500 entra na F4. Cerca de 120.000 novas famílias beneficiadas.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'O que NÃO Entra na Renda', 'texto', 'Não entram: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS. Entram: salário CLT, pró-labore MEI, rendimentos de autônomo, aposentadoria INSS e pensão alimentícia.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Composição de Renda', 'texto', 'Cônjuge, filhos maiores de 18, pais e amigos podem compor renda, e todos entram como adquirentes no contrato. Risco: se qualquer componente tiver imóvel no município, pode inviabilizar FGTS e subsídio para todos.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Regra dos 30%', 'texto', 'Parcela máxima = renda bruta familiar × 30%. Exemplos: R$ 3.200 dá R$ 960; R$ 5.000 dá R$ 1.500; R$ 9.600 dá R$ 2.880; R$ 13.000 dá R$ 3.900.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/4nI4EXNmlERMWHSEcvoc6', 20 from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 8, 'Prática do módulo', 'pratica', 'Checklist ''Eu sou capaz de'', incluindo identificar clientes da própria base que se reenquadram nas novas faixas e calcular a parcela máxima de qualquer renda em segundos.', null, null from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Uma família tem renda bruta de R$ 5.000. Qual a parcela máxima pela regra dos 30%?', '["R$ 1.000", "R$ 1.250", "R$ 1.500", "R$ 1.800"]'::jsonb, 2, 'R$ 5.000 × 30% = R$ 1.500, exemplo que consta na tabela do módulo.' from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual destas rendas NÃO pode entrar no cálculo do MCMV?', '["Salário CLT", "Aposentadoria INSS", "Bolsa Família", "Pró-labore MEI"]'::jsonb, 2, 'Bolsa Família está na lista do que não entra na renda.' from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Com a atualização CCFGTS, um cliente com renda de R$ 12.500 passa a:', '["Enquadrar na F4", "Ter direito a subsídio de F2", "Enquadrar na F3", "Continuar fora do programa"]'::jsonb, 0, 'A F4 passa a ir até R$ 13.000, então R$ 12.500 entra na F4.' from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Como comunicar ao cliente as novas faixas aprovadas em 24/03/2026?', '["Dizer que só valem para 2027", "Não mencionar até a assinatura", "Garantir que já estão valendo", "Com transparência: aprovadas, mas aguardando publicação no DOU"]'::jsonb, 3, 'O módulo reforça que as regras aguardam publicação no DOU e as anteriores seguem vigentes até lá.' from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Qual o principal risco de compor renda com um familiar?', '["A taxa de juros sempre sobe", "O contrato fica mais longo", "Se o componente tiver imóvel no município, pode inviabilizar FGTS e subsídio para todos", "O componente não precisa assinar o contrato"]'::jsonb, 2, 'O alerta do módulo é que imóvel no município em nome de qualquer componente pode derrubar FGTS e subsídio.' from public.academia_modulos where codigo = 'M04'
on conflict (modulo_id, ordem) do nothing;

-- M05 · Faixas, Enquadramento e Elegibilidade
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M05', 5, 2, 'Faixas, Enquadramento e Elegibilidade', 'Dominar as 4 faixas MCMV atualizadas (CCFGTS mar/2026), a pré-qualificação técnica em 7 passos e a composição de renda por perfil.',
  '["Fazer a pré-qualificação em 7 passos em qualquer atendimento", "Identificar o tipo de renda e o risco de aprovação por perfil", "Usar as novas faixas para reenquadrar clientes da base", "Calcular o saldo financiável a partir da parcela máxima", "Identificar se há risco de inelegibilidade antes de apresentar produto"]'::jsonb, '["Se o produto não cabe, ajuste ANTES de apresentar.", "MEI: a Caixa usa a média dos extratos, não a declaração.", "Caixa não financia renda 100% informal.", "Aposentado: idade + prazo ≤ 80 anos e 6 meses.", "Faixas de renda na borda das antigas faixas são novos elegíveis: reativar."]'::jsonb, array['Técnico']::text[], 6, '6h (3h aula + 3h laboratório)',
  21, true, false, 'Laboratório de 3h (carga do módulo) e checklist: aplicar a pré-qualificação em 7 passos e revisar a própria base de clientes nas faixas de renda de novos elegíveis para reativação.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/zpOVTncF8qA97Il8ebYDj', 'https://app.notion.com/p/34a3220f693281d880a6d0a69ef85386', '34a3220f693281d880a6d0a69ef85386', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  current_date + 90)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'A Pré-Qualificação em 7 Passos', 'texto', '1) renda bruta familiar total, que define faixa e subsídio; 2) renda × 30% = parcela máxima; 3) saldo máximo financiável com essa parcela; 4) FGTS disponível, que reduz saldo e parcela; 5) imóvel no nome em qualquer município; 6) restrição de crédito e se é tratável; 7) o produto cabe? Se não, ajustar ANTES de apresentar.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Composição de Renda por Tipo de Vínculo', 'texto', 'CLT (holerite + CTPS) tem risco baixo e é o mais seguro. Aposentado INSS tem risco baixo, mas exige atenção à regra idade + prazo ≤ 80a6m. MEI (DECORE + 6 meses de extratos) tem risco médio e a Caixa usa a média, não a declaração. Autônomo (IR 2 anos + extratos) é médio-alto pela variabilidade. Renda 100% informal é inviável.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Novos Enquadramentos após CCFGTS mar/2026', 'texto', 'Renda de R$ 4.800 passa para F2 com subsídio até R$ 55.000. Produto de R$ 380.000 passa a caber na F3 (teto R$ 400k). Renda de R$ 12.500 entra na F4 com taxa de 10% contra 12 a 14% de mercado. Renda de R$ 3.000 na F1 passa a ter nova taxa de 4,50%.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Ação Imediata: reativar a base', 'texto', 'Revisar a base com rendas entre R$ 4.700 e R$ 5.000, R$ 8.600 e R$ 9.600, e R$ 12.000 e R$ 13.000, que são novos elegíveis. Reativar esses contatos usando a novidade real como gatilho.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/zpOVTncF8qA97Il8ebYDj', 20 from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Prática do módulo', 'pratica', 'Laboratório de 3h (carga do módulo) e checklist: aplicar a pré-qualificação em 7 passos e revisar a própria base de clientes nas faixas de renda de novos elegíveis para reativação.', null, null from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual é o passo 7 da pré-qualificação SMQ?', '["Verificar se o produto cabe e, se não couber, ajustar antes de apresentar", "Agendar a visita", "Pedir os documentos", "Enviar a simulação por WhatsApp"]'::jsonb, 0, 'O último passo é conferir se o produto cabe e ajustar antes da apresentação.' from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Um MEI declara R$ 7.000, mas os extratos mostram média de R$ 5.500. Qual renda a Caixa tende a considerar?', '["R$ 7.000, a declarada", "A média dos extratos", "A soma das duas", "Nenhuma, MEI não financia"]'::jsonb, 1, 'O módulo alerta que a Caixa usa a média, não a declaração.' from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual perfil de renda é considerado inviável para financiamento na Caixa?', '["CLT", "Aposentado INSS", "Autônomo com IR", "100% informal"]'::jsonb, 3, 'A tabela indica que a Caixa não financia renda 100% informal.' from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Pelo módulo, qual grupo da base deve ser reativado primeiro após a atualização CCFGTS?', '["Clientes com renda acima de R$ 20.000", "Clientes com renda entre R$ 4.700 e R$ 5.000", "Leads sem renda informada", "Clientes que já compraram"]'::jsonb, 1, 'As faixas R$ 4.700 a R$ 5.000, R$ 8.600 a R$ 9.600 e R$ 12.000 a R$ 13.000 são citadas como novos elegíveis.' from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'No passo 5 da pré-qualificação, o que o corretor verifica?', '["O estado civil", "Se o cliente tem carro", "Se o cliente tem imóvel no nome em qualquer município", "O banco de relacionamento"]'::jsonb, 2, 'O passo 5 checa imóvel no nome para validar a elegibilidade.' from public.academia_modulos where codigo = 'M05'
on conflict (modulo_id, ordem) do nothing;

-- M06 · Zoneamento Habitacional: HIS, HMP e R2V
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M06', 6, 2, 'Zoneamento Habitacional: HIS, HMP e R2V', 'Compreender as categorias de zoneamento habitacional do Plano Diretor de SP (HIS1, HIS2, HMP, R2V) e sua relação, e distinção, com o MCMV federal.',
  '["Explicar a diferença entre zoneamento municipal e programa federal MCMV", "Listar as 4 categorias de zoneamento habitacional de SP", "Responder ao cliente que pergunta \"É HIS ou MCMV?\" com clareza", "Conectar o tipo de zoneamento à faixa MCMV do produto"]'::jsonb, '["Zoneamento (municipal) define o que pode ser construído; MCMV (federal) define quem pode financiar.", "HIS 1 até 3 SM, HIS 2 até 6 SM, HMP até 10 SM, R2V variável.", "HIS 1/2 costuma ser F1/F2; HMP pode ser F2, F3 ou F4.", "Sempre confirmar com a construtora o enquadramento de faixa do produto."]'::jsonb, array['Técnico']::text[], 4, '4h',
  28, true, false, 'Checklist ''Eu sou capaz de'', com treino de resposta à pergunta do cliente ''É HIS ou MCMV?'' e conexão entre zoneamento e faixa do produto.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/robsNsuVFQjLTeScGOU1e', 'https://app.notion.com/p/34a3220f69328152af5dc7eabd5b51c0', '34a3220f69328152af5dc7eabd5b51c0', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  current_date + 90)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Distinção Crítica: nunca confundir', 'texto', 'HIS, HMP e R2V são categorias do Plano Diretor Municipal de São Paulo; MCMV é um programa federal. O zoneamento define o que pode ser construído no terreno, e o MCMV define quem pode financiar o imóvel.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Categorias de Zoneamento Habitacional SP', 'texto', 'HIS 1: Habitação de Interesse Social 1, renda até 3 salários mínimos, padrão popular máximo. HIS 2: até 6 salários mínimos, popular. HMP: Habitação do Mercado Popular, até 10 salários mínimos, médio-baixo. R2V: Residencial de Baixa Densidade, renda variável, médio padrão.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Como o Zoneamento Afeta o Produto MCMV', 'texto', 'Um empreendimento pode ser HIS pelo zoneamento e financiável pelo MCMV ao mesmo tempo. O terreno precisa estar em zona compatível para a construtora construir. O corretor precisa entender isso para responder sobre localização e tipo de produto.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Por que o Corretor Precisa Saber Isso', 'texto', 'Clientes perguntam ''é HIS ou MCMV?''. A resposta correta: são coisas diferentes, o zoneamento diz o que pode ser construído e o MCMV diz se você pode financiar com subsídio. O corretor que confunde perde credibilidade técnica imediatamente.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Mapa Prático para o Atendimento', 'texto', 'Produto em zona HIS 1/2 geralmente é F1 ou F2 do MCMV. Produto em zona HMP pode ser F2, F3 ou até F4. Sempre perguntar à construtora qual é o enquadramento de faixa do produto.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/robsNsuVFQjLTeScGOU1e', 20 from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Checklist ''Eu sou capaz de'', com treino de resposta à pergunta do cliente ''É HIS ou MCMV?'' e conexão entre zoneamento e faixa do produto.', null, null from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Um cliente pergunta: ''Esse prédio é HIS ou MCMV?''. Qual a resposta correta segundo o M06?', '["Só imóvel HIS pode ser financiado", "É a mesma coisa", "São coisas diferentes: o zoneamento diz o que pode ser construído e o MCMV diz se você pode financiar com subsídio", "HIS é o nome antigo do MCMV"]'::jsonb, 2, 'O módulo ensina essa resposta literal, separando zoneamento municipal de programa federal.' from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual categoria de zoneamento tem renda-alvo de até 10 salários mínimos?', '["HMP", "HIS 2", "R2V", "HIS 1"]'::jsonb, 0, 'HMP, Habitação do Mercado Popular, atende até 10 salários mínimos.' from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Um produto em zona HIS 1 ou HIS 2 geralmente se enquadra em quais faixas do MCMV?', '["Somente F4", "F1 ou F2", "F3 ou F4", "Nenhuma"]'::jsonb, 1, 'O mapa prático indica que HIS 1/2 geralmente corresponde a F1 ou F2.' from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'HIS, HMP e R2V são categorias de qual origem?', '["Programa federal MCMV", "Plano Diretor Municipal de São Paulo", "Conselho Curador do FGTS", "Normas da Caixa"]'::jsonb, 1, 'São categorias do Plano Diretor Municipal de SP.' from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'O que o corretor deve sempre perguntar à construtora sobre um produto?', '["Qual o nome do arquiteto", "Qual é o enquadramento de faixa deste produto", "Quantos corretores estão vendendo", "Qual o prazo de obra da fachada"]'::jsonb, 1, 'O módulo orienta confirmar com a construtora o enquadramento de faixa.' from public.academia_modulos where codigo = 'M06'
on conflict (modulo_id, ordem) do nothing;

-- M07 · Crédito Imobiliário e Financiamento
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M07', 7, 2, 'Crédito Imobiliário e Financiamento', 'Dominar o sistema de crédito habitacional: SAC, MIP, DFI, fluxo do ato às chaves e a matemática do financiamento apresentada como narrativa.',
  '["Explicar o SAC como argumento positivo (não como problema)", "Apresentar a simulação como narrativa em menos de 2 minutos", "Descrever o fluxo de pagamento da assinatura às chaves", "Calcular o prazo máximo para um cliente de qualquer idade", "Explicar MIP e DFI sem criar confusão ou resistência"]'::jsonb, '["Nunca apresentar o SAC como problema: a parcela cai enquanto a renda cresce.", "MIP e DFI são obrigatórios e já estão na parcela: avise para não surpreender.", "Simulação é narrativa, nunca tabela fria.", "Idade do mais velho + prazo ≤ 80 anos e 6 meses."]'::jsonb, array['Técnico']::text[], 6, '6h',
  35, true, false, 'Treinar a apresentação da simulação como narrativa em menos de 2 minutos, usando o script modelo do módulo, e calcular prazo máximo por idade.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/9kZQ3tItEdaGEbFYeH8Ns', 'https://app.notion.com/p/34a3220f69328192a89fe0a2a02c2497', '34a3220f69328192a89fe0a2a02c2497', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  current_date + 90)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'O Sistema SAC como Argumento Positivo', 'texto', 'No SAC (Sistema de Amortização Constante) a primeira parcela é a maior e vai caindo todo mês. Nunca apresentar o SAC como problema: é uma vantagem estrutural, porque a parcela cai enquanto a renda do trabalhador cresce. Em 10 anos a parcela pode cair 30 a 40% do valor inicial.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'MIP e DFI', 'texto', 'MIP (Morte e Invalidez Permanente) quita o imóvel em caso de morte ou invalidez. DFI (Danos Físicos ao Imóvel) cobre danos estruturais. Ambos são obrigatórios, já vêm na parcela e devem ser mencionados para evitar surpresa: valores pequenos, mas reais.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'A Simulação como Narrativa', 'texto', 'Script modelo: apartamento de R$ 230.000, subsídio F2 de R$ 40.000 que o governo coloca direto no banco, R$ 15.000 de FGTS trabalhando a favor, R$ 12.000 de entrada e pré-obra, sobrando R$ 163.000 a financiar, com primeira parcela SAC de cerca de R$ 980 que vai caindo todo mês. Nunca apresentar como tabela fria.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Fluxo do Ato às Chaves', 'texto', '1) Sinal/proposta de R$ 2.000 a R$ 5.000 para bloquear a unidade; 2) ato de assinatura com entrada + FGTS; 3) pré-obra/evolução com parcelas menores; 4) após liberação da Caixa começa a parcela SAC completa; 5) entrega das chaves e início da parcela cheia.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Prazo Máximo × Idade', 'texto', 'Regra: idade do mais velho + prazo ≤ 80 anos e 6 meses. Exemplos: 40 anos permite 35 anos de prazo, 50 anos permite 30 anos e 60 anos permite 20 anos.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/9kZQ3tItEdaGEbFYeH8Ns', 20 from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Treinar a apresentação da simulação como narrativa em menos de 2 minutos, usando o script modelo do módulo, e calcular prazo máximo por idade.', null, null from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Como o corretor SMQ deve apresentar o sistema SAC ao cliente?', '["Como vantagem: a parcela cai enquanto a renda tende a crescer", "Como um problema que deve ser aceito", "Evitando mencionar o sistema", "Como igual à tabela Price"]'::jsonb, 0, 'O módulo proíbe apresentar o SAC como problema e o trata como vantagem estrutural.' from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Um cliente de 50 anos é o mais velho da composição. Qual o prazo máximo de financiamento?', '["35 anos", "20 anos", "30 anos", "25 anos"]'::jsonb, 2, 'Pela regra idade + prazo ≤ 80a6m, a tabela do módulo indica 30 anos para 50 anos de idade.' from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'O que cobre o seguro MIP?', '["Desemprego do comprador", "Atraso de obra", "Quitação do imóvel em caso de morte ou invalidez permanente", "Danos estruturais ao imóvel"]'::jsonb, 2, 'MIP é Morte e Invalidez Permanente e quita o imóvel nesses casos.' from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual é a primeira etapa do fluxo do ato às chaves?', '["Liberação da Caixa", "Sinal/proposta de R$ 2.000 a R$ 5.000 para bloquear a unidade", "Entrega das chaves", "Parcela SAC completa"]'::jsonb, 1, 'O fluxo começa pelo sinal/proposta que bloqueia a unidade.' from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'No script de simulação narrativa, como o subsídio é explicado ao cliente?', '["Como empréstimo a devolver", "Como dinheiro que o governo coloca direto no banco, que ele não vê nem mexe", "Como desconto no preço de tabela", "Como bônus da construtora"]'::jsonb, 1, 'O script diz que o subsídio o governo coloca direto no banco e o cliente não vê nem mexe.' from public.academia_modulos where codigo = 'M07'
on conflict (modulo_id, ordem) do nothing;

-- M08 · Simulação, WWW8 e Capacidade de Compra
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M08', 8, 2, 'Simulação, WWW8 e Capacidade de Compra', 'Dominar o simulador da Caixa (WWW8) em menos de 5 minutos por perfil e apresentar a simulação como narrativa comercial, não como tabela.',
  '["Calcular a parcela máxima em segundos (regra dos 30%)", "Apresentar a simulação como história em menos de 2 minutos", "Simular 3 perfis distintos em 15 minutos no WWW8", "Identificar o impacto do FGTS no saldo financiado", "Explicar por que a renda MEI declarada pode ser diferente da aprovada"]'::jsonb, '["Simular ao vivo = autoridade imediata.", "Quem simula antes controla a conversa sobre parcela.", "WWW8 em 5 minutos: renda, FGTS, faixa/produto, narrativa.", "Renda MEI declarada ≠ renda aprovada."]'::jsonb, array['Técnico']::text[], 5, '5h (2h teoria + 3h laboratório)',
  42, true, true, 'Laboratório prático de 3h com 3 perfis (A: CLT R$ 4.500 + FGTS R$ 8.000; B: MEI R$ 7.000 declarado / R$ 5.500 extrato; C: casal CLT R$ 3.200 + INSS R$ 2.100). Meta: simular os 3 no WWW8 em 15 minutos e narrar cada um em menos de 2 minutos.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/qnT2j0lVPoYzLMGn0bMFI', 'https://app.notion.com/p/34a3220f693281668e36d5a9fcfecfde', '34a3220f693281668e36d5a9fcfecfde', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  current_date + 90)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Por que Simular é Vantagem Comercial', 'texto', 'Quem simula ao vivo tem autoridade imediata e tira a dúvida com dado, eliminando o medo de ''não sei se aprovo''. A simulação ao vivo cria comprometimento emocional com o número, e quem simula antes controla a conversa sobre parcela.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Protocolo WWW8 em 5 Minutos', 'texto', '1) acessar o simulador da Caixa; 2) inserir a renda familiar bruta; 3) aplicar o FGTS disponível; 4) selecionar faixa e produto; 5) apresentar o resultado como narrativa, não como tabela.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'A Matemática da Capacidade de Compra', 'texto', 'Regra dos 30%. R$ 3.200 (F1) dá parcela de R$ 960 e saldo de cerca de R$ 95k a R$ 130k. R$ 5.000 (F2) dá R$ 1.500 e cerca de R$ 200k a R$ 260k. R$ 9.600 (F3) dá R$ 2.880 e até R$ 400k. R$ 13.000 (F4) dá R$ 3.900 e até R$ 560k.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Variáveis que Impactam a Simulação', 'texto', 'Renda informal: a Caixa calcula a média dos extratos. MEI: DECORE + 6 meses de extratos, renda declarada diferente da aprovada. Composição com cônjuge e filhos maiores de 18 amplia a capacidade. FGTS futuro permite usar depósitos futuros como garantia (F1, CLT).

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Laboratório Prático: 3 Perfis', 'texto', 'Perfil A: CLT R$ 4.500 + FGTS R$ 8.000 para produto F2 de R$ 220k. Perfil B: MEI com R$ 7.000 declarado e R$ 5.500 em extrato para F3 de R$ 350k. Perfil C: casal com CLT R$ 3.200 + INSS R$ 2.100 para F2 de R$ 275k.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/qnT2j0lVPoYzLMGn0bMFI', 20 from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Laboratório prático de 3h com 3 perfis (A: CLT R$ 4.500 + FGTS R$ 8.000; B: MEI R$ 7.000 declarado / R$ 5.500 extrato; C: casal CLT R$ 3.200 + INSS R$ 2.100). Meta: simular os 3 no WWW8 em 15 minutos e narrar cada um em menos de 2 minutos.', null, null from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual o principal ganho comercial de simular ao vivo com o cliente?', '["Evitar falar de FGTS", "Economizar tempo do correspondente", "Autoridade imediata e controle da conversa sobre parcela", "Dispensar a qualificação"]'::jsonb, 2, 'O módulo afirma que simular ao vivo gera autoridade imediata e controle da conversa sobre parcela.' from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual é o último passo do protocolo WWW8?', '["Imprimir a tabela", "Pedir os documentos", "Enviar para a construtora", "Apresentar o resultado como narrativa"]'::jsonb, 3, 'O passo 5 é apresentar o resultado como narrativa, não como tabela.' from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Uma renda F2 de R$ 5.000 tem saldo financiável estimado de quanto, segundo a tabela?', '["Até R$ 400k", "R$ 95k a R$ 130k", "Até R$ 560k", "R$ 200k a R$ 260k"]'::jsonb, 3, 'A tabela do módulo indica cerca de R$ 200k a R$ 260k para R$ 5.000.' from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'No Perfil B do laboratório (MEI declara R$ 7.000, extrato R$ 5.500), o que o corretor precisa considerar?', '["Que MEI não pode financiar", "Que a renda aprovada tende a seguir o extrato, não a declaração", "Que o FGTS substitui a renda", "Que a Caixa aprova pela renda declarada"]'::jsonb, 1, 'Para MEI, a renda declarada pode diferir da aprovada, pois a Caixa olha extratos e DECORE.' from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'O FGTS futuro pode ser usado como garantia em qual situação citada no módulo?', '["F1 com vínculo CLT", "Somente aposentados", "Qualquer MEI", "F4 autônomo"]'::jsonb, 0, 'O módulo cita o FGTS futuro como garantia para F1, CLT.' from public.academia_modulos where codigo = 'M08'
on conflict (modulo_id, ordem) do nothing;

-- M09 · FGTS, Subsídio, Entrada e Fluxo de Pagamento
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M09', 9, 2, 'FGTS, Subsídio, Entrada e Fluxo de Pagamento', 'Dominar FGTS (3 formas de uso), FGTS Futuro, subsídio progressivo F2 e o fluxo de pagamento da assinatura às chaves. Calcular o custo real do aluguel ao vivo.',
  '["Listar as 3 formas de usar o FGTS com exemplos práticos", "Verificar a elegibilidade do FGTS ao vivo no app em 2 minutos", "Explicar o FGTS Futuro com clareza e honestidade sobre o risco", "Apresentar o custo real do aluguel com os números do cliente", "Explicar o subsídio F2 sem criar expectativa inflada"]'::jsonb, '["Saque-Aniversário ativo bloqueia o FGTS para compra (cancelar e aguardar 24 meses).", "FGTS exige 3 anos de recolhimento e nenhum imóvel no município/RM.", "FGTS Futuro só na contratação, só F1 CLT, com risco em caso de demissão.", "Subsídio F2 é progressivo e vai direto ao banco.", "Aluguel pago = patrimônio zero."]'::jsonb, array['Técnico']::text[], 5, '5h',
  50, true, false, 'Calcular ao vivo o custo real do aluguel com os números do cliente e verificar a elegibilidade do FGTS no app em até 2 minutos (checklist do módulo).', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/N8UR9AKpO7oCPlurXqNyG', 'https://app.notion.com/p/34a3220f693281f1a5fae0271263c93e', '34a3220f693281f1a5fae0271263c93e', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  current_date + 90)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'O FGTS: as 3 formas de usar', 'texto', '1) Entrada: abate do valor financiado, reduz saldo e parcela SAC. 2) Amortização a cada 2 anos, reduzindo saldo devedor ou prazo. 3) Redução de parcelas: até 80% da parcela por até 12 meses.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Elegibilidade do FGTS', 'texto', 'Exige no mínimo 3 anos de recolhimento, não necessariamente contínuos. O cliente não pode ter imóvel no município ou região metropolitana onde mora ou trabalha, nem financiamento ativo no SFH em qualquer estado. Saque-Aniversário ativo bloqueia a compra: é preciso cancelar e aguardar 24 meses.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'FGTS Futuro (desde abril/2024)', 'texto', 'Permite usar depósitos futuros como garantia de crédito: os 8% do salário vão direto para a parcela. Prazo máximo de 120 meses, somente F1 (renda até R$ 2.640) e CLT obrigatório. Deve ser escolhido na contratação. Risco: em caso de demissão, a parcela sobe após 6 meses sem depósito.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'O Subsídio F2: o argumento mais poderoso', 'texto', 'O subsídio é progressivo: quanto menor a renda dentro da F2, maior o valor, podendo chegar a R$ 55.000 para renda próxima de R$ 3.200. Vai direto para o banco, o cliente não vê nem mexe. Frase: é dinheiro do governo pagando parte do seu apartamento.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'O Argumento do Custo Real do Aluguel', 'texto', 'Calcular ao vivo com os números do cliente: R$ 900/mês de aluguel somam R$ 54.000 em 5 anos e R$ 108.000 em 10 anos, com patrimônio zero. Com MCMV, parcela SAC de cerca de R$ 950 que vai caindo resulta em imóvel de R$ 300.000+ em 10 anos. A diferença é o que sobra quando se olha 10 anos para trás.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/N8UR9AKpO7oCPlurXqNyG', 20 from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Calcular ao vivo o custo real do aluguel com os números do cliente e verificar a elegibilidade do FGTS no app em até 2 minutos (checklist do módulo).', null, null from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'O cliente tem Saque-Aniversário ativo e quer usar o FGTS na compra. O que o módulo orienta?', '["Basta pedir liberação na construtora", "Pode usar só metade", "Pode usar normalmente", "Está bloqueado: precisa cancelar e aguardar 24 meses"]'::jsonb, 3, 'O módulo afirma que Saque-Aniversário ativo bloqueia o uso para compra, exigindo cancelamento e espera de 24 meses.' from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual é o tempo mínimo de recolhimento de FGTS para uso na compra?', '["1 ano contínuo", "3 anos, não necessariamente contínuos", "Não há mínimo", "5 anos contínuos"]'::jsonb, 1, 'A elegibilidade exige mínimo de 3 anos de recolhimento, que não precisa ser contínuo.' from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual afirmação sobre o FGTS Futuro está correta?', '["Deve ser escolhido na contratação e é só para F1 CLT", "Não tem risco para o cliente", "Pode ser adicionado depois da contratação", "Vale para qualquer faixa"]'::jsonb, 0, 'O FGTS Futuro deve ser escolhido na contratação, é restrito à F1 com CLT e tem risco se houver demissão.' from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Como o subsídio F2 varia conforme a renda?', '["Quanto menor a renda na F2, maior o subsídio", "É fixo para todos", "Quanto maior a renda, maior o subsídio", "Depende só do valor do imóvel"]'::jsonb, 0, 'O subsídio é progressivo: quanto menor a renda dentro da F2, maior o valor.' from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Cliente paga R$ 900 de aluguel. Quanto terá pago em 10 anos, segundo o exemplo do módulo, e com que patrimônio?', '["R$ 90.000 e patrimônio zero", "R$ 54.000 e patrimônio de R$ 54.000", "R$ 108.000 e patrimônio de R$ 300.000", "R$ 108.000 e patrimônio zero"]'::jsonb, 3, 'O cálculo do módulo mostra R$ 108.000 pagos em 10 anos com patrimônio zero.' from public.academia_modulos where codigo = 'M09'
on conflict (modulo_id, ordem) do nothing;

-- M10 · A Jornada do Comprador de Primeiro Imóvel
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M10', 10, 3, 'A Jornada do Comprador de Primeiro Imóvel', 'Entender as 7 fases da jornada emocional do comprador, os 7 medos do primeiro imóvel e como o corretor atua como guia, não como vendedor.',
  '["Identificar em qual fase da jornada o lead está no primeiro contato", "Nomear os 7 medos e ter resposta técnica para cada um", "Conduzir a visita ativando emoção antes de apresentar números", "Reconhecer o silêncio do cliente como sinal de compra"]'::jsonb, '["Ordem da decisão: Emoção, Valor, Razão.", "Erro mais comum: começar pela razão.", "Reduzir o medo com dado, não com argumento.", "Nunca fechar sem o decisor (cônjuge/família).", "Silêncio do cliente pode ser sinal de compra."]'::jsonb, array['Comercial','Mentalidade']::text[], 4, '4h',
  55, true, false, 'Checklist ''Eu sou capaz de'': mapear em qual fase da jornada cada lead está no primeiro contato e ter resposta técnica pronta para os 7 medos.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/FibUDkTLWKt17aJ7HZqoX', 'https://app.notion.com/p/34a3220f69328170930fd824eef10aac', '34a3220f69328170930fd824eef10aac', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'As 7 Fases da Jornada', 'texto', 'Sonho (ainda não é lead), Gatilho (evento como filhos ou casamento, identificar na D2/D3), Pesquisa (ser o guia confiante), Confusão (simplificar), Contato (criar segurança primeiro), Decisão (70% emocional + 30% lógico, trabalhar os dois) e Celebração (chaves em mãos, pós-venda ativo transforma em fã).

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Os 7 Medos do Primeiro Imóvel', 'texto', 'Não ser aprovado: simular ao vivo. Perder o dinheiro: SPE + histórico de entrega. Construtora não entregar: registros reais. Obra atrasar: aluguel durante a obra vira parcela de patrimônio. Pagar parcela + aluguel: fluxo pré-obra detalhado. Apartamento ficar ruim: tour do decorado e vídeo de obra. Família discordar: incluir o decisor e nunca fechar sem ele.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'A Hierarquia da Decisão de Compra', 'texto', '90% das decisões de compra têm origem emocional. A ordem é Emoção (''eu me vejo morando aqui?''), Valor (''isso resolve meu problema?'') e Razão (''os números fecham?''). O erro mais comum é começar pela razão antes de trabalhar a emoção.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'O Corretor como Guia', 'texto', 'O corretor não empurra produto, orienta a jornada. Reduz o medo com dado, não com argumento. O cliente que se convence emocionalmente primeiro é mais difícil de cancelar.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/FibUDkTLWKt17aJ7HZqoX', 20 from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Prática do módulo', 'pratica', 'Checklist ''Eu sou capaz de'': mapear em qual fase da jornada cada lead está no primeiro contato e ter resposta técnica pronta para os 7 medos.', null, null from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual a ordem correta da hierarquia da decisão de compra?', '["Razão, Emoção, Valor", "Emoção, Valor, Razão", "Razão, Valor, Emoção", "Valor, Razão, Emoção"]'::jsonb, 1, 'O módulo define Emoção, depois Valor, depois Razão, e aponta começar pela razão como o erro mais comum.' from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'O cliente tem medo de não ser aprovado. Qual o tratamento indicado?', '["Mudar de assunto", "Pedir que volte depois com documentos", "Garantir que será aprovado", "Simular ao vivo, pois o dado elimina o medo"]'::jsonb, 3, 'Para o medo de não aprovação, o módulo indica simular ao vivo.' from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'O cônjuge não participou da conversa. O que o módulo orienta?', '["Ignorar, pois quem tem renda decide", "Fechar e explicar depois ao cônjuge", "Incluir o decisor e nunca fechar sem ele ou ela", "Mandar o contrato por e-mail"]'::jsonb, 2, 'O medo ''cônjuge/família discordar'' é tratado incluindo o decisor, nunca fechando sem ele.' from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Na fase ''Confusão'' da jornada, o que o corretor deve fazer?', '["Esperar o cliente decidir", "Enviar mais opções", "Apresentar tabela completa", "Simplificar"]'::jsonb, 3, 'Na confusão o cliente está paralisado por excesso de informação, e o papel do corretor é simplificar.' from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Por que convencer emocionalmente primeiro é vantajoso, segundo o módulo?', '["Porque reduz o preço", "Porque acelera a análise da Caixa", "Porque o cliente fica mais difícil de cancelar", "Porque dispensa a simulação"]'::jsonb, 2, 'O módulo afirma que o cliente que se convence emocionalmente primeiro é mais difícil de cancelar.' from public.academia_modulos where codigo = 'M10'
on conflict (modulo_id, ordem) do nothing;

-- M11 · Jornada Comercial e Funil de 14 Etapas
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M11', 11, 3, 'Jornada Comercial e Funil de 14 Etapas', 'Dominar as 14 etapas do funil SMQ com critérios claros de avanço e KPIs de conversão em cada etapa.',
  '["Nomear as 14 etapas do funil sem consultar", "Identificar em qual etapa cada lead está no pipeline", "Explicar o critério de avanço entre as etapas críticas", "Medir os próprios KPIs semanalmente", "Diagnosticar onde está o gargalo de conversão"]'::jsonb, '["Responder ao lead em menos de 5 minutos.", "Nunca pular da etapa 3 para a 5 sem D1 (renda) e D5 (decisor).", "Metas: comparecimento >60%, proposta/visita >75%, fechamento >30%, ciclo <21 dias.", "Pós-venda: contato mensal mínimo."]'::jsonb, array['Comercial','Operacional']::text[], 5, '5h',
  60, true, false, 'Mapear o próprio pipeline classificando cada lead em uma das 14 etapas, medir os KPIs semanalmente e diagnosticar o gargalo de conversão (checklist do módulo).', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/yoOWSaAZuF9FIfMYcOurE', 'https://app.notion.com/p/34a3220f693281689b23cf53bc0840bf', '34a3220f693281689b23cf53bc0840bf', 'rascunho', 'Conferir as 14 etapas contra o enum lead_status do CRM (a versão antiga tinha 13 e outra ordem).',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'As 14 Etapas do Funil SMQ (1 a 7)', 'texto', '1) Lead recebido: responder em menos de 5 min. 2) Primeiro contato: conexão criada e qualificação iniciada. 3) Qualificação nas 7 dimensões: D1 + D5 mínimos. 4) Pré-análise técnica: produto confirmado que cabe. 5) Apresentação inicial: narrativa personalizada. 6) Agendamento: data e hora confirmados. 7) Confirmação D-2/D-1/D+0 aplicada.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'As 14 Etapas do Funil SMQ (8 a 14)', 'texto', '8) Visita: tour completo em 7 passos. 9) Proposta: números como história. 10) Fechamento: técnica aplicada + silêncio. 11) Documentação: checklist entregue. 12) Análise de crédito com acompanhamento ativo. 13) Assinatura com celebração genuína. 14) Pós-venda com contato mensal mínimo.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'KPIs do Funil', 'texto', 'Metas SMQ: resposta ao lead em menos de 5 min, taxa de resposta no WhatsApp acima de 40%, comparecimento acima de 60%, proposta por visita acima de 75%, fechamento acima de 30% e ciclo médio abaixo de 21 dias.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'O Erro Mais Comum e o Critério Absoluto', 'texto', 'O erro mais comum é avançar sem qualificar e apresentar o produto antes de entender o perfil. Critério absoluto: NUNCA ir da etapa 3 para a 5 sem D1 (renda) e D5 (decisor) preenchidos.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/yoOWSaAZuF9FIfMYcOurE', 20 from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Prática do módulo', 'pratica', 'Mapear o próprio pipeline classificando cada lead em uma das 14 etapas, medir os KPIs semanalmente e diagnosticar o gargalo de conversão (checklist do módulo).', null, null from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual é o critério absoluto do funil SMQ?', '["Fechar na primeira visita sempre", "Enviar catálogo antes de qualificar", "Nunca ir da etapa 3 para a 5 sem D1 (renda) e D5 (decisor) preenchidos", "Agendar visita no primeiro contato"]'::jsonb, 2, 'O módulo define como critério absoluto não avançar sem D1 e D5 preenchidos.' from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual a meta SMQ de tempo de resposta ao lead?', '["No mesmo dia", "Até 1 hora", "Até 24 horas", "Menos de 5 minutos"]'::jsonb, 3, 'A etapa 1 e o KPI de resposta exigem menos de 5 minutos.' from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual a meta de taxa de comparecimento às visitas?', '["Acima de 30%", "Acima de 40%", "Acima de 90%", "Acima de 60%"]'::jsonb, 3, 'O KPI de comparecimento da SMQ é acima de 60%.' from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Um corretor tem muitas visitas mas poucas propostas. Qual KPI está abaixo e qual a meta?', '["Ciclo médio, meta abaixo de 21 dias", "Taxa de resposta WA, meta acima de 40%", "Proposta por visita, meta acima de 75%", "Resposta ao lead, meta abaixo de 5 min"]'::jsonb, 2, 'Proposta por visita mede exatamente essa conversão e a meta é acima de 75%.' from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Qual o critério de avanço da etapa 14, pós-venda?', '["Contato anual", "Nenhum, o processo acaba na assinatura", "Contato mensal mínimo", "Só se o cliente pedir"]'::jsonb, 2, 'A etapa 14 exige contato mensal mínimo.' from public.academia_modulos where codigo = 'M11'
on conflict (modulo_id, ordem) do nothing;

-- M12 · Prospecção Ativa: Criar Demanda, Não Esperar
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M12', 12, 3, 'Prospecção Ativa: Criar Demanda, Não Esperar', 'Dominar os 7 canais de prospecção, a fórmula G.P.V.A. e o bloco diário de prospecção inegociável das 09h–10h30.',
  '["Listar 3 ações de prospecção para hoje sem pensar muito", "Usar G.P.V.A. em qualquer primeiro contato sem consultar", "Respeitar o bloco das 09h–10h30 todos os dias", "Calcular quantos contatos precisa por dia para a meta", "Ativar pelo menos 3 canais diferentes por semana"]'::jsonb, '["Corretor SMQ cria o próprio pipeline.", "G.P.V.A.: Gancho, Personalização, Valor, Ação. Máximo 4 linhas.", "Nunca abrir com ''Oi tudo bem?''.", "Bloco de prospecção 09h–10h30 é inegociável.", "3 vendas/mês = cerca de 7 contatos novos por dia."]'::jsonb, array['Comercial','Operacional']::text[], 5, '5h (2h teoria + 3h workshop)',
  70, true, false, 'Workshop de 3h (carga do módulo): escrever mensagens de primeiro contato com G.P.V.A., calcular quantos contatos por dia a meta pessoal exige e ativar pelo menos 3 canais por semana.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/WCf7mgVHj79pc4DtBOmH3', 'https://app.notion.com/p/34a3220f6932815fa765e9a85d894978', '34a3220f6932815fa765e9a85d894978', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Mentalidade da Prospecção', 'texto', 'O corretor reativo espera o lead chegar; o corretor SMQ cria o próprio pipeline. Prospecção não é atividade de quando não há cliente: é o alicerce diário que garante o resultado do mês que vem.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Os 7 Canais de Prospecção', 'texto', 'Base própria (reativar com novidade real, semanal), indicações ativas (pedir de todo cliente satisfeito, após toda venda), redes sociais (conteúdo + DM proativo, diário), portais (responder em menos de 5 min), grupos e comunidades (WhatsApp de bairro, escola, empresa, semanal), presencial (região do empreendimento, plantão) e parcerias (correspondentes, escolas, igrejas, mensal).

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'A Fórmula G.P.V.A.', 'texto', 'Todo primeiro contato segue Gancho (primeira frase específica, nunca ''Oi tudo bem?''), Personalização (algo exclusivo da pessoa), Valor (o que ela ganha ao responder) e Ação (CTA com resposta binária). Máximo 4 linhas, sem catálogo antes de criar conexão.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'O Bloco de Prospecção 09h-10h30', 'texto', 'Bloco inegociável: sem atendimentos e sem reuniões, apenas ligações, WhatsApp, base e indicações. É o único bloco do dia que não cede para nenhuma outra demanda.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Cálculo Reverso', 'texto', 'Para 3 vendas por mês, com 40% de resposta, são necessários 155 contatos por mês, o que em 22 dias úteis dá 7 contatos novos por dia. Não é muito: é consistência.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/WCf7mgVHj79pc4DtBOmH3', 20 from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Workshop de 3h (carga do módulo): escrever mensagens de primeiro contato com G.P.V.A., calcular quantos contatos por dia a meta pessoal exige e ativar pelo menos 3 canais por semana.', null, null from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'O que significa o ''A'' da fórmula G.P.V.A.?', '["Apresentação do produto", "Agendamento", "Atenção", "Ação: CTA com resposta binária"]'::jsonb, 3, 'O ''A'' é Ação, um CTA com resposta binária.' from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual destas aberturas viola a fórmula G.P.V.A.?', '["Uma frase específica sobre a nova faixa MCMV", "''Oi, tudo bem?''", "Mencionar algo exclusivo da pessoa", "Oferecer um ganho claro ao responder"]'::jsonb, 1, 'O gancho nunca pode ser ''Oi tudo bem?''.' from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'O que pode ocupar o bloco das 09h às 10h30?', '["Atendimentos agendados", "Reuniões internas", "Apenas prospecção: ligações, WhatsApp, base e indicações", "Visitas ao decorado"]'::jsonb, 2, 'O bloco é inegociável e exclusivo para prospecção.' from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Pelo cálculo reverso do módulo, quantos contatos novos por dia são necessários para 3 vendas/mês?', '["30", "7", "15", "2"]'::jsonb, 1, '155 contatos no mês divididos por 22 dias úteis dão cerca de 7 por dia.' from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Com que frequência o canal ''indicações ativas'' deve ser acionado?', '["Após toda venda, pedindo a todo cliente satisfeito", "Só no fim do ano", "Quando faltar lead", "Mensalmente"]'::jsonb, 0, 'A tabela indica pedir indicação a todo cliente satisfeito, após toda venda.' from public.academia_modulos where codigo = 'M12'
on conflict (modulo_id, ordem) do nothing;

-- M13 · Abordagem Inicial: O Primeiro Contato que Decide Tudo
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M13', 13, 3, 'Abordagem Inicial: O Primeiro Contato que Decide Tudo', 'Dominar a abordagem inicial em qualquer canal (WhatsApp, ligação, presencial) e adaptar o estilo para 4 origens diferentes de lead.',
  '["Adaptar a abordagem para 4 origens diferentes de lead", "Usar G.P.V.A. sem consultar em qualquer primeiro contato", "Nunca enviar catálogo antes de criar conexão mínima", "Fazer uma pergunta de qualificação já no primeiro contato", "Responder um lead de portal em menos de 5 minutos"]'::jsonb, '["Os primeiros 30 segundos decidem se você conduz ou é conduzido.", "Uma pergunta de qualificação já no primeiro contato.", "Nunca catálogo antes de conexão.", "Nada de pressão inicial do tipo ''temos poucas unidades!''.", "Registrar os dados do primeiro contato."]'::jsonb, array['Comercial']::text[], 4, '4h',
  75, true, true, 'Checklist ''Eu sou capaz de'' com treino dos 4 scripts por origem de lead (portal, indicação, base fria, redes sociais) e do roteiro de estande.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/MJrwSLZk0fq8dRo5JKobU', 'https://app.notion.com/p/34a3220f6932815fb0b7dab46a91f293', '34a3220f6932815fb0b7dab46a91f293', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Por que a Abordagem Define o Funil', 'texto', 'Os primeiros 30 segundos determinam se o cliente vai responder, o nível de confiança e se o corretor vai conduzir ou ser conduzido.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Abordagem por Origem: Portal e Indicação', 'texto', 'Lead de portal: citar o empreendimento de interesse e já perguntar se é para morar e qual a renda familiar aproximada. Lead por indicação: citar quem indicou, conectar à vontade de sair do aluguel e propor uma conversa de 10 minutos sobre um produto MCMV na região.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Abordagem por Origem: Base Fria e Redes Sociais', 'texto', 'Base fria (30+ dias): ir direto ao ponto com a atualização das faixas MCMV que muda o cenário para o perfil do cliente e pedir 5 minutos. Lead de redes sociais: citar o post que ele curtiu sobre subsídio e perguntar se quer saber se tem direito.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Os 5 Erros da Abordagem', 'texto', '1) Começar com ''Oi, tudo bem?''; 2) mandar catálogo antes de criar conexão; 3) falar do produto antes de entender o perfil; 4) pressionar logo de início com ''temos poucas unidades!''; 5) não registrar os dados do primeiro contato.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Abordagem no Estande (Presencial)', 'texto', 'Receber pelo nome e oferecer água; perguntar se já conhece o produto ou está chegando agora; usar um gancho que desperte interesse antes de mostrar qualquer coisa; qualificar antes de qualquer apresentação.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/MJrwSLZk0fq8dRo5JKobU', 20 from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Checklist ''Eu sou capaz de'' com treino dos 4 scripts por origem de lead (portal, indicação, base fria, redes sociais) e do roteiro de estande.', null, null from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual abordagem o M13 recomenda para um lead de base fria (30+ dias)?', '["Ir direto ao ponto com a atualização das faixas MCMV e pedir 5 minutos", "Oferecer desconto imediato", "Perguntar ''lembra de mim?''", "Reenviar o catálogo completo"]'::jsonb, 0, 'O script de base fria usa a atualização das faixas como novidade real e pede 5 minutos.' from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'No lead por indicação, qual elemento deve aparecer logo no início?', '["O nome de quem indicou", "O preço do imóvel", "A lista de documentos", "O prazo de obra"]'::jsonb, 0, 'O script começa citando o indicador, o que transfere confiança.' from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual destes é um dos 5 erros da abordagem?', '["Dizer ''temos poucas unidades!'' logo de início", "Fazer uma pergunta de qualificação", "Citar o empreendimento de interesse", "Oferecer água no estande"]'::jsonb, 0, 'Pressão logo de início é o erro 4 da lista.' from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'No estande, qual o passo imediatamente anterior a qualquer apresentação?', '["Levar ao decorado", "Mostrar a maquete", "Qualificar o cliente", "Entregar o folder"]'::jsonb, 2, 'O roteiro presencial termina com qualificação antes de qualquer apresentação.' from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'O script para lead de portal pergunta, já no primeiro contato:', '["Se já tem outro corretor", "Qual dia prefere assinar", "Se ele tem FGTS e CPF limpo", "Se busca para morar e qual a renda familiar aproximada"]'::jsonb, 3, 'O script de portal já faz duas perguntas de qualificação: objetivo e renda.' from public.academia_modulos where codigo = 'M13'
on conflict (modulo_id, ordem) do nothing;

-- M14 · WhatsApp e Conversão Comercial
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M14', 14, 3, 'WhatsApp e Conversão Comercial', 'Transformar o WhatsApp em canal de conversão com método: G.P.V.A., protocolo D-2/D-1/D+0, 8 tipos de follow-up de valor e taxa de comparecimento >60%.',
  '["Escrever uma primeira mensagem G.P.V.A. em 2 minutos", "Aplicar o protocolo D-2/D-1/D+0 sem esquecer", "Variar os 8 tipos de follow-up sem repetir", "Classificar cada lead por temperatura (pronto/quente/morno/frio)", "Nunca desistir antes da 5ª tentativa com valor real"]'::jsonb, '["Resposta em menos de 5 min = 10× mais conversão.", "Protocolo D-2/D-1/D+0 leva comparecimento de 20–30% para 60–75%.", "Nunca repetir o mesmo tipo de follow-up em dois contatos seguidos.", "Nada de áudio no primeiro contato.", "Nunca desistir antes da 5ª tentativa com valor real."]'::jsonb, array['Comercial']::text[], 6, '6h (3h teoria + 3h roleplay)',
  80, true, true, 'Roleplay de 3h (carga do módulo): escrever primeiras mensagens G.P.V.A. em 2 minutos, aplicar o protocolo D-2/D-1/D+0 e montar uma sequência de follow-ups alternando os 8 tipos.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/ykxfjDF7VgGLcbjc5v6oF', 'https://app.notion.com/p/34a3220f693281b48995e9f8550a1912', '34a3220f693281b48995e9f8550a1912', 'rascunho', 'Conteúdo repete o M20 (8 tipos de follow-up). Alinhar com o Playbook Método Marquinhos (jul/2026).',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Dados Críticos', 'texto', 'Mensagem respondida em menos de 5 min tem 10× mais chance de conversão; após 30 min a probabilidade cai 90%. Sem o protocolo D-2/D-1/D+0 o comparecimento fica em 20 a 30%; com o protocolo sobe para 60 a 75%.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Protocolo de Confirmação de Visita D-2/D-1/D+0', 'texto', 'D-2: confirmar dia, hora e empreendimento perguntando se segue confirmado. D-1: ''amanhã é o dia'', reforçar hora e endereço e dizer que deixará o nome na lista. D+0 (manhã): bom dia, te espero hoje às [hora], qualquer dúvida é só chamar.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Os 8 Tipos de Follow-up com Valor Real', 'texto', '1) Prova social; 2) educativo (MCMV, FGTS, subsídio); 3) novidade real; 4) custo do aluguel; 5) pergunta de engajamento; 6) atualização de mercado; 7) resposta antecipada a uma dúvida; 8) reforço da dor. Regra: nunca repetir o mesmo tipo em dois contatos consecutivos.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Os 10 Erros que Destroem a Conversão', 'texto', 'Começar com ''Oi tudo bem?'', mandar catálogo no primeiro contato, texto longo, CTA vago, áudio no primeiro contato, spam sem valor, desistir após 1 ou 2 tentativas, não personalizar, responder devagar a lead quente e terminar sem próxima ação definida.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/ykxfjDF7VgGLcbjc5v6oF', 20 from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Prática do módulo', 'pratica', 'Roleplay de 3h (carga do módulo): escrever primeiras mensagens G.P.V.A. em 2 minutos, aplicar o protocolo D-2/D-1/D+0 e montar uma sequência de follow-ups alternando os 8 tipos.', null, null from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual o efeito do protocolo D-2/D-1/D+0 na taxa de comparecimento, segundo o módulo?', '["De 20–30% para 60–75%", "Não altera", "De 50% para 55%", "De 10% para 20%"]'::jsonb, 0, 'Sem protocolo o comparecimento é de 20 a 30%; com ele, 60 a 75%.' from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Você mandou um follow-up de prova social ontem. Qual regra vale para o próximo?', '["Parar de mandar mensagem", "Usar um tipo diferente, nunca o mesmo em contatos consecutivos", "Repetir prova social para reforçar", "Mandar o catálogo"]'::jsonb, 1, 'A regra é nunca repetir o mesmo tipo de follow-up em dois contatos consecutivos.' from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual destes é um dos 10 erros que destroem a conversão?', '["Responder rápido lead quente", "Enviar áudio no primeiro contato", "Definir a próxima ação no final", "Personalizar a mensagem"]'::jsonb, 1, 'Áudio no primeiro contato está na lista de erros.' from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'O que diz a mensagem de D-1?', '["Pede para remarcar", "Envia a tabela de preços", "Pergunta a renda", "Reforça que amanhã é o dia, hora e endereço, e que o nome estará na lista"]'::jsonb, 3, 'O script D-1 reforça data, hora e endereço e avisa que deixará o nome na lista.' from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Até quantas tentativas com valor real o corretor não deve desistir?', '["2", "5", "3", "10"]'::jsonb, 1, 'O checklist diz nunca desistir antes da 5ª tentativa com valor real.' from public.academia_modulos where codigo = 'M14'
on conflict (modulo_id, ordem) do nothing;

-- M15 · Ligação e Agendamento de Visita
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M15', 15, 3, 'Ligação e Agendamento de Visita', 'Dominar a ligação em 5 momentos (60 segundos), fechar agendamentos com duas opções de horário e responder as 3 principais objeções na ligação.',
  '["Conduzir a ligação em 5 momentos sem parecer robô", "Propor dois horários de visita como fechamento", "Adaptar o gancho para 4 origens diferentes de lead", "Responder as 3 objeções mais comuns na ligação", "Fazer 20 ligações em 90 minutos com consistência"]'::jsonb, '["Ligação em 5 momentos: abertura, gancho, qualificação, valor + proposta, fechamento.", "Agendamento com duas opções de horário, nunca aberto.", "Qualificação com 2–3 perguntas, não interrogatório.", "Meta: 2–3 agendamentos por bloco de 90 minutos."]'::jsonb, array['Comercial']::text[], 5, '5h (2h teoria + 3h ligações reais)',
  85, true, true, '3h de ligações reais (carga do módulo): meta de 20 ligações em 90 minutos aplicando os 5 momentos e as respostas às 3 objeções.', '[{"criterio": "Jornada: perguntou se é o primeiro imóvel", "peso": 1}, {"criterio": "Simulação: perguntou se já simulou financiamento", "peso": 1}, {"criterio": "Parcela: descobriu a parcela ideal antes de falar preço", "peso": 1}, {"criterio": "Conexão: apresentou o conceito SMQ (valor antes de preço)", "peso": 1}, {"criterio": "Decisor: descobriu se compra com mais alguém", "peso": 1}, {"criterio": "Agenda: fechou com dia, hora, quem vai e documentos", "peso": 1}, {"criterio": "Nenhum dos 4 erros fatais", "peso": 2}]'::jsonb,
  'https://gamma.app/generations/2VR1xkk9NSbjGOVUleS5n', 'https://app.notion.com/p/34a3220f693281b3b335eb464760ed36', '34a3220f693281b3b335eb464760ed36', 'rascunho', 'Conflito de método: o Notion ensina "ligação em 5 momentos"; o método oficial desde set/2026 é "Não sou conduzido. Eu conduzo." (6 perguntas). Decidir se as aulas 1 a 4 saem ou viram contexto.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Método oficial SMQ: as 6 perguntas', 'texto', '### O princípio
Quem pergunta conduz. Quem só responde obedece. Se o cliente pergunta "quanto custa?" e você responde o preço, a conversa passou a ser dele.

### O mapa da conversa: 6 perguntas, ordem fixa
1. **Vai ser seu primeiro imóvel?**
2. **Você já fez uma simulação de financiamento?**
3. **Qual a parcela ideal para você pagar?**
4. **Conceito Seu Metro Quadrado** (valor antes de preço)
5. **Você vai comprar com mais alguém?**
6. **Documentação e visita** (fechamento)

**Regra dura: ordem trocada é venda perdida.** Falar de preço antes de saber a renda entrega o controle da conversa ao cliente.

### A ligação só termina com 6 coisas
Jornada, simulação, parcela, conexão, decisor e **agenda** (data, hora, quem vai, documentos, canal de envio).

### Objeções: nunca sem horário pronto
Toda objeção sai com alternativa de horário. Urgência real + agilidade ("a visita leva 20 a 30 minutos") + opção específica: **dois horários, nunca "quando você pode?"**.

### Os 4 erros que matam a ligação
1. Falar preço antes de saber a renda.
2. Aceitar "vou pensar" sem oferecer horário.
3. Apresentar unidade sem saber quem decide.
4. Encerrar sem data, hora e documento.

> "Ligação boa não termina em ''vou pensar''. Termina com dia, hora e nome no documento."

> Esta é a versão oficial do método de ligação da SMQ (set/2026). Onde o conteúdo antigo deste módulo divergir, vale esta aula.', null, 25 from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Por que Ligar Ainda Funciona', 'texto', 'Num mundo de mensagens, a ligação virou diferencial. Quem liga cria conexão humana, demonstra comprometimento, qualifica em 2 minutos e fecha agendamentos com muito mais conversão.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'A Estrutura da Ligação em 5 Momentos', 'texto', '1) Abertura (5 a 10s): nome, imobiliária e ''tem 2 minutinhos?''. 2) Gancho (10 a 15s): perfil com chance de subsídio MCMV, ''quero te mostrar um número''. 3) Qualificação (30 a 60s): 2 ou 3 perguntas estratégicas, sem interrogatório. 4) Valor + proposta (20 a 30s): possível subsídio e pedido de 40 minutos presenciais. 5) Fechamento do agendamento com duas opções, nunca aberto.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Objeções na Ligação', 'texto', '''Não tenho interesse'': entendo, só me diz, você paga aluguel hoje? Quanto? ''Não posso falar agora'': qual o melhor horário, amanhã de manhã ou à tarde? ''Já tenho corretor'': como segunda opinião, você sabe quanto de subsídio tem direito?

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Métricas de Ligação', 'texto', '15 a 25 ligações por bloco de prospecção, taxa de atendimento esperada de 40 a 50% e taxa de agendamento por atendimento de 20 a 30%. Meta: 2 a 3 agendamentos por bloco de 90 minutos.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/2VR1xkk9NSbjGOVUleS5n', 20 from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', '3h de ligações reais (carga do módulo): meta de 20 ligações em 90 minutos aplicando os 5 momentos e as respostas às 3 objeções.', null, null from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Como o corretor deve fechar o agendamento na ligação?', '["''Posso te mandar o endereço?''", "''Você prefere quarta às 14h ou quinta às 10h?''", "''Quando você puder, me avisa''", "''Vamos marcar algum dia?''"]'::jsonb, 1, 'O módulo exige duas opções de horário, nunca pergunta aberta.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'O lead diz ''já tenho corretor''. Qual a resposta indicada?', '["Criticar o outro corretor", "Agradecer e desligar", "Propor ser segunda opinião e perguntar se sabe quanto de subsídio tem direito", "Oferecer comissão menor"]'::jsonb, 2, 'A resposta do módulo posiciona o corretor como segunda opinião usando o subsídio como gancho.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Quanto tempo deve durar o momento de qualificação na ligação?', '["30 a 60 segundos", "15 minutos", "5 a 10 segundos", "5 minutos"]'::jsonb, 0, 'A qualificação ocupa 30 a 60 segundos com 2 ou 3 perguntas.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual a meta de agendamentos por bloco de 90 minutos?', '["10", "5 a 6", "1", "2 a 3"]'::jsonb, 3, 'As métricas indicam 2 a 3 agendamentos por bloco.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'O lead responde ''não posso falar agora''. O que fazer?', '["Insistir em falar rápido", "Perguntar o melhor horário oferecendo opções: amanhã de manhã ou à tarde", "Mandar áudio longo", "Desistir do lead"]'::jsonb, 1, 'O módulo orienta oferecer opções de horário para retornar.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 6, 'O cliente liga e a primeira coisa que pergunta é o preço. Pelo método SMQ, o que você faz?', '["Passa o preço e depois pergunta a renda", "Conduz com a pergunta 1: se vai ser o primeiro imóvel", "Manda a tabela completa no WhatsApp", "Diz que só passa preço na visita e desliga"]'::jsonb, 1, 'Quem pergunta conduz. Preço antes de renda entrega o controle da conversa ao cliente.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 7, 'Qual a ordem correta das 3 primeiras perguntas da ligação?', '["Parcela, simulação, primeiro imóvel", "Simulação, primeiro imóvel, parcela", "Primeiro imóvel, simulação, parcela", "Primeiro imóvel, parcela, decisor"]'::jsonb, 2, 'O mapa é fixo: jornada, simulação, parcela, conceito SMQ, decisor, documentação e visita.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 8, 'O cliente diz "vou pensar". Qual resposta segue o método?', '["\"Tudo bem, fico no aguardo\"", "\"Quando você puder, me avisa\"", "Oferecer dois horários específicos de visita de 20 a 30 minutos", "Mandar mensagem de follow-up em 7 dias"]'::jsonb, 2, 'Nunca deixar objeção sem alternativa de horário pronta: urgência real, agilidade e duas opções.' from public.academia_modulos where codigo = 'M15'
on conflict (modulo_id, ordem) do nothing;

-- M16 · Qualificação Profunda: SPIN e as 7 Dimensões
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M16', 16, 3, 'Qualificação Profunda: SPIN e as 7 Dimensões', 'Dominar as 7 dimensões de qualificação (D1–D7) com ênfase na D7 (objeção latente) como mapa do fechamento. Proporção correta: 30% fala / 70% ouve.',
  '["Conduzir as 7 dimensões em 15 minutos de forma natural", "Fazer D7 sem que pareça uma armadilha", "Identificar o decisor real e incluí-lo no processo", "Usar a motivação emocional (D3) como ancoragem no fechamento", "Detectar que o perfil não cabe no produto antes de apresentar"]'::jsonb, '["Sem D7 = fechamento às cegas.", "Corretor fala 30%, cliente fala 70%.", "Nunca fechar pergunta com ''né?'' ou ''certo?''.", "O cliente que verbaliza a própria necessidade se convence.", "D1 (renda) e D5 (decisor) são o mínimo para avançar no funil."]'::jsonb, array['Comercial']::text[], 6, '6h (2h teoria + 4h laboratório SPIN)',
  90, true, true, 'Laboratório SPIN de 4h (carga do módulo): conduzir as 7 dimensões em 15 minutos de forma natural, com foco em fazer a D7 sem parecer armadilha.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/imUVNwLkvq2du9Qeclj90', 'https://app.notion.com/p/34a3220f6932814d8896e36799955d26', '34a3220f6932814d8896e36799955d26', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Por que Qualificar Profundamente Muda Tudo', 'texto', 'Sem qualificação, produto errado vai para perfil errado e o lead é desperdiçado. Com qualificação, o corretor tem produto certo, apresentação personalizada e fechamento com mapa.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'As 7 Dimensões', 'texto', 'D1 renda e capacidade; D2 urgência e prazo; D3 motivação emocional (''o que te faz querer sair do aluguel agora?''); D4 situação atual (aluguel, imóvel no nome); D5 decisor real (''quem mais vai participar?''); D6 experiência anterior; D7 objeção latente (''se encontrasse o ideal com a parcela certa, o que ainda poderia te impedir de fechar hoje?'').

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'D7: a dimensão mais crítica', 'texto', 'D7 é a mais importante e a menos usada. Feita antes da apresentação, dá ao corretor o mapa do obstáculo real; sem ela, o fechamento é às cegas. Revela medo de aprovação, cônjuge não convencido, pendência financeira ou insegurança com prazo de obra.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'A Lógica SPIN no Imobiliário', 'texto', 'Situação (''como está sua moradia hoje?''), Problema (''o que incomoda?''), Implicação (''o que acontece se isso não mudar em 2 anos?'') e Necessidade (''o que seria ideal para você?''). O cliente que verbaliza a própria necessidade se convence; o corretor só confirma.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Proporção Certa', 'texto', 'O corretor fala 30% e o cliente fala 70%. Usar perguntas abertas e nunca terminar com ''né?'' ou ''certo?''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/imUVNwLkvq2du9Qeclj90', 20 from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Laboratório SPIN de 4h (carga do módulo): conduzir as 7 dimensões em 15 minutos de forma natural, com foco em fazer a D7 sem parecer armadilha.', null, null from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual é a pergunta-chave da D7 (objeção latente)?', '["''Se encontrasse o ideal com a parcela certa, o que ainda poderia te impedir de fechar hoje?''", "''A renda familiar está em quanto?''", "''Você já visitou algum imóvel?''", "''Quem mais vai decidir?''"]'::jsonb, 0, 'Essa é a pergunta D7 que revela o obstáculo real antes da apresentação.' from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual a proporção de fala recomendada na qualificação?', '["Corretor 30%, cliente 70%", "Corretor 90%, cliente 10%", "50% cada", "Corretor 70%, cliente 30%"]'::jsonb, 0, 'O módulo define 30% fala do corretor e 70% do cliente.' from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Na lógica SPIN, a pergunta ''o que acontece se isso não mudar em 2 anos?'' corresponde a:', '["Problema", "Situação", "Necessidade", "Implicação"]'::jsonb, 3, 'É a pergunta de Implicação do SPIN.' from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'A D5 da qualificação trata de:', '["Renda", "Decisor real", "Urgência e prazo", "Experiência anterior"]'::jsonb, 1, 'D5 é o decisor real: quem mais participa da decisão.' from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'O que acontece quando o corretor apresenta sem fazer a D7?', '["Nada, D7 é opcional", "A Caixa reprova o crédito", "Ganha tempo e fecha mais rápido", "Fecha às cegas, sem o mapa do obstáculo real"]'::jsonb, 3, 'O módulo afirma: sem D7 = fechamento às cegas.' from public.academia_modulos where codigo = 'M16'
on conflict (modulo_id, ordem) do nothing;

-- M17 · Apresentação do Produto: CAB e Narrativa Personalizada
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M17', 17, 3, 'Apresentação do Produto: CAB e Narrativa Personalizada', 'Apresentar o produto com método CAB (Característica → Aplicação → Benefício) personalizado para cada cliente, usando a qualificação como base.',
  '["Aplicar CAB em 3 características diferentes do produto", "Conduzir o tour em 7 passos começando pela área de lazer", "Usar as respostas da qualificação para personalizar em tempo real", "Reconhecer 3 sinais de compra e parar de apresentar", "Apresentar a simulação como história após o tour emocional"]'::jsonb, '["CAB: Característica, Aplicação, Benefício.", "Nunca apresentar antes de terminar a qualificação.", "Sempre começar a visita pela área de lazer.", "2+ sinais de compra: parar de apresentar e propor o fechamento.", "Números só depois do tour emocional."]'::jsonb, array['Comercial']::text[], 5, '5h (2h teoria + 3h roleplay CAB)',
  100, true, false, 'Roleplay CAB de 3h (carga do módulo): aplicar CAB em 3 características diferentes do produto e conduzir o tour em 7 passos personalizando com as respostas da qualificação.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/bFH3GaQpwE2JjyhE7UkAq', 'https://app.notion.com/p/34a3220f6932813bb162e17f9ad151f2', '34a3220f6932813bb162e17f9ad151f2', 'rascunho', 'Repete os 7 passos da visita e sinais de compra do M18. Decidir onde cada tema mora.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'O Erro que Mais Perde Vendas', 'texto', 'Apresentar o produto antes de terminar a qualificação. Quem mostra o produto igual para todo mundo não conecta com a necessidade específica e parece vendedor, não consultor.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'O Método CAB', 'texto', 'Característica é o dado objetivo (''são 52m²''), Aplicação é para este cliente específico (''para uma família de 3 como a sua'') e Benefício é o que ele ganha. Nunca ''o apartamento tem 52m²''; sempre algo como ''são 52m² com planta inteligente, para vocês dois e o bebê que vem aí funciona muito bem''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Os 7 Passos da Visita SMQ', 'texto', '1) Recepção pelo nome com água; 2) ancoragem emocional retomando a D3; 3) área de lazer sempre primeiro, emoção antes; 4) tour personalizado com CAB em 7 cômodos; 5) silêncios respeitados; 6) simulação após o tour emocional; 7) D7 novamente: ''agora que você viu tudo, o que poderia te impedir?''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Sinais de Compra Durante a Apresentação', 'texto', 'Verbais: ''quantas unidades ainda têm?'', ''esse quarto ficaria como?'', ''como funciona o pagamento?''. Não verbais: abre armário e testa, para de olhar o celular, mede com os braços. Regra: 2 ou mais sinais, parar de apresentar e propor o fechamento.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Personalização em Tempo Real', 'texto', 'Usar o que foi dito na qualificação: filhos (''aqui ficaria o quarto deles''), gosto por cozinhar (''olha o tamanho da cozinha''), home office (''dá para montar uma mesa aqui'').

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/bFH3GaQpwE2JjyhE7UkAq', 20 from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Roleplay CAB de 3h (carga do módulo): aplicar CAB em 3 características diferentes do produto e conduzir o tour em 7 passos personalizando com as respostas da qualificação.', null, null from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual frase aplica corretamente o método CAB?', '["''São 52m² com planta inteligente, para vocês dois e o bebê que vem aí funciona muito bem.''", "''O apartamento tem 52m².''", "''O metro quadrado está barato.''", "''É o maior apartamento da região.''"]'::jsonb, 0, 'A frase conecta característica, aplicação ao cliente e benefício, como no exemplo ''sempre'' do módulo.' from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Por onde a visita SMQ deve começar após a recepção e a ancoragem?', '["Pela cozinha", "Pela tabela de preços", "Pela área de lazer", "Pela simulação"]'::jsonb, 2, 'O passo 3 é sempre a área de lazer: emoção primeiro.' from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'O cliente pergunta quantas unidades restam e abre o armário para testar. O que fazer?', '["Parar de apresentar e propor o fechamento", "Mostrar outro empreendimento", "Continuar o tour até o fim", "Voltar à qualificação"]'::jsonb, 0, 'Com 2 ou mais sinais de compra, a regra é parar de apresentar e propor o fechamento.' from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Em que momento da visita a simulação deve ser apresentada?', '["Após o tour emocional", "Só por WhatsApp depois", "Antes de mostrar a área de lazer", "Na recepção"]'::jsonb, 0, 'O passo 6, simulação, vem depois do tour emocional.' from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'O ''A'' do CAB significa:', '["Aprovação", "Aplicação para este cliente específico", "Área útil", "Argumento"]'::jsonb, 1, 'Aplicação é como a característica serve a este cliente específico.' from public.academia_modulos where codigo = 'M17'
on conflict (modulo_id, ordem) do nothing;

-- M18 · Visita ao Imóvel: Conduzir com Intenção
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M18', 18, 3, 'Visita ao Imóvel: Conduzir com Intenção', 'Dominar os 7 passos da visita SMQ (começar pela área de lazer), reconhecer sinais de compra verbais e não-verbais e saber quando propor o fechamento.',
  '["Conduzir os 7 passos da visita sem consultar", "Sempre começar pela área de lazer", "Respeitar o silêncio do cliente sem preencher", "Reconhecer 3 sinais verbais e 3 não-verbais de compra", "Propor próxima ação ao final independente do resultado"]'::jsonb, '["Quem comparece já passou 3 barreiras: respondeu, qualificou e confirmou.", "Cliente em silêncio está comprando: não falar.", "2+ sinais de compra: parar e propor fechamento.", "Nunca fechar sem o decisor; agendar a volta com ele.", "Sempre propor próxima ação ao final."]'::jsonb, array['Comercial']::text[], 6, '6h (2h teoria + 4h visita real acompanhada)',
  110, true, true, '4h de visita real acompanhada (carga do módulo): conduzir os 7 passos sem consultar, registrar sinais de compra observados e propor próxima ação ao final.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/kwQSKePDE9Uu47WRBYBca', 'https://app.notion.com/p/34a3220f693281af9e7fd5a52cdde2c3', '34a3220f693281af9e7fd5a52cdde2c3', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'A Visita é o Momento de Maior Temperatura Emocional', 'texto', 'O cliente que comparece já ultrapassou 3 barreiras: respondeu, qualificou e confirmou. Ele está pronto para ser influenciado, positiva ou negativamente.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Preparação Obrigatória Antes da Visita', 'texto', 'Revisar o perfil do cliente (renda, D3, D7), preparar a simulação personalizada, saber qual unidade disponível tem a melhor posição e confirmar D-2, D-1 e D+0.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Os 7 Passos da Visita SMQ', 'texto', '1) Recepção: nome, água, fazer sentir-se esperado; 2) ancoragem emocional com a D3; 3) área de lazer SEMPRE primeiro; 4) tour personalizado com CAB em 7 cômodos; 5) silêncios respeitados, cliente parado está comprando; 6) simulação do imóvel à parcela como narrativa; 7) D7 novamente.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Sinais de Compra', 'texto', 'Verbais: ''quantas unidades ainda têm?'' (medo de perder, comprador real), ''esse quarto ficaria como com minha cama?'' (personalizando), ''minha esposa ia amar isso'' (incluindo o decisor). Não verbais: abre armário, toca a parede, mede com os braços, para de olhar o celular, se inclina ao falar de valores. Regra: 2+ sinais, propor fechamento.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Se o Decisor Não Veio', 'texto', 'Nunca tentar fechar sem o decisor, mas não perder a oportunidade: ''você gostou tanto que imagino que queira trazer ela/ele para ver também. Quando pode vir com ela/ele?''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/kwQSKePDE9Uu47WRBYBca', 20 from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', '4h de visita real acompanhada (carga do módulo): conduzir os 7 passos sem consultar, registrar sinais de compra observados e propor próxima ação ao final.', null, null from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Durante o tour, o cliente para e fica em silêncio olhando a sala. O que o corretor deve fazer?', '["Respeitar o silêncio e não falar", "Preencher com mais características", "Perguntar se ele gostou", "Mostrar a simulação imediatamente"]'::jsonb, 0, 'O passo 5 diz: cliente parado está comprando, não falar.' from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual item NÃO faz parte da preparação obrigatória antes da visita?', '["Enviar o contrato para assinatura", "Revisar renda, D3 e D7", "Preparar a simulação personalizada", "Confirmar D-2, D-1 e D+0"]'::jsonb, 0, 'A preparação envolve perfil, simulação, melhor unidade e confirmações, não contrato.' from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'O cliente diz ''minha esposa ia amar isso'', mas ela não veio. Qual a conduta?', '["Dar desconto para decidir sozinho", "Fechar agora para não perder", "Propor trazer a esposa e agendar a nova visita", "Ignorar e seguir"]'::jsonb, 2, 'Nunca fechar sem o decisor; o módulo dá o script para agendar a volta com ele ou ela.' from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'A pergunta ''quantas unidades ainda têm?'' indica:', '["Que ele quer alugar", "Objeção de preço", "Medo de perder, sinal de comprador real", "Desinteresse"]'::jsonb, 2, 'O módulo classifica essa pergunta como medo de perder, sinal de comprador real.' from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Quais 3 barreiras o cliente que compareceu à visita já ultrapassou?', '["Assinou, pagou e visitou", "Simulou, aprovou e reservou", "Respondeu, qualificou e confirmou", "Indicou, ligou e agendou"]'::jsonb, 2, 'O módulo cita responder, qualificar e confirmar.' from public.academia_modulos where codigo = 'M18'
on conflict (modulo_id, ordem) do nothing;

-- M19 · Objeções Estratégicas: Protocolo de 4 Passos
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M19', 19, 3, 'Objeções Estratégicas: Protocolo de 4 Passos', 'Tratar as 20 principais objeções do mercado MCMV com o protocolo Validar → Investigar → Endereçar → Ação. Nunca criar urgência falsa.',
  '["Identificar o tipo de cada objeção antes de responder", "Aplicar os 4 passos sem pular o passo 2 (investigar)", "Responder as 5 objeções críticas com fluência", "Nunca criar urgência falsa", "Terminar toda resposta de objeção com ação concreta"]'::jsonb, '["Validar, Investigar, Endereçar, Ação.", "Nunca pular o passo 2 (investigar).", "Credibilidade se resolve demonstrando, nunca argumentando.", "Urgência falsa = confiança destruída permanentemente.", "Toda resposta de objeção termina com ação concreta."]'::jsonb, array['Comercial']::text[], 6, '6h (2h teoria + 4h maratona de objeções)',
  120, true, true, 'Maratona de objeções de 4h (carga do módulo): responder as 5 objeções críticas aplicando os 4 passos sem pular a investigação e terminando sempre com ação concreta.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/w3I6OPgiiqyYbGrTAfyLT', 'https://app.notion.com/p/34a3220f693281b48413e8e6c00a0556', '34a3220f693281b48413e8e6c00a0556', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'A Objeção é Informação', 'texto', 'A objeção diz onde está o medo, a dúvida ou o gargalo real. O corretor que a trata com método fecha mais do que quem apenas tem boas respostas prontas.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Os 6 Tipos de Objeção', 'texto', 'Dúvida (não entendeu: explicação simples com exemplo), Medo (teme errar: prova social, dados e transparência), Preço (não vê valor: custo de NÃO comprar), Timing (não é o momento: impacto real do adiamento), Credibilidade (não confia: demonstrar, nunca argumentar) e Falsa (pretexto: investigar a raiz real).

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Protocolo de 4 Passos', 'texto', '1) Validar (''faz sentido querer pensar nisso bem''); 2) Investigar (''o que especificamente está te preocupando?''); 3) Endereçar o que foi revelado; 4) Ação: propor próximo passo concreto. Nunca pular o passo 2: responder sem investigar é tratar a objeção imaginada.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'As 5 Objeções Mais Críticas', 'texto', '''Vou pensar'': falsa, investigar a raiz e propor bloqueio com prazo. ''Não tenho entrada'': verificar FGTS ao vivo e subsídio F2. ''Não sei se aprovo'': simular ao vivo. ''Prefiro alugar'': custo real do aluguel ao vivo. ''Cônjuge precisa ver'': real, agendar visita com o decisor e nunca fechar sem ele.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Urgência: só com verdade', 'texto', 'Urgência falsa destrói a confiança permanentemente. Só usar urgência real: estoque real documentado, tabela com data real ou condição especial com prazo real.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/w3I6OPgiiqyYbGrTAfyLT', 20 from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Maratona de objeções de 4h (carga do módulo): responder as 5 objeções críticas aplicando os 4 passos sem pular a investigação e terminando sempre com ação concreta.', null, null from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual é o passo que nunca pode ser pulado no protocolo de objeções?', '["Investigar", "Endereçar", "Ação", "Validar"]'::jsonb, 0, 'O módulo alerta: nunca pular o passo 2, pois responder sem investigar é tratar a objeção imaginada.' from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'O cliente diz ''não tenho entrada''. Qual a abordagem indicada?', '["Verificar o FGTS ao vivo e mostrar que o subsídio pode cobrir a entrada na F2", "Sugerir que junte dinheiro por um ano", "Oferecer parcelar a entrada no cartão", "Encerrar o atendimento"]'::jsonb, 0, 'O módulo orienta verificar FGTS ao vivo e usar o subsídio da F2.' from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Uma objeção de credibilidade (''não confio'') deve ser tratada como?', '["Argumentando com convicção", "Oferecendo desconto", "Demonstrando, nunca argumentando", "Ignorando"]'::jsonb, 2, 'A tabela dos 6 tipos diz: credibilidade, demonstrar, nunca argumentar.' from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Quando o corretor pode usar urgência?', '["Nunca, em hipótese alguma", "No fim do mês para bater meta", "Só quando for real: estoque documentado, tabela com data real ou condição com prazo real", "Sempre que o cliente hesitar"]'::jsonb, 2, 'Urgência só com verdade; urgência falsa destrói a confiança.' from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, '''Vou pensar'' é classificada no módulo como objeção de que tipo e qual a conduta?', '["Real, dar espaço e esperar contato", "De timing, remarcar para o próximo ano", "De preço, dar desconto", "Falsa, investigar a raiz e propor bloqueio com prazo"]'::jsonb, 3, 'O módulo trata ''vou pensar'' como falsa: investigar a raiz e propor bloqueio com prazo.' from public.academia_modulos where codigo = 'M19'
on conflict (modulo_id, ordem) do nothing;

-- M20 · Follow-up e Recuperação de Leads
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M20', 20, 3, 'Follow-up e Recuperação de Leads', 'Estruturar o follow-up como sistema de valor (não de pressão): 8 tipos de conteúdo, cadência por temperatura e a última tentativa com dignidade.',
  '["Classificar cada lead por temperatura", "Escolher o tipo correto de follow-up para cada contato", "Nunca enviar o mesmo tipo de mensagem duas vezes seguidas", "Fazer a última tentativa com dignidade antes de descartar", "Organizar o cronograma de follow-up da semana em 20 minutos"]'::jsonb, '["80% das vendas acontecem entre o 5º e o 12º contato.", "Vence o mais valioso, não o mais insistente.", "Cadência: pronto 2–3 dias, quente 3–5 dias, morno semanal, frio quinzenal.", "Última tentativa com dignidade, sem suplicar.", "Reativar base fria com novidade real."]'::jsonb, array['Comercial','Operacional']::text[], 5, '5h',
  130, true, false, 'Classificar a própria carteira por temperatura e montar o cronograma de follow-up da semana em 20 minutos, alternando os 8 tipos de conteúdo (checklist do módulo).', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/9LVwK60RQMCofV7ETbcpJ', 'https://app.notion.com/p/34a3220f6932816c9664c297fb238153', '34a3220f6932816c9664c297fb238153', 'rascunho', 'Conferir contra a cadência oficial D1/D2/D3 e a régua de higiene de 7 dias.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'A Verdade sobre o Follow-up', 'texto', '80% das vendas acontecem entre o 5º e o 12º contato, e a maioria dos corretores desiste na 2ª tentativa. Quem vence no follow-up não é o mais insistente, é o mais valioso.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Os 8 Tipos de Follow-up com Valor Real', 'texto', 'Prova social, educativo, novidade real, custo do aluguel, pergunta de engajamento, atualização de mercado, resposta antecipada e reforço da dor. Nunca repetir o mesmo tipo em dois contatos consecutivos.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Cadência por Temperatura', 'texto', 'Pronto: a cada 2 a 3 dias, foco no gargalo identificado. Quente: a cada 3 a 5 dias, valor específico. Morno: semanal, educativo ou novidade. Frio: quinzenal, novidade real ou última tentativa.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'A Última Tentativa com Dignidade', 'texto', 'Mensagem modelo: ''entendo que talvez não seja o momento ideal. Se um dia eu puder ajudar, pode me chamar. Cuide-se!''. Isso reabre a porta para o futuro sem suplicar.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Reativação de Base Fria', 'texto', 'O gatilho mais eficiente é uma atualização real de mercado: ''saiu uma atualização importante no MCMV que muda o cenário para o seu perfil. Vale 5 minutos?''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/9LVwK60RQMCofV7ETbcpJ', 20 from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Classificar a própria carteira por temperatura e montar o cronograma de follow-up da semana em 20 minutos, alternando os 8 tipos de conteúdo (checklist do módulo).', null, null from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Segundo o M20, em que intervalo de contatos acontecem 80% das vendas?', '["3º ao 4º", "1º ao 2º", "5º ao 12º", "Após o 20º"]'::jsonb, 2, 'O módulo afirma que 80% das vendas ocorrem entre o 5º e o 12º contato.' from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual a cadência de follow-up para um lead morno?', '["Diária", "A cada 2 a 3 dias", "Mensal", "Semanal"]'::jsonb, 3, 'Lead morno recebe contato semanal com foco educativo ou novidade.' from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Um lead frio não responde há semanas. Qual deve ser o foco do próximo contato?', '["Repetir a oferta", "Pressão com escassez", "Novidade real ou a última tentativa com dignidade", "Áudio longo explicando tudo"]'::jsonb, 2, 'Para lead frio, a cadência quinzenal foca em novidade real ou última tentativa.' from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual o objetivo da mensagem de última tentativa?', '["Informar que o lead será descartado", "Reabrir a porta para o futuro sem suplicar", "Oferecer desconto final", "Pressionar uma decisão final"]'::jsonb, 1, 'A última tentativa com dignidade reabre a porta sem suplicar.' from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Quem vence no follow-up, segundo o módulo?', '["O que dá mais desconto", "O que manda mais mensagens", "O mais valioso", "O mais insistente"]'::jsonb, 2, 'O módulo diz que vence o mais valioso, não o mais insistente.' from public.academia_modulos where codigo = 'M20'
on conflict (modulo_id, ordem) do nothing;

-- M21 · Pasta, Proposta e Fechamento
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M21', 21, 3, 'Pasta, Proposta e Fechamento', 'Dominar as 5 técnicas de fechamento (alternativo, resumo, urgência legítima, silêncio, assumptivo), os pré-requisitos da pasta e o protocolo ''vou pensar'' em 4 passos.',
  '["Nomear as 5 técnicas de fechamento e quando usar cada uma", "Aguardar 30–60 segundos de silêncio após propor a pasta", "Tratar \"vou pensar\" com os 4 passos sem pressão", "Verificar os 4 pré-requisitos antes de propor o fechamento", "Sair de todo atendimento com próxima ação definida"]'::jsonb, '["Fechamento é consequência, não evento.", "4 pré-requisitos: decisor presente, D7 mapeada, 2+ sinais, simulação compreendida.", "Proponha o COMO, nunca o SE: jamais ''vai fechar?''.", "Silêncio de 30 a 60 segundos: quem fala primeiro perde.", "Nunca inventar urgência."]'::jsonb, array['Comercial']::text[], 6, '6h (2h teoria + 4h roleplay de fechamento)',
  150, true, true, 'Roleplay de fechamento de 4h (carga do módulo): verificar os 4 pré-requisitos, aplicar as 5 técnicas, sustentar 30 a 60 segundos de silêncio e tratar ''vou pensar'' com os 4 passos.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/et45AxW0olMKpCaTx0a5Y', 'https://app.notion.com/p/34a3220f69328118a9d9e94fcb8d9b53', '34a3220f69328118a9d9e94fcb8d9b53', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'O Fechamento Não é um Evento', 'texto', 'O fechamento é o resultado natural de um atendimento bem conduzido. Se qualificação, apresentação e visita foram bem feitas, propor a pasta é apenas o próximo passo lógico.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Pré-Requisitos Antes de Propor a Pasta', 'texto', 'Checar: D5, o decisor real está presente? D7, você sabe o que pode travar? Há 2 ou mais sinais de compra? A simulação foi apresentada e compreendida? Se qualquer resposta for ''não'', não é o momento.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'As 5 Técnicas de Fechamento', 'texto', 'Alternativo (''prefere assinar hoje ou amanhã de manhã?''), Resumo (retomar aluguel, subsídio e parcela), Urgência legítima (só com urgência real e comprovável), Silêncio (propor e parar de 30 a 60 segundos, quem fala primeiro perde) e Assumptivo (''vamos ver qual bloco tem a melhor posição?''). Nunca inventar urgência.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Nunca Perguntar ''Vai Fechar?''', 'texto', 'A pergunta binária gera cerca de 70% de ''não'' ou ''talvez''. A pergunta certa propõe o COMO, não o SE.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Protocolo ''Vou Pensar'' em 4 Passos', 'texto', '1) Validar: faz sentido pensar bem, é uma decisão importante. 2) Investigar: o que você precisa pensar, valor, produto, alguma dúvida? 3) Endereçar exatamente o que surgiu. 4) Ação: ''e se a gente bloquear hoje e você tiver [X] dias para decidir com calma?''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Sair Sempre com Próxima Ação', 'texto', 'Não fechou: data marcada e decisor incluído. Fechou: pasta assinada e checklist de documentos entregue. Nenhum atendimento encerra sem próxima ação definida.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/et45AxW0olMKpCaTx0a5Y', 20 from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 8, 'Prática do módulo', 'pratica', 'Roleplay de fechamento de 4h (carga do módulo): verificar os 4 pré-requisitos, aplicar as 5 técnicas, sustentar 30 a 60 segundos de silêncio e tratar ''vou pensar'' com os 4 passos.', null, null from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual pergunta de fechamento o M21 proíbe?', '["''Vai fechar?''", "''Você prefere assinar hoje ou amanhã de manhã?''", "''Resumindo: você sai do aluguel, tem subsídio e a parcela fica em...''", "''Vamos ver qual bloco tem a melhor posição?''"]'::jsonb, 0, '''Vai fechar?'' é binária e gera cerca de 70% de ''não'' ou ''talvez''.' from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Após propor a pasta, quanto tempo de silêncio o corretor deve sustentar?', '["5 segundos", "Não deve haver silêncio", "30 a 60 segundos", "5 minutos"]'::jsonb, 2, 'A técnica do silêncio pede propor e parar por 30 a 60 segundos.' from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'O decisor real não está presente. Segundo os pré-requisitos, o que fazer?', '["Usar a técnica assumptiva", "Não é o momento: sair com data marcada e decisor incluído", "Aplicar urgência", "Propor a pasta assim mesmo"]'::jsonb, 1, 'Se qualquer pré-requisito for ''não'', não é o momento; a próxima ação é data marcada com o decisor.' from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual é o passo 4 do protocolo ''vou pensar''?', '["Mandar o contrato por e-mail", "Encerrar e esperar o cliente", "Dar desconto", "Propor bloquear hoje e dar alguns dias para decidir com calma"]'::jsonb, 3, 'O passo 4, Ação, propõe o bloqueio com prazo para decidir.' from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Quando usar a técnica de resumo?', '["Quando há urgência real", "Sempre no primeiro contato", "Quando o cliente não gostou do imóvel", "Quando o cliente está com muita informação e parece disperso"]'::jsonb, 3, 'A tabela indica o resumo para cliente com muita informação e disperso.' from public.academia_modulos where codigo = 'M21'
on conflict (modulo_id, ordem) do nothing;

-- M22 · Marca Pessoal e Autoridade Local
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M22', 22, 4, 'Marca Pessoal e Autoridade Local', 'Construir presença digital estratégica com os 4 tipos de conteúdo (educativo, produto, prova social, bastidor) e calendário editorial semanal consistente.',
  '["Criar conteúdo para os 4 tipos na mesma semana", "Manter calendário editorial por 30 dias consecutivos", "Escrever um gancho que pare o scroll em 2 segundos", "Criar um CTA específico para cada tipo de post", "Usar prova social sem expor dados do cliente sem autorização"]'::jsonb, '["85% dos clientes pesquisam o corretor online antes de responder.", "Mix: 40% educativo, 25% prova social, 20% produto, 15% bastidor.", "3 posts medianos por semana > 1 post perfeito por mês.", "Prova social só com autorização do cliente.", "CTA específico, nunca ''entre em contato''."]'::jsonb, array['Comercial','Operacional']::text[], 5, '5h + prática contínua',
  null, true, false, 'Montar e manter o calendário editorial semanal por 30 dias consecutivos, produzindo os 4 tipos de conteúdo na mesma semana com CTA específico em cada post.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/Z5eewUAcgTB3NZLApZsdt', 'https://app.notion.com/p/34a3220f6932812886c3cea21b9db53d', '34a3220f6932812886c3cea21b9db53d', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Por que Marca Pessoal é Obrigatória', 'texto', '85% dos clientes pesquisam o corretor online antes de responder. O corretor invisível perde para o presente, mesmo sendo tecnicamente melhor. Marca pessoal consistente gera leads sem custo de mídia e é o ativo mais valioso e menos copiável da carreira.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Os 4 Tipos de Conteúdo', 'texto', 'Educativo (40% do mix, gera autoridade: MCMV, FGTS, subsídio), Produto (20%, gera desejo: tour comentado, diferenciais), Prova social (25%, gera confiança: chaves, depoimentos) e Bastidor (15%, gera conexão: rotina de plantão). Prova social exige autorização do cliente; sem ela, usar ''uma família que atendi recentemente...''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'O Funil Digital do Corretor', 'texto', 'Conteúdo, seguidores, engajamento, DM, WhatsApp e atendimento. O objetivo não é viralizar, é estar presente de forma consistente para quando o cliente estiver pronto para comprar.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Calendário Editorial Semanal', 'texto', 'Segunda: carrossel educativo. Terça e quinta: stories de bastidor. Quarta: feed de produto. Quinta: Reels educativo de 30s sobre crédito. Sexta: prova social. Sábado: stories ao vivo do plantão.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Consistência e CTA', 'texto', '3 posts medianos toda semana valem mais que 1 post perfeito por mês, pois o algoritmo recompensa consistência. Nunca usar CTA ''entre em contato''; usar algo como ''me manda MCMV no DM e te explico em 5 minutos'' ou ''clica no link da bio para simular grátis''.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Ferramentas Gratuitas para Começar', 'texto', 'Canva para artes profissionais, CapCut para edição de Reels, WhatsApp Business para organizar leads e Google Agenda para planejar o conteúdo.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/Z5eewUAcgTB3NZLApZsdt', 20 from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 8, 'Prática do módulo', 'pratica', 'Montar e manter o calendário editorial semanal por 30 dias consecutivos, produzindo os 4 tipos de conteúdo na mesma semana com CTA específico em cada post.', null, null from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual tipo de conteúdo deve ocupar a maior parte do mix (40%)?', '["Educativo", "Prova social", "Bastidor", "Produto"]'::jsonb, 0, 'O conteúdo educativo é 40% do mix e gera autoridade.' from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Você quer postar a entrega de chaves de um cliente, mas não tem autorização. O que fazer?', '["Postar mesmo assim", "Usar ''uma família que atendi recentemente...'' sem expor dados", "Desistir de prova social", "Pedir para um colega postar"]'::jsonb, 1, 'O módulo exige autorização e sugere essa formulação quando não há.' from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual CTA está alinhado ao M22?', '["''Saiba mais''", "''Qualquer coisa, estou à disposição''", "''Me manda MCMV no DM e te explico em 5 minutos''", "''Entre em contato''"]'::jsonb, 2, 'O módulo condena ''entre em contato'' e recomenda CTAs específicos como esse.' from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual regra de consistência o módulo defende?', '["1 post perfeito por mês", "Postar 10 vezes por dia", "3 posts medianos toda semana valem mais que 1 perfeito por mês", "Postar só quando houver lançamento"]'::jsonb, 2, 'A regra é 3 posts medianos por semana acima de 1 post perfeito por mês.' from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Qual é o objetivo do funil digital do corretor?', '["Vender pelo Instagram sem atendimento", "Estar presente de forma consistente para quando o cliente estiver pronto", "Viralizar", "Ganhar seguidores de outras cidades"]'::jsonb, 1, 'O módulo diz que o objetivo não é viralizar, e sim estar presente de forma consistente.' from public.academia_modulos where codigo = 'M22'
on conflict (modulo_id, ordem) do nothing;

-- M23 · IA e Tecnologia Aplicada ao Corretor
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M23', 23, 4, 'IA e Tecnologia Aplicada ao Corretor', 'Usar IA (Claude, ChatGPT, Gemini) como multiplicador de produtividade: scripts, roleplay de treino, conteúdo e análise de atendimento em 30 minutos.',
  '["Usar IA para gerar 5 scripts em 10 minutos", "Fazer roleplay de objeção com IA antes do plantão", "Usar CapCut para editar um Reels em menos de 15 minutos", "Criar o calendário de conteúdo da semana com IA em 20 minutos", "Saber exatamente onde a IA ajuda e onde o corretor é insubstituível"]'::jsonb, '["IA não substitui o corretor. Amplifica o corretor bom.", "Quanto mais contexto no prompt, melhor o resultado.", "Rotina: 5 min de roleplay antes e 5 min de análise depois do plantão.", "IA não sente o silêncio da visita nem fecha com empatia."]'::jsonb, array['Operacional']::text[], 4, '4h + uso contínuo',
  null, true, false, 'Roleplay com IA de 3 objeções 5 minutos antes do plantão e análise do atendimento 5 minutos depois; gerar 5 scripts em 10 minutos e o calendário de conteúdo da semana em 20 minutos.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/CSARpGJmZpfKgXMDoP4Q8', 'https://app.notion.com/p/34a3220f693281118b74f750c47755b9', '34a3220f693281118b74f750c47755b9', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'A Posição Certa sobre IA', 'texto', 'IA não substitui o corretor, amplifica o corretor bom. Quem domina IA não será substituído, vai substituir quem não domina. A IA elimina o trabalho mecânico para liberar tempo para o que é genuinamente humano.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'O que a IA Faz em 30 Minutos', 'texto', '5 scripts de WhatsApp personalizados, 10 respostas de objeções, 7 legendas da semana, 3 variações de copy A/B e análise de atendimento, cada um em cerca de 10 minutos. Roteiro de Reels de 45s e roleplay de objeção antes do plantão em 5 minutos.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'Como Usar IA para Scripts', 'texto', 'Prompt eficiente dá papel (corretor especializado em MCMV), situação (lead do Instagram, mora de aluguel, renda de cerca de R$ 4.500, não respondeu) e formato (máximo 4 linhas, gancho específico, CTA de qualificação). Regra: quanto mais contexto, melhor o resultado.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Como Usar IA para Treinamento', 'texto', 'Antes do plantão, pedir que a IA simule um cliente com a objeção ''não sei se vou ser aprovado'' e avalie a resposta. Após perder uma venda, descrever o atendimento e pedir avaliação em 5 dimensões apontando onde errou.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Ferramentas e Limites da IA', 'texto', 'Ferramentas: Claude/ChatGPT/Gemini, Canva com IA, CapCut com IA, WhatsApp Business e Google Agenda. A IA não cria relacionamento genuíno, não sente o silêncio da visita, não adapta o tom ao estado emocional em tempo real e não fecha uma venda com empatia e presença.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'A IA como Treino Diário', 'texto', '5 minutos antes do plantão para roleplay de 3 objeções, 5 minutos após o plantão para análise do atendimento e, semanalmente, gerar o calendário de conteúdo da próxima semana.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/CSARpGJmZpfKgXMDoP4Q8', 20 from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 8, 'Prática do módulo', 'pratica', 'Roleplay com IA de 3 objeções 5 minutos antes do plantão e análise do atendimento 5 minutos depois; gerar 5 scripts em 10 minutos e o calendário de conteúdo da semana em 20 minutos.', null, null from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual a posição da SMQ sobre IA?', '["IA serve só para anúncios", "IA é proibida no atendimento", "IA vai substituir o corretor", "IA não substitui o corretor, amplifica o corretor bom"]'::jsonb, 3, 'A frase central do módulo é: IA não substitui o corretor, amplifica o corretor bom.' from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Qual elemento torna um prompt de script mais eficiente, segundo o módulo?', '["Escrever em inglês", "Dar o máximo de contexto: papel, situação do lead e formato", "Pedir ''uma mensagem boa''", "Ser o mais curto possível"]'::jsonb, 1, 'A regra do módulo é: quanto mais contexto você dá à IA, melhor o resultado.' from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual destas tarefas a IA NÃO faz, segundo o M23?', '["Sentir o silêncio da visita", "Simular um cliente em roleplay", "Gerar legendas para a semana", "Criar variações de copy A/B"]'::jsonb, 0, 'Sentir o silêncio da visita está na lista do que a IA não faz.' from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Como usar a IA depois de perder uma venda?', '["Ignorar e seguir", "Descrever o atendimento e pedir avaliação em 5 dimensões apontando onde errou", "Pedir um desconto para oferecer", "Pedir para ela ligar ao cliente"]'::jsonb, 1, 'O módulo propõe essa análise pós-atendimento com a IA.' from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Qual a rotina diária de treino com IA proposta?', '["1 hora antes do plantão", "Só aos sábados", "5 min de roleplay antes e 5 min de análise depois do plantão", "Somente quando perder venda"]'::jsonb, 2, 'O módulo define 5 minutos antes e 5 minutos após o plantão.' from public.academia_modulos where codigo = 'M23'
on conflict (modulo_id, ordem) do nothing;

-- M24 · Ética, Cultura e o Legado do Corretor SMQ
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('M24', 24, 5, 'Ética, Cultura e o Legado do Corretor SMQ', 'Internalizar os 5 valores inegociáveis do Corretor SMQ (honestidade técnica, comprometimento, responsabilidade radical, excelência contínua, cultura de grandeza) e o significado do nível Mestre SMQ.',
  '["Dominar crédito, MCMV e simulação com confiança", "Qualificar profundamente antes de apresentar qualquer produto", "Conduzir o atendimento com processo, não com improvisação", "Tratar objeções com método, empatia e dado", "Fechar com naturalidade, sem pressão e sem suplicar", "Prospectar todos os dias, independente de ter cliente", "Ter rotina e KPIs e saber onde está o gargalo", "Construir marca pessoal com consistência", "Usar IA como multiplicador, não como substituto", "Ser honesto com o cliente mesmo quando custa a comissão"]'::jsonb, '["Integridade acima da comissão.", "Honestidade custa, mas nunca sai cara.", "Compete-se com a versão anterior de si mesmo, não com o colega.", "A excelência é uma decisão tomada de novo toda manhã.", "Indicadores do Mestre: NPS alto, indicações espontâneas, baixo cancelamento, mentoria, consistência."]'::jsonb, array['Mentalidade','Excelência']::text[], 4, '4h + ritmo contínuo',
  null, true, false, 'Checklist final ''O Corretor SMQ Completo'' com 10 itens de autoavaliação que consolidam toda a Academia, marcando a passagem ao nível Mestre SMQ.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  'https://gamma.app/generations/SSGlrBgiNdheVRayzaYgW', 'https://app.notion.com/p/34a3220f693281688056c3019150b004', '34a3220f693281688056c3019150b004', 'rascunho', 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'O que Diferencia o Corretor SMQ', 'texto', 'Qualquer corretor pode aprender técnica. O que não se ensina em planilha é integridade, comprometimento e a decisão diária de ser melhor do que foi ontem.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Os 5 Valores Inegociáveis', 'texto', 'Honestidade técnica: nunca prometer o que a Caixa não confirmou nem criar urgência falsa. Comprometimento: do lead às chaves e além, pós-venda ativo é profissionalismo. Responsabilidade radical: o resultado depende do processo e da decisão de agir. Excelência contínua: o Mestre SMQ ainda estuda e treina. Cultura de grandeza: competir com a versão anterior de si, não com o colega.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'O que Ética Significa na Prática', 'texto', 'Recusar uma venda que vai prejudicar o cliente (integridade acima da comissão), corrigir um dado errado já passado, avisar sobre o risco real de aprovação (gera confiança e indicação) e entregar o prometido em prazo, retorno e informação.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Os Indicadores do Mestre SMQ', 'texto', 'NPS alto com clientes, indicações recorrentes sem precisar pedir, menor taxa de cancelamento da equipe, mentoria ativa de corretores novos e resultado consistente que não oscila com humor ou mercado.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'A Decisão Diária e o Legado', 'texto', 'A excelência não é um destino, é uma decisão tomada de novo toda manhã. O Corretor SMQ não é lembrado pelo número de vendas, mas pela forma como fez: a família que saiu do aluguel, o casal que realizou o primeiro patrimônio, a mãe que viu os filhos crescerem num espaço que é deles.

> Resumo provisório. O texto completo vem do Notion pelo script de importação.', null, 10 from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Slides do módulo', 'slides', 'Revise os slides completos do módulo antes do quiz.', 'https://gamma.app/generations/SSGlrBgiNdheVRayzaYgW', 20 from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Prática do módulo', 'pratica', 'Checklist final ''O Corretor SMQ Completo'' com 10 itens de autoavaliação que consolidam toda a Academia, marcando a passagem ao nível Mestre SMQ.', null, null from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Você percebe que uma venda vai prejudicar o cliente. O que o M24 orienta?', '["Recusar a venda: integridade acima da comissão", "Fechar com desconto", "Fechar e resolver depois", "Passar o cliente para um colega"]'::jsonb, 0, 'O módulo cita recusar uma venda que prejudica o cliente como ética na prática.' from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'Segundo o valor ''cultura de grandeza'', com quem o corretor SMQ compete?', '["Com a construtora", "Com os colegas da equipe", "Com outras imobiliárias", "Com a versão anterior de si mesmo"]'::jsonb, 3, 'O módulo diz: não se compete com o colega, se compete com a versão anterior de si mesmo.' from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Qual destes é um indicador do nível Mestre SMQ?', '["Maior número de leads recebidos", "Mais horas de plantão", "Indicações recorrentes sem precisar pedir", "Maior desconto concedido"]'::jsonb, 2, 'Indicações recorrentes sem pedir estão entre os indicadores do Mestre SMQ.' from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Você passou um dado errado ao cliente ontem. Qual a conduta ética?', '["Corrigir o dado: honestidade custa, mas nunca sai cara", "Pedir para a construtora corrigir", "Mudar de assunto na próxima conversa", "Esperar ele perceber"]'::jsonb, 0, 'Corrigir um dado errado já passado é um dos exemplos de ética na prática.' from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Como o valor ''comprometimento'' trata o pós-venda?', '["Como responsabilidade da construtora", "Como gentileza opcional", "Como algo só para clientes VIP", "Como profissionalismo: do lead às chaves e além"]'::jsonb, 3, 'O módulo afirma que o pós-venda ativo não é gentileza, é profissionalismo.' from public.academia_modulos where codigo = 'M24'
on conflict (modulo_id, ordem) do nothing;

-- P01 · Treinamento prático: WhatsApp e ligação
insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,
  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,
  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)
values ('P01', 99, 3, 'Treinamento prático: WhatsApp e ligação', 'Academia SMQ, Playbook de Atendimento de Alta Conversão (baseado no Manual Definitivo para Corretores de Imóveis MCMV)',
  '["Qualificar o lead sem parecer um interrogatório, usando a troca de valor", "Aplicar as 6 perguntas de qualificação na sequência obrigatória", "Adaptar tom e estratégia ao perfil do cliente (Corretor Camaleão)", "Converter a conversa em visita confirmada com a técnica das 2 opções", "Aplicar o protocolo de confirmação D-2 / D-1 / D+0", "Usar gatilhos de urgência apenas quando verdadeiros"]'::jsonb, '["Não é o cliente que decide o que quer; nós orientamos a melhor opção que cabe para ele.", "Nunca peça uma informação sem justificar o benefício para o cliente.", "Sequência obrigatória das 6 perguntas, começando por ''é o seu primeiro imóvel?''.", "Nunca perguntar ''quando você pode?'': sempre 2 opções.", "Confirmação completa: endereço, dia/hora, quem procurar, abertura para remarcar.", "Urgência e escassez apenas quando verdadeiras."]'::jsonb, array['Comercial']::text[], null, null,
  null, false, false, 'Aplicar o checklist de qualificação completo antes de agendar qualquer visita e usar os scripts prontos de agendamento (valor, 2 opções, confirmação) e do protocolo D-2/D-1/D+0.', '[{"criterio": "Executou a prática do módulo por completo", "peso": 1}, {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1}, {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1}, {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1}]'::jsonb,
  null, 'https://app.notion.com/p/34c3220f693281089093ccab14ced4e7', '34c3220f693281089093ccab14ced4e7', 'rascunho', 'Página do Notion parece incompleta (termina no meio da tabela de gatilhos e não tem a parte de documentação).',
  null)
on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,
  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,
  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,
  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id
  where public.academia_modulos.status = 'rascunho';  -- nunca sobrescreve módulo já publicado
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 1, 'Sobre o Treinamento e Regra de Ouro', 'texto', 'Cobre os 3 processos mais críticos do atendimento digital e telefônico: qualificação, agendamento e recolhimento de documentação para análise de crédito. Regra de ouro: não é o cliente que decide o que ele quer; nós orientamos a melhor opção dentro das expectativas e do que cabe para ele.', null, 10 from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 2, 'Filosofia da Qualificação Consultiva', 'texto', 'Qualificar não é interrogar, é uma troca de valor: o corretor oferece informação relevante e o cliente compartilha dados. Princípio: nunca pedir uma informação sem antes justificar o benefício para o cliente (técnica ganha-ganha, informação por informação).', null, 10 from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 3, 'As 6 Perguntas de Qualificação (sequência obrigatória)', 'texto', '1) É o seu primeiro imóvel? (elegibilidade MCMV; se não, redirecionar para SFH/upgrade). 2) Está buscando há algum tempo ou é recente? (descoberta, consideração ou decisão). 3) Já visitou projetos ou fez análise de crédito? (''fiz e fui aprovado'' = cliente quente, acelerar). 4) Trabalha registrado ou autônomo? 5) Renda bruta mensal (holerite antes dos descontos) ou média estimada para autônomo. 6) Vai comprar sozinho ou com alguém? (composição de renda e decisor).', null, 10 from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 4, 'Quando o cliente pergunta ''por que precisa saber minha renda?''', 'texto', 'Explicar que a renda define o valor de imóvel financiável e a parcela, e que no MCMV pode haver subsídio que entra direto no banco. Sem a renda, o corretor pode mostrar algo que não cabe no orçamento e desperdiçar o tempo do cliente. Analogia: é como ir ao médico, ele precisa saber os sintomas para receitar o remédio certo.', null, 10 from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 5, 'Checklist de Qualificação e o Corretor Camaleão', 'texto', 'Antes de agendar: nome, telefone com DDD, primeiro imóvel, tempo de busca, visitas anteriores, análise de crédito, vínculo, renda, composição e renda do outro comprador, FGTS aproximado, região e projeto confirmados. Adaptar o tom: jovem/informal (leve, emojis), formal/executivo (objetivo, dados), família tradicional (acolhedor, segurança), ansioso (direto e empático), desconfiado (transparente, provas sociais). Regra prática: espelhar ritmo e tom do cliente.', null, 10 from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 6, 'Agendamento Irresistível em 3 Passos', 'texto', '1) Construir valor antes de propor: entender todo o processo, conhecer o decorado, desenhar cenários financeiros e tirar dúvidas, com escassez legítima (vendas por ordem de aprovação). 2) Propor sempre 2 opções concretas, nunca ''quando você pode?''. 3) Confirmar com endereço completo, dia e horário exatos, nome de quem procurar e abertura para remarcar.', null, 10 from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)
select id, 7, 'Protocolo D-2 / D-1 / D+0 e Gatilhos de Urgência', 'texto', 'Sem protocolo o comparecimento fica em 20 a 30%; com ele, 60 a 75%. Mensagens de D-2, D-1, D+0 manhã e um reforço D+0 de 3 a 4 horas antes se não houver confirmação. Gatilhos só quando verdadeiros: pré-lançamento (prioridade na escolha de unidades) e ordem de aprovação (projetos com alta demanda). Urgência falsa destrói a credibilidade permanentemente.', null, 10 from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 1, 'Qual é a primeira pergunta da sequência obrigatória de qualificação?', '["Vai comprar sozinho?", "Qual a sua renda bruta?", "Você trabalha registrado?", "É o seu primeiro imóvel?"]'::jsonb, 3, 'A pergunta 1 é ''é o seu primeiro imóvel?'', pois revela a elegibilidade ao MCMV e abre a jornada.' from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 2, 'O lead diz que já fez análise de crédito e foi aprovado. Como o playbook classifica esse cliente?', '["Frio, precisa de educação", "Quente, pronto para decidir: acelerar e apresentar proposta", "Trava financeira", "Fase inicial de pesquisa"]'::jsonb, 1, 'A tabela da pergunta 3 marca ''fiz análise e fui aprovado'' como cliente quente.' from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 3, 'Por que perguntar ''trabalha registrado ou autônomo?'' antes da renda?', '["Para descobrir o empregador", "Para calcular o FGTS exato", "Porque autônomo não pode comprar", "Porque não pergunta renda diretamente, prepara a próxima pergunta e indica a documentação necessária"]'::jsonb, 3, 'O playbook explica que a pergunta 4 prepara o terreno sem ser invasiva e já indica os documentos.' from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 4, 'Qual forma de propor o agendamento está correta segundo o playbook?', '["''Posso te mandar a localização?''", "''Você conseguiria na quarta à tarde ou na quinta de manhã?''", "''Quando você pode vir?''", "''Me avisa quando tiver um tempo''"]'::jsonb, 1, 'A técnica das 2 opções evita passar a decisão ao cliente e reduz a procrastinação.' from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;
insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)
select id, 5, 'Qual elemento NÃO é obrigatório na mensagem de confirmação da visita?', '["Endereço completo", "Tabela de preços do empreendimento", "Dia e horário exatos", "Nome de quem procurar na recepção"]'::jsonb, 1, 'Os elementos essenciais são endereço, dia/horário, quem procurar e abertura para remarcar.' from public.academia_modulos where codigo = 'P01'
on conflict (modulo_id, ordem) do nothing;

-- ---------------------------------------------------------------------
-- Regras de recomendação por indicador
-- ---------------------------------------------------------------------
-- O motor que calcula os indicadores e gera as recomendações é da Fatia 5.
-- Aqui só nascem as REGRAS, e o modo de operação é SOMBRA
-- (academia_config.recomendacao_modo): a recomendação é gerada e fica
-- invisível para o aluno até a gestão validar que ela aponta certo.
--
-- R01, R04, R05 e R08 receberam as definições do diagnóstico da Fatia 0.
-- R07 nasce DESATIVADA: não existe a fonte de dados.
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R01', 'tempo_primeiro_contato', 'Demora para o primeiro contato bem acima do time', 'M13', 'maior_e_pior', 1.5, 90, 8, true,
        'Mediana de MINUTOS UTEIS (public._minutos_uteis_entre, janela comercial 08:00-19:00 de Sao Paulo) entre a atribuicao do lead e a 1a interacao do corretor. Conta SO lead novo (gatilhos webhook, sla_webhook*, agendamento_*): lead puxado do bolsao, transferido ou devolvido nao entra. Lead sem contato registrado entra com o PIOR tempo da janela, senao quem nunca liga termina com mediana boa. Fatia 0: mediana do time 8 min; so 143 das 4.978 atribuicoes em 30 dias eram lead novo pago, por isso a janela subiu para 90 dias. A Fatia 5 exige ainda uma diferenca minima absoluta alem do 1,5x.')
on conflict (codigo) do nothing;
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R02', 'taxa_agendamento', 'Agenda pouco em relação aos leads que atende', 'M15', 'menor_e_pior', 0.7, 30, 15, true,
        'Leads que PASSARAM POR agendado / leads atribuídos na janela (bool_or no histórico, não último status).')
on conflict (codigo) do nothing;
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R03', 'taxa_comparecimento', 'Muitas visitas marcadas não acontecem', 'M14', 'menor_e_pior', 0.7, 60, 8, true,
        'Passou por visita_realizada / passou por agendado. M14 tem o protocolo de confirmação D-2/D-1/D+0.')
on conflict (codigo) do nothing;
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R04', 'taxa_visita_para_avanco', 'Visita que não vira análise de crédito nem pasta', 'M18', 'menor_e_pior', 0.7, 60, 8, true,
        'Avancou = chegou a ANALISE DE CREDITO ou PASTA MONTADA (decisao do dono, 28/09/2026), medido por passagem no historico / passou por visita_realizada. proposta_enviada NAO conta: e status legado (3 transicoes desde sempre, 0 em 90 dias) e fica no mesmo degrau da visita. Fatia 0: 22 visitas na coorte, no maximo 9 por corretor — na pratica isto e numero de TIME; o individual quase nunca atinge a amostra minima.')
on conflict (codigo) do nothing;
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R05', 'pct_carteira_parada', 'Carteira com muito lead parado', 'M20', 'maior_e_pior', 1.5, 30, 20, true,
        'Regua da CARTEIRA ATIVA (decisao do dono, 28/09/2026), a mesma da devolucao: lead no TOPO do funil conta como parado com 7 dias sem interacao; lead no FUNDO, com 30. Nao e a regua da Higiene do Funil (5 dias) nem os 7 dias planos da especificacao. janela_dias = 30 para cobrir o maior dos dois prazos; quem mede escolhe o corte por degrau. Excluir escrita em lote (importacao/migracao). Fatia 0: 69% da carteira parada, mediana do time 82%, maximo 100% — 1,5x a mediana e inalcancavel, entao na pratica esta regra nao dispara e serve como numero de time.')
on conflict (codigo) do nothing;
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R06', 'pct_sem_proximo_passo', 'Leads sem próximo passo registrado', 'M11', 'maior_e_pior', 1.5, 7, 20, true,
        'Leads ativos da carteira sem tarefa/follow-up futuro. Fatia 0: 94% sem próximo passo, mediana 98% — não dispara; número de time.')
on conflict (codigo) do nothing;
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R07', 'taxa_pasta_devolvida', 'Pastas devolvidas ou com pendência de documento', 'M21', 'maior_e_pior', 1.5, 90, 5, false,
        'DESATIVADA: nao existe a fonte de dados. O dono confirmou em 28/09/2026 que a APROVACAO e anexada no sistema e a REPROVACAO nao tem onde ser registrada. analises_credito.status = reprovada existe (7 registros desde abril) mas mede outra coisa. Reativar so quando houver registro da devolucao por pendencia do correspondente ou da Caixa.')
on conflict (codigo) do nothing;
insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, ativa, observacao)
values ('R08', 'taxa_perda_por_qualificacao', 'Muitas perdas por perfil ou renda depois de avançar', 'M16', 'maior_e_pior', 1.5, 90, 8, true,
        'Perdas com motivo credito_renda, estourou_teto, sem_perfil ou credito_score (decisao do dono, 28/09/2026 — ja_possui_imovel ficou de FORA) / leads que AVANCARAM na janela. Avancar = passou por agendado. So lead novo. Fatia 0: 2.174 perdas em 30 dias, 1.975 pelo proprio corretor, sem_perfil = 49% delas, credito_renda e estourou_teto = 0 — o volume e limpeza de estoque. Medir a partir de qualificacao_corretor pegava esse estoque, por isso a mudanca. Fica em SOMBRA antes de qualquer decisao.')
on conflict (codigo) do nothing;

NOTIFY pgrst, 'reload schema';
