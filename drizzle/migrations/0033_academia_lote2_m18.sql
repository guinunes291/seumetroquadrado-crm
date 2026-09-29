-- ===========================================================================
-- ACADEMIA SMQ · LOTE 2 (v1.0) · seed do módulo M18
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-2/academia-smq-lote-2.json.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- 5 aulas · 20 questões · 14 flashcards
-- ===========================================================================

-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  ('M18', 18, 3, 'A visita que decide: preparação, 7 passos e pós-visita', 'Ao final, você prepara cada visita no Modo Visita (briefing, simulação com cenário de laudo e local certo), confirma com o D-2, o D-1 e o D+0, conduz os 7 passos em 20 a 30 minutos com o decisor presente e sai de toda visita com o próximo passo, e isso aparece no CRM como resultado registrado no Modo Visita no mesmo dia e cliente movido para "Visita realizada" com próxima ação e data.',
   '["Eu sou capaz de preparar a visita no Modo Visita, com briefing lido, simulação na calculadora oficial e cenário de laudo em F3 e F4.","Eu sou capaz de confirmar a visita com o D-2, o D-1 e o D+0, com endereço, anfitrião, decisor e documentos, sem terceirizar para o robô.","Eu sou capaz de conduzir os 7 passos da visita em 20 a 30 minutos, com transparência sobre o que muda a decisão.","Eu sou capaz de reconhecer dois sinais de compra e parar de apresentar para propor o próximo passo, sem fechar sem o decisor.","Eu sou capaz de registrar o resultado no Modo Visita no mesmo dia e mandar a mensagem de pós-visita com próximo passo e data."]'::jsonb, 1.2, '70 min', true,
   '**Scorecard dos 7 passos: visita real acompanhada pelo gerente ou role-play no decorado** · 45 min

**Papéis:** Corretor conduz a visita; cliente recebe o cartão da persona e só revela o que o corretor perguntar; o gerente (ou um colega) observa com o scorecard dos 7 passos e a rubrica. Numa visita real, o gerente só observa e dá o retorno depois que o cliente sai.

**Persona:** P1 (casal que cansou do aluguel), P3 (solteira CLT sem entrada) e P13 ("quero pronto"), com produto de treino das seis famílias [CONFIRMAR tabela e condição vigente no CRM]

**Roteiro:** O corretor prepara a visita no Modo Visita (briefing, simulação e cenário de laudo), recebe o cliente e conduz os 7 passos em até 30 minutos. O cliente mostra pelo menos dois sinais de compra em algum momento e levanta uma objeção no passo 7. O corretor encerra com um próximo passo concreto e registra o resultado no Modo Visita na frente do observador. Retorno do observador em 10 minutos: um ponto forte, um ponto a corrigir e a nota de cada critério.

**Roteiro do cliente:**

- P1: chega sem a esposa, que decide junto ("ela não conseguiu sair do trabalho"). Pergunta se a parcela vai ser maior que o aluguel de R$ 1.200. Sinais de compra: pergunta se a cama de casal cabe no quarto e quantas unidades ainda têm. Objeção no passo 7: "preciso ver com a minha esposa".
- P3: gosta muito da localização perto do metrô. Diz "não tenho entrada" logo na simulação. Esconde que em 2 meses completa 3 anos de FGTS, e só conta se o corretor perguntar há quanto tempo trabalha registrada. Objeção no passo 7: "vou pensar".
- P13: casal com filho pequeno, aluguel vencendo em 4 meses. Pergunta logo na recepção quanto tempo demora a visita. Quer saber o prazo de entrega e se a parcela da obra é a parcela do apartamento. Sinal de compra: pergunta em que andar fica a unidade com mais sol.

**O que o observador procura:**

- Briefing lido e simulação pronta antes de o cliente chegar; cenário de laudo quando for F3 ou F4.
- Recepção pelo nome, tempo combinado (de 20 a 30 minutos) e ancoragem com a Q3.
- Área de lazer antes do apartamento e tour com característica, vantagem e benefício para aquela família.
- Silêncio respeitado quando o cliente para e olha.
- Simulação contada como história, com "isto é estimativa, a aprovação é da Caixa"; parcela de obra separada da parcela do financiamento.
- Nada omitido que mude a decisão (vaga, prazo de entrega, regra de uso, laudo) e nenhuma promessa de aprovação, taxa ou valorização (critério 6 só com nota 5).
- Dois sinais de compra reconhecidos e respondidos com próximo passo; decisor ausente tratado com nova visita, sem tentativa de fechar sozinho.
- Q7 feita no fim e próximo passo com duas opções.
- Resultado registrado no Modo Visita antes de o observador ir embora.

**Rubrica:** Padrão SMQ, critérios 1 (abertura e conexão), 3 (condução), 4 (objeção), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Abertura e conexão: personalização, nome, prova de que leu o cadastro","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Objeção: validar, investigar, endereçar, ação","peso":1},{"criterio":"Desfecho: dia e hora ou documento; duas opções; nada de \"vou pensar\" aceito sem horário","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 2 v1.0 importado: revisar no CRM antes de publicar. | [DADO A MEDIR NO CRM] Comparecimento por corretor e passagem visita realizada para análise por corretor (hoje só existe o número da casa). | [CALIBRAR] Meta individual de visita realizada que vira análise com documento, pela conversão do corretor no Meu Raio-X. | [GAP DE CRM] Visita por vídeo: o agendamento e o Modo Visita não têm um tipo "por vídeo". Até existir, registrar no agendamento do empreendimento com a observação "por vídeo". | [CONFIRMAR] Tabela e condição vigente dos produtos de treino usados na prática (Documentação & Projetos). | [CONFIRMAR] Horário de funcionamento de estandes, decorados e escritórios por produto, para as duas opções de horário do convite.', '{"formato":"canonico-8.2","lote":2,"versao_conteudo":"1.0","trilha":"T3","ordem":4,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"O cliente que chega ao estande já disse três vezes que quer comprar. Não deixe a visita dizer o contrário.","duracao_min":70,"por_que_vale_dinheiro":{"texto":"A casa já traz o cliente: o comparecimento é de 79,8%, acima da meta de 65%, e depois da visita 87,0% passam para pasta ou proposta. Mas só 24,5% das visitas agendadas aparecem registradas como realizadas, e em 11/09/2026 havia 27 clientes quentes com visita realizada parados. A visita é o ponto mais caro do funil: bem feita e registrada, ela vira análise no mesmo dia.","numero":"Comparecimento de 79,8% (meta 65%); visita para pasta ou proposta de 87,0% (meta 75%); só 24,5% das visitas agendadas registradas como realizadas","fonte":"Treinamento do CRM SMQ e diagnóstico do funil no CRM (11/09/2026)","periodo":"set/2026"},"pre_requisitos":["M00","M25","M26","M15","M16"],"indicador_crm":{"nome":"Comparecimento e visita realizada com resultado registrado e próximo passo","onde_ler":"Modo Visita (visitas dos próximos 7 dias e resultado de cada uma) e Meu Raio-X (conversão por etapa); para o gerente, Operação › Funil (passagens Comparecimento e Pasta / proposta)","linha_de_base":"Comparecimento de 79,8% e passagem Pasta / proposta de 87,0% na casa (set/2026); só 24,5% das visitas agendadas registradas como realizadas (subregistro); comparecimento por corretor [DADO A MEDIR NO CRM]","meta_sugerida":"100% das visitas com resultado registrado no Modo Visita no mesmo dia; comparecimento acima de 65% por corretor; visita realizada que vira análise com documento [CALIBRAR com o Meu Raio-X]","fonte":"Treinamento do CRM SMQ (set/2026) e diagnóstico do funil no CRM (11/09/2026)","gap_de_crm":false},"pratica":{"tipo":"Scorecard dos 7 passos: visita real acompanhada pelo gerente ou role-play no decorado","duracao_min":45,"persona":"P1 (casal que cansou do aluguel), P3 (solteira CLT sem entrada) e P13 (\"quero pronto\"), com produto de treino das seis famílias [CONFIRMAR tabela e condição vigente no CRM]","rubrica":"Padrão SMQ, critérios 1 (abertura e conexão), 3 (condução), 4 (objeção), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"Corretor conduz a visita; cliente recebe o cartão da persona e só revela o que o corretor perguntar; o gerente (ou um colega) observa com o scorecard dos 7 passos e a rubrica. Numa visita real, o gerente só observa e dá o retorno depois que o cliente sai.","roteiro":"O corretor prepara a visita no Modo Visita (briefing, simulação e cenário de laudo), recebe o cliente e conduz os 7 passos em até 30 minutos. O cliente mostra pelo menos dois sinais de compra em algum momento e levanta uma objeção no passo 7. O corretor encerra com um próximo passo concreto e registra o resultado no Modo Visita na frente do observador. Retorno do observador em 10 minutos: um ponto forte, um ponto a corrigir e a nota de cada critério.","roteiro_cliente":["P1: chega sem a esposa, que decide junto (\"ela não conseguiu sair do trabalho\"). Pergunta se a parcela vai ser maior que o aluguel de R$ 1.200. Sinais de compra: pergunta se a cama de casal cabe no quarto e quantas unidades ainda têm. Objeção no passo 7: \"preciso ver com a minha esposa\".","P3: gosta muito da localização perto do metrô. Diz \"não tenho entrada\" logo na simulação. Esconde que em 2 meses completa 3 anos de FGTS, e só conta se o corretor perguntar há quanto tempo trabalha registrada. Objeção no passo 7: \"vou pensar\".","P13: casal com filho pequeno, aluguel vencendo em 4 meses. Pergunta logo na recepção quanto tempo demora a visita. Quer saber o prazo de entrega e se a parcela da obra é a parcela do apartamento. Sinal de compra: pergunta em que andar fica a unidade com mais sol."],"observador_procura":["Briefing lido e simulação pronta antes de o cliente chegar; cenário de laudo quando for F3 ou F4.","Recepção pelo nome, tempo combinado (de 20 a 30 minutos) e ancoragem com a Q3.","Área de lazer antes do apartamento e tour com característica, vantagem e benefício para aquela família.","Silêncio respeitado quando o cliente para e olha.","Simulação contada como história, com \"isto é estimativa, a aprovação é da Caixa\"; parcela de obra separada da parcela do financiamento.","Nada omitido que mude a decisão (vaga, prazo de entrega, regra de uso, laudo) e nenhuma promessa de aprovação, taxa ou valorização (critério 6 só com nota 5).","Dois sinais de compra reconhecidos e respondidos com próximo passo; decisor ausente tratado com nova visita, sem tentativa de fechar sozinho.","Q7 feita no fim e próximo passo com duas opções.","Resultado registrado no Modo Visita antes de o observador ir embora."]},"desafio_campo":{"tarefa":"As suas próximas 3 visitas com o protocolo completo: D-2, D-1 e D+0 feitos por você, os 7 passos, o resultado registrado no Modo Visita no mesmo dia e a mensagem de pós-visita enviada com próximo passo e data.","prazo_horas":72,"evidencia_no_crm":"No Modo Visita, as 3 visitas com \"A visita aconteceu?\", \"Como o cliente saiu?\", \"O que trava a decisão?\", etapa, próxima ação e follow-up preenchidos na data da visita; o cliente em \"Visita realizada\" (ou o agendamento remarcado, em caso de no-show); as confirmações e o pós-visita na linha do tempo do Dossiê.","como_o_gestor_confere":"Filtra Agenda e Tarefas pelo corretor, abre as 3 visitas do período e confere, no Dossiê de cada cliente, se o resultado do Modo Visita foi registrado no mesmo dia, se há próxima ação com data e se as mensagens de D-2, D-1, D+0 e pós-visita estão na linha do tempo. Meta: 3 de 3."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, no decorado de um produto em foco, com um colega fazendo o papel de cliente; a parte de tela do Modo Visita é gravada pelo gerente no celular","cenario":"Decorado da construtora (área de lazer e apartamento) e tela do Modo Visita no celular","blocos":[{"tempo":"0:00","fala":"Esse cliente já respondeu, já qualificou e já confirmou. Ele disse três vezes que quer comprar. Hoje você vai aprender a não deixar a visita dizer o contrário.","na_tela":"Porta do decorado abrindo; família entrando"},{"tempo":"0:20","fala":"A casa traz o cliente: o comparecimento é de 79,8%, acima da meta. Mas só 24,5% das visitas aparecem registradas como realizadas. O cliente veio e o CRM não sabe.","na_tela":"Os dois números na tela, com a fonte: CRM SMQ, set/2026"},{"tempo":"0:50","fala":"Antes de sair, abre o Modo Visita. Briefing de 30 segundos, simulação pronta e, em Faixa 3 e 4, o cenário de laudo. Confere o local e as unidades em Documentação & Projetos.","na_tela":"Tela do Modo Visita: briefing e checklist"},{"tempo":"1:30","fala":"Na visita, sete passos. Recepção com água. Lembra o motivo que ele te deu. Área de lazer primeiro. Tour falando da família dele. Silêncio quando ele para e olha. Simulação como história. E no fim: o que ainda poderia te impedir de avançar?","na_tela":"Role-play no decorado passando pelos 7 passos, com o número de cada passo na tela"},{"tempo":"2:40","fala":"Ele perguntou quantas unidades ainda têm e se a cama cabe no quarto. Dois sinais. Para de vender e propõe o próximo passo, com duas opções.","na_tela":"Cliente medindo o quarto com os braços; corretor parando o tour"},{"tempo":"3:15","fala":"O erro mais caro: sair da visita sem registrar. Ainda no local, responde se aconteceu, como o cliente saiu e o que trava, e conclui com próxima ação e data.","na_tela":"Tela do Modo Visita: \"A visita aconteceu?\", \"Como o cliente saiu?\", \"Concluir visita\""},{"tempo":"3:50","fala":"Seu desafio: as próximas três visitas com D-2, D-1 e D+0 feitos por você, os sete passos e o resultado registrado no mesmo dia.","na_tela":"Texto do desafio de campo"},{"tempo":"4:20","fala":"Visita não é tour. É decisão com dia marcado.","na_tela":"Frase-âncora com a marca SMQ"}]},"fontes_internas":["Seções 3, 9.1, 9.4, 9.5, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16 e 9.17 do super prompt","Estudo da Academia v2.1, seções 5.4 e 6 (Fases G, H e I)","Modo Visita no CRM (tela conferida no repositório em 29/09/2026)","Treinamento do CRM SMQ (set/2026)"],"origem":"SMQ","pendencias":["[DADO A MEDIR NO CRM] Comparecimento por corretor e passagem visita realizada para análise por corretor (hoje só existe o número da casa).","[CALIBRAR] Meta individual de visita realizada que vira análise com documento, pela conversão do corretor no Meu Raio-X.","[GAP DE CRM] Visita por vídeo: o agendamento e o Modo Visita não têm um tipo \"por vídeo\". Até existir, registrar no agendamento do empreendimento com a observação \"por vídeo\".","[CONFIRMAR] Tabela e condição vigente dos produtos de treino usados na prática (Documentação & Projetos).","[CONFIRMAR] Horário de funcionamento de estandes, decorados e escritórios por produto, para as duas opções de horário do convite."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M18-A1', 'M18-A2', 'M18-A3', 'M18-A4', 'M18-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M18-Q01', 'M18-Q02', 'M18-Q03', 'M18-Q04', 'M18-Q05', 'M18-Q06', 'M18-Q07', 'M18-Q08', 'M18-Q09', 'M18-Q10', 'M18-Q11', 'M18-Q12', 'M18-Q13', 'M18-Q14', 'M18-Q15', 'M18-Q16', 'M18-Q17', 'M18-Q18', 'M18-Q19', 'M18-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M18-F01', 'M18-F02', 'M18-F03', 'M18-F04', 'M18-F05', 'M18-F06', 'M18-F07', 'M18-F08', 'M18-F09', 'M18-F10', 'M18-F11', 'M18-F12', 'M18-F13', 'M18-F14');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 14;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M18-A1', 1, 'Antes de sair: a visita se ganha no Modo Visita', 'texto',
  'Sábado, 9h50. O cliente chega em 10 minutos e você ainda não sabe quanto ele tem de entrada, quem decide junto nem qual unidade está livre. A visita já começou perdendo, e ele nem estacionou.

### Por que importa

O cliente que chega à visita já passou por três barreiras: respondeu, qualificou e confirmou. O comparecimento da casa é de 79,8%, acima da meta de 65% (CRM SMQ, set/2026): o protocolo traz o cliente. O que ele encontra na porta é responsabilidade sua. Corretor que improvisa gasta a visita descobrindo o que devia ter descoberto na ligação, e a família vai embora sem o próximo passo.

### O conceito

Visita é jogo fora de casa com o placar valendo. Time que entra em campo sem ver o vídeo do adversário corre muito e marca pouco. O briefing de 30 segundos do Modo Visita é o seu vídeo: você entra sabendo o que o cliente quer, o que pode travar e qual número vai mostrar.

### O método SMQ, passo a passo

1. Na véspera, abra o Modo Visita (os 7 dias de visitas ficam na tela) e selecione a visita. Leia o "Briefing de 30 segundos": combinado no último contato, objeções já registradas, renda, entrada, FGTS e empreendimento.
2. Reveja a Q3 (motivação, o "por que agora") e a Q7 (objeção latente) nas observações do Dossiê. Sem Q3 e Q7 registradas, ligue antes da visita e complete: a visita não é lugar para a primeira qualificação.
3. Prepare a simulação na calculadora oficial, nunca de cabeça. Em Faixa 3 e Faixa 4, rode também o cenário de laudo 10% e 20% abaixo da tabela: a Caixa financia até 80% do menor valor entre preço e laudo, e a trava costuma ser a entrada, não a parcela.
4. Confira em Documentação & Projetos o local da visita (estande ou decorado da construtora, ou escritório da SMQ, conforme o produto), o endereço, a tabela do dia, as unidades disponíveis e a melhor posição para o perfil. O cadastro tem erros conhecidos de zona e de entrega: confira no material oficial.
5. Separe o que muda a decisão e não pode ser omitido: vaga, prazo de entrega, regra de uso da unidade e o cenário de laudo. Você não abre a visita por isso, mas não deixa o cliente descobrir depois.
6. Marque o checklist do Modo Visita: horário confirmado com o cliente, documentos necessários conferidos, simulação e condições revisadas. Os dois últimos itens (projeto apresentado, objeções e próximos passos registrados) você marca na visita.

### Na vida real

**O caso:** O "vou confirmar" que esfriou visitas no lançamento (ago/2026).

**O que foi dito:** Em dois dias de um lançamento, cinco perguntas de clientes (vaga, uso por temporada, entrega, endereço do estande) receberam um "vou confirmar" e nenhum retorno.

**O que aconteceu:** As visitas esfriaram e um cliente desistiu. A correção da casa: ficha de produto completa antes de convidar e, quando for preciso confirmar algo, "vou confirmar" com prazo e retorno.

### Scripts prontos

#### Ligação · Completar a Q7 na véspera, quando ela não está registrada

> Oi, [nome]! Tudo certo pra amanhã às 10h? Me tira uma dúvida pra eu te receber com tudo pronto: se você encontrar o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?

**Por que funciona:** A pergunta da Q7 chega com um motivo que interessa ao cliente (ser recebido com tudo pronto). O que ele responder vira a preparação da visita, e não a surpresa do fim dela.

#### WhatsApp · Pergunta de produto que você não sabe responder na hora

> Boa pergunta, [nome]. Quero te responder com a informação oficial da construtora, não de memória. Te trago a resposta até as 18h de hoje, pode ser?

**Por que funciona:** Troca o "vou confirmar" solto por um prazo que você cumpre. O cliente percebe cuidado, não enrolação.

### Erros que matam a venda

- **Ir para a visita sem a simulação pronta, fazendo conta de cabeça na frente do cliente**  
  Quanto custa: O número muda depois e a confiança vai embora junto  
  Correção: Simulação na calculadora oficial antes de sair, com o cenário de laudo em F3 e F4
- **Confiar na zona, na entrega ou no endereço do cadastro sem conferir**  
  Quanto custa: Roteiro errado, cliente no endereço errado, promessa de entrega vencida  
  Correção: Conferir local, endereço e entrega no material oficial em Documentação & Projetos
- **Descobrir na visita a renda, a entrada ou quem decide**  
  Quanto custa: A visita vira a primeira qualificação e termina sem próximo passo  
  Correção: Ligação na véspera para completar o que falta da espinha (Q3, Q7 e as duas travas)

### No CRM

- **Tela:** Modo Visita (Briefing de 30 segundos e Checklist da visita); Documentação & Projetos; Dossiê do cliente
- **Ação:** Ler o briefing, conferir produto e unidades, marcar o checklist antes de sair
- **Campo:** Horário confirmado com o cliente; Documentos necessários conferidos; Simulação e condições revisadas
- **Regra:** Nenhuma visita começa sem briefing lido e simulação pronta

### Frase-âncora

> **A visita se ganha antes de o cliente chegar.**

### Checagem rápida

1. Em quais faixas você roda o cenário de laudo 10% e 20% abaixo antes da visita?  
   Resposta: Em Faixa 3 e Faixa 4, sempre.
2. Onde você confere o local da visita e as unidades disponíveis?  
   Resposta: Em Documentação & Projetos, no material oficial do produto.
3. O que fazer se a Q7 não está registrada na véspera?  
   Resposta: Ligar antes da visita e completar.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Sábado, 9h50. O cliente chega em 10 minutos e você ainda não sabe quanto ele tem de entrada, quem decide junto nem qual unidade está livre. A visita já começou perdendo, e ele nem estacionou.","por_que_importa":"O cliente que chega à visita já passou por três barreiras: respondeu, qualificou e confirmou. O comparecimento da casa é de 79,8%, acima da meta de 65% (CRM SMQ, set/2026): o protocolo traz o cliente. O que ele encontra na porta é responsabilidade sua. Corretor que improvisa gasta a visita descobrindo o que devia ter descoberto na ligação, e a família vai embora sem o próximo passo.","conceito":"Visita é jogo fora de casa com o placar valendo. Time que entra em campo sem ver o vídeo do adversário corre muito e marca pouco. O briefing de 30 segundos do Modo Visita é o seu vídeo: você entra sabendo o que o cliente quer, o que pode travar e qual número vai mostrar.","metodo":["Na véspera, abra o Modo Visita (os 7 dias de visitas ficam na tela) e selecione a visita. Leia o \"Briefing de 30 segundos\": combinado no último contato, objeções já registradas, renda, entrada, FGTS e empreendimento.","Reveja a Q3 (motivação, o \"por que agora\") e a Q7 (objeção latente) nas observações do Dossiê. Sem Q3 e Q7 registradas, ligue antes da visita e complete: a visita não é lugar para a primeira qualificação.","Prepare a simulação na calculadora oficial, nunca de cabeça. Em Faixa 3 e Faixa 4, rode também o cenário de laudo 10% e 20% abaixo da tabela: a Caixa financia até 80% do menor valor entre preço e laudo, e a trava costuma ser a entrada, não a parcela.","Confira em Documentação & Projetos o local da visita (estande ou decorado da construtora, ou escritório da SMQ, conforme o produto), o endereço, a tabela do dia, as unidades disponíveis e a melhor posição para o perfil. O cadastro tem erros conhecidos de zona e de entrega: confira no material oficial.","Separe o que muda a decisão e não pode ser omitido: vaga, prazo de entrega, regra de uso da unidade e o cenário de laudo. Você não abre a visita por isso, mas não deixa o cliente descobrir depois.","Marque o checklist do Modo Visita: horário confirmado com o cliente, documentos necessários conferidos, simulação e condições revisadas. Os dois últimos itens (projeto apresentado, objeções e próximos passos registrados) você marca na visita."],"na_vida_real":{"caso":"O \"vou confirmar\" que esfriou visitas no lançamento (ago/2026).","o_que_foi_dito":"Em dois dias de um lançamento, cinco perguntas de clientes (vaga, uso por temporada, entrega, endereço do estande) receberam um \"vou confirmar\" e nenhum retorno.","resultado":"As visitas esfriaram e um cliente desistiu. A correção da casa: ficha de produto completa antes de convidar e, quando for preciso confirmar algo, \"vou confirmar\" com prazo e retorno.","fonte":"Erros que mais custaram (seção 9.16)"},"scripts":[{"canal":"Ligação","situacao":"Completar a Q7 na véspera, quando ela não está registrada","texto":"Oi, [nome]! Tudo certo pra amanhã às 10h? Me tira uma dúvida pra eu te receber com tudo pronto: se você encontrar o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?","por_que_funciona":"A pergunta da Q7 chega com um motivo que interessa ao cliente (ser recebido com tudo pronto). O que ele responder vira a preparação da visita, e não a surpresa do fim dela."},{"canal":"WhatsApp","situacao":"Pergunta de produto que você não sabe responder na hora","texto":"Boa pergunta, [nome]. Quero te responder com a informação oficial da construtora, não de memória. Te trago a resposta até as 18h de hoje, pode ser?","por_que_funciona":"Troca o \"vou confirmar\" solto por um prazo que você cumpre. O cliente percebe cuidado, não enrolação."}],"erros_que_matam":[{"erro":"Ir para a visita sem a simulação pronta, fazendo conta de cabeça na frente do cliente","custo":"O número muda depois e a confiança vai embora junto","correcao":"Simulação na calculadora oficial antes de sair, com o cenário de laudo em F3 e F4"},{"erro":"Confiar na zona, na entrega ou no endereço do cadastro sem conferir","custo":"Roteiro errado, cliente no endereço errado, promessa de entrega vencida","correcao":"Conferir local, endereço e entrega no material oficial em Documentação & Projetos"},{"erro":"Descobrir na visita a renda, a entrada ou quem decide","custo":"A visita vira a primeira qualificação e termina sem próximo passo","correcao":"Ligação na véspera para completar o que falta da espinha (Q3, Q7 e as duas travas)"}],"no_crm":{"tela":"Modo Visita (Briefing de 30 segundos e Checklist da visita); Documentação & Projetos; Dossiê do cliente","acao":"Ler o briefing, conferir produto e unidades, marcar o checklist antes de sair","campo":"Horário confirmado com o cliente; Documentos necessários conferidos; Simulação e condições revisadas","regra":"Nenhuma visita começa sem briefing lido e simulação pronta"},"frase_ancora":"A visita se ganha antes de o cliente chegar.","checagem_rapida":[{"pergunta":"Em quais faixas você roda o cenário de laudo 10% e 20% abaixo antes da visita?","resposta":"Em Faixa 3 e Faixa 4, sempre."},{"pergunta":"Onde você confere o local da visita e as unidades disponíveis?","resposta":"Em Documentação & Projetos, no material oficial do produto."},{"pergunta":"O que fazer se a Q7 não está registrada na véspera?","resposta":"Ligar antes da visita e completar."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M18-A2', 2, 'D-2, D-1 e D+0: a visita confirmada por gente', 'texto',
  'Um cliente chegou com visita marcada para um sábado. O corretor ficou 9 dias sem falar com ele. Na véspera, o lembrete automático perguntou se estava de pé, e a resposta foi: "Preciso reagendar."

### Por que importa

O comparecimento de 79,8% (CRM SMQ, set/2026) é resultado de protocolo, não de sorte. A visita é o ponto mais caro do funil: tudo o que a casa investiu para trazer o cliente até ali se perde num silêncio de véspera. Quem confirma com vínculo recebe o cliente; quem terceiriza para o robô recebe, com sorte, um desconhecido.

### O conceito

Confirmação é como o aviso do médico na véspera da consulta: não é cobrança, é cuidado. Você lembra o dia, a hora e o que levar, e o paciente chega sentindo que está sendo esperado.

### O método SMQ, passo a passo

1. D-2: confirme que está de pé. Mensagem curta, com dia, hora e empreendimento.
2. D-1: reforce horário e endereço, diga com quem falar na recepção, pergunte se o decisor vem e lembre os documentos (RG, CPF, comprovante de renda e de residência). Documento não obriga a comprar: diga isso.
3. D+0: avise que você já está indo para o local da visita. O cliente sabe que alguém o espera.
4. O robô Vitor manda os lembretes automáticos na véspera às 18h30 e no dia às 08h45. Ele reforça; não substitui. O relacionamento é seu.
5. O cliente respondeu "preciso reagendar" ao robô? Assuma na hora, ofereça duas opções concretas e marque o agendamento como remarcado (Agenda e Tarefas, "Novo dia e horário"), para a confirmação automática não confirmar uma visita cancelada.
6. "Vou tentar ir", "se der eu passo", "vou sair do trabalho e vejo" são sinais de no-show. Proponha trocar para um horário com certeza, com duas opções.
7. Chegou lead novo enquanto você está com o cliente na visita? Não existe regra especial: o cliente presente é a prioridade. Se o primeiro contato não acontecer no prazo, o repasse por SLA resolve (decisão de 29/09/2026). Nada de atender o celular no meio do tour.

### Na vida real

**O caso:** A visita que ninguém confirmou (jul/2026).

**O que foi dito:** Handoff com visita marcada para um sábado; nenhum contato do corretor em 9 dias. Na confirmação automática da véspera, a cliente respondeu: "Preciso reagendar."

**O que aconteceu:** A correção foi responder com duas opções concretas e marcar o agendamento como remarcado. Sem o humano, a visita teria morrido em silêncio. Use como caso de erro: a confirmação da véspera não conserta 9 dias de ausência.

### Scripts prontos

#### WhatsApp · D-2

> Oi, [nome]! Passando pra confirmar nossa visita de [dia], às [hora], no [empreendimento]. Continua de pé pra você?

**Por que funciona:** Pede só um "sim" e dá tempo de remarcar com calma se algo mudou.

#### WhatsApp · D-1, com endereço, anfitrião, decisor e documentos

> Amanhã é o dia, [nome]! Te espero às [hora] no [estande, decorado ou escritório da SMQ], na [endereço completo]. Na recepção é só perguntar por mim. A [pessoa que decide junto] vem com você, né? Leva RG, CPF e um comprovante de renda que a gente já adianta a sua análise.

**Por que funciona:** Tudo numa mensagem só: local, endereço, anfitrião, decisor e documentos. Nada de "o endereço eu te mando depois".

#### WhatsApp · "Vou tentar ir"

> [nome], pra eu te receber com tudo pronto, vale a gente trocar pra um horário em que você tenha certeza? Sábado às 10h ou às 14h?

**Por que funciona:** "Vou tentar" é aviso de falta. Trocar o horário protege a visita sem constranger ninguém.

#### WhatsApp · D+0

> Bom dia, [nome]! Já estou indo pro [local da visita]. Te espero às [hora].

**Por que funciona:** O cliente sabe que tem alguém esperando por ele. Faltar fica mais difícil.

### Erros que matam a venda

- **Deixar a confirmação só com o robô**  
  Quanto custa: O cliente chega sem vínculo com você, ou não chega  
  Correção: D-2 humano, D-1 com decisor e endereço, D+0 a caminho
- **Responder "preciso reagendar" sem marcar o agendamento como remarcado**  
  Quanto custa: A confirmação automática confirma uma visita que não vai acontecer  
  Correção: Duas opções na hora e o agendamento remarcado no CRM
- **Aceitar "vou tentar ir" como confirmação**  
  Quanto custa: No-show no ponto mais caro do funil  
  Correção: Trocar para um horário com certeza, com duas opções

### No CRM

- **Tela:** Agenda e Tarefas; Dossiê do cliente (aba de agendamentos); Modo Visita
- **Ação:** Registrar as confirmações e remarcar quando o cliente pedir
- **Campo:** Agendamento: data, hora, empreendimento; "Novo dia e horário" ao remarcar
- **Regra:** Visita remarcada é visita salva; visita esquecida é visita perdida

### Frase-âncora

> **Robô lembra. Gente confirma.**

### Checagem rápida

1. O que a mensagem de D-1 precisa ter?  
   Resposta: Horário, endereço, com quem falar, pergunta sobre o decisor e os documentos para levar.
2. O cliente respondeu "preciso reagendar" ao robô. Quais são os dois passos?  
   Resposta: Duas opções concretas na hora e o agendamento marcado como remarcado.',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Um cliente chegou com visita marcada para um sábado. O corretor ficou 9 dias sem falar com ele. Na véspera, o lembrete automático perguntou se estava de pé, e a resposta foi: \"Preciso reagendar.\"","por_que_importa":"O comparecimento de 79,8% (CRM SMQ, set/2026) é resultado de protocolo, não de sorte. A visita é o ponto mais caro do funil: tudo o que a casa investiu para trazer o cliente até ali se perde num silêncio de véspera. Quem confirma com vínculo recebe o cliente; quem terceiriza para o robô recebe, com sorte, um desconhecido.","conceito":"Confirmação é como o aviso do médico na véspera da consulta: não é cobrança, é cuidado. Você lembra o dia, a hora e o que levar, e o paciente chega sentindo que está sendo esperado.","metodo":["D-2: confirme que está de pé. Mensagem curta, com dia, hora e empreendimento.","D-1: reforce horário e endereço, diga com quem falar na recepção, pergunte se o decisor vem e lembre os documentos (RG, CPF, comprovante de renda e de residência). Documento não obriga a comprar: diga isso.","D+0: avise que você já está indo para o local da visita. O cliente sabe que alguém o espera.","O robô Vitor manda os lembretes automáticos na véspera às 18h30 e no dia às 08h45. Ele reforça; não substitui. O relacionamento é seu.","O cliente respondeu \"preciso reagendar\" ao robô? Assuma na hora, ofereça duas opções concretas e marque o agendamento como remarcado (Agenda e Tarefas, \"Novo dia e horário\"), para a confirmação automática não confirmar uma visita cancelada.","\"Vou tentar ir\", \"se der eu passo\", \"vou sair do trabalho e vejo\" são sinais de no-show. Proponha trocar para um horário com certeza, com duas opções.","Chegou lead novo enquanto você está com o cliente na visita? Não existe regra especial: o cliente presente é a prioridade. Se o primeiro contato não acontecer no prazo, o repasse por SLA resolve (decisão de 29/09/2026). Nada de atender o celular no meio do tour."],"na_vida_real":{"caso":"A visita que ninguém confirmou (jul/2026).","o_que_foi_dito":"Handoff com visita marcada para um sábado; nenhum contato do corretor em 9 dias. Na confirmação automática da véspera, a cliente respondeu: \"Preciso reagendar.\"","resultado":"A correção foi responder com duas opções concretas e marcar o agendamento como remarcado. Sem o humano, a visita teria morrido em silêncio. Use como caso de erro: a confirmação da véspera não conserta 9 dias de ausência.","fonte":"Casos da era do CRM (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"D-2","texto":"Oi, [nome]! Passando pra confirmar nossa visita de [dia], às [hora], no [empreendimento]. Continua de pé pra você?","por_que_funciona":"Pede só um \"sim\" e dá tempo de remarcar com calma se algo mudou."},{"canal":"WhatsApp","situacao":"D-1, com endereço, anfitrião, decisor e documentos","texto":"Amanhã é o dia, [nome]! Te espero às [hora] no [estande, decorado ou escritório da SMQ], na [endereço completo]. Na recepção é só perguntar por mim. A [pessoa que decide junto] vem com você, né? Leva RG, CPF e um comprovante de renda que a gente já adianta a sua análise.","por_que_funciona":"Tudo numa mensagem só: local, endereço, anfitrião, decisor e documentos. Nada de \"o endereço eu te mando depois\"."},{"canal":"WhatsApp","situacao":"\"Vou tentar ir\"","texto":"[nome], pra eu te receber com tudo pronto, vale a gente trocar pra um horário em que você tenha certeza? Sábado às 10h ou às 14h?","por_que_funciona":"\"Vou tentar\" é aviso de falta. Trocar o horário protege a visita sem constranger ninguém."},{"canal":"WhatsApp","situacao":"D+0","texto":"Bom dia, [nome]! Já estou indo pro [local da visita]. Te espero às [hora].","por_que_funciona":"O cliente sabe que tem alguém esperando por ele. Faltar fica mais difícil."}],"erros_que_matam":[{"erro":"Deixar a confirmação só com o robô","custo":"O cliente chega sem vínculo com você, ou não chega","correcao":"D-2 humano, D-1 com decisor e endereço, D+0 a caminho"},{"erro":"Responder \"preciso reagendar\" sem marcar o agendamento como remarcado","custo":"A confirmação automática confirma uma visita que não vai acontecer","correcao":"Duas opções na hora e o agendamento remarcado no CRM"},{"erro":"Aceitar \"vou tentar ir\" como confirmação","custo":"No-show no ponto mais caro do funil","correcao":"Trocar para um horário com certeza, com duas opções"}],"no_crm":{"tela":"Agenda e Tarefas; Dossiê do cliente (aba de agendamentos); Modo Visita","acao":"Registrar as confirmações e remarcar quando o cliente pedir","campo":"Agendamento: data, hora, empreendimento; \"Novo dia e horário\" ao remarcar","regra":"Visita remarcada é visita salva; visita esquecida é visita perdida"},"frase_ancora":"Robô lembra. Gente confirma.","checagem_rapida":[{"pergunta":"O que a mensagem de D-1 precisa ter?","resposta":"Horário, endereço, com quem falar, pergunta sobre o decisor e os documentos para levar."},{"pergunta":"O cliente respondeu \"preciso reagendar\" ao robô. Quais são os dois passos?","resposta":"Duas opções concretas na hora e o agendamento marcado como remarcado."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M18-A3', 3, 'Os 7 passos da visita SMQ, em 20 a 30 minutos', 'texto',
  'A família entra no decorado. O corretor comum começa pela planta, pela metragem e pelo preço. O corretor SMQ começa oferecendo água e perguntando: "Lembra que você me disse que queria um quarto só pro seu filho? Hoje você vai ver exatamente isso."

### Por que importa

A visita é o momento de maior temperatura emocional da jornada. Depois dela, 87,0% dos clientes da casa passam para pasta ou proposta, acima da meta de 75% (CRM SMQ, set/2026): quando a visita acontece bem feita, ela move a venda. O que derruba é a visita sem roteiro, que vira passeio e termina em "vou pensar".

### O conceito

A visita é um test drive, não uma aula de engenharia. Ninguém compra carro ouvindo a ficha técnica; compra quando senta no banco, se imagina na estrada e alguém mostra quanto cabe no mês.

### O método SMQ, passo a passo

1. Recepção: chame pelo nome, ofereça água, mostre que o cliente era esperado. Combine o tempo: "Em 20 a 30 minutos você vê tudo."
2. Ancoragem emocional: retome a Q3. "Você me disse que quer [motivação]. Hoje você vai ver exatamente isso."
3. Área de lazer primeiro: deixe a família se imaginar ali (as crianças na piscina, o churrasco do domingo) antes de entrar no apartamento.
4. Tour personalizado: característica, vantagem e benefício para aquela família. "Esta cozinha é americana (característica), integra com a sala (vantagem), e você cozinha olhando o seu filho brincar (benefício)."
5. Silêncio respeitado: quando o cliente para e olha, ele está comprando. Não preencha o silêncio com mais característica.
6. Simulação como história: do imóvel à parcela, com os números dele, na calculadora oficial. Diga sempre: "isto é estimativa, a aprovação é da Caixa". Em F3 e F4, mostre o cenário de laudo com naturalidade, antes de o banco mostrar.
7. Q7 de novo e próximo passo: "Agora que você viu tudo, o que ainda poderia te impedir de avançar?" Saia sempre com um próximo passo, qualquer que seja o resultado.
8. Transparência o tempo todo: não abra pelos defeitos, mas nunca omita o que muda a decisão (vaga, prazo de entrega, regra de uso da unidade, laudo).

### Na vida real

**O caso:** Seleção honesta de unidade (caso D, diretor).

**O que foi dito:** Na escolha da unidade, o diretor falou dos pontos fracos junto com os fortes: sol da tarde, barulho da área de lazer, avenida, vista e privacidade.

**O que aconteceu:** A unidade foi escolhida com segurança e sem arrependimento depois. Quem ouve o defeito do corretor confia na virtude que ele aponta; quem descobre sozinho se sente enganado.

### Scripts prontos

#### Visita · Recepção e ancoragem (passos 1 e 2)

> Que bom que vocês vieram! Querem uma água? Em 20 a 30 minutos vocês veem tudo. Lembra que você me falou que o que mais pesa hoje é o aluguel subindo todo ano? Hoje vocês vão ver como fica ter o de vocês.

**Por que funciona:** Mostra que o cliente era esperado, combina o tempo (tira o medo de pressão) e liga a visita ao motivo que ele mesmo deu.

#### Visita · Simulação como história (passo 6)

> Olha como fica com os números de vocês: esse apartamento sai a partir de R$ [preço] pela tabela de hoje. Com o FGTS e a condição da campanha, a entrada fica assim, e a parcela estimada fica em torno de R$ [valor]. É estimativa: quem aprova é a Caixa, na análise, que é gratuita.

**Por que funciona:** Conta a história do imóvel até a parcela com os números do cliente e deixa claro o que é estimativa e o que é aprovação.

#### Visita · Q7 final e próximo passo (passo 7)

> Agora que vocês viram tudo: o que ainda poderia impedir vocês de avançar?

**Por que funciona:** Traz a objeção para a mesa enquanto você ainda está presente para tratá-la. Objeção descoberta em casa vira silêncio.

### Erros que matam a venda

- **Começar pela planta, pela metragem e pelo preço**  
  Quanto custa: A visita vira comparação de tabela e o cliente sai frio  
  Correção: Recepção, ancoragem com a Q3 e área de lazer primeiro
- **Esconder a vaga, o prazo de entrega ou o cenário de laudo**  
  Quanto custa: O cliente descobre na análise ou na entrega e a venda cai com a sua credibilidade  
  Correção: Não abrir pelo defeito, nunca omitir o que muda a decisão
- **Passar de 30 minutos sem combinar**  
  Quanto custa: Cliente cansado, criança chorando, decisão adiada  
  Correção: Combinar o tempo na recepção e respeitar o que foi prometido

### No CRM

- **Tela:** Modo Visita (Notas da conversa e Checklist da visita)
- **Ação:** Anotar o que o cliente disse sobre motivação, objeções e unidade preferida
- **Campo:** Projeto e disponibilidade apresentados; Notas da conversa
- **Regra:** O que o cliente disse na visita vai para o CRM, não para a sua memória

### Frase-âncora

> **Visita não é tour. É decisão com dia marcado.**

### Checagem rápida

1. Por onde começa o tour depois da ancoragem?  
   Resposta: Pela área de lazer.
2. O que você faz quando o cliente para e fica olhando em silêncio?  
   Resposta: Nada: respeita o silêncio, porque ele está comprando.
3. Qual é a pergunta do passo 7?  
   Resposta: Agora que você viu tudo, o que ainda poderia te impedir de avançar?',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"A família entra no decorado. O corretor comum começa pela planta, pela metragem e pelo preço. O corretor SMQ começa oferecendo água e perguntando: \"Lembra que você me disse que queria um quarto só pro seu filho? Hoje você vai ver exatamente isso.\"","por_que_importa":"A visita é o momento de maior temperatura emocional da jornada. Depois dela, 87,0% dos clientes da casa passam para pasta ou proposta, acima da meta de 75% (CRM SMQ, set/2026): quando a visita acontece bem feita, ela move a venda. O que derruba é a visita sem roteiro, que vira passeio e termina em \"vou pensar\".","conceito":"A visita é um test drive, não uma aula de engenharia. Ninguém compra carro ouvindo a ficha técnica; compra quando senta no banco, se imagina na estrada e alguém mostra quanto cabe no mês.","metodo":["Recepção: chame pelo nome, ofereça água, mostre que o cliente era esperado. Combine o tempo: \"Em 20 a 30 minutos você vê tudo.\"","Ancoragem emocional: retome a Q3. \"Você me disse que quer [motivação]. Hoje você vai ver exatamente isso.\"","Área de lazer primeiro: deixe a família se imaginar ali (as crianças na piscina, o churrasco do domingo) antes de entrar no apartamento.","Tour personalizado: característica, vantagem e benefício para aquela família. \"Esta cozinha é americana (característica), integra com a sala (vantagem), e você cozinha olhando o seu filho brincar (benefício).\"","Silêncio respeitado: quando o cliente para e olha, ele está comprando. Não preencha o silêncio com mais característica.","Simulação como história: do imóvel à parcela, com os números dele, na calculadora oficial. Diga sempre: \"isto é estimativa, a aprovação é da Caixa\". Em F3 e F4, mostre o cenário de laudo com naturalidade, antes de o banco mostrar.","Q7 de novo e próximo passo: \"Agora que você viu tudo, o que ainda poderia te impedir de avançar?\" Saia sempre com um próximo passo, qualquer que seja o resultado.","Transparência o tempo todo: não abra pelos defeitos, mas nunca omita o que muda a decisão (vaga, prazo de entrega, regra de uso da unidade, laudo)."],"na_vida_real":{"caso":"Seleção honesta de unidade (caso D, diretor).","o_que_foi_dito":"Na escolha da unidade, o diretor falou dos pontos fracos junto com os fortes: sol da tarde, barulho da área de lazer, avenida, vista e privacidade.","resultado":"A unidade foi escolhida com segurança e sem arrependimento depois. Quem ouve o defeito do corretor confia na virtude que ele aponta; quem descobre sozinho se sente enganado.","fonte":"Casoteca SMQ, caso D (seção 9.12)"},"scripts":[{"canal":"Visita","situacao":"Recepção e ancoragem (passos 1 e 2)","texto":"Que bom que vocês vieram! Querem uma água? Em 20 a 30 minutos vocês veem tudo. Lembra que você me falou que o que mais pesa hoje é o aluguel subindo todo ano? Hoje vocês vão ver como fica ter o de vocês.","por_que_funciona":"Mostra que o cliente era esperado, combina o tempo (tira o medo de pressão) e liga a visita ao motivo que ele mesmo deu."},{"canal":"Visita","situacao":"Simulação como história (passo 6)","texto":"Olha como fica com os números de vocês: esse apartamento sai a partir de R$ [preço] pela tabela de hoje. Com o FGTS e a condição da campanha, a entrada fica assim, e a parcela estimada fica em torno de R$ [valor]. É estimativa: quem aprova é a Caixa, na análise, que é gratuita.","por_que_funciona":"Conta a história do imóvel até a parcela com os números do cliente e deixa claro o que é estimativa e o que é aprovação."},{"canal":"Visita","situacao":"Q7 final e próximo passo (passo 7)","texto":"Agora que vocês viram tudo: o que ainda poderia impedir vocês de avançar?","por_que_funciona":"Traz a objeção para a mesa enquanto você ainda está presente para tratá-la. Objeção descoberta em casa vira silêncio."}],"erros_que_matam":[{"erro":"Começar pela planta, pela metragem e pelo preço","custo":"A visita vira comparação de tabela e o cliente sai frio","correcao":"Recepção, ancoragem com a Q3 e área de lazer primeiro"},{"erro":"Esconder a vaga, o prazo de entrega ou o cenário de laudo","custo":"O cliente descobre na análise ou na entrega e a venda cai com a sua credibilidade","correcao":"Não abrir pelo defeito, nunca omitir o que muda a decisão"},{"erro":"Passar de 30 minutos sem combinar","custo":"Cliente cansado, criança chorando, decisão adiada","correcao":"Combinar o tempo na recepção e respeitar o que foi prometido"}],"no_crm":{"tela":"Modo Visita (Notas da conversa e Checklist da visita)","acao":"Anotar o que o cliente disse sobre motivação, objeções e unidade preferida","campo":"Projeto e disponibilidade apresentados; Notas da conversa","regra":"O que o cliente disse na visita vai para o CRM, não para a sua memória"},"frase_ancora":"Visita não é tour. É decisão com dia marcado.","checagem_rapida":[{"pergunta":"Por onde começa o tour depois da ancoragem?","resposta":"Pela área de lazer."},{"pergunta":"O que você faz quando o cliente para e fica olhando em silêncio?","resposta":"Nada: respeita o silêncio, porque ele está comprando."},{"pergunta":"Qual é a pergunta do passo 7?","resposta":"Agora que você viu tudo, o que ainda poderia te impedir de avançar?"}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M18-A4', 4, 'Sinais de compra e o decisor na sala', 'texto',
  '"Quantas unidades ainda têm nesse andar?" O cliente fez a pergunta de quem está comprando, e o corretor respondeu com mais dez minutos sobre o acabamento da varanda.

### Por que importa

Quem apresenta depois do sinal de compra esfria o cliente que estava pronto. E quem tenta fechar sem o decisor adia a venda que parecia certa: o co-decisor que não viu o apartamento é quem diz "vamos pensar" em casa.

### O conceito

Sinal de compra é o farol verde. Quem fica parado no verde admirando o semáforo leva buzina; quem arranca no amarelo leva multa. O corretor SMQ arranca no verde: dois sinais, próximo passo.

### O método SMQ, passo a passo

1. Leia os sinais verbais: "quantas unidades ainda têm?", "minha cama cabe nesse quarto?", "minha esposa ia amar isso", perguntas sobre prazo de entrega e documentação.
2. Leia os sinais não verbais: abre armário, mede com os braços, larga o celular, se inclina quando se fala de valores, olha a vista em silêncio.
3. A regra é uma só: dois ou mais sinais, ou um sinal forte, pare de apresentar e proponha o próximo passo.
4. O próximo passo na visita é concreto: análise de crédito com documento (quando ainda não há) ou bloquear a unidade e marcar a assinatura (quando a aprovação já existe), sempre com duas opções. Nunca pergunte "vai fechar?": proponha o como.
5. Decisor ausente: nunca tente fechar sem ele. Elogie o interesse e marque a volta com os dois, com duas opções de horário. Se a distância pesar, ofereça uma chamada de vídeo com o co-decisor ainda no dia.
6. Proibido ensinar ou praticar "fechar primeiro e trazer o cônjuge depois" ou procurar o elo mais fraco do casal. Decisão de casal se respeita.

### Na vida real

**O caso:** Fechamento no calor depois da aprovação (caso N, jan a fev/2026).

**O que foi dito:** Na linha de: "Aprovou! Você consegue vir hoje?" A unidade foi escolhida com o cliente, o fluxo foi refeito e o contrato ficou pronto antes da chegada.

**O que aconteceu:** Contrato assinado no estande à noite, no dia seguinte à aprovação. O sinal de compra (a aprovação e o "vou hoje") foi respondido com próximo passo, não com mais apresentação.

### Scripts prontos

#### Visita · Dois sinais de compra durante o tour

> Pelo jeito que vocês olharam esse quarto, acho que encontramos. O próximo passo é descobrir quanto a Caixa aprova pra vocês: a análise é gratuita e não compromete nada. Vocês trouxeram RG, CPF e comprovante de renda? A gente já começa aqui mesmo.

**Por que funciona:** Nomeia o sinal com leveza, para de apresentar e propõe um passo concreto, com as âncoras de gratuidade e sem compromisso.

#### Visita · O decisor não veio

> Você gostou tanto que imagino que queira trazer a [pessoa que decide junto] pra ver também. Fica melhor sábado às 10h ou às 14h?

**Por que funciona:** Transforma a ausência do decisor em nova visita com data, sem pressionar quem está presente a decidir sozinho.

#### Visita · Cliente PRONTO, com aprovação, pergunta se ainda tem a unidade

> Tem sim, pela tabela de hoje. Pra bloquear essa unidade pra você, o próximo passo é a assinatura. Fica melhor hoje às 18h ou amanhã às 10h? Deixo o fluxo e o contrato prontos.

**Por que funciona:** Responde ao sinal forte com o como e o quando, sem urgência falsa e sem perguntar "vai fechar?".

### Erros que matam a venda

- **Continuar apresentando depois de dois sinais de compra**  
  Quanto custa: O cliente esfria na sua frente e leva a decisão para casa  
  Correção: Pare e proponha o próximo passo com duas opções
- **Tentar fechar sem o decisor**  
  Quanto custa: Venda adiada ou desfeita em casa, e perda de confiança do casal  
  Correção: Nova visita com os dois, com duas opções de horário
- **Perguntar "e aí, vai fechar?"**  
  Quanto custa: Pergunta de sim ou não devolve "vou pensar"  
  Correção: Propor o como: a análise agora ou a assinatura em um de dois horários

### No CRM

- **Tela:** Modo Visita (Próximo passo)
- **Ação:** Registrar como o cliente saiu e o que trava a decisão
- **Campo:** "Como o cliente saiu?" (Alto, Médio, Baixo ou Sem interesse) e "O que trava a decisão?" (inclui "Decisor não estava presente")
- **Regra:** Decisor ausente é registrado como trava, não escondido nas observações

### Frase-âncora

> **Dois sinais, pare de vender. Proponha o próximo passo.**

### Checagem rápida

1. Quantos sinais de compra fazem você parar de apresentar?  
   Resposta: Dois ou mais, ou um sinal forte.
2. O decisor não veio. O que você propõe?  
   Resposta: Nova visita com os dois, com duas opções de horário.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Quantas unidades ainda têm nesse andar?\" O cliente fez a pergunta de quem está comprando, e o corretor respondeu com mais dez minutos sobre o acabamento da varanda.","por_que_importa":"Quem apresenta depois do sinal de compra esfria o cliente que estava pronto. E quem tenta fechar sem o decisor adia a venda que parecia certa: o co-decisor que não viu o apartamento é quem diz \"vamos pensar\" em casa.","conceito":"Sinal de compra é o farol verde. Quem fica parado no verde admirando o semáforo leva buzina; quem arranca no amarelo leva multa. O corretor SMQ arranca no verde: dois sinais, próximo passo.","metodo":["Leia os sinais verbais: \"quantas unidades ainda têm?\", \"minha cama cabe nesse quarto?\", \"minha esposa ia amar isso\", perguntas sobre prazo de entrega e documentação.","Leia os sinais não verbais: abre armário, mede com os braços, larga o celular, se inclina quando se fala de valores, olha a vista em silêncio.","A regra é uma só: dois ou mais sinais, ou um sinal forte, pare de apresentar e proponha o próximo passo.","O próximo passo na visita é concreto: análise de crédito com documento (quando ainda não há) ou bloquear a unidade e marcar a assinatura (quando a aprovação já existe), sempre com duas opções. Nunca pergunte \"vai fechar?\": proponha o como.","Decisor ausente: nunca tente fechar sem ele. Elogie o interesse e marque a volta com os dois, com duas opções de horário. Se a distância pesar, ofereça uma chamada de vídeo com o co-decisor ainda no dia.","Proibido ensinar ou praticar \"fechar primeiro e trazer o cônjuge depois\" ou procurar o elo mais fraco do casal. Decisão de casal se respeita."],"na_vida_real":{"caso":"Fechamento no calor depois da aprovação (caso N, jan a fev/2026).","o_que_foi_dito":"Na linha de: \"Aprovou! Você consegue vir hoje?\" A unidade foi escolhida com o cliente, o fluxo foi refeito e o contrato ficou pronto antes da chegada.","resultado":"Contrato assinado no estande à noite, no dia seguinte à aprovação. O sinal de compra (a aprovação e o \"vou hoje\") foi respondido com próximo passo, não com mais apresentação.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"Visita","situacao":"Dois sinais de compra durante o tour","texto":"Pelo jeito que vocês olharam esse quarto, acho que encontramos. O próximo passo é descobrir quanto a Caixa aprova pra vocês: a análise é gratuita e não compromete nada. Vocês trouxeram RG, CPF e comprovante de renda? A gente já começa aqui mesmo.","por_que_funciona":"Nomeia o sinal com leveza, para de apresentar e propõe um passo concreto, com as âncoras de gratuidade e sem compromisso."},{"canal":"Visita","situacao":"O decisor não veio","texto":"Você gostou tanto que imagino que queira trazer a [pessoa que decide junto] pra ver também. Fica melhor sábado às 10h ou às 14h?","por_que_funciona":"Transforma a ausência do decisor em nova visita com data, sem pressionar quem está presente a decidir sozinho."},{"canal":"Visita","situacao":"Cliente PRONTO, com aprovação, pergunta se ainda tem a unidade","texto":"Tem sim, pela tabela de hoje. Pra bloquear essa unidade pra você, o próximo passo é a assinatura. Fica melhor hoje às 18h ou amanhã às 10h? Deixo o fluxo e o contrato prontos.","por_que_funciona":"Responde ao sinal forte com o como e o quando, sem urgência falsa e sem perguntar \"vai fechar?\"."}],"erros_que_matam":[{"erro":"Continuar apresentando depois de dois sinais de compra","custo":"O cliente esfria na sua frente e leva a decisão para casa","correcao":"Pare e proponha o próximo passo com duas opções"},{"erro":"Tentar fechar sem o decisor","custo":"Venda adiada ou desfeita em casa, e perda de confiança do casal","correcao":"Nova visita com os dois, com duas opções de horário"},{"erro":"Perguntar \"e aí, vai fechar?\"","custo":"Pergunta de sim ou não devolve \"vou pensar\"","correcao":"Propor o como: a análise agora ou a assinatura em um de dois horários"}],"no_crm":{"tela":"Modo Visita (Próximo passo)","acao":"Registrar como o cliente saiu e o que trava a decisão","campo":"\"Como o cliente saiu?\" (Alto, Médio, Baixo ou Sem interesse) e \"O que trava a decisão?\" (inclui \"Decisor não estava presente\")","regra":"Decisor ausente é registrado como trava, não escondido nas observações"},"frase_ancora":"Dois sinais, pare de vender. Proponha o próximo passo.","checagem_rapida":[{"pergunta":"Quantos sinais de compra fazem você parar de apresentar?","resposta":"Dois ou mais, ou um sinal forte."},{"pergunta":"O decisor não veio. O que você propõe?","resposta":"Nova visita com os dois, com duas opções de horário."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M18-A5', 5, 'Depois da visita: registrar, agradecer, avançar', 'texto',
  'Das visitas agendadas na casa, só 24,5% aparecem registradas como realizadas, enquanto o comparecimento real é de 79,8% (CRM SMQ, set/2026). O cliente veio. O CRM não sabe.

### Por que importa

Visita que não é registrada não move o cliente para "Visita realizada", não cria o próximo passo e some da Fila. Em 11/09/2026, entre os 210 clientes quentes parados em fase avançada, 27 já tinham visita realizada, e os piores do grupo estavam entre 70 e 79 dias sem movimento (diagnóstico do funil no CRM): dinheiro na mesa, esquecido depois da parte mais difícil.

### O conceito

A visita é o gol; o registro é a súmula. Gol que não entra na súmula não conta no placar, e ninguém lembra dele na segunda-feira.

### O método SMQ, passo a passo

1. Ainda no local, no Modo Visita, responda "A visita aconteceu?", "Como o cliente saiu?" e "O que trava a decisão?". Escolha a etapa ao concluir, a próxima ação e o follow-up, e clique em "Concluir visita". Sem conexão, a visita fica salva no aparelho e sobe depois.
2. Mande a mensagem de pós-visita no mesmo dia: agradeça, resuma o que ele gostou e confirme o próximo passo com data.
3. Gostou? No mesmo dia, a lista de documentos com os três que mais travam a pasta primeiro (extrato bancário de 6 meses, comprovante de estado civil e CPF) e uma âncora: "qual deles você consegue me mandar até amanhã?". Com as âncoras antigolpe: análise gratuita, documento só pelo canal oficial da SMQ, ninguém pede Pix, taxa ou senha.
4. Ficou em dúvida ou "vai pensar"? Pergunte o que ajudaria a decidir nas próximas 48 horas: a simulação detalhada, a conta aluguel contra parcela, ou conversar com o co-decisor. Registre a data que o cliente deu.
5. No-show: nunca "você não compareceu". Marque "Não, cliente não compareceu" no Modo Visita e ofereça duas opções novas, sem cobrança.
6. Plano B por vídeo: cliente que mora longe ou não consegue ir pode conhecer por chamada de vídeo no decorado, e o próximo passo é o mesmo (análise ou visita presencial com o decisor).

### Na vida real

**O caso:** Atraso e remarcação sem cobrança (caso A, diretor, jan/2026).

**O que foi dito:** O cliente se atrasou e precisou remarcar. A resposta literal foi: "Imagina, eu compreendo sim! Sei que foi uma situação fora do seu controle."

**O que aconteceu:** A visita foi remarcada sem constrangimento e a relação ficou mais forte. O que a doutrina acrescenta: duas opções ao remarcar e o registro no CRM.

### Scripts prontos

#### WhatsApp · Pós-visita no mesmo dia, cliente gostou

> Obrigado pela visita, [nome]! Deu pra ver o quanto vocês gostaram da varanda e do quarto das crianças. Pra gente já rodar a análise, que é gratuita e não compromete nada, te mando a lista aqui. Dos itens, qual você consegue me mandar até amanhã?

**Por que funciona:** Agradece, prova que você prestou atenção, reforça as âncoras e fecha com uma pergunta que puxa o primeiro documento.

#### WhatsApp · Cliente saiu em dúvida

> [nome], foi ótimo te receber hoje. O que ajudaria você a decidir nos próximos dois dias: a simulação detalhada, a conta do aluguel contra a parcela ou uma conversa com a [pessoa que decide junto]?

**Por que funciona:** Troca o "vou pensar" por uma escolha concreta e abre o caminho para o próximo toque com data.

#### WhatsApp · No-show

> Oi, [nome]! Imagino que a correria apertou hoje. Te encaixo no sábado às 10h ou às 14h?

**Por que funciona:** Sem cobrança, sem culpa, com duas opções. O cliente volta sem precisar se justificar.

### Erros que matam a venda

- **Não registrar o resultado no Modo Visita**  
  Quanto custa: O cliente não vai para "Visita realizada", fica sem próximo passo e para no funil  
  Correção: Resultado registrado ainda no local, no mesmo dia
- **Mandar "você não compareceu" ou cobrar o no-show**  
  Quanto custa: Constrangimento e cliente que não volta  
  Correção: Mensagem sem cobrança, com duas opções novas
- **Sair da visita sem próximo passo**  
  Quanto custa: O cliente esfria em casa e o "vou pensar" vira silêncio  
  Correção: Recuperar no mesmo dia com dois caminhos: documento ou nova visita com o decisor

### No CRM

- **Tela:** Modo Visita (Próximo passo); Agenda e Tarefas
- **Ação:** Responder se a visita aconteceu, como o cliente saiu e o que trava, e concluir com etapa, próxima ação e follow-up
- **Campo:** "A visita aconteceu?"; "Como o cliente saiu?"; "O que trava a decisão?"; "Etapa ao concluir"; "Próxima ação"; "Follow-up"
- **Regra:** É o registro no Modo Visita que move o cliente para "Visita realizada". Visita por vídeo ainda não tem tipo próprio no CRM [GAP DE CRM]: registre no agendamento do empreendimento, com a observação "por vídeo".

### Frase-âncora

> **Visita sem registro é gol fora da súmula.**

### Checagem rápida

1. O que move o cliente para "Visita realizada"?  
   Resposta: O resultado registrado no Modo Visita.
2. Quais são os três documentos que você pede primeiro depois de uma visita boa?  
   Resposta: Extrato bancário de 6 meses, comprovante de estado civil e CPF.
3. Como você responde a um no-show?  
   Resposta: Sem cobrança, com duas opções novas de horário.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Das visitas agendadas na casa, só 24,5% aparecem registradas como realizadas, enquanto o comparecimento real é de 79,8% (CRM SMQ, set/2026). O cliente veio. O CRM não sabe.","por_que_importa":"Visita que não é registrada não move o cliente para \"Visita realizada\", não cria o próximo passo e some da Fila. Em 11/09/2026, entre os 210 clientes quentes parados em fase avançada, 27 já tinham visita realizada, e os piores do grupo estavam entre 70 e 79 dias sem movimento (diagnóstico do funil no CRM): dinheiro na mesa, esquecido depois da parte mais difícil.","conceito":"A visita é o gol; o registro é a súmula. Gol que não entra na súmula não conta no placar, e ninguém lembra dele na segunda-feira.","metodo":["Ainda no local, no Modo Visita, responda \"A visita aconteceu?\", \"Como o cliente saiu?\" e \"O que trava a decisão?\". Escolha a etapa ao concluir, a próxima ação e o follow-up, e clique em \"Concluir visita\". Sem conexão, a visita fica salva no aparelho e sobe depois.","Mande a mensagem de pós-visita no mesmo dia: agradeça, resuma o que ele gostou e confirme o próximo passo com data.","Gostou? No mesmo dia, a lista de documentos com os três que mais travam a pasta primeiro (extrato bancário de 6 meses, comprovante de estado civil e CPF) e uma âncora: \"qual deles você consegue me mandar até amanhã?\". Com as âncoras antigolpe: análise gratuita, documento só pelo canal oficial da SMQ, ninguém pede Pix, taxa ou senha.","Ficou em dúvida ou \"vai pensar\"? Pergunte o que ajudaria a decidir nas próximas 48 horas: a simulação detalhada, a conta aluguel contra parcela, ou conversar com o co-decisor. Registre a data que o cliente deu.","No-show: nunca \"você não compareceu\". Marque \"Não, cliente não compareceu\" no Modo Visita e ofereça duas opções novas, sem cobrança.","Plano B por vídeo: cliente que mora longe ou não consegue ir pode conhecer por chamada de vídeo no decorado, e o próximo passo é o mesmo (análise ou visita presencial com o decisor)."],"na_vida_real":{"caso":"Atraso e remarcação sem cobrança (caso A, diretor, jan/2026).","o_que_foi_dito":"O cliente se atrasou e precisou remarcar. A resposta literal foi: \"Imagina, eu compreendo sim! Sei que foi uma situação fora do seu controle.\"","resultado":"A visita foi remarcada sem constrangimento e a relação ficou mais forte. O que a doutrina acrescenta: duas opções ao remarcar e o registro no CRM.","fonte":"Casoteca SMQ, caso A (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Pós-visita no mesmo dia, cliente gostou","texto":"Obrigado pela visita, [nome]! Deu pra ver o quanto vocês gostaram da varanda e do quarto das crianças. Pra gente já rodar a análise, que é gratuita e não compromete nada, te mando a lista aqui. Dos itens, qual você consegue me mandar até amanhã?","por_que_funciona":"Agradece, prova que você prestou atenção, reforça as âncoras e fecha com uma pergunta que puxa o primeiro documento."},{"canal":"WhatsApp","situacao":"Cliente saiu em dúvida","texto":"[nome], foi ótimo te receber hoje. O que ajudaria você a decidir nos próximos dois dias: a simulação detalhada, a conta do aluguel contra a parcela ou uma conversa com a [pessoa que decide junto]?","por_que_funciona":"Troca o \"vou pensar\" por uma escolha concreta e abre o caminho para o próximo toque com data."},{"canal":"WhatsApp","situacao":"No-show","texto":"Oi, [nome]! Imagino que a correria apertou hoje. Te encaixo no sábado às 10h ou às 14h?","por_que_funciona":"Sem cobrança, sem culpa, com duas opções. O cliente volta sem precisar se justificar."}],"erros_que_matam":[{"erro":"Não registrar o resultado no Modo Visita","custo":"O cliente não vai para \"Visita realizada\", fica sem próximo passo e para no funil","correcao":"Resultado registrado ainda no local, no mesmo dia"},{"erro":"Mandar \"você não compareceu\" ou cobrar o no-show","custo":"Constrangimento e cliente que não volta","correcao":"Mensagem sem cobrança, com duas opções novas"},{"erro":"Sair da visita sem próximo passo","custo":"O cliente esfria em casa e o \"vou pensar\" vira silêncio","correcao":"Recuperar no mesmo dia com dois caminhos: documento ou nova visita com o decisor"}],"no_crm":{"tela":"Modo Visita (Próximo passo); Agenda e Tarefas","acao":"Responder se a visita aconteceu, como o cliente saiu e o que trava, e concluir com etapa, próxima ação e follow-up","campo":"\"A visita aconteceu?\"; \"Como o cliente saiu?\"; \"O que trava a decisão?\"; \"Etapa ao concluir\"; \"Próxima ação\"; \"Follow-up\"","regra":"É o registro no Modo Visita que move o cliente para \"Visita realizada\". Visita por vídeo ainda não tem tipo próprio no CRM [GAP DE CRM]: registre no agendamento do empreendimento, com a observação \"por vídeo\"."},"frase_ancora":"Visita sem registro é gol fora da súmula.","checagem_rapida":[{"pergunta":"O que move o cliente para \"Visita realizada\"?","resposta":"O resultado registrado no Modo Visita."},{"pergunta":"Quais são os três documentos que você pede primeiro depois de uma visita boa?","resposta":"Extrato bancário de 6 meses, comprovante de estado civil e CPF."},{"pergunta":"Como você responde a um no-show?","resposta":"Sem cobrança, com duas opções novas de horário."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q01', 1, 'situacional',
  'Durante o tour, o cliente para na sala e fica em silêncio olhando a vista. O que você faz?',
  '["Aproveita para falar do acabamento e da metragem.","Respeita o silêncio e espera ele falar.","Pergunta se ele gostou do apartamento.","Mostra a simulação na mesma hora."]'::jsonb,
  1,
  'A B segue o passo 5: cliente parado e olhando está comprando, e o silêncio é dele. A A preenche o silêncio com característica e quebra o momento. A C é pergunta de sim ou não fora de hora. A D atropela a emoção com número antes de o cliente terminar de se imaginar ali.',
  'M18-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q02', 2, 'situacional',
  'A cliente adorou o apartamento, mas o marido, que decide junto, não veio. Ela diz: "Acho que é esse." Qual é a sua próxima fala?',
  '["\"Então vamos garantir a unidade agora e depois você mostra pra ele.\"","\"Se você gostou, ele vai gostar. Posso mandar o contrato?\"","\"Ótimo! Então me avisa quando ele puder vir.\"","\"Você gostou tanto que imagino que queira trazer ele pra ver também. Fica melhor sábado às 10h ou às 14h?\""]'::jsonb,
  3,
  'A D marca a volta com o decisor, com duas opções. A A e a B tentam fechar sem o decisor, o que a casa proíbe e que costuma desfazer a venda em casa. A C é pergunta aberta: devolve silêncio.',
  'M18-A4; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q03', 3, 'situacional',
  'Na véspera, o cliente responde ao lembrete automático do robô: "Preciso reagendar." O que você faz?',
  '["Assume na hora, oferece duas opções concretas e marca o agendamento como remarcado.","Espera o robô tratar, porque a mensagem foi para ele.","Responde \"sem problema, me avisa quando puder\".","Cancela o agendamento e move o cliente para \"Aguardando retorno\"."]'::jsonb,
  0,
  'A A salva a visita e evita que a confirmação automática confirme uma visita cancelada. A B terceiriza o relacionamento para o robô. A C é pergunta aberta e perde a data. A D desiste do cliente que só pediu outro horário.',
  'M18-A2; caso da visita que ninguém confirmou (seção 9.12)', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q04', 4, 'situacional',
  'O cliente escreve no D-1: "Vou tentar ir amanhã." Qual é a melhor resposta?',
  '["\"Combinado, te espero!\"","\"Se não der, sem problema, a gente vê depois.\"","\"Pra eu te receber com tudo pronto, vale trocar pra um horário em que você tenha certeza? Sábado às 10h ou às 14h?\"","\"Tenta sim, é muito importante você vir.\""]'::jsonb,
  2,
  'A C trata o "vou tentar" como o que ele é, sinal de falta, e troca para um horário com certeza. A A aceita a falta anunciada. A B desiste da data. A D pressiona sem resolver nada.',
  'M18-A2; biblioteca de mensagens (seção 9.14)', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q05', 5, 'situacional',
  'No meio da visita, o celular vibra: chegou um lead novo na sua roleta. O que você faz?',
  '["Pede licença, sai da sala e liga para o lead novo em até 5 minutos.","Pede para o cliente esperar e responde o lead pelo WhatsApp.","Encerra a visita mais cedo para não estourar o prazo.","Segue com o cliente presente; se o primeiro contato não acontecer no prazo, o repasse por SLA resolve."]'::jsonb,
  3,
  'A D é a regra da casa (decisão de 29/09/2026): o cliente presente é a prioridade e o repasse por SLA resolve. A A e a B largam o cliente que já passou por todas as barreiras. A C troca a venda mais próxima pela mais distante.',
  'M18-A2; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q06', 6, 'situacional',
  'Durante o tour, o cliente pergunta: "Quantas unidades ainda têm nesse andar? Minha cama de casal cabe nesse quarto?" O que você faz?',
  '["Continua o tour, porque ainda falta mostrar a varanda e a cozinha.","Para de apresentar e propõe o próximo passo, com duas opções.","Diz que são as últimas unidades para acelerar a decisão.","Pergunta \"e aí, vai fechar?\"."]'::jsonb,
  1,
  'A B aplica a regra: dois sinais de compra, pare e proponha o próximo passo. A A esfria o cliente pronto. A C é urgência falsa se não for verificável na tabela. A D é pergunta de sim ou não que devolve "vou pensar".',
  'M18-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q07', 7, 'situacional',
  'O cliente não apareceu na visita e não avisou. Qual mensagem você manda?',
  '["\"Oi, [nome]! Imagino que a correria apertou hoje. Te encaixo no sábado às 10h ou às 14h?\"","\"Oi, [nome], você não compareceu hoje. Aconteceu alguma coisa?\"","\"Fiquei te esperando uma hora. Quando você pode vir?\"","\"Tudo bem, quando decidir me avisa.\""]'::jsonb,
  0,
  'A A não cobra, não constrange e oferece duas opções. A B usa "você não compareceu", frase proibida. A C cobra e ainda usa pergunta aberta. A D é encerramento passivo.',
  'M18-A5; seção 5', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q08', 8, 'situacional',
  'O cliente PRONTO, em Faixa 3, pediu para ver um apartamento de tabela alta. Na véspera, o que você prepara além da simulação normal?',
  '["Nada: com cliente PRONTO não precisa de mais nada.","Um desconto para garantir o fechamento.","O cenário de laudo 10% e 20% abaixo da tabela, para saber se a entrada fecha.","A lista de todas as unidades do empreendimento."]'::jsonb,
  2,
  'A C é a preparação obrigatória em F3 e F4: a Caixa financia até 80% do menor valor entre preço e laudo, e a entrada pode subir muito. A A ignora a armadilha nº 1. A B está fora da alçada: negociação só dentro da campanha. A D é excesso sem foco: basta a melhor posição para o perfil.',
  'M18-A1; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q09', 9, 'aplicacao',
  'A visita está marcada para sábado às 10h. Em que dia você manda a mensagem de D-2?',
  '["Sexta-feira.","Quinta-feira.","No próprio sábado de manhã.","Segunda-feira da mesma semana."]'::jsonb,
  1,
  'D-2 é dois dias antes: quinta-feira. A A é o D-1 (reforço de horário, endereço e decisor). A C é o D+0 (a caminho). A D não é nenhum dos momentos do protocolo.',
  'M18-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q10', 10, 'aplicacao',
  'Exemplo de treino: apartamento de R$ 300 mil pela tabela. Se o laudo vier 10% abaixo (R$ 270 mil), qual é a entrada necessária, considerando que a Caixa financia até 80% do menor valor entre preço e laudo?',
  '["R$ 60 mil (20% do preço).","R$ 54 mil.","R$ 30 mil.","R$ 84 mil (28% do preço)."]'::jsonb,
  3,
  'Financiamento máximo: 80% de R$ 270 mil = R$ 216 mil. Entrada: R$ 300 mil menos R$ 216 mil = R$ 84 mil, 28% do preço. A A calcula sobre o preço, o erro clássico. A B aplica 20% sobre o laudo, esquecendo que o preço continua R$ 300 mil. A C é só a diferença entre preço e laudo.',
  'M18-A1; seção 9.9 (a armadilha do laudo)', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q11', 11, 'aplicacao',
  'Exemplo de treino: a entrada exigida é de R$ 84 mil, o cliente tem R$ 30 mil e faltam 24 meses até a entrega. A renda da família é de R$ 7.500. Qual é o esforço mensal e como ele se classifica?',
  '["R$ 2.250 por mês, 30% da renda: plano B, não recomendação principal.","R$ 1.250 por mês, apresentável.","R$ 3.500 por mês, não fecha.","R$ 2.250 por mês, apresentável porque cabe na renda."]'::jsonb,
  0,
  'Esforço mensal = (84 mil menos 30 mil) ÷ 24 = R$ 2.250, que é 30% da renda. Até cerca de 22% é apresentável; de 30% a 50% é plano B. A B divide só a entrada disponível. A C usa a entrada inteira. A D acerta a conta e erra a leitura.',
  'M18-A1; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q12', 12, 'aplicacao',
  'Você chega ao estande 20 minutos antes. Quais itens do checklist do Modo Visita já devem estar marcados antes de o cliente chegar?',
  '["Projeto e disponibilidade apresentados, e objeções registradas.","Todos os cinco itens.","Horário confirmado com o cliente, documentos necessários conferidos e simulação e condições revisadas.","Nenhum: o checklist é preenchido só no fim."]'::jsonb,
  2,
  'A C traz os três itens de preparação. A A e a B marcam o que só acontece durante a visita (apresentação e objeções). A D deixa a preparação para depois, quando já não adianta.',
  'M18-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q13', 13, 'aplicacao',
  'A visita terminou, o cliente compareceu e saiu com interesse médio, travado pela entrada. Qual é o registro certo no Modo Visita?',
  '["Só uma nota nas observações dizendo que a visita foi boa.","\"A visita aconteceu?\": Sim; \"Como o cliente saiu?\": Médio; \"O que trava a decisão?\": entrada ou sinal alto demais; próxima ação e follow-up com data; concluir.","Arrastar o card para \"Visita realizada\" no quadro, sem abrir o Modo Visita.","Marcar \"Não, cliente não compareceu\" para retomar depois."]'::jsonb,
  1,
  'A B registra o resultado estruturado, que move o cliente e cria o próximo passo. A A deixa o registro solto, que ninguém consegue somar. A C muda a etapa sem o resultado nem o próximo passo. A D registra algo falso.',
  'M18-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q14', 14, 'aplicacao',
  'O cliente pergunta na visita quanto tempo vai durar. Ele tem 40 minutos de almoço. O que você responde?',
  '["\"Uma hora, pra ver tudo com calma.\"","\"O tempo que você quiser, não tenho pressa.\"","\"Uns 10 minutos, é rapidinho.\"","\"De 20 a 30 minutos: dá pra ver tudo e você volta no horário.\""]'::jsonb,
  3,
  'A D é a duração oficial da visita SMQ e respeita o tempo do cliente. A A estoura o tempo dele. A B tira o foco e costuma estender a visita. A C promete um tempo que não dá para cumprir com os 7 passos.',
  'M18-A3; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q15', 15, 'conceito',
  'Qual é a ordem correta do início da visita SMQ?',
  '["Planta, metragem, preço e área de lazer.","Simulação, tour e área de lazer.","Recepção, ancoragem emocional com a Q3 e área de lazer primeiro.","Área de lazer, preço e decisor."]'::jsonb,
  2,
  'A C segue os passos 1, 2 e 3. A A começa pelo que esfria a visita. A B põe o número antes da emoção. A D pula a recepção e a ancoragem.',
  'M18-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q16', 16, 'conceito',
  'Sobre as limitações do imóvel (vaga, prazo de entrega, regra de uso, laudo), qual é a regra da casa?',
  '["Não abrir a visita por elas, mas nunca omitir o que muda a decisão do cliente.","Abrir a visita pelos defeitos, para ganhar confiança.","Só falar se o cliente perguntar.","Deixar para o correspondente explicar na análise."]'::jsonb,
  0,
  'A A é a regra de transparência da casa. A B começa a visita pelo lado errado. A C e a D deixam o cliente descobrir sozinho, e quem descobre depois se sente enganado.',
  'M18-A3; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q17', 17, 'conceito',
  'O que o robô Vitor faz na confirmação de visita, e qual é o papel do corretor?',
  '["O Vitor substitui o D-2, o D-1 e o D+0 do corretor.","O Vitor manda os lembretes automáticos na véspera às 18h30 e no dia às 08h45; o corretor faz o D-2, o D-1 e o D+0 e não terceiriza o relacionamento.","O Vitor liga para o cliente e o corretor só confirma no CRM.","O Vitor só age quando o corretor pede."]'::jsonb,
  1,
  'A B descreve o protocolo: o robô reforça, o corretor confirma com vínculo. A A terceiriza o relacionamento. A C e a D descrevem algo que o robô não faz.',
  'M18-A2; seção 9.5', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q18', 18, 'conceito',
  'Qual é o comparecimento às visitas da casa e o que ele ensina?',
  '["24,5%: o cliente da SMQ falta muito.","5,4%: a visita é o maior problema da casa.","65%: a casa está exatamente na meta.","79,8%, acima da meta de 65%: o protocolo de confirmação funciona, e o problema é criar o agendamento e registrar a visita."]'::jsonb,
  3,
  'A D traz o número oficial (CRM SMQ, set/2026) e a leitura certa. A A confunde comparecimento com o registro de visita realizada, que é subregistro. A B é a passagem "Em atendimento → Agendado". A C é a meta, não o resultado.',
  'M18-A2; M18-A5; seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q19', 19, 'caca_ao_erro',
  'Encontre o erro nesta mensagem de pós-visita: "Oi, [nome]! Obrigado pela visita. Qualquer dúvida estou à disposição, é só me chamar quando decidir."',
  '["Falta o nome do empreendimento no começo.","Termina sem próximo passo: é encerramento passivo, e a decisão fica com o cliente.","Não deveria agradecer a visita.","Deveria ter sido mandada só no dia seguinte."]'::jsonb,
  1,
  'O erro é o final passivo ("é só me chamar", "quando decidir"), sem data nem próximo passo, o erro mais frequente das conversas auditadas. A A é detalhe menor. A C está errada: agradecer é o começo certo. A D atrasa o pós-visita, que é no mesmo dia.',
  'M18-A5; seção 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M18-Q20', 20, 'caca_ao_erro',
  'Encontre o erro neste convite de D-1: "Amanhã é o dia! Te espero às 10h no estande. O endereço exato eu confirmo e te mando em seguida."',
  '["O horário deveria ter duas opções.","Não deveria mencionar o estande.","Deveria perguntar se o cliente ainda tem interesse.","Promete o endereço para depois: endereço, dia, hora e quem recebe vão na mesma mensagem, e o decisor e os documentos também faltam."]'::jsonb,
  3,
  'A D aponta o erro que já custou visitas (caso K, set/2026): endereço prometido e nunca enviado, além da falta do decisor e dos documentos no D-1. A A confunde confirmação com convite: a visita já tem hora marcada. A B está errada: o local depende do produto e deve ser dito. A C põe em dúvida uma visita confirmada.',
  'M18-A2; caso K (seção 9.12)', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (14)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F01', 1, 'Os 7 passos da visita SMQ', '1) Recepção. 2) Ancoragem com a Q3. 3) Área de lazer primeiro. 4) Tour com característica, vantagem e benefício. 5) Silêncio respeitado. 6) Simulação como história. 7) Q7 de novo e próximo passo.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F02', 2, 'Duração da visita', 'De 20 a 30 minutos, combinados na recepção.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F03', 3, 'Onde é a visita?', 'Depende do produto: estande ou decorado da construtora, ou escritório da SMQ. Confira em Documentação & Projetos.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F04', 4, 'D-2, D-1 e D+0', 'D-2 confirma que está de pé. D-1 reforça horário e endereço, pergunta do decisor e lembra os documentos. D+0 avisa que você está a caminho.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F05', 5, 'O robô Vitor', 'Manda os lembretes automáticos na véspera às 18h30 e no dia às 08h45. Reforça, não substitui: o relacionamento é seu.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F06', 6, '"Preciso reagendar"', 'Duas opções concretas na hora e o agendamento marcado como remarcado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F07', 7, '"Vou tentar ir"', 'É aviso de falta. Troque para um horário com certeza, com duas opções.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F08', 8, 'Regra dos sinais de compra', 'Dois ou mais sinais, ou um sinal forte: pare de apresentar e proponha o próximo passo.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F09', 9, 'Decisor ausente', 'Nunca feche sem ele. "Você gostou tanto que imagino que queira trazer [pessoa] pra ver também. Fica melhor sábado às 10h ou às 14h?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F10', 10, 'Antes de sair em F3 e F4', 'Cenário de laudo 10% e 20% abaixo da tabela. A Caixa financia até 80% do menor valor entre preço e laudo.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F11', 11, 'Transparência na visita', 'Não abra pelos defeitos, mas nunca omita o que muda a decisão: vaga, prazo de entrega, regra de uso, laudo.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F12', 12, 'O que move o cliente para "Visita realizada"', 'O resultado registrado no Modo Visita: aconteceu, como saiu, o que trava, etapa, próxima ação e follow-up.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F13', 13, 'No-show', 'Nunca "você não compareceu". "Imagino que a correria apertou hoje. Te encaixo no sábado às 10h ou às 14h?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M18-F14', 14, 'Lead novo durante a visita', 'Sem regra especial: o cliente presente é a prioridade; o repasse por SLA resolve.', true
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1 quinzenal, escolha uma visita recente do corretor e passe o scorecard dos 7 passos com ele, olhando o resultado registrado no Modo Visita e a linha do tempo do Dossiê. Uma vez por mês, acompanhe uma visita real só observando e dê o retorno depois que o cliente sair. Na reunião de segunda, olhe as visitas da semana sem resultado registrado e as visitas realizadas sem próxima ação.","sinais_de_dificuldade":["Visitas agendadas que passaram da data sem resultado registrado no Modo Visita.","Clientes em \"Visita realizada\" sem próxima ação ou com follow-up vencido.","\"Decisor não estava presente\" aparecendo com frequência em \"O que trava a decisão?\", sinal de que a Q5 e o D-1 não estão sendo feitos."],"perguntas_de_coaching":["Qual era a Q3 desse cliente, e em que momento da visita você usou?","Quais sinais de compra ele deu, e o que você fez logo depois?","Com que próximo passo e data esse cliente saiu da visita?"],"ritual_de_celebracao":"All Hands quinzenal: destaque de quem fechou a semana com 100% das visitas registradas no mesmo dia; no LEGADO, a categoria Disciplina de Processo."}}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M18' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
