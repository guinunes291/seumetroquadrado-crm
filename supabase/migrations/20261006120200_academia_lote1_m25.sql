-- ===========================================================================
-- ACADEMIA SMQ · LOTE 1 (v1.1) · seed do módulo M25
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-1/academia-smq-lote-1.json.
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
  ('M25', 25, 0, 'O dia no CRM: Fila Única, desfecho e os dois zeros', 'Ao final, você trabalha a Fila Única de cima para baixo, registra desfecho em todo card e fecha o dia com 0 follow-up vencido e 0 cliente sem próximo passo, e isso aparece no CRM como 20 desfechos por dia e os dois zeros no fim do dia.',
   '["Eu sou capaz de explicar em voz alta por que o primeiro card da fila está em primeiro lugar.","Eu sou capaz de trabalhar 10 cards de cima para baixo, sem pular, com desfecho em todos.","Eu sou capaz de escolher a porta de saída certa para cada card: desfecho com próximo passo e data, agendamento criado ou perdido com o motivo verdadeiro.","Eu sou capaz de usar Carteira ativa, Reserva e Bolsão sem confundir a Reserva do CRM com a garantia de uma unidade.","Eu sou capaz de fechar o dia com os dois zeros: 0 follow-up vencido e 0 cliente sem próximo passo."]'::jsonb, 1, '60 min', true,
   '**Laboratório no CRM (individual, com o gerente ao lado)** · 30 min

**Papéis:** Corretor operando o CRM e gerente observando com cronômetro.

**Persona:** Cards reais da fila do corretor (ou do CRM de treino, se existir) [CONFIRMAR]

**Roteiro:** O corretor abre a Fila Única e explica em voz alta por que o primeiro card está em primeiro (o motivo está escrito no card). Depois trabalha 10 cards de cima para baixo, sem pular, e registra o desfecho de todos. Ao final, os dois conferem juntos se os 10 saíram da fila com próximo passo e data.

**O que o observador procura:**

- Leu o motivo da prioridade antes de agir.
- Não pulou nenhum card.
- Usou os botões do card (W, L) e registrou o desfecho de todos.
- Escolheu a porta certa: desfecho com data, agendamento criado ou perda com motivo verdadeiro.
- Nenhuma mensagem com promessa ou "só passando pra saber".

**Rubrica:** Padrão SMQ, critérios 3 (condução), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Desfecho: dia e hora ou documento; duas opções; nada de \"vou pensar\" aceito sem horário","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 1 v1.1 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Se existe um ambiente de treino no CRM para a prática (senão, usar a fila real com o gerente ao lado). | [CONFIRMAR] O prazo de garantia de unidade de cada construtora (script da aula M25-A3). | [DADO A MEDIR NO CRM] Linha de base de desfechos por dia e de dias com os dois zeros, depois do conserto de 16/09/2026.', '{"formato":"canonico-8.2","lote":1,"versao_conteudo":"1.1","trilha":"T0","ordem":2,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"Você não escolhe o cliente. A fila escolhe. E nada sai da fila sem desfecho.","duracao_min":60,"por_que_vale_dinheiro":{"texto":"Registrar é trabalhar. Nos handoffs do robô, quem registrou o trabalho no CRM viu o cliente avançar 15,2% das vezes; quem não registrou, 1,8%. São 8 vezes mais avanço com o mesmo lead. E a regra da fila é simples: um cliente em análise parado há 66 dias vale mais que 200 leads frios novos.","numero":"15,2% de avanço com registro contra 1,8% sem registro","fonte":"Conversas do robô cruzadas com o CRM","periodo":"jul a set/2026"},"pre_requisitos":["M00"],"indicador_crm":{"nome":"Desfechos por dia e os dois zeros do fim do dia","onde_ler":"Meu Raio-X e placar do dia (desfechos); Follow-Up › Fila do dia (vencidos); funil em quadro (coluna \"sem próximo passo\")","linha_de_base":"[DADO A MEDIR NO CRM] Antes do conserto de 16/09/2026, 96% das tarefas da régua venciam sozinhas","meta_sugerida":"20 desfechos por dia; 0 follow-up vencido e 0 cliente sem próximo passo no encerramento","fonte":"Treinamento do CRM SMQ, set/2026","gap_de_crm":false},"pratica":{"tipo":"Laboratório no CRM (individual, com o gerente ao lado)","duracao_min":30,"persona":"Cards reais da fila do corretor (ou do CRM de treino, se existir) [CONFIRMAR]","rubrica":"Padrão SMQ, critérios 3 (condução), 5 (desfecho), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"Corretor operando o CRM e gerente observando com cronômetro.","roteiro":"O corretor abre a Fila Única e explica em voz alta por que o primeiro card está em primeiro (o motivo está escrito no card). Depois trabalha 10 cards de cima para baixo, sem pular, e registra o desfecho de todos. Ao final, os dois conferem juntos se os 10 saíram da fila com próximo passo e data.","observador_procura":["Leu o motivo da prioridade antes de agir.","Não pulou nenhum card.","Usou os botões do card (W, L) e registrou o desfecho de todos.","Escolheu a porta certa: desfecho com data, agendamento criado ou perda com motivo verdadeiro.","Nenhuma mensagem com promessa ou \"só passando pra saber\"."]},"desafio_campo":{"tarefa":"Três dias seguidos com os dois zeros no fim do dia (0 follow-up vencido e 0 cliente sem próximo passo) e pelo menos 20 desfechos registrados por dia.","prazo_horas":72,"evidencia_no_crm":"Follow-Up sem vencidos e funil em quadro sem clientes \"sem próximo passo\" no encerramento; desfechos do dia no Meu Raio-X.","como_o_gestor_confere":"Por três dias, às 19h, abre o Operação › Dia (ou o Meu Raio-X do corretor com ele) e confere vencidos, clientes sem próximo passo e desfechos do dia."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente (demonstração de tela)","cenario":"Tela do CRM gravada, com o gerente narrando e aparecendo no canto","blocos":[{"tempo":"0:00","fala":"Um cliente em análise parado há 66 dias vale mais do que 200 leads frios. Deixa eu te mostrar onde ele está.","na_tela":"Fila Única aberta"},{"tempo":"0:20","fala":"A fila é ordenada pelo dinheiro em risco. Primeiro, o fundo do funil. Depois, quem acabou de chegar. Depois, quem respondeu e está esperando.","na_tela":"As 7 prioridades destacadas"},{"tempo":"1:00","fala":"Clica em \"Começar pelo mais caro\", fala pelo botão do card e registra o desfecho. O sistema cria o próximo passo sozinho.","na_tela":"Ciclo completo em um card"},{"tempo":"2:00","fala":"Três portas de saída: desfecho com data, agendamento criado ou perdido com motivo. Mudar o status não é agendar.","na_tela":"As 3 portas"},{"tempo":"3:00","fala":"Carteira de 65, Reserva com até 13 resgates e Bolsão só para consulta.","na_tela":"Contador da carteira e tela da Reserva"},{"tempo":"3:40","fala":"O erro que eu mais vejo: fechar o dia com follow-up vencido. Amanhã vira bola de neve.","na_tela":"Aba de vencidos"},{"tempo":"4:10","fala":"Desafio: três dias seguidos fechando com os dois zeros. Nada sai da fila sem desfecho.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 9.1, 9.6, 9.10 e 9.12 do super prompt","Treinamento do CRM SMQ e Manual do CRM (set/2026)","Regra do prazo do cliente (20/07/2026)"],"origem":"SMQ","pendencias":["[CONFIRMAR] Se existe um ambiente de treino no CRM para a prática (senão, usar a fila real com o gerente ao lado).","[CONFIRMAR] O prazo de garantia de unidade de cada construtora (script da aula M25-A3).","[DADO A MEDIR NO CRM] Linha de base de desfechos por dia e de dias com os dois zeros, depois do conserto de 16/09/2026."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M25-A1', 'M25-A2', 'M25-A3', 'M25-A4', 'M25-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M25-Q01', 'M25-Q02', 'M25-Q03', 'M25-Q04', 'M25-Q05', 'M25-Q06', 'M25-Q07', 'M25-Q08', 'M25-Q09', 'M25-Q10', 'M25-Q11', 'M25-Q12', 'M25-Q13', 'M25-Q14', 'M25-Q15', 'M25-Q16', 'M25-Q17', 'M25-Q18', 'M25-Q19', 'M25-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M25-F01', 'M25-F02', 'M25-F03', 'M25-F04', 'M25-F05', 'M25-F06', 'M25-F07', 'M25-F08', 'M25-F09', 'M25-F10', 'M25-F11', 'M25-F12', 'M25-F13');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 13;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M25-A1', 1, 'Você não escolhe o cliente. A fila escolhe.', 'texto',
  'Um cliente em análise parado há 66 dias vale mais que 200 leads frios novos. Você sabe, agora, quem é o seu cliente de 66 dias? A fila sabe.

### Por que importa

O sistema enxerga quatro coisas ao mesmo tempo, para todos os seus clientes: há quantos dias cada um está parado, em que etapa ele está, quanto dinheiro está em jogo e quem prometeu voltar e não voltou. De cabeça, ninguém enxerga isso. Quem escolhe o cliente pelo "mais fácil" deixa dinheiro no chão.

### O conceito

A Fila Única funciona como a triagem de um pronto-socorro: quem entra primeiro não é quem chegou primeiro, é quem corre mais risco. Aqui, o risco é de dinheiro. A fila coloca na frente o cliente que mais pode ser perdido hoje.

### O método SMQ, passo a passo

1. Abra a Central de Comando e clique em "Começar pelo mais caro": o sistema abre o primeiro cliente da fila.
2. Entenda as 7 prioridades, nesta ordem: 1) fundo do funil parado (agendado, visita e análise: é onde o dinheiro está); 2) chegaram agora (a meta da casa é 5 minutos; o limite do sistema, 15); 3) cliente respondeu e espera (ele falou por último); 4) follow-up vencido ou de hoje (você combinou de voltar); 5) sem próximo passo (precisa terminar o dia em zero); 6) esfriando (quente ou morno sem contato há 3 dias ou mais); 7) pasta travada (documento pendente segurando a análise).
3. Lead novo é a exceção que interrompe qualquer tarefa (decisão do diretor, 29/09/2026): ligar em até 5 minutos e, se não atender, WhatsApp em até 2 minutos. São 2 minutos; depois você volta para o topo da fila.
4. Fale com o cliente pelos botões do próprio card: WhatsApp ou ligação.
5. Registre o desfecho: o botão que diz o que aconteceu na conversa.
6. O sistema grava a interação, cria o próximo passo com data e muda a etapa quando for o caso. Passe para o próximo, de cima para baixo, sem pular. A fila traz até 40 clientes por dia.

