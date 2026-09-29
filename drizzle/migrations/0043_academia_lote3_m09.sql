-- ===========================================================================
-- ACADEMIA SMQ · LOTE 3 (v1.0) · seed do módulo M09
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-3/academia-smq-lote-3.json.
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
  ('M09', 9, 2, 'FGTS, subsídio, entrada e fluxo de pagamento', 'Ao final, você monta com o cliente a conta completa da entrada (caixa, FGTS, subsídio quando existe, cenário de laudo, esforço mensal, ITBI e cartório, obra separada do financiamento) antes de recomendar um produto, e isso aparece no CRM como Entrada disponível e Usa FGTS preenchidos, conta registrada nas Observações e menos perdas por "Achou caro / parcela não cabe" descobertas depois da visita.',
   '["Eu sou capaz de calcular a entrada com 80% sobre o menor valor entre preço e laudo, com os cenários de laudo 10% e 20% abaixo em F3 e F4.","Eu sou capaz de dizer se o cliente pode usar o FGTS na compra e de transformar o marco dos 3 anos em data na agenda.","Eu sou capaz de explicar o subsídio de F1 e F2 sem prometer valor e de dizer com verdade que F3 e F4 não têm.","Eu sou capaz de montar o fluxo de pagamento separando obra e financiamento, com ITBI, cartório e só a condição da campanha.","Eu sou capaz de calcular o esforço mensal até as chaves, ler o resultado pela régua da casa e fechar com um dos 2 caminhos."]'::jsonb, 0.9, '56 min', true,
   '**Laboratório de fluxo de pagamento (individual, com gabarito)** · 40 min

**Papéis:** O corretor monta sozinho, em até 40 minutos, a conta completa dos três perfis e a mensagem de apresentação de um deles; o gerente corrige com o gabarito e a rubrica.

**Persona:** Três perfis de treino montados a partir das personas P1 (casal que cansou do aluguel, F2), P3 (solteira sem entrada, F3) e P4 (casal na beira do teto, F4)

**Roteiro:** Para cada perfil, o corretor calcula a entrada com laudo cheio e com laudo 10% e 20% abaixo (obrigatório em F3 e F4), abate o caixa disponível, calcula o esforço mensal até a entrega, estima o ITBI quando pedido, lê o resultado (apresentável, plano B ou não fecha) e escreve o próximo passo. Todos os valores são de treino e não são preço real de unidade; a taxa e a parcela do banco se confirmam no simulador oficial (M08).

**Roteiro do cliente:**

- Perfil A, F2 com FGTS (P1): casal, renda somada de R$ 4.500, aluguel de R$ 1.200, um deles com FGTS de 4 anos e saldo de R$ 15.000 (valor de treino), R$ 5.000 guardados. Unidade de treino de R$ 260.000, laudo igual ao preço, 36 meses até a entrega. Pergunta: "A parcela vai ser maior que o meu aluguel?"
- Perfil B, F3 sem caixa (P3): solteira CLT, renda de R$ 7.500, R$ 3.000 guardados, FGTS de 2 anos e 10 meses com saldo de R$ 12.000 (valor de treino). Unidade de treino de R$ 300.000, 30 meses até a entrega. Diz: "Não tenho entrada, vou pensar."
- Perfil C, F4 com laudo baixo (P4): casal, renda de R$ 12.000, R$ 60.000 guardados, quer somar a renda da mãe. Unidade de treino de R$ 480.000, 30 meses até a entrega. Diz: "A gente quer usar a renda da minha mãe pra subir o valor."

**O que o observador procura:**

- Os 80% calculados sobre o menor valor entre preço e laudo, em todos os perfis.
- Cenários de laudo 10% e 20% abaixo nos perfis de F3 e F4.
- FGTS só contado quando pode ser usado, com o marco dos 3 anos virando data.
- Nenhuma promessa de subsídio, aprovação, valorização ou valor exato de parcela.
- Fluxo de obra separado da parcela do financiamento.
- Leitura do esforço mensal pela régua da casa e um próximo passo concreto para cada perfil.
- Conta e próximo passo registrados no Dossiê (Entrada disponível, Usa FGTS, Observações).

**Rubrica:** Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 3 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Modelo de financiamento de cada empreendimento (na planta ou na entrega) e em que momento o FGTS abate a entrada, com o correspondente. | [CONFIRMAR] Alcance exato das condições do FGTS (imóvel em outra cidade, financiamento ativo) e o valor livre de quem fez antecipação do saque-aniversário, com o correspondente. | [CONFIRMAR] Regras do FGTS futuro antes de qualquer aula ou script sobre ele. | [CONFIRMAR] Valores de registro e taxas de cartório na capital para completar o custo total. | [CONFIRMAR na publicação] Reconferir faixas, subsídio e valores de ITBI de 2026 (Portaria MCID nº 333/2026 e páginas da Prefeitura, conferidas em 29/09/2026) antes de liberar as questões M09-Q04, M09-Q05, M09-Q12 e M09-Q17. | [DADO A MEDIR NO CRM] Perdas por "Achou caro / parcela não cabe" e por crédito por corretor, e percentual de clientes avançados com Entrada disponível preenchida. | [CALIBRAR] Meta de queda das perdas por "Achou caro / parcela não cabe" depois da visita, com o Meu Raio-X.', '{"formato":"canonico-8.2","lote":3,"versao_conteudo":"1.0","trilha":"T2","ordem":5,"nivel_alvo":"Intermediário","nivel_alvo_sistema":"intermediario","subtitulo":"A venda do MCMV quase nunca trava na parcela. Trava no caixa. Aqui você aprende a fazer a conta que destrava.","duracao_min":56,"por_que_vale_dinheiro":{"texto":"A entrada é a trava que mais mata venda no MCMV, e quase nunca chega no dossiê: faltava em 85,1% das notas de qualificação de jul a set/2026 e em 97% dos handoffs de set/2026. Nos casos estudados em ago/2026, a parcela ficava entre 15% e 21% da renda; foi o laudo abaixo do preço que levou uma entrada a 41,7%. Quem faz a conta na primeira conversa não perde o mês numa pasta que vai travar no fim.","numero":"Entrada ausente em 85,1% das notas de qualificação (jul a set/2026) e em 97% dos handoffs (set/2026); entrada de 41,7% no caso do laudo (ago/2026)","fonte":"Notas de qualificação e aprendizados do robô (seção 9.1); armadilha do laudo (seção 9.9)","periodo":"jul a set/2026"},"pre_requisitos":["M04","M05","M08"],"indicador_crm":{"nome":"Perdas por \"Achou caro / parcela não cabe\" e por crédito (\"Crédito: renda (insuficiente/informal)\" e \"Crédito: score/negativado\"), e clientes avançados com Entrada disponível preenchida","onde_ler":"Meu Raio-X, bloco de perdas por motivo; para o gerente, Operação › Funil › Motivos de perda; campos Entrada disponível e Usa FGTS na aba Dados do Dossiê","linha_de_base":"[DADO A MEDIR NO CRM] Perdas por esses motivos por corretor e percentual de clientes em Agendado ou Análise de crédito com Entrada disponível preenchida","meta_sugerida":"100% dos clientes em Agendado e Análise de crédito com Entrada disponível e Usa FGTS preenchidos; queda das perdas por \"Achou caro / parcela não cabe\" depois da visita [CALIBRAR com o Meu Raio-X]","fonte":"CRM SMQ, motivos de perda oficiais (set/2026)","gap_de_crm":false},"pratica":{"tipo":"Laboratório de fluxo de pagamento (individual, com gabarito)","duracao_min":40,"persona":"Três perfis de treino montados a partir das personas P1 (casal que cansou do aluguel, F2), P3 (solteira sem entrada, F3) e P4 (casal na beira do teto, F4)","rubrica":"Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"O corretor monta sozinho, em até 40 minutos, a conta completa dos três perfis e a mensagem de apresentação de um deles; o gerente corrige com o gabarito e a rubrica.","roteiro":"Para cada perfil, o corretor calcula a entrada com laudo cheio e com laudo 10% e 20% abaixo (obrigatório em F3 e F4), abate o caixa disponível, calcula o esforço mensal até a entrega, estima o ITBI quando pedido, lê o resultado (apresentável, plano B ou não fecha) e escreve o próximo passo. Todos os valores são de treino e não são preço real de unidade; a taxa e a parcela do banco se confirmam no simulador oficial (M08).","roteiro_cliente":["Perfil A, F2 com FGTS (P1): casal, renda somada de R$ 4.500, aluguel de R$ 1.200, um deles com FGTS de 4 anos e saldo de R$ 15.000 (valor de treino), R$ 5.000 guardados. Unidade de treino de R$ 260.000, laudo igual ao preço, 36 meses até a entrega. Pergunta: \"A parcela vai ser maior que o meu aluguel?\"","Perfil B, F3 sem caixa (P3): solteira CLT, renda de R$ 7.500, R$ 3.000 guardados, FGTS de 2 anos e 10 meses com saldo de R$ 12.000 (valor de treino). Unidade de treino de R$ 300.000, 30 meses até a entrega. Diz: \"Não tenho entrada, vou pensar.\"","Perfil C, F4 com laudo baixo (P4): casal, renda de R$ 12.000, R$ 60.000 guardados, quer somar a renda da mãe. Unidade de treino de R$ 480.000, 30 meses até a entrega. Diz: \"A gente quer usar a renda da minha mãe pra subir o valor.\""],"observador_procura":["Os 80% calculados sobre o menor valor entre preço e laudo, em todos os perfis.","Cenários de laudo 10% e 20% abaixo nos perfis de F3 e F4.","FGTS só contado quando pode ser usado, com o marco dos 3 anos virando data.","Nenhuma promessa de subsídio, aprovação, valorização ou valor exato de parcela.","Fluxo de obra separado da parcela do financiamento.","Leitura do esforço mensal pela régua da casa e um próximo passo concreto para cada perfil.","Conta e próximo passo registrados no Dossiê (Entrada disponível, Usa FGTS, Observações)."]},"desafio_campo":{"tarefa":"Em 72 horas, apresentar a um cliente real da sua carteira a conta completa da entrada: caixa (dinheiro guardado e FGTS, se pode usar), entrada com o cenário de laudo quando for F3 ou F4, esforço mensal até as chaves, ITBI e cartório e a condição da campanha, com fluxo de obra e financiamento separados. Terminar com um dos 2 caminhos e registrar o desfecho.","prazo_horas":72,"evidencia_no_crm":"No Dossiê do cliente: Entrada disponível e Usa FGTS preenchidos, a conta resumida nas Observações e o fluxo enviado anexado; na Fila Única, desfecho registrado com próximo passo e data (agendamento criado ou análise com documento).","como_o_gestor_confere":"Abre o Dossiê do cliente indicado pelo corretor, confere os campos da aba Dados, as Observações com os cenários de laudo quando couber e a separação entre obra e financiamento no fluxo enviado, e confere na linha do tempo o desfecho com próximo passo e data dentro das 72 horas."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do simulador e uma planilha da conta da entrada","cenario":"Escritório da SMQ, tela do CRM e do simulador abertas","blocos":[{"tempo":"0:00","fala":"A parcela cabia. O caixa não. Uma venda de R$ 480 mil morreu porque ninguém fez a conta do laudo.","na_tela":"Tabela de R$ 480 mil, laudo de cerca de R$ 350 mil, entrada de 41,7%"},{"tempo":"0:20","fala":"No MCMV a trava quase nunca é a parcela. É a entrada. E ela falta em quase todo dossiê que chega pra você.","na_tela":"Entrada ausente em 85,1% das notas de qualificação, jul a set/2026"},{"tempo":"0:50","fala":"A regra é uma só: a Caixa financia até 80% do menor valor entre o preço e o laudo. O resto é entrada.","na_tela":"Fórmula da entrada e a tabela de laudo: 20%, 28%, 36%"},{"tempo":"1:40","fala":"Agora o caixa: dinheiro guardado, FGTS se ele já pode usar, e subsídio só em F1 e F2, pelo simulador. Faltou dinheiro? A campanha parcela até as chaves, e aí entra o esforço mensal.","na_tela":"Conta do perfil de treino A: R$ 52 mil de entrada, R$ 888,89 por mês"},{"tempo":"3:00","fala":"O erro que mais dói: vender a parcela de obra como a parcela do apê. Mostre as duas contas separadas, por escrito, com ITBI e cartório.","na_tela":"Fluxo com obra em cima e financiamento embaixo"},{"tempo":"3:50","fala":"Seu desafio: em 72 horas, apresente a conta completa a um cliente real e registre o desfecho com próximo passo.","na_tela":"Dossiê, aba Dados: Entrada disponível e Usa FGTS"},{"tempo":"4:30","fala":"A parcela cabe no mês. A entrada cabe no caixa. Faça as duas contas.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 4, 9.1, 9.9, 9.12 (casos C, J, N e o laudo de ago/2026), 9.13 (P1, P3, P4), 9.14 e 9.16 do super prompt","Estudo da Academia v2.1, seções 2, 3.3, 3.4, 3.6, 3.7, 5.8 e situações das Fases D e F","Motivos de perda oficiais do CRM (src/lib/leads.ts) e campos do Dossiê, aba Dados","Conteúdo anterior do M09 (Notion, abr/2026): mantido o foco em FGTS, subsídio e custo do aluguel, corrigidos o saque-aniversário, o FGTS futuro e o argumento do aluguel"],"origem":"SMQ","pendencias":["[CONFIRMAR] Modelo de financiamento de cada empreendimento (na planta ou na entrega) e em que momento o FGTS abate a entrada, com o correspondente.","[CONFIRMAR] Alcance exato das condições do FGTS (imóvel em outra cidade, financiamento ativo) e o valor livre de quem fez antecipação do saque-aniversário, com o correspondente.","[CONFIRMAR] Regras do FGTS futuro antes de qualquer aula ou script sobre ele.","[CONFIRMAR] Valores de registro e taxas de cartório na capital para completar o custo total.","[CONFIRMAR na publicação] Reconferir faixas, subsídio e valores de ITBI de 2026 (Portaria MCID nº 333/2026 e páginas da Prefeitura, conferidas em 29/09/2026) antes de liberar as questões M09-Q04, M09-Q05, M09-Q12 e M09-Q17.","[DADO A MEDIR NO CRM] Perdas por \"Achou caro / parcela não cabe\" e por crédito por corretor, e percentual de clientes avançados com Entrada disponível preenchida.","[CALIBRAR] Meta de queda das perdas por \"Achou caro / parcela não cabe\" depois da visita, com o Meu Raio-X."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M09-A1', 'M09-A2', 'M09-A3', 'M09-A4', 'M09-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M09-Q01', 'M09-Q02', 'M09-Q03', 'M09-Q04', 'M09-Q05', 'M09-Q06', 'M09-Q07', 'M09-Q08', 'M09-Q09', 'M09-Q10', 'M09-Q11', 'M09-Q12', 'M09-Q13', 'M09-Q14', 'M09-Q15', 'M09-Q16', 'M09-Q17', 'M09-Q18', 'M09-Q19', 'M09-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M09-F01', 'M09-F02', 'M09-F03', 'M09-F04', 'M09-F05', 'M09-F06', 'M09-F07', 'M09-F08', 'M09-F09', 'M09-F10', 'M09-F11', 'M09-F12', 'M09-F13');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 13;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M09-A1', 1, 'A trava é o caixa, não a parcela: a conta real da entrada', 'texto',
  'Tabela de R$ 480 mil. A parcela cabia na renda. O laudo veio em cerca de R$ 350 mil e a entrada pulou para R$ 200 mil, 41,7% do preço. A venda não morreu na parcela. Morreu no caixa (caso real, ago/2026).

### Por que importa

No MCMV quase ninguém trava na parcela: nos produtos de R$ 270 mil a R$ 360 mil estudados em ago/2026, ela ficava entre 15% e 21% da renda. O que trava é o dinheiro da entrada, e ele quase nunca chega no dossiê: faltava em 85,1% das notas de qualificação de jul a set/2026 e em 97% dos handoffs de set/2026. Quem monta a conta da entrada na primeira conversa separa quem compra hoje de quem precisa de outro produto, e não perde o mês numa pasta que vai travar no fim.

### O conceito

Pense numa mudança de casa: o aluguel novo cabe no salário, mas o que decide se você muda é o caução, o frete e a primeira conta. A entrada é o caução do apartamento. A Caixa financia até 80% do MENOR valor entre o preço e o laudo; o resto é entrada, e ela se paga com dinheiro guardado, FGTS, subsídio quando existe e o parcelamento da campanha até as chaves.

### O método SMQ, passo a passo

1. Regra de ouro: entrada = preço menos 80% do menor valor entre preço e laudo (vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente).
2. Tabela do laudo: laudo igual ao preço pede 20% de entrada; 10% abaixo pede 28%; 20% abaixo pede 36%. Trate 20% como piso.
3. Em F3 e F4, rode sempre os cenários de laudo 10% e 20% abaixo antes de recomendar o produto. Produto que só passa com laudo cheio não é recomendação, é aposta.
4. Levante as fontes do caixa, uma pergunta por vez: dinheiro guardado, saldo e tempo de FGTS (aula M09-A2), subsídio só em F1 e F2 e só depois da simulação (aula M09-A3).
5. Some os custos que o cliente esquece: ITBI e registro no cartório (aula M09-A4). Só diga que a campanha cobre quando ela cobre, por escrito.
6. Teto de compra pelo caixa, com laudo cheio: dinheiro disponível para entrada dividido por 0,20. Sem o parcelamento da obra, R$ 20 mil de caixa compram no máximo um imóvel de R$ 100 mil. É o parcelamento que abre o jogo.
7. Esforço mensal = (entrada exigida menos o dinheiro disponível) dividido pelos meses até a entrega. Até cerca de 22% da renda é apresentável; de 30% a 50% é plano B; acima disso não fecha.
8. Registre a conta no Dossiê (aba Dados: Entrada disponível e Usa FGTS) e a leitura dos cenários nas Observações, antes de oferecer visita ou pedir documento.

### Na vida real

**O caso:** O laudo que matou a entrada (ago/2026): produto de tabela de R$ 480 mil, laudo de cerca de R$ 350 mil.

**O que foi dito:** A conversa girou em torno da parcela, que cabia. Ninguém rodou antes o cenário de laudo abaixo do preço.

**O que aconteceu:** Com 80% sobre o laudo, a entrada foi a R$ 200 mil (41,7% do preço). A parcela cabia; o caixa não. É por isso que em F3 e F4 o cenário de laudo 10% e 20% abaixo vem antes da recomendação.

### Scripts prontos

#### Ligação · Cliente pergunta "quanto fica a entrada?" logo depois de saber a faixa

> Boa pergunta, e é a que mais importa. A entrada depende de três coisas: quanto você tem guardado, se tem FGTS e quanto a Caixa avalia o apartamento. Me conta: hoje você tem algum valor guardado pra essa compra?

**Por que funciona:** Troca o número solto por um mecanismo que o cliente entende e já puxa a primeira fonte do caixa, com uma pergunta só.

#### WhatsApp · Explicar o laudo sem assustar, depois da qualificação

> Uma coisa que quase ninguém conta: a Caixa financia até 80% do menor valor entre o preço e a avaliação dela. Por isso eu já faço a sua conta com folga, pra não ter surpresa no fim. Posso te ligar 5 minutinhos pra te mostrar?

**Por que funciona:** Antecipa a trava que mais derruba venda e transforma em cuidado com o cliente; termina em uma pergunta com próximo passo.

#### Ligação · O produto só fecha com laudo cheio

> Vou ser transparente: esse apartamento só cabe se a avaliação vier igual ao preço, e isso ninguém garante. Separei duas opções que fecham mesmo com a avaliação um pouco abaixo. Quer que eu te mostre as duas agora ou prefere ver no sábado de manhã?

**Por que funciona:** Verdade antes da frustração, com alternativa concreta e duas opções de próximo passo.

### Erros que matam a venda

- **Falar só de parcela e deixar a entrada para depois da visita**  
  Quanto custa: O cliente se apaixona pelo produto e descobre na análise que o caixa não fecha; a venda morre no ponto mais caro do funil  
  Correção: Montar a conta da entrada na primeira ligação, com os cenários de laudo em F3 e F4
- **Calcular os 80% sobre o preço de tabela**  
  Quanto custa: Com laudo 20% abaixo, a entrada de 20% vira 36%; no caso de ago/2026, 41,7%  
  Correção: 80% sobre o menor valor entre preço e laudo, sempre
- **Dizer "entrada zero" ou "dá pra financiar 100%"**  
  Quanto custa: Promessa proibida que destrói a confiança quando a conta real aparece  
  Correção: Mostrar o mecanismo: dinheiro guardado, FGTS, subsídio quando houver e parcelamento da campanha

### No CRM

- **Tela:** Dossiê do cliente, aba Dados
- **Ação:** Preencher Entrada disponível e Usa FGTS e anotar nas Observações os cenários de laudo calculados
- **Campo:** Entrada disponível, Usa FGTS, Observações
- **Regra:** Nenhuma recomendação de produto em F3 ou F4 sem o cenário de laudo 10% e 20% abaixo registrado

### Frase-âncora

> **A parcela cabe no mês. A entrada cabe no caixa. Faça as duas contas.**

### Checagem rápida

1. Sobre qual valor a Caixa aplica os 80%?  
   Resposta: Sobre o menor valor entre o preço de venda e o laudo.
2. Laudo 10% abaixo do preço pede quanto de entrada?  
   Resposta: 28% do preço.
3. Qual faixa de esforço mensal é apresentável?  
   Resposta: Até cerca de 22% da renda; de 30% a 50% é plano B.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Tabela de R$ 480 mil. A parcela cabia na renda. O laudo veio em cerca de R$ 350 mil e a entrada pulou para R$ 200 mil, 41,7% do preço. A venda não morreu na parcela. Morreu no caixa (caso real, ago/2026).","por_que_importa":"No MCMV quase ninguém trava na parcela: nos produtos de R$ 270 mil a R$ 360 mil estudados em ago/2026, ela ficava entre 15% e 21% da renda. O que trava é o dinheiro da entrada, e ele quase nunca chega no dossiê: faltava em 85,1% das notas de qualificação de jul a set/2026 e em 97% dos handoffs de set/2026. Quem monta a conta da entrada na primeira conversa separa quem compra hoje de quem precisa de outro produto, e não perde o mês numa pasta que vai travar no fim.","conceito":"Pense numa mudança de casa: o aluguel novo cabe no salário, mas o que decide se você muda é o caução, o frete e a primeira conta. A entrada é o caução do apartamento. A Caixa financia até 80% do MENOR valor entre o preço e o laudo; o resto é entrada, e ela se paga com dinheiro guardado, FGTS, subsídio quando existe e o parcelamento da campanha até as chaves.","metodo":["Regra de ouro: entrada = preço menos 80% do menor valor entre preço e laudo (vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente).","Tabela do laudo: laudo igual ao preço pede 20% de entrada; 10% abaixo pede 28%; 20% abaixo pede 36%. Trate 20% como piso.","Em F3 e F4, rode sempre os cenários de laudo 10% e 20% abaixo antes de recomendar o produto. Produto que só passa com laudo cheio não é recomendação, é aposta.","Levante as fontes do caixa, uma pergunta por vez: dinheiro guardado, saldo e tempo de FGTS (aula M09-A2), subsídio só em F1 e F2 e só depois da simulação (aula M09-A3).","Some os custos que o cliente esquece: ITBI e registro no cartório (aula M09-A4). Só diga que a campanha cobre quando ela cobre, por escrito.","Teto de compra pelo caixa, com laudo cheio: dinheiro disponível para entrada dividido por 0,20. Sem o parcelamento da obra, R$ 20 mil de caixa compram no máximo um imóvel de R$ 100 mil. É o parcelamento que abre o jogo.","Esforço mensal = (entrada exigida menos o dinheiro disponível) dividido pelos meses até a entrega. Até cerca de 22% da renda é apresentável; de 30% a 50% é plano B; acima disso não fecha.","Registre a conta no Dossiê (aba Dados: Entrada disponível e Usa FGTS) e a leitura dos cenários nas Observações, antes de oferecer visita ou pedir documento."],"na_vida_real":{"caso":"O laudo que matou a entrada (ago/2026): produto de tabela de R$ 480 mil, laudo de cerca de R$ 350 mil.","o_que_foi_dito":"A conversa girou em torno da parcela, que cabia. Ninguém rodou antes o cenário de laudo abaixo do preço.","resultado":"Com 80% sobre o laudo, a entrada foi a R$ 200 mil (41,7% do preço). A parcela cabia; o caixa não. É por isso que em F3 e F4 o cenário de laudo 10% e 20% abaixo vem antes da recomendação.","fonte":"Casoteca SMQ, casos da era do CRM (seção 9.12) e a armadilha do laudo (seção 9.9)"},"scripts":[{"canal":"Ligação","situacao":"Cliente pergunta \"quanto fica a entrada?\" logo depois de saber a faixa","texto":"Boa pergunta, e é a que mais importa. A entrada depende de três coisas: quanto você tem guardado, se tem FGTS e quanto a Caixa avalia o apartamento. Me conta: hoje você tem algum valor guardado pra essa compra?","por_que_funciona":"Troca o número solto por um mecanismo que o cliente entende e já puxa a primeira fonte do caixa, com uma pergunta só."},{"canal":"WhatsApp","situacao":"Explicar o laudo sem assustar, depois da qualificação","texto":"Uma coisa que quase ninguém conta: a Caixa financia até 80% do menor valor entre o preço e a avaliação dela. Por isso eu já faço a sua conta com folga, pra não ter surpresa no fim. Posso te ligar 5 minutinhos pra te mostrar?","por_que_funciona":"Antecipa a trava que mais derruba venda e transforma em cuidado com o cliente; termina em uma pergunta com próximo passo."},{"canal":"Ligação","situacao":"O produto só fecha com laudo cheio","texto":"Vou ser transparente: esse apartamento só cabe se a avaliação vier igual ao preço, e isso ninguém garante. Separei duas opções que fecham mesmo com a avaliação um pouco abaixo. Quer que eu te mostre as duas agora ou prefere ver no sábado de manhã?","por_que_funciona":"Verdade antes da frustração, com alternativa concreta e duas opções de próximo passo."}],"erros_que_matam":[{"erro":"Falar só de parcela e deixar a entrada para depois da visita","custo":"O cliente se apaixona pelo produto e descobre na análise que o caixa não fecha; a venda morre no ponto mais caro do funil","correcao":"Montar a conta da entrada na primeira ligação, com os cenários de laudo em F3 e F4"},{"erro":"Calcular os 80% sobre o preço de tabela","custo":"Com laudo 20% abaixo, a entrada de 20% vira 36%; no caso de ago/2026, 41,7%","correcao":"80% sobre o menor valor entre preço e laudo, sempre"},{"erro":"Dizer \"entrada zero\" ou \"dá pra financiar 100%\"","custo":"Promessa proibida que destrói a confiança quando a conta real aparece","correcao":"Mostrar o mecanismo: dinheiro guardado, FGTS, subsídio quando houver e parcelamento da campanha"}],"no_crm":{"tela":"Dossiê do cliente, aba Dados","acao":"Preencher Entrada disponível e Usa FGTS e anotar nas Observações os cenários de laudo calculados","campo":"Entrada disponível, Usa FGTS, Observações","regra":"Nenhuma recomendação de produto em F3 ou F4 sem o cenário de laudo 10% e 20% abaixo registrado"},"frase_ancora":"A parcela cabe no mês. A entrada cabe no caixa. Faça as duas contas.","checagem_rapida":[{"pergunta":"Sobre qual valor a Caixa aplica os 80%?","resposta":"Sobre o menor valor entre o preço de venda e o laudo."},{"pergunta":"Laudo 10% abaixo do preço pede quanto de entrada?","resposta":"28% do preço."},{"pergunta":"Qual faixa de esforço mensal é apresentável?","resposta":"Até cerca de 22% da renda; de 30% a 50% é plano B."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M09-A2', 2, 'FGTS na compra: quem pode, o saque-aniversário e o marco dos 3 anos', 'texto',
  '"Tenho 2 anos e 8 meses de FGTS, dá pra usar?" Quem responde "dá sim" perde a venda na análise. Quem responde "ainda não, e em 4 meses dá" ganha uma data na agenda.

### Por que importa

O FGTS é a maior fonte de entrada do comprador MCMV que não tem dinheiro guardado, e mesmo assim falta em 73,1% das notas de qualificação (jul a set/2026). Errar a regra dos 3 anos, confundir saque-aniversário com antecipação ou ignorar imóvel na região faz a conta da entrada desabar na análise, com o cliente já decidido.

### O conceito

O FGTS funciona como uma poupança com regras de saque. Para usar na compra da casa própria, o cliente precisa cumprir as condições da Caixa ao mesmo tempo, como uma porta com várias fechaduras: tempo de trabalho, nenhum financiamento ativo no SFH e nenhum imóvel residencial onde mora ou trabalha.

### O método SMQ, passo a passo

1. Tempo: 3 anos de trabalho sob o regime do FGTS, somando todos os vínculos, que não precisam ser seguidos (vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente).
2. Financiamento: não ter financiamento ativo no Sistema Financeiro de Habitação em nenhum lugar do país.
3. Imóvel: não ter imóvel residencial no município onde mora ou trabalha, nos municípios vizinhos ou na mesma região metropolitana. Imóvel em outra cidade, fora disso, não trava por esta regra; o correspondente confirma o alcance [CONFIRMAR].
4. Uso: imóvel residencial urbano para moradia própria, dentro do teto do SFH (R$ 2,25 milhões). O alcance exato de cada condição se confirma com o correspondente.
5. Saque-aniversário: aderir NÃO impede usar o FGTS na compra. O que trava é o saldo dado em garantia numa antecipação feita em banco, bloqueado até a quitação. Pergunte: "Você fez antecipação do saque-aniversário em algum banco?" e confira o saldo livre no extrato do FGTS.
6. Marco comercial: se faltam meses para os 3 anos, calcule a data, registre como próximo passo e agende. Até lá, monte a conta sem o FGTS e mostre o que muda quando ele entrar.
7. Quando o FGTS entra no fluxo depende do modelo do empreendimento (financiamento na planta ou na entrega): pergunte ao correspondente antes de prometer o mês [CONFIRMAR].
8. FGTS futuro e outros usos só depois de validados com o correspondente [CONFIRMAR]: não ensine como regra.

### Na vida real

**O caso:** Caso J, o dossiê raso no pico de campanha (set/2026): com o volume de leads subindo, os dossiês chegaram ao corretor sem a conta completa.

**O que foi dito:** A entrada passou a faltar em 97% dos handoffs e a restrição no nome em 81%. O robô já sabia faixa e interesse; o corretor precisava completar entrada, FGTS, restrição e momento de compra.

**O que aconteceu:** A lição virou regra da casa: o corretor completa a conta na primeira ligação, sem repetir o que o robô já perguntou. Tempo de FGTS e antecipação do saque-aniversário entram nessa ligação.

### Scripts prontos

#### Ligação · Levantar o FGTS sem jargão

> Pra eu fazer a conta da entrada certinha: somando todos os empregos com carteira assinada, você já passou de 3 anos?

**Por que funciona:** Traduz a regra para a vida do cliente, explica o porquê e faz uma pergunta só.

#### Ligação · Cliente tem 2 anos e 8 meses de FGTS

> Então você está a 4 meses de poder usar o FGTS na compra. Vou deixar essa data marcada comigo. Enquanto isso, te mostro a conta sem o FGTS e o que melhora quando ele entrar. Posso te mandar agora?

**Por que funciona:** Transforma um "não" em uma data, mantém o cliente no funil e já oferece o próximo passo.

#### WhatsApp · Cliente diz que tem saque-aniversário e acha que perdeu o FGTS

> Boa notícia: ter o saque-aniversário não impede usar o FGTS na compra. O que pode travar é se você pegou uma antecipação dele em algum banco. Você fez essa antecipação?

**Por que funciona:** Corrige o mito com a regra conferida e vai direto à pergunta que decide, uma só.

### Erros que matam a venda

- **Dizer que saque-aniversário impede o uso do FGTS**  
  Quanto custa: O cliente desiste de uma entrada que ele tinha  
  Correção: Aderir não impede; só o valor dado em garantia numa antecipação fica bloqueado
- **Contar com o FGTS de quem ainda não tem 3 anos**  
  Quanto custa: A conta desaba na análise e o cliente se sente enganado  
  Correção: Montar a conta sem o FGTS e agendar a data dos 3 anos
- **Não perguntar se o cliente tem imóvel ou financiamento ativo**  
  Quanto custa: O FGTS é negado depois da pasta montada  
  Correção: Fazer as três perguntas da porta: tempo, financiamento ativo e imóvel na região

### No CRM

- **Tela:** Dossiê do cliente, aba Dados, e Agenda e Tarefas
- **Ação:** Marcar Usa FGTS, anotar tempo e saldo nas Observações e criar o próximo passo na data em que o cliente completa 3 anos
- **Campo:** Usa FGTS, Observações, próximo passo com data
- **Regra:** Marco dos 3 anos sempre vira próximo passo com data, nunca "depois eu vejo"

### Frase-âncora

> **FGTS que ainda não pode é data na agenda, não "não".**

### Checagem rápida

1. Quantos anos de FGTS o cliente precisa para usar na compra, e os vínculos precisam ser seguidos?  
   Resposta: 3 anos, somando todos os vínculos; não precisam ser seguidos.
2. Aderir ao saque-aniversário impede usar o FGTS?  
   Resposta: Não. O que bloqueia é o valor dado em garantia numa antecipação feita em banco.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Tenho 2 anos e 8 meses de FGTS, dá pra usar?\" Quem responde \"dá sim\" perde a venda na análise. Quem responde \"ainda não, e em 4 meses dá\" ganha uma data na agenda.","por_que_importa":"O FGTS é a maior fonte de entrada do comprador MCMV que não tem dinheiro guardado, e mesmo assim falta em 73,1% das notas de qualificação (jul a set/2026). Errar a regra dos 3 anos, confundir saque-aniversário com antecipação ou ignorar imóvel na região faz a conta da entrada desabar na análise, com o cliente já decidido.","conceito":"O FGTS funciona como uma poupança com regras de saque. Para usar na compra da casa própria, o cliente precisa cumprir as condições da Caixa ao mesmo tempo, como uma porta com várias fechaduras: tempo de trabalho, nenhum financiamento ativo no SFH e nenhum imóvel residencial onde mora ou trabalha.","metodo":["Tempo: 3 anos de trabalho sob o regime do FGTS, somando todos os vínculos, que não precisam ser seguidos (vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente).","Financiamento: não ter financiamento ativo no Sistema Financeiro de Habitação em nenhum lugar do país.","Imóvel: não ter imóvel residencial no município onde mora ou trabalha, nos municípios vizinhos ou na mesma região metropolitana. Imóvel em outra cidade, fora disso, não trava por esta regra; o correspondente confirma o alcance [CONFIRMAR].","Uso: imóvel residencial urbano para moradia própria, dentro do teto do SFH (R$ 2,25 milhões). O alcance exato de cada condição se confirma com o correspondente.","Saque-aniversário: aderir NÃO impede usar o FGTS na compra. O que trava é o saldo dado em garantia numa antecipação feita em banco, bloqueado até a quitação. Pergunte: \"Você fez antecipação do saque-aniversário em algum banco?\" e confira o saldo livre no extrato do FGTS.","Marco comercial: se faltam meses para os 3 anos, calcule a data, registre como próximo passo e agende. Até lá, monte a conta sem o FGTS e mostre o que muda quando ele entrar.","Quando o FGTS entra no fluxo depende do modelo do empreendimento (financiamento na planta ou na entrega): pergunte ao correspondente antes de prometer o mês [CONFIRMAR].","FGTS futuro e outros usos só depois de validados com o correspondente [CONFIRMAR]: não ensine como regra."],"na_vida_real":{"caso":"Caso J, o dossiê raso no pico de campanha (set/2026): com o volume de leads subindo, os dossiês chegaram ao corretor sem a conta completa.","o_que_foi_dito":"A entrada passou a faltar em 97% dos handoffs e a restrição no nome em 81%. O robô já sabia faixa e interesse; o corretor precisava completar entrada, FGTS, restrição e momento de compra.","resultado":"A lição virou regra da casa: o corretor completa a conta na primeira ligação, sem repetir o que o robô já perguntou. Tempo de FGTS e antecipação do saque-aniversário entram nessa ligação.","fonte":"Casoteca SMQ, caso J (seção 9.12) e números da casa (seção 9.1)"},"scripts":[{"canal":"Ligação","situacao":"Levantar o FGTS sem jargão","texto":"Pra eu fazer a conta da entrada certinha: somando todos os empregos com carteira assinada, você já passou de 3 anos?","por_que_funciona":"Traduz a regra para a vida do cliente, explica o porquê e faz uma pergunta só."},{"canal":"Ligação","situacao":"Cliente tem 2 anos e 8 meses de FGTS","texto":"Então você está a 4 meses de poder usar o FGTS na compra. Vou deixar essa data marcada comigo. Enquanto isso, te mostro a conta sem o FGTS e o que melhora quando ele entrar. Posso te mandar agora?","por_que_funciona":"Transforma um \"não\" em uma data, mantém o cliente no funil e já oferece o próximo passo."},{"canal":"WhatsApp","situacao":"Cliente diz que tem saque-aniversário e acha que perdeu o FGTS","texto":"Boa notícia: ter o saque-aniversário não impede usar o FGTS na compra. O que pode travar é se você pegou uma antecipação dele em algum banco. Você fez essa antecipação?","por_que_funciona":"Corrige o mito com a regra conferida e vai direto à pergunta que decide, uma só."}],"erros_que_matam":[{"erro":"Dizer que saque-aniversário impede o uso do FGTS","custo":"O cliente desiste de uma entrada que ele tinha","correcao":"Aderir não impede; só o valor dado em garantia numa antecipação fica bloqueado"},{"erro":"Contar com o FGTS de quem ainda não tem 3 anos","custo":"A conta desaba na análise e o cliente se sente enganado","correcao":"Montar a conta sem o FGTS e agendar a data dos 3 anos"},{"erro":"Não perguntar se o cliente tem imóvel ou financiamento ativo","custo":"O FGTS é negado depois da pasta montada","correcao":"Fazer as três perguntas da porta: tempo, financiamento ativo e imóvel na região"}],"no_crm":{"tela":"Dossiê do cliente, aba Dados, e Agenda e Tarefas","acao":"Marcar Usa FGTS, anotar tempo e saldo nas Observações e criar o próximo passo na data em que o cliente completa 3 anos","campo":"Usa FGTS, Observações, próximo passo com data","regra":"Marco dos 3 anos sempre vira próximo passo com data, nunca \"depois eu vejo\""},"frase_ancora":"FGTS que ainda não pode é data na agenda, não \"não\".","checagem_rapida":[{"pergunta":"Quantos anos de FGTS o cliente precisa para usar na compra, e os vínculos precisam ser seguidos?","resposta":"3 anos, somando todos os vínculos; não precisam ser seguidos."},{"pergunta":"Aderir ao saque-aniversário impede usar o FGTS?","resposta":"Não. O que bloqueia é o valor dado em garantia numa antecipação feita em banco."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M09-A3', 3, 'Subsídio sem promessa: quem tem, como entra e o que nunca dizer', 'texto',
  '"O governo vai te dar R$ 55 mil." Essa frase já vendeu apartamento e já desfez venda. O subsídio existe, mas não é seu para prometer.

### Por que importa

O subsídio é o argumento mais forte da F1 e da F2, e o mais perigoso. A boa notícia precoce vira desqualificação tardia: com renda declarada de até R$ 3.000, a casa aprendeu (27/07/2026) a confirmar bruto, líquido e composição antes de dar a notícia. Prometer valor, ou prometer subsídio para F3 e F4, destrói a confiança e expõe a SMQ.

### O conceito

O subsídio é como um desconto que o programa dá no preço antes do financiamento, e quem calcula é a Caixa, na simulação e na análise. É maior nas rendas mais baixas e diminui conforme a renda sobe dentro da F2. F3 e F4 não têm.

### O método SMQ, passo a passo

1. Quem tem: F1 (até R$ 3.200) e F2 (de R$ 3.200,01 a R$ 5.000). F3 e F4 não têm subsídio (Portaria MCID nº 333/2026, vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente).
2. Quanto: pode chegar a R$ 55 mil (R$ 65 mil na região Norte). O valor depende de renda, município, composição familiar e FGTS, e só sai na simulação e na análise.
3. Como entra: como desconto no preço antes do financiamento. Ele reduz o que o cliente precisa pagar, mas não é garantia de "entrada zerada".
4. Quando falar: só depois de saber a renda, sempre como "varia e se confirma na análise".
5. Com renda declarada de até R$ 3.000, confirme se o valor é bruto ou líquido e se há composição antes de falar em elegibilidade.
6. Na conta da entrada (aula M09-A1), monte o cenário sem subsídio e mostre o subsídio como possível melhora, nunca como base.
7. O corretor não diz o valor do subsídio. Quem mostra é o simulador, e quem confirma é a análise.

### Na vida real

**O caso:** Aprendizado de 27/07/2026: leads com renda perto do piso da F1 recebiam a notícia de elegibilidade cedo demais.

**O que foi dito:** Com renda declarada de até R$ 3.000, a conversa comemorava o enquadramento antes de confirmar se o valor era bruto ou líquido e se havia composição.

**O que aconteceu:** A boa notícia precoce virou desqualificação tardia, na análise. A regra da casa passou a ser: confirmar antes de enquadrar, e falar de subsídio só como "varia e se confirma na análise".

### Scripts prontos

#### Ligação · Cliente de F2 pergunta "quanto de subsídio eu consigo?"

> Pelo seu perfil, você está numa faixa que pode ter subsídio. O valor quem define é a Caixa, pela renda, pela cidade e pela família, e eu te mostro no simulador antes de você assinar qualquer coisa. Me confirma: essa renda é antes ou depois dos descontos?

**Por que funciona:** Dá a boa notícia com verdade, tira do corretor a promessa do valor e confirma bruto ou líquido antes de avançar.

#### WhatsApp · Cliente de F3 pergunta pelo subsídio que viu no anúncio

> Na sua faixa de renda o programa não tem subsídio, e eu prefiro te falar isso agora. O que ajuda no seu caso é o FGTS e o parcelamento da entrada até as chaves. Quer que eu te mostre essa conta?

**Por que funciona:** Verdade técnica sem rodeio e troca imediata por um mecanismo que existe para o perfil dele.

### Erros que matam a venda

- **Dizer "o governo vai te dar R$ 55 mil"**  
  Quanto custa: Promessa proibida; o valor real quase sempre é outro e o cliente se sente enganado  
  Correção: "Pode ter subsídio; o valor sai no simulador e se confirma na análise"
- **Prometer subsídio para F3 ou F4**  
  Quanto custa: Informação falsa que derruba a venda e a credibilidade  
  Correção: F3 e F4 não têm subsídio; mostrar FGTS e parcelamento
- **Dizer que o subsídio cobre a entrada**  
  Quanto custa: Generalização perigosa: a entrada volta na conta real  
  Correção: Montar a conta sem subsídio e tratar o subsídio como melhora possível

### No CRM

- **Tela:** Dossiê do cliente, aba Dados
- **Ação:** Registrar a Faixa MCMV confirmada e anotar nas Observações se a renda é bruta ou líquida e se há composição
- **Campo:** Faixa MCMV, Renda informada, Tipo de renda, Observações
- **Regra:** Faixa só se marca depois de confirmar bruto, líquido e composição

### Frase-âncora

> **Subsídio se mostra no simulador. Nunca se promete na conversa.**

### Checagem rápida

1. Quais faixas têm subsídio?  
   Resposta: F1 e F2. F3 e F4 não têm.
2. Como o subsídio entra na conta?  
   Resposta: Como desconto no preço antes do financiamento, com valor definido na simulação e na análise.',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"O governo vai te dar R$ 55 mil.\" Essa frase já vendeu apartamento e já desfez venda. O subsídio existe, mas não é seu para prometer.","por_que_importa":"O subsídio é o argumento mais forte da F1 e da F2, e o mais perigoso. A boa notícia precoce vira desqualificação tardia: com renda declarada de até R$ 3.000, a casa aprendeu (27/07/2026) a confirmar bruto, líquido e composição antes de dar a notícia. Prometer valor, ou prometer subsídio para F3 e F4, destrói a confiança e expõe a SMQ.","conceito":"O subsídio é como um desconto que o programa dá no preço antes do financiamento, e quem calcula é a Caixa, na simulação e na análise. É maior nas rendas mais baixas e diminui conforme a renda sobe dentro da F2. F3 e F4 não têm.","metodo":["Quem tem: F1 (até R$ 3.200) e F2 (de R$ 3.200,01 a R$ 5.000). F3 e F4 não têm subsídio (Portaria MCID nº 333/2026, vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente).","Quanto: pode chegar a R$ 55 mil (R$ 65 mil na região Norte). O valor depende de renda, município, composição familiar e FGTS, e só sai na simulação e na análise.","Como entra: como desconto no preço antes do financiamento. Ele reduz o que o cliente precisa pagar, mas não é garantia de \"entrada zerada\".","Quando falar: só depois de saber a renda, sempre como \"varia e se confirma na análise\".","Com renda declarada de até R$ 3.000, confirme se o valor é bruto ou líquido e se há composição antes de falar em elegibilidade.","Na conta da entrada (aula M09-A1), monte o cenário sem subsídio e mostre o subsídio como possível melhora, nunca como base.","O corretor não diz o valor do subsídio. Quem mostra é o simulador, e quem confirma é a análise."],"na_vida_real":{"caso":"Aprendizado de 27/07/2026: leads com renda perto do piso da F1 recebiam a notícia de elegibilidade cedo demais.","o_que_foi_dito":"Com renda declarada de até R$ 3.000, a conversa comemorava o enquadramento antes de confirmar se o valor era bruto ou líquido e se havia composição.","resultado":"A boa notícia precoce virou desqualificação tardia, na análise. A regra da casa passou a ser: confirmar antes de enquadrar, e falar de subsídio só como \"varia e se confirma na análise\".","fonte":"Regras de crédito e aprendizados da operação (seção 9.9)"},"scripts":[{"canal":"Ligação","situacao":"Cliente de F2 pergunta \"quanto de subsídio eu consigo?\"","texto":"Pelo seu perfil, você está numa faixa que pode ter subsídio. O valor quem define é a Caixa, pela renda, pela cidade e pela família, e eu te mostro no simulador antes de você assinar qualquer coisa. Me confirma: essa renda é antes ou depois dos descontos?","por_que_funciona":"Dá a boa notícia com verdade, tira do corretor a promessa do valor e confirma bruto ou líquido antes de avançar."},{"canal":"WhatsApp","situacao":"Cliente de F3 pergunta pelo subsídio que viu no anúncio","texto":"Na sua faixa de renda o programa não tem subsídio, e eu prefiro te falar isso agora. O que ajuda no seu caso é o FGTS e o parcelamento da entrada até as chaves. Quer que eu te mostre essa conta?","por_que_funciona":"Verdade técnica sem rodeio e troca imediata por um mecanismo que existe para o perfil dele."}],"erros_que_matam":[{"erro":"Dizer \"o governo vai te dar R$ 55 mil\"","custo":"Promessa proibida; o valor real quase sempre é outro e o cliente se sente enganado","correcao":"\"Pode ter subsídio; o valor sai no simulador e se confirma na análise\""},{"erro":"Prometer subsídio para F3 ou F4","custo":"Informação falsa que derruba a venda e a credibilidade","correcao":"F3 e F4 não têm subsídio; mostrar FGTS e parcelamento"},{"erro":"Dizer que o subsídio cobre a entrada","custo":"Generalização perigosa: a entrada volta na conta real","correcao":"Montar a conta sem subsídio e tratar o subsídio como melhora possível"}],"no_crm":{"tela":"Dossiê do cliente, aba Dados","acao":"Registrar a Faixa MCMV confirmada e anotar nas Observações se a renda é bruta ou líquida e se há composição","campo":"Faixa MCMV, Renda informada, Tipo de renda, Observações","regra":"Faixa só se marca depois de confirmar bruto, líquido e composição"},"frase_ancora":"Subsídio se mostra no simulador. Nunca se promete na conversa.","checagem_rapida":[{"pergunta":"Quais faixas têm subsídio?","resposta":"F1 e F2. F3 e F4 não têm."},{"pergunta":"Como o subsídio entra na conta?","resposta":"Como desconto no preço antes do financiamento, com valor definido na simulação e na análise."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M09-A4', 4, 'O fluxo de pagamento: obra, financiamento e os custos que ninguém conta', 'texto',
  '"Sua parcela do apê é R$ 900 até as chaves." Na entrega chega a parcela do financiamento, outra, maior, e o cliente se sente enganado. Não era mentira. Era a conta pela metade.

### Por que importa

Vender a parcela de obra como "a parcela do apartamento" é um dos erros que mais custam: o cliente descobre a parcela do financiamento na entrega. E quem não mostra ITBI e cartório vê o cliente travar no fim, com o contrato na mão. O fluxo completo, mês a mês, é o que faz o cliente assinar sem medo e continuar comprando até a chave.

### O conceito

Comprar na planta é como pagar uma obra em etapas: um valor para começar (o ato), parcelas mensais e, às vezes, reforços anuais à construtora durante a obra. A parcela do financiamento é outra conta, com o banco, em outro momento. E no meio do caminho tem o pedágio do cartório: ITBI e registro.

### O método SMQ, passo a passo

1. Separe as duas contas: fluxo de obra (ato, parcelas mensais, anuais ou reforços, pago à construtora) e parcela do financiamento (paga ao banco). Nunca apresente uma como a outra.
2. Pergunte ao correspondente o modelo do empreendimento antes de explicar: financiamento na planta (durante a obra o cliente paga encargos da fase de obra ao banco) ou na entrega (o saldo com a construtora é corrigido até lá) [CONFIRMAR o modelo de cada empreendimento].
3. Monte o fluxo mês a mês até as chaves, com o aluguel que o cliente paga hoje ao lado: é a resposta honesta para "vou pagar aluguel e obra ao mesmo tempo?".
4. ITBI na capital (valores de 2026, vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente): alíquota geral de 3% sobre o maior valor entre a transação e o valor venal de referência. Com financiamento pelo SFH, PAR ou HIS de imóvel de até R$ 725.808, 0,5% sobre a parte financiada até R$ 120.968 e 3% sobre o restante.
5. Isenção de ITBI: comprador pessoa física, uso exclusivamente residencial, primeira aquisição ou aquisição dentro do MCMV, valor de até R$ 245.527,77 (desde 01/01/2026). Quem confirma o enquadramento é o cartório.
6. Exemplo didático, não é orçamento: unidade de R$ 300 mil com R$ 240 mil financiados pelo SFH paga R$ 604,84 mais R$ 5.370,96, total de R$ 5.975,80, contra R$ 9.000 sem o benefício. Registro e taxas do cartório se somam [CONFIRMAR valores no cartório].
7. Negociação: o corretor monta a condição da campanha (parcelamento da entrada até as chaves; ITBI e documentação quando a campanha cobre, por escrito). Qualquer desconto ou condição fora da campanha vai para o gerente ou o diretor.
8. Mostre o custo total por escrito e nunca diga "documentação grátis" se a campanha não disser isso.

### Na vida real

**O caso:** Caso C, dois meses de espera e venda salva pela verdade (diretor Guilherme Nunes, fev a abr/2025).

**O que foi dito:** A montagem financeira foi explicada peça por peça: financiamento de 80% do valor, FGTS abatendo parte da entrada, ato baixo e saldo parcelado. ITBI e documentação entraram como compensação pela espera, negociados por quem tinha a alçada.

**O que aconteceu:** Aprovação às 10h19 e assinatura horas depois. A mecânica é o que se ensina; a compensação foi decisão de quem tinha a alçada, dentro da regra da construtora, e não é técnica padrão.

### Scripts prontos

#### Ligação · Cliente pergunta "vou pagar aluguel e obra ao mesmo tempo?"

> Vai, por um tempo, e eu quero que você veja isso antes de decidir. Vou montar mês a mês o que você paga à construtora até as chaves, com o seu aluguel do lado, e depois a parcela do banco. Te mando hoje à noite ou amanhã de manhã?

**Por que funciona:** Assume a verdade que o cliente teme, promete a conta completa e fecha com duas opções.

#### WhatsApp · Cliente pergunta "a documentação é grátis?"

> Nessa campanha, a construtora [cobre ou não cobre, conforme a tabela escrita] o ITBI e a documentação. Vou te mandar o custo total por escrito, com tudo somado, pra você não ter surpresa. Pode ser?

**Por que funciona:** Só afirma o que a campanha diz por escrito e oferece transparência total, com uma pergunta só.

#### Visita · Apresentar o fluxo na mesa, depois da escolha da unidade

> Aqui estão as duas contas separadas: em cima, o que você paga à construtora durante a obra; embaixo, a parcela estimada do financiamento, que começa depois. A confirmação da parcela vem na análise da Caixa. Qual das duas você quer que eu explique primeiro?

**Por que funciona:** Separa visualmente obra e financiamento, usa a linguagem permitida e devolve a condução com uma escolha.

### Erros que matam a venda

- **Vender a parcela de obra como "a parcela do apartamento"**  
  Quanto custa: O cliente descobre a parcela do financiamento na entrega e se sente enganado  
  Correção: Separar sempre fluxo de obra e financiamento, por escrito
- **Esquecer ITBI e cartório na conta**  
  Quanto custa: O cliente trava no fim, com o contrato na mão  
  Correção: Custo total por escrito, com ITBI calculado e registro a confirmar no cartório
- **Oferecer desconto ou condição fora da campanha**  
  Quanto custa: Promessa que o corretor não pode cumprir e tabela desigual entre clientes  
  Correção: Montar a condição da campanha e levar o pedido extra ao gerente com retorno marcado

### No CRM

- **Tela:** Dossiê do cliente, aba Documentação, e Observações
- **Ação:** Anexar o fluxo de pagamento enviado ao cliente e anotar o modelo do empreendimento e o custo total
- **Campo:** Observações e anexos do Dossiê
- **Regra:** Nenhum fluxo sai para o cliente sem obra e financiamento separados e sem o custo total

### Frase-âncora

> **Parcela de obra não é parcela do apê. Mostre as duas, por escrito.**

### Checagem rápida

1. Qual o valor-limite da isenção de ITBI em 2026 na capital?  
   Resposta: R$ 245.527,77, para quem se enquadra nas condições; quem confirma é o cartório.
2. O que o corretor pode negociar sozinho?  
   Resposta: Só a condição da campanha; desconto ou condição fora dela vai para o gerente ou o diretor.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Sua parcela do apê é R$ 900 até as chaves.\" Na entrega chega a parcela do financiamento, outra, maior, e o cliente se sente enganado. Não era mentira. Era a conta pela metade.","por_que_importa":"Vender a parcela de obra como \"a parcela do apartamento\" é um dos erros que mais custam: o cliente descobre a parcela do financiamento na entrega. E quem não mostra ITBI e cartório vê o cliente travar no fim, com o contrato na mão. O fluxo completo, mês a mês, é o que faz o cliente assinar sem medo e continuar comprando até a chave.","conceito":"Comprar na planta é como pagar uma obra em etapas: um valor para começar (o ato), parcelas mensais e, às vezes, reforços anuais à construtora durante a obra. A parcela do financiamento é outra conta, com o banco, em outro momento. E no meio do caminho tem o pedágio do cartório: ITBI e registro.","metodo":["Separe as duas contas: fluxo de obra (ato, parcelas mensais, anuais ou reforços, pago à construtora) e parcela do financiamento (paga ao banco). Nunca apresente uma como a outra.","Pergunte ao correspondente o modelo do empreendimento antes de explicar: financiamento na planta (durante a obra o cliente paga encargos da fase de obra ao banco) ou na entrega (o saldo com a construtora é corrigido até lá) [CONFIRMAR o modelo de cada empreendimento].","Monte o fluxo mês a mês até as chaves, com o aluguel que o cliente paga hoje ao lado: é a resposta honesta para \"vou pagar aluguel e obra ao mesmo tempo?\".","ITBI na capital (valores de 2026, vigente em set/2026, confirmar na tabela oficial ou com o correspondente antes de usar com cliente): alíquota geral de 3% sobre o maior valor entre a transação e o valor venal de referência. Com financiamento pelo SFH, PAR ou HIS de imóvel de até R$ 725.808, 0,5% sobre a parte financiada até R$ 120.968 e 3% sobre o restante.","Isenção de ITBI: comprador pessoa física, uso exclusivamente residencial, primeira aquisição ou aquisição dentro do MCMV, valor de até R$ 245.527,77 (desde 01/01/2026). Quem confirma o enquadramento é o cartório.","Exemplo didático, não é orçamento: unidade de R$ 300 mil com R$ 240 mil financiados pelo SFH paga R$ 604,84 mais R$ 5.370,96, total de R$ 5.975,80, contra R$ 9.000 sem o benefício. Registro e taxas do cartório se somam [CONFIRMAR valores no cartório].","Negociação: o corretor monta a condição da campanha (parcelamento da entrada até as chaves; ITBI e documentação quando a campanha cobre, por escrito). Qualquer desconto ou condição fora da campanha vai para o gerente ou o diretor.","Mostre o custo total por escrito e nunca diga \"documentação grátis\" se a campanha não disser isso."],"na_vida_real":{"caso":"Caso C, dois meses de espera e venda salva pela verdade (diretor Guilherme Nunes, fev a abr/2025).","o_que_foi_dito":"A montagem financeira foi explicada peça por peça: financiamento de 80% do valor, FGTS abatendo parte da entrada, ato baixo e saldo parcelado. ITBI e documentação entraram como compensação pela espera, negociados por quem tinha a alçada.","resultado":"Aprovação às 10h19 e assinatura horas depois. A mecânica é o que se ensina; a compensação foi decisão de quem tinha a alçada, dentro da regra da construtora, e não é técnica padrão.","fonte":"Casoteca SMQ, caso C (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Cliente pergunta \"vou pagar aluguel e obra ao mesmo tempo?\"","texto":"Vai, por um tempo, e eu quero que você veja isso antes de decidir. Vou montar mês a mês o que você paga à construtora até as chaves, com o seu aluguel do lado, e depois a parcela do banco. Te mando hoje à noite ou amanhã de manhã?","por_que_funciona":"Assume a verdade que o cliente teme, promete a conta completa e fecha com duas opções."},{"canal":"WhatsApp","situacao":"Cliente pergunta \"a documentação é grátis?\"","texto":"Nessa campanha, a construtora [cobre ou não cobre, conforme a tabela escrita] o ITBI e a documentação. Vou te mandar o custo total por escrito, com tudo somado, pra você não ter surpresa. Pode ser?","por_que_funciona":"Só afirma o que a campanha diz por escrito e oferece transparência total, com uma pergunta só."},{"canal":"Visita","situacao":"Apresentar o fluxo na mesa, depois da escolha da unidade","texto":"Aqui estão as duas contas separadas: em cima, o que você paga à construtora durante a obra; embaixo, a parcela estimada do financiamento, que começa depois. A confirmação da parcela vem na análise da Caixa. Qual das duas você quer que eu explique primeiro?","por_que_funciona":"Separa visualmente obra e financiamento, usa a linguagem permitida e devolve a condução com uma escolha."}],"erros_que_matam":[{"erro":"Vender a parcela de obra como \"a parcela do apartamento\"","custo":"O cliente descobre a parcela do financiamento na entrega e se sente enganado","correcao":"Separar sempre fluxo de obra e financiamento, por escrito"},{"erro":"Esquecer ITBI e cartório na conta","custo":"O cliente trava no fim, com o contrato na mão","correcao":"Custo total por escrito, com ITBI calculado e registro a confirmar no cartório"},{"erro":"Oferecer desconto ou condição fora da campanha","custo":"Promessa que o corretor não pode cumprir e tabela desigual entre clientes","correcao":"Montar a condição da campanha e levar o pedido extra ao gerente com retorno marcado"}],"no_crm":{"tela":"Dossiê do cliente, aba Documentação, e Observações","acao":"Anexar o fluxo de pagamento enviado ao cliente e anotar o modelo do empreendimento e o custo total","campo":"Observações e anexos do Dossiê","regra":"Nenhum fluxo sai para o cliente sem obra e financiamento separados e sem o custo total"},"frase_ancora":"Parcela de obra não é parcela do apê. Mostre as duas, por escrito.","checagem_rapida":[{"pergunta":"Qual o valor-limite da isenção de ITBI em 2026 na capital?","resposta":"R$ 245.527,77, para quem se enquadra nas condições; quem confirma é o cartório."},{"pergunta":"O que o corretor pode negociar sozinho?","resposta":"Só a condição da campanha; desconto ou condição fora dela vai para o gerente ou o diretor."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M09-A5', 5, 'Montar e apresentar a conta completa, inclusive contra o aluguel', 'texto',
  '"No aluguel eu pago menos." Paga mesmo, por enquanto. A pergunta que muda a conversa é outra: daqui a 10 anos, com o que você fica?

### Por que importa

A conta completa é o que transforma "vou pensar" em decisão. Quem apresenta entrada, fluxo, custos e o comparativo com o aluguel com números honestos dá ao cliente segurança para escolher, e ao gerente uma pasta que não trava. A promessa de valorização, ao contrário, é proibida e cobra caro depois.

### O conceito

É a conta do orçamento de casa: de onde vem o dinheiro, para onde vai e o que sobra no fim. No aluguel, o dinheiro vai embora todo mês. Na compra, parte da parcela vira patrimônio, devagar no começo. Mostrar isso sem exagero é o argumento mais forte que existe.

### O método SMQ, passo a passo

1. Passo 1, o caixa: dinheiro guardado, FGTS (se pode usar e quando) e subsídio só como possível melhora, em F1 e F2.
2. Passo 2, a entrada: 80% sobre o menor valor entre preço e laudo, com os cenários de laudo em F3 e F4.
3. Passo 3, o fluxo: ato, parcelas até as chaves, anuais se houver, dentro da condição da campanha, e o esforço mensal em relação à renda.
4. Passo 4, os custos: ITBI e cartório, com o que a campanha cobre por escrito.
5. Passo 5, o comparativo com o aluguel, com premissas escritas e cenário de valorização zero; nunca prometer valorização nem percentual.
6. Passo 6, a leitura: apresentável (esforço até cerca de 22% da renda), plano B (de 30% a 50%) ou não fecha. Se não fecha, outro produto ou outra data, com o próximo passo marcado.
7. Feche com um dos 2 caminhos: visita com duas opções de horário ou análise gratuita com documento. "Simulação indica. Análise formal aprova."

### Na vida real

**O caso:** Caso N, da análise gratuita à assinatura em 23 dias (jan a fev/2026).

**O que foi dito:** No dia 19, com o crédito aprovado, a unidade foi escolhida com o cliente e o fluxo foi refeito com a última parcela anual reduzida, dentro do que a tabela permitia. O contrato foi assinado no estande à noite; o contrato de financiamento com o banco veio no dia 39.

**O que aconteceu:** Fluxo pronto antes da chegada do cliente e tudo por escrito, como ele pediu. O caso mostra na prática que a série paga à construtora e o contrato com o banco são momentos diferentes.

### Scripts prontos

#### Ligação · Cliente diz "no aluguel eu pago menos"

> Faz sentido, e eu não vou te dizer que não. Vamos fazer a conta junto? Em 10 anos, um aluguel de R$ 1.200 sem reajuste soma R$ 144 mil e não deixa nada seu. Quer ver o que sobra do lado da compra, com a mesma régua?

**Por que funciona:** Valida, faz a conta com o número do próprio cliente e pede permissão para mostrar o outro lado, sem prometer valorização.

#### WhatsApp · Enviar a conta completa depois da ligação

> Como combinamos, segue a sua conta completa: entrada, parcelas até as chaves, custos do cartório e a parcela estimada do banco, separadas. É estimativa: a confirmação vem na análise da Caixa. Prefere conversar sobre ela hoje às 19h ou amanhã às 12h?

**Por que funciona:** Cumpre o combinado, usa a linguagem permitida sobre crédito e fecha com duas opções de horário.

### Erros que matam a venda

- **Prometer que o imóvel vai valorizar**  
  Quanto custa: Promessa proibida que vira cobrança e desconfiança  
  Correção: Comparativo com premissas escritas e cenário de valorização zero
- **Apresentar só o cenário bom**  
  Quanto custa: O cliente compra uma conta que não existe e a pasta trava na análise  
  Correção: Mostrar cenário de laudo e esforço mensal real, com a leitura honesta
- **Terminar a apresentação sem próximo passo**  
  Quanto custa: A conta vira "vou pensar" e o cliente esfria  
  Correção: Fechar com visita em duas opções de horário ou análise com documento

### No CRM

- **Tela:** Fila Única e Dossiê do cliente
- **Ação:** Registrar o desfecho da apresentação com próximo passo e data; em perda, o motivo verdadeiro
- **Campo:** Desfecho, próximo passo e data; motivo de perda "Achou caro / parcela não cabe" só quando for isso
- **Regra:** Nada sai da fila sem desfecho; motivo de perda é o verdadeiro, nunca o mais cômodo

### Frase-âncora

> **Venda não é sorte. É conta.**

### Checagem rápida

1. Qual cenário de valorização se usa no comparativo com o aluguel?  
   Resposta: Valorização zero, com premissas escritas; nunca promessa de valorização.
2. Com que dois caminhos a apresentação da conta termina?  
   Resposta: Visita com duas opções de horário ou análise gratuita com documento.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"No aluguel eu pago menos.\" Paga mesmo, por enquanto. A pergunta que muda a conversa é outra: daqui a 10 anos, com o que você fica?","por_que_importa":"A conta completa é o que transforma \"vou pensar\" em decisão. Quem apresenta entrada, fluxo, custos e o comparativo com o aluguel com números honestos dá ao cliente segurança para escolher, e ao gerente uma pasta que não trava. A promessa de valorização, ao contrário, é proibida e cobra caro depois.","conceito":"É a conta do orçamento de casa: de onde vem o dinheiro, para onde vai e o que sobra no fim. No aluguel, o dinheiro vai embora todo mês. Na compra, parte da parcela vira patrimônio, devagar no começo. Mostrar isso sem exagero é o argumento mais forte que existe.","metodo":["Passo 1, o caixa: dinheiro guardado, FGTS (se pode usar e quando) e subsídio só como possível melhora, em F1 e F2.","Passo 2, a entrada: 80% sobre o menor valor entre preço e laudo, com os cenários de laudo em F3 e F4.","Passo 3, o fluxo: ato, parcelas até as chaves, anuais se houver, dentro da condição da campanha, e o esforço mensal em relação à renda.","Passo 4, os custos: ITBI e cartório, com o que a campanha cobre por escrito.","Passo 5, o comparativo com o aluguel, com premissas escritas e cenário de valorização zero; nunca prometer valorização nem percentual.","Passo 6, a leitura: apresentável (esforço até cerca de 22% da renda), plano B (de 30% a 50%) ou não fecha. Se não fecha, outro produto ou outra data, com o próximo passo marcado.","Feche com um dos 2 caminhos: visita com duas opções de horário ou análise gratuita com documento. \"Simulação indica. Análise formal aprova.\""],"na_vida_real":{"caso":"Caso N, da análise gratuita à assinatura em 23 dias (jan a fev/2026).","o_que_foi_dito":"No dia 19, com o crédito aprovado, a unidade foi escolhida com o cliente e o fluxo foi refeito com a última parcela anual reduzida, dentro do que a tabela permitia. O contrato foi assinado no estande à noite; o contrato de financiamento com o banco veio no dia 39.","resultado":"Fluxo pronto antes da chegada do cliente e tudo por escrito, como ele pediu. O caso mostra na prática que a série paga à construtora e o contrato com o banco são momentos diferentes.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"Cliente diz \"no aluguel eu pago menos\"","texto":"Faz sentido, e eu não vou te dizer que não. Vamos fazer a conta junto? Em 10 anos, um aluguel de R$ 1.200 sem reajuste soma R$ 144 mil e não deixa nada seu. Quer ver o que sobra do lado da compra, com a mesma régua?","por_que_funciona":"Valida, faz a conta com o número do próprio cliente e pede permissão para mostrar o outro lado, sem prometer valorização."},{"canal":"WhatsApp","situacao":"Enviar a conta completa depois da ligação","texto":"Como combinamos, segue a sua conta completa: entrada, parcelas até as chaves, custos do cartório e a parcela estimada do banco, separadas. É estimativa: a confirmação vem na análise da Caixa. Prefere conversar sobre ela hoje às 19h ou amanhã às 12h?","por_que_funciona":"Cumpre o combinado, usa a linguagem permitida sobre crédito e fecha com duas opções de horário."}],"erros_que_matam":[{"erro":"Prometer que o imóvel vai valorizar","custo":"Promessa proibida que vira cobrança e desconfiança","correcao":"Comparativo com premissas escritas e cenário de valorização zero"},{"erro":"Apresentar só o cenário bom","custo":"O cliente compra uma conta que não existe e a pasta trava na análise","correcao":"Mostrar cenário de laudo e esforço mensal real, com a leitura honesta"},{"erro":"Terminar a apresentação sem próximo passo","custo":"A conta vira \"vou pensar\" e o cliente esfria","correcao":"Fechar com visita em duas opções de horário ou análise com documento"}],"no_crm":{"tela":"Fila Única e Dossiê do cliente","acao":"Registrar o desfecho da apresentação com próximo passo e data; em perda, o motivo verdadeiro","campo":"Desfecho, próximo passo e data; motivo de perda \"Achou caro / parcela não cabe\" só quando for isso","regra":"Nada sai da fila sem desfecho; motivo de perda é o verdadeiro, nunca o mais cômodo"},"frase_ancora":"Venda não é sorte. É conta.","checagem_rapida":[{"pergunta":"Qual cenário de valorização se usa no comparativo com o aluguel?","resposta":"Valorização zero, com premissas escritas; nunca promessa de valorização."},{"pergunta":"Com que dois caminhos a apresentação da conta termina?","resposta":"Visita com duas opções de horário ou análise gratuita com documento."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q01', 1, 'situacional',
  'O cliente diz: "Tenho 2 anos e 8 meses de FGTS, dá pra usar na entrada?" Qual é a sua resposta?',
  '["\"Dá sim, o FGTS pode ser usado a partir de 2 anos.\"","\"Não dá, e sem FGTS a compra fica impossível.\"","\"Ainda não: a regra pede 3 anos somando os vínculos. Faltam 4 meses, então eu monto a conta sem o FGTS e deixo essa data marcada.\"","\"Dá, se você aderir ao saque-aniversário antes.\""]'::jsonb,
  2,
  'A C aplica a regra dos 3 anos somando vínculos e transforma a espera em data agendada, sem travar a conversa. A A inventa um prazo de 2 anos. A B desiste do cliente, quando a conta pode fechar sem o FGTS ou depois do marco. A D inventa uma regra: o saque-aniversário não antecipa o direito de usar o FGTS na compra.',
  'M09-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q02', 2, 'situacional',
  'O cliente tem um apartamento em outra cidade, fora da região metropolitana de onde mora e trabalha, e pergunta se pode usar o FGTS. O que você responde?',
  '["\"Por essa regra não trava: o que impede é ter imóvel residencial onde você mora ou trabalha, nos vizinhos ou na mesma região metropolitana. Vou confirmar o seu caso com o correspondente.\"","\"Não pode: quem já tem qualquer imóvel perde o FGTS.\"","\"Pode, e o MCMV também está garantido.\"","\"Só pode se vender o outro imóvel antes.\""]'::jsonb,
  0,
  'A A aplica a regra conferida do FGTS e leva a confirmação ao correspondente, sem prometer. A B generaliza: a regra fala de imóvel residencial na região onde mora ou trabalha. A C promete o que a análise decide. A D cria uma exigência que a regra do FGTS não traz para imóvel fora da região.',
  'M09-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q03', 3, 'situacional',
  'O cliente diz: "Tenho saque-aniversário, então perdi o FGTS pra comprar, né?" Qual é a próxima mensagem certa?',
  '["\"Perdeu, só volta daqui a dois anos.\"","\"Não perdeu nada, pode usar tudo.\"","\"Cancela o saque-aniversário hoje que resolve.\"","\"Ter o saque-aniversário não impede. O que pode travar é uma antecipação feita em banco. Você fez essa antecipação?\""]'::jsonb,
  3,
  'A D corrige o mito e faz a pergunta que decide: só o valor dado em garantia numa antecipação fica bloqueado. A A repete o erro do material antigo. A B promete o saldo inteiro sem saber se houve antecipação. A C manda o cliente agir sem necessidade e não resolve uma antecipação existente.',
  'M09-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q04', 4, 'situacional',
  'Cliente de F2, com renda confirmada, pergunta: "Quanto de subsídio eu consigo?" O que você diz?',
  '["\"R$ 55 mil, o valor do programa.\"","\"Pelo seu perfil pode ter subsídio. O valor quem define é a Caixa, e eu te mostro no simulador antes de você assinar qualquer coisa.\"","\"Subsídio é só pra quem ganha até R$ 2 mil.\"","\"Não sei, isso é com o banco.\""]'::jsonb,
  1,
  'A B dá a boa notícia com verdade e mostra o caminho: simulador e análise. A A promete o teto como se fosse o valor dele, frase proibida. A C inventa uma regra: a F2 vai até R$ 5.000 e também tem subsídio. A D abandona o cliente sem próximo passo.',
  'M09-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q05', 5, 'situacional',
  'Uma cliente com renda de R$ 7.500 viu um anúncio e pergunta pelo subsídio. Qual é a resposta certa?',
  '["\"Tem sim, mas menor que na F2.\"","\"Na sua faixa o programa não tem subsídio. O que ajuda no seu caso é o FGTS e o parcelamento da entrada até as chaves. Quer ver essa conta?\"","\"Tem, se você juntar a renda de alguém.\"","\"Depende do empreendimento.\""]'::jsonb,
  1,
  'A B diz a verdade (R$ 7.500 é F3, que não tem subsídio) e troca por mecanismos reais. A A promete subsídio para F3, erro grave. A C inventa uma saída: compor renda aumenta a renda e não cria subsídio. A D foge da regra, que é do programa, não do empreendimento.',
  'M09-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q06', 6, 'situacional',
  'O cliente pergunta: "Vou pagar aluguel e obra ao mesmo tempo?" O que você faz?',
  '["\"Não se preocupa, a obra é baratinha.\"","\"Só começa a pagar quando ficar pronto.\"","\"Aí depende de você.\"","\"Vai, por um tempo. Vou montar mês a mês o que você paga à construtora até as chaves, com o seu aluguel ao lado, e depois a parcela do banco. Te mando hoje à noite ou amanhã de manhã?\""]'::jsonb,
  3,
  'A D assume a verdade e promete o fluxo completo, com duas opções. A A minimiza sem conta. A B repete a frase imprecisa que o módulo corrige: na planta há ato e parcelas de obra. A C devolve a responsabilidade ao cliente e não traz número nenhum.',
  'M09-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q07', 7, 'situacional',
  'Na apresentação, o cliente pede: "Consegue um desconto na entrada pra eu fechar hoje?" Qual é a conduta?',
  '["\"O preço de tabela é igual pra todo mundo. Eu monto a melhor condição da campanha pra você; se precisar ir além, levo ao meu gerente hoje e te dou retorno até as 18h.\"","\"Consigo 5% se você assinar agora.\"","\"Desconto não existe, é pegar ou largar.\"","\"Deixa comigo que eu tiro da minha parte.\""]'::jsonb,
  0,
  'A A segue a regra: condição da campanha pelo corretor, pedido extra ao gerente com retorno marcado. A B dá desconto sem alçada e com urgência falsa. A C encerra a conversa sem alternativa. A D promete algo fora da política e confunde o cliente com remuneração do corretor.',
  'M09-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q08', 8, 'situacional',
  'O cliente pergunta: "A documentação é grátis?" A tabela escrita da campanha não fala em ITBI nem em documentação. O que você responde?',
  '["\"É grátis sim, nessa campanha tudo está incluso.\"","\"Isso a gente vê depois da assinatura.\"","\"Nessa campanha não está incluída. Vou te mandar o custo total por escrito, com ITBI e cartório, pra você não ter surpresa. Pode ser?\"","\"Documentação é problema do banco.\""]'::jsonb,
  2,
  'A C só afirma o que a campanha diz por escrito e oferece o custo total. A A promete "grátis" sem a campanha dizer, frase proibida. A B esconde um custo que trava a venda no fim. A D é falsa: o ITBI é pago em regra pelo comprador e exigido para o registro.',
  'M09-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q09', 9, 'aplicacao',
  'Valor de treino: unidade de R$ 260 mil, laudo igual ao preço. Quanto é a entrada?',
  '["R$ 26.000","R$ 41.600","R$ 208.000","R$ 52.000"]'::jsonb,
  3,
  'A D: 80% de R$ 260 mil são R$ 208.000 financiados; a entrada é R$ 260.000 menos R$ 208.000, ou R$ 52.000 (20%). A A usa 10%, sem base. A B aplica 16%, número sem regra. A C é o valor financiado, não a entrada.',
  'M09-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q10', 10, 'aplicacao',
  'Valor de treino: unidade de R$ 300 mil, laudo 10% abaixo do preço (R$ 270 mil). Quanto é a entrada?',
  '["R$ 60.000","R$ 84.000","R$ 54.000","R$ 30.000"]'::jsonb,
  1,
  'A B: 80% do menor valor (R$ 270 mil) são R$ 216.000; a entrada é R$ 300.000 menos R$ 216.000, ou R$ 84.000 (28%). A A calcula os 80% sobre o preço, a armadilha nº 1. A C aplica 20% sobre o laudo e esquece que o cliente paga o preço cheio. A D confunde a diferença do laudo com a entrada.',
  'M09-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q11', 11, 'aplicacao',
  'Valor de treino: entrada exigida de R$ 60.000, dinheiro disponível de R$ 15.000 e 30 meses até a entrega. Renda de R$ 7.500. Qual é o esforço mensal e a leitura?',
  '["R$ 1.500 por mês, 20% da renda: apresentável.","R$ 2.000 por mês, 27% da renda: não fecha.","R$ 500 por mês, 7% da renda: apresentável.","R$ 1.500 por mês, 20% da renda: plano B."]'::jsonb,
  0,
  'A A: (60.000 menos 15.000) dividido por 30 dá R$ 1.500, 20% de R$ 7.500, dentro de até cerca de 22%, apresentável. A B divide pelo valor errado. A C divide o dinheiro disponível, não a diferença. A D acerta a conta e erra a leitura: plano B começa em 30%.',
  'M09-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q12', 12, 'aplicacao',
  'Valor de treino na capital: unidade de R$ 260 mil com R$ 208 mil financiados pelo SFH, comprador fora da isenção. Qual é o ITBI estimado?',
  '["R$ 7.800,00","R$ 1.300,00","R$ 4.775,80","Zero, porque é MCMV"]'::jsonb,
  2,
  'A C: 0,5% sobre R$ 120.968 (R$ 604,84) mais 3% sobre o restante do valor, R$ 139.032 (R$ 4.170,96), total de R$ 4.775,80. A A aplica 3% sobre tudo, sem o benefício do SFH. A B aplica 0,5% sobre tudo. A D ignora o limite: a isenção vai até R$ 245.527,77 e a unidade custa R$ 260 mil.',
  'M09-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q13', 13, 'aplicacao',
  'Com laudo igual ao preço, qual é o teto de compra aproximado de quem tem R$ 20 mil disponíveis para a entrada, sem contar com parcelamento?',
  '["R$ 100.000","R$ 25.000","R$ 80.000","R$ 400.000"]'::jsonb,
  0,
  'A A: teto pelo caixa ≈ dinheiro disponível dividido por 0,20, ou R$ 100.000. A B soma 25%, sem regra. A C trata o caixa como 25% da compra. A D multiplica por 20. A lição: sem o parcelamento da campanha, o caixa sozinho compra pouco; por isso o esforço mensal decide.',
  'M09-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q14', 14, 'aplicacao',
  'Valor de treino: unidade de R$ 480 mil, laudo 20% abaixo (R$ 384 mil). Quanto é a entrada e o percentual do preço?',
  '["R$ 96.000, 20%","R$ 134.400, 28%","R$ 76.800, 16%","R$ 172.800, 36%"]'::jsonb,
  3,
  'A D: 80% de R$ 384 mil são R$ 307.200; a entrada é R$ 480.000 menos R$ 307.200, ou R$ 172.800 (36%). A A é o cenário de laudo cheio. A B é o de laudo 10% abaixo. A C aplica 20% sobre o laudo e esquece a diferença entre preço e laudo.',
  'M09-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q15', 15, 'conceito',
  'Sobre qual valor a Caixa aplica o limite de financiamento de 80%?',
  '["Sobre o preço de tabela.","Sobre a média entre preço e laudo.","Sobre o menor valor entre o preço de venda e o laudo.","Sobre o maior valor entre o preço de venda e o laudo."]'::jsonb,
  2,
  'A C é a regra conferida: 80% do menor valor entre preço e avaliação. A A é a armadilha nº 1, que faz a entrada explodir quando o laudo vem abaixo. A B e a D inventam critérios.',
  'M09-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q16', 16, 'conceito',
  'Qual afirmação sobre o fluxo de pagamento na planta está correta?',
  '["A parcela de obra é a parcela do apartamento.","O fluxo pago à construtora durante a obra e a parcela do financiamento são contas diferentes, em momentos diferentes.","Na planta, o cliente só começa a pagar quando fica pronto.","Todo empreendimento assina o financiamento na entrega."]'::jsonb,
  1,
  'A B separa as duas contas, como manda a regra. A A é o erro que faz o cliente se sentir enganado na entrega. A C é a frase imprecisa que o módulo corrige: há ato e parcelas de obra. A D generaliza: o modelo muda por empreendimento e se confirma com o correspondente.',
  'M09-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q17', 17, 'conceito',
  'Como o subsídio do MCMV entra na conta do cliente?',
  '["Como dinheiro depositado na conta do cliente depois da assinatura.","Como abatimento na parcela do financiamento, só depois das chaves.","Como desconto no preço antes do financiamento, em F1 e F2, com valor definido na simulação e na análise.","Como pagamento integral da entrada."]'::jsonb,
  2,
  'A C descreve a regra conferida. A A e a B inventam o mecanismo. A D é a generalização perigosa "subsídio cobre a entrada", que o módulo corrige.',
  'M09-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q18', 18, 'conceito',
  'Na leitura do esforço mensal até as chaves, qual é a regra da casa?',
  '["Qualquer valor serve, se o cliente quiser muito.","Até cerca de 22% da renda é apresentável; de 30% a 50% é plano B; acima disso não fecha.","Até 50% da renda é apresentável.","O esforço mensal não importa, só a parcela do banco."]'::jsonb,
  1,
  'A B é a régua da seção 9.9. A A empurra o cliente para uma conta que ele não sustenta. A C trata como apresentável o que é plano B. A D ignora que a trava costuma ser a entrada, não a parcela.',
  'M09-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q19', 19, 'caca_ao_erro',
  'Encontre o erro nesta mensagem: "Boa notícia! Com o subsídio, a sua entrada fica zerada e você só começa a pagar quando o apê ficar pronto."',
  '["O erro é só a falta de emoji.","Não há erro: é uma mensagem motivadora.","O erro é falar do subsídio antes da visita.","Promete que o subsídio zera a entrada e diz que só paga na entrega: duas afirmações proibidas ou imprecisas."]'::jsonb,
  3,
  'A D aponta os dois erros: "subsídio cobre a entrada" é generalização perigosa, e "só começa a pagar quando fica pronto" ignora o ato e as parcelas de obra. A A e a B não veem o problema. A C erra o alvo: o problema não é o momento, é a promessa.',
  'M09-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M09-Q20', 20, 'caca_ao_erro',
  'Encontre o erro nesta mensagem: "Fechado! Sua parcela do apê é R$ 900 por mês até as chaves, e a documentação é por nossa conta." (A campanha não cobre documentação por escrito.)',
  '["Vende a parcela de obra como \"a parcela do apê\" e promete documentação sem a campanha dizer por escrito.","O erro é o valor, que deveria ser arredondado para baixo.","Não há erro: o cliente gostou.","O erro é usar \"Fechado!\" em vez de \"Parabéns!\"."]'::jsonb,
  0,
  'A A aponta os dois problemas: mistura fluxo de obra com a parcela do financiamento e promete documentação fora da campanha. A B sugere arredondar para baixo, outro erro de conformidade. A C e a D ignoram a verdade técnica.',
  'M09-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (13)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F01', 1, 'Fórmula da entrada', 'Preço menos 80% do menor valor entre preço e laudo.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F02', 2, 'Laudo 10% e 20% abaixo do preço', 'Entrada de 28% e de 36% do preço. Laudo igual ao preço: 20%.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F03', 3, 'Teto de compra pelo caixa (laudo cheio)', 'Dinheiro disponível para a entrada dividido por 0,20.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F04', 4, 'Esforço mensal', '(Entrada exigida menos dinheiro disponível) dividido pelos meses até a entrega. Até cerca de 22% da renda: apresentável. De 30% a 50%: plano B.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F05', 5, 'FGTS na compra: tempo', '3 anos sob o regime do FGTS, somando todos os vínculos, que não precisam ser seguidos.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F06', 6, 'FGTS na compra: as outras portas', 'Sem financiamento ativo no SFH no país e sem imóvel residencial onde mora ou trabalha, nos vizinhos ou na região metropolitana.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F07', 7, 'Saque-aniversário', 'Aderir não impede usar o FGTS na compra. Trava só o valor dado em garantia numa antecipação feita em banco.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F08', 8, 'Pergunta certa sobre o saque-aniversário', '"Você fez antecipação do saque-aniversário em algum banco?"', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F09', 9, 'Quem tem subsídio', 'F1 e F2, até R$ 55 mil (R$ 65 mil no Norte), decrescente com a renda. F3 e F4 não têm.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F10', 10, 'Como o subsídio entra', 'Como desconto no preço antes do financiamento; o valor sai na simulação e se confirma na análise.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F11', 11, 'Isenção de ITBI na capital (2026)', 'Pessoa física, uso residencial, primeira aquisição ou MCMV, valor de até R$ 245.527,77. Quem confirma é o cartório.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F12', 12, 'ITBI com financiamento pelo SFH (2026)', 'Imóvel de até R$ 725.808: 0,5% sobre a parte financiada até R$ 120.968 e 3% sobre o restante.', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M09-F13', 13, 'Parcela de obra x financiamento', 'Contas diferentes, em momentos diferentes. Nunca venda a série de obra como "a parcela do apê".', true
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1 quinzenal, peça ao corretor para abrir dois clientes em análise ou agendados e refazer na sua frente a conta da entrada, com o cenário de laudo quando for F3 ou F4. Na reunião de segunda, leia com o time as perdas por \"Achou caro / parcela não cabe\" e por crédito da semana e escolha uma para refazer a conta em grupo. Na revisão da pasta, só libere para o correspondente quando o fluxo enviado ao cliente separar obra e financiamento.","sinais_de_dificuldade":["Clientes em Análise de crédito ou Agendado com Entrada disponível e Usa FGTS vazios no Dossiê.","Perdas por \"Achou caro / parcela não cabe\" descobertas depois da visita ou da análise, e não na primeira conversa.","Fluxos enviados ao cliente sem separar a parcela de obra da parcela do financiamento, ou sem ITBI e cartório."],"perguntas_de_coaching":["Com o laudo 10% abaixo, esse cliente ainda fecha? Me mostra a conta.","Quando esse cliente completa os 3 anos de FGTS, e onde está esse marco na sua agenda?","Que parte do fluxo você mandou por escrito, e o cliente sabe qual é a parcela de obra e qual é a do banco?"],"ritual_de_celebracao":"All Hands quinzenal: destaque para quem levou pasta completa ao correspondente sem pendência de entrada; no LEGADO mensal, a evolução entra em \"Disciplina de Processo\"."},"pratica_gabarito":["Perfil A: entrada de R$ 52.000 (20% de R$ 260.000; R$ 208.000 financiados). Caixa de R$ 20.000 (R$ 5.000 guardados mais R$ 15.000 de FGTS, que ele pode usar: 4 anos). Faltam R$ 32.000; em 36 meses, esforço de R$ 888,89 por mês, 19,8% da renda: apresentável. Mostrar que, somado ao aluguel de R$ 1.200, o casal paga R$ 2.088,89 por mês durante a obra (46,4% da renda): dizer isso com verdade e conferir o modelo do empreendimento com o correspondente. ITBI estimado de R$ 4.775,80 (R$ 260.000 passa do limite da isenção de R$ 245.527,77). Subsídio possível na F2, só como melhora, pelo simulador. Próximo passo: visita com os dois, em duas opções de horário.","Perfil B: laudo cheio pede R$ 60.000; 10% abaixo, R$ 84.000; 20% abaixo, R$ 108.000. Hoje, sem o FGTS (2 anos e 10 meses), o esforço em 30 meses é de R$ 1.900 (25,3%), R$ 2.700 (36,0%) e R$ 3.500 (46,7%). Com o FGTS de R$ 12.000 depois do marco dos 3 anos, premissa de treino de que ele abate a entrada: R$ 1.500 (20,0%), R$ 2.300 (30,7%) e R$ 3.100 (41,3%). Leitura: só é apresentável com laudo cheio e FGTS, o que é aposta. Próximo passo: agendar a data dos 3 anos (em cerca de 2 meses), mostrar um produto mais barato que feche com laudo 10% abaixo e confirmar com o correspondente quando o FGTS entra no fluxo. Sem subsídio (F3).","Perfil C: laudo cheio pede R$ 96.000; 10% abaixo, R$ 134.400; 20% abaixo, R$ 172.800. Com R$ 60.000 guardados, o esforço em 30 meses é de R$ 1.200 (10,0%), R$ 2.480 (20,7%) e R$ 3.760 (31,3%, plano B). Composição: a folga até R$ 13.000 é de R$ 1.000; somar a renda da mãe pode tirar o casal do programa e levar ao SBPE, então não sugerir sem calcular. ITBI estimado com laudo 20% abaixo (R$ 307.200 financiados): R$ 11.375,80, contra R$ 14.400 sem o benefício. Sem subsídio (F4). Próximo passo: apresentar os três cenários, recomendar produto que feche com laudo 10% abaixo e levar a simulação ao correspondente."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M09' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
