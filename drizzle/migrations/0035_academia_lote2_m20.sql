-- ===========================================================================
-- ACADEMIA SMQ · LOTE 2 (v1.0) · seed do módulo M20
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-2/academia-smq-lote-2.json.
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
  ('M20', 20, 3, 'Follow-up, régua de 13 toques e recuperação', 'Ao final, você toca cada cliente na hora que a régua pede, com valor novo em cada contato, respeita o prazo que o cliente deu e recupera quem esfriou, e isso aparece no CRM como 0 follow-up vencido no fim do dia, nenhum cliente parado há 7 dias ou mais sem próximo toque e a curva de resposta da régua subindo.',
   '["Eu sou capaz de dizer qual régua vale para cada cliente: a Cadência (lead novo), com Lead chegou, 1º follow-up, 2º follow-up e Encerramento, ou a régua de 13 toques da carteira.","Eu sou capaz de registrar o desfecho de cada toque (Sem resposta, Respondeu, Agendou visita ou Descartar) e deixar o próximo toque agendado pelo CRM.","Eu sou capaz de escrever um toque de até 4 linhas com um dos 8 tipos de valor, sem repetir o tipo do toque anterior.","Eu sou capaz de registrar o prazo que o cliente deu e cobrar o combinado na hora certa, citando o que ele prometeu.","Eu sou capaz de resgatar um cliente parado há 7 dias ou mais com valor novo e, quando for a hora, fazer a última tentativa com dignidade ou perder com o motivo verdadeiro."]'::jsonb, 1.5, '90 min', true,
   '**Laboratório de carteira (individual, com o gerente ao lado)** · 20 min

**Papéis:** O corretor revisa a carteira e escreve os toques; o gerente cronometra os 20 minutos e confere cada toque com a rubrica.

**Persona:** A carteira real do corretor, filtrada por "Parado há 7+ dias", mais 6 cartões de treino montados com as personas P1, P3, P8, P9, P13 e P15

**Roteiro:** Em 20 minutos, o corretor abre a Base de leads com o filtro "Parado há 7+ dias", separa os clientes do fundo do funil e os bons perdidos e escreve o toque de cada um: o tipo de valor, o canal (ligação nos toques 3, 7 e 11) e o texto em até 4 linhas. Depois resolve os 6 cartões de treino, escrevendo a próxima ação de cada um. No fim, registra o desfecho e o próximo passo de cada cliente real trabalhado.

**Roteiro do cliente:**

- Cartão 1 (P1, casal no aluguel): respondeu duas vezes, disse "preciso ver com a minha esposa" e está parado há 5 dias.
- Cartão 2 (P3, solteira perto do metrô): disse "vou pensar" há 12 dias; em 2 meses completa 3 anos de FGTS.
- Cartão 3 (P8, nome com pendência): está em análise há 9 dias úteis, sem retorno do correspondente, e perguntou "e aí?".
- Cartão 4 (P9, sumiu no documento): recebeu a lista há 3 dias, mandou o RG e parou de responder.
- Cartão 5 (P13, quer pronto): visitou há 2 dias, gostou, e disse "me chama semana que vem".
- Cartão 6 (P15, sócio de empresa): restrição do banco apareceu na análise; ele disse que vai resolver na agência "essa semana".

**O que o observador procura:**

- Começou pelo fundo do funil e pelos bons perdidos.
- Cada toque com um tipo de valor diferente do anterior e em até 4 linhas.
- Ligação nos toques 3, 7 e 11.
- Prazo do cliente respeitado e cobrado citando o combinado.
- Nenhuma promessa de aprovação, prazo ou parcela exata e nenhum "só passando pra saber" (critério 6 só com nota 5).
- Desfecho e próximo passo com data registrados para cada cliente real.

**Rubrica:** Padrão SMQ, critérios 3 (condução), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Desfecho: dia e hora ou documento; duas opções; nada de \"vou pensar\" aceito sem horário","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 2 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Os intervalos ensinados são os da configuração padrão da régua no CRM (set/2026); conferir em Follow-Up › Config da régua se a gestão alterou algum valor em produção antes de publicar. | [GAP DE CRM] A régua só tem intervalos para QUENTE, MORNO e FRIO: lead PRONTO ou sem temperatura segue o ritmo do MORNO. Proposta: intervalo próprio para PRONTO (ou tratar PRONTO como QUENTE). | [CONFIRMAR] Se a devolução automática por follow-up vencido há 3 dias está ligada em produção (a configuração existe e nasce desligada). | [CONFIRMAR] Se o motor de inatividade de 7 dias (lead parado volta para a roleta) está ativo; até lá, o módulo ensina os 7 dias como regra de disciplina. | [DADO A MEDIR NO CRM] Linha de base de clientes parados há 7 dias ou mais por corretor e de toques do corretor por cliente. | [CONFIRMAR] A aula piloto do M20 de origem externa não estava nos arquivos da Academia; o módulo foi escrito só com conteúdo SMQ. Quando o material chegar, entra como aula complementar marcada "externa, uso interno".', '{"formato":"canonico-8.2","lote":2,"versao_conteudo":"1.0","trilha":"T3","ordem":6,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"Cliente não some. Cliente esfria. E ele esfria quando você some primeiro.","duracao_min":90,"por_que_vale_dinheiro":{"texto":"Cliente não volta sozinho. Quem não respondeu em 24 horas e recebeu follow-up voltou em 22,3%; quem não recebeu, em 0,7%. E o jeito de tocar muda tudo: o toque que cobra o combinado do próprio cliente fez 37,1% avançarem em 7 dias, contra 4,7% do \"ficou alguma dúvida?\". É a mesma mensagem curta, com oito vezes mais avanço.","numero":"22,3% de retorno com follow-up contra 0,7% sem; 37,1% de avanço com a cobrança do combinado contra 4,7% do \"ficou alguma dúvida?\"","fonte":"Conversas do robô","periodo":"jul a set/2026"},"pre_requisitos":["M00","M25","M26","M15"],"indicador_crm":{"nome":"Follow-ups vencidos no fim do dia, clientes parados há 7 dias ou mais e curva de resposta da régua","onde_ler":"Follow-Up › Régua (já respondeu), com os toques de hoje e os vencidos; Follow-Up › Curva de resposta; Base de leads com o filtro \"Parado há 7+ dias\"; para o gerente, Follow-Up › Cobertura do time (fila do dia, vencidos e réguas esgotadas por corretor)","linha_de_base":"Resposta por toque de follow-up em 24 horas: 1º 20,0%, 2º 13,2%, 3º 15,6%, 4º 10,2% (conversas do robô, jun a set/2026). Clientes parados há 7 dias ou mais por corretor: [DADO A MEDIR NO CRM]","meta_sugerida":"0 follow-up vencido no fim do dia; 0 cliente parado há 7 dias ou mais sem próximo toque; nenhuma régua esgotada (13/13) sem decisão registrada","fonte":"Treinamento do CRM SMQ e configuração da régua no CRM, set/2026","gap_de_crm":false},"pratica":{"tipo":"Laboratório de carteira (individual, com o gerente ao lado)","duracao_min":20,"persona":"A carteira real do corretor, filtrada por \"Parado há 7+ dias\", mais 6 cartões de treino montados com as personas P1, P3, P8, P9, P13 e P15","rubrica":"Padrão SMQ, critérios 3 (condução), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"O corretor revisa a carteira e escreve os toques; o gerente cronometra os 20 minutos e confere cada toque com a rubrica.","roteiro":"Em 20 minutos, o corretor abre a Base de leads com o filtro \"Parado há 7+ dias\", separa os clientes do fundo do funil e os bons perdidos e escreve o toque de cada um: o tipo de valor, o canal (ligação nos toques 3, 7 e 11) e o texto em até 4 linhas. Depois resolve os 6 cartões de treino, escrevendo a próxima ação de cada um. No fim, registra o desfecho e o próximo passo de cada cliente real trabalhado.","roteiro_cliente":["Cartão 1 (P1, casal no aluguel): respondeu duas vezes, disse \"preciso ver com a minha esposa\" e está parado há 5 dias.","Cartão 2 (P3, solteira perto do metrô): disse \"vou pensar\" há 12 dias; em 2 meses completa 3 anos de FGTS.","Cartão 3 (P8, nome com pendência): está em análise há 9 dias úteis, sem retorno do correspondente, e perguntou \"e aí?\".","Cartão 4 (P9, sumiu no documento): recebeu a lista há 3 dias, mandou o RG e parou de responder.","Cartão 5 (P13, quer pronto): visitou há 2 dias, gostou, e disse \"me chama semana que vem\".","Cartão 6 (P15, sócio de empresa): restrição do banco apareceu na análise; ele disse que vai resolver na agência \"essa semana\"."],"observador_procura":["Começou pelo fundo do funil e pelos bons perdidos.","Cada toque com um tipo de valor diferente do anterior e em até 4 linhas.","Ligação nos toques 3, 7 e 11.","Prazo do cliente respeitado e cobrado citando o combinado.","Nenhuma promessa de aprovação, prazo ou parcela exata e nenhum \"só passando pra saber\" (critério 6 só com nota 5).","Desfecho e próximo passo com data registrados para cada cliente real."]},"desafio_campo":{"tarefa":"Em 48 horas, faça 15 toques da régua do dia (Follow-Up › Régua (já respondeu)) com desfecho registrado em todos, sendo pelo menos um toque de cada fase da mensagem (abertura, consultiva e encerramento) em até 4 linhas, e feche os dois dias com 0 follow-up vencido.","prazo_horas":48,"evidencia_no_crm":"15 toques com desfecho registrado no Follow-Up; próximos toques agendados pela régua; 0 follow-up vencido no fim de cada dia; mensagens enviadas no histórico do cliente.","como_o_gestor_confere":"Abre Follow-Up › Cobertura do time e confere, para o corretor, a fila do dia e os vencidos às 19h dos dois dias; depois abre 3 clientes tocados, lê as mensagens no histórico e confere o tipo de valor, o tamanho e o desfecho registrado."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do Follow-Up aberta; o caso C entra como narração do diretor","cenario":"Escritório da SMQ, com o CRM aberto no Follow-Up e no celular","blocos":[{"tempo":"0:00","fala":"Cliente não some. Cliente esfria. E ele esfria quando você some primeiro.","na_tela":"Um card parado há 79 dias na Fila Única"},{"tempo":"0:15","fala":"Quem não respondeu em 24 horas e recebeu follow-up voltou em 22 de cada 100. Sem follow-up, menos de 1.","na_tela":"22,3% contra 0,7%, jul a set/2026"},{"tempo":"0:45","fala":"O Follow-Up tem duas janelas. A cadência cuida de quem ainda não conversou. A régua de 13 toques cuida de quem já respondeu. O 3, o 7 e o 11 são por ligação.","na_tela":"Follow-Up › Cadência (lead novo) e Régua (já respondeu)"},{"tempo":"1:30","fala":"Todo toque traz valor. São 8 tipos, e você nunca repete o mesmo em dois toques seguidos. O melhor deles é lembrar o que o próprio cliente combinou.","na_tela":"Os 8 tipos de valor e o toque \"Você tinha ficado de X, conseguiu?\""},{"tempo":"2:15","fala":"Olha como fica na prática: leio a conversa, escrevo em até 4 linhas, mando e registro o desfecho. O CRM já agenda o próximo toque.","na_tela":"Demonstração do toque e do diálogo de desfecho"},{"tempo":"3:00","fala":"O erro mais caro é o \"ficou alguma dúvida?\". Ele avança 4,7%. Cobrar o combinado avança 37,1%.","na_tela":"4,7% contra 37,1%"},{"tempo":"3:30","fala":"Uma cliente esperou dois meses por uma unidade e comprou. O que segurou foi a verdade no primeiro dia e um toque toda semana, mesmo sem novidade.","na_tela":"Caso C, narrado"},{"tempo":"4:15","fala":"Seu desafio: 15 toques da régua em 48 horas, com desfecho em todos, e os dois dias fechados com zero vencido.","na_tela":"Desafio de campo"},{"tempo":"4:45","fala":"Desfecho prometido e não cumprido é pendência, não silêncio.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 9.1, 9.6, 9.11, 9.12, 9.13, 9.14 e 9.16 do super prompt","Estudo da Academia v2.1: seções 2, 5.5, 6 (fases B, K e M), 7 (casos C e L), 8, 9, 10 e 12","Configuração da régua no CRM: gestao_config regua_followup e src/lib/regua-followup.ts (set/2026)","Cadência em 4 etapas do CRM (migration de 01/10/2026 e src/features/cadencia/templates.ts)","Conteúdo anterior do M20 na Academia (abr/2026): 8 tipos de follow-up, cadência por temperatura, última tentativa com dignidade e reativação de base fria"],"origem":"SMQ","pendencias":["[CONFIRMAR] Os intervalos ensinados são os da configuração padrão da régua no CRM (set/2026); conferir em Follow-Up › Config da régua se a gestão alterou algum valor em produção antes de publicar.","[GAP DE CRM] A régua só tem intervalos para QUENTE, MORNO e FRIO: lead PRONTO ou sem temperatura segue o ritmo do MORNO. Proposta: intervalo próprio para PRONTO (ou tratar PRONTO como QUENTE).","[CONFIRMAR] Se a devolução automática por follow-up vencido há 3 dias está ligada em produção (a configuração existe e nasce desligada).","[CONFIRMAR] Se o motor de inatividade de 7 dias (lead parado volta para a roleta) está ativo; até lá, o módulo ensina os 7 dias como regra de disciplina.","[DADO A MEDIR NO CRM] Linha de base de clientes parados há 7 dias ou mais por corretor e de toques do corretor por cliente.","[CONFIRMAR] A aula piloto do M20 de origem externa não estava nos arquivos da Academia; o módulo foi escrito só com conteúdo SMQ. Quando o material chegar, entra como aula complementar marcada \"externa, uso interno\"."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M20-A1', 'M20-A2', 'M20-A3', 'M20-A4', 'M20-A5', 'M20-A6'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 6;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M20-Q01', 'M20-Q02', 'M20-Q03', 'M20-Q04', 'M20-Q05', 'M20-Q06', 'M20-Q07', 'M20-Q08', 'M20-Q09', 'M20-Q10', 'M20-Q11', 'M20-Q12', 'M20-Q13', 'M20-Q14', 'M20-Q15', 'M20-Q16', 'M20-Q17', 'M20-Q18', 'M20-Q19', 'M20-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M20-F01', 'M20-F02', 'M20-F03', 'M20-F04', 'M20-F05', 'M20-F06', 'M20-F07', 'M20-F08', 'M20-F09', 'M20-F10', 'M20-F11', 'M20-F12', 'M20-F13', 'M20-F14', 'M20-F15');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 15;

