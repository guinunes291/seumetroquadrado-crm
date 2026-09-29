-- ===========================================================================
-- ACADEMIA SMQ · LOTE 1 (v1.1) · seed do módulo M15
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-1/academia-smq-lote-1.json.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- 6 aulas · 20 questões · 15 flashcards
-- ===========================================================================

-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  ('M15', 15, 3, 'A ligação "Eu conduzo" e o agendamento', 'Ao final, você conduz a ligação com as 6 perguntas na ordem, fecha um dos 2 caminhos (visita com dia e hora ou análise com documento) oferecendo duas opções e cria o agendamento antes de desligar, e isso aparece no CRM como a sua passagem "Em atendimento → Agendado" subindo no Meu Raio-X e 7 agendamentos criados por semana.',
   '["Eu sou capaz de conduzir as 6 perguntas do método na ordem, sem falar de preço antes de saber a renda.","Eu sou capaz de apresentar o conceito SMQ (valor antes de preço) em 30 segundos.","Eu sou capaz de oferecer a visita com duas opções de horário em toda conversa qualificada.","Eu sou capaz de mudar para a análise com documento quando o cliente não pode visitar, e voltar para a visita quando ele resiste ao documento.","Eu sou capaz de criar o agendamento completo no CRM (data, hora e empreendimento) antes de desligar e de mandar a confirmação."]'::jsonb, 1.5, '90 min', true,
   '**Role-play em trio: "Ofereça visita nas dez"** · 60 min

**Papéis:** Corretor, cliente com o cartão da persona e observador com a rubrica. Cada corretor faz 10 ligações; os papéis se revezam.

**Persona:** P1, P2, P3, P5, P6 e P9, sorteadas a cada rodada

**Roteiro:** O corretor liga, conduz as 6 perguntas na ordem e termina em um dos 2 caminhos, oferecendo visita em todas as dez ligações. O cliente levanta de uma a duas objeções, principalmente de tempo. Depois do role-play, o corretor cria 3 agendamentos reais no mesmo dia, com data, hora e empreendimento (exercício oficial do treinamento do CRM: "role-play primeiro, fila real depois").

**Roteiro do cliente:**

- P1 (casal que cansou do aluguel): "Vi o anúncio, queria saber o valor." Esconde que a esposa decide junto. Pergunta: "A parcela vai ser maior que o meu aluguel?" e diz "preciso ver com a minha esposa".
- P2 (entregador de aplicativo): "É pra autônomo também?" Esconde que trabalhou 2 anos registrado. Diz: "Não gosto de mandar documento."
- P3 (solteira perto do metrô): "Quero perto do metrô, mas não tenho entrada." Esconde que faltam 2 meses para completar 3 anos de FGTS. Diz: "Vou pensar."
- P5 (saturado e desconfiado): "Já me ligaram umas vinte vezes." Pergunta: "Isso é golpe?"
- P6 (PRONTO): "Posso ir aí sábado?" O risco é o corretor enrolar.
- P9 (sumiu no documento): atende e diz "tô sem tempo essa semana".

**O que o observador procura:**

- As 6 perguntas na ordem, sem preço antes da renda.
- O conceito SMQ dito em até 30 segundos, com a fala-âncora.
- O decisor identificado antes de marcar a visita.
- Visita oferecida com duas opções em todas as ligações; análise quando o cliente não pode visitar; volta à visita quando ele resiste ao documento.
- Objeção tratada com validar, investigar, endereçar e agir, sempre com horário.
- Nenhuma promessa de aprovação e nenhuma urgência falsa (critério 6 só com nota 5).
- Agendamento criado e mensagem de confirmação completa ao final.

**Rubrica:** Padrão SMQ completa (7 critérios). Aprovação: média 3,5 ou mais.', '[{"criterio":"Abertura e conexão: personalização, nome, prova de que leu o cadastro","peso":1},{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Objeção: validar, investigar, endereçar, ação","peso":1},{"criterio":"Desfecho: dia e hora ou documento; duas opções; nada de \"vou pensar\" aceito sem horário","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 1 v1.1 importado: revisar no CRM antes de publicar. | [CALIBRAR] Meta individual da passagem "Em atendimento → Agendado" pela conversão de cada corretor no Meu Raio-X. | [DADO A MEDIR NO CRM] Linha de base de agendamentos criados por corretor por semana. | [CONFIRMAR na publicação] Reconferir as faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) antes de liberar a questão M15-Q14. | [CONFIRMAR] Autorização para gravar ligações reais no coaching (consentimento do cliente e do corretor).', '{"formato":"canonico-8.2","lote":1,"versao_conteudo":"1.1","trilha":"T3","ordem":2,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"Ligação boa não termina em \"vou pensar\". Termina com dia, hora e nome no documento.","duracao_min":90,"por_que_vale_dinheiro":{"texto":"A casa perde numa única divisa: só 5,4% dos clientes em atendimento viram agendamento, contra uma meta de 70%. Levar só essa passagem à meta multiplica a conversão da casa por 13. E o protocolo depois do agendamento funciona: 79,8% de quem agenda comparece. O problema não é o cliente faltar. É ninguém convidar.","numero":"5,4% de \"Em atendimento → Agendado\" contra meta de 70% (13 vezes); comparecimento de 79,8%","fonte":"Treinamento do CRM SMQ","periodo":"set/2026"},"pre_requisitos":["M00","M25","M26"],"indicador_crm":{"nome":"Conversão \"Em atendimento → Agendado\" e agendamentos criados por semana","onde_ler":"Meu Raio-X (conversão por etapa) e Agenda e Tarefas (agendamentos criados); para o gerente, Operação › Funil","linha_de_base":"5,4% na casa (set/2026); agendamentos por corretor [DADO A MEDIR NO CRM]","meta_sugerida":"Meta da casa de 70% na passagem; 7 agendamentos criados por semana (placar do CRM); meta individual [CALIBRAR com o Meu Raio-X]","fonte":"Treinamento do CRM SMQ, set/2026","gap_de_crm":false},"pratica":{"tipo":"Role-play em trio: \"Ofereça visita nas dez\"","duracao_min":60,"persona":"P1, P2, P3, P5, P6 e P9, sorteadas a cada rodada","rubrica":"Padrão SMQ completa (7 critérios)","nota_minima":3.5,"papeis":"Corretor, cliente com o cartão da persona e observador com a rubrica. Cada corretor faz 10 ligações; os papéis se revezam.","roteiro":"O corretor liga, conduz as 6 perguntas na ordem e termina em um dos 2 caminhos, oferecendo visita em todas as dez ligações. O cliente levanta de uma a duas objeções, principalmente de tempo. Depois do role-play, o corretor cria 3 agendamentos reais no mesmo dia, com data, hora e empreendimento (exercício oficial do treinamento do CRM: \"role-play primeiro, fila real depois\").","roteiro_cliente":["P1 (casal que cansou do aluguel): \"Vi o anúncio, queria saber o valor.\" Esconde que a esposa decide junto. Pergunta: \"A parcela vai ser maior que o meu aluguel?\" e diz \"preciso ver com a minha esposa\".","P2 (entregador de aplicativo): \"É pra autônomo também?\" Esconde que trabalhou 2 anos registrado. Diz: \"Não gosto de mandar documento.\"","P3 (solteira perto do metrô): \"Quero perto do metrô, mas não tenho entrada.\" Esconde que faltam 2 meses para completar 3 anos de FGTS. Diz: \"Vou pensar.\"","P5 (saturado e desconfiado): \"Já me ligaram umas vinte vezes.\" Pergunta: \"Isso é golpe?\"","P6 (PRONTO): \"Posso ir aí sábado?\" O risco é o corretor enrolar.","P9 (sumiu no documento): atende e diz \"tô sem tempo essa semana\"."],"observador_procura":["As 6 perguntas na ordem, sem preço antes da renda.","O conceito SMQ dito em até 30 segundos, com a fala-âncora.","O decisor identificado antes de marcar a visita.","Visita oferecida com duas opções em todas as ligações; análise quando o cliente não pode visitar; volta à visita quando ele resiste ao documento.","Objeção tratada com validar, investigar, endereçar e agir, sempre com horário.","Nenhuma promessa de aprovação e nenhuma urgência falsa (critério 6 só com nota 5).","Agendamento criado e mensagem de confirmação completa ao final."]},"desafio_campo":{"tarefa":"Semana dos 7 agendamentos: 7 agendamentos criados na semana, com data, hora e empreendimento, e todas as conversas qualificadas terminando em visita ou em análise com documento.","prazo_horas":72,"evidencia_no_crm":"Agendamentos na Agenda com os três campos preenchidos; conversão \"Em atendimento → Agendado\" do corretor no Meu Raio-X; documentos anexados nas pastas dos clientes que foram para análise.","como_o_gestor_confere":"Filtra Agenda e Tarefas pelo corretor e confere se cada agendamento tem data, hora e empreendimento. Compara a conversão \"Em atendimento → Agendado\" da semana com a da semana anterior no Meu Raio-X. Escuta uma ligação (com consentimento) e aplica a rubrica."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":6,"quem_grava":"O diretor, com um corretor fazendo o papel de cliente","cenario":"Escritório da SMQ, com o CRM aberto e uma ligação de role-play","blocos":[{"tempo":"0:00","fala":"Duas ligações. Na primeira, o corretor responde tudo. Na segunda, ele pergunta. Só uma virou visita. Hoje você vai aprender a segunda.","na_tela":"Split screen das duas ligações"},{"tempo":"0:30","fala":"A casa perde num ponto só: 5,4% dos clientes em atendimento viram agendamento. A meta é 70. Isso multiplica a conversão por 13.","na_tela":"Funil com a divisa destacada"},{"tempo":"1:00","fala":"São seis perguntas, nessa ordem: primeiro imóvel, simulação, parcela, o nosso conceito, quem decide junto, e o fechamento.","na_tela":"As 6 perguntas"},{"tempo":"2:00","fala":"Olha a ligação ao vivo.","na_tela":"Role-play com o corretor como cliente P1"},{"tempo":"4:00","fala":"Percebeu? Eu não perguntei \"quer visitar?\". Eu ofereci sábado às 10h ou às 14h. Se ele não pudesse, eu ia para a análise gratuita.","na_tela":"A frase que resolve"},{"tempo":"4:40","fala":"O erro que mais custa: o cliente diz sim e o corretor só muda o status. Cria o agendamento e manda a confirmação completa, com endereço e documentos.","na_tela":"Criar agendamento no CRM"},{"tempo":"5:20","fala":"Desafio da semana: 7 agendamentos criados. Ligação boa não termina em \"vou pensar\". Termina com dia, hora e nome no documento.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 9.1, 9.2, 9.4, 9.5, 9.7, 9.9, 9.12 e 9.14 do super prompt","Método oficial de ligação \"Não sou conduzido. Eu conduzo.\" (set/2026)","Treinamento do CRM SMQ, módulos 6 e 8 (set/2026)"],"origem":"SMQ","pendencias":["[CALIBRAR] Meta individual da passagem \"Em atendimento → Agendado\" pela conversão de cada corretor no Meu Raio-X.","[DADO A MEDIR NO CRM] Linha de base de agendamentos criados por corretor por semana.","[CONFIRMAR na publicação] Reconferir as faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) antes de liberar a questão M15-Q14.","[CONFIRMAR] Autorização para gravar ligações reais no coaching (consentimento do cliente e do corretor)."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M15-A1', 'M15-A2', 'M15-A3', 'M15-A4', 'M15-A5', 'M15-A6'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 6;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M15-Q01', 'M15-Q02', 'M15-Q03', 'M15-Q04', 'M15-Q05', 'M15-Q06', 'M15-Q07', 'M15-Q08', 'M15-Q09', 'M15-Q10', 'M15-Q11', 'M15-Q12', 'M15-Q13', 'M15-Q14', 'M15-Q15', 'M15-Q16', 'M15-Q17', 'M15-Q18', 'M15-Q19', 'M15-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M15-F01', 'M15-F02', 'M15-F03', 'M15-F04', 'M15-F05', 'M15-F06', 'M15-F07', 'M15-F08', 'M15-F09', 'M15-F10', 'M15-F11', 'M15-F12', 'M15-F13', 'M15-F14', 'M15-F15');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 15;

-- 3. Aulas (6)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M15-A1', 1, 'Quem pergunta conduz', 'texto',
  'Duas ligações para o mesmo cliente. Na primeira, o corretor responde tudo o que o cliente pergunta e termina com "qualquer coisa me chama". Na segunda, o corretor pergunta, escuta e termina com "sábado às 10h ou às 14h?". Adivinha qual virou visita.

### Por que importa

Quem só responde, obedece: o cliente decide o rumo e a conversa termina em "vou pensar". Quem pergunta, conduz: a conversa termina num próximo passo. Essa diferença é a passagem de 5,4% que a casa precisa levar a 70%.

### O conceito

Pense num GPS. Quem sabe o destino traça a rota; o passageiro escolhe entre dois caminhos, mas não precisa inventar o trajeto. Na ligação, o destino é a visita ou a análise, e o corretor é o GPS.

### O método SMQ, passo a passo

1. O princípio: "Não sou conduzido. Eu conduzo." Quem pergunta conduz; quem só responde obedece.
2. As 6 perguntas têm ordem fixa, e ordem trocada é venda perdida (aulas A2 a A4).
3. A ligação só termina com seis coisas: jornada, simulação, parcela, conexão, decisor e agenda (data, hora, quem vai, quais documentos e por qual canal enviar).
4. Os 4 erros que matam a ligação: falar de preço antes de saber a renda; aceitar "vou pensar" sem oferecer horário; apresentar unidade sem saber quem decide; encerrar sem data, hora e documento.
5. Toda fala sua termina numa pergunta ou num próximo passo.

### Na vida real

**O caso:** A queda das visitas no atendimento do robô (jul a ago/2026).

**O que foi dito:** Durante quatro semanas, a oferta de visita nas conversas caiu de 28,0% para 2,8%.

**O que aconteceu:** As visitas marcadas caíram junto, de 20,8% para 2,4%. Visita acompanha a oferta quase uma por uma: não foi o cliente que recusou, foi a conversa que parou de convidar.

### Scripts prontos

#### Ligação · Pedir licença para conduzir, logo depois da abertura

> Pra eu te ajudar do jeito certo e não te mostrar nada que não cabe no seu bolso, posso te fazer umas perguntas rápidas? Leva uns cinco minutinhos.

**Por que funciona:** O cliente autoriza a condução, entende o benefício das perguntas e relaxa: a conversa não vai virar interrogatório nem empurrão.

### Erros que matam a venda

- **Responder tudo o que o cliente pergunta e não perguntar nada**  
  Quanto custa: O cliente conduz e a ligação termina em "vou pensar"  
  Correção: Responder curto e devolver com uma pergunta
- **Terminar com "qualquer coisa me chama"**  
  Quanto custa: A iniciativa fica com o cliente, e ele não chama  
  Correção: Terminar com dia e hora, ou com o documento combinado
- **Apresentar unidade sem saber quem decide**  
  Quanto custa: Visita sem decisor e venda adiada  
  Correção: Pergunta 5 antes de qualquer apresentação

### No CRM

- **Tela:** Card do cliente
- **Ação:** Ligar pelo botão L e registrar o desfecho ao desligar
- **Campo:** Desfecho, próximo passo e data
- **Regra:** Nenhuma ligação termina sem uma das três portas de saída

### Frase-âncora

> **Não sou conduzido. Eu conduzo.**

### Checagem rápida

1. Quais são as seis coisas com que a ligação precisa terminar?  
   Resposta: Jornada, simulação, parcela, conexão, decisor e agenda.
2. Qual é o primeiro dos 4 erros que matam a ligação?  
   Resposta: Falar de preço antes de saber a renda.',
  8, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Duas ligações para o mesmo cliente. Na primeira, o corretor responde tudo o que o cliente pergunta e termina com \"qualquer coisa me chama\". Na segunda, o corretor pergunta, escuta e termina com \"sábado às 10h ou às 14h?\". Adivinha qual virou visita.","por_que_importa":"Quem só responde, obedece: o cliente decide o rumo e a conversa termina em \"vou pensar\". Quem pergunta, conduz: a conversa termina num próximo passo. Essa diferença é a passagem de 5,4% que a casa precisa levar a 70%.","conceito":"Pense num GPS. Quem sabe o destino traça a rota; o passageiro escolhe entre dois caminhos, mas não precisa inventar o trajeto. Na ligação, o destino é a visita ou a análise, e o corretor é o GPS.","metodo":["O princípio: \"Não sou conduzido. Eu conduzo.\" Quem pergunta conduz; quem só responde obedece.","As 6 perguntas têm ordem fixa, e ordem trocada é venda perdida (aulas A2 a A4).","A ligação só termina com seis coisas: jornada, simulação, parcela, conexão, decisor e agenda (data, hora, quem vai, quais documentos e por qual canal enviar).","Os 4 erros que matam a ligação: falar de preço antes de saber a renda; aceitar \"vou pensar\" sem oferecer horário; apresentar unidade sem saber quem decide; encerrar sem data, hora e documento.","Toda fala sua termina numa pergunta ou num próximo passo."],"na_vida_real":{"caso":"A queda das visitas no atendimento do robô (jul a ago/2026).","o_que_foi_dito":"Durante quatro semanas, a oferta de visita nas conversas caiu de 28,0% para 2,8%.","resultado":"As visitas marcadas caíram junto, de 20,8% para 2,4%. Visita acompanha a oferta quase uma por uma: não foi o cliente que recusou, foi a conversa que parou de convidar.","fonte":"Aprendizados medidos dos agentes (seção 9.1)"},"scripts":[{"canal":"Ligação","situacao":"Pedir licença para conduzir, logo depois da abertura","texto":"Pra eu te ajudar do jeito certo e não te mostrar nada que não cabe no seu bolso, posso te fazer umas perguntas rápidas? Leva uns cinco minutinhos.","por_que_funciona":"O cliente autoriza a condução, entende o benefício das perguntas e relaxa: a conversa não vai virar interrogatório nem empurrão."}],"erros_que_matam":[{"erro":"Responder tudo o que o cliente pergunta e não perguntar nada","custo":"O cliente conduz e a ligação termina em \"vou pensar\"","correcao":"Responder curto e devolver com uma pergunta"},{"erro":"Terminar com \"qualquer coisa me chama\"","custo":"A iniciativa fica com o cliente, e ele não chama","correcao":"Terminar com dia e hora, ou com o documento combinado"},{"erro":"Apresentar unidade sem saber quem decide","custo":"Visita sem decisor e venda adiada","correcao":"Pergunta 5 antes de qualquer apresentação"}],"no_crm":{"tela":"Card do cliente","acao":"Ligar pelo botão L e registrar o desfecho ao desligar","campo":"Desfecho, próximo passo e data","regra":"Nenhuma ligação termina sem uma das três portas de saída"},"frase_ancora":"Não sou conduzido. Eu conduzo.","checagem_rapida":[{"pergunta":"Quais são as seis coisas com que a ligação precisa terminar?","resposta":"Jornada, simulação, parcela, conexão, decisor e agenda."},{"pergunta":"Qual é o primeiro dos 4 erros que matam a ligação?","resposta":"Falar de preço antes de saber a renda."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M15-A2', 2, 'Jornada, simulação e parcela: as 3 primeiras perguntas', 'texto',
  'Falar de preço antes de saber a renda é entregar o volante para o cliente. Ele passa a comparar número com os vinte corretores que ligaram antes, e você vira mais um.

### Por que importa

Sem a renda, você apresenta o produto errado. E sem a faixa do MCMV definida, a simulação sai errada e a pasta é reprovada na Caixa. As três primeiras perguntas enquadram o cliente antes de qualquer oferta.

### O conceito

Funciona como uma consulta médica: antes de receitar, o médico examina. Ninguém se ofende quando o médico pergunta os sintomas, porque entende que é para receitar o remédio certo.

### O método SMQ, passo a passo

1. Pergunta 1, a jornada: "Vai ser o seu primeiro imóvel?" Escute: mora de aluguel ou com a família, tem imóvel no nome (o que muda a elegibilidade), há quanto tempo procura e qual é o sonho.
2. Pergunta 2, a simulação: "Você já fez alguma simulação de financiamento?" Escute: já foi aprovado ou negado em outro lugar, tem análise aberta em outra construtora, sabe quanto aprova.
3. Pergunta 3, a parcela: "Pensando no seu mês, qual parcela ficaria confortável pra você?" Em seguida, a renda com a âncora do médico, e depois tipo de renda (carteira, autônomo, aplicativo ou misto), FGTS e tempo de registro e o valor que tem para a entrada.
4. Uma pergunta por vez, com uma validação curta entre elas ("Show!", "Perfeito, isso ajuda muito").
5. Enquadre de cabeça, sem prometer: renda → faixa do MCMV → subsídio (só na Faixa 1 e no início da Faixa 2) → FGTS → entrada → parcela. A simulação oficial vem depois, sempre como estimativa.

### Na vida real

**O caso:** Uma venda de lançamento feita pelo diretor (jan/2026).

**O que foi dito:** A qualificação veio em três toques espaçados, na ordem maturidade da busca, região e dinheiro: "Você já está buscando há algum tempo ou é mais recente?" · "Você já conhece ali a região?" · "Qual seria a renda conjunta de vocês? E até quanto estavam pretendendo investir?"

**O que aconteceu:** O cliente falou de renda sem sentir interrogatório, porque a pergunta veio como planejamento, e a venda fechou no lançamento.

### Scripts prontos

#### Ligação · Pergunta de renda com a âncora do médico

> Funciona como consulta médica: antes de receitar, o médico examina. Pra eu te mostrar só o que cabe no seu bolso e não te fazer perder tempo, me diz: somando quem vai comprar junto, vocês ganham mais ou menos quanto por mês?

**Por que funciona:** Justifica a pergunta sensível com o benefício do cliente e usa linguagem de gente ("quanto vocês ganham juntos"), não de banco ("renda bruta").

#### Ligação · Tipo de renda e FGTS, logo depois da renda

> E essa renda vem de carteira assinada, de trabalho por conta, de aplicativo ou é um pouco de cada? Você tem FGTS? Há quanto tempo trabalha registrado, somando todos os empregos?

**Por que funciona:** Tipo de renda muda a documentação, e o FGTS só entra na entrada com 3 anos de registro somados. A data em que o cliente completa 3 anos pode virar o seu próximo passo.

### Erros que matam a venda

- **Falar o preço logo no início**  
  Quanto custa: A conversa vira comparação de número e você perde a condução  
  Correção: Preço só depois da renda e da faixa
- **Fazer várias perguntas de uma vez**  
  Quanto custa: Parece interrogatório e o cliente responde só a última  
  Correção: Uma pergunta por vez, com validação entre elas
- **Esquecer o tipo de renda**  
  Quanto custa: A documentação sai errada e a pasta trava  
  Correção: Carteira, conta própria, aplicativo ou misto, sempre

### No CRM

- **Tela:** Ficha do cliente (qualificação)
- **Ação:** Preencher os campos durante ou logo depois da ligação
- **Campo:** Os 5 obrigatórios: renda familiar; tipo de renda; FGTS e tempo de registro; valor de entrada; quem decide junto
- **Regra:** Qualificação é ficha preenchida, não conversa boa

### Frase-âncora

> **Qualificação é ficha preenchida, não conversa boa.**

### Checagem rápida

1. Qual é a pergunta 3 do método?  
   Resposta: "Qual a parcela ideal para você pagar?", seguida da renda.
2. Com quanto tempo de registro o FGTS pode entrar na entrada?  
   Resposta: Com 3 anos de trabalho sob o regime do FGTS, somando todos os vínculos.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Falar de preço antes de saber a renda é entregar o volante para o cliente. Ele passa a comparar número com os vinte corretores que ligaram antes, e você vira mais um.","por_que_importa":"Sem a renda, você apresenta o produto errado. E sem a faixa do MCMV definida, a simulação sai errada e a pasta é reprovada na Caixa. As três primeiras perguntas enquadram o cliente antes de qualquer oferta.","conceito":"Funciona como uma consulta médica: antes de receitar, o médico examina. Ninguém se ofende quando o médico pergunta os sintomas, porque entende que é para receitar o remédio certo.","metodo":["Pergunta 1, a jornada: \"Vai ser o seu primeiro imóvel?\" Escute: mora de aluguel ou com a família, tem imóvel no nome (o que muda a elegibilidade), há quanto tempo procura e qual é o sonho.","Pergunta 2, a simulação: \"Você já fez alguma simulação de financiamento?\" Escute: já foi aprovado ou negado em outro lugar, tem análise aberta em outra construtora, sabe quanto aprova.","Pergunta 3, a parcela: \"Pensando no seu mês, qual parcela ficaria confortável pra você?\" Em seguida, a renda com a âncora do médico, e depois tipo de renda (carteira, autônomo, aplicativo ou misto), FGTS e tempo de registro e o valor que tem para a entrada.","Uma pergunta por vez, com uma validação curta entre elas (\"Show!\", \"Perfeito, isso ajuda muito\").","Enquadre de cabeça, sem prometer: renda → faixa do MCMV → subsídio (só na Faixa 1 e no início da Faixa 2) → FGTS → entrada → parcela. A simulação oficial vem depois, sempre como estimativa."],"na_vida_real":{"caso":"Uma venda de lançamento feita pelo diretor (jan/2026).","o_que_foi_dito":"A qualificação veio em três toques espaçados, na ordem maturidade da busca, região e dinheiro: \"Você já está buscando há algum tempo ou é mais recente?\" · \"Você já conhece ali a região?\" · \"Qual seria a renda conjunta de vocês? E até quanto estavam pretendendo investir?\"","resultado":"O cliente falou de renda sem sentir interrogatório, porque a pergunta veio como planejamento, e a venda fechou no lançamento.","fonte":"Casoteca SMQ, caso A (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Pergunta de renda com a âncora do médico","texto":"Funciona como consulta médica: antes de receitar, o médico examina. Pra eu te mostrar só o que cabe no seu bolso e não te fazer perder tempo, me diz: somando quem vai comprar junto, vocês ganham mais ou menos quanto por mês?","por_que_funciona":"Justifica a pergunta sensível com o benefício do cliente e usa linguagem de gente (\"quanto vocês ganham juntos\"), não de banco (\"renda bruta\")."},{"canal":"Ligação","situacao":"Tipo de renda e FGTS, logo depois da renda","texto":"E essa renda vem de carteira assinada, de trabalho por conta, de aplicativo ou é um pouco de cada? Você tem FGTS? Há quanto tempo trabalha registrado, somando todos os empregos?","por_que_funciona":"Tipo de renda muda a documentação, e o FGTS só entra na entrada com 3 anos de registro somados. A data em que o cliente completa 3 anos pode virar o seu próximo passo."}],"erros_que_matam":[{"erro":"Falar o preço logo no início","custo":"A conversa vira comparação de número e você perde a condução","correcao":"Preço só depois da renda e da faixa"},{"erro":"Fazer várias perguntas de uma vez","custo":"Parece interrogatório e o cliente responde só a última","correcao":"Uma pergunta por vez, com validação entre elas"},{"erro":"Esquecer o tipo de renda","custo":"A documentação sai errada e a pasta trava","correcao":"Carteira, conta própria, aplicativo ou misto, sempre"}],"no_crm":{"tela":"Ficha do cliente (qualificação)","acao":"Preencher os campos durante ou logo depois da ligação","campo":"Os 5 obrigatórios: renda familiar; tipo de renda; FGTS e tempo de registro; valor de entrada; quem decide junto","regra":"Qualificação é ficha preenchida, não conversa boa"},"frase_ancora":"Qualificação é ficha preenchida, não conversa boa.","checagem_rapida":[{"pergunta":"Qual é a pergunta 3 do método?","resposta":"\"Qual a parcela ideal para você pagar?\", seguida da renda."},{"pergunta":"Com quanto tempo de registro o FGTS pode entrar na entrada?","resposta":"Com 3 anos de trabalho sob o regime do FGTS, somando todos os vínculos."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M15-A3', 3, 'Conceito SMQ e decisor: as perguntas 4 e 5', 'texto',
  'O cliente já recebeu vinte ligações. A vigésima primeira só é diferente se ele entender por que comprar com você.

### Por que importa

Sem valor, só sobra o preço, e preço qualquer um fala. Sem o decisor, a visita vira passeio e a venda fica para depois. As perguntas 4 e 5 transformam curiosidade em compromisso.

### O conceito

Um bom guia de viagem não vende passagem: garante que a viagem dá certo. O conceito SMQ é isso. E o decisor é o outro passageiro: ninguém fecha a viagem sem ele.

### O método SMQ, passo a passo

1. Pergunta 4, o conceito SMQ: em 30 segundos, os 4 pilares (assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave) e a fala-âncora.
2. Mostre a prova concreta do valor: a análise de crédito é gratuita e acontece antes de qualquer compromisso; a SMQ compara várias construtoras.
3. Pergunta 5, o decisor: "Você vai comprar com mais alguém?" Escute quem decide, quem soma renda e quem precisa ir à visita.
4. Na Faixa 4, cuidado com a composição de renda: se a renda somada passar de R$ 13 mil, o cliente sai do MCMV e vai para o SBPE, com juros de mercado. Calcule a folga antes de sugerir.
5. Decisor identificado, a visita é com ele. Não existe "fechar primeiro e trazer o cônjuge depois".

### Na vida real

**O caso:** Uma conversa real em que o cliente perguntou "Vc é de alguma construtora???" (jul/2026).

**O que foi dito:** A resposta foi: "A Seu Metro Quadrado é uma imobiliária independente, a gente trabalha com empreendimentos de várias construtoras ao mesmo tempo, então consegue comparar opções e te mostrar o que melhor encaixa no seu perfil."

**O que aconteceu:** O cliente não abandonou: continuou a qualificação e chegou a QUENTE. A curadoria, dita com clareza, virou motivo para conversar.

### Scripts prontos

#### Ligação · Pergunta 4: o conceito SMQ em 30 segundos

> Deixa eu te contar como a gente trabalha. A SMQ é uma imobiliária independente: a gente compara várias construtoras, faz a sua análise de crédito de graça, confere a parte jurídica e te acompanha até a chave. Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar.

**Por que funciona:** Mostra valor antes de preço, com os 4 pilares e a fala-âncora, sem prometer nada.

#### Ligação · Pergunta 5: o decisor

> Essa conquista vai ser só sua ou tem mais alguém nessa com você? ... Perfeito. Então o ideal é a gente conversar com vocês dois juntos, pra ninguém ficar com dúvida depois.

**Por que funciona:** Descobre o decisor sem constranger e já prepara a visita com os dois.

### Erros que matam a venda

- **Pular o conceito e ir direto ao preço**  
  Quanto custa: O cliente compara só número  
  Correção: Valor antes de preço, em 30 segundos
- **Marcar visita sem o decisor**  
  Quanto custa: A visita vira passeio e a venda fica para depois  
  Correção: Visita com quem decide
- **Sugerir compor renda na Faixa 4 sem fazer a conta**  
  Quanto custa: O cliente sai do programa e a parcela sobe  
  Correção: Calcular a folga até R$ 13 mil antes

### No CRM

- **Tela:** Ficha do cliente
- **Ação:** Registrar o decisor e se há composição de renda
- **Campo:** Quem decide junto
- **Regra:** O decisor é um dos 5 campos obrigatórios da qualificação

### Frase-âncora

> **Valor antes de preço. Decisor antes da visita.**

### Checagem rápida

1. Quais são os 4 pilares que você cita na pergunta 4?  
   Resposta: Assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave.
2. Por que calcular a folga antes de sugerir composição na Faixa 4?  
   Resposta: Porque acima de R$ 13 mil de renda o cliente sai do MCMV.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente já recebeu vinte ligações. A vigésima primeira só é diferente se ele entender por que comprar com você.","por_que_importa":"Sem valor, só sobra o preço, e preço qualquer um fala. Sem o decisor, a visita vira passeio e a venda fica para depois. As perguntas 4 e 5 transformam curiosidade em compromisso.","conceito":"Um bom guia de viagem não vende passagem: garante que a viagem dá certo. O conceito SMQ é isso. E o decisor é o outro passageiro: ninguém fecha a viagem sem ele.","metodo":["Pergunta 4, o conceito SMQ: em 30 segundos, os 4 pilares (assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave) e a fala-âncora.","Mostre a prova concreta do valor: a análise de crédito é gratuita e acontece antes de qualquer compromisso; a SMQ compara várias construtoras.","Pergunta 5, o decisor: \"Você vai comprar com mais alguém?\" Escute quem decide, quem soma renda e quem precisa ir à visita.","Na Faixa 4, cuidado com a composição de renda: se a renda somada passar de R$ 13 mil, o cliente sai do MCMV e vai para o SBPE, com juros de mercado. Calcule a folga antes de sugerir.","Decisor identificado, a visita é com ele. Não existe \"fechar primeiro e trazer o cônjuge depois\"."],"na_vida_real":{"caso":"Uma conversa real em que o cliente perguntou \"Vc é de alguma construtora???\" (jul/2026).","o_que_foi_dito":"A resposta foi: \"A Seu Metro Quadrado é uma imobiliária independente, a gente trabalha com empreendimentos de várias construtoras ao mesmo tempo, então consegue comparar opções e te mostrar o que melhor encaixa no seu perfil.\"","resultado":"O cliente não abandonou: continuou a qualificação e chegou a QUENTE. A curadoria, dita com clareza, virou motivo para conversar.","fonte":"Biblioteca de mensagens auditadas (seção 9.14)"},"scripts":[{"canal":"Ligação","situacao":"Pergunta 4: o conceito SMQ em 30 segundos","texto":"Deixa eu te contar como a gente trabalha. A SMQ é uma imobiliária independente: a gente compara várias construtoras, faz a sua análise de crédito de graça, confere a parte jurídica e te acompanha até a chave. Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar.","por_que_funciona":"Mostra valor antes de preço, com os 4 pilares e a fala-âncora, sem prometer nada."},{"canal":"Ligação","situacao":"Pergunta 5: o decisor","texto":"Essa conquista vai ser só sua ou tem mais alguém nessa com você? ... Perfeito. Então o ideal é a gente conversar com vocês dois juntos, pra ninguém ficar com dúvida depois.","por_que_funciona":"Descobre o decisor sem constranger e já prepara a visita com os dois."}],"erros_que_matam":[{"erro":"Pular o conceito e ir direto ao preço","custo":"O cliente compara só número","correcao":"Valor antes de preço, em 30 segundos"},{"erro":"Marcar visita sem o decisor","custo":"A visita vira passeio e a venda fica para depois","correcao":"Visita com quem decide"},{"erro":"Sugerir compor renda na Faixa 4 sem fazer a conta","custo":"O cliente sai do programa e a parcela sobe","correcao":"Calcular a folga até R$ 13 mil antes"}],"no_crm":{"tela":"Ficha do cliente","acao":"Registrar o decisor e se há composição de renda","campo":"Quem decide junto","regra":"O decisor é um dos 5 campos obrigatórios da qualificação"},"frase_ancora":"Valor antes de preço. Decisor antes da visita.","checagem_rapida":[{"pergunta":"Quais são os 4 pilares que você cita na pergunta 4?","resposta":"Assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave."},{"pergunta":"Por que calcular a folga antes de sugerir composição na Faixa 4?","resposta":"Porque acima de R$ 13 mil de renda o cliente sai do MCMV."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M15-A4', 4, 'O fechamento da ligação: os 2 caminhos', 'texto',
  '"Quer visitar?" devolve "vou ver". "Sábado de manhã ou sábado à tarde?" devolve um dia.

### Por que importa

É aqui que a casa perde: só 5,4% dos clientes em atendimento viram agendamento. E o documento também move o funil: o cliente que chega ao corretor com documento avança 15,8%; sem documento, 2,6%. Toda conversa qualificada termina num dos dois caminhos.

### O conceito

É o garçom que pergunta "vai querer sobremesa?" contra o que pergunta "pudim ou sorvete?". O segundo vende mais sobremesa, e ninguém se sente pressionado.

### O método SMQ, passo a passo

1. Ofereça a visita com duas opções: "Separei duas opções que cabem na sua renda. Você prefere conhecer sábado de manhã ou sábado à tarde?"
2. O cliente pediu a visita? Feche a visita primeiro. Depois ofereça a análise com leveza, para ele chegar à visita já sabendo quanto aprova.
3. Não pode ou não quer visitar agora (trabalho, distância, "quero saber se aprovo antes")? Ofereça a análise gratuita, no ângulo de benefício e baixo compromisso.
4. Régua de insistência no documento: uma oferta e, no máximo, um reforço leve. Sinal claro de resistência, mude de objetivo na hora e volte para a visita.
5. Documento recebido vai para a pasta do cliente no CRM. O seu gerente revisa a documentação e orienta; só depois você envia ao correspondente do empreendimento (decisão do diretor, 29/09/2026).
6. Sinais de resistência: "não gosto de mandar documento", "prefiro não passar isso", "só depois de ver o apartamento", mudança de assunto, pedido ignorado, segunda recusa.
7. Recusou os dois? Registre o desfecho com o próximo passo e a data que o cliente aceitar. Nunca "perdido" por isso.

### Na vida real

**O caso:** Mensagens de fechamento que funcionaram em conversas auditadas (jul a set/2026).

**O que foi dito:** Para um cliente sem tempo: "Posso deixar nosso consultor esperando você às 14h, às 16h ou às 18h, ele já vai com todos os números na mão." Para um cliente que negou mandar documento: "Tranquilo, sem problema nenhum! Que tal você conhecer o empreendimento pessoalmente? O estande está aberto. Você prefere às 10h ou às 14h?"

**O que aconteceu:** No primeiro caso, o cliente escolheu 14h na hora. No segundo, o funil avançou sem pressão, pela visita.

### Scripts prontos

#### Ligação · A frase que resolve

> Separei duas opções que cabem na sua renda. Você prefere conhecer sábado de manhã, às 10h, ou sábado à tarde, às 14h?

**Por que funciona:** Tira do cliente o trabalho de escolher do zero e troca o "se" pelo "quando".

#### Ligação · O cliente não pode visitar agora

> Sem problema. Enquanto a gente não consegue marcar a visita, que tal descobrir quanto você aprova? É gratuito, não te compromete com nada e você já vai ver os apartamentos sabendo o que cabe. Te mando a lista agora, um item por vez?

**Por que funciona:** Benefício claro, baixo compromisso (gratuito e sem compromisso) e um próximo passo fácil. Ao mandar a lista, acrescente que ninguém da SMQ pede Pix, taxa ou senha.

#### Ligação · O cliente resistiu ao documento

> Super entendo, documento é coisa séria. Então vamos fazer diferente: você conhece o apartamento primeiro. Sábado às 10h ou domingo às 14h, qual fica melhor?

**Por que funciona:** Valida sem julgar e troca de caminho na hora, sem insistir.

### Erros que matam a venda

- **Perguntar "quando você pode?" ou "quer visitar?"**  
  Quanto custa: Pergunta aberta devolve "vou pensar"  
  Correção: Duas opções de horário
- **Insistir no documento depois de sinal de resistência**  
  Quanto custa: O cliente trava no momento de calor; exigências a mais no fim da conversa já derrubaram o avanço do robô pela metade  
  Correção: Uma oferta, um reforço leve e mudança para a visita
- **Oferecer visita sem horário concreto**  
  Quanto custa: O "vamos marcar" nunca vira agenda  
  Correção: Dia e hora na mesma frase

### No CRM

- **Tela:** Card do cliente
- **Ação:** Criar o agendamento ou anexar o documento na pasta
- **Campo:** Agendamento com data, hora e empreendimento; documentos na ficha
- **Regra:** Mudar o status não é agendar

### Frase-âncora

> **Pergunta aberta devolve "vou pensar". Duas opções devolvem um dia.**

### Checagem rápida

1. Quais são os 2 caminhos de uma conversa qualificada?  
   Resposta: Visita marcada com dia e hora ou análise de crédito com documento.
2. O cliente resistiu ao documento. O que fazer?  
   Resposta: Validar sem julgar e voltar para a visita, com duas opções.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Quer visitar?\" devolve \"vou ver\". \"Sábado de manhã ou sábado à tarde?\" devolve um dia.","por_que_importa":"É aqui que a casa perde: só 5,4% dos clientes em atendimento viram agendamento. E o documento também move o funil: o cliente que chega ao corretor com documento avança 15,8%; sem documento, 2,6%. Toda conversa qualificada termina num dos dois caminhos.","conceito":"É o garçom que pergunta \"vai querer sobremesa?\" contra o que pergunta \"pudim ou sorvete?\". O segundo vende mais sobremesa, e ninguém se sente pressionado.","metodo":["Ofereça a visita com duas opções: \"Separei duas opções que cabem na sua renda. Você prefere conhecer sábado de manhã ou sábado à tarde?\"","O cliente pediu a visita? Feche a visita primeiro. Depois ofereça a análise com leveza, para ele chegar à visita já sabendo quanto aprova.","Não pode ou não quer visitar agora (trabalho, distância, \"quero saber se aprovo antes\")? Ofereça a análise gratuita, no ângulo de benefício e baixo compromisso.","Régua de insistência no documento: uma oferta e, no máximo, um reforço leve. Sinal claro de resistência, mude de objetivo na hora e volte para a visita.","Documento recebido vai para a pasta do cliente no CRM. O seu gerente revisa a documentação e orienta; só depois você envia ao correspondente do empreendimento (decisão do diretor, 29/09/2026).","Sinais de resistência: \"não gosto de mandar documento\", \"prefiro não passar isso\", \"só depois de ver o apartamento\", mudança de assunto, pedido ignorado, segunda recusa.","Recusou os dois? Registre o desfecho com o próximo passo e a data que o cliente aceitar. Nunca \"perdido\" por isso."],"na_vida_real":{"caso":"Mensagens de fechamento que funcionaram em conversas auditadas (jul a set/2026).","o_que_foi_dito":"Para um cliente sem tempo: \"Posso deixar nosso consultor esperando você às 14h, às 16h ou às 18h, ele já vai com todos os números na mão.\" Para um cliente que negou mandar documento: \"Tranquilo, sem problema nenhum! Que tal você conhecer o empreendimento pessoalmente? O estande está aberto. Você prefere às 10h ou às 14h?\"","resultado":"No primeiro caso, o cliente escolheu 14h na hora. No segundo, o funil avançou sem pressão, pela visita.","fonte":"Biblioteca de mensagens auditadas (seção 9.14)"},"scripts":[{"canal":"Ligação","situacao":"A frase que resolve","texto":"Separei duas opções que cabem na sua renda. Você prefere conhecer sábado de manhã, às 10h, ou sábado à tarde, às 14h?","por_que_funciona":"Tira do cliente o trabalho de escolher do zero e troca o \"se\" pelo \"quando\"."},{"canal":"Ligação","situacao":"O cliente não pode visitar agora","texto":"Sem problema. Enquanto a gente não consegue marcar a visita, que tal descobrir quanto você aprova? É gratuito, não te compromete com nada e você já vai ver os apartamentos sabendo o que cabe. Te mando a lista agora, um item por vez?","por_que_funciona":"Benefício claro, baixo compromisso (gratuito e sem compromisso) e um próximo passo fácil. Ao mandar a lista, acrescente que ninguém da SMQ pede Pix, taxa ou senha."},{"canal":"Ligação","situacao":"O cliente resistiu ao documento","texto":"Super entendo, documento é coisa séria. Então vamos fazer diferente: você conhece o apartamento primeiro. Sábado às 10h ou domingo às 14h, qual fica melhor?","por_que_funciona":"Valida sem julgar e troca de caminho na hora, sem insistir."}],"erros_que_matam":[{"erro":"Perguntar \"quando você pode?\" ou \"quer visitar?\"","custo":"Pergunta aberta devolve \"vou pensar\"","correcao":"Duas opções de horário"},{"erro":"Insistir no documento depois de sinal de resistência","custo":"O cliente trava no momento de calor; exigências a mais no fim da conversa já derrubaram o avanço do robô pela metade","correcao":"Uma oferta, um reforço leve e mudança para a visita"},{"erro":"Oferecer visita sem horário concreto","custo":"O \"vamos marcar\" nunca vira agenda","correcao":"Dia e hora na mesma frase"}],"no_crm":{"tela":"Card do cliente","acao":"Criar o agendamento ou anexar o documento na pasta","campo":"Agendamento com data, hora e empreendimento; documentos na ficha","regra":"Mudar o status não é agendar"},"frase_ancora":"Pergunta aberta devolve \"vou pensar\". Duas opções devolvem um dia.","checagem_rapida":[{"pergunta":"Quais são os 2 caminhos de uma conversa qualificada?","resposta":"Visita marcada com dia e hora ou análise de crédito com documento."},{"pergunta":"O cliente resistiu ao documento. O que fazer?","resposta":"Validar sem julgar e voltar para a visita, com duas opções."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M15-A5', 5, 'Objeção na ligação: nunca sem horário', 'texto',
  '86,4% das objeções da casa são de tempo. A objeção que você mais vai ouvir não é "está caro". É "agora não".

### Por que importa

Objeção explicada é oportunidade: quando o cliente escreve por que não é o momento, 28,7% viram avanço; quando objeta o preço, 66,7%. O que mata é aceitar a objeção sem próximo passo.

### O conceito

Objeção não é porta fechada. É o cliente dizendo onde está o medo. Quem investiga encontra a fechadura; quem rebate empurra a porta.

### O método SMQ, passo a passo

1. Validar: reconhecer sem concordar e sem rebater. Troque "mas" por "e".
2. Investigar e isolar: "O que especificamente te preocupa?" e, quando couber, "Se isso estivesse resolvido, você avançaria?"
3. Endereçar: responder exatamente ao que apareceu, com mecanismo e número real, nunca com promessa.
4. Agir: próximo passo concreto, com duas opções de horário. No máximo um reforço; na segunda recusa, recue, registre o desfecho com data e deixe para o follow-up.
5. Regra de ouro do método: nunca deixar uma objeção sem uma alternativa de horário pronta. Urgência só quando for verdade e verificável.

### Na vida real

**O caso:** As objeções registradas nas conversas da casa (jul a set/2026).

**O que foi dito:** De 309 objeções, 86,4% eram de tempo. Mas 40,1% delas eram só o botão "Depois" respondido a um follow-up genérico, e dessas só 2,4% avançaram.

**O que aconteceu:** Quando o cliente explica a objeção com as próprias palavras, a chance de avançar sobe para 28,7% (tempo) e 66,7% (preço). Investigar é o que transforma o "depois" em conversa.

### Scripts prontos

#### Ligação · "Vou pensar"

> Claro, é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto? ... Então vamos fazer assim: 10 minutinhos com vocês dois amanhã às 19h ou sábado de manhã, qual fica melhor?

**Por que funciona:** Valida, investiga a causa real (quase sempre decisor, parcela ou confiança) e termina com duas opções.

#### Ligação · "Tô sem tempo essa semana"

> Imagino! Por isso a visita é rápida, leva de 20 a 30 minutos. Sábado às 10h ou domingo às 14h?

**Por que funciona:** Resolve a objeção com um fato (a visita é curta) e fecha na hora.

#### Ligação · "Não posso falar agora" e "Já tenho corretor"

> Sem problema! Te ligo hoje às 18h ou amanhã às 9h? ... (Para "já tenho corretor":) Que ótimo. Só como segunda opinião: você já sabe quanto aprova e se tem subsídio no seu perfil?

**Por que funciona:** Transforma a saída em horário marcado e, no caso do outro corretor, oferece valor sem falar mal de ninguém.

### Erros que matam a venda

- **Rebater a objeção de cara**  
  Quanto custa: O cliente se defende e fecha a porta  
  Correção: Validar primeiro
- **Pular a investigação**  
  Quanto custa: Você responde a objeção imaginada, não a real  
  Correção: "O que especificamente te preocupa?"
- **Aceitar a objeção sem horário ou criar urgência falsa**  
  Quanto custa: O cliente some ou perde a confiança para sempre  
  Correção: Duas opções de horário e só urgência verdadeira

### No CRM

- **Tela:** Card do cliente
- **Ação:** Registrar a objeção nas observações e o desfecho com data
- **Campo:** Próximo passo e data; motivo, se for perda
- **Regra:** Objeção sem próximo passo vira cliente "sem próximo passo" na fila

### Frase-âncora

> **Nunca deixe uma objeção sem uma alternativa de horário pronta.**

### Checagem rápida

1. Quais são os 4 passos do protocolo de objeção?  
   Resposta: Validar, investigar e isolar, endereçar e agir.
2. Qual é o tipo de objeção mais comum na SMQ?  
   Resposta: A de tempo ("agora não", "depois"), com 86,4%.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"86,4% das objeções da casa são de tempo. A objeção que você mais vai ouvir não é \"está caro\". É \"agora não\".","por_que_importa":"Objeção explicada é oportunidade: quando o cliente escreve por que não é o momento, 28,7% viram avanço; quando objeta o preço, 66,7%. O que mata é aceitar a objeção sem próximo passo.","conceito":"Objeção não é porta fechada. É o cliente dizendo onde está o medo. Quem investiga encontra a fechadura; quem rebate empurra a porta.","metodo":["Validar: reconhecer sem concordar e sem rebater. Troque \"mas\" por \"e\".","Investigar e isolar: \"O que especificamente te preocupa?\" e, quando couber, \"Se isso estivesse resolvido, você avançaria?\"","Endereçar: responder exatamente ao que apareceu, com mecanismo e número real, nunca com promessa.","Agir: próximo passo concreto, com duas opções de horário. No máximo um reforço; na segunda recusa, recue, registre o desfecho com data e deixe para o follow-up.","Regra de ouro do método: nunca deixar uma objeção sem uma alternativa de horário pronta. Urgência só quando for verdade e verificável."],"na_vida_real":{"caso":"As objeções registradas nas conversas da casa (jul a set/2026).","o_que_foi_dito":"De 309 objeções, 86,4% eram de tempo. Mas 40,1% delas eram só o botão \"Depois\" respondido a um follow-up genérico, e dessas só 2,4% avançaram.","resultado":"Quando o cliente explica a objeção com as próprias palavras, a chance de avançar sobe para 28,7% (tempo) e 66,7% (preço). Investigar é o que transforma o \"depois\" em conversa.","fonte":"Objeções registradas cruzadas com o funil (seção 9.1)"},"scripts":[{"canal":"Ligação","situacao":"\"Vou pensar\"","texto":"Claro, é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto? ... Então vamos fazer assim: 10 minutinhos com vocês dois amanhã às 19h ou sábado de manhã, qual fica melhor?","por_que_funciona":"Valida, investiga a causa real (quase sempre decisor, parcela ou confiança) e termina com duas opções."},{"canal":"Ligação","situacao":"\"Tô sem tempo essa semana\"","texto":"Imagino! Por isso a visita é rápida, leva de 20 a 30 minutos. Sábado às 10h ou domingo às 14h?","por_que_funciona":"Resolve a objeção com um fato (a visita é curta) e fecha na hora."},{"canal":"Ligação","situacao":"\"Não posso falar agora\" e \"Já tenho corretor\"","texto":"Sem problema! Te ligo hoje às 18h ou amanhã às 9h? ... (Para \"já tenho corretor\":) Que ótimo. Só como segunda opinião: você já sabe quanto aprova e se tem subsídio no seu perfil?","por_que_funciona":"Transforma a saída em horário marcado e, no caso do outro corretor, oferece valor sem falar mal de ninguém."}],"erros_que_matam":[{"erro":"Rebater a objeção de cara","custo":"O cliente se defende e fecha a porta","correcao":"Validar primeiro"},{"erro":"Pular a investigação","custo":"Você responde a objeção imaginada, não a real","correcao":"\"O que especificamente te preocupa?\""},{"erro":"Aceitar a objeção sem horário ou criar urgência falsa","custo":"O cliente some ou perde a confiança para sempre","correcao":"Duas opções de horário e só urgência verdadeira"}],"no_crm":{"tela":"Card do cliente","acao":"Registrar a objeção nas observações e o desfecho com data","campo":"Próximo passo e data; motivo, se for perda","regra":"Objeção sem próximo passo vira cliente \"sem próximo passo\" na fila"},"frase_ancora":"Nunca deixe uma objeção sem uma alternativa de horário pronta.","checagem_rapida":[{"pergunta":"Quais são os 4 passos do protocolo de objeção?","resposta":"Validar, investigar e isolar, endereçar e agir."},{"pergunta":"Qual é o tipo de objeção mais comum na SMQ?","resposta":"A de tempo (\"agora não\", \"depois\"), com 86,4%."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M15-A6', 6, 'Agendou? Crie, confirme e prepare', 'texto',
  'O cliente disse "sábado às 10h". Parabéns: você ainda não agendou. Mudar o status não é agendar.

### Por que importa

O comparecimento da casa é de 79,8%, acima da meta de 65%: o protocolo funciona quando o agendamento existe. Sem o agendamento criado, a visita não aparece na agenda, a confirmação não sai e o cliente não vem.

### O conceito

É a reserva de mesa num restaurante: o "pode vir" do garçom não vale nada se ninguém anotar no livro. O agendamento é o livro.

### O método SMQ, passo a passo

1. Antes de desligar, crie o agendamento com data, hora e empreendimento, e confirme quem vai (o decisor).
2. Confira o local da visita, que depende do produto (estande ou decorado da construtora, ou escritório da SMQ; decisão do diretor, 29/09/2026), e mande na hora a mensagem de confirmação: local, dia, hora, endereço completo, com quem falar na recepção, documentos para levar e o número de quem vai atender.
3. Documentos para levar à visita: RG e CPF, comprovante de renda, comprovante de residência, carteira de trabalho digital (se CLT) e extrato do FGTS (se tiver).
4. Confirmação humana: D-2 confirma que está de pé; D-1 reforça horário e endereço e pergunta se o decisor vem; D+0 avisa que você está a caminho. O robô Vitor manda os lembretes automáticos na véspera às 18h30 e no dia às 08h45, mas o relacionamento é seu.
5. O cliente respondeu "preciso reagendar"? Duas opções na hora e o agendamento marcado como "remarcado".
6. Prepare a visita no Modo Visita: briefing do cliente, simulação pronta e unidades disponíveis (M18).

### Na vida real

**O caso:** Uma visita marcada que ninguém confirmou (jul/2026).

**O que foi dito:** O cliente chegou com visita marcada para um sábado. O corretor não fez contato por 9 dias. Na confirmação automática da véspera, a cliente respondeu: "Preciso reagendar."

**O que aconteceu:** Com duas opções concretas e o agendamento marcado como "remarcado", a visita foi salva. Sem o contato humano, ela teria morrido em silêncio.

### Scripts prontos

#### WhatsApp · Confirmação logo depois da ligação

> Combinado, [nome]! Sábado, [data], às 10h, para conhecer o [empreendimento], no [local da visita: estande, decorado ou escritório da SMQ]: [endereço completo]. Na recepção é só perguntar por mim, [seu nome]. Leva RG, CPF, comprovante de renda, comprovante de residência, carteira de trabalho digital (se for CLT) e extrato do FGTS (se tiver): a gente já adianta a sua análise. Qualquer imprevisto, me avisa que a gente remarca.

**Por que funciona:** Tudo numa mensagem só: nada de "o endereço eu te mando depois". O cliente chega preparado e a análise anda no mesmo dia.

#### WhatsApp · D-1: reforço e decisor

> Amanhã é o dia, [nome]! Te espero às 10h em [endereço]. A [pessoa que decide junto] vem com você, né?

**Por que funciona:** Reforça horário e endereço e confirma o decisor sem cobrança.

### Erros que matam a venda

- **Mudar o card para "Agendado" sem criar o agendamento**  
  Quanto custa: A confirmação não sai e o cliente não vem  
  Correção: Criar o agendamento antes de desligar
- **Prometer o endereço "em segundos" e esquecer**  
  Quanto custa: Visita aceita e perdida no ponto mais caro do funil  
  Correção: Endereço, dia, hora e quem recebe na mesma mensagem
- **Deixar a confirmação só com o robô**  
  Quanto custa: O cliente chega sem vínculo com você, ou não chega  
  Correção: D-2 humano, D-1 com decisor, D+0 a caminho

### No CRM

- **Tela:** Criar agendamento; Agenda e Tarefas; Modo Visita
- **Ação:** Criar com data, hora e empreendimento; marcar "remarcado" quando for o caso
- **Campo:** Data, hora e empreendimento
- **Regra:** O agendamento é o que dispara a confirmação e aparece no Modo Visita

### Frase-âncora

> **Ligação boa não termina em "vou pensar". Termina com dia, hora e nome no documento.**

### Checagem rápida

1. Quais documentos o cliente leva para a visita?  
   Resposta: RG e CPF, comprovante de renda, comprovante de residência, carteira de trabalho digital (se CLT) e extrato do FGTS (se tiver).
2. O que cada momento do protocolo faz: D-2, D-1 e D+0?  
   Resposta: D-2 confirma que está de pé; D-1 reforça horário, endereço e decisor; D+0 avisa que você está a caminho.',
  8, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente disse \"sábado às 10h\". Parabéns: você ainda não agendou. Mudar o status não é agendar.","por_que_importa":"O comparecimento da casa é de 79,8%, acima da meta de 65%: o protocolo funciona quando o agendamento existe. Sem o agendamento criado, a visita não aparece na agenda, a confirmação não sai e o cliente não vem.","conceito":"É a reserva de mesa num restaurante: o \"pode vir\" do garçom não vale nada se ninguém anotar no livro. O agendamento é o livro.","metodo":["Antes de desligar, crie o agendamento com data, hora e empreendimento, e confirme quem vai (o decisor).","Confira o local da visita, que depende do produto (estande ou decorado da construtora, ou escritório da SMQ; decisão do diretor, 29/09/2026), e mande na hora a mensagem de confirmação: local, dia, hora, endereço completo, com quem falar na recepção, documentos para levar e o número de quem vai atender.","Documentos para levar à visita: RG e CPF, comprovante de renda, comprovante de residência, carteira de trabalho digital (se CLT) e extrato do FGTS (se tiver).","Confirmação humana: D-2 confirma que está de pé; D-1 reforça horário e endereço e pergunta se o decisor vem; D+0 avisa que você está a caminho. O robô Vitor manda os lembretes automáticos na véspera às 18h30 e no dia às 08h45, mas o relacionamento é seu.","O cliente respondeu \"preciso reagendar\"? Duas opções na hora e o agendamento marcado como \"remarcado\".","Prepare a visita no Modo Visita: briefing do cliente, simulação pronta e unidades disponíveis (M18)."],"na_vida_real":{"caso":"Uma visita marcada que ninguém confirmou (jul/2026).","o_que_foi_dito":"O cliente chegou com visita marcada para um sábado. O corretor não fez contato por 9 dias. Na confirmação automática da véspera, a cliente respondeu: \"Preciso reagendar.\"","resultado":"Com duas opções concretas e o agendamento marcado como \"remarcado\", a visita foi salva. Sem o contato humano, ela teria morrido em silêncio.","fonte":"Casos da era do CRM (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Confirmação logo depois da ligação","texto":"Combinado, [nome]! Sábado, [data], às 10h, para conhecer o [empreendimento], no [local da visita: estande, decorado ou escritório da SMQ]: [endereço completo]. Na recepção é só perguntar por mim, [seu nome]. Leva RG, CPF, comprovante de renda, comprovante de residência, carteira de trabalho digital (se for CLT) e extrato do FGTS (se tiver): a gente já adianta a sua análise. Qualquer imprevisto, me avisa que a gente remarca.","por_que_funciona":"Tudo numa mensagem só: nada de \"o endereço eu te mando depois\". O cliente chega preparado e a análise anda no mesmo dia."},{"canal":"WhatsApp","situacao":"D-1: reforço e decisor","texto":"Amanhã é o dia, [nome]! Te espero às 10h em [endereço]. A [pessoa que decide junto] vem com você, né?","por_que_funciona":"Reforça horário e endereço e confirma o decisor sem cobrança."}],"erros_que_matam":[{"erro":"Mudar o card para \"Agendado\" sem criar o agendamento","custo":"A confirmação não sai e o cliente não vem","correcao":"Criar o agendamento antes de desligar"},{"erro":"Prometer o endereço \"em segundos\" e esquecer","custo":"Visita aceita e perdida no ponto mais caro do funil","correcao":"Endereço, dia, hora e quem recebe na mesma mensagem"},{"erro":"Deixar a confirmação só com o robô","custo":"O cliente chega sem vínculo com você, ou não chega","correcao":"D-2 humano, D-1 com decisor, D+0 a caminho"}],"no_crm":{"tela":"Criar agendamento; Agenda e Tarefas; Modo Visita","acao":"Criar com data, hora e empreendimento; marcar \"remarcado\" quando for o caso","campo":"Data, hora e empreendimento","regra":"O agendamento é o que dispara a confirmação e aparece no Modo Visita"},"frase_ancora":"Ligação boa não termina em \"vou pensar\". Termina com dia, hora e nome no documento.","checagem_rapida":[{"pergunta":"Quais documentos o cliente leva para a visita?","resposta":"RG e CPF, comprovante de renda, comprovante de residência, carteira de trabalho digital (se CLT) e extrato do FGTS (se tiver)."},{"pergunta":"O que cada momento do protocolo faz: D-2, D-1 e D+0?","resposta":"D-2 confirma que está de pé; D-1 reforça horário, endereço e decisor; D+0 avisa que você está a caminho."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q01', 1, 'situacional',
  'Logo no início da ligação, o cliente pergunta: "Quanto custa?" O que você responde?',
  '["\"Te passo sim! Os valores mudam bastante conforme a renda e o FGTS. Me conta: vai ser o seu primeiro imóvel?\"","\"Custa R$ 280 mil.\"","\"Depois a gente vê isso.\"","\"Te mando a tabela por WhatsApp.\""]'::jsonb,
  0,
  'A A acolhe o pedido, explica por que o valor depende do perfil e começa as 6 perguntas: preço antes da renda entrega a condução ao cliente. A B entrega o preço sem contexto e vira comparação. A C é evasiva e irrita. A D manda material antes de qualificar e tira o cliente da ligação.',
  'M15-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q02', 2, 'situacional',
  'No fim da ligação, o cliente diz: "Vou pensar." Qual é a melhor resposta?',
  '["\"Tudo bem, qualquer coisa me chama.\"","\"Claro, é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?\"","\"Mas essa oportunidade acaba hoje.\"","\"Pensa e me responde até amanhã, senão eu passo a unidade pra outro.\""]'::jsonb,
  1,
  'A B valida e investiga a causa real, para depois agir com duas opções. A A aceita o "vou pensar" sem horário, um dos 4 erros fatais. A C e a D criam urgência e pressão falsas, que destroem a confiança.',
  'M15-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q03', 3, 'situacional',
  'O cliente diz: "Tô sem tempo essa semana." O que você diz?',
  '["\"Então me avisa quando tiver tempo.\"","\"Tudo bem, fica pra outro mês.\"","\"Imagino! Por isso a visita é rápida, leva de 20 a 30 minutos. Sábado às 10h ou domingo às 14h?\"","\"Se não vier essa semana, perde a condição.\""]'::jsonb,
  2,
  'A C responde com um fato (a visita é curta) e fecha na hora com duas opções. A A e a B deixam o cliente sem próximo passo e a iniciativa com ele. A D cria urgência falsa, a menos que a condição tenha prazo real e verificável.',
  'M15-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q04', 4, 'situacional',
  'A cliente trabalha aos sábados e mora longe do estande. Ela está qualificada e animada. Qual é o próximo passo?',
  '["Esperar ela ter um sábado livre.","Mandar o book e aguardar.","Marcar como \"Aguardando retorno\" sem data.","Oferecer a análise gratuita com documento: \"Enquanto a gente não marca a visita, que tal descobrir quanto você aprova? É gratuito e não te compromete.\""]'::jsonb,
  3,
  'A D abre o segundo caminho: quem não pode visitar agora vai para a análise com documento, e cliente com documento avança 6 vezes mais. A A e a C deixam a conversa sem próximo passo. A B manda material no lugar de avançar.',
  'M15-A4; seção 9.4', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q05', 5, 'situacional',
  'Você ofereceu a análise e o cliente respondeu: "Não gosto de mandar documento pelo WhatsApp." O que fazer?',
  '["\"Super entendo, documento é coisa séria. Então você conhece o apartamento primeiro: sábado às 10h ou domingo às 14h?\"","Explicar três vezes por que o documento é importante.","\"Sem documento não dá pra fazer nada.\"","Encerrar a conversa e marcar como perdido."]'::jsonb,
  0,
  'A A valida sem julgar e volta para a visita na hora. A B insiste depois de um sinal claro de resistência, o que trava o cliente no momento de calor. A C é falsa (a visita é o outro caminho) e fecha a porta. A D perde um cliente qualificado.',
  'M15-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q06', 6, 'situacional',
  'O cliente tem renda de R$ 11.500 e diz: "Quero colocar a renda da minha mãe pra subir o valor do apartamento." O que você faz?',
  '["Soma as rendas na hora, porque mais renda é sempre melhor.","Explica que, se a renda somada passar de R$ 13 mil, o financiamento sai do MCMV e a taxa muda, e simula os dois cenários antes de decidir.","Diz que composição de renda não é permitida.","Promete que com a renda da mãe aprova um valor maior."]'::jsonb,
  1,
  'A B evita a armadilha da Faixa 4: somar pode tirar o cliente do programa e subir a parcela. A A ignora essa trava. A C é falsa: composição é permitida. A D promete o que só a análise confirma.',
  'M15-A3; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q07', 7, 'situacional',
  'O cliente topou visitar no sábado às 10h. O que você faz antes de desligar?',
  '["Muda o card para \"Agendado\" e desliga.","Diz \"te mando o endereço depois\" e desliga.","Cria o agendamento com data, hora e empreendimento, confirma quem vai e manda a mensagem de confirmação com endereço, documentos e o seu número.","Pede para o cliente te lembrar no sábado."]'::jsonb,
  2,
  'A C fecha a visita de verdade: agendamento criado, decisor confirmado e confirmação completa numa mensagem só. A A é o erro clássico: mudar o status não é agendar. A B é a promessa que costuma não chegar e já fez a casa perder visita aceita. A D entrega o compromisso ao cliente.',
  'M15-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q08', 8, 'situacional',
  'O cliente pede: "Me manda o link que eu vejo com calma." Qual é a resposta mais SMQ?',
  '["\"Mando agora!\" e envia o book completo.","\"Não mando link, só pessoalmente.\"","\"Tudo bem, qualquer dúvida me chama.\"","\"Te mando sim. Só que o book não mostra o que mais importa: quanto fica pra você. Me responde duas coisinhas e eu te mando o book junto com a sua parcela estimada.\""]'::jsonb,
  3,
  'A D atende o pedido sem perder a condução: qualifica primeiro e manda o material com valor. A A manda catálogo sem conversa e o cliente some. A B é rígida e desrespeita o cliente. A C deixa a iniciativa com ele.',
  'M15-A5; seção 9.7', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q09', 9, 'aplicacao',
  'Qual é a ordem das 6 perguntas do método "Eu conduzo"?',
  '["Parcela, documentação, primeiro imóvel, decisor, conceito, simulação.","Primeiro imóvel, simulação, parcela, conceito SMQ, decisor, documentação e visita.","Conceito SMQ, preço, visita, renda, decisor, documentação.","Decisor, renda, preço, visita, simulação, conceito."]'::jsonb,
  1,
  'A B é a ordem oficial, e ordem trocada é venda perdida. As outras alternativas colocam preço, parcela ou visita antes de conhecer a jornada e a capacidade do cliente, o que entrega a condução e leva ao produto errado.',
  'M15-A2 a A4; seção 9.2', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q10', 10, 'aplicacao',
  'Com quais seis coisas a ligação precisa terminar?',
  '["Nome, telefone, e-mail, CPF, renda e endereço.","Preço, tabela, book, planta, vídeo e localização.","Jornada, simulação, parcela, conexão, decisor e agenda.","Visita, proposta, contrato, ato, aprovação e chave."]'::jsonb,
  2,
  'A C é a lista do método: a agenda inclui data, hora, quem vai, quais documentos e por qual canal enviar. A A é cadastro, não condução. A B é material de venda. A D é o caminho inteiro até a chave, que não cabe numa ligação.',
  'M15-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q11', 11, 'aplicacao',
  'Quais são os 4 erros que matam a ligação?',
  '["Não mandar áudio, não mandar emoji, não mandar book e não mandar vídeo.","Falar demais, falar de menos, ligar cedo e ligar tarde.","Esquecer o CPF, o RG, o comprovante e o extrato.","Falar de preço antes de saber a renda; aceitar \"vou pensar\" sem horário; apresentar unidade sem saber quem decide; encerrar sem data, hora e documento."]'::jsonb,
  3,
  'A D são os 4 erros oficiais do método. A A inverte boas práticas (áudio e book não são para o primeiro contato). A B é vaga. A C trata de documentos, que importam, mas não são os erros da condução da ligação.',
  'M15-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q12', 12, 'aplicacao',
  'Quais documentos o cliente deve levar para a visita?',
  '["RG e CPF, comprovante de renda, comprovante de residência, carteira de trabalho digital (se CLT) e extrato do FGTS (se tiver).","Só o RG.","Certidões negativas de todos os cartórios.","Nenhum: documento só depois da venda."]'::jsonb,
  0,
  'A A é o checklist do método, e com ele a análise anda no mesmo dia da visita. A B é pouco. A C exige certidões que só se pedem quando o banco solicita. A D atrasa a análise e contraria a regra de orientar documentos desde a qualificação.',
  'M15-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q13', 13, 'aplicacao',
  'No protocolo de confirmação, o que acontece no D-1?',
  '["Nada: o robô cuida.","Você reforça horário e endereço e pergunta se o decisor vem.","Você cancela se o cliente não responder em 1 hora.","Você manda o book de novo."]'::jsonb,
  1,
  'A B é o D-1: reforço de horário, endereço e decisor. O D-2 confirma que está de pé e o D+0 avisa que você está a caminho. A A terceiriza o relacionamento. A C é precipitada. A D não confirma nada.',
  'M15-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q14', 14, 'aplicacao',
  'O casal tem renda somada de R$ 4.500. Em que faixa do MCMV parece se encaixar e o que dizer sobre subsídio? (tabela vigente desde 22/04/2026; confirmar antes de usar com cliente)',
  '["Faixa 3, sem subsídio.","Faixa 1, com R$ 55 mil de subsídio garantido.","Faixa 2; o subsídio pode existir, cai conforme a renda sobe e só se confirma na análise.","Fora do MCMV."]'::jsonb,
  2,
  'A C está certa: a Faixa 2 vai de R$ 3.200,01 a R$ 5.000 (Portaria MCID nº 333/2026, vigente desde 22/04/2026), e o subsídio, quando existe, diminui com a renda e só se confirma na análise. A A erra a faixa. A B erra a faixa e promete um valor. A D descarta um cliente que está no programa.',
  'M15-A2; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q15', 15, 'conceito',
  'Por que oferecer duas opções de horário, e não perguntar "quer visitar?"',
  '["Porque é mais educado.","Porque o cliente é obrigado a escolher uma delas.","Porque o CRM só aceita dois horários.","Porque pergunta aberta devolve \"vou pensar\", e duas opções trocam o \"se\" pelo \"quando\", sem pressão."]'::jsonb,
  3,
  'A D é o princípio: tirar do cliente o trabalho de escolher do zero. A A não explica o efeito. A B está errada: ele pode recusar, e aí o protocolo de objeção entra. A C é falsa.',
  'M15-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q16', 16, 'conceito',
  'Quais são os 2 caminhos de toda conversa qualificada?',
  '["Visita marcada com dia e hora ou análise de crédito com documento.","Venda ou perda.","Ligação ou WhatsApp.","Book ou tabela."]'::jsonb,
  0,
  'A A são os 2 caminhos da doutrina SMQ: visita ofertada com duas opções e, quando não dá, análise com documento. A B pula etapas do funil. A C são canais, não desfechos. A D é material de apoio.',
  'M15-A4; seção 9.4', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q17', 17, 'conceito',
  'Qual é a regra de ouro das objeções no método "Eu conduzo"?',
  '["Nunca aceitar um \"não\".","Sempre dar desconto.","Nunca deixar uma objeção sem uma alternativa de horário pronta.","Mudar de assunto quando o cliente objeta."]'::jsonb,
  2,
  'A C é a regra oficial: urgência real, agilidade (visita de 20 a 30 minutos) e opção específica. A A vira insistência e desrespeito. A B é erro de negociação. A D foge da objeção e deixa o medo do cliente sem resposta.',
  'M15-A5; seção 9.2', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q18', 18, 'conceito',
  'Qual é a passagem do funil que trava a casa, segundo o treinamento do CRM?',
  '["Distribuição, com 92,6%.","\"Em atendimento → Agendado\", com 5,4% contra meta de 70%; levar só ela à meta multiplica a conversão da casa por 13.","Fechamento, com 45,3%.","Comparecimento, com 79,8%."]'::jsonb,
  1,
  'A B é a única divisa muito fora da meta, e é o alvo deste módulo. A C e a D estão acima das metas (30% e 65%). A A está um pouco abaixo da meta de 100%, mas não é o gargalo que multiplica a conversão.',
  'Treinamento do CRM, set/2026 (seção 9.1)', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q19', 19, 'caca_ao_erro',
  'Trecho de uma ligação: "O apartamento custa R$ 280 mil. Quer visitar? Quando você pode?" Quais são os erros?',
  '["Preço antes da renda e duas perguntas abertas no lugar de duas opções de horário.","Nenhum: foi direto ao ponto.","Só faltou dizer o nome do empreendimento.","O erro é oferecer visita cedo demais."]'::jsonb,
  0,
  'A A aponta os dois erros: falar preço antes de saber a renda (erro fatal número 1) e "quer visitar? quando você pode?" (pergunta aberta devolve "vou pensar"). A B ignora os erros. A C vê um detalhe. A D está errada: oferecer visita é certo, o problema é como e quando.',
  'M15-A1 e M15-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M15-Q20', 20, 'caca_ao_erro',
  'Um corretor encerra assim: "Fechado, te espero lá no sábado!" e muda o card para "Agendado". Onde estão os erros?',
  '["Nenhum: o cliente confirmou.","O erro é ter marcado no sábado.","O erro é não ter mandado o book junto.","Não criou o agendamento, não informou endereço e hora completos, não confirmou o decisor e não mandou a lista de documentos."]'::jsonb,
  3,
  'A D lista o que faltou: sem agendamento criado a confirmação não sai, e sem endereço, hora, decisor e documentos a visita tende a falhar. A A confunde "sim" com visita garantida. A B e a C apontam detalhes irrelevantes.',
  'M15-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (15)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F01', 1, 'O princípio', '"Não sou conduzido. Eu conduzo." Quem pergunta conduz; quem só responde obedece.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F02', 2, 'As 6 perguntas', '1) Primeiro imóvel? 2) Já fez simulação? 3) Parcela ideal? 4) Conceito SMQ. 5) Compra com mais alguém? 6) Documentação e visita.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F03', 3, 'A ligação termina com', 'Jornada, simulação, parcela, conexão, decisor e agenda.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F04', 4, 'Os 4 erros fatais', 'Preço antes da renda; "vou pensar" sem horário; unidade sem decisor; encerrar sem data, hora e documento.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F05', 5, 'Âncora da renda', 'Consulta médica: antes de receitar, o médico examina.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F06', 6, 'Fala-âncora do conceito', '"Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar."', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F07', 7, 'Faixa 4 e composição', 'Acima de R$ 13 mil de renda, sai do MCMV. Calcule a folga antes.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F08', 8, 'A frase que resolve', '"Separei duas opções que cabem na sua renda. Você prefere sábado de manhã ou sábado à tarde?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F09', 9, 'Os 2 caminhos', 'Visita com dia e hora ou análise com documento.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F10', 10, 'Régua do documento', 'Uma oferta, no máximo um reforço leve; resistência clara, volte para a visita.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F11', 11, 'Protocolo de objeção', 'Validar, investigar e isolar, endereçar, agir com duas opções.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F12', 12, 'Regra de ouro', 'Nunca deixe uma objeção sem uma alternativa de horário pronta.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F13', 13, 'Documentos da visita', 'RG e CPF, comprovante de renda, de residência, carteira digital (CLT) e extrato do FGTS (se tiver).', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F14', 14, 'D-2, D-1, D+0', 'Confirma que está de pé; reforça horário, endereço e decisor; avisa que está a caminho.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M15-F15', 15, '5,4% contra 70%', 'A passagem "Em atendimento → Agendado" da casa. Na meta, a conversão multiplica por 13.', true
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"Faça o role-play \"ofereça visita nas dez\" uma vez por semana no primeiro mês, com a rubrica completa. Escute duas ligações reais por semana de cada corretor (com consentimento) e dê um único ponto de melhoria por vez. Na reunião de segunda, mostre a conversão \"Em atendimento → Agendado\" de cada um e os agendamentos criados na semana.","sinais_de_dificuldade":["Agendamentos sem data, sem hora ou sem empreendimento, ou clientes em \"Agendado\" sem agendamento criado.","Muitos clientes em \"Aguardando retorno\" sem data.","Perdas frequentes pelo motivo \"Adiou a decisão\"."],"perguntas_de_coaching":["Qual das 6 perguntas você pulou nessa ligação, e o que aconteceu por causa disso?","Que duas opções de horário você ofereceu?","Quando o cliente resistiu ao documento, o que você fez em seguida?"],"ritual_de_celebracao":"All Hands quinzenal: destaque Agendamento e conquista \"Agenda cheia\" (7 agendamentos criados na semana); no LEGADO, a evolução da conversão entra em \"Maior Evolução\"."}}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M15' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