### Na vida real

**O caso:** O conserto do CRM apresentado ao time em 16/09/2026.

**O que foi dito:** Antes, a régua criava tarefa e nunca fechava (96% das tarefas venciam sozinhas), o balde "cliente respondeu" tinha registrado 1 resposta em 90 dias e ninguém conseguia ver onde o funil travava. A casa consertou tudo antes de cobrar: "Pedir obediência a um sistema quebrado teria sido injusto."

**O que aconteceu:** Hoje a fila é confiável. O motivo de cada card estar na posição dele está escrito no próprio card.

### Scripts prontos

#### Ligação · Prioridade 1: cliente agendado que ficou parado

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Estou com a sua visita ao [empreendimento] aqui na minha frente e quero garantir que ela aconteça do jeito certo. Fica melhor sábado às 10h ou às 14h?

**Por que funciona:** Retoma o compromisso sem cobrança e devolve duas opções concretas, em vez de perguntar "ainda tem interesse?".

#### WhatsApp · Prioridade 3: o cliente respondeu e está esperando

> Oi, [nome]! Vi a sua mensagem agora. Sobre [o que ele perguntou]: [resposta curta]. Te ligo em 5 minutinhos pra fechar isso, pode ser?

**Por que funciona:** Quem falou por último foi o cliente: responder rápido e já puxar a ligação mantém a conversa quente.

### Erros que matam a venda

- **Pular o card difícil para "voltar depois"**  
  Quanto custa: O cliente mais caro fica mais um dia parado  
  Correção: De cima para baixo, sem pular
- **Escolher o cliente pelo que parece mais fácil**  
  Quanto custa: O fundo do funil esfria enquanto você conversa com curioso  
  Correção: "Começar pelo mais caro"
- **Falar com o cliente por fora do card e esquecer de registrar**  
  Quanto custa: O que não está registrado não aconteceu: sem próximo passo, o cliente some do radar  
  Correção: Usar os botões do card e registrar o desfecho na hora

### No CRM

- **Tela:** Central de Comando › Fila Única
- **Ação:** Clicar em "Começar pelo mais caro" e trabalhar de cima para baixo
- **Campo:** Motivo da prioridade escrito no card
- **Regra:** Até 40 clientes por dia; atalhos na fila: ← → navegar, W WhatsApp, L ligar, D desfecho

### Frase-âncora

> **Você não escolhe o cliente. A fila escolhe.**

### Checagem rápida

1. Qual é a prioridade número 1 da fila?  
   Resposta: O fundo do funil parado: agendado, visita e análise.