-- 3. Aulas (6)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M20-A1', 1, 'Cliente não some. Cliente esfria.', 'texto',
  'Em 11/09/2026, o CRM tinha 210 clientes QUENTES parados, todos em fase avançada: 118 em análise de crédito, 55 agendados e 27 com visita realizada. Os piores estavam entre 70 e 79 dias sem movimento. Ninguém sumiu. Eles esfriaram esperando um toque.

### Por que importa

Quem não respondeu em 24 horas e recebeu follow-up voltou em 22,3%; sem follow-up, 0,7% (conversas do robô, jul a set/2026). O cliente costuma responder lá pela 13ª tentativa, e desistir no toque 3 é jogar dinheiro fora. E o dinheiro está no fundo do funil: um cliente em análise parado vale mais que uma pilha de lead frio novo.

### O conceito

Pense numa planta na janela. Ela não morre no dia em que você esquece de regar: ela murcha devagar, e uma hora não volta mais. Follow-up é a rega com hora marcada. A régua do CRM diz quando regar; você decide com o quê.

### O método SMQ, passo a passo

1. Aceite a regra da casa: o cliente responde por volta da 13ª tentativa. Toque 3 sem resposta é o começo, não o fim.
2. Comece pelo fundo do funil: agendado, visita realizada e análise de crédito parados são a prioridade 1 da Fila Única, porque é onde o dinheiro está em risco.
3. Leia a conversa antes de tocar: o que o cliente disse, o que o robô combinou, o que ficou pendente.
4. Todo toque tem valor novo e cabe em até 4 linhas. Nada de "só passando pra saber" nem "sumiu?".
5. Registre o desfecho de todo toque, mesmo sem resposta: é ele que agenda o próximo.
6. Feche o dia com 0 follow-up vencido: cliente sem toque na hora certa é cliente esfriando.

### Na vida real

**O caso:** Diagnóstico do funil da casa (11/09/2026): 210 clientes QUENTES parados em fase avançada, os piores entre 70 e 79 dias sem movimento.

**O que foi dito:** Nenhuma mensagem. Esses clientes tinham conversado, visitado ou mandado documento, e ficaram sem próximo toque.

**O que aconteceu:** A casa colocou o fundo do funil parado como prioridade 1 da Fila Única e consertou a régua em 16/09/2026: antes, ela criava a tarefa e nunca fechava, e 96% das tarefas venciam sozinhas.

### Scripts prontos

#### WhatsApp · Cliente em análise parado há mais de uma semana, sem novidade do correspondente

> Oi, [nome]! Passei no correspondente hoje pra saber da sua análise. Ainda não tem retorno, e eu sigo em cima. Te dou notícia de novo até [dia], combinado?

**Por que funciona:** Presença sem promessa: o cliente sabe que alguém cuida da pasta dele, e a próxima data já fica marcada.

#### Ligação · Cliente agendado que não confirmou e está parado

> Oi, [nome], aqui é o [seu nome], da Seu Metro Quadrado. Tô te ligando pra deixar tudo pronto pra sua visita de [dia]. O [decisor] continua vindo com você?

**Por que funciona:** Retoma com um motivo concreto e útil para o cliente, e já confere o decisor, que é o que mais derruba a visita.

### Erros que matam a venda

- **Desistir no terceiro toque**  
  Quanto custa: O cliente costuma responder lá pela 13ª tentativa: parar no 3 é abandonar quem ia voltar  
  Correção: Seguir a régua até o 13º toque e só então decidir
- **Priorizar lead frio novo e deixar o fundo do funil parado**  
  Quanto custa: Clientes quentes em análise ficaram até 79 dias sem movimento (11/09/2026)  
  Correção: Fundo do funil parado primeiro, como manda a Fila Única
- **Mandar "sumiu?" ou "só passando pra saber"**  
  Quanto custa: Soa como cobrança vazia e fabrica o "depois"  
  Correção: Um dos 8 tipos de valor, em até 4 linhas

### No CRM

- **Tela:** Fila Única (prioridade 1: fundo do funil parado) e Follow-Up › Régua (já respondeu)
- **Ação:** Tocar o cliente na ordem da fila e registrar o desfecho do toque
- **Campo:** Desfecho do toque e próximo toque agendado
- **Regra:** Nada sai da fila sem desfecho

### Frase-âncora

> **Cliente não some. Cliente esfria. E ele esfria quando você some primeiro.**

### Checagem rápida

1. Com follow-up, quantos voltam depois de 24 horas sem resposta? E sem?  
   Resposta: 22,3% com follow-up contra 0,7% sem (conversas do robô, jul a set/2026).
