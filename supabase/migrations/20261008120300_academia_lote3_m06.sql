-- ===========================================================================
-- ACADEMIA SMQ · LOTE 3 (v1.0) · seed do módulo M06
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
  ('M06', 6, 2, 'HIS, HMP e venda livre na cidade de São Paulo', 'Ao final, você passa todo cliente pelas duas regras (a categoria municipal pela renda e a faixa do MCMV) e todo produto pela triagem do preço de vitrine antes de apresentar, resolve a zona morta com as 4 saídas, e isso aparece no CRM como a triagem registrada em Resumo / Observações do Dossiê e menos perdas por perfil descobertas depois da visita.',
   '["Eu sou capaz de explicar ao cliente, em linguagem simples, a diferença entre a regra da Prefeitura (HIS e HMP) e a regra da Caixa (MCMV).","Eu sou capaz de enquadrar uma renda familiar em HIS 1, HIS 2, HMP ou venda livre pela tabela de 2026, conferindo também a renda por pessoa.","Eu sou capaz de fazer a triagem de um produto pelo preço de vitrine e de confirmar a categoria por unidade na tabela e no memorial.","Eu sou capaz de conduzir um cliente na zona morta pelas 4 saídas, sem nunca sugerir ajuste de renda.","Eu sou capaz de levar o investidor ao produto certo e de explicar a regra da unidade nR com verdade."]'::jsonb, 1.3, '80 min', true,
   '**Laboratório de triagem: 10 cards de produto pelo preço de vitrine (individual, com gabarito)** · 30 min

**Papéis:** O corretor recebe os 10 cards com o preço "a partir de" e responde sozinho, em até 20 minutos; o gerente corrige com o gabarito e conduz os 10 minutos finais com os três cruzamentos de cliente e produto.

**Persona:** P10 (zona morta HIS e HMP), P1 (casal F2) e P7 (investidor), nos três cruzamentos finais

**Roteiro:** Para cada card, o corretor escreve: a categoria possível pelo preço de vitrine (venda livre, HMP ou livre, pode ser HIS), se há sinal de preço colado em teto, o que precisa confirmar e onde (tabela por unidade, memorial, simulador) e a próxima ação. Depois, cruza três clientes com os produtos e escreve a primeira frase para cada um. Os preços são os do catálogo de 29/09/2026 ou valores de treino, e nenhum vai para cliente sem conferir Documentação & Projetos no dia.

**Roteiro do cliente:**

- Card 1: Longitude Estação Tucuruvi, a partir de R$ 199.900 (catálogo de 29/09/2026).
- Card 2: Cury Mérito Ipiranga, a partir de R$ 236.433 (catálogo de 29/09/2026).
- Card 3: Vibra Sabará, a partir de R$ 285.900 (catálogo de 29/09/2026).
- Card 4: Mundo Apto Elevato Pinheiros, a partir de R$ 383.636 (catálogo de 29/09/2026).
- Card 5: Trisul Terrare HIS e HMP, a partir de R$ 374.380 (catálogo de 29/09/2026).
- Card 6: Emccamp Vision Penha, a partir de R$ 430.000 (catálogo de 29/09/2026).
- Card 7: unidade de 2 dormitórios classificada como R2V na tabela, a partir de R$ 346 mil (tabela de set/2026 de um produto da Zona Sul).
- Card 8: produto Emccamp em Jundiaí, a partir de R$ 530.611 (catálogo de 29/09/2026).
- Card 9: produto de valor de treino, a partir de R$ 620.000.
- Card 10: produto Cury com "a partir de" de R$ 276.102 (valor colado no teto do HIS 1, catálogo de 29/09/2026).
- Cruzamento A (P1): casal com renda somada de R$ 4.500, quer Zona Leste, vai morar.
- Cruzamento B (P10): renda de R$ 10.000, quer bairro valorizado, diz "tudo que eu gosto não encaixa".
- Cruzamento C (P7): investidor que pede tabela e rentabilidade e quer alugar por temporada.

**O que o observador procura:**

- Nenhum card classificado como "é HIS" só pelo preço: sempre com a confirmação na tabela por unidade e no memorial.
- O card 6 e o card 9 corretamente descartados como HIS.
- O card 8 identificado como fora da regra da capital.
- O card 10 com o alerta do teto de F1 e F2 na capital.
- Zona morta resolvida com as 4 saídas em ordem e sem nenhuma sugestão de ajustar a renda (critério 6 só com nota 5).
- Investidor levado ao produto certo, sem promessa de valorização.
- O registro proposto em Resumo / Observações para cada cruzamento.

**Rubrica:** Padrão SMQ, critérios 2 (qualificação), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 3 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Como a renda por pessoa se combina com a renda familiar na compra de unidade HIS e HMP (as duas precisam caber ou basta uma), com a construtora ou o jurídico. | [CONFIRMAR com o jurídico] O que acontece se uma unidade HIS for vendida a quem está fora da renda (aula M06-A5 e questão M06-Q11). | [CONFIRMAR] Teto exato de F1 e F2 no município de São Paulo no simulador ("até R$ 275 mil"), usado na aula M06-A3 e nas questões M06-Q16 e M06-Q20. | [CONFIRMAR] Regra de HIS e HMP de municípios fora da capital (card 8 da prática, produto em Jundiaí). | [GAP DE CRM] O catálogo (Documentação & Projetos) não tem campo de enquadramento por unidade (HIS 1, HIS 2, HMP, R2V ou nR), e o Dossiê não tem campo para a categoria municipal do cliente. Proposta: campo de enquadramento na unidade e na ficha técnica, e a categoria do cliente ao lado da Faixa MCMV. | [DADO A MEDIR NO CRM] Linha de base de clientes com a triagem das duas regras registrada e de perdas por perfil descobertas depois da visita. | [CALIBRAR] Meta de clientes com triagem registrada e de produtos em foco com a categoria conferida. | [CONFIRMAR na publicação] Reconferir a tabela do Decreto 64.895/2026 e os tetos do MCMV antes de liberar as questões M06-Q02, M06-Q04, M06-Q06, M06-Q12, M06-Q16 e M06-Q20.', '{"formato":"canonico-8.2","lote":3,"versao_conteudo":"1.0","trilha":"T2","ordem":2,"nivel_alvo":"Intermediário","nivel_alvo_sistema":"intermediario","subtitulo":"Duas regras, duas perguntas: a Prefeitura diz quem pode comprar a unidade, a Caixa diz se o financiamento sai.","duracao_min":80,"por_que_vale_dinheiro":{"texto":"Perfil incompatível não sinalizado foi um dos cinco erros mais frequentes da auditoria das conversas. E o ticket médio das vendas de jul/2026 fica entre o teto de venda do HIS 1 e o do HIS 2: boa parte do que a casa vende vive na fronteira dessas categorias. Quem erra a regra municipal apresenta a unidade que o cliente não pode comprar; quem acerta mostra, na primeira conversa, o produto que passa nas duas regras.","numero":"15 de 156 erros da auditoria com perfil incompatível não sinalizado; ticket médio de R$ 326.667 nas vendas registradas de jul/2026","fonte":"Auditoria das conversas (seção 9.16) e registro de vendas do CRM (seção 9.1)","periodo":"jul a set/2026 (auditoria); jul/2026 (ticket, apurado em 02/08/2026)"},"pre_requisitos":["M04","M05"],"indicador_crm":{"nome":"Clientes com a triagem das duas regras registrada e produtos em foco com a categoria por unidade conferida","onde_ler":"Dossiê do cliente › Resumo / Observações (triagem); para os produtos, não há campo: a ficha técnica em Documentação & Projetos mostra \"Preço a partir de\", mas não a classificação por unidade. Como apoio, as perdas por \"Renda acima do teto MCMV\" e \"Sem perfil / curioso / lead errado\" registradas depois da visita","linha_de_base":"[DADO A MEDIR NO CRM]","meta_sugerida":"100% dos clientes em \"Agendado\" com a triagem das duas regras registrada e todos os produtos em foco com a categoria por unidade conferida [CALIBRAR]","fonte":"Briefing do M06 (seção 10.3) e catálogo do CRM (consulta de 29/09/2026)","gap_de_crm":true},"pratica":{"tipo":"Laboratório de triagem: 10 cards de produto pelo preço de vitrine (individual, com gabarito)","duracao_min":30,"persona":"P10 (zona morta HIS e HMP), P1 (casal F2) e P7 (investidor), nos três cruzamentos finais","rubrica":"Padrão SMQ, critérios 2 (qualificação), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"O corretor recebe os 10 cards com o preço \"a partir de\" e responde sozinho, em até 20 minutos; o gerente corrige com o gabarito e conduz os 10 minutos finais com os três cruzamentos de cliente e produto.","roteiro":"Para cada card, o corretor escreve: a categoria possível pelo preço de vitrine (venda livre, HMP ou livre, pode ser HIS), se há sinal de preço colado em teto, o que precisa confirmar e onde (tabela por unidade, memorial, simulador) e a próxima ação. Depois, cruza três clientes com os produtos e escreve a primeira frase para cada um. Os preços são os do catálogo de 29/09/2026 ou valores de treino, e nenhum vai para cliente sem conferir Documentação & Projetos no dia.","roteiro_cliente":["Card 1: Longitude Estação Tucuruvi, a partir de R$ 199.900 (catálogo de 29/09/2026).","Card 2: Cury Mérito Ipiranga, a partir de R$ 236.433 (catálogo de 29/09/2026).","Card 3: Vibra Sabará, a partir de R$ 285.900 (catálogo de 29/09/2026).","Card 4: Mundo Apto Elevato Pinheiros, a partir de R$ 383.636 (catálogo de 29/09/2026).","Card 5: Trisul Terrare HIS e HMP, a partir de R$ 374.380 (catálogo de 29/09/2026).","Card 6: Emccamp Vision Penha, a partir de R$ 430.000 (catálogo de 29/09/2026).","Card 7: unidade de 2 dormitórios classificada como R2V na tabela, a partir de R$ 346 mil (tabela de set/2026 de um produto da Zona Sul).","Card 8: produto Emccamp em Jundiaí, a partir de R$ 530.611 (catálogo de 29/09/2026).","Card 9: produto de valor de treino, a partir de R$ 620.000.","Card 10: produto Cury com \"a partir de\" de R$ 276.102 (valor colado no teto do HIS 1, catálogo de 29/09/2026).","Cruzamento A (P1): casal com renda somada de R$ 4.500, quer Zona Leste, vai morar.","Cruzamento B (P10): renda de R$ 10.000, quer bairro valorizado, diz \"tudo que eu gosto não encaixa\".","Cruzamento C (P7): investidor que pede tabela e rentabilidade e quer alugar por temporada."],"observador_procura":["Nenhum card classificado como \"é HIS\" só pelo preço: sempre com a confirmação na tabela por unidade e no memorial.","O card 6 e o card 9 corretamente descartados como HIS.","O card 8 identificado como fora da regra da capital.","O card 10 com o alerta do teto de F1 e F2 na capital.","Zona morta resolvida com as 4 saídas em ordem e sem nenhuma sugestão de ajustar a renda (critério 6 só com nota 5).","Investidor levado ao produto certo, sem promessa de valorização.","O registro proposto em Resumo / Observações para cada cruzamento."]},"desafio_campo":{"tarefa":"Em 48 horas: (1) escolha 3 produtos de Projetos em Foco, peça a tabela vigente com a classificação por unidade, confira no memorial e anote a categoria de cada tipologia (HIS 1, HIS 2, HMP, R2V ou nR) e a data da tabela; (2) para 2 clientes da sua carteira com renda informada, registre no Dossiê a triagem das duas regras: a categoria municipal que a renda permite, a faixa do MCMV e o produto que cabe nas duas.","prazo_horas":48,"evidencia_no_crm":"Resumo / Observações do Dossiê dos 2 clientes com a categoria, a faixa e o produto indicado; a conferência dos 3 produtos entregue ao gerente, porque o catálogo ainda não tem campo de enquadramento por unidade [GAP DE CRM].","como_o_gestor_confere":"Abre o Dossiê dos 2 clientes e confere se a categoria bate com a renda informada e com a tabela do Decreto 64.895/2026, e se o produto indicado cabe na faixa do MCMV. Confere a lista dos 3 produtos contra a tabela da construtora: pelo menos uma tipologia com a categoria confirmada por produto."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do catálogo do CRM e um corretor fazendo o papel de cliente","cenario":"Escritório da SMQ, com Documentação & Projetos aberto no CRM e a tabela de 2026 da Prefeitura ao lado","blocos":[{"tempo":"0:00","fala":"Cliente com renda de quatro mil e novecentos. É F2. Então é HIS 1, né? Não é. Trinta e sete reais separam a boa notícia da desqualificação.","na_tela":"R$ 4.900 contra o limite de R$ 4.863"},{"tempo":"0:25","fala":"Perfil que não cabe e ninguém avisa foi um dos cinco erros mais frequentes das nossas conversas. O não chega na análise, quando já custou visita e esperança.","na_tela":"15 de 156 erros, jul a set/2026"},{"tempo":"0:55","fala":"São duas regras. A Prefeitura diz quem pode comprar aquela unidade e por qual preço. A Caixa diz se o financiamento sai. O cliente passa nas duas ou não passa.","na_tela":"Prefeitura x Caixa"},{"tempo":"1:30","fala":"A escada de 2026: três, seis e dez salários mínimos. HIS 1 até quatro mil oitocentos e sessenta e três, HIS 2 até nove mil setecentos e vinte e seis, HMP até dezesseis mil duzentos e dez.","na_tela":"Tabela do Decreto 64.895/2026"},{"tempo":"2:10","fala":"Olha a triagem no catálogo. Quatrocentos e trinta mil? Passou do teto do HIS 2: é HMP ou livre. Colado em trezentos e oitenta e três mil? Sinal de HIS 2. E sinal não é prova: eu peço a tabela por unidade.","na_tela":"Catálogo com três produtos e o preço \"a partir de\""},{"tempo":"3:00","fala":"O erro mais caro é o que parece ajuda: sugerir renda menor pra caber. Isso coloca o cliente, você e a casa em risco. Na zona morta tem quatro saídas honestas.","na_tela":"As 4 saídas da zona morta"},{"tempo":"3:45","fala":"Seu desafio: em 48 horas, confira a classificação de três produtos em foco e registre a triagem das duas regras de dois clientes no Dossiê.","na_tela":"Dossiê › Resumo / Observações"},{"tempo":"4:30","fala":"Duas regras, duas perguntas. O cliente passa nas duas ou não passa.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 9.1, 9.9 (HIS, HMP e venda livre; faixas do MCMV), 9.13, 9.15 e 9.16 do super prompt","Estudo da Academia v2.1, seções 3.5, 4.2, 4.3, 4.4 e 10 (personas P1, P7 e P10)","Decreto municipal nº 64.895, de 05/01/2026 (conferido em 29/09/2026, conforme a seção 17 do Estudo)","Catálogo de Documentação & Projetos no CRM (consulta de 29/09/2026)","Conteúdo anterior do M06 no CRM (Notion, abr/2026), revisado"],"origem":"SMQ","pendencias":["[CONFIRMAR] Como a renda por pessoa se combina com a renda familiar na compra de unidade HIS e HMP (as duas precisam caber ou basta uma), com a construtora ou o jurídico.","[CONFIRMAR com o jurídico] O que acontece se uma unidade HIS for vendida a quem está fora da renda (aula M06-A5 e questão M06-Q11).","[CONFIRMAR] Teto exato de F1 e F2 no município de São Paulo no simulador (\"até R$ 275 mil\"), usado na aula M06-A3 e nas questões M06-Q16 e M06-Q20.","[CONFIRMAR] Regra de HIS e HMP de municípios fora da capital (card 8 da prática, produto em Jundiaí).","[GAP DE CRM] O catálogo (Documentação & Projetos) não tem campo de enquadramento por unidade (HIS 1, HIS 2, HMP, R2V ou nR), e o Dossiê não tem campo para a categoria municipal do cliente. Proposta: campo de enquadramento na unidade e na ficha técnica, e a categoria do cliente ao lado da Faixa MCMV.","[DADO A MEDIR NO CRM] Linha de base de clientes com a triagem das duas regras registrada e de perdas por perfil descobertas depois da visita.","[CALIBRAR] Meta de clientes com triagem registrada e de produtos em foco com a categoria conferida.","[CONFIRMAR na publicação] Reconferir a tabela do Decreto 64.895/2026 e os tetos do MCMV antes de liberar as questões M06-Q02, M06-Q04, M06-Q06, M06-Q12, M06-Q16 e M06-Q20."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M06-A1', 'M06-A2', 'M06-A3', 'M06-A4', 'M06-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M06-Q01', 'M06-Q02', 'M06-Q03', 'M06-Q04', 'M06-Q05', 'M06-Q06', 'M06-Q07', 'M06-Q08', 'M06-Q09', 'M06-Q10', 'M06-Q11', 'M06-Q12', 'M06-Q13', 'M06-Q14', 'M06-Q15', 'M06-Q16', 'M06-Q17', 'M06-Q18', 'M06-Q19', 'M06-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M06-F01', 'M06-F02', 'M06-F03', 'M06-F04', 'M06-F05', 'M06-F06', 'M06-F07', 'M06-F08', 'M06-F09', 'M06-F10', 'M06-F11', 'M06-F12', 'M06-F13');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 13;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M06-A1', 1, 'Duas regras, duas perguntas: Prefeitura e Caixa', 'texto',
  'O cliente pergunta: "Esse prédio é HIS ou é Minha Casa Minha Vida?". Metade dos corretores responde "é a mesma coisa". Não é. E a resposta errada aparece na análise, quando a unidade já foi apresentada, o cliente já se apaixonou e a regra diz não.

### Por que importa

Perfil incompatível com o MCMV não sinalizado foi um dos cinco erros mais frequentes da auditoria das conversas: 15 de 156 erros (jul a set/2026). Cada um desses clientes gastou tempo, visita e esperança num produto que não podia comprar. Quem passa o cliente pelas duas regras antes de apresentar diz "não dá" cedo e mostra o que dá.

### O conceito

Pense num show com ingresso de meia-entrada. A casa de show diz quem pode comprar aquele ingresso (a carteirinha); o cartão de crédito diz se a compra passa. São duas portas diferentes, e o cliente precisa passar nas duas. Com HIS e HMP é igual: a Prefeitura diz quem pode comprar aquela unidade e por qual preço máximo; a Caixa diz se o cliente financia e com qual taxa.

### O método SMQ, passo a passo

1. Separe as duas perguntas. Pergunta da Prefeitura: a renda da família cabe na categoria desta unidade (HIS 1, HIS 2, HMP ou venda livre)? Pergunta da Caixa: em que faixa do MCMV (ou fora dele) o crédito sai?
2. A regra da Prefeitura, em 2026, é o Decreto municipal nº 64.895, de 05/01/2026, com o salário mínimo de referência de R$ 1.621. Os valores estão na aula M06-A2.
3. A regra da Caixa é a do MCMV, pela Portaria MCID nº 333/2026 (faixas no M04 e enquadramento no M05). Quem ganha acima de R$ 13.000 sai do MCMV e vai para Pró-Cotista ou SBPE.
4. Responda ao cliente com a fala oficial das duas regras (script abaixo) e já confira as duas por ele.
5. Registre no Dossiê, em Resumo / Observações, a categoria que a renda permite e a faixa do MCMV: é isso que decide quais produtos você apresenta.

### Na vida real

**O caso:** Auditoria das conversas da casa (156 erros, jul a set/2026).

**O que foi dito:** Em 15 conversas, o atendimento seguiu apresentando produto e simulação sem sinalizar que o perfil do cliente não cabia no MCMV ou no produto.

**O que aconteceu:** O "não" apareceu depois, na análise ou na visita, quando custava mais caro para o cliente e para o corretor. É o quinto erro mais frequente da auditoria e é treinável.

### Scripts prontos

#### WhatsApp · O cliente pergunta se o empreendimento é HIS ou MCMV

> São duas regras diferentes. A Prefeitura diz quem pode comprar esta unidade e por qual preço máximo; a Caixa diz se você financia e com qual taxa. Você precisa passar nas duas, e eu já confiro as duas pra você.

**Por que funciona:** É a fala oficial da casa: explica sem jargão, tira a confusão e posiciona o corretor como quem cuida da conta pelo cliente, que é o pilar da assessoria no crédito.

#### WhatsApp · Logo depois de explicar as duas regras, para já começar a conferir

> Pra eu conferir as duas, me conta: quanto vocês ganham juntos por mês, mais ou menos?

**Por que funciona:** Uma pergunta só, em linguagem de cliente, que é o dado que as duas regras pedem. A explicação vira ação na mesma conversa.

#### Ligação · O cliente diz que "no outro corretor falaram que HIS é o MCMV da Prefeitura"

> Entendo a confusão, muita gente fala assim. Mas são duas coisas: a Prefeitura define quem pode comprar aquela unidade e o preço máximo dela, e a Caixa define se o seu financiamento sai. Eu confiro as duas agora. Quanto vocês ganham juntos por mês, mais ou menos?

**Por que funciona:** Valida o cliente sem atacar ninguém, corrige com verdade e termina em pergunta, que devolve a condução ao corretor.

### Erros que matam a venda

- **Dizer que HIS e MCMV são a mesma coisa**  
  Quanto custa: O cliente se apaixona por uma unidade que a regra da Prefeitura não deixa ele comprar, e o "não" chega na análise  
  Correção: Duas regras, duas perguntas: conferir a categoria da unidade e a faixa do MCMV antes de apresentar
- **Apresentar o produto antes de saber a renda**  
  Quanto custa: Não dá para saber em que categoria o cliente cabe; a conversa vira catálogo  
  Correção: Renda primeiro (ordem das 6 perguntas do M15), produto depois
- **Perfil incompatível não sinalizado**  
  Quanto custa: 15 de 156 erros da auditoria de jul a set/2026; desqualificação tardia  
  Correção: Dizer "não dá" cedo, com o caminho que dá (outra categoria, outro produto, SBPE)

### No CRM

- **Tela:** Dossiê do cliente › Resumo / Observações; Documentação & Projetos › Projetos em Foco
- **Ação:** Anotar a categoria municipal que a renda permite e a faixa do MCMV antes de escolher o produto
- **Campo:** Resumo / Observações (a categoria HIS ou HMP ainda não tem campo próprio)
- **Regra:** Nenhum produto apresentado sem as duas regras conferidas

### Frase-âncora

> **Duas regras, duas perguntas. O cliente passa nas duas ou não passa.**

### Checagem rápida

1. Quem diz quem pode comprar uma unidade HIS e por qual preço máximo?  
   Resposta: A Prefeitura, pelo Decreto municipal nº 64.895/2026.
2. Quem diz se o cliente financia e com qual taxa?  
   Resposta: A Caixa, pelas regras do MCMV (ou do SBPE, fora dele).
3. O que você registra no Dossiê antes de escolher o produto?  
   Resposta: A categoria que a renda permite e a faixa do MCMV, em Resumo / Observações.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente pergunta: \"Esse prédio é HIS ou é Minha Casa Minha Vida?\". Metade dos corretores responde \"é a mesma coisa\". Não é. E a resposta errada aparece na análise, quando a unidade já foi apresentada, o cliente já se apaixonou e a regra diz não.","por_que_importa":"Perfil incompatível com o MCMV não sinalizado foi um dos cinco erros mais frequentes da auditoria das conversas: 15 de 156 erros (jul a set/2026). Cada um desses clientes gastou tempo, visita e esperança num produto que não podia comprar. Quem passa o cliente pelas duas regras antes de apresentar diz \"não dá\" cedo e mostra o que dá.","conceito":"Pense num show com ingresso de meia-entrada. A casa de show diz quem pode comprar aquele ingresso (a carteirinha); o cartão de crédito diz se a compra passa. São duas portas diferentes, e o cliente precisa passar nas duas. Com HIS e HMP é igual: a Prefeitura diz quem pode comprar aquela unidade e por qual preço máximo; a Caixa diz se o cliente financia e com qual taxa.","metodo":["Separe as duas perguntas. Pergunta da Prefeitura: a renda da família cabe na categoria desta unidade (HIS 1, HIS 2, HMP ou venda livre)? Pergunta da Caixa: em que faixa do MCMV (ou fora dele) o crédito sai?","A regra da Prefeitura, em 2026, é o Decreto municipal nº 64.895, de 05/01/2026, com o salário mínimo de referência de R$ 1.621. Os valores estão na aula M06-A2.","A regra da Caixa é a do MCMV, pela Portaria MCID nº 333/2026 (faixas no M04 e enquadramento no M05). Quem ganha acima de R$ 13.000 sai do MCMV e vai para Pró-Cotista ou SBPE.","Responda ao cliente com a fala oficial das duas regras (script abaixo) e já confira as duas por ele.","Registre no Dossiê, em Resumo / Observações, a categoria que a renda permite e a faixa do MCMV: é isso que decide quais produtos você apresenta."],"na_vida_real":{"caso":"Auditoria das conversas da casa (156 erros, jul a set/2026).","o_que_foi_dito":"Em 15 conversas, o atendimento seguiu apresentando produto e simulação sem sinalizar que o perfil do cliente não cabia no MCMV ou no produto.","resultado":"O \"não\" apareceu depois, na análise ou na visita, quando custava mais caro para o cliente e para o corretor. É o quinto erro mais frequente da auditoria e é treinável.","fonte":"Seção 9.16 do super prompt"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente pergunta se o empreendimento é HIS ou MCMV","texto":"São duas regras diferentes. A Prefeitura diz quem pode comprar esta unidade e por qual preço máximo; a Caixa diz se você financia e com qual taxa. Você precisa passar nas duas, e eu já confiro as duas pra você.","por_que_funciona":"É a fala oficial da casa: explica sem jargão, tira a confusão e posiciona o corretor como quem cuida da conta pelo cliente, que é o pilar da assessoria no crédito."},{"canal":"WhatsApp","situacao":"Logo depois de explicar as duas regras, para já começar a conferir","texto":"Pra eu conferir as duas, me conta: quanto vocês ganham juntos por mês, mais ou menos?","por_que_funciona":"Uma pergunta só, em linguagem de cliente, que é o dado que as duas regras pedem. A explicação vira ação na mesma conversa."},{"canal":"Ligação","situacao":"O cliente diz que \"no outro corretor falaram que HIS é o MCMV da Prefeitura\"","texto":"Entendo a confusão, muita gente fala assim. Mas são duas coisas: a Prefeitura define quem pode comprar aquela unidade e o preço máximo dela, e a Caixa define se o seu financiamento sai. Eu confiro as duas agora. Quanto vocês ganham juntos por mês, mais ou menos?","por_que_funciona":"Valida o cliente sem atacar ninguém, corrige com verdade e termina em pergunta, que devolve a condução ao corretor."}],"erros_que_matam":[{"erro":"Dizer que HIS e MCMV são a mesma coisa","custo":"O cliente se apaixona por uma unidade que a regra da Prefeitura não deixa ele comprar, e o \"não\" chega na análise","correcao":"Duas regras, duas perguntas: conferir a categoria da unidade e a faixa do MCMV antes de apresentar"},{"erro":"Apresentar o produto antes de saber a renda","custo":"Não dá para saber em que categoria o cliente cabe; a conversa vira catálogo","correcao":"Renda primeiro (ordem das 6 perguntas do M15), produto depois"},{"erro":"Perfil incompatível não sinalizado","custo":"15 de 156 erros da auditoria de jul a set/2026; desqualificação tardia","correcao":"Dizer \"não dá\" cedo, com o caminho que dá (outra categoria, outro produto, SBPE)"}],"no_crm":{"tela":"Dossiê do cliente › Resumo / Observações; Documentação & Projetos › Projetos em Foco","acao":"Anotar a categoria municipal que a renda permite e a faixa do MCMV antes de escolher o produto","campo":"Resumo / Observações (a categoria HIS ou HMP ainda não tem campo próprio)","regra":"Nenhum produto apresentado sem as duas regras conferidas"},"frase_ancora":"Duas regras, duas perguntas. O cliente passa nas duas ou não passa.","checagem_rapida":[{"pergunta":"Quem diz quem pode comprar uma unidade HIS e por qual preço máximo?","resposta":"A Prefeitura, pelo Decreto municipal nº 64.895/2026."},{"pergunta":"Quem diz se o cliente financia e com qual taxa?","resposta":"A Caixa, pelas regras do MCMV (ou do SBPE, fora dele)."},{"pergunta":"O que você registra no Dossiê antes de escolher o produto?","resposta":"A categoria que a renda permite e a faixa do MCMV, em Resumo / Observações."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M06-A2', 2, 'A tabela de 2026 em reais: renda da família, renda por pessoa e teto de venda', 'texto',
  'Cliente com renda de R$ 4.900. É F2 no MCMV. Então é HIS 1, certo? Errado. O HIS 1 vai até R$ 4.863. Trinta e sete reais separam a boa notícia da desqualificação.

### Por que importa

O ticket médio das vendas registradas em jul/2026 foi de R$ 326.667 (registro de vendas do CRM, 02/08/2026): acima do teto de venda do HIS 1 e abaixo do teto do HIS 2. Ou seja, boa parte do que a casa vende vive exatamente na fronteira dessas categorias. Errar a tabela é errar o produto.

### O conceito

A tabela da Prefeitura é uma escada de três degraus medida em salários mínimos: 3, 6 e 10. Cada degrau tem três limites: a renda da família, a renda por pessoa e o preço máximo da unidade. Quando o salário mínimo muda, os degraus de renda mudam junto.

### O método SMQ, passo a passo

1. HIS 1: renda familiar de até R$ 4.863 (3 salários mínimos), renda por pessoa de até R$ 810,50 e teto de venda de R$ 276.102,20. vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente.
2. HIS 2: renda familiar de até R$ 9.726 (6 salários mínimos), renda por pessoa de até R$ 1.621,00 e teto de venda de R$ 383.636,74. vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente.
3. HMP: renda familiar de até R$ 16.210 (10 salários mínimos), renda por pessoa de até R$ 2.431,50 e teto de venda de R$ 537.672,71. vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente.
4. Venda livre (R2V e nR): sem teto de renda nem de preço pela regra municipal.
5. Confira as duas rendas: a da família e a por pessoa (renda da família dividida pelo número de pessoas). Exemplo de treino: família de 4 pessoas com R$ 4.000 cabe no HIS 1 pela renda da família, mas dá R$ 1.000 por pessoa, acima dos R$ 810,50. Como a unidade aplica os dois limites juntos, a construtora confirma [CONFIRMAR].
6. Cruze com a Caixa, faixa por faixa (valores de treino): R$ 4.500 é F2 e cabe em HIS 1, HIS 2 e HMP; R$ 4.900 é F2 e já não cabe no HIS 1; R$ 9.700 é F4 no MCMV e ainda cabe no HIS 2; R$ 12.000 é F4 e cabe no HMP; R$ 14.000 cabe no HMP e está fora do MCMV (SBPE).
7. Revise a tabela a cada reajuste do salário mínimo e a cada decreto novo: em 2026 o decreto corrigiu os preços pelo INCC-M. Quem mostra a tabela do ano passado erra de categoria.

### Na vida real

**O caso:** Os perfis reais das análises de crédito de jul/2026 (112 análises).

**O que foi dito:** As análises se dividiram em F1 (27, renda média de R$ 2.264), F2 (36, R$ 4.244), F3 (42, R$ 7.113) e F4 (7, R$ 11.000).

**O que aconteceu:** A renda média da F2 cabe no HIS 1; a da F3 cabe no HIS 2 e não no HIS 1; a da F4 passa do HIS 2 e cabe no HMP. Os clientes reais da casa se espalham pelas três categorias: por isso a tabela é ferramenta de todo dia, não de prova.

### Scripts prontos

#### WhatsApp · O cliente informa a renda e você precisa saber se é antes ou depois dos descontos

> Obrigado! Esse valor é o que vem no holerite antes dos descontos ou o que cai na conta?

**Por que funciona:** Perto das fronteiras da tabela, bruto ou líquido muda a categoria. Uma pergunta, em linguagem de cliente, evita a boa notícia precoce que vira desqualificação.

#### WhatsApp · A renda da família passa do limite do HIS 1 por pouco

> Pela regra da Prefeitura, com R$ 4.900 esta unidade HIS 1 não é pra vocês, mas as unidades HIS 2 e HMP são. Separei duas opções que cabem nas duas regras. Posso te mostrar amanhã às 10h ou às 18h?

**Por que funciona:** Diz a verdade na hora, já mostra o caminho que dá e termina com duas opções de horário, que devolvem um dia em vez de um "vou pensar".

### Erros que matam a venda

- **Achar que F2 é sempre HIS 1**  
  Quanto custa: Com renda entre R$ 4.863,01 e R$ 5.000 o cliente é F2 e não cabe no HIS 1: a unidade apresentada não pode ser dele  
  Correção: Conferir a renda contra o limite da categoria, não contra a faixa do MCMV
- **Olhar só a renda da família e esquecer a renda por pessoa**  
  Quanto custa: O cliente pode passar num limite e não no outro  
  Correção: Dividir a renda pelo número de pessoas e confirmar com a construtora como a unidade aplica os dois limites
- **Usar a tabela do ano anterior**  
  Quanto custa: Renda e teto mudam com o salário mínimo e o decreto do ano  
  Correção: Tabela de 2026: Decreto 64.895, salário mínimo de R$ 1.621

### No CRM

- **Tela:** Dossiê do cliente › aba Dados e Resumo / Observações
- **Ação:** Conferir a renda informada e o número de pessoas da família antes de enquadrar
- **Campo:** Renda informada e Faixa MCMV (aba Dados); categoria municipal em Resumo / Observações
- **Regra:** Renda informada é a renda real; perto da fronteira, confirmar bruto ou líquido antes de dar qualquer notícia

### Frase-âncora

> **Três, seis e dez salários mínimos. A escada muda todo ano; a conferência, não.**

### Checagem rápida

1. Qual é a renda familiar máxima do HIS 2 em 2026?  
   Resposta: R$ 9.726 (6 salários mínimos de R$ 1.621).
2. Renda de R$ 9.700: qual categoria municipal e qual faixa do MCMV?  
   Resposta: Cabe no HIS 2 e no HMP; no MCMV é F4.
3. Renda de R$ 14.000: o que muda?  
   Resposta: Cabe no HMP, mas está fora do MCMV: o crédito vai para o SBPE (ou Pró-Cotista).',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Cliente com renda de R$ 4.900. É F2 no MCMV. Então é HIS 1, certo? Errado. O HIS 1 vai até R$ 4.863. Trinta e sete reais separam a boa notícia da desqualificação.","por_que_importa":"O ticket médio das vendas registradas em jul/2026 foi de R$ 326.667 (registro de vendas do CRM, 02/08/2026): acima do teto de venda do HIS 1 e abaixo do teto do HIS 2. Ou seja, boa parte do que a casa vende vive exatamente na fronteira dessas categorias. Errar a tabela é errar o produto.","conceito":"A tabela da Prefeitura é uma escada de três degraus medida em salários mínimos: 3, 6 e 10. Cada degrau tem três limites: a renda da família, a renda por pessoa e o preço máximo da unidade. Quando o salário mínimo muda, os degraus de renda mudam junto.","metodo":["HIS 1: renda familiar de até R$ 4.863 (3 salários mínimos), renda por pessoa de até R$ 810,50 e teto de venda de R$ 276.102,20. vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente.","HIS 2: renda familiar de até R$ 9.726 (6 salários mínimos), renda por pessoa de até R$ 1.621,00 e teto de venda de R$ 383.636,74. vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente.","HMP: renda familiar de até R$ 16.210 (10 salários mínimos), renda por pessoa de até R$ 2.431,50 e teto de venda de R$ 537.672,71. vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente.","Venda livre (R2V e nR): sem teto de renda nem de preço pela regra municipal.","Confira as duas rendas: a da família e a por pessoa (renda da família dividida pelo número de pessoas). Exemplo de treino: família de 4 pessoas com R$ 4.000 cabe no HIS 1 pela renda da família, mas dá R$ 1.000 por pessoa, acima dos R$ 810,50. Como a unidade aplica os dois limites juntos, a construtora confirma [CONFIRMAR].","Cruze com a Caixa, faixa por faixa (valores de treino): R$ 4.500 é F2 e cabe em HIS 1, HIS 2 e HMP; R$ 4.900 é F2 e já não cabe no HIS 1; R$ 9.700 é F4 no MCMV e ainda cabe no HIS 2; R$ 12.000 é F4 e cabe no HMP; R$ 14.000 cabe no HMP e está fora do MCMV (SBPE).","Revise a tabela a cada reajuste do salário mínimo e a cada decreto novo: em 2026 o decreto corrigiu os preços pelo INCC-M. Quem mostra a tabela do ano passado erra de categoria."],"na_vida_real":{"caso":"Os perfis reais das análises de crédito de jul/2026 (112 análises).","o_que_foi_dito":"As análises se dividiram em F1 (27, renda média de R$ 2.264), F2 (36, R$ 4.244), F3 (42, R$ 7.113) e F4 (7, R$ 11.000).","resultado":"A renda média da F2 cabe no HIS 1; a da F3 cabe no HIS 2 e não no HIS 1; a da F4 passa do HIS 2 e cabe no HMP. Os clientes reais da casa se espalham pelas três categorias: por isso a tabela é ferramenta de todo dia, não de prova.","fonte":"Seção 9.1 do super prompt (baseline de julho, apurado em 02/08/2026)"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente informa a renda e você precisa saber se é antes ou depois dos descontos","texto":"Obrigado! Esse valor é o que vem no holerite antes dos descontos ou o que cai na conta?","por_que_funciona":"Perto das fronteiras da tabela, bruto ou líquido muda a categoria. Uma pergunta, em linguagem de cliente, evita a boa notícia precoce que vira desqualificação."},{"canal":"WhatsApp","situacao":"A renda da família passa do limite do HIS 1 por pouco","texto":"Pela regra da Prefeitura, com R$ 4.900 esta unidade HIS 1 não é pra vocês, mas as unidades HIS 2 e HMP são. Separei duas opções que cabem nas duas regras. Posso te mostrar amanhã às 10h ou às 18h?","por_que_funciona":"Diz a verdade na hora, já mostra o caminho que dá e termina com duas opções de horário, que devolvem um dia em vez de um \"vou pensar\"."}],"erros_que_matam":[{"erro":"Achar que F2 é sempre HIS 1","custo":"Com renda entre R$ 4.863,01 e R$ 5.000 o cliente é F2 e não cabe no HIS 1: a unidade apresentada não pode ser dele","correcao":"Conferir a renda contra o limite da categoria, não contra a faixa do MCMV"},{"erro":"Olhar só a renda da família e esquecer a renda por pessoa","custo":"O cliente pode passar num limite e não no outro","correcao":"Dividir a renda pelo número de pessoas e confirmar com a construtora como a unidade aplica os dois limites"},{"erro":"Usar a tabela do ano anterior","custo":"Renda e teto mudam com o salário mínimo e o decreto do ano","correcao":"Tabela de 2026: Decreto 64.895, salário mínimo de R$ 1.621"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados e Resumo / Observações","acao":"Conferir a renda informada e o número de pessoas da família antes de enquadrar","campo":"Renda informada e Faixa MCMV (aba Dados); categoria municipal em Resumo / Observações","regra":"Renda informada é a renda real; perto da fronteira, confirmar bruto ou líquido antes de dar qualquer notícia"},"frase_ancora":"Três, seis e dez salários mínimos. A escada muda todo ano; a conferência, não.","checagem_rapida":[{"pergunta":"Qual é a renda familiar máxima do HIS 2 em 2026?","resposta":"R$ 9.726 (6 salários mínimos de R$ 1.621)."},{"pergunta":"Renda de R$ 9.700: qual categoria municipal e qual faixa do MCMV?","resposta":"Cabe no HIS 2 e no HMP; no MCMV é F4."},{"pergunta":"Renda de R$ 14.000: o que muda?","resposta":"Cabe no HMP, mas está fora do MCMV: o crédito vai para o SBPE (ou Pró-Cotista)."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M06-A3', 3, 'Triagem pelo preço de vitrine: o preço já conta a categoria', 'texto',
  'Três empreendimentos no catálogo: um "a partir de" R$ 199.900, outro R$ 383.636, outro R$ 430.000. Antes de abrir qualquer book, o preço já te diz qual deles nunca pode ser HIS.

### Por que importa

No estudo de ago/2026, os produtos da Zona Oeste e da Zona Sul de uma família de treino pediam renda entre R$ 5.200 e R$ 9.600, e metade das análises de jul/2026 era de F1 e F2, que não compravam aquele estoque. Produto e cliente desencontrados custam visita, simulação e mês. A triagem pelo preço leva 30 segundos e evita isso.

### O conceito

O teto de venda da Prefeitura funciona como a altura máxima de uma porta. Se o preço da unidade passa da altura da porta do HIS 2, ela não entra por essa porta, seja qual for o prédio. Se passa abaixo, pode entrar, mas quem confirma é a etiqueta da unidade: a tabela com a classificação e o memorial.

### O método SMQ, passo a passo

1. Preço acima de R$ 537.672,71 (teto do HMP): venda livre.
2. Preço entre R$ 383.636,74 e R$ 537.672,71: HMP ou venda livre. Nunca HIS.
3. Preço até R$ 383.636,74: a unidade pode ser HIS. Acima de R$ 276.102,20, se for HIS, só pode ser HIS 2.
4. Sinal de preço: "a partir de" colado em R$ 276.102 ou em R$ 383.636 indica unidade enquadrada como HIS 1 ou HIS 2. É sinal, não prova.
5. Confirme por unidade: peça a tabela com a classificação de cada unidade e confira o memorial. O mesmo prédio pode ter HIS 2, HMP e R2V.
6. Cruze com o teto da faixa do cliente no MCMV (F1 e F2 até R$ 275 mil nas maiores cidades; F3 R$ 400 mil; F4 R$ 600 mil; vigente desde 22/04/2026, confirmar no simulador): um preço colado no teto do HIS 1 pode passar do teto de F1 e F2 na capital.
7. Nenhum preço do catálogo vai ao cliente sem conferir Documentação & Projetos no dia: o cadastro muda com a tabela e tem erros conhecidos.

### Na vida real

**O caso:** Catálogo das seis famílias de treino no CRM (consulta de 29/09/2026).

**O que foi dito:** Vários produtos de uma família tinham "a partir de" colado no teto do HIS 1 (R$ 276.102), e um produto de outra família estava a partir de R$ 383.636, colado no teto do HIS 2.

**O que aconteceu:** O preço de vitrine antecipou a categoria provável de cada produto antes de qualquer book. A classificação por unidade ainda precisou ser confirmada na tabela e no memorial, porque o catálogo não traz esse campo.

### Scripts prontos

#### WhatsApp · Pedido à construtora ou ao gerente antes de apresentar um produto com preço perto do teto

> Oi! Tenho um cliente com perfil para o [empreendimento]. Você me manda a tabela vigente com a classificação de cada unidade (HIS 1, HIS 2, HMP ou R2V)?

**Por que funciona:** Pede a única fonte que confirma a categoria da unidade: a tabela oficial com a classificação, não a memória nem o preço de vitrine.

#### Ligação · O cliente viu um anúncio de R$ 430 mil e acha que é HIS

> Esse valor já passa do limite de preço das unidades HIS, então ali você estaria em HMP ou em venda livre. Vou te mostrar o que cabe nas duas regras pra você. Pra eu acertar, quanto vocês ganham juntos por mês, mais ou menos?

**Por que funciona:** Corrige com a regra, sem constranger, e transforma a correção em pergunta que avança a qualificação.

### Erros que matam a venda

- **Deduzir a categoria só pelo preço**  
  Quanto custa: Um prédio pode ter HIS 2, HMP e R2V; o preço baixo não faz da unidade HIS  
  Correção: Preço é triagem; tabela com classificação e memorial são a confirmação
- **Confiar no cadastro sem conferir**  
  Quanto custa: O cadastro tem zona trocada, entrega vencida e metragem digitada errada (set/2026)  
  Correção: Conferir no material oficial no dia, em Documentação & Projetos
- **Arredondar o preço para baixo**  
  Quanto custa: Credibilidade e conformidade; o preço vira promessa  
  Correção: Preço "a partir de", da tabela vigente, arredondado para cima

### No CRM

- **Tela:** Documentação & Projetos › Projetos em Foco e Catálogo completo (ficha técnica: "Preço a partir de")
- **Ação:** Fazer a triagem pelo preço de vitrine e pedir a tabela com a classificação por unidade
- **Campo:** Preço a partir de (a classificação HIS, HMP ou livre por unidade ainda não existe no catálogo) [GAP DE CRM]
- **Regra:** Preço de vitrine é triagem; a categoria só vale depois da tabela e do memorial

### Frase-âncora

> **O preço conta a categoria provável. A tabela conta a verdade.**

### Checagem rápida

1. Um produto a partir de R$ 430.000 pode ser HIS?  
   Resposta: Não. Está acima do teto do HIS 2 (R$ 383.636,74): é HMP ou venda livre.
2. Um preço "a partir de" colado em R$ 383.636 indica o quê?  
   Resposta: Sinal de unidade HIS 2, a confirmar na tabela por unidade e no memorial.
3. Onde se confirma a categoria de uma unidade?  
   Resposta: Na tabela vigente com a classificação por unidade e no memorial.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Três empreendimentos no catálogo: um \"a partir de\" R$ 199.900, outro R$ 383.636, outro R$ 430.000. Antes de abrir qualquer book, o preço já te diz qual deles nunca pode ser HIS.","por_que_importa":"No estudo de ago/2026, os produtos da Zona Oeste e da Zona Sul de uma família de treino pediam renda entre R$ 5.200 e R$ 9.600, e metade das análises de jul/2026 era de F1 e F2, que não compravam aquele estoque. Produto e cliente desencontrados custam visita, simulação e mês. A triagem pelo preço leva 30 segundos e evita isso.","conceito":"O teto de venda da Prefeitura funciona como a altura máxima de uma porta. Se o preço da unidade passa da altura da porta do HIS 2, ela não entra por essa porta, seja qual for o prédio. Se passa abaixo, pode entrar, mas quem confirma é a etiqueta da unidade: a tabela com a classificação e o memorial.","metodo":["Preço acima de R$ 537.672,71 (teto do HMP): venda livre.","Preço entre R$ 383.636,74 e R$ 537.672,71: HMP ou venda livre. Nunca HIS.","Preço até R$ 383.636,74: a unidade pode ser HIS. Acima de R$ 276.102,20, se for HIS, só pode ser HIS 2.","Sinal de preço: \"a partir de\" colado em R$ 276.102 ou em R$ 383.636 indica unidade enquadrada como HIS 1 ou HIS 2. É sinal, não prova.","Confirme por unidade: peça a tabela com a classificação de cada unidade e confira o memorial. O mesmo prédio pode ter HIS 2, HMP e R2V.","Cruze com o teto da faixa do cliente no MCMV (F1 e F2 até R$ 275 mil nas maiores cidades; F3 R$ 400 mil; F4 R$ 600 mil; vigente desde 22/04/2026, confirmar no simulador): um preço colado no teto do HIS 1 pode passar do teto de F1 e F2 na capital.","Nenhum preço do catálogo vai ao cliente sem conferir Documentação & Projetos no dia: o cadastro muda com a tabela e tem erros conhecidos."],"na_vida_real":{"caso":"Catálogo das seis famílias de treino no CRM (consulta de 29/09/2026).","o_que_foi_dito":"Vários produtos de uma família tinham \"a partir de\" colado no teto do HIS 1 (R$ 276.102), e um produto de outra família estava a partir de R$ 383.636, colado no teto do HIS 2.","resultado":"O preço de vitrine antecipou a categoria provável de cada produto antes de qualquer book. A classificação por unidade ainda precisou ser confirmada na tabela e no memorial, porque o catálogo não traz esse campo.","fonte":"Estudo da Academia, seções 3.5 e 4.2; seção 9.15 do super prompt"},"scripts":[{"canal":"WhatsApp","situacao":"Pedido à construtora ou ao gerente antes de apresentar um produto com preço perto do teto","texto":"Oi! Tenho um cliente com perfil para o [empreendimento]. Você me manda a tabela vigente com a classificação de cada unidade (HIS 1, HIS 2, HMP ou R2V)?","por_que_funciona":"Pede a única fonte que confirma a categoria da unidade: a tabela oficial com a classificação, não a memória nem o preço de vitrine."},{"canal":"Ligação","situacao":"O cliente viu um anúncio de R$ 430 mil e acha que é HIS","texto":"Esse valor já passa do limite de preço das unidades HIS, então ali você estaria em HMP ou em venda livre. Vou te mostrar o que cabe nas duas regras pra você. Pra eu acertar, quanto vocês ganham juntos por mês, mais ou menos?","por_que_funciona":"Corrige com a regra, sem constranger, e transforma a correção em pergunta que avança a qualificação."}],"erros_que_matam":[{"erro":"Deduzir a categoria só pelo preço","custo":"Um prédio pode ter HIS 2, HMP e R2V; o preço baixo não faz da unidade HIS","correcao":"Preço é triagem; tabela com classificação e memorial são a confirmação"},{"erro":"Confiar no cadastro sem conferir","custo":"O cadastro tem zona trocada, entrega vencida e metragem digitada errada (set/2026)","correcao":"Conferir no material oficial no dia, em Documentação & Projetos"},{"erro":"Arredondar o preço para baixo","custo":"Credibilidade e conformidade; o preço vira promessa","correcao":"Preço \"a partir de\", da tabela vigente, arredondado para cima"}],"no_crm":{"tela":"Documentação & Projetos › Projetos em Foco e Catálogo completo (ficha técnica: \"Preço a partir de\")","acao":"Fazer a triagem pelo preço de vitrine e pedir a tabela com a classificação por unidade","campo":"Preço a partir de (a classificação HIS, HMP ou livre por unidade ainda não existe no catálogo) [GAP DE CRM]","regra":"Preço de vitrine é triagem; a categoria só vale depois da tabela e do memorial"},"frase_ancora":"O preço conta a categoria provável. A tabela conta a verdade.","checagem_rapida":[{"pergunta":"Um produto a partir de R$ 430.000 pode ser HIS?","resposta":"Não. Está acima do teto do HIS 2 (R$ 383.636,74): é HMP ou venda livre."},{"pergunta":"Um preço \"a partir de\" colado em R$ 383.636 indica o quê?","resposta":"Sinal de unidade HIS 2, a confirmar na tabela por unidade e no memorial."},{"pergunta":"Onde se confirma a categoria de uma unidade?","resposta":"Na tabela vigente com a classificação por unidade e no memorial."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M06-A4', 4, 'A zona morta e as 4 saídas', 'texto',
  '"Tudo que eu gosto não encaixa." Renda de R$ 10 mil, alta demais para o HIS 2, e uma capacidade de financiamento que não alcança o bairro dos sonhos. Esse cliente não precisa de desculpa. Precisa de mapa.

### Por que importa

A zona morta é onde o corretor desiste do cliente ou, pior, sugere "ajeitar" a renda. As duas saídas custam caro: a primeira perde a venda, a segunda coloca o cliente, o corretor e a SMQ em risco grave. Existem quatro saídas honestas, em ordem, e elas cabem numa ligação.

### O conceito

Pense num elevador com andar trancado. A renda do cliente passou do andar do HIS 2, e o andar de cima (HMP e venda livre) pede um preço que a capacidade dele não alcança em todo lugar. A saída não é arrombar o andar. É achar a escada que existe: outros produtos, outra linha do mesmo prédio, outra composição, outro endereço.

### O método SMQ, passo a passo

1. Reconheça a zona morta: renda acima do teto do HIS 2 (R$ 9.726, vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente) com capacidade de financiamento baixa para o produto que o cliente quer.
2. Saída 1: peça o memorial dos produtos que cabem no bolso dele e mostre o que de fato cabe.
3. Saída 2: peça a tabela da linha HMP dos prédios que têm HIS 2 e HMP. O prédio que ele gostou pode ter uma unidade que ele pode comprar.
4. Saída 3: compor renda, respeitando o teto federal do MCMV (na F4, calcule a folga até R$ 13.000 antes de sugerir; M05).
5. Saída 4: buscar HMP mais barato, em outra região ou tipologia, com a conta de entrada e laudo feita (M08 e M09).
6. Nunca: sugerir renda menor, pró-labore ou holerite "pra bater". A renda real e comprovada define o caminho, nunca o contrário.
7. Feche com um dos 2 caminhos: visita ao produto que cabe, com duas opções de horário, ou análise com documento.

### Na vida real

**O caso:** A reativação de um produto da Zona Sul de uma família de treino (tabela de set/2026).

**O que foi dito:** O HIS 2 existia só na planta de 25 m², uma suíte com varanda; quem queria 2 dormitórios caía no R2V a partir de R$ 346 mil, "e aí a conversa de renda é outra".

**O que aconteceu:** A mesma obra tinha duas respostas para dois perfis. Quem cabia no HIS 2 e aceitava a planta de 25 m² tinha caminho; quem queria 2 dormitórios precisava da conta de renda e de entrada do R2V. A lição: a zona morta se resolve com a tabela por unidade na mão, não com promessa.

### Scripts prontos

#### Ligação · Cliente na zona morta diz "tudo que eu gosto não encaixa"

> Entendo, e é mais comum do que parece. Tem uma regra da Prefeitura que trava a faixa de preço em alguns prédios, mas tem caminho. Eu vou te mostrar três opções que cabem nas duas regras: a linha HMP de um prédio que você já gostou, e dois produtos em outra região. Você prefere ver amanhã às 18h ou sábado às 10h?

**Por que funciona:** Valida o sentimento, explica a trava sem jargão, mostra que existem saídas concretas e termina com duas opções de horário.

#### WhatsApp · O cliente pergunta se não dá para "declarar menos" para caber no HIS 2

> Não dá, e eu não faria isso com você: a renda informada é a renda real e comprovada. O que dá é buscar a unidade certa pra sua renda. Posso te mandar agora a linha HMP do prédio que você gostou?

**Por que funciona:** Recusa com firmeza e cuidado, protege o cliente e oferece imediatamente a saída honesta, com uma pergunta só.

### Erros que matam a venda

- **Sugerir renda menor para caber na categoria**  
  Quanto custa: Risco grave para o cliente, para o corretor e para a SMQ; a pasta pode ser contestada  
  Correção: A renda real e comprovada define o caminho
- **Desistir do cliente na zona morta**  
  Quanto custa: Lead com renda boa descartado por falta de mapa  
  Correção: As 4 saídas, em ordem, e um dos 2 caminhos no fim
- **Compor renda na F4 sem calcular a folga**  
  Quanto custa: O cliente passa de R$ 13.000 e sai do MCMV  
  Correção: Calcular 13.000 menos a renda atual antes de sugerir

### No CRM

- **Tela:** Dossiê do cliente › Resumo / Observações; Fila Única (desfecho)
- **Ação:** Registrar a saída escolhida e o próximo passo com data
- **Campo:** Resumo / Observações (saída da zona morta e produtos mostrados) e desfecho com próximo passo
- **Regra:** Cliente na zona morta nunca sai da ligação sem uma saída e um próximo passo registrados

### Frase-âncora

> **Na zona morta, não se arromba a porta. Se acha a escada.**

### Checagem rápida

1. O que caracteriza a zona morta?  
   Resposta: Renda acima do teto do HIS 2 com capacidade de financiamento baixa para o produto desejado.
2. Qual é a primeira das 4 saídas?  
   Resposta: Pedir o memorial dos produtos que cabem no bolso do cliente.
3. O que nunca se faz na zona morta?  
   Resposta: Sugerir renda menor, pró-labore ou holerite para caber na categoria.',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Tudo que eu gosto não encaixa.\" Renda de R$ 10 mil, alta demais para o HIS 2, e uma capacidade de financiamento que não alcança o bairro dos sonhos. Esse cliente não precisa de desculpa. Precisa de mapa.","por_que_importa":"A zona morta é onde o corretor desiste do cliente ou, pior, sugere \"ajeitar\" a renda. As duas saídas custam caro: a primeira perde a venda, a segunda coloca o cliente, o corretor e a SMQ em risco grave. Existem quatro saídas honestas, em ordem, e elas cabem numa ligação.","conceito":"Pense num elevador com andar trancado. A renda do cliente passou do andar do HIS 2, e o andar de cima (HMP e venda livre) pede um preço que a capacidade dele não alcança em todo lugar. A saída não é arrombar o andar. É achar a escada que existe: outros produtos, outra linha do mesmo prédio, outra composição, outro endereço.","metodo":["Reconheça a zona morta: renda acima do teto do HIS 2 (R$ 9.726, vigente em set/2026 (Decreto municipal nº 64.895, de 05/01/2026), confirmar na tabela oficial antes de usar com cliente) com capacidade de financiamento baixa para o produto que o cliente quer.","Saída 1: peça o memorial dos produtos que cabem no bolso dele e mostre o que de fato cabe.","Saída 2: peça a tabela da linha HMP dos prédios que têm HIS 2 e HMP. O prédio que ele gostou pode ter uma unidade que ele pode comprar.","Saída 3: compor renda, respeitando o teto federal do MCMV (na F4, calcule a folga até R$ 13.000 antes de sugerir; M05).","Saída 4: buscar HMP mais barato, em outra região ou tipologia, com a conta de entrada e laudo feita (M08 e M09).","Nunca: sugerir renda menor, pró-labore ou holerite \"pra bater\". A renda real e comprovada define o caminho, nunca o contrário.","Feche com um dos 2 caminhos: visita ao produto que cabe, com duas opções de horário, ou análise com documento."],"na_vida_real":{"caso":"A reativação de um produto da Zona Sul de uma família de treino (tabela de set/2026).","o_que_foi_dito":"O HIS 2 existia só na planta de 25 m², uma suíte com varanda; quem queria 2 dormitórios caía no R2V a partir de R$ 346 mil, \"e aí a conversa de renda é outra\".","resultado":"A mesma obra tinha duas respostas para dois perfis. Quem cabia no HIS 2 e aceitava a planta de 25 m² tinha caminho; quem queria 2 dormitórios precisava da conta de renda e de entrada do R2V. A lição: a zona morta se resolve com a tabela por unidade na mão, não com promessa.","fonte":"Estudo da Academia, seção 4.4 e caso I (seção 7)"},"scripts":[{"canal":"Ligação","situacao":"Cliente na zona morta diz \"tudo que eu gosto não encaixa\"","texto":"Entendo, e é mais comum do que parece. Tem uma regra da Prefeitura que trava a faixa de preço em alguns prédios, mas tem caminho. Eu vou te mostrar três opções que cabem nas duas regras: a linha HMP de um prédio que você já gostou, e dois produtos em outra região. Você prefere ver amanhã às 18h ou sábado às 10h?","por_que_funciona":"Valida o sentimento, explica a trava sem jargão, mostra que existem saídas concretas e termina com duas opções de horário."},{"canal":"WhatsApp","situacao":"O cliente pergunta se não dá para \"declarar menos\" para caber no HIS 2","texto":"Não dá, e eu não faria isso com você: a renda informada é a renda real e comprovada. O que dá é buscar a unidade certa pra sua renda. Posso te mandar agora a linha HMP do prédio que você gostou?","por_que_funciona":"Recusa com firmeza e cuidado, protege o cliente e oferece imediatamente a saída honesta, com uma pergunta só."}],"erros_que_matam":[{"erro":"Sugerir renda menor para caber na categoria","custo":"Risco grave para o cliente, para o corretor e para a SMQ; a pasta pode ser contestada","correcao":"A renda real e comprovada define o caminho"},{"erro":"Desistir do cliente na zona morta","custo":"Lead com renda boa descartado por falta de mapa","correcao":"As 4 saídas, em ordem, e um dos 2 caminhos no fim"},{"erro":"Compor renda na F4 sem calcular a folga","custo":"O cliente passa de R$ 13.000 e sai do MCMV","correcao":"Calcular 13.000 menos a renda atual antes de sugerir"}],"no_crm":{"tela":"Dossiê do cliente › Resumo / Observações; Fila Única (desfecho)","acao":"Registrar a saída escolhida e o próximo passo com data","campo":"Resumo / Observações (saída da zona morta e produtos mostrados) e desfecho com próximo passo","regra":"Cliente na zona morta nunca sai da ligação sem uma saída e um próximo passo registrados"},"frase_ancora":"Na zona morta, não se arromba a porta. Se acha a escada.","checagem_rapida":[{"pergunta":"O que caracteriza a zona morta?","resposta":"Renda acima do teto do HIS 2 com capacidade de financiamento baixa para o produto desejado."},{"pergunta":"Qual é a primeira das 4 saídas?","resposta":"Pedir o memorial dos produtos que cabem no bolso do cliente."},{"pergunta":"O que nunca se faz na zona morta?","resposta":"Sugerir renda menor, pró-labore ou holerite para caber na categoria."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M06-A5', 5, 'Venda livre, unidade nR e o investidor: cada unidade tem o seu dono', 'texto',
  '"Me manda a tabela e a rentabilidade. Quero alugar por temporada." Se você oferecer um apartamento do MCMV para esse cliente, a venda nasce errada.

### Por que importa

Tratar investidor como cliente do MCMV gera handoff improdutivo: o programa é para moradia própria (aprendizado de 13/07/2026). E a unidade nR, que é a do investidor, não serve para quem quer morar nem para crédito residencial (regra da casa, ago/2026). Saber de quem é cada unidade evita venda que volta.

### O conceito

Pense no estacionamento de um shopping: tem vaga de idoso, vaga de gestante e vaga comum. Todas são vagas, mas cada uma tem dono. HIS e HMP são as vagas separadas por renda; R2V é a vaga comum; a unidade nR é a vaga de carga e descarga: serve para investimento e locação de curta temporada, não para morar.

### O método SMQ, passo a passo

1. Pergunte a finalidade logo cedo: é para morar ou para investir?
2. Para morar: siga as duas regras (categoria municipal e faixa do MCMV).
3. Para investir: MCMV não é para investimento. Leve o cliente para o produto certo (R2V, nR ou SBPE), sem tese de valorização.
4. Unidade nR: só investimento e locação de curta temporada. Nunca apresente nR para moradia nem para crédito residencial.
5. Investidor recebe material na hora em que pede, com a regra da unidade explicada com verdade e nenhuma promessa de rentabilidade ou valorização.
6. Quando o cliente perguntar o que acontece se uma unidade HIS for vendida para quem está fora da renda, não improvise: leve ao gerente e dê retorno com prazo [CONFIRMAR com o jurídico].

### Na vida real

**O caso:** Leads que declararam investimento puro num produto do MCMV (aprendizado de 13/07/2026) e a regra da unidade nR (ago/2026).

**O que foi dito:** O atendimento seguiu como se o cliente fosse morar no imóvel, e o handoff chegou ao corretor sem a finalidade resolvida.

**O que aconteceu:** Handoff improdutivo. A casa passou a requalificar a finalidade antes de seguir e a levar o investidor para R2V, nR ou SBPE, sem tese de valorização.

### Scripts prontos

#### WhatsApp · O investidor pede tabela e rentabilidade de cara

> Te mando agora! Uma coisa importante: os apartamentos do Minha Casa Minha Vida são pra quem vai morar. Pra investir e alugar por temporada, tenho unidades feitas pra isso. É pra aluguel mensal ou por temporada?

**Por que funciona:** Investidor recebe material na hora, ouve a regra com verdade e responde uma pergunta só que já direciona o produto certo.

#### Ligação · O cliente quer comprar uma unidade nR para morar com a família

> Essa unidade é feita pra investimento e locação de temporada, então não serve pra morar nem pra financiamento de moradia. Pra sua família, vou te mostrar opções que cabem nas duas regras. Vocês preferem conhecer sábado às 10h ou às 14h?

**Por que funciona:** Diz o que muda a decisão antes de o cliente se comprometer, oferece a alternativa certa e fecha com duas opções.

### Erros que matam a venda

- **Tratar investidor como cliente do MCMV**  
  Quanto custa: Handoff improdutivo; o programa é para moradia  
  Correção: Requalificar a finalidade e mudar de produto
- **Apresentar unidade nR para quem vai morar**  
  Quanto custa: O crédito residencial não sai e a confiança acaba  
  Correção: nR só para investimento e locação de curta temporada
- **Prometer valorização ou rentabilidade**  
  Quanto custa: Promessa que ninguém pode garantir; credibilidade destruída  
  Correção: Falar do produto e das regras; nenhuma tese de valorização

### No CRM

- **Tela:** Dossiê do cliente › Resumo / Observações; Fila Única (desfecho e motivo de perda)
- **Ação:** Registrar a finalidade (morar ou investir) e, se o perfil não cabe no produto, o motivo verdadeiro
- **Campo:** Resumo / Observações; motivo de perda "Sem perfil / curioso / lead errado" ou "Renda acima do teto MCMV" só quando for o motivo real
- **Regra:** Finalidade registrada antes de apresentar; investidor nunca entra como cliente do MCMV

### Frase-âncora

> **Cada unidade tem o seu dono. Descubra primeiro quem o cliente é.**

### Checagem rápida

1. Para que serve a unidade nR?  
   Resposta: Só para investimento e locação de curta temporada; não serve para moradia nem para crédito residencial.
2. O investidor pode comprar um produto do MCMV para investir?  
   Resposta: Não: o MCMV é para moradia própria. Leve-o para R2V, nR ou SBPE.
3. O que você faz se o cliente perguntar o que acontece se a unidade HIS for vendida fora da renda?  
   Resposta: Não improvisa: leva ao gerente e dá retorno com prazo, porque a resposta depende do jurídico.',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Me manda a tabela e a rentabilidade. Quero alugar por temporada.\" Se você oferecer um apartamento do MCMV para esse cliente, a venda nasce errada.","por_que_importa":"Tratar investidor como cliente do MCMV gera handoff improdutivo: o programa é para moradia própria (aprendizado de 13/07/2026). E a unidade nR, que é a do investidor, não serve para quem quer morar nem para crédito residencial (regra da casa, ago/2026). Saber de quem é cada unidade evita venda que volta.","conceito":"Pense no estacionamento de um shopping: tem vaga de idoso, vaga de gestante e vaga comum. Todas são vagas, mas cada uma tem dono. HIS e HMP são as vagas separadas por renda; R2V é a vaga comum; a unidade nR é a vaga de carga e descarga: serve para investimento e locação de curta temporada, não para morar.","metodo":["Pergunte a finalidade logo cedo: é para morar ou para investir?","Para morar: siga as duas regras (categoria municipal e faixa do MCMV).","Para investir: MCMV não é para investimento. Leve o cliente para o produto certo (R2V, nR ou SBPE), sem tese de valorização.","Unidade nR: só investimento e locação de curta temporada. Nunca apresente nR para moradia nem para crédito residencial.","Investidor recebe material na hora em que pede, com a regra da unidade explicada com verdade e nenhuma promessa de rentabilidade ou valorização.","Quando o cliente perguntar o que acontece se uma unidade HIS for vendida para quem está fora da renda, não improvise: leve ao gerente e dê retorno com prazo [CONFIRMAR com o jurídico]."],"na_vida_real":{"caso":"Leads que declararam investimento puro num produto do MCMV (aprendizado de 13/07/2026) e a regra da unidade nR (ago/2026).","o_que_foi_dito":"O atendimento seguiu como se o cliente fosse morar no imóvel, e o handoff chegou ao corretor sem a finalidade resolvida.","resultado":"Handoff improdutivo. A casa passou a requalificar a finalidade antes de seguir e a levar o investidor para R2V, nR ou SBPE, sem tese de valorização.","fonte":"Seções 9.9 e 9.16 do super prompt"},"scripts":[{"canal":"WhatsApp","situacao":"O investidor pede tabela e rentabilidade de cara","texto":"Te mando agora! Uma coisa importante: os apartamentos do Minha Casa Minha Vida são pra quem vai morar. Pra investir e alugar por temporada, tenho unidades feitas pra isso. É pra aluguel mensal ou por temporada?","por_que_funciona":"Investidor recebe material na hora, ouve a regra com verdade e responde uma pergunta só que já direciona o produto certo."},{"canal":"Ligação","situacao":"O cliente quer comprar uma unidade nR para morar com a família","texto":"Essa unidade é feita pra investimento e locação de temporada, então não serve pra morar nem pra financiamento de moradia. Pra sua família, vou te mostrar opções que cabem nas duas regras. Vocês preferem conhecer sábado às 10h ou às 14h?","por_que_funciona":"Diz o que muda a decisão antes de o cliente se comprometer, oferece a alternativa certa e fecha com duas opções."}],"erros_que_matam":[{"erro":"Tratar investidor como cliente do MCMV","custo":"Handoff improdutivo; o programa é para moradia","correcao":"Requalificar a finalidade e mudar de produto"},{"erro":"Apresentar unidade nR para quem vai morar","custo":"O crédito residencial não sai e a confiança acaba","correcao":"nR só para investimento e locação de curta temporada"},{"erro":"Prometer valorização ou rentabilidade","custo":"Promessa que ninguém pode garantir; credibilidade destruída","correcao":"Falar do produto e das regras; nenhuma tese de valorização"}],"no_crm":{"tela":"Dossiê do cliente › Resumo / Observações; Fila Única (desfecho e motivo de perda)","acao":"Registrar a finalidade (morar ou investir) e, se o perfil não cabe no produto, o motivo verdadeiro","campo":"Resumo / Observações; motivo de perda \"Sem perfil / curioso / lead errado\" ou \"Renda acima do teto MCMV\" só quando for o motivo real","regra":"Finalidade registrada antes de apresentar; investidor nunca entra como cliente do MCMV"},"frase_ancora":"Cada unidade tem o seu dono. Descubra primeiro quem o cliente é.","checagem_rapida":[{"pergunta":"Para que serve a unidade nR?","resposta":"Só para investimento e locação de curta temporada; não serve para moradia nem para crédito residencial."},{"pergunta":"O investidor pode comprar um produto do MCMV para investir?","resposta":"Não: o MCMV é para moradia própria. Leve-o para R2V, nR ou SBPE."},{"pergunta":"O que você faz se o cliente perguntar o que acontece se a unidade HIS for vendida fora da renda?","resposta":"Não improvisa: leva ao gerente e dá retorno com prazo, porque a resposta depende do jurídico."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q01', 1, 'situacional',
  'No WhatsApp, o cliente pergunta: "Esse prédio é HIS ou é Minha Casa Minha Vida?". Qual é a sua resposta?',
  '["\"É a mesma coisa: HIS é o nome que a Prefeitura dá ao Minha Casa Minha Vida.\"","\"São duas regras diferentes. A Prefeitura diz quem pode comprar esta unidade e por qual preço máximo; a Caixa diz se você financia e com qual taxa. Você precisa passar nas duas, e eu já confiro as duas pra você.\"","\"É HIS, então você tem subsídio garantido.\"","\"Isso não importa. O que importa é se a parcela cabe no seu bolso.\""]'::jsonb,
  1,
  'A B é a fala oficial das duas regras: separa Prefeitura e Caixa e coloca o corretor para conferir as duas. A A é a confusão que o módulo corrige. A C promete subsídio, que depende da faixa e da análise. A D ignora a regra municipal, que pode impedir a compra daquela unidade.',
  'M06-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q02', 2, 'aplicacao',
  'Renda familiar de R$ 4.900 (valor de treino). Pela tabela de 2026 da Prefeitura, em quais categorias essa família pode comprar?',
  '["HIS 1, HIS 2 e HMP, porque é F2 no MCMV.","Só HIS 1.","Nenhuma: quem é F2 não compra HIS.","HIS 2 e HMP; o HIS 1 vai até R$ 4.863."]'::jsonb,
  3,
  'A D está certa: o HIS 1 vai até R$ 4.863 (3 salários mínimos de R$ 1.621); R$ 4.900 cabe no HIS 2 (até R$ 9.726) e no HMP. A A é o erro de achar que F2 é sempre HIS 1. A B inverte a regra. A C confunde as duas leis: a faixa do MCMV não proíbe a compra de HIS.',
  'M06-A2; Decreto 64.895/2026', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q03', 3, 'conceito',
  'O que o Decreto municipal nº 64.895/2026 define para as unidades HIS e HMP em São Paulo?',
  '["Quem pode comprar a unidade, pela renda, e o preço máximo de venda.","A taxa de juros e o subsídio do financiamento.","Se o cliente tem nome limpo para financiar.","O prazo de entrega da obra."]'::jsonb,
  0,
  'A A está certa: o decreto traz a renda familiar máxima, a renda por pessoa e o teto de venda de cada categoria. A B é regra da Caixa e do MCMV. A C é análise de crédito do correspondente. A D está no contrato da construtora, não no decreto.',
  'M06-A1; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q04', 4, 'aplicacao',
  'Renda familiar de R$ 9.700 (valor de treino). Como fica o cliente nas duas regras?',
  '["Não pode HIS 2, porque já passou da F3.","Cabe no HIS 1 e no HIS 2 e é F3 no MCMV.","Pode comprar unidade HIS 2 pela regra da Prefeitura, e no MCMV é F4, sem subsídio.","Está fora do MCMV e só pode comprar venda livre."]'::jsonb,
  2,
  'A C está certa: o HIS 2 vai até R$ 9.726 e a F3 vai até R$ 9.600, então o cliente é F4 (sem subsídio) e ainda cabe no HIS 2. A A mistura a faixa federal com o limite municipal. A B erra as duas contas (HIS 1 vai até R$ 4.863; a F3 termina em R$ 9.600). A D ignora que a F4 vai até R$ 13.000.',
  'M06-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q05', 5, 'situacional',
  'Cliente com renda de R$ 10.000 quer um bairro valorizado e diz: "Tudo que eu gosto não encaixa". Qual é o seu primeiro movimento?',
  '["Sugerir que ele informe R$ 9.500 para caber no HIS 2.","Dizer que não tem nada para ele e registrar a perda.","Prometer um desconto para o produto caber.","Pedir o memorial dos produtos que cabem no bolso dele e mostrar o que de fato cabe, seguindo as saídas da zona morta."]'::jsonb,
  3,
  'A D é a primeira das 4 saídas da zona morta, na ordem. A A é sugerir renda falsa, erro grave com risco para todos. A B desiste de um cliente que tem caminho. A C é condição fora da campanha: desconto extra só via gerente ou diretor.',
  'M06-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q06', 6, 'aplicacao',
  'Um produto aparece no catálogo "a partir de" R$ 430.000. Pelo preço de vitrine, em que categoria ele pode estar?',
  '["HMP ou venda livre; nunca HIS.","HIS 2, porque está perto do teto.","Pode ser HIS 1, desde que o cliente seja F2.","Só venda livre."]'::jsonb,
  0,
  'A A está certa: R$ 430.000 passa do teto do HIS 2 (R$ 383.636,74) e fica abaixo do teto do HMP (R$ 537.672,71). A B e a C ignoram que o preço já passou do teto das unidades HIS. A D esquece que abaixo do teto do HMP a unidade ainda pode ser HMP.',
  'M06-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q07', 7, 'caca_ao_erro',
  'Mensagem de um corretor: "Boa notícia! Com R$ 4.900 vocês entram no HIS 1 e no Minha Casa Minha Vida, com subsídio. Posso te mandar a tabela?" Qual é o erro?',
  '["Nenhum: a mensagem está correta.","O único problema é oferecer a tabela no WhatsApp.","Enquadrou no HIS 1 com renda acima do limite de R$ 4.863 e afirmou subsídio antes da simulação e da análise.","O erro é falar de Minha Casa Minha Vida por mensagem."]'::jsonb,
  2,
  'A C aponta os dois erros: R$ 4.900 passa do limite do HIS 1, e o subsídio na F2 varia com a renda e só se confirma na análise ("simulação indica, análise formal aprova"). A A e a D não enxergam o problema. A B aponta um detalhe que não é o erro: material depois da qualificação é permitido.',
  'M06-A2; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q08', 8, 'situacional',
  'Um cliente escreve: "Quero comprar esse estúdio do Minha Casa Minha Vida pra alugar por temporada". O que você faz?',
  '["Diz que pode, porque ninguém confere depois.","Explica que o MCMV é para quem vai morar e mostra as unidades feitas para investimento e temporada, sem promessa de rentabilidade.","Garante que o estúdio vai valorizar e que o aluguel paga a parcela.","Sugere colocar o imóvel no nome de um parente que vá morar lá."]'::jsonb,
  1,
  'A B está certa: o MCMV é para moradia própria, e o investidor vai para R2V, nR ou SBPE, sem tese de valorização. A A orienta a descumprir a regra. A C promete valorização e renda. A D sugere simular uma finalidade falsa, erro grave.',
  'M06-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q09', 9, 'conceito',
  'Para que serve a unidade nR?',
  '["Para moradia de famílias da F1.","Para qualquer finalidade, com financiamento de moradia.","É a unidade HIS com desconto maior.","Só para investimento e locação de curta temporada; não serve para moradia nem para crédito residencial."]'::jsonb,
  3,
  'A D é a regra da casa (ago/2026). A A e a B apresentam a nR para moradia, o que a regra proíbe. A C confunde nR com HIS: nR é venda livre, sem teto municipal.',
  'M06-A5; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q10', 10, 'situacional',
  'Você vê no catálogo um produto "a partir de" R$ 383.636, e o cliente tem renda de R$ 8.000. O que você faz antes de apresentar?',
  '["Apresenta como HIS 2 garantido, porque o preço bate com o teto.","Descarta o produto, porque o preço é alto para F3.","Trata o preço como sinal de HIS 2, lembra que a renda de R$ 8.000 cabe no HIS 2 e pede a tabela com a classificação por unidade antes de apresentar.","Manda o book e deixa o cliente escolher a unidade."]'::jsonb,
  2,
  'A C está certa: preço colado em R$ 383.636 é sinal de HIS 2, não prova; a confirmação é a tabela por unidade e o memorial. A A trata o sinal como certeza. A B erra a conta: o teto de imóvel da F3 é R$ 400 mil (vigente desde 22/04/2026). A D pula a qualificação e manda catálogo.',
  'M06-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q11', 11, 'situacional',
  'O cliente pergunta: "E se eu comprar a unidade HIS e depois descobrirem que a minha renda não cabia?". Qual é a conduta certa?',
  '["\"Relaxa, ninguém confere isso.\"","\"Não tenho a resposta exata agora. Vou levar ao meu gerente e te dou retorno até amanhã às 18h. Enquanto isso, a compra só acontece com a sua renda real dentro do limite.\"","\"Você perde o apartamento e tudo o que pagou.\"","\"É só vender depois, sem problema.\""]'::jsonb,
  1,
  'A B está certa: a consequência de uma venda de HIS fora da renda depende do jurídico e ainda está para confirmar; o corretor não improvisa, dá retorno com prazo e mantém a regra da renda real. A A incentiva a irregularidade. A C e a D inventam consequências que ninguém confirmou.',
  'M06-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q12', 12, 'aplicacao',
  'Renda familiar de R$ 14.000 (valor de treino). O que muda nas duas regras?',
  '["É F4 do MCMV e cabe no HIS 2.","Não cabe em nada: é melhor encerrar o atendimento.","Só pode comprar HIS 1.","Cabe no HMP pela regra da Prefeitura, mas está fora do MCMV: o crédito vai para SBPE ou Pró-Cotista."]'::jsonb,
  3,
  'A D está certa: o HMP vai até R$ 16.210 e o MCMV vai até R$ 13.000. A A erra as duas contas. A B rejeita um lead de renda alta, e a regra é nunca rejeitar, sempre rotear. A C inverte a escada: renda alta não cabe no HIS 1.',
  'M06-A2; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q13', 13, 'situacional',
  'Família de 4 pessoas com renda de R$ 4.000 (valor de treino) quer uma unidade HIS 1. O que você faz?',
  '["Confirma que a renda da família cabe no HIS 1, faz a conta da renda por pessoa (R$ 1.000, acima dos R$ 810,50) e confirma com a construtora como a unidade aplica os dois limites antes de apresentar.","Apresenta a unidade, porque a renda da família está abaixo de R$ 4.863.","Descarta o cliente, porque a renda por pessoa passou do limite.","Pede para o cliente informar só 2 pessoas na família."]'::jsonb,
  0,
  'A A está certa: o decreto traz dois limites (renda da família e renda por pessoa), e como eles se combinam na unidade se confirma com a construtora. A B olha só um limite. A C descarta sem confirmar e sem mostrar outras saídas (HIS 2 e HMP). A D sugere informação falsa, erro grave.',
  'M06-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q14', 14, 'conceito',
  'Por que os limites de renda de HIS 1, HIS 2 e HMP mudam de um ano para o outro?',
  '["Porque seguem a taxa Selic.","Porque cada construtora define os seus.","Porque são múltiplos do salário mínimo (3, 6 e 10), e o decreto do ano atualiza a tabela; em 2026, os preços foram corrigidos pelo INCC-M.","Porque mudam junto com as faixas do MCMV."]'::jsonb,
  2,
  'A C está certa: com o salário mínimo de R$ 1.621, os limites são R$ 4.863, R$ 9.726 e R$ 16.210, e o Decreto 64.895/2026 corrigiu os tetos de preço pelo INCC-M. A A e a D confundem a regra municipal com regras de juros e do programa federal. A B atribui à construtora uma regra que é da Prefeitura.',
  'M06-A2; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q15', 15, 'situacional',
  'O cliente pergunta se a unidade que ele gostou é HIS. A ficha técnica do produto no CRM não mostra a classificação. O que você faz?',
  '["Diz que é HIS, porque o preço é baixo.","Diz que é venda livre, para não correr risco.","Diz que não sabe e encerra o assunto.","Pede à construtora a tabela vigente com a classificação por unidade, confere o memorial e responde ao cliente com prazo."]'::jsonb,
  3,
  'A D está certa: a categoria se confirma por unidade, na tabela e no memorial, e o catálogo ainda não tem esse campo. A A deduz pelo preço, que é só triagem. A B chuta para o outro lado. A C deixa o cliente sem resposta e sem próximo passo.',
  'M06-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q16', 16, 'aplicacao',
  'Um produto Cury aparece "a partir de" R$ 276.102 e o cliente é F2, com renda de R$ 4.500. Qual é a leitura certa?',
  '["Cabe em tudo; pode apresentar como certo.","Sinal de HIS 1, e a renda de R$ 4.500 cabe; mas o preço passa um pouco do teto de F1 e F2 na capital (até R$ 275 mil): confirmar no simulador e na tabela qual unidade cabe na faixa.","Não cabe no HIS 1, porque o cliente é F2.","Cliente F2 não pode comprar unidade HIS."]'::jsonb,
  1,
  'A B está certa: R$ 276.102 é sinal de HIS 1 e a renda cabe (até R$ 4.863), mas o teto do imóvel de F1 e F2 na capital é de até R$ 275 mil (vigente desde 22/04/2026, a confirmar no simulador). A A ignora a regra da Caixa. A C e a D confundem a faixa do MCMV com o limite municipal.',
  'M06-A3; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q17', 17, 'caca_ao_erro',
  'Mensagem de um corretor: "Pra caber no HIS 2 é só você informar R$ 9.500 em vez dos R$ 10.200, ninguém confere." Qual é o erro?',
  '["Sugerir uma renda diferente da real para caber na categoria: risco grave para o cliente, para o corretor e para a SMQ.","O erro é só o tom informal.","O erro é citar o HIS 2 em vez do HMP.","Não há erro, porque a diferença é pequena."]'::jsonb,
  0,
  'A A está certa: a renda real e comprovada define o caminho, nunca o contrário. A B e a D minimizam uma conduta grave. A C até toca na saída certa (HMP), mas não é esse o erro da mensagem.',
  'M06-A4; seção 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q18', 18, 'situacional',
  'Cliente com renda de R$ 7.500 quer 2 dormitórios num produto da Zona Sul em que o HIS 2 existe só na planta de 25 m² e o 2 dormitórios é R2V, a partir de R$ 346 mil. O que você faz?',
  '["Diz que o 2 dormitórios também é HIS 2, para não perder o cliente.","Omite a diferença e apresenta o 2 dormitórios como a opção dele.","Promete um desconto para o 2 dormitórios caber.","Conta a verdade: o HIS 2 está na planta de 25 m²; o 2 dormitórios é R2V e pede a conta de renda e de entrada. Mostra as duas opções com números."]'::jsonb,
  3,
  'A D está certa: a classificação da unidade manda, e o cliente decide com as duas opções e os números na mão. A A e a B escondem o que muda a decisão. A C oferece condição fora da campanha: desconto extra só via gerente ou diretor.',
  'M06-A4; Estudo 4.4', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q19', 19, 'conceito',
  'O que é a "zona morta" no atendimento de HIS e HMP?',
  '["O período em que o cliente para de responder.","Renda acima do teto do HIS 2 com capacidade de financiamento baixa para o produto desejado.","Produto sem unidades disponíveis na tabela.","Cliente com restrição no nome."]'::jsonb,
  1,
  'A B é a definição da casa, com as 4 saídas em ordem. A A descreve o cliente que esfriou (M20). A C é falta de estoque. A D é trava de crédito (M07).',
  'M06-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M06-Q20', 20, 'aplicacao',
  'Um produto de valor de treino está "a partir de" R$ 620.000. Como fica a triagem?',
  '["HMP, porque está perto do teto.","HIS 2 para quem ganha até R$ 9.726.","Venda livre, acima do teto do HMP (R$ 537.672,71), e também acima do teto da F4 do MCMV (R$ 600 mil): o crédito vai por SBPE ou Pró-Cotista, a confirmar com o correspondente.","F4 do MCMV, porque o cliente ganha até R$ 13.000."]'::jsonb,
  2,
  'A C está certa nas duas regras. A A e a B ignoram que o preço passa do teto do HMP e, com mais razão, do HIS 2. A D esquece que o teto de imóvel da F4 é de R$ 600 mil (vigente desde 22/04/2026).',
  'M06-A3; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (13)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F01', 1, 'HIS x MCMV em uma frase', 'A Prefeitura diz quem pode comprar esta unidade e por qual preço máximo; a Caixa diz se você financia e com qual taxa. O cliente precisa passar nas duas.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F02', 2, 'HIS 1 em 2026 (Decreto 64.895)', 'Renda familiar até R$ 4.863 (3 salários mínimos), renda por pessoa até R$ 810,50, teto de venda R$ 276.102,20. Confirmar na tabela oficial.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F03', 3, 'HIS 2 em 2026', 'Renda familiar até R$ 9.726 (6 salários mínimos), renda por pessoa até R$ 1.621,00, teto de venda R$ 383.636,74.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F04', 4, 'HMP em 2026', 'Renda familiar até R$ 16.210 (10 salários mínimos), renda por pessoa até R$ 2.431,50, teto de venda R$ 537.672,71.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F05', 5, 'Venda livre (R2V e nR)', 'Sem teto de renda nem de preço pela regra municipal.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F06', 6, 'Renda de R$ 4.900: F2 é HIS 1?', 'Não. É F2 no MCMV, mas passa do HIS 1 (R$ 4.863). Cabe no HIS 2 e no HMP.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F07', 7, 'Renda de R$ 9.700', 'F4 no MCMV (sem subsídio) e ainda cabe no HIS 2 (até R$ 9.726).', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F08', 8, 'Triagem pelo preço de vitrine', 'Acima de R$ 537.672,71: livre. Entre R$ 383.636,74 e esse valor: HMP ou livre. Até R$ 383.636,74: pode ser HIS; confirme por unidade.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F09', 9, 'Sinal de preço', '"A partir de" colado em R$ 276.102 ou em R$ 383.636 indica HIS 1 ou HIS 2. É sinal, não prova.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F10', 10, 'As 4 saídas da zona morta, em ordem', 'Memorial do que cabe no bolso; linha HMP dos prédios com HIS 2 e HMP; compor renda dentro do teto federal; HMP mais barato.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F11', 11, 'Unidade nR', 'Só investimento e locação de curta temporada. Nunca para moradia nem para crédito residencial.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F12', 12, 'Investidor em produto MCMV', 'O MCMV é para morar. Requalifique a finalidade e leve o investidor para R2V, nR ou SBPE, sem tese de valorização.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M06-F13', 13, 'Renda "ajustada" para caber', 'Nunca. A renda real e comprovada define o caminho, nunca o contrário.', true
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1 quinzenal, abra com o corretor o Dossiê de três clientes da carteira dele e peça a triagem das duas regras em voz alta: categoria municipal pela renda, faixa do MCMV e produto que cabe nas duas. Na reunião de segunda, leve dois preços de vitrine da semana e peça ao time a triagem em 30 segundos. Aplique o laboratório dos 10 cards uma vez por corretor e repita sempre que aparecer uma perda por \"Renda acima do teto MCMV\" ou \"Sem perfil / curioso / lead errado\" descoberta depois da visita. A cada novo decreto ou reajuste do salário mínimo, revise a tabela com o time no mesmo dia.","sinais_de_dificuldade":["Resumo / Observações sem a categoria municipal e a faixa do MCMV nos clientes em \"Agendado\".","Perdas por \"Renda acima do teto MCMV\" ou \"Sem perfil / curioso / lead errado\" registradas depois de \"Visita realizada\" ou de \"Análise de crédito\".","Produto apresentado com preço de vitrine acima do teto da faixa do cliente, ou unidade chamada de HIS sem a tabela por unidade."],"perguntas_de_coaching":["Esse cliente passa nas duas regras? Qual é a categoria dele na Prefeitura e a faixa dele na Caixa?","Como você confirmou que essa unidade é HIS 2: pelo preço ou pela tabela?","Esse cliente estava na zona morta? Qual das 4 saídas você ofereceu, e qual é o próximo passo com data?"],"ritual_de_celebracao":"All Hands quinzenal: destaque de quem transformou um cliente da zona morta em visita ou análise com as saídas certas; no LEGADO mensal, a conquista entra em \"Disciplina de Processo\"."},"pratica_gabarito":["Card 1 (R$ 199.900): abaixo do teto do HIS 1; pode ser HIS 1, HIS 2 ou livre. Pedir a tabela com a classificação por unidade.","Card 2 (R$ 236.433): abaixo do teto do HIS 1; pode ser HIS 1, HIS 2 ou livre. Pedir a tabela por unidade.","Card 3 (R$ 285.900): acima do teto do HIS 1 (R$ 276.102,20) e abaixo do HIS 2; se for HIS, só pode ser HIS 2. Confirmar na tabela.","Card 4 (R$ 383.636): colado no teto do HIS 2 (R$ 383.636,74); sinal de HIS 2. Confirmar por unidade.","Card 5 (R$ 374.380): abaixo do teto do HIS 2; o próprio produto tem linhas HIS e HMP. Pedir a tabela com a classificação de cada unidade.","Card 6 (R$ 430.000): acima do teto do HIS 2 e abaixo do HMP (R$ 537.672,71); HMP ou venda livre, nunca HIS.","Card 7 (R2V a partir de R$ 346 mil): o preço estaria abaixo do teto do HIS 2, mas a tabela diz R2V; vale a classificação da unidade: venda livre. Conversa de renda e entrada do R2V.","Card 8 (Jundiaí): o decreto é do município de São Paulo; fora da capital, a regra municipal é outra. Confirmar a regra local com a construtora.","Card 9 (R$ 620.000, valor de treino): acima do teto do HMP; venda livre. Também acima do teto da F4 do MCMV (R$ 600 mil): crédito por SBPE (ou Pró-Cotista), a confirmar com o correspondente.","Card 10 (R$ 276.102): colado no teto do HIS 1; sinal de HIS 1. Atenção: passa do teto de F1 e F2 na capital (até R$ 275 mil, confirmar no simulador); conferir qual unidade cabe na faixa do cliente.","Cruzamento A: renda de R$ 4.500 cabe em HIS 1, HIS 2 e HMP e é F2 no MCMV; produtos dos cards 1 e 2 (Zona Norte e Zona Sul no catálogo; para Zona Leste, buscar no catálogo) com a unidade confirmada e o preço dentro do teto da F2. Primeira frase com a renda confirmada e o convite com duas opções.","Cruzamento B: renda de R$ 10.000 passa do HIS 2 (R$ 9.726) e cabe no HMP; é F4 no MCMV. Zona morta: as 4 saídas em ordem (memorial do que cabe, linha HMP do card 5, composição só com a folga até R$ 13.000, HMP mais barato como o card 6 com a conta de entrada).","Cruzamento C: investidor não compra MCMV para investir; material na hora, regra da unidade nR explicada, nenhuma promessa de rentabilidade; caminho por R2V, nR ou SBPE."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M06' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
