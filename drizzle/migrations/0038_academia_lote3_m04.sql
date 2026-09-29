-- ===========================================================================
-- ACADEMIA SMQ · LOTE 3 (v1.0) · seed do módulo M04
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
  ('M04', 4, 1, 'Fundamentos do MCMV: o programa na língua do cliente', 'Ao final, você explica o Minha Casa Minha Vida em linguagem de cliente e enquadra a faixa pela renda em menos de um minuto, sem prometer subsídio, taxa ou aprovação, e isso aparece no CRM como Faixa MCMV preenchida no Dossiê e nenhum cliente perdido por "Renda acima do teto MCMV" sem a rota para Pró-Cotista ou SBPE oferecida.',
   '["Eu sou capaz de explicar o Minha Casa Minha Vida em 30 segundos, em linguagem de cliente, sem jargão de banco e sem promessa.","Eu sou capaz de enquadrar a faixa (F1 a F4) pela renda familiar, inclusive nas fronteiras de centavo, pela tabela vigente com a data.","Eu sou capaz de dizer o que conta e o que não conta como renda, e de calcular a folga antes de sugerir composição na F4.","Eu sou capaz de falar de subsídio, taxa e parcela só como estimativa, depois de saber a renda, com as frases permitidas.","Eu sou capaz de rotear para Pró-Cotista ou SBPE quem ganha acima de R$ 13 mil, registrando a rota antes de qualquer perda."]'::jsonb, 0.9, '55 min', true,
   '**Laboratório de enquadramento (individual, cronometrado, com gabarito)** · 30 min

**Papéis:** O corretor recebe os 10 cartões de perfil e tem 10 minutos para enquadrar todos; o gerente cronometra e corrige com o gabarito. Depois, o gerente faz o papel de um dos clientes e o corretor explica o enquadramento em até 60 segundos, em linguagem de cliente.

**Persona:** Perfis de treino montados a partir das personas P1, P2, P3, P4, P8 e P11 e das fronteiras da tabela vigente (valores de treino)

**Roteiro:** Para cada cartão, o corretor escreve: a faixa (ou a rota fora do MCMV), se há subsídio possível, a parcela estimada máxima (cerca de 30% da renda) e o cuidado que precisa tomar antes de dar a notícia. Depois, explica um dos casos ao gerente como se fosse ao cliente, sem jargão e sem promessa.

**Roteiro do cliente:**

- Cartão 1: entregador de aplicativo, 4 meses seguidos na mesma plataforma, renda de cerca de R$ 2.800, sem MEI.
- Cartão 2: "minha renda é de R$ 3.000", sem dizer se é bruto ou líquido nem se compra sozinho.
- Cartão 3: casal com renda somada de R$ 4.500, aluguel de R$ 1.200, primeiro imóvel.
- Cartão 4: renda familiar de R$ 5.000,00.
- Cartão 5: renda familiar de R$ 5.000,01.
- Cartão 6: solteira CLT com renda de R$ 7.500 e FGTS de 2 anos e 10 meses.
- Cartão 7: renda familiar de R$ 9.600,01.
- Cartão 8: casal com renda de R$ 12.000 que quer somar R$ 2.500 da mãe.
- Cartão 9: renda familiar de R$ 14.000.
- Cartão 10: "entram R$ 3.800 por mês", sendo R$ 600 de Bolsa Família.

**O que o observador procura:**

- Faixa certa nas fronteiras de centavo (R$ 5.000,00 e R$ 5.000,01; R$ 9.600,01).
- Subsídio citado só para F1 e F2, e sempre como "a Caixa define na análise".
- Parcela dita como estimativa ("em torno de"), nunca como valor exato.
- Renda que não conta retirada da conta (Bolsa Família) e renda de aplicativo tratada como notícia boa, com confirmação do correspondente.
- Folga calculada antes de sugerir composição na F4.
- Rota Pró-Cotista ou SBPE oferecida acima de R$ 13.000, nunca perda direta.
- Explicação final em linguagem de cliente, em até 60 segundos, sem promessa (critério 6 só com nota 5).

**Rubrica:** Padrão SMQ, critérios 2 (qualificação), 3 (condução) e 6 (verdade e conformidade). Aprovação: média 3,5 ou mais.', '[{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 3 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Teto exato de F1 e F2 na capital no simulador (até R$ 275 mil nas maiores cidades). | [CONFIRMAR] Tabela de taxa por sub-faixa na capital e redutor vigente para quem tem 3 anos ou mais de FGTS. | [CONFIRMAR] Lista final de documentos da renda de aplicativo com o correspondente. | [CONFIRMAR] Limite de participantes e regra de idade na composição de renda com o correspondente. | [CONFIRMAR] Tela exata do relatório de perdas por motivo na Operação. | [GAP DE CRM] A perda por "Renda acima do teto MCMV" não registra se a rota Pró-Cotista ou SBPE foi oferecida; hoje isso fica nas observações. Proposta: campo "rota oferecida" no desfecho de perda. | [GAP DE CRM] A "Ficha MCMV vigente" (tabela única com data e responsável pela revisão) não tem lugar no CRM. Proposta: publicá-la em Documentação & Projetos, revisada pelo gerente a cada mudança de portaria. | [DADO A MEDIR NO CRM] Linha de base das perdas por "Renda acima do teto MCMV" e das fichas com a Faixa MCMV preenchida. | [CONFIRMAR na publicação] Reconferir as faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) e o radar regulatório antes de liberar o módulo; se a proposta da F4 for aprovada, atualizar as aulas A2 e A5 e as questões M04-Q04, M04-Q05, M04-Q12 e M04-Q17.', '{"formato":"canonico-8.2","lote":3,"versao_conteudo":"1.0","trilha":"T1","ordem":4,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"Faixa se descobre pela renda, regra se ensina com data e ninguém promete o que só a Caixa decide.","duracao_min":55,"por_que_vale_dinheiro":{"texto":"Quase todo cliente da casa está em duas faixas, e a renda mediana é de R$ 5.000, bem na fronteira entre F2 e F3. Quem enquadra errado perde o cliente duas vezes: quando promete o que a análise desmente e quando descarta quem tinha caminho.","numero":"F2 e F3 somam 70,9% das 247 simulações (F1 21,9%, F2 34,0%, F3 36,8%, F4 7,3%); renda familiar mediana de R$ 5.000","fonte":"Simulações da SMQ (super prompt, seção 9.1)","periodo":"jul a set/2026"},"pre_requisitos":["M00","M25"],"indicador_crm":{"nome":"Perdas por \"Renda acima do teto MCMV\" sem rota oferecida para Pró-Cotista ou SBPE; fichas com a Faixa MCMV preenchida","onde_ler":"Relatório de perdas por motivo na Operação [CONFIRMAR a tela exata]; Dossiê do cliente › aba Dados › Faixa MCMV; para o corretor, a própria carteira filtrada por perdidos","linha_de_base":"[DADO A MEDIR NO CRM]","meta_sugerida":"Zero perdas por \"Renda acima do teto MCMV\" sem rota anotada; Faixa MCMV preenchida em todo cliente qualificado","fonte":"Briefing do M04 (super prompt, seção 10.2) e motivos de perda do CRM (set/2026)","gap_de_crm":true},"pratica":{"tipo":"Laboratório de enquadramento (individual, cronometrado, com gabarito)","duracao_min":30,"papeis":"O corretor recebe os 10 cartões de perfil e tem 10 minutos para enquadrar todos; o gerente cronometra e corrige com o gabarito. Depois, o gerente faz o papel de um dos clientes e o corretor explica o enquadramento em até 60 segundos, em linguagem de cliente.","persona":"Perfis de treino montados a partir das personas P1, P2, P3, P4, P8 e P11 e das fronteiras da tabela vigente (valores de treino)","roteiro":"Para cada cartão, o corretor escreve: a faixa (ou a rota fora do MCMV), se há subsídio possível, a parcela estimada máxima (cerca de 30% da renda) e o cuidado que precisa tomar antes de dar a notícia. Depois, explica um dos casos ao gerente como se fosse ao cliente, sem jargão e sem promessa.","roteiro_cliente":["Cartão 1: entregador de aplicativo, 4 meses seguidos na mesma plataforma, renda de cerca de R$ 2.800, sem MEI.","Cartão 2: \"minha renda é de R$ 3.000\", sem dizer se é bruto ou líquido nem se compra sozinho.","Cartão 3: casal com renda somada de R$ 4.500, aluguel de R$ 1.200, primeiro imóvel.","Cartão 4: renda familiar de R$ 5.000,00.","Cartão 5: renda familiar de R$ 5.000,01.","Cartão 6: solteira CLT com renda de R$ 7.500 e FGTS de 2 anos e 10 meses.","Cartão 7: renda familiar de R$ 9.600,01.","Cartão 8: casal com renda de R$ 12.000 que quer somar R$ 2.500 da mãe.","Cartão 9: renda familiar de R$ 14.000.","Cartão 10: \"entram R$ 3.800 por mês\", sendo R$ 600 de Bolsa Família."],"observador_procura":["Faixa certa nas fronteiras de centavo (R$ 5.000,00 e R$ 5.000,01; R$ 9.600,01).","Subsídio citado só para F1 e F2, e sempre como \"a Caixa define na análise\".","Parcela dita como estimativa (\"em torno de\"), nunca como valor exato.","Renda que não conta retirada da conta (Bolsa Família) e renda de aplicativo tratada como notícia boa, com confirmação do correspondente.","Folga calculada antes de sugerir composição na F4.","Rota Pró-Cotista ou SBPE oferecida acima de R$ 13.000, nunca perda direta.","Explicação final em linguagem de cliente, em até 60 segundos, sem promessa (critério 6 só com nota 5)."],"rubrica":"Padrão SMQ, critérios 2 (qualificação), 3 (condução) e 6 (verdade e conformidade)","nota_minima":3.5},"desafio_campo":{"tarefa":"Revise a Faixa MCMV de 10 clientes da sua carteira: confira a renda informada, o tipo de renda e a composição, corrija a faixa pela tabela vigente desde 22/04/2026 e registre o próximo passo com data. Quem estiver acima de R$ 13.000 recebe a rota Pró-Cotista ou SBPE, anotada nas observações, nunca uma perda direta.","prazo_horas":48,"evidencia_no_crm":"10 Dossiês com Renda informada, Tipo de renda e Faixa MCMV preenchidos e desfecho com próximo passo e data registrados no período; nenhum perdido por \"Renda acima do teto MCMV\" sem a rota nas observações","como_o_gestor_confere":"O gerente sorteia 3 dos 10 clientes na carteira do corretor e confere se a faixa bate com a renda informada pela tabela vigente e se o próximo passo tem data. Depois, confere se houve perda por \"Renda acima do teto MCMV\" no período e se a observação traz a rota oferecida."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do CRM e a tabela de faixas vigente","cenario":"Escritório da SMQ, com o Dossiê de um cliente de treino aberto e a tabela de faixas na tela","blocos":[{"tempo":"0:00","fala":"R$ 5.000 é Faixa 2. R$ 5.000 e um centavo é Faixa 3. Um centavo muda a taxa, o teto e acaba com o subsídio.","na_tela":"Os dois valores lado a lado, com a faixa de cada um"},{"tempo":"0:20","fala":"Quase todo cliente da casa está na F2 ou na F3: sete de cada dez simulações. E a renda do meio fica bem em R$ 5 mil, em cima da fronteira.","na_tela":"Simulações por faixa, jul a set/2026"},{"tempo":"0:50","fala":"A regra é simples: a faixa vem da renda de quem vai comprar. Primeiro a renda, depois a faixa, depois o apartamento.","na_tela":"A tabela de faixas vigente desde 22/04/2026"},{"tempo":"1:40","fala":"Olha no Dossiê: renda informada, tipo de renda e faixa. Bolsa Família não entra na conta. Renda de aplicativo agora entra.","na_tela":"Dossiê › aba Dados, com os campos destacados"},{"tempo":"2:40","fala":"Subsídio só existe na F1 e na F2, e quem define o valor é a Caixa. Nunca diga que o governo vai dar R$ 55 mil. Diga que você mostra o número antes de qualquer assinatura.","na_tela":"Frases permitidas e proibidas"},{"tempo":"3:30","fala":"O erro que mais custa: marcar perdido quem ganha mais de R$ 13 mil. Esse cliente tem outra porta, Pró-Cotista ou SBPE.","na_tela":"Motivo de perda \"Renda acima do teto MCMV\" com a rota nas observações"},{"tempo":"4:15","fala":"Desafio: revise a faixa de 10 clientes da sua carteira em 48 horas, com próximo passo e data.","na_tela":"O desafio de campo do módulo"},{"tempo":"4:40","fala":"Guarda essa: simulação indica, análise formal aprova.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 4, 9.1, 9.9, 9.12, 9.13, 9.14 e 9.16 do super prompt","Estudo da Academia v2.1, seções 2, 3.1, 3.2, 3.3, 3.8, 3.9 e 6 (fases A, C e D)","Regras técnicas conferidas em fonte oficial em 29/09/2026 (Portaria MCID nº 333/2026)","Conteúdo anterior do M04 (Academia no Notion, abr/2026): o que não entra na renda, composição de renda e a regra dos 30%, com as faixas atualizadas","Campos do Dossiê e motivos de perda conferidos no repositório do CRM em 29/09/2026"],"origem":"SMQ","pendencias":["[CONFIRMAR] Teto exato de F1 e F2 na capital no simulador (até R$ 275 mil nas maiores cidades).","[CONFIRMAR] Tabela de taxa por sub-faixa na capital e redutor vigente para quem tem 3 anos ou mais de FGTS.","[CONFIRMAR] Lista final de documentos da renda de aplicativo com o correspondente.","[CONFIRMAR] Limite de participantes e regra de idade na composição de renda com o correspondente.","[CONFIRMAR] Tela exata do relatório de perdas por motivo na Operação.","[GAP DE CRM] A perda por \"Renda acima do teto MCMV\" não registra se a rota Pró-Cotista ou SBPE foi oferecida; hoje isso fica nas observações. Proposta: campo \"rota oferecida\" no desfecho de perda.","[GAP DE CRM] A \"Ficha MCMV vigente\" (tabela única com data e responsável pela revisão) não tem lugar no CRM. Proposta: publicá-la em Documentação & Projetos, revisada pelo gerente a cada mudança de portaria.","[DADO A MEDIR NO CRM] Linha de base das perdas por \"Renda acima do teto MCMV\" e das fichas com a Faixa MCMV preenchida.","[CONFIRMAR na publicação] Reconferir as faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) e o radar regulatório antes de liberar o módulo; se a proposta da F4 for aprovada, atualizar as aulas A2 e A5 e as questões M04-Q04, M04-Q05, M04-Q12 e M04-Q17."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M04-A1', 'M04-A2', 'M04-A3', 'M04-A4', 'M04-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M04-Q01', 'M04-Q02', 'M04-Q03', 'M04-Q04', 'M04-Q05', 'M04-Q06', 'M04-Q07', 'M04-Q08', 'M04-Q09', 'M04-Q10', 'M04-Q11', 'M04-Q12', 'M04-Q13', 'M04-Q14', 'M04-Q15', 'M04-Q16', 'M04-Q17', 'M04-Q18', 'M04-Q19', 'M04-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M04-F01', 'M04-F02', 'M04-F03', 'M04-F04', 'M04-F05', 'M04-F06', 'M04-F07', 'M04-F08', 'M04-F09', 'M04-F10', 'M04-F11', 'M04-F12', 'M04-F13');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 13;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M04-A1', 1, 'O Minha Casa Minha Vida em 30 segundos, na língua do cliente', 'texto',
  'O cliente pergunta: "É Minha Casa Minha Vida?". O corretor responde com juros nominais, renda bruta e cota de financiamento. O cliente agradece e some. Ele não queria uma aula de banco. Queria saber se aquilo é pra ele.

### Por que importa

Quase todo cliente da casa está em duas faixas: F2 e F3 somam 70,9% das 247 simulações de jul a set/2026, com renda familiar mediana de R$ 5.000. Quem explica o programa em linguagem de banco perde esse cliente na primeira frase; quem explica em linguagem de cliente ganha o direito de fazer a próxima pergunta.

### O conceito

O MCMV é como uma escada com quatro degraus. Cada degrau é uma faixa de renda, e cada degrau tem um teto de imóvel e uma taxa. Quem define o degrau não é o corretor nem o cliente: é a renda de quem vai comprar. O seu trabalho é descobrir o degrau certo antes de mostrar qualquer apartamento.

### O método SMQ, passo a passo

1. Diga o que o programa é, em uma frase: um programa do governo federal que ajuda a família a comprar o primeiro imóvel para morar, com juros menores e, nas faixas de renda mais baixas, um desconto chamado subsídio.
2. Diga o que decide a condição: a faixa, e a faixa depende da renda de quem vai comprar. Não fale de taxa nem de parcela antes disso.
3. Faça a pergunta da renda com âncora e em linguagem de cliente: "Vocês ganham juntos, mais ou menos, quanto por mês?" (a espinha completa está no M16).
4. Confirme a finalidade: o programa é para morar. Se o cliente quer investir, o caminho é outro produto, sem tese de valorização.
5. Feche com o próximo passo do método: simulação estimada, visita ou análise gratuita com documento (os 2 caminhos, M15).

### Na vida real

**O caso:** Leads que declaravam investimento puro chegavam ao corretor como se fossem clientes MCMV (aprendizado do robô, 13/07/2026).

**O que foi dito:** O lead avisava que queria comprar para alugar, e a conversa seguia como se fosse compra para morar, com faixa, subsídio e parcela.

**O que aconteceu:** Os handoffs foram improdutivos. A regra que ficou: MCMV é para morar; investidor é requalificado e vai para outro produto (R2V, nR ou SBPE), sem promessa de valorização.

### Scripts prontos

#### WhatsApp · O cliente pergunta "É Minha Casa Minha Vida?"

> É sim! O que muda de um cliente pro outro é a faixa, e ela depende da renda de quem vai comprar. Vocês ganham juntos, mais ou menos, quanto por mês?

**Por que funciona:** Responde a pergunta na hora, explica por que a renda importa e devolve com uma pergunta só, em linguagem de cliente.

#### Ligação · O cliente pede para você explicar o programa

> Em uma frase: é o programa do governo que ajuda a família a comprar o primeiro imóvel pra morar, com juros menores. Quem ganha menos ainda pode ter um desconto no preço, que a Caixa calcula na análise. Pra eu te dizer em qual faixa vocês ficam, me conta: é pra vocês morarem?

**Por que funciona:** Explica sem jargão, não promete subsídio e já confirma a finalidade, que é a primeira trava do programa.

#### WhatsApp · O lead diz que quer comprar para alugar

> Boa, obrigado por me contar! O Minha Casa Minha Vida é só pra quem vai morar no imóvel. Pra investir tem outros produtos, e eu te mostro com os números reais. Você pensa em estúdio ou em apartamento de 2 dormitórios?

**Por que funciona:** Diz a verdade sobre a regra, não perde o lead e muda de produto com uma pergunta de escolha.

### Erros que matam a venda

- **Explicar o programa com "renda bruta", "amortização" e "cota de financiamento"**  
  Quanto custa: O cliente não entende, acha que não é pra ele e para de responder  
  Correção: Uma frase em linguagem de cliente e a pergunta da renda: "vocês ganham juntos, mais ou menos, quanto por mês?"
- **Tratar investidor como cliente MCMV**  
  Quanto custa: Handoff improdutivo: o programa é para moradia própria  
  Correção: Confirmar a finalidade e mudar de produto, sem tese de valorização
- **Abrir pela taxa ou pela parcela antes de saber a renda**  
  Quanto custa: Número errado na primeira conversa vira desconfiança na análise  
  Correção: Faixa primeiro, e ela vem da renda

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Registrar a renda que o cliente informou e o tipo de renda assim que ele responder
- **Campo:** Renda informada, Tipo de renda e Faixa MCMV
- **Regra:** Faixa MCMV só se preenche depois da renda; investidor tem a finalidade anotada nas observações

### Frase-âncora

> **Quem define o degrau é a renda. O seu trabalho é descobrir o degrau antes de mostrar o apartamento.**

### Checagem rápida

1. O que decide a condição do cliente no MCMV?  
   Resposta: A faixa, que depende da renda familiar de quem vai comprar.
2. O que fazer quando o lead diz que quer comprar um MCMV para alugar?  
   Resposta: Explicar que o programa é para morar e oferecer outro produto de investimento, sem promessa de valorização.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente pergunta: \"É Minha Casa Minha Vida?\". O corretor responde com juros nominais, renda bruta e cota de financiamento. O cliente agradece e some. Ele não queria uma aula de banco. Queria saber se aquilo é pra ele.","por_que_importa":"Quase todo cliente da casa está em duas faixas: F2 e F3 somam 70,9% das 247 simulações de jul a set/2026, com renda familiar mediana de R$ 5.000. Quem explica o programa em linguagem de banco perde esse cliente na primeira frase; quem explica em linguagem de cliente ganha o direito de fazer a próxima pergunta.","conceito":"O MCMV é como uma escada com quatro degraus. Cada degrau é uma faixa de renda, e cada degrau tem um teto de imóvel e uma taxa. Quem define o degrau não é o corretor nem o cliente: é a renda de quem vai comprar. O seu trabalho é descobrir o degrau certo antes de mostrar qualquer apartamento.","metodo":["Diga o que o programa é, em uma frase: um programa do governo federal que ajuda a família a comprar o primeiro imóvel para morar, com juros menores e, nas faixas de renda mais baixas, um desconto chamado subsídio.","Diga o que decide a condição: a faixa, e a faixa depende da renda de quem vai comprar. Não fale de taxa nem de parcela antes disso.","Faça a pergunta da renda com âncora e em linguagem de cliente: \"Vocês ganham juntos, mais ou menos, quanto por mês?\" (a espinha completa está no M16).","Confirme a finalidade: o programa é para morar. Se o cliente quer investir, o caminho é outro produto, sem tese de valorização.","Feche com o próximo passo do método: simulação estimada, visita ou análise gratuita com documento (os 2 caminhos, M15)."],"na_vida_real":{"caso":"Leads que declaravam investimento puro chegavam ao corretor como se fossem clientes MCMV (aprendizado do robô, 13/07/2026).","o_que_foi_dito":"O lead avisava que queria comprar para alugar, e a conversa seguia como se fosse compra para morar, com faixa, subsídio e parcela.","resultado":"Os handoffs foram improdutivos. A regra que ficou: MCMV é para morar; investidor é requalificado e vai para outro produto (R2V, nR ou SBPE), sem promessa de valorização.","fonte":"Regras de crédito conferidas (super prompt, seção 9.9) e aprendizados medidos do robô"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente pergunta \"É Minha Casa Minha Vida?\"","texto":"É sim! O que muda de um cliente pro outro é a faixa, e ela depende da renda de quem vai comprar. Vocês ganham juntos, mais ou menos, quanto por mês?","por_que_funciona":"Responde a pergunta na hora, explica por que a renda importa e devolve com uma pergunta só, em linguagem de cliente."},{"canal":"Ligação","situacao":"O cliente pede para você explicar o programa","texto":"Em uma frase: é o programa do governo que ajuda a família a comprar o primeiro imóvel pra morar, com juros menores. Quem ganha menos ainda pode ter um desconto no preço, que a Caixa calcula na análise. Pra eu te dizer em qual faixa vocês ficam, me conta: é pra vocês morarem?","por_que_funciona":"Explica sem jargão, não promete subsídio e já confirma a finalidade, que é a primeira trava do programa."},{"canal":"WhatsApp","situacao":"O lead diz que quer comprar para alugar","texto":"Boa, obrigado por me contar! O Minha Casa Minha Vida é só pra quem vai morar no imóvel. Pra investir tem outros produtos, e eu te mostro com os números reais. Você pensa em estúdio ou em apartamento de 2 dormitórios?","por_que_funciona":"Diz a verdade sobre a regra, não perde o lead e muda de produto com uma pergunta de escolha."}],"erros_que_matam":[{"erro":"Explicar o programa com \"renda bruta\", \"amortização\" e \"cota de financiamento\"","custo":"O cliente não entende, acha que não é pra ele e para de responder","correcao":"Uma frase em linguagem de cliente e a pergunta da renda: \"vocês ganham juntos, mais ou menos, quanto por mês?\""},{"erro":"Tratar investidor como cliente MCMV","custo":"Handoff improdutivo: o programa é para moradia própria","correcao":"Confirmar a finalidade e mudar de produto, sem tese de valorização"},{"erro":"Abrir pela taxa ou pela parcela antes de saber a renda","custo":"Número errado na primeira conversa vira desconfiança na análise","correcao":"Faixa primeiro, e ela vem da renda"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Registrar a renda que o cliente informou e o tipo de renda assim que ele responder","campo":"Renda informada, Tipo de renda e Faixa MCMV","regra":"Faixa MCMV só se preenche depois da renda; investidor tem a finalidade anotada nas observações"},"frase_ancora":"Quem define o degrau é a renda. O seu trabalho é descobrir o degrau antes de mostrar o apartamento.","checagem_rapida":[{"pergunta":"O que decide a condição do cliente no MCMV?","resposta":"A faixa, que depende da renda familiar de quem vai comprar."},{"pergunta":"O que fazer quando o lead diz que quer comprar um MCMV para alugar?","resposta":"Explicar que o programa é para morar e oferecer outro produto de investimento, sem promessa de valorização."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M04-A2', 2, 'As 4 faixas vigentes: a tabela que você carrega no bolso', 'texto',
  'R$ 5.000,00 é F2. R$ 5.000,01 é F3. Um centavo muda a taxa, o teto do imóvel e acaba com o subsídio. Quem enquadra "de cabeça", com a tabela antiga, promete o que a Caixa não vai entregar.

### Por que importa

O material antigo da casa ainda trazia as faixas de antes, com F1 até R$ 2.850 e F2 até R$ 4.700, e o aviso de "aguardando publicação". Desde 22/04/2026 vale outra tabela. Usar dado desatualizado com o cliente é falta grave: vira promessa quebrada na análise e cliente perdido.

### O conceito

A tabela de faixas é como a tabela de preço do empreendimento: tem data de vigência. Você não mostra ao cliente a tabela do mês passado, e também não ensina a faixa do ano passado. Toda vez que a regra muda, a tabela do seu bolso muda no mesmo dia.

### O método SMQ, passo a passo

1. Saiba a tabela vigente desde 22/04/2026 (Portaria MCID nº 333/2026), confirmar na tabela oficial antes de usar com cliente: F1, renda familiar bruta até R$ 3.200; F2, de R$ 3.200,01 a R$ 5.000; F3, de R$ 5.000,01 a R$ 9.600; F4, de R$ 9.600,01 a R$ 13.000.
2. Saiba o teto do imóvel de cada faixa: F1 e F2, de R$ 210 mil a R$ 275 mil conforme o município (a capital está no grupo mais alto, até R$ 275 mil, e o valor exato se confirma no simulador); F3, R$ 400 mil; F4, R$ 600 mil.
3. Saiba quem tem subsídio: só F1 e F2. F3 e F4 não têm.
4. Saiba de onde vem a taxa: as faixas de juros da portaria são nacionais (F1 de 4,00% a 5,25% ao ano; F2 de 4,75% a 7,00%; F3 de 7,66% a 8,16%; F4 em torno de 10% a 10,5%). A taxa do cliente sai no simulador oficial e se confirma na análise.
5. Confira o teto antes de apresentar: se o preço da unidade passa do teto da faixa do cliente, não é produto MCMV para ele; quem diz o enquadramento possível é o correspondente.
6. Separe regra de notícia: a proposta de ampliar a F4 para R$ 21 mil está em análise no governo e não estava aprovada até 29/09/2026. Com cliente, fale do que vale hoje.

### Na vida real

**O caso:** A "boa notícia" dada cedo demais para renda perto do piso da F1 (aprendizado de 27/07/2026).

**O que foi dito:** Clientes que declaravam renda de até R$ 3.000 ouviam logo que estavam enquadrados, sem a confirmação de que o valor era bruto ou líquido e se havia mais alguém na compra.

**O que aconteceu:** A boa notícia precoce virou desqualificação tardia, na análise. A regra da casa: com renda declarada de até R$ 3.000, confirme bruto ou líquido e composição antes de enquadrar.

### Scripts prontos

#### WhatsApp · O cliente informa a renda e pergunta a faixa

> Com R$ 4.500 somando vocês dois, pela tabela de hoje vocês parecem se encaixar na Faixa 2. A confirmação vem na análise da Caixa, que é gratuita. Esse valor é o que cai na conta ou é o do holerite, antes dos descontos?

**Por que funciona:** Usa a frase permitida ("parecem se encaixar, vamos confirmar"), não promete nada e confere bruto ou líquido com uma pergunta só.

#### Ligação · O cliente leu na internet que a F4 vai até R$ 21 mil

> Você está bem informado! Isso é uma proposta que o governo está estudando, mas ainda não foi aprovada. Eu trabalho com a regra que vale hoje, que é o que a Caixa usa na análise. Se mudar, eu te aviso no mesmo dia. Hoje, a renda de vocês fica em quanto?

**Por que funciona:** Valoriza o cliente, separa notícia de regra, cria um motivo de contato futuro e volta para a qualificação.

#### WhatsApp · O cliente de F3 gostou de uma unidade acima do teto da faixa

> Entendi por que você gostou dessa! Pela sua renda, o teto do programa é de R$ 400 mil, e essa unidade passa disso. Separei duas opções dentro do teto, na mesma região. Te mando a primeira agora?

**Por que funciona:** Não deixa o cliente se apaixonar pelo que não cabe, explica a regra sem sermão e oferece a saída com uma pergunta de sim.

### Erros que matam a venda

- **Enquadrar com a tabela antiga (F1 até R$ 2.850, F2 até R$ 4.700)**  
  Quanto custa: Faixa errada, taxa errada e subsídio prometido para quem não tem  
  Correção: Usar só a tabela vigente desde 22/04/2026, com a data na mão
- **Ensinar a proposta da F4 de R$ 21 mil como se já valesse**  
  Quanto custa: O cliente se planeja em cima de uma regra que não existe e a análise desmente  
  Correção: Falar do que vale hoje e avisar se mudar
- **Apresentar unidade acima do teto da faixa do cliente**  
  Quanto custa: Visita perdida e cliente frustrado com o que não pode comprar  
  Correção: Conferir o teto antes de mostrar; na dúvida, o correspondente diz o enquadramento possível

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Preencher a faixa pela tabela vigente depois de confirmar renda bruta e composição
- **Campo:** Faixa MCMV
- **Regra:** Faixa preenchida é faixa conferida: renda até R$ 3.000 só se enquadra depois de confirmar bruto ou líquido e composição

### Frase-âncora

> **Faixa tem data de vigência. Tabela velha no bolso é promessa quebrada na análise.**

### Checagem rápida

1. Renda familiar de R$ 5.000,01: qual a faixa e tem subsídio?  
   Resposta: F3, e não tem subsídio.
2. Qual o teto do imóvel na F4?  
   Resposta: R$ 600 mil (tabela vigente desde 22/04/2026).
3. A F4 de até R$ 21 mil já vale?  
   Resposta: Não. Era proposta em análise, sem aprovação até 29/09/2026.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"R$ 5.000,00 é F2. R$ 5.000,01 é F3. Um centavo muda a taxa, o teto do imóvel e acaba com o subsídio. Quem enquadra \"de cabeça\", com a tabela antiga, promete o que a Caixa não vai entregar.","por_que_importa":"O material antigo da casa ainda trazia as faixas de antes, com F1 até R$ 2.850 e F2 até R$ 4.700, e o aviso de \"aguardando publicação\". Desde 22/04/2026 vale outra tabela. Usar dado desatualizado com o cliente é falta grave: vira promessa quebrada na análise e cliente perdido.","conceito":"A tabela de faixas é como a tabela de preço do empreendimento: tem data de vigência. Você não mostra ao cliente a tabela do mês passado, e também não ensina a faixa do ano passado. Toda vez que a regra muda, a tabela do seu bolso muda no mesmo dia.","metodo":["Saiba a tabela vigente desde 22/04/2026 (Portaria MCID nº 333/2026), confirmar na tabela oficial antes de usar com cliente: F1, renda familiar bruta até R$ 3.200; F2, de R$ 3.200,01 a R$ 5.000; F3, de R$ 5.000,01 a R$ 9.600; F4, de R$ 9.600,01 a R$ 13.000.","Saiba o teto do imóvel de cada faixa: F1 e F2, de R$ 210 mil a R$ 275 mil conforme o município (a capital está no grupo mais alto, até R$ 275 mil, e o valor exato se confirma no simulador); F3, R$ 400 mil; F4, R$ 600 mil.","Saiba quem tem subsídio: só F1 e F2. F3 e F4 não têm.","Saiba de onde vem a taxa: as faixas de juros da portaria são nacionais (F1 de 4,00% a 5,25% ao ano; F2 de 4,75% a 7,00%; F3 de 7,66% a 8,16%; F4 em torno de 10% a 10,5%). A taxa do cliente sai no simulador oficial e se confirma na análise.","Confira o teto antes de apresentar: se o preço da unidade passa do teto da faixa do cliente, não é produto MCMV para ele; quem diz o enquadramento possível é o correspondente.","Separe regra de notícia: a proposta de ampliar a F4 para R$ 21 mil está em análise no governo e não estava aprovada até 29/09/2026. Com cliente, fale do que vale hoje."],"na_vida_real":{"caso":"A \"boa notícia\" dada cedo demais para renda perto do piso da F1 (aprendizado de 27/07/2026).","o_que_foi_dito":"Clientes que declaravam renda de até R$ 3.000 ouviam logo que estavam enquadrados, sem a confirmação de que o valor era bruto ou líquido e se havia mais alguém na compra.","resultado":"A boa notícia precoce virou desqualificação tardia, na análise. A regra da casa: com renda declarada de até R$ 3.000, confirme bruto ou líquido e composição antes de enquadrar.","fonte":"Regras de crédito conferidas (super prompt, seção 9.9)"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente informa a renda e pergunta a faixa","texto":"Com R$ 4.500 somando vocês dois, pela tabela de hoje vocês parecem se encaixar na Faixa 2. A confirmação vem na análise da Caixa, que é gratuita. Esse valor é o que cai na conta ou é o do holerite, antes dos descontos?","por_que_funciona":"Usa a frase permitida (\"parecem se encaixar, vamos confirmar\"), não promete nada e confere bruto ou líquido com uma pergunta só."},{"canal":"Ligação","situacao":"O cliente leu na internet que a F4 vai até R$ 21 mil","texto":"Você está bem informado! Isso é uma proposta que o governo está estudando, mas ainda não foi aprovada. Eu trabalho com a regra que vale hoje, que é o que a Caixa usa na análise. Se mudar, eu te aviso no mesmo dia. Hoje, a renda de vocês fica em quanto?","por_que_funciona":"Valoriza o cliente, separa notícia de regra, cria um motivo de contato futuro e volta para a qualificação."},{"canal":"WhatsApp","situacao":"O cliente de F3 gostou de uma unidade acima do teto da faixa","texto":"Entendi por que você gostou dessa! Pela sua renda, o teto do programa é de R$ 400 mil, e essa unidade passa disso. Separei duas opções dentro do teto, na mesma região. Te mando a primeira agora?","por_que_funciona":"Não deixa o cliente se apaixonar pelo que não cabe, explica a regra sem sermão e oferece a saída com uma pergunta de sim."}],"erros_que_matam":[{"erro":"Enquadrar com a tabela antiga (F1 até R$ 2.850, F2 até R$ 4.700)","custo":"Faixa errada, taxa errada e subsídio prometido para quem não tem","correcao":"Usar só a tabela vigente desde 22/04/2026, com a data na mão"},{"erro":"Ensinar a proposta da F4 de R$ 21 mil como se já valesse","custo":"O cliente se planeja em cima de uma regra que não existe e a análise desmente","correcao":"Falar do que vale hoje e avisar se mudar"},{"erro":"Apresentar unidade acima do teto da faixa do cliente","custo":"Visita perdida e cliente frustrado com o que não pode comprar","correcao":"Conferir o teto antes de mostrar; na dúvida, o correspondente diz o enquadramento possível"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Preencher a faixa pela tabela vigente depois de confirmar renda bruta e composição","campo":"Faixa MCMV","regra":"Faixa preenchida é faixa conferida: renda até R$ 3.000 só se enquadra depois de confirmar bruto ou líquido e composição"},"frase_ancora":"Faixa tem data de vigência. Tabela velha no bolso é promessa quebrada na análise.","checagem_rapida":[{"pergunta":"Renda familiar de R$ 5.000,01: qual a faixa e tem subsídio?","resposta":"F3, e não tem subsídio."},{"pergunta":"Qual o teto do imóvel na F4?","resposta":"R$ 600 mil (tabela vigente desde 22/04/2026)."},{"pergunta":"A F4 de até R$ 21 mil já vale?","resposta":"Não. Era proposta em análise, sem aprovação até 29/09/2026."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M04-A3', 3, 'Renda: o que conta, o que não conta e quando juntar', 'texto',
  'Leads que já tinham desistido voltaram a responder quando ouviram uma frase: a renda de aplicativo passou a contar na análise. Uma notícia verdadeira sobre renda vale mais que dez mensagens de "ainda tem interesse?".

### Por que importa

A faixa só é tão boa quanto a renda que a sustenta. Renda que não se comprova some na análise, e a faixa cai junto. Renda que o corretor não sabia que contava faz ele descartar quem tinha caminho. As duas coisas custam venda.

### O conceito

Renda para a Caixa é como documento na portaria: só entra o que se comprova. O dinheiro que entra "em mãos" pode ser real no bolso do cliente, mas na análise ele não existe.

### O método SMQ, passo a passo

1. O que conta: salário com holerite, aposentadoria, renda de autônomo comprovada por extratos, declaração de imposto e DECORE quando pedido, e a de MEI pela média do faturamento (não pelo valor declarado).
2. A novidade: a Caixa passou a aceitar a renda de motorista e entregador de aplicativo (4 meses seguidos na mesma plataforma, resumo mensal de ganhos, vale o mês de menor valor). A lista final de documentos se confirma com o correspondente (detalhe no M07).
3. O que não conta: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS. O que entra em mãos, sem comprovação, também não. Nunca infle renda.
4. Compor renda: pode entrar quem vai estar no contrato (cônjuge, pais, filhos maiores, irmãos ou quem mora junto). O limite de participantes e a regra de idade na composição se confirmam com o correspondente.
5. Na F4, calcule a folga antes de sugerir composição: 13.000 menos a renda atual. Passou de R$ 13.000, o cliente sai do MCMV e cai no SBPE (M05 aprofunda as fronteiras).
6. Renda 100% informal sem comprovação não é descarte: oriente a formalização ou a composição.

### Na vida real

**O caso:** Caso L: a renda de aplicativo que reabriu a conversa (ago/2026).

**O que foi dito:** Para leads que tinham parado por não ter holerite: a renda de motorista e entregador de aplicativo passou a contar na análise, e a mensagem terminava com uma pergunta só: "você roda em qual aplicativo?".

**O que aconteceu:** Leads que já tinham desistido voltaram a conversar. A lição: novidade real é o melhor follow-up, sem cravar a data da regra.

### Scripts prontos

#### WhatsApp · O entregador pergunta se autônomo consegue

> Consegue sim, e tenho uma notícia boa: a renda de aplicativo passou a contar na análise da Caixa. O que vale é o resumo de ganhos que o próprio app gera. Você roda em qual aplicativo?

**Por que funciona:** Dá a notícia verdadeira sem cravar data, explica o que comprova e fecha com uma pergunta só.

#### Ligação · O cliente soma o Bolsa Família na renda

> Entendi, vocês têm R$ 3.800 entrando por mês. Só um cuidado pra eu não te dar um número errado: o Bolsa Família não entra na conta da Caixa. Tirando ele, ficam quantos reais de salário?

**Por que funciona:** Corrige com respeito, protege o cliente de uma faixa errada e pede o dado que falta.

#### WhatsApp · O cliente da F4 quer somar a renda da mãe

> Faz sentido querer somar! Só que aqui tem uma pegadinha: se a renda de vocês passar de R$ 13 mil, sai do Minha Casa Minha Vida e a taxa sobe. Antes de somar, deixa eu fazer a conta com você. A sua mãe vai morar junto?

**Por que funciona:** Avisa a armadilha antes do erro, não decide pelo cliente e faz a pergunta que muda a conta.

### Erros que matam a venda

- **Somar renda que não se comprova ("parte por fora", Bolsa Família, dinheiro em mãos)**  
  Quanto custa: A faixa cai na análise e a confiança vai junto  
  Correção: Só conta o que se comprova; o resto se resolve com formalização ou composição
- **Sugerir composição de renda na F4 sem calcular a folga**  
  Quanto custa: O cliente sai do programa e cai no SBPE, com juros de mercado  
  Correção: Calcular 13.000 menos a renda atual antes de sugerir
- **Descartar autônomo ou entregador de aplicativo**  
  Quanto custa: Perde o cliente que tinha caminho  
  Correção: Perguntar como ele comprova e dar a notícia certa, com confirmação do correspondente

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Registrar a renda comprovável, o tipo de renda e quem entra na composição
- **Campo:** Renda informada, Tipo de renda e Decisor
- **Regra:** Renda informada é a real e comprovável; composição anotada com quem entra no contrato

### Frase-âncora

> **Renda que não se comprova não entra na análise. E nunca entra na sua conta.**

### Checagem rápida

1. Cite três rendas que não contam no MCMV.  
   Resposta: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS (quaisquer três).
2. Cliente com R$ 12.000 quer somar R$ 2.500 da mãe. O que acontece?  
   Resposta: A soma dá R$ 14.500, passa do teto de R$ 13.000 da F4 e o cliente sai do MCMV. A folga era de só R$ 1.000.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Leads que já tinham desistido voltaram a responder quando ouviram uma frase: a renda de aplicativo passou a contar na análise. Uma notícia verdadeira sobre renda vale mais que dez mensagens de \"ainda tem interesse?\".","por_que_importa":"A faixa só é tão boa quanto a renda que a sustenta. Renda que não se comprova some na análise, e a faixa cai junto. Renda que o corretor não sabia que contava faz ele descartar quem tinha caminho. As duas coisas custam venda.","conceito":"Renda para a Caixa é como documento na portaria: só entra o que se comprova. O dinheiro que entra \"em mãos\" pode ser real no bolso do cliente, mas na análise ele não existe.","metodo":["O que conta: salário com holerite, aposentadoria, renda de autônomo comprovada por extratos, declaração de imposto e DECORE quando pedido, e a de MEI pela média do faturamento (não pelo valor declarado).","A novidade: a Caixa passou a aceitar a renda de motorista e entregador de aplicativo (4 meses seguidos na mesma plataforma, resumo mensal de ganhos, vale o mês de menor valor). A lista final de documentos se confirma com o correspondente (detalhe no M07).","O que não conta: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS. O que entra em mãos, sem comprovação, também não. Nunca infle renda.","Compor renda: pode entrar quem vai estar no contrato (cônjuge, pais, filhos maiores, irmãos ou quem mora junto). O limite de participantes e a regra de idade na composição se confirmam com o correspondente.","Na F4, calcule a folga antes de sugerir composição: 13.000 menos a renda atual. Passou de R$ 13.000, o cliente sai do MCMV e cai no SBPE (M05 aprofunda as fronteiras).","Renda 100% informal sem comprovação não é descarte: oriente a formalização ou a composição."],"na_vida_real":{"caso":"Caso L: a renda de aplicativo que reabriu a conversa (ago/2026).","o_que_foi_dito":"Para leads que tinham parado por não ter holerite: a renda de motorista e entregador de aplicativo passou a contar na análise, e a mensagem terminava com uma pergunta só: \"você roda em qual aplicativo?\".","resultado":"Leads que já tinham desistido voltaram a conversar. A lição: novidade real é o melhor follow-up, sem cravar a data da regra.","fonte":"Casoteca SMQ (super prompt, seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"O entregador pergunta se autônomo consegue","texto":"Consegue sim, e tenho uma notícia boa: a renda de aplicativo passou a contar na análise da Caixa. O que vale é o resumo de ganhos que o próprio app gera. Você roda em qual aplicativo?","por_que_funciona":"Dá a notícia verdadeira sem cravar data, explica o que comprova e fecha com uma pergunta só."},{"canal":"Ligação","situacao":"O cliente soma o Bolsa Família na renda","texto":"Entendi, vocês têm R$ 3.800 entrando por mês. Só um cuidado pra eu não te dar um número errado: o Bolsa Família não entra na conta da Caixa. Tirando ele, ficam quantos reais de salário?","por_que_funciona":"Corrige com respeito, protege o cliente de uma faixa errada e pede o dado que falta."},{"canal":"WhatsApp","situacao":"O cliente da F4 quer somar a renda da mãe","texto":"Faz sentido querer somar! Só que aqui tem uma pegadinha: se a renda de vocês passar de R$ 13 mil, sai do Minha Casa Minha Vida e a taxa sobe. Antes de somar, deixa eu fazer a conta com você. A sua mãe vai morar junto?","por_que_funciona":"Avisa a armadilha antes do erro, não decide pelo cliente e faz a pergunta que muda a conta."}],"erros_que_matam":[{"erro":"Somar renda que não se comprova (\"parte por fora\", Bolsa Família, dinheiro em mãos)","custo":"A faixa cai na análise e a confiança vai junto","correcao":"Só conta o que se comprova; o resto se resolve com formalização ou composição"},{"erro":"Sugerir composição de renda na F4 sem calcular a folga","custo":"O cliente sai do programa e cai no SBPE, com juros de mercado","correcao":"Calcular 13.000 menos a renda atual antes de sugerir"},{"erro":"Descartar autônomo ou entregador de aplicativo","custo":"Perde o cliente que tinha caminho","correcao":"Perguntar como ele comprova e dar a notícia certa, com confirmação do correspondente"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Registrar a renda comprovável, o tipo de renda e quem entra na composição","campo":"Renda informada, Tipo de renda e Decisor","regra":"Renda informada é a real e comprovável; composição anotada com quem entra no contrato"},"frase_ancora":"Renda que não se comprova não entra na análise. E nunca entra na sua conta.","checagem_rapida":[{"pergunta":"Cite três rendas que não contam no MCMV.","resposta":"Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS (quaisquer três)."},{"pergunta":"Cliente com R$ 12.000 quer somar R$ 2.500 da mãe. O que acontece?","resposta":"A soma dá R$ 14.500, passa do teto de R$ 13.000 da F4 e o cliente sai do MCMV. A folga era de só R$ 1.000."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M04-A4', 4, 'Subsídio, taxa e parcela: falar de dinheiro sem prometer', 'texto',
  '"O governo vai te dar R$ 55 mil." Essa frase fecha a conversa de hoje e abre o problema de amanhã: quando a análise sai com outro valor, quem mentiu foi você.

### Por que importa

O cliente MCMV tem dois medos: não aprovar e cair em golpe. Promessa de subsídio, taxa ou parcela exata alimenta os dois. A regra da casa é uma só: simulação indica, análise formal aprova.

### O conceito

Subsídio, taxa e parcela são como a previsão do tempo: você pode dizer "deve chover" com base nos dados, mas quem confirma é o céu. No MCMV, quem confirma é a análise da Caixa.

### O método SMQ, passo a passo

1. Subsídio só existe na F1 e na F2: pode chegar a R$ 55 mil, é maior nas rendas mais baixas e cai conforme a renda sobe dentro da F2. O valor depende de renda, município, composição e FGTS e só sai na simulação e na análise. F3 e F4 não têm.
2. Subsídio só depois de saber a renda, sempre como "varia e se confirma na análise".
3. Taxa: sai no simulador oficial e se confirma na análise. Quem tem 3 anos ou mais de FGTS costuma ter taxa menor, e o redutor vigente se confirma no simulador.
4. Parcela: com seguros e taxa de administração, cabe em até cerca de 30% da renda bruta familiar. Renda de R$ 5.000, parcela de até R$ 1.500. Sempre "a parcela estimada fica em torno de".
5. Prazo: de 120 a 420 meses (10 a 35 anos), com a regra da idade: idade do comprador mais o prazo até 80 anos e 6 meses. Cliente de 55 anos tem prazo máximo de 25 anos e 6 meses.
6. Repita as âncoras antigolpe sempre que o assunto for dinheiro: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e a Caixa não chama cliente no WhatsApp pedindo dado.

### Na vida real

**O caso:** Caso N: "os valores são reais?" (jan a fev/2026).

**O que foi dito:** O cliente chegou desconfiado do anúncio e perguntou se os valores eram reais. Uma das respostas no caminho foi "há casos de financiar 100%".

**O que aconteceu:** A venda aconteceu, mas a doutrina corrige essa frase: é promessa que a análise pode desmentir e gasta a credibilidade que a pergunta pedia. A resposta certa é o preço "a partir de", o que muda pela renda e a análise gratuita.

### Scripts prontos

#### Ligação · O cliente pergunta quanto de subsídio vai ganhar

> Pelo seu perfil, o subsídio pode chegar a um valor que a Caixa define na análise, e ele muda com a renda, a cidade e o FGTS. Eu te mostro o número da simulação antes de você assinar qualquer coisa. A análise é gratuita e não te compromete. Posso te mandar a lista de documentos?

**Por que funciona:** É o script de subsídio honesto: não crava valor, explica do que depende, tira o medo de compromisso e já aponta o próximo passo.

#### WhatsApp · O cliente pergunta "quanto fica a parcela?" antes de dizer a renda

> Te passo sim! A parcela muda com a renda e o FGTS de quem vai comprar, então sem isso eu te daria um número errado. Vocês ganham juntos, mais ou menos, quanto por mês?

**Por que funciona:** Não foge da pergunta, explica por que precisa da renda e segue a regra "preço pode, parcela depende".

#### WhatsApp · Depois de saber a renda de R$ 4.500

> Com R$ 4.500 de renda, a parcela estimada fica em torno de até R$ 1.350, com os seguros. É estimativa: a confirmação vem na análise da Caixa, que é gratuita. Quer que eu simule num apartamento da região que você gosta?

**Por que funciona:** Usa a regra dos 30% como estimativa, com a frase permitida, e transforma o número em próximo passo.

### Erros que matam a venda

- **"O governo vai te dar R$ 55 mil"**  
  Quanto custa: Quando a análise sai com outro valor, a confiança acaba e a venda também  
  Correção: "Pode chegar a um valor que a Caixa define na análise", só depois da renda
- **Prometer subsídio para F3 ou F4**  
  Quanto custa: Promessa impossível: essas faixas não têm subsídio  
  Correção: Subsídio só existe na F1 e na F2
- **"Sua parcela será exatamente R$ 1.200" ou "essa taxa é definitiva"**  
  Quanto custa: Responsabilidade legal e credibilidade destruída  
  Correção: "A parcela estimada fica em torno de"; a taxa sai no simulador e se confirma na análise

### No CRM

- **Tela:** Card do cliente na Fila Única e Dossiê › linha do tempo
- **Ação:** Registrar o desfecho da conversa com o próximo passo combinado (simulação, visita ou análise)
- **Campo:** Desfecho, próximo passo e data
- **Regra:** Número passado ao cliente é sempre estimativa; nada de valor de subsídio ou parcela exata registrado como promessa

### Frase-âncora

> **Simulação indica. Análise formal aprova.**

### Checagem rápida

1. Quais faixas têm subsídio?  
   Resposta: Só a F1 e a F2.
2. Cliente de 55 anos: qual o prazo máximo do financiamento?  
   Resposta: 25 anos e 6 meses (idade mais prazo até 80 anos e 6 meses).
3. Renda de R$ 5.000: qual a parcela estimada máxima?  
   Resposta: Em torno de R$ 1.500, com seguros e taxa (cerca de 30% da renda).',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"O governo vai te dar R$ 55 mil.\" Essa frase fecha a conversa de hoje e abre o problema de amanhã: quando a análise sai com outro valor, quem mentiu foi você.","por_que_importa":"O cliente MCMV tem dois medos: não aprovar e cair em golpe. Promessa de subsídio, taxa ou parcela exata alimenta os dois. A regra da casa é uma só: simulação indica, análise formal aprova.","conceito":"Subsídio, taxa e parcela são como a previsão do tempo: você pode dizer \"deve chover\" com base nos dados, mas quem confirma é o céu. No MCMV, quem confirma é a análise da Caixa.","metodo":["Subsídio só existe na F1 e na F2: pode chegar a R$ 55 mil, é maior nas rendas mais baixas e cai conforme a renda sobe dentro da F2. O valor depende de renda, município, composição e FGTS e só sai na simulação e na análise. F3 e F4 não têm.","Subsídio só depois de saber a renda, sempre como \"varia e se confirma na análise\".","Taxa: sai no simulador oficial e se confirma na análise. Quem tem 3 anos ou mais de FGTS costuma ter taxa menor, e o redutor vigente se confirma no simulador.","Parcela: com seguros e taxa de administração, cabe em até cerca de 30% da renda bruta familiar. Renda de R$ 5.000, parcela de até R$ 1.500. Sempre \"a parcela estimada fica em torno de\".","Prazo: de 120 a 420 meses (10 a 35 anos), com a regra da idade: idade do comprador mais o prazo até 80 anos e 6 meses. Cliente de 55 anos tem prazo máximo de 25 anos e 6 meses.","Repita as âncoras antigolpe sempre que o assunto for dinheiro: a análise é gratuita, ninguém da SMQ pede Pix, taxa ou senha, e a Caixa não chama cliente no WhatsApp pedindo dado."],"na_vida_real":{"caso":"Caso N: \"os valores são reais?\" (jan a fev/2026).","o_que_foi_dito":"O cliente chegou desconfiado do anúncio e perguntou se os valores eram reais. Uma das respostas no caminho foi \"há casos de financiar 100%\".","resultado":"A venda aconteceu, mas a doutrina corrige essa frase: é promessa que a análise pode desmentir e gasta a credibilidade que a pergunta pedia. A resposta certa é o preço \"a partir de\", o que muda pela renda e a análise gratuita.","fonte":"Casoteca SMQ (super prompt, seção 9.12) e erros da casa (seção 9.16)"},"scripts":[{"canal":"Ligação","situacao":"O cliente pergunta quanto de subsídio vai ganhar","texto":"Pelo seu perfil, o subsídio pode chegar a um valor que a Caixa define na análise, e ele muda com a renda, a cidade e o FGTS. Eu te mostro o número da simulação antes de você assinar qualquer coisa. A análise é gratuita e não te compromete. Posso te mandar a lista de documentos?","por_que_funciona":"É o script de subsídio honesto: não crava valor, explica do que depende, tira o medo de compromisso e já aponta o próximo passo."},{"canal":"WhatsApp","situacao":"O cliente pergunta \"quanto fica a parcela?\" antes de dizer a renda","texto":"Te passo sim! A parcela muda com a renda e o FGTS de quem vai comprar, então sem isso eu te daria um número errado. Vocês ganham juntos, mais ou menos, quanto por mês?","por_que_funciona":"Não foge da pergunta, explica por que precisa da renda e segue a regra \"preço pode, parcela depende\"."},{"canal":"WhatsApp","situacao":"Depois de saber a renda de R$ 4.500","texto":"Com R$ 4.500 de renda, a parcela estimada fica em torno de até R$ 1.350, com os seguros. É estimativa: a confirmação vem na análise da Caixa, que é gratuita. Quer que eu simule num apartamento da região que você gosta?","por_que_funciona":"Usa a regra dos 30% como estimativa, com a frase permitida, e transforma o número em próximo passo."}],"erros_que_matam":[{"erro":"\"O governo vai te dar R$ 55 mil\"","custo":"Quando a análise sai com outro valor, a confiança acaba e a venda também","correcao":"\"Pode chegar a um valor que a Caixa define na análise\", só depois da renda"},{"erro":"Prometer subsídio para F3 ou F4","custo":"Promessa impossível: essas faixas não têm subsídio","correcao":"Subsídio só existe na F1 e na F2"},{"erro":"\"Sua parcela será exatamente R$ 1.200\" ou \"essa taxa é definitiva\"","custo":"Responsabilidade legal e credibilidade destruída","correcao":"\"A parcela estimada fica em torno de\"; a taxa sai no simulador e se confirma na análise"}],"no_crm":{"tela":"Card do cliente na Fila Única e Dossiê › linha do tempo","acao":"Registrar o desfecho da conversa com o próximo passo combinado (simulação, visita ou análise)","campo":"Desfecho, próximo passo e data","regra":"Número passado ao cliente é sempre estimativa; nada de valor de subsídio ou parcela exata registrado como promessa"},"frase_ancora":"Simulação indica. Análise formal aprova.","checagem_rapida":[{"pergunta":"Quais faixas têm subsídio?","resposta":"Só a F1 e a F2."},{"pergunta":"Cliente de 55 anos: qual o prazo máximo do financiamento?","resposta":"25 anos e 6 meses (idade mais prazo até 80 anos e 6 meses)."},{"pergunta":"Renda de R$ 5.000: qual a parcela estimada máxima?","resposta":"Em torno de R$ 1.500, com seguros e taxa (cerca de 30% da renda)."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M04-A5', 5, 'Acima de R$ 13 mil não é "não": rotear, registrar e manter a tabela em dia', 'texto',
  'Renda de R$ 14 mil. O corretor diz "infelizmente você não se encaixa" e marca o lead como perdido. O cliente tinha dinheiro, tinha pressa e tinha caminho. Só não tinha corretor.

### Por que importa

Renda alta não é motivo de perda. Acima de R$ 13.000 existe crédito imobiliário com juros de mercado, e esse cliente costuma ter mais capacidade de compra do que a média da casa. Perder por "renda acima do teto" sem tentar a rota é jogar fora o lead mais fácil do dia.

### O conceito

A tabela do MCMV é uma porta, não um muro. Quem passa do teto não fica do lado de fora: vai para a porta do lado, o Pró-Cotista (com FGTS ativo) ou o SBPE.

### O método SMQ, passo a passo

1. Nunca rejeite lead por renda alta: acima de R$ 13.000, o caminho é Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado.
2. Explique a mudança sem drama: "sai do programa, a taxa é outra, e eu te mostro a conta".
3. Mude de produto se for o caso: o que cabe no teto do MCMV pode não ser o que o cliente procura; mostre o que faz sentido para a renda dele.
4. Só marque perdido por "Renda acima do teto MCMV" depois de oferecer a rota, e anote nas observações qual rota foi oferecida e o que o cliente respondeu.
5. Mantenha a sua tabela em dia: toda aula, script e simulação da casa usa a mesma Ficha MCMV vigente, com data. Mudou a portaria, muda no mesmo dia.

### Na vida real

**O caso:** O casal na beira do teto: renda de R$ 12.000, querendo somar a renda da mãe para "subir o valor" (erro auditado na casa, jul a set/2026).

**O que foi dito:** A sugestão de somar a renda veio antes da conta. Com a soma, a renda passava de R$ 13.000.

**O que aconteceu:** O cliente sai do MCMV e cai no SBPE, com juros de mercado. A correção que virou regra: calcular a folga (13.000 menos a renda atual) antes de sugerir composição e, se passar, apresentar a rota com a conta na mão.

### Scripts prontos

#### Ligação · Renda de R$ 14 mil

> Ótima notícia pra vocês: com essa renda, o financiamento sai por outra linha da Caixa, com juros de mercado, e vocês costumam conseguir um valor maior. Eu faço a conta com você e te mostro as opções. Você tem FGTS ativo hoje?

**Por que funciona:** Transforma o "não se encaixa" em caminho, mostra o lado bom e faz a pergunta que decide entre Pró-Cotista e SBPE.

#### WhatsApp · O cliente pergunta se a renda dele é alta demais para o MCMV

> Boa pergunta! O programa vai até R$ 13 mil de renda familiar, pela tabela de hoje. Acima disso tem outra linha de crédito, e eu cuido das duas. Vocês ganham juntos, mais ou menos, quanto por mês?

**Por que funciona:** Responde com a regra vigente, tranquiliza e segue para a qualificação sem perder o cliente.

### Erros que matam a venda

- **Marcar perdido por "Renda acima do teto MCMV" sem oferecer Pró-Cotista ou SBPE**  
  Quanto custa: Perde o cliente com mais capacidade de compra do dia  
  Correção: Rota oferecida antes, anotada nas observações
- **Usar tabela ou script com faixa desatualizada**  
  Quanto custa: Falta grave: o cliente recebe uma regra que não vale  
  Correção: Uma Ficha MCMV vigente só, com data, atualizada no dia em que a regra muda

### No CRM

- **Tela:** Card do cliente › desfecho de perda e Dossiê › observações
- **Ação:** Oferecer a rota e registrar a resposta antes de qualquer perda
- **Campo:** Motivo de perda "Renda acima do teto MCMV" e observações
- **Regra:** Perda por renda acima do teto só com a rota oferecida e anotada

### Frase-âncora

> **Renda alta não é perda. É outra porta.**

### Checagem rápida

1. Qual o caminho para renda familiar de R$ 13.000,01?  
   Resposta: Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado.
2. O que precisa estar registrado antes de uma perda por "Renda acima do teto MCMV"?  
   Resposta: A rota oferecida (Pró-Cotista ou SBPE) e a resposta do cliente, nas observações.',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Renda de R$ 14 mil. O corretor diz \"infelizmente você não se encaixa\" e marca o lead como perdido. O cliente tinha dinheiro, tinha pressa e tinha caminho. Só não tinha corretor.","por_que_importa":"Renda alta não é motivo de perda. Acima de R$ 13.000 existe crédito imobiliário com juros de mercado, e esse cliente costuma ter mais capacidade de compra do que a média da casa. Perder por \"renda acima do teto\" sem tentar a rota é jogar fora o lead mais fácil do dia.","conceito":"A tabela do MCMV é uma porta, não um muro. Quem passa do teto não fica do lado de fora: vai para a porta do lado, o Pró-Cotista (com FGTS ativo) ou o SBPE.","metodo":["Nunca rejeite lead por renda alta: acima de R$ 13.000, o caminho é Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado.","Explique a mudança sem drama: \"sai do programa, a taxa é outra, e eu te mostro a conta\".","Mude de produto se for o caso: o que cabe no teto do MCMV pode não ser o que o cliente procura; mostre o que faz sentido para a renda dele.","Só marque perdido por \"Renda acima do teto MCMV\" depois de oferecer a rota, e anote nas observações qual rota foi oferecida e o que o cliente respondeu.","Mantenha a sua tabela em dia: toda aula, script e simulação da casa usa a mesma Ficha MCMV vigente, com data. Mudou a portaria, muda no mesmo dia."],"na_vida_real":{"caso":"O casal na beira do teto: renda de R$ 12.000, querendo somar a renda da mãe para \"subir o valor\" (erro auditado na casa, jul a set/2026).","o_que_foi_dito":"A sugestão de somar a renda veio antes da conta. Com a soma, a renda passava de R$ 13.000.","resultado":"O cliente sai do MCMV e cai no SBPE, com juros de mercado. A correção que virou regra: calcular a folga (13.000 menos a renda atual) antes de sugerir composição e, se passar, apresentar a rota com a conta na mão.","fonte":"Erros da casa (super prompt, seção 9.16) e persona P4 (seção 9.13)"},"scripts":[{"canal":"Ligação","situacao":"Renda de R$ 14 mil","texto":"Ótima notícia pra vocês: com essa renda, o financiamento sai por outra linha da Caixa, com juros de mercado, e vocês costumam conseguir um valor maior. Eu faço a conta com você e te mostro as opções. Você tem FGTS ativo hoje?","por_que_funciona":"Transforma o \"não se encaixa\" em caminho, mostra o lado bom e faz a pergunta que decide entre Pró-Cotista e SBPE."},{"canal":"WhatsApp","situacao":"O cliente pergunta se a renda dele é alta demais para o MCMV","texto":"Boa pergunta! O programa vai até R$ 13 mil de renda familiar, pela tabela de hoje. Acima disso tem outra linha de crédito, e eu cuido das duas. Vocês ganham juntos, mais ou menos, quanto por mês?","por_que_funciona":"Responde com a regra vigente, tranquiliza e segue para a qualificação sem perder o cliente."}],"erros_que_matam":[{"erro":"Marcar perdido por \"Renda acima do teto MCMV\" sem oferecer Pró-Cotista ou SBPE","custo":"Perde o cliente com mais capacidade de compra do dia","correcao":"Rota oferecida antes, anotada nas observações"},{"erro":"Usar tabela ou script com faixa desatualizada","custo":"Falta grave: o cliente recebe uma regra que não vale","correcao":"Uma Ficha MCMV vigente só, com data, atualizada no dia em que a regra muda"}],"no_crm":{"tela":"Card do cliente › desfecho de perda e Dossiê › observações","acao":"Oferecer a rota e registrar a resposta antes de qualquer perda","campo":"Motivo de perda \"Renda acima do teto MCMV\" e observações","regra":"Perda por renda acima do teto só com a rota oferecida e anotada"},"frase_ancora":"Renda alta não é perda. É outra porta.","checagem_rapida":[{"pergunta":"Qual o caminho para renda familiar de R$ 13.000,01?","resposta":"Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado."},{"pergunta":"O que precisa estar registrado antes de uma perda por \"Renda acima do teto MCMV\"?","resposta":"A rota oferecida (Pró-Cotista ou SBPE) e a resposta do cliente, nas observações."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q01', 1, 'situacional',
  'O lead escreve: "É Minha Casa Minha Vida?". Qual é a sua próxima mensagem?',
  '["\"É sim, e você ganha até R$ 55 mil de subsídio do governo!\"","\"É sim! O que muda é a faixa, e ela depende da renda de quem vai comprar. Vocês ganham juntos, mais ou menos, quanto por mês?\"","\"Depende. Me manda seu CPF que eu consulto.\"","\"É, mas as condições eu só explico na visita.\""]'::jsonb,
  1,
  'A B está certa: responde na hora, explica que a faixa vem da renda e devolve com uma pergunta só, em linguagem de cliente. A A está errada: promete subsídio antes de saber a renda, e subsídio nem existe na F3 e na F4. A C está errada: pede CPF sem aceite nem explicação, o que assusta e fere a LGPD. A D está errada: foge da pergunta e empurra a conversa para depois; o cliente esfria.',
  'M04-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q02', 2, 'situacional',
  'O cliente diz que a renda dele é de R$ 3.000 por mês. O que você faz antes de dizer a faixa?',
  '["Diz na hora que ele está na F1 e tem o maior subsídio","Diz que com essa renda não dá para financiar","Manda a tabela de preços para ele escolher","Confirma se o valor é bruto ou líquido e se mais alguém vai entrar na compra"]'::jsonb,
  3,
  'A D está certa: com renda declarada de até R$ 3.000, a regra da casa manda confirmar bruto ou líquido e composição antes da boa notícia. A A está errada: é a boa notícia precoce que vira desqualificação tardia na análise (aprendizado de 27/07/2026). A B está errada: descarta um cliente que tem faixa e caminho: até R$ 3.200 é F1. A C está errada: mostra preço antes de qualificar e entrega a condução ao cliente.',
  'M04-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q03', 3, 'aplicacao',
  'Renda familiar bruta de R$ 5.000,01, tabela vigente desde 22/04/2026. Qual o enquadramento?',
  '["F3, sem subsídio","F2, com subsídio decrescente","F2, sem subsídio","F3, com subsídio de até R$ 55 mil"]'::jsonb,
  0,
  'A A está certa: a F3 vai de R$ 5.000,01 a R$ 9.600, e F3 não tem subsídio. A B está errada: a F2 termina em R$ 5.000,00; um centavo acima já é F3. A C está errada: a F2 termina em R$ 5.000,00, e a F2 tem subsídio. A D está errada: F3 não tem subsídio; subsídio só existe na F1 e na F2.',
  'M04-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q04', 4, 'aplicacao',
  'Renda familiar bruta de R$ 9.600,01. Qual a faixa e o teto do imóvel, pela tabela vigente desde 22/04/2026?',
  '["F3, com teto de R$ 400 mil","F4, com teto de R$ 400 mil","F4, com teto de R$ 600 mil","Fora do MCMV, direto no SBPE"]'::jsonb,
  2,
  'A C está certa: a F4 vai de R$ 9.600,01 a R$ 13.000, com teto de imóvel de R$ 600 mil. A A está errada: a F3 termina em R$ 9.600,00. A B está errada: R$ 400 mil é o teto da F3, não da F4. A D está errada: o MCMV vai até R$ 13.000 de renda; só acima disso o caminho é Pró-Cotista ou SBPE.',
  'M04-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q05', 5, 'aplicacao',
  'Renda familiar de R$ 13.000,01. Qual é o caminho certo?',
  '["F4 do MCMV, porque a diferença é de um centavo","Marcar perdido por \"Renda acima do teto MCMV\"","Esperar a proposta da F4 de R$ 21 mil ser aprovada","Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado"]'::jsonb,
  3,
  'A D está certa: acima de R$ 13.000 o cliente sai do MCMV, e a rota é Pró-Cotista ou SBPE. Nunca rejeitar por renda alta. A A está errada: o teto de renda da F4 é R$ 13.000,00; um centavo acima já está fora. A B está errada: perder sem oferecer a rota joga fora um cliente com capacidade de compra. A C está errada: a proposta não estava aprovada até 29/09/2026; com cliente, vale a regra de hoje.',
  'M04-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q06', 6, 'aplicacao',
  'Cliente da F3 se apaixonou por uma unidade de R$ 401 mil. O que você faz?',
  '["Segue com a unidade, porque R$ 1 mil de diferença a Caixa não olha","Explica que o teto da F3 é R$ 400 mil e mostra opções dentro do teto; na dúvida, o correspondente diz o enquadramento possível","Diz que dá para enquadrar na F4 sem mudar a renda","Promete que a construtora baixa o preço para caber"]'::jsonb,
  1,
  'A B está certa: o teto da F3 é R$ 400 mil; unidade acima disso não é MCMV para esse cliente, e o correspondente confirma o que for possível. A A está errada: teto é teto: a unidade não cabe no programa pela faixa do cliente. A C está errada: a faixa vem da renda, não do preço do imóvel. A D está errada: negociação só dentro da campanha; desconto extra é com o gerente ou o diretor, nunca promessa.',
  'M04-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q07', 7, 'aplicacao',
  'Renda familiar de R$ 4.500. Qual a parcela estimada máxima, com seguros e taxa, pela regra da casa?',
  '["Em torno de R$ 1.350","Em torno de R$ 1.500","Exatamente R$ 1.350, garantido","Em torno de R$ 2.250"]'::jsonb,
  0,
  'A A está certa: a parcela cabe em até cerca de 30% da renda bruta familiar: 30% de R$ 4.500 dá R$ 1.350, sempre como estimativa. A B está errada: R$ 1.500 é o limite de quem ganha R$ 5.000. A C está errada: parcela nunca é garantida: simulação indica, análise formal aprova. A D está errada: R$ 2.250 seria 50% da renda, muito acima da regra.',
  'M04-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q08', 8, 'aplicacao',
  'Cliente de 55 anos quer o maior prazo possível. Qual é o prazo máximo?',
  '["35 anos","25 anos","25 anos e 6 meses","20 anos"]'::jsonb,
  2,
  'A C está certa: idade mais prazo vai até 80 anos e 6 meses: 55 anos mais 25 anos e 6 meses fecha a conta. A A está errada: 35 anos (420 meses) é o prazo máximo do programa, mas a idade limita. A B está errada: é a regra antiga dos "80 anos", já superada. A D está errada: encurta o prazo sem motivo e aumenta a parcela.',
  'M04-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q09', 9, 'situacional',
  'Cliente da F2, com renda de R$ 4.200, pergunta: "Quanto de subsídio eu vou ganhar?". O que você responde?',
  '["\"R$ 55 mil, que é o máximo do programa.\"","\"Na sua faixa não tem subsídio.\"","\"Uns R$ 30 mil, mais ou menos, pode contar com isso.\"","\"Pelo seu perfil, o subsídio pode chegar a um valor que a Caixa define na análise. Eu te mostro o número da simulação antes de você assinar qualquer coisa.\""]'::jsonb,
  3,
  'A D está certa: é o script de subsídio honesto: não crava valor, diz quem decide e promete transparência antes da assinatura. A A está errada: promete o teto como se fosse o valor dele; o subsídio cai conforme a renda sobe dentro da F2. A B está errada: a F2 tem subsídio; dizer que não tem faz o cliente desistir sem motivo. A C está errada: inventa um número e ainda pede para o cliente contar com ele.',
  'M04-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q10', 10, 'situacional',
  'Casal com renda de R$ 12.000 quer somar a renda da mãe, de R$ 2.500, "pra subir o valor". Qual a sua próxima fala?',
  '["\"Antes de somar, deixa eu fazer a conta: se passar de R$ 13 mil, vocês saem do Minha Casa Minha Vida e a taxa sobe. A folga de vocês é de R$ 1 mil.\"","\"Ótimo, somando fica R$ 14.500 e vocês financiam mais.\"","\"Pode somar, a faixa não muda com a composição.\"","\"Composição de renda não é permitida no programa.\""]'::jsonb,
  0,
  'A A está certa: calcula a folga (13.000 menos 12.000 dá R$ 1.000) antes de sugerir: com R$ 14.500 o casal sai do MCMV e cai no SBPE. A B está errada: com R$ 14.500 o casal sai do programa e perde a condição da F4. A C está errada: a faixa é da renda somada de quem entra no contrato; a composição muda a faixa. A D está errada: a composição é permitida com quem entra no contrato; o limite de participantes se confirma com o correspondente.',
  'M04-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q11', 11, 'situacional',
  'Lead com renda familiar de R$ 14.000 pergunta se consegue comprar. O que você faz?',
  '["Diz que ele não se encaixa e marca perdido","Diz que consegue por outra linha (Pró-Cotista com FGTS ativo ou SBPE) e pergunta se ele tem FGTS ativo","Enquadra na F4 e pede para ele declarar uma renda menor","Manda o lead para outro corretor"]'::jsonb,
  1,
  'A B está certa: renda alta não é perda: é outra porta, e a pergunta do FGTS decide entre Pró-Cotista e SBPE. A A está errada: perde o cliente com mais capacidade de compra do dia. A C está errada: declarar renda menor é fraude e risco grave para o cliente, o corretor e a SMQ. A D está errada: o lead é seu: a rota é trabalho seu, não de outro.',
  'M04-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q12', 12, 'situacional',
  'O cliente diz: "Li que a F4 agora vai até R$ 21 mil." Estamos em 29/09/2026. O que você responde?',
  '["\"Isso mesmo, já está valendo.\"","\"Isso é mentira da internet.\"","\"É uma proposta que o governo está estudando, ainda sem aprovação. Eu trabalho com a regra que vale hoje, e te aviso se mudar.\"","\"Vamos esperar aprovar para você comprar.\""]'::jsonb,
  2,
  'A C está certa: separa notícia de regra, valoriza o cliente e cria um motivo de contato se a regra mudar. A A está errada: ensina como vigente uma proposta que não estava aprovada. A B está errada: desqualifica o cliente e a notícia, que é real como proposta. A D está errada: adia a compra por uma regra incerta; com cliente, fala-se do que vale hoje.',
  'M04-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q13', 13, 'situacional',
  'O lead avisa: "Quero comprar um MCMV pra alugar." Qual é a conduta certa?',
  '["Seguir com o MCMV e não comentar a finalidade","Dizer que o imóvel vai valorizar e compensa","Encerrar o atendimento, porque investidor não é público da SMQ","Explicar que o programa é para morar e oferecer outro produto de investimento, sem promessa de valorização"]'::jsonb,
  3,
  'A D está certa: MCMV é para moradia própria; investidor é requalificado para outro produto (R2V, nR ou SBPE), sem tese de valorização. A A está errada: gera handoff improdutivo e problema na análise (aprendizado de 13/07/2026). A B está errada: "vai valorizar" é frase proibida. A C está errada: investidor tem produto na casa; só não é o MCMV.',
  'M04-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q14', 14, 'situacional',
  'Entregador de aplicativo pergunta: "É pra autônomo também?". Qual a melhor resposta?',
  '["\"Sem holerite fica difícil, melhor abrir um MEI primeiro.\"","\"É sim, e tenho uma notícia boa: a renda de aplicativo passou a contar na análise. Você roda em qual aplicativo?\"","\"A regra nova vale desde 1º de agosto, pode contar com ela.\"","\"Me manda seus extratos dos últimos 12 meses pra eu ver.\""]'::jsonb,
  1,
  'A B está certa: dá a notícia verdadeira sem cravar a data da regra e fecha com uma pergunta só. A A está errada: a regra da renda de aplicativo não exige MEI. A C está errada: crava uma data que a casa não confirma; a regra é ensinada sem data. A D está errada: pede documento errado e demais antes de qualificar; a lista se confirma com o correspondente.',
  'M04-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q15', 15, 'conceito',
  'Qual destas rendas NÃO entra na conta da Caixa no MCMV?',
  '["Salário com holerite","Aposentadoria","Bolsa Família","Renda de autônomo comprovada"]'::jsonb,
  2,
  'A C está certa: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS não contam como renda. A A está errada: salário comprovado por holerite conta. A B está errada: aposentadoria conta. A D está errada: renda de autônomo comprovada (extratos, declaração, DECORE quando pedido) conta.',
  'M04-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q16', 16, 'conceito',
  'Em quais faixas do MCMV existe subsídio?',
  '["Só na F1 e na F2","Em todas as faixas","Só na F1","Na F2 e na F3"]'::jsonb,
  0,
  'A A está certa: o subsídio existe na F1 e na F2 e cai conforme a renda sobe dentro da F2; F3 e F4 não têm. A B está errada: F3 e F4 não têm subsídio. A C está errada: a F2 também tem, decrescente com a renda. A D está errada: a F3 não tem subsídio.',
  'M04-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q17', 17, 'conceito',
  'Qual é a base legal das faixas que valem hoje?',
  '["As regras aprovadas em 24/03/2026, que ainda aguardam publicação","A proposta de ampliação da F4 de jul/2026","O decreto municipal de HIS e HMP de 2026","A Portaria MCID nº 333/2026, com as regras em vigor desde 22/04/2026"]'::jsonb,
  3,
  'A D está certa: a Portaria MCID nº 333, de 30/03/2026, publicada em 01/04/2026, vale desde 22/04/2026. A A está errada: é o aviso antigo do material interno, superado desde 22/04/2026. A B está errada: era proposta em análise, sem aprovação até 29/09/2026. A C está errada: o decreto municipal trata de HIS e HMP (M06), não das faixas federais.',
  'M04-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q18', 18, 'conceito',
  'De onde sai a taxa de juros de um cliente específico?',
  '["Da tabela de faixas, que traz a taxa exata do cliente","Do simulador oficial, e ela se confirma na análise","Do corretor, que negocia a taxa com a Caixa","Da construtora, na tabela de preços"]'::jsonb,
  1,
  'A B está certa: as faixas de juros da portaria são nacionais e variam por região, renda e FGTS; a taxa do cliente sai no simulador e se confirma na análise. A A está errada: a tabela traz faixas de referência, não a taxa exata de cada cliente. A C está errada: o corretor não negocia taxa; prometer taxa é frase proibida. A D está errada: a construtora não define a taxa do financiamento.',
  'M04-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q19', 19, 'caca_ao_erro',
  'Encontre o problema nesta mensagem: "Boa notícia! Com R$ 4.800 você está na F2 e o governo vai te dar R$ 55 mil de subsídio. Sua parcela fica exatamente R$ 1.200."',
  '["O erro é dizer F2, porque R$ 4.800 é F3","O erro é falar de parcela, o que nunca pode ser feito","Promete subsídio e parcela exata; o certo é estimativa, \"a Caixa define na análise\"","Não tem erro, é uma boa mensagem de fechamento"]'::jsonb,
  2,
  'A C está certa: R$ 4.800 é F2 mesmo, mas "o governo vai te dar R$ 55 mil" e "exatamente R$ 1.200" são frases proibidas. A A está errada: a F2 vai de R$ 3.200,01 a R$ 5.000; R$ 4.800 é F2. A B está errada: parcela pode ser falada depois da renda, como estimativa. A D está errada: a mensagem promete o que só a análise confirma.',
  'M04-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M04-Q20', 20, 'caca_ao_erro',
  'Encontre o problema nesta mensagem: "No Minha Casa Minha Vida, a F1 vai até R$ 2.850 e a F2 até R$ 4.700. As regras novas ainda aguardam publicação."',
  '["Usa a tabela antiga; desde 22/04/2026, a F1 vai até R$ 3.200 e a F2 até R$ 5.000","O problema é não citar a F3 e a F4","O problema é falar de faixa antes do preço","Não tem erro, é a tabela oficial"]'::jsonb,
  0,
  'A A está certa: a tabela vigente desde 22/04/2026 (Portaria 333/2026) tem F1 até R$ 3.200 e F2 até R$ 5.000; usar dado desatualizado com o cliente é falta grave. A B está errada: o problema não é a omissão, é a tabela vencida. A C está errada: faixa vem antes do preço de propósito: é ela que diz o que cabe. A D está errada: é a tabela antiga, com o aviso de publicação já superado.',
  'M04-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (13)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F01', 1, 'Faixas do MCMV (vigentes desde 22/04/2026)', 'F1 até R$ 3.200 · F2 de R$ 3.200,01 a R$ 5.000 · F3 de R$ 5.000,01 a R$ 9.600 · F4 de R$ 9.600,01 a R$ 13.000. Confirmar na tabela oficial antes de usar com cliente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F02', 2, 'Teto do imóvel por faixa', 'F1 e F2: de R$ 210 mil a R$ 275 mil conforme o município (capital até R$ 275 mil, valor exato no simulador) · F3: R$ 400 mil · F4: R$ 600 mil.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F03', 3, 'Quem tem subsídio?', 'Só F1 e F2. Pode chegar a R$ 55 mil, cai conforme a renda sobe e só sai na simulação e na análise.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F04', 4, 'Script de subsídio honesto', '"Pelo seu perfil, o subsídio pode chegar a um valor que a Caixa define na análise, e eu te mostro antes de você assinar qualquer coisa."', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F05', 5, 'Parcela máxima estimada', 'Cerca de 30% da renda bruta familiar, com seguros e taxa. Renda de R$ 5.000: parcela de até R$ 1.500.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F06', 6, 'Regra da idade', 'Idade mais prazo até 80 anos e 6 meses. 55 anos: prazo máximo de 25 anos e 6 meses.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F07', 7, 'Prazo do financiamento', 'De 120 a 420 meses (10 a 35 anos).', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F08', 8, 'O que não conta como renda', 'Bolsa Família, BPC, seguro-desemprego, auxílio-doença, FGTS e dinheiro em mãos sem comprovação.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F09', 9, 'Renda de aplicativo', 'Passou a contar: 4 meses seguidos na mesma plataforma, resumo de ganhos, vale o mês de menor valor. Lista final com o correspondente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F10', 10, 'Composição na F4', 'Calcule a folga: 13.000 menos a renda atual. Passou de R$ 13.000, sai do MCMV e cai no SBPE.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F11', 11, 'Renda acima de R$ 13.000', 'Pró-Cotista (com FGTS ativo) ou SBPE. Nunca rejeitar lead por renda alta: rotear.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F12', 12, 'MCMV é para...', 'Morar. Investidor vai para outro produto (R2V, nR ou SBPE), sem tese de valorização.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M04-F13', 13, 'Frase-âncora do módulo', 'Simulação indica. Análise formal aprova.', true
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1 quinzenal, abra com o corretor três Dossiês da carteira dele e peça para ele dizer em voz alta a faixa de cada cliente e por quê, pela tabela vigente. Na reunião de segunda, faça o \"centavo da semana\": três rendas de fronteira em sequência, e o time responde em 10 segundos. Aplique o laboratório de enquadramento na primeira semana do corretor e repita sempre que a portaria mudar.","sinais_de_dificuldade":["Faixa MCMV vazia ou diferente da renda informada no Dossiê de clientes já qualificados.","Perdidos por \"Renda acima do teto MCMV\" sem a rota Pró-Cotista ou SBPE nas observações.","Mensagens com valor de subsídio ou parcela exata na linha do tempo do cliente."],"perguntas_de_coaching":["Esse cliente está em qual faixa, e qual renda você usou para chegar nela?","O que você disse sobre subsídio, e com qual frase?","Antes de marcar esse perdido, qual rota você ofereceu?"],"ritual_de_celebracao":"Reunião de segunda: destaque de quem zerou as perdas por renda acima do teto sem rota na semana. All Hands quinzenal: quem concluiu o M04 com 100% no laboratório de enquadramento."},"pratica_gabarito":["Cartão 1: F1 (até R$ 3.200). Renda de aplicativo passou a contar; confirmar a lista de documentos com o correspondente. Subsídio possível, definido na análise. Parcela estimada até cerca de R$ 840.","Cartão 2: antes de enquadrar, confirmar bruto ou líquido e composição (renda até R$ 3.000). Se for bruto e sozinho, F1, com parcela estimada até cerca de R$ 900.","Cartão 3: F2 (de R$ 3.200,01 a R$ 5.000). Subsídio possível, decrescente com a renda, definido na análise. Parcela estimada até cerca de R$ 1.350.","Cartão 4: F2, no topo da faixa. Subsídio possível, definido na análise. Parcela estimada até cerca de R$ 1.500.","Cartão 5: F3 (de R$ 5.000,01 a R$ 9.600), sem subsídio. Teto do imóvel de R$ 400 mil. Parcela estimada até cerca de R$ 1.500.","Cartão 6: F3, sem subsídio. Faltam 2 meses para completar 3 anos de FGTS: marco comercial, agende. Parcela estimada até cerca de R$ 2.250.","Cartão 7: F4 (de R$ 9.600,01 a R$ 13.000), sem subsídio, teto do imóvel de R$ 600 mil. Parcela estimada até cerca de R$ 2.880.","Cartão 8: não sugerir a soma sem a conta. A folga é de R$ 1.000 (13.000 menos 12.000); somando, a renda vai a R$ 14.500 e o casal sai do MCMV (SBPE ou Pró-Cotista). Sem somar, F4, parcela estimada até cerca de R$ 3.600.","Cartão 9: fora do MCMV. Rota: Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado. Nunca marcar perdido sem oferecer a rota.","Cartão 10: tirar o Bolsa Família da conta. Renda que conta: R$ 3.200, F1 (no limite da faixa). Confirmar bruto ou líquido. Parcela estimada até cerca de R$ 960."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M04' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
