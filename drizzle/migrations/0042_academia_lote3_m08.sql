-- ===========================================================================
-- ACADEMIA SMQ · LOTE 3 (v1.0) · seed do módulo M08
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-3/academia-smq-lote-3.json.
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
  ('M08', 8, 2, 'Simulação e capacidade de compra', 'Ao final, você simula qualquer perfil em até 15 minutos, em PRICE e com as premissas ditas, testa o laudo 10% e 20% abaixo e o esforço mensal até as chaves antes de recomendar um produto e conta o resultado como história, e isso aparece no CRM como o desfecho "Enviei simulação" com o próximo passo e a data, e os cenários anotados no Dossiê.',
   '["Eu sou capaz de coletar os dados da simulação (renda, tipo de renda, FGTS e tempo de registro, dinheiro guardado, idade e nome), explicando ao cliente por que peço cada um.","Eu sou capaz de simular em até 15 minutos no card de pré-qualificação do CRM e no simulador oficial, em PRICE, com as premissas escritas.","Eu sou capaz de calcular a entrada com o laudo igual, 10% e 20% abaixo do preço e o esforço mensal até as chaves.","Eu sou capaz de ajustar o prazo pela idade (idade mais prazo até 80 anos e 6 meses) e de dizer com verdade quando um produto não fecha.","Eu sou capaz de contar o resultado como história, com \"isto é estimativa, a aprovação é da Caixa\", e fechar num dos 2 caminhos."]'::jsonb, 1.7, '100 min', true,
   '**Laboratório de simulação cronometrado (individual, com gabarito)** · 45 min

**Papéis:** O corretor simula e narra; o gerente cronometra, faz o papel do cliente na narração e corrige com o gabarito.

**Persona:** P1, P3 e P4 (seção 9.13), com produtos das famílias de treino

**Roteiro:** O corretor recebe os 3 cartões de perfil e tem 15 minutos para simular os três, em PRICE, com os cenários de laudo igual, 10% e 20% abaixo e o esforço mensal até as chaves. Depois narra cada resultado ao gerente, em até 2 minutos por perfil, como faria com o cliente, terminando num próximo passo concreto. Um dos perfis não fecha: o corretor precisa dizer isso com verdade e propor o caminho. Premissas do laboratório: valor de treino, taxas dentro das faixas do registro interno para a capital (jul/2026), parcela sem seguros e taxa de administração (o simulador oficial soma esses valores), preços "a partir de" do catálogo de 29/09/2026 [CONFIRMAR tabela e condição vigente no dia].

**Roteiro do cliente:**

- Perfil 1 (P1, casal que cansou do aluguel, F2): renda somada de R$ 4.500, FGTS de R$ 8.000 (4 anos de registro), R$ 10.000 guardados, 30 meses até a entrega. Produto: Vibra Marechal Tito, a partir de R$ 228.400. Taxa de treino: 6,0% ao ano. Pergunta: "A parcela vai ser maior que o meu aluguel?" (aluguel de R$ 1.200).
- Perfil 2 (P3, solteira CLT perto do metrô, F3): renda de R$ 7.500, R$ 10.000 guardados, FGTS de R$ 12.000 com 2 anos e 10 meses de registro (completa 3 anos em 2 meses), 24 meses até a entrega. Produto: Mundo Apto Lapa, a partir de R$ 259.718. Taxa de treino: 7,9% ao ano. Diz: "Vou pensar."
- Perfil 3 (P4, casal na beira do teto, F4): renda de R$ 12.000, R$ 10.000 guardados, sem FGTS disponível, 20 meses até a entrega. Produto: Emccamp Vision Penha, a partir de R$ 430.000. Taxa de treino: 10,5% ao ano. Diz: "A gente quer usar a renda da minha mãe pra subir o valor."

**O que o observador procura:**

- Os três perfis simulados em até 15 minutos, em PRICE, com as premissas ditas.
- Os três cenários de laudo e o esforço mensal calculados em cada perfil.
- A frase "isto é estimativa, a aprovação é da Caixa" em todas as narrações.
- No perfil 3, o "não fecha" dito com verdade, a folga até R$ 13.000 calculada antes de falar da composição e um caminho proposto.
- No perfil 2, o marco dos 3 anos de FGTS transformado em data e próximo passo.
- Parcela de obra separada da parcela do financiamento na explicação.
- Cada narração terminando em visita com duas opções de horário ou análise com documento, e o registro no CRM dito ao final.

**Rubrica:** Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 3 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Nome, acesso e prints do simulador oficial usado pela casa, para a demonstração da aula A2 e do vídeo. | [CONFIRMAR] Tabela de taxa por sub-faixa na capital e redutor do cotista de 3 anos de FGTS: as taxas do laboratório são de treino, dentro das faixas do registro interno (jul/2026). | [CONFIRMAR] Com o correspondente, se na composição de renda a idade do participante mais velho limita o prazo. | [CONFIRMAR] Tabela, condição vigente e data de entrega dos produtos de treino (Vibra Marechal Tito, Mundo Apto Lapa, Emccamp Vision Penha) no dia do laboratório. | [GAP DE CRM] O card de pré-qualificação calcula com o laudo igual ao preço e mostra subsídio só na F1 (pela Portaria MCID 333/2026, a F2 também pode ter). Não há campo para registrar a simulação nem os cenários de laudo: hoje vão em Resumo / Observações. Proposta: cenário de laudo 10% e 20% abaixo no card, subsídio da F2 e um registro de simulação no Dossiê. | [DADO A MEDIR NO CRM] Clientes com simulação registrada antes da visita. | [CALIBRAR] Meta de clientes agendados com simulação e cenário de laudo registrados.', '{"formato":"canonico-8.2","lote":3,"versao_conteudo":"1.0","trilha":"T2","ordem":4,"nivel_alvo":"Intermediário","nivel_alvo_sistema":"intermediario","subtitulo":"Simulação boa não é a que agrada. É a que continua de pé quando o laudo chega.","duracao_min":100,"por_que_vale_dinheiro":{"texto":"A venda da casa não costuma morrer na parcela: morre na entrada. A entrada falta em 85,1% dos dossiês que chegam do robô, e o laudo abaixo da tabela já transformou uma entrada de 20% em 41,7%. Simular direito antes da visita troca a perda na análise por uma visita ao produto que fecha.","numero":"Entrada de 20% virou 41,7% com o laudo 27% abaixo da tabela (caso de ago/2026); a entrada falta em 85,1% dos dossiês do robô","fonte":"Casoteca SMQ (seção 9.12) e notas de qualificação do robô (seção 9.1)","periodo":"ago/2026; jul a set/2026"},"pre_requisitos":["M04","M05","M07"],"indicador_crm":{"nome":"Clientes com simulação e cenário de laudo feitos antes da visita","onde_ler":"Não há campo próprio: hoje a evidência é o desfecho \"Enviei simulação\" na Fila Única (que cria \"Cobrar retorno da simulação\" em 2 dias), o item \"Simulação e condições revisadas\" do checklist do Modo Visita e as anotações em Resumo / Observações do Dossiê","linha_de_base":"[DADO A MEDIR NO CRM]","meta_sugerida":"Todo cliente agendado com simulação e cenário de laudo registrados antes da visita [CALIBRAR]","fonte":"Briefing do M08 (seção 10.3) e código do CRM (set/2026)","gap_de_crm":true},"pratica":{"tipo":"Laboratório de simulação cronometrado (individual, com gabarito)","duracao_min":45,"persona":"P1, P3 e P4 (seção 9.13), com produtos das famílias de treino","rubrica":"Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"O corretor simula e narra; o gerente cronometra, faz o papel do cliente na narração e corrige com o gabarito.","roteiro":"O corretor recebe os 3 cartões de perfil e tem 15 minutos para simular os três, em PRICE, com os cenários de laudo igual, 10% e 20% abaixo e o esforço mensal até as chaves. Depois narra cada resultado ao gerente, em até 2 minutos por perfil, como faria com o cliente, terminando num próximo passo concreto. Um dos perfis não fecha: o corretor precisa dizer isso com verdade e propor o caminho. Premissas do laboratório: valor de treino, taxas dentro das faixas do registro interno para a capital (jul/2026), parcela sem seguros e taxa de administração (o simulador oficial soma esses valores), preços \"a partir de\" do catálogo de 29/09/2026 [CONFIRMAR tabela e condição vigente no dia].","roteiro_cliente":["Perfil 1 (P1, casal que cansou do aluguel, F2): renda somada de R$ 4.500, FGTS de R$ 8.000 (4 anos de registro), R$ 10.000 guardados, 30 meses até a entrega. Produto: Vibra Marechal Tito, a partir de R$ 228.400. Taxa de treino: 6,0% ao ano. Pergunta: \"A parcela vai ser maior que o meu aluguel?\" (aluguel de R$ 1.200).","Perfil 2 (P3, solteira CLT perto do metrô, F3): renda de R$ 7.500, R$ 10.000 guardados, FGTS de R$ 12.000 com 2 anos e 10 meses de registro (completa 3 anos em 2 meses), 24 meses até a entrega. Produto: Mundo Apto Lapa, a partir de R$ 259.718. Taxa de treino: 7,9% ao ano. Diz: \"Vou pensar.\"","Perfil 3 (P4, casal na beira do teto, F4): renda de R$ 12.000, R$ 10.000 guardados, sem FGTS disponível, 20 meses até a entrega. Produto: Emccamp Vision Penha, a partir de R$ 430.000. Taxa de treino: 10,5% ao ano. Diz: \"A gente quer usar a renda da minha mãe pra subir o valor.\""],"observador_procura":["Os três perfis simulados em até 15 minutos, em PRICE, com as premissas ditas.","Os três cenários de laudo e o esforço mensal calculados em cada perfil.","A frase \"isto é estimativa, a aprovação é da Caixa\" em todas as narrações.","No perfil 3, o \"não fecha\" dito com verdade, a folga até R$ 13.000 calculada antes de falar da composição e um caminho proposto.","No perfil 2, o marco dos 3 anos de FGTS transformado em data e próximo passo.","Parcela de obra separada da parcela do financiamento na explicação.","Cada narração terminando em visita com duas opções de horário ou análise com documento, e o registro no CRM dito ao final."]},"desafio_campo":{"tarefa":"Refaça a simulação de 3 clientes seus que estão agendados ou em análise, agora com os cenários de laudo igual, 10% e 20% abaixo e o esforço mensal até as chaves. Registre as premissas e o resultado de cada um no Dossiê e ligue para cada cliente para contar a conta em três atos, fechando o próximo passo.","prazo_horas":48,"evidencia_no_crm":"Três clientes com os três cenários de entrada e o esforço mensal anotados em Resumo / Observações, com a data; desfecho da ligação registrado na Fila Única com o próximo passo e a data (visita, análise ou outro produto).","como_o_gestor_confere":"Abre o Dossiê dos três clientes e confere as anotações dos cenários, as premissas (PRICE, taxa, prazo) e se a conta bate; na Fila Única, confere o desfecho de cada ligação com o próximo passo e a data. Se algum cliente não fecha em nenhum cenário, confere se o corretor propôs outro produto ou registrou o motivo verdadeiro."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do CRM aberta (recomendação padrão da decisão 18)","cenario":"Escritório da SMQ, com o Dossiê de um cliente de treino na aba Qualificação e uma calculadora na mesa","blocos":[{"tempo":"0:00","fala":"A parcela cabia. O cliente estava feliz. Aí o laudo veio 27% abaixo da tabela, e a entrada pulou de 20% pra 41,7%. A venda morreu no caixa.","na_tela":"Tabela de R$ 480 mil e laudo de cerca de R$ 350 mil lado a lado"},{"tempo":"0:25","fala":"A Caixa financia até 80% do menor valor entre o preço e a avaliação. Não do preço da tabela. É a armadilha número um.","na_tela":"A frase \"80% do menor valor\" em destaque"},{"tempo":"0:50","fala":"Primeiro, os dados: renda, tipo de renda, FGTS e tempo de registro, o que o cliente tem guardado, a idade de quem assina e o nome. Com o porquê de cada um.","na_tela":"Aba Dados do Dossiê com os campos preenchidos"},{"tempo":"1:30","fala":"Agora a conta. No card de pré-qualificação, renda, entrada e FGTS. Depois, eu testo o laudo igual, 10% e 20% abaixo. Entrada de 20, 28 e 36%.","na_tela":"Card de pré-qualificação e os três cenários anotados em Resumo / Observações"},{"tempo":"2:20","fala":"E o esforço até as chaves: o que falta de entrada, dividido pelos meses até a entrega. Até uns 22% da renda, apresenta. De 30 a 50, é plano B. Acima disso, não fecha.","na_tela":"A fórmula do esforço mensal e a régua de cores"},{"tempo":"3:05","fala":"O erro mais comum: chamar o PDF do simulador de aprovação. Não é. É estimativa. Quem aprova é a Caixa, na análise, que é gratuita.","na_tela":"PDF do simulador com o selo \"estimativa\""},{"tempo":"3:40","fala":"Seu desafio: em 48 horas, refaça a simulação de 3 clientes seus com os três cenários de laudo, anote no Dossiê e ligue pra contar a conta em três atos.","na_tela":"Checklist do desafio"},{"tempo":"4:30","fala":"Produto que só passa com laudo cheio não é recomendação. É aposta. Simulação indica, análise formal aprova.","na_tela":"Frase-âncora"}]},"fontes_internas":["Super prompt da Academia, seções 3, 4, 9.1, 9.9, 9.12 (casos B, F e o laudo de ago/2026), 9.13 (P1, P3, P4 e P11), 9.14, 9.15, 9.16 e 10.3","Estudo da Academia v2.1, seções 3.4, 4.2, 4.3 e fase D das situações","Estudo interno de capacidade por faixa (ago/2026)","Código do CRM (set/2026): card de pré-qualificação da aba Qualificação, desfechos da Fila Única, checklist do Modo Visita e motivos de perda","Conteúdo anterior do módulo no CRM (roteiro de coleta e laboratório de 3 perfis, revisados)"],"origem":"SMQ","pendencias":["[CONFIRMAR] Nome, acesso e prints do simulador oficial usado pela casa, para a demonstração da aula A2 e do vídeo.","[CONFIRMAR] Tabela de taxa por sub-faixa na capital e redutor do cotista de 3 anos de FGTS: as taxas do laboratório são de treino, dentro das faixas do registro interno (jul/2026).","[CONFIRMAR] Com o correspondente, se na composição de renda a idade do participante mais velho limita o prazo.","[CONFIRMAR] Tabela, condição vigente e data de entrega dos produtos de treino (Vibra Marechal Tito, Mundo Apto Lapa, Emccamp Vision Penha) no dia do laboratório.","[GAP DE CRM] O card de pré-qualificação calcula com o laudo igual ao preço e mostra subsídio só na F1 (pela Portaria MCID 333/2026, a F2 também pode ter). Não há campo para registrar a simulação nem os cenários de laudo: hoje vão em Resumo / Observações. Proposta: cenário de laudo 10% e 20% abaixo no card, subsídio da F2 e um registro de simulação no Dossiê.","[DADO A MEDIR NO CRM] Clientes com simulação registrada antes da visita.","[CALIBRAR] Meta de clientes agendados com simulação e cenário de laudo registrados."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M08-A1', 'M08-A2', 'M08-A3', 'M08-A4', 'M08-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M08-Q01', 'M08-Q02', 'M08-Q03', 'M08-Q04', 'M08-Q05', 'M08-Q06', 'M08-Q07', 'M08-Q08', 'M08-Q09', 'M08-Q10', 'M08-Q11', 'M08-Q12', 'M08-Q13', 'M08-Q14', 'M08-Q15', 'M08-Q16', 'M08-Q17', 'M08-Q18', 'M08-Q19', 'M08-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M08-F01', 'M08-F02', 'M08-F03', 'M08-F04', 'M08-F05', 'M08-F06', 'M08-F07', 'M08-F08', 'M08-F09', 'M08-F10', 'M08-F11', 'M08-F12', 'M08-F13', 'M08-F14');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 14;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M08-A1', 1, 'Simular é qualificar com número', 'texto',
  'O cliente pergunta "quanto fica a parcela?" no primeiro minuto. O corretor comum chuta um número de tabela. O corretor SMQ responde com três perguntas e, 15 minutos depois, tem a conta de verdade na mão, com o nome do cliente nela.

### Por que importa

A entrada falta em 85,1% dos dossiês que chegam do robô, o FGTS em 73,1% e a restrição no nome em 69,5% (notas de qualificação, jul a set/2026). Simulação feita sem esses dados é número de enfeite: agrada hoje e desmorona na análise. Simulação feita com eles decide se o cliente vai para a visita, para a análise ou para outro produto, ainda na primeira conversa.

### O conceito

Simular é como medir antes de comprar o móvel: você não leva o sofá para casa torcendo para passar na porta. A simulação não é o fim da qualificação, é a qualificação com número. Cada dado que você pede tem um porquê, e o cliente entrega mais fácil quando entende o porquê.

### O método SMQ, passo a passo

1. Peça licença com o benefício: "Pra te dar a sua parcela, e não uma de tabela, preciso de alguns dados rápidos. Posso te perguntar?"
2. Renda: "Quanto vocês ganham juntos por mês, mais ou menos?" Porquê: a parcela cabe em até cerca de 30% dela (seção 9.9, vigente em set/2026).
3. Tipo de renda: registrado, autônomo, MEI, aplicativo ou aposentadoria. Porquê: muda o documento e o valor que a análise considera (detalhe no M07).
4. FGTS e tempo de registro: "Você já trabalhou 3 anos com carteira assinada, somando todos os empregos?" Porquê: 3 anos liberam o FGTS na compra e costumam dar taxa menor (detalhe no M09).
5. Dinheiro guardado: "Quanto vocês já têm guardado pra começar?" Porquê: a trava costuma ser a entrada, não a parcela.
6. Idade do mais velho que vai entrar no contrato: "Qual a data de nascimento de quem vai assinar?" Porquê: idade mais prazo vai até 80 anos e 6 meses. Peça depois do aceite e explique o motivo (LGPD).
7. Nome: "Tem alguma pendência no nome hoje?" Porquê: restrição não descarta, mas muda o caminho (pré-análise com o correspondente).
8. Registre tudo no Dossiê antes de simular e simule em até 15 minutos, com o cliente na linha ou logo depois.

### Na vida real

**O caso:** Caso B da Casoteca: técnica e escritório no mesmo dia (corretor da equipe, Barra Funda e Perdizes).

**O que foi dito:** "Dá pra termos uma ideia de até quanto você consegue de crédito com as informações básicas: se tem FGTS, entrada, renda familiar e data de nascimento." E: "A Caixa quer saber a capacidade de compra, com base em FGTS, renda, entrada e idade."

**O que aconteceu:** A pergunta veio com a justificativa, o cliente respondeu tudo, a simulação saiu melhor que o esperado e o convite para o escritório aconteceu no mesmo dia.

### Scripts prontos

#### Ligação · O cliente pede a parcela antes de você saber a renda

> Te passo sim, e quero que seja a sua parcela, não uma de tabela. Pra isso eu preciso de três coisas rápidas: quanto vocês ganham juntos por mês, se tem FGTS e quanto já têm guardado. Posso te perguntar?

**Por que funciona:** Acolhe o pedido, explica o porquê e devolve a condução com uma pergunta. Preço pode; parcela depende da renda (regra do diretor, set/2026).

#### WhatsApp · Coletar o dado que falta depois da ligação

> Obrigado pela conversa! Pra fechar a sua simulação só falta um dado: quanto vocês já têm guardado pra começar, mais ou menos?

**Por que funciona:** Uma pergunta só, com o motivo implícito na frase. O cliente responde em segundos.

#### Ligação · Pedir a data de nascimento sem assustar

> Pra eu ver o prazo certo do financiamento, que depende da idade, qual a data de nascimento de quem vai assinar? Fica só aqui na sua ficha da SMQ.

**Por que funciona:** Explica por que o dado é pedido e onde ele fica. LGPD na prática: dado com motivo, depois do aceite.

### Erros que matam a venda

- **Chutar uma parcela de tabela genérica**  
  Quanto custa: O cliente guarda o número errado e se sente enganado quando a simulação real vem diferente  
  Correção: Parcela só depois da renda, sempre como estimativa
- **Simular sem saber o dinheiro guardado**  
  Quanto custa: A parcela cabe e a venda morre na entrada  
  Correção: Perguntar entrada e FGTS antes de qualquer conta
- **Perguntar de novo o que o robô já coletou**  
  Quanto custa: O cliente repete tudo e desiste  
  Correção: Ler o dossiê e só completar o que falta

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Preencher antes de simular
- **Campo:** Renda informada, Tipo de renda, Usa FGTS, Entrada disponível e Faixa MCMV
- **Regra:** Dado que não está na ficha não entra na simulação

### Frase-âncora

> **Simulação sem entrada é número de enfeite.**

### Checagem rápida

1. Quais dados você coleta antes de simular?  
   Resposta: Renda, tipo de renda, FGTS e tempo de registro, dinheiro guardado, idade de quem assina e situação do nome.
2. Em quanto tempo a simulação deve estar pronta?  
   Resposta: Em até 15 minutos.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente pergunta \"quanto fica a parcela?\" no primeiro minuto. O corretor comum chuta um número de tabela. O corretor SMQ responde com três perguntas e, 15 minutos depois, tem a conta de verdade na mão, com o nome do cliente nela.","por_que_importa":"A entrada falta em 85,1% dos dossiês que chegam do robô, o FGTS em 73,1% e a restrição no nome em 69,5% (notas de qualificação, jul a set/2026). Simulação feita sem esses dados é número de enfeite: agrada hoje e desmorona na análise. Simulação feita com eles decide se o cliente vai para a visita, para a análise ou para outro produto, ainda na primeira conversa.","conceito":"Simular é como medir antes de comprar o móvel: você não leva o sofá para casa torcendo para passar na porta. A simulação não é o fim da qualificação, é a qualificação com número. Cada dado que você pede tem um porquê, e o cliente entrega mais fácil quando entende o porquê.","metodo":["Peça licença com o benefício: \"Pra te dar a sua parcela, e não uma de tabela, preciso de alguns dados rápidos. Posso te perguntar?\"","Renda: \"Quanto vocês ganham juntos por mês, mais ou menos?\" Porquê: a parcela cabe em até cerca de 30% dela (seção 9.9, vigente em set/2026).","Tipo de renda: registrado, autônomo, MEI, aplicativo ou aposentadoria. Porquê: muda o documento e o valor que a análise considera (detalhe no M07).","FGTS e tempo de registro: \"Você já trabalhou 3 anos com carteira assinada, somando todos os empregos?\" Porquê: 3 anos liberam o FGTS na compra e costumam dar taxa menor (detalhe no M09).","Dinheiro guardado: \"Quanto vocês já têm guardado pra começar?\" Porquê: a trava costuma ser a entrada, não a parcela.","Idade do mais velho que vai entrar no contrato: \"Qual a data de nascimento de quem vai assinar?\" Porquê: idade mais prazo vai até 80 anos e 6 meses. Peça depois do aceite e explique o motivo (LGPD).","Nome: \"Tem alguma pendência no nome hoje?\" Porquê: restrição não descarta, mas muda o caminho (pré-análise com o correspondente).","Registre tudo no Dossiê antes de simular e simule em até 15 minutos, com o cliente na linha ou logo depois."],"na_vida_real":{"caso":"Caso B da Casoteca: técnica e escritório no mesmo dia (corretor da equipe, Barra Funda e Perdizes).","o_que_foi_dito":"\"Dá pra termos uma ideia de até quanto você consegue de crédito com as informações básicas: se tem FGTS, entrada, renda familiar e data de nascimento.\" E: \"A Caixa quer saber a capacidade de compra, com base em FGTS, renda, entrada e idade.\"","resultado":"A pergunta veio com a justificativa, o cliente respondeu tudo, a simulação saiu melhor que o esperado e o convite para o escritório aconteceu no mesmo dia.","fonte":"Casoteca SMQ, caso B (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"O cliente pede a parcela antes de você saber a renda","texto":"Te passo sim, e quero que seja a sua parcela, não uma de tabela. Pra isso eu preciso de três coisas rápidas: quanto vocês ganham juntos por mês, se tem FGTS e quanto já têm guardado. Posso te perguntar?","por_que_funciona":"Acolhe o pedido, explica o porquê e devolve a condução com uma pergunta. Preço pode; parcela depende da renda (regra do diretor, set/2026)."},{"canal":"WhatsApp","situacao":"Coletar o dado que falta depois da ligação","texto":"Obrigado pela conversa! Pra fechar a sua simulação só falta um dado: quanto vocês já têm guardado pra começar, mais ou menos?","por_que_funciona":"Uma pergunta só, com o motivo implícito na frase. O cliente responde em segundos."},{"canal":"Ligação","situacao":"Pedir a data de nascimento sem assustar","texto":"Pra eu ver o prazo certo do financiamento, que depende da idade, qual a data de nascimento de quem vai assinar? Fica só aqui na sua ficha da SMQ.","por_que_funciona":"Explica por que o dado é pedido e onde ele fica. LGPD na prática: dado com motivo, depois do aceite."}],"erros_que_matam":[{"erro":"Chutar uma parcela de tabela genérica","custo":"O cliente guarda o número errado e se sente enganado quando a simulação real vem diferente","correcao":"Parcela só depois da renda, sempre como estimativa"},{"erro":"Simular sem saber o dinheiro guardado","custo":"A parcela cabe e a venda morre na entrada","correcao":"Perguntar entrada e FGTS antes de qualquer conta"},{"erro":"Perguntar de novo o que o robô já coletou","custo":"O cliente repete tudo e desiste","correcao":"Ler o dossiê e só completar o que falta"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Preencher antes de simular","campo":"Renda informada, Tipo de renda, Usa FGTS, Entrada disponível e Faixa MCMV","regra":"Dado que não está na ficha não entra na simulação"},"frase_ancora":"Simulação sem entrada é número de enfeite.","checagem_rapida":[{"pergunta":"Quais dados você coleta antes de simular?","resposta":"Renda, tipo de renda, FGTS e tempo de registro, dinheiro guardado, idade de quem assina e situação do nome."},{"pergunta":"Em quanto tempo a simulação deve estar pronta?","resposta":"Em até 15 minutos."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M08-A2', 2, 'A conta da casa: 30% da renda, PRICE e a capacidade por faixa', 'texto',
  'Parece óbvio que quem ganha mais compra mais. O estudo interno da casa (ago/2026) mostrou o contrário: quem ganha R$ 11.000 na F4 financiava menos do que quem ganha R$ 9.600 no topo da F3. "Anunciar para a classe média" não é estratégia automática.

### Por que importa

Quem entende a conta escolhe o produto certo antes da visita e não perde o cliente na análise. Quem não entende apresenta o que o cliente gosta, não o que cabe, e descobre o problema tarde, quando o cliente já se apaixonou pela planta.

### O conceito

A parcela do financiamento, com seguros e taxa de administração, cabe em até cerca de 30% da renda bruta familiar. Exemplo que a casa usa: renda de R$ 5.000, parcela de até R$ 1.500. A casa simula em PRICE, que é a parcela fixa, validada contra o simulador da Caixa; o SAC entra só como comparação. Juros maiores comem capacidade, e é por isso que a F4 pode financiar menos que o topo da F3.

### O método SMQ, passo a passo

1. Calcule o teto da parcela: 30% da renda bruta familiar (renda de R$ 6.000, parcela de até cerca de R$ 1.800).
2. Abra o Dossiê › aba Qualificação e use o card de pré-qualificação: renda, entrada, FGTS, "36 meses de registro" e "Tem dependente". Leia "Pode comprar até", "Parcela estimada" e "Financiamento".
3. Confirme no simulador oficial, com a taxa do dia. A taxa sai no simulador e se confirma na análise (seção 9.9).
4. Use a capacidade por faixa do estudo interno (ago/2026, PRICE, 420 meses, parcela de 30% da renda com seguros e taxa) só como ordem de grandeza: R$ 4.244 de renda, cerca de R$ 209,7 mil; R$ 5.000, cerca de R$ 250 mil; R$ 7.113, cerca de R$ 317,5 mil; R$ 9.600, cerca de R$ 425,2 mil; R$ 11.000 na F4, a 10,5% ao ano, cerca de R$ 407 mil.
5. Nunca use a tabela do estudo com o cliente: ela mostra a ordem de grandeza, não a conta dele.
6. Diga sempre: "isto é estimativa, a aprovação é da Caixa".

### Na vida real

**O caso:** O estudo de capacidade por faixa (ago/2026) e o estoque da Zona Oeste e da Zona Sul.

**O que foi dito:** No estudo, a renda-alvo para produtos a partir de R$ 259 mil era de cerca de R$ 5.200, com parcela de R$ 1.558,98. Metade das análises de jul/2026 era de F1 e F2, que não compravam aquele estoque.

**O que aconteceu:** A lição virou regra da casa: triagem pela capacidade antes de apresentar. Produto bonito que não cabe na conta é visita perdida.

### Scripts prontos

#### Ligação · Explicar a regra dos 30% em linguagem de cliente

> A Caixa olha quanto da renda de vocês a parcela ocupa. Ela aceita até mais ou menos 30%, já com seguro. Com o que vocês ganham, a parcela fica em torno de R$ [valor]. Faz sentido pra vocês esse valor por mês?

**Por que funciona:** Troca "comprometimento de renda" por uma conta que o cliente entende e termina numa pergunta que testa o conforto dele.

#### WhatsApp · Mandar o resultado da pré-qualificação

> Fiz a sua conta com a renda e o FGTS que você me passou. Pelo seu perfil, a parcela fica em torno de R$ [valor], mas isto é estimativa, a aprovação é da Caixa. Posso te ligar 5 minutos pra te explicar?

**Por que funciona:** Número com a ressalva obrigatória e o convite para a voz, onde a simulação vira história.

### Erros que matam a venda

- **Achar que renda maior sempre compra imóvel maior**  
  Quanto custa: Na F4, os juros mais altos podem fazer o cliente financiar menos que no topo da F3 (estudo de ago/2026)  
  Correção: Simular sempre com a taxa da faixa do cliente
- **Usar a tabela antiga do módulo (F4 financiando até R$ 560 mil)**  
  Quanto custa: Promessa de capacidade que o simulador desmente  
  Correção: Refazer no simulador com a taxa do dia
- **Apresentar a simulação em SAC**  
  Quanto custa: A primeira parcela assusta e o cliente desiste de algo que cabia  
  Correção: PRICE nos exemplos; SAC só como comparação

### No CRM

- **Tela:** Dossiê do cliente › aba Qualificação
- **Ação:** Preencher o card de pré-qualificação com renda, entrada, FGTS, 36 meses de registro e dependente
- **Campo:** Pode comprar até, Parcela estimada, Financiamento, Subsídio
- **Regra:** O card é estimativa comercial; a conta que vale para o cliente é a do simulador oficial, e a aprovação é da análise

### Frase-âncora

> **Simulação indica. Análise formal aprova.**

### Checagem rápida

1. Renda de R$ 6.000: a parcela cabe em até quanto, mais ou menos?  
   Resposta: Cerca de R$ 1.800 (30%), já com seguros e taxa.
2. Por que a F4 pode financiar menos que o topo da F3?  
   Resposta: Porque os juros mais altos comem a capacidade de financiamento.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Parece óbvio que quem ganha mais compra mais. O estudo interno da casa (ago/2026) mostrou o contrário: quem ganha R$ 11.000 na F4 financiava menos do que quem ganha R$ 9.600 no topo da F3. \"Anunciar para a classe média\" não é estratégia automática.","por_que_importa":"Quem entende a conta escolhe o produto certo antes da visita e não perde o cliente na análise. Quem não entende apresenta o que o cliente gosta, não o que cabe, e descobre o problema tarde, quando o cliente já se apaixonou pela planta.","conceito":"A parcela do financiamento, com seguros e taxa de administração, cabe em até cerca de 30% da renda bruta familiar. Exemplo que a casa usa: renda de R$ 5.000, parcela de até R$ 1.500. A casa simula em PRICE, que é a parcela fixa, validada contra o simulador da Caixa; o SAC entra só como comparação. Juros maiores comem capacidade, e é por isso que a F4 pode financiar menos que o topo da F3.","metodo":["Calcule o teto da parcela: 30% da renda bruta familiar (renda de R$ 6.000, parcela de até cerca de R$ 1.800).","Abra o Dossiê › aba Qualificação e use o card de pré-qualificação: renda, entrada, FGTS, \"36 meses de registro\" e \"Tem dependente\". Leia \"Pode comprar até\", \"Parcela estimada\" e \"Financiamento\".","Confirme no simulador oficial, com a taxa do dia. A taxa sai no simulador e se confirma na análise (seção 9.9).","Use a capacidade por faixa do estudo interno (ago/2026, PRICE, 420 meses, parcela de 30% da renda com seguros e taxa) só como ordem de grandeza: R$ 4.244 de renda, cerca de R$ 209,7 mil; R$ 5.000, cerca de R$ 250 mil; R$ 7.113, cerca de R$ 317,5 mil; R$ 9.600, cerca de R$ 425,2 mil; R$ 11.000 na F4, a 10,5% ao ano, cerca de R$ 407 mil.","Nunca use a tabela do estudo com o cliente: ela mostra a ordem de grandeza, não a conta dele.","Diga sempre: \"isto é estimativa, a aprovação é da Caixa\"."],"na_vida_real":{"caso":"O estudo de capacidade por faixa (ago/2026) e o estoque da Zona Oeste e da Zona Sul.","o_que_foi_dito":"No estudo, a renda-alvo para produtos a partir de R$ 259 mil era de cerca de R$ 5.200, com parcela de R$ 1.558,98. Metade das análises de jul/2026 era de F1 e F2, que não compravam aquele estoque.","resultado":"A lição virou regra da casa: triagem pela capacidade antes de apresentar. Produto bonito que não cabe na conta é visita perdida.","fonte":"Estudo interno de capacidade (ago/2026), seções 9.9 e 9.15"},"scripts":[{"canal":"Ligação","situacao":"Explicar a regra dos 30% em linguagem de cliente","texto":"A Caixa olha quanto da renda de vocês a parcela ocupa. Ela aceita até mais ou menos 30%, já com seguro. Com o que vocês ganham, a parcela fica em torno de R$ [valor]. Faz sentido pra vocês esse valor por mês?","por_que_funciona":"Troca \"comprometimento de renda\" por uma conta que o cliente entende e termina numa pergunta que testa o conforto dele."},{"canal":"WhatsApp","situacao":"Mandar o resultado da pré-qualificação","texto":"Fiz a sua conta com a renda e o FGTS que você me passou. Pelo seu perfil, a parcela fica em torno de R$ [valor], mas isto é estimativa, a aprovação é da Caixa. Posso te ligar 5 minutos pra te explicar?","por_que_funciona":"Número com a ressalva obrigatória e o convite para a voz, onde a simulação vira história."}],"erros_que_matam":[{"erro":"Achar que renda maior sempre compra imóvel maior","custo":"Na F4, os juros mais altos podem fazer o cliente financiar menos que no topo da F3 (estudo de ago/2026)","correcao":"Simular sempre com a taxa da faixa do cliente"},{"erro":"Usar a tabela antiga do módulo (F4 financiando até R$ 560 mil)","custo":"Promessa de capacidade que o simulador desmente","correcao":"Refazer no simulador com a taxa do dia"},{"erro":"Apresentar a simulação em SAC","custo":"A primeira parcela assusta e o cliente desiste de algo que cabia","correcao":"PRICE nos exemplos; SAC só como comparação"}],"no_crm":{"tela":"Dossiê do cliente › aba Qualificação","acao":"Preencher o card de pré-qualificação com renda, entrada, FGTS, 36 meses de registro e dependente","campo":"Pode comprar até, Parcela estimada, Financiamento, Subsídio","regra":"O card é estimativa comercial; a conta que vale para o cliente é a do simulador oficial, e a aprovação é da análise"},"frase_ancora":"Simulação indica. Análise formal aprova.","checagem_rapida":[{"pergunta":"Renda de R$ 6.000: a parcela cabe em até quanto, mais ou menos?","resposta":"Cerca de R$ 1.800 (30%), já com seguros e taxa."},{"pergunta":"Por que a F4 pode financiar menos que o topo da F3?","resposta":"Porque os juros mais altos comem a capacidade de financiamento."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M08-A3', 3, 'A armadilha do laudo: os 80% são do menor valor', 'texto',
  'A parcela cabia. O cliente estava feliz. Aí veio o laudo: tabela de R$ 480 mil, avaliação de cerca de R$ 350 mil. A entrada pulou de 20% para 41,7%, perto de R$ 200 mil. A venda morreu no caixa, não na parcela.

### Por que importa

A Caixa financia até 80% do menor valor entre o preço de venda e a avaliação. Quem simula só com o preço de tabela promete uma entrada que pode não existir. Rodar o cenário de laudo antes de recomendar protege o cliente, a sua credibilidade e o seu mês.

### O conceito

Pense no laudo como a balança da Caixa: ela não empresta sobre o preço que está na tabela, empresta sobre o que ela avalia. Se a avaliação vem abaixo do preço, o financiamento encolhe e a diferença cai na entrada do cliente. Entrada = preço menos 80% do menor valor entre preço e laudo.

### O método SMQ, passo a passo

1. Faça a conta com o laudo igual ao preço: a entrada é 20% do preço. Trate 20% como piso.
2. Faça com o laudo 10% abaixo: a entrada vai a 28% do preço.
3. Faça com o laudo 20% abaixo: a entrada vai a 36% do preço.
4. Em F3 e F4, rode sempre os três cenários antes de recomendar um produto.
5. Exemplo de treino, unidade de R$ 300 mil: laudo igual, financia R$ 240 mil e a entrada é R$ 60 mil; laudo 10% abaixo (R$ 270 mil), financia R$ 216 mil e a entrada é R$ 84 mil; laudo 20% abaixo (R$ 240 mil), financia R$ 192 mil e a entrada é R$ 108 mil.
6. Atalho de triagem: teto de compra com laudo cheio ≈ dinheiro disponível para a entrada ÷ 0,20 (R$ 50 mil guardados, teto de cerca de R$ 250 mil).
7. Avaliação acima do preço ajuda no financiamento, mas não é promessa de revenda nem de valorização.

### Na vida real

**O caso:** O laudo que matou a entrada (ago/2026).

**O que foi dito:** Tabela de R$ 480 mil, laudo de cerca de R$ 350 mil: a Caixa financiou 80% de R$ 350 mil, cerca de R$ 280 mil, e o cliente precisaria de uma entrada de R$ 200 mil, 41,7% do preço.

**O que aconteceu:** A parcela cabia; o caixa não. A venda não fechou. O caso virou a regra de rodar o laudo 10% e 20% abaixo antes de recomendar.

### Scripts prontos

#### Ligação · Explicar o laudo antes de ele virar problema

> Uma coisa importante que pouca gente explica: a Caixa financia até 80% do valor que ela avalia, não do preço da tabela. Se a avaliação vier abaixo, a entrada sobe. Eu já fiz a sua conta nos dois cenários pra você não ter surpresa. Posso te mostrar?

**Por que funciona:** Transforma o risco em prova de assessoria: o cliente vê que você pensou antes dele. É o pilar da assessoria no crédito em ação.

#### Visita · O cliente se apaixonou por uma unidade acima da conta

> Gostei que você gostou, e eu quero que você compre com segurança. Nessa unidade, se a avaliação vier um pouco abaixo, a entrada passa do que vocês têm hoje. Quer que eu te mostre uma opção parecida que fecha nos dois cenários?

**Por que funciona:** Valida a emoção, diz a verdade com número e oferece o caminho, sem sermão e sem matar o sonho.

### Erros que matam a venda

- **Ignorar o laudo**  
  Quanto custa: A entrada de 20% vira 41,7% (caso de ago/2026)  
  Correção: Rodar o cenário de laudo 10% e 20% abaixo antes de recomendar
- **Prometer que em lançamento o laudo sempre vem igual ou acima do preço**  
  Quanto custa: Promessa que a avaliação desmente e credibilidade destruída  
  Correção: Mostrar os cenários e dizer que quem avalia é a Caixa
- **Vender avaliação acima do preço como valorização garantida**  
  Quanto custa: Promessa proibida e risco de conformidade  
  Correção: Avaliação ajuda no financiamento; não é promessa de revenda

### No CRM

- **Tela:** Dossiê › aba Qualificação › card de pré-qualificação, campo "Esse imóvel cabe? (preço do imóvel)"
- **Ação:** Testar o preço da unidade e anotar em Resumo / Observações a entrada nos cenários de laudo igual, 10% e 20% abaixo
- **Campo:** Resumo / Observações
- **Regra:** O card calcula com o laudo igual ao preço; os cenários de laudo abaixo você faz e registra [GAP DE CRM]

### Frase-âncora

> **Produto que só passa com laudo cheio não é recomendação, é aposta.**

### Checagem rápida

1. Sobre qual valor incidem os 80% da Caixa?  
   Resposta: Sobre o menor valor entre o preço de venda e a avaliação.
2. Com o laudo 20% abaixo do preço, qual é a entrada?  
   Resposta: 36% do preço.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"A parcela cabia. O cliente estava feliz. Aí veio o laudo: tabela de R$ 480 mil, avaliação de cerca de R$ 350 mil. A entrada pulou de 20% para 41,7%, perto de R$ 200 mil. A venda morreu no caixa, não na parcela.","por_que_importa":"A Caixa financia até 80% do menor valor entre o preço de venda e a avaliação. Quem simula só com o preço de tabela promete uma entrada que pode não existir. Rodar o cenário de laudo antes de recomendar protege o cliente, a sua credibilidade e o seu mês.","conceito":"Pense no laudo como a balança da Caixa: ela não empresta sobre o preço que está na tabela, empresta sobre o que ela avalia. Se a avaliação vem abaixo do preço, o financiamento encolhe e a diferença cai na entrada do cliente. Entrada = preço menos 80% do menor valor entre preço e laudo.","metodo":["Faça a conta com o laudo igual ao preço: a entrada é 20% do preço. Trate 20% como piso.","Faça com o laudo 10% abaixo: a entrada vai a 28% do preço.","Faça com o laudo 20% abaixo: a entrada vai a 36% do preço.","Em F3 e F4, rode sempre os três cenários antes de recomendar um produto.","Exemplo de treino, unidade de R$ 300 mil: laudo igual, financia R$ 240 mil e a entrada é R$ 60 mil; laudo 10% abaixo (R$ 270 mil), financia R$ 216 mil e a entrada é R$ 84 mil; laudo 20% abaixo (R$ 240 mil), financia R$ 192 mil e a entrada é R$ 108 mil.","Atalho de triagem: teto de compra com laudo cheio ≈ dinheiro disponível para a entrada ÷ 0,20 (R$ 50 mil guardados, teto de cerca de R$ 250 mil).","Avaliação acima do preço ajuda no financiamento, mas não é promessa de revenda nem de valorização."],"na_vida_real":{"caso":"O laudo que matou a entrada (ago/2026).","o_que_foi_dito":"Tabela de R$ 480 mil, laudo de cerca de R$ 350 mil: a Caixa financiou 80% de R$ 350 mil, cerca de R$ 280 mil, e o cliente precisaria de uma entrada de R$ 200 mil, 41,7% do preço.","resultado":"A parcela cabia; o caixa não. A venda não fechou. O caso virou a regra de rodar o laudo 10% e 20% abaixo antes de recomendar.","fonte":"Casoteca SMQ, casos da era do CRM (seção 9.12) e seção 9.9"},"scripts":[{"canal":"Ligação","situacao":"Explicar o laudo antes de ele virar problema","texto":"Uma coisa importante que pouca gente explica: a Caixa financia até 80% do valor que ela avalia, não do preço da tabela. Se a avaliação vier abaixo, a entrada sobe. Eu já fiz a sua conta nos dois cenários pra você não ter surpresa. Posso te mostrar?","por_que_funciona":"Transforma o risco em prova de assessoria: o cliente vê que você pensou antes dele. É o pilar da assessoria no crédito em ação."},{"canal":"Visita","situacao":"O cliente se apaixonou por uma unidade acima da conta","texto":"Gostei que você gostou, e eu quero que você compre com segurança. Nessa unidade, se a avaliação vier um pouco abaixo, a entrada passa do que vocês têm hoje. Quer que eu te mostre uma opção parecida que fecha nos dois cenários?","por_que_funciona":"Valida a emoção, diz a verdade com número e oferece o caminho, sem sermão e sem matar o sonho."}],"erros_que_matam":[{"erro":"Ignorar o laudo","custo":"A entrada de 20% vira 41,7% (caso de ago/2026)","correcao":"Rodar o cenário de laudo 10% e 20% abaixo antes de recomendar"},{"erro":"Prometer que em lançamento o laudo sempre vem igual ou acima do preço","custo":"Promessa que a avaliação desmente e credibilidade destruída","correcao":"Mostrar os cenários e dizer que quem avalia é a Caixa"},{"erro":"Vender avaliação acima do preço como valorização garantida","custo":"Promessa proibida e risco de conformidade","correcao":"Avaliação ajuda no financiamento; não é promessa de revenda"}],"no_crm":{"tela":"Dossiê › aba Qualificação › card de pré-qualificação, campo \"Esse imóvel cabe? (preço do imóvel)\"","acao":"Testar o preço da unidade e anotar em Resumo / Observações a entrada nos cenários de laudo igual, 10% e 20% abaixo","campo":"Resumo / Observações","regra":"O card calcula com o laudo igual ao preço; os cenários de laudo abaixo você faz e registra [GAP DE CRM]"},"frase_ancora":"Produto que só passa com laudo cheio não é recomendação, é aposta.","checagem_rapida":[{"pergunta":"Sobre qual valor incidem os 80% da Caixa?","resposta":"Sobre o menor valor entre o preço de venda e a avaliação."},{"pergunta":"Com o laudo 20% abaixo do preço, qual é a entrada?","resposta":"36% do preço."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M08-A4', 4, 'Esforço mensal, prazo pela idade e o produto que não fecha', 'texto',
  'A entrada não precisa estar toda no bolso hoje: na planta, a diferença se parcela com a construtora até as chaves. Mas cada real parcelado sai do mês do cliente. Se o esforço passa do que ele aguenta, o sonho vira dívida.

### Por que importa

O esforço mensal é a conta que separa a venda saudável da venda que cancela. Dizer "não dá" cedo, com número, salva o mês do corretor e a vida financeira do cliente. E mostrar outro produto que fecha mantém a venda viva.

### O conceito

Esforço mensal = (entrada exigida menos o dinheiro disponível) ÷ meses até a entrega. Pense numa mochila na subida: até cerca de 22% da renda o cliente sobe bem; de 30% a 50% ele sobe com esforço, é plano B; acima disso ele não chega. Some a isso a regra da idade: idade mais prazo até 80 anos e 6 meses. Prazo menor, parcela maior.

### O método SMQ, passo a passo

1. Calcule a entrada exigida no cenário de laudo (aula A3).
2. Desconte o dinheiro guardado e o FGTS que pode ser usado (regras do FGTS no M09).
3. Divida pelo número de meses até a entrega (confirme a data do empreendimento em Documentação & Projetos).
4. Compare com a renda: até cerca de 22% é apresentável; de 30% a 50% é plano B; acima disso não fecha.
5. Confira o prazo pela idade de quem assina: cliente de 55 anos, prazo máximo de 25 anos e 6 meses; de 58 anos, 22 anos e 6 meses. Com composição, a idade do mais velho costuma limitar o prazo [CONFIRMAR com o correspondente].
6. Se não fecha: diga com verdade, mostre o produto que fecha ou o marco que muda a conta (a data em que o cliente completa 3 anos de FGTS) e registre o próximo passo com data.
7. Na F4, antes de sugerir composição de renda, calcule a folga: 13.000 menos a renda atual. Passou de R$ 13.000, sai do MCMV e cai no SBPE.
8. Exemplo de treino (persona P3): renda de R$ 7.500, R$ 10 mil guardados, produto de R$ 259.718 (preço "a partir de" do catálogo de 29/09/2026), 24 meses até a entrega. Laudo cheio, sem FGTS: esforço de R$ 1.747,65 por mês, 23,3% da renda, acima do apresentável. Com R$ 12 mil de FGTS liberados no marco dos 3 anos: R$ 1.247,65, 16,6%. O "vou pensar" vira data: visita agora, análise na semana do marco.

### Na vida real

**O caso:** Caso G da Casoteca: a vaga perto do metrô (1:1 de gestão, abr/2026).

**O que foi dito:** O cliente queria apartamento colado no metrô e com vaga, com orçamento de MCMV. A condução foi trazer para a realidade com três saídas: estacionamento mensal perto do metrô, outra região com vaga ou outro padrão de produto, que custa bem mais.

**O que aconteceu:** A lição que ficou: "você não ganha na insistência, o cliente não ganha na insistência". Mostre o que cabe, com número, antes de o cliente se apaixonar pelo que não cabe.

### Scripts prontos

#### Ligação · Dizer que o produto não fecha, sem matar a venda

> Fiz a conta com cuidado e vou ser sincero com você: nessa unidade, até as chaves, você teria que separar mais da metade do que ganha. Eu não quero te colocar nisso. Tenho uma opção que fecha com folga. Posso te mostrar sábado de manhã ou à tarde?

**Por que funciona:** Verdade com número, cuidado genuíno e a saída com duas opções de horário. "Dizer ''não dá'' cedo salva o mês."

#### WhatsApp · Cliente com FGTS perto do marco de 3 anos

> Boa notícia: em 2 meses você completa 3 anos de registro, e aí o FGTS entra na conta da entrada. Já deixo a sua análise marcada pra essa semana?

**Por que funciona:** Transforma o marco do FGTS em data e em próximo passo. Uma pergunta só.

### Erros que matam a venda

- **Apresentar produto com esforço mensal acima de 50% da renda**  
  Quanto custa: Venda que cancela ou cliente que se endivida  
  Correção: Dizer que não fecha e mostrar o produto que fecha
- **Sugerir composição de renda na F4 sem calcular a folga**  
  Quanto custa: O cliente sai do programa e cai no SBPE, com juros de mercado  
  Correção: Calcular 13.000 menos a renda antes de sugerir
- **Simular com 35 anos de prazo para um cliente de 58 anos**  
  Quanto custa: Parcela menor que a real e surpresa na análise  
  Correção: Idade mais prazo até 80 anos e 6 meses: 22 anos e 6 meses para quem tem 58

### No CRM

- **Tela:** Fila Única › desfecho do card
- **Ação:** Registrar o desfecho com o próximo passo e a data (outro produto, visita ou a data do marco do FGTS); se não há caminho, perdido com o motivo verdadeiro
- **Campo:** Desfecho, próximo passo e data; motivo "Achou caro / parcela não cabe" ou "Renda acima do teto MCMV" quando for o caso
- **Regra:** Não fecha hoje não é silêncio: é próximo passo com data ou motivo verdadeiro

### Frase-âncora

> **Dizer "não dá" cedo salva o mês.**

### Checagem rápida

1. Qual é a fórmula do esforço mensal?  
   Resposta: Entrada exigida menos o dinheiro disponível, dividido pelos meses até a entrega.
2. Cliente de 60 anos: qual o prazo máximo?  
   Resposta: 20 anos e 6 meses (idade mais prazo até 80 anos e 6 meses).
3. Até quanto da renda o esforço mensal é apresentável?  
   Resposta: Até cerca de 22%.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"A entrada não precisa estar toda no bolso hoje: na planta, a diferença se parcela com a construtora até as chaves. Mas cada real parcelado sai do mês do cliente. Se o esforço passa do que ele aguenta, o sonho vira dívida.","por_que_importa":"O esforço mensal é a conta que separa a venda saudável da venda que cancela. Dizer \"não dá\" cedo, com número, salva o mês do corretor e a vida financeira do cliente. E mostrar outro produto que fecha mantém a venda viva.","conceito":"Esforço mensal = (entrada exigida menos o dinheiro disponível) ÷ meses até a entrega. Pense numa mochila na subida: até cerca de 22% da renda o cliente sobe bem; de 30% a 50% ele sobe com esforço, é plano B; acima disso ele não chega. Some a isso a regra da idade: idade mais prazo até 80 anos e 6 meses. Prazo menor, parcela maior.","metodo":["Calcule a entrada exigida no cenário de laudo (aula A3).","Desconte o dinheiro guardado e o FGTS que pode ser usado (regras do FGTS no M09).","Divida pelo número de meses até a entrega (confirme a data do empreendimento em Documentação & Projetos).","Compare com a renda: até cerca de 22% é apresentável; de 30% a 50% é plano B; acima disso não fecha.","Confira o prazo pela idade de quem assina: cliente de 55 anos, prazo máximo de 25 anos e 6 meses; de 58 anos, 22 anos e 6 meses. Com composição, a idade do mais velho costuma limitar o prazo [CONFIRMAR com o correspondente].","Se não fecha: diga com verdade, mostre o produto que fecha ou o marco que muda a conta (a data em que o cliente completa 3 anos de FGTS) e registre o próximo passo com data.","Na F4, antes de sugerir composição de renda, calcule a folga: 13.000 menos a renda atual. Passou de R$ 13.000, sai do MCMV e cai no SBPE.","Exemplo de treino (persona P3): renda de R$ 7.500, R$ 10 mil guardados, produto de R$ 259.718 (preço \"a partir de\" do catálogo de 29/09/2026), 24 meses até a entrega. Laudo cheio, sem FGTS: esforço de R$ 1.747,65 por mês, 23,3% da renda, acima do apresentável. Com R$ 12 mil de FGTS liberados no marco dos 3 anos: R$ 1.247,65, 16,6%. O \"vou pensar\" vira data: visita agora, análise na semana do marco."],"na_vida_real":{"caso":"Caso G da Casoteca: a vaga perto do metrô (1:1 de gestão, abr/2026).","o_que_foi_dito":"O cliente queria apartamento colado no metrô e com vaga, com orçamento de MCMV. A condução foi trazer para a realidade com três saídas: estacionamento mensal perto do metrô, outra região com vaga ou outro padrão de produto, que custa bem mais.","resultado":"A lição que ficou: \"você não ganha na insistência, o cliente não ganha na insistência\". Mostre o que cabe, com número, antes de o cliente se apaixonar pelo que não cabe.","fonte":"Casoteca SMQ, caso G (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Dizer que o produto não fecha, sem matar a venda","texto":"Fiz a conta com cuidado e vou ser sincero com você: nessa unidade, até as chaves, você teria que separar mais da metade do que ganha. Eu não quero te colocar nisso. Tenho uma opção que fecha com folga. Posso te mostrar sábado de manhã ou à tarde?","por_que_funciona":"Verdade com número, cuidado genuíno e a saída com duas opções de horário. \"Dizer ''não dá'' cedo salva o mês.\""},{"canal":"WhatsApp","situacao":"Cliente com FGTS perto do marco de 3 anos","texto":"Boa notícia: em 2 meses você completa 3 anos de registro, e aí o FGTS entra na conta da entrada. Já deixo a sua análise marcada pra essa semana?","por_que_funciona":"Transforma o marco do FGTS em data e em próximo passo. Uma pergunta só."}],"erros_que_matam":[{"erro":"Apresentar produto com esforço mensal acima de 50% da renda","custo":"Venda que cancela ou cliente que se endivida","correcao":"Dizer que não fecha e mostrar o produto que fecha"},{"erro":"Sugerir composição de renda na F4 sem calcular a folga","custo":"O cliente sai do programa e cai no SBPE, com juros de mercado","correcao":"Calcular 13.000 menos a renda antes de sugerir"},{"erro":"Simular com 35 anos de prazo para um cliente de 58 anos","custo":"Parcela menor que a real e surpresa na análise","correcao":"Idade mais prazo até 80 anos e 6 meses: 22 anos e 6 meses para quem tem 58"}],"no_crm":{"tela":"Fila Única › desfecho do card","acao":"Registrar o desfecho com o próximo passo e a data (outro produto, visita ou a data do marco do FGTS); se não há caminho, perdido com o motivo verdadeiro","campo":"Desfecho, próximo passo e data; motivo \"Achou caro / parcela não cabe\" ou \"Renda acima do teto MCMV\" quando for o caso","regra":"Não fecha hoje não é silêncio: é próximo passo com data ou motivo verdadeiro"},"frase_ancora":"Dizer \"não dá\" cedo salva o mês.","checagem_rapida":[{"pergunta":"Qual é a fórmula do esforço mensal?","resposta":"Entrada exigida menos o dinheiro disponível, dividido pelos meses até a entrega."},{"pergunta":"Cliente de 60 anos: qual o prazo máximo?","resposta":"20 anos e 6 meses (idade mais prazo até 80 anos e 6 meses)."},{"pergunta":"Até quanto da renda o esforço mensal é apresentável?","resposta":"Até cerca de 22%."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M08-A5', 5, 'Contar a simulação como história e fechar o próximo passo', 'texto',
  'Tabela não emociona ninguém. "Com o que vocês já têm e o FGTS, a chave chega com uma parcela parecida com o aluguel de hoje" emociona, e é verdade quando a conta foi bem feita.

### Por que importa

A simulação é o momento em que o cliente decide se acredita. Contada como história, ela vira convite para a visita ou para a análise. Contada como planilha, ela vira "vou pensar". E o PDF do simulador não é aprovação: tratar como aprovação é promessa que a análise pode desmentir.

### O conceito

Conte em três atos: onde o cliente está (renda, FGTS, dinheiro guardado), o caminho (entrada, esforço até as chaves, parcela depois) e o próximo passo (um dos 2 caminhos: visita com dia e hora ou análise com documento). A frase obrigatória fecha o segundo ato: "isto é estimativa, a aprovação é da Caixa".

### O método SMQ, passo a passo

1. Ato 1, onde você está: repita os dados do cliente com as palavras dele.
2. Ato 2, o caminho: a entrada (e o cenário de laudo), o esforço mensal até as chaves e a parcela estimada depois, separando parcela de obra e parcela do financiamento (detalhe no M09).
3. Diga a frase obrigatória: "isto é estimativa, a aprovação é da Caixa".
4. Ato 3, o próximo passo: ofereça a visita com duas opções de horário ou a análise gratuita com documento.
5. Se o cliente disser "já fui aprovado em outra construtora": cada projeto tem a sua avaliação; só a documentação responde.
6. Registre na hora: desfecho "Enviei simulação" quando mandou o resultado, com o próximo passo que o sistema cria; no dia da visita, marque "Simulação e condições revisadas" no Modo Visita.

### Na vida real

**O caso:** Caso F da Casoteca: "Já fui aprovado em outra construtora" (1:1 de gestão, abr/2026).

**O que foi dito:** Na linha de: "Cada projeto tem a sua avaliação, de cada unidade. Pode ser que aqui seja diferente da análise que você fez na outra construtora, pra mais ou pra menos. Eu só vou saber de verdade se você me mandar a documentação."

**O que aconteceu:** A objeção virou pedido de documento, e a conversa ficou ligada à regra do laudo, sem promessa.

### Scripts prontos

#### Ligação · Contar o resultado em três atos

> Olha o que a gente tem: vocês ganham R$ [renda] juntos e têm R$ [valor] entre FGTS e o guardado. Até as chaves, vocês separariam em torno de R$ [esforço] por mês, e depois a parcela fica em torno de R$ [parcela]. Isto é estimativa, a aprovação é da Caixa. Vamos ver o decorado sábado às 10h ou às 14h?

**Por que funciona:** História curta com os números do cliente, a ressalva obrigatória e o fechamento com duas opções.

#### WhatsApp · O cliente pergunta se o PDF do simulador é aprovação

> Esse PDF mostra a sua capacidade estimada, não é aprovação. Quem aprova é a Caixa, na análise, que é gratuita e não te compromete. Quer que eu já veja os seus documentos?

**Por que funciona:** Corrige a expectativa sem esfriar e já puxa o próximo passo com uma pergunta só. A análise é gratuita: âncora antigolpe.

### Erros que matam a venda

- **Dizer que o PDF do simulador é aprovação**  
  Quanto custa: Promessa que a análise pode desmentir e confiança destruída  
  Correção: "Isto é estimativa, a aprovação é da Caixa"
- **Mandar a simulação e sumir**  
  Quanto custa: O cliente esfria com o número na mão e ninguém cobra o combinado  
  Correção: Desfecho "Enviei simulação" com o próximo passo marcado
- **Vender a parcela de obra como "a parcela do apartamento"**  
  Quanto custa: O cliente descobre a parcela do financiamento na entrega e se sente enganado  
  Correção: Separar fluxo de obra e financiamento na explicação

### No CRM

- **Tela:** Fila Única › desfecho do card; Modo Visita › checklist
- **Ação:** Registrar "Enviei simulação" ao mandar o resultado; na visita, marcar "Simulação e condições revisadas"
- **Campo:** Desfecho "Enviei simulação" (o próximo passo "Cobrar retorno da simulação" vem em 2 dias); checklist do Modo Visita
- **Regra:** Simulação enviada sem próximo passo é cliente esfriando

### Frase-âncora

> **Pergunta aberta devolve "vou pensar". Duas opções devolvem um dia.**

### Checagem rápida

1. Quais são os três atos da simulação contada?  
   Resposta: Onde o cliente está, o caminho (entrada, esforço, parcela) e o próximo passo.
2. O PDF do simulador é aprovação?  
   Resposta: Não. É capacidade estimada; quem aprova é a Caixa na análise.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Tabela não emociona ninguém. \"Com o que vocês já têm e o FGTS, a chave chega com uma parcela parecida com o aluguel de hoje\" emociona, e é verdade quando a conta foi bem feita.","por_que_importa":"A simulação é o momento em que o cliente decide se acredita. Contada como história, ela vira convite para a visita ou para a análise. Contada como planilha, ela vira \"vou pensar\". E o PDF do simulador não é aprovação: tratar como aprovação é promessa que a análise pode desmentir.","conceito":"Conte em três atos: onde o cliente está (renda, FGTS, dinheiro guardado), o caminho (entrada, esforço até as chaves, parcela depois) e o próximo passo (um dos 2 caminhos: visita com dia e hora ou análise com documento). A frase obrigatória fecha o segundo ato: \"isto é estimativa, a aprovação é da Caixa\".","metodo":["Ato 1, onde você está: repita os dados do cliente com as palavras dele.","Ato 2, o caminho: a entrada (e o cenário de laudo), o esforço mensal até as chaves e a parcela estimada depois, separando parcela de obra e parcela do financiamento (detalhe no M09).","Diga a frase obrigatória: \"isto é estimativa, a aprovação é da Caixa\".","Ato 3, o próximo passo: ofereça a visita com duas opções de horário ou a análise gratuita com documento.","Se o cliente disser \"já fui aprovado em outra construtora\": cada projeto tem a sua avaliação; só a documentação responde.","Registre na hora: desfecho \"Enviei simulação\" quando mandou o resultado, com o próximo passo que o sistema cria; no dia da visita, marque \"Simulação e condições revisadas\" no Modo Visita."],"na_vida_real":{"caso":"Caso F da Casoteca: \"Já fui aprovado em outra construtora\" (1:1 de gestão, abr/2026).","o_que_foi_dito":"Na linha de: \"Cada projeto tem a sua avaliação, de cada unidade. Pode ser que aqui seja diferente da análise que você fez na outra construtora, pra mais ou pra menos. Eu só vou saber de verdade se você me mandar a documentação.\"","resultado":"A objeção virou pedido de documento, e a conversa ficou ligada à regra do laudo, sem promessa.","fonte":"Casoteca SMQ, caso F (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Contar o resultado em três atos","texto":"Olha o que a gente tem: vocês ganham R$ [renda] juntos e têm R$ [valor] entre FGTS e o guardado. Até as chaves, vocês separariam em torno de R$ [esforço] por mês, e depois a parcela fica em torno de R$ [parcela]. Isto é estimativa, a aprovação é da Caixa. Vamos ver o decorado sábado às 10h ou às 14h?","por_que_funciona":"História curta com os números do cliente, a ressalva obrigatória e o fechamento com duas opções."},{"canal":"WhatsApp","situacao":"O cliente pergunta se o PDF do simulador é aprovação","texto":"Esse PDF mostra a sua capacidade estimada, não é aprovação. Quem aprova é a Caixa, na análise, que é gratuita e não te compromete. Quer que eu já veja os seus documentos?","por_que_funciona":"Corrige a expectativa sem esfriar e já puxa o próximo passo com uma pergunta só. A análise é gratuita: âncora antigolpe."}],"erros_que_matam":[{"erro":"Dizer que o PDF do simulador é aprovação","custo":"Promessa que a análise pode desmentir e confiança destruída","correcao":"\"Isto é estimativa, a aprovação é da Caixa\""},{"erro":"Mandar a simulação e sumir","custo":"O cliente esfria com o número na mão e ninguém cobra o combinado","correcao":"Desfecho \"Enviei simulação\" com o próximo passo marcado"},{"erro":"Vender a parcela de obra como \"a parcela do apartamento\"","custo":"O cliente descobre a parcela do financiamento na entrega e se sente enganado","correcao":"Separar fluxo de obra e financiamento na explicação"}],"no_crm":{"tela":"Fila Única › desfecho do card; Modo Visita › checklist","acao":"Registrar \"Enviei simulação\" ao mandar o resultado; na visita, marcar \"Simulação e condições revisadas\"","campo":"Desfecho \"Enviei simulação\" (o próximo passo \"Cobrar retorno da simulação\" vem em 2 dias); checklist do Modo Visita","regra":"Simulação enviada sem próximo passo é cliente esfriando"},"frase_ancora":"Pergunta aberta devolve \"vou pensar\". Duas opções devolvem um dia.","checagem_rapida":[{"pergunta":"Quais são os três atos da simulação contada?","resposta":"Onde o cliente está, o caminho (entrada, esforço, parcela) e o próximo passo."},{"pergunta":"O PDF do simulador é aprovação?","resposta":"Não. É capacidade estimada; quem aprova é a Caixa na análise."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q01', 1, 'situacional',
  'No primeiro minuto da ligação, o cliente pergunta: "Quanto fica a parcela?" Você ainda não sabe a renda dele. Qual é a sua próxima fala?',
  '["\"Fica uns R$ 1.200, mais ou menos, igual pra todo mundo desse prédio.\"","\"A parcela é menor que o aluguel, pode ficar tranquilo.\"","\"Te passo sim, e quero que seja a sua. Me conta: quanto vocês ganham juntos por mês, mais ou menos?\"","\"Isso é com o banco. Me manda os documentos que o correspondente te fala.\""]'::jsonb,
  2,
  'A C acolhe o pedido e devolve a condução com a pergunta da renda: parcela depende da renda e sai como estimativa. A A é parcela de tabela genérica, que o cliente guarda e depois se sente enganado. A B é promessa sem conta. A D pede documento sem gerar valor e larga a condução.',
  'M08-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q02', 2, 'situacional',
  'A pré-qualificação de um cliente F3 deu parcela confortável. A unidade custa R$ 300 mil e ele tem R$ 60 mil guardados. O que você faz antes de recomendar?',
  '["Recomenda: a parcela cabe e ele tem os 20% de entrada.","Roda os cenários de laudo 10% e 20% abaixo (entrada de R$ 84 mil e R$ 108 mil) e mostra ao cliente o plano para cada um.","Pede à construtora um desconto extra para cobrir o risco do laudo.","Diz ao cliente que em lançamento o laudo sempre vem igual ao preço."]'::jsonb,
  1,
  'A B aplica a regra: em F3 e F4, rode sempre o laudo 10% e 20% abaixo; com R$ 300 mil, a entrada vai a R$ 84 mil e R$ 108 mil. A A ignora o laudo, o erro que transformou 20% em 41,7% em ago/2026. A C pede condição fora da campanha, que só o gerente ou o diretor autoriza. A D é promessa que a avaliação pode desmentir.',
  'M08-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q03', 3, 'situacional',
  'O cliente recebeu o PDF do simulador e escreve: "Então já estou aprovado, né?" Qual é a melhor resposta?',
  '["\"Isso! Esse PDF é a sua pré-aprovação, pode comemorar.\"","\"Com esse resultado, aprova com certeza.\"","\"Não sei te dizer, isso é com o banco.\"","\"Esse PDF mostra a sua capacidade estimada, não é aprovação. Quem aprova é a Caixa, na análise, que é gratuita. Quer que eu já veja os seus documentos?\""]'::jsonb,
  3,
  'A D corrige a expectativa com verdade e puxa o próximo passo com uma pergunta: o PDF do simulador é capacidade estimada. A A e a B prometem aprovação, frase proibida. A C é verdade pela metade e larga a condução: o cliente fica sem caminho.',
  'M08-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q04', 4, 'situacional',
  'Um cliente de 58 anos pergunta: "Na minha idade ainda dá pra financiar?" Qual é a resposta certa?',
  '["\"Dá, com prazo menor: idade mais prazo vai até 80 anos e 6 meses, então o seu prazo vai até 22 anos e 6 meses. A parcela fica um pouco maior. Vamos simular com esse prazo?\"","\"Financiamento só vai até os 60 anos, então não dá.\"","\"Dá sim, em 35 anos como todo mundo.\"","\"Na sua idade não compensa, melhor continuar no aluguel.\""]'::jsonb,
  0,
  'A A aplica a regra conferida (idade mais prazo até 80 anos e 6 meses) e fecha com a simulação. A B inventa um limite que não existe e descarta o cliente. A C ignora a idade e gera uma parcela menor que a real. A D é opinião que desqualifica o cliente sem conta.',
  'M08-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q05', 5, 'situacional',
  'Casal com renda de R$ 12.000 (F4) quer somar a renda da mãe, de R$ 2.500, "pra subir o valor". O que você faz primeiro?',
  '["Soma tudo: quanto mais renda, maior o financiamento.","Sugere informar só uma parte da renda da mãe para ficar dentro da faixa.","Calcula a folga (R$ 13.000 menos R$ 12.000 = R$ 1.000), mostra que a renda da mãe tira o casal do MCMV e leva ao SBPE, e compara os cenários antes de decidir.","Diz que F4 e SBPE têm os mesmos juros, então tanto faz."]'::jsonb,
  2,
  'A C faz a conta da folga antes de sugerir a composição: passou de R$ 13.000, sai do MCMV. A A é o erro que tira o cliente do programa sem ele saber. A B é informar renda diferente da real, risco grave para o cliente e para a SMQ. A D é falsa: fora do MCMV, os juros são de mercado.',
  'M08-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q06', 6, 'situacional',
  'A conta mostrou que, até as chaves, o cliente teria que separar 60% da renda por mês nessa unidade. O que você diz?',
  '["Apresenta mesmo assim: ele gostou e dá um jeito.","Diz com verdade que essa unidade não fecha e mostra uma opção que fecha, oferecendo duas opções de horário para conhecer.","Sugere que ele informe uma renda maior na análise.","Oferece um desconto por conta própria para fechar hoje."]'::jsonb,
  1,
  'A B segue a regra do esforço mensal: acima de 50% da renda não fecha, e o caminho é o produto que fecha, com próximo passo. A A empurra o cliente para uma dívida que ele não aguenta. A C é renda falsa, proibida. A D é condição fora da campanha sem autorização do gerente ou do diretor.',
  'M08-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q07', 7, 'situacional',
  'O cliente diz: "Já fui aprovado em outra construtora, então aqui também passa." Qual é a melhor resposta?',
  '["\"Então está garantido, é a mesma Caixa.\"","\"Aprovação de outro lugar não vale nada aqui.\"","\"Vou usar a mesma simulação que fizeram lá.\"","\"Cada projeto tem a sua avaliação, de cada unidade. Aqui pode ser diferente, pra mais ou pra menos. Eu só sei de verdade com a sua documentação. Consegue me mandar hoje?\""]'::jsonb,
  3,
  'A D é a resposta do caso F: cada unidade tem o seu laudo, e só a documentação responde; a objeção vira pedido de documento. A A promete aprovação. A B desqualifica o cliente sem explicar. A C ignora que o laudo e o produto mudam a conta.',
  'M08-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q08', 8, 'situacional',
  'Cliente F3 com R$ 10 mil guardados e FGTS de 2 anos e 10 meses. Sem o FGTS, o esforço mensal dá 23% da renda; com o FGTS, 17%. Qual é o próximo passo certo?',
  '["Dizer que 2 anos e 10 meses já liberam o FGTS.","Descartar o cliente: sem entrada, não compra.","Marcar a visita agora e agendar a análise para a semana em que ele completa 3 anos de registro, mostrando a conta com e sem FGTS.","Esperar ele juntar mais dinheiro e ligar daqui a um ano."]'::jsonb,
  2,
  'A C transforma o marco dos 3 anos de FGTS em data e em próximo passo: é um marco comercial, agende. A A é falsa: o FGTS pede 3 anos de registro. A B desiste de um cliente que fecha em 2 meses. A D some com o cliente sem necessidade.',
  'M08-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q09', 9, 'aplicacao',
  'Unidade de R$ 250 mil. O laudo vem 10% abaixo do preço (R$ 225 mil). Qual é a entrada necessária?',
  '["R$ 50.000","R$ 62.500","R$ 45.000","R$ 70.000"]'::jsonb,
  3,
  'A Caixa financia 80% do menor valor: 80% de R$ 225 mil = R$ 180 mil; entrada = R$ 250 mil menos R$ 180 mil = R$ 70 mil (28%). R$ 50 mil é 20% do preço, ignorando o laudo. R$ 62.500 é 25% do preço, sem base na regra. R$ 45 mil é 20% do laudo, que confunde a entrada com o que falta do laudo.',
  'M08-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q10', 10, 'aplicacao',
  'Caso real de ago/2026: tabela de R$ 480 mil e laudo de cerca de R$ 350 mil. Qual foi a entrada exigida?',
  '["Cerca de R$ 200 mil (41,7% do preço)","R$ 96 mil (20% da tabela)","R$ 130 mil (a diferença entre tabela e laudo)","R$ 70 mil (20% do laudo)"]'::jsonb,
  0,
  '80% de R$ 350 mil = R$ 280 mil financiados; R$ 480 mil menos R$ 280 mil = R$ 200 mil, 41,7% do preço. R$ 96 mil ignora o laudo. R$ 130 mil esquece que, além da diferença, o cliente ainda paga 20% do laudo. R$ 70 mil conta só os 20% do laudo e esquece a diferença.',
  'M08-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q11', 11, 'aplicacao',
  'Entrada exigida de R$ 56 mil, R$ 20 mil guardados, 24 meses até a entrega e renda de R$ 7.500. Qual é o esforço mensal e a leitura?',
  '["R$ 2.333 por mês, 31% da renda: plano B","R$ 1.500 por mês, 20% da renda: apresentável","R$ 1.500 por mês, 20% da renda: não fecha","R$ 750 por mês, 10% da renda: apresentável"]'::jsonb,
  1,
  '(R$ 56 mil menos R$ 20 mil) ÷ 24 = R$ 1.500 por mês, 20% da renda: até cerca de 22% é apresentável. A primeira esquece de descontar o dinheiro guardado. A terceira faz a conta certa e lê errado. A quarta divide por 48 meses, que não é o prazo até a entrega.',
  'M08-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q12', 12, 'aplicacao',
  'O cliente mais velho do contrato tem 60 anos. Qual é o prazo máximo do financiamento pela regra de idade?',
  '["20 anos","35 anos","20 anos e 6 meses","25 anos e 6 meses"]'::jsonb,
  2,
  'Idade mais prazo até 80 anos e 6 meses: 80 anos e 6 meses menos 60 = 20 anos e 6 meses (246 meses). 20 anos usa a regra antiga de 80 anos, superada. 35 anos é o prazo máximo geral, que a idade limita. 25 anos e 6 meses é o prazo de quem tem 55 anos.',
  'M08-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q13', 13, 'aplicacao',
  'A renda bruta familiar é de R$ 6.000. Até quanto, mais ou menos, a parcela do financiamento pode ir, já com seguros e taxa?',
  '["Cerca de R$ 1.800","Cerca de R$ 2.400","Cerca de R$ 1.200","Cerca de R$ 3.000"]'::jsonb,
  0,
  'A parcela cabe em até cerca de 30% da renda bruta familiar, com seguros e taxa: 30% de R$ 6.000 = R$ 1.800. R$ 2.400 é 40%, acima do que a análise aceita. R$ 1.200 é 20%, que subestima a capacidade. R$ 3.000 é metade da renda.',
  'M08-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q14', 14, 'aplicacao',
  'O cliente tem R$ 50 mil para a entrada. Pelo atalho de triagem com laudo cheio, até que preço de unidade vale olhar?',
  '["Cerca de R$ 62.500","Cerca de R$ 200 mil","Cerca de R$ 300 mil","Cerca de R$ 250 mil"]'::jsonb,
  3,
  'Teto de compra com laudo cheio ≈ dinheiro disponível ÷ 0,20: R$ 50 mil ÷ 0,20 = R$ 250 mil. R$ 62.500 divide por 0,80. R$ 200 mil divide por 0,25. R$ 300 mil passa do que os 20% cobrem. E lembre: em F3 e F4, rode ainda o laudo abaixo.',
  'M08-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q15', 15, 'conceito',
  'Sobre qual valor a Caixa aplica os até 80% de financiamento?',
  '["Sobre o preço de tabela da construtora","Sobre o menor valor entre o preço de venda e a avaliação","Sobre o maior valor entre o preço de venda e a avaliação","Sobre a renda anual do cliente"]'::jsonb,
  1,
  'A Caixa financia até 80% do menor valor entre preço e laudo. Usar o preço de tabela é a armadilha nº 1. O maior valor inverte a regra. A renda define a parcela, não a base dos 80%.',
  'M08-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q16', 16, 'conceito',
  'No estudo interno de ago/2026, quem ganha R$ 11.000 na F4 financiava cerca de R$ 407 mil, e quem ganha R$ 9.600 no topo da F3, cerca de R$ 425,2 mil. Por quê?',
  '["Porque a F4 tem subsídio menor","Porque o prazo da F4 é mais curto","Porque os juros mais altos da F4 comem a capacidade de financiamento","Porque a F3 aceita parcela de 40% da renda"]'::jsonb,
  2,
  'Com a parcela limitada a cerca de 30% da renda, juros maiores reduzem o valor financiável: por isso a F4 financia menos que o topo da F3. A primeira está errada: F3 e F4 não têm subsídio. A segunda inventa prazo diferente (o estudo usou 420 meses nos dois). A quarta inventa um limite de 40%.',
  'M08-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q17', 17, 'conceito',
  'Qual sistema de amortização a SMQ usa nos exemplos de simulação?',
  '["SAC como padrão e PRICE como comparação","Tanto faz, o cliente escolhe depois","Nenhum: a casa usa só a tabela do estudo interno","PRICE como padrão, com parcela fixa; SAC só como comparação"]'::jsonb,
  3,
  'A casa simula em PRICE, validada contra o simulador da Caixa, e usa o SAC só para comparar. A primeira inverte a regra (SAC como padrão foi corrigido). A segunda deixa o cliente sem referência. A terceira usa a tabela de ordem de grandeza, que nunca vai para o cliente.',
  'M08-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q18', 18, 'conceito',
  'Como se lê o esforço mensal até as chaves em relação à renda?',
  '["Até cerca de 22% é apresentável; de 30% a 50% é plano B; acima disso não fecha","Até 50% é apresentável; acima disso é plano B","Qualquer valor fecha se o cliente quiser muito","Só a parcela do financiamento importa; o esforço até as chaves não entra na conta"]'::jsonb,
  0,
  'A régua da casa: até cerca de 22% é apresentável; de 30% a 50%, plano B; acima disso não fecha. A segunda aceita esforço que endivida o cliente. A terceira troca conta por emoção. A quarta ignora que a trava costuma ser a entrada, não a parcela.',
  'M08-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q19', 19, 'caca_ao_erro',
  'Mensagem de um corretor: "Boa notícia! Pelo simulador você está aprovado, parcela exata de R$ 1.460,67, e o laudo vem igual ao preço, fica tranquilo." Qual é o erro principal?',
  '["Faltou mandar o book junto","Trata estimativa como aprovação e promete parcela exata e laudo","O erro é só o valor ter centavos","Deveria ter usado SAC"]'::jsonb,
  1,
  'A B aponta as três promessas proibidas: aprovação, parcela exata e laudo. O certo é "a parcela estimada fica em torno de" e "isto é estimativa, a aprovação é da Caixa". Book no meio da simulação não é o problema. Os centavos são um sintoma, não o erro. SAC como padrão seria outro erro, não este.',
  'M08-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M08-Q20', 20, 'caca_ao_erro',
  'O material antigo do módulo dizia: "Renda de R$ 13.000 na F4 financia até R$ 560 mil." O que está errado?',
  '["Nada: é a tabela oficial da Caixa","O erro é só a faixa: R$ 13.000 é F3","A F4 não existe mais","O número contradiz o estudo da casa: na F4 os juros mais altos reduzem a capacidade (R$ 11.000 financiava cerca de R$ 407 mil em ago/2026); a conta se refaz no simulador com a taxa do dia"]'::jsonb,
  3,
  'A D corrige com o estudo interno de ago/2026 e manda refazer no simulador. A primeira confunde material antigo com tabela oficial. A segunda erra a faixa: R$ 13.000 está na F4 (de R$ 9.600,01 a R$ 13.000). A terceira é falsa: a F4 está vigente desde 22/04/2026.',
  'M08-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (14)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F01', 1, 'Os 80% da Caixa incidem sobre...', 'O menor valor entre o preço de venda e a avaliação (laudo).', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F02', 2, 'Entrada com laudo igual, 10% e 20% abaixo do preço', '20%, 28% e 36% do preço.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F03', 3, 'Caso do laudo de ago/2026', 'Tabela de R$ 480 mil, laudo de cerca de R$ 350 mil: entrada de R$ 200 mil, 41,7%. A parcela cabia; o caixa não.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F04', 4, 'Parcela cabe em até...', 'Cerca de 30% da renda bruta familiar, com seguros e taxa (renda de R$ 5.000, parcela de até R$ 1.500).', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F05', 5, 'Fórmula do esforço mensal', '(Entrada exigida menos o dinheiro disponível) ÷ meses até a entrega.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F06', 6, 'Leitura do esforço mensal', 'Até cerca de 22% da renda: apresentável. De 30% a 50%: plano B. Acima: não fecha.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F07', 7, 'Regra da idade', 'Idade mais prazo até 80 anos e 6 meses. 55 anos: 25 anos e 6 meses. 58 anos: 22 anos e 6 meses.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F08', 8, 'Teto de compra com laudo cheio', 'Dinheiro disponível para a entrada ÷ 0,20.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F09', 9, 'Sistema de amortização nos exemplos', 'PRICE (parcela fixa). SAC só como comparação.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F10', 10, 'Por que a F4 pode financiar menos que o topo da F3?', 'Juros mais altos comem a capacidade (estudo de ago/2026: R$ 11.000 na F4, cerca de R$ 407 mil; R$ 9.600 na F3, cerca de R$ 425,2 mil).', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F11', 11, 'Composição de renda na F4', 'Calcule a folga antes: 13.000 menos a renda atual. Passou, sai do MCMV e cai no SBPE.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F12', 12, 'O PDF do simulador é...', 'Capacidade estimada, não aprovação. Quem aprova é a Caixa, na análise.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F13', 13, 'Frase obrigatória da simulação', '"Isto é estimativa, a aprovação é da Caixa."', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M08-F14', 14, 'Produto que só passa com laudo cheio', 'Não é recomendação, é aposta.', true
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1, peça ao corretor que abra o Dossiê de um cliente agendado e refaça a simulação na sua frente, com os três cenários de laudo e o esforço mensal, em até 15 minutos. Na reunião de segunda, escolha um cliente do time que está em análise e faça a conta em voz alta com todos. Aplique o laboratório dos 3 perfis com o gabarito uma vez no mês do módulo.","sinais_de_dificuldade":["Clientes agendados ou em análise sem nenhuma anotação de simulação ou de cenário de laudo em Resumo / Observações.","Perdas por \"Achou caro / parcela não cabe\" ou por crédito descobertas só depois da visita ou na análise.","Desfecho \"Enviei simulação\" seguido de \"Cobrar retorno da simulação\" vencido, sem nova ligação."],"perguntas_de_coaching":["Com o laudo 20% abaixo, esse cliente ainda fecha? Qual é o plano?","Qual foi o esforço mensal até as chaves, e em que faixa ele caiu?","Que frase você usou para dizer que era estimativa, e qual foi o próximo passo que saiu da ligação?"],"ritual_de_celebracao":"All Hands quinzenal: destaque de quem salvou uma venda trocando o produto antes da análise (com a conta mostrada) e conquista \"Pasta completa\" para quem levou à análise um cliente com a simulação e os cenários registrados."},"pratica_gabarito":["Perfil 1, laudo igual ao preço: financia R$ 182.720 e a entrada é R$ 45.680 (20%); tirando R$ 18.000 (guardado + FGTS), o esforço é R$ 922,67 por mês, 20,5% da renda: apresentável. Parcela estimada (amortização e juros, 420 meses, 6,0% ao ano) de R$ 1.041,85, abaixo dos R$ 1.350 (30% da renda). Subsídio da F2, se vier, abate do preço e só sai na simulação oficial.","Perfil 1, laudo 10% abaixo: entrada de R$ 63.952 (28%), esforço de R$ 1.531,73 (34,0%): plano B. Laudo 20% abaixo: entrada de R$ 82.224 (36%), esforço de R$ 2.140,80 (47,6%): plano B no limite. Leitura: fecha com laudo cheio; mostrar os cenários e o subsídio como a variável que a análise confirma.","Perfil 2, sem FGTS: laudo igual, entrada de R$ 51.943,60 e esforço de R$ 1.747,65 (23,3%), acima do apresentável. Com os R$ 12.000 do FGTS no marco dos 3 anos: esforço de R$ 1.247,65 (16,6%): apresentável; laudo 10% abaixo, R$ 2.113,38 (28,2%). Parcela estimada de R$ 1.460,67 (7,9% ao ano, 420 meses), abaixo dos R$ 2.250. Caminho: visita agora e análise na semana do marco do FGTS.","Perfil 3: laudo igual, entrada de R$ 86.000 e esforço de R$ 3.800 por mês (31,7%): plano B; laudo 10% abaixo, R$ 5.520 (46,0%); laudo 20% abaixo, R$ 7.240 (60,3%): não fecha. Só passa com laudo cheio e ainda como plano B: não é recomendação.","Perfil 3, composição: a folga é R$ 13.000 menos R$ 12.000 = R$ 1.000; qualquer renda da mãe acima disso tira o casal do MCMV e leva ao SBPE, com juros de mercado. Caminho: dizer com verdade que este produto não fecha hoje e mostrar um produto de preço menor que feche nos cenários de laudo, ou levar o cenário SBPE ao correspondente."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M08' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