2. Qual cliente parado vem primeiro na fila?  
   Resposta: O do fundo do funil: agendado, visita realizada e análise de crédito.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Em 11/09/2026, o CRM tinha 210 clientes QUENTES parados, todos em fase avançada: 118 em análise de crédito, 55 agendados e 27 com visita realizada. Os piores estavam entre 70 e 79 dias sem movimento. Ninguém sumiu. Eles esfriaram esperando um toque.","por_que_importa":"Quem não respondeu em 24 horas e recebeu follow-up voltou em 22,3%; sem follow-up, 0,7% (conversas do robô, jul a set/2026). O cliente costuma responder lá pela 13ª tentativa, e desistir no toque 3 é jogar dinheiro fora. E o dinheiro está no fundo do funil: um cliente em análise parado vale mais que uma pilha de lead frio novo.","conceito":"Pense numa planta na janela. Ela não morre no dia em que você esquece de regar: ela murcha devagar, e uma hora não volta mais. Follow-up é a rega com hora marcada. A régua do CRM diz quando regar; você decide com o quê.","metodo":["Aceite a regra da casa: o cliente responde por volta da 13ª tentativa. Toque 3 sem resposta é o começo, não o fim.","Comece pelo fundo do funil: agendado, visita realizada e análise de crédito parados são a prioridade 1 da Fila Única, porque é onde o dinheiro está em risco.","Leia a conversa antes de tocar: o que o cliente disse, o que o robô combinou, o que ficou pendente.","Todo toque tem valor novo e cabe em até 4 linhas. Nada de \"só passando pra saber\" nem \"sumiu?\".","Registre o desfecho de todo toque, mesmo sem resposta: é ele que agenda o próximo.","Feche o dia com 0 follow-up vencido: cliente sem toque na hora certa é cliente esfriando."],"na_vida_real":{"caso":"Diagnóstico do funil da casa (11/09/2026): 210 clientes QUENTES parados em fase avançada, os piores entre 70 e 79 dias sem movimento.","o_que_foi_dito":"Nenhuma mensagem. Esses clientes tinham conversado, visitado ou mandado documento, e ficaram sem próximo toque.","resultado":"A casa colocou o fundo do funil parado como prioridade 1 da Fila Única e consertou a régua em 16/09/2026: antes, ela criava a tarefa e nunca fechava, e 96% das tarefas venciam sozinhas.","fonte":"Diagnóstico do funil no CRM (11/09/2026) e Treinamento do CRM (set/2026), seção 9.1"},"scripts":[{"canal":"WhatsApp","situacao":"Cliente em análise parado há mais de uma semana, sem novidade do correspondente","texto":"Oi, [nome]! Passei no correspondente hoje pra saber da sua análise. Ainda não tem retorno, e eu sigo em cima. Te dou notícia de novo até [dia], combinado?","por_que_funciona":"Presença sem promessa: o cliente sabe que alguém cuida da pasta dele, e a próxima data já fica marcada."},{"canal":"Ligação","situacao":"Cliente agendado que não confirmou e está parado","texto":"Oi, [nome], aqui é o [seu nome], da Seu Metro Quadrado. Tô te ligando pra deixar tudo pronto pra sua visita de [dia]. O [decisor] continua vindo com você?","por_que_funciona":"Retoma com um motivo concreto e útil para o cliente, e já confere o decisor, que é o que mais derruba a visita."}],"erros_que_matam":[{"erro":"Desistir no terceiro toque","custo":"O cliente costuma responder lá pela 13ª tentativa: parar no 3 é abandonar quem ia voltar","correcao":"Seguir a régua até o 13º toque e só então decidir"},{"erro":"Priorizar lead frio novo e deixar o fundo do funil parado","custo":"Clientes quentes em análise ficaram até 79 dias sem movimento (11/09/2026)","correcao":"Fundo do funil parado primeiro, como manda a Fila Única"},{"erro":"Mandar \"sumiu?\" ou \"só passando pra saber\"","custo":"Soa como cobrança vazia e fabrica o \"depois\"","correcao":"Um dos 8 tipos de valor, em até 4 linhas"}],"no_crm":{"tela":"Fila Única (prioridade 1: fundo do funil parado) e Follow-Up › Régua (já respondeu)","acao":"Tocar o cliente na ordem da fila e registrar o desfecho do toque","campo":"Desfecho do toque e próximo toque agendado","regra":"Nada sai da fila sem desfecho"},"frase_ancora":"Cliente não some. Cliente esfria. E ele esfria quando você some primeiro.","checagem_rapida":[{"pergunta":"Com follow-up, quantos voltam depois de 24 horas sem resposta? E sem?","resposta":"22,3% com follow-up contra 0,7% sem (conversas do robô, jul a set/2026)."},{"pergunta":"Qual cliente parado vem primeiro na fila?","resposta":"O do fundo do funil: agendado, visita realizada e análise de crédito."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M20-A2', 2, 'As duas réguas: a cadência do lead novo e os 13 toques', 'texto',
  'Um corretor da casa mantém só 38% da carteira parada. Os demais ficam entre 92% e 100%. A diferença não é talento: é que ele deixa o próximo toque agendado a cada contato.

### Por que importa

Duas réguas convivem no Follow-Up, e confundir as duas é perder cliente nas duas pontas. A Cadência (lead novo) cuida de quem ainda não conversou; a régua de 13 toques cuida de quem já respondeu. Quem conhece o ritmo de cada uma não precisa lembrar de ninguém: o CRM lembra.

### O conceito

É como a agenda de vacinas de uma criança. Ninguém decide de cabeça quando é a próxima dose: a carteirinha diz. A régua é a carteirinha do cliente. Você aplica a dose e registra; o CRM marca a próxima.

### O método SMQ, passo a passo

1. Lead novo, ainda sem conversa, vai para Follow-Up › Cadência (lead novo): Lead chegou (abertura, 2 ligações e 1 WhatsApp), 1º follow-up (2 ligações e 1 WhatsApp), 2º follow-up (2 ligações e 1 WhatsApp) e Encerramento (a mensagem que avisa o cliente).
2. Cada etapa da cadência vence no fim do dia seguinte ao da anterior; a chegada vence no fim do próprio dia. Cadência cumprida são as 4 etapas em pelo menos 4 dias diferentes, 10 toques. Etapa vencida em Lead chegou, 1º ou 2º follow-up manda o lead para a roleta; cumprida sem retorno, ele vai para a reativação.
3. Cliente que já respondeu vai para Follow-Up › Régua (já respondeu): 13 toques, e o toque 1 sai na hora da entrada. Os toques 3, 7 e 11 são por ligação; os outros, por WhatsApp.
4. O intervalo entre toques muda pela temperatura. Quente: 1, 1, 2, 2, 3, 3, 4, 5, 5, 7, 7 e 10 dias (cerca de 50 dias no ciclo). Morno: 2, 2, 3, 3, 4, 5, 5, 7, 7, 10, 10 e 14 (cerca de 72). Frio: 3, 4, 5, 7, 7, 10, 10, 14, 14, 21, 21 e 30 (cerca de 146).
5. No fundo do funil (agendado, visita realizada e análise de crédito), o intervalo cai pela metade, com no mínimo 1 dia: o ritmo dobra onde o dinheiro está mais perto.
6. Só conta como toque o contato ativo feito por você: ligação, WhatsApp, visita, e-mail, reunião ou SMS. Nota e mudança de status não contam.
7. Depois de cada toque, registre o desfecho: Sem resposta (o CRM agenda o próximo toque), Respondeu (continue a conversa, nada é agendado), Agendou visita (abre o agendamento) ou Descartar (perdido, com o motivo verdadeiro).
8. Esgotou os 13 sem resposta: o cliente não é perdido sozinho. Ele fica sem próximo passo na Reserva da sua carteira, e a decisão é sua, na ficha: um novo passo com data ou perdido com motivo.

### Na vida real

**O caso:** A carteira viva: um corretor da casa com só 38% da carteira parada, enquanto os demais ficavam entre 92% e 100% (2026).

**O que foi dito:** A prática dele é simples: a cada toque, registra o desfecho e deixa o próximo agendado. Nenhum cliente sai do dia sem data.

**O que aconteceu:** É a prática dos dois zeros na vida real: a carteira dele não para porque o próximo toque já existe antes de ele fechar o card.

### Scripts prontos

#### WhatsApp · Lead novo não atendeu as duas ligações do dia (Lead chegou)

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Te liguei agora sobre o [empreendimento] que você viu. Fica melhor eu te ligar hoje às 19h ou amanhã às 12h?

**Por que funciona:** Identificação honesta, prova de que leu o cadastro e duas opções de horário: o cliente só precisa escolher.

#### WhatsApp · Encerramento da cadência (a última etapa, sem retorno até aqui)

> [nome], tentei falar com você nos últimos dias sobre o [empreendimento] e não quero te incomodar. Vou pausar por aqui. Se ainda fizer sentido, é só me responder que eu retomo de onde paramos.

**Por que funciona:** Avisa com respeito, deixa a porta aberta e não finge urgência. É a mensagem que o cliente lê antes de ir para a reativação.

### Erros que matam a venda

- **Contar anotação ou mudança de status como toque**  
  Quanto custa: O cliente não recebeu nada, e a régua acha que recebeu  
  Correção: Toque é contato ativo: ligação, WhatsApp, visita, e-mail, reunião ou SMS
- **Não registrar o desfecho do toque**  
  Quanto custa: O próximo toque não é agendado e o cliente para; handoff sem registro avança 1,8% contra 15,2% com registro (jul a set/2026)  
  Correção: Desfecho em todo toque, mesmo "Sem resposta"
- **Mandar WhatsApp nos toques 3, 7 e 11**  
  Quanto custa: Perde a voz justo nos toques em que o cliente precisa ouvir alguém  
  Correção: Toques 3, 7 e 11 por ligação

### No CRM

- **Tela:** Follow-Up › Cadência (lead novo) e Follow-Up › Régua (já respondeu)
- **Ação:** Fazer o toque do dia e registrar o desfecho no diálogo do toque
- **Campo:** Desfecho do toque (Sem resposta, Respondeu, Agendou visita, Descartar)
- **Regra:** Sem resposta agenda o próximo toque; no 13º, a decisão é humana

### Frase-âncora

> **O CRM lembra quando. Você decide com o quê.**

### Checagem rápida

1. Quais toques da régua são por ligação?  
   Resposta: O 3, o 7 e o 11.
2. O que acontece quando o cliente chega a 13 toques sem resposta?  
   Resposta: Não vira perdido sozinho: fica sem próximo passo na Reserva e você decide, na ficha, entre um novo passo com data e perdido com motivo.
3. Anotar "cliente não respondeu" na ficha conta como toque?  
   Resposta: Não. Só contato ativo conta.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Um corretor da casa mantém só 38% da carteira parada. Os demais ficam entre 92% e 100%. A diferença não é talento: é que ele deixa o próximo toque agendado a cada contato.","por_que_importa":"Duas réguas convivem no Follow-Up, e confundir as duas é perder cliente nas duas pontas. A Cadência (lead novo) cuida de quem ainda não conversou; a régua de 13 toques cuida de quem já respondeu. Quem conhece o ritmo de cada uma não precisa lembrar de ninguém: o CRM lembra.","conceito":"É como a agenda de vacinas de uma criança. Ninguém decide de cabeça quando é a próxima dose: a carteirinha diz. A régua é a carteirinha do cliente. Você aplica a dose e registra; o CRM marca a próxima.","metodo":["Lead novo, ainda sem conversa, vai para Follow-Up › Cadência (lead novo): Lead chegou (abertura, 2 ligações e 1 WhatsApp), 1º follow-up (2 ligações e 1 WhatsApp), 2º follow-up (2 ligações e 1 WhatsApp) e Encerramento (a mensagem que avisa o cliente).","Cada etapa da cadência vence no fim do dia seguinte ao da anterior; a chegada vence no fim do próprio dia. Cadência cumprida são as 4 etapas em pelo menos 4 dias diferentes, 10 toques. Etapa vencida em Lead chegou, 1º ou 2º follow-up manda o lead para a roleta; cumprida sem retorno, ele vai para a reativação.","Cliente que já respondeu vai para Follow-Up › Régua (já respondeu): 13 toques, e o toque 1 sai na hora da entrada. Os toques 3, 7 e 11 são por ligação; os outros, por WhatsApp.","O intervalo entre toques muda pela temperatura. Quente: 1, 1, 2, 2, 3, 3, 4, 5, 5, 7, 7 e 10 dias (cerca de 50 dias no ciclo). Morno: 2, 2, 3, 3, 4, 5, 5, 7, 7, 10, 10 e 14 (cerca de 72). Frio: 3, 4, 5, 7, 7, 10, 10, 14, 14, 21, 21 e 30 (cerca de 146).","No fundo do funil (agendado, visita realizada e análise de crédito), o intervalo cai pela metade, com no mínimo 1 dia: o ritmo dobra onde o dinheiro está mais perto.","Só conta como toque o contato ativo feito por você: ligação, WhatsApp, visita, e-mail, reunião ou SMS. Nota e mudança de status não contam.","Depois de cada toque, registre o desfecho: Sem resposta (o CRM agenda o próximo toque), Respondeu (continue a conversa, nada é agendado), Agendou visita (abre o agendamento) ou Descartar (perdido, com o motivo verdadeiro).","Esgotou os 13 sem resposta: o cliente não é perdido sozinho. Ele fica sem próximo passo na Reserva da sua carteira, e a decisão é sua, na ficha: um novo passo com data ou perdido com motivo."],"na_vida_real":{"caso":"A carteira viva: um corretor da casa com só 38% da carteira parada, enquanto os demais ficavam entre 92% e 100% (2026).","o_que_foi_dito":"A prática dele é simples: a cada toque, registra o desfecho e deixa o próximo agendado. Nenhum cliente sai do dia sem data.","resultado":"É a prática dos dois zeros na vida real: a carteira dele não para porque o próximo toque já existe antes de ele fechar o card.","fonte":"Casos da era do CRM (Estudo da Academia, seção 7)"},"scripts":[{"canal":"WhatsApp","situacao":"Lead novo não atendeu as duas ligações do dia (Lead chegou)","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Te liguei agora sobre o [empreendimento] que você viu. Fica melhor eu te ligar hoje às 19h ou amanhã às 12h?","por_que_funciona":"Identificação honesta, prova de que leu o cadastro e duas opções de horário: o cliente só precisa escolher."},{"canal":"WhatsApp","situacao":"Encerramento da cadência (a última etapa, sem retorno até aqui)","texto":"[nome], tentei falar com você nos últimos dias sobre o [empreendimento] e não quero te incomodar. Vou pausar por aqui. Se ainda fizer sentido, é só me responder que eu retomo de onde paramos.","por_que_funciona":"Avisa com respeito, deixa a porta aberta e não finge urgência. É a mensagem que o cliente lê antes de ir para a reativação."}],"erros_que_matam":[{"erro":"Contar anotação ou mudança de status como toque","custo":"O cliente não recebeu nada, e a régua acha que recebeu","correcao":"Toque é contato ativo: ligação, WhatsApp, visita, e-mail, reunião ou SMS"},{"erro":"Não registrar o desfecho do toque","custo":"O próximo toque não é agendado e o cliente para; handoff sem registro avança 1,8% contra 15,2% com registro (jul a set/2026)","correcao":"Desfecho em todo toque, mesmo \"Sem resposta\""},{"erro":"Mandar WhatsApp nos toques 3, 7 e 11","custo":"Perde a voz justo nos toques em que o cliente precisa ouvir alguém","correcao":"Toques 3, 7 e 11 por ligação"}],"no_crm":{"tela":"Follow-Up › Cadência (lead novo) e Follow-Up › Régua (já respondeu)","acao":"Fazer o toque do dia e registrar o desfecho no diálogo do toque","campo":"Desfecho do toque (Sem resposta, Respondeu, Agendou visita, Descartar)","regra":"Sem resposta agenda o próximo toque; no 13º, a decisão é humana"},"frase_ancora":"O CRM lembra quando. Você decide com o quê.","checagem_rapida":[{"pergunta":"Quais toques da régua são por ligação?","resposta":"O 3, o 7 e o 11."},{"pergunta":"O que acontece quando o cliente chega a 13 toques sem resposta?","resposta":"Não vira perdido sozinho: fica sem próximo passo na Reserva e você decide, na ficha, entre um novo passo com data e perdido com motivo."},{"pergunta":"Anotar \"cliente não respondeu\" na ficha conta como toque?","resposta":"Não. Só contato ativo conta."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M20-A3', 3, 'Todo toque traz valor', 'texto',
  'O follow-up automático genérico do robô foi testado até 09/07/2026. Nos toques 3 em diante, a resposta foi de 3%, 9% e 0%. Não é que o cliente não quis. É que ninguém deu a ele um motivo novo para responder.

### Por que importa

Toque tardio só rende com valor novo. Follow-up genérico ou fora de contexto é o segundo erro mais frequente da auditoria de conversas (18 casos em 156 erros, jul a set/2026). E o botão "Depois" respondido a um follow-up genérico virou handoff em só 2,4%: mensagem vazia fabrica "depois".

### O conceito

Ninguém atende a campainha para ouvir "sou eu de novo". Atende quando tem entrega. Cada toque precisa de uma entrega: uma novidade, uma conta, uma resposta, uma lembrança do que o cliente mesmo combinou.

### O método SMQ, passo a passo

1. Escolha um dos 8 tipos de valor: prova social, educativo, novidade real, custo do aluguel, pergunta de engajamento, atualização de mercado, resposta antecipada e cobrança do combinado.
2. Nunca repita o tipo em dois toques seguidos. Se o último foi educativo, o próximo é novidade, custo do aluguel ou pergunta de engajamento.
3. Escreva em até 4 linhas, com o nome do cliente e uma pergunta só.
4. Use as 3 fases da mensagem: abertura (quem é você e por que está chamando), consultiva (o valor) e encerramento (a pergunta que pede um passo).
5. Toque nos horários que rendem: de 9h às 13h e de 19h às 22h; segunda-feira é o dia de mais mensagens. Nada depois das 21h ou no domingo sem convite do cliente.
6. Prova social e escassez só se forem verdade no dia em que você disser. Nada de "última oportunidade" quando não é.

### Na vida real

**O caso:** Teste do follow-up automático genérico do robô (até 09/07/2026).

**O que foi dito:** Toques em sequência sem novidade, na linha de "oi, conseguiu ver?" e "ficou alguma dúvida?".

**O que aconteceu:** Os toques 3 em diante renderam 3%, 9% e 0% de resposta. A casa tirou a lição: toque tardio só rende com valor novo, e o "ficou alguma dúvida?" saiu das mensagens.

### Scripts prontos

#### WhatsApp · Custo do aluguel, para cliente que pagava aluguel e parou de responder

> Oi, [nome]! Fiz uma conta rápida: desde a nossa conversa, foram uns R$ [valor] de aluguel. Posso te mostrar quanto disso poderia estar virando parcela do seu apartamento?

**Por que funciona:** Traz a conta do próprio cliente, sem promessa de parcela exata, e pede um sim pequeno.

#### WhatsApp · Resposta antecipada, para cliente que ficou com uma dúvida no ar

> [nome], você tinha ficado com dúvida sobre o uso do FGTS na entrada. Te explico em 1 minuto por ligação hoje às 19h ou amanhã às 12h?

**Por que funciona:** Lembra a dúvida do cliente, promete pouco tempo e já oferece duas opções.

#### WhatsApp · Pergunta de engajamento, depois de semanas sem conversa

> Oi, [nome]! O que mudou pra você desde a nossa conversa? Pergunto porque saiu coisa nova na região que você queria.

**Por que funciona:** Abre espaço para o cliente contar a situação nova dele, e a novidade real dá o motivo do toque.

### Erros que matam a venda

- **Mandar "ficou alguma dúvida?"**  
  Quanto custa: 4,7% de avanço em 7 dias, contra 37,1% da cobrança do combinado (jul a set/2026)  
  Correção: Cobrar o combinado ou trazer novidade real
- **Mandar o book ou o catálogo como follow-up**  
  Quanto custa: Arquivo sem contexto não responde a nada do que o cliente precisa  
  Correção: Uma peça por vez, depois da qualificação, com legenda ligada à dor do cliente
- **Repetir a mesma oferta toque após toque**  
  Quanto custa: O cliente aprende a ignorar o seu nome na tela  
  Correção: Trocar o tipo de valor a cada toque

### No CRM

- **Tela:** Follow-Up › Régua (já respondeu) e Mensagens
- **Ação:** Ler a conversa, escolher o tipo de valor e enviar pelo botão do WhatsApp
- **Campo:** Desfecho do toque
- **Regra:** Nunca o mesmo tipo de valor em dois toques seguidos

### Frase-âncora

> **Toque sem valor é barulho. Toque com valor é motivo.**

### Checagem rápida

1. Cite 4 dos 8 tipos de follow-up com valor.  
   Resposta: Prova social, educativo, novidade real, custo do aluguel, pergunta de engajamento, atualização de mercado, resposta antecipada e cobrança do combinado.
2. Qual é o tamanho máximo de um toque por WhatsApp?  
   Resposta: Até 4 linhas, com uma pergunta só.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O follow-up automático genérico do robô foi testado até 09/07/2026. Nos toques 3 em diante, a resposta foi de 3%, 9% e 0%. Não é que o cliente não quis. É que ninguém deu a ele um motivo novo para responder.","por_que_importa":"Toque tardio só rende com valor novo. Follow-up genérico ou fora de contexto é o segundo erro mais frequente da auditoria de conversas (18 casos em 156 erros, jul a set/2026). E o botão \"Depois\" respondido a um follow-up genérico virou handoff em só 2,4%: mensagem vazia fabrica \"depois\".","conceito":"Ninguém atende a campainha para ouvir \"sou eu de novo\". Atende quando tem entrega. Cada toque precisa de uma entrega: uma novidade, uma conta, uma resposta, uma lembrança do que o cliente mesmo combinou.","metodo":["Escolha um dos 8 tipos de valor: prova social, educativo, novidade real, custo do aluguel, pergunta de engajamento, atualização de mercado, resposta antecipada e cobrança do combinado.","Nunca repita o tipo em dois toques seguidos. Se o último foi educativo, o próximo é novidade, custo do aluguel ou pergunta de engajamento.","Escreva em até 4 linhas, com o nome do cliente e uma pergunta só.","Use as 3 fases da mensagem: abertura (quem é você e por que está chamando), consultiva (o valor) e encerramento (a pergunta que pede um passo).","Toque nos horários que rendem: de 9h às 13h e de 19h às 22h; segunda-feira é o dia de mais mensagens. Nada depois das 21h ou no domingo sem convite do cliente.","Prova social e escassez só se forem verdade no dia em que você disser. Nada de \"última oportunidade\" quando não é."],"na_vida_real":{"caso":"Teste do follow-up automático genérico do robô (até 09/07/2026).","o_que_foi_dito":"Toques em sequência sem novidade, na linha de \"oi, conseguiu ver?\" e \"ficou alguma dúvida?\".","resultado":"Os toques 3 em diante renderam 3%, 9% e 0% de resposta. A casa tirou a lição: toque tardio só rende com valor novo, e o \"ficou alguma dúvida?\" saiu das mensagens.","fonte":"Teste do follow-up automático, até 09/07/2026 (seção 9.1)"},"scripts":[{"canal":"WhatsApp","situacao":"Custo do aluguel, para cliente que pagava aluguel e parou de responder","texto":"Oi, [nome]! Fiz uma conta rápida: desde a nossa conversa, foram uns R$ [valor] de aluguel. Posso te mostrar quanto disso poderia estar virando parcela do seu apartamento?","por_que_funciona":"Traz a conta do próprio cliente, sem promessa de parcela exata, e pede um sim pequeno."},{"canal":"WhatsApp","situacao":"Resposta antecipada, para cliente que ficou com uma dúvida no ar","texto":"[nome], você tinha ficado com dúvida sobre o uso do FGTS na entrada. Te explico em 1 minuto por ligação hoje às 19h ou amanhã às 12h?","por_que_funciona":"Lembra a dúvida do cliente, promete pouco tempo e já oferece duas opções."},{"canal":"WhatsApp","situacao":"Pergunta de engajamento, depois de semanas sem conversa","texto":"Oi, [nome]! O que mudou pra você desde a nossa conversa? Pergunto porque saiu coisa nova na região que você queria.","por_que_funciona":"Abre espaço para o cliente contar a situação nova dele, e a novidade real dá o motivo do toque."}],"erros_que_matam":[{"erro":"Mandar \"ficou alguma dúvida?\"","custo":"4,7% de avanço em 7 dias, contra 37,1% da cobrança do combinado (jul a set/2026)","correcao":"Cobrar o combinado ou trazer novidade real"},{"erro":"Mandar o book ou o catálogo como follow-up","custo":"Arquivo sem contexto não responde a nada do que o cliente precisa","correcao":"Uma peça por vez, depois da qualificação, com legenda ligada à dor do cliente"},{"erro":"Repetir a mesma oferta toque após toque","custo":"O cliente aprende a ignorar o seu nome na tela","correcao":"Trocar o tipo de valor a cada toque"}],"no_crm":{"tela":"Follow-Up › Régua (já respondeu) e Mensagens","acao":"Ler a conversa, escolher o tipo de valor e enviar pelo botão do WhatsApp","campo":"Desfecho do toque","regra":"Nunca o mesmo tipo de valor em dois toques seguidos"},"frase_ancora":"Toque sem valor é barulho. Toque com valor é motivo.","checagem_rapida":[{"pergunta":"Cite 4 dos 8 tipos de follow-up com valor.","resposta":"Prova social, educativo, novidade real, custo do aluguel, pergunta de engajamento, atualização de mercado, resposta antecipada e cobrança do combinado."},{"pergunta":"Qual é o tamanho máximo de um toque por WhatsApp?","resposta":"Até 4 linhas, com uma pergunta só."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M20-A4', 4, 'O prazo do cliente manda', 'texto',
  '"Oi, [nome]! Você tinha ficado de mandar os documentos, conseguiu?" Com essa mensagem, um cliente mandou 4 documentos em sequência. Não teve técnica escondida: teve memória.

### Por que importa

O follow-up que cobra o combinado do cliente teve 54,3% de resposta e 37,1% de avanço em 7 dias. O "ficou alguma dúvida?" teve 16,8% e 4,7% (conversas do robô, jul a set/2026). Oito vezes mais avanço, porque o cliente responde ao compromisso que ele mesmo fez.

### O conceito

É como um amigo que diz "te devolvo o livro semana que vem". Você não liga no dia seguinte cobrando: espera a semana e lembra do combinado. Cobrar antes irrita; nunca cobrar faz o livro sumir.

### O método SMQ, passo a passo

1. Quando o cliente der um prazo, registre: o prazo do cliente suspende a régua.
2. Traduza o prazo vago em hora: "final do dia" ou "mais tarde" vale hoje às 19h; "amanhã de manhã", 9h; "à tarde", 14h.
3. Prazo longo ("semana que vem") vale no máximo 3 dias. Se passar disso, proponha a data: "te chamo quinta às 19h?".
4. Na hora combinada, cobre citando o combinado: "Você tinha ficado de [X], conseguiu?".
5. Prometeu e não cumpriu? Desfecho prometido e não cumprido é pendência, não silêncio: registre a pendência com data e cobre com contexto.
6. Nunca feche com encerramento passivo ("sem pressa, estarei aqui"). Feche com data.

### Na vida real

**O caso:** Uma cliente disse que mandaria os documentos e parou de responder (conversas auditadas, jul a set/2026).

**O que foi dito:** "Oi, [nome]! Você tinha ficado de mandar os documentos, conseguiu? Se precisar de alguma coisa da minha parte, eu destravo rapidinho."

**O que aconteceu:** A cliente mandou 4 documentos em sequência. A mensagem virou modelo da biblioteca da casa.

### Scripts prontos

#### WhatsApp · O cliente disse "te respondo mais tarde"

> Combinado, [nome]! Te chamo hoje às 19h pra gente fechar isso, pode ser?

**Por que funciona:** Transforma o prazo vago em hora e registra o combinado, sem pressão.

#### WhatsApp · Hora combinada chegou e o cliente não mandou o que prometeu

> Oi, [nome]! Você tinha ficado de me mandar o extrato hoje, conseguiu? Se estiver corrido, me diz qual horário fica melhor amanhã.

**Por que funciona:** Cita o combinado, reconhece que a vida acontece e já oferece o próximo passo.

#### Ligação · O cliente disse "me chama semana que vem"

> Claro, [nome]. Pra eu não te chamar na hora errada: fica melhor quinta às 19h ou sexta às 12h?

**Por que funciona:** Respeita o adiamento e fecha uma data dentro de 3 dias, com duas opções.

### Erros que matam a venda

- **Cobrar antes do prazo que o cliente deu**  
  Quanto custa: Cobrança em cima irrita e queima a relação  
  Correção: O prazo do cliente suspende a régua
- **"Claro, sem pressa! Estarei aqui."**  
  Quanto custa: Encerramento passivo: nenhum retorno nas conversas auditadas  
  Correção: Registrar o prazo e propor data
- **Esquecer a promessa não cumprida**  
  Quanto custa: O combinado vira silêncio e o cliente esfria  
  Correção: Pendência com data e cobrança com contexto

### No CRM

- **Tela:** Ficha do cliente (próximo passo) e Agenda e Tarefas
- **Ação:** Registrar o prazo do cliente como próximo passo com data e hora
- **Campo:** Próximo passo e data
- **Regra:** Prazo vago: hoje às 19h; manhã: 9h; tarde: 14h; prazo longo: no máximo 3 dias

### Frase-âncora

> **Desfecho prometido e não cumprido é pendência, não silêncio.**

### Checagem rápida

1. O cliente disse "mando amanhã de manhã". Quando cobrar?  
   Resposta: Amanhã às 9h, citando o combinado.
2. Por que a cobrança do combinado funciona melhor?  
   Resposta: Porque o cliente responde ao compromisso que ele mesmo fez: 54,3% de resposta e 37,1% de avanço, contra 16,8% e 4,7% do "ficou alguma dúvida?".',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Oi, [nome]! Você tinha ficado de mandar os documentos, conseguiu?\" Com essa mensagem, um cliente mandou 4 documentos em sequência. Não teve técnica escondida: teve memória.","por_que_importa":"O follow-up que cobra o combinado do cliente teve 54,3% de resposta e 37,1% de avanço em 7 dias. O \"ficou alguma dúvida?\" teve 16,8% e 4,7% (conversas do robô, jul a set/2026). Oito vezes mais avanço, porque o cliente responde ao compromisso que ele mesmo fez.","conceito":"É como um amigo que diz \"te devolvo o livro semana que vem\". Você não liga no dia seguinte cobrando: espera a semana e lembra do combinado. Cobrar antes irrita; nunca cobrar faz o livro sumir.","metodo":["Quando o cliente der um prazo, registre: o prazo do cliente suspende a régua.","Traduza o prazo vago em hora: \"final do dia\" ou \"mais tarde\" vale hoje às 19h; \"amanhã de manhã\", 9h; \"à tarde\", 14h.","Prazo longo (\"semana que vem\") vale no máximo 3 dias. Se passar disso, proponha a data: \"te chamo quinta às 19h?\".","Na hora combinada, cobre citando o combinado: \"Você tinha ficado de [X], conseguiu?\".","Prometeu e não cumpriu? Desfecho prometido e não cumprido é pendência, não silêncio: registre a pendência com data e cobre com contexto.","Nunca feche com encerramento passivo (\"sem pressa, estarei aqui\"). Feche com data."],"na_vida_real":{"caso":"Uma cliente disse que mandaria os documentos e parou de responder (conversas auditadas, jul a set/2026).","o_que_foi_dito":"\"Oi, [nome]! Você tinha ficado de mandar os documentos, conseguiu? Se precisar de alguma coisa da minha parte, eu destravo rapidinho.\"","resultado":"A cliente mandou 4 documentos em sequência. A mensagem virou modelo da biblioteca da casa.","fonte":"Biblioteca de mensagens vencedoras (Estudo da Academia, seção 8)"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente disse \"te respondo mais tarde\"","texto":"Combinado, [nome]! Te chamo hoje às 19h pra gente fechar isso, pode ser?","por_que_funciona":"Transforma o prazo vago em hora e registra o combinado, sem pressão."},{"canal":"WhatsApp","situacao":"Hora combinada chegou e o cliente não mandou o que prometeu","texto":"Oi, [nome]! Você tinha ficado de me mandar o extrato hoje, conseguiu? Se estiver corrido, me diz qual horário fica melhor amanhã.","por_que_funciona":"Cita o combinado, reconhece que a vida acontece e já oferece o próximo passo."},{"canal":"Ligação","situacao":"O cliente disse \"me chama semana que vem\"","texto":"Claro, [nome]. Pra eu não te chamar na hora errada: fica melhor quinta às 19h ou sexta às 12h?","por_que_funciona":"Respeita o adiamento e fecha uma data dentro de 3 dias, com duas opções."}],"erros_que_matam":[{"erro":"Cobrar antes do prazo que o cliente deu","custo":"Cobrança em cima irrita e queima a relação","correcao":"O prazo do cliente suspende a régua"},{"erro":"\"Claro, sem pressa! Estarei aqui.\"","custo":"Encerramento passivo: nenhum retorno nas conversas auditadas","correcao":"Registrar o prazo e propor data"},{"erro":"Esquecer a promessa não cumprida","custo":"O combinado vira silêncio e o cliente esfria","correcao":"Pendência com data e cobrança com contexto"}],"no_crm":{"tela":"Ficha do cliente (próximo passo) e Agenda e Tarefas","acao":"Registrar o prazo do cliente como próximo passo com data e hora","campo":"Próximo passo e data","regra":"Prazo vago: hoje às 19h; manhã: 9h; tarde: 14h; prazo longo: no máximo 3 dias"},"frase_ancora":"Desfecho prometido e não cumprido é pendência, não silêncio.","checagem_rapida":[{"pergunta":"O cliente disse \"mando amanhã de manhã\". Quando cobrar?","resposta":"Amanhã às 9h, citando o combinado."},{"pergunta":"Por que a cobrança do combinado funciona melhor?","resposta":"Porque o cliente responde ao compromisso que ele mesmo fez: 54,3% de resposta e 37,1% de avanço, contra 16,8% e 4,7% do \"ficou alguma dúvida?\"."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M20-A5', 5, 'Recuperar quem esfriou', 'texto',
  'Em ago/2026, leads que já tinham desistido voltaram a conversar numa única mensagem: "a renda de motorista e de entregador de aplicativo passou a contar na análise". Novidade real é o melhor follow-up que existe.

### Por que importa

O follow-up automático não alcança lead parado há mais de 3 dias. Os "bons perdidos", quem respondeu duas vezes ou mais e está parado de 3 a 14 dias, só voltam por toque humano. E a base parada tem dinheiro quando a mira é boa: na reativação de set/2026, 6,9% responderam e 16,7% de quem respondeu virou handoff.

### O conceito

Recuperar cliente é como reacender uma fogueira: não adianta soprar a cinza fria. Você precisa de lenha nova. A lenha é a novidade real, a conta nova, a regra que mudou. Sem ela, é só fumaça.

### O método SMQ, passo a passo

1. Filtre a carteira: Base de leads com "Parado há 7+ dias". Comece pelos bons perdidos (duas ou mais respostas) e pelo fundo do funil.
2. Leia a conversa antes de chamar: o Marques reativa a base e o Souza faz follow-up automático. Não duplique mensagem e não contradiga o que o robô combinou.
3. Parado de 48 horas a 15 dias: toque humano com valor novo a cada vez, dentro da régua.
4. Parado há 30 dias ou mais: novidade real e específica (lançamento no perfil, regra nova, condição da campanha), nunca a abertura padrão por cima.
5. Reativação por ligação é triagem, não palestra: três fatos (empreendimento, localização e condição de entrada) e uma pergunta de corte.
6. Meça o que importa: resposta, avanço de quem respondeu e descadastro. Mensagem específica compra atenção, não compra intenção.
7. Recusa explícita encerra a régua: registre o motivo verdadeiro e não mande mais toque.

### Na vida real

**O caso:** A renda de aplicativo que reabriu a conversa (ago/2026): leads que tinham encerrado voltaram quando ouviram a novidade.

**O que foi dito:** "[nome], espera! É exatamente pra você: a Caixa passou a aceitar a renda de aplicativo como renda formal. Somando o que você ganha, quanto entra mais ou menos por mês?"

**O que aconteceu:** O cliente que tinha encerrado voltou na hora. Fechar com uma pergunta só ("qual aplicativo?") manteve o ritmo. Lição: novidade real é o melhor follow-up, e nunca se crava a data da regra.

### Scripts prontos

#### WhatsApp · Reativação com âncora concreta, para cliente parado há mais de 30 dias

> Oi, [nome]! Aqui é a Seu Metro Quadrado. Você procurou apartamento na [região] e saiu um lançamento no seu perfil: a [distância] do metrô [estação], a partir de R$ [preço] pelo Minha Casa Minha Vida. Quer que eu te mande as plantas e simule a sua parcela?

**Por que funciona:** Três fatos concretos e um sim pequeno: essa linha teve 21,9% de resposta, contra 5,8% da genérica (set/2026). Preço "a partir de" pode; parcela exata, não.

#### Ligação · Reativação por ligação (três fatos e corte)

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Você procurou apartamento na [região], e saiu um lançamento no seu perfil: [empreendimento], a partir de R$ [preço], com a condição de entrada da campanha. Me diz uma coisa: é pra agora, pra daqui a 30 ou 60 dias, ou é plano pra mais pra frente?

**Por que funciona:** Triagem objetiva definida pelo diretor (set/2026): o cliente se classifica sozinho, e você sabe se agenda agora ou registra a data.

#### WhatsApp · Cliente que mandou documento e parou de responder

> [nome], sua pasta está quase pronta pra seguir. Falta só o [documento]. Consegue me mandar até amanhã? Se preferir, te ligo às 19h e resolvo com você.

**Por que funciona:** Mostra o progresso, pede um item só e oferece a ligação, que desfaz o medo de golpe na voz.

### Erros que matam a venda

- **Deixar o bom perdido morrer (duas ou mais respostas, parado de 3 a 14 dias)**  
  Quanto custa: O robô não alcança lead parado há mais de 3 dias: ninguém mais toca  
  Correção: Resgate humano pela régua, com valor novo
- **Mandar a abertura padrão por cima de uma conversa avançada**  
  Quanto custa: Lead qualificado tratado como novo: o cliente percebe que ninguém leu  
  Correção: Ler a conversa antes de qualquer toque
- **Medir reativação só pela resposta**  
  Quanto custa: A mensagem específica teve 3,8 vezes a resposta, mas menos handoff por quem respondeu e 9 vezes mais descadastro por mil (set/2026)  
  Correção: Medir resposta, avanço e descadastro juntos

### No CRM

- **Tela:** Base de leads (filtro "Parado há 7+ dias"), Mensagens e Follow-Up › Régua (já respondeu)
- **Ação:** Ler o histórico, tocar com novidade real e registrar o desfecho
- **Campo:** Desfecho do toque; motivo de perda quando houver recusa explícita
- **Regra:** Recusa explícita encerra a régua e vira registro com motivo

### Frase-âncora

> **Atenção não é intenção. Meça quem avançou, não só quem respondeu.**

### Checagem rápida

1. Quem é o "bom perdido"?  
   Resposta: O cliente que respondeu duas vezes ou mais e está parado de 3 a 14 dias. Só volta por toque humano.
2. Quais são os três fatos da ligação de reativação?  
   Resposta: Empreendimento, localização e condição de entrada, seguidos de uma pergunta de corte sobre o momento.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Em ago/2026, leads que já tinham desistido voltaram a conversar numa única mensagem: \"a renda de motorista e de entregador de aplicativo passou a contar na análise\". Novidade real é o melhor follow-up que existe.","por_que_importa":"O follow-up automático não alcança lead parado há mais de 3 dias. Os \"bons perdidos\", quem respondeu duas vezes ou mais e está parado de 3 a 14 dias, só voltam por toque humano. E a base parada tem dinheiro quando a mira é boa: na reativação de set/2026, 6,9% responderam e 16,7% de quem respondeu virou handoff.","conceito":"Recuperar cliente é como reacender uma fogueira: não adianta soprar a cinza fria. Você precisa de lenha nova. A lenha é a novidade real, a conta nova, a regra que mudou. Sem ela, é só fumaça.","metodo":["Filtre a carteira: Base de leads com \"Parado há 7+ dias\". Comece pelos bons perdidos (duas ou mais respostas) e pelo fundo do funil.","Leia a conversa antes de chamar: o Marques reativa a base e o Souza faz follow-up automático. Não duplique mensagem e não contradiga o que o robô combinou.","Parado de 48 horas a 15 dias: toque humano com valor novo a cada vez, dentro da régua.","Parado há 30 dias ou mais: novidade real e específica (lançamento no perfil, regra nova, condição da campanha), nunca a abertura padrão por cima.","Reativação por ligação é triagem, não palestra: três fatos (empreendimento, localização e condição de entrada) e uma pergunta de corte.","Meça o que importa: resposta, avanço de quem respondeu e descadastro. Mensagem específica compra atenção, não compra intenção.","Recusa explícita encerra a régua: registre o motivo verdadeiro e não mande mais toque."],"na_vida_real":{"caso":"A renda de aplicativo que reabriu a conversa (ago/2026): leads que tinham encerrado voltaram quando ouviram a novidade.","o_que_foi_dito":"\"[nome], espera! É exatamente pra você: a Caixa passou a aceitar a renda de aplicativo como renda formal. Somando o que você ganha, quanto entra mais ou menos por mês?\"","resultado":"O cliente que tinha encerrado voltou na hora. Fechar com uma pergunta só (\"qual aplicativo?\") manteve o ritmo. Lição: novidade real é o melhor follow-up, e nunca se crava a data da regra.","fonte":"Caso L da Casoteca e biblioteca de mensagens (Estudo da Academia, seções 7 e 8)"},"scripts":[{"canal":"WhatsApp","situacao":"Reativação com âncora concreta, para cliente parado há mais de 30 dias","texto":"Oi, [nome]! Aqui é a Seu Metro Quadrado. Você procurou apartamento na [região] e saiu um lançamento no seu perfil: a [distância] do metrô [estação], a partir de R$ [preço] pelo Minha Casa Minha Vida. Quer que eu te mande as plantas e simule a sua parcela?","por_que_funciona":"Três fatos concretos e um sim pequeno: essa linha teve 21,9% de resposta, contra 5,8% da genérica (set/2026). Preço \"a partir de\" pode; parcela exata, não."},{"canal":"Ligação","situacao":"Reativação por ligação (três fatos e corte)","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Você procurou apartamento na [região], e saiu um lançamento no seu perfil: [empreendimento], a partir de R$ [preço], com a condição de entrada da campanha. Me diz uma coisa: é pra agora, pra daqui a 30 ou 60 dias, ou é plano pra mais pra frente?","por_que_funciona":"Triagem objetiva definida pelo diretor (set/2026): o cliente se classifica sozinho, e você sabe se agenda agora ou registra a data."},{"canal":"WhatsApp","situacao":"Cliente que mandou documento e parou de responder","texto":"[nome], sua pasta está quase pronta pra seguir. Falta só o [documento]. Consegue me mandar até amanhã? Se preferir, te ligo às 19h e resolvo com você.","por_que_funciona":"Mostra o progresso, pede um item só e oferece a ligação, que desfaz o medo de golpe na voz."}],"erros_que_matam":[{"erro":"Deixar o bom perdido morrer (duas ou mais respostas, parado de 3 a 14 dias)","custo":"O robô não alcança lead parado há mais de 3 dias: ninguém mais toca","correcao":"Resgate humano pela régua, com valor novo"},{"erro":"Mandar a abertura padrão por cima de uma conversa avançada","custo":"Lead qualificado tratado como novo: o cliente percebe que ninguém leu","correcao":"Ler a conversa antes de qualquer toque"},{"erro":"Medir reativação só pela resposta","custo":"A mensagem específica teve 3,8 vezes a resposta, mas menos handoff por quem respondeu e 9 vezes mais descadastro por mil (set/2026)","correcao":"Medir resposta, avanço e descadastro juntos"}],"no_crm":{"tela":"Base de leads (filtro \"Parado há 7+ dias\"), Mensagens e Follow-Up › Régua (já respondeu)","acao":"Ler o histórico, tocar com novidade real e registrar o desfecho","campo":"Desfecho do toque; motivo de perda quando houver recusa explícita","regra":"Recusa explícita encerra a régua e vira registro com motivo"},"frase_ancora":"Atenção não é intenção. Meça quem avançou, não só quem respondeu.","checagem_rapida":[{"pergunta":"Quem é o \"bom perdido\"?","resposta":"O cliente que respondeu duas vezes ou mais e está parado de 3 a 14 dias. Só volta por toque humano."},{"pergunta":"Quais são os três fatos da ligação de reativação?","resposta":"Empreendimento, localização e condição de entrada, seguidos de uma pergunta de corte sobre o momento."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M20-A6', 6, 'A espera longa e a última tentativa com dignidade', 'texto',
  'Uma cliente com crédito aprovado esperou dois meses por uma unidade que não estava disponível. Ela não desistiu, e comprou. O que segurou a venda foi a verdade dita no primeiro dia e um toque a cada semana, mesmo sem novidade.

### Por que importa

Quem descobre o problema depois se sente enganado; quem sabe antes espera. O silêncio é o que mata a espera longa. E nem todo cliente vai voltar: a última tentativa com dignidade preserva a relação e o seu nome, que é o que traz a indicação amanhã.

### O conceito

Espera longa é como fila de hospital: o paciente aguenta horas se alguém passa de vez em quando e diz o que está acontecendo. O que ele não aguenta é ninguém aparecer.

### O método SMQ, passo a passo

1. Conte a verdade no primeiro contato: o que trava, por que trava e quem decide.
2. Explique o sistema, não só o problema. Exemplo do caso C: unidades que voltam de outros compradores têm limite mensal de liberação, e a decisão é da construtora.
3. Presença mesmo sem novidade: na análise de crédito, dê notícia pelo menos a cada 5 dias úteis (na ansiedade do cliente, a cada 48 horas). Quem se cobra é o correspondente, não o cliente.
4. Quando destravar, aja no mesmo dia: documentos atualizados, fluxo pronto e duas opções de horário para assinar.
5. Compensação pela espera só dentro da campanha (parcelamento da entrada e, quando a campanha oferece, ITBI e documentação). Qualquer coisa além vai para o gerente ou o diretor.
6. Última tentativa com dignidade: peça permissão e deixe a porta aberta. Esgotou a régua: decida na ficha, um novo passo com data ou perdido com o motivo verdadeiro. Comprou com outro? Parabéns de verdade e pedido de indicação.

### Na vida real

**O caso:** Caso C: dois meses de espera, venda salva pela verdade (diretor Guilherme Nunes, fev a abr/2025).

**O que foi dito:** "Estamos monitorando as unidades que voltam, vou te atualizando sempre." E, no dia da assinatura: "Agora oficialmente... Meus parabéns! Lutaram juntos até dar certo e deu!"

**O que aconteceu:** Quando a unidade voltou, fotos, vídeo da vista e documentos atualizados saíram na mesma manhã. A aprovação veio às 10h19 e a assinatura, horas depois.

### Scripts prontos

#### WhatsApp · Espera longa, sem novidade para contar

> Oi, [nome]! Ainda sem novidade da unidade, e eu sigo monitorando toda semana. Assim que abrir, você fica sabendo na hora. Te dou notícia de novo na [dia].

**Por que funciona:** Presença sem promessa: o cliente sabe que não foi esquecido e já sabe quando vai ter notícia.

#### WhatsApp · Última tentativa com dignidade

> [nome], percebo que agora não é o melhor momento pra você. Posso guardar seu contato e te chamar quando aparecer uma condição que encaixe no seu perfil?

**Por que funciona:** Pede permissão, tira a pressão e deixa a porta aberta. É a frase oficial da casa para encerrar sem queimar.

#### WhatsApp · O cliente comprou com outro

> Que notícia boa, [nome]! Parabéns pela conquista. Se alguém da sua família ou do trabalho estiver pagando aluguel e quiser sair, pode contar comigo.

**Por que funciona:** Sem ressentimento, com a porta aberta e um pedido de indicação específico.

### Erros que matam a venda

- **Sumir enquanto a análise ou a unidade não sai**  
  Quanto custa: O cliente ansioso procura outro corretor, e a pasta pronta se perde  
  Correção: Notícia pelo menos a cada 5 dias úteis, mesmo sem novidade
- **Prometer prazo que não depende de você**  
  Quanto custa: Quando o prazo passa, a confiança vai junto  
  Correção: Explicar o sistema e marcar a próxima notícia, não o resultado
- **Perder sem motivo ou com motivo falso**  
  Quanto custa: O relatório fica inútil e o time não aprende  
  Correção: Um dos motivos do CRM, o verdadeiro

### No CRM

- **Tela:** Ficha do cliente e Follow-Up › Régua (já respondeu)
- **Ação:** Registrar a próxima notícia como próximo passo; ao esgotar a régua, decidir na ficha
- **Campo:** Próximo passo com data; motivo de perda
- **Regra:** Régua esgotada não vira perdido sozinha: a decisão é sua, com motivo verdadeiro

### Frase-âncora

> **Quem sabe antes espera. Quem descobre depois se sente enganado.**

### Checagem rápida

1. Com que frequência dar notícia a um cliente em análise?  
   Resposta: Pelo menos a cada 5 dias úteis; na ansiedade, a cada 48 horas, mesmo sem novidade.
2. O cliente pediu uma compensação pela espera fora da campanha. O que você faz?  
   Resposta: Oferece o que a campanha tem e leva o pedido extra ao gerente, com retorno marcado.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Uma cliente com crédito aprovado esperou dois meses por uma unidade que não estava disponível. Ela não desistiu, e comprou. O que segurou a venda foi a verdade dita no primeiro dia e um toque a cada semana, mesmo sem novidade.","por_que_importa":"Quem descobre o problema depois se sente enganado; quem sabe antes espera. O silêncio é o que mata a espera longa. E nem todo cliente vai voltar: a última tentativa com dignidade preserva a relação e o seu nome, que é o que traz a indicação amanhã.","conceito":"Espera longa é como fila de hospital: o paciente aguenta horas se alguém passa de vez em quando e diz o que está acontecendo. O que ele não aguenta é ninguém aparecer.","metodo":["Conte a verdade no primeiro contato: o que trava, por que trava e quem decide.","Explique o sistema, não só o problema. Exemplo do caso C: unidades que voltam de outros compradores têm limite mensal de liberação, e a decisão é da construtora.","Presença mesmo sem novidade: na análise de crédito, dê notícia pelo menos a cada 5 dias úteis (na ansiedade do cliente, a cada 48 horas). Quem se cobra é o correspondente, não o cliente.","Quando destravar, aja no mesmo dia: documentos atualizados, fluxo pronto e duas opções de horário para assinar.","Compensação pela espera só dentro da campanha (parcelamento da entrada e, quando a campanha oferece, ITBI e documentação). Qualquer coisa além vai para o gerente ou o diretor.","Última tentativa com dignidade: peça permissão e deixe a porta aberta. Esgotou a régua: decida na ficha, um novo passo com data ou perdido com o motivo verdadeiro. Comprou com outro? Parabéns de verdade e pedido de indicação."],"na_vida_real":{"caso":"Caso C: dois meses de espera, venda salva pela verdade (diretor Guilherme Nunes, fev a abr/2025).","o_que_foi_dito":"\"Estamos monitorando as unidades que voltam, vou te atualizando sempre.\" E, no dia da assinatura: \"Agora oficialmente... Meus parabéns! Lutaram juntos até dar certo e deu!\"","resultado":"Quando a unidade voltou, fotos, vídeo da vista e documentos atualizados saíram na mesma manhã. A aprovação veio às 10h19 e a assinatura, horas depois.","fonte":"Caso C da Casoteca (Estudo da Academia, seção 7)"},"scripts":[{"canal":"WhatsApp","situacao":"Espera longa, sem novidade para contar","texto":"Oi, [nome]! Ainda sem novidade da unidade, e eu sigo monitorando toda semana. Assim que abrir, você fica sabendo na hora. Te dou notícia de novo na [dia].","por_que_funciona":"Presença sem promessa: o cliente sabe que não foi esquecido e já sabe quando vai ter notícia."},{"canal":"WhatsApp","situacao":"Última tentativa com dignidade","texto":"[nome], percebo que agora não é o melhor momento pra você. Posso guardar seu contato e te chamar quando aparecer uma condição que encaixe no seu perfil?","por_que_funciona":"Pede permissão, tira a pressão e deixa a porta aberta. É a frase oficial da casa para encerrar sem queimar."},{"canal":"WhatsApp","situacao":"O cliente comprou com outro","texto":"Que notícia boa, [nome]! Parabéns pela conquista. Se alguém da sua família ou do trabalho estiver pagando aluguel e quiser sair, pode contar comigo.","por_que_funciona":"Sem ressentimento, com a porta aberta e um pedido de indicação específico."}],"erros_que_matam":[{"erro":"Sumir enquanto a análise ou a unidade não sai","custo":"O cliente ansioso procura outro corretor, e a pasta pronta se perde","correcao":"Notícia pelo menos a cada 5 dias úteis, mesmo sem novidade"},{"erro":"Prometer prazo que não depende de você","custo":"Quando o prazo passa, a confiança vai junto","correcao":"Explicar o sistema e marcar a próxima notícia, não o resultado"},{"erro":"Perder sem motivo ou com motivo falso","custo":"O relatório fica inútil e o time não aprende","correcao":"Um dos motivos do CRM, o verdadeiro"}],"no_crm":{"tela":"Ficha do cliente e Follow-Up › Régua (já respondeu)","acao":"Registrar a próxima notícia como próximo passo; ao esgotar a régua, decidir na ficha","campo":"Próximo passo com data; motivo de perda","regra":"Régua esgotada não vira perdido sozinha: a decisão é sua, com motivo verdadeiro"},"frase_ancora":"Quem sabe antes espera. Quem descobre depois se sente enganado.","checagem_rapida":[{"pergunta":"Com que frequência dar notícia a um cliente em análise?","resposta":"Pelo menos a cada 5 dias úteis; na ansiedade, a cada 48 horas, mesmo sem novidade."},{"pergunta":"O cliente pediu uma compensação pela espera fora da campanha. O que você faz?","resposta":"Oferece o que a campanha tem e leva o pedido extra ao gerente, com retorno marcado."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q01', 1, 'situacional',
  'O cliente respondeu ao meio-dia: "mando os documentos mais tarde". O que você faz?',
  '["Manda um lembrete às 15h, para garantir que ele não esqueça.","Responde \"Claro, sem pressa! Estarei aqui.\" e espera ele mandar.","Registra o combinado para hoje às 19h e, se não chegar nada, cobra citando o que ele prometeu.","Deixa a régua seguir o intervalo normal e toca de novo daqui a alguns dias."]'::jsonb,
  2,
  'A C segue a regra da casa: o prazo do cliente suspende a régua, e prazo vago ("mais tarde") vale hoje às 19h, com cobrança que cita o combinado. A A cobra antes do prazo e irrita. A B é o encerramento passivo, que não teve retorno nas conversas auditadas. A D ignora o prazo que o cliente deu.',
  'M20-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q02', 2, 'situacional',
  'Um cliente da sua carteira respondeu duas vezes na semana passada e está parado há 6 dias. O Souza não mandou nada para ele. Qual é o próximo passo?',
  '["Toque humano pela régua, com valor novo: ele é um bom perdido, e o follow-up automático não alcança quem está parado há mais de 3 dias.","Esperar o Souza, porque o robô cuida do follow-up automático.","Marcar como perdido, porque parou de responder.","Mandar a abertura padrão do empreendimento, como se fosse um lead novo."]'::jsonb,
  0,
  'A A está certa: quem respondeu duas vezes ou mais e está parado de 3 a 14 dias é bom perdido e só volta por toque humano. A B espera um robô que não alcança esse cliente. A C perde um cliente que ainda pode voltar, sem motivo verdadeiro. A D manda a abertura padrão por cima de uma conversa avançada, anti-padrão da auditoria.',
  'M20-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q03', 3, 'aplicacao',
  'Cliente QUENTE, em atendimento, recebeu o toque 2 hoje e não respondeu. Você registra "Sem resposta". Quando e por qual canal o CRM agenda o toque 3?',
  '["Daqui a 2 dias, por WhatsApp.","Daqui a 3 dias, por ligação.","Hoje mesmo, por WhatsApp.","Daqui a 1 dia, por ligação."]'::jsonb,
  3,
  'A D bate com a configuração da régua (set/2026): no quente, a espera depois do toque 2 é de 1 dia, e o toque 3 é por ligação (toques 3, 7 e 11). A A usa o intervalo do morno e erra o canal. A B usa um intervalo que não existe nesse ponto do quente. A C não existe: fora o toque 1, o intervalo mínimo é de 1 dia.',
  'M20-A2; configuração da régua no CRM', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q04', 4, 'conceito',
  'Qual destas ações conta como toque na régua de 13 toques?',
  '["Mudar o card de \"Em atendimento\" para \"Aguardando retorno\".","Uma ligação para o cliente, mesmo que ele não atenda.","Uma anotação na ficha dizendo \"cliente não respondeu\".","Abrir a ficha do cliente e ler o histórico."]'::jsonb,
  1,
  'A B é contato ativo, e só contato ativo conta como toque (ligação, WhatsApp, visita, e-mail, reunião ou SMS). A A e a C são mudança de status e nota, que não contam. A D é preparação do toque, não o toque.',
  'M20-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q05', 5, 'situacional',
  'Um cliente em análise de crédito está há 8 dias úteis sem notícia sua. O correspondente ainda não respondeu. O que você manda para o cliente?',
  '["Nada, porque não tem novidade para contar.","\"Oi, [nome]! Cobrei o correspondente hoje. Ainda não tem retorno e eu sigo em cima. Te dou notícia de novo até [dia].\"","\"Fica tranquilo, com certeza aprova essa semana.\"","\"Ficou alguma dúvida sobre a análise?\""]'::jsonb,
  1,
  'A B é presença sem promessa, com a próxima notícia marcada: na análise, a regra é dar notícia pelo menos a cada 5 dias úteis, mesmo sem novidade. A A é o silêncio que mata a espera longa. A C promete aprovação, o que é proibido. A D é o follow-up genérico, com 4,7% de avanço.',
  'M20-A6; M20-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q06', 6, 'aplicacao',
  'Cliente FRIO, sem avanço de etapa, acabou de receber o toque 4 sem resposta. Quantos dias até o toque 5 e por qual canal?',
  '["3 dias, por ligação.","5 dias, por ligação.","7 dias, por ligação.","7 dias, por WhatsApp."]'::jsonb,
  3,
  'A D bate com a configuração da régua (set/2026): no frio, a espera depois do toque 4 é de 7 dias, e o toque 5 é por WhatsApp, porque só o 3, o 7 e o 11 são por ligação. A A usa a espera depois do toque 1. A B usa a espera depois do toque 3. Nas três primeiras, o canal está errado.',
  'M20-A2; configuração da régua no CRM', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q07', 7, 'situacional',
  'O cliente respondeu: "Não tenho mais interesse, por favor não me chame mais." O que você faz?',
  '["Agradece, registra a perda com o motivo verdadeiro e encerra a régua.","Espera uma semana e manda uma novidade, porque talvez ele mude de ideia.","Responde \"Tem certeza? É a última oportunidade.\"","Deixa a régua seguir, porque o CRM agenda os próximos toques."]'::jsonb,
  0,
  'A A está certa: recusa explícita encerra a régua e vira registro com motivo. A B é follow-up depois de recusa explícita, que queima o relacionamento. A C é urgência falsa, proibida. A D ignora a recusa e desrespeita o cliente.',
  'M20-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q08', 8, 'caca_ao_erro',
  'Leia o toque que um corretor mandou para um cliente parado há 10 dias: "Oi, tudo bem? Só passando pra saber se você pensou sobre o apartamento. Ficou alguma dúvida? Qualquer coisa me chama!" Qual é o problema principal?',
  '["Faltou mandar o book junto, para reforçar o produto.","A mensagem é curta demais para um cliente parado há tanto tempo.","Não traz nenhum valor novo e termina sem próximo passo: é o follow-up genérico que fabrica \"depois\".","Deveria ter sido mandada às 23h, quando o cliente está em casa."]'::jsonb,
  2,
  'A C aponta o erro: "só passando pra saber", "ficou alguma dúvida?" e "qualquer coisa me chama" são frases proibidas; o toque não traz um dos 8 tipos de valor e devolve a iniciativa ao cliente. A A troca um erro por outro: catálogo não é follow-up. A B erra o diagnóstico: o tamanho está bom, falta valor. A D fere a regra de não mandar mensagem depois das 21h sem convite.',
  'M20-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q09', 9, 'situacional',
  'Você fez o 13º toque e o cliente não respondeu. O CRM mostra "Régua esgotada (13/13)". O que acontece e o que você faz?',
  '["O CRM marca o cliente como perdido automaticamente e você não precisa fazer nada.","O cliente volta para a roleta e outro corretor assume.","Você reinicia os 13 toques com as mesmas mensagens.","O cliente fica sem próximo passo na Reserva da sua carteira, e você decide na ficha: um novo passo com data ou perdido com o motivo verdadeiro."]'::jsonb,
  3,
  'A D descreve o CRM: esgotar a régua não perde ninguém sozinho; a decisão é humana. A A está errada: não há perda automática. A B confunde régua esgotada com repasse. A C repete mensagens, o que o cliente aprende a ignorar.',
  'M20-A2; M20-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q10', 10, 'aplicacao',
  'Cliente MORNO em análise de crédito recebeu o toque 6 sem resposta. No morno, a espera depois do toque 6 é de 5 dias, e no fundo do funil o intervalo cai pela metade (com arredondamento). Em quantos dias sai o toque 7 e por qual canal?',
  '["5 dias, por WhatsApp.","3 dias, por ligação.","2 dias, por WhatsApp.","10 dias, por ligação."]'::jsonb,
  1,
  'A B está certa: 5 dias pela metade dá 2,5, arredondado para 3, e o toque 7 é por ligação. A A ignora que a análise de crédito acelera o ritmo e erra o canal. A C arredonda para baixo e erra o canal. A D dobra o intervalo em vez de cortar pela metade.',
  'M20-A2; configuração da régua no CRM', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q11', 11, 'conceito',
  'Qual é a diferença entre a Cadência (lead novo) e a régua de 13 toques?',
  '["A cadência é para quem ainda não conversou (Lead chegou, 1º follow-up, 2º follow-up e Encerramento); a régua de 13 toques é para quem já respondeu e está na carteira.","A cadência é para cliente frio e a régua é para cliente quente.","A cadência é feita pelo robô e a régua, pelo corretor.","São a mesma coisa com nomes diferentes."]'::jsonb,
  0,
  'A A está certa: o Follow-Up tem as duas janelas do mesmo cliente, a cadência até ele responder e a régua depois disso. A B confunde régua com temperatura: a temperatura só muda o intervalo da régua. A C erra os papéis: o corretor faz os toques nas duas. A D ignora que cada uma tem etapas e regras próprias.',
  'M20-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q12', 12, 'situacional',
  'Uma cliente com crédito aprovado espera uma unidade que ainda não foi liberada pela construtora. Já faz 3 semanas. O que sustenta a venda até lá?',
  '["Dizer que a unidade sai na semana que vem, para ela não desistir.","Parar de chamar até ter novidade, para não incomodar.","Contar a verdade sobre como a liberação funciona e dar notícia com frequência, mesmo sem novidade.","Oferecer um desconto por conta própria para compensar a espera."]'::jsonb,
  2,
  'A C é a lição do caso C: quem sabe antes espera, e o silêncio é o que mata a espera longa. A A promete um prazo que não depende de você. A B é o silêncio. A D sai da alçada: compensação só dentro da campanha; o resto, gerente ou diretor.',
  'M20-A6', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q13', 13, 'aplicacao',
  'O cliente disse, numa quinta-feira às 11h: "me chama semana que vem". Pela regra do prazo do cliente, qual próximo passo você registra?',
  '["Segunda-feira da semana que vem, sem horário definido.","Hoje às 19h, porque é prazo vago.","Uma data dentro de no máximo 3 dias, com horário proposto ao cliente, como sexta às 19h ou sábado às 10h.","Daqui a 14 dias, o maior intervalo do morno."]'::jsonb,
  2,
  'A C aplica a regra: prazo longo vale no máximo 3 dias, e a data é combinada com o cliente, com horário. A A deixa sem horário, e o toque vira lembrete vago. A B trata como prazo vago do dia, e o cliente disse outra semana. A D ignora o prazo do cliente e usa um intervalo da régua que não se aplica.',
  'M20-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q14', 14, 'situacional',
  'Você vai tocar um cliente que o Marques reativou ontem. Na conversa, o robô combinou de mandar as plantas hoje. O que fazer antes do seu toque?',
  '["Ler a conversa, mandar as plantas combinadas e seguir dali, sem repetir nem contradizer o robô.","Mandar a sua abertura padrão, porque agora quem conduz é você.","Esperar o robô mandar as plantas.","Ligar e perguntar tudo de novo, para ter certeza dos dados."]'::jsonb,
  0,
  'A A segue a convivência com os robôs: leia antes de tocar, não duplique e não contradiga o que foi combinado. A B manda abertura por cima de conversa avançada. A C terceiriza um combinado que agora é seu: quando você assume, o robô pausa. A D faz o cliente responder tudo de novo, erro que faz desistir.',
  'M20-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q15', 15, 'conceito',
  'Por que o toque "Você tinha ficado de [X], conseguiu?" funciona melhor que "ficou alguma dúvida?"?',
  '["Porque é mais curto.","Porque o cliente responde ao compromisso que ele mesmo fez: 54,3% de resposta e 37,1% de avanço em 7 dias, contra 16,8% e 4,7%.","Porque pressiona o cliente com culpa.","Porque o robô usa essa frase."]'::jsonb,
  1,
  'A B traz o motivo e o número da casa (conversas do robô, jul a set/2026). A A não explica: as duas são curtas. A C está errada: a cobrança do combinado é lembrança, não culpa, e manipulação é proibida. A D não é motivo: a frase funciona para qualquer um.',
  'M20-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q16', 16, 'aplicacao',
  'Pela configuração da régua (set/2026), qual é o ciclo aproximado dos 13 toques em cada temperatura?',
  '["Quente 13 dias, morno 26, frio 39.","Quente 30 dias, morno 30, frio 30.","Quente 72 dias, morno 50, frio 146.","Quente 50 dias, morno 72, frio 146."]'::jsonb,
  3,
  'A D soma os intervalos da configuração: quente 1, 1, 2, 2, 3, 3, 4, 5, 5, 7, 7 e 10 (50 dias); morno 72; frio 146. A A imagina um toque por dia. A B ignora a temperatura. A C troca o quente com o morno.',
  'M20-A2; Treinamento do CRM, set/2026', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q17', 17, 'caca_ao_erro',
  'Uma corretora escreveu no toque 7 de um cliente morno: "Oi, [nome]! Saiu a tabela nova do [empreendimento] e a condição da campanha agora parcela a entrada. Posso te mostrar em 5 minutos por ligação hoje às 19h?" e mandou por WhatsApp. O que está errado?',
  '["O canal: o toque 7 é por ligação. A mensagem pode ir depois, se ele não atender.","A mensagem traz novidade demais para um toque só.","Não se pode citar condição de campanha em follow-up.","O horário das 19h está fora dos horários que rendem."]'::jsonb,
  0,
  'A A aponta o erro: os toques 3, 7 e 11 são por ligação; o texto é bom e serve de WhatsApp em até 2 minutos se o cliente não atender. A B critica o que está certo: é uma novidade real, bem ancorada. A C está errada: condição real da campanha é valor. A D erra o fato: de 19h às 22h é um dos melhores horários.',
  'M20-A2; M20-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q18', 18, 'situacional',
  'Um cliente parado há 45 dias procurou apartamento na Zona Leste. Saiu um lançamento no perfil dele. Qual toque você manda?',
  '["\"Oi, sumiu? Ainda tem interesse?\"","O book completo do lançamento, sem texto.","\"Prezado cliente, conforme nosso contato anterior, seguem novas opções.\"","\"Oi, [nome]! Você procurou apartamento na Zona Leste e saiu um lançamento no seu perfil: a [distância] do metrô, a partir de R$ [preço]. Quer que eu te mande as plantas e simule a sua parcela?\""]'::jsonb,
  3,
  'A D é a reativação com âncora concreta (21,9% de resposta contra 5,8% da genérica, set/2026), com preço "a partir de" e um sim pequeno. A A usa "sumiu?", proibido. A B manda catálogo como follow-up. A C é linguagem de banco e genérica.',
  'M20-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q19', 19, 'conceito',
  'Qual destes clientes vem primeiro na hora de resgatar a carteira?',
  '["Um lead frio que chegou há 20 dias e nunca respondeu.","Um cliente QUENTE em análise de crédito, parado há 12 dias.","Um lead de base importada, sem conversa.","Um cliente que disse \"não tenho interesse\" há uma semana."]'::jsonb,
  1,
  'A B está certa: o fundo do funil parado é a prioridade 1 da Fila Única, porque é onde o dinheiro está em risco (210 quentes parados em fase avançada em 11/09/2026). A A e a C valem menos que um cliente em análise. A D já recusou, e a régua dele está encerrada.',
  'M20-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M20-Q20', 20, 'aplicacao',
  'Você mandou para 100 clientes parados uma reativação específica: 22 responderam e 2 viraram agendamento. Outra versão, genérica, teve 6 respostas e 2 agendamentos. Como ler o resultado?',
  '["A específica ganhou, porque teve quase 4 vezes mais resposta.","A genérica ganhou, porque ninguém se descadastrou.","As duas trouxeram o mesmo avanço; a específica comprou mais atenção. Compare também avanço por quem respondeu e descadastro antes de escolher.","Não dá para comparar reativação por número."]'::jsonb,
  2,
  'A C lê do jeito da casa: atenção não é intenção. Meça resposta, avanço de quem respondeu e descadastro juntos, como mostrou a reativação de set/2026 (mais resposta, menos handoff por respondente e mais descadastro na mensagem específica). A A olha só a resposta. A B inventa um dado que não está no enunciado. A D abandona a medição, que é o que torna a reativação um experimento.',
  'M20-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (15)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F01', 1, 'Com follow-up x sem follow-up', '22,3% voltam com toque depois de 24 horas sem resposta; 0,7% sem toque (jul a set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F02', 2, 'As duas réguas do Follow-Up', 'Cadência (lead novo) até o cliente responder; régua de 13 toques (já respondeu) depois disso.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F03', 3, 'Etapas da Cadência (lead novo)', 'Lead chegou, 1º follow-up, 2º follow-up e Encerramento. Cumprida: 4 etapas em pelo menos 4 dias, 10 toques.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F04', 4, 'Toques por ligação', '3, 7 e 11. Os outros são por WhatsApp.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F05', 5, 'Ciclo da régua por temperatura', 'Quente cerca de 50 dias, morno 72, frio 146. No fundo do funil, o intervalo cai pela metade.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F06', 6, 'O que conta como toque', 'Contato ativo seu: ligação, WhatsApp, visita, e-mail, reunião ou SMS. Nota e status não contam.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F07', 7, 'Desfechos do toque', 'Sem resposta (agenda o próximo), Respondeu (continue a conversa), Agendou visita, Descartar (perdido com motivo).', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F08', 8, 'Régua esgotada (13/13)', 'Não vira perdido sozinha. Fica na Reserva, sem próximo passo, e você decide: novo passo com data ou perdido com motivo.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F09', 9, 'Os 8 tipos de valor', 'Prova social, educativo, novidade real, custo do aluguel, engajamento, mercado, resposta antecipada, cobrança do combinado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F10', 10, 'Prazo vago do cliente', '"Mais tarde": hoje às 19h. "Amanhã de manhã": 9h. "À tarde": 14h. Prazo longo: no máximo 3 dias.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F11', 11, 'Cobrança do combinado', '"Você tinha ficado de [X], conseguiu?" 54,3% de resposta e 37,1% de avanço, contra 16,8% e 4,7% do "ficou alguma dúvida?".', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F12', 12, 'Bom perdido', 'Respondeu 2 vezes ou mais e está parado de 3 a 14 dias. Só volta por toque humano.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F13', 13, 'Reativação por ligação', 'Três fatos (empreendimento, localização, condição de entrada) e uma pergunta de corte: agora, 30 a 60 dias, ou mais pra frente?', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F14', 14, 'Espera longa', 'Verdade antes, sistema explicado e notícia pelo menos a cada 5 dias úteis, mesmo sem novidade.', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M20-F15', 15, 'Última tentativa com dignidade', '"Percebo que agora não é o melhor momento. Posso guardar seu contato e te chamar quando aparecer uma condição que encaixe no seu perfil?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1 quinzenal, abra com o corretor o Follow-Up › Cobertura do time e a Base de leads com \"Parado há 7+ dias\", e escolha juntos 5 clientes para ele escrever o toque na hora, com a rubrica. Na reunião de segunda, mostre a Curva de resposta do time e peça que cada corretor traga um toque que funcionou e um que não funcionou (anônimos). Aplique a revisão de carteira de 20 minutos como prática uma vez por mês.","sinais_de_dificuldade":["Follow-ups vencidos todo fim de dia no Follow-Up › Cobertura do time.","Muitas réguas esgotadas (13/13) sem decisão registrada, ou clientes descartados sem motivo verdadeiro.","Mensagens repetidas ou genéricas no histórico dos clientes (\"ficou alguma dúvida?\", \"só passando pra saber\")."],"perguntas_de_coaching":["Qual foi o combinado com esse cliente, e quando você vai cobrar?","Que valor novo esse toque traz que o anterior não trazia?","Se esse cliente fosse o seu único em análise, com que frequência você daria notícia?"],"ritual_de_celebracao":"All Hands quinzenal: destaque para quem manteve a semana com zero follow-up vencido e para o toque que trouxe um cliente de volta (anônimo); no LEGADO, entra em \"Disciplina de Processo\"."},"pratica_gabarito":["Cartão 1: bom perdido. Toque humano com convite para os dois: visita com o decisor, em duas opções de horário.","Cartão 2: novidade real com data. Marcar o marco do FGTS, simular hoje com o saldo atual e oferecer visita.","Cartão 3: presença sem promessa. Cobrar o correspondente e dar notícia ao cliente com a próxima data.","Cartão 4: ligação humanizada, reconhecendo o RG que chegou e pedindo o próximo documento com prazo.","Cartão 5: prazo do cliente suspende a régua. Propor data dentro de 3 dias, com duas opções.","Cartão 6: registrar o prazo, cobrar o combinado no fim da semana e rodar a análise de novo no minuto em que destravar."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M20' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
