-- ===========================================================================
-- ACADEMIA SMQ · LOTE 1 (v1.1) · seed do módulo M26
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-1/academia-smq-lote-1.json.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- 4 aulas · 20 questões · 12 flashcards
-- ===========================================================================

-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  ('M26', 26, 0, 'Os primeiros 5 minutos: velocidade, ligação primeiro e o Cartão de Ligação', 'Ao final, você liga para todo lead novo dentro do prazo, manda WhatsApp em até 2 minutos quando ele não atende e registra o desfecho, e isso aparece no CRM como tempo até o primeiro contato (em horas e minutos) em até 5 minutos (meta da casa; o limite do sistema é de 15 minutos úteis) e nenhum repasse por SLA.',
   '["Eu sou capaz de ligar para um lead novo em até 5 minutos, pelo botão do card, antes de qualquer outra tarefa.","Eu sou capaz de mandar a mensagem de WhatsApp em até 2 minutos quando o cliente não atende, com duas opções de horário.","Eu sou capaz de me identificar com nome, Seu Metro Quadrado e especialidade em MCMV, provando que li o cadastro.","Eu sou capaz de montar e usar o Cartão de Ligação do produto.","Eu sou capaz de explicar a meta de 5 minutos, o limite de 15 minutos úteis, os dois estouros e o repasse por SLA."]'::jsonb, 0.8, '50 min', true,
   '**Role-play em trio, com cronômetro** · 30 min

**Papéis:** Corretor, cliente com o cartão da persona e observador com cronômetro e rubrica. Dez aberturas por corretor, trocando os papéis.

**Persona:** P1 (casal que cansou do aluguel), P2 (entregador de aplicativo) e P5 (lead saturado e desconfiado)

**Roteiro:** O observador sorteia se o cliente atende ou não. Se atender, o corretor faz a abertura e a primeira pergunta do método em até 30 segundos. Se não atender, o corretor escreve o WhatsApp em até 2 minutos e diz em voz alta qual desfecho e qual próximo passo registraria.

**Roteiro do cliente:**

- P1 atende e diz: "Vi o anúncio, queria saber o valor."
- P2 atende e pergunta: "É pra autônomo também?"
- P5 atende e diz: "Já me ligaram umas vinte vezes. Isso é golpe?"
- Em metade das rodadas, o cliente não atende.

**O que o observador procura:**

- Tempo: abertura em até 30 segundos; WhatsApp escrito em até 2 minutos.
- Identificação completa e prova de leitura do cadastro (empreendimento, região).
- Primeira pergunta do método: "vai ser o seu primeiro imóvel?", sem falar de preço.
- Duas opções de horário na mensagem de WhatsApp.
- Desfecho e próximo passo com data ditos em voz alta.

**Rubrica:** Padrão SMQ, critérios 1 (abertura e conexão), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Abertura e conexão: personalização, nome, prova de que leu o cadastro","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 1 v1.1 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Horário útil configurado para o prazo de 15 minutos (o registro da operação indica das 8h às 20h). | [GAP DE CRM] O Meu Raio-X e a Operação mostram a 1ª resposta em minutos corridos desde a chegada do lead; o tempo em minutos úteis (o limite de 15 minutos) só aparece na Gestão da Academia. Proposta: indicador em horas e minutos no topo do Meu Raio-X. | [CONFIRMAR] Resultado medido do Cartão de Ligação no lançamento de set/2026.', '{"formato":"canonico-8.2","lote":1,"versao_conteudo":"1.1","trilha":"T0","ordem":3,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"O robô respondeu o seu cliente em 67 segundos. Quanto tempo você leva?","duracao_min":50,"por_que_vale_dinheiro":{"texto":"Velocidade vira venda. Lead assumido pelo corretor em menos de 1 hora avançou 12,1% das vezes; entre 1 e 24 horas, 2,1%; entre 24 e 72 horas, 0%. Hoje a mediana até o corretor assumir é de 19,4 horas. O dinheiro está nos primeiros minutos.","numero":"12,1% de avanço com menos de 1 hora contra 0% entre 24 e 72 horas; mediana atual de 19,4 horas","fonte":"Stream de status do CRM","periodo":"jul a set/2026"},"pre_requisitos":["M00","M25"],"indicador_crm":{"nome":"Tempo entre a distribuição e o primeiro contato (em horas e minutos)","onde_ler":"Meu Raio-X › tabela mensal, coluna \"1ª resp.\" (em horas e minutos) e, para o gerente, Operação › Relatórios › Time › \"Tempo de 1ª resposta\" e Distribuição › aba Histórico (repasses por SLA)","linha_de_base":"Mediana de 19,4 horas; só 12,1% dos leads assumidos em até 5 minutos e 28,4% em até 1 hora (jul a set/2026)","meta_sugerida":"Primeiro contato em até 5 minutos (meta da casa); limite de 15 minutos úteis no lead quente; zero repasse por SLA","fonte":"Stream de status do CRM (jul a set/2026) e Treinamento do CRM (set/2026)","gap_de_crm":false},"pratica":{"tipo":"Role-play em trio, com cronômetro","duracao_min":30,"persona":"P1 (casal que cansou do aluguel), P2 (entregador de aplicativo) e P5 (lead saturado e desconfiado)","rubrica":"Padrão SMQ, critérios 1 (abertura e conexão), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"Corretor, cliente com o cartão da persona e observador com cronômetro e rubrica. Dez aberturas por corretor, trocando os papéis.","roteiro":"O observador sorteia se o cliente atende ou não. Se atender, o corretor faz a abertura e a primeira pergunta do método em até 30 segundos. Se não atender, o corretor escreve o WhatsApp em até 2 minutos e diz em voz alta qual desfecho e qual próximo passo registraria.","roteiro_cliente":["P1 atende e diz: \"Vi o anúncio, queria saber o valor.\"","P2 atende e pergunta: \"É pra autônomo também?\"","P5 atende e diz: \"Já me ligaram umas vinte vezes. Isso é golpe?\"","Em metade das rodadas, o cliente não atende."],"observador_procura":["Tempo: abertura em até 30 segundos; WhatsApp escrito em até 2 minutos.","Identificação completa e prova de leitura do cadastro (empreendimento, região).","Primeira pergunta do método: \"vai ser o seu primeiro imóvel?\", sem falar de preço.","Duas opções de horário na mensagem de WhatsApp.","Desfecho e próximo passo com data ditos em voz alta."]},"desafio_campo":{"tarefa":"48 horas com todos os leads novos assumidos em até 5 minutos, com ligação primeiro, WhatsApp em até 2 minutos quando não atenderem e desfecho registrado em todos.","prazo_horas":48,"evidencia_no_crm":"Tempo até o primeiro contato de cada lead novo, em horas e minutos, em até 5 minutos (e nunca acima de 15); nenhum repasse por SLA no período; desfecho registrado em todos.","como_o_gestor_confere":"Abre Operação › Relatórios › Time › \"Tempo de 1ª resposta\" e Distribuição › aba Histórico, conferindo a 1ª resposta do corretor e os repasses por SLA nas 48 horas."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":4,"quem_grava":"O diretor ou o gerente; um caso de corretor vira narração, sem nomear ninguém","cenario":"Mesa de trabalho com o CRM aberto e o celular na mão","blocos":[{"tempo":"0:00","fala":"O robô respondeu o seu cliente em 67 segundos. A gente leva 19 horas para assumir. Quem sumiu?","na_tela":"67 s contra 19,4 h"},{"tempo":"0:25","fala":"De cada 100 clientes que respondem, 86 respondem na primeira hora. Depois de um dia, a chance praticamente acaba.","na_tela":"Gráfico simples de avanço por tempo"},{"tempo":"0:55","fala":"Então é assim: ligar, mandar, registrar. Ligou e não atendeu? WhatsApp em até dois minutos, com dois horários.","na_tela":"Demonstração: L, W e D no card"},{"tempo":"2:00","fala":"E antes de ligar, o Cartão de Ligação: produto, conta, conversa e fechamento numa página.","na_tela":"Um cartão preenchido (produto fictício)"},{"tempo":"2:50","fala":"O erro mais comum: esperar para preparar tudo e ligar horas depois. Preparar é trinta segundos de ficha.","na_tela":"Relógio correndo"},{"tempo":"3:20","fala":"Desafio: 48 horas com todo lead novo atendido em até 5 minutos. Cliente não some. Cliente esfria.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 9.1, 9.2, 9.6, 9.10, 9.12 e 9.17 do super prompt","Treinamento do CRM SMQ (set/2026)","Cadência D1/D2/D3 (decisão da diretoria)"],"origem":"SMQ","pendencias":["[CONFIRMAR] Horário útil configurado para o prazo de 15 minutos (o registro da operação indica das 8h às 20h).","[GAP DE CRM] O Meu Raio-X e a Operação mostram a 1ª resposta em minutos corridos desde a chegada do lead; o tempo em minutos úteis (o limite de 15 minutos) só aparece na Gestão da Academia. Proposta: indicador em horas e minutos no topo do Meu Raio-X.","[CONFIRMAR] Resultado medido do Cartão de Ligação no lançamento de set/2026."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
ON CONFLICT (codigo) DO UPDATE SET
  numero             = EXCLUDED.numero,
  fase               = EXCLUDED.fase,
  titulo             = EXCLUDED.titulo,
  objetivo_principal = EXCLUDED.objetivo_principal,
  objetivos          = EXCLUDED.objetivos,
  carga_horaria_h    = EXCLUDED.carga_horaria_h,
  carga_horaria_texto = EXCLUDED.carga_horaria_texto,
  exige_pratica      = EXCLUDED.exige_pratica,
  pratica_descricao  = EXCLUDED.pratica_descricao,
  pratica_rubrica    = EXCLUDED.pratica_rubrica,
  nota_minima        = EXCLUDED.nota_minima,
  revisao_pendente   = EXCLUDED.revisao_pendente,
  extras             = EXCLUDED.extras,
  atualizado_em      = now()
WHERE public.academia_modulos.status = 'rascunho';

-- 2. Conteúdo antigo: arquivado, não apagado
UPDATE public.academia_aulas a
   SET status = 'arquivado', atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M26-A1', 'M26-A2', 'M26-A3', 'M26-A4'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 4;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M26-Q01', 'M26-Q02', 'M26-Q03', 'M26-Q04', 'M26-Q05', 'M26-Q06', 'M26-Q07', 'M26-Q08', 'M26-Q09', 'M26-Q10', 'M26-Q11', 'M26-Q12', 'M26-Q13', 'M26-Q14', 'M26-Q15', 'M26-Q16', 'M26-Q17', 'M26-Q18', 'M26-Q19', 'M26-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M26-F01', 'M26-F02', 'M26-F03', 'M26-F04', 'M26-F05', 'M26-F06', 'M26-F07', 'M26-F08', 'M26-F09', 'M26-F10', 'M26-F11', 'M26-F12');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 12;

-- 3. Aulas (4)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M26-A1', 1, '67 segundos contra 19 horas', 'texto',
  'O robô da casa respondeu o seu cliente em 67 segundos. O corretor levou, em média, 19 horas para assumir. Quem sumiu não foi o cliente.

### Por que importa

86% de quem responde, responde na primeira hora (mediana de 18 segundos). Lead assumido em menos de 1 hora avança 12,1%; entre 24 e 72 horas, 0%. Cada hora de atraso é dinheiro que evapora.

### O conceito

Lead é pão quente de padaria. Às 7h tem fila na porta; às 11h ninguém quer o pão de ontem. O lead esfria rápido, e ele esfria enquanto você ainda não ligou.

### O método SMQ, passo a passo

1. Saiba o padrão que o cliente já recebeu: o robô responde em 67 segundos de mediana, 99,4% em até 5 minutos.
2. Saiba a janela de ouro: a primeira hora.
3. Saiba a regra da casa (decisão do diretor, 29/09/2026): primeiro contato em até 5 minutos, com prioridade sobre qualquer outra tarefa, inclusive a prospecção. O limite do sistema é de 15 minutos úteis no lead quente: 5 é a meta, 15 é o limite.
4. Saiba onde ele aparece: a prioridade 2 da Fila Única ("Chegaram agora", com o prazo do sistema correndo; a sua meta é 5 minutos) e o sino de avisos.
5. Deixe o celular pronto: notificações do CRM ligadas e o CRM aberto durante o expediente.

### Na vida real

**O caso:** Um handoff do robô chegou às 21h32 (2026).

**O que foi dito:** Um corretor da casa assumiu 2 minutos depois do robô, à noite, e continuou a conversa de onde ela estava.

**O que aconteceu:** Venda fechada em 24 dias.

### Scripts prontos

#### Ligação · Os primeiros 20 segundos com um lead novo

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Você acabou de pedir informação sobre o [empreendimento], na [região], isso mesmo? Que bom! Antes de tudo, me conta: vai ser o seu primeiro imóvel?

**Por que funciona:** Identificação completa, prova de que você leu o cadastro, uma pergunta fácil de responder ("isso mesmo?") e já a primeira pergunta do método "Eu conduzo".

### Erros que matam a venda

- **"Vou ligar depois do almoço"**  
  Quanto custa: A janela de ouro fecha; depois de 24 horas o avanço cai a 0%  
  Correção: Ligar agora, pelo botão do card
- **Mandar só WhatsApp e esperar resposta**  
  Quanto custa: O cliente que pediu informação agora recebe texto quando queria conversa  
  Correção: Ligar primeiro, sempre
- **Ligar sem abrir a ficha**  
  Quanto custa: Você pergunta o que o cliente já respondeu e perde a confiança  
  Correção: 30 segundos de ficha antes de discar

### No CRM

- **Tela:** Central de Comando › Fila Única (prioridade 2) e sino de avisos
- **Ação:** Abrir o card do lead que chegou agora
- **Campo:** Origem, empreendimento e resumo
- **Regra:** Meta de 5 minutos; limite do sistema de 15 minutos úteis no lead quente

### Frase-âncora

> **Cliente não some. Cliente esfria. E ele esfria quando você some primeiro.**

### Checagem rápida

1. Quanto tempo o robô leva para responder, de mediana?  
   Resposta: 67 segundos.
2. Qual é a janela de ouro do lead?  
   Resposta: A primeira hora: 86% de quem responde, responde nela.',
  8, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O robô da casa respondeu o seu cliente em 67 segundos. O corretor levou, em média, 19 horas para assumir. Quem sumiu não foi o cliente.","por_que_importa":"86% de quem responde, responde na primeira hora (mediana de 18 segundos). Lead assumido em menos de 1 hora avança 12,1%; entre 24 e 72 horas, 0%. Cada hora de atraso é dinheiro que evapora.","conceito":"Lead é pão quente de padaria. Às 7h tem fila na porta; às 11h ninguém quer o pão de ontem. O lead esfria rápido, e ele esfria enquanto você ainda não ligou.","metodo":["Saiba o padrão que o cliente já recebeu: o robô responde em 67 segundos de mediana, 99,4% em até 5 minutos.","Saiba a janela de ouro: a primeira hora.","Saiba a regra da casa (decisão do diretor, 29/09/2026): primeiro contato em até 5 minutos, com prioridade sobre qualquer outra tarefa, inclusive a prospecção. O limite do sistema é de 15 minutos úteis no lead quente: 5 é a meta, 15 é o limite.","Saiba onde ele aparece: a prioridade 2 da Fila Única (\"Chegaram agora\", com o prazo do sistema correndo; a sua meta é 5 minutos) e o sino de avisos.","Deixe o celular pronto: notificações do CRM ligadas e o CRM aberto durante o expediente."],"na_vida_real":{"caso":"Um handoff do robô chegou às 21h32 (2026).","o_que_foi_dito":"Um corretor da casa assumiu 2 minutos depois do robô, à noite, e continuou a conversa de onde ela estava.","resultado":"Venda fechada em 24 dias.","fonte":"Dados do CRM e do robô, 2026 (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Os primeiros 20 segundos com um lead novo","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Você acabou de pedir informação sobre o [empreendimento], na [região], isso mesmo? Que bom! Antes de tudo, me conta: vai ser o seu primeiro imóvel?","por_que_funciona":"Identificação completa, prova de que você leu o cadastro, uma pergunta fácil de responder (\"isso mesmo?\") e já a primeira pergunta do método \"Eu conduzo\"."}],"erros_que_matam":[{"erro":"\"Vou ligar depois do almoço\"","custo":"A janela de ouro fecha; depois de 24 horas o avanço cai a 0%","correcao":"Ligar agora, pelo botão do card"},{"erro":"Mandar só WhatsApp e esperar resposta","custo":"O cliente que pediu informação agora recebe texto quando queria conversa","correcao":"Ligar primeiro, sempre"},{"erro":"Ligar sem abrir a ficha","custo":"Você pergunta o que o cliente já respondeu e perde a confiança","correcao":"30 segundos de ficha antes de discar"}],"no_crm":{"tela":"Central de Comando › Fila Única (prioridade 2) e sino de avisos","acao":"Abrir o card do lead que chegou agora","campo":"Origem, empreendimento e resumo","regra":"Meta de 5 minutos; limite do sistema de 15 minutos úteis no lead quente"},"frase_ancora":"Cliente não some. Cliente esfria. E ele esfria quando você some primeiro.","checagem_rapida":[{"pergunta":"Quanto tempo o robô leva para responder, de mediana?","resposta":"67 segundos."},{"pergunta":"Qual é a janela de ouro do lead?","resposta":"A primeira hora: 86% de quem responde, responde nela."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M26-A2', 2, 'Ligar, mandar, registrar', 'texto',
  'Três verbos, nessa ordem, em até 5 minutos: ligar, mandar, registrar.

### Por que importa

A ligação converte, o WhatsApp segura a conversa e o registro cria o próximo passo. Quem ficou calado 24 horas e recebeu follow-up voltou em 22,3% dos casos; sem follow-up, em 0,7%.

### O conceito

Pense no bombeiro: chega rápido, age e registra a ocorrência. Sem o registro, ninguém sabe o que foi feito nem o que falta fazer.

### O método SMQ, passo a passo

1. Abra a ficha e leia em 30 segundos: origem, empreendimento, resumo (se houver) e a conversa com o robô.
2. Ligue pelo botão do card (tecla L). Atendeu: siga o método "Eu conduzo" (M15), começando pela identificação e pela primeira pergunta.
3. Não atendeu: WhatsApp em até 2 minutos, com identificação e duas opções de horário para a próxima ligação.
4. Registre o desfecho, mesmo que seja "não atendeu", com o próximo passo e a data.
5. Sem retorno, siga a cadência D1/D2/D3: no D1, a mensagem de abertura, 2 ligações e 1 WhatsApp; no D2 (dia seguinte), mais 2 ligações e 1 mensagem; no D3, o follow-up de encerramento. Cumprida 100% sem retorno, o lead vai para a base de reativação do discador e da pré-venda.

### Na vida real

**O caso:** Coorte de leads que ficaram 24 horas sem responder à primeira mensagem (jun a set/2026).

**O que foi dito:** Parte recebeu follow-up; parte não recebeu nenhum toque.

**O que aconteceu:** Com follow-up, 22,3% voltaram a conversar. Sem follow-up, 0,7%. Cliente não volta sozinho: quem traz de volta é o toque.

### Scripts prontos

#### WhatsApp · Até 2 minutos depois da ligação não atendida

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Acabei de te ligar sobre o [empreendimento]. Te ligo às 12h30 ou às 18h, qual fica melhor pra você?

**Por que funciona:** Texto curto, identificação honesta e duas opções: o cliente só precisa escolher.

#### WhatsApp · D3: follow-up de encerramento da cadência

> [nome], tentei falar com você nos últimos dias sobre o [empreendimento]. Percebo que agora não é o melhor momento. Posso guardar o seu contato e te chamar quando aparecer uma condição que encaixe no seu perfil?

**Por que funciona:** Encerra com dignidade, pede permissão e deixa a porta aberta para a reativação, sem "qualquer coisa me chama".

### Erros que matam a venda

- **Mandar áudio no primeiro contato**  
  Quanto custa: O cliente não ouve e a mensagem parece disparo  
  Correção: Primeiro contato em texto, de 2 a 4 linhas; áudio só depois da segunda resposta
- **Começar com "Oi, tudo bem?" sem gancho**  
  Quanto custa: Parece mais um dos vinte corretores que ligaram  
  Correção: Nome, SMQ, empreendimento e uma pergunta fácil
- **Não registrar o "não atendeu"**  
  Quanto custa: O cliente sai do radar sem próximo passo  
  Correção: Desfecho sempre, com data

### No CRM

- **Tela:** Card da Fila Única
- **Ação:** L para ligar, W para o WhatsApp, D para o desfecho
- **Campo:** Desfecho, próximo passo e data
- **Regra:** Ligar primeiro, WhatsApp em até 2 minutos, registrar mesmo que seja "não atendeu"

### Frase-âncora

> **Ligar, mandar, registrar. Nessa ordem.**

### Checagem rápida

1. O cliente não atendeu. Em quanto tempo sai o WhatsApp?  
   Resposta: Em até 2 minutos.
2. O que acontece com o lead depois da cadência D1/D2/D3 cumprida sem retorno?  
   Resposta: Vai para a base de reativação do discador e da pré-venda.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Três verbos, nessa ordem, em até 5 minutos: ligar, mandar, registrar.","por_que_importa":"A ligação converte, o WhatsApp segura a conversa e o registro cria o próximo passo. Quem ficou calado 24 horas e recebeu follow-up voltou em 22,3% dos casos; sem follow-up, em 0,7%.","conceito":"Pense no bombeiro: chega rápido, age e registra a ocorrência. Sem o registro, ninguém sabe o que foi feito nem o que falta fazer.","metodo":["Abra a ficha e leia em 30 segundos: origem, empreendimento, resumo (se houver) e a conversa com o robô.","Ligue pelo botão do card (tecla L). Atendeu: siga o método \"Eu conduzo\" (M15), começando pela identificação e pela primeira pergunta.","Não atendeu: WhatsApp em até 2 minutos, com identificação e duas opções de horário para a próxima ligação.","Registre o desfecho, mesmo que seja \"não atendeu\", com o próximo passo e a data.","Sem retorno, siga a cadência D1/D2/D3: no D1, a mensagem de abertura, 2 ligações e 1 WhatsApp; no D2 (dia seguinte), mais 2 ligações e 1 mensagem; no D3, o follow-up de encerramento. Cumprida 100% sem retorno, o lead vai para a base de reativação do discador e da pré-venda."],"na_vida_real":{"caso":"Coorte de leads que ficaram 24 horas sem responder à primeira mensagem (jun a set/2026).","o_que_foi_dito":"Parte recebeu follow-up; parte não recebeu nenhum toque.","resultado":"Com follow-up, 22,3% voltaram a conversar. Sem follow-up, 0,7%. Cliente não volta sozinho: quem traz de volta é o toque.","fonte":"Conversas do robô (seção 9.1)"},"scripts":[{"canal":"WhatsApp","situacao":"Até 2 minutos depois da ligação não atendida","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Acabei de te ligar sobre o [empreendimento]. Te ligo às 12h30 ou às 18h, qual fica melhor pra você?","por_que_funciona":"Texto curto, identificação honesta e duas opções: o cliente só precisa escolher."},{"canal":"WhatsApp","situacao":"D3: follow-up de encerramento da cadência","texto":"[nome], tentei falar com você nos últimos dias sobre o [empreendimento]. Percebo que agora não é o melhor momento. Posso guardar o seu contato e te chamar quando aparecer uma condição que encaixe no seu perfil?","por_que_funciona":"Encerra com dignidade, pede permissão e deixa a porta aberta para a reativação, sem \"qualquer coisa me chama\"."}],"erros_que_matam":[{"erro":"Mandar áudio no primeiro contato","custo":"O cliente não ouve e a mensagem parece disparo","correcao":"Primeiro contato em texto, de 2 a 4 linhas; áudio só depois da segunda resposta"},{"erro":"Começar com \"Oi, tudo bem?\" sem gancho","custo":"Parece mais um dos vinte corretores que ligaram","correcao":"Nome, SMQ, empreendimento e uma pergunta fácil"},{"erro":"Não registrar o \"não atendeu\"","custo":"O cliente sai do radar sem próximo passo","correcao":"Desfecho sempre, com data"}],"no_crm":{"tela":"Card da Fila Única","acao":"L para ligar, W para o WhatsApp, D para o desfecho","campo":"Desfecho, próximo passo e data","regra":"Ligar primeiro, WhatsApp em até 2 minutos, registrar mesmo que seja \"não atendeu\""},"frase_ancora":"Ligar, mandar, registrar. Nessa ordem.","checagem_rapida":[{"pergunta":"O cliente não atendeu. Em quanto tempo sai o WhatsApp?","resposta":"Em até 2 minutos."},{"pergunta":"O que acontece com o lead depois da cadência D1/D2/D3 cumprida sem retorno?","resposta":"Vai para a base de reativação do discador e da pré-venda."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M26-A3', 3, 'O Cartão de Ligação do produto', 'texto',
  'Quem liga sem saber o produto gagueja na primeira objeção. Quem liga com o Cartão de Ligação na mão, conduz.

### Por que importa

Abrir a conversa com o nome do empreendimento que o cliente viu levou 19,4% dos leads ao próximo passo, contra 11,0% da abertura genérica, com a mesma taxa de resposta. Saber o produto é o que permite personalizar.

### O conceito

É o checklist do piloto antes de decolar: uma página que garante que nada importante fica de fora quando a conversa acelera.

### O método SMQ, passo a passo

1. Monte uma página por empreendimento, usando só dados de Documentação & Projetos ou do material oficial da construtora.
2. Bloco 1, o produto: nome, construtora, bairro, distância real do metrô ou do trem, tipologias, valor "a partir de" com a data da tabela e o enquadramento (MCMV, HIS, HMP ou venda livre).
3. Bloco 2, a conta: faixa de parcela estimada por faixa de renda, rodada na simulação oficial e com a frase "estimativa, a aprovação é da Caixa". [CONFIRMAR valores na simulação]
4. Bloco 3, a conversa: as 6 perguntas do método "Eu conduzo" e as 3 objeções mais prováveis desse produto, com a resposta.
5. Bloco 4, o fechamento: os dois horários de visita da semana, o endereço do estande, os documentos para levar e as âncoras antigolpe.
6. Atualize o cartão toda vez que a tabela ou a condição mudar.

### Na vida real

**O caso:** Um lançamento da Zona Sul em set/2026.

**O que foi dito:** A casa montou o primeiro Cartão de Ligação do método "Eu conduzo" para o produto: as 6 perguntas, os dados do empreendimento, a faixa de parcela e as regras de fala.

**O que aconteceu:** O cartão virou o modelo para os produtos em foco. [CONFIRMAR resultado medido]

### Scripts prontos

#### Ligação · Abertura usando o cartão

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Você pediu informação sobre o [empreendimento], a [distância] do metrô [estação], isso mesmo? Antes de te passar valores, me conta: vai ser o seu primeiro imóvel?

**Por que funciona:** O detalhe concreto (a estação, a distância) prova que você conhece o produto, e a pergunta devolve a condução para você antes de qualquer preço.

### Erros que matam a venda

- **Cartão com preço de memória ou tabela antiga**  
  Quanto custa: Promessa errada e cliente decepcionado no estande  
  Correção: Dados só de Documentação & Projetos, com a data da tabela
- **Ler o cartão como robô**  
  Quanto custa: A conversa perde a naturalidade e o cliente sente o roteiro  
  Correção: O cartão é guia, não texto para ler
- **Cartão sem os horários de visita**  
  Quanto custa: Na hora do "sim", você pergunta "quando você pode?"  
  Correção: Dois horários da semana já escritos no cartão

### No CRM

- **Tela:** Documentação & Projetos (Projetos em Foco, Catálogo e Vitrine em mapa)
- **Ação:** Consultar ficha técnica, tabela, unidades e localização
- **Campo:** Condições comerciais e unidades disponíveis
- **Regra:** Produto só da fonte oficial; o cadastro de zona tem erros conhecidos, então confira o bairro

### Frase-âncora

> **Produto na mão, conversa na mão.**

### Checagem rápida

1. De onde saem os dados do cartão?  
   Resposta: De Documentação & Projetos ou do material oficial da construtora.
2. Quais são os 4 blocos do cartão?  
   Resposta: Produto, conta, conversa e fechamento.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Quem liga sem saber o produto gagueja na primeira objeção. Quem liga com o Cartão de Ligação na mão, conduz.","por_que_importa":"Abrir a conversa com o nome do empreendimento que o cliente viu levou 19,4% dos leads ao próximo passo, contra 11,0% da abertura genérica, com a mesma taxa de resposta. Saber o produto é o que permite personalizar.","conceito":"É o checklist do piloto antes de decolar: uma página que garante que nada importante fica de fora quando a conversa acelera.","metodo":["Monte uma página por empreendimento, usando só dados de Documentação & Projetos ou do material oficial da construtora.","Bloco 1, o produto: nome, construtora, bairro, distância real do metrô ou do trem, tipologias, valor \"a partir de\" com a data da tabela e o enquadramento (MCMV, HIS, HMP ou venda livre).","Bloco 2, a conta: faixa de parcela estimada por faixa de renda, rodada na simulação oficial e com a frase \"estimativa, a aprovação é da Caixa\". [CONFIRMAR valores na simulação]","Bloco 3, a conversa: as 6 perguntas do método \"Eu conduzo\" e as 3 objeções mais prováveis desse produto, com a resposta.","Bloco 4, o fechamento: os dois horários de visita da semana, o endereço do estande, os documentos para levar e as âncoras antigolpe.","Atualize o cartão toda vez que a tabela ou a condição mudar."],"na_vida_real":{"caso":"Um lançamento da Zona Sul em set/2026.","o_que_foi_dito":"A casa montou o primeiro Cartão de Ligação do método \"Eu conduzo\" para o produto: as 6 perguntas, os dados do empreendimento, a faixa de parcela e as regras de fala.","resultado":"O cartão virou o modelo para os produtos em foco. [CONFIRMAR resultado medido]","fonte":"Método de ligação SMQ, set/2026 (seção 9.2)"},"scripts":[{"canal":"Ligação","situacao":"Abertura usando o cartão","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Você pediu informação sobre o [empreendimento], a [distância] do metrô [estação], isso mesmo? Antes de te passar valores, me conta: vai ser o seu primeiro imóvel?","por_que_funciona":"O detalhe concreto (a estação, a distância) prova que você conhece o produto, e a pergunta devolve a condução para você antes de qualquer preço."}],"erros_que_matam":[{"erro":"Cartão com preço de memória ou tabela antiga","custo":"Promessa errada e cliente decepcionado no estande","correcao":"Dados só de Documentação & Projetos, com a data da tabela"},{"erro":"Ler o cartão como robô","custo":"A conversa perde a naturalidade e o cliente sente o roteiro","correcao":"O cartão é guia, não texto para ler"},{"erro":"Cartão sem os horários de visita","custo":"Na hora do \"sim\", você pergunta \"quando você pode?\"","correcao":"Dois horários da semana já escritos no cartão"}],"no_crm":{"tela":"Documentação & Projetos (Projetos em Foco, Catálogo e Vitrine em mapa)","acao":"Consultar ficha técnica, tabela, unidades e localização","campo":"Condições comerciais e unidades disponíveis","regra":"Produto só da fonte oficial; o cadastro de zona tem erros conhecidos, então confira o bairro"},"frase_ancora":"Produto na mão, conversa na mão.","checagem_rapida":[{"pergunta":"De onde saem os dados do cartão?","resposta":"De Documentação & Projetos ou do material oficial da construtora."},{"pergunta":"Quais são os 4 blocos do cartão?","resposta":"Produto, conta, conversa e fechamento."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M26-A4', 4, 'Quando o sistema te repassa', 'texto',
  'Dois estouros de prazo no mesmo dia e o sistema tira você do lead quente até amanhã. Não é castigo. É proteção do cliente.

### Por que importa

Se o primeiro contato não acontece no prazo, o cliente é repassado ao próximo da fila ("Repasse por SLA"). E quem trabalha poucos leads fica abaixo do mínimo e passa a ser pulado na distribuição.

### O conceito

É o goleiro que sai do gol: se você não defende, outro entra. O cliente não pode ficar sem ninguém embaixo da trave.

### O método SMQ, passo a passo

1. O prazo do sistema: 15 minutos úteis para o primeiro contato no lead quente; a meta da casa é 5. [CONFIRMAR o horário útil configurado no CRM; o registro da operação indica das 8h às 20h]
2. Dois estouros no mesmo dia pausam você no lead quente até o dia seguinte.
3. Lead que chega durante uma visita: não existe pausa nem regra especial (decisão do diretor, 29/09/2026). O cliente que está com você é a prioridade; se você não conseguir fazer o primeiro contato no prazo, o repasse por SLA leva o lead a um colega. É o sistema protegendo o cliente, não um castigo.
4. Estourou, o cliente vai para o próximo corretor da fila, com aviso e registro na linha do tempo.
5. O percentual de leads trabalhados abaixo do mínimo faz o sistema pular você na distribuição.
6. Como nunca estourar: notificações do CRM ligadas, CRM aberto no expediente, prioridade 2 da fila atendida antes de qualquer outra coisa e combinado com o gerente quando for ficar indisponível.

### Na vida real

**O caso:** Um dia de redistribuições em 27/07/2026.

**O que foi dito:** Foram 165 redistribuições por prazo em 5 horas. A leitura da operação: "165 redistribuições por dia é sintoma de lead não atendido, não de lead novo."

**O que aconteceu:** O repasse existe porque o lead estava ficando sem ninguém. Quem atende no prazo não é repassado.

### Scripts prontos

#### WhatsApp · Você recebeu um lead repassado de outro corretor

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vou cuidar do seu atendimento a partir de agora e já estou com o seu pedido sobre o [empreendimento] aqui. Vou te ligar deste número. Pode ser agora ou prefere às 19h?

**Por que funciona:** Assume a responsabilidade sem expor o colega, informa o número de quem vai ligar (regra de identidade) e oferece duas opções.

### Erros que matam a venda

- **Celular sem as notificações do CRM**  
  Quanto custa: O lead chega e você só vê depois do prazo  
  Correção: Preferências de notificação ligadas no Meu Perfil
- **Assumir o lead e largar**  
  Quanto custa: O robô pausa para aquele telefone e ninguém mais responde  
  Correção: Assumiu, é seu até o desfecho
- **Reclamar do repasse em vez de ajustar a rotina**  
  Quanto custa: Os estouros se repetem e você é pausado  
  Correção: Prioridade 2 da fila antes de qualquer outra tarefa

### No CRM

- **Tela:** Meu Perfil (notificações e elegibilidade nas filas) e sino de avisos
- **Ação:** Ligar as notificações e acompanhar a elegibilidade
- **Campo:** Preferências de notificação
- **Regra:** Dois estouros no mesmo dia pausam você no lead quente até o dia seguinte

### Frase-âncora

> **Quinze minutos é o limite do sistema. Cinco é a paciência do cliente.**

### Checagem rápida

1. O que acontece com dois estouros no mesmo dia?  
   Resposta: Você fica pausado no lead quente até o dia seguinte.
2. O que é o "Repasse por SLA"?  
   Resposta: O cliente sem primeiro contato no prazo vai para o próximo corretor da fila.',
  7, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Dois estouros de prazo no mesmo dia e o sistema tira você do lead quente até amanhã. Não é castigo. É proteção do cliente.","por_que_importa":"Se o primeiro contato não acontece no prazo, o cliente é repassado ao próximo da fila (\"Repasse por SLA\"). E quem trabalha poucos leads fica abaixo do mínimo e passa a ser pulado na distribuição.","conceito":"É o goleiro que sai do gol: se você não defende, outro entra. O cliente não pode ficar sem ninguém embaixo da trave.","metodo":["O prazo do sistema: 15 minutos úteis para o primeiro contato no lead quente; a meta da casa é 5. [CONFIRMAR o horário útil configurado no CRM; o registro da operação indica das 8h às 20h]","Dois estouros no mesmo dia pausam você no lead quente até o dia seguinte.","Lead que chega durante uma visita: não existe pausa nem regra especial (decisão do diretor, 29/09/2026). O cliente que está com você é a prioridade; se você não conseguir fazer o primeiro contato no prazo, o repasse por SLA leva o lead a um colega. É o sistema protegendo o cliente, não um castigo.","Estourou, o cliente vai para o próximo corretor da fila, com aviso e registro na linha do tempo.","O percentual de leads trabalhados abaixo do mínimo faz o sistema pular você na distribuição.","Como nunca estourar: notificações do CRM ligadas, CRM aberto no expediente, prioridade 2 da fila atendida antes de qualquer outra coisa e combinado com o gerente quando for ficar indisponível."],"na_vida_real":{"caso":"Um dia de redistribuições em 27/07/2026.","o_que_foi_dito":"Foram 165 redistribuições por prazo em 5 horas. A leitura da operação: \"165 redistribuições por dia é sintoma de lead não atendido, não de lead novo.\"","resultado":"O repasse existe porque o lead estava ficando sem ninguém. Quem atende no prazo não é repassado.","fonte":"Registro da operação, jul/2026 (seção 9.6)"},"scripts":[{"canal":"WhatsApp","situacao":"Você recebeu um lead repassado de outro corretor","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vou cuidar do seu atendimento a partir de agora e já estou com o seu pedido sobre o [empreendimento] aqui. Vou te ligar deste número. Pode ser agora ou prefere às 19h?","por_que_funciona":"Assume a responsabilidade sem expor o colega, informa o número de quem vai ligar (regra de identidade) e oferece duas opções."}],"erros_que_matam":[{"erro":"Celular sem as notificações do CRM","custo":"O lead chega e você só vê depois do prazo","correcao":"Preferências de notificação ligadas no Meu Perfil"},{"erro":"Assumir o lead e largar","custo":"O robô pausa para aquele telefone e ninguém mais responde","correcao":"Assumiu, é seu até o desfecho"},{"erro":"Reclamar do repasse em vez de ajustar a rotina","custo":"Os estouros se repetem e você é pausado","correcao":"Prioridade 2 da fila antes de qualquer outra tarefa"}],"no_crm":{"tela":"Meu Perfil (notificações e elegibilidade nas filas) e sino de avisos","acao":"Ligar as notificações e acompanhar a elegibilidade","campo":"Preferências de notificação","regra":"Dois estouros no mesmo dia pausam você no lead quente até o dia seguinte"},"frase_ancora":"Quinze minutos é o limite do sistema. Cinco é a paciência do cliente.","checagem_rapida":[{"pergunta":"O que acontece com dois estouros no mesmo dia?","resposta":"Você fica pausado no lead quente até o dia seguinte."},{"pergunta":"O que é o \"Repasse por SLA\"?","resposta":"O cliente sem primeiro contato no prazo vai para o próximo corretor da fila."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q01', 1, 'situacional',
  'Chegou um lead novo às 14h05. Você está no meio de uma mensagem para um cliente da carteira. O que fazer?',
  '["Terminar com calma as mensagens da carteira e ligar no fim da tarde.","Mandar um WhatsApp para o lead e voltar para a carteira.","Ligar para o lead em até 5 minutos e depois voltar para a carteira.","Esperar o lead mandar mensagem primeiro."]'::jsonb,
  2,
  'A C respeita a prioridade 2 da fila e a janela de ouro: 86% de quem responde, responde na primeira hora. A A deixa o lead esfriar e arrisca o repasse por SLA. A B inverte a ordem (ligar primeiro, sempre). A D entrega a condução ao cliente e perde a janela.',
  'M26-A1 e M26-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q02', 2, 'situacional',
  'Você ligou e o lead não atendeu. Qual é a mensagem certa para mandar em até 2 minutos?',
  '["\"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Acabei de te ligar sobre o [empreendimento]. Te ligo às 12h30 ou às 18h, qual fica melhor?\"","\"Oi, tudo bem? Me chama quando puder.\"","Um áudio de 2 minutos explicando o empreendimento.","O book completo do empreendimento em PDF."]'::jsonb,
  0,
  'A A se identifica, cita o empreendimento e oferece duas opções de horário. A B é vaga e deixa a iniciativa com o cliente. A C usa áudio no primeiro contato, o que a casa evita. A D manda catálogo antes da conversa, o erro clássico.',
  'M26-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q03', 3, 'situacional',
  'O lead atende e diz: "Vi o anúncio, queria saber o valor." Qual é a melhor resposta?',
  '["\"Os apartamentos partem de R$ 240 mil.\"","\"Te mando a tabela completa agora.\"","\"Depende de muita coisa, é complicado.\"","\"Te passo sim! Pra eu te mostrar o valor que cabe no seu bolso, me conta primeiro: vai ser o seu primeiro imóvel?\""]'::jsonb,
  3,
  'A D acolhe o pedido, justifica a pergunta e segue o método: preço antes da renda entrega a condução ao cliente. A A e a B entregam preço sem contexto, e o cliente passa a comparar só número. A C é evasiva e soa como enrolação.',
  'M26-A1; seção 9.2', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q04', 4, 'situacional',
  'Você está no meio de uma visita de 30 minutos com um casal e chega um lead novo. O que fazer?',
  '["Interromper a visita para ligar, porque lead novo tem prioridade sempre.","Pedir ao gerente uma pausa na roleta antes de toda visita.","Seguir com a visita; se o primeiro contato não acontecer no prazo, o repasse por SLA leva o lead a um colega.","Pedir a um colega que atenda o lead pelo seu login."]'::jsonb,
  2,
  'A C segue a decisão da casa (29/09/2026): durante a visita, o cliente presente é a prioridade e não existe pausa nem regra especial; se o primeiro contato não acontecer no prazo, o repasse por SLA resolve e o lead é atendido por um colega. A A desrespeita o cliente que está na sua frente e arrisca a venda mais adiantada. A B cria uma regra que a casa decidiu não ter. A D compartilha login, o que é proibido e bagunça o registro.',
  'M26-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q05', 5, 'situacional',
  'O lead atende desconfiado: "Já me ligaram umas vinte vezes. Isso é golpe?" O que você diz?',
  '["\"Imagino, [nome], e você está certo em desconfiar. Aqui é o [seu nome], da Seu Metro Quadrado. A análise com a gente é gratuita e ninguém da SMQ pede Pix, taxa ou senha. Posso te fazer duas perguntas rápidas?\"","\"Golpe nada, pode confiar.\"","\"Não sou corretor, sou da central de atendimento.\"","\"Se você não quer, tudo bem.\" e desligar."]'::jsonb,
  0,
  'A A valida o medo, se identifica de verdade, usa as âncoras antigolpe e devolve a condução com uma pergunta. A B pede confiança sem dar motivo. A C mente sobre a identidade. A D desiste de um lead que só pediu segurança.',
  'M26-A1; seção 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q06', 6, 'situacional',
  'É o D2 da cadência e o lead continua sem responder. O que fazer hoje?',
  '["Nada: um dia de silêncio já basta.","Mais 2 ligações e 1 mensagem.","Marcar como perdido com o motivo \"Sumiu\".","Mandar 10 mensagens seguidas."]'::jsonb,
  1,
  'A B é o D2 da cadência oficial. A A abandona o lead cedo demais: quem recebe follow-up volta muito mais. A C perde antes de cumprir a cadência. A D é insistência sem valor e pode virar descadastro.',
  'M26-A2; seção 9.6', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q07', 7, 'situacional',
  'Você recebeu um lead repassado de um colega que estourou o prazo. Como abre a conversa?',
  '["\"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vou cuidar do seu atendimento a partir de agora e já estou com o seu pedido aqui. Vou te ligar deste número. Pode ser agora ou prefere às 19h?\"","\"Oi, o outro corretor não te atendeu, então sobrou pra mim.\"","Repete todas as perguntas desde o começo.","Espera o cliente reclamar para então chamar."]'::jsonb,
  0,
  'A A assume sem expor o colega, informa o número de quem vai ligar e oferece duas opções. A B expõe a casa e soa como descaso. A C cansa o cliente com perguntas que ele pode já ter respondido. A D repete o atraso que causou o repasse.',
  'M26-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q08', 8, 'situacional',
  'Você vai ligar para um lead do [empreendimento], mas a tabela que você tem salva no celular é de dois meses atrás. O que fazer?',
  '["Usar a tabela antiga mesmo; a diferença deve ser pequena.","Não falar de valores na ligação de jeito nenhum.","Inventar um valor aproximado.","Abrir Documentação & Projetos e atualizar o cartão antes de ligar."]'::jsonb,
  3,
  'A D segue a regra: produto só da fonte oficial, com a data da tabela. A A arrisca prometer um valor que mudou. A C é pior ainda. A B exagera: valor pode ser dito, desde que atualizado, com a data da tabela e depois de saber a renda.',
  'M26-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q09', 9, 'aplicacao',
  'Qual é a ordem dos "primeiros 5 minutos"?',
  '["WhatsApp, esperar 2 horas, ligar.","Ligar; se não atender, WhatsApp em até 2 minutos; registrar o desfecho.","Registrar, ligar, mandar o book.","Ligar só se o cliente responder o WhatsApp."]'::jsonb,
  1,
  'A B é a regra do CRM: ligar primeiro, sempre; WhatsApp em até 2 minutos se não atender; registrar mesmo que seja "não atendeu". A A é a ordem antiga que o CRM substituiu. A C registra antes de agir e ainda manda catálogo. A D entrega a iniciativa ao cliente.',
  'M26-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q10', 10, 'aplicacao',
  'Qual é a meta da casa e qual é o limite do sistema para o primeiro contato no lead quente?',
  '["Meta de 15 minutos; limite de 1 hora.","Meta de 1 hora; limite de 24 horas.","Não há meta: basta responder no mesmo dia.","Meta de 5 minutos; limite de 15 minutos úteis."]'::jsonb,
  3,
  'A D é a regra: a meta da casa é o primeiro contato em até 5 minutos (decisão do diretor, 29/09/2026) e o limite do sistema é de 15 minutos úteis, depois do qual o lead é repassado por SLA. A A troca a meta pelo limite. A B e a C são tempos em que o lead já esfriou: entre 24 e 72 horas, o avanço cai a 0%.',
  'M26-A1; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q11', 11, 'aplicacao',
  'Quantos estouros de prazo no mesmo dia pausam você no lead quente até o dia seguinte?',
  '["1.","2.","3.","5."]'::jsonb,
  1,
  'A B é a regra: 2 estouros no mesmo dia pausam o corretor no lead quente até o dia seguinte. A A, a C e a D erram o número. Saber a regra ajuda a planejar o dia para não chegar nem ao primeiro estouro.',
  'M26-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q12', 12, 'aplicacao',
  'O que a cadência D1/D2/D3 manda fazer no D1?',
  '["Mensagem de abertura, 2 ligações e 1 WhatsApp.","Só uma mensagem de texto.","5 ligações seguidas.","Mandar o book e esperar."]'::jsonb,
  0,
  'A A é o D1 oficial. No D2 (dia seguinte, sem retorno) vêm mais 2 ligações e 1 mensagem; no D3, o follow-up de encerramento. A B é pouco, a C é insistência sem valor e a D manda catálogo sem conversa.',
  'M26-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q13', 13, 'aplicacao',
  'Segundo os dados da casa, qual abertura levou mais leads ao próximo passo?',
  '["A genérica: \"Vi que você está em busca do seu apê pelo MCMV.\"","A que manda o catálogo logo na primeira mensagem.","A que cita o nome do empreendimento que o cliente viu (19,4% contra 11,0%).","A que começa com \"Oi, tudo bem?\"."]'::jsonb,
  2,
  'A C está certa: citar o produto que o cliente viu dobrou o avanço, com a mesma taxa de resposta (a ressalva é que os públicos eram diferentes). A A é a genérica, que avançou menos. A B e a D são erros de abertura: catálogo antes da conversa e abertura sem gancho.',
  'M26-A3; seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q14', 14, 'aplicacao',
  'Quais blocos precisam estar no Cartão de Ligação?',
  '["Só o preço e a metragem.","O roteiro palavra por palavra para ler.","Os dados pessoais dos últimos clientes do produto.","Produto (com data da tabela), conta estimada, as 6 perguntas com as 3 objeções prováveis e o fechamento (horários, endereço, documentos e âncoras antigolpe)."]'::jsonb,
  3,
  'A D são os 4 blocos do cartão. A A é pouco e ancora em preço. A B transforma o cartão em texto de robô. A C fere a LGPD: dado de cliente não vai para material de apoio.',
  'M26-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q15', 15, 'conceito',
  'Por que o prazo para o primeiro contato é tão curto?',
  '["Porque a maioria dos clientes responde na primeira hora e o avanço despenca depois de 24 horas.","Porque o gerente quer controlar o corretor.","Porque a construtora exige.","Porque o robô não sabe atender."]'::jsonb,
  0,
  'A A é a razão medida: 86% de quem responde, responde na primeira hora, e entre 24 e 72 horas o avanço cai a 0%. A B e a C inventam motivos. A D está errada: o robô responde em 67 segundos; o problema é a demora depois dele.',
  'M26-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q16', 16, 'conceito',
  'O que é o "Repasse por SLA"?',
  '["Um bônus para quem atende rápido.","O cliente sem primeiro contato no prazo vai para o próximo corretor da fila.","A transferência que o gerente faz no fim do mês.","O envio automático do book ao cliente."]'::jsonb,
  1,
  'A B é a definição: o prazo protege o cliente, e quem não atende no prazo perde o lead para o próximo da fila. A A, a C e a D descrevem coisas que não são o repasse; a transferência manual da gestão é outra ferramenta, com registro próprio.',
  'M26-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q17', 17, 'conceito',
  'Como o corretor SMQ se identifica no primeiro contato?',
  '["\"Sou da construtora.\"","\"Sou da central de atendimento.\"","Nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida.","Só o primeiro nome."]'::jsonb,
  2,
  'A C é a identificação oficial: honesta e com a especialidade que gera confiança. A A e a B escondem quem você é, o que é proibido. A D é incompleta: o cliente não sabe de onde você fala e desconfia.',
  'M26-A1; seção 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q18', 18, 'conceito',
  'Por que ligar primeiro, e não mandar WhatsApp primeiro?',
  '["Porque WhatsApp é proibido.","Porque a ligação converte mais e o WhatsApp serve para segurar a conversa quando o cliente não atende.","Porque o cliente prefere ligação sempre.","Porque o CRM não tem WhatsApp."]'::jsonb,
  1,
  'A B é a lógica do método: a conversa por voz conduz e leva ao agendamento; o WhatsApp em até 2 minutos segura o cliente que não atendeu. A A e a D são falsas: o WhatsApp faz parte do fluxo e está integrado ao CRM. A C generaliza demais.',
  'M26-A2; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q19', 19, 'caca_ao_erro',
  'Veja a primeira mensagem de um corretor: "Oi tudo bem? Segue o book do empreendimento e a tabela. Qualquer coisa me chama!" Quais são os erros?',
  '["Nenhum: é uma mensagem educada.","Só faltou emoji.","O erro é mandar a tabela; o book está certo.","Não se identifica, não tem gancho, manda catálogo antes da conversa e deixa a iniciativa com o cliente."]'::jsonb,
  3,
  'A D lista os quatro erros: sem identificação, sem gancho, catálogo antes da conexão e final que entrega a condução ao cliente. A A e a B ignoram os erros de conteúdo. A C acerta só em parte: book no primeiro contato também é erro.',
  'M26-A2; seção 9.14', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M26-Q20', 20, 'caca_ao_erro',
  'Um corretor diz: "Esse lead chegou às 10h, mas eu só liguei às 15h porque queria preparar tudo antes." Onde está o erro?',
  '["Nenhum: preparação é tudo.","O erro é ter ligado; devia ter mandado mensagem.","Preparar é abrir a ficha por 30 segundos; esperar 5 horas deixa a janela de ouro fechar e arrisca o repasse por SLA.","O erro é não ter mandado o book antes da ligação."]'::jsonb,
  2,
  'A C mostra o equilíbrio certo: 30 segundos de ficha e o Cartão de Ligação pronto antes, para ligar dentro do prazo. A A justifica o atraso. A B inverte a regra (ligar primeiro). A D repete o erro do catálogo antes da conversa.',
  'M26-A1 e M26-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (12)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F01', 1, '67 segundos', 'Tempo mediano de resposta do robô da casa.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F02', 2, '19,4 horas', 'Tempo mediano até o corretor assumir o lead (jul a set/2026). É o número que a Academia quer derrubar.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F03', 3, 'Janela de ouro', 'A primeira hora: 86% de quem responde, responde nela.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F04', 4, 'Os 3 verbos', 'Ligar, mandar (WhatsApp em até 2 minutos), registrar.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F05', 5, 'Prazo do primeiro contato', 'Meta da casa: até 5 minutos. Limite do sistema: 15 minutos úteis no lead quente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F06', 6, 'Dois estouros', 'Pausam você no lead quente até o dia seguinte.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F07', 7, 'Repasse por SLA', 'Sem contato no prazo, o cliente vai para o próximo corretor da fila.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F08', 8, 'Cadência D1', 'Mensagem de abertura + 2 ligações + 1 WhatsApp.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F09', 9, 'Cadência D2 e D3', 'D2: mais 2 ligações + 1 mensagem. D3: follow-up de encerramento.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F10', 10, 'Primeira pergunta do método', '"Vai ser o seu primeiro imóvel?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F11', 11, 'Cartão de Ligação', 'Produto, conta, conversa e fechamento, numa página, com dados oficiais.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M26-F12', 12, 'Abertura que mais avança', 'A que cita o empreendimento que o cliente viu: 19,4% contra 11,0% da genérica.', true
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"Na primeira semana, confira todo fim de dia o tempo até o primeiro contato de cada lead novo do corretor. Na reunião de segunda, mostre a mediana do time e a de cada um, em horas e minutos, e celebre quem ficou dentro dos 5 minutos em todos os leads (e zerou os estouros de 15).","sinais_de_dificuldade":["Repasses por SLA saindo da carteira do corretor.","Leads novos com desfecho só no dia seguinte.","Primeiro contato registrado só por WhatsApp, sem tentativa de ligação."],"perguntas_de_coaching":["O que aconteceu entre a chegada daquele lead e a sua primeira ligação?","As notificações do CRM estão ligadas no seu celular?","Qual cartão de ligação você precisa montar primeiro para ligar com segurança?"],"ritual_de_celebracao":"All Hands quinzenal: destaque de velocidade (menor tempo mediano até o primeiro contato da quinzena)."}}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M26' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