2. Quantos clientes a fila traz por dia, no máximo?  
   Resposta: Até 40.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Um cliente em análise parado há 66 dias vale mais que 200 leads frios novos. Você sabe, agora, quem é o seu cliente de 66 dias? A fila sabe.","por_que_importa":"O sistema enxerga quatro coisas ao mesmo tempo, para todos os seus clientes: há quantos dias cada um está parado, em que etapa ele está, quanto dinheiro está em jogo e quem prometeu voltar e não voltou. De cabeça, ninguém enxerga isso. Quem escolhe o cliente pelo \"mais fácil\" deixa dinheiro no chão.","conceito":"A Fila Única funciona como a triagem de um pronto-socorro: quem entra primeiro não é quem chegou primeiro, é quem corre mais risco. Aqui, o risco é de dinheiro. A fila coloca na frente o cliente que mais pode ser perdido hoje.","metodo":["Abra a Central de Comando e clique em \"Começar pelo mais caro\": o sistema abre o primeiro cliente da fila.","Entenda as 7 prioridades, nesta ordem: 1) fundo do funil parado (agendado, visita e análise: é onde o dinheiro está); 2) chegaram agora (a meta da casa é 5 minutos; o limite do sistema, 15); 3) cliente respondeu e espera (ele falou por último); 4) follow-up vencido ou de hoje (você combinou de voltar); 5) sem próximo passo (precisa terminar o dia em zero); 6) esfriando (quente ou morno sem contato há 3 dias ou mais); 7) pasta travada (documento pendente segurando a análise).","Lead novo é a exceção que interrompe qualquer tarefa (decisão do diretor, 29/09/2026): ligar em até 5 minutos e, se não atender, WhatsApp em até 2 minutos. São 2 minutos; depois você volta para o topo da fila.","Fale com o cliente pelos botões do próprio card: WhatsApp ou ligação.","Registre o desfecho: o botão que diz o que aconteceu na conversa.","O sistema grava a interação, cria o próximo passo com data e muda a etapa quando for o caso. Passe para o próximo, de cima para baixo, sem pular. A fila traz até 40 clientes por dia."],"na_vida_real":{"caso":"O conserto do CRM apresentado ao time em 16/09/2026.","o_que_foi_dito":"Antes, a régua criava tarefa e nunca fechava (96% das tarefas venciam sozinhas), o balde \"cliente respondeu\" tinha registrado 1 resposta em 90 dias e ninguém conseguia ver onde o funil travava. A casa consertou tudo antes de cobrar: \"Pedir obediência a um sistema quebrado teria sido injusto.\"","resultado":"Hoje a fila é confiável. O motivo de cada card estar na posição dele está escrito no próprio card.","fonte":"Treinamento do CRM SMQ, set/2026"},"scripts":[{"canal":"Ligação","situacao":"Prioridade 1: cliente agendado que ficou parado","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Estou com a sua visita ao [empreendimento] aqui na minha frente e quero garantir que ela aconteça do jeito certo. Fica melhor sábado às 10h ou às 14h?","por_que_funciona":"Retoma o compromisso sem cobrança e devolve duas opções concretas, em vez de perguntar \"ainda tem interesse?\"."},{"canal":"WhatsApp","situacao":"Prioridade 3: o cliente respondeu e está esperando","texto":"Oi, [nome]! Vi a sua mensagem agora. Sobre [o que ele perguntou]: [resposta curta]. Te ligo em 5 minutinhos pra fechar isso, pode ser?","por_que_funciona":"Quem falou por último foi o cliente: responder rápido e já puxar a ligação mantém a conversa quente."}],"erros_que_matam":[{"erro":"Pular o card difícil para \"voltar depois\"","custo":"O cliente mais caro fica mais um dia parado","correcao":"De cima para baixo, sem pular"},{"erro":"Escolher o cliente pelo que parece mais fácil","custo":"O fundo do funil esfria enquanto você conversa com curioso","correcao":"\"Começar pelo mais caro\""},{"erro":"Falar com o cliente por fora do card e esquecer de registrar","custo":"O que não está registrado não aconteceu: sem próximo passo, o cliente some do radar","correcao":"Usar os botões do card e registrar o desfecho na hora"}],"no_crm":{"tela":"Central de Comando › Fila Única","acao":"Clicar em \"Começar pelo mais caro\" e trabalhar de cima para baixo","campo":"Motivo da prioridade escrito no card","regra":"Até 40 clientes por dia; atalhos na fila: ← → navegar, W WhatsApp, L ligar, D desfecho"},"frase_ancora":"Você não escolhe o cliente. A fila escolhe.","checagem_rapida":[{"pergunta":"Qual é a prioridade número 1 da fila?","resposta":"O fundo do funil parado: agendado, visita e análise."},{"pergunta":"Quantos clientes a fila traz por dia, no máximo?","resposta":"Até 40."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M25-A2', 2, 'As três portas de saída de um card', 'texto',
  'Todo card sai da fila por uma de três portas. Não existe a porta (d) "fechei a tela".

### Por que importa

O desfecho é o que cria o próximo passo. Sem desfecho, o cliente sai do radar e esfria. É por isso que quem registra avança 8 vezes mais.

### O conceito

Pense num avião: nenhum decola sem plano de voo. O desfecho é o plano de voo do cliente: diz o que aconteceu, para onde ele vai e quando.

### O método SMQ, passo a passo

1. Porta (a): desfecho registrado, com próximo passo e data. Os dois, sempre.
2. Porta (b): agendamento criado, com data, hora e empreendimento. Mudar o status do card não é agendar.
3. Porta (c): perdido com motivo, escolhendo o verdadeiro entre os 11 motivos fechados: sumiu ou não responde; esfriou após proposta ou visita; crédito (score ou negativado); crédito (renda); renda acima do teto do MCMV; já tem imóvel ou usou o FGTS; achou caro ou a parcela não cabe; comprou com concorrente; adiou a decisão; sem perfil (curioso ou lead errado); outro (descrever).
4. Desfecho que não muda a etapa tem "Desfazer" por 5 segundos. Desfecho que muda a etapa (visita, venda, perda) não tem: por isso pede confirmação e dados.
5. Cada etapa tem os seus desfechos. Na análise de crédito: crédito aprovado, aguardando Caixa, reprovado, não atendeu ou perdeu (com motivo). Na visita agendada: foi à visita, no-show, remarcou ou desistiu (com motivo).

### Na vida real

**O caso:** Uma visita marcada pelo robô que ninguém confirmou (jul/2026).

**O que foi dito:** O cliente chegou com visita marcada para um sábado. O corretor não fez contato por 9 dias. Na confirmação automática da véspera, a cliente respondeu: "Preciso reagendar."

**O que aconteceu:** A correção foi responder com duas opções concretas e marcar o agendamento como "remarcado", para a confirmação do dia não confirmar uma visita cancelada. Sem contato e sem desfecho, a visita quase morreu.

### Scripts prontos

#### WhatsApp · Você ligou e o cliente não atendeu (porta a)

> Oi, [nome]! Tentei te ligar agora sobre o [empreendimento]. Te ligo de novo hoje às 18h ou amanhã às 9h, qual fica melhor?

**Por que funciona:** Deixa o próximo passo com data, que é exatamente o que o desfecho precisa registrar.

#### WhatsApp · Última tentativa antes de registrar a perda (porta c)

> [nome], percebo que agora não é o melhor momento pra você. Posso guardar o seu contato e te chamar quando aparecer uma condição que encaixe no seu perfil?

**Por que funciona:** Sai com dignidade, pede permissão e deixa a porta aberta para a base de reativação.

### Erros que matam a venda

- **Mudar o status para "Agendado" sem criar o agendamento**  
  Quanto custa: A visita não aparece na agenda, a confirmação nunca sai e o cliente não vem  
  Correção: Criar o agendamento com data, hora e empreendimento
- **Perder o cliente sem motivo, ou com "Outro" para limpar a carteira**  
  Quanto custa: O relatório fica inútil e o time não aprende onde perde  
  Correção: Um dos 11 motivos, o verdadeiro
- **Registrar desfecho sem data**  
  Quanto custa: O cliente vira "sem próximo passo" e some  
  Correção: Próximo passo e data, os dois, sempre

### No CRM

- **Tela:** Card da Fila Única
- **Ação:** Botão de desfecho (tecla D) ou "Criar agendamento"
- **Campo:** Próximo passo e data; data, hora e empreendimento; motivo da perda
- **Regra:** Nada sai da fila sem desfecho

### Frase-âncora

> **Nada sai da fila sem desfecho.**

### Checagem rápida

1. Mudei o card para "Agendado". Agendei?  
   Resposta: Não. Agendar é criar o agendamento com data, hora e empreendimento.
2. O cliente comprou com outra imobiliária. Qual motivo de perda?  
   Resposta: "Comprou com concorrente".
3. Por quanto tempo dá para desfazer um desfecho que não muda a etapa?  
   Resposta: 5 segundos.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Todo card sai da fila por uma de três portas. Não existe a porta (d) \"fechei a tela\".","por_que_importa":"O desfecho é o que cria o próximo passo. Sem desfecho, o cliente sai do radar e esfria. É por isso que quem registra avança 8 vezes mais.","conceito":"Pense num avião: nenhum decola sem plano de voo. O desfecho é o plano de voo do cliente: diz o que aconteceu, para onde ele vai e quando.","metodo":["Porta (a): desfecho registrado, com próximo passo e data. Os dois, sempre.","Porta (b): agendamento criado, com data, hora e empreendimento. Mudar o status do card não é agendar.","Porta (c): perdido com motivo, escolhendo o verdadeiro entre os 11 motivos fechados: sumiu ou não responde; esfriou após proposta ou visita; crédito (score ou negativado); crédito (renda); renda acima do teto do MCMV; já tem imóvel ou usou o FGTS; achou caro ou a parcela não cabe; comprou com concorrente; adiou a decisão; sem perfil (curioso ou lead errado); outro (descrever).","Desfecho que não muda a etapa tem \"Desfazer\" por 5 segundos. Desfecho que muda a etapa (visita, venda, perda) não tem: por isso pede confirmação e dados.","Cada etapa tem os seus desfechos. Na análise de crédito: crédito aprovado, aguardando Caixa, reprovado, não atendeu ou perdeu (com motivo). Na visita agendada: foi à visita, no-show, remarcou ou desistiu (com motivo)."],"na_vida_real":{"caso":"Uma visita marcada pelo robô que ninguém confirmou (jul/2026).","o_que_foi_dito":"O cliente chegou com visita marcada para um sábado. O corretor não fez contato por 9 dias. Na confirmação automática da véspera, a cliente respondeu: \"Preciso reagendar.\"","resultado":"A correção foi responder com duas opções concretas e marcar o agendamento como \"remarcado\", para a confirmação do dia não confirmar uma visita cancelada. Sem contato e sem desfecho, a visita quase morreu.","fonte":"Casos da era do CRM (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Você ligou e o cliente não atendeu (porta a)","texto":"Oi, [nome]! Tentei te ligar agora sobre o [empreendimento]. Te ligo de novo hoje às 18h ou amanhã às 9h, qual fica melhor?","por_que_funciona":"Deixa o próximo passo com data, que é exatamente o que o desfecho precisa registrar."},{"canal":"WhatsApp","situacao":"Última tentativa antes de registrar a perda (porta c)","texto":"[nome], percebo que agora não é o melhor momento pra você. Posso guardar o seu contato e te chamar quando aparecer uma condição que encaixe no seu perfil?","por_que_funciona":"Sai com dignidade, pede permissão e deixa a porta aberta para a base de reativação."}],"erros_que_matam":[{"erro":"Mudar o status para \"Agendado\" sem criar o agendamento","custo":"A visita não aparece na agenda, a confirmação nunca sai e o cliente não vem","correcao":"Criar o agendamento com data, hora e empreendimento"},{"erro":"Perder o cliente sem motivo, ou com \"Outro\" para limpar a carteira","custo":"O relatório fica inútil e o time não aprende onde perde","correcao":"Um dos 11 motivos, o verdadeiro"},{"erro":"Registrar desfecho sem data","custo":"O cliente vira \"sem próximo passo\" e some","correcao":"Próximo passo e data, os dois, sempre"}],"no_crm":{"tela":"Card da Fila Única","acao":"Botão de desfecho (tecla D) ou \"Criar agendamento\"","campo":"Próximo passo e data; data, hora e empreendimento; motivo da perda","regra":"Nada sai da fila sem desfecho"},"frase_ancora":"Nada sai da fila sem desfecho.","checagem_rapida":[{"pergunta":"Mudei o card para \"Agendado\". Agendei?","resposta":"Não. Agendar é criar o agendamento com data, hora e empreendimento."},{"pergunta":"O cliente comprou com outra imobiliária. Qual motivo de perda?","resposta":"\"Comprou com concorrente\"."},{"pergunta":"Por quanto tempo dá para desfazer um desfecho que não muda a etapa?","resposta":"5 segundos."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M25-A3', 3, 'Carteira ativa, Reserva e Bolsão', 'texto',
  'Sessenta e cinco. Esse é o número de clientes que cabem na sua carteira ativa. O que passa disso não some: vai para a Reserva, esperando você abrir vaga.

### Por que importa

Quem estoura o teto para de receber cliente novo pela distribuição. E carteira cheia de parado é carteira vazia de venda: em 29/09/2026, 85,7% das negociações com dono estavam paradas há 7 dias ou mais.

### O conceito

Pense na sua cozinha. A carteira ativa é a prateleira da frente: o que você vai usar hoje. A Reserva é a despensa: é sua, mas está guardada. O Bolsão é o mercado: é da casa, e quem trabalha ali é a pré-venda e o discador.

### O método SMQ, passo a passo

1. Carteira ativa: até 65 clientes ativos por corretor. O contador fica no topo da Fila Única. Estourou, você para de receber cliente novo, e nada é tirado de você.
2. Reserva: a fila de espera da sua carteira, com os seus clientes que ficaram fora do teto, agrupados por motivo (sem próximo passo, nunca engataram, parados, sem vaga hoje).
3. Para puxar um cliente da Reserva: abra a Reserva, use "Dossiê" para ler a ficha e clique em "Trazer". Só funciona com vaga, até 13 resgates.
4. Bolsão: a base geral da casa, sem dono, trabalhada pelo discador e pela pré-venda. É tela de consulta: não há botão para puxar cliente, e o telefone aparece mascarado.
5. Cuidado com a palavra: "Reserva" no CRM é a fila de espera da sua carteira. Para a unidade do cliente, diga "garantir" ou "bloquear a unidade".

### Na vida real

**O caso:** A carteira mais viva do time (set/2026).

**O que foi dito:** Um corretor da casa agenda o próximo follow-up a cada toque que faz. Nenhum cliente fica sem data.

**O que aconteceu:** Só 38% da carteira dele estava parada, enquanto a dos demais ficava entre 92% e 100%.

### Scripts prontos

#### WhatsApp · Resgatar um cliente trazido da Reserva

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. A gente conversou sobre o [empreendimento] e eu fiquei te devendo um retorno. Saiu [novidade real]. Faz sentido eu te mostrar como fica a parcela pra você?

**Por que funciona:** Assume o atraso com leveza, traz um motivo real para o contato e termina numa pergunta fácil de responder.

#### Ligação · O cliente pede "reserva a unidade pra mim?"

> Consigo garantir essa unidade pra você dentro do prazo que a construtora dá, que é [prazo]. Pra isso, a gente adianta a sua análise hoje. Você me manda os documentos agora ou prefere passar amanhã às 10h no [local da visita]?

**Por que funciona:** Usa "garantir", que não se confunde com a Reserva do CRM, é verdadeiro sobre a regra da construtora e amarra a garantia ao próximo passo. [CONFIRMAR o prazo de cada construtora]

### Erros que matam a venda

- **Dizer ao cliente "vou fazer a sua reserva"**  
  Quanto custa: Confunde com a Reserva do CRM e cria expectativa que pode não ser verdade  
  Correção: "Garantir" ou "bloquear a unidade", dentro da regra da construtora
- **Acumular 65 ativos sem próximo passo**  
  Quanto custa: Você para de receber lead novo e a carteira não gira  
  Correção: Desfecho com próximo passo ou perda com o motivo verdadeiro
- **Tentar trabalhar cliente do Bolsão por fora**  
  Quanto custa: Quebra a regra da carteira e duplica contato com a pré-venda  
  Correção: Bolsão é consulta; o seu volume vem da fila, da Reserva e da captação própria

### No CRM

- **Tela:** Reserva; contador da carteira no topo da Fila Única; Bolsão
- **Ação:** "Dossiê" e "Trazer" na Reserva
- **Campo:** Motivo de cada cliente na Reserva
- **Regra:** Trazer só com vaga, até 13 resgates; Bolsão é só consulta

### Frase-âncora

> **Carteira cheia de parado é carteira vazia de venda.**

### Checagem rápida

1. Quantos resgates a Reserva permite e em que condição?  
   Resposta: Até 13, e só com vaga na carteira ativa.
2. Posso puxar um cliente do Bolsão?  
   Resposta: Não. O Bolsão é consulta e é trabalhado pela pré-venda e pelo discador.',
  8, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Sessenta e cinco. Esse é o número de clientes que cabem na sua carteira ativa. O que passa disso não some: vai para a Reserva, esperando você abrir vaga.","por_que_importa":"Quem estoura o teto para de receber cliente novo pela distribuição. E carteira cheia de parado é carteira vazia de venda: em 29/09/2026, 85,7% das negociações com dono estavam paradas há 7 dias ou mais.","conceito":"Pense na sua cozinha. A carteira ativa é a prateleira da frente: o que você vai usar hoje. A Reserva é a despensa: é sua, mas está guardada. O Bolsão é o mercado: é da casa, e quem trabalha ali é a pré-venda e o discador.","metodo":["Carteira ativa: até 65 clientes ativos por corretor. O contador fica no topo da Fila Única. Estourou, você para de receber cliente novo, e nada é tirado de você.","Reserva: a fila de espera da sua carteira, com os seus clientes que ficaram fora do teto, agrupados por motivo (sem próximo passo, nunca engataram, parados, sem vaga hoje).","Para puxar um cliente da Reserva: abra a Reserva, use \"Dossiê\" para ler a ficha e clique em \"Trazer\". Só funciona com vaga, até 13 resgates.","Bolsão: a base geral da casa, sem dono, trabalhada pelo discador e pela pré-venda. É tela de consulta: não há botão para puxar cliente, e o telefone aparece mascarado.","Cuidado com a palavra: \"Reserva\" no CRM é a fila de espera da sua carteira. Para a unidade do cliente, diga \"garantir\" ou \"bloquear a unidade\"."],"na_vida_real":{"caso":"A carteira mais viva do time (set/2026).","o_que_foi_dito":"Um corretor da casa agenda o próximo follow-up a cada toque que faz. Nenhum cliente fica sem data.","resultado":"Só 38% da carteira dele estava parada, enquanto a dos demais ficava entre 92% e 100%.","fonte":"CRM, negociações por corretor, set/2026 (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Resgatar um cliente trazido da Reserva","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. A gente conversou sobre o [empreendimento] e eu fiquei te devendo um retorno. Saiu [novidade real]. Faz sentido eu te mostrar como fica a parcela pra você?","por_que_funciona":"Assume o atraso com leveza, traz um motivo real para o contato e termina numa pergunta fácil de responder."},{"canal":"Ligação","situacao":"O cliente pede \"reserva a unidade pra mim?\"","texto":"Consigo garantir essa unidade pra você dentro do prazo que a construtora dá, que é [prazo]. Pra isso, a gente adianta a sua análise hoje. Você me manda os documentos agora ou prefere passar amanhã às 10h no [local da visita]?","por_que_funciona":"Usa \"garantir\", que não se confunde com a Reserva do CRM, é verdadeiro sobre a regra da construtora e amarra a garantia ao próximo passo. [CONFIRMAR o prazo de cada construtora]"}],"erros_que_matam":[{"erro":"Dizer ao cliente \"vou fazer a sua reserva\"","custo":"Confunde com a Reserva do CRM e cria expectativa que pode não ser verdade","correcao":"\"Garantir\" ou \"bloquear a unidade\", dentro da regra da construtora"},{"erro":"Acumular 65 ativos sem próximo passo","custo":"Você para de receber lead novo e a carteira não gira","correcao":"Desfecho com próximo passo ou perda com o motivo verdadeiro"},{"erro":"Tentar trabalhar cliente do Bolsão por fora","custo":"Quebra a regra da carteira e duplica contato com a pré-venda","correcao":"Bolsão é consulta; o seu volume vem da fila, da Reserva e da captação própria"}],"no_crm":{"tela":"Reserva; contador da carteira no topo da Fila Única; Bolsão","acao":"\"Dossiê\" e \"Trazer\" na Reserva","campo":"Motivo de cada cliente na Reserva","regra":"Trazer só com vaga, até 13 resgates; Bolsão é só consulta"},"frase_ancora":"Carteira cheia de parado é carteira vazia de venda.","checagem_rapida":[{"pergunta":"Quantos resgates a Reserva permite e em que condição?","resposta":"Até 13, e só com vaga na carteira ativa."},{"pergunta":"Posso puxar um cliente do Bolsão?","resposta":"Não. O Bolsão é consulta e é trabalhado pela pré-venda e pelo discador."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M25-A4', 4, 'Agenda, tarefas e os dois zeros', 'texto',
  'A próxima venda está escondida no follow-up que ainda não foi feito.

### Por que importa

O cliente que prometeu voltar e não voltou é o que mais se perde. Os dois zeros garantem que ninguém dorme sem próximo passo. E o follow-up que cobra o combinado do cliente teve 54,3% de resposta em 24 horas, contra 16,8% do "ficou alguma dúvida?".

### O conceito

Pense no caixa de uma loja: todo dia ele é fechado, e se sobra diferença, alguém perdeu dinheiro. Os dois zeros são o fechamento do seu caixa: 0 follow-up vencido e 0 cliente sem próximo passo.

### O método SMQ, passo a passo

1. Toda tarefa nasce de um desfecho ou de um agendamento. É a tarefa que garante que ninguém fica sem próximo passo.
2. Trabalhe o Follow-Up › Fila do dia, um cliente por vez, registrando "Sem resposta", "Respondeu", "Agendou" ou "Descartar" (com motivo).
3. Quando o cliente dá um prazo ("mando os documentos até o fim do dia"), respeite: prazo vago vale hoje às 19h, e a cobrança cita o combinado.
4. Desfecho prometido e não cumprido é pendência, não silêncio: registre como pendência com data e cobre com contexto.
5. Placar do dia: 20 desfechos registrados, 25 clientes tocados, 2 captações próprias e 1,4 agendamento. O CRM calcula a sua meta pela sua conversão; nos primeiros dias, usa a do time.
6. Encerramento do dia: 0 follow-up vencido, 0 cliente sem próximo passo, carteira revisada e os 3 clientes mais quentes de amanhã identificados.

### Na vida real

**O caso:** Uma cliente disse ao meio-dia que conseguiria mandar os documentos "até o final do dia" (jul/2026).

**O que foi dito:** Às 15h45 ela recebeu um follow-up genérico. Em cima demais: ela ainda estava dentro do prazo que tinha dado.

**O que aconteceu:** A casa mudou a regra: prazo vago vale hoje às 19h, e a cobrança cita o combinado ("Você tinha ficado de mandar os documentos, conseguiu?"). Vale para o robô e para o corretor.

### Scripts prontos

#### WhatsApp · Cobrar o que o cliente combinou

> Oi, [nome]! Você tinha ficado de [mandar os documentos], conseguiu? Se precisar de alguma coisa da minha parte, eu destravo rapidinho.

**Por que funciona:** Lembra o compromisso do próprio cliente, sem cobrança pesada. Esse formato fez 37,1% dos clientes avançarem em 7 dias, contra 4,7% do "ficou alguma dúvida?".

### Erros que matam a venda

- **Deixar o follow-up vencer e "compensar amanhã"**  
  Quanto custa: Vira bola de neve: amanhã tem os de hoje e os de ontem  
  Correção: Os dois zeros antes de encerrar o dia
- **Mandar "ficou alguma dúvida?"**  
  Quanto custa: 4,7% de avanço; o cliente responde "depois"  
  Correção: Cobrar o combinado ou trazer uma novidade real
- **Cobrar antes do prazo que o cliente deu**  
  Quanto custa: Irrita e queima a relação  
  Correção: Prazo do cliente suspende a régua

### No CRM

- **Tela:** Follow-Up › Fila do dia; Agenda e Tarefas; funil em quadro
- **Ação:** Registrar o toque e conferir vencidos e "sem próximo passo" antes de encerrar
- **Campo:** Próximo passo e data de cada cliente
- **Regra:** Toda tarefa nasce de um desfecho ou de um agendamento

### Frase-âncora

> **Dois zeros no fim do dia: 0 vencido, 0 sem próximo passo.**

### Checagem rápida

1. Quais são os dois zeros do fim do dia?  
   Resposta: 0 follow-up vencido e 0 cliente sem próximo passo.
2. O cliente disse "mando mais tarde". Quando cobrar?  
   Resposta: Hoje às 19h, citando o combinado.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"A próxima venda está escondida no follow-up que ainda não foi feito.","por_que_importa":"O cliente que prometeu voltar e não voltou é o que mais se perde. Os dois zeros garantem que ninguém dorme sem próximo passo. E o follow-up que cobra o combinado do cliente teve 54,3% de resposta em 24 horas, contra 16,8% do \"ficou alguma dúvida?\".","conceito":"Pense no caixa de uma loja: todo dia ele é fechado, e se sobra diferença, alguém perdeu dinheiro. Os dois zeros são o fechamento do seu caixa: 0 follow-up vencido e 0 cliente sem próximo passo.","metodo":["Toda tarefa nasce de um desfecho ou de um agendamento. É a tarefa que garante que ninguém fica sem próximo passo.","Trabalhe o Follow-Up › Fila do dia, um cliente por vez, registrando \"Sem resposta\", \"Respondeu\", \"Agendou\" ou \"Descartar\" (com motivo).","Quando o cliente dá um prazo (\"mando os documentos até o fim do dia\"), respeite: prazo vago vale hoje às 19h, e a cobrança cita o combinado.","Desfecho prometido e não cumprido é pendência, não silêncio: registre como pendência com data e cobre com contexto.","Placar do dia: 20 desfechos registrados, 25 clientes tocados, 2 captações próprias e 1,4 agendamento. O CRM calcula a sua meta pela sua conversão; nos primeiros dias, usa a do time.","Encerramento do dia: 0 follow-up vencido, 0 cliente sem próximo passo, carteira revisada e os 3 clientes mais quentes de amanhã identificados."],"na_vida_real":{"caso":"Uma cliente disse ao meio-dia que conseguiria mandar os documentos \"até o final do dia\" (jul/2026).","o_que_foi_dito":"Às 15h45 ela recebeu um follow-up genérico. Em cima demais: ela ainda estava dentro do prazo que tinha dado.","resultado":"A casa mudou a regra: prazo vago vale hoje às 19h, e a cobrança cita o combinado (\"Você tinha ficado de mandar os documentos, conseguiu?\"). Vale para o robô e para o corretor.","fonte":"Regra \"prazo do cliente suspende a régua\", 20/07/2026 (seção 9.6)"},"scripts":[{"canal":"WhatsApp","situacao":"Cobrar o que o cliente combinou","texto":"Oi, [nome]! Você tinha ficado de [mandar os documentos], conseguiu? Se precisar de alguma coisa da minha parte, eu destravo rapidinho.","por_que_funciona":"Lembra o compromisso do próprio cliente, sem cobrança pesada. Esse formato fez 37,1% dos clientes avançarem em 7 dias, contra 4,7% do \"ficou alguma dúvida?\"."}],"erros_que_matam":[{"erro":"Deixar o follow-up vencer e \"compensar amanhã\"","custo":"Vira bola de neve: amanhã tem os de hoje e os de ontem","correcao":"Os dois zeros antes de encerrar o dia"},{"erro":"Mandar \"ficou alguma dúvida?\"","custo":"4,7% de avanço; o cliente responde \"depois\"","correcao":"Cobrar o combinado ou trazer uma novidade real"},{"erro":"Cobrar antes do prazo que o cliente deu","custo":"Irrita e queima a relação","correcao":"Prazo do cliente suspende a régua"}],"no_crm":{"tela":"Follow-Up › Fila do dia; Agenda e Tarefas; funil em quadro","acao":"Registrar o toque e conferir vencidos e \"sem próximo passo\" antes de encerrar","campo":"Próximo passo e data de cada cliente","regra":"Toda tarefa nasce de um desfecho ou de um agendamento"},"frase_ancora":"Dois zeros no fim do dia: 0 vencido, 0 sem próximo passo.","checagem_rapida":[{"pergunta":"Quais são os dois zeros do fim do dia?","resposta":"0 follow-up vencido e 0 cliente sem próximo passo."},{"pergunta":"O cliente disse \"mando mais tarde\". Quando cobrar?","resposta":"Hoje às 19h, citando o combinado."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M25-A5', 5, 'Atalhos que devolvem uma hora por dia', 'texto',
  'Quarenta clientes por dia. Se cada um custar 30 segundos a mais de clique, são 20 minutos jogados fora. Todos os dias.

### Por que importa

Velocidade operacional vira mais toques, e mais toques viram mais agendamentos. O placar pede 25 clientes tocados por dia: sem atalho, não cabe.

### O conceito

É a caixa de ferramentas do mecânico: quem sabe onde está cada ferramenta termina o serviço antes e melhor. No CRM, os atalhos são as suas ferramentas.

### O método SMQ, passo a passo

1. ⌘K (ou Ctrl+K): busca global de cliente, projeto e tela, e acesso a "Registrar venda".
2. ⌘J (ou Ctrl+J): abre a SamiQ, que resume o cliente, sugere a mensagem e tira dúvida do projeto.
3. Na fila: ← → para navegar, W para abrir o WhatsApp, L para ligar e D para registrar o desfecho.
4. F: abre o Modo Foco na base de leads, um cliente por vez.
5. ?: lista todos os atalhos da tela; [ recolhe ou expande o menu lateral. No celular, use a barra inferior de atalhos.

### Na vida real

**O caso:** O fechamento do treinamento do CRM de set/2026.

**O que foi dito:** O treinamento terminou com três números para sair da sala: 2 captações por dia, 20 desfechos por dia e 0 vencidos no fim do dia.

**O que aconteceu:** Com os atalhos, 20 desfechos cabem num dia de trabalho sem virar maratona de cliques.

### Scripts prontos

#### SamiQ (⌘J) · Preparar uma ligação em 30 segundos

> Resuma este cliente em 3 linhas: o que ele procura, em que etapa está e o que ficou combinado. Sugira a próxima mensagem terminando com duas opções de horário.

**Por que funciona:** Economiza a leitura da conversa inteira. A sugestão é rascunho: você revisa antes de enviar e responde pelo que envia.

### Erros que matam a venda

- **Procurar cliente rolando a lista**  
  Quanto custa: Minutos perdidos a cada busca  
  Correção: ⌘K
- **Conversar pelo WhatsApp pessoal, fora do card**  
  Quanto custa: A conversa não fica na linha do tempo do cliente  
  Correção: Botão W do card
- **Enviar a sugestão da SamiQ sem revisar**  
  Quanto custa: Mensagem genérica ou errada com o seu nome  
  Correção: Sugestão da IA é rascunho: revise sempre

### No CRM

- **Tela:** Qualquer tela
- **Ação:** Usar ⌘K, ⌘J, F, ? e os atalhos da fila
- **Campo:** Não se aplica
- **Regra:** Atalhos da fila: ← → W L D

### Frase-âncora

> **Clique a menos, cliente a mais.**

### Checagem rápida

1. Qual atalho abre a SamiQ?  
   Resposta: ⌘J (ou Ctrl+J).
2. Na fila, qual tecla abre o desfecho?  
   Resposta: D.',
  7, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Quarenta clientes por dia. Se cada um custar 30 segundos a mais de clique, são 20 minutos jogados fora. Todos os dias.","por_que_importa":"Velocidade operacional vira mais toques, e mais toques viram mais agendamentos. O placar pede 25 clientes tocados por dia: sem atalho, não cabe.","conceito":"É a caixa de ferramentas do mecânico: quem sabe onde está cada ferramenta termina o serviço antes e melhor. No CRM, os atalhos são as suas ferramentas.","metodo":["⌘K (ou Ctrl+K): busca global de cliente, projeto e tela, e acesso a \"Registrar venda\".","⌘J (ou Ctrl+J): abre a SamiQ, que resume o cliente, sugere a mensagem e tira dúvida do projeto.","Na fila: ← → para navegar, W para abrir o WhatsApp, L para ligar e D para registrar o desfecho.","F: abre o Modo Foco na base de leads, um cliente por vez.","?: lista todos os atalhos da tela; [ recolhe ou expande o menu lateral. No celular, use a barra inferior de atalhos."],"na_vida_real":{"caso":"O fechamento do treinamento do CRM de set/2026.","o_que_foi_dito":"O treinamento terminou com três números para sair da sala: 2 captações por dia, 20 desfechos por dia e 0 vencidos no fim do dia.","resultado":"Com os atalhos, 20 desfechos cabem num dia de trabalho sem virar maratona de cliques.","fonte":"Treinamento do CRM SMQ, set/2026"},"scripts":[{"canal":"SamiQ (⌘J)","situacao":"Preparar uma ligação em 30 segundos","texto":"Resuma este cliente em 3 linhas: o que ele procura, em que etapa está e o que ficou combinado. Sugira a próxima mensagem terminando com duas opções de horário.","por_que_funciona":"Economiza a leitura da conversa inteira. A sugestão é rascunho: você revisa antes de enviar e responde pelo que envia."}],"erros_que_matam":[{"erro":"Procurar cliente rolando a lista","custo":"Minutos perdidos a cada busca","correcao":"⌘K"},{"erro":"Conversar pelo WhatsApp pessoal, fora do card","custo":"A conversa não fica na linha do tempo do cliente","correcao":"Botão W do card"},{"erro":"Enviar a sugestão da SamiQ sem revisar","custo":"Mensagem genérica ou errada com o seu nome","correcao":"Sugestão da IA é rascunho: revise sempre"}],"no_crm":{"tela":"Qualquer tela","acao":"Usar ⌘K, ⌘J, F, ? e os atalhos da fila","campo":"Não se aplica","regra":"Atalhos da fila: ← → W L D"},"frase_ancora":"Clique a menos, cliente a mais.","checagem_rapida":[{"pergunta":"Qual atalho abre a SamiQ?","resposta":"⌘J (ou Ctrl+J)."},{"pergunta":"Na fila, qual tecla abre o desfecho?","resposta":"D."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q01', 1, 'situacional',
  'A fila abre com um cliente em análise parado há 12 dias. Logo abaixo, um lead que chegou há 3 minutos. O que você faz?',
  '["Começa pelo lead novo e deixa o cliente em análise para o fim do dia, porque lead novo é mais fácil de converter.","Liga para o lead novo (a meta é 5 minutos e a tentativa leva 2), registra o desfecho e volta na hora para o cliente em análise, que é o topo da fila.","Pula os dois e começa pelos follow-ups de hoje.","Trabalha o cliente em análise com calma e liga para o lead novo quando terminar, desde que dentro dos 15 minutos."]'::jsonb,
  1,
  'A B segue as duas regras da casa: lead novo tem prioridade sempre, com meta de 5 minutos (decisão do diretor, 29/09/2026), e a tentativa leva 2 minutos; depois você volta ao topo da fila, o fundo do funil parado, onde está o dinheiro. A A abandona o cliente mais caro até o fim do dia. A C inverte a ordem de risco. A D trata o limite de 15 minutos do sistema como meta e deixa o lead novo esfriar.',
  'M25-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q02', 2, 'situacional',
  'Você ligou e o cliente não atendeu. O que registrar?',
  '["Nada, porque não houve conversa.","Mudar o card para \"Aguardando retorno\" sem data.","O desfecho \"não atendeu\", o WhatsApp em até 2 minutos e o próximo passo com data.","Marcar como perdido com o motivo \"Sumiu\"."]'::jsonb,
  2,
  'A C cumpre a regra dos primeiros minutos e a porta (a): desfecho com próximo passo e data. A A tira o cliente do radar. A B muda status sem próximo passo, e ele vira "sem próximo passo". A D perde um cliente depois de uma única tentativa.',
  'M25-A2; M26', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q03', 3, 'situacional',
  'O cliente topou visitar no sábado às 10h. Qual é a porta de saída certa?',
  '["Criar o agendamento com data, hora e empreendimento.","Mudar o card para \"Agendado\".","Anotar na observação da ficha.","Mandar mensagem ao gerente avisando."]'::jsonb,
  0,
  'A A é a porta (b): o agendamento criado aparece na agenda e dispara a confirmação. A B é o erro clássico: mudar o status não é agendar. A C e a D deixam a visita fora da agenda e sem confirmação.',
  'M25-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q04', 4, 'situacional',
  'O cliente responde: "Comprei com outra imobiliária, obrigado." Qual desfecho?',
  '["Perdido com o motivo \"Adiou a decisão\".","Perdido com o motivo \"Outro\", sem descrever.","Desfecho com próximo passo para daqui a 30 dias.","Perdido com o motivo \"Comprou com concorrente\"."]'::jsonb,
  3,
  'A D registra o motivo verdadeiro, o que deixa o relatório comparável e ensina o time. A A é falsa. A B esconde a informação. A C mantém na carteira um cliente que já comprou, ocupando vaga.',
  'M25-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q05', 5, 'situacional',
  'Numa quinta-feira, o cliente diz: "Me chama semana que vem." O que você registra?',
  '["Nada: ele que vai chamar.","O desfecho com o próximo passo na data combinada, em até 3 dias, e a cobrança citando o combinado.","Uma mensagem no dia seguinte perguntando se ele pensou.","Perdido com o motivo \"Adiou a decisão\"."]'::jsonb,
  1,
  'A B respeita o prazo do cliente (prazo longo tem teto de 3 dias, e segunda-feira cabe nele) e registra o próximo passo com data. A A deixa a iniciativa com o cliente. A C atropela o prazo que ele deu. A D perde um cliente que só pediu tempo.',
  'M25-A4; seção 9.6', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q06', 6, 'situacional',
  'A sua carteira bateu 65 ativos e 20 deles estão sem próximo passo há semanas. O que fazer?',
  '["Pedir ao gerente para aumentar o teto.","Marcar os 20 como perdidos com o motivo \"Outro\".","Trabalhar os 20: desfecho com próximo passo ou perda com o motivo verdadeiro, abrindo vaga para receber lead novo.","Esperar a distribuição voltar sozinha."]'::jsonb,
  2,
  'A C resolve a causa: carteira com próximo passo gira e abre vaga. A A tenta mudar a regra em vez de trabalhar a carteira. A B perde clientes sem critério e suja o relatório. A D não acontece: quem estoura o teto para de receber cliente novo.',
  'M25-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q07', 7, 'situacional',
  'O cliente pede: "Reserva essa unidade pra mim?" Como você responde?',
  '["\"Consigo garantir essa unidade dentro do prazo da construtora. Pra isso, a gente adianta a sua análise hoje.\"","\"Pode deixar, vou colocar na minha Reserva.\"","\"Reservado! Ninguém mais compra.\"","\"Não existe reserva, só comprando.\""]'::jsonb,
  0,
  'A A usa "garantir", é verdadeira sobre a regra da construtora e amarra o próximo passo. A B confunde o cliente com a Reserva do CRM, que é a fila de espera da sua carteira. A C promete algo que pode não ser verdade. A D é seca e perde a chance de avançar.',
  'M25-A3; seção 3', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q08', 8, 'situacional',
  'São 19h. Você tem 3 follow-ups vencidos e 2 clientes sem próximo passo. O que fazer antes de encerrar?',
  '["Encerrar e fazer tudo amanhã cedo.","Resolver os 5: tocar os vencidos e registrar desfecho com próximo passo e data nos que estão sem.","Apagar as tarefas vencidas.","Mudar os 5 para \"Aguardando retorno\"."]'::jsonb,
  1,
  'A B fecha o dia com os dois zeros. A A cria bola de neve. A C some com o compromisso sem falar com o cliente. A D muda status sem próximo passo, o que não resolve nada.',
  'M25-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q09', 9, 'aplicacao',
  'Qual lista mostra as três primeiras prioridades da Fila Única, na ordem certa?',
  '["Chegaram agora, pasta travada, esfriando.","Follow-up vencido, sem próximo passo, chegaram agora.","Esfriando, fundo do funil parado, cliente respondeu.","Fundo do funil parado, chegaram agora, cliente respondeu e espera."]'::jsonb,
  3,
  'A D é a ordem oficial do risco: primeiro onde o dinheiro está (agendado, visita e análise), depois o lead com o prazo correndo, depois quem falou por último. As outras misturam prioridades de posições mais baixas (esfriando é a 6ª; pasta travada, a 7ª).',
  'M25-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q10', 10, 'aplicacao',
  'Quantos resgates a Reserva permite, e em que condição?',
  '["Até 13, e só com vaga na carteira ativa.","Ilimitados, a qualquer hora.","Até 65, um por dia.","Nenhum: a Reserva é só consulta."]'::jsonb,
  0,
  'A A é a regra: "Trazer" só com vaga, até 13 resgates. A B e a C inventam limites. A D confunde a Reserva com o Bolsão, que é só consulta.',
  'M25-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q11', 11, 'aplicacao',
  'Você registrou um desfecho errado que não muda a etapa do cliente. Quanto tempo tem para desfazer?',
  '["1 minuto.","Até o fim do dia.","5 segundos.","Não dá para desfazer."]'::jsonb,
  2,
  'A C está certa: desfecho que não muda a etapa tem "Desfazer" por 5 segundos. Os que mudam a etapa (visita, venda, perda) não têm e por isso pedem confirmação e dados. As outras alternativas inventam prazos.',
  'M25-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q12', 12, 'aplicacao',
  'Qual é o placar do dia do CRM?',
  '["10 ligações e 5 mensagens.","20 desfechos registrados, 25 clientes tocados, 2 captações próprias e 1,4 agendamento.","7 contatos novos e 1 visita.","40 clientes da fila e 3 vendas."]'::jsonb,
  1,
  'A B é o placar oficial de set/2026, calculado pela conversão do próprio corretor (nos primeiros dias, pela do time). A A e a C vêm de materiais antigos que o CRM substituiu. A D confunde o limite da fila (40 clientes) com meta e inventa vendas diárias.',
  'M25-A4; seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q13', 13, 'aplicacao',
  'Na fila, o que quer dizer "esfriando"?',
  '["Cliente frio há 30 dias.","Cliente que disse \"não tenho interesse\".","Cliente que esgotou os 13 toques.","Cliente quente ou morno sem contato há 3 dias ou mais."]'::jsonb,
  3,
  'A D é a definição da prioridade 6. A A descreve temperatura, não a prioridade. A B é caso de desfecho ou perda com motivo. A C é a aba "Esgotados" do Follow-Up, que vai para a sua decisão.',
  'M25-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q14', 14, 'aplicacao',
  'Qual tecla abre o Modo Foco na base de leads?',
  '["W.","L.","F.","D."]'::jsonb,
  2,
  'A C está certa: F abre o Modo Foco, um cliente por vez. W abre o WhatsApp, L liga e D registra o desfecho, todos atalhos da fila. Saber os quatro economiza minutos em cada card.',
  'M25-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q15', 15, 'conceito',
  'Quais são as três portas de saída de um card da fila?',
  '["Desfecho com próximo passo e data; agendamento criado; perdido com motivo.","Ligação, WhatsApp e e-mail.","Quente, morno e frio.","Desfecho, fechar a tela e transferir."]'::jsonb,
  0,
  'A A são as três portas oficiais; "não existe a porta (d) fechei a tela". A B lista canais de contato. A C lista temperaturas. A D inclui justamente a porta que não existe.',
  'M25-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q16', 16, 'conceito',
  'Complete a regra do CRM: "Toda tarefa nasce de..."',
  '["\"...uma ordem do gerente.\"","\"...um desfecho ou de um agendamento.\"","\"...uma mensagem do cliente.\"","\"...uma mudança de status.\""]'::jsonb,
  1,
  'A B é a regra: é a tarefa, nascida do desfecho ou do agendamento, que garante que ninguém fica sem próximo passo. A A, a C e a D descrevem coisas que podem acontecer, mas não criam tarefa sozinhas; mudança de status, inclusive, não conta nem como toque.',
  'M25-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q17', 17, 'conceito',
  'O que é o Bolsão?',
  '["A fila de espera da sua carteira.","A lista de clientes que você perdeu.","O prêmio mensal do ranking.","A base geral da casa, sem dono, trabalhada pela pré-venda e pelo discador; para o corretor, é só consulta, com telefone mascarado."]'::jsonb,
  3,
  'A D é a definição do manual do CRM: o Bolsão é a base da casa, sem dono, e quem trabalha nela é a pré-venda com o discador. A A descreve a Reserva, que é sua. A B e a C não existem com esse nome no CRM: cliente perdido fica na etapa Perdido, com o motivo.',
  'M25-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q18', 18, 'conceito',
  'O que conta como toque na régua de follow-up?',
  '["Só contato ativo feito por você: ligação, WhatsApp, visita, e-mail, reunião ou SMS.","Qualquer nota escrita na ficha.","Mudar o card de etapa.","Abrir a ficha do cliente."]'::jsonb,
  0,
  'A A está certa: só interação real conta. Nota (B), mudança de status (C) e abrir a ficha (D) não falam com o cliente e não contam como toque.',
  'Seção 9.6', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q19', 19, 'caca_ao_erro',
  'Um corretor diz: "Mudei o card pra Agendado, então a confirmação vai sair sozinha." Qual é o erro?',
  '["Nenhum: a confirmação sai automaticamente.","O erro é não ter avisado o gerente.","Mudar o status não é agendar: sem o agendamento criado, com data, hora e empreendimento, a visita não aparece na agenda e a confirmação não sai.","O erro é ter agendado no sábado."]'::jsonb,
  2,
  'A C descreve o erro que o treinamento do CRM mais combate. A A repete o engano. A B e a D apontam detalhes que não são o problema: o gerente não cria a confirmação, e o dia da visita não importa se ela não existe na agenda.',
  'M25-A2; Treinamento do CRM, módulo 6', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M25-Q20', 20, 'caca_ao_erro',
  'Um corretor conta: "Registrei perdido em 10 clientes com o motivo Outro, pra limpar a carteira." Qual é o erro?',
  '["Nenhum: limpar a carteira é bom.","Perder sem o motivo verdadeiro: os 11 motivos existem para o relatório ser comparável, e clientes com chance deveriam ter próximo passo, não perda.","O erro é ter perdido só 10.","O erro é não ter usado o motivo \"Sumiu\"."]'::jsonb,
  1,
  'A B aponta os dois problemas: motivo falso e perda sem critério. A A ignora que "Outro" exige descrição e esconde por que a casa perde. A C piora o erro. A D troca uma mentira por outra, a menos que o cliente de fato tenha sumido.',
  'M25-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (13)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F01', 1, 'Regra da fila', '"Você não escolhe o cliente. A fila escolhe." Comece pelo mais caro, de cima para baixo, sem pular.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F02', 2, 'Prioridade 1', 'Fundo do funil parado: agendado, visita e análise.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F03', 3, 'Prioridade 2', 'Chegaram agora: meta de 5 minutos (limite do sistema: 15). Lead novo interrompe qualquer tarefa.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F04', 4, 'Limite diário da fila', 'Até 40 clientes por dia.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F05', 5, 'As 3 portas de saída', 'Desfecho com próximo passo e data; agendamento criado; perdido com motivo.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F06', 6, 'Mudar o status é agendar?', 'Não. Agendar é criar o agendamento com data, hora e empreendimento.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F07', 7, 'Desfazer desfecho', '5 segundos, só para desfecho que não muda a etapa.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F08', 8, 'Teto da carteira', '65 clientes ativos.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F09', 9, 'Reserva do CRM', 'A fila de espera da sua carteira. "Trazer" só com vaga, até 13 resgates.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F10', 10, 'Bolsão', 'Base geral sem dono. Só consulta, telefone mascarado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F11', 11, 'Os dois zeros', '0 follow-up vencido e 0 cliente sem próximo passo no fim do dia.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F12', 12, 'Placar do dia', '20 desfechos, 25 clientes tocados, 2 captações próprias, 1,4 agendamento.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M25-F13', 13, 'Atalhos da fila', '← → navegar, W WhatsApp, L ligar, D desfecho. F abre o Modo Foco.', true
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No primeiro dia, sente ao lado do corretor por 30 minutos e façam juntos os 10 primeiros cards (a prática). Na reunião de segunda, olhe quantos dias da semana cada um fechou com os dois zeros e celebre quem fechou todos.","sinais_de_dificuldade":["Follow-ups vencidos acumulando de um dia para o outro.","Cards movidos para \"Agendado\" sem agendamento criado na agenda.","Muitas perdas com o motivo \"Outro\" no mesmo dia."],"perguntas_de_coaching":["Por que aquele card estava em primeiro lugar na sua fila hoje?","Qual foi a porta de saída desse cliente, e por que essa?","O que te impediu de fechar o dia com os dois zeros, e o que muda amanhã?"],"ritual_de_celebracao":"Conquista \"Semana dos dois zeros\" no All Hands quinzenal; categoria CRM Champion no LEGADO mensal."}}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M25' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
