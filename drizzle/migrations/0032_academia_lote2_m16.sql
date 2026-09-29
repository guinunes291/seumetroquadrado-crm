-- ===========================================================================
-- ACADEMIA SMQ · LOTE 2 (v1.0) · seed do módulo M16
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
  ('M16', 16, 3, 'Qualificação profunda: a espinha SMQ', 'Ao final, você qualifica em uma conversa natural de até 15 minutos sem repetir o que o robô já coletou, preenche os 5 campos obrigatórios da ficha, registra a motivação (Q3) e a objeção latente (Q7), sinaliza na hora quando o perfil não fecha e sai com um dos 2 caminhos, e isso aparece no CRM como fichas completas no Dossiê do cliente e menos perdas por "Sem perfil" ou "Crédito (renda)" descobertas depois da visita.',
   '["Eu sou capaz de ler o dossiê antes de perguntar e confirmar em uma frase o que o robô já coletou, completando entrada, FGTS, nome e momento de compra.","Eu sou capaz de fazer a pergunta de renda com a âncora antes da pergunta e de enquadrar na ordem renda, faixa, subsídio, FGTS, entrada e parcela, sem prometer nada.","Eu sou capaz de conduzir a escada da consciência (situação, incômodo, consequência e ideal) para que o cliente diga a própria motivação.","Eu sou capaz de fazer a Q7 na versão leve na ligação e registrar a objeção latente antes de apresentar o produto.","Eu sou capaz de classificar a temperatura do cliente, dizer \"não dá\" cedo com o caminho possível e preencher os 5 campos obrigatórios da ficha no CRM."]'::jsonb, 1.4, '85 min', true,
   '**Laboratório de qualificação em trio, com gabarito** · 240 min

**Papéis:** Corretor, cliente com o cartão da persona e observador com a rubrica e o gabarito. Cada corretor conduz as cinco personas; os papéis se revezam a cada rodada, e o gerente fecha o laboratório conferindo as fichas.

**Persona:** P1, P2, P3, P4 e P8 (seção 9.13), uma por rodada

**Roteiro:** Para cada persona, o corretor recebe o dossiê que o robô entregaria (com os buracos reais: sem entrada, sem FGTS, sem a situação do nome), conduz em até 15 minutos a qualificação completa (confirma o dossiê, completa as travas, sobe a escada da consciência, faz a Q7 leve), classifica a temperatura e fecha um dos 2 caminhos. Em seguida, preenche a ficha no CRM de treino ou num formulário igual ao da aba Dados, com a motivação no Perfil do cliente e a Q7 em Objeções do cliente. O "cliente" só revela o que for perguntado.

**Roteiro do cliente:**

- P1 (casal que cansou do aluguel, F2): "Vi o anúncio, queria saber o valor." Só conta o aluguel de R$ 1.200 se perguntarem da moradia; só revela que a esposa decide junto se perguntarem quem participa. Levanta: "A parcela vai ser maior que o meu aluguel?"
- P2 (entregador de aplicativo, F1): "É pra autônomo também?" Só diz que trabalhou 2 anos registrado se perguntarem do tempo de registro. Levanta: "Não gosto de mandar documento."
- P3 (solteira CLT perto do metrô, F3): "Quero algo perto do metrô, mas não tenho entrada." Não sabe que em 2 meses completa 3 anos de FGTS; só conta o tempo de registro se perguntarem. Levanta: "Vou pensar."
- P4 (casal na beira do teto, F4): "A gente quer usar a renda da minha mãe pra subir o valor." Renda de R$ 12.000 e produto de R$ 480 mil. Insiste na composição se o corretor não fizer a conta.
- P8 (nome com pendência): "Tenho uma pendência pequena, dá?" No chat de apoio, responde "nome tá limpo não". Tem vergonha e quer saber se precisa quitar antes.

**O que o observador procura:**

- O dossiê confirmado em uma frase, sem repetir o que o robô já sabia.
- A âncora antes da pergunta de renda e uma pergunta por vez.
- As 2 travas completas (entrada e FGTS; nome e crédito) antes de qualquer produto.
- A escada da consciência com o cliente dizendo a própria motivação, e a Q7 feita na versão leve.
- Nenhuma promessa de aprovação, subsídio ou parcela exata (critério 6 só com nota 5).
- Temperatura classificada, um dos 2 caminhos proposto com duas opções e a ficha preenchida com os 5 campos.

**Rubrica:** Padrão SMQ, critérios 1 (abertura e conexão), 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Abertura e conexão: personalização, nome, prova de que leu o cadastro","peso":1},{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 2 v1.0 importado: revisar no CRM antes de publicar. | [DECISÃO G.] Nome da espinha de qualificação: seguimos a recomendação padrão, "7 dimensões SMQ" (Q1 a Q7) com as 2 travas técnicas e a "escada da consciência", sem sigla de terceiros (decisão 11 ainda aberta). | [CONFIRMAR] Definições exatas das temperaturas PRONTO, QUENTE, MORNO e FRIO no CRM e no robô. | [GAP DE CRM] O tempo de registro no FGTS, as parcelas que o cliente já paga e a situação do nome não têm campo próprio no Dossiê (hoje vão nas Observações), e não há indicador de fichas completas por corretor. Proposta: campos próprios e um indicador de "ficha completa" no Meu Raio-X. | [DADO A MEDIR NO CRM] Linha de base de fichas com os 5 campos preenchidos e de perdas por falta de perfil depois da visita. | [CONFIRMAR] Limite de participantes e regra de idade na composição de renda e o alcance exato das condições do FGTS, com o correspondente. | [CONFIRMAR na publicação] Reconferir as faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) antes de liberar as questões M16-Q05, M16-Q11, M16-Q15, M16-Q19 e M16-Q20. | [CALIBRAR] Meta de fichas completas e de perdas por falta de perfil depois da visita, com o Meu Raio-X.', '{"formato":"canonico-8.2","lote":2,"versao_conteudo":"1.0","trilha":"T3","ordem":3,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"Qualificação é ficha preenchida, não conversa boa. Em 15 minutos de conversa natural, você sabe o que o cliente pode, o que ele quer e o que pode travar.","duracao_min":85,"por_que_vale_dinheiro":{"texto":"Os clientes PRONTO e QUENTE são só 9,4% dos leads e respondem por 97,3% dos agendamentos e 91,6% das pastas. Saber em que temperatura o cliente está é a primeira triagem do seu dia. E o dossiê do robô chega sem entrada em 85,1% dos casos, sem FGTS em 73,1%, sem a situação do nome em 69,5% e sem o momento de compra em 67,5%: quem completa essa conta na primeira conversa apresenta o produto certo e não descobre o problema na análise, que é o ponto mais caro.","numero":"PRONTO + QUENTE: 9,4% dos leads, 97,3% dos agendamentos e 91,6% das pastas; dossiê sem entrada em 85,1% dos handoffs","fonte":"Conversas do robô e notas de qualificação","periodo":"jul a set/2026"},"pre_requisitos":["M00","M25","M26","M13","M15"],"indicador_crm":{"nome":"Fichas com os 5 campos obrigatórios preenchidos e perdas por falta de perfil descobertas depois da visita","onde_ler":"Dossiê do cliente › aba Dados (Renda informada, Tipo de renda, Usa FGTS, Entrada disponível e Decisor) e aba Qualificação (Perfil do cliente e Objeções do cliente); Meu Raio-X (onde você perde mais clientes); para o gerente, Gestão de Carteira › Base de leads filtrada pelo corretor","linha_de_base":"[DADO A MEDIR NO CRM] Percentual de fichas completas por corretor e perdas por \"Sem perfil\" ou \"Crédito (renda)\" com o cliente já em \"Visita realizada\" ou \"Análise de crédito\"","meta_sugerida":"100% dos clientes em \"Agendado\" com os 5 campos preenchidos e a Q7 registrada; perdas por falta de perfil depois da visita perto de zero [CALIBRAR com o Meu Raio-X]","fonte":"Manual e Treinamento do CRM SMQ, set/2026","gap_de_crm":true},"pratica":{"tipo":"Laboratório de qualificação em trio, com gabarito","duracao_min":240,"persona":"P1, P2, P3, P4 e P8 (seção 9.13), uma por rodada","rubrica":"Padrão SMQ, critérios 1 (abertura e conexão), 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"Corretor, cliente com o cartão da persona e observador com a rubrica e o gabarito. Cada corretor conduz as cinco personas; os papéis se revezam a cada rodada, e o gerente fecha o laboratório conferindo as fichas.","roteiro":"Para cada persona, o corretor recebe o dossiê que o robô entregaria (com os buracos reais: sem entrada, sem FGTS, sem a situação do nome), conduz em até 15 minutos a qualificação completa (confirma o dossiê, completa as travas, sobe a escada da consciência, faz a Q7 leve), classifica a temperatura e fecha um dos 2 caminhos. Em seguida, preenche a ficha no CRM de treino ou num formulário igual ao da aba Dados, com a motivação no Perfil do cliente e a Q7 em Objeções do cliente. O \"cliente\" só revela o que for perguntado.","roteiro_cliente":["P1 (casal que cansou do aluguel, F2): \"Vi o anúncio, queria saber o valor.\" Só conta o aluguel de R$ 1.200 se perguntarem da moradia; só revela que a esposa decide junto se perguntarem quem participa. Levanta: \"A parcela vai ser maior que o meu aluguel?\"","P2 (entregador de aplicativo, F1): \"É pra autônomo também?\" Só diz que trabalhou 2 anos registrado se perguntarem do tempo de registro. Levanta: \"Não gosto de mandar documento.\"","P3 (solteira CLT perto do metrô, F3): \"Quero algo perto do metrô, mas não tenho entrada.\" Não sabe que em 2 meses completa 3 anos de FGTS; só conta o tempo de registro se perguntarem. Levanta: \"Vou pensar.\"","P4 (casal na beira do teto, F4): \"A gente quer usar a renda da minha mãe pra subir o valor.\" Renda de R$ 12.000 e produto de R$ 480 mil. Insiste na composição se o corretor não fizer a conta.","P8 (nome com pendência): \"Tenho uma pendência pequena, dá?\" No chat de apoio, responde \"nome tá limpo não\". Tem vergonha e quer saber se precisa quitar antes."],"observador_procura":["O dossiê confirmado em uma frase, sem repetir o que o robô já sabia.","A âncora antes da pergunta de renda e uma pergunta por vez.","As 2 travas completas (entrada e FGTS; nome e crédito) antes de qualquer produto.","A escada da consciência com o cliente dizendo a própria motivação, e a Q7 feita na versão leve.","Nenhuma promessa de aprovação, subsídio ou parcela exata (critério 6 só com nota 5).","Temperatura classificada, um dos 2 caminhos proposto com duas opções e a ficha preenchida com os 5 campos."]},"desafio_campo":{"tarefa":"Cinco fichas completas em 72 horas: escolha cinco clientes da sua carteira em \"Em atendimento\" ou \"Qualificação Corretor\", ligue, complete os 5 campos obrigatórios, registre a motivação (Q3) no Perfil do cliente e a objeção latente (Q7) em Objeções do cliente, classifique a temperatura e feche com desfecho, próximo passo e data.","prazo_horas":72,"evidencia_no_crm":"No Dossiê de cada um dos 5 clientes: aba Dados com Renda informada, Tipo de renda, Usa FGTS, Entrada disponível e Decisor preenchidos; aba Qualificação com Perfil do cliente e Objeções do cliente escritos com as palavras do cliente; desfecho registrado com próximo passo e data.","como_o_gestor_confere":"Em Gestão de Carteira › Base de leads, filtra pelo corretor, abre o Dossiê dos 5 clientes que ele indicou e confere os 5 campos, a Q3 e a Q7 e o próximo passo com data. Esperado: 5 de 5. Ficha com campo vazio volta para o corretor no mesmo dia."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com um corretor fazendo o papel de cliente","cenario":"Escritório da SMQ, com o Dossiê do cliente aberto no CRM e uma ligação de role-play","blocos":[{"tempo":"0:00","fala":"O cliente já contou a renda pro robô. Aí o corretor liga e pergunta de novo. Adivinha como termina essa ligação?","na_tela":"Dossiê do robô ao lado da ligação"},{"tempo":"0:20","fala":"O dossiê chega sem entrada em 85 de cada 100 handoffs, e sem FGTS em 73. É isso que você completa. O resto, você confirma em uma frase.","na_tela":"Os quatro buracos do dossiê, jul a set/2026"},{"tempo":"0:50","fala":"A espinha tem três camadas: as seis perguntas na ligação, os cinco campos na ficha e o checklist das sete dimensões com as duas travas, entrada e nome.","na_tela":"As 3 camadas"},{"tempo":"1:40","fala":"Olha a ligação. Eu confirmo o que o robô sabe, pergunto da entrada, subo a escada: como é a sua moradia hoje, o que incomoda, e se continuar assim, e o ideal.","na_tela":"Role-play com a persona P1"},{"tempo":"3:00","fala":"E antes de oferecer a visita, a pergunta que quase ninguém faz: se a gente achar o apartamento certo, com a parcela certa, o que ainda pode te impedir? Foi aí que apareceu a esposa.","na_tela":"A Q7 e o registro em Objeções do cliente"},{"tempo":"3:50","fala":"O erro que mais custa: seguir conversando com quem o perfil já não fecha. Diz não dá cedo, com o caminho possível. Isso salva o seu mês.","na_tela":"Renda acima de R$ 13 mil: Pró-Cotista ou SBPE"},{"tempo":"4:30","fala":"Desafio: cinco fichas completas em 72 horas, com a motivação e a Q7 escritas. Qualificação é ficha preenchida, não conversa boa.","na_tela":"Frase-âncora e a aba Dados preenchida"}]},"fontes_internas":["Seções 3, 9.1, 9.2, 9.3, 9.4, 9.9, 9.11, 9.12, 9.13, 9.14 e 9.16 do super prompt","Estudo da Academia v2.1, seções 2, 3, 5.2 e 6 (fases C e D)","Método oficial de ligação \"Não sou conduzido. Eu conduzo.\" (set/2026)","Manual e Treinamento do CRM SMQ (set/2026); telas do Dossiê do cliente conferidas no repositório em 29/09/2026","Conteúdo anterior do M16 (Academia no Notion, abr/2026): as 7 dimensões, a Q7 como mapa do fechamento e a proporção 30/70, sem a sigla de terceiros"],"origem":"SMQ","pendencias":["[DECISÃO G.] Nome da espinha de qualificação: seguimos a recomendação padrão, \"7 dimensões SMQ\" (Q1 a Q7) com as 2 travas técnicas e a \"escada da consciência\", sem sigla de terceiros (decisão 11 ainda aberta).","[CONFIRMAR] Definições exatas das temperaturas PRONTO, QUENTE, MORNO e FRIO no CRM e no robô.","[GAP DE CRM] O tempo de registro no FGTS, as parcelas que o cliente já paga e a situação do nome não têm campo próprio no Dossiê (hoje vão nas Observações), e não há indicador de fichas completas por corretor. Proposta: campos próprios e um indicador de \"ficha completa\" no Meu Raio-X.","[DADO A MEDIR NO CRM] Linha de base de fichas com os 5 campos preenchidos e de perdas por falta de perfil depois da visita.","[CONFIRMAR] Limite de participantes e regra de idade na composição de renda e o alcance exato das condições do FGTS, com o correspondente.","[CONFIRMAR na publicação] Reconferir as faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) antes de liberar as questões M16-Q05, M16-Q11, M16-Q15, M16-Q19 e M16-Q20.","[CALIBRAR] Meta de fichas completas e de perdas por falta de perfil depois da visita, com o Meu Raio-X."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M16-A1', 'M16-A2', 'M16-A3', 'M16-A4', 'M16-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M16-Q01', 'M16-Q02', 'M16-Q03', 'M16-Q04', 'M16-Q05', 'M16-Q06', 'M16-Q07', 'M16-Q08', 'M16-Q09', 'M16-Q10', 'M16-Q11', 'M16-Q12', 'M16-Q13', 'M16-Q14', 'M16-Q15', 'M16-Q16', 'M16-Q17', 'M16-Q18', 'M16-Q19', 'M16-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M16-F01', 'M16-F02', 'M16-F03', 'M16-F04', 'M16-F05', 'M16-F06', 'M16-F07', 'M16-F08', 'M16-F09', 'M16-F10', 'M16-F11', 'M16-F12', 'M16-F13', 'M16-F14');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 14;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M16-A1', 1, 'A espinha única: ligação, ficha e checklist', 'texto',
  'Existiam quatro roteiros diferentes de qualificação na casa. Cada corretor usava um, e o cliente respondia a mesma pergunta três vezes: ao robô, ao corretor e ao gerente. A partir de agora existe uma espinha só.

### Por que importa

Pergunta repetida faz o cliente desistir, e pergunta esquecida aparece na análise da Caixa, o ponto mais caro do funil. O dossiê do robô chega sem entrada em 85,1% dos handoffs e sem FGTS em 73,1% (jul a set/2026). No pico de campanha de set/2026, a entrada faltou em 97% dos handoffs. Quem completa essa conta na primeira conversa apresenta o produto certo na primeira vez.

### O conceito

Pense numa obra: a ligação é a fundação, a ficha do CRM é a estrutura e o checklist das 7 dimensões é a vistoria antes de entregar a chave. As três camadas se encaixam; nenhuma substitui a outra.

### O método SMQ, passo a passo

1. Camada 1, na ligação: as 6 perguntas do método "Eu conduzo", na ordem que você aprendeu no M15.
2. Camada 2, na ficha do CRM: os 5 campos obrigatórios. Renda familiar, tipo de renda, FGTS e tempo de registro, valor de entrada e quem decide junto.
3. Camada 3, o checklist das 7 dimensões SMQ (Q1 a Q7) e das 2 travas técnicas (entrada e FGTS; nome e crédito): o que precisa estar respondido antes de apresentar produto.
4. Antes de perguntar, leia o dossiê e a conversa. Confirme em uma frase o que o robô já sabe: "Vi aqui que vocês ganham juntos em torno de R$ 4.500, continua assim?"
5. Complete primeiro o que quase sempre falta: entrada, FGTS, restrição no nome e momento de compra. Se o resumo estiver vazio, você é o primeiro contato: qualifique do zero.

### Na vida real

**O caso:** O dossiê raso no pico de campanha (set/2026).

**O que foi dito:** Com o volume de leads subindo, a entrada passou a faltar em 97% dos handoffs (era 80%) e a restrição no nome em 81% (era 56%); até a renda faltou em 16%.

**O que aconteceu:** O robô não dá conta de tudo quando o volume sobe. Quem ligou e completou a conta sem repetir o que o robô já sabia chegou à visita com a simulação certa; quem reperguntou tudo ouviu "já falei isso".

### Scripts prontos

#### Ligação · Confirmar o dossiê em vez de repetir a pergunta

> Vi aqui que você conversou com a gente sobre o [empreendimento], que é pra morar e que vocês ganham juntos em torno de R$ [renda]. Continua assim? Então me ajuda com uma coisa que ainda não tenho: pra entrada, vocês contam com algum valor guardado ou com FGTS?

**Por que funciona:** Prova que você leu, economiza o tempo do cliente e vai direto para o que falta (entrada e FGTS), que é justamente o que o dossiê quase nunca traz.

#### WhatsApp · Cliente cru da rota direta, sem resumo no dossiê

> Oi, [nome]! Aqui é o [corretor], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Te liguei agora sobre o [empreendimento]. Pra eu já te mostrar o que cabe no seu bolso: vai ser o seu primeiro imóvel?

**Por que funciona:** Identificação honesta, uma pergunta só e a primeira pergunta do método. Sem resumo, você começa a espinha do começo.

### Erros que matam a venda

- **Perguntar de novo o que o robô já sabia**  
  Quanto custa: O cliente responde tudo outra vez e desiste no meio  
  Correção: Ler o dossiê e confirmar em uma frase
- **Fazer uma conversa boa e não preencher a ficha**  
  Quanto custa: O gerente, o correspondente e você mesmo, na semana seguinte, não sabem o que foi dito  
  Correção: Os 5 campos preenchidos durante ou logo depois da ligação
- **Apresentar produto sem saber entrada e FGTS**  
  Quanto custa: O cliente se apaixona por um apartamento que o caixa dele não fecha  
  Correção: Completar a Trava A antes de qualquer oferta

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Conferir o que chegou e completar os campos durante ou logo depois da ligação
- **Campo:** Renda informada, Tipo de renda, Usa FGTS, Entrada disponível e Decisor (o tempo de registro vai nas Observações)
- **Regra:** Qualificação é ficha preenchida, não conversa boa

### Frase-âncora

> **Qualificação é ficha preenchida, não conversa boa.**

### Checagem rápida

1. Quais são as três camadas da espinha única?  
   Resposta: As 6 perguntas na ligação, os 5 campos obrigatórios na ficha e o checklist das 7 dimensões com as 2 travas técnicas.
2. O que quase sempre falta no dossiê do robô?  
   Resposta: Entrada, FGTS, restrição no nome e momento de compra.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Existiam quatro roteiros diferentes de qualificação na casa. Cada corretor usava um, e o cliente respondia a mesma pergunta três vezes: ao robô, ao corretor e ao gerente. A partir de agora existe uma espinha só.","por_que_importa":"Pergunta repetida faz o cliente desistir, e pergunta esquecida aparece na análise da Caixa, o ponto mais caro do funil. O dossiê do robô chega sem entrada em 85,1% dos handoffs e sem FGTS em 73,1% (jul a set/2026). No pico de campanha de set/2026, a entrada faltou em 97% dos handoffs. Quem completa essa conta na primeira conversa apresenta o produto certo na primeira vez.","conceito":"Pense numa obra: a ligação é a fundação, a ficha do CRM é a estrutura e o checklist das 7 dimensões é a vistoria antes de entregar a chave. As três camadas se encaixam; nenhuma substitui a outra.","metodo":["Camada 1, na ligação: as 6 perguntas do método \"Eu conduzo\", na ordem que você aprendeu no M15.","Camada 2, na ficha do CRM: os 5 campos obrigatórios. Renda familiar, tipo de renda, FGTS e tempo de registro, valor de entrada e quem decide junto.","Camada 3, o checklist das 7 dimensões SMQ (Q1 a Q7) e das 2 travas técnicas (entrada e FGTS; nome e crédito): o que precisa estar respondido antes de apresentar produto.","Antes de perguntar, leia o dossiê e a conversa. Confirme em uma frase o que o robô já sabe: \"Vi aqui que vocês ganham juntos em torno de R$ 4.500, continua assim?\"","Complete primeiro o que quase sempre falta: entrada, FGTS, restrição no nome e momento de compra. Se o resumo estiver vazio, você é o primeiro contato: qualifique do zero."],"na_vida_real":{"caso":"O dossiê raso no pico de campanha (set/2026).","o_que_foi_dito":"Com o volume de leads subindo, a entrada passou a faltar em 97% dos handoffs (era 80%) e a restrição no nome em 81% (era 56%); até a renda faltou em 16%.","resultado":"O robô não dá conta de tudo quando o volume sobe. Quem ligou e completou a conta sem repetir o que o robô já sabia chegou à visita com a simulação certa; quem reperguntou tudo ouviu \"já falei isso\".","fonte":"Casoteca SMQ, caso J (seção 9.12); aprendizados do robô, 21/09 e 28/09/2026"},"scripts":[{"canal":"Ligação","situacao":"Confirmar o dossiê em vez de repetir a pergunta","texto":"Vi aqui que você conversou com a gente sobre o [empreendimento], que é pra morar e que vocês ganham juntos em torno de R$ [renda]. Continua assim? Então me ajuda com uma coisa que ainda não tenho: pra entrada, vocês contam com algum valor guardado ou com FGTS?","por_que_funciona":"Prova que você leu, economiza o tempo do cliente e vai direto para o que falta (entrada e FGTS), que é justamente o que o dossiê quase nunca traz."},{"canal":"WhatsApp","situacao":"Cliente cru da rota direta, sem resumo no dossiê","texto":"Oi, [nome]! Aqui é o [corretor], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Te liguei agora sobre o [empreendimento]. Pra eu já te mostrar o que cabe no seu bolso: vai ser o seu primeiro imóvel?","por_que_funciona":"Identificação honesta, uma pergunta só e a primeira pergunta do método. Sem resumo, você começa a espinha do começo."}],"erros_que_matam":[{"erro":"Perguntar de novo o que o robô já sabia","custo":"O cliente responde tudo outra vez e desiste no meio","correcao":"Ler o dossiê e confirmar em uma frase"},{"erro":"Fazer uma conversa boa e não preencher a ficha","custo":"O gerente, o correspondente e você mesmo, na semana seguinte, não sabem o que foi dito","correcao":"Os 5 campos preenchidos durante ou logo depois da ligação"},{"erro":"Apresentar produto sem saber entrada e FGTS","custo":"O cliente se apaixona por um apartamento que o caixa dele não fecha","correcao":"Completar a Trava A antes de qualquer oferta"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Conferir o que chegou e completar os campos durante ou logo depois da ligação","campo":"Renda informada, Tipo de renda, Usa FGTS, Entrada disponível e Decisor (o tempo de registro vai nas Observações)","regra":"Qualificação é ficha preenchida, não conversa boa"},"frase_ancora":"Qualificação é ficha preenchida, não conversa boa.","checagem_rapida":[{"pergunta":"Quais são as três camadas da espinha única?","resposta":"As 6 perguntas na ligação, os 5 campos obrigatórios na ficha e o checklist das 7 dimensões com as 2 travas técnicas."},{"pergunta":"O que quase sempre falta no dossiê do robô?","resposta":"Entrada, FGTS, restrição no nome e momento de compra."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M16-A2', 2, 'As 7 dimensões SMQ e as 2 travas técnicas', 'texto',
  'A boa notícia de elegibilidade dada cedo demais vira a pior notícia do mês. O cliente ouve "você se encaixa" na ligação e "não aprovou" na análise, três semanas depois. Quase sempre, uma das travas ficou sem pergunta.

### Por que importa

Perfil incompatível com o MCMV não sinalizado está entre os cinco erros mais frequentes da auditoria de conversas (156 erros, jul a set/2026). Cada dimensão que você pula vira uma surpresa na visita ou na Caixa, quando já custou o seu tempo, o do gerente e a confiança do cliente.

### O conceito

É o check-in do piloto antes de decolar: a lista é sempre a mesma, e é justamente por isso que nenhum item é esquecido. As 7 dimensões dizem quem é o cliente; as 2 travas dizem se a conta fecha.

### O método SMQ, passo a passo

1. Q1 Renda e capacidade: "Somando quem vai comprar junto, vocês ganham mais ou menos quanto por mês?" Depois, o tipo de renda: carteira, conta própria, aplicativo ou misto.
2. Q2 Urgência e prazo: "Você tem algum prazo pra resolver isso? Fim de contrato de aluguel, casamento, bebê?"
3. Q3 Motivação: "O que te faz querer sair do aluguel justo agora?" (aprofunde com a escada da consciência, aula A3).
4. Q4 Situação atual: "Hoje você mora de aluguel ou com a família? Tem algum imóvel no seu nome?" Q5 Decisor: "Além de você, quem mais participa dessa decisão?" Q6 Experiência anterior: "Já visitou algum lançamento ou tentou financiar? O que aconteceu?"
5. Q7 Objeção latente: "Se você encontrasse o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?" (aula A4).
6. Trava A, entrada e FGTS: "Pra entrada, vocês contam com algum valor guardado ou com FGTS? Há quanto tempo você trabalha registrado, somando todos os empregos?" O FGTS pede 3 anos somando os vínculos.
7. Trava B, nome e crédito: "Hoje o seu nome está limpo na praça? Se tiver alguma pendência, me fala que a gente olha junto antes da análise." Restrição não descarta: vai para a pré-análise com o correspondente.
8. Âncora antes de toda pergunta sensível, e uma pergunta por mensagem no WhatsApp.

### Na vida real

**O caso:** A renda de aplicativo que reabriu a conversa (ago/2026).

**O que foi dito:** Leads que já tinham desistido voltaram quando ouviram, na linha de: "Boa notícia: a renda de motorista e de entregador de aplicativo passou a contar na análise. Você roda em qual aplicativo?"

**O que aconteceu:** Perguntar o tipo de renda, e não só o valor, transformou um "não dá" em conversa. Fechar com uma pergunta só manteve o ritmo.

### Scripts prontos

#### Ligação · Renda perto do piso da F1 (até R$ 3.000 declarados)

> Perfeito, [nome]. Só pra eu te orientar certo: esse valor é o que cai na conta ou é antes dos descontos? E vai ser só você na compra ou tem mais alguém somando?

**Por que funciona:** Evita a boa notícia precoce. Bruto, líquido e composição mudam o enquadramento, e a regra da casa é confirmar antes de enquadrar.

#### Ligação · Trava B, com leitura atenta da resposta

> Hoje o seu nome está limpo na praça? Se tiver alguma pendência, fica tranquilo: é mais comum do que parece. Me fala que a gente olha junto com o correspondente antes da análise, sem você precisar quitar nada antes.

**Por que funciona:** Tira a vergonha da pergunta, não promete aprovação e já aponta o caminho (pré-análise). No WhatsApp, lembre da negação no fim da frase: "nome tá limpo não" quer dizer que não está limpo.

#### WhatsApp · Tipo de renda de quem trabalha por aplicativo

> Boa notícia, [nome]: a renda de motorista e de entregador de aplicativo passou a contar na análise. Você roda em qual aplicativo?

**Por que funciona:** Normaliza na hora, sem cravar a data da regra, e fecha com uma pergunta só. A lista final de documentos se confirma com o correspondente.

### Erros que matam a venda

- **Dar a boa notícia de elegibilidade para renda de até R$ 3.000 sem checar bruto, líquido e composição**  
  Quanto custa: Desqualificação tardia, na análise  
  Correção: Confirmar antes de enquadrar
- **Contar como renda o que não se comprova (valor em mãos, Bolsa Família, BPC, seguro-desemprego)**  
  Quanto custa: A pasta volta e o cliente se sente enganado  
  Correção: Só conta o que se comprova; o caminho é compor renda ou formalizar
- **Esquecer as parcelas de carro, empréstimo e cartão**  
  Quanto custa: O comprometimento de renda derruba a análise  
  Correção: Perguntar o valor das parcelas que já existem

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Registrar Q1, Q4, Q5 e as 2 travas nos campos e o que não tem campo nas Observações
- **Campo:** Renda informada, Tipo de renda, Faixa MCMV, Usa FGTS, Entrada disponível, Decisor; nas Observações, tempo de registro, parcelas que já existem e situação do nome
- **Regra:** Enquadrar antes de ofertar: renda, faixa, subsídio, FGTS, entrada e parcela

### Frase-âncora

> **Simulação indica. Análise formal aprova.**

### Checagem rápida

1. Quais são as 2 travas técnicas?  
   Resposta: Trava A, entrada e FGTS; Trava B, nome e crédito.
2. Cliente com restrição no nome: descarta?  
   Resposta: Não. Acolhe, investiga o tipo de pendência e vai para a pré-análise com o correspondente antes de quitar qualquer coisa.
3. O que não conta como renda?  
   Resposta: Bolsa Família, BPC, seguro-desemprego, auxílio-doença, FGTS e o que entra em mãos sem comprovação.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"A boa notícia de elegibilidade dada cedo demais vira a pior notícia do mês. O cliente ouve \"você se encaixa\" na ligação e \"não aprovou\" na análise, três semanas depois. Quase sempre, uma das travas ficou sem pergunta.","por_que_importa":"Perfil incompatível com o MCMV não sinalizado está entre os cinco erros mais frequentes da auditoria de conversas (156 erros, jul a set/2026). Cada dimensão que você pula vira uma surpresa na visita ou na Caixa, quando já custou o seu tempo, o do gerente e a confiança do cliente.","conceito":"É o check-in do piloto antes de decolar: a lista é sempre a mesma, e é justamente por isso que nenhum item é esquecido. As 7 dimensões dizem quem é o cliente; as 2 travas dizem se a conta fecha.","metodo":["Q1 Renda e capacidade: \"Somando quem vai comprar junto, vocês ganham mais ou menos quanto por mês?\" Depois, o tipo de renda: carteira, conta própria, aplicativo ou misto.","Q2 Urgência e prazo: \"Você tem algum prazo pra resolver isso? Fim de contrato de aluguel, casamento, bebê?\"","Q3 Motivação: \"O que te faz querer sair do aluguel justo agora?\" (aprofunde com a escada da consciência, aula A3).","Q4 Situação atual: \"Hoje você mora de aluguel ou com a família? Tem algum imóvel no seu nome?\" Q5 Decisor: \"Além de você, quem mais participa dessa decisão?\" Q6 Experiência anterior: \"Já visitou algum lançamento ou tentou financiar? O que aconteceu?\"","Q7 Objeção latente: \"Se você encontrasse o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?\" (aula A4).","Trava A, entrada e FGTS: \"Pra entrada, vocês contam com algum valor guardado ou com FGTS? Há quanto tempo você trabalha registrado, somando todos os empregos?\" O FGTS pede 3 anos somando os vínculos.","Trava B, nome e crédito: \"Hoje o seu nome está limpo na praça? Se tiver alguma pendência, me fala que a gente olha junto antes da análise.\" Restrição não descarta: vai para a pré-análise com o correspondente.","Âncora antes de toda pergunta sensível, e uma pergunta por mensagem no WhatsApp."],"na_vida_real":{"caso":"A renda de aplicativo que reabriu a conversa (ago/2026).","o_que_foi_dito":"Leads que já tinham desistido voltaram quando ouviram, na linha de: \"Boa notícia: a renda de motorista e de entregador de aplicativo passou a contar na análise. Você roda em qual aplicativo?\"","resultado":"Perguntar o tipo de renda, e não só o valor, transformou um \"não dá\" em conversa. Fechar com uma pergunta só manteve o ritmo.","fonte":"Casoteca SMQ, caso L (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Renda perto do piso da F1 (até R$ 3.000 declarados)","texto":"Perfeito, [nome]. Só pra eu te orientar certo: esse valor é o que cai na conta ou é antes dos descontos? E vai ser só você na compra ou tem mais alguém somando?","por_que_funciona":"Evita a boa notícia precoce. Bruto, líquido e composição mudam o enquadramento, e a regra da casa é confirmar antes de enquadrar."},{"canal":"Ligação","situacao":"Trava B, com leitura atenta da resposta","texto":"Hoje o seu nome está limpo na praça? Se tiver alguma pendência, fica tranquilo: é mais comum do que parece. Me fala que a gente olha junto com o correspondente antes da análise, sem você precisar quitar nada antes.","por_que_funciona":"Tira a vergonha da pergunta, não promete aprovação e já aponta o caminho (pré-análise). No WhatsApp, lembre da negação no fim da frase: \"nome tá limpo não\" quer dizer que não está limpo."},{"canal":"WhatsApp","situacao":"Tipo de renda de quem trabalha por aplicativo","texto":"Boa notícia, [nome]: a renda de motorista e de entregador de aplicativo passou a contar na análise. Você roda em qual aplicativo?","por_que_funciona":"Normaliza na hora, sem cravar a data da regra, e fecha com uma pergunta só. A lista final de documentos se confirma com o correspondente."}],"erros_que_matam":[{"erro":"Dar a boa notícia de elegibilidade para renda de até R$ 3.000 sem checar bruto, líquido e composição","custo":"Desqualificação tardia, na análise","correcao":"Confirmar antes de enquadrar"},{"erro":"Contar como renda o que não se comprova (valor em mãos, Bolsa Família, BPC, seguro-desemprego)","custo":"A pasta volta e o cliente se sente enganado","correcao":"Só conta o que se comprova; o caminho é compor renda ou formalizar"},{"erro":"Esquecer as parcelas de carro, empréstimo e cartão","custo":"O comprometimento de renda derruba a análise","correcao":"Perguntar o valor das parcelas que já existem"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Registrar Q1, Q4, Q5 e as 2 travas nos campos e o que não tem campo nas Observações","campo":"Renda informada, Tipo de renda, Faixa MCMV, Usa FGTS, Entrada disponível, Decisor; nas Observações, tempo de registro, parcelas que já existem e situação do nome","regra":"Enquadrar antes de ofertar: renda, faixa, subsídio, FGTS, entrada e parcela"},"frase_ancora":"Simulação indica. Análise formal aprova.","checagem_rapida":[{"pergunta":"Quais são as 2 travas técnicas?","resposta":"Trava A, entrada e FGTS; Trava B, nome e crédito."},{"pergunta":"Cliente com restrição no nome: descarta?","resposta":"Não. Acolhe, investiga o tipo de pendência e vai para a pré-análise com o correspondente antes de quitar qualquer coisa."},{"pergunta":"O que não conta como renda?","resposta":"Bolsa Família, BPC, seguro-desemprego, auxílio-doença, FGTS e o que entra em mãos sem comprovação."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M16-A3', 3, 'A escada da consciência: o cliente diz a própria necessidade', 'texto',
  'Você pode passar dez minutos explicando por que sair do aluguel é bom negócio. Ou pode fazer quatro perguntas e deixar o cliente dizer isso em voz alta. Só uma dessas conversas termina em visita.

### Por que importa

A motivação (Q3) é o que segura o cliente quando aparecer o laudo, a entrada ou o "vou pensar". Cliente que diz a própria necessidade se convence; o corretor só confirma. Sem Q3, a sua apresentação é igual para todo mundo, e cliente que recebe o mesmo discurso de vinte corretores escolhe pelo preço.

### O conceito

É como o médico que pergunta onde dói, desde quando, o que piora e o que o paciente espera do tratamento. Ninguém sai do consultório achando que foi convencido: sai achando que foi entendido.

### O método SMQ, passo a passo

1. Situação: "Como está a sua moradia hoje?"
2. Incômodo: "O que mais te incomoda nela?"
3. Consequência: "E se isso continuar assim pelos próximos 2 anos?"
4. Ideal: "Como seria o ideal pra você?"
5. Escute mais do que fala: na ligação, você fala 30% e o cliente 70%. Nada de terminar frase com "né?" ou "certo?".
6. Devolva com as palavras dele e registre: a frase do cliente vai para o Perfil do cliente e volta na visita e no fechamento.

### Na vida real

**O caso:** A vaga perto do metrô (1:1 de gestão, abr/2026).

**O que foi dito:** Uma cliente queria apartamento colado no metrô e com vaga, com orçamento de MCMV. A condução foi trazer o ideal para a realidade com três saídas: estacionamento mensal perto do metrô, outra região com vaga ou outro padrão de produto, que custa bem mais.

**O que aconteceu:** Quando o ideal do cliente e o bolso dele não cabem no mesmo produto, a escada mostra qual dos dois pesa mais. Como resumiu o gerente: você não ganha na insistência, o cliente não ganha na insistência. Mostre o que cabe.

### Scripts prontos

#### Ligação · A escada inteira, em conversa natural

> Me conta: como está a sua moradia hoje? ... E o que mais te incomoda nela? ... Entendi. E se isso continuar assim pelos próximos dois anos, como fica? ... Então, pensando no ideal: como seria o apartamento certo pra vocês?

**Por que funciona:** Quatro degraus, uma pergunta por vez, e quem diz o problema e a solução é o cliente. As reticências são as pausas: é ali que ele fala.

#### Ligação · Devolver a motivação com as palavras do cliente

> Deixa eu ver se entendi: vocês querem parar de pagar R$ [aluguel] de aluguel e ter o quarto do bebê antes do fim do ano. É isso?

**Por que funciona:** Confirma que você ouviu, organiza a motivação em uma frase e cria a âncora que você vai usar na visita e no fechamento.

### Erros que matam a venda

- **Pular direto da renda para o produto**  
  Quanto custa: A apresentação fica genérica e o cliente compara só preço  
  Correção: Subir a escada antes de apresentar
- **Fazer as quatro perguntas como interrogatório**  
  Quanto custa: O cliente responde curto e se fecha  
  Correção: Uma por vez, com validação curta e silêncio para ele falar
- **Ouvir a motivação e não registrar**  
  Quanto custa: Na visita, você não lembra; no fechamento, não tem com o que ancorar  
  Correção: A frase do cliente no Perfil do cliente, no mesmo dia

### No CRM

- **Tela:** Dossiê do cliente › aba Qualificação
- **Ação:** Escrever a motivação e a situação atual com as palavras do cliente
- **Campo:** Perfil do cliente (Q2, Q3, Q4 e o ideal)
- **Regra:** O cliente que diz a própria necessidade se convence; o corretor só confirma

### Frase-âncora

> **Quem pergunta conduz. Quem só responde obedece.**

### Checagem rápida

1. Quais são os quatro degraus da escada da consciência?  
   Resposta: Situação, incômodo, consequência e ideal.
2. Qual é a proporção de fala na ligação?  
   Resposta: O corretor fala 30% e o cliente 70%.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Você pode passar dez minutos explicando por que sair do aluguel é bom negócio. Ou pode fazer quatro perguntas e deixar o cliente dizer isso em voz alta. Só uma dessas conversas termina em visita.","por_que_importa":"A motivação (Q3) é o que segura o cliente quando aparecer o laudo, a entrada ou o \"vou pensar\". Cliente que diz a própria necessidade se convence; o corretor só confirma. Sem Q3, a sua apresentação é igual para todo mundo, e cliente que recebe o mesmo discurso de vinte corretores escolhe pelo preço.","conceito":"É como o médico que pergunta onde dói, desde quando, o que piora e o que o paciente espera do tratamento. Ninguém sai do consultório achando que foi convencido: sai achando que foi entendido.","metodo":["Situação: \"Como está a sua moradia hoje?\"","Incômodo: \"O que mais te incomoda nela?\"","Consequência: \"E se isso continuar assim pelos próximos 2 anos?\"","Ideal: \"Como seria o ideal pra você?\"","Escute mais do que fala: na ligação, você fala 30% e o cliente 70%. Nada de terminar frase com \"né?\" ou \"certo?\".","Devolva com as palavras dele e registre: a frase do cliente vai para o Perfil do cliente e volta na visita e no fechamento."],"na_vida_real":{"caso":"A vaga perto do metrô (1:1 de gestão, abr/2026).","o_que_foi_dito":"Uma cliente queria apartamento colado no metrô e com vaga, com orçamento de MCMV. A condução foi trazer o ideal para a realidade com três saídas: estacionamento mensal perto do metrô, outra região com vaga ou outro padrão de produto, que custa bem mais.","resultado":"Quando o ideal do cliente e o bolso dele não cabem no mesmo produto, a escada mostra qual dos dois pesa mais. Como resumiu o gerente: você não ganha na insistência, o cliente não ganha na insistência. Mostre o que cabe.","fonte":"Casoteca SMQ, caso G (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"A escada inteira, em conversa natural","texto":"Me conta: como está a sua moradia hoje? ... E o que mais te incomoda nela? ... Entendi. E se isso continuar assim pelos próximos dois anos, como fica? ... Então, pensando no ideal: como seria o apartamento certo pra vocês?","por_que_funciona":"Quatro degraus, uma pergunta por vez, e quem diz o problema e a solução é o cliente. As reticências são as pausas: é ali que ele fala."},{"canal":"Ligação","situacao":"Devolver a motivação com as palavras do cliente","texto":"Deixa eu ver se entendi: vocês querem parar de pagar R$ [aluguel] de aluguel e ter o quarto do bebê antes do fim do ano. É isso?","por_que_funciona":"Confirma que você ouviu, organiza a motivação em uma frase e cria a âncora que você vai usar na visita e no fechamento."}],"erros_que_matam":[{"erro":"Pular direto da renda para o produto","custo":"A apresentação fica genérica e o cliente compara só preço","correcao":"Subir a escada antes de apresentar"},{"erro":"Fazer as quatro perguntas como interrogatório","custo":"O cliente responde curto e se fecha","correcao":"Uma por vez, com validação curta e silêncio para ele falar"},{"erro":"Ouvir a motivação e não registrar","custo":"Na visita, você não lembra; no fechamento, não tem com o que ancorar","correcao":"A frase do cliente no Perfil do cliente, no mesmo dia"}],"no_crm":{"tela":"Dossiê do cliente › aba Qualificação","acao":"Escrever a motivação e a situação atual com as palavras do cliente","campo":"Perfil do cliente (Q2, Q3, Q4 e o ideal)","regra":"O cliente que diz a própria necessidade se convence; o corretor só confirma"},"frase_ancora":"Quem pergunta conduz. Quem só responde obedece.","checagem_rapida":[{"pergunta":"Quais são os quatro degraus da escada da consciência?","resposta":"Situação, incômodo, consequência e ideal."},{"pergunta":"Qual é a proporção de fala na ligação?","resposta":"O corretor fala 30% e o cliente 70%."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M16-A4', 4, 'Q7: o mapa do fechamento', 'texto',
  'Todo fechamento tem um obstáculo escondido. A única dúvida é se você vai descobrir na ligação, quando ainda dá tempo de resolver, ou na hora da assinatura, quando o cliente já está com a mão na caneta e diz "preciso ver uma coisa antes".

### Por que importa

Pular a Q7 está na lista dos erros que mais custam: o corretor chega ao fechamento sem saber o que trava. E a objeção da casa é tempo (86,4% das 309 objeções registradas de jul a set/2026). Por trás do "agora não" quase sempre existe outra coisa: medo de não aprovar, o cônjuge que ainda não viu, uma pendência no nome, insegurança com a obra.

### O conceito

É o mapa da trilha antes de começar a subida. Você não evita a pedra; você sabe onde ela está e leva a ferramenta certa.

### O método SMQ, passo a passo

1. Versão leve, na ligação, depois da escada da consciência: "Se você encontrasse o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?"
2. Escute sem rebater. Investigue com uma pergunta: "Me conta mais sobre isso: é mais a aprovação, a entrada ou alguém que precisa ver junto?"
3. Registre a resposta no card Objeções do cliente, com as palavras dele.
4. Prepare a visita a partir dela: se é o decisor, os dois vêm juntos; se é a aprovação, a análise gratuita entra antes; se é a entrada, a conta real vai pronta.
5. Versão final, na visita, antes da proposta: repita a Q7. O que ele disser é o que o fechamento precisa resolver (M21).

### Na vida real

**O caso:** Lançamento com urgência verdadeira, venda do diretor (zona oeste, jan/2026).

**O que foi dito:** A objeção apareceu na conversa, na linha de: "o que pega é que não temos uma entrada boa". A resposta veio com mecanismo (parcelamento e FGTS), não com desconto.

**O que aconteceu:** A venda fechou. A doutrina acrescenta o que tornaria o caminho mais curto: fazer a Q7 antes da visita, confirmar o decisor e chegar ao estande com a conta da entrada pronta, em vez de descobrir a trava lá.

### Scripts prontos

#### Ligação · Q7 na versão leve, depois da motivação

> Pelo que você me contou, faz muito sentido resolver isso este ano. Me diz uma coisa: se a gente encontrar o apartamento certo, com a parcela que você falou, o que ainda poderia te impedir de avançar?

**Por que funciona:** A pergunta é hipotética e leve, não parece armadilha, e vem ancorada na motivação que o próprio cliente acabou de dizer.

#### Ligação · A Q7 revelou o decisor

> Faz todo sentido ela ver junto. Então vamos marcar num horário em que vocês dois consigam: sábado às 10h ou às 14h? E, se quiserem, já deixo a análise gratuita rodando antes, pra vocês chegarem sabendo quanto aprovam.

**Por que funciona:** Transforma a objeção latente em próximo passo concreto, com duas opções, e ataca o medo de aprovação com a análise, que é gratuita e não compromete.

### Erros que matam a venda

- **Pular a Q7**  
  Quanto custa: O fechamento é às cegas e a trava aparece na hora de assinar  
  Correção: Q7 leve na ligação e final na visita
- **Rebater a resposta na hora ("imagina, isso não é problema")**  
  Quanto custa: O cliente para de contar o que pensa  
  Correção: Escutar, investigar com uma pergunta e registrar
- **Descobrir o decisor só na visita**  
  Quanto custa: Visita sem decisor, venda adiada  
  Correção: Q5 na ligação e os dois na visita

### No CRM

- **Tela:** Dossiê do cliente › aba Qualificação
- **Ação:** Registrar a objeção latente com as palavras do cliente
- **Campo:** Objeções do cliente (Q7) e Decisor na aba Dados
- **Regra:** Nenhuma visita sem a Q7 registrada

### Frase-âncora

> **A objeção da casa é tempo, não preço.**

### Checagem rápida

1. Qual é a pergunta da Q7?  
   Resposta: "Se você encontrasse o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?"
2. Quando a Q7 é feita?  
   Resposta: Na versão leve na ligação e na versão final na visita, antes da proposta.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Todo fechamento tem um obstáculo escondido. A única dúvida é se você vai descobrir na ligação, quando ainda dá tempo de resolver, ou na hora da assinatura, quando o cliente já está com a mão na caneta e diz \"preciso ver uma coisa antes\".","por_que_importa":"Pular a Q7 está na lista dos erros que mais custam: o corretor chega ao fechamento sem saber o que trava. E a objeção da casa é tempo (86,4% das 309 objeções registradas de jul a set/2026). Por trás do \"agora não\" quase sempre existe outra coisa: medo de não aprovar, o cônjuge que ainda não viu, uma pendência no nome, insegurança com a obra.","conceito":"É o mapa da trilha antes de começar a subida. Você não evita a pedra; você sabe onde ela está e leva a ferramenta certa.","metodo":["Versão leve, na ligação, depois da escada da consciência: \"Se você encontrasse o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?\"","Escute sem rebater. Investigue com uma pergunta: \"Me conta mais sobre isso: é mais a aprovação, a entrada ou alguém que precisa ver junto?\"","Registre a resposta no card Objeções do cliente, com as palavras dele.","Prepare a visita a partir dela: se é o decisor, os dois vêm juntos; se é a aprovação, a análise gratuita entra antes; se é a entrada, a conta real vai pronta.","Versão final, na visita, antes da proposta: repita a Q7. O que ele disser é o que o fechamento precisa resolver (M21)."],"na_vida_real":{"caso":"Lançamento com urgência verdadeira, venda do diretor (zona oeste, jan/2026).","o_que_foi_dito":"A objeção apareceu na conversa, na linha de: \"o que pega é que não temos uma entrada boa\". A resposta veio com mecanismo (parcelamento e FGTS), não com desconto.","resultado":"A venda fechou. A doutrina acrescenta o que tornaria o caminho mais curto: fazer a Q7 antes da visita, confirmar o decisor e chegar ao estande com a conta da entrada pronta, em vez de descobrir a trava lá.","fonte":"Casoteca SMQ, caso A (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Q7 na versão leve, depois da motivação","texto":"Pelo que você me contou, faz muito sentido resolver isso este ano. Me diz uma coisa: se a gente encontrar o apartamento certo, com a parcela que você falou, o que ainda poderia te impedir de avançar?","por_que_funciona":"A pergunta é hipotética e leve, não parece armadilha, e vem ancorada na motivação que o próprio cliente acabou de dizer."},{"canal":"Ligação","situacao":"A Q7 revelou o decisor","texto":"Faz todo sentido ela ver junto. Então vamos marcar num horário em que vocês dois consigam: sábado às 10h ou às 14h? E, se quiserem, já deixo a análise gratuita rodando antes, pra vocês chegarem sabendo quanto aprovam.","por_que_funciona":"Transforma a objeção latente em próximo passo concreto, com duas opções, e ataca o medo de aprovação com a análise, que é gratuita e não compromete."}],"erros_que_matam":[{"erro":"Pular a Q7","custo":"O fechamento é às cegas e a trava aparece na hora de assinar","correcao":"Q7 leve na ligação e final na visita"},{"erro":"Rebater a resposta na hora (\"imagina, isso não é problema\")","custo":"O cliente para de contar o que pensa","correcao":"Escutar, investigar com uma pergunta e registrar"},{"erro":"Descobrir o decisor só na visita","custo":"Visita sem decisor, venda adiada","correcao":"Q5 na ligação e os dois na visita"}],"no_crm":{"tela":"Dossiê do cliente › aba Qualificação","acao":"Registrar a objeção latente com as palavras do cliente","campo":"Objeções do cliente (Q7) e Decisor na aba Dados","regra":"Nenhuma visita sem a Q7 registrada"},"frase_ancora":"A objeção da casa é tempo, não preço.","checagem_rapida":[{"pergunta":"Qual é a pergunta da Q7?","resposta":"\"Se você encontrasse o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?\""},{"pergunta":"Quando a Q7 é feita?","resposta":"Na versão leve na ligação e na versão final na visita, antes da proposta."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M16-A5', 5, 'Temperatura, "não dá" cedo e a próxima ação', 'texto',
  'O cliente PRONTO pede horário, não argumento. O cliente que não fecha pede verdade, não mais uma semana de conversa. Os dois perdem quando o corretor trata todo mundo igual.

### Por que importa

PRONTO e QUENTE são 9,4% dos leads e respondem por 84,6% dos handoffs, 91,6% das pastas e 97,3% dos agendamentos; o PRONTO agenda em 24,1% e o QUENTE em 7,2% (conversas do robô, jul a set/2026). Seguir qualificando quem o perfil já inviabiliza empurra a descoberta para a análise, o ponto mais caro: dizer "não dá" cedo salva o seu mês e o tempo do cliente.

### O conceito

É a triagem do pronto-socorro: quem chega sangrando não espera na fila da gripe, e quem não precisa de internação sai com a receita certa. Classificar não é descartar; é dar a cada cliente o próximo passo que ele precisa.

### O método SMQ, passo a passo

1. Classifique a temperatura ao fim da conversa: PRONTO (pediu visita ou análise, tem documento, fala em prazo), QUENTE (qualificado, perfil encaixa, engajado), MORNO (qualificado, sem urgência e sem visita), FRIO (sem resposta há 30 dias ou mais).
2. PRONTO: visita na hora, com duas opções, e análise oferecida depois, com leveza. QUENTE: um dos 2 caminhos com duas opções. MORNO e FRIO: próximo passo com data e conteúdo de valor.
3. Perfil que não fecha no MCMV: diga na hora, com o caminho possível. Renda acima de R$ 13.000 vai para Pró-Cotista ou SBPE; imóvel no nome ou financiamento ativo, outro caminho; restrição, pré-análise; investidor, produto de investimento.
4. Na F4, antes de sugerir composição de renda, calcule a folga: R$ 13.000 menos a renda atual. Passou do teto, o cliente sai do programa.
5. Renda é a real: se o cliente perguntar "qual renda eu informo?", a resposta é a renda que ele recebe e comprova. O correspondente orienta como documentar; ninguém sugere valor.
6. Feche com um dos 2 caminhos e registre temperatura, desfecho, próximo passo e data.

### Na vida real

**O caso:** Da análise gratuita à assinatura em 23 dias (jan a fev/2026).

**O que foi dito:** O cliente, sócio de uma empresa, chegou desconfiado ("os valores são reais?") e perguntou em algum momento qual renda deveria informar. A resposta da casa é a renda real e comprovada. Os documentos chegaram em cerca de 2 horas depois da primeira ligação, e uma restrição interna do banco apareceu no meio do caminho.

**O que aconteceu:** Com documento no primeiro dia e presença no crédito até destravar, o contrato foi assinado 19 dias depois do formulário e o primeiro boleto foi pago no dia 23. Cliente com documento e prazo é PRONTO: o trabalho é resolver o gargalo, não convencer.

### Scripts prontos

#### Ligação · Renda acima do teto do MCMV

> [nome], com essa renda você fica acima do Minha Casa Minha Vida, que vai até R$ 13 mil pela regra de hoje. Isso não fecha a porta: tem o crédito com FGTS e o financiamento de mercado, e eu te mostro as duas contas. Posso te fazer mais duas perguntas pra ver qual encaixa?

**Por que funciona:** Diz "não dá" cedo, com o caminho possível, e mantém a condução com uma pergunta. Nunca rejeitar lead por renda alta: rotear.

#### Ligação · "Qual renda eu informo?"

> A análise usa a renda que você recebe e consegue comprovar, e é ela que protege você lá na frente. O que eu faço é ver com o correspondente como documentar certinho essa renda e quem pode entrar na compra junto com você. Me conta: hoje, como você recebe?

**Por que funciona:** Responde sem sermão, não abre exceção, protege o cliente e a SMQ, e volta para a qualificação com uma pergunta.

#### Ligação · Cliente PRONTO

> Perfeito, você já está com tudo na mão. Vamos marcar: sábado às 10h ou às 14h? A visita leva de 20 a 30 minutos, e eu já deixo a sua simulação pronta.

**Por que funciona:** PRONTO pede horário, não argumento. Duas opções e agilidade.

### Erros que matam a venda

- **Seguir qualificando quando o perfil já inviabiliza o MCMV**  
  Quanto custa: O problema aparece só na análise, o ponto mais caro  
  Correção: Dizer "não dá" cedo e mostrar o caminho possível
- **Sugerir composição de renda na F4 sem calcular a folga**  
  Quanto custa: O cliente passa de R$ 13.000 e cai no SBPE  
  Correção: Calcular 13.000 menos a renda atual antes
- **Tratar investidor como cliente MCMV**  
  Quanto custa: Handoff improdutivo: o programa é para moradia  
  Correção: Requalificar a finalidade e mudar de produto, sem tese de valorização
- **Sugerir valor de renda para "bater" com a aprovação**  
  Quanto custa: Risco grave para o cliente, para o corretor e para a SMQ  
  Correção: A renda real e comprovada define a aprovação, nunca o contrário

### No CRM

- **Tela:** Fila Única (card do cliente) e Dossiê do cliente
- **Ação:** Registrar o desfecho com a temperatura, o próximo passo e a data; na perda, o motivo verdadeiro
- **Campo:** Desfecho, próximo passo e data; motivo de perda (por exemplo, "Renda acima do teto do MCMV" só quando não houver rota para Pró-Cotista ou SBPE)
- **Regra:** Nada sai da fila sem desfecho

### Frase-âncora

> **Dizer "não dá" cedo salva o mês.**

### Checagem rápida

1. Quais são as 4 temperaturas?  
   Resposta: PRONTO, QUENTE, MORNO e FRIO, iguais às do robô.
2. Casal com renda de R$ 12.000 quer somar R$ 2.500 da mãe. O que você faz antes?  
   Resposta: Calcula a folga: 13.000 menos 12.000 é R$ 1.000. Somando R$ 2.500, passa do teto da F4 e o casal sai do programa.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente PRONTO pede horário, não argumento. O cliente que não fecha pede verdade, não mais uma semana de conversa. Os dois perdem quando o corretor trata todo mundo igual.","por_que_importa":"PRONTO e QUENTE são 9,4% dos leads e respondem por 84,6% dos handoffs, 91,6% das pastas e 97,3% dos agendamentos; o PRONTO agenda em 24,1% e o QUENTE em 7,2% (conversas do robô, jul a set/2026). Seguir qualificando quem o perfil já inviabiliza empurra a descoberta para a análise, o ponto mais caro: dizer \"não dá\" cedo salva o seu mês e o tempo do cliente.","conceito":"É a triagem do pronto-socorro: quem chega sangrando não espera na fila da gripe, e quem não precisa de internação sai com a receita certa. Classificar não é descartar; é dar a cada cliente o próximo passo que ele precisa.","metodo":["Classifique a temperatura ao fim da conversa: PRONTO (pediu visita ou análise, tem documento, fala em prazo), QUENTE (qualificado, perfil encaixa, engajado), MORNO (qualificado, sem urgência e sem visita), FRIO (sem resposta há 30 dias ou mais).","PRONTO: visita na hora, com duas opções, e análise oferecida depois, com leveza. QUENTE: um dos 2 caminhos com duas opções. MORNO e FRIO: próximo passo com data e conteúdo de valor.","Perfil que não fecha no MCMV: diga na hora, com o caminho possível. Renda acima de R$ 13.000 vai para Pró-Cotista ou SBPE; imóvel no nome ou financiamento ativo, outro caminho; restrição, pré-análise; investidor, produto de investimento.","Na F4, antes de sugerir composição de renda, calcule a folga: R$ 13.000 menos a renda atual. Passou do teto, o cliente sai do programa.","Renda é a real: se o cliente perguntar \"qual renda eu informo?\", a resposta é a renda que ele recebe e comprova. O correspondente orienta como documentar; ninguém sugere valor.","Feche com um dos 2 caminhos e registre temperatura, desfecho, próximo passo e data."],"na_vida_real":{"caso":"Da análise gratuita à assinatura em 23 dias (jan a fev/2026).","o_que_foi_dito":"O cliente, sócio de uma empresa, chegou desconfiado (\"os valores são reais?\") e perguntou em algum momento qual renda deveria informar. A resposta da casa é a renda real e comprovada. Os documentos chegaram em cerca de 2 horas depois da primeira ligação, e uma restrição interna do banco apareceu no meio do caminho.","resultado":"Com documento no primeiro dia e presença no crédito até destravar, o contrato foi assinado 19 dias depois do formulário e o primeiro boleto foi pago no dia 23. Cliente com documento e prazo é PRONTO: o trabalho é resolver o gargalo, não convencer.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Renda acima do teto do MCMV","texto":"[nome], com essa renda você fica acima do Minha Casa Minha Vida, que vai até R$ 13 mil pela regra de hoje. Isso não fecha a porta: tem o crédito com FGTS e o financiamento de mercado, e eu te mostro as duas contas. Posso te fazer mais duas perguntas pra ver qual encaixa?","por_que_funciona":"Diz \"não dá\" cedo, com o caminho possível, e mantém a condução com uma pergunta. Nunca rejeitar lead por renda alta: rotear."},{"canal":"Ligação","situacao":"\"Qual renda eu informo?\"","texto":"A análise usa a renda que você recebe e consegue comprovar, e é ela que protege você lá na frente. O que eu faço é ver com o correspondente como documentar certinho essa renda e quem pode entrar na compra junto com você. Me conta: hoje, como você recebe?","por_que_funciona":"Responde sem sermão, não abre exceção, protege o cliente e a SMQ, e volta para a qualificação com uma pergunta."},{"canal":"Ligação","situacao":"Cliente PRONTO","texto":"Perfeito, você já está com tudo na mão. Vamos marcar: sábado às 10h ou às 14h? A visita leva de 20 a 30 minutos, e eu já deixo a sua simulação pronta.","por_que_funciona":"PRONTO pede horário, não argumento. Duas opções e agilidade."}],"erros_que_matam":[{"erro":"Seguir qualificando quando o perfil já inviabiliza o MCMV","custo":"O problema aparece só na análise, o ponto mais caro","correcao":"Dizer \"não dá\" cedo e mostrar o caminho possível"},{"erro":"Sugerir composição de renda na F4 sem calcular a folga","custo":"O cliente passa de R$ 13.000 e cai no SBPE","correcao":"Calcular 13.000 menos a renda atual antes"},{"erro":"Tratar investidor como cliente MCMV","custo":"Handoff improdutivo: o programa é para moradia","correcao":"Requalificar a finalidade e mudar de produto, sem tese de valorização"},{"erro":"Sugerir valor de renda para \"bater\" com a aprovação","custo":"Risco grave para o cliente, para o corretor e para a SMQ","correcao":"A renda real e comprovada define a aprovação, nunca o contrário"}],"no_crm":{"tela":"Fila Única (card do cliente) e Dossiê do cliente","acao":"Registrar o desfecho com a temperatura, o próximo passo e a data; na perda, o motivo verdadeiro","campo":"Desfecho, próximo passo e data; motivo de perda (por exemplo, \"Renda acima do teto do MCMV\" só quando não houver rota para Pró-Cotista ou SBPE)","regra":"Nada sai da fila sem desfecho"},"frase_ancora":"Dizer \"não dá\" cedo salva o mês.","checagem_rapida":[{"pergunta":"Quais são as 4 temperaturas?","resposta":"PRONTO, QUENTE, MORNO e FRIO, iguais às do robô."},{"pergunta":"Casal com renda de R$ 12.000 quer somar R$ 2.500 da mãe. O que você faz antes?","resposta":"Calcula a folga: 13.000 menos 12.000 é R$ 1.000. Somando R$ 2.500, passa do teto da F4 e o casal sai do programa."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q01', 1, 'situacional',
  'O dossiê do robô diz: renda somada de R$ 4.500, Zona Leste, primeiro imóvel, para morar. Na ligação, depois da abertura, qual é a sua próxima fala?',
  '["\"Pra começar, quanto vocês ganham por mês, somando todo mundo?\"","\"Posso te mandar o book do empreendimento pra você dar uma olhada?\"","\"Vi aqui que vocês ganham juntos em torno de R$ 4.500, continua assim? E pra entrada, vocês contam com algum valor guardado ou com FGTS?\"","\"Me conta mais sobre você.\""]'::jsonb,
  2,
  'A C confirma o dossiê em uma frase e vai direto para o que quase sempre falta (entrada e FGTS). A A repergunta o que o robô já sabia, e o cliente desiste. A B manda material antes da qualificação. A D é a pergunta genérica que a auditoria marcou como erro.',
  'M16-A1; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q02', 2, 'situacional',
  'O cliente diz: "Prefiro não falar a minha renda agora." O que você responde?',
  '["\"Funciona como consulta médica: antes de receitar, o médico examina. Pra eu te mostrar só o que cabe no seu bolso, me diz em qual dessas faixas vocês ficam: até R$ 3.200, de R$ 3.200 a R$ 5.000, de R$ 5.000 a R$ 9.600 ou acima disso?\"","\"Sem a renda eu não consigo te ajudar.\"","\"Tudo bem, vou te mandar o apartamento mais barato que a gente tem.\"","\"Então me passa o seu CPF que eu consulto.\""]'::jsonb,
  0,
  'A A usa a âncora antes da pergunta e oferece faixas, que são mais fáceis de responder. A B fecha a conversa. A C apresenta produto sem qualificação. A D pede CPF sem aceite e sem explicar para quê, o contrário da LGPD.',
  'M16-A2; Estudo, fase C, situação 32', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q03', 3, 'aplicacao',
  'Qual é a ordem certa para enquadrar o cliente antes de ofertar um produto?',
  '["Parcela, entrada, faixa e renda.","Produto, renda, parcela e FGTS.","Faixa, renda, subsídio e parcela.","Renda, faixa MCMV, subsídio, FGTS, entrada e parcela."]'::jsonb,
  3,
  'A D é a ordem da espinha: sem a faixa definida, a simulação sai errada e a pasta é reprovada. A A e a C começam pelo fim ou pela faixa sem saber a renda. A B começa pelo produto, o erro que faz o cliente se apaixonar pelo que não cabe.',
  'M16-A2; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q04', 4, 'conceito',
  'Quais são os 5 campos obrigatórios da ficha do cliente?',
  '["Nome, telefone, e-mail, CPF e empreendimento.","Renda familiar, tipo de renda, FGTS e tempo de registro, valor de entrada e quem decide junto.","Renda, score, idade, estado civil e bairro.","Temperatura, origem, campanha, faixa e região."]'::jsonb,
  1,
  'A B traz os 5 campos da espinha. A A são dados de cadastro, não de qualificação. A C mistura dados que não são a ficha oficial (score não é campo nem sentença). A D são dados que o sistema ou o robô já registram.',
  'M16-A1; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q05', 5, 'situacional',
  'Um casal com renda de R$ 12.000 quer somar a renda da mãe, de R$ 2.500, para comprar um apartamento de R$ 480 mil. O que você faz? (faixas vigentes desde 22/04/2026; confirmar na tabela oficial)',
  '["Soma as rendas, porque mais renda sempre aprova mais.","Calcula a folga antes: R$ 13.000 menos R$ 12.000 dá R$ 1.000. Somando R$ 2.500, a renda passa do teto da F4 e o casal sai do MCMV. Mostra isso, roda o cenário de laudo e avalia outro produto se a entrada não fechar.","Diz que composição de renda não é permitida no MCMV.","Diz que, com a renda da mãe, a aprovação é certa."]'::jsonb,
  1,
  'A B é a correção oficial do erro da composição na F4: calcular a folga antes. A A ignora que passar de R$ 13.000 tira o cliente do programa. A C é falsa: compor renda é permitido. A D é promessa de aprovação, proibida.',
  'M16-A5; seção 9.9; persona P4', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q06', 6, 'aplicacao',
  'A cliente diz que trabalha registrada há 2 anos e 10 meses, somando dois empregos. O que você registra e faz?',
  '["Tira o FGTS da conversa, porque ela não tem.","Diz que ela já pode usar o FGTS na entrada.","Explica que o FGTS só conta no mesmo emprego.","Registra nas Observações a data em que ela completa 3 anos somando os vínculos e transforma essa data em próximo passo, explicando a regra sem prometer o valor livre."]'::jsonb,
  3,
  'A D usa o marco dos 3 anos como próximo passo comercial: o FGTS pede 3 anos somando todos os vínculos, e a data se agenda. A A joga fora uma trava que se resolve em 2 meses. A B é falsa hoje. A C inventa uma exigência que não existe.',
  'M16-A2; seção 9.9; persona P3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q07', 7, 'caca_ao_erro',
  'Leia a mensagem de WhatsApp de um corretor: "Oi! Qual a renda de vocês, se usam FGTS, quanto têm de entrada e se o nome tá limpo?" Qual é o problema?',
  '["Quatro perguntas numa mensagem só, sem nenhuma âncora: parece interrogatório e o cliente responde só uma.","Nenhum: a mensagem é objetiva e economiza tempo.","Faltou pedir o CPF junto, para já consultar.","O certo seria mandar tudo num áudio de 3 minutos."]'::jsonb,
  0,
  'A A aponta o erro: no WhatsApp é uma pergunta por mensagem, com a âncora antes das sensíveis. A B confunde objetividade com interrogatório. A C piora: CPF só com aceite e propósito. A D contraria a regra do áudio (depois da segunda resposta, de 40 a 60 segundos).',
  'M16-A2; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q08', 8, 'situacional',
  'No WhatsApp, o cliente responde: "nome tá limpo não, mas é coisa pequena". O que você faz?',
  '["Entende que o nome está limpo e segue para a simulação.","Diz que, com o nome sujo, não dá para financiar.","Lê a negação no fim da frase (o nome não está limpo), acolhe sem julgar, pergunta o tipo de pendência e propõe a pré-análise com o correspondente antes de ele quitar qualquer coisa.","Pede para ele quitar tudo primeiro e voltar depois."]'::jsonb,
  2,
  'A C faz a leitura atenta e segue a regra: restrição não descarta, vai para a pré-análise. A A lê pelo tom e erra o sentido da frase. A B descarta um lead que pode ter caminho. A D manda o cliente embora e ainda pode fazê-lo pagar sem necessidade.',
  'M16-A2; seção 9.9; persona P8', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q09', 9, 'conceito',
  'Qual é a ordem dos degraus da escada da consciência?',
  '["Ideal, situação, incômodo e consequência.","Incômodo, ideal, situação e consequência.","Situação, ideal, consequência e incômodo.","Situação, incômodo, consequência e ideal."]'::jsonb,
  3,
  'A D é a escada: primeiro como está, depois o que incomoda, o que acontece se continuar e como seria o ideal. As outras começam pelo fim ou pulam degraus, e o cliente não chega sozinho à própria necessidade.',
  'M16-A3; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q10', 10, 'aplicacao',
  'O cliente tem os documentos em mãos, pediu para visitar no sábado e disse que o contrato do aluguel vence em 3 meses. Qual é a temperatura e a ação? (definições a confirmar no CRM)',
  '["MORNO: conteúdo educativo uma vez por semana.","PRONTO: visita confirmada na hora, com duas opções, e análise oferecida depois, com leveza.","QUENTE: mandar o book e esperar ele voltar.","FRIO: última tentativa com dignidade."]'::jsonb,
  1,
  'A B reconhece o PRONTO: pediu visita, tem documento e fala em prazo. PRONTO pede horário, não argumento. A A e a C atrasam quem já quer avançar. A D é para quem está sem resposta há 30 dias ou mais.',
  'M16-A5; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q11', 11, 'situacional',
  'O cliente declara renda de R$ 2.900 e pergunta se entra no Minha Casa Minha Vida. Qual é a sua resposta?',
  '["\"Só pra eu te orientar certo: esse valor é o que cai na conta ou é antes dos descontos? E vai ser só você na compra?\"","\"Parabéns, você é Faixa 1 e tem o maior subsídio!\"","\"Com essa renda fica difícil, melhor esperar.\"","\"Você vai ganhar R$ 55 mil de subsídio do governo.\""]'::jsonb,
  0,
  'A A confirma bruto, líquido e composição antes da boa notícia, como manda a regra da renda perto do piso. A B dá a boa notícia precoce, que vira desqualificação tardia. A C descarta sem enquadrar. A D promete valor de subsídio, que só a análise define.',
  'M16-A2; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q12', 12, 'aplicacao',
  'O lead diz que quer comprar um apartamento do Minha Casa Minha Vida para alugar e ter renda. O que você faz?',
  '["Segue a qualificação normal, porque ele tem renda.","Diz que o imóvel vai valorizar e o aluguel paga a parcela.","Requalifica a finalidade: o MCMV é para moradia própria. Leva o investidor para o produto certo, sem tese de valorização.","Orienta a dizer na análise que vai morar."]'::jsonb,
  2,
  'A C segue a regra: MCMV é para morar, e investidor vai para outro produto (R2V, nR ou SBPE). A A gera um handoff improdutivo. A B promete valorização, proibida. A D orienta o cliente a declarar algo falso, falta grave.',
  'M16-A5; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q13', 13, 'conceito',
  'O que é a Q7 e quando ela é feita?',
  '["É o decisor, perguntado só na visita.","É a renda, coletada pelo robô.","É a objeção latente (\"o que ainda poderia te impedir de avançar?\"), feita na versão leve na ligação e na versão final na visita.","É a experiência anterior, perguntada depois da venda."]'::jsonb,
  2,
  'A C define a Q7 e os dois momentos. A A é a Q5, e o decisor se descobre na ligação. A B é a Q1. A D é a Q6, e ela entra na ligação, não depois da venda.',
  'M16-A4; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q14', 14, 'situacional',
  'Na ligação, você faz a Q7 e o cliente responde: "A minha esposa precisa gostar, e ela tem medo de não aprovar." Qual é o próximo passo?',
  '["Registra em Objeções do cliente e oferece a visita com duas opções num horário em que os dois possam ir, com a análise gratuita antes para tirar o medo de aprovação.","Marca a visita só com ele e deixa para convencer a esposa depois.","Diz que, pelo perfil, a aprovação é garantida.","Anota mentalmente e segue apresentando o produto."]'::jsonb,
  0,
  'A A transforma a objeção latente em plano: decisor na visita e análise gratuita contra o medo. A B contraria a regra do co-decisor presente. A C promete aprovação. A D perde a informação que o fechamento vai precisar.',
  'M16-A4; seções 3 e 9.4', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q15', 15, 'caca_ao_erro',
  'Trecho de ligação. Corretor: "Você ganha quanto?" Cliente: "Uns 6 mil." Corretor: "Show! Tenho um de R$ 400 mil perfeito pra você, com subsídio de uns R$ 30 mil. Te mando agora." Qual é o erro mais grave?',
  '["Usar a palavra \"show\".","Não pedir o CPF.","Falar rápido demais.","Prometer subsídio para uma renda de F3, que não tem subsídio, e apresentar produto sem tipo de renda, entrada, FGTS e decisor."]'::jsonb,
  3,
  'A D junta os dois erros graves: F3 não tem subsídio (regra vigente desde 22/04/2026) e o produto veio antes das travas e do decisor. A A é estilo, não erro. A B não é o problema: CPF só com aceite. A C é detalhe diante de uma promessa falsa.',
  'M16-A2 e M16-A5; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q16', 16, 'aplicacao',
  'A persona P2, entregador de aplicativo com renda de cerca de R$ 2.800, pergunta: "É pra autônomo também?" Qual é a melhor resposta?',
  '["\"Autônomo é mais difícil, você precisaria abrir um MEI antes.\"","\"Boa notícia: a renda de motorista e de entregador de aplicativo passou a contar na análise. Você roda em qual aplicativo?\"","\"Desde agosto de 2026 a Caixa aceita a renda de aplicativo, então você está aprovado.\"","\"Me passa o login do seu aplicativo pra eu ver quanto você ganha.\""]'::jsonb,
  1,
  'A B normaliza na hora e fecha com uma pergunta só. A A inventa uma exigência (a regra não exige MEI). A C crava data e promete aprovação. A D pede senha, o que ninguém da SMQ faz, nunca.',
  'M16-A2; seções 9.9 e 9.14', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q17', 17, 'situacional',
  'No meio da qualificação, o cliente pergunta: "Qual renda eu informo pra aprovar?" O que você responde?',
  '["Sugere arredondar a renda um pouco para cima.","Diz que o valor que ele recebe em mãos também pode entrar.","Diz para informar só o salário maior do casal.","Que a análise usa a renda real e comprovada; o correspondente orienta como documentar essa renda e quem pode entrar na compra, e ninguém sugere valor."]'::jsonb,
  3,
  'A D é a regra "renda é a real" (caso N). A A e a B inflam renda, risco grave para o cliente, o corretor e a SMQ. A C distorce a composição: quem entra na compra se decide com o correspondente, dentro da regra.',
  'M16-A5; seções 9.11 e 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q18', 18, 'conceito',
  'Por que as dimensões da qualificação se chamam Q1 a Q7, e não D1 a D7 como no material de abril?',
  '["Porque na SMQ \"D\" é dia, como na cadência D1, D2, D3 e na confirmação D-2, D-1 e D+0.","Porque a Caixa exige essa nomenclatura.","Porque são sete documentos da pasta.","Porque Q é a inicial de quitação."]'::jsonb,
  0,
  'A A traz o motivo oficial: a mesma letra para dia e dimensão confundia o time. As outras inventam razões que não existem.',
  'M16-A1; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q19', 19, 'aplicacao',
  'A cliente tem renda de R$ 7.500 (F3), gostou de um apartamento de R$ 300 mil e tem R$ 20 mil guardados. Qual é a leitura certa da Trava A? (regras vigentes em set/2026; confirmar no simulador)',
  '["A parcela cabe na renda, então está fechado.","Com laudo igual ao preço, a entrada mínima é de cerca de R$ 60 mil; faltam cerca de R$ 40 mil, que dependem do FGTS ou do parcelamento da campanha até as chaves, e ainda é preciso rodar o cenário de laudo 10% e 20% abaixo.","No MCMV não precisa de entrada.","O subsídio cobre a diferença da entrada."]'::jsonb,
  1,
  'A B faz a conta certa: a Caixa financia até 80% do menor valor entre preço e laudo, então 20% é o piso, e na F3 se roda o laudo abaixo. A A esquece que a trava costuma ser a entrada, não a parcela. A C ("entrada zero") é frase proibida. A D é falsa: F3 não tem subsídio.',
  'M16-A2; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M16-Q20', 20, 'situacional',
  'O cliente tem renda familiar de R$ 14.000 e quer um apartamento do Minha Casa Minha Vida. O que você faz? (faixas vigentes desde 22/04/2026)',
  '["Descarta: a renda é alta demais para a SMQ.","Diz que dá para declarar uma renda menor.","Diz na hora que acima de R$ 13.000 é outra modalidade (crédito com FGTS ou financiamento de mercado), sem descartar, e segue a qualificação para o produto certo.","Segue no MCMV e deixa a análise da Caixa decidir."]'::jsonb,
  2,
  'A C diz "não dá" cedo e roteia: nunca rejeitar lead por renda alta. A A descarta quem tem caminho. A B sugere declaração falsa. A D empurra a descoberta para a análise, o ponto mais caro.',
  'M16-A5; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (14)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F01', 1, 'A frase da qualificação', 'Qualificação é ficha preenchida, não conversa boa.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F02', 2, 'As 3 camadas da espinha', '6 perguntas na ligação · 5 campos obrigatórios na ficha · 7 dimensões SMQ e 2 travas técnicas no checklist.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F03', 3, 'Os 5 campos obrigatórios', 'Renda familiar · tipo de renda · FGTS e tempo de registro · valor de entrada · quem decide junto.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F04', 4, 'As 7 dimensões SMQ', 'Q1 renda · Q2 urgência · Q3 motivação · Q4 situação atual · Q5 decisor · Q6 experiência anterior · Q7 objeção latente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F05', 5, 'As 2 travas técnicas', 'Trava A: entrada e FGTS. Trava B: nome e crédito.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F06', 6, 'O que quase sempre falta no dossiê', 'Entrada (85,1%), FGTS (73,1%), restrição no nome (69,5%) e momento de compra (67,5%), jul a set/2026.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F07', 7, 'A escada da consciência', 'Situação → incômodo → consequência → ideal. O cliente que diz a própria necessidade se convence.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F08', 8, 'A pergunta da Q7', '"Se você encontrasse o apartamento certo com a parcela certa, o que ainda poderia te impedir de avançar?" Leve na ligação, final na visita.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F09', 9, 'A âncora do médico', '"Antes de receitar, o médico examina. Pra eu te mostrar só o que cabe no seu bolso, me diz: vocês ganham mais ou menos quanto por mês?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F10', 10, 'Enquadrar antes de ofertar', 'Renda → faixa MCMV → subsídio → FGTS → entrada → parcela.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F11', 11, 'Folga da F4', 'R$ 13.000 menos a renda atual. Passou do teto, o cliente sai do MCMV e cai no SBPE (regra vigente desde 22/04/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F12', 12, '"Nome tá limpo não"', 'Quer dizer que NÃO está limpo. Leia a negação no fim da frase e vá para a pré-análise, sem prometer.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F13', 13, 'PRONTO pede o quê?', 'Horário, não argumento. PRONTO e QUENTE são 9,4% dos leads e 97,3% dos agendamentos (jul a set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M16-F14', 14, '"Qual renda eu informo?"', 'A renda real e comprovada. O correspondente orienta como documentar; ninguém sugere valor.', true
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1 quinzenal, abra com o corretor o Dossiê de três clientes dele em \"Agendado\" e confira juntos os 5 campos, a Q3 e a Q7: ficha incompleta é o assunto do 1:1. Na reunião de segunda, leve uma ficha anônima bem preenchida e uma vazia, e pergunte ao time o que cada uma permite fazer na visita. Aplique o laboratório de 4 horas uma vez no primeiro mês de cada corretor, com as cinco personas, e repita a rodada da P4 (composição na F4) sempre que aparecer uma perda por \"Renda acima do teto do MCMV\".","sinais_de_dificuldade":["Clientes em \"Agendado\" com Renda informada, Entrada disponível ou Decisor vazios no Dossiê.","Perdas por \"Sem perfil\", \"Crédito (renda)\" ou \"Renda acima do teto do MCMV\" registradas depois de \"Visita realizada\" ou de \"Análise de crédito\".","Objeções do cliente e Perfil do cliente em branco na maioria da carteira, ou com texto genérico (\"cliente interessado\")."],"perguntas_de_coaching":["Nesse cliente, o que o robô já sabia e o que você completou na ligação?","Qual foi a resposta dele na Q7, e como você preparou a visita a partir dela?","Em qual momento da conversa você percebeu que o perfil não fechava, e o que você ofereceu no lugar?"],"ritual_de_celebracao":"Reunião de segunda: a \"ficha da semana\", uma ficha anônima completa que levou a visita ou análise, lida em voz alta pelo gerente. No All Hands quinzenal, destaque para quem concluiu o M16 com o desafio das 5 fichas, e no LEGADO a categoria Disciplina de Processo."},"pratica_gabarito":["P1: descobrir que a esposa decide junto (Q5), o aluguel de R$ 1.200 (Q4) e o FGTS de 4 anos (Trava A); temperatura QUENTE; desfecho: visita com os dois, em duas opções, e lista de documentos.","P2: dar a boa notícia da renda de aplicativo na hora, perguntar qual aplicativo e há quanto tempo, descobrir os 2 anos de registro (FGTS ainda sem os 3 anos); acolher a resistência ao documento e mudar para a visita no horário dele.","P3: descobrir que ela completa 3 anos de FGTS em 2 meses (marco comercial a agendar), montar a conta real da entrada com o parcelamento da campanha e marcar a visita; temperatura QUENTE.","P4: calcular a folga (R$ 13.000 menos R$ 12.000 é R$ 1.000) antes de falar em composição, mostrar que somar a renda da mãe tira do programa, rodar o cenário de laudo 10% e 20% abaixo e oferecer outro produto se a entrada não fechar.","P8: ler a negação no fim da frase (o nome NÃO está limpo), acolher sem prometer, perguntar o tipo de pendência e propor a pré-análise com o correspondente antes de quitar qualquer coisa."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M16' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
