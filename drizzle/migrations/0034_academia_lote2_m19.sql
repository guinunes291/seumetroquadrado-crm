-- ===========================================================================
-- ACADEMIA SMQ · LOTE 2 (v1.0) · seed do módulo M19
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-2/academia-smq-lote-2.json.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- 6 aulas · 20 questões · 13 flashcards
-- ===========================================================================

-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  ('M19', 19, 3, 'Objeções: o protocolo e as 26 da casa', 'Ao final, você identifica o tipo da objeção, investiga antes de responder, endereça com mecanismo e número real e termina sempre com um próximo passo concreto com duas opções de horário, e isso aparece no CRM como desfechos "Falei · objeção" com próximo passo e data, zero cliente em "Aguardando retorno" sem data e menos perdas por "Adiou a decisão" no Meu Raio-X.',
   '["Eu sou capaz de classificar a objeção em um dos 7 tipos (dúvida, medo, valor, tempo, credibilidade, falsa e real) antes de responder.","Eu sou capaz de aplicar os 4 passos (validar, investigar e isolar, endereçar e agir) sem pular a investigação e com no máximo um reforço.","Eu sou capaz de responder às 26 objeções da casa com mecanismo e número real, sem prometer aprovação, prazo, valorização ou entrada zero.","Eu sou capaz de terminar toda objeção com uma alternativa de horário ou, na segunda recusa, com o prazo do cliente registrado.","Eu sou capaz de negociar só dentro da condição da campanha e levar o pedido extra ao gerente com retorno marcado."]'::jsonb, 2, '120 min', true,
   '**Maratona de objeções (15 objeções seguidas, 60 segundos para cada resposta)** · 45 min

**Papéis:** Corretor, cliente com os cartões das objeções e o gerente como observador com a rubrica. Uma rodada por corretor; na reunião seguinte, os papéis se revezam.

**Persona:** Cartões com as personas P1, P3, P5, P13, P14 e P15, sorteados a cada objeção

**Roteiro:** O cliente lê uma objeção por vez, na ordem do cartão. O corretor tem 60 segundos para validar, investigar (e isolar quando couber), endereçar e terminar com uma ação concreta, de preferência com duas opções de horário. 12 das 15 objeções são de tempo, como na casa (86,4%). O gerente pontua os 4 passos em cada resposta e anota a objeção em que o corretor travou, que vira a lição do 1:1.

**Roteiro do cliente:**

- 1. "Agora não dá."
- 2. "Me chama depois."
- 3. "Não é o momento."
- 4. "Vou esperar a obra ficar pronta."
- 5. "Ano que vem eu compro."
- 6. "Tô sem tempo essa semana."
- 7. "Prefiro alugar por enquanto."
- 8. "Não posso falar agora."
- 9. "Depois das férias a gente vê."
- 10. "Vou esperar o preço baixar."
- 11. "Só depois que eu resolver umas coisas aqui."
- 12. "Preciso reagendar a visita."
- 13. "Se tiver desconto eu fecho agora." (persona P14)
- 14. "Já me ligaram umas vinte vezes. Isso é golpe?" (persona P5)
- 15. "Preciso falar com a minha esposa." (persona P1)

**O que o observador procura:**

- Validação sem "mas" e sem rebater.
- Uma pergunta de investigação antes de qualquer argumento; isolamento quando a objeção esconde outra.
- Resposta com mecanismo e número real, sem promessa de aprovação, prazo, valorização ou entrada zero.
- Toda resposta termina com ação concreta e, sempre que possível, duas opções de horário.
- No máximo um reforço; na segunda recusa, recuo com a data do cliente.
- Desconto: tabela igual para todos, condição da campanha e pedido extra levado ao gerente com retorno marcado.
- Golpe: âncoras antigolpe e convite ao escritório (critério 6 só com nota 5).

**Rubrica:** Padrão SMQ, critérios 3 (condução), 4 (objeção), 5 (desfecho) e 6 (verdade e conformidade). Aprovação: média 3,5 ou mais.', '[{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Objeção: validar, investigar, endereçar, ação","peso":1},{"criterio":"Desfecho: dia e hora ou documento; duas opções; nada de \"vou pensar\" aceito sem horário","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 2 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Prazo de garantia (bloqueio) da unidade em cada construtora, para explicar a regra real ao cliente na aula M19-A6 (nunca prometer prazo até lá). | [CONFIRMAR] Coberturas do seguro obrigatório do financiamento com o correspondente (objeção 25). | [CONFIRMAR no memorial ou na matrícula] Quais empreendimentos em foco têm patrimônio de afetação (objeções 15 e 25). | [CONFIRMAR] Modelo de financiamento de cada empreendimento (na planta ou na entrega) antes de responder "vou esperar a obra ficar pronta" (objeção 3). | [DADO A MEDIR NO CRM] Linha de base, por corretor, das perdas por "Adiou a decisão" e "Esfriou depois da proposta/visita" e dos clientes em "Aguardando retorno" sem data. | [GAP DE CRM] O texto das objeções registradas nos desfechos "Falei · objeção" e "Objeção" fica só na linha do tempo do cliente; não há relatório por tipo e por corretor. Proposta: um painel de objeções na Operação para o gerente e para a maratona mensal. | [CALIBRAR] Meta de queda das perdas por "Adiou a decisão" com a conversão do time no Meu Raio-X.', '{"formato":"canonico-8.2","lote":2,"versao_conteudo":"1.0","trilha":"T3","ordem":5,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"A objeção da casa é tempo, não preço. E objeção bem tratada termina com dia e hora.","duracao_min":120,"por_que_vale_dinheiro":{"texto":"De 309 objeções registradas, 86,4% foram de tempo: \"agora não\", \"depois\". Preço foi só 9,7%. E objeção escrita pelo cliente é oportunidade: a de preço virou avanço em 66,7% das vezes e a de tempo em 28,7%. Já o \"Depois\" que ninguém investigou, respondido a um follow-up genérico, avançou em 2,4%. A diferença entre esses números é o protocolo.","numero":"86,4% das objeções são de tempo; objeção escrita avança em 28,7% (tempo) e 66,7% (preço), contra 2,4% do \"Depois\" sem investigação","fonte":"309 objeções registradas nas conversas do robô e funil do CRM","periodo":"jul a set/2026"},"pre_requisitos":["M00","M25","M26","M15","M16"],"indicador_crm":{"nome":"Perdas por \"Adiou a decisão\" e por \"Esfriou depois da proposta/visita\" e clientes em \"Aguardando retorno\" com data","onde_ler":"Meu Raio-X (onde você perde mais clientes); Gestão de Carteira › funil em quadro (coluna \"Aguardando retorno\" e \"sem próximo passo\"); para o gerente, Operação › Funil e Higiene do Funil","linha_de_base":"Na semana de 14/09/2026, a objeção de tempo foi 77% das objeções e só 46% delas recebeu uma rota de saída (conversas do robô); por corretor [DADO A MEDIR NO CRM]","meta_sugerida":"100% das objeções registradas com próximo passo e data; zero cliente em \"Aguardando retorno\" sem data; perdas por \"Adiou a decisão\" em queda mês a mês [CALIBRAR com o Meu Raio-X]","fonte":"Aprendizados do robô (14/09/2026) e Treinamento do CRM SMQ (set/2026)","gap_de_crm":false},"pratica":{"tipo":"Maratona de objeções (15 objeções seguidas, 60 segundos para cada resposta)","duracao_min":45,"persona":"Cartões com as personas P1, P3, P5, P13, P14 e P15, sorteados a cada objeção","rubrica":"Padrão SMQ, critérios 3 (condução), 4 (objeção), 5 (desfecho) e 6 (verdade e conformidade)","nota_minima":3.5,"papeis":"Corretor, cliente com os cartões das objeções e o gerente como observador com a rubrica. Uma rodada por corretor; na reunião seguinte, os papéis se revezam.","roteiro":"O cliente lê uma objeção por vez, na ordem do cartão. O corretor tem 60 segundos para validar, investigar (e isolar quando couber), endereçar e terminar com uma ação concreta, de preferência com duas opções de horário. 12 das 15 objeções são de tempo, como na casa (86,4%). O gerente pontua os 4 passos em cada resposta e anota a objeção em que o corretor travou, que vira a lição do 1:1.","roteiro_cliente":["1. \"Agora não dá.\"","2. \"Me chama depois.\"","3. \"Não é o momento.\"","4. \"Vou esperar a obra ficar pronta.\"","5. \"Ano que vem eu compro.\"","6. \"Tô sem tempo essa semana.\"","7. \"Prefiro alugar por enquanto.\"","8. \"Não posso falar agora.\"","9. \"Depois das férias a gente vê.\"","10. \"Vou esperar o preço baixar.\"","11. \"Só depois que eu resolver umas coisas aqui.\"","12. \"Preciso reagendar a visita.\"","13. \"Se tiver desconto eu fecho agora.\" (persona P14)","14. \"Já me ligaram umas vinte vezes. Isso é golpe?\" (persona P5)","15. \"Preciso falar com a minha esposa.\" (persona P1)"],"observador_procura":["Validação sem \"mas\" e sem rebater.","Uma pergunta de investigação antes de qualquer argumento; isolamento quando a objeção esconde outra.","Resposta com mecanismo e número real, sem promessa de aprovação, prazo, valorização ou entrada zero.","Toda resposta termina com ação concreta e, sempre que possível, duas opções de horário.","No máximo um reforço; na segunda recusa, recuo com a data do cliente.","Desconto: tabela igual para todos, condição da campanha e pedido extra levado ao gerente com retorno marcado.","Golpe: âncoras antigolpe e convite ao escritório (critério 6 só com nota 5)."]},"desafio_campo":{"tarefa":"Registrar 5 objeções reais da semana, cada uma com a resposta que você deu e o desfecho: próximo passo com data, agendamento criado ou a data que o cliente pediu em \"Aguardando retorno\".","prazo_horas":72,"evidencia_no_crm":"5 desfechos \"Falei · objeção\" ou \"Objeção\" na linha do tempo dos clientes, com o texto da objeção e um próximo passo com data; nenhum cliente em \"Aguardando retorno\" sem data na sua carteira","como_o_gestor_confere":"O gerente abre a ficha dos 5 clientes que o corretor indicar e confere, na linha do tempo, o texto da objeção e o próximo passo com data. Depois filtra a carteira dele no funil em quadro pela coluna \"Aguardando retorno\" e confere se todos têm data. Na reunião de segunda, o corretor lê a objeção mais difícil e a resposta que deu."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com um corretor fazendo o papel de cliente","cenario":"Escritório da SMQ, com a maratona de objeções encenada e o CRM aberto na Fila Única","blocos":[{"tempo":"0:00","fala":"Você treinou a resposta para \"tá caro\"? Ótimo. Só que quase nove em cada dez objeções da casa não são preço. São \"agora não\".","na_tela":"Um corretor ensaiando \"tá caro\" e o cliente respondendo \"agora não\""},{"tempo":"0:25","fala":"De 309 objeções, 86,4% foram de tempo. E na semana de 14 de setembro, metade dos \"depois\" ficou sem próximo passo nenhum.","na_tela":"Gráfico: tempo 86,4%, preço 9,7%, credibilidade 3,9%"},{"tempo":"1:00","fala":"O protocolo tem quatro passos: validar, investigar e isolar, endereçar e agir. O que ninguém pode pular é o segundo.","na_tela":"Os 4 passos"},{"tempo":"1:40","fala":"Olha ao vivo. Cliente: \"vou pensar\". Eu: \"claro, o que você ainda precisa analisar: a parcela, a região ou alguém que precisa ver junto?\" Apareceu a esposa. Então: \"hoje às 19h por vídeo ou sábado às 10h no estande?\"","na_tela":"Role-play com a persona P1"},{"tempo":"3:00","fala":"E quando o cliente pergunta se é golpe, não argumenta: demonstra. Nome, Seu Metro Quadrado, análise gratuita, ninguém pede Pix, e o convite para conhecer o escritório.","na_tela":"As 4 âncoras antigolpe"},{"tempo":"3:40","fala":"O erro que mais custa: \"tudo bem, sem pressa, qualquer coisa me chama\". Isso não é respeito, é abandono. Registra a objeção no desfecho e a data no próximo passo.","na_tela":"Desfecho \"Falei · objeção\" na Fila Única"},{"tempo":"4:20","fala":"Desafio da semana: 5 objeções reais registradas, cada uma com resposta e data. A objeção da casa é tempo, não preço.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 4, 5, 9.1, 9.4, 9.7, 9.9, 9.10, 9.12, 9.13, 9.14, 9.16 e 9.17 do super prompt","Estudo da Academia v2.1: seções 2, 5.6, 6 (Fases F, I e L), 14.2 e 15","Conteúdo atual do M19 no CRM (seed da Fatia 1, abr/2026): tipos de objeção, \"nunca pule o passo 2\", credibilidade se demonstra, urgência só com verdade","Fila Única do CRM: desfechos \"Falei · objeção\" e \"Objeção\" (set/2026)"],"origem":"SMQ","pendencias":["[CONFIRMAR] Prazo de garantia (bloqueio) da unidade em cada construtora, para explicar a regra real ao cliente na aula M19-A6 (nunca prometer prazo até lá).","[CONFIRMAR] Coberturas do seguro obrigatório do financiamento com o correspondente (objeção 25).","[CONFIRMAR no memorial ou na matrícula] Quais empreendimentos em foco têm patrimônio de afetação (objeções 15 e 25).","[CONFIRMAR] Modelo de financiamento de cada empreendimento (na planta ou na entrega) antes de responder \"vou esperar a obra ficar pronta\" (objeção 3).","[DADO A MEDIR NO CRM] Linha de base, por corretor, das perdas por \"Adiou a decisão\" e \"Esfriou depois da proposta/visita\" e dos clientes em \"Aguardando retorno\" sem data.","[GAP DE CRM] O texto das objeções registradas nos desfechos \"Falei · objeção\" e \"Objeção\" fica só na linha do tempo do cliente; não há relatório por tipo e por corretor. Proposta: um painel de objeções na Operação para o gerente e para a maratona mensal.","[CALIBRAR] Meta de queda das perdas por \"Adiou a decisão\" com a conversão do time no Meu Raio-X."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M19-A1', 'M19-A2', 'M19-A3', 'M19-A4', 'M19-A5', 'M19-A6'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 6;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M19-Q01', 'M19-Q02', 'M19-Q03', 'M19-Q04', 'M19-Q05', 'M19-Q06', 'M19-Q07', 'M19-Q08', 'M19-Q09', 'M19-Q10', 'M19-Q11', 'M19-Q12', 'M19-Q13', 'M19-Q14', 'M19-Q15', 'M19-Q16', 'M19-Q17', 'M19-Q18', 'M19-Q19', 'M19-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M19-F01', 'M19-F02', 'M19-F03', 'M19-F04', 'M19-F05', 'M19-F06', 'M19-F07', 'M19-F08', 'M19-F09', 'M19-F10', 'M19-F11', 'M19-F12', 'M19-F13');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 13;

-- 3. Aulas (6)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M19-A1', 1, 'A objeção da casa é tempo, não preço', 'texto',
  'Você treinou a resposta perfeita para "está caro". Só que, em cada dez objeções que o cliente da SMQ levanta, quase nove são "agora não". O corretor que só treina preço está treinando para o jogo errado.

### Por que importa

86,4% das objeções da casa são de tempo (jul a set/2026). Se você não tem saída para o "depois", você perde o cliente mais comum que existe. E objeção não é rejeição: quem objeta está conversando. A objeção de preço escrita pelo cliente virou avanço em 66,7% das vezes; a de tempo, em 28,7%. O que não avança é o "Depois" que ninguém investigou: 2,4%.

### O conceito

Objeção é placa de trânsito, não muro. A placa diz "curva perigosa" ou "desvio"; quem lê a placa chega. Quem acelera sem ler bate. O primeiro trabalho é ler a placa: que tipo de objeção é essa?

### O método SMQ, passo a passo

1. Os 7 tipos: dúvida (não entendeu), medo (teme errar), valor (não vê o valor), tempo ("não é o momento"), credibilidade (não confia), falsa (pretexto) e real (impedimento concreto, como o decisor ausente).
2. O peso real na SMQ: tempo 86,4%, preço 9,7%, credibilidade 3,9% (309 objeções, jul a set/2026). A maratona de objeções treina principalmente tempo.
3. Objeção escrita pelo cliente é oportunidade: ele está te dizendo o que falta. Responda ao que ele disse, não ao que você imaginou.
4. Credibilidade se demonstra, nunca se argumenta: prova, endereço, número de quem liga, convite ao escritório.
5. Regra do método que vale sempre: nunca deixar objeção sem alternativa de horário pronta.
6. Registre: no card da Fila Única, o desfecho "Falei · objeção" (ligação) ou "Objeção" (WhatsApp) guarda o texto da objeção e cria o próximo passo "Responder a objeção".

### Na vida real

**O caso:** A semana de 14/09/2026 nas conversas do robô da casa.

**O que foi dito:** A objeção de tempo foi 77% das objeções da semana. As de credibilidade receberam rota de saída em 100% dos casos; as de tempo, em só 46%. A resposta mais comum para o "agora não" era um "tudo bem" sem data.

**O que aconteceu:** Metade dos clientes que disseram "depois" ficou sem próximo passo. O aprendizado virou regra: objeção de tempo precisa de data, não de "tudo bem".

### Scripts prontos

#### WhatsApp · O cliente escreve "agora não é o momento"

> Entendo, [nome]. Pra eu não te chamar na hora errada: o que precisa acontecer pra ser o momento?

**Por que funciona:** Valida sem rebater e investiga com uma pergunta só. A resposta do cliente vira a data do próximo contato.

#### Ligação · O cliente desconfia (credibilidade)

> Você está certíssimo em desconfiar, tem muito golpe por aí. Então deixa eu te mostrar em vez de te convencer: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e você pode vir conhecer o escritório. Fica melhor amanhã às 18h ou sábado às 10h?

**Por que funciona:** Credibilidade se demonstra: âncoras, prova física e convite com duas opções.

### Erros que matam a venda

- **Responder "tudo bem, sem pressa" a uma objeção de tempo**  
  Quanto custa: Metade das objeções de tempo da semana de 14/09/2026 ficou sem rota de saída  
  Correção: Perguntar o que precisa acontecer e propor data
- **Tratar toda objeção como preço**  
  Quanto custa: Você oferece desconto para quem só queria tempo ou segurança  
  Correção: Classificar o tipo antes de responder
- **Argumentar com quem desconfia**  
  Quanto custa: Quanto mais você insiste, mais parece golpe  
  Correção: Demonstrar: âncoras, prova e convite ao escritório

### No CRM

- **Tela:** Fila Única (card do cliente)
- **Ação:** Registrar o desfecho "Falei · objeção" ou "Objeção" com o texto do que o cliente disse
- **Campo:** Texto da objeção e o próximo passo "Responder a objeção" com data
- **Regra:** Objeção registrada sempre com próximo passo e data; nada sai da fila sem desfecho

### Frase-âncora

> **A objeção da casa é tempo, não preço.**

### Checagem rápida

1. Que percentual das objeções da casa é de tempo?  
   Resposta: 86,4% (309 objeções, jul a set/2026).
2. Como se trata uma objeção de credibilidade?  
   Resposta: Demonstrando, nunca argumentando: âncoras antigolpe, prova e convite ao escritório ou ao estande.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Você treinou a resposta perfeita para \"está caro\". Só que, em cada dez objeções que o cliente da SMQ levanta, quase nove são \"agora não\". O corretor que só treina preço está treinando para o jogo errado.","por_que_importa":"86,4% das objeções da casa são de tempo (jul a set/2026). Se você não tem saída para o \"depois\", você perde o cliente mais comum que existe. E objeção não é rejeição: quem objeta está conversando. A objeção de preço escrita pelo cliente virou avanço em 66,7% das vezes; a de tempo, em 28,7%. O que não avança é o \"Depois\" que ninguém investigou: 2,4%.","conceito":"Objeção é placa de trânsito, não muro. A placa diz \"curva perigosa\" ou \"desvio\"; quem lê a placa chega. Quem acelera sem ler bate. O primeiro trabalho é ler a placa: que tipo de objeção é essa?","metodo":["Os 7 tipos: dúvida (não entendeu), medo (teme errar), valor (não vê o valor), tempo (\"não é o momento\"), credibilidade (não confia), falsa (pretexto) e real (impedimento concreto, como o decisor ausente).","O peso real na SMQ: tempo 86,4%, preço 9,7%, credibilidade 3,9% (309 objeções, jul a set/2026). A maratona de objeções treina principalmente tempo.","Objeção escrita pelo cliente é oportunidade: ele está te dizendo o que falta. Responda ao que ele disse, não ao que você imaginou.","Credibilidade se demonstra, nunca se argumenta: prova, endereço, número de quem liga, convite ao escritório.","Regra do método que vale sempre: nunca deixar objeção sem alternativa de horário pronta.","Registre: no card da Fila Única, o desfecho \"Falei · objeção\" (ligação) ou \"Objeção\" (WhatsApp) guarda o texto da objeção e cria o próximo passo \"Responder a objeção\"."],"na_vida_real":{"caso":"A semana de 14/09/2026 nas conversas do robô da casa.","o_que_foi_dito":"A objeção de tempo foi 77% das objeções da semana. As de credibilidade receberam rota de saída em 100% dos casos; as de tempo, em só 46%. A resposta mais comum para o \"agora não\" era um \"tudo bem\" sem data.","resultado":"Metade dos clientes que disseram \"depois\" ficou sem próximo passo. O aprendizado virou regra: objeção de tempo precisa de data, não de \"tudo bem\".","fonte":"Aprendizados do robô, 14/09/2026 (seção 9.1)"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente escreve \"agora não é o momento\"","texto":"Entendo, [nome]. Pra eu não te chamar na hora errada: o que precisa acontecer pra ser o momento?","por_que_funciona":"Valida sem rebater e investiga com uma pergunta só. A resposta do cliente vira a data do próximo contato."},{"canal":"Ligação","situacao":"O cliente desconfia (credibilidade)","texto":"Você está certíssimo em desconfiar, tem muito golpe por aí. Então deixa eu te mostrar em vez de te convencer: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e você pode vir conhecer o escritório. Fica melhor amanhã às 18h ou sábado às 10h?","por_que_funciona":"Credibilidade se demonstra: âncoras, prova física e convite com duas opções."}],"erros_que_matam":[{"erro":"Responder \"tudo bem, sem pressa\" a uma objeção de tempo","custo":"Metade das objeções de tempo da semana de 14/09/2026 ficou sem rota de saída","correcao":"Perguntar o que precisa acontecer e propor data"},{"erro":"Tratar toda objeção como preço","custo":"Você oferece desconto para quem só queria tempo ou segurança","correcao":"Classificar o tipo antes de responder"},{"erro":"Argumentar com quem desconfia","custo":"Quanto mais você insiste, mais parece golpe","correcao":"Demonstrar: âncoras, prova e convite ao escritório"}],"no_crm":{"tela":"Fila Única (card do cliente)","acao":"Registrar o desfecho \"Falei · objeção\" ou \"Objeção\" com o texto do que o cliente disse","campo":"Texto da objeção e o próximo passo \"Responder a objeção\" com data","regra":"Objeção registrada sempre com próximo passo e data; nada sai da fila sem desfecho"},"frase_ancora":"A objeção da casa é tempo, não preço.","checagem_rapida":[{"pergunta":"Que percentual das objeções da casa é de tempo?","resposta":"86,4% (309 objeções, jul a set/2026)."},{"pergunta":"Como se trata uma objeção de credibilidade?","resposta":"Demonstrando, nunca argumentando: âncoras antigolpe, prova e convite ao escritório ou ao estande."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M19-A2', 2, 'O protocolo em 4 passos: validar, investigar e isolar, endereçar, agir', 'texto',
  'O cliente diz "tá caro". O corretor apressado responde com três argumentos. O corretor SMQ responde com uma pergunta. Só um dos dois descobre que o problema era a entrada, e não o preço.

### Por que importa

Responder sem investigar é tratar a objeção imaginada. Você gasta a melhor munição no alvo errado e o cliente sente que não foi ouvido. Com os 4 passos, a resposta cai exatamente onde dói, e a conversa termina num próximo passo em vez de num "vou pensar".

### O conceito

Pense no médico. Ele não receita remédio para "dor". Ele pergunta onde dói, desde quando e o que piora. Só depois trata. Validar é ouvir a queixa; investigar é o exame; endereçar é o tratamento; agir é marcar o retorno.

### O método SMQ, passo a passo

1. Passo 1, validar: reconheça sem concordar e sem rebater. Troque o "mas" por "e": "Faz sentido, e justamente por isso...".
2. Passo 2, investigar e isolar: "O que especificamente te preocupa?" e, quando couber, "Se isso estivesse resolvido, você avançaria?". Nunca pule este passo.
3. Passo 3, endereçar: responda exatamente ao que foi revelado, com mecanismo e número real, nunca com promessa.
4. Passo 4, agir: próximo passo concreto, de preferência com duas opções de horário.
5. No máximo um reforço. Na segunda recusa, recue: registre o desfecho com a data que o cliente deu e deixe para o follow-up.
6. Registre a objeção e a data no desfecho. Cliente que pediu para falar depois vai para "Aguardando retorno" com a data dele, nunca sem data.

### Na vida real

**O caso:** Caso F da Casoteca: "Já fui aprovado em outra construtora" (1:1 de gestão, abr/2026).

**O que foi dito:** Na linha de: "Cada projeto tem a sua avaliação, de cada unidade. Pode ser que aqui seja diferente da análise que você fez na outra construtora, pra mais ou pra menos. Eu só vou saber de verdade se você me mandar a documentação."

**O que aconteceu:** A corretora não discutiu o valor da outra aprovação nem prometeu igualar. Validou, explicou o mecanismo e transformou a objeção num pedido de documento. A resposta virou modelo para o time.

### Scripts prontos

#### Ligação · O cliente diz "está caro"

> Entendo, e é bom você olhar isso com cuidado. Caro comparado a quê: ao seu aluguel, a outra opção que você viu ou ao que você imaginava pagar?

**Por que funciona:** Valida sem rebater e investiga com três opções, o que ajuda o cliente a dizer onde dói.

#### Ligação · Isolar a objeção antes de responder

> Deixa eu entender direitinho: se a entrada coubesse no seu bolso, tem mais alguma coisa que te impediria de avançar?

**Por que funciona:** Isola a objeção real. Se ele diz "não", você sabe exatamente o que precisa resolver.

#### WhatsApp · Segunda recusa: recuar com data

> Combinado, [nome], respeito o seu tempo. Te chamo na quinta às 19h pra gente ver como ficou, pode ser?

**Por que funciona:** Recua sem sumir: o reforço já foi feito, e o próximo contato fica marcado com o cliente.

### Erros que matam a venda

- **Pular a investigação e disparar argumentos**  
  Quanto custa: Você trata a objeção imaginada e o cliente sente que não foi ouvido  
  Correção: Uma pergunta antes de qualquer resposta
- **Usar "mas" na validação ("entendo, mas...")**  
  Quanto custa: O "mas" apaga a validação e vira discussão  
  Correção: Trocar por "e": "faz sentido, e por isso..."
- **Insistir três, quatro vezes**  
  Quanto custa: Pressão queima o relacionamento e o cliente some  
  Correção: Um reforço no máximo; depois, recuar com data
- **Aceitar "vou pensar" sem horário**  
  Quanto custa: Tempo é 86,4% das objeções; sem data, o cliente esfria  
  Correção: Fechar sempre com duas opções ou com a data que o cliente deu

### No CRM

- **Tela:** Fila Única e ficha do cliente
- **Ação:** Registrar a objeção no desfecho e, se o cliente pediu prazo, mover para "Aguardando retorno" com a data dele
- **Campo:** Desfecho, texto da objeção, próximo passo e data
- **Regra:** O prazo que o cliente deu suspende a régua; cliente em "Aguardando retorno" nunca fica sem data

### Frase-âncora

> **Pergunta antes da resposta. Horário antes do tchau.**

### Checagem rápida

1. Quais são os 4 passos do protocolo?  
   Resposta: Validar, investigar e isolar, endereçar e agir.
2. Quantos reforços você faz antes de recuar?  
   Resposta: No máximo um. Na segunda recusa, recue e registre a data do cliente.
3. Qual pergunta isola a objeção?  
   Resposta: "Se isso estivesse resolvido, você avançaria?"',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente diz \"tá caro\". O corretor apressado responde com três argumentos. O corretor SMQ responde com uma pergunta. Só um dos dois descobre que o problema era a entrada, e não o preço.","por_que_importa":"Responder sem investigar é tratar a objeção imaginada. Você gasta a melhor munição no alvo errado e o cliente sente que não foi ouvido. Com os 4 passos, a resposta cai exatamente onde dói, e a conversa termina num próximo passo em vez de num \"vou pensar\".","conceito":"Pense no médico. Ele não receita remédio para \"dor\". Ele pergunta onde dói, desde quando e o que piora. Só depois trata. Validar é ouvir a queixa; investigar é o exame; endereçar é o tratamento; agir é marcar o retorno.","metodo":["Passo 1, validar: reconheça sem concordar e sem rebater. Troque o \"mas\" por \"e\": \"Faz sentido, e justamente por isso...\".","Passo 2, investigar e isolar: \"O que especificamente te preocupa?\" e, quando couber, \"Se isso estivesse resolvido, você avançaria?\". Nunca pule este passo.","Passo 3, endereçar: responda exatamente ao que foi revelado, com mecanismo e número real, nunca com promessa.","Passo 4, agir: próximo passo concreto, de preferência com duas opções de horário.","No máximo um reforço. Na segunda recusa, recue: registre o desfecho com a data que o cliente deu e deixe para o follow-up.","Registre a objeção e a data no desfecho. Cliente que pediu para falar depois vai para \"Aguardando retorno\" com a data dele, nunca sem data."],"na_vida_real":{"caso":"Caso F da Casoteca: \"Já fui aprovado em outra construtora\" (1:1 de gestão, abr/2026).","o_que_foi_dito":"Na linha de: \"Cada projeto tem a sua avaliação, de cada unidade. Pode ser que aqui seja diferente da análise que você fez na outra construtora, pra mais ou pra menos. Eu só vou saber de verdade se você me mandar a documentação.\"","resultado":"A corretora não discutiu o valor da outra aprovação nem prometeu igualar. Validou, explicou o mecanismo e transformou a objeção num pedido de documento. A resposta virou modelo para o time.","fonte":"Casoteca SMQ, caso F (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"O cliente diz \"está caro\"","texto":"Entendo, e é bom você olhar isso com cuidado. Caro comparado a quê: ao seu aluguel, a outra opção que você viu ou ao que você imaginava pagar?","por_que_funciona":"Valida sem rebater e investiga com três opções, o que ajuda o cliente a dizer onde dói."},{"canal":"Ligação","situacao":"Isolar a objeção antes de responder","texto":"Deixa eu entender direitinho: se a entrada coubesse no seu bolso, tem mais alguma coisa que te impediria de avançar?","por_que_funciona":"Isola a objeção real. Se ele diz \"não\", você sabe exatamente o que precisa resolver."},{"canal":"WhatsApp","situacao":"Segunda recusa: recuar com data","texto":"Combinado, [nome], respeito o seu tempo. Te chamo na quinta às 19h pra gente ver como ficou, pode ser?","por_que_funciona":"Recua sem sumir: o reforço já foi feito, e o próximo contato fica marcado com o cliente."}],"erros_que_matam":[{"erro":"Pular a investigação e disparar argumentos","custo":"Você trata a objeção imaginada e o cliente sente que não foi ouvido","correcao":"Uma pergunta antes de qualquer resposta"},{"erro":"Usar \"mas\" na validação (\"entendo, mas...\")","custo":"O \"mas\" apaga a validação e vira discussão","correcao":"Trocar por \"e\": \"faz sentido, e por isso...\""},{"erro":"Insistir três, quatro vezes","custo":"Pressão queima o relacionamento e o cliente some","correcao":"Um reforço no máximo; depois, recuar com data"},{"erro":"Aceitar \"vou pensar\" sem horário","custo":"Tempo é 86,4% das objeções; sem data, o cliente esfria","correcao":"Fechar sempre com duas opções ou com a data que o cliente deu"}],"no_crm":{"tela":"Fila Única e ficha do cliente","acao":"Registrar a objeção no desfecho e, se o cliente pediu prazo, mover para \"Aguardando retorno\" com a data dele","campo":"Desfecho, texto da objeção, próximo passo e data","regra":"O prazo que o cliente deu suspende a régua; cliente em \"Aguardando retorno\" nunca fica sem data"},"frase_ancora":"Pergunta antes da resposta. Horário antes do tchau.","checagem_rapida":[{"pergunta":"Quais são os 4 passos do protocolo?","resposta":"Validar, investigar e isolar, endereçar e agir."},{"pergunta":"Quantos reforços você faz antes de recuar?","resposta":"No máximo um. Na segunda recusa, recue e registre a data do cliente."},{"pergunta":"Qual pergunta isola a objeção?","resposta":"\"Se isso estivesse resolvido, você avançaria?\""}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M19-A3', 3, 'Tempo e decisor: as objeções que são quase nove em cada dez', 'texto',
  '"Tô sem tempo essa semana." O corretor comum responde "sem problema, quando você puder me chama". O cliente nunca chama. O corretor SMQ responde com sábado às 10h ou domingo às 14h.

### Por que importa

Tempo é 86,4% das objeções da casa. Cada "depois" sem data é um cliente que esfria sozinho: quem não respondeu em 24 horas e recebeu follow-up voltou em 22,3%; sem follow-up, 0,7% (conversas do robô, jul a set/2026). A data combinada é o que traz o cliente de volta.

### O conceito

"Depois" é uma porta entreaberta. Se você vai embora, ela fecha com o vento. Se você deixa um calço (dia e hora), ela continua aberta quando você voltar.

### O método SMQ, passo a passo

1. Objeção 1, "agora não", "depois", "não é o momento" (tempo): "Pra eu não te chamar na hora errada: o que precisa acontecer pra ser o momento?" Se houver prazo, registre e respeite. Se não houver, lembre que a análise é gratuita e não compromete. Ação: "Te chamo na [data que ele disse] às 19h, pode ser?"
2. Objeção 2, "vou pensar" (falsa): "O que você ainda precisa analisar: a parcela, a região ou alguém que precisa ver junto?" Endereçe o que aparecer. Ação: "10 minutinhos com vocês dois amanhã às 19h ou sábado de manhã?"
3. Objeção 3, "vou esperar a obra ficar pronta", "ano que vem eu compro" (tempo): na planta, a parcela cheia do financiamento começa depois da entrega; durante a obra o cliente paga o fluxo combinado da entrada e, se o financiamento já estiver assinado, os encargos da fase de obra. Confirme o modelo do empreendimento e use só a tabela real. Ação: simulação com o cronograma real.
4. Objeção 4, "tô sem tempo essa semana" (tempo): "Por isso a visita é rápida, leva de 20 a 30 minutos." Ação: "Sábado às 10h ou domingo às 14h?"
5. Objeção 8, "prefiro alugar" (tempo): "O que te faz preferir o aluguel hoje: a flexibilidade, a dúvida da aprovação ou outra coisa?" Faça ao vivo a conta do aluguel dele em 10 anos. Ação: simulação lado a lado.
6. Objeção 9, "preciso falar com meu marido ou esposa" (real): "Faz todo sentido, é decisão de casal. Justamente por isso o ideal é eu conversar com vocês dois juntos." Ação: "Hoje às 19h por vídeo ou sábado no estande?" Nunca tente fechar com metade do casal.
7. Na ligação de primeiro contato: "não posso falar agora" → "Te ligo hoje às 18h ou amanhã às 9h?"; "já tenho corretor" → "Que ótimo. Só como segunda opinião: você já sabe quanto aprova e se tem subsídio no seu perfil?"

### Na vida real

**O caso:** A visita que ninguém confirmou (jul/2026, anônimo).

**O que foi dito:** Handoff com visita marcada para um sábado. O corretor não fez contato em 9 dias. Na confirmação automática da véspera, a cliente respondeu: "preciso reagendar".

**O que aconteceu:** A correção foi responder na hora com duas opções concretas e marcar o agendamento como remarcado. A lição: "preciso reagendar" é objeção de tempo, e objeção de tempo se resolve com horário, não com "me avisa quando puder".

### Scripts prontos

#### WhatsApp · "Vou pensar" depois da visita

> Claro, [nome], é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?

**Por que funciona:** Transforma o pretexto numa objeção concreta, que pode ser endereçada.

#### Ligação · Decisor ausente

> Faz todo sentido, é decisão de casal. Justamente por isso o ideal é eu conversar com vocês dois juntos. Fica melhor hoje às 19h por vídeo ou sábado às 10h no estande?

**Por que funciona:** Traz o decisor para a conversa em vez de tentar fechar com metade do casal.

#### Ligação · "Não posso falar agora" no primeiro contato

> Sem problema! Te ligo hoje às 18h ou amanhã às 9h, qual fica melhor?

**Por que funciona:** Respeita o momento e já deixa o retorno marcado pelo próprio cliente.

### Erros que matam a venda

- **"Claro, sem pressa! Estarei aqui."**  
  Quanto custa: Encerramento passivo: nenhum retorno nas conversas auditadas  
  Correção: Registrar o prazo e propor data: "Te chamo quinta às 19h?"
- **Tentar fechar com metade do casal**  
  Quanto custa: Visita sem decisor e venda adiada  
  Correção: Conversa com os dois, com duas opções de horário
- **Dizer "começa a pagar só quando fica pronto"**  
  Quanto custa: O cliente descobre o fluxo de obra depois e se sente enganado  
  Correção: Separar fluxo da entrada durante a obra e parcela do financiamento

### No CRM

- **Tela:** Fila Única e Follow-Up
- **Ação:** Registrar o desfecho com a data combinada; cliente que pediu prazo vai para "Aguardando retorno"
- **Campo:** Próximo passo e data
- **Regra:** O prazo que o cliente deu suspende a régua; sem prazo, a régua de 13 toques segue

### Frase-âncora

> **Pergunta aberta devolve "vou pensar". Duas opções devolvem um dia.**

### Checagem rápida

1. Qual é a primeira pergunta para "agora não é o momento"?  
   Resposta: "O que precisa acontecer pra ser o momento?"
2. O que você responde a "preciso falar com a minha esposa"?  
   Resposta: Que o ideal é conversar com os dois juntos, com duas opções de horário (vídeo hoje ou estande no sábado).',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Tô sem tempo essa semana.\" O corretor comum responde \"sem problema, quando você puder me chama\". O cliente nunca chama. O corretor SMQ responde com sábado às 10h ou domingo às 14h.","por_que_importa":"Tempo é 86,4% das objeções da casa. Cada \"depois\" sem data é um cliente que esfria sozinho: quem não respondeu em 24 horas e recebeu follow-up voltou em 22,3%; sem follow-up, 0,7% (conversas do robô, jul a set/2026). A data combinada é o que traz o cliente de volta.","conceito":"\"Depois\" é uma porta entreaberta. Se você vai embora, ela fecha com o vento. Se você deixa um calço (dia e hora), ela continua aberta quando você voltar.","metodo":["Objeção 1, \"agora não\", \"depois\", \"não é o momento\" (tempo): \"Pra eu não te chamar na hora errada: o que precisa acontecer pra ser o momento?\" Se houver prazo, registre e respeite. Se não houver, lembre que a análise é gratuita e não compromete. Ação: \"Te chamo na [data que ele disse] às 19h, pode ser?\"","Objeção 2, \"vou pensar\" (falsa): \"O que você ainda precisa analisar: a parcela, a região ou alguém que precisa ver junto?\" Endereçe o que aparecer. Ação: \"10 minutinhos com vocês dois amanhã às 19h ou sábado de manhã?\"","Objeção 3, \"vou esperar a obra ficar pronta\", \"ano que vem eu compro\" (tempo): na planta, a parcela cheia do financiamento começa depois da entrega; durante a obra o cliente paga o fluxo combinado da entrada e, se o financiamento já estiver assinado, os encargos da fase de obra. Confirme o modelo do empreendimento e use só a tabela real. Ação: simulação com o cronograma real.","Objeção 4, \"tô sem tempo essa semana\" (tempo): \"Por isso a visita é rápida, leva de 20 a 30 minutos.\" Ação: \"Sábado às 10h ou domingo às 14h?\"","Objeção 8, \"prefiro alugar\" (tempo): \"O que te faz preferir o aluguel hoje: a flexibilidade, a dúvida da aprovação ou outra coisa?\" Faça ao vivo a conta do aluguel dele em 10 anos. Ação: simulação lado a lado.","Objeção 9, \"preciso falar com meu marido ou esposa\" (real): \"Faz todo sentido, é decisão de casal. Justamente por isso o ideal é eu conversar com vocês dois juntos.\" Ação: \"Hoje às 19h por vídeo ou sábado no estande?\" Nunca tente fechar com metade do casal.","Na ligação de primeiro contato: \"não posso falar agora\" → \"Te ligo hoje às 18h ou amanhã às 9h?\"; \"já tenho corretor\" → \"Que ótimo. Só como segunda opinião: você já sabe quanto aprova e se tem subsídio no seu perfil?\""],"na_vida_real":{"caso":"A visita que ninguém confirmou (jul/2026, anônimo).","o_que_foi_dito":"Handoff com visita marcada para um sábado. O corretor não fez contato em 9 dias. Na confirmação automática da véspera, a cliente respondeu: \"preciso reagendar\".","resultado":"A correção foi responder na hora com duas opções concretas e marcar o agendamento como remarcado. A lição: \"preciso reagendar\" é objeção de tempo, e objeção de tempo se resolve com horário, não com \"me avisa quando puder\".","fonte":"Casos da era do CRM (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"\"Vou pensar\" depois da visita","texto":"Claro, [nome], é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?","por_que_funciona":"Transforma o pretexto numa objeção concreta, que pode ser endereçada."},{"canal":"Ligação","situacao":"Decisor ausente","texto":"Faz todo sentido, é decisão de casal. Justamente por isso o ideal é eu conversar com vocês dois juntos. Fica melhor hoje às 19h por vídeo ou sábado às 10h no estande?","por_que_funciona":"Traz o decisor para a conversa em vez de tentar fechar com metade do casal."},{"canal":"Ligação","situacao":"\"Não posso falar agora\" no primeiro contato","texto":"Sem problema! Te ligo hoje às 18h ou amanhã às 9h, qual fica melhor?","por_que_funciona":"Respeita o momento e já deixa o retorno marcado pelo próprio cliente."}],"erros_que_matam":[{"erro":"\"Claro, sem pressa! Estarei aqui.\"","custo":"Encerramento passivo: nenhum retorno nas conversas auditadas","correcao":"Registrar o prazo e propor data: \"Te chamo quinta às 19h?\""},{"erro":"Tentar fechar com metade do casal","custo":"Visita sem decisor e venda adiada","correcao":"Conversa com os dois, com duas opções de horário"},{"erro":"Dizer \"começa a pagar só quando fica pronto\"","custo":"O cliente descobre o fluxo de obra depois e se sente enganado","correcao":"Separar fluxo da entrada durante a obra e parcela do financiamento"}],"no_crm":{"tela":"Fila Única e Follow-Up","acao":"Registrar o desfecho com a data combinada; cliente que pediu prazo vai para \"Aguardando retorno\"","campo":"Próximo passo e data","regra":"O prazo que o cliente deu suspende a régua; sem prazo, a régua de 13 toques segue"},"frase_ancora":"Pergunta aberta devolve \"vou pensar\". Duas opções devolvem um dia.","checagem_rapida":[{"pergunta":"Qual é a primeira pergunta para \"agora não é o momento\"?","resposta":"\"O que precisa acontecer pra ser o momento?\""},{"pergunta":"O que você responde a \"preciso falar com a minha esposa\"?","resposta":"Que o ideal é conversar com os dois juntos, com duas opções de horário (vídeo hoje ou estande no sábado)."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M19-A4', 4, 'Dinheiro e crédito: entrada, parcela e aprovação sem promessa', 'texto',
  '"Não tenho entrada." Muito corretor desiste aqui, e outro tanto promete "entrada zero" ou "o subsídio cobre". Os dois perdem a venda: um agora, o outro na análise.

### Por que importa

A trava que mais mata venda no MCMV é o caixa da entrada, não a parcela. Nos produtos de R$ 270 mil a R$ 360 mil, a parcela ficava entre 15% e 21% da renda nos casos estudados (ago/2026). Quem faz a conta de verdade com o cliente transforma o medo em plano; quem promete transforma a análise em decepção.

### O conceito

A entrada é um quebra-cabeça com peças conhecidas: o preço, o que a Caixa financia, o FGTS, o subsídio quando existe e o que a construtora parcela até as chaves. Você não inventa peça; você monta com o cliente as peças que ele tem.

### O método SMQ, passo a passo

1. Objeção 5, "não tenho entrada" (dúvida): entrada = preço menos o que a Caixa financia, menos o FGTS (com 3 anos de registro) e menos o subsídio (se o perfil tiver). O que sobra, em muitos lançamentos, se parcela com a construtora até as chaves, dentro da condição da campanha. Nunca "entrada zero". Ação: "Me passa 2 números e eu te mostro agora?"
2. Correção do material antigo: subsídio não cobre a entrada. Ele existe na F1 e no início da F2, varia com a renda e só se confirma na análise; F3 e F4 não têm subsídio.
3. Objeção 6, "não sei se aprovo" (medo): "Esse medo tem cura: em vez de especular, a gente descobre. A análise é gratuita e sem compromisso. Pelo seu perfil você tem condições, e quem confirma é a Caixa." Ação: análise com documento ou visita.
4. Objeção 7, "a parcela está alta", "está caro" (valor): "Alta em relação a quê?" Compare com o aluguel (parcela fixa na PRICE contra aluguel que sobe todo ano), com outra planta ou outro produto. Ação: nova simulação.
5. Objeção 12, "tenho restrição no nome" (dúvida): depende do tipo e do valor e não é o fim da linha; pré-análise com o correspondente antes de o cliente quitar qualquer coisa. Leia a negação no fim da frase: "nome tá limpo não" quer dizer que não está limpo. Nunca "vai aprovar mesmo com restrição".
6. Objeção 13, "sou autônomo", "trabalho com aplicativo, conta?" (dúvida): autônomo e MEI comprovam renda; a renda de motorista e entregador de aplicativo passou a contar na análise; renda 100% informal, formalizar ou compor. Nunca descarte.
7. Objeção 14, "não tenho FGTS", "não quero mexer no FGTS" (dúvida): o FGTS ajuda, mas não é obrigatório; quem usa não perde, ele vira parte do apartamento e continua sendo depositado todo mês. Ação: simulação com e sem FGTS.
8. Objeção 17, "já fui aprovado em outra construtora com valor X" (dúvida): cada projeto tem a sua avaliação, pode dar mais ou menos; só se sabe com a documentação. Ação: pedir documento.
9. Objeção 20, "o laudo veio abaixo e a entrada ficou alta" (real, F3 e F4): a Caixa financia até 80% do menor valor entre preço e laudo. Mostre a entrada real e o parcelamento com a construtora; esforço mensal acima de 30% da renda é plano B. Ação: outro produto ou nova condição.

### Na vida real

**O caso:** Caso A da Casoteca: lançamento na zona oeste (diretor, jan/2026).

**O que foi dito:** O casal escreveu: "o que pega é que não temos uma entrada boa". A resposta não foi desconto nem promessa: foi mecanismo, o parcelamento da entrada com a construtora e o uso do FGTS, mostrados com a conta do próprio casal.

**O que aconteceu:** A objeção de entrada virou conversa de planejamento, e a visita foi marcada antes da abertura de vendas. A lição: a entrada se resolve com conta, não com desconto.

### Scripts prontos

#### Ligação · "Não tenho entrada"

> Vamos fazer a conta de verdade? A entrada é o preço menos o que a Caixa financia, menos o seu FGTS se você tiver 3 anos de registro. O que sobrar, nesse lançamento, a construtora parcela até as chaves pela condição da campanha. Me passa quanto vocês ganham juntos e se têm FGTS, que eu te mostro agora.

**Por que funciona:** Troca o medo por uma conta com peças reais, sem prometer entrada zero, e já pede os dados que faltam.

#### WhatsApp · "Nome tá limpo não"

> Obrigado por me contar, [nome]. Isso não é o fim da linha: depende do tipo e do valor. Antes de você quitar qualquer coisa, a gente passa uma pré-análise gratuita com o correspondente pra ver o cenário. Te ligo às 19h pra te explicar?

**Por que funciona:** Lê a negação certa, acolhe sem prometer e leva para a ligação com horário.

#### Ligação · "Não quero mexer no meu FGTS"

> Faz sentido cuidar dele. Só pra você decidir sabendo: você não perde o FGTS, ele vira parte do seu apartamento e continua sendo depositado todo mês. Te mostro a simulação com e sem ele, e você escolhe?

**Por que funciona:** Endereça o medo real (perder o dinheiro) e devolve a decisão ao cliente, com as duas contas.

### Erros que matam a venda

- **Dizer que o subsídio cobre a entrada**  
  Quanto custa: Na F3 e na F4 não há subsídio, e na F1 e F2 o valor só sai na análise: a promessa vira decepção  
  Correção: Subsídio só depois da renda, sempre como "varia e se confirma na análise"
- **Ignorar o laudo na conta da entrada**  
  Quanto custa: Entrada de 20% virou 41,7% num caso real de ago/2026  
  Correção: Em F3 e F4, rodar o cenário de laudo 10% e 20% abaixo
- **Descartar autônomo, entregador de aplicativo ou cliente com restrição**  
  Quanto custa: Você joga fora cliente que tinha caminho  
  Correção: Lista de documentos do perfil ou pré-análise com o correspondente

### No CRM

- **Tela:** Ficha do cliente (qualificação) e pasta do cliente
- **Ação:** Registrar entrada disponível, FGTS e restrição, e anexar os documentos na pasta
- **Campo:** Campos de qualificação, observações e documentos da pasta
- **Regra:** Simulação indica, análise formal aprova; a pasta passa pelo gerente antes do correspondente

### Frase-âncora

> **Simulação indica. Análise formal aprova.**

### Checagem rápida

1. Subsídio cobre a entrada?  
   Resposta: Não. Existe só na F1 e no início da F2, varia com a renda e só se confirma na análise.
2. Sobre qual valor a Caixa financia até 80%?  
   Resposta: Sobre o menor valor entre o preço e o laudo.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Não tenho entrada.\" Muito corretor desiste aqui, e outro tanto promete \"entrada zero\" ou \"o subsídio cobre\". Os dois perdem a venda: um agora, o outro na análise.","por_que_importa":"A trava que mais mata venda no MCMV é o caixa da entrada, não a parcela. Nos produtos de R$ 270 mil a R$ 360 mil, a parcela ficava entre 15% e 21% da renda nos casos estudados (ago/2026). Quem faz a conta de verdade com o cliente transforma o medo em plano; quem promete transforma a análise em decepção.","conceito":"A entrada é um quebra-cabeça com peças conhecidas: o preço, o que a Caixa financia, o FGTS, o subsídio quando existe e o que a construtora parcela até as chaves. Você não inventa peça; você monta com o cliente as peças que ele tem.","metodo":["Objeção 5, \"não tenho entrada\" (dúvida): entrada = preço menos o que a Caixa financia, menos o FGTS (com 3 anos de registro) e menos o subsídio (se o perfil tiver). O que sobra, em muitos lançamentos, se parcela com a construtora até as chaves, dentro da condição da campanha. Nunca \"entrada zero\". Ação: \"Me passa 2 números e eu te mostro agora?\"","Correção do material antigo: subsídio não cobre a entrada. Ele existe na F1 e no início da F2, varia com a renda e só se confirma na análise; F3 e F4 não têm subsídio.","Objeção 6, \"não sei se aprovo\" (medo): \"Esse medo tem cura: em vez de especular, a gente descobre. A análise é gratuita e sem compromisso. Pelo seu perfil você tem condições, e quem confirma é a Caixa.\" Ação: análise com documento ou visita.","Objeção 7, \"a parcela está alta\", \"está caro\" (valor): \"Alta em relação a quê?\" Compare com o aluguel (parcela fixa na PRICE contra aluguel que sobe todo ano), com outra planta ou outro produto. Ação: nova simulação.","Objeção 12, \"tenho restrição no nome\" (dúvida): depende do tipo e do valor e não é o fim da linha; pré-análise com o correspondente antes de o cliente quitar qualquer coisa. Leia a negação no fim da frase: \"nome tá limpo não\" quer dizer que não está limpo. Nunca \"vai aprovar mesmo com restrição\".","Objeção 13, \"sou autônomo\", \"trabalho com aplicativo, conta?\" (dúvida): autônomo e MEI comprovam renda; a renda de motorista e entregador de aplicativo passou a contar na análise; renda 100% informal, formalizar ou compor. Nunca descarte.","Objeção 14, \"não tenho FGTS\", \"não quero mexer no FGTS\" (dúvida): o FGTS ajuda, mas não é obrigatório; quem usa não perde, ele vira parte do apartamento e continua sendo depositado todo mês. Ação: simulação com e sem FGTS.","Objeção 17, \"já fui aprovado em outra construtora com valor X\" (dúvida): cada projeto tem a sua avaliação, pode dar mais ou menos; só se sabe com a documentação. Ação: pedir documento.","Objeção 20, \"o laudo veio abaixo e a entrada ficou alta\" (real, F3 e F4): a Caixa financia até 80% do menor valor entre preço e laudo. Mostre a entrada real e o parcelamento com a construtora; esforço mensal acima de 30% da renda é plano B. Ação: outro produto ou nova condição."],"na_vida_real":{"caso":"Caso A da Casoteca: lançamento na zona oeste (diretor, jan/2026).","o_que_foi_dito":"O casal escreveu: \"o que pega é que não temos uma entrada boa\". A resposta não foi desconto nem promessa: foi mecanismo, o parcelamento da entrada com a construtora e o uso do FGTS, mostrados com a conta do próprio casal.","resultado":"A objeção de entrada virou conversa de planejamento, e a visita foi marcada antes da abertura de vendas. A lição: a entrada se resolve com conta, não com desconto.","fonte":"Casoteca SMQ, caso A (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"\"Não tenho entrada\"","texto":"Vamos fazer a conta de verdade? A entrada é o preço menos o que a Caixa financia, menos o seu FGTS se você tiver 3 anos de registro. O que sobrar, nesse lançamento, a construtora parcela até as chaves pela condição da campanha. Me passa quanto vocês ganham juntos e se têm FGTS, que eu te mostro agora.","por_que_funciona":"Troca o medo por uma conta com peças reais, sem prometer entrada zero, e já pede os dados que faltam."},{"canal":"WhatsApp","situacao":"\"Nome tá limpo não\"","texto":"Obrigado por me contar, [nome]. Isso não é o fim da linha: depende do tipo e do valor. Antes de você quitar qualquer coisa, a gente passa uma pré-análise gratuita com o correspondente pra ver o cenário. Te ligo às 19h pra te explicar?","por_que_funciona":"Lê a negação certa, acolhe sem prometer e leva para a ligação com horário."},{"canal":"Ligação","situacao":"\"Não quero mexer no meu FGTS\"","texto":"Faz sentido cuidar dele. Só pra você decidir sabendo: você não perde o FGTS, ele vira parte do seu apartamento e continua sendo depositado todo mês. Te mostro a simulação com e sem ele, e você escolhe?","por_que_funciona":"Endereça o medo real (perder o dinheiro) e devolve a decisão ao cliente, com as duas contas."}],"erros_que_matam":[{"erro":"Dizer que o subsídio cobre a entrada","custo":"Na F3 e na F4 não há subsídio, e na F1 e F2 o valor só sai na análise: a promessa vira decepção","correcao":"Subsídio só depois da renda, sempre como \"varia e se confirma na análise\""},{"erro":"Ignorar o laudo na conta da entrada","custo":"Entrada de 20% virou 41,7% num caso real de ago/2026","correcao":"Em F3 e F4, rodar o cenário de laudo 10% e 20% abaixo"},{"erro":"Descartar autônomo, entregador de aplicativo ou cliente com restrição","custo":"Você joga fora cliente que tinha caminho","correcao":"Lista de documentos do perfil ou pré-análise com o correspondente"}],"no_crm":{"tela":"Ficha do cliente (qualificação) e pasta do cliente","acao":"Registrar entrada disponível, FGTS e restrição, e anexar os documentos na pasta","campo":"Campos de qualificação, observações e documentos da pasta","regra":"Simulação indica, análise formal aprova; a pasta passa pelo gerente antes do correspondente"},"frase_ancora":"Simulação indica. Análise formal aprova.","checagem_rapida":[{"pergunta":"Subsídio cobre a entrada?","resposta":"Não. Existe só na F1 e no início da F2, varia com a renda e só se confirma na análise."},{"pergunta":"Sobre qual valor a Caixa financia até 80%?","resposta":"Sobre o menor valor entre o preço e o laudo."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M19-A5', 5, 'Confiança, produto e comparação: medo de golpe, de planta e do concorrente', 'texto',
  '"Isso é golpe?" Se essa pergunta te irrita, você ainda não entendeu o cliente de primeiro imóvel. Ele não está te ofendendo. Ele está se protegendo, e está certo.

### Por que importa

O medo de golpe é o maior concorrente da SMQ, e a planta assusta quem nunca comprou. Objeção de credibilidade escrita pelo cliente virou avanço em 66,7% das vezes (jul a set/2026): quem pergunta "é golpe?" ainda quer comprar, só precisa de prova. E toda comparação honesta com o concorrente te deixa mais forte, não mais fraco.

### O conceito

Confiança é uma ponte que se constrói tábua por tábua: o nome certo, o número de quem liga, o endereço do escritório, o histórico da construtora, o memorial. Discurso não é tábua. Prova é.

### O método SMQ, passo a passo

1. Objeção 10, "isso é golpe?" (credibilidade): valide o medo e use as âncoras: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar. Prova: Instagram oficial, endereço das sedes, convite ao escritório ou ao estande.
2. Objeção 11, "não quero mandar documento agora" (medo): "Super entendo, documento é coisa séria." Sem insistir, mude para a visita com duas opções.
3. Objeção 15, "tenho medo da planta, da construtora atrasar" (medo): histórico real de entregas da construtora, tolerância de até 180 dias prevista em lei e no contrato e, quando houver, o patrimônio de afetação. Ação: visita a um empreendimento entregue.
4. Objeção 23, "e se a obra atrasar?" (medo): data do contrato, tolerância de até 180 dias, o que o comprador pode exigir depois dela e o histórico da construtora. Nunca garantir prazo.
5. Objeção 25, "tem seguro?", "e se a construtora quebrar?" (credibilidade): patrimônio de afetação quando houver (garantia legal, não seguro), histórico da construtora e o seguro obrigatório do financiamento, que cobre morte e invalidez e não cobre desemprego.
6. Objeção 16, "quero ver mais opções", "estou vendo com outra imobiliária" (valor): "O que está faltando pra você sentir que achou o certo?" A SMQ trabalha com várias construtoras: curadoria pelos critérios do cliente. Se já houver análise aberta em outro lugar, avise que pode ser preciso cancelar a anterior.
7. Objeção 18, "manda o link ou o book que eu vejo" (falsa ou dúvida): "Te mando sim. Só que o book não mostra quanto fica pra você. Me responde duas coisinhas e eu te mando junto com a sua parcela estimada." Investidor recebe o material na hora.
8. Objeção 19, "quero vaga", "é pequeno", "o condomínio é caro" (valor): traga para a realidade com opções (outra região, outro padrão, estacionamento mensal perto do metrô, o que o condomínio cobre), sem valor inventado.
9. Objeção 24, "quero pronto, não quero planta" (valor): os dois caminhos com números, pronto (preço de hoje, sem fluxo de obra) e planta (preço de lançamento e entrada parcelada até as chaves); existem produtos com entrega próxima.
10. Objeção 26, "achei mais barato em outro lugar" (valor): "Me mostra o que você achou? Comparo com você pelos mesmos critérios: localização, metragem, entrega, entrada e custo total." Nunca atacar concorrente.

### Na vida real

**O caso:** O golpe de set/2026 (anônimo).

**O que foi dito:** Um terceiro abordou um lead da casa se passando pela SMQ e pela Caixa. Quando o cliente perguntou, a resposta da casa repetiu as âncoras: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e a Caixa não chama cliente no WhatsApp pedindo dado.

**O que aconteceu:** O lead bloqueou o golpista e seguiu interessado na compra. A desconfiança bem tratada virou confiança na SMQ.

### Scripts prontos

#### WhatsApp · "Isso é golpe? Como sei que vocês são sérios?"

> Você está certíssimo em desconfiar, [nome]. Aqui é o [seu nome], da Seu Metro Quadrado. A análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e quem vai te ligar sou eu, deste número. Se preferir, vem conhecer o escritório: amanhã às 18h ou sábado às 10h?

**Por que funciona:** Valida o medo, identifica com clareza, repete as âncoras e oferece prova física com duas opções.

#### Ligação · "Achei mais barato em outro lugar"

> Que bom que você está pesquisando. Me mostra o que você achou? Comparo com você pelos mesmos critérios: localização, metragem, entrega, entrada e custo total. Se o outro for melhor pra você, eu te falo.

**Por que funciona:** Comparação honesta constrói autoridade; atacar o concorrente destrói.

#### Ligação · "Quero vaga perto do metrô" com orçamento de MCMV

> Entendi o que é importante pra você. Com esse orçamento, a gente tem três caminhos: um apartamento colado no metrô e um estacionamento mensal ali perto, outra região com vaga, ou outro padrão de produto, que custa mais. Qual deles faz mais sentido pra vocês?

**Por que funciona:** Traz para a realidade com opções, sem insistir e sem inventar valor (caso G).

### Erros que matam a venda

- **Ficar ofendido ou argumentar com quem pergunta se é golpe**  
  Quanto custa: Quanto mais você insiste, mais parece golpe  
  Correção: Validar, repetir as âncoras e oferecer prova física
- **Garantir o prazo de entrega**  
  Quanto custa: Promessa que pode não se cumprir e responsabilidade para a SMQ  
  Correção: Mostrar a data do contrato, a tolerância de até 180 dias e o histórico da construtora
- **Chamar patrimônio de afetação de "seguro"**  
  Quanto custa: Informação errada sobre garantia legal  
  Correção: Explicar como garantia legal e confirmar no memorial ou na matrícula se o empreendimento tem
- **Falar mal do concorrente**  
  Quanto custa: O cliente passa a desconfiar de você também  
  Correção: Comparar pelos mesmos critérios, com números

### No CRM

- **Tela:** Documentação & Projetos (ficha do produto) e ficha do cliente
- **Ação:** Consultar histórico da construtora, entrega, vaga e condição no catálogo antes de responder; registrar a objeção no desfecho
- **Campo:** Ficha técnica do produto e texto da objeção
- **Regra:** Produto só da fonte oficial (Documentação & Projetos), nunca da memória; "vou confirmar" sempre com prazo e retorno

### Frase-âncora

> **Credibilidade não se argumenta. Se demonstra.**

### Checagem rápida

1. Quais são as 4 âncoras antigolpe?  
   Resposta: A análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar.
2. Patrimônio de afetação é seguro?  
   Resposta: Não. É garantia legal que separa o empreendimento das outras dívidas da incorporadora; confirme no memorial ou na matrícula se ele tem.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Isso é golpe?\" Se essa pergunta te irrita, você ainda não entendeu o cliente de primeiro imóvel. Ele não está te ofendendo. Ele está se protegendo, e está certo.","por_que_importa":"O medo de golpe é o maior concorrente da SMQ, e a planta assusta quem nunca comprou. Objeção de credibilidade escrita pelo cliente virou avanço em 66,7% das vezes (jul a set/2026): quem pergunta \"é golpe?\" ainda quer comprar, só precisa de prova. E toda comparação honesta com o concorrente te deixa mais forte, não mais fraco.","conceito":"Confiança é uma ponte que se constrói tábua por tábua: o nome certo, o número de quem liga, o endereço do escritório, o histórico da construtora, o memorial. Discurso não é tábua. Prova é.","metodo":["Objeção 10, \"isso é golpe?\" (credibilidade): valide o medo e use as âncoras: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar. Prova: Instagram oficial, endereço das sedes, convite ao escritório ou ao estande.","Objeção 11, \"não quero mandar documento agora\" (medo): \"Super entendo, documento é coisa séria.\" Sem insistir, mude para a visita com duas opções.","Objeção 15, \"tenho medo da planta, da construtora atrasar\" (medo): histórico real de entregas da construtora, tolerância de até 180 dias prevista em lei e no contrato e, quando houver, o patrimônio de afetação. Ação: visita a um empreendimento entregue.","Objeção 23, \"e se a obra atrasar?\" (medo): data do contrato, tolerância de até 180 dias, o que o comprador pode exigir depois dela e o histórico da construtora. Nunca garantir prazo.","Objeção 25, \"tem seguro?\", \"e se a construtora quebrar?\" (credibilidade): patrimônio de afetação quando houver (garantia legal, não seguro), histórico da construtora e o seguro obrigatório do financiamento, que cobre morte e invalidez e não cobre desemprego.","Objeção 16, \"quero ver mais opções\", \"estou vendo com outra imobiliária\" (valor): \"O que está faltando pra você sentir que achou o certo?\" A SMQ trabalha com várias construtoras: curadoria pelos critérios do cliente. Se já houver análise aberta em outro lugar, avise que pode ser preciso cancelar a anterior.","Objeção 18, \"manda o link ou o book que eu vejo\" (falsa ou dúvida): \"Te mando sim. Só que o book não mostra quanto fica pra você. Me responde duas coisinhas e eu te mando junto com a sua parcela estimada.\" Investidor recebe o material na hora.","Objeção 19, \"quero vaga\", \"é pequeno\", \"o condomínio é caro\" (valor): traga para a realidade com opções (outra região, outro padrão, estacionamento mensal perto do metrô, o que o condomínio cobre), sem valor inventado.","Objeção 24, \"quero pronto, não quero planta\" (valor): os dois caminhos com números, pronto (preço de hoje, sem fluxo de obra) e planta (preço de lançamento e entrada parcelada até as chaves); existem produtos com entrega próxima.","Objeção 26, \"achei mais barato em outro lugar\" (valor): \"Me mostra o que você achou? Comparo com você pelos mesmos critérios: localização, metragem, entrega, entrada e custo total.\" Nunca atacar concorrente."],"na_vida_real":{"caso":"O golpe de set/2026 (anônimo).","o_que_foi_dito":"Um terceiro abordou um lead da casa se passando pela SMQ e pela Caixa. Quando o cliente perguntou, a resposta da casa repetiu as âncoras: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e a Caixa não chama cliente no WhatsApp pedindo dado.","resultado":"O lead bloqueou o golpista e seguiu interessado na compra. A desconfiança bem tratada virou confiança na SMQ.","fonte":"Casos da era do CRM (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"\"Isso é golpe? Como sei que vocês são sérios?\"","texto":"Você está certíssimo em desconfiar, [nome]. Aqui é o [seu nome], da Seu Metro Quadrado. A análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e quem vai te ligar sou eu, deste número. Se preferir, vem conhecer o escritório: amanhã às 18h ou sábado às 10h?","por_que_funciona":"Valida o medo, identifica com clareza, repete as âncoras e oferece prova física com duas opções."},{"canal":"Ligação","situacao":"\"Achei mais barato em outro lugar\"","texto":"Que bom que você está pesquisando. Me mostra o que você achou? Comparo com você pelos mesmos critérios: localização, metragem, entrega, entrada e custo total. Se o outro for melhor pra você, eu te falo.","por_que_funciona":"Comparação honesta constrói autoridade; atacar o concorrente destrói."},{"canal":"Ligação","situacao":"\"Quero vaga perto do metrô\" com orçamento de MCMV","texto":"Entendi o que é importante pra você. Com esse orçamento, a gente tem três caminhos: um apartamento colado no metrô e um estacionamento mensal ali perto, outra região com vaga, ou outro padrão de produto, que custa mais. Qual deles faz mais sentido pra vocês?","por_que_funciona":"Traz para a realidade com opções, sem insistir e sem inventar valor (caso G)."}],"erros_que_matam":[{"erro":"Ficar ofendido ou argumentar com quem pergunta se é golpe","custo":"Quanto mais você insiste, mais parece golpe","correcao":"Validar, repetir as âncoras e oferecer prova física"},{"erro":"Garantir o prazo de entrega","custo":"Promessa que pode não se cumprir e responsabilidade para a SMQ","correcao":"Mostrar a data do contrato, a tolerância de até 180 dias e o histórico da construtora"},{"erro":"Chamar patrimônio de afetação de \"seguro\"","custo":"Informação errada sobre garantia legal","correcao":"Explicar como garantia legal e confirmar no memorial ou na matrícula se o empreendimento tem"},{"erro":"Falar mal do concorrente","custo":"O cliente passa a desconfiar de você também","correcao":"Comparar pelos mesmos critérios, com números"}],"no_crm":{"tela":"Documentação & Projetos (ficha do produto) e ficha do cliente","acao":"Consultar histórico da construtora, entrega, vaga e condição no catálogo antes de responder; registrar a objeção no desfecho","campo":"Ficha técnica do produto e texto da objeção","regra":"Produto só da fonte oficial (Documentação & Projetos), nunca da memória; \"vou confirmar\" sempre com prazo e retorno"},"frase_ancora":"Credibilidade não se argumenta. Se demonstra.","checagem_rapida":[{"pergunta":"Quais são as 4 âncoras antigolpe?","resposta":"A análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar."},{"pergunta":"Patrimônio de afetação é seguro?","resposta":"Não. É garantia legal que separa o empreendimento das outras dívidas da incorporadora; confirme no memorial ou na matrícula se ele tem."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M19-A6', 6, 'Desconto, contrato e urgência: negociar dentro da campanha e só com verdade', 'texto',
  '"Se tiver desconto eu fecho agora." É o teste mais antigo do estande. Quem cai dá o que não pode, promete o que não cumpre e ainda ensina o cliente que o preço da SMQ é negociável.

### Por que importa

Desconto fora da campanha vira promessa que não se cumpre e conflito com a construtora. E urgência falsa destrói a confiança permanentemente: o cliente que descobre que as "últimas unidades" continuam à venda nunca mais acredita em você. Negociar com regra protege o cliente, a venda e a SMQ.

### O conceito

Tabela de preço é como placa de pedágio: é igual para todo mundo, e isso é justo. O que você pode fazer é mostrar a melhor rota, que é a condição da campanha. Mudar o valor do pedágio só quem tem a alçada.

### O método SMQ, passo a passo

1. Objeção 21, "consegue um desconto?" (valor): "O preço de tabela é o mesmo pra todo mundo, e isso também te protege. O que eu consigo montar é a melhor condição da campanha." A condição é o parcelamento da entrada e, quando a campanha oferece, ITBI e documentação. Desconto extra ou condição fora da campanha: só o gerente ou o diretor decidem, e você dá retorno com hora marcada.
2. Dar desconto sem pedir algo em troca é erro de negociação. Quem tem a alçada decide se e como.
3. Objeção 22, "e se eu desistir?", "como é o distrato?" (medo): "Pergunta certa." Comprando no estande, a lei dá 7 dias para desistir com devolução de tudo; depois disso, o quadro-resumo do contrato mostra quanto pode ser retido, dentro dos limites da lei. Leia o quadro-resumo junto com o cliente. Dúvida jurídica específica vai para o gerente. Nunca "é só desistir" nem "você perde tudo".
4. Correção do material antigo: a propriedade não passa no primeiro pagamento. Ela passa com o registro no cartório; até lá, o que vale é o contrato e o quadro-resumo.
5. Correção do material antigo: não diga "a reserva não compromete". Para a unidade, diga "garantir" ou "bloquear a unidade", e explique a regra real da construtora; o que é gratuito e não compromete é a análise de crédito. Qualquer ato ou sinal só por canal oficial da construtora ou da imobiliária, nunca em conta de pessoa física.
6. Urgência só quando for verdade e verificável: data de abertura de vendas, unidades restantes na tabela, prazo real de uma condição. Nada de "últimas unidades", "só hoje" ou "Pix hoje" como técnica.

### Na vida real

**O caso:** Caso C da Casoteca: dois meses de espera, venda salva pela verdade (diretor, fev a abr/2025).

**O que foi dito:** A cliente esperou a unidade por dois meses, sempre informada de como o sistema da construtora funcionava. Quando a unidade voltou, ITBI e documentação foram negociados como compensação pela espera, por quem tinha a alçada para decidir, e não como desconto dado para fechar.

**O que aconteceu:** Aprovação às 10h19 e assinatura horas depois. A condição especial existiu, mas veio de quem podia decidir e com motivo claro. Exemplo de mecanismo, não de preço atual.

### Scripts prontos

#### Visita · "Se tiver desconto eu fecho agora"

> O preço de tabela é o mesmo pra todo mundo, e isso também te protege. O que eu consigo é montar a melhor condição da campanha pra você: [condição da campanha]. Se a gente precisar ir além disso, eu levo ao meu gerente hoje e te dou retorno até as [hora]. Te mostro a condição montada agora?

**Por que funciona:** Negocia dentro da alçada, não fecha a porta para o pedido e marca o retorno com hora (persona P14).

#### Visita · "E se eu desistir depois?"

> Pergunta certa, e é bom você saber antes. Comprando aqui no estande, a lei te dá 7 dias pra desistir com devolução de tudo. Depois disso, o quadro-resumo do contrato mostra quanto pode ser retido, dentro do limite da lei. Vamos ler esse quadro juntos agora?

**Por que funciona:** Responde com a regra e com o documento, sem minimizar nem assustar.

#### WhatsApp · Urgência verdadeira antes da abertura de vendas

> [nome], a abertura de vendas do [empreendimento] é na segunda-feira, e a tabela de lançamento é a de hoje. Se a gente conseguir conhecer antes, você escolhe a unidade com calma. Fica melhor sábado às 10h ou às 14h?

**Por que funciona:** Urgência baseada num fato verificável, com leveza e duas opções (caso A).

### Erros que matam a venda

- **Oferecer desconto ou condição fora da campanha**  
  Quanto custa: Promessa que não se cumpre e conflito com a construtora  
  Correção: Condição da campanha; o resto, gerente ou diretor com retorno marcado
- **Usar "últimas unidades" ou "só hoje" quando não é verdade**  
  Quanto custa: Credibilidade destruída de forma permanente  
  Correção: Urgência só com fato verificável: data, tabela, unidades na tabela
- **Pedir "Pix hoje pra segurar"**  
  Quanto custa: Pressão, risco de golpe e pagamento fora do canal oficial  
  Correção: Ato só por canal oficial da construtora ou da imobiliária, explicado por escrito
- **Dizer "é só desistir" ou "você perde tudo"**  
  Quanto custa: Informação errada sobre o contrato  
  Correção: 7 dias de arrependimento na compra em estande e o quadro-resumo

### No CRM

- **Tela:** Ficha do cliente e Documentação & Projetos (condição da campanha)
- **Ação:** Consultar a condição da campanha vigente e registrar o pedido extra do cliente e o retorno combinado
- **Campo:** Desfecho com o próximo passo "retorno do gerente" e hora
- **Regra:** Negociação só dentro da campanha; condição extra só com o gerente ou o diretor

### Frase-âncora

> **Urgência falsa destrói a confiança para sempre.**

### Checagem rápida

1. O que o corretor pode negociar sozinho?  
   Resposta: Só a condição da campanha: parcelamento da entrada e, quando a campanha oferece, ITBI e documentação.
2. Quantos dias a lei dá para desistir de uma compra feita no estande?  
   Resposta: 7 dias, com devolução de tudo o que foi pago.
3. Dê um exemplo de urgência legítima.  
   Resposta: A data real de abertura de vendas ou as unidades restantes na tabela vigente.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Se tiver desconto eu fecho agora.\" É o teste mais antigo do estande. Quem cai dá o que não pode, promete o que não cumpre e ainda ensina o cliente que o preço da SMQ é negociável.","por_que_importa":"Desconto fora da campanha vira promessa que não se cumpre e conflito com a construtora. E urgência falsa destrói a confiança permanentemente: o cliente que descobre que as \"últimas unidades\" continuam à venda nunca mais acredita em você. Negociar com regra protege o cliente, a venda e a SMQ.","conceito":"Tabela de preço é como placa de pedágio: é igual para todo mundo, e isso é justo. O que você pode fazer é mostrar a melhor rota, que é a condição da campanha. Mudar o valor do pedágio só quem tem a alçada.","metodo":["Objeção 21, \"consegue um desconto?\" (valor): \"O preço de tabela é o mesmo pra todo mundo, e isso também te protege. O que eu consigo montar é a melhor condição da campanha.\" A condição é o parcelamento da entrada e, quando a campanha oferece, ITBI e documentação. Desconto extra ou condição fora da campanha: só o gerente ou o diretor decidem, e você dá retorno com hora marcada.","Dar desconto sem pedir algo em troca é erro de negociação. Quem tem a alçada decide se e como.","Objeção 22, \"e se eu desistir?\", \"como é o distrato?\" (medo): \"Pergunta certa.\" Comprando no estande, a lei dá 7 dias para desistir com devolução de tudo; depois disso, o quadro-resumo do contrato mostra quanto pode ser retido, dentro dos limites da lei. Leia o quadro-resumo junto com o cliente. Dúvida jurídica específica vai para o gerente. Nunca \"é só desistir\" nem \"você perde tudo\".","Correção do material antigo: a propriedade não passa no primeiro pagamento. Ela passa com o registro no cartório; até lá, o que vale é o contrato e o quadro-resumo.","Correção do material antigo: não diga \"a reserva não compromete\". Para a unidade, diga \"garantir\" ou \"bloquear a unidade\", e explique a regra real da construtora; o que é gratuito e não compromete é a análise de crédito. Qualquer ato ou sinal só por canal oficial da construtora ou da imobiliária, nunca em conta de pessoa física.","Urgência só quando for verdade e verificável: data de abertura de vendas, unidades restantes na tabela, prazo real de uma condição. Nada de \"últimas unidades\", \"só hoje\" ou \"Pix hoje\" como técnica."],"na_vida_real":{"caso":"Caso C da Casoteca: dois meses de espera, venda salva pela verdade (diretor, fev a abr/2025).","o_que_foi_dito":"A cliente esperou a unidade por dois meses, sempre informada de como o sistema da construtora funcionava. Quando a unidade voltou, ITBI e documentação foram negociados como compensação pela espera, por quem tinha a alçada para decidir, e não como desconto dado para fechar.","resultado":"Aprovação às 10h19 e assinatura horas depois. A condição especial existiu, mas veio de quem podia decidir e com motivo claro. Exemplo de mecanismo, não de preço atual.","fonte":"Casoteca SMQ, caso C (seção 9.12)"},"scripts":[{"canal":"Visita","situacao":"\"Se tiver desconto eu fecho agora\"","texto":"O preço de tabela é o mesmo pra todo mundo, e isso também te protege. O que eu consigo é montar a melhor condição da campanha pra você: [condição da campanha]. Se a gente precisar ir além disso, eu levo ao meu gerente hoje e te dou retorno até as [hora]. Te mostro a condição montada agora?","por_que_funciona":"Negocia dentro da alçada, não fecha a porta para o pedido e marca o retorno com hora (persona P14)."},{"canal":"Visita","situacao":"\"E se eu desistir depois?\"","texto":"Pergunta certa, e é bom você saber antes. Comprando aqui no estande, a lei te dá 7 dias pra desistir com devolução de tudo. Depois disso, o quadro-resumo do contrato mostra quanto pode ser retido, dentro do limite da lei. Vamos ler esse quadro juntos agora?","por_que_funciona":"Responde com a regra e com o documento, sem minimizar nem assustar."},{"canal":"WhatsApp","situacao":"Urgência verdadeira antes da abertura de vendas","texto":"[nome], a abertura de vendas do [empreendimento] é na segunda-feira, e a tabela de lançamento é a de hoje. Se a gente conseguir conhecer antes, você escolhe a unidade com calma. Fica melhor sábado às 10h ou às 14h?","por_que_funciona":"Urgência baseada num fato verificável, com leveza e duas opções (caso A)."}],"erros_que_matam":[{"erro":"Oferecer desconto ou condição fora da campanha","custo":"Promessa que não se cumpre e conflito com a construtora","correcao":"Condição da campanha; o resto, gerente ou diretor com retorno marcado"},{"erro":"Usar \"últimas unidades\" ou \"só hoje\" quando não é verdade","custo":"Credibilidade destruída de forma permanente","correcao":"Urgência só com fato verificável: data, tabela, unidades na tabela"},{"erro":"Pedir \"Pix hoje pra segurar\"","custo":"Pressão, risco de golpe e pagamento fora do canal oficial","correcao":"Ato só por canal oficial da construtora ou da imobiliária, explicado por escrito"},{"erro":"Dizer \"é só desistir\" ou \"você perde tudo\"","custo":"Informação errada sobre o contrato","correcao":"7 dias de arrependimento na compra em estande e o quadro-resumo"}],"no_crm":{"tela":"Ficha do cliente e Documentação & Projetos (condição da campanha)","acao":"Consultar a condição da campanha vigente e registrar o pedido extra do cliente e o retorno combinado","campo":"Desfecho com o próximo passo \"retorno do gerente\" e hora","regra":"Negociação só dentro da campanha; condição extra só com o gerente ou o diretor"},"frase_ancora":"Urgência falsa destrói a confiança para sempre.","checagem_rapida":[{"pergunta":"O que o corretor pode negociar sozinho?","resposta":"Só a condição da campanha: parcelamento da entrada e, quando a campanha oferece, ITBI e documentação."},{"pergunta":"Quantos dias a lei dá para desistir de uma compra feita no estande?","resposta":"7 dias, com devolução de tudo o que foi pago."},{"pergunta":"Dê um exemplo de urgência legítima.","resposta":"A data real de abertura de vendas ou as unidades restantes na tabela vigente."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q01', 1, 'situacional',
  'O cliente escreve: "Agora não é o momento." Qual é a sua próxima mensagem?',
  '["\"Tudo bem, sem pressa! Quando for o momento, me chama.\"","\"Entendo. Pra eu não te chamar na hora errada: o que precisa acontecer pra ser o momento?\"","\"Mas a tabela vai subir, é melhor decidir agora.\"","\"Ok, vou te colocar como perdido então.\""]'::jsonb,
  1,
  'A B valida e investiga com uma pergunta só, e a resposta vira a data do próximo contato. A A é o encerramento passivo que não traz retorno. A C rebate com "mas" e urgência genérica. A D perde um cliente que só pediu tempo: recusa sem motivo verdadeiro não é perda.',
  'M19-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q02', 2, 'situacional',
  'Depois da visita, o cliente diz: "Gostei, mas vou pensar." O que você diz?',
  '["\"Claro! Fico no aguardo, qualquer coisa me chama.\"","\"Se fechar hoje eu consigo um desconto especial.\"","\"Claro, é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?\"","\"Não tem o que pensar, o apartamento é perfeito pra você.\""]'::jsonb,
  2,
  'A C trata "vou pensar" como o que ele costuma ser, um pretexto, e investiga o que falta. A A aceita o "vou pensar" sem horário, o erro que mais custa. A B oferece desconto fora da campanha. A D pressiona e desrespeita o cliente.',
  'M19-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q03', 3, 'situacional',
  'Na ligação, o cliente diz: "Preciso falar com a minha esposa antes." Qual é a melhor resposta?',
  '["\"Faz todo sentido, é decisão de casal. Por isso o ideal é eu conversar com vocês dois juntos. Hoje às 19h por vídeo ou sábado às 10h no estande?\"","\"Tranquilo, fecha comigo agora e depois você conta pra ela.\"","\"Ok, conversa com ela e me avisa.\"","\"Ela precisa mesmo participar? Você pode decidir sozinho.\""]'::jsonb,
  0,
  'A A trata a objeção real (decisor ausente) trazendo os dois para a conversa, com duas opções de horário. A B ensina a fechar com metade do casal, o que é proibido. A C deixa a iniciativa com o cliente, sem data. A D desrespeita o decisor.',
  'M19-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q04', 4, 'situacional',
  'No estande, o cliente diz: "Se tiver desconto eu fecho agora." A condição da campanha já foi apresentada. O que você faz?',
  '["Dá o desconto que achar razoável para não perder a venda.","Diz que não existe desconto nenhum e encerra o assunto.","Promete um desconto e depois tenta aprovar com o gerente.","Explica que a tabela é igual para todos, monta a melhor condição da campanha e, se ele quiser ir além, leva o pedido ao gerente hoje com retorno em hora marcada."]'::jsonb,
  3,
  'A D negocia dentro da alçada e marca o retorno do pedido extra (decisão de 29/09/2026). A A e a C dão ou prometem o que o corretor não pode decidir. A B fecha a porta sem mostrar a condição nem levar o pedido a quem decide.',
  'M19-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q05', 5, 'situacional',
  'O cliente pergunta: "Já me ligaram umas vinte vezes. Isso é golpe?" Qual resposta segue o protocolo?',
  '["\"Claro que não é golpe, pode confiar em mim.\"","\"Você está certíssimo em desconfiar. Aqui é o [nome], da Seu Metro Quadrado. A análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e você pode vir conhecer o escritório amanhã às 18h ou sábado às 10h.\"","\"Sou da Caixa, estou ajudando no seu financiamento.\"","\"Se você não confia, não posso fazer nada.\""]'::jsonb,
  1,
  'A B valida o medo, identifica com clareza, repete as âncoras e oferece prova física com duas opções. A A argumenta em vez de demonstrar. A C é disfarce e ainda imita o golpe. A D desiste de quem ainda queria comprar: credibilidade escrita virou avanço em 66,7% das vezes.',
  'M19-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q06', 6, 'situacional',
  'Você pediu os documentos para a análise e o cliente respondeu: "Não quero mandar documento agora." Qual é o próximo passo?',
  '["Insistir mais duas vezes explicando que sem documento não dá.","Registrar como perdido por falta de documento.","\"Super entendo, documento é coisa séria. Que tal conhecer o empreendimento pessoalmente? Você prefere sábado às 10h ou às 14h?\"","Mandar a lista de novo no dia seguinte, sem comentar."]'::jsonb,
  2,
  'A C valida e muda para o outro caminho (visita) com duas opções, sem pressão. A A passa da régua de 1 oferta e 1 reforço. A B perde um cliente que recusou só o documento. A D ignora o sinal de resistência.',
  'M19-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q07', 7, 'situacional',
  'O cliente diz: "Já fui aprovado em outra construtora com R$ 250 mil." O que você responde?',
  '["\"Então aqui também vai aprovar R$ 250 mil, com certeza.\"","\"Aquela aprovação não vale nada, esquece.\"","\"Então nem precisa de análise, já podemos escolher a unidade.\"","\"Que bom! Cada projeto tem a sua avaliação, pode dar mais ou menos. Eu só sei de verdade com a sua documentação. Consegue me mandar o RG e os 6 últimos extratos ainda hoje?\""]'::jsonb,
  3,
  'A D segue o caso F: explica o mecanismo e transforma a objeção num pedido de documento com âncora. A A promete aprovação. A B desqualifica o cliente. A C pula a análise, e o laudo e o perfil de cada projeto mudam o valor.',
  'M19-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q08', 8, 'situacional',
  'Um cliente que quer morar no apartamento pede logo no início: "Manda o book que eu vejo." O que você faz?',
  '["\"Te mando sim. Só que o book não mostra quanto fica pra você. Me responde duas coisinhas e eu te mando junto com a sua parcela estimada: vai ser seu primeiro imóvel?\"","Manda o book, a tabela e todas as plantas na hora.","Diz que só manda o book depois da visita.","Manda o book e escreve \"qualquer dúvida, me chama\"."]'::jsonb,
  0,
  'A A não recusa o material e transforma o pedido em qualificação: o book chega junto com o que importa, a parcela estimada. A B despeja material antes da conexão. A C cria uma barreira sem motivo. A D encerra de forma passiva. Investidor seria diferente: recebe o material na hora.',
  'M19-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q09', 9, 'aplicacao',
  'Cliente da Faixa 3, unidade de R$ 300 mil, laudo igual ao preço, R$ 20 mil de FGTS e nenhum dinheiro guardado. Quanto falta de entrada para parcelar com a construtora pela condição da campanha? (Exemplo de treino; a conta real sai no simulador.)',
  '["R$ 0, porque o subsídio cobre a entrada.","R$ 60 mil.","R$ 40 mil.","R$ 20 mil."]'::jsonb,
  2,
  'A Caixa financia até 80% do menor valor entre preço e laudo: 80% de R$ 300 mil = R$ 240 mil. Entrada = R$ 60 mil, menos R$ 20 mil de FGTS = R$ 40 mil (C). A A erra duas vezes: F3 não tem subsídio e subsídio não cobre entrada. A B esquece o FGTS. A D desconta o FGTS duas vezes.',
  'M19-A4 e seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q10', 10, 'aplicacao',
  'Unidade de R$ 300 mil, com laudo 10% abaixo do preço (R$ 270 mil). Qual é a entrada necessária? (Exemplo de treino.)',
  '["R$ 60 mil (20% do preço).","R$ 84 mil (28% do preço).","R$ 54 mil (20% do laudo).","R$ 30 mil (10% do preço)."]'::jsonb,
  1,
  'A Caixa financia 80% do menor valor: 80% de R$ 270 mil = R$ 216 mil. Entrada = R$ 300 mil menos R$ 216 mil = R$ 84 mil, ou 28% do preço (B). A A ignora o laudo. A C calcula a entrada sobre o laudo, mas o cliente paga o preço de tabela. A D confunde a diferença do laudo com a entrada.',
  'M19-A4 e seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q11', 11, 'aplicacao',
  'A entrada exigida é de R$ 60 mil, o cliente tem R$ 24 mil guardados e faltam 24 meses para a entrega. A renda familiar é de R$ 7.500. Qual é o esforço mensal e como ele se classifica?',
  '["R$ 2.500 por mês, não fecha.","R$ 1.500 por mês, plano B.","R$ 1.000 por mês, apresentável.","R$ 1.500 por mês, 20% da renda: apresentável."]'::jsonb,
  3,
  'Esforço mensal = (R$ 60 mil menos R$ 24 mil) ÷ 24 = R$ 1.500, que é 20% de R$ 7.500. Até cerca de 22% da renda é apresentável (D). A A esquece o dinheiro guardado. A B acerta a conta e erra a classificação: plano B começa em 30%. A C erra a conta.',
  'M19-A4 e seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q12', 12, 'aplicacao',
  '"Tenho medo de a construtora atrasar a obra." Qual é o tipo da objeção e o passo certo depois de validar?',
  '["Medo; investigar o que preocupa e mostrar a data do contrato, a tolerância de até 180 dias e o histórico real de entregas, com convite a um empreendimento entregue.","Tempo; propor ligar daqui a um ano.","Valor; oferecer desconto para compensar o risco.","Medo; garantir que essa construtora nunca atrasa."]'::jsonb,
  0,
  'A A classifica certo e endereça com fatos verificáveis e prova. A B confunde o tipo. A C oferece desconto fora da alçada para um medo que não é de preço. A D acerta o tipo e erra a resposta: nunca se garante prazo.',
  'M19-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q13', 13, 'aplicacao',
  '"Achei mais barato em outro lugar." Qual é a resposta que segue o protocolo?',
  '["\"Aquela construtora é ruim, não compra lá.\"","\"Eu cubro o preço deles.\"","\"Me mostra o que você achou? Comparo com você pelos mesmos critérios: localização, metragem, entrega, entrada e custo total.\"","\"Então compra lá, boa sorte.\""]'::jsonb,
  2,
  'A C investiga e compara com critérios iguais, o que constrói autoridade. A A ataca o concorrente. A B promete condição fora da campanha. A D abandona um cliente que ainda estava conversando.',
  'M19-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q14', 14, 'aplicacao',
  'Casal com filho pequeno, aluguel vencendo em 4 meses, diz: "Quero pronto, não quero planta." O que você apresenta?',
  '["Insiste que a planta é sempre melhor.","Diz que a SMQ só trabalha com planta.","Promete que a obra entrega antes dos 4 meses.","Os dois caminhos com números: o pronto (preço de hoje, sem fluxo de obra) e a planta (preço de lançamento e entrada parcelada até as chaves), e visita ao produto de entrega mais próxima."]'::jsonb,
  3,
  'A D respeita a necessidade real (persona P13) e compara com números, incluindo produto com entrega próxima. A A ignora o cliente. A B é falsa. A C promete prazo, o que nunca se faz.',
  'M19-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q15', 15, 'conceito',
  'Qual passo do protocolo nunca pode ser pulado?',
  '["Investigar (e isolar).","Endereçar.","Agir.","Validar."]'::jsonb,
  0,
  'Responder sem investigar é tratar a objeção imaginada (A). Endereçar (B) só funciona depois de saber o que responder. Agir (C) e validar (D) também são obrigatórios, mas a regra do módulo é explícita: nunca pule o passo 2.',
  'M19-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q16', 16, 'conceito',
  'Qual é o peso real das objeções na SMQ (309 objeções, jul a set/2026)?',
  '["Preço é a maior parte, cerca de 60%.","Tempo é 86,4%; preço, 9,7%; credibilidade, 3,9%.","As objeções se dividem igualmente entre tempo, preço e credibilidade.","Credibilidade é a maior parte, por causa do medo de golpe."]'::jsonb,
  1,
  'A B traz o número da casa: a objeção da casa é tempo, não preço. A A, a C e a D são suposições comuns que levam o corretor a treinar para o jogo errado.',
  'M19-A1 e seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q17', 17, 'conceito',
  'Quando o corretor pode usar urgência com o cliente?',
  '["Sempre que o cliente hesitar.","No fim do mês, para bater a meta.","Só quando for verdadeira e verificável: data de abertura de vendas, unidades restantes na tabela, prazo real de uma condição.","Nunca, em hipótese alguma."]'::jsonb,
  2,
  'A C é a regra da casa: urgência só com fato verificável. A A e a B transformam urgência em truque, o que destrói a confiança para sempre. A D exagera: urgência verdadeira, dita com leveza, ajuda o cliente a decidir (caso A).',
  'M19-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q18', 18, 'conceito',
  'Como se trata uma objeção de credibilidade ("não confio")?',
  '["Argumentando com convicção até o cliente acreditar.","Oferecendo desconto para ganhar confiança.","Ignorando e seguindo a apresentação.","Demonstrando, nunca argumentando: âncoras antigolpe, identidade clara e prova física, como o convite ao escritório."]'::jsonb,
  3,
  'A D mantém o que o módulo antigo já ensinava e a doutrina confirma: credibilidade se demonstra. A A aumenta a desconfiança. A B mistura preço com confiança. A C ignora o medo do cliente.',
  'M19-A1 e M19-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q19', 19, 'caca_ao_erro',
  'Mensagem enviada a um cliente da Faixa 3 que disse "não tenho entrada": "Não tem problema, o subsídio do governo cobre a sua entrada! Qualquer coisa me chama." Quais são os erros?',
  '["Nenhum: a mensagem é positiva e tranquiliza o cliente.","Promete que o subsídio cobre a entrada (e a F3 nem tem subsídio) e encerra de forma passiva, sem conta e sem horário.","Só faltou um emoji.","O erro é falar de entrada pelo WhatsApp."]'::jsonb,
  1,
  'A B aponta os dois erros: a promessa falsa (subsídio não cobre entrada e não existe na F3) e o encerramento passivo. O certo é fazer a conta da entrada e fechar com um próximo passo. A A ignora os erros. A C e a D apontam detalhes irrelevantes.',
  'M19-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M19-Q20', 20, 'caca_ao_erro',
  'Trecho de uma conversa: "Pode ficar tranquilo, a reserva não compromete nada e o apartamento já é seu desde o primeiro pagamento. Faz um Pix hoje pra minha conta que eu seguro a unidade pra você." Quais são os erros?',
  '["Nenhum, é uma técnica de fechamento normal.","Só o erro de chamar de \"reserva\".","O único problema é o Pix ser hoje e não amanhã.","Usa \"reserva\" para a unidade e diz que não compromete, diz que a propriedade passa no primeiro pagamento, usa \"Pix hoje\" como pressão e pede pagamento em conta pessoal."]'::jsonb,
  3,
  'A D lista todos os erros: para a unidade se diz "garantir" ou "bloquear" e a regra real da construtora; a propriedade passa com o registro no cartório; urgência de "Pix hoje" é pressão; e pagamento só por canal oficial, nunca em conta de pessoa física. A A normaliza o erro. A B e a C veem só uma parte.',
  'M19-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (13)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F01', 1, 'O protocolo de objeção', 'Validar → Investigar (e isolar) → Endereçar → Agir. Nunca pule o passo 2.', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F02', 2, 'O peso real das objeções na SMQ', 'Tempo 86,4% · preço 9,7% · credibilidade 3,9% (309 objeções, jul a set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F03', 3, 'Os 7 tipos de objeção', 'Dúvida, medo, valor, tempo, credibilidade, falsa e real (como o decisor ausente).', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F04', 4, 'Pergunta para "agora não é o momento"', '"Pra eu não te chamar na hora errada: o que precisa acontecer pra ser o momento?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F05', 5, 'Pergunta para "vou pensar"', '"O que você ainda precisa analisar: a parcela, a região ou alguém que precisa ver junto?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F06', 6, 'A pergunta que isola', '"Se isso estivesse resolvido, você avançaria?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F07', 7, 'Quantos reforços?', 'No máximo um. Na segunda recusa, recue e registre a data do cliente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F08', 8, 'Credibilidade', 'Se demonstra, nunca se argumenta: âncoras antigolpe, identidade clara e convite ao escritório.', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F09', 9, 'As 4 âncoras antigolpe', 'Análise gratuita · ninguém da SMQ pede Pix, taxa ou senha · a Caixa não chama no WhatsApp pedindo dado · número exato de quem vai ligar.', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F10', 10, 'A conta da entrada', 'Preço menos o que a Caixa financia (80% do menor valor entre preço e laudo), menos FGTS, menos subsídio se houver. O resto, parcelamento da campanha.', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F11', 11, 'Desconto', 'Tabela igual para todos; condição da campanha você monta; o extra, gerente ou diretor com retorno marcado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F12', 12, 'Distrato na compra em estande', '7 dias para desistir com devolução de tudo; depois, o quadro-resumo mostra o limite legal de retenção.', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M19-F13', 13, 'Frase-âncora', '"A objeção da casa é tempo, não preço."', true
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"Faça a maratona de objeções uma vez por mês com cada corretor (15 objeções, 60 segundos cada, 12 de tempo), pontuando os 4 passos com a rubrica. No 1:1, peça a lição de casa \"as 10 falas que te travam\": o corretor lista as objeções em que trava e vocês treinam as três piores. Na reunião de segunda, leia em voz alta uma objeção real da semana e a resposta dada, e o time sugere a versão com os 4 passos.","sinais_de_dificuldade":["Clientes em \"Aguardando retorno\" sem data na carteira do corretor.","Perdas pelo motivo \"Adiou a decisão\" subindo no Meu Raio-X.","Próximos passos \"Responder a objeção\" vencidos na Fila Única, ou desfechos de objeção sem data."],"perguntas_de_coaching":["Nessa objeção, qual foi a pergunta que você fez antes de responder?","Que tipo de objeção era essa, e a sua resposta combinou com o tipo?","Com que dia e hora essa conversa terminou?"],"ritual_de_celebracao":"All Hands quinzenal: conquista \"Maratonista de objeções\" para quem fizer a maratona com média 3,5 ou mais; no LEGADO, quem mais reduziu as perdas por \"Adiou a decisão\" concorre em \"Mestre do Fechamento\" e \"Maior Evolução\"."}}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M19' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
