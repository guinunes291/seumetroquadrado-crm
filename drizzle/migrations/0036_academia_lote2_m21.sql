-- ===========================================================================
-- ACADEMIA SMQ · LOTE 2 (v1.0) · seed do módulo M21
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-2/academia-smq-lote-2.json.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- 6 aulas · 20 questões · 14 flashcards
-- ===========================================================================

-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  ('M21', 21, 3, 'Pasta, proposta e fechamento: do documento à venda registrada', 'Ao final, você monta a pasta pelo perfil do cliente com os documentos que mais travam primeiro, passa pela revisão do gerente antes do correspondente, propõe o fechamento só com os 4 pré-requisitos e dentro da condição da campanha, e registra toda venda pelo diálogo "Registrar venda" no mesmo dia da assinatura, e isso aparece no CRM como pastas sem "Pasta travada" na Fila Única, clientes em Análise de crédito com próximo passo e data, e vendas pendentes de aprovação com os três marcos de efetivação.',
   '["Eu sou capaz de montar a lista de documentos pelo perfil do cliente na aba Documentação, pedindo primeiro extrato de 6 meses, comprovante de estado civil e CPF, e de fechar a lista com uma âncora.","Eu sou capaz de levar a pasta pelo caminho da casa (CRM, revisão do gerente, correspondente do empreendimento) e de dar notícia ao cliente pelo menos a cada 5 dias úteis durante a análise.","Eu sou capaz de montar a proposta só com a condição da campanha, levando qualquer pedido extra ao gerente com retorno marcado, e de explicar o custo total separando a parcela de obra da parcela do financiamento.","Eu sou capaz de conferir os 4 pré-requisitos, escolher uma das 5 formas de propor o próximo passo e tratar o \"vou pensar\" com o protocolo em 4 passos, terminando com data e hora.","Eu sou capaz de registrar a venda pelo diálogo \"Registrar venda\" no mesmo dia da assinatura, com os três marcos de efetivação, e de manter o pós-venda até as chaves."]'::jsonb, 1.7, '100 min', true,
   '**Role-play de fechamento com scorecard, em trio (corretor, cliente e observador)** · 60 min

**Papéis:** Corretor, cliente com o cartão da persona e observador com o scorecard. São duas rodadas por corretor, uma com cada persona; os papéis se revezam.

**Persona:** P1 (casal que cansou do aluguel, F2) e P3 (solteira CLT perto do metrô, F3)

**Roteiro:** A cena começa depois da visita, com a simulação já feita pela calculadora oficial. O corretor confere os 4 pré-requisitos, escolhe uma das 5 formas de propor o próximo passo, sustenta o silêncio depois da proposta, trata as objeções com o protocolo em 4 passos, monta a condição dentro da campanha e termina com a próxima ação registrada no CRM (assinatura marcada, documento combinado ou data de retorno com o decisor). Em seguida, o corretor mostra ao gerente, na tela, como registraria a venda pelo diálogo "Registrar venda" se o contrato tivesse sido assinado.

**Roteiro do cliente:**

- P1 (casal, renda somada de R$ 4.500, aluguel de R$ 1.200): começa com "gostei, mas preciso ver com a minha esposa", porque ela decide junto e não veio. Pergunta: "a parcela vai ser maior que o meu aluguel?" e "e se eu perder o emprego?". Só avança se o corretor propuser a conversa com os dois, com duas opções.
- P3 (renda de R$ 7.500, pouco dinheiro guardado, FGTS de 2 anos e 10 meses): diz "vou pensar" logo depois da simulação. Esconde que acha que não tem entrada e não sabe que completa 3 anos de FGTS em 2 meses. Só revela se o corretor investigar. Se o corretor der a conta real da entrada, a condição da campanha e a data do marco do FGTS, aceita marcar o próximo passo.
- Nas duas rodadas, o cliente pede "um descontinho pra fechar hoje" uma vez e pergunta "posso te fazer um Pix pra garantir?".

**O que o observador procura:**

- Os 4 pré-requisitos conferidos antes da proposta (decisor, Q7, sinais, simulação entendida).
- Uma das 5 formas de propor escolhida de propósito, sem a pergunta "vai fechar?".
- Silêncio de pelo menos 30 segundos depois da proposta.
- "Vou pensar" tratado com validar, investigar, endereçar e agir, terminando com data e hora.
- Desconto respondido com a condição da campanha e o pedido extra levado ao gerente com retorno marcado.
- Pagamento só por canal oficial e nenhum prazo de garantia prometido (critério 6 só vale com nota 5).
- Próxima ação registrada no CRM ao final, e os três marcos citados na demonstração do "Registrar venda".

**Rubrica:** Padrão SMQ, critérios 3 (condução), 4 (objeção), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Objeção: validar, investigar, endereçar, ação","peso":1},{"criterio":"Desfecho: dia e hora ou documento; duas opções; nada de \"vou pensar\" aceito sem horário","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 2 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Prazo de garantia da unidade de cada construtora (decisão 24, aberta): a aula não promete prazo ao cliente e manda confirmar com o gerente. | [CONFIRMAR] Passos depois da aprovação e modelo de financiamento de cada empreendimento (na planta ou na entrega), com o correspondente. | [CONFIRMAR] Lista de documentos por perfil, inclusive a da renda de aplicativo, com o correspondente de cada empreendimento. | [CONFIRMAR] Prazo típico de retorno da análise por correspondente (a aula ensina a não prometer prazo). | [CONFIRMAR] Coberturas do seguro do financiamento com o correspondente (gabarito da P1: morte, invalidez e danos ao imóvel; não cobre desemprego). | [GAP DE CRM] A esteira da pasta (montando, completa, enviada ao correspondente, em análise na Caixa, pendência, aprovada ou reprovada), o correspondente do empreendimento e o registro da revisão do gerente não aparecem com esses nomes: a aba Documentação tem status por documento (Pendente, Recebido, Aprovado, Reprovado). Proposta: estado da pasta e um marco "revisada pelo gerente". | [GAP DE CRM] Não há indicador de cards arrastados para "Venda" sem venda registrada pelo diálogo. Proposta: contador na Higiene do Funil e no Meu Raio-X. | [DADO A MEDIR NO CRM] Tempo até pasta completa e taxa de aprovação de crédito (a aprovação quase não é registrada no sistema).', '{"formato":"canonico-8.2","lote":2,"versao_conteudo":"1.0","trilha":"T3","ordem":7,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"Pasta que anda, proposta dentro da campanha, fechamento sem pressão e venda que existe no sistema.","duracao_min":100,"por_que_vale_dinheiro":{"texto":"Quando a pasta chega na Caixa, a casa converte bem: a passagem da análise de crédito para fechado foi de 39,1% nos 90 dias até 11/09/2026. O dinheiro parado está no fundo do funil: no mesmo diagnóstico, 118 clientes QUENTES estavam em análise de crédito sem movimento, os piores entre 70 e 79 dias. Destravar a pasta e registrar a venda do jeito certo é o caminho mais curto até a comissão que você já conquistou.","numero":"118 clientes QUENTES parados em análise de crédito; passagem análise de crédito → fechado de 39,1%","fonte":"Diagnóstico do funil no CRM","periodo":"90 dias até 11/09/2026"},"pre_requisitos":["M00","M25","M26","M15","M16","M18","M19"],"indicador_crm":{"nome":"Passagem \"Análise de crédito → Venda\" e vendas registradas pelo diálogo contra cards arrastados para \"Venda\"","onde_ler":"Meu Raio-X (conversão por etapa) e Fila Única (prioridade \"Pasta travada\"); para o gerente, Operação › Funil e Assinaturas & Comissões › \"Aprovações de venda\"","linha_de_base":"Pasta ou proposta em 87,0% (meta de 75%) e fechamento em 45,3% (meta de 30%) no funil do CRM (set/2026); análise de crédito → fechado em 39,1% (90 dias até 11/09/2026); cards arrastados para \"Venda\" sem venda registrada: [DADO A MEDIR NO CRM]","meta_sugerida":"Zero venda fora do diálogo \"Registrar venda\"; toda venda registrada no dia da assinatura, com os três marcos; nenhum cliente em Análise de crédito sem próximo passo e data","fonte":"Treinamento do CRM SMQ (set/2026) e diagnóstico do funil no CRM (11/09/2026)","gap_de_crm":true},"pratica":{"tipo":"Role-play de fechamento com scorecard, em trio (corretor, cliente e observador)","duracao_min":60,"persona":"P1 (casal que cansou do aluguel, F2) e P3 (solteira CLT perto do metrô, F3)","rubrica":"Padrão SMQ, critérios 3 (condução), 4 (objeção), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"Corretor, cliente com o cartão da persona e observador com o scorecard. São duas rodadas por corretor, uma com cada persona; os papéis se revezam.","roteiro":"A cena começa depois da visita, com a simulação já feita pela calculadora oficial. O corretor confere os 4 pré-requisitos, escolhe uma das 5 formas de propor o próximo passo, sustenta o silêncio depois da proposta, trata as objeções com o protocolo em 4 passos, monta a condição dentro da campanha e termina com a próxima ação registrada no CRM (assinatura marcada, documento combinado ou data de retorno com o decisor). Em seguida, o corretor mostra ao gerente, na tela, como registraria a venda pelo diálogo \"Registrar venda\" se o contrato tivesse sido assinado.","roteiro_cliente":["P1 (casal, renda somada de R$ 4.500, aluguel de R$ 1.200): começa com \"gostei, mas preciso ver com a minha esposa\", porque ela decide junto e não veio. Pergunta: \"a parcela vai ser maior que o meu aluguel?\" e \"e se eu perder o emprego?\". Só avança se o corretor propuser a conversa com os dois, com duas opções.","P3 (renda de R$ 7.500, pouco dinheiro guardado, FGTS de 2 anos e 10 meses): diz \"vou pensar\" logo depois da simulação. Esconde que acha que não tem entrada e não sabe que completa 3 anos de FGTS em 2 meses. Só revela se o corretor investigar. Se o corretor der a conta real da entrada, a condição da campanha e a data do marco do FGTS, aceita marcar o próximo passo.","Nas duas rodadas, o cliente pede \"um descontinho pra fechar hoje\" uma vez e pergunta \"posso te fazer um Pix pra garantir?\"."],"observador_procura":["Os 4 pré-requisitos conferidos antes da proposta (decisor, Q7, sinais, simulação entendida).","Uma das 5 formas de propor escolhida de propósito, sem a pergunta \"vai fechar?\".","Silêncio de pelo menos 30 segundos depois da proposta.","\"Vou pensar\" tratado com validar, investigar, endereçar e agir, terminando com data e hora.","Desconto respondido com a condição da campanha e o pedido extra levado ao gerente com retorno marcado.","Pagamento só por canal oficial e nenhum prazo de garantia prometido (critério 6 só vale com nota 5).","Próxima ação registrada no CRM ao final, e os três marcos citados na demonstração do \"Registrar venda\"."]},"desafio_campo":{"tarefa":"Pasta andando em 72 horas: (1) todo cliente seu em Análise de crédito recebe notícia (ligação ou mensagem) e fica com desfecho, próximo passo e data; (2) toda pasta em montagem tem o perfil de renda escolhido na aba Documentação e pelo menos uma pendência cobrada com âncora; (3) se houver assinatura no período, a venda é registrada pelo diálogo \"Registrar venda\" no mesmo dia, com os três marcos, e nenhum card é arrastado para \"Venda\" sem registro.","prazo_horas":72,"evidencia_no_crm":"Clientes em Análise de crédito com próximo passo e data; aba Documentação com perfil escolhido e status atualizados; \"Pasta travada\" reduzida na Fila Única; em Assinaturas & Comissões, card \"Aprovações de venda\", vendas com data de assinatura igual ao dia do registro e os três marcos.","como_o_gestor_confere":"O gerente filtra a Base de leads do corretor pela etapa Análise de crédito e confere se todos têm próximo passo com data dentro das 72 horas; abre três Dossiês ao acaso na aba Documentação; e, se houve venda, confere no card \"Aprovações de venda\" (Assinaturas & Comissões) a data de assinatura, os marcos e se não há card em \"Venda\" sem registro."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O diretor grava a abertura e o fechamento; o gerente grava a demonstração de tela da aba Documentação e do diálogo \"Registrar venda\"","cenario":"Escritório da SMQ, com o CRM aberto no Dossiê de um cliente de treino","blocos":[{"tempo":"0:00","fala":"Um cliente mandou todos os documentos em duas horas. Outro recebeu a mesma lista e sumiu. A diferença não foi o cliente. Foi a lista.","na_tela":"Duas conversas lado a lado, anônimas"},{"tempo":"0:30","fala":"Quando a pasta chega na Caixa, a gente converte bem. O dinheiro parado está antes: em setembro, 118 clientes quentes estavam parados em análise de crédito.","na_tela":"Funil com a etapa Análise de crédito destacada"},{"tempo":"1:00","fala":"O caminho é um só: você anexa no CRM, o seu gerente revisa, você envia ao correspondente do empreendimento. E durante a análise, notícia a cada 5 dias úteis, mesmo sem novidade.","na_tela":"O caminho da pasta em quatro passos"},{"tempo":"1:40","fala":"Olha como se monta a lista pelo perfil, com os três documentos que mais travam no topo.","na_tela":"Demonstração: aba Documentação, perfil de renda e Cobrar pendência"},{"tempo":"2:30","fala":"Na proposta, o preço de tabela é o mesmo pra todo mundo. A condição da campanha você monta. O resto, o seu gerente decide. E pagamento, só pelo canal oficial.","na_tela":"O que o corretor pode e o que leva ao gerente"},{"tempo":"3:10","fala":"Fechamento é consequência: decisor presente, Q7 feita, dois sinais de compra, simulação entendida. Aí você propõe o como, e fica em silêncio.","na_tela":"Os 4 pré-requisitos e as 5 formas"},{"tempo":"3:50","fala":"O erro que mais custa depois do sim: arrastar o card para Venda. Isso não cria venda. Registrar venda, data de assinatura, os três marcos, no mesmo dia.","na_tela":"Demonstração: diálogo Registrar venda"},{"tempo":"4:30","fala":"Desafio: em 72 horas, todo cliente em análise com notícia e próximo passo. Documentação travada é venda perdida.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 4, 9.1, 9.4, 9.5, 9.7, 9.8, 9.9, 9.10, 9.12, 9.13, 9.14, 9.16 e 9.17 do super prompt","Estudo da Academia v2.1, seções 5.7, 5.8, 5.9 e as situações das fases J, K e L","Treinamento do CRM SMQ (set/2026) e diagnóstico do funil no CRM (11/09/2026)","Conteúdo atual do M21 no CRM (Notion, abr/2026): fechamento como consequência, pré-requisitos, 5 técnicas, \"vou pensar\" em 4 passos e sair sempre com próxima ação","Repositório do CRM: diálogo \"Registrar venda\", marcos de efetivação e aba Documentação"],"origem":"SMQ","pendencias":["[CONFIRMAR] Prazo de garantia da unidade de cada construtora (decisão 24, aberta): a aula não promete prazo ao cliente e manda confirmar com o gerente.","[CONFIRMAR] Passos depois da aprovação e modelo de financiamento de cada empreendimento (na planta ou na entrega), com o correspondente.","[CONFIRMAR] Lista de documentos por perfil, inclusive a da renda de aplicativo, com o correspondente de cada empreendimento.","[CONFIRMAR] Prazo típico de retorno da análise por correspondente (a aula ensina a não prometer prazo).","[CONFIRMAR] Coberturas do seguro do financiamento com o correspondente (gabarito da P1: morte, invalidez e danos ao imóvel; não cobre desemprego).","[GAP DE CRM] A esteira da pasta (montando, completa, enviada ao correspondente, em análise na Caixa, pendência, aprovada ou reprovada), o correspondente do empreendimento e o registro da revisão do gerente não aparecem com esses nomes: a aba Documentação tem status por documento (Pendente, Recebido, Aprovado, Reprovado). Proposta: estado da pasta e um marco \"revisada pelo gerente\".","[GAP DE CRM] Não há indicador de cards arrastados para \"Venda\" sem venda registrada pelo diálogo. Proposta: contador na Higiene do Funil e no Meu Raio-X.","[DADO A MEDIR NO CRM] Tempo até pasta completa e taxa de aprovação de crédito (a aprovação quase não é registrada no sistema)."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M21-A1', 'M21-A2', 'M21-A3', 'M21-A4', 'M21-A5', 'M21-A6'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 6;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M21-Q01', 'M21-Q02', 'M21-Q03', 'M21-Q04', 'M21-Q05', 'M21-Q06', 'M21-Q07', 'M21-Q08', 'M21-Q09', 'M21-Q10', 'M21-Q11', 'M21-Q12', 'M21-Q13', 'M21-Q14', 'M21-Q15', 'M21-Q16', 'M21-Q17', 'M21-Q18', 'M21-Q19', 'M21-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M21-F01', 'M21-F02', 'M21-F03', 'M21-F04', 'M21-F05', 'M21-F06', 'M21-F07', 'M21-F08', 'M21-F09', 'M21-F10', 'M21-F11', 'M21-F12', 'M21-F13', 'M21-F14');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 14;

-- 3. Aulas (6)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M21-A1', 1, 'A pasta que não trava', 'texto',
  'Um cliente conversou 14 minutos por telefone, recebeu a lista logo depois e mandou todos os documentos em cerca de 2 horas. A primeira aprovação saiu no dia seguinte. Outro cliente recebeu a mesma lista com "pode ir mandando no seu ritmo" e nunca mais respondeu. A diferença não foi o cliente. Foi a lista.

### Por que importa

Documentação travada é venda perdida. Handoff que chega com documento avança 15,8% no CRM; sem documento, 2,6% (conversas do robô e CRM, jul a set/2026). E três itens seguram 59% das pendências: extrato bancário de 6 meses (23%), comprovante de estado civil (20%) e CPF (16%) (CRM, set/2026). Quem pede esses três primeiro encurta a pasta inteira.

### O conceito

Pense na pasta como uma mala de viagem feita na véspera: se você espera o cliente juntar tudo sozinho, ele esquece o essencial e desiste de viajar. Se você entrega a lista certa, um item por vez, e confere cada peça que entra, a mala fica pronta antes do embarque.

### O método SMQ, passo a passo

1. Comece na qualificação, não depois do fechamento: a orientação de documentos já entra na primeira ligação.
2. Abra o Dossiê do cliente, aba Documentação, escolha o perfil de renda (CLT, Autônomo / Informal, Empresário / PJ ou Aposentado / Pensionista) e marque Casado, Usa FGTS e Declara IR quando for o caso: o checklist sai do perfil.
3. Mande a lista do perfil, um item por linha, com os três que mais travam no topo: extrato bancário de 6 meses, comprovante de estado civil e CPF.
4. Diga as âncoras antes do primeiro documento: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o documento vem só pelo canal oficial da SMQ.
5. Feche a lista com uma âncora, nunca com "no seu ritmo": "Dos itens, qual você consegue me mandar primeiro, ainda hoje?"
6. Acompanhe documento a documento: cada peça que chega vira Recebido na aba Documentação, e você responde reconhecendo o que chegou e ancorando o próximo com prazo.
7. O cliente parou de responder depois da lista? Saia do digital e ligue, sem cobrança: pergunte se o projeto encaixa, ofereça a visita e aproveite para destravar o documento.

### Na vida real

**O caso:** Caso E, a pasta que parou no documento (1:1 de gestão, abr/2026), e caso N, a lista que voltou em 2 horas (jan/2026).

**O que foi dito:** No caso E, uma corretora percebeu que os clientes sumiam logo depois de receber a lista. A orientação do gerente foi ligar, na linha de: "Estava falando com você agora e você parou de responder, imagino que estava ocupado. Não quero atrapalhar, só quero entender: você gostou do projeto? Encaixa no seu perfil? Vamos marcar uma visita? E já aproveita e me manda a sua documentação." No caso N, a lista foi pedida logo depois da ligação: "RG ou CNH, comprovante de endereço, 6 últimos extratos, imposto de renda".

**O que aconteceu:** No caso E, a voz desfez o medo de golpe e a pasta voltou a andar. No caso N, todos os documentos chegaram em cerca de 2 horas e a primeira aprovação saiu no dia seguinte.

### Scripts prontos

#### WhatsApp · Mandar a lista logo depois da ligação

> Pra gente já garantir a sua análise, te mando a lista. É gratuita e não te compromete, e o documento vem só pelo canal oficial da SMQ. Dos itens, qual você consegue me mandar primeiro, ainda hoje?

**Por que funciona:** Tira o medo (gratuita, sem compromisso, canal oficial) e termina com uma pergunta que pede um passo pequeno e imediato, em vez do encerramento passivo que foi a pior nota das conversas em ago/2026.

#### WhatsApp · Documento chegando

> Perfeito, [nome]! O [documento] chegou e já está na sua pasta. O próximo é o [documento]. Consegue me mandar até amanhã?

**Por que funciona:** Reconhece o que veio, mostra organização e ancora o próximo item com prazo. O cliente sente que a pasta anda.

#### WhatsApp · Documento errado

> [nome], esse parece ser um boleto. Pra análise, a Caixa precisa do extrato da conta corrente, aquele que mostra as movimentações do mês. Dá pra baixar direto no app do banco.

**Por que funciona:** Corrige sem constranger e ensina onde achar o documento certo. Nas conversas auditadas, o cliente mandou os extratos certos na sequência.

### Erros que matam a venda

- **Encerrar a lista com "pode ir mandando no seu ritmo"**  
  Quanto custa: Foi a pior nota das conversas em ago/2026: a conversa morre ali  
  Correção: Âncora: "qual você consegue me mandar primeiro, ainda hoje?"
- **Mandar a lista inteira num bloco só e esperar tudo chegar**  
  Quanto custa: O cliente trava no primeiro item difícil e some  
  Correção: Um item por linha, os três que mais travam primeiro, e acompanhamento documento a documento
- **Guardar documento de cliente no celular ou em grupo de WhatsApp**  
  Quanto custa: Risco pela LGPD e acervo perdido quando você sai  
  Correção: Documento mora na aba Documentação do CRM: o corretor sai, o acervo fica

### No CRM

- **Tela:** Dossiê do cliente, aba Documentação
- **Ação:** Escolher o perfil de renda, marcar Casado, Usa FGTS e Declara IR, anexar cada documento e usar "Cobrar pendência"
- **Campo:** Status de cada documento: Pendente, Recebido, Aprovado ou Reprovado
- **Regra:** Pasta com documento pendente segurando a análise aparece na Fila Única como "Pasta travada", a 7ª prioridade

### Frase-âncora

> **Documentação travada é venda perdida.**

### Checagem rápida

1. Quais três documentos você pede primeiro, e por quê?  
   Resposta: Extrato bancário de 6 meses, comprovante de estado civil e CPF: somam 59% das pendências da casa (CRM, set/2026).
2. Como você fecha a mensagem da lista?  
   Resposta: Com uma âncora: "Dos itens, qual você consegue me mandar primeiro, ainda hoje?"
3. O cliente parou de responder depois da lista. Qual o próximo passo?  
   Resposta: Ligar, sem cobrança, perguntar se o projeto encaixa, oferecer a visita e aproveitar para destravar o documento.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Um cliente conversou 14 minutos por telefone, recebeu a lista logo depois e mandou todos os documentos em cerca de 2 horas. A primeira aprovação saiu no dia seguinte. Outro cliente recebeu a mesma lista com \"pode ir mandando no seu ritmo\" e nunca mais respondeu. A diferença não foi o cliente. Foi a lista.","por_que_importa":"Documentação travada é venda perdida. Handoff que chega com documento avança 15,8% no CRM; sem documento, 2,6% (conversas do robô e CRM, jul a set/2026). E três itens seguram 59% das pendências: extrato bancário de 6 meses (23%), comprovante de estado civil (20%) e CPF (16%) (CRM, set/2026). Quem pede esses três primeiro encurta a pasta inteira.","conceito":"Pense na pasta como uma mala de viagem feita na véspera: se você espera o cliente juntar tudo sozinho, ele esquece o essencial e desiste de viajar. Se você entrega a lista certa, um item por vez, e confere cada peça que entra, a mala fica pronta antes do embarque.","metodo":["Comece na qualificação, não depois do fechamento: a orientação de documentos já entra na primeira ligação.","Abra o Dossiê do cliente, aba Documentação, escolha o perfil de renda (CLT, Autônomo / Informal, Empresário / PJ ou Aposentado / Pensionista) e marque Casado, Usa FGTS e Declara IR quando for o caso: o checklist sai do perfil.","Mande a lista do perfil, um item por linha, com os três que mais travam no topo: extrato bancário de 6 meses, comprovante de estado civil e CPF.","Diga as âncoras antes do primeiro documento: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o documento vem só pelo canal oficial da SMQ.","Feche a lista com uma âncora, nunca com \"no seu ritmo\": \"Dos itens, qual você consegue me mandar primeiro, ainda hoje?\"","Acompanhe documento a documento: cada peça que chega vira Recebido na aba Documentação, e você responde reconhecendo o que chegou e ancorando o próximo com prazo.","O cliente parou de responder depois da lista? Saia do digital e ligue, sem cobrança: pergunte se o projeto encaixa, ofereça a visita e aproveite para destravar o documento."],"na_vida_real":{"caso":"Caso E, a pasta que parou no documento (1:1 de gestão, abr/2026), e caso N, a lista que voltou em 2 horas (jan/2026).","o_que_foi_dito":"No caso E, uma corretora percebeu que os clientes sumiam logo depois de receber a lista. A orientação do gerente foi ligar, na linha de: \"Estava falando com você agora e você parou de responder, imagino que estava ocupado. Não quero atrapalhar, só quero entender: você gostou do projeto? Encaixa no seu perfil? Vamos marcar uma visita? E já aproveita e me manda a sua documentação.\" No caso N, a lista foi pedida logo depois da ligação: \"RG ou CNH, comprovante de endereço, 6 últimos extratos, imposto de renda\".","resultado":"No caso E, a voz desfez o medo de golpe e a pasta voltou a andar. No caso N, todos os documentos chegaram em cerca de 2 horas e a primeira aprovação saiu no dia seguinte.","fonte":"Casoteca SMQ, casos E e N (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Mandar a lista logo depois da ligação","texto":"Pra gente já garantir a sua análise, te mando a lista. É gratuita e não te compromete, e o documento vem só pelo canal oficial da SMQ. Dos itens, qual você consegue me mandar primeiro, ainda hoje?","por_que_funciona":"Tira o medo (gratuita, sem compromisso, canal oficial) e termina com uma pergunta que pede um passo pequeno e imediato, em vez do encerramento passivo que foi a pior nota das conversas em ago/2026."},{"canal":"WhatsApp","situacao":"Documento chegando","texto":"Perfeito, [nome]! O [documento] chegou e já está na sua pasta. O próximo é o [documento]. Consegue me mandar até amanhã?","por_que_funciona":"Reconhece o que veio, mostra organização e ancora o próximo item com prazo. O cliente sente que a pasta anda."},{"canal":"WhatsApp","situacao":"Documento errado","texto":"[nome], esse parece ser um boleto. Pra análise, a Caixa precisa do extrato da conta corrente, aquele que mostra as movimentações do mês. Dá pra baixar direto no app do banco.","por_que_funciona":"Corrige sem constranger e ensina onde achar o documento certo. Nas conversas auditadas, o cliente mandou os extratos certos na sequência."}],"erros_que_matam":[{"erro":"Encerrar a lista com \"pode ir mandando no seu ritmo\"","custo":"Foi a pior nota das conversas em ago/2026: a conversa morre ali","correcao":"Âncora: \"qual você consegue me mandar primeiro, ainda hoje?\""},{"erro":"Mandar a lista inteira num bloco só e esperar tudo chegar","custo":"O cliente trava no primeiro item difícil e some","correcao":"Um item por linha, os três que mais travam primeiro, e acompanhamento documento a documento"},{"erro":"Guardar documento de cliente no celular ou em grupo de WhatsApp","custo":"Risco pela LGPD e acervo perdido quando você sai","correcao":"Documento mora na aba Documentação do CRM: o corretor sai, o acervo fica"}],"no_crm":{"tela":"Dossiê do cliente, aba Documentação","acao":"Escolher o perfil de renda, marcar Casado, Usa FGTS e Declara IR, anexar cada documento e usar \"Cobrar pendência\"","campo":"Status de cada documento: Pendente, Recebido, Aprovado ou Reprovado","regra":"Pasta com documento pendente segurando a análise aparece na Fila Única como \"Pasta travada\", a 7ª prioridade"},"frase_ancora":"Documentação travada é venda perdida.","checagem_rapida":[{"pergunta":"Quais três documentos você pede primeiro, e por quê?","resposta":"Extrato bancário de 6 meses, comprovante de estado civil e CPF: somam 59% das pendências da casa (CRM, set/2026)."},{"pergunta":"Como você fecha a mensagem da lista?","resposta":"Com uma âncora: \"Dos itens, qual você consegue me mandar primeiro, ainda hoje?\""},{"pergunta":"O cliente parou de responder depois da lista. Qual o próximo passo?","resposta":"Ligar, sem cobrança, perguntar se o projeto encaixa, oferecer a visita e aproveitar para destravar o documento."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M21-A2', 2, 'Do CRM ao correspondente: o caminho da pasta', 'texto',
  'Aprovação saiu. À noite, na visita, aparece uma restrição do banco que não estava no Serasa. Sete dias depois, o cliente resolve na agência, a análise roda de novo no mesmo minuto e é aprovada às 15h26. Nada disso foi sorte: foi alguém que não largou a pasta.

### Por que importa

Quando a pasta chega na Caixa, o funil da casa é saudável: a passagem da análise de crédito para fechado foi de 39,1% nos 90 dias até 11/09/2026. O dinheiro se perde antes, na pasta que volta com pendência porque saiu sem revisão, e depois, no cliente que fica dias sem notícia e esfria. No mesmo diagnóstico, 118 clientes QUENTES estavam parados em análise de crédito, os piores entre 70 e 79 dias sem movimento.

### O conceito

A pasta é uma encomenda com rastreio. O cliente não precisa saber como funciona o centro de distribuição, mas precisa receber a notificação de onde está o pacote. Você é o rastreio: sem ele, o cliente acha que o pacote se perdeu, mesmo quando está a caminho.

### O método SMQ, passo a passo

1. Você anexa os documentos na pasta do cliente no CRM (aba Documentação).
2. O seu gerente revisa a documentação e orienta o que falta ou precisa ser refeito. Antes do envio, ele confere a integridade da pasta: dados exatamente como o cliente informou, renda real e comprovada, nenhum documento de outro cliente e nenhuma senha na conversa.
3. Você envia a pasta ao correspondente bancário daquele empreendimento (cada um tem o seu; o envio é manual, por WhatsApp ou e-mail). Não sabe qual é? O seu gerente te diz.
4. Análise aberta em outro lugar? Resolva a carta de cancelamento da anterior antes, para a nova não travar.
5. Durante a análise, dê notícia ao cliente pelo menos a cada 5 dias úteis, mesmo sem novidade (na ansiedade, a cada 48 horas), e cobre o correspondente, não o cliente. Prazo de retorno não se promete.
6. Saiu o resultado: registre na etapa Análise de crédito, com a carta de aprovação anexada, e siga o caminho de cada resultado: aprovado, celebre e marque a assinatura com duas opções; aprovado com valor menor ou entrada maior não é reprovação (outra unidade, FGTS, condição da campanha, com o gerente); reprovado, entenda o motivo exato com o correspondente e monte um plano de 60 a 90 dias.
7. Restrição no nome não descarta ninguém: vai para o correspondente avaliar antes de o cliente quitar, para ele não pagar a dívida e continuar reprovado.

### Na vida real

**O caso:** Caso N, a restrição do banco no meio do caminho (jan a fev/2026).

**O que foi dito:** Minutos depois de o cliente avisar que a restrição tinha saído, a corretora respondeu: "Já mandei pra fila novamente, pra rodarem." E deu o crédito a ele, não a si mesma: "Você conseguiu o mais difícil, que era essa trava."

**O que aconteceu:** A análise foi rodada de novo no mesmo minuto e aprovada às 15h26. No dia seguinte, a unidade foi escolhida e o contrato assinado no estande. 7 dias para destravar a restrição; 23 dias do lead ao primeiro boleto pago.

### Scripts prontos

#### WhatsApp · Pasta enviada ao correspondente

> [nome], a sua pasta já está com o correspondente da construtora. Assim que tiver retorno eu te aviso e, mesmo sem novidade, te dou notícia até [dia].

**Por que funciona:** Presença sem promessa de prazo: o cliente sabe quando vai ter notícia, mesmo que a Caixa ainda não tenha respondido.

#### WhatsApp · Restrição destravada

> Que notícia boa, [nome]! Já mandei rodar a sua análise de novo agora. Assim que voltar, eu te aviso aqui.

**Por que funciona:** Presença no minuto certo. No caso N, o crédito foi aprovado no mesmo dia.

#### Ligação · Reprovado: convite para a conversa por voz

> [nome], o retorno da análise não veio como a gente queria. Isso tem motivo técnico e, muitas vezes, tem caminho. Posso te ligar às 19h pra te explicar o que aconteceu e o que dá pra fazer?

**Por que funciona:** Verdade com caminho, e por voz: notícia difícil não se dá por texto seco.

### Erros que matam a venda

- **Mandar a pasta ao correspondente sem a revisão do gerente**  
  Quanto custa: A pasta volta com pendência e o ciclo alonga  
  Correção: CRM, gerente, correspondente do empreendimento: nessa ordem, sempre
- **Sugerir valor de renda, de pró-labore ou de holerite para "bater" com a aprovação**  
  Quanto custa: Risco grave para o cliente, para o corretor e para a SMQ  
  Correção: A renda real e comprovada define a aprovação, nunca o contrário; o correspondente orienta como documentar a renda que existe
- **Sumir durante a análise porque "não tem novidade"**  
  Quanto custa: O cliente esfria em análise; 118 clientes quentes estavam parados nessa etapa em 11/09/2026  
  Correção: Notícia a cada 5 dias úteis, mesmo sem novidade, e cobrança ao correspondente

### No CRM

- **Tela:** Dossiê, aba Documentação; etapa Análise de crédito
- **Ação:** Anexar, pedir a revisão do gerente, registrar o envio e depois o resultado com a carta de aprovação
- **Campo:** Status dos documentos; dados da análise; desfecho (crédito aprovado, aguardando Caixa, reprovado, não atendeu ou perdeu com motivo)
- **Regra:** Hoje a aprovação quase não é registrada no sistema: registre mesmo assim, porque é o que move o cliente e alimenta o seu Meu Raio-X

### Frase-âncora

> **Um cliente em análise parado há 66 dias vale mais que 200 leads frios novos.**

### Checagem rápida

1. Qual é a ordem do caminho da pasta?  
   Resposta: Você anexa no CRM, o gerente revisa e orienta, você envia ao correspondente do empreendimento, e o correspondente conduz a análise na Caixa.
2. Com que frequência você dá notícia durante a análise?  
   Resposta: Pelo menos a cada 5 dias úteis, mesmo sem novidade; na ansiedade, a cada 48 horas.
3. Aprovado com valor menor é reprovação?  
   Resposta: Não. Há saídas: outra unidade, FGTS ou condição da campanha, montadas com o gerente.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Aprovação saiu. À noite, na visita, aparece uma restrição do banco que não estava no Serasa. Sete dias depois, o cliente resolve na agência, a análise roda de novo no mesmo minuto e é aprovada às 15h26. Nada disso foi sorte: foi alguém que não largou a pasta.","por_que_importa":"Quando a pasta chega na Caixa, o funil da casa é saudável: a passagem da análise de crédito para fechado foi de 39,1% nos 90 dias até 11/09/2026. O dinheiro se perde antes, na pasta que volta com pendência porque saiu sem revisão, e depois, no cliente que fica dias sem notícia e esfria. No mesmo diagnóstico, 118 clientes QUENTES estavam parados em análise de crédito, os piores entre 70 e 79 dias sem movimento.","conceito":"A pasta é uma encomenda com rastreio. O cliente não precisa saber como funciona o centro de distribuição, mas precisa receber a notificação de onde está o pacote. Você é o rastreio: sem ele, o cliente acha que o pacote se perdeu, mesmo quando está a caminho.","metodo":["Você anexa os documentos na pasta do cliente no CRM (aba Documentação).","O seu gerente revisa a documentação e orienta o que falta ou precisa ser refeito. Antes do envio, ele confere a integridade da pasta: dados exatamente como o cliente informou, renda real e comprovada, nenhum documento de outro cliente e nenhuma senha na conversa.","Você envia a pasta ao correspondente bancário daquele empreendimento (cada um tem o seu; o envio é manual, por WhatsApp ou e-mail). Não sabe qual é? O seu gerente te diz.","Análise aberta em outro lugar? Resolva a carta de cancelamento da anterior antes, para a nova não travar.","Durante a análise, dê notícia ao cliente pelo menos a cada 5 dias úteis, mesmo sem novidade (na ansiedade, a cada 48 horas), e cobre o correspondente, não o cliente. Prazo de retorno não se promete.","Saiu o resultado: registre na etapa Análise de crédito, com a carta de aprovação anexada, e siga o caminho de cada resultado: aprovado, celebre e marque a assinatura com duas opções; aprovado com valor menor ou entrada maior não é reprovação (outra unidade, FGTS, condição da campanha, com o gerente); reprovado, entenda o motivo exato com o correspondente e monte um plano de 60 a 90 dias.","Restrição no nome não descarta ninguém: vai para o correspondente avaliar antes de o cliente quitar, para ele não pagar a dívida e continuar reprovado."],"na_vida_real":{"caso":"Caso N, a restrição do banco no meio do caminho (jan a fev/2026).","o_que_foi_dito":"Minutos depois de o cliente avisar que a restrição tinha saído, a corretora respondeu: \"Já mandei pra fila novamente, pra rodarem.\" E deu o crédito a ele, não a si mesma: \"Você conseguiu o mais difícil, que era essa trava.\"","resultado":"A análise foi rodada de novo no mesmo minuto e aprovada às 15h26. No dia seguinte, a unidade foi escolhida e o contrato assinado no estande. 7 dias para destravar a restrição; 23 dias do lead ao primeiro boleto pago.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Pasta enviada ao correspondente","texto":"[nome], a sua pasta já está com o correspondente da construtora. Assim que tiver retorno eu te aviso e, mesmo sem novidade, te dou notícia até [dia].","por_que_funciona":"Presença sem promessa de prazo: o cliente sabe quando vai ter notícia, mesmo que a Caixa ainda não tenha respondido."},{"canal":"WhatsApp","situacao":"Restrição destravada","texto":"Que notícia boa, [nome]! Já mandei rodar a sua análise de novo agora. Assim que voltar, eu te aviso aqui.","por_que_funciona":"Presença no minuto certo. No caso N, o crédito foi aprovado no mesmo dia."},{"canal":"Ligação","situacao":"Reprovado: convite para a conversa por voz","texto":"[nome], o retorno da análise não veio como a gente queria. Isso tem motivo técnico e, muitas vezes, tem caminho. Posso te ligar às 19h pra te explicar o que aconteceu e o que dá pra fazer?","por_que_funciona":"Verdade com caminho, e por voz: notícia difícil não se dá por texto seco."}],"erros_que_matam":[{"erro":"Mandar a pasta ao correspondente sem a revisão do gerente","custo":"A pasta volta com pendência e o ciclo alonga","correcao":"CRM, gerente, correspondente do empreendimento: nessa ordem, sempre"},{"erro":"Sugerir valor de renda, de pró-labore ou de holerite para \"bater\" com a aprovação","custo":"Risco grave para o cliente, para o corretor e para a SMQ","correcao":"A renda real e comprovada define a aprovação, nunca o contrário; o correspondente orienta como documentar a renda que existe"},{"erro":"Sumir durante a análise porque \"não tem novidade\"","custo":"O cliente esfria em análise; 118 clientes quentes estavam parados nessa etapa em 11/09/2026","correcao":"Notícia a cada 5 dias úteis, mesmo sem novidade, e cobrança ao correspondente"}],"no_crm":{"tela":"Dossiê, aba Documentação; etapa Análise de crédito","acao":"Anexar, pedir a revisão do gerente, registrar o envio e depois o resultado com a carta de aprovação","campo":"Status dos documentos; dados da análise; desfecho (crédito aprovado, aguardando Caixa, reprovado, não atendeu ou perdeu com motivo)","regra":"Hoje a aprovação quase não é registrada no sistema: registre mesmo assim, porque é o que move o cliente e alimenta o seu Meu Raio-X"},"frase_ancora":"Um cliente em análise parado há 66 dias vale mais que 200 leads frios novos.","checagem_rapida":[{"pergunta":"Qual é a ordem do caminho da pasta?","resposta":"Você anexa no CRM, o gerente revisa e orienta, você envia ao correspondente do empreendimento, e o correspondente conduz a análise na Caixa."},{"pergunta":"Com que frequência você dá notícia durante a análise?","resposta":"Pelo menos a cada 5 dias úteis, mesmo sem novidade; na ansiedade, a cada 48 horas."},{"pergunta":"Aprovado com valor menor é reprovação?","resposta":"Não. Há saídas: outra unidade, FGTS ou condição da campanha, montadas com o gerente."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M21-A3', 3, 'Garantir a unidade e montar a proposta dentro da campanha', 'texto',
  '"Se tiver desconto, eu fecho agora." O corretor comum inventa um desconto que não pode dar. O corretor SMQ monta a melhor condição da campanha e, se for preciso ir além, leva ao gerente com hora marcada para responder.

### Por que importa

Promessa fora da campanha vira conflito com a construtora e cliente que se sente enganado na hora do contrato. E a proposta mal explicada é a porta do cancelamento: quem descobre depois a parcela do financiamento, o ITBI ou o custo de cartório se sente enganado. O preço de tabela igual para todos protege o cliente e protege você.

### O conceito

A tabela é o cardápio com preço fixo; a campanha é o combo da semana que a casa aprovou. Você pode montar o combo que cabe no bolso do cliente. Mudar o preço do cardápio é com o gerente.

### O método SMQ, passo a passo

1. Escolha com o cliente a unidade que melhor cabe no espelho de vendas: andar, sol, posição e preço. Tudo que muda a decisão (vaga, prazo de entrega, regra de uso da unidade, laudo) é dito, nunca omitido.
2. Garanta a unidade pelo procedimento da construtora. Diga "garantir" ou "bloquear a unidade". O prazo de garantia é o que a construtora define: confirme com o seu gerente e nunca prometa prazo ao cliente.
3. Monte a condição da campanha: preço de tabela vigente ("a partir de"), parcelamento da entrada até as chaves dentro do que a tabela permite e, quando a campanha oferece, ITBI e documentação, por escrito.
4. Qualquer coisa fora disso (desconto sobre a tabela, bônus, parcelamento fora da campanha, prazo de garantia especial) vai para o gerente ou o diretor, com retorno marcado ao cliente.
5. Mostre o custo total: entrada, fluxo com a construtora durante a obra, ITBI, registro e taxas. Parcela de obra não é parcela do financiamento: explique os dois momentos separados.
6. Ato, sinal e qualquer pagamento só por canal oficial da construtora ou da imobiliária, nunca em conta de pessoa física, sempre explicado ao cliente por escrito.
7. Leia o quadro-resumo junto com o cliente: preço, entrada, parcelas, prazo de entrega e o que acontece se ele desistir. Dúvida jurídica específica vai para o gerente.

### Na vida real

**O caso:** Caso C, dois meses de espera e a venda salva pela verdade (fev a abr/2025, conduzido pelo diretor, Guilherme Nunes).

**O que foi dito:** A cliente tinha crédito aprovado, mas a unidade não estava disponível. Ela ouviu a verdade no primeiro contato: unidades que voltam de outros compradores têm um limite mensal de liberação, e a decisão é da sede da construtora. Na montagem final, ITBI e documentação entraram como compensação pela espera, decisão de quem tinha a alçada.

**O que aconteceu:** Quando a unidade voltou, documentos atualizados na mesma manhã, aprovação às 10h19 e assinatura horas depois. Quem sabe antes espera; quem descobre depois se sente enganado.

### Scripts prontos

#### Visita · O cliente pede desconto

> O preço de tabela é o mesmo pra todo mundo. O que eu consigo é montar a melhor condição da campanha pra você: [condição]. Se a gente precisar ir além disso, eu levo ao meu gerente hoje e te dou retorno até [hora].

**Por que funciona:** Negociação dentro da alçada, com retorno marcado. O cliente sente que alguém está trabalhando por ele, sem promessa que não se cumpre.

#### Visita · Explicar a obra e o financiamento

> Aqui são dois momentos diferentes. Durante a obra, você paga à construtora o fluxo da entrada que a gente montou. A parcela do financiamento é outra, com o banco, e eu te mostro as duas separadas antes de você assinar qualquer coisa.

**Por que funciona:** Evita o erro que mais gera sensação de engano: vender a parcela de obra como "a parcela do apartamento".

#### WhatsApp · Urgência sem promessa

> A unidade não fica garantida automaticamente, mas com os documentos que você já mandou eu consigo agir rápido. Quanto antes chegar o restante, mais cedo eu consigo bloquear a sua unidade.

**Por que funciona:** Move o cliente sem inventar prazo nem prometer o que não depende de você.

### Erros que matam a venda

- **Oferecer desconto ou condição fora da campanha**  
  Quanto custa: Promessa que não se cumpre e conflito com a construtora  
  Correção: Condição da campanha; o resto, gerente ou diretor, com retorno marcado
- **Dar desconto sem pedir algo em troca**  
  Quanto custa: Ensina o cliente a pedir mais e não fecha nada  
  Correção: Qualquer concessão, mesmo aprovada pelo gerente, vem junto com um passo concreto do cliente (documento, assinatura, data)
- **"Faz um Pix hoje pra garantir" ou pagamento em conta pessoal**  
  Quanto custa: Credibilidade destruída e risco de golpe  
  Correção: Pagamento só por canal oficial, explicado por escrito; urgência só com fato verificável

### No CRM

- **Tela:** Documentação & Projetos (Catálogo completo: ficha técnica, condições e unidades)
- **Ação:** Conferir tabela, condição da campanha, local e unidades antes de montar a proposta
- **Campo:** Condição da campanha vigente e unidades disponíveis
- **Regra:** Preço, tabela, unidades e condições vêm só de Documentação & Projetos ou do material oficial da construtora, nunca da memória

### Frase-âncora

> **O preço de tabela é o mesmo pra todo mundo. A condição, eu monto pra você.**

### Checagem rápida

1. O que o corretor pode negociar sozinho?  
   Resposta: A condição da campanha: parcelamento da entrada dentro da tabela e, quando a campanha oferece, ITBI e documentação, por escrito.
2. Qual o prazo de garantia da unidade que você promete ao cliente?  
   Resposta: Nenhum: o prazo é o que a construtora define, confirmado com o gerente.
3. Por onde o cliente paga o ato?  
   Resposta: Só pelo canal oficial da construtora ou da imobiliária, nunca em conta de pessoa física, explicado por escrito.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Se tiver desconto, eu fecho agora.\" O corretor comum inventa um desconto que não pode dar. O corretor SMQ monta a melhor condição da campanha e, se for preciso ir além, leva ao gerente com hora marcada para responder.","por_que_importa":"Promessa fora da campanha vira conflito com a construtora e cliente que se sente enganado na hora do contrato. E a proposta mal explicada é a porta do cancelamento: quem descobre depois a parcela do financiamento, o ITBI ou o custo de cartório se sente enganado. O preço de tabela igual para todos protege o cliente e protege você.","conceito":"A tabela é o cardápio com preço fixo; a campanha é o combo da semana que a casa aprovou. Você pode montar o combo que cabe no bolso do cliente. Mudar o preço do cardápio é com o gerente.","metodo":["Escolha com o cliente a unidade que melhor cabe no espelho de vendas: andar, sol, posição e preço. Tudo que muda a decisão (vaga, prazo de entrega, regra de uso da unidade, laudo) é dito, nunca omitido.","Garanta a unidade pelo procedimento da construtora. Diga \"garantir\" ou \"bloquear a unidade\". O prazo de garantia é o que a construtora define: confirme com o seu gerente e nunca prometa prazo ao cliente.","Monte a condição da campanha: preço de tabela vigente (\"a partir de\"), parcelamento da entrada até as chaves dentro do que a tabela permite e, quando a campanha oferece, ITBI e documentação, por escrito.","Qualquer coisa fora disso (desconto sobre a tabela, bônus, parcelamento fora da campanha, prazo de garantia especial) vai para o gerente ou o diretor, com retorno marcado ao cliente.","Mostre o custo total: entrada, fluxo com a construtora durante a obra, ITBI, registro e taxas. Parcela de obra não é parcela do financiamento: explique os dois momentos separados.","Ato, sinal e qualquer pagamento só por canal oficial da construtora ou da imobiliária, nunca em conta de pessoa física, sempre explicado ao cliente por escrito.","Leia o quadro-resumo junto com o cliente: preço, entrada, parcelas, prazo de entrega e o que acontece se ele desistir. Dúvida jurídica específica vai para o gerente."],"na_vida_real":{"caso":"Caso C, dois meses de espera e a venda salva pela verdade (fev a abr/2025, conduzido pelo diretor, Guilherme Nunes).","o_que_foi_dito":"A cliente tinha crédito aprovado, mas a unidade não estava disponível. Ela ouviu a verdade no primeiro contato: unidades que voltam de outros compradores têm um limite mensal de liberação, e a decisão é da sede da construtora. Na montagem final, ITBI e documentação entraram como compensação pela espera, decisão de quem tinha a alçada.","resultado":"Quando a unidade voltou, documentos atualizados na mesma manhã, aprovação às 10h19 e assinatura horas depois. Quem sabe antes espera; quem descobre depois se sente enganado.","fonte":"Casoteca SMQ, caso C (seção 9.12); os números de produto do caso estão desatualizados e não se usam como preço"},"scripts":[{"canal":"Visita","situacao":"O cliente pede desconto","texto":"O preço de tabela é o mesmo pra todo mundo. O que eu consigo é montar a melhor condição da campanha pra você: [condição]. Se a gente precisar ir além disso, eu levo ao meu gerente hoje e te dou retorno até [hora].","por_que_funciona":"Negociação dentro da alçada, com retorno marcado. O cliente sente que alguém está trabalhando por ele, sem promessa que não se cumpre."},{"canal":"Visita","situacao":"Explicar a obra e o financiamento","texto":"Aqui são dois momentos diferentes. Durante a obra, você paga à construtora o fluxo da entrada que a gente montou. A parcela do financiamento é outra, com o banco, e eu te mostro as duas separadas antes de você assinar qualquer coisa.","por_que_funciona":"Evita o erro que mais gera sensação de engano: vender a parcela de obra como \"a parcela do apartamento\"."},{"canal":"WhatsApp","situacao":"Urgência sem promessa","texto":"A unidade não fica garantida automaticamente, mas com os documentos que você já mandou eu consigo agir rápido. Quanto antes chegar o restante, mais cedo eu consigo bloquear a sua unidade.","por_que_funciona":"Move o cliente sem inventar prazo nem prometer o que não depende de você."}],"erros_que_matam":[{"erro":"Oferecer desconto ou condição fora da campanha","custo":"Promessa que não se cumpre e conflito com a construtora","correcao":"Condição da campanha; o resto, gerente ou diretor, com retorno marcado"},{"erro":"Dar desconto sem pedir algo em troca","custo":"Ensina o cliente a pedir mais e não fecha nada","correcao":"Qualquer concessão, mesmo aprovada pelo gerente, vem junto com um passo concreto do cliente (documento, assinatura, data)"},{"erro":"\"Faz um Pix hoje pra garantir\" ou pagamento em conta pessoal","custo":"Credibilidade destruída e risco de golpe","correcao":"Pagamento só por canal oficial, explicado por escrito; urgência só com fato verificável"}],"no_crm":{"tela":"Documentação & Projetos (Catálogo completo: ficha técnica, condições e unidades)","acao":"Conferir tabela, condição da campanha, local e unidades antes de montar a proposta","campo":"Condição da campanha vigente e unidades disponíveis","regra":"Preço, tabela, unidades e condições vêm só de Documentação & Projetos ou do material oficial da construtora, nunca da memória"},"frase_ancora":"O preço de tabela é o mesmo pra todo mundo. A condição, eu monto pra você.","checagem_rapida":[{"pergunta":"O que o corretor pode negociar sozinho?","resposta":"A condição da campanha: parcelamento da entrada dentro da tabela e, quando a campanha oferece, ITBI e documentação, por escrito."},{"pergunta":"Qual o prazo de garantia da unidade que você promete ao cliente?","resposta":"Nenhum: o prazo é o que a construtora define, confirmado com o gerente."},{"pergunta":"Por onde o cliente paga o ato?","resposta":"Só pelo canal oficial da construtora ou da imobiliária, nunca em conta de pessoa física, explicado por escrito."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M21-A4', 4, 'Fechamento é consequência: os pré-requisitos e os sinais', 'texto',
  '"E aí, vai fechar?" Essa pergunta tem duas respostas possíveis, e uma delas é "vou pensar". Quem precisa forçar o fechamento geralmente perdeu a venda antes: na qualificação fraca, na Q7 que não foi feita ou na objeção que ficou para trás.

### Por que importa

O fechamento da casa já passa da meta (45,3% contra 30% no funil do CRM, set/2026). O que derruba a venda nessa etapa não é falta de técnica, é tentar fechar sem as condições: sem o decisor, sem saber o que trava, sem o cliente entender a conta. Os erros auditados mostram que pular a Q7 leva o corretor ao fechamento sem saber o que trava.

### O conceito

Fechar é colher. Se a planta não foi regada (qualificação), não adianta puxar mais forte. Os pré-requisitos são a checagem de que o fruto está maduro; os sinais de compra são o fruto dizendo "pode colher".

### O método SMQ, passo a passo

1. Confira os 4 pré-requisitos antes de propor: decisor presente, Q7 feita ("o que ainda poderia te impedir de avançar?"), 2 ou mais sinais de compra e simulação entendida pelo cliente, com os números dele.
2. Faltou o decisor? Não proponha: marque a conversa com os dois, com duas opções. Proibido "fechar primeiro e trazer o cônjuge depois".
3. Faltou a Q7? Faça agora e trate o que aparecer com o protocolo de objeção (M19).
4. Leia os sinais verbais: "qual o prazo de entrega mesmo?", "como funciona a entrada?", "dá pra escolher o andar?", "dá pra usar meu FGTS aqui?", "e se eu trouxer minha esposa amanhã?".
5. Leia os sinais não verbais: tira foto, pergunta dos vizinhos, pede para ver de novo, faz conta no celular, mede com os braços.
6. Viu 2 sinais, ou 1 sinal forte? Pare de apresentar e proponha o próximo passo. Nunca pergunte "vai fechar?": proponha o como.

### Na vida real

**O caso:** Os 12 padrões que se repetem nas vendas da casa (Casoteca SMQ).

**O que foi dito:** O padrão 9 é o fechamento por facilitação: remover a barreira do caixa, não pressionar. No caso A, conduzido pelo diretor, a objeção "o que pega é que não temos uma entrada boa" foi tratada com mecanismo (parcelamento e FGTS), não com desconto nem com pressão.

**O que aconteceu:** O fechamento veio como consequência de uma conta que passou a caber, com urgência verdadeira (a abertura de vendas era na segunda-feira) e sem inventar nada.

### Scripts prontos

#### Visita · A Q7 antes de propor

> Agora que você viu tudo, o que ainda poderia te impedir de avançar?

**Por que funciona:** Traz a objeção escondida para a mesa antes da proposta, quando ainda dá para tratar.

#### Visita · Decisor ausente com cliente animado

> Você gostou tanto que imagino que queira trazer [nome] pra ver também. Fica melhor sábado às 10h ou às 14h?

**Por que funciona:** Respeita a decisão do casal e mantém o movimento com duas opções, sem tentar fechar com metade da decisão.

### Erros que matam a venda

- **Perguntar "vai fechar?"**  
  Quanto custa: Abre a porta para o "vou pensar"  
  Correção: Propor o como: uma das 5 formas da aula A5
- **Pular a Q7**  
  Quanto custa: Você chega ao fechamento sem saber o que trava  
  Correção: Q7 na ligação e de novo na visita
- **Tentar fechar sem o decisor**  
  Quanto custa: Venda adiada ou desfeita em casa  
  Correção: Conversa com os dois, com duas opções de horário

### No CRM

- **Tela:** Modo Visita; Dossiê do cliente (qualificação e observações)
- **Ação:** Rever Q3 e Q7 no briefing antes de sair e registrar o resultado da visita
- **Campo:** Resultado da visita e observações da qualificação (Q7 e decisor)
- **Regra:** O resultado registrado no Modo Visita move o cliente para "Visita realizada" e cria o próximo passo

### Frase-âncora

> **Nunca pergunte "vai fechar?". Proponha o como.**

### Checagem rápida

1. Quais são os 4 pré-requisitos do fechamento?  
   Resposta: Decisor presente, Q7 feita, 2 ou mais sinais de compra e simulação entendida pelo cliente.
2. Quantos sinais pedem que você pare de apresentar?  
   Resposta: Dois sinais, ou um sinal forte.',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"E aí, vai fechar?\" Essa pergunta tem duas respostas possíveis, e uma delas é \"vou pensar\". Quem precisa forçar o fechamento geralmente perdeu a venda antes: na qualificação fraca, na Q7 que não foi feita ou na objeção que ficou para trás.","por_que_importa":"O fechamento da casa já passa da meta (45,3% contra 30% no funil do CRM, set/2026). O que derruba a venda nessa etapa não é falta de técnica, é tentar fechar sem as condições: sem o decisor, sem saber o que trava, sem o cliente entender a conta. Os erros auditados mostram que pular a Q7 leva o corretor ao fechamento sem saber o que trava.","conceito":"Fechar é colher. Se a planta não foi regada (qualificação), não adianta puxar mais forte. Os pré-requisitos são a checagem de que o fruto está maduro; os sinais de compra são o fruto dizendo \"pode colher\".","metodo":["Confira os 4 pré-requisitos antes de propor: decisor presente, Q7 feita (\"o que ainda poderia te impedir de avançar?\"), 2 ou mais sinais de compra e simulação entendida pelo cliente, com os números dele.","Faltou o decisor? Não proponha: marque a conversa com os dois, com duas opções. Proibido \"fechar primeiro e trazer o cônjuge depois\".","Faltou a Q7? Faça agora e trate o que aparecer com o protocolo de objeção (M19).","Leia os sinais verbais: \"qual o prazo de entrega mesmo?\", \"como funciona a entrada?\", \"dá pra escolher o andar?\", \"dá pra usar meu FGTS aqui?\", \"e se eu trouxer minha esposa amanhã?\".","Leia os sinais não verbais: tira foto, pergunta dos vizinhos, pede para ver de novo, faz conta no celular, mede com os braços.","Viu 2 sinais, ou 1 sinal forte? Pare de apresentar e proponha o próximo passo. Nunca pergunte \"vai fechar?\": proponha o como."],"na_vida_real":{"caso":"Os 12 padrões que se repetem nas vendas da casa (Casoteca SMQ).","o_que_foi_dito":"O padrão 9 é o fechamento por facilitação: remover a barreira do caixa, não pressionar. No caso A, conduzido pelo diretor, a objeção \"o que pega é que não temos uma entrada boa\" foi tratada com mecanismo (parcelamento e FGTS), não com desconto nem com pressão.","resultado":"O fechamento veio como consequência de uma conta que passou a caber, com urgência verdadeira (a abertura de vendas era na segunda-feira) e sem inventar nada.","fonte":"Casoteca SMQ, caso A e os 12 padrões (seção 9.12)"},"scripts":[{"canal":"Visita","situacao":"A Q7 antes de propor","texto":"Agora que você viu tudo, o que ainda poderia te impedir de avançar?","por_que_funciona":"Traz a objeção escondida para a mesa antes da proposta, quando ainda dá para tratar."},{"canal":"Visita","situacao":"Decisor ausente com cliente animado","texto":"Você gostou tanto que imagino que queira trazer [nome] pra ver também. Fica melhor sábado às 10h ou às 14h?","por_que_funciona":"Respeita a decisão do casal e mantém o movimento com duas opções, sem tentar fechar com metade da decisão."}],"erros_que_matam":[{"erro":"Perguntar \"vai fechar?\"","custo":"Abre a porta para o \"vou pensar\"","correcao":"Propor o como: uma das 5 formas da aula A5"},{"erro":"Pular a Q7","custo":"Você chega ao fechamento sem saber o que trava","correcao":"Q7 na ligação e de novo na visita"},{"erro":"Tentar fechar sem o decisor","custo":"Venda adiada ou desfeita em casa","correcao":"Conversa com os dois, com duas opções de horário"}],"no_crm":{"tela":"Modo Visita; Dossiê do cliente (qualificação e observações)","acao":"Rever Q3 e Q7 no briefing antes de sair e registrar o resultado da visita","campo":"Resultado da visita e observações da qualificação (Q7 e decisor)","regra":"O resultado registrado no Modo Visita move o cliente para \"Visita realizada\" e cria o próximo passo"},"frase_ancora":"Nunca pergunte \"vai fechar?\". Proponha o como.","checagem_rapida":[{"pergunta":"Quais são os 4 pré-requisitos do fechamento?","resposta":"Decisor presente, Q7 feita, 2 ou mais sinais de compra e simulação entendida pelo cliente."},{"pergunta":"Quantos sinais pedem que você pare de apresentar?","resposta":"Dois sinais, ou um sinal forte."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M21-A5', 5, 'As 5 formas de propor e o "vou pensar"', 'texto',
  'Depois da proposta, 30 segundos de silêncio parecem uma eternidade. É nessa eternidade que o cliente decide. Quem enche o silêncio de nervosismo enterra a proposta.

### Por que importa

86,4% das objeções da casa são de tempo, e "vou pensar" é a mais comum delas no fechamento (309 objeções registradas, jul a set/2026). Objeção de tempo escrita pelo cliente vira handoff em 28,7% quando é tratada; aceitar "vou pensar" sem horário devolve o cliente para a gaveta.

### O conceito

Propor é abrir uma porta com a mão estendida, não empurrar ninguém por ela. As 5 formas são 5 portas diferentes; o protocolo do "vou pensar" é descobrir qual porta o cliente ainda não viu.

### O método SMQ, passo a passo

1. Alternativa: "A unidade do 4º andar ou a do 8º ficou melhor pra você?"
2. Resumo com os dados do cliente: "Só pra alinhar: o mais importante pra você era sair do aluguel ainda este ano, ficar perto do metrô e ter parcela dentro do que vocês planejaram. Esse empreendimento atende os três pontos. Faz sentido avançar?"
3. Urgência legítima, só com fato verificável: abertura de vendas, unidades daquela planta na tabela do dia, virada de tabela anunciada pela construtora. Sem fato, não existe urgência.
4. Silêncio: depois da proposta, espere de 30 a 60 segundos. Não preencha.
5. Assumir o próximo passo, com leveza: "Já que você gostou da unidade do 5º andar nesse fluxo, me confirma o seu e-mail que eu peço o contrato pra gente ler junto?"
6. "Vou pensar"? Protocolo em 4 passos: validar ("claro, é uma decisão importante"), investigar ("o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?"), endereçar exatamente o que apareceu e agir com data e hora.
7. No máximo um reforço. Na segunda recusa, recue, registre o desfecho com próximo passo e data e siga pela régua.

### Na vida real

**O caso:** A persona de treino P3, a solteira CLT perto do metrô, montada a partir do perfil real do comprador SMQ (seção 9.13).

**O que foi dito:** Ela diz "vou pensar" depois da simulação. Investigando, aparece o que ela esconde: faltam 2 meses para completar 3 anos de FGTS, e ela acha que não tem entrada.

**O que aconteceu:** Com a conta real da entrada, o parcelamento da campanha e a data do marco do FGTS, o "vou pensar" vira uma visita marcada. Sem investigar, teria virado silêncio.

### Scripts prontos

#### Visita · Investigar o "vou pensar"

> Claro, é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?

**Por que funciona:** Valida sem pressionar e transforma um "vou pensar" genérico numa dúvida concreta que dá para responder.

#### Ligação · Agir depois de investigar

> Que tal 10 minutinhos com vocês dois amanhã às 19h ou sábado de manhã?

**Por que funciona:** Duas opções devolvem um dia; a pergunta aberta devolve "vou pensar".

### Erros que matam a venda

- **Aceitar "vou pensar" sem horário**  
  Quanto custa: A objeção de tempo é 86,4% do total, e sem data ela não volta  
  Correção: Protocolo em 4 passos, terminando com data e hora
- **Inventar urgência ("últimas unidades", "só hoje")**  
  Quanto custa: Urgência falsa destrói a confiança de forma permanente  
  Correção: Urgência só com fato verificável; sem fato, use outra das 5 formas
- **Encher o silêncio depois da proposta**  
  Quanto custa: Você responde a objeção que o cliente nem fez e enterra a proposta  
  Correção: De 30 a 60 segundos de silêncio, sem nervosismo

### No CRM

- **Tela:** Card do cliente (desfecho); Follow-Up
- **Ação:** Registrar o desfecho com próximo passo e data quando o cliente pedir tempo
- **Campo:** Desfecho, próximo passo e data (ou "Aguardando retorno" com o prazo do cliente)
- **Regra:** O prazo do cliente suspende a régua; o retorno volta citando o combinado

### Frase-âncora

> **Pergunta aberta devolve "vou pensar". Duas opções devolvem um dia.**

### Checagem rápida

1. Quais são as 5 formas de propor o próximo passo?  
   Resposta: Alternativa, resumo, urgência legítima, silêncio e assumir o próximo passo com leveza.
2. Quais são os 4 passos do protocolo do "vou pensar"?  
   Resposta: Validar, investigar, endereçar e agir com data e hora.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Depois da proposta, 30 segundos de silêncio parecem uma eternidade. É nessa eternidade que o cliente decide. Quem enche o silêncio de nervosismo enterra a proposta.","por_que_importa":"86,4% das objeções da casa são de tempo, e \"vou pensar\" é a mais comum delas no fechamento (309 objeções registradas, jul a set/2026). Objeção de tempo escrita pelo cliente vira handoff em 28,7% quando é tratada; aceitar \"vou pensar\" sem horário devolve o cliente para a gaveta.","conceito":"Propor é abrir uma porta com a mão estendida, não empurrar ninguém por ela. As 5 formas são 5 portas diferentes; o protocolo do \"vou pensar\" é descobrir qual porta o cliente ainda não viu.","metodo":["Alternativa: \"A unidade do 4º andar ou a do 8º ficou melhor pra você?\"","Resumo com os dados do cliente: \"Só pra alinhar: o mais importante pra você era sair do aluguel ainda este ano, ficar perto do metrô e ter parcela dentro do que vocês planejaram. Esse empreendimento atende os três pontos. Faz sentido avançar?\"","Urgência legítima, só com fato verificável: abertura de vendas, unidades daquela planta na tabela do dia, virada de tabela anunciada pela construtora. Sem fato, não existe urgência.","Silêncio: depois da proposta, espere de 30 a 60 segundos. Não preencha.","Assumir o próximo passo, com leveza: \"Já que você gostou da unidade do 5º andar nesse fluxo, me confirma o seu e-mail que eu peço o contrato pra gente ler junto?\"","\"Vou pensar\"? Protocolo em 4 passos: validar (\"claro, é uma decisão importante\"), investigar (\"o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?\"), endereçar exatamente o que apareceu e agir com data e hora.","No máximo um reforço. Na segunda recusa, recue, registre o desfecho com próximo passo e data e siga pela régua."],"na_vida_real":{"caso":"A persona de treino P3, a solteira CLT perto do metrô, montada a partir do perfil real do comprador SMQ (seção 9.13).","o_que_foi_dito":"Ela diz \"vou pensar\" depois da simulação. Investigando, aparece o que ela esconde: faltam 2 meses para completar 3 anos de FGTS, e ela acha que não tem entrada.","resultado":"Com a conta real da entrada, o parcelamento da campanha e a data do marco do FGTS, o \"vou pensar\" vira uma visita marcada. Sem investigar, teria virado silêncio.","fonte":"Personas de treino (seção 9.13) e protocolo de objeção (seção 9.7)"},"scripts":[{"canal":"Visita","situacao":"Investigar o \"vou pensar\"","texto":"Claro, é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?","por_que_funciona":"Valida sem pressionar e transforma um \"vou pensar\" genérico numa dúvida concreta que dá para responder."},{"canal":"Ligação","situacao":"Agir depois de investigar","texto":"Que tal 10 minutinhos com vocês dois amanhã às 19h ou sábado de manhã?","por_que_funciona":"Duas opções devolvem um dia; a pergunta aberta devolve \"vou pensar\"."}],"erros_que_matam":[{"erro":"Aceitar \"vou pensar\" sem horário","custo":"A objeção de tempo é 86,4% do total, e sem data ela não volta","correcao":"Protocolo em 4 passos, terminando com data e hora"},{"erro":"Inventar urgência (\"últimas unidades\", \"só hoje\")","custo":"Urgência falsa destrói a confiança de forma permanente","correcao":"Urgência só com fato verificável; sem fato, use outra das 5 formas"},{"erro":"Encher o silêncio depois da proposta","custo":"Você responde a objeção que o cliente nem fez e enterra a proposta","correcao":"De 30 a 60 segundos de silêncio, sem nervosismo"}],"no_crm":{"tela":"Card do cliente (desfecho); Follow-Up","acao":"Registrar o desfecho com próximo passo e data quando o cliente pedir tempo","campo":"Desfecho, próximo passo e data (ou \"Aguardando retorno\" com o prazo do cliente)","regra":"O prazo do cliente suspende a régua; o retorno volta citando o combinado"},"frase_ancora":"Pergunta aberta devolve \"vou pensar\". Duas opções devolvem um dia.","checagem_rapida":[{"pergunta":"Quais são as 5 formas de propor o próximo passo?","resposta":"Alternativa, resumo, urgência legítima, silêncio e assumir o próximo passo com leveza."},{"pergunta":"Quais são os 4 passos do protocolo do \"vou pensar\"?","resposta":"Validar, investigar, endereçar e agir com data e hora."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M21-A6', 6, 'Depois do sim: Registrar venda e o pós-venda que segura a venda', 'texto',
  'Contrato assinado, cliente feliz, card arrastado para "Venda". Para o sistema, essa venda não existe: não entra no VGV, no ranking nem na sua comissão. Venda que não foi registrada pelo diálogo é venda que ninguém vê.

### Por que importa

Venda na SMQ é contrato assinado, cliente aprovado e ato pago, e só existe no sistema se for registrada pelo diálogo "Registrar venda" e aprovada pela gestão. E o cliente que não sabe o que acontece depois da assinatura cancela com mais frequência. Os primeiros 30 minutos depois do "sim" protegem a venda; o pós-venda até as chaves traz a próxima: indicação é a origem com 3 leads por venda, contra 413 do Facebook (Treinamento do CRM, set/2026).

### O conceito

Assinar é cruzar a linha de chegada de uma prova; registrar é entregar o chip de cronometragem. Sem o chip, você correu, mas o seu tempo não aparece no resultado.

### O método SMQ, passo a passo

1. Os primeiros 30 minutos: celebre de verdade, repita os termos combinados, explique o próximo passo (pasta, análise, assinatura, ato pelo canal oficial) e agende o próximo contato.
2. Registrar venda, passo 1: clique em "Registrar venda" no topo de qualquer tela (ou pela busca ⌘K).
3. Passo 2: escolha o lead e preencha o valor da venda e a data de assinatura (ela não pode ser futura; o mês da venda é o da data de assinatura).
4. Passo 3: projeto e unidade, e a divisão, se houver.
5. Passo 4: marque os marcos de efetivação (Contrato Assinado, Ato Pago e Apto para repasse) e salve: a venda nasce pendente e vai para a aprovação da gestão.
6. Passo 5: a gestão aprova. Sem os três marcos, não passa. Registre no mesmo dia da assinatura.
7. Pós-venda: no dia 1, parabéns e a lista clara dos próximos passos; na fase documental, notícia a cada 5 dias úteis, no mínimo; durante a obra, contato mensal até as chaves; depois das chaves, pedido de indicação específico.
8. Sinais de cancelamento: sumiu depois de assinar (ligue em até 48 horas com informação útil), questiona a decisão (reforce o que ele valoriza), o cônjuge questionou (conversa com os dois).

### Na vida real

**O caso:** Caso N, do fechamento no calor ao pós-venda que parou cedo (jan a fev/2026).

**O que foi dito:** Depois da aprovação, na linha de: "Aprovou! Você consegue vir hoje?". Contrato assinado no estande à noite e, depois da assinatura: "Obrigada por confiar no meu trabalho."

**O que aconteceu:** Primeiro boleto pago no dia 23 e contrato com o banco no dia 39. O último contato de quem vendeu foi no dia 55: o pós-venda parou no mês seguinte ao contrato, e com ele a chance de indicação. A doutrina corrige: contato mensal até as chaves e pedido de indicação específico.

### Scripts prontos

#### WhatsApp · Aprovação com fechamento no calor

> Aprovado, [nome]! Você conseguiu o mais difícil. Vamos garantir a sua unidade: consegue vir hoje às 18h ou amanhã às 10h? Deixo o fluxo e o contrato prontos pra você.

**Por que funciona:** Celebra, dá o crédito ao cliente e já marca a assinatura com duas opções. No caso N, a aprovação virou assinatura em 1 dia.

#### WhatsApp · Pós-venda depois do contrato com o banco

> [nome], agora é oficial! Parabéns. Daqui pra frente eu te dou notícia da obra todo mês, até a chave. E se alguém da sua família ou do trabalho estiver pagando aluguel, pode me indicar que eu cuido com o mesmo carinho.

**Por que funciona:** Celebra, promete presença que você vai cumprir e pede indicação específica, não genérica.

#### Ligação · Pedido de indicação depois das chaves

> Você conhece alguém que paga aluguel e gostaria de sair?

**Por que funciona:** Pergunta específica gera nome; "se souber de alguém, me indica" não gera nada.

### Erros que matam a venda

- **Arrastar o card para "Venda" em vez de registrar**  
  Quanto custa: A venda fica fora do VGV, do ranking e da sua comissão  
  Correção: "Registrar venda" com data de assinatura e os três marcos, no mesmo dia
- **Sumir depois da assinatura**  
  Quanto custa: Cliente que não sabe o que vem depois cancela com mais frequência, e a indicação nunca chega  
  Correção: Dia 1 com os próximos passos, notícia a cada 5 dias úteis na fase documental e contato mensal até as chaves

### No CRM

- **Tela:** Botão "Registrar venda" (topo de qualquer tela ou ⌘K); Assinaturas & Comissões
- **Ação:** Registrar a venda com lead, valor, data de assinatura, projeto, unidade e marcos
- **Campo:** Data de assinatura; marcos de efetivação: Contrato Assinado, Ato Pago e Apto para repasse
- **Regra:** A venda nasce pendente e só conta depois da aprovação da gestão; arrastar o card fecha o lead, mas não cria venda

### Frase-âncora

> **Venda que não passou pelo "Registrar venda" não aconteceu.**

### Checagem rápida

1. Quais são os três marcos de efetivação?  
   Resposta: Contrato Assinado, Ato Pago e Apto para repasse.
2. Qual data define o mês da venda?  
   Resposta: A data de assinatura.
3. O cliente assinou e sumiu. Em quanto tempo você liga?  
   Resposta: Em até 48 horas, com informação útil.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Contrato assinado, cliente feliz, card arrastado para \"Venda\". Para o sistema, essa venda não existe: não entra no VGV, no ranking nem na sua comissão. Venda que não foi registrada pelo diálogo é venda que ninguém vê.","por_que_importa":"Venda na SMQ é contrato assinado, cliente aprovado e ato pago, e só existe no sistema se for registrada pelo diálogo \"Registrar venda\" e aprovada pela gestão. E o cliente que não sabe o que acontece depois da assinatura cancela com mais frequência. Os primeiros 30 minutos depois do \"sim\" protegem a venda; o pós-venda até as chaves traz a próxima: indicação é a origem com 3 leads por venda, contra 413 do Facebook (Treinamento do CRM, set/2026).","conceito":"Assinar é cruzar a linha de chegada de uma prova; registrar é entregar o chip de cronometragem. Sem o chip, você correu, mas o seu tempo não aparece no resultado.","metodo":["Os primeiros 30 minutos: celebre de verdade, repita os termos combinados, explique o próximo passo (pasta, análise, assinatura, ato pelo canal oficial) e agende o próximo contato.","Registrar venda, passo 1: clique em \"Registrar venda\" no topo de qualquer tela (ou pela busca ⌘K).","Passo 2: escolha o lead e preencha o valor da venda e a data de assinatura (ela não pode ser futura; o mês da venda é o da data de assinatura).","Passo 3: projeto e unidade, e a divisão, se houver.","Passo 4: marque os marcos de efetivação (Contrato Assinado, Ato Pago e Apto para repasse) e salve: a venda nasce pendente e vai para a aprovação da gestão.","Passo 5: a gestão aprova. Sem os três marcos, não passa. Registre no mesmo dia da assinatura.","Pós-venda: no dia 1, parabéns e a lista clara dos próximos passos; na fase documental, notícia a cada 5 dias úteis, no mínimo; durante a obra, contato mensal até as chaves; depois das chaves, pedido de indicação específico.","Sinais de cancelamento: sumiu depois de assinar (ligue em até 48 horas com informação útil), questiona a decisão (reforce o que ele valoriza), o cônjuge questionou (conversa com os dois)."],"na_vida_real":{"caso":"Caso N, do fechamento no calor ao pós-venda que parou cedo (jan a fev/2026).","o_que_foi_dito":"Depois da aprovação, na linha de: \"Aprovou! Você consegue vir hoje?\". Contrato assinado no estande à noite e, depois da assinatura: \"Obrigada por confiar no meu trabalho.\"","resultado":"Primeiro boleto pago no dia 23 e contrato com o banco no dia 39. O último contato de quem vendeu foi no dia 55: o pós-venda parou no mês seguinte ao contrato, e com ele a chance de indicação. A doutrina corrige: contato mensal até as chaves e pedido de indicação específico.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Aprovação com fechamento no calor","texto":"Aprovado, [nome]! Você conseguiu o mais difícil. Vamos garantir a sua unidade: consegue vir hoje às 18h ou amanhã às 10h? Deixo o fluxo e o contrato prontos pra você.","por_que_funciona":"Celebra, dá o crédito ao cliente e já marca a assinatura com duas opções. No caso N, a aprovação virou assinatura em 1 dia."},{"canal":"WhatsApp","situacao":"Pós-venda depois do contrato com o banco","texto":"[nome], agora é oficial! Parabéns. Daqui pra frente eu te dou notícia da obra todo mês, até a chave. E se alguém da sua família ou do trabalho estiver pagando aluguel, pode me indicar que eu cuido com o mesmo carinho.","por_que_funciona":"Celebra, promete presença que você vai cumprir e pede indicação específica, não genérica."},{"canal":"Ligação","situacao":"Pedido de indicação depois das chaves","texto":"Você conhece alguém que paga aluguel e gostaria de sair?","por_que_funciona":"Pergunta específica gera nome; \"se souber de alguém, me indica\" não gera nada."}],"erros_que_matam":[{"erro":"Arrastar o card para \"Venda\" em vez de registrar","custo":"A venda fica fora do VGV, do ranking e da sua comissão","correcao":"\"Registrar venda\" com data de assinatura e os três marcos, no mesmo dia"},{"erro":"Sumir depois da assinatura","custo":"Cliente que não sabe o que vem depois cancela com mais frequência, e a indicação nunca chega","correcao":"Dia 1 com os próximos passos, notícia a cada 5 dias úteis na fase documental e contato mensal até as chaves"}],"no_crm":{"tela":"Botão \"Registrar venda\" (topo de qualquer tela ou ⌘K); Assinaturas & Comissões","acao":"Registrar a venda com lead, valor, data de assinatura, projeto, unidade e marcos","campo":"Data de assinatura; marcos de efetivação: Contrato Assinado, Ato Pago e Apto para repasse","regra":"A venda nasce pendente e só conta depois da aprovação da gestão; arrastar o card fecha o lead, mas não cria venda"},"frase_ancora":"Venda que não passou pelo \"Registrar venda\" não aconteceu.","checagem_rapida":[{"pergunta":"Quais são os três marcos de efetivação?","resposta":"Contrato Assinado, Ato Pago e Apto para repasse."},{"pergunta":"Qual data define o mês da venda?","resposta":"A data de assinatura."},{"pergunta":"O cliente assinou e sumiu. Em quanto tempo você liga?","resposta":"Em até 48 horas, com informação útil."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q01', 1, 'situacional',
  'A cliente recebeu a lista, mandou RG e CPF e escreveu: "o resto eu vou mandando". Qual é a sua próxima mensagem?',
  '["\"Claro, sem pressa! Pode ir mandando no seu ritmo.\"","Reenviar a lista inteira, com todos os itens de novo.","\"Perfeito, [nome]! O RG e o CPF chegaram e já estão na sua pasta. O próximo é o extrato bancário dos últimos 6 meses. Consegue me mandar até amanhã?\"","\"Me manda tudo hoje, senão a unidade vai embora.\""]'::jsonb,
  2,
  'A C reconhece o que chegou, mostra organização e ancora o próximo item com prazo, começando pelo que mais trava a pasta (extrato de 6 meses, 23% das pendências). A A é o encerramento passivo, a pior nota das conversas em ago/2026. A B repete tudo sem prioridade e cansa. A D é urgência falsa.',
  'M21-A1; seções 9.1 e 9.14', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q02', 2, 'situacional',
  'A pasta está completa na aba Documentação. O cliente, ansioso, pede: "manda logo pro banco hoje". O que você faz?',
  '["Pede a revisão do seu gerente hoje, explica ao cliente que a pasta passa por uma conferência antes de ir ao correspondente do empreendimento e diz o dia do próximo retorno.","Envia direto ao correspondente para ganhar tempo; o gerente vê depois, se voltar pendência.","Envia ao correspondente de outro empreendimento, que costuma responder mais rápido.","Diz que a aprovação sai em 48 horas para acalmar o cliente."]'::jsonb,
  0,
  'A A segue o caminho da pasta (CRM, gerente, correspondente do empreendimento) e dá presença sem promessa. A B pula a revisão, e a pasta volta com pendência e o ciclo alonga. A C manda ao correspondente errado: cada empreendimento tem o seu. A D promete prazo, e prazo de retorno não se promete.',
  'M21-A2; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q03', 3, 'aplicacao',
  'Cliente motorista de aplicativo. Além dos documentos de todos os compradores, quais documentos de renda você pede?',
  '["Os 3 últimos holerites e a carteira de trabalho digital.","Contrato social e pró-labore dos últimos 3 meses.","Uma declaração de renda escrita pelo próprio cliente, sem extrato.","Os relatórios de rendimento dos 4 meses mais recentes do mesmo aplicativo e os 3 últimos extratos bancários, confirmando a lista com o correspondente."]'::jsonb,
  3,
  'A D é a lista do perfil de aplicativo, sempre confirmada com o correspondente do empreendimento. A A é a lista do CLT. A B é a do empresário. A C não comprova renda e não serve para a análise.',
  'M21-A1; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q04', 4, 'situacional',
  'Durante a montagem da pasta, o cliente pergunta: "Qual renda eu informo pra aprovar mais?". O que você responde?',
  '["Sugere um valor um pouco acima do que ele ganha, já que a renda dele varia.","\"A sua renda real e comprovada. O correspondente orienta como documentar a renda que você tem; ninguém aqui sugere valor.\"","Orienta a aumentar o pró-labore no mês da análise.","Diz que tanto faz, porque o banco não confere."]'::jsonb,
  1,
  'A B é a regra de integridade da pasta: a renda real e comprovada define a aprovação, nunca o contrário. A A e a C sugerem valor de renda ou de pró-labore para bater com a aprovação, risco grave para o cliente, para o corretor e para a SMQ. A D é falsa e irresponsável.',
  'M21-A2; seções 9.16 e 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q05', 5, 'conceito',
  'O que é venda na SMQ?',
  '["O cliente aprovado na Caixa.","Contrato assinado, cliente aprovado e ato pago, registrada pelo diálogo \"Registrar venda\" e aprovada pela gestão.","O card arrastado para a coluna \"Venda\" do quadro.","A proposta aceita pelo cliente na visita."]'::jsonb,
  1,
  'A B é a definição oficial. A A é só uma das três condições. A C fecha o lead, mas não cria venda, VGV, ranking nem comissão. A D é uma etapa do caminho, não a venda.',
  'M21-A6; seções 3 e 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q06', 6, 'situacional',
  'Saiu o resultado: aprovado, mas com valor menor que o esperado. Qual é a sua mensagem ao cliente?',
  '["\"Infelizmente não deu dessa vez. Vamos tentar mais pra frente.\"","\"Vou pedir um desconto pra construtora cobrir a diferença.\"","Marca o card como perdido pelo motivo \"Crédito (renda)\".","\"Aprovou, [nome]! O valor veio um pouco abaixo do que a gente queria, e isso tem saída: [opção 1] ou [opção 2]. Te explico as duas por ligação às 19h?\""]'::jsonb,
  3,
  'A D trata aprovação menor como o que ela é, uma aprovação com saídas (outra unidade, FGTS, condição da campanha, com o gerente), e marca a conversa por voz. A A trata como reprovação. A B promete desconto fora da alçada. A C perde um cliente aprovado.',
  'M21-A2; seções 9.8 e 9.14', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q07', 7, 'aplicacao',
  'O cliente diz: "Se tiver um descontinho, eu fecho hoje". Qual resposta segue a regra da casa?',
  '["\"O preço de tabela é o mesmo pra todo mundo. O que eu consigo é montar a melhor condição da campanha pra você: [condição]. Se a gente precisar ir além disso, eu levo ao meu gerente hoje e te dou retorno até [hora].\"","\"Consigo tirar um pouco do preço se você fechar agora.\"","\"Sem desconto. É pegar ou largar.\"","\"Deixa comigo que eu dou um jeito com a construtora.\""]'::jsonb,
  0,
  'A A negocia dentro da campanha e leva o pedido extra ao gerente com retorno marcado (decisão de 29/09/2026). A B dá desconto sem alçada. A C fecha a porta sem mostrar a condição que existe. A D promete o que não depende do corretor.',
  'M21-A3; seções 3 e 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q08', 8, 'conceito',
  'Quais são os 4 pré-requisitos antes de propor o fechamento?',
  '["Documento, visita, simulação e um sinal de compra.","Decisor, entrada, FGTS e laudo.","Decisor presente, Q7 feita, 2 ou mais sinais de compra e simulação entendida pelo cliente.","Aprovação, unidade, ato e contrato."]'::jsonb,
  2,
  'A C é a lista oficial. A A mistura etapas e exige só um sinal. A B lista travas técnicas da qualificação, não pré-requisitos de fechamento. A D descreve o que vem depois do sim.',
  'M21-A4; seção 10.4', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q09', 9, 'situacional',
  'Na visita, a cliente adorou o apartamento, mas o marido, que decide junto, não veio. Ela diz: "Se fosse por mim, eu fechava hoje". O que você faz?',
  '["Fecha com ela agora; o marido assina depois.","Pede o ato hoje para garantir a unidade.","Diz que a unidade pode acabar amanhã.","\"Que bom que você gostou! Imagino que queira trazer [nome] pra ver também. Fica melhor sábado às 10h ou às 14h?\""]'::jsonb,
  3,
  'A D respeita a decisão do casal e mantém o movimento com duas opções. A A é proibido: fechar primeiro e trazer o cônjuge depois. A B pressiona com pagamento antes do decisor. A C é urgência falsa.',
  'M21-A4; seções 3 e 9.5', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q10', 10, 'aplicacao',
  'A análise foi aprovada às 15h26. Qual é o melhor próximo passo?',
  '["Celebrar e marcar a assinatura com duas opções, hoje ou amanhã, com a unidade, o fluxo e o contrato prontos antes de o cliente chegar.","Mandar \"parabéns, quando puder a gente assina\".","Esperar o cliente procurar, para não parecer pressão.","Registrar a venda no CRM na hora, antes da assinatura."]'::jsonb,
  0,
  'A A é o fechamento no calor do caso N: aprovação virou assinatura em 1 dia. A B é pergunta aberta, que devolve "vou pensar". A C deixa o cliente esfriar no melhor momento. A D registra uma venda que ainda não existe: sem contrato assinado e ato pago, não é venda.',
  'M21-A6; seção 9.12, caso N', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q11', 11, 'caca_ao_erro',
  'Leia a mensagem: "Parabéns, você foi aprovado! Pra garantir a unidade, faz um Pix de R$ 2.000 pra minha conta hoje que eu seguro ela pra você até sexta." Qual é o problema principal?',
  '["Nenhum: o Pix acelera o processo.","Faltou um emoji para celebrar a aprovação.","Pagamento em conta pessoal, pressão de \"hoje\" e prazo prometido: o ato é só pelo canal oficial da construtora ou da imobiliária, explicado por escrito, e o prazo de garantia é o da construtora, confirmado com o gerente.","O valor pedido está baixo para garantir uma unidade."]'::jsonb,
  2,
  'A C aponta os três erros: conta de pessoa física, urgência de pressão e prazo prometido que não depende do corretor. A A ignora o risco de golpe e de credibilidade. A B e a D discutem detalhe e deixam o erro grave passar.',
  'M21-A3; seções 9.16 e 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q12', 12, 'situacional',
  'Depois da simulação, o cliente diz: "Vou pensar". Qual é a sua resposta?',
  '["\"Tá bom, qualquer coisa me chama.\"","\"Claro, é uma decisão importante. Me ajuda a entender: o que você ainda precisa analisar? A parcela, a região ou alguém que precisa ver junto?\"","\"Se não fechar hoje, você perde a condição.\"","Manda o book de novo para ele relembrar."]'::jsonb,
  1,
  'A B valida e investiga, o passo que nunca se pula. A A é a frase proibida que entrega a iniciativa ao cliente. A C é urgência falsa. A D repete material sem descobrir o que trava.',
  'M21-A5; seção 9.7', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q13', 13, 'aplicacao',
  'Qual é a ordem certa do caminho da pasta na SMQ?',
  '["O corretor anexa no CRM, o gerente revisa e orienta, o corretor envia ao correspondente do empreendimento e o correspondente conduz a análise na Caixa.","O cliente manda os documentos direto ao banco e o corretor acompanha.","O corretor envia ao correspondente, depois anexa no CRM, e o gerente revisa se voltar pendência.","O gerente pede os documentos ao cliente e envia à construtora."]'::jsonb,
  0,
  'A A é o fluxo decidido pelo diretor em 29/09/2026. A B tira a pasta do controle do corretor. A C inverte a ordem e pula a revisão, e a pasta volta com pendência. A D troca os papéis: quem controla a pasta é o corretor, e quem revisa é o gerente.',
  'M21-A2; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q14', 14, 'conceito',
  'Por que arrastar o card para "Venda" não basta?',
  '["Porque a coluna \"Venda\" está desativada no quadro.","Porque o cliente precisa assinar dentro do sistema.","Porque o gerente não enxerga o quadro de cada corretor.","Porque isso fecha o lead, mas não cria venda, VGV, ranking nem comissão: a venda só existe pelo diálogo \"Registrar venda\", aprovada pela gestão."]'::jsonb,
  3,
  'A D é a regra do CRM. A A é falsa: o card vai para a coluna, só não vira venda. A B inventa uma assinatura no sistema. A C é falsa e não explica nada.',
  'M21-A6; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q15', 15, 'situacional',
  'A pasta está com o correspondente há 6 dias úteis, sem retorno. O cliente ainda não cobrou você. O que fazer?',
  '["Nada: sem novidade, não precisa falar com o cliente.","Prometer que o resultado sai até sexta.","Cobrar o correspondente e dar notícia ao cliente, mesmo sem novidade, com o próximo dia de retorno.","Pedir ao cliente que ligue na Caixa para saber."]'::jsonb,
  2,
  'A C cumpre a regra dos 5 dias úteis e cobra quem deve ser cobrado. A A deixa o cliente esfriar em análise. A B promete prazo que ninguém controla. A D transfere o seu trabalho ao cliente e o expõe a quem se passa pela Caixa.',
  'M21-A2; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q16', 16, 'aplicacao',
  'No diálogo "Registrar venda", quais marcos de efetivação precisam estar ativos para a gestão aprovar a venda?',
  '["Proposta enviada, visita realizada e pasta completa.","Contrato Assinado, Ato Pago e Apto para repasse.","Só a data de assinatura.","Aprovação de crédito e escritura registrada."]'::jsonb,
  1,
  'A B lista os três marcos do sistema; sem eles, a venda não passa. A A mistura etapas do funil. A C é um campo obrigatório, não os marcos. A D não são os marcos do CRM.',
  'M21-A6; src/lib/vendas.ts (marcos de efetivação)', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q17', 17, 'conceito',
  'Qual das 5 formas de propor o próximo passo só pode ser usada com um fato verificável?',
  '["Alternativa.","Resumo.","Silêncio.","Urgência legítima (abertura de vendas, unidades daquela planta na tabela do dia, virada de tabela anunciada pela construtora)."]'::jsonb,
  3,
  'A D é a única que depende de um fato: sem fato, não existe urgência. A A, a B e a C funcionam em qualquer conversa, desde que com verdade.',
  'M21-A5; seção 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q18', 18, 'situacional',
  'O resultado da análise veio reprovado. Qual é o próximo passo?',
  '["Entender o motivo exato com o correspondente, ligar para o cliente com verdade e caminho e montar um plano de 60 a 90 dias (nome, composição, comprometimento).","Marcar o card como perdido por \"Sem perfil\" na hora.","Mandar \"infelizmente não deu\" por mensagem e encerrar.","Tentar outro correspondente sem contar nada ao cliente."]'::jsonb,
  0,
  'A A é o protocolo da casa depois da reprovação. A B usa um motivo falso e perde um cliente com caminho. A C dá notícia difícil por texto seco e sem caminho. A D esconde do cliente o que aconteceu com a pasta dele.',
  'M21-A2; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q19', 19, 'aplicacao',
  'O cliente assinou o contrato numa quinta-feira, com o ato pago pelo canal oficial. Quando você registra a venda, e com qual data?',
  '["Na segunda seguinte, com a data de segunda.","No mesmo dia, pelo diálogo, com a data de assinatura daquela quinta: o mês da venda é o da data de assinatura.","No fim do mês, junto com as outras vendas.","Só depois do repasse, com a data do repasse."]'::jsonb,
  1,
  'A B registra no mesmo dia, com a data certa. A A e a C atrasam e podem jogar a venda para o mês errado. A D confunde o marco "Apto para repasse" com a data da venda.',
  'M21-A6; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M21-Q20', 20, 'caca_ao_erro',
  'Leia a mensagem: "Pra análise preciso de: RG, CPF, certidão, comprovante de residência, holerites, extrato do FGTS, extratos de 6 meses, carteira de trabalho e IR. Pode ir mandando no seu ritmo, sem pressa!" Qual é o problema?',
  '["Pediu extrato de 6 meses, que não é necessário.","Faltou pedir a senha do app do banco para baixar os extratos.","Fechou sem âncora e sem as âncoras antigolpe: o certo é dizer que a análise é gratuita e que o documento vem pelo canal oficial da SMQ, e perguntar qual ele consegue mandar primeiro, ainda hoje.","Pediu documento demais para um cliente CLT."]'::jsonb,
  2,
  'A C aponta o erro que mata a pasta: encerramento passivo e nenhuma âncora de confiança. A A é falsa: o extrato de 6 meses é o que mais trava (23% das pendências) e deve vir primeiro. A B é proibido: senha nunca se pede. A D é falsa: a lista é a do perfil.',
  'M21-A1; seções 9.4, 9.16 e 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (14)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F01', 1, 'Venda na SMQ', 'Contrato assinado + cliente aprovado + ato pago, registrada pelo diálogo "Registrar venda" e aprovada pela gestão.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F02', 2, 'O caminho da pasta', 'Você anexa no CRM, o gerente revisa e orienta, você envia ao correspondente do empreendimento, o correspondente conduz a análise na Caixa.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F03', 3, 'Os 3 documentos que mais travam', 'Extrato bancário de 6 meses (23%), comprovante de estado civil (20%) e CPF (16%) (CRM, set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F04', 4, 'Como fechar a lista de documentos', '"Dos itens, qual você consegue me mandar primeiro, ainda hoje?" Nunca "no seu ritmo".', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F05', 5, 'Notícia durante a análise', 'Pelo menos a cada 5 dias úteis, mesmo sem novidade; na ansiedade, a cada 48 horas. Cobre o correspondente, não o cliente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F06', 6, 'Integridade da pasta', 'Dados como o cliente informou; renda real e comprovada; nenhum documento de outro cliente; nenhuma senha na conversa.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F07', 7, 'O que o corretor negocia', 'Só a condição da campanha. Desconto extra ou condição fora dela: gerente ou diretor, com retorno marcado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F08', 8, 'Prazo de garantia da unidade', 'O da construtora, confirmado com o gerente. Nunca prometido ao cliente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F09', 9, 'Pagamento do ato', 'Só por canal oficial da construtora ou da imobiliária, explicado por escrito. Nunca conta pessoal, nunca "Pix hoje".', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F10', 10, 'Os 4 pré-requisitos', 'Decisor presente, Q7 feita, 2 ou mais sinais de compra, simulação entendida.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F11', 11, 'As 5 formas de propor', 'Alternativa, resumo, urgência legítima, silêncio de 30 a 60 segundos, assumir o próximo passo com leveza.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F12', 12, '"Vou pensar"', 'Validar, investigar ("o que você ainda precisa analisar?"), endereçar e agir com data e hora.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F13', 13, 'Registrar venda: os marcos', 'Contrato Assinado, Ato Pago e Apto para repasse. A venda nasce pendente; o mês é o da data de assinatura.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M21-F14', 14, 'Pós-venda', 'Dia 1 com os próximos passos; a cada 5 dias úteis na fase documental; mensal até as chaves; depois, indicação específica.', true
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1, abra com o corretor a lista de clientes dele em Análise de crédito e revise a pasta de um deles ao vivo, usando a revisão como momento de ensino: perfil de renda, os três documentos que mais travam, e as quatro conferências de integridade (dados como o cliente informou, renda real e comprovada, nenhum documento de outro cliente, nenhuma senha na conversa). Na reunião de segunda, mostre a prioridade \"Pasta travada\" do time e as vendas do card \"Aprovações de venda\" ainda sem os marcos. Faça o role-play de fechamento uma vez por mês com P1 e P3.","sinais_de_dificuldade":["Clientes em Análise de crédito sem próximo passo ou parados há mais de 5 dias úteis sem interação.","Pastas enviadas ao correspondente sem passar pela sua revisão, ou voltando com pendência dos três documentos que mais travam.","Cards em \"Venda\" sem venda registrada pelo diálogo, ou vendas pendentes com a data de assinatura muito anterior ao registro."],"perguntas_de_coaching":["Qual dos 4 pré-requisitos faltava quando esse cliente disse \"vou pensar\"?","Quando foi a última notícia que você deu a cada cliente em análise, e o que você cobrou do correspondente?","O que você ofereceu quando o cliente pediu desconto, e o que você trouxe para mim decidir?"],"ritual_de_celebracao":"No LEGADO mensal, as categorias Mestre do Fechamento e CRM Champion (vendas registradas pelo diálogo no dia da assinatura, com os marcos); no All Hands quinzenal, o destaque da pasta que destravou; conquistas \"Pasta completa\" e \"Primeira venda registrada pelo diálogo\"."},"pratica_gabarito":["P1: não propor o fechamento sem a esposa. Resposta certa: \"Faz todo sentido, é decisão de casal. Fica melhor hoje às 19h por vídeo ou sábado no estande, com vocês dois?\". Parcela contra aluguel: parcela fixa na PRICE contra aluguel que sobe todo ano, sempre como estimativa. Perda de emprego: o seguro obrigatório do financiamento cobre morte e invalidez, não desemprego; nada de prometer renegociação.","P3: investigar o \"vou pensar\" até aparecer a entrada. Mostrar a conta real da entrada (preço menos o que a Caixa financia, menos FGTS e subsídio quando houver), o parcelamento da campanha até as chaves e o marco do FGTS em 2 meses. Ação: visita ou conversa marcada com duas opções, ou documento combinado.","Desconto: \"O preço de tabela é o mesmo pra todo mundo. O que eu consigo é montar a melhor condição da campanha pra você. Se a gente precisar ir além disso, eu levo ao meu gerente hoje e te dou retorno até [hora].\"","Pix: \"Por segurança, pagamento só pelo canal oficial da construtora, e eu te explico tudo por escrito antes.\" Nenhum prazo de garantia prometido."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M21' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
