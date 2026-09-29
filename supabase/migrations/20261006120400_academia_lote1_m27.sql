-- ===========================================================================
-- ACADEMIA SMQ · LOTE 1 (v1.1) · seed do módulo M27
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
  ('M27', 27, 0, 'Receber o lead: handoff do robô, da pré-venda e da rota direta', 'Ao final, você lê o dossiê em 60 segundos, continua a conversa de onde o robô ou a pré-venda parou, sem repetir perguntas, e fecha um dos 2 caminhos (visita ou análise com documento), e isso aparece no CRM como handoff com status de trabalho em até 5 minutos (limite do sistema: 15) e desfecho registrado.',
   '["Eu sou capaz de dizer o que cada agente de IA da casa faz e o que ele já fez com o meu cliente.","Eu sou capaz de ler um dossiê em 60 segundos e identificar o que falta perguntar (entrada, FGTS, restrição e momento).","Eu sou capaz de reconhecer os três tipos de chegada (robô, pré-venda e rota direta) e agir de forma diferente em cada um.","Eu sou capaz de escrever a mensagem de continuidade e a primeira frase da ligação sem repetir perguntas.","Eu sou capaz de cobrir os pontos cegos: robô pausado, cliente que escreve depois do handoff, dossiê errado e número de quem vai ligar."]'::jsonb, 0.9, '55 min', true,
   '**Laboratório de dossiês (individual, com gabarito)** · 30 min

**Papéis:** O corretor recebe os 5 dossiês; o gerente corrige com o gabarito.

**Persona:** Cinco dossiês fictícios montados a partir de situações reais

**Roteiro:** Para cada dossiê, o corretor escreve: a mensagem de continuidade (se o cliente não atender), a primeira frase da ligação e o desfecho que registraria no CRM, com o próximo passo.

**Roteiro do cliente:**

- Dossiê 1: Cliente A, casal, renda somada em torno de R$ 4.500, quer morar na Zona Leste, temperatura QUENTE, motivo do handoff: visita marcada para sábado às 10h.
- Dossiê 2: Cliente B, entregador de aplicativo, renda em torno de R$ 2.800, mandou RG e 3 extratos, temperatura PRONTO, motivo: análise com documento.
- Dossiê 3: Cliente C, quer conhecer antes de mandar qualquer documento, temperatura QUENTE, motivo: análise sem documento por escolha.
- Dossiê 4: Cliente D, lead de campanha que caiu direto na roleta, resumo vazio.
- Dossiê 5: Cliente E, marca [RESTRIÇÃO] nas observações e a frase "consigo mandar os documentos até o fim do dia", dita às 12h.

**O que o observador procura:**

- Nenhuma pergunta repetida do que o dossiê já traz.
- Um dos 2 caminhos proposto em cada dossiê em que o cliente está qualificado.
- Nenhuma promessa sobre crédito, principalmente no dossiê 5.
- O número de quem vai ligar e as âncoras antigolpe na primeira mensagem.
- Desfecho com próximo passo e data em todos os 5.

**Rubrica:** Padrão SMQ, critérios 1 (abertura e conexão), 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Abertura e conexão: personalização, nome, prova de que leu o cadastro","peso":1},{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 1 v1.1 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Se a checagem com o cliente 24 horas depois do handoff já está no ar. | [CALIBRAR] Meta de 100% dos handoffs com continuidade em até 5 minutos e desfecho registrado. | [CONFIRMAR] Documentos exigidos para renda de aplicativo com o correspondente (gabarito do dossiê 2).', '{"formato":"canonico-8.2","lote":1,"versao_conteudo":"1.1","trilha":"T0","ordem":4,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"O cliente já conversou com a gente. Continue a conversa, não comece outra.","duracao_min":55,"por_que_vale_dinheiro":{"texto":"O robô entrega o cliente qualificado, mas só 36,7% desses handoffs ganham algum status de trabalho do corretor no CRM. Quando o corretor registra o trabalho, o cliente avança 15,2% das vezes; quando não registra, 1,8%. O lead mais caro da casa é o que chegou conversado e ninguém continuou.","numero":"36,7% dos handoffs com status de trabalho; 15,2% de avanço com registro contra 1,8% sem","fonte":"Conversas do robô cruzadas com o CRM","periodo":"jul a set/2026"},"pre_requisitos":["M00","M25","M26"],"indicador_crm":{"nome":"Handoffs com status de trabalho do corretor e tempo pós-handoff","onde_ler":"Base de leads filtrada por origem do robô ou da pré-venda e etapa \"Qualificação Corretor\"; linha do tempo do cliente; Operação › Relatórios › Time › \"Tempo de 1ª resposta\" para o time","linha_de_base":"36,7% dos handoffs com status de trabalho; quando há status, mediana de 8 minutos (jul a set/2026)","meta_sugerida":"100% dos handoffs com continuidade em até 5 minutos e desfecho registrado [CALIBRAR]","fonte":"Conversas do robô cruzadas com o stream de status do CRM (jul a set/2026)","gap_de_crm":false},"pratica":{"tipo":"Laboratório de dossiês (individual, com gabarito)","duracao_min":30,"persona":"Cinco dossiês fictícios montados a partir de situações reais","rubrica":"Padrão SMQ, critérios 1 (abertura e conexão), 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"O corretor recebe os 5 dossiês; o gerente corrige com o gabarito.","roteiro":"Para cada dossiê, o corretor escreve: a mensagem de continuidade (se o cliente não atender), a primeira frase da ligação e o desfecho que registraria no CRM, com o próximo passo.","roteiro_cliente":["Dossiê 1: Cliente A, casal, renda somada em torno de R$ 4.500, quer morar na Zona Leste, temperatura QUENTE, motivo do handoff: visita marcada para sábado às 10h.","Dossiê 2: Cliente B, entregador de aplicativo, renda em torno de R$ 2.800, mandou RG e 3 extratos, temperatura PRONTO, motivo: análise com documento.","Dossiê 3: Cliente C, quer conhecer antes de mandar qualquer documento, temperatura QUENTE, motivo: análise sem documento por escolha.","Dossiê 4: Cliente D, lead de campanha que caiu direto na roleta, resumo vazio.","Dossiê 5: Cliente E, marca [RESTRIÇÃO] nas observações e a frase \"consigo mandar os documentos até o fim do dia\", dita às 12h."],"observador_procura":["Nenhuma pergunta repetida do que o dossiê já traz.","Um dos 2 caminhos proposto em cada dossiê em que o cliente está qualificado.","Nenhuma promessa sobre crédito, principalmente no dossiê 5.","O número de quem vai ligar e as âncoras antigolpe na primeira mensagem.","Desfecho com próximo passo e data em todos os 5."]},"desafio_campo":{"tarefa":"Os próximos 5 handoffs (do robô, da pré-venda ou da rota direta) com continuidade em até 5 minutos, sem repetir perguntas do dossiê, e com desfecho registrado.","prazo_horas":72,"evidencia_no_crm":"Status de trabalho e desfecho registrados em cada um dos 5 clientes, com o horário na linha do tempo.","como_o_gestor_confere":"Filtra a base de leads pela origem e pela etapa \"Qualificação Corretor\" do corretor e confere, cliente a cliente, a hora da chegada, a hora do primeiro contato e o desfecho. Escolhe um dos cinco e lê a conversa para ver se houve pergunta repetida."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":4,"quem_grava":"O diretor, com a tela do CRM","cenario":"Escritório, com a ficha de um cliente fictício aberta","blocos":[{"tempo":"0:00","fala":"Esse cliente já trocou 11 mensagens com a gente. Se você perguntar tudo de novo, ele vai embora.","na_tela":"Conversa do robô (fictícia)"},{"tempo":"0:25","fala":"Só um terço dos clientes que o robô entrega aparece como trabalhado. Quem registra o trabalho faz o cliente avançar 8 vezes mais.","na_tela":"36,7% e 15,2% contra 1,8%"},{"tempo":"0:55","fala":"Leia o dossiê em 60 segundos: perfil, motivo do handoff, observações e as últimas mensagens.","na_tela":"Dossiê destacado por partes"},{"tempo":"1:50","fala":"Três chegadas: do robô, da pré-venda e da rota direta. Resumo vazio? Você é o primeiro contato.","na_tela":"Três cards lado a lado"},{"tempo":"2:40","fala":"E os pontos cegos: o robô pausa quando você assume. Mande o número de quem vai ligar. Responda quem escreve depois.","na_tela":"Mensagem com número e âncoras antigolpe"},{"tempo":"3:30","fala":"O robô abre a porta. Quem leva o cliente até a chave é você.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 9.1, 9.3, 9.4, 9.11, 9.12 e 9.17 do super prompt","Prompt do agente Marquinhos (escada e regras de handoff)","Manual do CRM, cap. 07 (pré-venda)"],"origem":"SMQ","pendencias":["[CONFIRMAR] Se a checagem com o cliente 24 horas depois do handoff já está no ar.","[CALIBRAR] Meta de 100% dos handoffs com continuidade em até 5 minutos e desfecho registrado.","[CONFIRMAR] Documentos exigidos para renda de aplicativo com o correspondente (gabarito do dossiê 2)."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M27-A1', 'M27-A2', 'M27-A3', 'M27-A4'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 4;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M27-Q01', 'M27-Q02', 'M27-Q03', 'M27-Q04', 'M27-Q05', 'M27-Q06', 'M27-Q07', 'M27-Q08', 'M27-Q09', 'M27-Q10', 'M27-Q11', 'M27-Q12', 'M27-Q13', 'M27-Q14', 'M27-Q15', 'M27-Q16', 'M27-Q17', 'M27-Q18', 'M27-Q19', 'M27-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M27-F01', 'M27-F02', 'M27-F03', 'M27-F04', 'M27-F05', 'M27-F06', 'M27-F07', 'M27-F08', 'M27-F09', 'M27-F10', 'M27-F11', 'M27-F12');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 12;

-- 3. Aulas (4)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M27-A1', 1, 'Quem já falou com o seu cliente', 'texto',
  'Antes de chegar até você, o seu cliente pode ter trocado 11 mensagens com a gente. A mediana entre a primeira mensagem do robô e o handoff é de 1,6 hora. Você não está começando uma conversa. Está entrando no meio dela.

### Por que importa

Quem não sabe o que o robô já fez repete perguntas, contradiz o que foi combinado e perde a confiança que o robô construiu. O cliente sente que falou com a parede.

### O conceito

É uma troca de turno num hospital: o médico que chega lê o prontuário antes de entrar no quarto. O dossiê é o prontuário do seu cliente.

### O método SMQ, passo a passo

1. Marquinhos: o agente de WhatsApp. Segue uma escada: N0 abertura (confirmar o interesse), N1 qualificar (no mínimo renda, região, primeiro imóvel, morar ou investir e decisor), N2 eleger o próximo passo, N3 fechar (lista de documentos enviada ou dia e hora da visita) e N4 handoff.
2. O handoff só acontece com desfecho (visita marcada, análise com documento ou análise sem documento por escolha do cliente) ou em saída antecipada: pediu humano, pergunta sensível, saque-aniversário do FGTS, reclamação ou documento que já indica fechamento.
3. Souza faz o follow-up automático; Marques reativa a base parada; Quésia classifica as respostas da reativação; Vitor confirma as visitas na véspera às 18h30 e no dia às 08h45.
4. Marcão monta o dossiê com o orçamento calculado (parcela, financiamento e teto do imóvel); Célio faz a simulação estimada de crédito; Marta audita as conversas e propõe aprendizados.
5. SamiQ é o seu copiloto no CRM (⌘J): resume o cliente, sugere mensagem e tira dúvida de produto. A sugestão é rascunho.
6. Quando você assume, o robô pausa para aquele telefone: daqui para frente, quem responde é você.

### Na vida real

**O caso:** Conversas do robô até o handoff (jun a set/2026).

**O que foi dito:** Até o handoff, a mediana foi de 11 mensagens do cliente e 8 do robô, em cerca de 1,6 hora.

**O que aconteceu:** Uma qualificação completa cabe numa conversa curta, e o cliente espera que o corretor saiba o que ele já contou.

### Scripts prontos

#### WhatsApp · Mensagem de continuidade quando o cliente não atende a primeira ligação

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai cuidar do seu atendimento. Vi que você conversou com a gente sobre o [empreendimento] e que [resumo em uma linha]. Te ligo agora ou prefere às 19h?

**Por que funciona:** Prova que você leu tudo, dá nome ao "consultor responsável" que o robô prometeu e oferece duas opções.

### Erros que matam a venda

- **Repetir o questionário do robô**  
  Quanto custa: O cliente responde tudo de novo e desiste  
  Correção: Confirmar em uma frase o que ele já contou
- **Contradizer o que o robô combinou (horário, documento, próximo passo)**  
  Quanto custa: O cliente fica confuso e desconfia  
  Correção: Ler a conversa e continuar o combinado
- **Deixar o cliente esperando depois de o robô dizer "o consultor já vai falar com você"**  
  Quanto custa: A promessa quebrada é da casa inteira  
  Correção: Continuidade em até 5 minutos

### No CRM

- **Tela:** Ficha do cliente (Dossiê)
- **Ação:** Ler resumo, conversa de WhatsApp e linha do tempo
- **Campo:** Motivo do handoff, temperatura e observações
- **Regra:** O cliente do robô ou da pré-venda entra na etapa "Qualificação Corretor"

### Frase-âncora

> **O robô abre a porta. Quem leva o cliente até a chave é você.**

### Checagem rápida

1. O que o robô precisa ter para fazer um handoff normal?  
   Resposta: Um desfecho: visita marcada, análise com documento ou análise sem documento por escolha do cliente.
2. O que acontece com o robô quando você assume o cliente?  
   Resposta: Ele pausa para aquele telefone: quem responde passa a ser você.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Antes de chegar até você, o seu cliente pode ter trocado 11 mensagens com a gente. A mediana entre a primeira mensagem do robô e o handoff é de 1,6 hora. Você não está começando uma conversa. Está entrando no meio dela.","por_que_importa":"Quem não sabe o que o robô já fez repete perguntas, contradiz o que foi combinado e perde a confiança que o robô construiu. O cliente sente que falou com a parede.","conceito":"É uma troca de turno num hospital: o médico que chega lê o prontuário antes de entrar no quarto. O dossiê é o prontuário do seu cliente.","metodo":["Marquinhos: o agente de WhatsApp. Segue uma escada: N0 abertura (confirmar o interesse), N1 qualificar (no mínimo renda, região, primeiro imóvel, morar ou investir e decisor), N2 eleger o próximo passo, N3 fechar (lista de documentos enviada ou dia e hora da visita) e N4 handoff.","O handoff só acontece com desfecho (visita marcada, análise com documento ou análise sem documento por escolha do cliente) ou em saída antecipada: pediu humano, pergunta sensível, saque-aniversário do FGTS, reclamação ou documento que já indica fechamento.","Souza faz o follow-up automático; Marques reativa a base parada; Quésia classifica as respostas da reativação; Vitor confirma as visitas na véspera às 18h30 e no dia às 08h45.","Marcão monta o dossiê com o orçamento calculado (parcela, financiamento e teto do imóvel); Célio faz a simulação estimada de crédito; Marta audita as conversas e propõe aprendizados.","SamiQ é o seu copiloto no CRM (⌘J): resume o cliente, sugere mensagem e tira dúvida de produto. A sugestão é rascunho.","Quando você assume, o robô pausa para aquele telefone: daqui para frente, quem responde é você."],"na_vida_real":{"caso":"Conversas do robô até o handoff (jun a set/2026).","o_que_foi_dito":"Até o handoff, a mediana foi de 11 mensagens do cliente e 8 do robô, em cerca de 1,6 hora.","resultado":"Uma qualificação completa cabe numa conversa curta, e o cliente espera que o corretor saiba o que ele já contou.","fonte":"Conversas do robô (seção 9.1)"},"scripts":[{"canal":"WhatsApp","situacao":"Mensagem de continuidade quando o cliente não atende a primeira ligação","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai cuidar do seu atendimento. Vi que você conversou com a gente sobre o [empreendimento] e que [resumo em uma linha]. Te ligo agora ou prefere às 19h?","por_que_funciona":"Prova que você leu tudo, dá nome ao \"consultor responsável\" que o robô prometeu e oferece duas opções."}],"erros_que_matam":[{"erro":"Repetir o questionário do robô","custo":"O cliente responde tudo de novo e desiste","correcao":"Confirmar em uma frase o que ele já contou"},{"erro":"Contradizer o que o robô combinou (horário, documento, próximo passo)","custo":"O cliente fica confuso e desconfia","correcao":"Ler a conversa e continuar o combinado"},{"erro":"Deixar o cliente esperando depois de o robô dizer \"o consultor já vai falar com você\"","custo":"A promessa quebrada é da casa inteira","correcao":"Continuidade em até 5 minutos"}],"no_crm":{"tela":"Ficha do cliente (Dossiê)","acao":"Ler resumo, conversa de WhatsApp e linha do tempo","campo":"Motivo do handoff, temperatura e observações","regra":"O cliente do robô ou da pré-venda entra na etapa \"Qualificação Corretor\""},"frase_ancora":"O robô abre a porta. Quem leva o cliente até a chave é você.","checagem_rapida":[{"pergunta":"O que o robô precisa ter para fazer um handoff normal?","resposta":"Um desfecho: visita marcada, análise com documento ou análise sem documento por escolha do cliente."},{"pergunta":"O que acontece com o robô quando você assume o cliente?","resposta":"Ele pausa para aquele telefone: quem responde passa a ser você."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M27-A2', 2, 'Lendo o dossiê em 60 segundos', 'texto',
  'A nota do robô não vende. Handoffs com nota "excelente": 0 de 24 avançaram no CRM. O que acontece depois do handoff depende de você.

### Por que importa

O dossiê economiza metade da ligação, mas quase sempre chega incompleto: faltam a entrada (85,1% dos handoffs), o FGTS (73,1%), a restrição no nome (69,5%) e o momento de compra (67,5%). São as suas primeiras perguntas.

### O conceito

O dossiê é o mapa de uma trilha que alguém já começou: mostra o caminho feito e onde estão os buracos. Você não refaz a trilha, completa o que falta.

### O método SMQ, passo a passo

1. Leia os dados de base: nome, origem, campanha, empreendimento, região, finalidade (morar ou investir).
2. Leia o perfil: faixa de renda, FGTS, decisor e a temperatura (PRONTO, QUENTE, MORNO ou FRIO).
3. Leia o motivo do handoff: visita marcada, análise com documento, análise sem documento por escolha ou saída antecipada (pediu humano, saque-aniversário, reclamação).
4. Procure as marcas de atenção nas observações, como [RESTRIÇÃO] ou prazo dado pelo cliente.
5. Leia as últimas mensagens da conversa: o que foi combinado e o que o cliente perguntou por último.
6. Anote as perguntas que faltam: entrada, FGTS e tempo de registro, restrição no nome e momento de compra. Dossiê vazio ou estranho? Trate como primeiro contato.

### Na vida real

**O caso:** Nota de qualificação do robô cruzada com o avanço no CRM (jul a set/2026).

**O que foi dito:** Handoffs com nota "excelente" avançaram 0 de 24 vezes; com nota "boa", 6,0%; com nota "mediana", 9,5%.

**O que aconteceu:** A nota descreve a conversa com o robô, não o futuro do cliente. O avanço depende da continuidade do corretor.

### Scripts prontos

#### Ligação · Primeira frase depois de ler o dossiê

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vi aqui que você quer [morar] na [região] e que vocês ganham juntos em torno de [faixa]. Continua assim? Então me ajuda com duas coisas que ainda faltam: vocês contam com algum valor para a entrada ou com FGTS?

**Por que funciona:** Confirma em uma frase, mostra que a conversa anterior valeu e vai direto às lacunas que mais aparecem nos dossiês.

### Erros que matam a venda

- **Confiar na nota do robô e relaxar**  
  Quanto custa: Lead "excelente" esfria sem continuidade  
  Correção: Tratar todo handoff como prioridade da fila
- **Ignorar a marca [RESTRIÇÃO] nas observações**  
  Quanto custa: Promete o que a análise não vai confirmar  
  Correção: Acolher sem prometer e levar para a pré-análise
- **Não ler as últimas mensagens**  
  Quanto custa: Você pergunta o que o cliente acabou de responder  
  Correção: Ler as últimas 10 mensagens antes de ligar

### No CRM

- **Tela:** Ficha do cliente (Dossiê) e SamiQ (⌘J)
- **Ação:** Ler o dossiê ou pedir à SamiQ o resumo em 3 linhas
- **Campo:** Faixa de renda, FGTS, decisor, temperatura, motivo do handoff, observações
- **Regra:** Qualificação é ficha preenchida: complete os 5 campos obrigatórios (renda familiar, tipo de renda, FGTS e tempo de registro, entrada e quem decide junto)

### Frase-âncora

> **Confirme o que já sabe. Pergunte só o que falta.**

### Checagem rápida

1. Quais são as 4 informações que mais faltam nos dossiês?  
   Resposta: Entrada, FGTS, restrição no nome e momento de compra.
2. O dossiê veio vazio. O que fazer?  
   Resposta: Tratar como primeiro contato (M26).',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"A nota do robô não vende. Handoffs com nota \"excelente\": 0 de 24 avançaram no CRM. O que acontece depois do handoff depende de você.","por_que_importa":"O dossiê economiza metade da ligação, mas quase sempre chega incompleto: faltam a entrada (85,1% dos handoffs), o FGTS (73,1%), a restrição no nome (69,5%) e o momento de compra (67,5%). São as suas primeiras perguntas.","conceito":"O dossiê é o mapa de uma trilha que alguém já começou: mostra o caminho feito e onde estão os buracos. Você não refaz a trilha, completa o que falta.","metodo":["Leia os dados de base: nome, origem, campanha, empreendimento, região, finalidade (morar ou investir).","Leia o perfil: faixa de renda, FGTS, decisor e a temperatura (PRONTO, QUENTE, MORNO ou FRIO).","Leia o motivo do handoff: visita marcada, análise com documento, análise sem documento por escolha ou saída antecipada (pediu humano, saque-aniversário, reclamação).","Procure as marcas de atenção nas observações, como [RESTRIÇÃO] ou prazo dado pelo cliente.","Leia as últimas mensagens da conversa: o que foi combinado e o que o cliente perguntou por último.","Anote as perguntas que faltam: entrada, FGTS e tempo de registro, restrição no nome e momento de compra. Dossiê vazio ou estranho? Trate como primeiro contato."],"na_vida_real":{"caso":"Nota de qualificação do robô cruzada com o avanço no CRM (jul a set/2026).","o_que_foi_dito":"Handoffs com nota \"excelente\" avançaram 0 de 24 vezes; com nota \"boa\", 6,0%; com nota \"mediana\", 9,5%.","resultado":"A nota descreve a conversa com o robô, não o futuro do cliente. O avanço depende da continuidade do corretor.","fonte":"Notas de qualificação cruzadas com o CRM (seção 9.1)"},"scripts":[{"canal":"Ligação","situacao":"Primeira frase depois de ler o dossiê","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vi aqui que você quer [morar] na [região] e que vocês ganham juntos em torno de [faixa]. Continua assim? Então me ajuda com duas coisas que ainda faltam: vocês contam com algum valor para a entrada ou com FGTS?","por_que_funciona":"Confirma em uma frase, mostra que a conversa anterior valeu e vai direto às lacunas que mais aparecem nos dossiês."}],"erros_que_matam":[{"erro":"Confiar na nota do robô e relaxar","custo":"Lead \"excelente\" esfria sem continuidade","correcao":"Tratar todo handoff como prioridade da fila"},{"erro":"Ignorar a marca [RESTRIÇÃO] nas observações","custo":"Promete o que a análise não vai confirmar","correcao":"Acolher sem prometer e levar para a pré-análise"},{"erro":"Não ler as últimas mensagens","custo":"Você pergunta o que o cliente acabou de responder","correcao":"Ler as últimas 10 mensagens antes de ligar"}],"no_crm":{"tela":"Ficha do cliente (Dossiê) e SamiQ (⌘J)","acao":"Ler o dossiê ou pedir à SamiQ o resumo em 3 linhas","campo":"Faixa de renda, FGTS, decisor, temperatura, motivo do handoff, observações","regra":"Qualificação é ficha preenchida: complete os 5 campos obrigatórios (renda familiar, tipo de renda, FGTS e tempo de registro, entrada e quem decide junto)"},"frase_ancora":"Confirme o que já sabe. Pergunte só o que falta.","checagem_rapida":[{"pergunta":"Quais são as 4 informações que mais faltam nos dossiês?","resposta":"Entrada, FGTS, restrição no nome e momento de compra."},{"pergunta":"O dossiê veio vazio. O que fazer?","resposta":"Tratar como primeiro contato (M26)."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M27-A3', 3, 'Os três tipos de chegada', 'texto',
  'Três leads chegam no mesmo minuto com o mesmo aviso. Um conversou 40 minutos com o robô, outro foi preparado pela pré-venda e o terceiro nunca falou com ninguém. Se você tratar os três do mesmo jeito, erra com dois.

### Por que importa

O aviso de lead novo é igual para todos, mas o que o cliente espera é diferente. E a rota direta já mostrou o custo do descuido: por quatro semanas, cerca de 230 leads foram entregues com o robô pausado e nenhum aviso ao corretor. Lead que ninguém avisa, ninguém atende.

### O conceito

Pense numa recepção de hotel: o hóspede que já fez check-in não quer preencher a ficha de novo, o que vem por agência chega com voucher, e o que chegou sem reserva precisa ser atendido do zero. Mesmo balcão, três atendimentos.

### O método SMQ, passo a passo

1. Chegada 1, pelo robô, com dossiê: leia o motivo do handoff e continue o caminho aberto (visita, análise com documento ou análise sem documento por escolha).
2. Chegada 2, pela pré-venda: o cliente entra na etapa "Qualificação Corretor", muitas vezes com visita agendada. A pré-venda confirma na véspera e no dia; do comparecimento em diante, o cliente é seu.
3. Chegada 3, pela rota direta: lead de campanha que cai direto na roleta, sem conversa. O resumo vem vazio: você é o primeiro contato (M26).
4. Também chegam clientes reativados (Marques e Quésia) e transferências feitas pela gestão: leia o histórico antes de chamar.
5. Em qualquer chegada: primeiro contato em até 5 minutos, desfecho registrado e um dos 2 caminhos no fim da conversa.

### Na vida real

**O caso:** A rota direta entre agosto e setembro de 2026.

**O que foi dito:** Por quatro semanas, cerca de 230 leads foram entregues com o robô pausado e zero aviso ao corretor e ao gerente. Além disso, 586 leads da base nunca receberam nenhuma mensagem.

**O que aconteceu:** Desses 586, só 1,4% responderam e nenhum virou handoff. A lição: o corretor precisa olhar a própria fila, e não só esperar o aviso.

### Scripts prontos

#### Ligação · Chegada do robô com visita marcada

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai te receber no sábado, às 10h, no [empreendimento]. Já separei a sua simulação. Quem vai com você?

**Por que funciona:** Confirma o que o robô combinou, mostra preparo e confere o decisor sem parecer interrogatório.

#### WhatsApp · Chegada do robô com documentos enviados

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Recebi os seus documentos e já estou adiantando a sua análise. O próximo passo é [o que falta] e eu te dou retorno até [data]. Posso te ligar hoje às 19h pra te explicar como funciona?

**Por que funciona:** Reconhece o esforço do cliente, diz o próximo passo com data e puxa a conversa por voz.

#### WhatsApp · Chegada do robô com análise sem documento por escolha do cliente

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vi que você prefere conhecer antes de mandar documento, e faz todo sentido. Separei duas opções: sábado às 10h ou às 14h. Qual fica melhor pra você?

**Por que funciona:** Respeita a escolha do cliente e oferece o outro caminho, a visita, com duas opções.

### Erros que matam a venda

- **Tratar o lead da rota direta como se já tivesse conversado**  
  Quanto custa: Você pressupõe dados que ninguém coletou  
  Correção: Resumo vazio: primeiro contato completo
- **Deixar a visita agendada pela pré-venda sem contato até o dia**  
  Quanto custa: O cliente chega sem vínculo com você, ou não chega  
  Correção: Contato de apresentação logo que o cliente entra na sua carteira e o D-2 humano
- **Pedir documento de novo a quem já mandou**  
  Quanto custa: O cliente acha que o processo é bagunçado  
  Correção: Conferir a pasta antes de pedir qualquer coisa

### No CRM

- **Tela:** Base de leads e Ficha do cliente
- **Ação:** Filtrar por origem e etapa; conferir a pasta de documentos
- **Campo:** Origem, etapa, agendamento e documentos
- **Regra:** Da pré-venda: "do comparecimento em diante, o corretor assume"

### Frase-âncora

> **Mesmo aviso, três chegadas. Leia antes de ligar.**

### Checagem rápida

1. Como reconhecer um lead da rota direta?  
   Resposta: Chega sem conversa e com o resumo vazio: você é o primeiro contato.
2. Em que etapa entra o cliente que vem da pré-venda?  
   Resposta: "Qualificação Corretor".',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Três leads chegam no mesmo minuto com o mesmo aviso. Um conversou 40 minutos com o robô, outro foi preparado pela pré-venda e o terceiro nunca falou com ninguém. Se você tratar os três do mesmo jeito, erra com dois.","por_que_importa":"O aviso de lead novo é igual para todos, mas o que o cliente espera é diferente. E a rota direta já mostrou o custo do descuido: por quatro semanas, cerca de 230 leads foram entregues com o robô pausado e nenhum aviso ao corretor. Lead que ninguém avisa, ninguém atende.","conceito":"Pense numa recepção de hotel: o hóspede que já fez check-in não quer preencher a ficha de novo, o que vem por agência chega com voucher, e o que chegou sem reserva precisa ser atendido do zero. Mesmo balcão, três atendimentos.","metodo":["Chegada 1, pelo robô, com dossiê: leia o motivo do handoff e continue o caminho aberto (visita, análise com documento ou análise sem documento por escolha).","Chegada 2, pela pré-venda: o cliente entra na etapa \"Qualificação Corretor\", muitas vezes com visita agendada. A pré-venda confirma na véspera e no dia; do comparecimento em diante, o cliente é seu.","Chegada 3, pela rota direta: lead de campanha que cai direto na roleta, sem conversa. O resumo vem vazio: você é o primeiro contato (M26).","Também chegam clientes reativados (Marques e Quésia) e transferências feitas pela gestão: leia o histórico antes de chamar.","Em qualquer chegada: primeiro contato em até 5 minutos, desfecho registrado e um dos 2 caminhos no fim da conversa."],"na_vida_real":{"caso":"A rota direta entre agosto e setembro de 2026.","o_que_foi_dito":"Por quatro semanas, cerca de 230 leads foram entregues com o robô pausado e zero aviso ao corretor e ao gerente. Além disso, 586 leads da base nunca receberam nenhuma mensagem.","resultado":"Desses 586, só 1,4% responderam e nenhum virou handoff. A lição: o corretor precisa olhar a própria fila, e não só esperar o aviso.","fonte":"Relatórios semanais da operação, ago a set/2026 (seção 9.1)"},"scripts":[{"canal":"Ligação","situacao":"Chegada do robô com visita marcada","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai te receber no sábado, às 10h, no [empreendimento]. Já separei a sua simulação. Quem vai com você?","por_que_funciona":"Confirma o que o robô combinou, mostra preparo e confere o decisor sem parecer interrogatório."},{"canal":"WhatsApp","situacao":"Chegada do robô com documentos enviados","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Recebi os seus documentos e já estou adiantando a sua análise. O próximo passo é [o que falta] e eu te dou retorno até [data]. Posso te ligar hoje às 19h pra te explicar como funciona?","por_que_funciona":"Reconhece o esforço do cliente, diz o próximo passo com data e puxa a conversa por voz."},{"canal":"WhatsApp","situacao":"Chegada do robô com análise sem documento por escolha do cliente","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vi que você prefere conhecer antes de mandar documento, e faz todo sentido. Separei duas opções: sábado às 10h ou às 14h. Qual fica melhor pra você?","por_que_funciona":"Respeita a escolha do cliente e oferece o outro caminho, a visita, com duas opções."}],"erros_que_matam":[{"erro":"Tratar o lead da rota direta como se já tivesse conversado","custo":"Você pressupõe dados que ninguém coletou","correcao":"Resumo vazio: primeiro contato completo"},{"erro":"Deixar a visita agendada pela pré-venda sem contato até o dia","custo":"O cliente chega sem vínculo com você, ou não chega","correcao":"Contato de apresentação logo que o cliente entra na sua carteira e o D-2 humano"},{"erro":"Pedir documento de novo a quem já mandou","custo":"O cliente acha que o processo é bagunçado","correcao":"Conferir a pasta antes de pedir qualquer coisa"}],"no_crm":{"tela":"Base de leads e Ficha do cliente","acao":"Filtrar por origem e etapa; conferir a pasta de documentos","campo":"Origem, etapa, agendamento e documentos","regra":"Da pré-venda: \"do comparecimento em diante, o corretor assume\""},"frase_ancora":"Mesmo aviso, três chegadas. Leia antes de ligar.","checagem_rapida":[{"pergunta":"Como reconhecer um lead da rota direta?","resposta":"Chega sem conversa e com o resumo vazio: você é o primeiro contato."},{"pergunta":"Em que etapa entra o cliente que vem da pré-venda?","resposta":"\"Qualificação Corretor\"."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M27-A4', 4, 'Os pontos cegos do handoff', 'texto',
  'Um golpista abordou um lead da casa dizendo ser da SMQ e da Caixa. O cliente só não caiu porque a gente tinha sido claro sobre quem fala com ele e por qual número.

### Por que importa

Os pontos cegos do handoff custam caro: o robô pausado que ninguém substitui, o cliente que escreve depois do handoff e não recebe resposta, o dossiê errado que manda "qualificar do zero" o lead mais quente do dia e o corretor que liga de um número que o cliente não conhece.

### O conceito

Dirigir com ponto cego é normal; mudar de faixa sem olhar o retrovisor é que causa acidente. Aqui, o retrovisor é ler a conversa e avisar o cliente de quem vai falar com ele.

### O método SMQ, passo a passo

1. Robô pausado: quando você assume, o robô para de responder aquele cliente. A pausa não expira sozinha. Se você larga, ninguém mais responde.
2. Cliente que escreve depois do handoff ("quero seguir", "preciso reagendar"): a resposta agora é sua, e rápida. Pela Central de Mensagens, você vê quem está aguardando resposta.
3. Dossiê errado: se o dossiê diz "frio, perfil raso" mas a conversa mostra um cliente pronto, confie na conversa.
4. Regra de identidade: mande ao cliente o número exato de quem vai ligar. Se o robô disse que a SMQ só fala por um número e você liga de outro sem avisar, você cria o próximo susto.
5. Âncoras antigolpe na primeira mensagem: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e a Caixa não chama cliente no WhatsApp pedindo dado.
6. Checagem depois do handoff: a casa decidiu que o robô vai perguntar ao cliente, 24 horas depois, se ele deu sequência com o corretor. [CONFIRMAR se já está no ar] Quem continuou bem não tem nada a temer.

### Na vida real

**O caso:** Uma tentativa de golpe com um lead da casa (set/2026).

**O que foi dito:** Um terceiro abordou o cliente se dizendo da SMQ e da Caixa. O robô desmentiu, a conversa passou para um corretor e o cliente foi orientado com as âncoras antigolpe.

**O que aconteceu:** O cliente bloqueou o golpista e seguiu interessado. A casa criou a regra: sempre informar o número exato de quem vai ligar.

### Scripts prontos

#### WhatsApp · Primeira mensagem do corretor ao assumir um cliente do robô

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vou te ligar deste número: [número]. Pode salvar. A sua análise com a gente é gratuita e ninguém da SMQ pede Pix, taxa ou senha. Posso te ligar agora?

**Por que funciona:** Dá segurança ao cliente antes da ligação e protege contra golpistas que usam o nome da casa.

#### WhatsApp · O cliente escreveu "preciso reagendar" depois do handoff

> Claro, [nome], sem problema nenhum! Consigo te encaixar no sábado às 10h ou no domingo às 14h. Qual fica melhor?

**Por que funciona:** Resolve na hora, sem cobrança, e já oferece duas opções. Depois, marque o agendamento como "remarcado" para a confirmação automática não confirmar a visita cancelada.

### Erros que matam a venda

- **Assumir o lead e sumir**  
  Quanto custa: Robô pausado e cliente sem resposta  
  Correção: Assumiu, é seu até o desfecho
- **Ligar de número pessoal sem avisar**  
  Quanto custa: O cliente acha que é golpe e bloqueia  
  Correção: Informar o número exato antes de ligar
- **Deixar sem resposta o "quero seguir" que chega depois do handoff**  
  Quanto custa: O cliente mais quente do dia esfria esperando  
  Correção: Central de Mensagens conferida várias vezes ao dia

### No CRM

- **Tela:** Central de Mensagens e Ficha do cliente
- **Ação:** Responder quem está aguardando e registrar o desfecho
- **Campo:** Agendamento (marcar "remarcado" quando for o caso)
- **Regra:** Cada mensagem aparece na linha do tempo do cliente

### Frase-âncora

> **Assumiu, é seu até o desfecho.**

### Checagem rápida

1. Por que mandar ao cliente o número de quem vai ligar?  
   Resposta: Para ele não confundir o corretor com um golpista.
2. O cliente respondeu à confirmação automática com "preciso reagendar". O que fazer?  
   Resposta: Responder com duas opções e marcar o agendamento como "remarcado".',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Um golpista abordou um lead da casa dizendo ser da SMQ e da Caixa. O cliente só não caiu porque a gente tinha sido claro sobre quem fala com ele e por qual número.","por_que_importa":"Os pontos cegos do handoff custam caro: o robô pausado que ninguém substitui, o cliente que escreve depois do handoff e não recebe resposta, o dossiê errado que manda \"qualificar do zero\" o lead mais quente do dia e o corretor que liga de um número que o cliente não conhece.","conceito":"Dirigir com ponto cego é normal; mudar de faixa sem olhar o retrovisor é que causa acidente. Aqui, o retrovisor é ler a conversa e avisar o cliente de quem vai falar com ele.","metodo":["Robô pausado: quando você assume, o robô para de responder aquele cliente. A pausa não expira sozinha. Se você larga, ninguém mais responde.","Cliente que escreve depois do handoff (\"quero seguir\", \"preciso reagendar\"): a resposta agora é sua, e rápida. Pela Central de Mensagens, você vê quem está aguardando resposta.","Dossiê errado: se o dossiê diz \"frio, perfil raso\" mas a conversa mostra um cliente pronto, confie na conversa.","Regra de identidade: mande ao cliente o número exato de quem vai ligar. Se o robô disse que a SMQ só fala por um número e você liga de outro sem avisar, você cria o próximo susto.","Âncoras antigolpe na primeira mensagem: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e a Caixa não chama cliente no WhatsApp pedindo dado.","Checagem depois do handoff: a casa decidiu que o robô vai perguntar ao cliente, 24 horas depois, se ele deu sequência com o corretor. [CONFIRMAR se já está no ar] Quem continuou bem não tem nada a temer."],"na_vida_real":{"caso":"Uma tentativa de golpe com um lead da casa (set/2026).","o_que_foi_dito":"Um terceiro abordou o cliente se dizendo da SMQ e da Caixa. O robô desmentiu, a conversa passou para um corretor e o cliente foi orientado com as âncoras antigolpe.","resultado":"O cliente bloqueou o golpista e seguiu interessado. A casa criou a regra: sempre informar o número exato de quem vai ligar.","fonte":"Casos da era do CRM (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Primeira mensagem do corretor ao assumir um cliente do robô","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Vou te ligar deste número: [número]. Pode salvar. A sua análise com a gente é gratuita e ninguém da SMQ pede Pix, taxa ou senha. Posso te ligar agora?","por_que_funciona":"Dá segurança ao cliente antes da ligação e protege contra golpistas que usam o nome da casa."},{"canal":"WhatsApp","situacao":"O cliente escreveu \"preciso reagendar\" depois do handoff","texto":"Claro, [nome], sem problema nenhum! Consigo te encaixar no sábado às 10h ou no domingo às 14h. Qual fica melhor?","por_que_funciona":"Resolve na hora, sem cobrança, e já oferece duas opções. Depois, marque o agendamento como \"remarcado\" para a confirmação automática não confirmar a visita cancelada."}],"erros_que_matam":[{"erro":"Assumir o lead e sumir","custo":"Robô pausado e cliente sem resposta","correcao":"Assumiu, é seu até o desfecho"},{"erro":"Ligar de número pessoal sem avisar","custo":"O cliente acha que é golpe e bloqueia","correcao":"Informar o número exato antes de ligar"},{"erro":"Deixar sem resposta o \"quero seguir\" que chega depois do handoff","custo":"O cliente mais quente do dia esfria esperando","correcao":"Central de Mensagens conferida várias vezes ao dia"}],"no_crm":{"tela":"Central de Mensagens e Ficha do cliente","acao":"Responder quem está aguardando e registrar o desfecho","campo":"Agendamento (marcar \"remarcado\" quando for o caso)","regra":"Cada mensagem aparece na linha do tempo do cliente"},"frase_ancora":"Assumiu, é seu até o desfecho.","checagem_rapida":[{"pergunta":"Por que mandar ao cliente o número de quem vai ligar?","resposta":"Para ele não confundir o corretor com um golpista."},{"pergunta":"O cliente respondeu à confirmação automática com \"preciso reagendar\". O que fazer?","resposta":"Responder com duas opções e marcar o agendamento como \"remarcado\"."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q01', 1, 'situacional',
  'O dossiê diz: faixa de renda em torno de R$ 4.500, quer morar na Zona Leste, decisor: esposa. O que você pergunta primeiro na ligação?',
  '["\"Qual é a sua renda?\"","\"Você quer morar ou investir?\"","\"Você já conhece a Seu Metro Quadrado?\"","Confirma em uma frase o que o dossiê diz e pergunta sobre a entrada e o FGTS."]'::jsonb,
  3,
  'A D confirma o que já se sabe e vai às lacunas que mais aparecem nos dossiês (entrada em 85,1% e FGTS em 73,1% dos casos). A A e a B repetem perguntas que o robô já fez e cansam o cliente. A C não avança a qualificação.',
  'M27-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q02', 2, 'situacional',
  'O motivo do handoff é "análise sem documento por escolha": o cliente disse que quer ver o apartamento antes. O que fazer?',
  '["Insistir no documento, porque a análise é prioridade.","Oferecer a visita com duas opções de horário.","Esperar o cliente mandar os documentos.","Marcar como perdido por resistência."]'::jsonb,
  1,
  'A B respeita a escolha e abre o outro caminho: a visita. A A contraria a regra dos 2 caminhos (resistiu ao documento, volte para a visita). A C deixa o cliente sem próximo passo. A D perde um cliente qualificado que só pediu para ver antes.',
  'M27-A3; seção 9.4', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q03', 3, 'situacional',
  'Chegou um lead com o resumo do dossiê vazio. Como agir?',
  '["Tratar como primeiro contato: ligar, WhatsApp em até 2 minutos se não atender, registrar e seguir a cadência.","Mandar \"como posso continuar o seu atendimento?\"","Esperar o robô completar a ficha.","Pedir ao gerente para mandar outro lead."]'::jsonb,
  0,
  'A A é a regra: resumo vazio é sinal de rota direta ou de lead que ninguém conversou, e você é o primeiro contato. A B pressupõe uma conversa que não existiu. A C não acontece: o robô não atua em lead de rota direta. A D abandona o cliente.',
  'M27-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q04', 4, 'situacional',
  'Dois dias depois do handoff, o cliente escreve no WhatsApp: "Quero seguir." O que você faz?',
  '["Espera o robô responder.","Responde no dia seguinte, com calma.","Responde na hora, agradece e propõe o próximo passo com duas opções.","Manda o book de novo."]'::jsonb,
  2,
  'A C atende o cliente mais quente do dia na hora certa. A A não acontece: o robô está pausado para esse telefone desde que você assumiu. A B deixa o cliente esfriar. A D manda material em vez de avançar.',
  'M27-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q05', 5, 'situacional',
  'Você vai ligar do seu celular para um cliente que o robô atendeu pelo número oficial. O que fazer antes?',
  '["Nada: o cliente vai entender.","Pedir ao cliente que ligue para você.","Ligar várias vezes seguidas até ele atender.","Mandar uma mensagem informando o número exato de quem vai ligar e as âncoras antigolpe."]'::jsonb,
  3,
  'A D segue a regra de identidade criada depois da tentativa de golpe de set/2026. A A cria o próximo susto: número desconhecido depois de "só falamos por este número". A B inverte a condução. A C parece exatamente o que um golpista faria.',
  'M27-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q06', 6, 'situacional',
  'O dossiê diz "FRIO, perfil raso, qualificar do zero", mas a conversa mostra um cliente perguntando o endereço do estande. Em que você confia?',
  '["No dossiê, porque foi o robô que classificou.","Na conversa: o cliente está quente e precisa de visita marcada agora.","Em nenhum dos dois: espera o cliente mandar mensagem.","No gerente: pede para ele decidir."]'::jsonb,
  1,
  'A B está certa: dossiê errado acontece (por exemplo, em redistribuição sem ficha preenchida) e a conversa é a fonte mais fiel. A A queima o lead mais quente do dia. A C e a D atrasam uma decisão que é sua.',
  'M27-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q07', 7, 'situacional',
  'A pré-venda entregou um cliente com visita agendada para daqui a 3 dias. O que você faz agora?',
  '["Nada: a pré-venda confirma a visita.","Liga só no dia da visita.","Faz contato de apresentação agora e o D-2 humano, preparando a simulação para a visita.","Remarca a visita para um horário melhor para você."]'::jsonb,
  2,
  'A C cria o vínculo antes da visita e cumpre o protocolo: a pré-venda confirma, mas do comparecimento em diante o cliente é seu, e quem chega sem vínculo com o corretor falta mais. A A e a B deixam o relacionamento com o sistema. A D coloca a sua agenda na frente do cliente.',
  'M27-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q08', 8, 'situacional',
  'O dossiê traz [RESTRIÇÃO] nas observações. Na ligação, o cliente pergunta: "Com o nome sujo eu consigo?" O que você responde?',
  '["\"Consegue sim, com certeza.\"","\"Não consegue, esquece.\"","\"Isso é com o banco, eu não sei.\"","\"Depende do tipo e do valor, e não é o fim da linha. A gente faz uma pré-análise sem compromisso pra ver o cenário e o caminho pra regularizar.\""]'::jsonb,
  3,
  'A D acolhe, é verdadeira e oferece caminho. A A promete o que só a análise confirma. A B descarta o cliente sem análise, contra a regra de não descartar restrição. A C tira a SMQ do papel de assessoria no crédito.',
  'M27-A2; seção 9.7', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q09', 9, 'aplicacao',
  'Qual é a sequência da escada do robô Marquinhos?',
  '["N0 abertura, N1 qualificar, N2 eleger o próximo passo, N3 fechar, N4 handoff.","N0 handoff, N1 abertura, N2 qualificar, N3 fechar.","Abertura, catálogo, preço, handoff.","Qualificar, visita, venda."]'::jsonb,
  0,
  'A A é a escada: o "sim" do cliente é largada, não chegada, e o handoff só vem com desfecho. A B inverte a ordem. A C é o que a casa proíbe (catálogo e preço antes da qualificação). A D pula o fechamento do próximo passo e o handoff.',
  'M27-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q10', 10, 'aplicacao',
  'Quais informações mais faltam nos dossiês do robô?',
  '["Nome e telefone.","Região e empreendimento.","Entrada, FGTS, restrição no nome e momento de compra.","Finalidade e decisor."]'::jsonb,
  2,
  'A C traz as 4 lacunas medidas: entrada (85,1%), FGTS (73,1%), restrição (69,5%) e momento (67,5%). A A, a B e a D são dados que o robô costuma coletar (região, empreendimento, finalidade e decisor estão no mínimo da qualificação dele).',
  'M27-A2; seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q11', 11, 'aplicacao',
  'Qual é o horário das confirmações automáticas de visita do robô Vitor?',
  '["Na véspera às 18h30 e no dia às 08h45.","Só no dia, uma hora antes.","Uma semana antes.","O Vitor não confirma visitas."]'::jsonb,
  0,
  'A A é o horário dos templates automáticos. Saber disso evita mensagens duplicadas e ajuda a planejar o D-2 humano e o D+0. A B, a C e a D estão erradas; a D ignora que o Vitor existe justamente para isso.',
  'M27-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q12', 12, 'aplicacao',
  'Em que casos o robô faz handoff antes de fechar um próximo passo (saída antecipada)?',
  '["Quando o cliente pede humano, faz pergunta sensível, fala em saque-aniversário do FGTS, faz reclamação ou manda documento que já indica fechamento.","Sempre que o cliente responde \"oi\".","Quando o cliente é FRIO.","Nunca: todo handoff tem visita marcada."]'::jsonb,
  0,
  'A A lista as saídas antecipadas legítimas. Nelas, o corretor precisa entender por que o cliente chegou antes do fechamento. A B e a C estão erradas: resposta simples e temperatura fria não geram handoff. A D ignora a análise com documento e as saídas antecipadas.',
  'M27-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q13', 13, 'aplicacao',
  'Quando um cliente chega pela pré-venda com visita agendada, a partir de quando ele é responsabilidade total do corretor?',
  '["Só depois da venda.","Só depois de a pré-venda confirmar três vezes.","Do comparecimento em diante.","Nunca: ele é da pré-venda."]'::jsonb,
  2,
  'A C é a regra do CRM: a pré-venda esquenta, agenda e confirma na véspera e no dia; do comparecimento em diante, o corretor assume. As outras alternativas deixam o cliente sem dono claro, e o vínculo com o corretor deve começar já no contato de apresentação.',
  'M27-A3; Manual do CRM, cap. 07', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q14', 14, 'aplicacao',
  'O cliente respondeu "preciso reagendar" à confirmação automática. Depois de oferecer duas novas opções, o que mais você faz no CRM?',
  '["Apaga o agendamento antigo e não registra nada.","Nada: o robô resolve.","Muda o card para \"Perdido\".","Marca o agendamento como \"remarcado\", para a confirmação do dia não confirmar a visita cancelada."]'::jsonb,
  3,
  'A D evita a confirmação automática de uma visita que não vai acontecer e mantém o histórico. A A apaga a informação. A B ignora que o robô está pausado e não reagenda. A C perde um cliente que só pediu outro horário.',
  'M27-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q15', 15, 'conceito',
  'Por que o aviso de lead novo chega sem o telefone do cliente?',
  '["Por erro do sistema.","De propósito: para o corretor abrir o CRM, ler a ficha e registrar o atendimento.","Para proteger o corretor de ligações.","Porque o cliente pediu."]'::jsonb,
  1,
  'A B está certa: o desenho obriga a passar pela ficha, onde estão o dossiê e o botão de ligação, e onde o trabalho fica registrado. A A, a C e a D inventam motivos. Ligar por fora do CRM tira o cliente do radar.',
  'Seção 9.11', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q16', 16, 'conceito',
  'O que acontece com o robô quando o corretor assume o cliente?',
  '["Continua respondendo junto com o corretor.","Volta a responder depois de 24 horas.","Pausa para aquele telefone, e a pausa não expira sozinha: quem responde é o corretor.","Manda o cliente para outro corretor."]'::jsonb,
  2,
  'A C é o funcionamento real: por isso, se o corretor larga o cliente, ninguém mais responde. A A e a B estão erradas e fariam o corretor achar que tem cobertura. A D confunde a pausa com o repasse por prazo.',
  'M27-A1 e M27-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q17', 17, 'conceito',
  'A nota de qualificação do robô prevê se o cliente vai avançar no CRM?',
  '["Sim: nota excelente quase sempre vira venda.","Sim, mas só para clientes da Zona Sul.","Só quando o cliente é PRONTO.","Não: handoffs com nota excelente avançaram 0 de 24 vezes. O avanço depende da continuidade do corretor."]'::jsonb,
  3,
  'A D é o dado medido de jul a set/2026. A nota descreve a conversa com o robô, não o futuro do cliente. A A contraria o dado. A B e a C inventam recortes que não foram medidos.',
  'M27-A2; seção 9.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q18', 18, 'conceito',
  'O que é a sugestão de mensagem da SamiQ?',
  '["Um rascunho: o corretor revisa antes de enviar e responde pelo que envia.","Uma mensagem aprovada pela diretoria, que deve ser enviada sem mudança.","Uma mensagem que o robô envia sozinho.","Um texto que substitui a ligação."]'::jsonb,
  0,
  'A A é a regra de uso da IA na SMQ. A B tira do corretor a responsabilidade pelo que envia. A C confunde a SamiQ com os robôs de atendimento. A D contraria a regra de ligar primeiro.',
  'M27-A1; seção 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q19', 19, 'caca_ao_erro',
  'Um corretor assume um handoff com visita marcada e manda: "Oi! Qual é a sua renda? Você quer morar ou investir? Em que região?" Qual é o erro?',
  '["Faltou perguntar o CPF.","Repetiu perguntas que o robô já tinha feito e mandou três perguntas de uma vez, em vez de confirmar a visita e o decisor.","Deveria ter mandado o book antes.","Não tem erro: qualificar nunca é demais."]'::jsonb,
  1,
  'A B aponta dois erros: repetir o que o dossiê já traz e mandar várias perguntas numa mensagem só. O certo era confirmar a visita, o decisor e preparar a simulação. A A pede dado sensível sem contexto. A C manda catálogo. A D ignora que o cliente cansa e desiste.',
  'M27-A2 e M27-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M27-Q20', 20, 'caca_ao_erro',
  'Um corretor comenta: "Esse cliente é do robô, então quem cuida é o robô. Eu só entro na visita." Onde está o erro?',
  '["Nenhum: o robô cuida até a visita.","O erro é entrar na visita; deveria entrar só na análise.","Depois do handoff, o cliente é do corretor, e o robô pausa para aquele telefone. Sem continuidade, o cliente fica sem ninguém.","O erro é não ter pedido ao gerente para cuidar do cliente."]'::jsonb,
  2,
  'A C corrige o engano mais caro do handoff: só 36,7% dos handoffs aparecem como trabalhados. A A repete o engano. A B e a D apontam outras pessoas para um trabalho que é do corretor.',
  'M27-A1 e M27-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (12)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F01', 1, 'Escada do Marquinhos', 'N0 abertura, N1 qualificar, N2 eleger, N3 fechar, N4 handoff.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F02', 2, 'Handoff normal', 'Só com desfecho: visita marcada, análise com documento ou análise sem documento por escolha do cliente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F03', 3, 'Saídas antecipadas', 'Pediu humano, pergunta sensível, saque-aniversário, reclamação ou documento que indica fechamento.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F04', 4, 'O que mais falta no dossiê', 'Entrada, FGTS, restrição no nome e momento de compra.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F05', 5, 'Nota do robô', 'Não prevê avanço: nota excelente avançou 0 de 24 vezes.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F06', 6, 'Resumo vazio', 'Você é o primeiro contato (rota direta).', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F07', 7, 'Cliente da pré-venda', 'Entra em "Qualificação Corretor"; do comparecimento em diante, é seu.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F08', 8, 'Robô pausado', 'Quando você assume, o robô para; se você larga, ninguém responde.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F09', 9, 'Regra de identidade', 'Mande ao cliente o número exato de quem vai ligar.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F10', 10, 'Confirmações do Vitor', 'Véspera às 18h30 e dia da visita às 08h45.', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F11', 11, '"Preciso reagendar"', 'Duas opções na hora e agendamento marcado como "remarcado".', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M27-F12', 12, '36,7%', 'Parte dos handoffs do robô que ganha status de trabalho do corretor no CRM (jul a set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"Na primeira semana, escolha dois handoffs por dia do corretor e leia a continuidade com ele por 5 minutos. Na reunião de segunda, mostre a porcentagem de handoffs com desfecho do time e o tempo pós-handoff de cada um.","sinais_de_dificuldade":["Handoffs em \"Qualificação Corretor\" sem contato em 5 minutos ou sem desfecho no mesmo dia.","Conversas em que o corretor repete perguntas que o dossiê já trazia.","Clientes aguardando resposta na Central de Mensagens depois do handoff."],"perguntas_de_coaching":["O que o robô já tinha combinado com esse cliente antes de você entrar?","Qual das 4 lacunas do dossiê você completou na primeira ligação?","Como o cliente sabia que era você, e não um golpista, quem ia ligar?"],"ritual_de_celebracao":"All Hands quinzenal: destaque \"continuidade perfeita\" para o corretor com todos os handoffs da quinzena com continuidade em até 5 minutos."},"pratica_gabarito":["Dossiê 1: confirmar a visita e o decisor (\"quem vai com você?\"), preparar a simulação e registrar o agendamento já existente com o D-2 programado.","Dossiê 2: agradecer os documentos, dizer o próximo passo com data, conferir a pasta (relatórios dos 4 meses do aplicativo) e ligar para completar entrada e FGTS.","Dossiê 3: oferecer a visita com duas opções, sem insistir no documento; desfecho com o agendamento criado.","Dossiê 4: primeiro contato completo (M26): ligar, WhatsApp em até 2 minutos, registrar e seguir a cadência D1/D2/D3.","Dossiê 5: não cobrar antes das 19h; às 19h, cobrar citando o combinado; acolher a restrição sem prometer e levar para a pré-análise."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M27' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
