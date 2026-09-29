-- ===========================================================================
-- ACADEMIA SMQ · LOTE 3 (v1.0) · seed do módulo M07
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
  ('M07', 7, 2, 'Crédito imobiliário na prática', 'Ao final, você explica em linguagem de cliente como a Caixa decide, orienta cada tipo de renda com os documentos certos, encaminha o cliente com restrição à pré-análise sem prometer nem descartar e registra cada passo da análise, e isso aparece no CRM como análises com situação e resultado registrados no card "Análise de crédito".',
   '["Eu sou capaz de explicar ao cliente, em linguagem simples, os quatro filtros da análise e por que simulação não é aprovação.","Eu sou capaz de dizer, para cada tipo de renda (CLT, autônomo, MEI, aplicativo, sócio e aposentado), como ela se comprova e o que não conta como renda.","Eu sou capaz de ler a negação no fim da frase, acolher o cliente com restrição e encaminhá-lo à pré-análise antes de qualquer quitação.","Eu sou capaz de falar de crédito só com frases permitidas, sem prometer aprovação, taxa, parcela exata ou prazo.","Eu sou capaz de registrar no CRM a situação e o resultado de cada análise e de atualizar o cliente pelo menos a cada 5 dias úteis."]'::jsonb, 1.3, '75 min', true,
   '**Role-play em trio: "A análise que o cliente tem medo de fazer"** · 40 min

**Papéis:** Corretor, cliente com o cartão da persona e observador com a rubrica. Duas rodadas de 10 minutos por corretor (uma com a P2, outra com a P8), com os papéis se revezando; 10 minutos de devolutiva no fim.

**Persona:** P2 (entregador de aplicativo, F1) e P8 (nome com pendência), com os valores de treino da seção 9.13

**Roteiro:** O corretor liga para o cliente que acabou de dizer que tem interesse, descobre como ele comprova a renda e se o nome está limpo, explica em linguagem de cliente como a análise funciona, pede os documentos certos do perfil e termina com um próximo passo com dia e hora. Depois, registra a situação da análise e o desfecho como faria no CRM.

**Roteiro do cliente:**

- P2 começa: "É pra autônomo também?" Só revela que roda num aplicativo se o corretor perguntar como ele comprova a renda. Diz: "não gosto de mandar documento" e "tenho pouco tempo".
- P2 pergunta, se o corretor não falar antes: "Isso é golpe? Vão pedir alguma taxa?"
- P8 começa: "Tenho uma pendência pequena, dá?" Se o corretor perguntar do nome, responde: "nome tá limpo não".
- P8 diz, depois da explicação: "Então vou quitar primeiro e depois te procuro."
- P8 pergunta: "Se eu colocar uma renda um pouco maior, passa mais fácil?"

**O que o observador procura:**

- O tipo de renda perguntado antes do valor, com os documentos certos do perfil (aplicativo: relatórios de 4 meses do mesmo app).
- A negação no fim da frase lida corretamente e confirmada com uma pergunta curta.
- Pré-análise antes de qualquer quitação; nenhum descarte do cliente com restrição.
- Nenhuma promessa de aprovação, taxa ou parcela exata; renda real e comprovada, sem sugerir valor (critério 6 só com nota 5).
- Âncoras antigolpe ditas: análise gratuita, ninguém pede Pix, taxa ou senha, documento só pelo canal oficial.
- Linguagem de cliente, uma pergunta por vez e o próximo passo com dia e hora.
- Situação da análise e desfecho registrados como no CRM.

**Rubrica:** Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 3 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Correspondente de cada empreendimento: o gerente indica para qual correspondente vai a pasta (decisão 25, aberta). | [CONFIRMAR] Lista final de documentos da renda de aplicativo e critérios de comprometimento de renda, com o correspondente. | [CONFIRMAR] Coberturas do seguro obrigatório do financiamento, com o correspondente. | [CONFIRMAR] Taxa exata por sub-faixa na capital e redutor do cotista: a aula ensina "a taxa sai no simulador e se confirma na análise". | [CONFIRMAR] Com o correspondente: regra de idade na composição de renda (o participante mais velho costuma limitar o prazo). | [CONFIRMAR] Prazo típico de retorno da análise por correspondente (a aula ensina a não prometer prazo). | [GAP DE CRM] A aba "Documentação" não tem perfil próprio para renda de aplicativo; hoje ela vai em Autônomo / Informal com anotação nas observações. Proposta: perfil "Aplicativo" com a lista do perfil. | [DADO A MEDIR NO CRM] Taxa de aprovação de crédito e percentual de análises com resultado registrado, por corretor (o registro da carta de aprovação existe no card, mas a série histórica ainda não). | [CALIBRAR] Meta de aprovação por corretor, depois de 60 dias de registro das análises.', '{"formato":"canonico-8.2","lote":3,"versao_conteudo":"1.0","trilha":"T2","ordem":3,"nivel_alvo":"Intermediário","nivel_alvo_sistema":"intermediario","subtitulo":"Como a Caixa decide, cada renda com o seu caminho, restrição sem descarte e nenhuma promessa","duracao_min":75,"por_que_vale_dinheiro":{"texto":"A análise de crédito é onde a venda já está quase feita: de cada 115 clientes que entraram em análise em 90 dias, 45 fecharam. Ao mesmo tempo, 118 clientes QUENTES estavam parados em análise, os piores com mais de 70 dias sem movimento. Crédito bem conduzido destrava o dinheiro que já está no fundo do funil.","numero":"39,1% da análise de crédito para o fechamento (cascata de 90 dias); 118 clientes QUENTES parados em análise","fonte":"CRM SMQ, cascata de 90 dias e clientes quentes parados","periodo":"set/2026"},"pre_requisitos":["M04","M05","M21"],"indicador_crm":{"nome":"Análises com situação e resultado registrados (Enviada ao banco, Pendente, Aprovada, Aprovada com condição ou Reprovada) e tempo parado em \"Análise de crédito\"","onde_ler":"Card do cliente na etapa \"Análise de crédito\" e Fila Única (prioridade \"Pasta travada\"); para o gerente, Operação › Funil, na passagem de análise de crédito para fechamento","linha_de_base":"Passagem análise de crédito para fechado: 39,1% (cascata de 90 dias, set/2026); 118 clientes QUENTES parados em análise (set/2026); taxa de aprovação e análises com resultado registrado: [DADO A MEDIR NO CRM]","meta_sugerida":"100% das análises com situação atualizada e nenhum cliente em análise sem notícia há mais de 5 dias úteis; meta de aprovação [CALIBRAR]","fonte":"CRM SMQ, set/2026","gap_de_crm":false},"pratica":{"tipo":"Role-play em trio: \"A análise que o cliente tem medo de fazer\"","duracao_min":40,"persona":"P2 (entregador de aplicativo, F1) e P8 (nome com pendência), com os valores de treino da seção 9.13","rubrica":"Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"Corretor, cliente com o cartão da persona e observador com a rubrica. Duas rodadas de 10 minutos por corretor (uma com a P2, outra com a P8), com os papéis se revezando; 10 minutos de devolutiva no fim.","roteiro":"O corretor liga para o cliente que acabou de dizer que tem interesse, descobre como ele comprova a renda e se o nome está limpo, explica em linguagem de cliente como a análise funciona, pede os documentos certos do perfil e termina com um próximo passo com dia e hora. Depois, registra a situação da análise e o desfecho como faria no CRM.","roteiro_cliente":["P2 começa: \"É pra autônomo também?\" Só revela que roda num aplicativo se o corretor perguntar como ele comprova a renda. Diz: \"não gosto de mandar documento\" e \"tenho pouco tempo\".","P2 pergunta, se o corretor não falar antes: \"Isso é golpe? Vão pedir alguma taxa?\"","P8 começa: \"Tenho uma pendência pequena, dá?\" Se o corretor perguntar do nome, responde: \"nome tá limpo não\".","P8 diz, depois da explicação: \"Então vou quitar primeiro e depois te procuro.\"","P8 pergunta: \"Se eu colocar uma renda um pouco maior, passa mais fácil?\""],"observador_procura":["O tipo de renda perguntado antes do valor, com os documentos certos do perfil (aplicativo: relatórios de 4 meses do mesmo app).","A negação no fim da frase lida corretamente e confirmada com uma pergunta curta.","Pré-análise antes de qualquer quitação; nenhum descarte do cliente com restrição.","Nenhuma promessa de aprovação, taxa ou parcela exata; renda real e comprovada, sem sugerir valor (critério 6 só com nota 5).","Âncoras antigolpe ditas: análise gratuita, ninguém pede Pix, taxa ou senha, documento só pelo canal oficial.","Linguagem de cliente, uma pergunta por vez e o próximo passo com dia e hora.","Situação da análise e desfecho registrados como no CRM."]},"desafio_campo":{"tarefa":"Pastas que andam: em 72 horas, leve 2 clientes com a pasta completa até o correspondente do empreendimento, depois da revisão do gerente, com a análise registrada no CRM. Se você já tem clientes em análise, atualize todos os que estão há mais de 5 dias úteis sem notícia.","prazo_horas":72,"evidencia_no_crm":"Duas análises com a situação \"Enviada ao banco\" no card \"Análise de crédito\", com o correspondente e os documentos nas Observações; na aba \"Documentação\", os documentos do perfil como Recebido; desfecho de atualização registrado para cada cliente em análise há mais de 5 dias úteis","como_o_gestor_confere":"O gerente abre o card de cada cliente do corretor na etapa \"Análise de crédito\", confere a situação registrada, a data da revisão dele e o perfil da pasta na aba \"Documentação\", e procura na Fila Única do corretor clientes em \"Pasta travada\" sem desfecho recente. Esperado: 2 pastas enviadas e nenhum cliente em análise sem notícia há mais de 5 dias úteis."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do CRM (a recomendação padrão da decisão 18: o diretor grava M00, M15 e M24)","cenario":"Escritório da SMQ, com o card \"Análise de crédito\" aberto na tela e um celular mostrando uma conversa de WhatsApp anonimizada","blocos":[{"tempo":"0:00","fala":"\"Nome tá limpo não.\" Lê de novo. Não está limpo. Essa frase já custou venda aqui. Hoje você aprende a não perder a próxima.","na_tela":"A mensagem de WhatsApp com a negação destacada no fim"},{"tempo":"0:20","fala":"A análise é onde a venda quase fechou. De cada 115 clientes que entraram em análise em 90 dias, 45 fecharam. E tinha 118 clientes quentes parados em análise, sem notícia.","na_tela":"Números da casa, set/2026, com a fonte"},{"tempo":"0:50","fala":"A Caixa olha quatro coisas: renda que se comprova, nome, idade mais prazo e o imóvel. O simulador não olha tudo isso. Por isso: simulação indica, análise formal aprova.","na_tela":"Os quatro filtros em cartões"},{"tempo":"1:30","fala":"Cada renda tem o seu caminho. CLT no holerite. Autônomo no extrato e no imposto. Aplicativo nos relatórios de 4 meses do mesmo app. E o que não conta, não entra: Bolsa Família, BPC, seguro-desemprego.","na_tela":"Tabela de perfis de renda e documentos"},{"tempo":"2:20","fala":"Restrição no nome é farol amarelo. Acolhe, pergunta com quem é a pendência e manda para a pré-análise antes de o cliente pagar qualquer coisa.","na_tela":"Role-play curto com a persona P8"},{"tempo":"3:00","fala":"Agora no CRM: situação da análise no card, carta anexada na aprovação, condição do banco escrita, motivo exato na reprovação.","na_tela":"Card \"Análise de crédito\": Enviada ao banco, Anexar aprovação, Aprovar c/ condição, Reprovar"},{"tempo":"3:50","fala":"O erro que mais vejo: \"com certeza aprova\". No primeiro pedido de pendência, o cliente lembra da promessa, não da pendência.","na_tela":"A frase proibida riscada e a frase permitida ao lado"},{"tempo":"4:20","fala":"Seu desafio: em 72 horas, duas pastas completas, revisadas comigo, enviadas ao correspondente e registradas. E nenhum cliente em análise sem notícia há mais de 5 dias úteis.","na_tela":"O desafio de campo em texto"},{"tempo":"4:45","fala":"Simulação indica. Análise formal aprova.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 3, 4, 9.1, 9.8, 9.9, 9.12 (casos F, L e N), 9.13 (P2, P8 e P11), 9.16 e 9.17 do super prompt","Estudo da Academia v2.1: seções 3.3, 5.7, 13 (integridade da pasta) e situações das Fases D, J e K","CRM SMQ: card \"Análise de crédito\" (situações, \"Anexar aprovação\", \"Aprovar c/ condição\", \"Reprovar\"), aba \"Documentação\" do Dossiê e motivos de perda de crédito, conferidos no código em 29/09/2026","Conteúdo anterior do M07 (Notion, abr/2026): mantidos o seguro obrigatório e a regra de idade; o SAC como padrão virou PRICE"],"origem":"SMQ","pendencias":["[CONFIRMAR] Correspondente de cada empreendimento: o gerente indica para qual correspondente vai a pasta (decisão 25, aberta).","[CONFIRMAR] Lista final de documentos da renda de aplicativo e critérios de comprometimento de renda, com o correspondente.","[CONFIRMAR] Coberturas do seguro obrigatório do financiamento, com o correspondente.","[CONFIRMAR] Taxa exata por sub-faixa na capital e redutor do cotista: a aula ensina \"a taxa sai no simulador e se confirma na análise\".","[CONFIRMAR] Com o correspondente: regra de idade na composição de renda (o participante mais velho costuma limitar o prazo).","[CONFIRMAR] Prazo típico de retorno da análise por correspondente (a aula ensina a não prometer prazo).","[GAP DE CRM] A aba \"Documentação\" não tem perfil próprio para renda de aplicativo; hoje ela vai em Autônomo / Informal com anotação nas observações. Proposta: perfil \"Aplicativo\" com a lista do perfil.","[DADO A MEDIR NO CRM] Taxa de aprovação de crédito e percentual de análises com resultado registrado, por corretor (o registro da carta de aprovação existe no card, mas a série histórica ainda não).","[CALIBRAR] Meta de aprovação por corretor, depois de 60 dias de registro das análises."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M07-A1', 'M07-A2', 'M07-A3', 'M07-A4', 'M07-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M07-Q01', 'M07-Q02', 'M07-Q03', 'M07-Q04', 'M07-Q05', 'M07-Q06', 'M07-Q07', 'M07-Q08', 'M07-Q09', 'M07-Q10', 'M07-Q11', 'M07-Q12', 'M07-Q13', 'M07-Q14', 'M07-Q15', 'M07-Q16', 'M07-Q17', 'M07-Q18', 'M07-Q19', 'M07-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M07-F01', 'M07-F02', 'M07-F03', 'M07-F04', 'M07-F05', 'M07-F06', 'M07-F07', 'M07-F08', 'M07-F09', 'M07-F10', 'M07-F11', 'M07-F12', 'M07-F13', 'M07-F14');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 14;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M07-A1', 1, 'Como a Caixa decide (e o que o corretor faz antes dela)', 'texto',
  'Cliente aprovado na simulação, pasta enviada, e três semanas depois a resposta: reprovado. Ninguém mentiu. O PDF do simulador era capacidade estimada, e a Caixa olhou o que o simulador não olha: o nome, as dívidas parceladas, a renda que se comprova e o laudo da unidade.

### Por que importa

No CRM, 118 clientes QUENTES estavam parados em análise de crédito (set/2026). E de cada 115 que entram em análise, 45 fecham (39,1%, cascata de 90 dias). A análise é o ponto onde a venda já está quase feita. Quem entende como o banco decide monta a pasta certa, prepara o cliente para o resultado e não promete o que não controla.

### O conceito

Pense num exame médico. O corretor faz a triagem na recepção (enquadra, simula como estimativa e junta os exames certos); quem dá o laudo é o médico. Na compra MCMV, o médico é a Caixa, e o correspondente bancário do empreendimento é quem leva o paciente até ele. O corretor não calcula aprovação: ele enquadra, simula e entrega a pasta certa.

### O método SMQ, passo a passo

1. Os quatro filtros da análise: renda comprovada (a parcela, com seguros e taxa de administração, cabe em até cerca de 30% da renda bruta familiar), cadastro e nome (restrição e comprometimento pesam mais que o score sozinho), idade mais prazo (até 80 anos e 6 meses) e o imóvel (a Caixa financia até 80% do menor valor entre preço e laudo, conta que o M08 aprofunda). Regras vigentes em set/2026, confirmar com o correspondente.
2. Quem decide o quê: você enquadra e simula; o seu gerente revisa a pasta; o correspondente do empreendimento conduz a análise na Caixa; a Caixa aprova, aprova com condição, pede pendência ou reprova. "O seu gerente te diz para qual correspondente vai a pasta."
3. Simulação indica, análise formal aprova. O PDF do simulador não é aprovação: é capacidade estimada. Diga isso ao cliente antes de mostrar qualquer número.
4. Amortização nos exemplos: PRICE, parcela fixa, validada contra o simulador da Caixa. SAC entra só como comparação, quando o cliente perguntar.
5. O seguro já vem na parcela: o financiamento habitacional tem seguro obrigatório para morte e invalidez permanente e para danos ao imóvel. Ele não cobre desemprego (confirmar coberturas com o correspondente). Fale disso antes, para não virar surpresa.
6. Registre cada passo da análise no card do cliente: é o CRM que mostra ao gerente onde a venda está parada.

### Na vida real

**O caso:** Caso N: da análise gratuita à assinatura em 23 dias (jan a fev/2026, cliente e corretora anônimos).

**O que foi dito:** No dia 3, a primeira aprovação. No dia 11, depois da visita, apareceu uma restrição interna do banco que não estava no Serasa. A corretora não prometeu nada: entendeu o tipo de restrição, orientou o caminho e, minutos depois de o cliente avisar que resolveu na agência, escreveu: "Já mandei pra fila novamente, pra rodarem."

**O que aconteceu:** A análise rodou de novo e foi aprovada às 15h26 do dia 18; o contrato foi assinado no dia seguinte. A lição: o banco olha coisas que o simulador não vê, e presença no crédito até destravar vale mais que promessa.

### Scripts prontos

#### Ligação · O cliente viu a simulação e pergunta "então tá aprovado?"

> Ainda não, e eu prefiro te falar isso agora. A simulação mostra que o seu perfil tem condições. Quem confirma é a análise da Caixa, que olha renda comprovada, nome e o imóvel. A análise é gratuita e não te obriga a nada. Posso já montar a sua pasta hoje?

**Por que funciona:** Separa estimativa de aprovação sem tirar o ânimo, lembra que a análise é gratuita e termina num próximo passo concreto.

#### WhatsApp · Explicar o seguro que vem na parcela

> Uma coisa que eu gosto de falar antes: a parcela já inclui um seguro obrigatório. Ele cobre morte, invalidez e danos ao imóvel. Desemprego ele não cobre, tá? Quer que eu te explique o resto por ligação?

**Por que funciona:** Antecipa a surpresa, diz o limite do seguro com verdade e abre espaço para a ligação.

### Erros que matam a venda

- **Mandar o PDF do simulador dizendo "olha a sua aprovação"**  
  Quanto custa: Quando a análise pede pendência ou reprova, o cliente se sente enganado e a confiança acaba  
  Correção: "Simulação indica, análise formal aprova", dito antes do número
- **Apresentar a simulação em SAC como padrão**  
  Quanto custa: A primeira parcela aparece maior do que o cliente espera e a conversa trava  
  Correção: PRICE nos exemplos; SAC só como comparação, se o cliente pedir
- **Omitir o seguro e a taxa de administração**  
  Quanto custa: A parcela real vem maior que a falada e parece truque  
  Correção: Falar que a estimativa já inclui seguros e taxa, e que o seguro não cobre desemprego

### No CRM

- **Tela:** Card do cliente na etapa "Análise de crédito"
- **Ação:** Abrir a análise e registrar a situação: Enviada ao banco, Pendente (aguardando docs), Aprovada, Aprovada com condição ou Reprovada
- **Campo:** Situação e Observações (banco ou correspondente, documentos enviados, renda considerada)
- **Regra:** Todo passo da análise fica no card no mesmo dia; o que não está registrado não aconteceu

### Frase-âncora

> **Simulação indica. Análise formal aprova.**

### Checagem rápida

1. Quais são os quatro filtros que a Caixa olha?  
   Resposta: Renda comprovada, cadastro e nome, idade mais prazo e o imóvel (80% do menor valor entre preço e laudo).
2. Quem conduz a análise na Caixa?  
   Resposta: O correspondente bancário do empreendimento; o gerente diz para qual correspondente vai a pasta.
3. O seguro do financiamento cobre desemprego?  
   Resposta: Não. Cobre morte e invalidez permanente e danos ao imóvel (confirmar coberturas com o correspondente).',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Cliente aprovado na simulação, pasta enviada, e três semanas depois a resposta: reprovado. Ninguém mentiu. O PDF do simulador era capacidade estimada, e a Caixa olhou o que o simulador não olha: o nome, as dívidas parceladas, a renda que se comprova e o laudo da unidade.","por_que_importa":"No CRM, 118 clientes QUENTES estavam parados em análise de crédito (set/2026). E de cada 115 que entram em análise, 45 fecham (39,1%, cascata de 90 dias). A análise é o ponto onde a venda já está quase feita. Quem entende como o banco decide monta a pasta certa, prepara o cliente para o resultado e não promete o que não controla.","conceito":"Pense num exame médico. O corretor faz a triagem na recepção (enquadra, simula como estimativa e junta os exames certos); quem dá o laudo é o médico. Na compra MCMV, o médico é a Caixa, e o correspondente bancário do empreendimento é quem leva o paciente até ele. O corretor não calcula aprovação: ele enquadra, simula e entrega a pasta certa.","metodo":["Os quatro filtros da análise: renda comprovada (a parcela, com seguros e taxa de administração, cabe em até cerca de 30% da renda bruta familiar), cadastro e nome (restrição e comprometimento pesam mais que o score sozinho), idade mais prazo (até 80 anos e 6 meses) e o imóvel (a Caixa financia até 80% do menor valor entre preço e laudo, conta que o M08 aprofunda). Regras vigentes em set/2026, confirmar com o correspondente.","Quem decide o quê: você enquadra e simula; o seu gerente revisa a pasta; o correspondente do empreendimento conduz a análise na Caixa; a Caixa aprova, aprova com condição, pede pendência ou reprova. \"O seu gerente te diz para qual correspondente vai a pasta.\"","Simulação indica, análise formal aprova. O PDF do simulador não é aprovação: é capacidade estimada. Diga isso ao cliente antes de mostrar qualquer número.","Amortização nos exemplos: PRICE, parcela fixa, validada contra o simulador da Caixa. SAC entra só como comparação, quando o cliente perguntar.","O seguro já vem na parcela: o financiamento habitacional tem seguro obrigatório para morte e invalidez permanente e para danos ao imóvel. Ele não cobre desemprego (confirmar coberturas com o correspondente). Fale disso antes, para não virar surpresa.","Registre cada passo da análise no card do cliente: é o CRM que mostra ao gerente onde a venda está parada."],"na_vida_real":{"caso":"Caso N: da análise gratuita à assinatura em 23 dias (jan a fev/2026, cliente e corretora anônimos).","o_que_foi_dito":"No dia 3, a primeira aprovação. No dia 11, depois da visita, apareceu uma restrição interna do banco que não estava no Serasa. A corretora não prometeu nada: entendeu o tipo de restrição, orientou o caminho e, minutos depois de o cliente avisar que resolveu na agência, escreveu: \"Já mandei pra fila novamente, pra rodarem.\"","resultado":"A análise rodou de novo e foi aprovada às 15h26 do dia 18; o contrato foi assinado no dia seguinte. A lição: o banco olha coisas que o simulador não vê, e presença no crédito até destravar vale mais que promessa.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"Ligação","situacao":"O cliente viu a simulação e pergunta \"então tá aprovado?\"","texto":"Ainda não, e eu prefiro te falar isso agora. A simulação mostra que o seu perfil tem condições. Quem confirma é a análise da Caixa, que olha renda comprovada, nome e o imóvel. A análise é gratuita e não te obriga a nada. Posso já montar a sua pasta hoje?","por_que_funciona":"Separa estimativa de aprovação sem tirar o ânimo, lembra que a análise é gratuita e termina num próximo passo concreto."},{"canal":"WhatsApp","situacao":"Explicar o seguro que vem na parcela","texto":"Uma coisa que eu gosto de falar antes: a parcela já inclui um seguro obrigatório. Ele cobre morte, invalidez e danos ao imóvel. Desemprego ele não cobre, tá? Quer que eu te explique o resto por ligação?","por_que_funciona":"Antecipa a surpresa, diz o limite do seguro com verdade e abre espaço para a ligação."}],"erros_que_matam":[{"erro":"Mandar o PDF do simulador dizendo \"olha a sua aprovação\"","custo":"Quando a análise pede pendência ou reprova, o cliente se sente enganado e a confiança acaba","correcao":"\"Simulação indica, análise formal aprova\", dito antes do número"},{"erro":"Apresentar a simulação em SAC como padrão","custo":"A primeira parcela aparece maior do que o cliente espera e a conversa trava","correcao":"PRICE nos exemplos; SAC só como comparação, se o cliente pedir"},{"erro":"Omitir o seguro e a taxa de administração","custo":"A parcela real vem maior que a falada e parece truque","correcao":"Falar que a estimativa já inclui seguros e taxa, e que o seguro não cobre desemprego"}],"no_crm":{"tela":"Card do cliente na etapa \"Análise de crédito\"","acao":"Abrir a análise e registrar a situação: Enviada ao banco, Pendente (aguardando docs), Aprovada, Aprovada com condição ou Reprovada","campo":"Situação e Observações (banco ou correspondente, documentos enviados, renda considerada)","regra":"Todo passo da análise fica no card no mesmo dia; o que não está registrado não aconteceu"},"frase_ancora":"Simulação indica. Análise formal aprova.","checagem_rapida":[{"pergunta":"Quais são os quatro filtros que a Caixa olha?","resposta":"Renda comprovada, cadastro e nome, idade mais prazo e o imóvel (80% do menor valor entre preço e laudo)."},{"pergunta":"Quem conduz a análise na Caixa?","resposta":"O correspondente bancário do empreendimento; o gerente diz para qual correspondente vai a pasta."},{"pergunta":"O seguro do financiamento cobre desemprego?","resposta":"Não. Cobre morte e invalidez permanente e danos ao imóvel (confirmar coberturas com o correspondente)."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M07-A2', 2, 'Cada renda, um caminho: CLT, autônomo, aplicativo, sócio e aposentado', 'texto',
  '"É pra autônomo também?" Essa pergunta chega todo dia. Metade dos corretores responde "acho que sim" e a outra metade diz "precisa de holerite". As duas respostas perdem venda. A resposta certa começa com outra pergunta: como você comprova o que ganha?

### Por que importa

A análise não aprova a renda que o cliente fala: aprova a renda que ele comprova. Nas análises de jul/2026 (112), a F1 tinha renda média de R$ 2.264 e a F2 de R$ 4.244: é exatamente o público do autônomo, do MEI e do entregador de aplicativo. Saber o caminho de cada renda é o que transforma "acho que não dá" em pasta enviada.

### O conceito

Renda é como passaporte: não basta ter viajado, precisa do carimbo. O CLT tem o carimbo no holerite; o autônomo, no extrato e no imposto; o MEI, no faturamento; o entregador, no relatório do aplicativo; o sócio, no pró-labore e no imposto. O corretor não inventa carimbo: descobre qual o cliente já tem.

### O método SMQ, passo a passo

1. Pergunte o tipo de renda antes do valor: "Você trabalha registrado, por conta própria, por aplicativo ou tem empresa?"
2. CLT: 3 últimos holerites, carteira de trabalho digital e imposto de renda com recibo, se declara.
3. Autônomo: imposto com recibo, extratos bancários de 6 meses e DECORE quando pedido. MEI: guias DAS; a Caixa usa a média do faturamento, não o valor declarado.
4. Motorista ou entregador de aplicativo: a renda passou a contar como formal (regra divulgada entre jul e ago/2026). O que se sabe: 4 meses seguidos na mesma plataforma, relatório mais recente com no máximo 2 meses, resumo mensal emitido pela plataforma, vale o mês de menor valor, não exige MEI nem imposto (confirmar a lista com o correspondente).
5. Empresário ou sócio: contrato social, pró-labore de 3 meses, imposto da pessoa física e extratos da pessoa física e da empresa.
6. Aposentado: extrato do benefício e a regra de idade: idade mais prazo até 80 anos e 6 meses. Exemplo: 58 anos, prazo máximo de 22 anos e 6 meses.
7. O que não conta como renda: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS. Dinheiro "em mãos" sem comprovação também não conta.
8. Renda 100% informal sem comprovação: orientar a formalização ou compor renda com quem vai entrar no contrato. Nunca descartar.
9. Renda declarada de até R$ 3.000: confirme se é bruta ou líquida e se há composição antes de dar a boa notícia de enquadramento (o M05 aprofunda).

### Na vida real

**O caso:** Caso L: a renda de aplicativo que reabriu a conversa (ago/2026).

**O que foi dito:** Leads que já tinham desistido voltaram quando ouviram que a renda de motorista e entregador passou a contar na análise. A mensagem fechava com uma pergunta só: "Você roda em qual aplicativo?"

**O que aconteceu:** A conversa voltou a andar sem promessa: a novidade era real, a data da regra não foi cravada e o próximo passo era a lista de documentos do perfil.

### Scripts prontos

#### WhatsApp · Entregador de aplicativo pergunta se consegue financiar

> Consegue entrar na análise, sim! A renda de aplicativo agora conta. Pra montar certinho, preciso dos relatórios dos últimos 4 meses do mesmo app. Você roda em qual aplicativo?

**Por que funciona:** Notícia boa sem promessa de aprovação, o documento certo do perfil e uma pergunta só no final.

#### Ligação · Autônomo sem holerite acha que não tem chance

> Holerite não é o único jeito de comprovar. Quem trabalha por conta mostra a renda no extrato do banco e no imposto de renda. Você recebe os seus pagamentos numa conta no seu nome?

**Por que funciona:** Troca o medo por um caminho e descobre, com uma pergunta simples, se existe comprovação.

#### WhatsApp · O cliente pergunta "qual renda eu informo?"

> A renda real, a que você consegue comprovar. É ela que protege você lá na frente. O correspondente te orienta como documentar certinho. Você tem os extratos dos últimos 6 meses?

**Por que funciona:** Aplica a regra da integridade da pasta sem sermão e já puxa o próximo documento.

### Erros que matam a venda

- **Descartar o autônomo ou o informal na primeira conversa**  
  Quanto custa: Venda perdida que tinha caminho (extrato, imposto, composição)  
  Correção: Descobrir como ele comprova e, se não comprova, orientar formalização ou composição
- **Sugerir um valor de renda, de pró-labore ou de holerite para "bater" com a aprovação**  
  Quanto custa: Risco grave para o cliente, para o corretor e para a SMQ; a pasta pode ser contestada  
  Correção: A renda real e comprovada define a aprovação, nunca o contrário; o correspondente orienta a documentação
- **Somar Bolsa Família ou auxílio-doença na renda**  
  Quanto custa: A capacidade simulada não existe e a análise derruba  
  Correção: Só entra renda que conta e se comprova

### No CRM

- **Tela:** Dossiê do cliente, aba "Documentação"
- **Ação:** Escolher o perfil de renda (CLT, Autônomo / Informal, Empresário / PJ ou Aposentado / Pensionista) e acompanhar cada documento
- **Campo:** Status de cada documento: Pendente, Recebido, Aprovado ou Reprovado; o tipo de renda também vai na ficha
- **Regra:** O perfil da pasta é o perfil real da renda; aplicativo vai em Autônomo / Informal com os relatórios do app anotados nas observações [GAP DE CRM: não há perfil próprio para renda de aplicativo]

### Frase-âncora

> **A análise não aprova a renda que se fala. Aprova a renda que se comprova.**

### Checagem rápida

1. Quais rendas não contam na análise?  
   Resposta: Bolsa Família, BPC, seguro-desemprego, auxílio-doença, FGTS e dinheiro sem comprovação.
2. Na renda de aplicativo, qual mês vale?  
   Resposta: O de menor valor, entre 4 meses seguidos na mesma plataforma (confirmar com o correspondente).
3. Como a Caixa considera a renda do MEI?  
   Resposta: Pela média do faturamento, não pelo valor declarado.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"É pra autônomo também?\" Essa pergunta chega todo dia. Metade dos corretores responde \"acho que sim\" e a outra metade diz \"precisa de holerite\". As duas respostas perdem venda. A resposta certa começa com outra pergunta: como você comprova o que ganha?","por_que_importa":"A análise não aprova a renda que o cliente fala: aprova a renda que ele comprova. Nas análises de jul/2026 (112), a F1 tinha renda média de R$ 2.264 e a F2 de R$ 4.244: é exatamente o público do autônomo, do MEI e do entregador de aplicativo. Saber o caminho de cada renda é o que transforma \"acho que não dá\" em pasta enviada.","conceito":"Renda é como passaporte: não basta ter viajado, precisa do carimbo. O CLT tem o carimbo no holerite; o autônomo, no extrato e no imposto; o MEI, no faturamento; o entregador, no relatório do aplicativo; o sócio, no pró-labore e no imposto. O corretor não inventa carimbo: descobre qual o cliente já tem.","metodo":["Pergunte o tipo de renda antes do valor: \"Você trabalha registrado, por conta própria, por aplicativo ou tem empresa?\"","CLT: 3 últimos holerites, carteira de trabalho digital e imposto de renda com recibo, se declara.","Autônomo: imposto com recibo, extratos bancários de 6 meses e DECORE quando pedido. MEI: guias DAS; a Caixa usa a média do faturamento, não o valor declarado.","Motorista ou entregador de aplicativo: a renda passou a contar como formal (regra divulgada entre jul e ago/2026). O que se sabe: 4 meses seguidos na mesma plataforma, relatório mais recente com no máximo 2 meses, resumo mensal emitido pela plataforma, vale o mês de menor valor, não exige MEI nem imposto (confirmar a lista com o correspondente).","Empresário ou sócio: contrato social, pró-labore de 3 meses, imposto da pessoa física e extratos da pessoa física e da empresa.","Aposentado: extrato do benefício e a regra de idade: idade mais prazo até 80 anos e 6 meses. Exemplo: 58 anos, prazo máximo de 22 anos e 6 meses.","O que não conta como renda: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS. Dinheiro \"em mãos\" sem comprovação também não conta.","Renda 100% informal sem comprovação: orientar a formalização ou compor renda com quem vai entrar no contrato. Nunca descartar.","Renda declarada de até R$ 3.000: confirme se é bruta ou líquida e se há composição antes de dar a boa notícia de enquadramento (o M05 aprofunda)."],"na_vida_real":{"caso":"Caso L: a renda de aplicativo que reabriu a conversa (ago/2026).","o_que_foi_dito":"Leads que já tinham desistido voltaram quando ouviram que a renda de motorista e entregador passou a contar na análise. A mensagem fechava com uma pergunta só: \"Você roda em qual aplicativo?\"","resultado":"A conversa voltou a andar sem promessa: a novidade era real, a data da regra não foi cravada e o próximo passo era a lista de documentos do perfil.","fonte":"Casoteca SMQ, caso L (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Entregador de aplicativo pergunta se consegue financiar","texto":"Consegue entrar na análise, sim! A renda de aplicativo agora conta. Pra montar certinho, preciso dos relatórios dos últimos 4 meses do mesmo app. Você roda em qual aplicativo?","por_que_funciona":"Notícia boa sem promessa de aprovação, o documento certo do perfil e uma pergunta só no final."},{"canal":"Ligação","situacao":"Autônomo sem holerite acha que não tem chance","texto":"Holerite não é o único jeito de comprovar. Quem trabalha por conta mostra a renda no extrato do banco e no imposto de renda. Você recebe os seus pagamentos numa conta no seu nome?","por_que_funciona":"Troca o medo por um caminho e descobre, com uma pergunta simples, se existe comprovação."},{"canal":"WhatsApp","situacao":"O cliente pergunta \"qual renda eu informo?\"","texto":"A renda real, a que você consegue comprovar. É ela que protege você lá na frente. O correspondente te orienta como documentar certinho. Você tem os extratos dos últimos 6 meses?","por_que_funciona":"Aplica a regra da integridade da pasta sem sermão e já puxa o próximo documento."}],"erros_que_matam":[{"erro":"Descartar o autônomo ou o informal na primeira conversa","custo":"Venda perdida que tinha caminho (extrato, imposto, composição)","correcao":"Descobrir como ele comprova e, se não comprova, orientar formalização ou composição"},{"erro":"Sugerir um valor de renda, de pró-labore ou de holerite para \"bater\" com a aprovação","custo":"Risco grave para o cliente, para o corretor e para a SMQ; a pasta pode ser contestada","correcao":"A renda real e comprovada define a aprovação, nunca o contrário; o correspondente orienta a documentação"},{"erro":"Somar Bolsa Família ou auxílio-doença na renda","custo":"A capacidade simulada não existe e a análise derruba","correcao":"Só entra renda que conta e se comprova"}],"no_crm":{"tela":"Dossiê do cliente, aba \"Documentação\"","acao":"Escolher o perfil de renda (CLT, Autônomo / Informal, Empresário / PJ ou Aposentado / Pensionista) e acompanhar cada documento","campo":"Status de cada documento: Pendente, Recebido, Aprovado ou Reprovado; o tipo de renda também vai na ficha","regra":"O perfil da pasta é o perfil real da renda; aplicativo vai em Autônomo / Informal com os relatórios do app anotados nas observações [GAP DE CRM: não há perfil próprio para renda de aplicativo]"},"frase_ancora":"A análise não aprova a renda que se fala. Aprova a renda que se comprova.","checagem_rapida":[{"pergunta":"Quais rendas não contam na análise?","resposta":"Bolsa Família, BPC, seguro-desemprego, auxílio-doença, FGTS e dinheiro sem comprovação."},{"pergunta":"Na renda de aplicativo, qual mês vale?","resposta":"O de menor valor, entre 4 meses seguidos na mesma plataforma (confirmar com o correspondente)."},{"pergunta":"Como a Caixa considera a renda do MEI?","resposta":"Pela média do faturamento, não pelo valor declarado."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M07-A3', 3, 'Nome com pendência, dívidas e análise aberta em outro lugar', 'texto',
  '"Nome tá limpo não." O corretor leu rápido, entendeu "tá limpo", comemorou e mandou a lista de documentos. Duas semanas depois, reprovação por restrição. A negação estava no fim da frase, e a venda também.

### Por que importa

O dossiê chega ao corretor sem a informação de restrição no nome em 69,5% dos casos (jul a set/2026); no pico de campanha de set/2026, faltou em 81%. Ou seja: quase sempre é você quem descobre. Descobrir cedo, ler certo e mandar para a pré-análise é o que evita duas perdas: o cliente que quita a dívida à toa e continua reprovado, e o cliente que some de vergonha.

### O conceito

Restrição no nome é como um farol amarelo, não vermelho. Não dá para acelerar como se nada fosse, mas também não é para desligar o carro. Quem diz se passa é o correspondente, na pré-análise. O corretor acolhe, investiga o tipo de pendência e encaminha, sem prometer e sem descartar.

### O método SMQ, passo a passo

1. Pergunte com naturalidade, na qualificação: "Hoje o seu nome está limpo na praça, ou tem alguma pendência?" (o M16 mostra onde essa pergunta entra na espinha).
2. Leia a negação no fim da frase: "tá bom não" quer dizer não está bom; "nome tá limpo não" quer dizer que não está limpo. Na dúvida, confirme com uma pergunta curta.
3. Acolha sem julgar e investigue: é dívida com banco, loja, cartão ou restrição interna do próprio banco? Há quanto tempo? Qual o valor aproximado?
4. Não mande quitar antes: restrição no nome não descarta o lead, vai para a pré-análise com o correspondente antes de o cliente pagar qualquer dívida.
5. Dívidas parceladas pesam: empréstimo, carro e cartão entram no comprometimento de renda; o aluguel de hoje não impede o financiamento. Score baixo sozinho não é sentença (confirmar critérios com o correspondente).
6. Análise aberta em outro lugar: pergunte se o cliente já fez análise com outra construtora ou banco; pode ser preciso a carta de cancelamento da anterior. "Já fui aprovado em outra construtora" vira pedido de documento: cada unidade tem a sua avaliação.
7. Registre o que descobriu nas Observações da análise, sem expor o cliente: o gerente precisa saber para orientar a pasta.

### Na vida real

**O caso:** Caso F: "Já fui aprovado em outra construtora" (1:1 de gestão, abr/2026).

**O que foi dito:** A resposta que virou modelo, na linha de: "Cada projeto tem a sua avaliação, de cada unidade. Pode ser que aqui seja diferente da análise que você fez na outra construtora, pra mais ou pra menos. Eu só vou saber de verdade se você me mandar a documentação."

**O que aconteceu:** A objeção virou pedido de documento, sem discutir a aprovação antiga e sem prometer a nova. É a mesma lógica da restrição: quem responde é a análise, e o corretor leva a pasta até ela.

### Scripts prontos

#### WhatsApp · O cliente responde "nome tá limpo não"

> Obrigado pela sinceridade, isso ajuda muito. Pendência não quer dizer que não dá. Antes de você pagar qualquer coisa, a gente faz uma pré-análise, sem custo. A pendência é com banco, loja ou cartão?

**Por que funciona:** Lê a negação certa, acolhe sem prometer, impede a quitação às cegas e investiga com uma pergunta só.

#### Ligação · O cliente quer quitar a dívida antes de mandar documentos

> Segura esse dinheiro por enquanto. Primeiro o correspondente olha a sua situação, sem custo nenhum. Às vezes a pessoa quita e o que travava era outra coisa, e aí o dinheiro faria falta na entrada. Me manda os documentos hoje ou amanhã de manhã?

**Por que funciona:** Protege o caixa do cliente, explica o porquê com um exemplo simples e fecha com duas opções.

#### WhatsApp · O cliente conta que já fez análise em outra construtora

> Boa, então você já conhece o caminho! Cada unidade tem a sua avaliação, pra mais ou pra menos. Pode ser preciso cancelar a análise anterior, eu te oriento. Você lembra em qual banco foi?

**Por que funciona:** Valoriza o que o cliente já fez, avisa da carta de cancelamento sem assustar e pega a informação que o correspondente vai pedir.

### Erros que matam a venda

- **Ler "nome tá limpo não" como nome limpo**  
  Quanto custa: Pasta montada sobre informação errada e reprovação semanas depois  
  Correção: Negação no fim da frase; na dúvida, pergunta curta de confirmação
- **Mandar o cliente quitar a dívida antes da pré-análise**  
  Quanto custa: O cliente gasta o dinheiro da entrada e pode continuar reprovado por outro motivo  
  Correção: Pré-análise com o correspondente antes de quitar qualquer coisa
- **Descartar o lead com restrição ("volta quando limpar o nome")**  
  Quanto custa: O cliente some de vergonha e compra com quem acolheu  
  Correção: Acolher, investigar o tipo e encaminhar à pré-análise
- **Dizer "vai aprovar mesmo assim"**  
  Quanto custa: Promessa proibida; quando não aprova, a confiança acaba  
  Correção: "Quem confirma é a análise; eu acompanho com você até a resposta"

### No CRM

- **Tela:** Card do cliente, "Análise de crédito" e aba "Qualificação" do Dossiê
- **Ação:** Registrar a situação do nome e o tipo de pendência; se virar perda, usar o motivo verdadeiro
- **Campo:** Observações da análise; motivo de perda "Crédito: score/negativado" só quando a análise confirmar
- **Regra:** Restrição não é motivo de perda antes da pré-análise

### Frase-âncora

> **Restrição é farol amarelo. Quem diz se passa é a análise, não o medo.**

### Checagem rápida

1. O que quer dizer "tenho não"?  
   Resposta: Não tenho. A negação vem no fim da frase.
2. O cliente com restrição deve quitar a dívida antes de mandar documentos?  
   Resposta: Não. Primeiro a pré-análise com o correspondente, depois a orientação.
3. O aluguel que o cliente paga hoje impede o financiamento?  
   Resposta: Não. O que pesa são as dívidas parceladas (confirmar critérios com o correspondente).',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Nome tá limpo não.\" O corretor leu rápido, entendeu \"tá limpo\", comemorou e mandou a lista de documentos. Duas semanas depois, reprovação por restrição. A negação estava no fim da frase, e a venda também.","por_que_importa":"O dossiê chega ao corretor sem a informação de restrição no nome em 69,5% dos casos (jul a set/2026); no pico de campanha de set/2026, faltou em 81%. Ou seja: quase sempre é você quem descobre. Descobrir cedo, ler certo e mandar para a pré-análise é o que evita duas perdas: o cliente que quita a dívida à toa e continua reprovado, e o cliente que some de vergonha.","conceito":"Restrição no nome é como um farol amarelo, não vermelho. Não dá para acelerar como se nada fosse, mas também não é para desligar o carro. Quem diz se passa é o correspondente, na pré-análise. O corretor acolhe, investiga o tipo de pendência e encaminha, sem prometer e sem descartar.","metodo":["Pergunte com naturalidade, na qualificação: \"Hoje o seu nome está limpo na praça, ou tem alguma pendência?\" (o M16 mostra onde essa pergunta entra na espinha).","Leia a negação no fim da frase: \"tá bom não\" quer dizer não está bom; \"nome tá limpo não\" quer dizer que não está limpo. Na dúvida, confirme com uma pergunta curta.","Acolha sem julgar e investigue: é dívida com banco, loja, cartão ou restrição interna do próprio banco? Há quanto tempo? Qual o valor aproximado?","Não mande quitar antes: restrição no nome não descarta o lead, vai para a pré-análise com o correspondente antes de o cliente pagar qualquer dívida.","Dívidas parceladas pesam: empréstimo, carro e cartão entram no comprometimento de renda; o aluguel de hoje não impede o financiamento. Score baixo sozinho não é sentença (confirmar critérios com o correspondente).","Análise aberta em outro lugar: pergunte se o cliente já fez análise com outra construtora ou banco; pode ser preciso a carta de cancelamento da anterior. \"Já fui aprovado em outra construtora\" vira pedido de documento: cada unidade tem a sua avaliação.","Registre o que descobriu nas Observações da análise, sem expor o cliente: o gerente precisa saber para orientar a pasta."],"na_vida_real":{"caso":"Caso F: \"Já fui aprovado em outra construtora\" (1:1 de gestão, abr/2026).","o_que_foi_dito":"A resposta que virou modelo, na linha de: \"Cada projeto tem a sua avaliação, de cada unidade. Pode ser que aqui seja diferente da análise que você fez na outra construtora, pra mais ou pra menos. Eu só vou saber de verdade se você me mandar a documentação.\"","resultado":"A objeção virou pedido de documento, sem discutir a aprovação antiga e sem prometer a nova. É a mesma lógica da restrição: quem responde é a análise, e o corretor leva a pasta até ela.","fonte":"Casoteca SMQ, caso F (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente responde \"nome tá limpo não\"","texto":"Obrigado pela sinceridade, isso ajuda muito. Pendência não quer dizer que não dá. Antes de você pagar qualquer coisa, a gente faz uma pré-análise, sem custo. A pendência é com banco, loja ou cartão?","por_que_funciona":"Lê a negação certa, acolhe sem prometer, impede a quitação às cegas e investiga com uma pergunta só."},{"canal":"Ligação","situacao":"O cliente quer quitar a dívida antes de mandar documentos","texto":"Segura esse dinheiro por enquanto. Primeiro o correspondente olha a sua situação, sem custo nenhum. Às vezes a pessoa quita e o que travava era outra coisa, e aí o dinheiro faria falta na entrada. Me manda os documentos hoje ou amanhã de manhã?","por_que_funciona":"Protege o caixa do cliente, explica o porquê com um exemplo simples e fecha com duas opções."},{"canal":"WhatsApp","situacao":"O cliente conta que já fez análise em outra construtora","texto":"Boa, então você já conhece o caminho! Cada unidade tem a sua avaliação, pra mais ou pra menos. Pode ser preciso cancelar a análise anterior, eu te oriento. Você lembra em qual banco foi?","por_que_funciona":"Valoriza o que o cliente já fez, avisa da carta de cancelamento sem assustar e pega a informação que o correspondente vai pedir."}],"erros_que_matam":[{"erro":"Ler \"nome tá limpo não\" como nome limpo","custo":"Pasta montada sobre informação errada e reprovação semanas depois","correcao":"Negação no fim da frase; na dúvida, pergunta curta de confirmação"},{"erro":"Mandar o cliente quitar a dívida antes da pré-análise","custo":"O cliente gasta o dinheiro da entrada e pode continuar reprovado por outro motivo","correcao":"Pré-análise com o correspondente antes de quitar qualquer coisa"},{"erro":"Descartar o lead com restrição (\"volta quando limpar o nome\")","custo":"O cliente some de vergonha e compra com quem acolheu","correcao":"Acolher, investigar o tipo e encaminhar à pré-análise"},{"erro":"Dizer \"vai aprovar mesmo assim\"","custo":"Promessa proibida; quando não aprova, a confiança acaba","correcao":"\"Quem confirma é a análise; eu acompanho com você até a resposta\""}],"no_crm":{"tela":"Card do cliente, \"Análise de crédito\" e aba \"Qualificação\" do Dossiê","acao":"Registrar a situação do nome e o tipo de pendência; se virar perda, usar o motivo verdadeiro","campo":"Observações da análise; motivo de perda \"Crédito: score/negativado\" só quando a análise confirmar","regra":"Restrição não é motivo de perda antes da pré-análise"},"frase_ancora":"Restrição é farol amarelo. Quem diz se passa é a análise, não o medo.","checagem_rapida":[{"pergunta":"O que quer dizer \"tenho não\"?","resposta":"Não tenho. A negação vem no fim da frase."},{"pergunta":"O cliente com restrição deve quitar a dívida antes de mandar documentos?","resposta":"Não. Primeiro a pré-análise com o correspondente, depois a orientação."},{"pergunta":"O aluguel que o cliente paga hoje impede o financiamento?","resposta":"Não. O que pesa são as dívidas parceladas (confirmar critérios com o correspondente)."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M07-A4', 4, 'A linguagem do crédito: o que se pode e o que nunca se diz', 'texto',
  'Uma frase derruba uma venda aprovada: "com certeza aprova". Quando a análise pede uma pendência, o cliente lembra da frase, não da pendência. E quem prometeu vira suspeito de tudo o que disse antes.

### Por que importa

Prometer aprovação, taxa ou parcela exata está entre os erros que mais custam na casa: responsabilidade legal e confiança destruída (auditoria das conversas, jul a set/2026). Com cliente com medo de golpe, cada promessa soa como isca. A linguagem certa não esfria o cliente: ela é o que faz ele confiar no resto.

### O conceito

Crédito se explica como previsão do tempo: "pelo seu perfil, a tendência é boa, e quem confirma é a análise". O meteorologista sério não promete sol; ele mostra a previsão e diz o que fazer. O corretor sério mostra a estimativa e diz o próximo passo.

### O método SMQ, passo a passo

1. Pode: "Com a sua renda, você parece se encaixar na Faixa [X], vamos confirmar." · "A parcela estimada fica em torno de R$ [Y]." · "Fazemos uma análise prévia, sem compromisso." · "O preço a partir de é R$ [Z], pela tabela de hoje."
2. Nunca: "aprovação garantida", "com certeza aprova", "sua parcela será exatamente R$ [X]", "o governo vai te dar R$ 55 mil", "essa taxa é definitiva", subsídio para F3 ou F4, "entrada zero", "documentação grátis" sem a campanha dizer, "vai valorizar".
3. Preço pode, parcela depende: o "a partir de" da tabela vigente pode ser dito; parcela do financiamento só depois de saber a renda, e sempre como estimativa.
4. Taxa: a taxa sai no simulador e se confirma na análise (a tabela por sub-faixa na capital ainda é [CONFIRMAR]). Subsídio: só depois de saber a renda, sempre como "varia e se confirma na análise" (o M09 aprofunda).
5. Troque o banquês pela língua do cliente: "quanto vocês ganham juntos por mês, mais ou menos" no lugar de "renda bruta"; "nome limpo na praça" no lugar de "restrição cadastral"; "a papelada" no lugar de "documentação comprobatória".
6. Âncoras antigolpe em toda conversa de crédito: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar.

### Na vida real

**O caso:** Caso N, ponto de decisão 1: "os valores são reais?" (jan/2026, anônimo).

**O que foi dito:** Depois de um anúncio genérico, o cliente perguntou se os valores eram reais. A resposta da casa, na linha de: sim, a partir de R$ X pela tabela de hoje; o que muda é entrada e parcela, que dependem da renda; a análise é gratuita. O que a doutrina corrige: nunca "há casos de financiar 100%".

**O que aconteceu:** Com a resposta honesta, a credibilidade que a pergunta pedia veio junto, e o cliente mandou todos os documentos em cerca de 2 horas depois da ligação.

### Scripts prontos

#### WhatsApp · O cliente pergunta "aprova mesmo?"

> Ninguém sério te garante isso antes da análise, e eu não vou ser o primeiro a mentir pra você. O que eu garanto é montar a sua pasta certinha e te acompanhar até a resposta. A análise é gratuita. Quer começar hoje?

**Por que funciona:** Transforma a honestidade em diferencial, promete só o que o corretor controla e fecha com ação.

#### Ligação · O cliente quer saber a parcela exata antes de falar a renda

> A parcela depende de quanto vocês ganham juntos, do FGTS e da entrada. Se eu te falar um número agora, eu posso te enganar sem querer. Me conta: vocês ganham juntos por mês mais ou menos quanto?

**Por que funciona:** Aplica "preço pode, parcela depende", explica o porquê e devolve a condução com a pergunta certa em linguagem de cliente.

### Erros que matam a venda

- **"Com certeza aprova" ou "há casos de financiar 100%"**  
  Quanto custa: Promessa que a análise pode desmentir; o cliente passa a desconfiar de tudo  
  Correção: "Pelo seu perfil você tem condições, a confirmação vem na análise da Caixa"
- **Dar parcela exata antes de saber a renda**  
  Quanto custa: O número muda na análise e parece truque  
  Correção: Parcela só depois da renda, sempre como estimativa
- **Falar "renda bruta", "amortização" e "comprometimento" com o cliente**  
  Quanto custa: O cliente não entende, fica com vergonha de perguntar e esfria  
  Correção: Linguagem de cliente: quanto ganham juntos, nome limpo na praça, a papelada

### No CRM

- **Tela:** SamiQ e card do cliente
- **Ação:** Revisar toda sugestão de mensagem sobre crédito antes de enviar e registrar o desfecho da conversa
- **Campo:** Desfecho com próximo passo e data
- **Regra:** Sugestão de IA é rascunho: quem envia responde pelo que envia, inclusive por promessa de aprovação

### Frase-âncora

> **Quem promete aprovação perde o cliente no primeiro "pendência".**

### Checagem rápida

1. Pode dizer o preço "a partir de" antes de saber a renda?  
   Resposta: Pode, pela tabela vigente. A parcela do financiamento, não.
2. Qual frase substitui "com certeza aprova"?  
   Resposta: "Pelo seu perfil você tem condições, a confirmação vem na análise da Caixa."',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Uma frase derruba uma venda aprovada: \"com certeza aprova\". Quando a análise pede uma pendência, o cliente lembra da frase, não da pendência. E quem prometeu vira suspeito de tudo o que disse antes.","por_que_importa":"Prometer aprovação, taxa ou parcela exata está entre os erros que mais custam na casa: responsabilidade legal e confiança destruída (auditoria das conversas, jul a set/2026). Com cliente com medo de golpe, cada promessa soa como isca. A linguagem certa não esfria o cliente: ela é o que faz ele confiar no resto.","conceito":"Crédito se explica como previsão do tempo: \"pelo seu perfil, a tendência é boa, e quem confirma é a análise\". O meteorologista sério não promete sol; ele mostra a previsão e diz o que fazer. O corretor sério mostra a estimativa e diz o próximo passo.","metodo":["Pode: \"Com a sua renda, você parece se encaixar na Faixa [X], vamos confirmar.\" · \"A parcela estimada fica em torno de R$ [Y].\" · \"Fazemos uma análise prévia, sem compromisso.\" · \"O preço a partir de é R$ [Z], pela tabela de hoje.\"","Nunca: \"aprovação garantida\", \"com certeza aprova\", \"sua parcela será exatamente R$ [X]\", \"o governo vai te dar R$ 55 mil\", \"essa taxa é definitiva\", subsídio para F3 ou F4, \"entrada zero\", \"documentação grátis\" sem a campanha dizer, \"vai valorizar\".","Preço pode, parcela depende: o \"a partir de\" da tabela vigente pode ser dito; parcela do financiamento só depois de saber a renda, e sempre como estimativa.","Taxa: a taxa sai no simulador e se confirma na análise (a tabela por sub-faixa na capital ainda é [CONFIRMAR]). Subsídio: só depois de saber a renda, sempre como \"varia e se confirma na análise\" (o M09 aprofunda).","Troque o banquês pela língua do cliente: \"quanto vocês ganham juntos por mês, mais ou menos\" no lugar de \"renda bruta\"; \"nome limpo na praça\" no lugar de \"restrição cadastral\"; \"a papelada\" no lugar de \"documentação comprobatória\".","Âncoras antigolpe em toda conversa de crédito: a análise é gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama cliente no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar."],"na_vida_real":{"caso":"Caso N, ponto de decisão 1: \"os valores são reais?\" (jan/2026, anônimo).","o_que_foi_dito":"Depois de um anúncio genérico, o cliente perguntou se os valores eram reais. A resposta da casa, na linha de: sim, a partir de R$ X pela tabela de hoje; o que muda é entrada e parcela, que dependem da renda; a análise é gratuita. O que a doutrina corrige: nunca \"há casos de financiar 100%\".","resultado":"Com a resposta honesta, a credibilidade que a pergunta pedia veio junto, e o cliente mandou todos os documentos em cerca de 2 horas depois da ligação.","fonte":"Casoteca SMQ, caso N (seção 9.12) e erros da seção 9.16"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente pergunta \"aprova mesmo?\"","texto":"Ninguém sério te garante isso antes da análise, e eu não vou ser o primeiro a mentir pra você. O que eu garanto é montar a sua pasta certinha e te acompanhar até a resposta. A análise é gratuita. Quer começar hoje?","por_que_funciona":"Transforma a honestidade em diferencial, promete só o que o corretor controla e fecha com ação."},{"canal":"Ligação","situacao":"O cliente quer saber a parcela exata antes de falar a renda","texto":"A parcela depende de quanto vocês ganham juntos, do FGTS e da entrada. Se eu te falar um número agora, eu posso te enganar sem querer. Me conta: vocês ganham juntos por mês mais ou menos quanto?","por_que_funciona":"Aplica \"preço pode, parcela depende\", explica o porquê e devolve a condução com a pergunta certa em linguagem de cliente."}],"erros_que_matam":[{"erro":"\"Com certeza aprova\" ou \"há casos de financiar 100%\"","custo":"Promessa que a análise pode desmentir; o cliente passa a desconfiar de tudo","correcao":"\"Pelo seu perfil você tem condições, a confirmação vem na análise da Caixa\""},{"erro":"Dar parcela exata antes de saber a renda","custo":"O número muda na análise e parece truque","correcao":"Parcela só depois da renda, sempre como estimativa"},{"erro":"Falar \"renda bruta\", \"amortização\" e \"comprometimento\" com o cliente","custo":"O cliente não entende, fica com vergonha de perguntar e esfria","correcao":"Linguagem de cliente: quanto ganham juntos, nome limpo na praça, a papelada"}],"no_crm":{"tela":"SamiQ e card do cliente","acao":"Revisar toda sugestão de mensagem sobre crédito antes de enviar e registrar o desfecho da conversa","campo":"Desfecho com próximo passo e data","regra":"Sugestão de IA é rascunho: quem envia responde pelo que envia, inclusive por promessa de aprovação"},"frase_ancora":"Quem promete aprovação perde o cliente no primeiro \"pendência\".","checagem_rapida":[{"pergunta":"Pode dizer o preço \"a partir de\" antes de saber a renda?","resposta":"Pode, pela tabela vigente. A parcela do financiamento, não."},{"pergunta":"Qual frase substitui \"com certeza aprova\"?","resposta":"\"Pelo seu perfil você tem condições, a confirmação vem na análise da Caixa.\""}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M07-A5', 5, 'Do envio ao resultado: registrar, atualizar e virar o jogo', 'texto',
  'O cliente mandou tudo, a pasta foi ao correspondente e começou o silêncio. Dez dias sem notícia. Na décima primeira manhã, ele pergunta: "desistiram de mim?". Não desistiram. Só esqueceram de avisar.

### Por que importa

A passagem da análise para o fechamento é saudável: 39,1% (cascata de 90 dias, CRM set/2026). O que mata é o cliente em análise parado: eram 118 QUENTES em análise sem movimento, os piores com mais de 70 dias. E hoje quase nenhuma aprovação aparece registrada no CRM, então a taxa de aprovação da casa ainda não dá para medir. Registrar o resultado é o que faz a venda andar e o time aprender.

### O conceito

A análise é uma encomenda em trânsito. O cliente não precisa que você acelere o caminhão; precisa do rastreio. Quem cobra a transportadora é você (o correspondente), não o cliente. E quando a encomenda chega diferente do pedido, você não devolve: resolve.

### O método SMQ, passo a passo

1. Enviou ao correspondente: registre no card "Análise de crédito" a situação "Enviada ao banco", com o correspondente e os documentos nas Observações. Pendência de documento: "Pendente (aguardando docs)".
2. Atualize o cliente pelo menos a cada 5 dias úteis, mesmo sem novidade; na ansiedade, a cada 48 horas. Quem você cobra é o correspondente, não o cliente. Prazo de retorno não se promete.
3. Aprovado: use "Anexar aprovação", anexe a carta e confira os valores que a IA ler (financiamento, parcela, prazo, FGTS, subsídio, entrada, renda considerada, taxa, validade). Depois, celebre e marque a assinatura com duas opções (o M21 conduz daí até "Registrar venda").
4. Aprovado com valor menor ou entrada maior não é reprovação: registre "Aprovada com condição", descreva a condição imposta pelo banco e monte com o gerente as saídas (outra unidade, FGTS, condição da campanha).
5. Reprovado: entenda com o correspondente o motivo exato, registre "Reprovar" com o motivo, e monte um plano de 60 a 90 dias (nome, composição, comprometimento) com data de retorno. "Nova análise" quando o plano estiver cumprido, com documentos atualizados.
6. Se virar perda, o motivo é o verdadeiro: "Crédito: score/negativado" ou "Crédito: renda (insuficiente/informal)", nunca um motivo genérico.

### Na vida real

**O caso:** Caso N, ponto de decisão 2: a restrição que apareceu depois da primeira aprovação (jan a fev/2026, anônimo).

**O que foi dito:** A corretora entendeu o tipo de restrição com o correspondente, orientou o caminho, manteve o cliente atualizado e, no minuto em que ele avisou que resolveu, pediu a nova rodada. Crédito ao cliente, não a si mesma: "Você conseguiu o mais difícil, que era essa trava."

**O que aconteceu:** 7 dias para destravar a restrição, aprovação às 15h26 e contrato assinado no dia seguinte. Presença no crédito até destravar.

### Scripts prontos

#### WhatsApp · Atualização sem novidade, no 5º dia útil de análise

> Passando com notícia da sua análise: ela segue com o correspondente e eu cobrei retorno hoje de manhã. Ainda sem resposta, mas não parou. Te atualizo de novo até sexta. Ficou alguma dúvida que eu possa adiantar?

**Por que funciona:** Dá o rastreio sem inventar prazo, mostra que quem cobra é o corretor e marca a próxima atualização.

#### Ligação · Aprovado com entrada maior do que o cliente tinha

> Tenho uma notícia boa e um ajuste. A boa: a Caixa aprovou o seu crédito. O ajuste: a entrada ficou maior do que a gente previu. Isso não é reprovação, tem caminho. Eu e o meu gerente montamos as opções. Você consegue falar amanhã às 10h ou às 18h?

**Por que funciona:** Separa aprovação de problema, tira o peso da palavra "reprovado" e leva o ajuste para uma conversa marcada com o gerente.

#### Ligação · Reprovação por comprometimento de renda

> O banco não aprovou agora, e eu já sei o motivo: as parcelas que você paga hoje comprometem a renda. Isso tem prazo pra mudar. Vamos montar um plano de 60 a 90 dias e marcar a data pra rodar de novo?

**Por que funciona:** Diz a verdade com o motivo exato, troca o fim pelo plano e já propõe a data de retorno.

### Erros que matam a venda

- **Deixar o cliente mais de 5 dias úteis sem notícia na análise**  
  Quanto custa: Ansiedade vira desconfiança; o cliente some ou compra com outro  
  Correção: Atualização a cada 5 dias úteis, mesmo sem novidade (48 horas na ansiedade)
- **Tratar aprovação com condição como reprovação e desistir**  
  Quanto custa: Venda aprovada jogada fora  
  Correção: "Aprovada com condição" no CRM e as saídas com o gerente
- **Não registrar o resultado da análise**  
  Quanto custa: O gerente não vê onde a venda travou e a casa não mede a taxa de aprovação  
  Correção: Situação atualizada no card no mesmo dia, com a carta anexada na aprovação
- **Prometer prazo de retorno do banco**  
  Quanto custa: Cada dia de atraso vira quebra de promessa  
  Correção: Não prometer prazo; prometer atualização

### No CRM

- **Tela:** Card do cliente na etapa "Análise de crédito"
- **Ação:** Registrar a situação; na aprovação, "Anexar aprovação" e conferir os dados lidos; na reprovação, "Reprovar" com o motivo
- **Campo:** Situação (Enviada ao banco, Pendente (aguardando docs), Aprovada, Aprovada com condição, Reprovada), carta de aprovação, "Condição imposta pelo banco", "Motivo da reprovação"
- **Regra:** Todo resultado registrado no mesmo dia; "pasta travada" é uma das prioridades da Fila Única e o gerente enxerga pelo card

### Frase-âncora

> **Na análise, o cliente não precisa de velocidade. Precisa de notícia.**

### Checagem rápida

1. De quanto em quanto tempo o cliente em análise precisa de notícia?  
   Resposta: Pelo menos a cada 5 dias úteis; na ansiedade, a cada 48 horas.
2. Aprovado com entrada maior é reprovação?  
   Resposta: Não. É "Aprovada com condição": saídas com o gerente (outra unidade, FGTS, condição da campanha).
3. O que fazer depois de uma reprovação?  
   Resposta: Entender o motivo exato com o correspondente, registrar e montar um plano de 60 a 90 dias com data de retorno.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente mandou tudo, a pasta foi ao correspondente e começou o silêncio. Dez dias sem notícia. Na décima primeira manhã, ele pergunta: \"desistiram de mim?\". Não desistiram. Só esqueceram de avisar.","por_que_importa":"A passagem da análise para o fechamento é saudável: 39,1% (cascata de 90 dias, CRM set/2026). O que mata é o cliente em análise parado: eram 118 QUENTES em análise sem movimento, os piores com mais de 70 dias. E hoje quase nenhuma aprovação aparece registrada no CRM, então a taxa de aprovação da casa ainda não dá para medir. Registrar o resultado é o que faz a venda andar e o time aprender.","conceito":"A análise é uma encomenda em trânsito. O cliente não precisa que você acelere o caminhão; precisa do rastreio. Quem cobra a transportadora é você (o correspondente), não o cliente. E quando a encomenda chega diferente do pedido, você não devolve: resolve.","metodo":["Enviou ao correspondente: registre no card \"Análise de crédito\" a situação \"Enviada ao banco\", com o correspondente e os documentos nas Observações. Pendência de documento: \"Pendente (aguardando docs)\".","Atualize o cliente pelo menos a cada 5 dias úteis, mesmo sem novidade; na ansiedade, a cada 48 horas. Quem você cobra é o correspondente, não o cliente. Prazo de retorno não se promete.","Aprovado: use \"Anexar aprovação\", anexe a carta e confira os valores que a IA ler (financiamento, parcela, prazo, FGTS, subsídio, entrada, renda considerada, taxa, validade). Depois, celebre e marque a assinatura com duas opções (o M21 conduz daí até \"Registrar venda\").","Aprovado com valor menor ou entrada maior não é reprovação: registre \"Aprovada com condição\", descreva a condição imposta pelo banco e monte com o gerente as saídas (outra unidade, FGTS, condição da campanha).","Reprovado: entenda com o correspondente o motivo exato, registre \"Reprovar\" com o motivo, e monte um plano de 60 a 90 dias (nome, composição, comprometimento) com data de retorno. \"Nova análise\" quando o plano estiver cumprido, com documentos atualizados.","Se virar perda, o motivo é o verdadeiro: \"Crédito: score/negativado\" ou \"Crédito: renda (insuficiente/informal)\", nunca um motivo genérico."],"na_vida_real":{"caso":"Caso N, ponto de decisão 2: a restrição que apareceu depois da primeira aprovação (jan a fev/2026, anônimo).","o_que_foi_dito":"A corretora entendeu o tipo de restrição com o correspondente, orientou o caminho, manteve o cliente atualizado e, no minuto em que ele avisou que resolveu, pediu a nova rodada. Crédito ao cliente, não a si mesma: \"Você conseguiu o mais difícil, que era essa trava.\"","resultado":"7 dias para destravar a restrição, aprovação às 15h26 e contrato assinado no dia seguinte. Presença no crédito até destravar.","fonte":"Casoteca SMQ, caso N (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Atualização sem novidade, no 5º dia útil de análise","texto":"Passando com notícia da sua análise: ela segue com o correspondente e eu cobrei retorno hoje de manhã. Ainda sem resposta, mas não parou. Te atualizo de novo até sexta. Ficou alguma dúvida que eu possa adiantar?","por_que_funciona":"Dá o rastreio sem inventar prazo, mostra que quem cobra é o corretor e marca a próxima atualização."},{"canal":"Ligação","situacao":"Aprovado com entrada maior do que o cliente tinha","texto":"Tenho uma notícia boa e um ajuste. A boa: a Caixa aprovou o seu crédito. O ajuste: a entrada ficou maior do que a gente previu. Isso não é reprovação, tem caminho. Eu e o meu gerente montamos as opções. Você consegue falar amanhã às 10h ou às 18h?","por_que_funciona":"Separa aprovação de problema, tira o peso da palavra \"reprovado\" e leva o ajuste para uma conversa marcada com o gerente."},{"canal":"Ligação","situacao":"Reprovação por comprometimento de renda","texto":"O banco não aprovou agora, e eu já sei o motivo: as parcelas que você paga hoje comprometem a renda. Isso tem prazo pra mudar. Vamos montar um plano de 60 a 90 dias e marcar a data pra rodar de novo?","por_que_funciona":"Diz a verdade com o motivo exato, troca o fim pelo plano e já propõe a data de retorno."}],"erros_que_matam":[{"erro":"Deixar o cliente mais de 5 dias úteis sem notícia na análise","custo":"Ansiedade vira desconfiança; o cliente some ou compra com outro","correcao":"Atualização a cada 5 dias úteis, mesmo sem novidade (48 horas na ansiedade)"},{"erro":"Tratar aprovação com condição como reprovação e desistir","custo":"Venda aprovada jogada fora","correcao":"\"Aprovada com condição\" no CRM e as saídas com o gerente"},{"erro":"Não registrar o resultado da análise","custo":"O gerente não vê onde a venda travou e a casa não mede a taxa de aprovação","correcao":"Situação atualizada no card no mesmo dia, com a carta anexada na aprovação"},{"erro":"Prometer prazo de retorno do banco","custo":"Cada dia de atraso vira quebra de promessa","correcao":"Não prometer prazo; prometer atualização"}],"no_crm":{"tela":"Card do cliente na etapa \"Análise de crédito\"","acao":"Registrar a situação; na aprovação, \"Anexar aprovação\" e conferir os dados lidos; na reprovação, \"Reprovar\" com o motivo","campo":"Situação (Enviada ao banco, Pendente (aguardando docs), Aprovada, Aprovada com condição, Reprovada), carta de aprovação, \"Condição imposta pelo banco\", \"Motivo da reprovação\"","regra":"Todo resultado registrado no mesmo dia; \"pasta travada\" é uma das prioridades da Fila Única e o gerente enxerga pelo card"},"frase_ancora":"Na análise, o cliente não precisa de velocidade. Precisa de notícia.","checagem_rapida":[{"pergunta":"De quanto em quanto tempo o cliente em análise precisa de notícia?","resposta":"Pelo menos a cada 5 dias úteis; na ansiedade, a cada 48 horas."},{"pergunta":"Aprovado com entrada maior é reprovação?","resposta":"Não. É \"Aprovada com condição\": saídas com o gerente (outra unidade, FGTS, condição da campanha)."},{"pergunta":"O que fazer depois de uma reprovação?","resposta":"Entender o motivo exato com o correspondente, registrar e montar um plano de 60 a 90 dias com data de retorno."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q01', 1, 'situacional',
  'O cliente responde no WhatsApp: "meu nome tá limpo não, mas é pouca coisa". Qual é a sua próxima mensagem?',
  '["\"Ótimo, nome limpo! Já te mando a lista de documentos.\"","\"Obrigado por contar. Antes de você pagar qualquer coisa, a gente faz uma pré-análise sem custo. A pendência é com banco, loja ou cartão?\"","\"Então primeiro limpa o nome e depois me procura.\"","\"Relaxa, pouca coisa não atrapalha, vai aprovar.\""]'::jsonb,
  1,
  'Certa: B, porque lê a negação certa (o nome não está limpo), acolhe, impede a quitação às cegas e investiga com uma pergunta só. A erra: lê a frase pelo tom e ignora a negação no fim. C erra: descarta um lead que tem caminho pela pré-análise. D erra: promete aprovação, o que é proibido.',
  'M07-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q02', 2, 'situacional',
  'Um entregador de aplicativo pergunta: "eu não tenho holerite nem MEI, dá pra financiar?". O que você responde?',
  '["\"Sem holerite fica difícil, precisa abrir um MEI primeiro.\"","\"Dá sim, desde julho a Caixa aprova todo entregador.\"","\"Me manda o seu CPF e a senha do app que eu vejo os ganhos.\"","\"Dá pra entrar na análise, sim: a renda de aplicativo agora conta. Preciso dos relatórios dos últimos 4 meses do mesmo app. Você roda em qual aplicativo?\""]'::jsonb,
  3,
  'Certa: D, porque dá a notícia boa sem prometer aprovação, pede o documento certo do perfil e fecha com uma pergunta. A erra: a regra divulgada não exige MEI e o corretor fecha a porta sem motivo. B erra: crava data e promete aprovação. C erra: pede senha, o que nunca se faz, e dado sem explicar o porquê.',
  'M07-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q03', 3, 'situacional',
  'O cliente viu a simulação e escreve: "então já tô aprovado, né?". Qual é a melhor resposta?',
  '["\"Ainda não: a simulação mostra que o seu perfil tem condições; quem confirma é a análise da Caixa, que é gratuita. Posso montar a sua pasta hoje?\"","\"Tá sim, esse PDF é a sua aprovação.\"","\"Quase certeza que sim, seu perfil é ótimo.\"","\"Depende, vamos ver o que o banco acha, qualquer coisa me chama.\""]'::jsonb,
  0,
  'Certa: A, porque separa estimativa de aprovação e termina num próximo passo concreto. B erra: trata o simulador como aprovação: capacidade estimada não é crédito aprovado. C erra: promessa disfarçada, proibida do mesmo jeito. D erra: é verdade pela metade e larga a iniciativa com o cliente.',
  'M07-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q04', 4, 'situacional',
  'No quinto dia útil de análise, o correspondente ainda não respondeu e o cliente não perguntou nada. O que você faz?',
  '["Espera o correspondente responder para não incomodar o cliente com mensagem vazia","Pede ao cliente que ligue para a Caixa para saber como está","Manda ao cliente a atualização sem novidade, diz que cobrou o correspondente e marca a próxima atualização","Promete que a resposta sai até sexta para acalmar o cliente"]'::jsonb,
  2,
  'Certa: C, porque o cliente precisa de rastreio a cada 5 dias úteis, mesmo sem novidade, e quem se cobra é o correspondente. A erra: silêncio vira desconfiança; a atualização sem novidade é a regra. B erra: transfere para o cliente a cobrança que é do corretor e expõe o cliente a golpe. D erra: prazo de retorno não se promete.',
  'M07-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q05', 5, 'situacional',
  'Saiu a análise: aprovado, mas com entrada maior do que o cliente tinha. O que você faz?',
  '["Registra como reprovada e parte para o próximo cliente","Oferece um desconto na unidade para compensar a diferença","Registra \"Aprovada com condição\" com a condição do banco e marca uma conversa para apresentar as saídas montadas com o gerente","Diz ao cliente que o banco errou e manda rodar em outro banco"]'::jsonb,
  2,
  'Certa: C, porque aprovação com condição não é reprovação: há saídas (outra unidade, FGTS, condição da campanha) e elas passam pelo gerente. A erra: joga fora uma aprovação que tinha caminho. B erra: desconto fora da campanha é alçada do gerente ou do diretor. D erra: promessa sem base e decisão que não é do corretor.',
  'M07-A5', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q06', 6, 'situacional',
  'O cliente diz: "vou quitar minha dívida no cartão essa semana e depois te mando os documentos". Qual é a sua orientação?',
  '["\"Segura esse dinheiro por enquanto: primeiro o correspondente olha a sua situação, sem custo. Me manda os documentos hoje ou amanhã cedo?\"","\"Isso, quita primeiro que aí aprova com certeza.\"","\"Então me chama quando quitar.\"","\"Nem precisa quitar, restrição não conta nada na análise.\""]'::jsonb,
  0,
  'Certa: A, porque restrição vai para a pré-análise antes de quitar: o cliente pode gastar o dinheiro da entrada e continuar reprovado por outro motivo. B erra: manda quitar às cegas e ainda promete aprovação. C erra: larga o cliente sem próximo passo. D erra: falso: restrição e comprometimento pesam mais que o score.',
  'M07-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q07', 7, 'situacional',
  'Na ligação, o cliente pergunta: "qual renda eu coloco? Se eu colocar um pouco mais, passa?". O que você responde?',
  '["\"Coloca um pouco mais, o banco nem confere.\"","\"Coloca o valor que a simulação pediu que eu ajusto o holerite.\"","\"Deixa comigo, eu preencho o cadastro do jeito que dá.\"","\"A renda real, a que você comprova. É ela que te protege lá na frente, e o correspondente te orienta a documentar certinho.\""]'::jsonb,
  3,
  'Certa: D, porque integridade da pasta: a renda real e comprovada define a aprovação, nunca o contrário. A erra: orienta fraude: risco grave para o cliente, o corretor e a SMQ. B erra: alterar documento é proibido. C erra: o cadastro vai ao banco exatamente como o cliente informou.',
  'M07-A2', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q08', 8, 'situacional',
  'O cliente conta que já tem uma análise aberta em outra construtora. O que você faz?',
  '["Diz que a outra análise vale aqui e pede só a carta de aprovação","Explica que cada unidade tem a sua avaliação, pergunta em qual banco foi e avisa que pode ser preciso cancelar a análise anterior","Pede para ele desistir da outra construtora antes de conversar","Ignora a informação e manda a pasta normalmente"]'::jsonb,
  1,
  'Certa: B, porque análise aberta em outro lugar pode exigir a carta de cancelamento, e a objeção vira pedido de documento. A erra: cada unidade tem a sua avaliação; a análise antiga não substitui a nova. C erra: pressão sem informação e decisão que é do cliente. D erra: a análise duplicada pode travar a pasta.',
  'M07-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q09', 9, 'aplicacao',
  'Pela regra de idade (idade mais prazo até 80 anos e 6 meses, vigente em set/2026), qual é o prazo máximo de um cliente de 55 anos?',
  '["25 anos e 6 meses","35 anos","25 anos","30 anos"]'::jsonb,
  0,
  'Certa: A, porque 80 anos e 6 meses menos 55 anos dá 25 anos e 6 meses. B erra: é o prazo máximo do programa, mas a idade limita antes. C erra: usa a regra antiga de 80 anos, superada. D erra: não corresponde a nenhuma regra vigente.',
  'Seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q10', 10, 'aplicacao',
  'Um aposentado de 58 anos quer financiar sozinho. Qual é o prazo máximo pela regra de idade vigente em set/2026?',
  '["20 anos","35 anos","22 anos e 6 meses","22 anos"]'::jsonb,
  2,
  'Certa: C, porque 80 anos e 6 meses menos 58 anos dá 22 anos e 6 meses. A erra: não sai de nenhuma conta da regra: 80 anos e 6 meses menos 58 dá 22 anos e 6 meses. B erra: ignora o limite de idade. D erra: usa a regra superada de 80 anos.',
  'Seção 9.9, persona P11', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q11', 11, 'aplicacao',
  'Um casal ganha junto R$ 4.500 por mês. Pela regra da parcela de até cerca de 30% da renda (com seguros e taxa), qual é a parcela máxima estimada?',
  '["Cerca de R$ 1.500","Cerca de R$ 1.350","Cerca de R$ 900","Cerca de R$ 2.250"]'::jsonb,
  1,
  'Certa: B, porque 30% de R$ 4.500 é R$ 1.350, e ainda é estimativa: quem confirma é a análise. A erra: é o exemplo da renda de R$ 5.000, não desta. C erra: usa 20%, que não é a regra. D erra: usa metade da renda e superestima a capacidade.',
  'Seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q12', 12, 'aplicacao',
  'Um motorista de aplicativo teve estes ganhos nos últimos 4 meses, no mesmo app: R$ 3.100, R$ 2.700, R$ 2.950 e R$ 3.300. Pelo que se sabe da regra (confirmar com o correspondente), qual renda tende a ser considerada?',
  '["R$ 3.012,50","R$ 3.300","R$ 12.050","R$ 2.700"]'::jsonb,
  3,
  'Certa: D, porque na renda de aplicativo vale o mês de menor valor. A erra: é a média; na renda de aplicativo vale o menor mês. B erra: é o maior mês, e inflar renda derruba a análise. C erra: soma os quatro meses em vez de considerar a renda mensal.',
  'Seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q13', 13, 'aplicacao',
  'Uma cliente ganha R$ 2.300 de salário registrado e recebe R$ 600 de Bolsa Família. Qual renda entra na análise?',
  '["R$ 2.900","R$ 600","Nenhuma, porque quem recebe benefício não financia","R$ 2.300"]'::jsonb,
  3,
  'Certa: D, porque Bolsa Família não conta como renda na análise. A erra: soma o Bolsa Família, que não conta. B erra: troca a renda que conta pela que não conta. C erra: falso: o salário comprovado conta normalmente.',
  'Seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q14', 14, 'aplicacao',
  'Um cliente da F4 ganha R$ 11.500 e quer somar a renda do irmão, de R$ 2.000. O que acontece com o enquadramento, pelas faixas vigentes desde 22/04/2026?',
  '["Continua na F4, porque a composição não muda a faixa","A renda somada, de R$ 13.500, passa do limite da F4 (R$ 13.000) e o cliente sai do MCMV para o SBPE","Sobe para uma faixa com subsídio","Fica na F3, porque cada renda é analisada separada"]'::jsonb,
  1,
  'Certa: B, porque na F4, compor renda pode tirar o cliente do programa: a folga era de só R$ 1.500. A erra: a faixa é pela renda familiar somada. C erra: F3 e F4 não têm subsídio, e a renda maior não cria faixa nova. D erra: a análise considera a renda de todos que entram no contrato.',
  'Seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q15', 15, 'conceito',
  'Na análise de crédito, quem faz o quê?',
  '["O corretor enquadra, simula e monta a pasta; o gerente revisa; o correspondente do empreendimento conduz a análise na Caixa; a Caixa decide","O corretor aprova pela simulação e o correspondente só registra","O cliente leva os documentos à agência e o corretor espera","O gerente conduz a análise na Caixa no lugar do correspondente"]'::jsonb,
  0,
  'Certa: A, porque é o caminho da pasta decidido em 29/09/2026: o corretor não calcula aprovação. B erra: simulação indica, análise formal aprova. C erra: o corretor conduz a pasta até o correspondente. D erra: o gerente revisa; quem conduz a análise é o correspondente.',
  'Seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q16', 16, 'conceito',
  'Sobre o seguro obrigatório do financiamento habitacional, o que é certo dizer ao cliente (confirmar coberturas com o correspondente)?',
  '["Cobre desemprego por até seis meses","É opcional e o cliente pode tirar para a parcela cair","Cobre morte e invalidez permanente e danos ao imóvel, mas não cobre desemprego","Garante renegociação automática se a renda cair"]'::jsonb,
  2,
  'Certa: C, porque é o que a seção 9.9 registra; perda de renda depois da compra se trata com o banco, caso a caso. A erra: o seguro obrigatório não cobre desemprego. B erra: é obrigatório e já vem na parcela. D erra: nunca prometa renegociação.',
  'Seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q17', 17, 'conceito',
  'Qual destas rendas NÃO entra na análise de crédito?',
  '["Pró-labore do sócio comprovado","Seguro-desemprego","Renda de aplicativo com os relatórios dos 4 meses","Faturamento de MEI pela média"]'::jsonb,
  1,
  'Certa: B, porque seguro-desemprego, Bolsa Família, BPC, auxílio-doença e FGTS não contam como renda. A erra: conta, com contrato social, pró-labore e imposto. C erra: passou a contar como renda formal. D erra: conta, pela média do faturamento.',
  'Seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q18', 18, 'conceito',
  'Por que o corretor usa PRICE nos exemplos de simulação?',
  '["Porque a parcela é fixa e o cálculo foi validado contra o simulador da Caixa; SAC entra só como comparação","Porque o SAC foi proibido pela Caixa","Porque na PRICE a parcela cai todo mês","Porque a PRICE dispensa seguro e taxa"]'::jsonb,
  0,
  'Certa: A, porque é a regra da casa: PRICE como padrão nos exemplos. B erra: o SAC existe; ele só não é o padrão dos exemplos da SMQ. C erra: quem cai é a parcela do SAC; a da PRICE é fixa. D erra: a estimativa inclui seguros e taxa nos dois sistemas.',
  'Seção 3 e 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q19', 19, 'caca_ao_erro',
  'Ache o erro nesta mensagem do corretor: "Boa notícia! Seu nome tá ok, sua renda de R$ 4.000 cabe na F2 e com certeza aprova. Já pode ir juntando o ato!"',
  '["Citar a faixa: faixa nunca pode ser dita ao cliente","Chamar de boa notícia: crédito não se comemora","\"Com certeza aprova\": é promessa proibida; o certo é \"pelo seu perfil você tem condições, a confirmação vem na análise\"","Falar da renda: renda não se menciona por WhatsApp"]'::jsonb,
  2,
  'Certa: C, porque prometer aprovação é o erro que destrói a confiança quando a análise pede pendência. A erra: pode, como "parece se encaixar, vamos confirmar". B erra: celebrar é certo; o erro é prometer. D erra: renda se trata depois do aceite, explicando o porquê; o erro aqui é a promessa.',
  'Seção 9.9 e 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M07-Q20', 20, 'caca_ao_erro',
  'Ache o erro nesta orientação a um cliente sócio de empresa: "Coloca no cadastro um pró-labore de R$ 7.000 que aí a parcela passa; depois a gente vê o holerite."',
  '["O erro é falar em pró-labore: sócio só comprova por extrato","O erro é o valor: deveria sugerir R$ 9.600, o topo da F3","Não há erro: o correspondente corrige depois","O corretor sugere um valor de renda para bater com a aprovação, o que é proibido: vale a renda real e comprovada"]'::jsonb,
  3,
  'Certa: D, porque integridade da pasta: ninguém da SMQ sugere valor de renda, de pró-labore ou de holerite. A erra: o pró-labore de 3 meses é documento do perfil empresário. B erra: o erro é sugerir qualquer valor. C erra: a pasta falsa é risco grave e o correspondente não corrige fraude.',
  'Seção 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (14)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F01', 1, 'Quem aprova o crédito?', 'A Caixa, na análise conduzida pelo correspondente do empreendimento. Simulação indica, análise formal aprova.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F02', 2, 'Os quatro filtros da análise', 'Renda comprovada, cadastro e nome, idade mais prazo e o imóvel (80% do menor valor entre preço e laudo).', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F03', 3, 'Parcela máxima estimada', 'Até cerca de 30% da renda bruta familiar, já com seguros e taxa de administração (vigente em set/2026).', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F04', 4, 'Regra de idade', 'Idade mais prazo até 80 anos e 6 meses. 55 anos: prazo máximo de 25 anos e 6 meses.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F05', 5, 'Renda de aplicativo', '4 meses seguidos no mesmo app, vale o mês de menor valor, não exige MEI nem imposto (confirmar com o correspondente).', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F06', 6, 'O que não conta como renda', 'Bolsa Família, BPC, seguro-desemprego, auxílio-doença, FGTS e dinheiro sem comprovação.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F07', 7, 'Renda do MEI', 'Pela média do faturamento, não pelo valor declarado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F08', 8, '"Nome tá limpo não"', 'Quer dizer que NÃO está limpo. A negação vem no fim da frase; na dúvida, confirme.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F09', 9, 'Cliente com restrição quer quitar a dívida', 'Primeiro a pré-análise com o correspondente, sem custo. Depois a orientação.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F10', 10, 'Seguro do financiamento', 'Obrigatório: morte e invalidez permanente e danos ao imóvel. Não cobre desemprego (confirmar coberturas).', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F11', 11, '"Qual renda eu informo?"', 'A renda real e comprovada. Ninguém da SMQ sugere valor de renda, pró-labore ou holerite.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F12', 12, 'Cliente em análise', 'Notícia pelo menos a cada 5 dias úteis (48 horas na ansiedade). Quem se cobra é o correspondente. Prazo não se promete.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F13', 13, 'Aprovado com entrada maior', 'Não é reprovação: "Aprovada com condição" e as saídas com o gerente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M07-F14', 14, 'Reprovado', 'Motivo exato com o correspondente, registro no CRM e plano de 60 a 90 dias com data de retorno.', true
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1 quinzenal, abra com o corretor os cards dos clientes dele em \"Análise de crédito\" e confira situação, data da última notícia e o que falta. Na reunião de segunda, leve um caso de restrição e um de aprovação com condição (anônimos) e peça ao time a próxima mensagem. Faça o role-play com P2 e P8 uma vez no mês, com a rubrica completa, e revise toda pasta antes do envio conferindo as quatro regras de integridade (dados do cadastro como o cliente informou, renda real, nenhum documento de outro cliente, nenhuma senha na conversa).","sinais_de_dificuldade":["Clientes em \"Análise de crédito\" sem situação registrada ou sem notícia há mais de 5 dias úteis.","Perdas por \"Crédito: score/negativado\" registradas antes de qualquer pré-análise com o correspondente.","Aprovações que o corretor comenta no grupo e que não aparecem no card com a carta anexada."],"perguntas_de_coaching":["Como esse cliente comprova a renda, e qual documento do perfil ainda falta?","Quando foi a última notícia que você deu para cada cliente em análise, e o que você cobrou do correspondente?","Esse cliente com restrição passou pela pré-análise antes de você registrar a perda?"],"ritual_de_celebracao":"All Hands quinzenal: destaque para quem teve mais análises com resultado registrado e nenhum cliente sem notícia; no LEGADO mensal, a categoria Disciplina de Processo, e a conquista \"Pasta completa\" quando o CRM a tiver."},"pratica_gabarito":["P2: \"Dá pra entrar na análise: a renda de aplicativo agora conta\", sem cravar data; pedir os relatórios dos últimos 4 meses do mesmo app e os 3 últimos extratos; âncoras antigolpe; próximo passo com duas opções de horário que caibam na rotina dele.","P2, \"não gosto de mandar documento\": documento só pelo canal oficial da SMQ, a análise é gratuita e não obriga a nada; oferecer mandar um de cada vez ou voltar para a visita.","P8: entender \"nome tá limpo não\" como pendência; acolher; perguntar se é com banco, loja ou cartão; explicar a pré-análise sem custo.","P8, \"vou quitar primeiro\": segurar o dinheiro até o correspondente olhar; propor mandar os documentos com duas opções de dia.","P8, \"renda um pouco maior\": a renda real e comprovada, sem sugerir valor; o correspondente orienta a documentação.","Registro: situação da análise nas Observações (tipo de renda, pendência no nome, documentos pedidos) e desfecho com próximo passo e data."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M07' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
