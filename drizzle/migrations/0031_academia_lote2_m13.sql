-- ===========================================================================
-- ACADEMIA SMQ · LOTE 2 (v1.0) · seed do módulo M13
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-2/academia-smq-lote-2.json.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- 5 aulas · 20 questões · 13 flashcards
-- ===========================================================================

-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  ('M13', 13, 3, 'Primeiro contato que não queima lead', 'Ao final, você abre todo primeiro contato, por ligação, WhatsApp ou no estande, provando que leu o cadastro e pedindo só um sim, com a abertura certa para cada origem do lead, e isso aparece no CRM como tempo até o primeiro contato em até 5 minutos (o limite do sistema é de 15 minutos úteis) e desfecho registrado em todo primeiro contato.',
   '["Eu sou capaz de escrever uma primeira mensagem de até 4 linhas com gancho específico, personalização, valor para quem responde e uma pergunta de sim ou de duas opções (G.P.V.A.).","Eu sou capaz de abrir cada origem de lead (continuidade do robô, rota direta, pré-venda, reativação, indicação e lead próprio) com a primeira frase certa, sem repetir o que o cliente já contou.","Eu sou capaz de responder ao lead saturado ou desconfiado com identificação honesta, prova de leitura do cadastro e as quatro âncoras antigolpe, sem disfarce.","Eu sou capaz de receber um cliente no estande pelo nome e qualificar antes de apresentar qualquer produto.","Eu sou capaz de registrar todo primeiro contato com desfecho, próximo passo e data, mesmo quando o cliente não atende."]'::jsonb, 1.1, '65 min', true,
   '**Laboratório de aberturas com revisão do gerente (escrito, falado e em campo)** · 45 min

**Papéis:** O corretor escreve e fala as aberturas; um colega faz o cliente nas aberturas faladas; o gerente lê, ouve e pontua com a rubrica.

**Persona:** P1 (casal que cansou do aluguel), P2 (entregador de aplicativo), P5 (lead saturado e desconfiado), P6 (cliente PRONTO) e P7 (investidor)

**Roteiro:** O gerente entrega 8 cartões de origem. Para cada um, o corretor escreve a primeira mensagem de WhatsApp (até 4 linhas, no G.P.V.A.) e fala a primeira frase da ligação para o colega, que responde como o cartão manda. Nas 48 horas seguintes, o corretor completa 20 aberturas reais registradas no CRM, que o gerente revisa pela conversa do card e pelo desfecho.

**Roteiro do cliente:**

- Cartão 1: lead de formulário do [empreendimento], na Zona Leste, chegou há 1 minuto, resumo vazio (rota direta). Atende e diz: "Vi o anúncio, queria saber o valor." (P1)
- Cartão 2: handoff do robô com renda em torno de R$ 2.800 de aplicativo, primeiro imóvel, sem entrada e sem FGTS no dossiê. Não atende a ligação. (P2)
- Cartão 3: lead de 3 dias atrás, que já recebeu várias ligações. Atende e diz: "Já me ligaram umas vinte vezes. Isso é golpe?" (P5)
- Cartão 4: lead entregue pela pré-venda na etapa Qualificação Corretor, com interesse em visitar. Atende e pergunta: "Posso ir aí sábado?" (P6)
- Cartão 5: lead que escreveu primeiro no WhatsApp: "Me manda a tabela e a rentabilidade." (P7)
- Cartão 6: lead reativado da base, que procurou apartamento na Zona Sul há 2 meses. Atende e fica em silêncio, esperando.
- Cartão 7: indicação de uma cliente que comprou; a indicada paga aluguel e não conhece o produto. Não atende a ligação.
- Cartão 8: casal que chegou ao estande sem agendamento e parou na frente da maquete.

**O que o observador procura:**

- Identificação completa (nome, Seu Metro Quadrado, especialista em Minha Casa Minha Vida) em todas as aberturas.
- Prova de leitura do cadastro: nome certo, empreendimento, região, quem indicou ou o que o robô já sabe.
- No máximo 4 linhas e uma pergunta por mensagem; pergunta de sim, de não ou de duas opções.
- Nenhum catálogo, preço sem contexto ou urgência falsa no primeiro contato.
- Âncoras antigolpe quando há desconfiança; nenhuma promessa de aprovação, de parcela ou de rentabilidade (critério 6 só com nota 5).
- Desfecho com próximo passo e data registrado em todas as aberturas reais.

**Rubrica:** Padrão SMQ, critérios 1 (abertura e conexão), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Abertura e conexão: personalização, nome, prova de que leu o cadastro","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 2 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Se a passagem "Primeiro contato efetivo" aparece por corretor no Meu Raio-X ou só no funil da casa (Operação › Funil). | [GAP DE CRM] O tempo até o primeiro contato em minutos úteis (o limite de 15) só aparece na Gestão da Academia; o corretor vê a 1ª resposta em minutos corridos no Meu Raio-X. | [DADO A MEDIR NO CRM] Taxa de resposta e de avanço das primeiras mensagens escritas pelos corretores (os números de abertura deste módulo vêm das conversas do robô). | [CONFIRMAR] Qual origem registrar no CRM para o cliente que chega ao estande sem cadastro (aula M13-A4). | [CONFIRMAR] Horário, endereço e quem recebe em cada estande e escritório dos produtos em foco, para os convites e a recepção da aula M13-A4.', '{"formato":"canonico-8.2","lote":2,"versao_conteudo":"1.0","trilha":"T3","ordem":1,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"A primeira mensagem prova que tem gente do outro lado. Ou prova que não tem.","duracao_min":65,"por_que_vale_dinheiro":{"texto":"A primeira mensagem decide se existe a segunda. Abrir chamando o cliente pelo nome levou a 59,3% de resposta, contra 35,3% sem o nome. Citar o empreendimento que o cliente viu levou 19,4% das conversas até o corretor, contra 11,0% da abertura genérica, com a mesma taxa de resposta. Personalizar não custa nada e quase dobra o avanço.","numero":"59,3% de resposta com o nome do cliente contra 35,3% sem; 19,4% de handoff com o nome do empreendimento contra 11,0% da abertura genérica","fonte":"Conversas do robô","periodo":"jul a set/2026"},"pre_requisitos":["M00","M25","M26"],"indicador_crm":{"nome":"Tempo até o primeiro contato (em horas e minutos) e primeiro contato efetivo","onde_ler":"Meu Raio-X › tabela mensal, coluna \"1ª resp.\" (em horas e minutos) e conversão por etapa; para o gerente, Operação › Relatórios › Time › \"Tempo de 1ª resposta\" e Operação › Funil","linha_de_base":"Mediana de 19,4 horas até o corretor assumir o lead novo e só 12,1% assumidos em até 5 minutos (stream de status do CRM, jul a set/2026); primeiro contato efetivo da casa em 65,8%, contra meta de 50% (CRM, set/2026)","meta_sugerida":"Primeiro contato em até 5 minutos (meta da casa; limite do sistema: 15 minutos úteis) e desfecho registrado em 100% dos primeiros contatos","fonte":"Stream de status do CRM (jul a set/2026) e Treinamento do CRM SMQ (set/2026)","gap_de_crm":false},"pratica":{"tipo":"Laboratório de aberturas com revisão do gerente (escrito, falado e em campo)","duracao_min":45,"persona":"P1 (casal que cansou do aluguel), P2 (entregador de aplicativo), P5 (lead saturado e desconfiado), P6 (cliente PRONTO) e P7 (investidor)","rubrica":"Padrão SMQ, critérios 1 (abertura e conexão), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"O corretor escreve e fala as aberturas; um colega faz o cliente nas aberturas faladas; o gerente lê, ouve e pontua com a rubrica.","roteiro":"O gerente entrega 8 cartões de origem. Para cada um, o corretor escreve a primeira mensagem de WhatsApp (até 4 linhas, no G.P.V.A.) e fala a primeira frase da ligação para o colega, que responde como o cartão manda. Nas 48 horas seguintes, o corretor completa 20 aberturas reais registradas no CRM, que o gerente revisa pela conversa do card e pelo desfecho.","roteiro_cliente":["Cartão 1: lead de formulário do [empreendimento], na Zona Leste, chegou há 1 minuto, resumo vazio (rota direta). Atende e diz: \"Vi o anúncio, queria saber o valor.\" (P1)","Cartão 2: handoff do robô com renda em torno de R$ 2.800 de aplicativo, primeiro imóvel, sem entrada e sem FGTS no dossiê. Não atende a ligação. (P2)","Cartão 3: lead de 3 dias atrás, que já recebeu várias ligações. Atende e diz: \"Já me ligaram umas vinte vezes. Isso é golpe?\" (P5)","Cartão 4: lead entregue pela pré-venda na etapa Qualificação Corretor, com interesse em visitar. Atende e pergunta: \"Posso ir aí sábado?\" (P6)","Cartão 5: lead que escreveu primeiro no WhatsApp: \"Me manda a tabela e a rentabilidade.\" (P7)","Cartão 6: lead reativado da base, que procurou apartamento na Zona Sul há 2 meses. Atende e fica em silêncio, esperando.","Cartão 7: indicação de uma cliente que comprou; a indicada paga aluguel e não conhece o produto. Não atende a ligação.","Cartão 8: casal que chegou ao estande sem agendamento e parou na frente da maquete."],"observador_procura":["Identificação completa (nome, Seu Metro Quadrado, especialista em Minha Casa Minha Vida) em todas as aberturas.","Prova de leitura do cadastro: nome certo, empreendimento, região, quem indicou ou o que o robô já sabe.","No máximo 4 linhas e uma pergunta por mensagem; pergunta de sim, de não ou de duas opções.","Nenhum catálogo, preço sem contexto ou urgência falsa no primeiro contato.","Âncoras antigolpe quando há desconfiança; nenhuma promessa de aprovação, de parcela ou de rentabilidade (critério 6 só com nota 5).","Desfecho com próximo passo e data registrado em todas as aberturas reais."]},"desafio_campo":{"tarefa":"10 primeiros contatos em 48 horas, todos com ligação primeiro, dentro do prazo (meta de 5 minutos; limite do sistema de 15 minutos úteis), abertura no G.P.V.A. e desfecho registrado.","prazo_horas":48,"evidencia_no_crm":"Os 10 leads com o tempo de 1ª resposta dentro do prazo, a primeira mensagem visível na conversa do card (até 4 linhas, uma pergunta) e o desfecho com próximo passo e data na linha do tempo do Dossiê; nenhum repasse por SLA no período.","como_o_gestor_confere":"Abre Operação › Relatórios › Time › \"Tempo de 1ª resposta\" do corretor, sorteia 5 dos 10 leads, lê a primeira mensagem na conversa do card e marca G, P, V e A em cada uma, e confere o desfecho no Dossiê. Os repasses por SLA ele confere em Distribuição › aba Histórico."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do CRM; os casos viram narração, sem nomear ninguém","cenario":"Mesa de trabalho com o CRM aberto e o celular na mão, e um trecho gravado no estande para a aula A4","blocos":[{"tempo":"0:00","fala":"Duas mensagens para o mesmo cliente. Uma diz: oi, tudo bem, temos várias opções. A outra chama pelo nome e cita o apartamento que ele viu. Só uma recebe resposta.","na_tela":"As duas mensagens lado a lado"},{"tempo":"0:20","fala":"Quando a abertura chama o cliente pelo nome, 59 de cada 100 respondem. Sem o nome, 35. E quando cita o empreendimento, quase o dobro das conversas chega até você.","na_tela":"59,3% contra 35,3%; 19,4% contra 11,0% (jul a set/2026)"},{"tempo":"0:50","fala":"A fórmula da casa tem quatro letras. Gancho específico, personalização, valor para quem responde e uma ação que se responde com sim ou com uma escolha. Quatro linhas, no máximo.","na_tela":"G.P.V.A. montado numa mensagem real, com cada letra destacada"},{"tempo":"1:40","fala":"Cada origem tem a sua primeira frase. Veio do robô? Você continua, não recomeça. Resumo vazio? Você é o primeiro contato. Indicação? Cita quem indicou.","na_tela":"Demonstração: o Dossiê com o resumo cheio e com o resumo vazio"},{"tempo":"2:40","fala":"E o cliente que pergunta se é golpe? Ele faz bem em perguntar. Seu nome, Seu Metro Quadrado, onde ele deixou o contato e as âncoras: a análise é gratuita e ninguém pede Pix, taxa ou senha.","na_tela":"As 4 âncoras antigolpe"},{"tempo":"3:30","fala":"No estande é igual: primeiro a pessoa, depois o apartamento. Nome, água, e por que vocês vieram. Decorado só depois de qualificar.","na_tela":"Trecho no estande: recepção do cliente"},{"tempo":"4:00","fala":"O erro mais comum? Mandar o book antes de qualquer conversa. Catálogo antes da conexão é panfleto, e panfleto vai para o lixo.","na_tela":"Mensagem com PDF riscada"},{"tempo":"4:30","fala":"Desafio: dez primeiros contatos em 48 horas, todos com ligação primeiro, G.P.V.A. e desfecho registrado. Quatro linhas. Uma pergunta. Um sim.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 4, 9.1, 9.2, 9.3, 9.10, 9.11, 9.12, 9.14, 9.16 e 9.17 do super prompt","Estudo da Academia v2.1, seções 2, 5.1, 5.2, 6 (fases A e B), 8 e 9","Conteúdo anterior do M13 no CRM (Notion, abr/2026): fórmula G.P.V.A., os 5 erros da abordagem e a abordagem no estande"],"origem":"SMQ","pendencias":["[CONFIRMAR] Se a passagem \"Primeiro contato efetivo\" aparece por corretor no Meu Raio-X ou só no funil da casa (Operação › Funil).","[GAP DE CRM] O tempo até o primeiro contato em minutos úteis (o limite de 15) só aparece na Gestão da Academia; o corretor vê a 1ª resposta em minutos corridos no Meu Raio-X.","[DADO A MEDIR NO CRM] Taxa de resposta e de avanço das primeiras mensagens escritas pelos corretores (os números de abertura deste módulo vêm das conversas do robô).","[CONFIRMAR] Qual origem registrar no CRM para o cliente que chega ao estande sem cadastro (aula M13-A4).","[CONFIRMAR] Horário, endereço e quem recebe em cada estande e escritório dos produtos em foco, para os convites e a recepção da aula M13-A4."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M13-A1', 'M13-A2', 'M13-A3', 'M13-A4', 'M13-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M13-Q01', 'M13-Q02', 'M13-Q03', 'M13-Q04', 'M13-Q05', 'M13-Q06', 'M13-Q07', 'M13-Q08', 'M13-Q09', 'M13-Q10', 'M13-Q11', 'M13-Q12', 'M13-Q13', 'M13-Q14', 'M13-Q15', 'M13-Q16', 'M13-Q17', 'M13-Q18', 'M13-Q19', 'M13-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M13-F01', 'M13-F02', 'M13-F03', 'M13-F04', 'M13-F05', 'M13-F06', 'M13-F07', 'M13-F08', 'M13-F09', 'M13-F10', 'M13-F11', 'M13-F12', 'M13-F13');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 13;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M13-A1', 1, 'A fórmula G.P.V.A.: quatro linhas que pedem um sim', 'texto',
  'Dois corretores escrevem para o mesmo cliente. O primeiro manda "Oi, tudo bem? Temos várias opções no Minha Casa Minha Vida". O segundo chama pelo nome, cita o empreendimento que o cliente viu e faz uma pergunta só. Adivinha quem recebe resposta.

### Por que importa

Com o nome do cliente na abertura, 59,3% responderam; sem o nome, 35,3%. Citando o empreendimento, 19,4% das conversas chegaram ao corretor, contra 11,0% da abertura genérica (conversas do robô, jul a set/2026). A primeira mensagem não vende apartamento: ela vende a segunda mensagem.

### O conceito

Pense na primeira mensagem como a campainha de uma casa. Se você toca e diz "é a entrega do seu pedido", a porta abre. Se você toca e diz "tenho várias ofertas", a porta fica fechada. O cliente abre para quem prova que sabe quem ele é e o que ele pediu.

### O método SMQ, passo a passo

1. G, gancho específico: o empreendimento, a região ou a rua que o cliente viu no anúncio. Nada de "nossas opções".
2. P, personalização: o nome do cliente, escrito certo. Se o cadastro trouxer e-mail, emoji ou caixa alta no lugar do nome, corrija antes de mandar.
3. V, valor para quem responde: o que ele ganha respondendo ("em 5 minutos eu te mostro se a parcela cabe na sua renda"). Valor não é promessa de aprovação.
4. A, ação com resposta binária: uma pergunta que se responde com sim, com não ou com uma escolha entre duas opções ("vai ser o seu primeiro imóvel?" ou "te ligo às 12h30 ou às 18h?").
5. No máximo 4 linhas, em texto, com identificação completa (seu nome, Seu Metro Quadrado, especialista em Minha Casa Minha Vida). Nada de catálogo antes da conexão.
6. Ligação primeiro, sempre (M26). O G.P.V.A. vale para a primeira frase da ligação e para o WhatsApp que sai em até 2 minutos quando o cliente não atende.

### Na vida real

**O caso:** A abertura de um lançamento na zona oeste, feita pelo diretor (jan/2026).

**O que foi dito:** "Bom dia, [nome]! Tudo bem? Vi que se interessou pelo nosso lançamento aqui na Rua [rua], isso mesmo?" Citar a rua provou que havia uma pessoa que leu o cadastro, e o "isso mesmo?" pediu só um sim.

**O que aconteceu:** A cliente respondeu com o sim, a qualificação seguiu em três toques curtos (tempo de busca, região e dinheiro) e a conversa virou venda. Nenhuma palavra sobre preço, planta ou lazer na primeira mensagem.

### Scripts prontos

#### WhatsApp · Até 2 minutos depois da ligação não atendida (lead de formulário)

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Acabei de te ligar sobre o [empreendimento], na [bairro], pra te mostrar quanto fica a parcela com a sua renda. Te ligo às 12h30 ou às 18h?

**Por que funciona:** G (empreendimento e bairro), P (o nome), V (a parcela com a renda dele) e A (duas opções de horário). Quatro linhas e uma pergunta.

#### WhatsApp · O lead escreveu primeiro (anúncio que abre conversa)

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Que bom que você chamou sobre o [empreendimento]! Pra eu te mostrar só o que cabe no seu bolso, me conta: vai ser o seu primeiro imóvel?

**Por que funciona:** Quem puxa conversa é o lead mais valioso (23,5% chegam ao corretor, contra 1,2% do formulário com mensagem ativa, jul a set/2026). A resposta vem na hora e já entra na primeira pergunta do método.

#### Ligação · Primeira frase quando o cliente atende

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Você deixou o seu contato no anúncio do [empreendimento], na [bairro], isso mesmo?

**Por que funciona:** Identificação, prova de leitura e um sim fácil. Depois do sim, vem a primeira pergunta do método "Eu conduzo" (M15).

### Erros que matam a venda

- **Abrir com "Oi, tudo bem? Sou corretor e gostaria de apresentar nossas opções"**  
  Quanto custa: Soa como mais um dos vinte que ligaram; a abertura genérica levou 11,0% das conversas ao corretor, contra 19,4% da que cita o empreendimento  
  Correção: Gancho específico: o empreendimento, a região ou a rua que o cliente viu
- **Chamar o cliente pelo nome errado do cadastro (e-mail, emoji, caixa alta)**  
  Quanto custa: Destrói a credibilidade no primeiro toque  
  Correção: Corrigir o nome ao assumir o lead e confirmar na ligação
- **Fazer três perguntas na mesma mensagem**  
  Quanto custa: O cliente responde a mais fácil, ou nenhuma  
  Correção: Uma pergunta por mensagem: sim, não ou duas opções

### No CRM

- **Tela:** Card da Fila Única e Dossiê do cliente
- **Ação:** Ler nome, origem e empreendimento antes de abrir; W para abrir o WhatsApp pelo card
- **Campo:** Nome do cliente (corrigido) e desfecho com próximo passo e data
- **Regra:** Toda abertura termina em desfecho registrado, mesmo que o cliente não responda

### Frase-âncora

> **Quatro linhas. Uma pergunta. Um sim.**

### Checagem rápida

1. O que significa cada letra do G.P.V.A.?  
   Resposta: Gancho específico, Personalização, Valor para quem responde e Ação com resposta binária.
2. Qual é o tamanho máximo da primeira mensagem?  
   Resposta: 4 linhas, em texto, com uma pergunta só.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Dois corretores escrevem para o mesmo cliente. O primeiro manda \"Oi, tudo bem? Temos várias opções no Minha Casa Minha Vida\". O segundo chama pelo nome, cita o empreendimento que o cliente viu e faz uma pergunta só. Adivinha quem recebe resposta.","por_que_importa":"Com o nome do cliente na abertura, 59,3% responderam; sem o nome, 35,3%. Citando o empreendimento, 19,4% das conversas chegaram ao corretor, contra 11,0% da abertura genérica (conversas do robô, jul a set/2026). A primeira mensagem não vende apartamento: ela vende a segunda mensagem.","conceito":"Pense na primeira mensagem como a campainha de uma casa. Se você toca e diz \"é a entrega do seu pedido\", a porta abre. Se você toca e diz \"tenho várias ofertas\", a porta fica fechada. O cliente abre para quem prova que sabe quem ele é e o que ele pediu.","metodo":["G, gancho específico: o empreendimento, a região ou a rua que o cliente viu no anúncio. Nada de \"nossas opções\".","P, personalização: o nome do cliente, escrito certo. Se o cadastro trouxer e-mail, emoji ou caixa alta no lugar do nome, corrija antes de mandar.","V, valor para quem responde: o que ele ganha respondendo (\"em 5 minutos eu te mostro se a parcela cabe na sua renda\"). Valor não é promessa de aprovação.","A, ação com resposta binária: uma pergunta que se responde com sim, com não ou com uma escolha entre duas opções (\"vai ser o seu primeiro imóvel?\" ou \"te ligo às 12h30 ou às 18h?\").","No máximo 4 linhas, em texto, com identificação completa (seu nome, Seu Metro Quadrado, especialista em Minha Casa Minha Vida). Nada de catálogo antes da conexão.","Ligação primeiro, sempre (M26). O G.P.V.A. vale para a primeira frase da ligação e para o WhatsApp que sai em até 2 minutos quando o cliente não atende."],"na_vida_real":{"caso":"A abertura de um lançamento na zona oeste, feita pelo diretor (jan/2026).","o_que_foi_dito":"\"Bom dia, [nome]! Tudo bem? Vi que se interessou pelo nosso lançamento aqui na Rua [rua], isso mesmo?\" Citar a rua provou que havia uma pessoa que leu o cadastro, e o \"isso mesmo?\" pediu só um sim.","resultado":"A cliente respondeu com o sim, a qualificação seguiu em três toques curtos (tempo de busca, região e dinheiro) e a conversa virou venda. Nenhuma palavra sobre preço, planta ou lazer na primeira mensagem.","fonte":"Casoteca SMQ, caso A (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Até 2 minutos depois da ligação não atendida (lead de formulário)","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Acabei de te ligar sobre o [empreendimento], na [bairro], pra te mostrar quanto fica a parcela com a sua renda. Te ligo às 12h30 ou às 18h?","por_que_funciona":"G (empreendimento e bairro), P (o nome), V (a parcela com a renda dele) e A (duas opções de horário). Quatro linhas e uma pergunta."},{"canal":"WhatsApp","situacao":"O lead escreveu primeiro (anúncio que abre conversa)","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Que bom que você chamou sobre o [empreendimento]! Pra eu te mostrar só o que cabe no seu bolso, me conta: vai ser o seu primeiro imóvel?","por_que_funciona":"Quem puxa conversa é o lead mais valioso (23,5% chegam ao corretor, contra 1,2% do formulário com mensagem ativa, jul a set/2026). A resposta vem na hora e já entra na primeira pergunta do método."},{"canal":"Ligação","situacao":"Primeira frase quando o cliente atende","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Você deixou o seu contato no anúncio do [empreendimento], na [bairro], isso mesmo?","por_que_funciona":"Identificação, prova de leitura e um sim fácil. Depois do sim, vem a primeira pergunta do método \"Eu conduzo\" (M15)."}],"erros_que_matam":[{"erro":"Abrir com \"Oi, tudo bem? Sou corretor e gostaria de apresentar nossas opções\"","custo":"Soa como mais um dos vinte que ligaram; a abertura genérica levou 11,0% das conversas ao corretor, contra 19,4% da que cita o empreendimento","correcao":"Gancho específico: o empreendimento, a região ou a rua que o cliente viu"},{"erro":"Chamar o cliente pelo nome errado do cadastro (e-mail, emoji, caixa alta)","custo":"Destrói a credibilidade no primeiro toque","correcao":"Corrigir o nome ao assumir o lead e confirmar na ligação"},{"erro":"Fazer três perguntas na mesma mensagem","custo":"O cliente responde a mais fácil, ou nenhuma","correcao":"Uma pergunta por mensagem: sim, não ou duas opções"}],"no_crm":{"tela":"Card da Fila Única e Dossiê do cliente","acao":"Ler nome, origem e empreendimento antes de abrir; W para abrir o WhatsApp pelo card","campo":"Nome do cliente (corrigido) e desfecho com próximo passo e data","regra":"Toda abertura termina em desfecho registrado, mesmo que o cliente não responda"},"frase_ancora":"Quatro linhas. Uma pergunta. Um sim.","checagem_rapida":[{"pergunta":"O que significa cada letra do G.P.V.A.?","resposta":"Gancho específico, Personalização, Valor para quem responde e Ação com resposta binária."},{"pergunta":"Qual é o tamanho máximo da primeira mensagem?","resposta":"4 linhas, em texto, com uma pergunta só."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M13-A2', 2, 'Uma abertura para cada origem', 'texto',
  'O aviso de "Novo lead recebido!" é igual para todo mundo. O cliente, não. Um já conversou com o robô, outro acabou de clicar no anúncio, outro foi indicado pela irmã. Abrir todos do mesmo jeito é tratar o conhecido como estranho e o estranho como conhecido.

### Por que importa

A origem muda tudo. Na safra de 6 meses, indicação e carteira própria precisaram de 3 leads por venda; lead captado pelo corretor, de 6; Facebook, de 413 (Treinamento do CRM, set/2026). E quem repete ao cliente as perguntas que o robô já fez joga fora a conversa que o robô abriu.

### O conceito

É como atender a porta de casa: o vizinho que você conhece, o entregador que você esperava e a visita que um amigo mandou. Você cumprimenta os três, mas não do mesmo jeito. Antes de abrir, olhe quem está tocando.

### O método SMQ, passo a passo

1. Abra o Dossiê e leia a origem, o resumo e a conversa em 30 segundos. Resumo vazio: você é o primeiro contato.
2. Conversado pelo robô (handoff): apresente-se como o consultor que vai cuidar do atendimento, confirme em uma frase o que o robô já sabe e complete o que quase sempre falta (entrada, FGTS, restrição no nome e momento de compra). O passo a passo está no M27.
3. Rota direta (lead cru, que caiu direto na sua roleta): identificação completa, prova de leitura do cadastro (empreendimento e região) e a primeira pergunta do método.
4. Pré-venda (etapa Qualificação Corretor): cite o que a pré-venda combinou com o cliente e siga dali, sem refazer a qualificação.
5. Reativação: três fatos (empreendimento, localização e condição de entrada da campanha) e uma pergunta de corte sobre o momento. Preço "a partir de" pode; parcela, não.
6. Indicação e lead próprio: cite na primeira linha quem indicou ou onde vocês se conheceram. A confiança de quem indicou abre a porta; a sua qualificação mantém a porta aberta.

### Na vida real

**O caso:** O handoff das 21h32 (2026, era do CRM).

**O que foi dito:** O robô passou o lead à noite. Um corretor da casa assumiu 2 minutos depois do handoff, fora do horário comercial, na faixa em que o cliente MCMV mais conversa (das 19h às 22h).

**O que aconteceu:** A venda fechou em 24 dias. Velocidade e continuidade no horário do cliente valem mais que qualquer script perfeito.

### Scripts prontos

#### WhatsApp · Continuidade depois do handoff do robô, quando o cliente não atende a ligação

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai cuidar do seu atendimento. Vi que você conversou com a gente sobre o [empreendimento] e que [resumo em uma linha]. Te ligo agora ou prefere às 19h?

**Por que funciona:** Mostra que leu a conversa e oferece duas opções. O cliente não precisa contar tudo de novo.

#### Ligação · Lead entregue pela pré-venda na etapa Qualificação Corretor, com interesse em visitar

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. A nossa equipe me contou que você quer conhecer o [empreendimento]. Eu cuido de você daqui pra frente. Pra te receber com tudo pronto: fica melhor sábado às 10h ou às 14h?

**Por que funciona:** Continua o que a pré-venda começou, assume a relação e já fecha com duas opções. O local, o endereço e quem recebe vão na mensagem de confirmação.

#### Ligação · Reativação da base (três fatos e corte)

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Você procurou apartamento na [região], e saiu um lançamento no seu perfil: [empreendimento], a partir de R$ [preço], com condição de entrada da campanha. Me diz uma coisa: é pra agora, pra daqui a 30 ou 60 dias, ou é plano pra mais pra frente?

**Por que funciona:** Ligação de reativação é triagem, não palestra: três fatos verdadeiros e uma pergunta que separa quem compra agora de quem vai para a régua.

#### WhatsApp · Indicação de uma cliente que comprou

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. A [quem indicou] me passou o seu contato e contou que você também quer sair do aluguel. Te ligo hoje às 19h ou amanhã às 12h30?

**Por que funciona:** O nome de quem indicou transfere a confiança, e as duas opções levam direto para a ligação.

### Erros que matam a venda

- **Perguntar de novo o que o robô já sabia**  
  Quanto custa: O cliente responde tudo outra vez e desiste  
  Correção: Ler o dossiê e confirmar em uma frase ("vi aqui que vocês ganham juntos em torno de R$ 4.500, continua assim?")
- **Mandar a abertura padrão por cima de uma conversa avançada**  
  Quanto custa: Lead qualificado tratado como novo, e a confiança vai embora  
  Correção: Ler a conversa antes de qualquer toque
- **Esperar o aviso no WhatsApp para agir**  
  Quanto custa: Leads da rota direta chegaram sem aviso ao corretor por 4 semanas seguidas (set/2026)  
  Correção: A fonte é a Fila Única, prioridade 2 ("chegaram agora")

### No CRM

- **Tela:** Dossiê (ficha do cliente)
- **Ação:** Ler origem, resumo do handoff e conversa antes da primeira frase
- **Campo:** Origem, resumo e observações do handoff
- **Regra:** Resumo vazio: você é o primeiro contato. Resumo cheio: você continua, não recomeça.

### Frase-âncora

> **Olhe quem está tocando antes de abrir a porta.**

### Checagem rápida

1. O resumo do handoff está vazio. O que isso quer dizer?  
   Resposta: Que você é o primeiro contato: o lead veio cru, pela rota direta.
2. Na reativação por ligação, o que pode e o que não pode ser dito sobre valores?  
   Resposta: Preço "a partir de" pode; parcela, não.
3. Quais são as quatro informações que quase sempre faltam no dossiê do robô?  
   Resposta: Entrada, FGTS, restrição no nome e momento de compra.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O aviso de \"Novo lead recebido!\" é igual para todo mundo. O cliente, não. Um já conversou com o robô, outro acabou de clicar no anúncio, outro foi indicado pela irmã. Abrir todos do mesmo jeito é tratar o conhecido como estranho e o estranho como conhecido.","por_que_importa":"A origem muda tudo. Na safra de 6 meses, indicação e carteira própria precisaram de 3 leads por venda; lead captado pelo corretor, de 6; Facebook, de 413 (Treinamento do CRM, set/2026). E quem repete ao cliente as perguntas que o robô já fez joga fora a conversa que o robô abriu.","conceito":"É como atender a porta de casa: o vizinho que você conhece, o entregador que você esperava e a visita que um amigo mandou. Você cumprimenta os três, mas não do mesmo jeito. Antes de abrir, olhe quem está tocando.","metodo":["Abra o Dossiê e leia a origem, o resumo e a conversa em 30 segundos. Resumo vazio: você é o primeiro contato.","Conversado pelo robô (handoff): apresente-se como o consultor que vai cuidar do atendimento, confirme em uma frase o que o robô já sabe e complete o que quase sempre falta (entrada, FGTS, restrição no nome e momento de compra). O passo a passo está no M27.","Rota direta (lead cru, que caiu direto na sua roleta): identificação completa, prova de leitura do cadastro (empreendimento e região) e a primeira pergunta do método.","Pré-venda (etapa Qualificação Corretor): cite o que a pré-venda combinou com o cliente e siga dali, sem refazer a qualificação.","Reativação: três fatos (empreendimento, localização e condição de entrada da campanha) e uma pergunta de corte sobre o momento. Preço \"a partir de\" pode; parcela, não.","Indicação e lead próprio: cite na primeira linha quem indicou ou onde vocês se conheceram. A confiança de quem indicou abre a porta; a sua qualificação mantém a porta aberta."],"na_vida_real":{"caso":"O handoff das 21h32 (2026, era do CRM).","o_que_foi_dito":"O robô passou o lead à noite. Um corretor da casa assumiu 2 minutos depois do handoff, fora do horário comercial, na faixa em que o cliente MCMV mais conversa (das 19h às 22h).","resultado":"A venda fechou em 24 dias. Velocidade e continuidade no horário do cliente valem mais que qualquer script perfeito.","fonte":"Casoteca SMQ, casos da era do CRM (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Continuidade depois do handoff do robô, quando o cliente não atende a ligação","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai cuidar do seu atendimento. Vi que você conversou com a gente sobre o [empreendimento] e que [resumo em uma linha]. Te ligo agora ou prefere às 19h?","por_que_funciona":"Mostra que leu a conversa e oferece duas opções. O cliente não precisa contar tudo de novo."},{"canal":"Ligação","situacao":"Lead entregue pela pré-venda na etapa Qualificação Corretor, com interesse em visitar","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. A nossa equipe me contou que você quer conhecer o [empreendimento]. Eu cuido de você daqui pra frente. Pra te receber com tudo pronto: fica melhor sábado às 10h ou às 14h?","por_que_funciona":"Continua o que a pré-venda começou, assume a relação e já fecha com duas opções. O local, o endereço e quem recebe vão na mensagem de confirmação."},{"canal":"Ligação","situacao":"Reativação da base (três fatos e corte)","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Você procurou apartamento na [região], e saiu um lançamento no seu perfil: [empreendimento], a partir de R$ [preço], com condição de entrada da campanha. Me diz uma coisa: é pra agora, pra daqui a 30 ou 60 dias, ou é plano pra mais pra frente?","por_que_funciona":"Ligação de reativação é triagem, não palestra: três fatos verdadeiros e uma pergunta que separa quem compra agora de quem vai para a régua."},{"canal":"WhatsApp","situacao":"Indicação de uma cliente que comprou","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. A [quem indicou] me passou o seu contato e contou que você também quer sair do aluguel. Te ligo hoje às 19h ou amanhã às 12h30?","por_que_funciona":"O nome de quem indicou transfere a confiança, e as duas opções levam direto para a ligação."}],"erros_que_matam":[{"erro":"Perguntar de novo o que o robô já sabia","custo":"O cliente responde tudo outra vez e desiste","correcao":"Ler o dossiê e confirmar em uma frase (\"vi aqui que vocês ganham juntos em torno de R$ 4.500, continua assim?\")"},{"erro":"Mandar a abertura padrão por cima de uma conversa avançada","custo":"Lead qualificado tratado como novo, e a confiança vai embora","correcao":"Ler a conversa antes de qualquer toque"},{"erro":"Esperar o aviso no WhatsApp para agir","custo":"Leads da rota direta chegaram sem aviso ao corretor por 4 semanas seguidas (set/2026)","correcao":"A fonte é a Fila Única, prioridade 2 (\"chegaram agora\")"}],"no_crm":{"tela":"Dossiê (ficha do cliente)","acao":"Ler origem, resumo do handoff e conversa antes da primeira frase","campo":"Origem, resumo e observações do handoff","regra":"Resumo vazio: você é o primeiro contato. Resumo cheio: você continua, não recomeça."},"frase_ancora":"Olhe quem está tocando antes de abrir a porta.","checagem_rapida":[{"pergunta":"O resumo do handoff está vazio. O que isso quer dizer?","resposta":"Que você é o primeiro contato: o lead veio cru, pela rota direta."},{"pergunta":"Na reativação por ligação, o que pode e o que não pode ser dito sobre valores?","resposta":"Preço \"a partir de\" pode; parcela, não."},{"pergunta":"Quais são as quatro informações que quase sempre faltam no dossiê do robô?","resposta":"Entrada, FGTS, restrição no nome e momento de compra."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M13-A3', 3, 'O lead saturado e o medo de golpe', 'texto',
  '"Já me ligaram umas vinte vezes. Isso é golpe?" Essa frase não é grosseria. É um cliente com medo que ainda não desligou. Você tem uns 20 segundos para provar que é de verdade.

### Por que importa

Em set/2026, um terceiro abordou um lead se passando pela SMQ e pela Caixa. O medo de golpe é o maior concorrente do corretor: quem se esconde atrás de disfarce confirma o medo; quem se identifica com verdade desfaz o medo.

### O conceito

Pense no porteiro do prédio que pede o seu documento. Você não se ofende: mostra o crachá e ele abre. Com o cliente desconfiado é igual. Identidade clara e as âncoras antigolpe são o seu crachá.

### O método SMQ, passo a passo

1. Acolha a desconfiança sem se defender: "Faz bem em desconfiar."
2. Identidade completa: seu nome, Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Nunca esconder que é corretor nem usar título que confunda.
3. Prova de leitura: onde e sobre qual empreendimento o cliente deixou o contato.
4. As 4 âncoras antigolpe: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar.
5. Uma pergunta de sim e, se ajudar, o convite para conhecer o escritório ou o estande pessoalmente.
6. Se o cliente pedir para não ser mais contatado, respeite na hora e registre. Insistir confirma o golpe.

### Na vida real

**O caso:** O golpe de set/2026 e o caso N (jan a fev/2026).

**O que foi dito:** Um terceiro abordou um lead se passando pela SMQ e pela Caixa; o robô desmentiu e o lead bloqueou o golpista. No caso N, o cliente chegou perguntando "os valores são reais?" depois de um anúncio genérico.

**O que aconteceu:** O lead do golpe seguiu interessado depois que a verdade chegou. No caso N a venda saiu em 23 dias, e a doutrina corrige a resposta dada à desconfiança: o preço "a partir de", o que muda pela renda e a análise gratuita, nunca "há casos de financiar 100%".

### Scripts prontos

#### Ligação · "Já me ligaram umas vinte vezes. Isso é golpe?"

> Faz bem em desconfiar, [nome]. Eu sou o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida, e você deixou o contato no anúncio do [empreendimento]. A análise é gratuita e ninguém daqui pede Pix, taxa ou senha. Posso te fazer uma pergunta rápida?

**Por que funciona:** Acolhe, prova quem é e de onde veio o contato, entrega as âncoras e pede só um sim.

#### WhatsApp · "Os valores do anúncio são reais?"

> São sim, [nome]: a partir de R$ [preço] pela tabela de hoje. O que muda de pessoa para pessoa é quanto fica de entrada e de parcela, e isso sai na análise, que é gratuita. Te ligo agora pra entender o seu caso?

**Por que funciona:** Responde à desconfiança com verdade e já puxa para a ligação (caso N).

#### WhatsApp · Antes de ligar de um número diferente do que o robô usou

> [nome], aqui é o [seu nome], da Seu Metro Quadrado. Vou te ligar em 2 minutos deste número: [seu número]. Pode atender?

**Por que funciona:** Regra de identidade: o cliente recebe o número exato de quem vai ligar e não confunde você com golpista.

#### WhatsApp · Lead irritado com o excesso de contato que voltou a responder

> Haha, apareci demais hoje, né, [nome]? Já que você voltou, deixa eu aproveitar: é pra morar ou pra investir?

**Por que funciona:** Desarma com leveza e volta à qualificação com uma pergunta de duas opções.

### Erros que matam a venda

- **Esconder que é corretor ou usar título como "gestora de atendimento"**  
  Quanto custa: Confirma o medo de golpe e quebra a confiança quando o cliente descobre  
  Correção: Nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida
- **Ligar de número pessoal sem avisar, depois de o robô dizer "só falamos por este número"**  
  Quanto custa: O cliente acha que é golpe  
  Correção: Mandar ao cliente o número exato de quem vai ligar
- **Responder "os valores são reais?" com "há casos de financiar 100%"**  
  Quanto custa: Promessa que a análise pode desmentir; perde a credibilidade que a pergunta pedia  
  Correção: "A partir de", o que muda pela renda e a análise gratuita

### No CRM

- **Tela:** Dossiê e Central de Mensagens
- **Ação:** Anotar nas observações que o cliente está desconfiado ou saturado; registrar o pedido de descadastro na hora
- **Campo:** Observações e desfecho (com o motivo, quando for descadastro)
- **Regra:** Pedido de descadastro é respeitado na hora e registrado. Nada de mensagem depois das 21h ou no domingo sem convite do cliente.

### Frase-âncora

> **Desconfiança se desfaz com verdade, não com disfarce.**

### Checagem rápida

1. Quais são as 4 âncoras antigolpe?  
   Resposta: A análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar.
2. O cliente pergunta se os valores do anúncio são reais. O que entra na resposta?  
   Resposta: O "a partir de" da tabela de hoje, o que muda pela renda (entrada e parcela) e a análise gratuita.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Já me ligaram umas vinte vezes. Isso é golpe?\" Essa frase não é grosseria. É um cliente com medo que ainda não desligou. Você tem uns 20 segundos para provar que é de verdade.","por_que_importa":"Em set/2026, um terceiro abordou um lead se passando pela SMQ e pela Caixa. O medo de golpe é o maior concorrente do corretor: quem se esconde atrás de disfarce confirma o medo; quem se identifica com verdade desfaz o medo.","conceito":"Pense no porteiro do prédio que pede o seu documento. Você não se ofende: mostra o crachá e ele abre. Com o cliente desconfiado é igual. Identidade clara e as âncoras antigolpe são o seu crachá.","metodo":["Acolha a desconfiança sem se defender: \"Faz bem em desconfiar.\"","Identidade completa: seu nome, Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Nunca esconder que é corretor nem usar título que confunda.","Prova de leitura: onde e sobre qual empreendimento o cliente deixou o contato.","As 4 âncoras antigolpe: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar.","Uma pergunta de sim e, se ajudar, o convite para conhecer o escritório ou o estande pessoalmente.","Se o cliente pedir para não ser mais contatado, respeite na hora e registre. Insistir confirma o golpe."],"na_vida_real":{"caso":"O golpe de set/2026 e o caso N (jan a fev/2026).","o_que_foi_dito":"Um terceiro abordou um lead se passando pela SMQ e pela Caixa; o robô desmentiu e o lead bloqueou o golpista. No caso N, o cliente chegou perguntando \"os valores são reais?\" depois de um anúncio genérico.","resultado":"O lead do golpe seguiu interessado depois que a verdade chegou. No caso N a venda saiu em 23 dias, e a doutrina corrige a resposta dada à desconfiança: o preço \"a partir de\", o que muda pela renda e a análise gratuita, nunca \"há casos de financiar 100%\".","fonte":"Casoteca SMQ, casos da era do CRM e caso N (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"\"Já me ligaram umas vinte vezes. Isso é golpe?\"","texto":"Faz bem em desconfiar, [nome]. Eu sou o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida, e você deixou o contato no anúncio do [empreendimento]. A análise é gratuita e ninguém daqui pede Pix, taxa ou senha. Posso te fazer uma pergunta rápida?","por_que_funciona":"Acolhe, prova quem é e de onde veio o contato, entrega as âncoras e pede só um sim."},{"canal":"WhatsApp","situacao":"\"Os valores do anúncio são reais?\"","texto":"São sim, [nome]: a partir de R$ [preço] pela tabela de hoje. O que muda de pessoa para pessoa é quanto fica de entrada e de parcela, e isso sai na análise, que é gratuita. Te ligo agora pra entender o seu caso?","por_que_funciona":"Responde à desconfiança com verdade e já puxa para a ligação (caso N)."},{"canal":"WhatsApp","situacao":"Antes de ligar de um número diferente do que o robô usou","texto":"[nome], aqui é o [seu nome], da Seu Metro Quadrado. Vou te ligar em 2 minutos deste número: [seu número]. Pode atender?","por_que_funciona":"Regra de identidade: o cliente recebe o número exato de quem vai ligar e não confunde você com golpista."},{"canal":"WhatsApp","situacao":"Lead irritado com o excesso de contato que voltou a responder","texto":"Haha, apareci demais hoje, né, [nome]? Já que você voltou, deixa eu aproveitar: é pra morar ou pra investir?","por_que_funciona":"Desarma com leveza e volta à qualificação com uma pergunta de duas opções."}],"erros_que_matam":[{"erro":"Esconder que é corretor ou usar título como \"gestora de atendimento\"","custo":"Confirma o medo de golpe e quebra a confiança quando o cliente descobre","correcao":"Nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida"},{"erro":"Ligar de número pessoal sem avisar, depois de o robô dizer \"só falamos por este número\"","custo":"O cliente acha que é golpe","correcao":"Mandar ao cliente o número exato de quem vai ligar"},{"erro":"Responder \"os valores são reais?\" com \"há casos de financiar 100%\"","custo":"Promessa que a análise pode desmentir; perde a credibilidade que a pergunta pedia","correcao":"\"A partir de\", o que muda pela renda e a análise gratuita"}],"no_crm":{"tela":"Dossiê e Central de Mensagens","acao":"Anotar nas observações que o cliente está desconfiado ou saturado; registrar o pedido de descadastro na hora","campo":"Observações e desfecho (com o motivo, quando for descadastro)","regra":"Pedido de descadastro é respeitado na hora e registrado. Nada de mensagem depois das 21h ou no domingo sem convite do cliente."},"frase_ancora":"Desconfiança se desfaz com verdade, não com disfarce.","checagem_rapida":[{"pergunta":"Quais são as 4 âncoras antigolpe?","resposta":"A análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar."},{"pergunta":"O cliente pergunta se os valores do anúncio são reais. O que entra na resposta?","resposta":"O \"a partir de\" da tabela de hoje, o que muda pela renda (entrada e parcela) e a análise gratuita."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M13-A4', 4, 'No estande: primeiro a pessoa, depois o apartamento', 'texto',
  'O casal entra no estande, para na frente da maquete e fica olhando. O corretor comum corre para o decorado. O corretor SMQ pergunta o nome, oferece água e descobre por que eles vieram.

### Por que importa

Quem mostra o decorado antes de qualificar apresenta a unidade errada, para o decisor errado, com a conta errada. Tanto faz se o cliente veio agendado (o comparecimento da casa é de 79,8%, CRM, set/2026) ou apareceu sem avisar: o primeiro minuto decide se a visita vira passeio ou próximo passo.

### O conceito

Pense no médico que examina antes de receitar. Mostrar o decorado antes de qualificar é receitar sem examinar: pode até acertar, mas é sorte.

### O método SMQ, passo a passo

1. Receba pelo nome. Agendado: você já sabe o nome e o caso pelo briefing do Modo Visita. Chegou sem avisar: apresente-se e pergunte o nome.
2. Conexão: ofereça água, um lugar para sentar e pergunte como foi a chegada.
3. Gancho: "Vocês já conhecem o [empreendimento] ou estão chegando agora?"
4. Qualifique antes de mostrar qualquer coisa: as perguntas do método que faltam (primeiro imóvel, simulação, parcela confortável, quem decide junto), com a âncora "pra eu mostrar só o que cabe no bolso de vocês".
5. Só então apresente, começando pelo que responde à motivação que o cliente contou. A visita completa, dos 7 passos ao pós-visita, está no M18.
6. Cliente sem cadastro entra no CRM no mesmo dia, com nome e telefone. Se o telefone já existe, o cliente já tem dono: fale com o gerente.

### Na vida real

**O caso:** Técnica e escritório no mesmo dia (corretor da equipe, Barra Funda e Perdizes).

**O que foi dito:** Depois de explicar o que a Caixa olha (FGTS, renda, entrada e idade) e de mostrar uma simulação que ficou melhor que o esperado, o corretor convidou: "Consegue dar uma passada no escritório hoje? Vou me organizar pra estar aqui e não sair."

**O que aconteceu:** O cliente foi ao escritório, a conversa virou venda e o cliente prometeu indicar. Receber sabendo o caso é o que faz o encontro render. A doutrina acrescenta: convite com duas opções de horário, local, endereço e quem recebe.

### Scripts prontos

#### Visita · Cliente agendado chegando ao estande

> Oi, [nome]! Que bom que vocês vieram. Eu sou o [seu nome], da Seu Metro Quadrado. Aceitam uma água? Me conta, como foi a chegada até aqui?

**Por que funciona:** Recebe pelo nome, cuida da pessoa e abre conversa antes de qualquer planta.

#### Visita · Cliente que chegou sem agendamento

> Seja bem-vindo! Eu sou o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Você já conhece o [empreendimento] ou está chegando agora?

**Por que funciona:** Identificação honesta e um gancho fácil de responder. O nome do cliente vem na resposta, e você usa o nome dali em diante.

#### Visita · Antes de levar ao decorado

> Antes de te mostrar o decorado, [nome], me conta uma coisa pra eu mostrar só o que cabe no bolso de vocês: vai ser o primeiro imóvel?

**Por que funciona:** Âncora antes da pergunta: o cliente entende por que você pergunta e responde sem sentir interrogatório.

### Erros que matam a venda

- **Levar direto ao decorado sem qualificar**  
  Quanto custa: Apresenta a unidade errada e descobre a trava só no fim  
  Correção: Qualificar antes de qualquer apresentação
- **Pressionar logo de início ("temos poucas unidades!")**  
  Quanto custa: Urgência falsa destrói a confiança de forma permanente  
  Correção: Urgência só verdadeira e verificável: data de lançamento, abertura de vendas, unidades na tabela
- **Deixar o cliente do estande fora do CRM**  
  Quanto custa: O cliente não existe para o sistema: sem próximo passo e sem dono  
  Correção: Cadastrar no mesmo dia, com nome e telefone, e registrar o desfecho

### No CRM

- **Tela:** Modo Visita e Gestão de Carteira › Novo lead
- **Ação:** Abrir o briefing antes de receber o agendado; cadastrar o cliente que chegou sem avisar
- **Campo:** Nome, telefone, origem [CONFIRMAR: qual origem registrar para o cliente que chega ao estande sem cadastro] e resultado da visita
- **Regra:** Todo cliente atendido no estande entra no CRM no mesmo dia. Telefone que já existe mantém o dono.

### Frase-âncora

> **No estande, primeiro a pessoa, depois o apartamento.**

### Checagem rápida

1. Qual é o passo imediatamente anterior a qualquer apresentação no estande?  
   Resposta: Qualificar o cliente.
2. O cliente que chegou sem avisar já tem o telefone cadastrado com outro corretor. O que você faz?  
   Resposta: Atende bem e fala com o gerente: telefone que já existe mantém o dono.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O casal entra no estande, para na frente da maquete e fica olhando. O corretor comum corre para o decorado. O corretor SMQ pergunta o nome, oferece água e descobre por que eles vieram.","por_que_importa":"Quem mostra o decorado antes de qualificar apresenta a unidade errada, para o decisor errado, com a conta errada. Tanto faz se o cliente veio agendado (o comparecimento da casa é de 79,8%, CRM, set/2026) ou apareceu sem avisar: o primeiro minuto decide se a visita vira passeio ou próximo passo.","conceito":"Pense no médico que examina antes de receitar. Mostrar o decorado antes de qualificar é receitar sem examinar: pode até acertar, mas é sorte.","metodo":["Receba pelo nome. Agendado: você já sabe o nome e o caso pelo briefing do Modo Visita. Chegou sem avisar: apresente-se e pergunte o nome.","Conexão: ofereça água, um lugar para sentar e pergunte como foi a chegada.","Gancho: \"Vocês já conhecem o [empreendimento] ou estão chegando agora?\"","Qualifique antes de mostrar qualquer coisa: as perguntas do método que faltam (primeiro imóvel, simulação, parcela confortável, quem decide junto), com a âncora \"pra eu mostrar só o que cabe no bolso de vocês\".","Só então apresente, começando pelo que responde à motivação que o cliente contou. A visita completa, dos 7 passos ao pós-visita, está no M18.","Cliente sem cadastro entra no CRM no mesmo dia, com nome e telefone. Se o telefone já existe, o cliente já tem dono: fale com o gerente."],"na_vida_real":{"caso":"Técnica e escritório no mesmo dia (corretor da equipe, Barra Funda e Perdizes).","o_que_foi_dito":"Depois de explicar o que a Caixa olha (FGTS, renda, entrada e idade) e de mostrar uma simulação que ficou melhor que o esperado, o corretor convidou: \"Consegue dar uma passada no escritório hoje? Vou me organizar pra estar aqui e não sair.\"","resultado":"O cliente foi ao escritório, a conversa virou venda e o cliente prometeu indicar. Receber sabendo o caso é o que faz o encontro render. A doutrina acrescenta: convite com duas opções de horário, local, endereço e quem recebe.","fonte":"Casoteca SMQ, caso B (seção 9.12)"},"scripts":[{"canal":"Visita","situacao":"Cliente agendado chegando ao estande","texto":"Oi, [nome]! Que bom que vocês vieram. Eu sou o [seu nome], da Seu Metro Quadrado. Aceitam uma água? Me conta, como foi a chegada até aqui?","por_que_funciona":"Recebe pelo nome, cuida da pessoa e abre conversa antes de qualquer planta."},{"canal":"Visita","situacao":"Cliente que chegou sem agendamento","texto":"Seja bem-vindo! Eu sou o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Você já conhece o [empreendimento] ou está chegando agora?","por_que_funciona":"Identificação honesta e um gancho fácil de responder. O nome do cliente vem na resposta, e você usa o nome dali em diante."},{"canal":"Visita","situacao":"Antes de levar ao decorado","texto":"Antes de te mostrar o decorado, [nome], me conta uma coisa pra eu mostrar só o que cabe no bolso de vocês: vai ser o primeiro imóvel?","por_que_funciona":"Âncora antes da pergunta: o cliente entende por que você pergunta e responde sem sentir interrogatório."}],"erros_que_matam":[{"erro":"Levar direto ao decorado sem qualificar","custo":"Apresenta a unidade errada e descobre a trava só no fim","correcao":"Qualificar antes de qualquer apresentação"},{"erro":"Pressionar logo de início (\"temos poucas unidades!\")","custo":"Urgência falsa destrói a confiança de forma permanente","correcao":"Urgência só verdadeira e verificável: data de lançamento, abertura de vendas, unidades na tabela"},{"erro":"Deixar o cliente do estande fora do CRM","custo":"O cliente não existe para o sistema: sem próximo passo e sem dono","correcao":"Cadastrar no mesmo dia, com nome e telefone, e registrar o desfecho"}],"no_crm":{"tela":"Modo Visita e Gestão de Carteira › Novo lead","acao":"Abrir o briefing antes de receber o agendado; cadastrar o cliente que chegou sem avisar","campo":"Nome, telefone, origem [CONFIRMAR: qual origem registrar para o cliente que chega ao estande sem cadastro] e resultado da visita","regra":"Todo cliente atendido no estande entra no CRM no mesmo dia. Telefone que já existe mantém o dono."},"frase_ancora":"No estande, primeiro a pessoa, depois o apartamento.","checagem_rapida":[{"pergunta":"Qual é o passo imediatamente anterior a qualquer apresentação no estande?","resposta":"Qualificar o cliente."},{"pergunta":"O cliente que chegou sem avisar já tem o telefone cadastrado com outro corretor. O que você faz?","resposta":"Atende bem e fala com o gerente: telefone que já existe mantém o dono."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M13-A5', 5, 'Os 5 erros da abordagem e o registro do primeiro contato', 'texto',
  'Um cliente preencheu o formulário às 22h. A primeira mensagem chegou 22 horas depois: um texto de lançamento com o book em PDF. Quem salvou a venda foi o próprio cliente, que pediu uma ligação no dia seguinte.

### Por que importa

Lead assumido em menos de 1 hora avança 12,1%; entre 24 e 72 horas, 0% (stream de status do CRM, jul a set/2026). Nem todo cliente vai pedir a ligação como o do caso N. A maioria some, e some por causa da primeira mensagem.

### O conceito

Primeira mensagem é aperto de mão. Mão mole, mão apressada ou mão que já chega com panfleto: o cliente lembra do aperto, não do panfleto.

### O método SMQ, passo a passo

1. Erro 1, abrir com "Oi, tudo bem?" sem gancho. Correção: seu nome, Seu Metro Quadrado, o empreendimento e uma pergunta de sim.
2. Erro 2, mandar catálogo antes da conexão (book, tabela, vídeo). Correção: depois da qualificação, uma peça por vez, com legenda ligada à dor do cliente. Investidor recebe o material na hora em que pede.
3. Erro 3, falar de produto e de preço antes de entender o perfil. Correção: se o cliente pedir o preço, o "a partir de" em uma frase, e a condução volta com a primeira pergunta do método.
4. Erro 4, pressionar de início ("temos poucas unidades!", "só hoje"). Correção: urgência só quando for verdade e verificável.
5. Erro 5, não registrar o primeiro contato. Correção: desfecho com próximo passo e data em todo card, mesmo que seja "não atendeu".
6. No fim de cada primeiro contato, confira três coisas: provei que li o cadastro? pedi só um sim? registrei o desfecho?

### Na vida real

**O caso:** Caso N, da análise gratuita à assinatura em 23 dias (jan a fev/2026).

**O que foi dito:** O lead chegou às 22h por formulário do Meta. A primeira mensagem saiu cerca de 22 horas depois: um texto de lançamento com o book em PDF, assinado com o nome da construtora.

**O que aconteceu:** O próprio cliente pediu a ligação no dia 2; depois de 14 minutos de conversa, os documentos chegaram em cerca de 2 horas e a venda saiu em 23 dias. A doutrina corrige o começo: primeiro contato em até 5 minutos, por ligação, com a identificação da Seu Metro Quadrado. Esse cliente perdoou o atraso; a maioria não perdoa.

### Scripts prontos

#### WhatsApp · O cliente pediu o preço na primeira mensagem

> Te passo sim, [nome]! O [empreendimento] parte de R$ [preço] pela tabela de hoje. O que decide é quanto fica de entrada e parcela pra você, e isso muda com a renda. Vai ser o seu primeiro imóvel?

**Por que funciona:** Não foge do preço, não entrega a condução e já entra no método com uma pergunta só.

#### WhatsApp · O cliente respondeu seco ("sim", "ok")

> Boa, [nome]! É pra morar ou pra investir?

**Por que funciona:** Pergunta fechada e curta: o cliente seco responde uma palavra, e a conversa anda.

#### Ligação · O cliente visualizou a mensagem e não respondeu

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Te mandei uma mensagem sobre o [empreendimento] e preferi te ligar pra ser mais rápido. Vai ser o seu primeiro imóvel?

**Por que funciona:** Empilhar mensagem não é follow-up. A voz resolve em um minuto o que o texto não resolveu.

### Erros que matam a venda

- **Empilhar mensagens quando o cliente visualiza e não responde**  
  Quanto custa: Parece disparo e empurra o cliente para o bloqueio  
  Correção: Ligar
- **Encerrar com "qualquer coisa me chama"**  
  Quanto custa: A iniciativa fica com o cliente, e ele não chama  
  Correção: Terminar com uma pergunta de sim ou com duas opções
- **Assinar a mensagem com o nome da construtora**  
  Quanto custa: O cliente não sabe com quem está falando nem de quem cobrar retorno  
  Correção: Seu nome + Seu Metro Quadrado

### No CRM

- **Tela:** Card da Fila Única
- **Ação:** D para registrar o desfecho de todo primeiro contato
- **Campo:** Desfecho, próximo passo e data
- **Regra:** Nada sai da fila sem desfecho. "Não atendeu" também é desfecho.

### Frase-âncora

> **Lead não se queima sozinho. Quem queima é a primeira mensagem.**

### Checagem rápida

1. Quais são os 5 erros da abordagem?  
   Resposta: "Oi, tudo bem?" sem gancho; catálogo antes da conexão; produto e preço antes do perfil; pressão com urgência falsa; não registrar o primeiro contato.
2. O cliente visualizou e não respondeu. Qual é o próximo passo?  
   Resposta: Ligar. Empilhar mensagem não é follow-up.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Um cliente preencheu o formulário às 22h. A primeira mensagem chegou 22 horas depois: um texto de lançamento com o book em PDF. Quem salvou a venda foi o próprio cliente, que pediu uma ligação no dia seguinte.","por_que_importa":"Lead assumido em menos de 1 hora avança 12,1%; entre 24 e 72 horas, 0% (stream de status do CRM, jul a set/2026). Nem todo cliente vai pedir a ligação como o do caso N. A maioria some, e some por causa da primeira mensagem.","conceito":"Primeira mensagem é aperto de mão. Mão mole, mão apressada ou mão que já chega com panfleto: o cliente lembra do aperto, não do panfleto.","metodo":["Erro 1, abrir com \"Oi, tudo bem?\" sem gancho. Correção: seu nome, Seu Metro Quadrado, o empreendimento e uma pergunta de sim.","Erro 2, mandar catálogo antes da conexão (book, tabela, vídeo). Correção: depois da qualificação, uma peça por vez, com legenda ligada à dor do cliente. Investidor recebe o material na hora em que pede.","Erro 3, falar de produto e de preço antes de entender o perfil. Correção: se o cliente pedir o preço, o \"a partir de\" em uma frase, e a condução volta com a primeira pergunta do método.","Erro 4, pressionar de início (\"temos poucas unidades!\", \"só hoje\"). Correção: urgência só quando for verdade e verificável.","Erro 5, não registrar o primeiro contato. Correção: desfecho com próximo passo e data em todo card, mesmo que seja \"não atendeu\".","No fim de cada primeiro contato, confira três coisas: provei que li o cadastro? pedi só um sim? registrei o desfecho?"],"na_vida_real":{"caso":"Caso N, da análise gratuita à assinatura em 23 dias (jan a fev/2026).","o_que_foi_dito":"O lead chegou às 22h por formulário do Meta. A primeira mensagem saiu cerca de 22 horas depois: um texto de lançamento com o book em PDF, assinado com o nome da construtora.","resultado":"O próprio cliente pediu a ligação no dia 2; depois de 14 minutos de conversa, os documentos chegaram em cerca de 2 horas e a venda saiu em 23 dias. A doutrina corrige o começo: primeiro contato em até 5 minutos, por ligação, com a identificação da Seu Metro Quadrado. Esse cliente perdoou o atraso; a maioria não perdoa.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente pediu o preço na primeira mensagem","texto":"Te passo sim, [nome]! O [empreendimento] parte de R$ [preço] pela tabela de hoje. O que decide é quanto fica de entrada e parcela pra você, e isso muda com a renda. Vai ser o seu primeiro imóvel?","por_que_funciona":"Não foge do preço, não entrega a condução e já entra no método com uma pergunta só."},{"canal":"WhatsApp","situacao":"O cliente respondeu seco (\"sim\", \"ok\")","texto":"Boa, [nome]! É pra morar ou pra investir?","por_que_funciona":"Pergunta fechada e curta: o cliente seco responde uma palavra, e a conversa anda."},{"canal":"Ligação","situacao":"O cliente visualizou a mensagem e não respondeu","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Te mandei uma mensagem sobre o [empreendimento] e preferi te ligar pra ser mais rápido. Vai ser o seu primeiro imóvel?","por_que_funciona":"Empilhar mensagem não é follow-up. A voz resolve em um minuto o que o texto não resolveu."}],"erros_que_matam":[{"erro":"Empilhar mensagens quando o cliente visualiza e não responde","custo":"Parece disparo e empurra o cliente para o bloqueio","correcao":"Ligar"},{"erro":"Encerrar com \"qualquer coisa me chama\"","custo":"A iniciativa fica com o cliente, e ele não chama","correcao":"Terminar com uma pergunta de sim ou com duas opções"},{"erro":"Assinar a mensagem com o nome da construtora","custo":"O cliente não sabe com quem está falando nem de quem cobrar retorno","correcao":"Seu nome + Seu Metro Quadrado"}],"no_crm":{"tela":"Card da Fila Única","acao":"D para registrar o desfecho de todo primeiro contato","campo":"Desfecho, próximo passo e data","regra":"Nada sai da fila sem desfecho. \"Não atendeu\" também é desfecho."},"frase_ancora":"Lead não se queima sozinho. Quem queima é a primeira mensagem.","checagem_rapida":[{"pergunta":"Quais são os 5 erros da abordagem?","resposta":"\"Oi, tudo bem?\" sem gancho; catálogo antes da conexão; produto e preço antes do perfil; pressão com urgência falsa; não registrar o primeiro contato."},{"pergunta":"O cliente visualizou e não respondeu. Qual é o próximo passo?","resposta":"Ligar. Empilhar mensagem não é follow-up."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q01', 1, 'situacional',
  'Chegou um lead de formulário do [empreendimento], na Zona Leste. Você ligou em 2 minutos e ele não atendeu. Qual mensagem de WhatsApp segue o G.P.V.A.?',
  '["\"Oi, tudo bem? Sou corretor e gostaria de apresentar nossas opções.\"","\"[nome], segue o book completo do [empreendimento] com a tabela. Qualquer coisa me chama!\"","\"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado, especialista em Minha Casa Minha Vida. Acabei de te ligar sobre o [empreendimento], na [bairro], pra te mostrar quanto fica a parcela com a sua renda. Te ligo às 12h30 ou às 18h?\"","\"[nome], temos poucas unidades! Me chama urgente pra garantir a sua.\""]'::jsonb,
  2,
  'A C tem gancho específico (empreendimento e bairro), personalização (o nome), valor para quem responde (a parcela com a renda dele) e ação binária (duas opções de horário). A A é genérica e sem prova de leitura: é a frase que nunca sai da boca do corretor SMQ. A B manda catálogo antes da conexão e termina em "qualquer coisa me chama", que entrega a iniciativa ao cliente. A D é pressão com urgência falsa, que destrói a confiança.',
  'M13-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q02', 2, 'situacional',
  'O lead atende a ligação e diz: "Nem lembro de ter me cadastrado." Qual é a melhor resposta?',
  '["\"Sem problema! Eu sou o [seu nome], da Seu Metro Quadrado, e você deixou o contato no anúncio do [empreendimento], na [bairro]. Você ainda está procurando apartamento?\"","\"Então desculpa o incômodo, vou tirar o seu número.\"","\"Deve ter sido engano. Mas já que estamos falando: quanto você ganha por mês?\"","\"Todo mundo que a gente liga se cadastrou. Posso te mandar a tabela?\""]'::jsonb,
  0,
  'A A dá a prova de leitura (o anúncio e o bairro), a identidade completa e pede só um sim. A B desiste sem ajudar o cliente a lembrar; descadastro é quando ele pede. A C pergunta renda sem âncora e sem contexto, o que soa como golpe. A D discute com o cliente e manda catálogo antes da conexão.',
  'M13-A1; Estudo, fase A, situação 9', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q03', 3, 'situacional',
  'Um lead que já recebeu várias ligações atende e diz: "Já me ligaram umas vinte vezes. Isso é golpe?" O que você responde?',
  '["\"Não é golpe, pode confiar. Qual é a sua renda?\"","\"Aqui é da central de atendimento da construtora, pode ficar tranquilo.\"","\"Se você acha que é golpe, eu desligo.\"","\"Faz bem em desconfiar, [nome]. Eu sou o [seu nome], da Seu Metro Quadrado, e você deixou o contato no anúncio do [empreendimento]. A análise é gratuita e ninguém daqui pede Pix, taxa ou senha. Posso te fazer uma pergunta rápida?\""]'::jsonb,
  3,
  'A D acolhe, se identifica com verdade, prova de onde veio o contato, entrega as âncoras antigolpe e pede só um sim. A A pede um dado sensível logo depois da palavra golpe, sem nenhuma prova. A B é disfarce: esconder quem você é confirma o medo. A C abandona o cliente sem desfazer o medo; se ele pedir para não ser mais contatado, aí sim você respeita e registra.',
  'M13-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q04', 4, 'situacional',
  'A primeira mensagem do lead no WhatsApp é: "Quanto custa?" Qual é a melhor resposta?',
  '["\"R$ 280 mil.\"","\"Te passo sim, [nome]! O [empreendimento] parte de R$ [preço] pela tabela de hoje. O que decide é quanto fica de entrada e parcela pra você, e isso muda com a renda. Vai ser o seu primeiro imóvel?\"","\"Te mando a tabela completa e o book, aí você vê com calma.\"","\"Preço eu só passo pessoalmente, no estande.\""]'::jsonb,
  1,
  'A B não foge do preço, explica por que o valor final depende do perfil e devolve a condução com a primeira pergunta do método. A A entrega um número seco e deixa o cliente comparando só preço. A C manda catálogo antes da conexão e termina a conversa. A D foge da pergunta e soa como enrolação.',
  'M13-A5; Estudo, fase A, situação 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q05', 5, 'situacional',
  'O handoff do robô chegou com o resumo: renda em torno de R$ 4.500, primeiro imóvel, [empreendimento]; entrada e FGTS em branco. O cliente atende. Qual é a sua primeira fala?',
  '["\"Oi, [nome]! Pra começar, vai ser o seu primeiro imóvel e qual é a renda de vocês?\"","\"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado; sou o consultor que vai cuidar do seu atendimento. Vi aqui que vocês ganham juntos em torno de R$ 4.500 e que vai ser o primeiro imóvel, continua assim?\"","\"Oi, [nome]! O robô já me passou tudo, então já vou te mandar a lista de documentos.\"","\"Oi, [nome]! Tudo bem? Pode falar agora?\""]'::jsonb,
  1,
  'A B se apresenta como o consultor responsável e confirma em uma frase o que o robô já sabe; a próxima pergunta é a que falta (entrada e FGTS). A A repete o que o cliente já respondeu e ainda faz duas perguntas juntas. A C pula a entrada, o FGTS, a restrição e o momento de compra, que quase sempre faltam no dossiê. A D usa o "pode falar?", que dá ao cliente a saída mais fácil.',
  'M13-A2; seção 9.11', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q06', 6, 'situacional',
  'Um casal chega ao estande sem agendamento e para na frente da maquete. Qual é o seu primeiro movimento?',
  '["Levar direto ao decorado, para eles se apaixonarem pelo produto.","Entregar o folder com a tabela e deixar os dois à vontade.","Perguntar logo se vão fechar hoje, porque a campanha acaba.","Apresentar-se, perguntar o nome, oferecer água e perguntar se já conhecem o [empreendimento] ou estão chegando agora, qualificando antes de mostrar qualquer coisa."]'::jsonb,
  3,
  'A D segue o roteiro presencial: pessoa, conexão, gancho e qualificação antes da apresentação. A A apresenta sem saber renda, decisor ou motivação, e descobre a trava só no fim. A B troca a conversa por papel e deixa o casal sem condução. A C é pressão de início, um dos 5 erros da abordagem, e só vale urgência verdadeira e verificável.',
  'M13-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q07', 7, 'situacional',
  'O lead foi reativado da base: procurou apartamento na Zona Sul há 2 meses. Ele atende a sua ligação. Qual abertura é a certa?',
  '["\"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Você procurou apartamento na Zona Sul, e saiu um lançamento no seu perfil: [empreendimento], a partir de R$ [preço], com condição de entrada da campanha. É pra agora, pra daqui a 30 ou 60 dias, ou é plano pra mais pra frente?\"","\"Oi, [nome], lembra de mim?\"","\"Oi, [nome]! A sua parcela nesse lançamento fica em R$ 1.150, fechado.\"","\"Oi, [nome]! Deixa eu te contar tudo sobre o lançamento: são três torres, lazer completo, um e dois dormitórios, varanda, academia...\""]'::jsonb,
  0,
  'A A é a ligação de reativação da casa: três fatos (empreendimento, localização e condição de entrada) e uma pergunta de corte sobre o momento. A B não dá motivo nenhum para o cliente continuar na linha. A C crava uma parcela, o que é proibido: parcela depende da análise. A D transforma triagem em palestra e não descobre se o cliente compra agora.',
  'M13-A2; Casoteca, caso I', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q08', 8, 'situacional',
  'Você liga e o lead diz: "Manda no WhatsApp." O que você faz?',
  '["Desliga e manda o book, a tabela e três vídeos do empreendimento.","Insiste em fazer as seis perguntas do método por telefone, porque ligação é regra.","\"Mando sim, [nome]! Pra não te mandar coisa que não serve, me responde só uma coisa: vai ser o seu primeiro imóvel?\" Depois, no WhatsApp, segue a conversa com uma pergunta por mensagem.","Diz que não trabalha por WhatsApp."]'::jsonb,
  2,
  'A C respeita o canal que o cliente escolheu, garante uma resposta útil na própria ligação e continua no WhatsApp sem catálogo. A A despeja mídia antes da qualificação. A B atropela o pedido do cliente e queima a relação. A D recusa o canal que o cliente MCMV mais usa.',
  'M13-A1; Estudo, fase A, situação 6', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q09', 9, 'aplicacao',
  'Reescreva esta abertura no G.P.V.A.: "Oi, tudo bem? Temos várias opções no Minha Casa Minha Vida. Quer conhecer?" Qual versão aplica a fórmula?',
  '["\"Oi, tudo bem? Temos muitas opções no Minha Casa Minha Vida, com condições imperdíveis! Quer conhecer?\"","\"Olá! Segue o nosso catálogo com 12 empreendimentos. Qual te interessou?\"","\"Oi, [nome]! Tudo bem? Pode falar?\"","\"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vi que você procurou o [empreendimento], perto do metrô [estação]. Em 5 minutos de conversa eu te mostro se a parcela cabe na sua renda. Te ligo às 12h30 ou às 18h?\""]'::jsonb,
  3,
  'A D tem as quatro letras: gancho (o empreendimento e o metrô), personalização (o nome), valor (a parcela na renda em 5 minutos) e ação binária (duas opções). A A só troca adjetivos e mantém a abertura genérica. A B manda catálogo antes da conexão. A C tem o nome, mas nenhum gancho nem valor, e o "pode falar?" dá ao cliente a saída mais fácil.',
  'M13-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q10', 10, 'aplicacao',
  'Lead cru da rota direta, com o resumo vazio. Qual é a sequência certa do primeiro contato?',
  '["Abrir a ficha e ver o resumo vazio, ligar e se identificar com prova de leitura, fazer a primeira pergunta do método e registrar o desfecho com próximo passo e data.","Mandar o book, esperar a resposta, ligar e registrar.","Ligar, oferecer a visita, perguntar a renda e mandar o book.","Esperar o aviso no WhatsApp, mandar mensagem e registrar só se o cliente responder."]'::jsonb,
  0,
  'A A lê antes, liga primeiro, prova que leu o cadastro, entra no método e registra. A B inverte tudo: catálogo antes da conexão e ligação por último. A C oferece visita antes de qualificar, com a conta errada. A D espera o aviso (leads da rota direta chegaram sem aviso por 4 semanas em set/2026) e deixa o "não respondeu" sem registro.',
  'M13-A2; M13-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q11', 11, 'aplicacao',
  'O nome do cliente chegou no cadastro como um e-mail com emoji. Você vai ligar agora. O que fazer com o nome?',
  '["Usar o que está no cadastro; o cliente entende.","Não usar nome nenhum, para não errar.","Confirmar o nome na ligação, corrigir no cadastro e usar o nome certo em todas as mensagens.","Pedir ao cliente que preencha o formulário de novo."]'::jsonb,
  2,
  'A C resolve na origem: nome corrigido vai certo para as suas mensagens e para as automáticas, e abertura com nome teve 59,3% de resposta contra 35,3% sem (jul a set/2026). A A destrói a credibilidade no primeiro toque. A B perde a personalização, a letra P do G.P.V.A. A D cria trabalho para o cliente e um motivo para ele desistir.',
  'M13-A1; seção 9.10', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q12', 12, 'aplicacao',
  'Nas conversas do robô, a abertura que citou o empreendimento levou 19,4% dos clientes até o corretor, contra 11,0% da genérica, com a mesma taxa de resposta (jul a set/2026). Você tem 10 leads da mesma campanha hoje. Como aplicar esse número?',
  '["Mandar a mesma mensagem genérica para os dez, porque a taxa de resposta é igual.","Abrir cada um citando o empreendimento e a região que o cliente viu, e acompanhar o seu próprio avanço no CRM.","Citar três empreendimentos em cada mensagem, para aumentar a chance.","Concluir que a abertura com o empreendimento dobra as vendas."]'::jsonb,
  1,
  'A B aplica o aprendizado e mede o próprio resultado. A A lê só a resposta e ignora o avanço, que é o que importa. A C tira o foco do que o cliente viu e vira catálogo. A D faz leitura errada do número: ele mede conversas que chegaram ao corretor, não vendas, e os públicos das duas aberturas eram diferentes.',
  'M13-A1; seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q13', 13, 'aplicacao',
  'A pré-venda entregou um lead na etapa Qualificação Corretor, com interesse em conhecer o [empreendimento] no sábado. Qual é o primeiro contato certo?',
  '["Ligar, apresentar-se como o consultor que vai cuidar do atendimento, confirmar o que a pré-venda combinou e oferecer duas opções de horário no sábado, com local, endereço e quem recebe na confirmação.","Refazer a qualificação inteira desde a primeira pergunta, para garantir.","Esperar a pré-venda confirmar a visita, porque ela confirma na véspera.","Mandar a tabela e perguntar quando ele pode vir."]'::jsonb,
  0,
  'A A continua de onde a pré-venda parou e fecha com duas opções. A B faz o cliente repetir o que já disse e desperdiça o trabalho da pré-venda. A C terceiriza o relacionamento: o lead já é seu, e sem agendamento criado não há o que confirmar. A D manda catálogo e faz a pergunta aberta "quando você pode?", que devolve "vou pensar".',
  'M13-A2; seção 9.10', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q14', 14, 'aplicacao',
  'Uma cliente que comprou indicou a irmã, que paga aluguel. Qual é a melhor primeira mensagem para a irmã?',
  '["\"Oi, [nome]! Vi que você quer comprar. Qual é a sua renda?\"","\"Oi, [nome]! A sua irmã comprou com a gente e disse que você também vai comprar. Posso te mandar a lista de documentos?\"","\"Oi, [nome]! Tenho um apartamento imperdível pra você, últimas unidades!\"","\"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. A [quem indicou] me passou o seu contato e contou que você também quer sair do aluguel. Te ligo hoje às 19h ou amanhã às 12h30?\""]'::jsonb,
  3,
  'A D cita quem indicou na primeira linha, o que transfere a confiança, e leva para a ligação com duas opções. Indicação é a origem mais curta até a venda: 3 leads por venda (safra de 6 meses, set/2026). A A pede renda sem identificação e sem âncora. A B presume a compra e pula a qualificação. A C usa urgência falsa, que queima exatamente a confiança que a indicação trouxe.',
  'M13-A2; seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q15', 15, 'conceito',
  'O que significa G.P.V.A.?',
  '["Ganhar, Prender, Vender e Agendar.","Gancho específico, Personalização, Valor para quem responde e Ação com resposta binária.","Gancho, Preço, Visita e Aprovação.","Grupo, Público, Volume e Alcance."]'::jsonb,
  1,
  'A B é a fórmula da casa para a primeira mensagem, em até 4 linhas. A A descreve um funil, não uma abertura. A C põe preço e aprovação no primeiro contato, dois erros: preço antes do perfil e promessa. A D são termos de mídia, não de conversa com cliente.',
  'M13-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q16', 16, 'conceito',
  'Por que a primeira mensagem não leva book, tabela nem vídeo?',
  '["Porque o cliente MCMV não tem internet boa.","Porque só a construtora pode mandar o book.","Porque mídia antes da conexão parece disparo e tira a condução; depois da qualificação, uma peça por vez, ligada à dor do cliente.","Porque mídia é proibida em qualquer fase do atendimento."]'::jsonb,
  2,
  'A C é a regra da casa: nada no primeiro contato; depois de qualificar, uma peça por vez, com legenda ligada ao que o cliente contou (o investidor recebe o material na hora em que pede). A A é suposição sem fonte. A B é falsa: o corretor usa os materiais de Documentação & Projetos. A D exagera: mídia tem hora certa, não é proibida.',
  'M13-A5; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q17', 17, 'conceito',
  'Qual é a regra de identidade da SMQ no primeiro contato?',
  '["Apresentar-se como da central da construtora, para passar mais confiança.","Seu nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida, e o cliente recebe o número exato de quem vai ligar.","Não dizer que é corretor, para o lead saturado não desligar.","Usar um título como \"gestora de atendimento\"."]'::jsonb,
  1,
  'A B é a regra: identidade completa e o número de quem liga, para o cliente nunca confundir o corretor com golpista. A A confunde o cliente sobre quem está falando. A C e a D são disfarce, proibido na casa: a saturação se resolve com personalização e valor.',
  'M13-A3; seção 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q18', 18, 'conceito',
  'Por que a abertura pede só um "sim" (ou uma escolha entre duas opções)?',
  '["Porque a primeira resposta é a mais difícil de conseguir: uma pergunta fácil abre a conversa, e a qualificação vem nos passos seguintes.","Porque no WhatsApp o cliente só pode responder sim ou não.","Porque, depois de dizer sim, o cliente fica obrigado a comprar.","Porque o robô não entende outras respostas."]'::jsonb,
  0,
  'A A é o princípio: tirar o esforço da primeira resposta. A B é falsa, o cliente escreve o que quiser. A C é manipulação, proibida na casa: o sim é só para abrir a conversa. A D confunde o corretor com o robô; a regra vale para mensagem humana.',
  'M13-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q19', 19, 'caca_ao_erro',
  'Esta foi uma primeira mensagem real, anonimizada, enviada 22 horas depois do cadastro: "Olá! Tudo bem? Segue o book do lançamento. São apartamentos de 1 e 2 dormitórios, lazer completo. Qualquer coisa me chama!" Qual é o problema principal?',
  '["Faltou dizer que são as últimas unidades.","Faltou mandar também a tabela de preços.","Faltou um emoji para deixar a mensagem mais leve.","Catálogo antes da conexão, sem o nome do cliente, sem prova de leitura, sem pergunta e terminando com \"qualquer coisa me chama\", além do atraso de 22 horas."]'::jsonb,
  3,
  'A D aponta os erros de verdade: atraso (a meta é de 5 minutos, por ligação), catálogo antes da conexão, nenhuma personalização e a iniciativa entregue ao cliente. A A acrescentaria urgência falsa. A B acrescentaria mais catálogo. A C troca o problema de fundo por um detalhe de forma.',
  'M13-A5; Casoteca, caso N', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M13-Q20', 20, 'caca_ao_erro',
  'Leia a abertura de uma ligação, anonimizada: "Oi, [nome], aqui é a [nome], gestora de atendimento. Pode falar? Então, o apartamento custa R$ 285 mil e a sua parcela vai ficar exatamente R$ 980, pode confiar." Quais são os erros?',
  '["Só o \"pode falar?\"; o resto está certo.","Nenhum: ela foi direta e deu o número que o cliente queria.","Título que esconde que é corretora, o \"pode falar?\", preço antes de saber a renda e parcela exata prometida.","O único erro foi não ter mandado o book antes da ligação."]'::jsonb,
  2,
  'A C lista os quatro erros: identidade escondida (o certo é nome, Seu Metro Quadrado e especialista em MCMV), a pergunta que convida a desligar, preço antes do perfil e promessa de parcela exata, que a análise pode desmentir ("simulação indica, análise formal aprova"). A A e a B ignoram erros graves de conformidade. A D acrescentaria catálogo antes da conexão.',
  'M13-A3; M13-A5; seção 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (13)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F01', 1, 'G.P.V.A.', 'Gancho específico, Personalização, Valor para quem responde e Ação com resposta binária. No máximo 4 linhas e uma pergunta.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F02', 2, 'Abertura com o nome do empreendimento', '19,4% das conversas chegaram ao corretor, contra 11,0% da abertura genérica (conversas do robô, jul a set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F03', 3, 'Abertura com o nome do cliente', '59,3% de resposta, contra 35,3% sem o nome (conversas do robô, jul a set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F04', 4, 'Identidade no primeiro contato', 'Seu nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida. Nunca disfarce.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F05', 5, 'As 4 âncoras antigolpe', 'A análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F06', 6, 'Resumo do handoff vazio', 'Você é o primeiro contato: o lead veio cru, pela rota direta.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F07', 7, 'Lead saturado', 'Resolve com personalização e valor, nunca com disfarce.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F08', 8, 'Primeira pergunta do método', '"Vai ser o seu primeiro imóvel?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F09', 9, 'Book no primeiro contato?', 'Não. Depois da qualificação, uma peça por vez, ligada à dor do cliente. Investidor recebe na hora em que pede.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F10', 10, 'No estande, antes de mostrar', 'Receber pelo nome, conectar, gancho e qualificar. Só depois o decorado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F11', 11, 'Reativação por ligação', 'Três fatos (empreendimento, localização e condição de entrada) e uma pergunta de corte. Preço "a partir de" pode; parcela, não.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F12', 12, 'Os 5 erros da abordagem', '"Oi, tudo bem?" sem gancho; catálogo antes da conexão; produto e preço antes do perfil; urgência falsa; não registrar.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M13-F13', 13, 'Visualizou e não respondeu', 'Ligue. Empilhar mensagem não é follow-up.', true
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1, leia com o corretor 5 primeiras mensagens reais dele na conversa do card e marque G, P, V e A em cada uma; reescrevam juntos a pior. Na reunião de segunda, mostre o tempo de 1ª resposta do time em horas e minutos e leia em voz alta, sem o nome de quem escreveu, a melhor abertura da semana.","sinais_de_dificuldade":["Primeiras mensagens com book, tabela ou vídeo antes de qualquer resposta do cliente.","A mesma mensagem genérica copiada em vários leads, sem o nome do cliente nem o empreendimento.","Primeiro contato só por WhatsApp, sem tentativa de ligação, ou sem desfecho registrado."],"perguntas_de_coaching":["Na sua última abertura, qual foi o gancho específico e qual foi a pergunta de sim?","O que o dossiê já dizia sobre esse cliente antes de você escrever?","Quando o cliente disse que achava que era golpe, o que você falou nos primeiros 20 segundos?"],"ritual_de_celebracao":"All Hands quinzenal: a \"Abertura da quinzena\", a melhor primeira mensagem do time lida sem o nome de quem escreveu, e destaque de velocidade para quem fez os 10 primeiros contatos do desafio dentro do prazo."},"pratica_gabarito":["Cartão 1: identificação completa e prova de leitura; o \"a partir de\" em uma frase se ele insistir no valor; a primeira pergunta do método (\"vai ser o seu primeiro imóvel?\"); desfecho registrado.","Cartão 2: WhatsApp de continuidade em até 2 minutos, com o resumo em uma linha e duas opções de horário; na ligação, a renda de aplicativo tratada como boa notícia e as perguntas que faltam (entrada, FGTS, restrição e momento de compra).","Cartão 3: acolher, identidade completa, prova de leitura, as âncoras antigolpe e uma pergunta de sim; se ele pedir para parar, respeitar e registrar.","Cartão 4: apresentar-se como o consultor que vai cuidar do atendimento e confirmar o sábado com duas opções de horário, local, endereço e quem recebe, sem refazer a qualificação.","Cartão 5: material na hora, porque o investidor pede; nenhuma promessa de rentabilidade ou valorização; uma pergunta sobre a finalidade, porque o Minha Casa Minha Vida é para moradia.","Cartão 6: três fatos (empreendimento, localização e condição de entrada) e a pergunta de corte sobre o momento; nenhuma parcela.","Cartão 7: quem indicou na primeira linha e duas opções de horário para a ligação; desfecho registrado.","Cartão 8: receber, perguntar o nome, oferecer água, o gancho (\"já conhecem o [empreendimento] ou estão chegando agora?\") e qualificar antes do decorado; cadastro no CRM no mesmo dia."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M13' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
