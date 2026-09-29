-- ===========================================================================
-- ACADEMIA SMQ · LOTE 3 (v1.0) · seed do módulo M05
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
  ('M05', 5, 2, 'Faixas, enquadramento e elegibilidade', 'Ao final, você define a faixa do MCMV, a renda que conta, o uso do FGTS e o que pode travar o cliente antes de apresentar qualquer produto, diz "não dá" cedo e com o caminho possível quando não dá, e isso aparece no CRM como Renda informada, Tipo de renda, Usa FGTS, Entrada disponível e Faixa MCMV preenchidos no Dossiê antes da visita e nenhuma perda por teto sem a rota oferecida.',
   '["Eu sou capaz de enquadrar um cliente nos 7 passos, da renda ao produto que cabe, antes de apresentar qualquer unidade.","Eu sou capaz de dizer a faixa certa em rendas de fronteira (R$ 3.200,01, R$ 5.000,01, R$ 9.600,01 e R$ 13.000,01) e o teto de imóvel de cada faixa vigente.","Eu sou capaz de dizer que renda conta e que renda não conta em cada tipo de vínculo, e de calcular a folga até R$ 13.000 antes de sugerir composição na F4.","Eu sou capaz de conferir imóvel no nome, financiamento ativo, FGTS de 3 anos, idade mais prazo até 80 anos e 6 meses e finalidade de moradia, e de explicar cada regra em linguagem de cliente.","Eu sou capaz de dizer \"não dá\" cedo, com o caminho possível (Pró-Cotista, SBPE, HMP, regularizar o nome ou outro produto), e de registrar no CRM a faixa e o motivo certo."]'::jsonb, 1.7, '100 min', true,
   '**Laboratório de enquadramento (individual, cronometrado, com gabarito)** · 40 min

**Papéis:** O corretor recebe os 10 cartões de perfil. O gerente cronometra os 10 minutos, faz o papel do cliente por 2 minutos nos perfis 2, 5 e 8 e corrige com o gabarito.

**Persona:** Perfis de treino baseados nas personas P1, P2, P3, P4 e P11 (seção 9.13) e nas situações das fases C e D

**Roteiro:** Em até 10 minutos, o corretor enquadra os 10 perfis de treino: faixa, renda que conta, subsídio possível ou não, FGTS, parcela de referência (cerca de 30% da renda) e o que pode travar. Depois, nos perfis 2, 5 e 8, fala em voz alta a frase que diria ao cliente, com a linguagem permitida. Por fim, registra no CRM de treino (ou num formulário igual à aba Dados) a Faixa MCMV e o Tipo de renda de três perfis. Os perfis seguem a distribuição real da casa: F2 e F3 somam 70,9% das simulações (jul a set/2026). Os valores são de treino.

**Roteiro do cliente:**

- Perfil 1: solteiro CLT, renda bruta de R$ 2.800, mora de aluguel, sem imóvel no nome.
- Perfil 2: cliente diz "ganho uns R$ 3.000" e não sabe se o valor é bruto; mora com a mãe.
- Perfil 3 (P1): casal CLT com renda somada de R$ 4.500, aluguel de R$ 1.200, um deles com FGTS de 4 anos, primeiro imóvel.
- Perfil 4 (P2): entregador de aplicativo, cerca de R$ 2.800 por mês há 5 meses na mesma plataforma, sem MEI, trabalhou 2 anos registrado no passado.
- Perfil 5: casal CLT, ele com R$ 3.000 e ela com R$ 2.500, querem comprar juntos.
- Perfil 6 (P3): solteira CLT, renda de R$ 7.500, pouco dinheiro guardado, FGTS de 2 anos e 10 meses.
- Perfil 7: MEI que declara R$ 7.000 por mês; o faturamento médio comprovado é de R$ 5.500.
- Perfil 8 (P4): casal com renda de R$ 12.000, quer somar a renda da mãe (R$ 2.500) para comprar uma unidade de R$ 480 mil (valor de treino).
- Perfil 9 (P11): aposentado de 58 anos, renda de aposentadoria de R$ 5.200.
- Perfil 10: casal com renda de R$ 14.000 que quer o Minha Casa Minha Vida "porque é mais barato".

**O que o observador procura:**

- Faixa certa nas rendas de fronteira, pela tabela vigente.
- Nenhum subsídio dado como certo, e nenhum subsídio na F3 ou na F4.
- Folga até R$ 13.000 calculada antes de qualquer composição na F4.
- Renda perto do piso confirmada como bruta ou líquida antes de enquadrar.
- "Não dá" dito cedo, sempre com o caminho possível.
- Linguagem permitida: "parece se encaixar", "a análise confirma", "estimativa"; nenhuma promessa de aprovação, taxa ou parcela exata (critério 6 só com nota 5).
- Faixa MCMV e Tipo de renda registrados.

**Rubrica:** Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM). Aprovação: média 3,5 ou mais.', '[{"criterio":"Qualificação: campos obrigatórios, âncora antes da pergunta, uma pergunta por vez","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1},{"criterio":"Registro no CRM: desfecho, próximo passo e data","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 3 v1.0 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Teto exato de F1 e F2 na capital e taxa por sub-faixa no simulador oficial (até lá: "até R$ 275 mil nas maiores cidades; o simulador confirma"). | [CONFIRMAR] Limite de participantes na composição de renda e regra de idade do participante mais velho, com o correspondente. | [CONFIRMAR] Alcance exato das condições do FGTS e valor livre com antecipação do saque-aniversário, com o correspondente. | [CONFIRMAR] Lista final de documentos da renda de aplicativo, com o correspondente. | [CONFIRMAR] Critérios de comprometimento de renda (empréstimo, carro, cartão), com o correspondente. | [CONFIRMAR na publicação] Reconferir a tabela de faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) e o radar regulatório antes de liberar as questões M05-Q02, Q07, Q10, Q11, Q12, Q17, Q18 e Q19. | [GAP DE CRM] Não há indicador de fichas completas por corretor nem campo próprio para tempo de registro no FGTS, imóvel no nome e antecipação do saque-aniversário (hoje vão nas Observações do Dossiê). | [DADO A MEDIR NO CRM] Linha de base de fichas com os 5 campos e de perdas por crédito descobertas só na análise. | [CALIBRAR] Meta de fichas completas antes da visita e de perdas por "Renda acima do teto MCMV" sem rota oferecida.', '{"formato":"canonico-8.2","lote":3,"versao_conteudo":"1.0","trilha":"T2","ordem":1,"nivel_alvo":"Apto","nivel_alvo_sistema":"habilitado","subtitulo":"Enquadrar antes de ofertar: faixa, renda que conta, FGTS e o \"não dá\" dito cedo, sempre com o caminho.","duracao_min":100,"por_que_vale_dinheiro":{"texto":"Perfil incompatível com o MCMV que ninguém sinalizou está entre os 5 erros mais frequentes da auditoria de atendimento: quando aparece só na análise, a casa já gastou ligação, visita e pasta no ponto mais caro do funil. E F2 e F3 somam 70,9% das simulações da casa, justamente onde um real de diferença na renda muda faixa, subsídio e taxa.","numero":"15 dos 156 erros auditados foram perfil incompatível não sinalizado; F2 e F3 = 70,9% das 247 simulações","fonte":"Auditoria de conversas de atendimento e simulações registradas (seções 9.1 e 9.16 do super prompt)","periodo":"jul a set/2026"},"pre_requisitos":["M00","M04","M16"],"indicador_crm":{"nome":"Fichas com os 5 campos obrigatórios e a Faixa MCMV preenchidos antes da visita; perdas por teto ou por crédito sem rota oferecida","onde_ler":"Dossiê do cliente › aba Dados (Renda informada, Tipo de renda, Usa FGTS, Entrada disponível, Faixa MCMV e Decisor); motivos de perda no Meu Raio-X e, para o gerente, em Operação › Relatórios › Resumo › \"Motivos de perda\" (\"Renda acima do teto MCMV\" e \"Crédito: renda (insuficiente/informal)\")","linha_de_base":"[DADO A MEDIR NO CRM] Fichas completas por corretor e perdas por crédito descobertas só na análise","meta_sugerida":"100% das fichas com os 5 campos e a Faixa MCMV antes da visita; zero perda por \"Renda acima do teto MCMV\" sem rota oferecida para Pró-Cotista ou SBPE [CALIBRAR]","fonte":"Manual do CRM (set/2026), campos do Dossiê conferidos no código do CRM e seção 9.3 do super prompt","gap_de_crm":true},"pratica":{"tipo":"Laboratório de enquadramento (individual, cronometrado, com gabarito)","duracao_min":40,"roteiro":"Em até 10 minutos, o corretor enquadra os 10 perfis de treino: faixa, renda que conta, subsídio possível ou não, FGTS, parcela de referência (cerca de 30% da renda) e o que pode travar. Depois, nos perfis 2, 5 e 8, fala em voz alta a frase que diria ao cliente, com a linguagem permitida. Por fim, registra no CRM de treino (ou num formulário igual à aba Dados) a Faixa MCMV e o Tipo de renda de três perfis. Os perfis seguem a distribuição real da casa: F2 e F3 somam 70,9% das simulações (jul a set/2026). Os valores são de treino.","persona":"Perfis de treino baseados nas personas P1, P2, P3, P4 e P11 (seção 9.13) e nas situações das fases C e D","rubrica":"Padrão SMQ, critérios 2 (qualificação), 3 (condução), 6 (verdade e conformidade) e 7 (registro no CRM)","nota_minima":3.5,"papeis":"O corretor recebe os 10 cartões de perfil. O gerente cronometra os 10 minutos, faz o papel do cliente por 2 minutos nos perfis 2, 5 e 8 e corrige com o gabarito.","roteiro_cliente":["Perfil 1: solteiro CLT, renda bruta de R$ 2.800, mora de aluguel, sem imóvel no nome.","Perfil 2: cliente diz \"ganho uns R$ 3.000\" e não sabe se o valor é bruto; mora com a mãe.","Perfil 3 (P1): casal CLT com renda somada de R$ 4.500, aluguel de R$ 1.200, um deles com FGTS de 4 anos, primeiro imóvel.","Perfil 4 (P2): entregador de aplicativo, cerca de R$ 2.800 por mês há 5 meses na mesma plataforma, sem MEI, trabalhou 2 anos registrado no passado.","Perfil 5: casal CLT, ele com R$ 3.000 e ela com R$ 2.500, querem comprar juntos.","Perfil 6 (P3): solteira CLT, renda de R$ 7.500, pouco dinheiro guardado, FGTS de 2 anos e 10 meses.","Perfil 7: MEI que declara R$ 7.000 por mês; o faturamento médio comprovado é de R$ 5.500.","Perfil 8 (P4): casal com renda de R$ 12.000, quer somar a renda da mãe (R$ 2.500) para comprar uma unidade de R$ 480 mil (valor de treino).","Perfil 9 (P11): aposentado de 58 anos, renda de aposentadoria de R$ 5.200.","Perfil 10: casal com renda de R$ 14.000 que quer o Minha Casa Minha Vida \"porque é mais barato\"."],"observador_procura":["Faixa certa nas rendas de fronteira, pela tabela vigente.","Nenhum subsídio dado como certo, e nenhum subsídio na F3 ou na F4.","Folga até R$ 13.000 calculada antes de qualquer composição na F4.","Renda perto do piso confirmada como bruta ou líquida antes de enquadrar.","\"Não dá\" dito cedo, sempre com o caminho possível.","Linguagem permitida: \"parece se encaixar\", \"a análise confirma\", \"estimativa\"; nenhuma promessa de aprovação, taxa ou parcela exata (critério 6 só com nota 5).","Faixa MCMV e Tipo de renda registrados."]},"desafio_campo":{"tarefa":"Em 48 horas, complete a ficha de 3 clientes reais da sua carteira: os 5 campos da espinha e a Faixa MCMV conferida pela renda bruta, com o que pode travar anotado nas Observações (FGTS, imóvel no nome, restrição, laudo). Se algum não fechar no MCMV, registre o caminho oferecido no desfecho.","prazo_horas":48,"evidencia_no_crm":"Dossiê › aba Dados dos 3 clientes com Renda informada, Tipo de renda, Usa FGTS, Entrada disponível, Faixa MCMV e Decisor preenchidos, e desfecho com próximo passo e data","como_o_gestor_confere":"Abre o Dossiê dos 3 clientes indicados pelo corretor, confere se a Faixa MCMV bate com a Renda informada pela tabela vigente e se há próximo passo com data. Cliente com perfil incompatível precisa ter a rota registrada no desfecho, não só a perda."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":5,"quem_grava":"O gerente, com a tela do CRM aberta no Dossiê","cenario":"Escritório da SMQ, com a aba Dados do Dossiê e a tabela de faixas vigente na tela","blocos":[{"tempo":"0:00","fala":"R$ 5.000 é Faixa 2. R$ 5.000 e um centavo é Faixa 3. Um centavo muda subsídio, juros e teto. Hoje você aprende a não errar esse centavo.","na_tela":"Os dois valores lado a lado, com a faixa de cada um"},{"tempo":"0:20","fala":"Perfil que não fecha e ninguém avisa está entre os erros mais frequentes da nossa auditoria de atendimento. Quando isso aparece só na análise, a gente já gastou ligação, visita e pasta.","na_tela":"15 de 156 erros auditados, jul a set/2026"},{"tempo":"0:50","fala":"O método é um só: renda, faixa, subsídio, FGTS, entrada e parcela. Só depois, o produto que cabe.","na_tela":"Os 7 passos em lista"},{"tempo":"1:40","fala":"Olha o Dossiê: renda informada, tipo de renda, usa FGTS, entrada, faixa e decisor. Faixa vazia é apresentação proibida.","na_tela":"Demonstração na aba Dados do Dossiê"},{"tempo":"2:40","fala":"Três casos rápidos: o casal da Faixa 4 que quer somar a renda da mãe, o cliente que fez saque-aniversário e o aposentado de 58 anos que acha que não financia mais.","na_tela":"Os três cartões de perfil com a resposta certa"},{"tempo":"3:40","fala":"O erro mais comum: prometer subsídio pra quem está na Faixa 3. Faixa 3 e Faixa 4 não têm subsídio. E nunca diga que o governo vai dar um valor.","na_tela":"Mensagem errada riscada e a versão certa"},{"tempo":"4:10","fala":"Seu desafio: em 48 horas, fichas completas de 3 clientes reais, com a faixa conferida e o que pode travar anotado.","na_tela":"O desafio de campo e onde o gerente confere"},{"tempo":"4:40","fala":"Dizer não dá cedo salva o mês. E sempre com o caminho.","na_tela":"Frase-âncora do módulo"}]},"fontes_internas":["Seções 3, 9.1, 9.3, 9.9, 9.12, 9.13, 9.14 e 9.16 do super prompt","Estudo da Academia v2.1, seções 2, 3.1, 3.3 e 3.5 e as situações das fases C e D","Conteúdo anterior do módulo no CRM (Notion, abr/2026): os 7 passos de pré-qualificação, mantidos como checklist e corrigidos para a tabela vigente","Campos do Dossiê e motivos de perda conferidos no código do CRM (set/2026)"],"origem":"SMQ","pendencias":["[CONFIRMAR] Teto exato de F1 e F2 na capital e taxa por sub-faixa no simulador oficial (até lá: \"até R$ 275 mil nas maiores cidades; o simulador confirma\").","[CONFIRMAR] Limite de participantes na composição de renda e regra de idade do participante mais velho, com o correspondente.","[CONFIRMAR] Alcance exato das condições do FGTS e valor livre com antecipação do saque-aniversário, com o correspondente.","[CONFIRMAR] Lista final de documentos da renda de aplicativo, com o correspondente.","[CONFIRMAR] Critérios de comprometimento de renda (empréstimo, carro, cartão), com o correspondente.","[CONFIRMAR na publicação] Reconferir a tabela de faixas (Portaria MCID nº 333/2026, conferida em 29/09/2026) e o radar regulatório antes de liberar as questões M05-Q02, Q07, Q10, Q11, Q12, Q17, Q18 e Q19.","[GAP DE CRM] Não há indicador de fichas completas por corretor nem campo próprio para tempo de registro no FGTS, imóvel no nome e antecipação do saque-aniversário (hoje vão nas Observações do Dossiê).","[DADO A MEDIR NO CRM] Linha de base de fichas com os 5 campos e de perdas por crédito descobertas só na análise.","[CALIBRAR] Meta de fichas completas antes da visita e de perdas por \"Renda acima do teto MCMV\" sem rota oferecida."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M05-A1', 'M05-A2', 'M05-A3', 'M05-A4', 'M05-A5'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 5;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M05-Q01', 'M05-Q02', 'M05-Q03', 'M05-Q04', 'M05-Q05', 'M05-Q06', 'M05-Q07', 'M05-Q08', 'M05-Q09', 'M05-Q10', 'M05-Q11', 'M05-Q12', 'M05-Q13', 'M05-Q14', 'M05-Q15', 'M05-Q16', 'M05-Q17', 'M05-Q18', 'M05-Q19', 'M05-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M05-F01', 'M05-F02', 'M05-F03', 'M05-F04', 'M05-F05', 'M05-F06', 'M05-F07', 'M05-F08', 'M05-F09', 'M05-F10', 'M05-F11', 'M05-F12', 'M05-F13', 'M05-F14');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 14;

-- 3. Aulas (5)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M05-A1', 1, 'Enquadrar antes de ofertar: os 7 passos', 'texto',
  'O cliente amou a planta, marcou a visita e trouxe a esposa. Na análise, a renda somada passou do teto da faixa e o produto não cabia. Ninguém errou de má-fé. Só faltou fazer a conta antes do encanto.

### Por que importa

Perfil incompatível com o MCMV que ninguém sinalizou apareceu 15 vezes entre os 156 erros da auditoria de atendimento (jul a set/2026), um dos 5 erros mais frequentes. Cada caso desses queima ligação, visita e pasta e só aparece na análise, o ponto mais caro do funil. Enquadrar primeiro custa 10 minutos e protege o seu mês e a confiança do cliente.

### O conceito

Enquadrar é o exame antes da receita: o médico primeiro sabe quem é o paciente, depois escolhe o remédio. No MCMV, o exame é a sequência renda, faixa, subsídio, FGTS, entrada e parcela. Sem a faixa definida, a simulação sai errada e a pasta volta da Caixa. O corretor não aprova ninguém: ele enquadra, simula como estimativa e leva a pasta certa ao correspondente.

### O método SMQ, passo a passo

1. Passo 1, renda familiar comprovável: some só quem vai entrar no contrato e só o que se comprova (aula A3). Pergunte se o valor é bruto ou líquido.
2. Passo 2, faixa e teto: a renda define a faixa do MCMV e o teto do imóvel daquela faixa (aula A2). Registre no campo Faixa MCMV do Dossiê.
3. Passo 3, parcela de referência: com seguros e taxa de administração, a parcela cabe em até cerca de 30% da renda bruta familiar. Renda de R$ 5.000, parcela de até R$ 1.500. É referência, não promessa.
4. Passo 4, FGTS e subsídio: 3 anos de trabalho sob o FGTS, somando vínculos; subsídio só existe na F1 e na F2 e só sai na simulação e na análise (aulas A2 e A4; conta completa no M09).
5. Passo 5, elegibilidade: imóvel residencial no nome na região, financiamento ativo no sistema, idade mais prazo e finalidade de moradia (aula A4).
6. Passo 6, nome e compromissos: restrição no nome e parcelas de empréstimo, carro e cartão pesam na análise. Restrição não descarta: vai para a pré-análise com o correspondente (M07).
7. Passo 7, o produto cabe? Preço dentro do teto da faixa, entrada com o cenário de laudo (M08) e a regra municipal da unidade (M06). Se não cabe, ajuste antes de apresentar ou diga "não dá" com o caminho (aula A5).
8. Os 7 passos cabem na espinha que você já usa (M16): as perguntas saem na ligação, as respostas vão para a ficha e o checklist libera a apresentação.

### Na vida real

**O caso:** Auditoria das conversas de atendimento (jul a set/2026): perfil incompatível com o MCMV não sinalizado, entre os 5 erros mais frequentes.

**O que foi dito:** Nos casos auditados, a conversa seguiu qualificando região, planta e horário de visita depois de o cliente já ter dado um dado que inviabilizava o programa, como renda acima do teto ou imóvel no nome.

**O que aconteceu:** O problema só apareceu na análise, o ponto mais caro do funil. A regra que saiu dali: "Dizer ''não dá'' cedo salva o mês", sempre mostrando o caminho possível.

### Scripts prontos

#### Ligação · Antes de falar de produto, pedir licença para enquadrar

> Antes de eu te mostrar qualquer apartamento, deixa eu fazer uma conta rápida com você, pra não te apresentar nada que não cabe no seu bolso. Leva uns três minutinhos. Pode ser?

**Por que funciona:** Explica o benefício da pergunta (âncora), pede só um sim e posiciona o corretor como quem protege o tempo do cliente.

#### WhatsApp · O cliente pede preço e planta antes de dar qualquer dado

> Te mando sim! O valor a partir de é R$ [preço] pela tabela de hoje. Pra eu te dizer quanto fica de entrada e de parcela no seu caso, me diz: somando quem entraria na compra, vocês ganham mais ou menos quanto por mês?

**Por que funciona:** Preço "a partir de" pode ser dito; parcela depende da renda. Responde ao pedido e devolve com uma pergunta só, a que destrava o enquadramento.

### Erros que matam a venda

- **Apresentar o apartamento antes de saber a faixa**  
  Quanto custa: O cliente se apaixona por um produto que não cabe, e a frustração chega na análise  
  Correção: Os 7 passos antes da primeira planta
- **Tratar a simulação como aprovação**  
  Quanto custa: Promessa que a análise pode desmentir e confiança destruída  
  Correção: "Simulação indica. Análise formal aprova." Sempre com a palavra estimativa
- **Pular o passo 6 porque o cliente parece organizado**  
  Quanto custa: Restrição ou parcela de carro aparece na análise e derruba a pasta  
  Correção: A trava de nome e crédito do M16 em toda ligação

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Preencher os 5 campos da espinha e a Faixa MCMV antes de agendar a visita
- **Campo:** Renda informada, Tipo de renda, Usa FGTS, Entrada disponível, Faixa MCMV e Decisor
- **Regra:** Sem faixa definida, não há apresentação de produto nem simulação enviada ao cliente

### Frase-âncora

> **Enquadrar antes de ofertar. Quem apresenta antes, descobre depois.**

### Checagem rápida

1. Qual é a ordem do enquadramento?  
   Resposta: Renda, faixa, subsídio, FGTS, entrada e parcela; depois, o produto que cabe.
2. Qual é a parcela de referência para uma renda familiar bruta de R$ 5.000?  
   Resposta: Até cerca de R$ 1.500, com seguros e taxa de administração (cerca de 30% da renda). É estimativa.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"O cliente amou a planta, marcou a visita e trouxe a esposa. Na análise, a renda somada passou do teto da faixa e o produto não cabia. Ninguém errou de má-fé. Só faltou fazer a conta antes do encanto.","por_que_importa":"Perfil incompatível com o MCMV que ninguém sinalizou apareceu 15 vezes entre os 156 erros da auditoria de atendimento (jul a set/2026), um dos 5 erros mais frequentes. Cada caso desses queima ligação, visita e pasta e só aparece na análise, o ponto mais caro do funil. Enquadrar primeiro custa 10 minutos e protege o seu mês e a confiança do cliente.","conceito":"Enquadrar é o exame antes da receita: o médico primeiro sabe quem é o paciente, depois escolhe o remédio. No MCMV, o exame é a sequência renda, faixa, subsídio, FGTS, entrada e parcela. Sem a faixa definida, a simulação sai errada e a pasta volta da Caixa. O corretor não aprova ninguém: ele enquadra, simula como estimativa e leva a pasta certa ao correspondente.","metodo":["Passo 1, renda familiar comprovável: some só quem vai entrar no contrato e só o que se comprova (aula A3). Pergunte se o valor é bruto ou líquido.","Passo 2, faixa e teto: a renda define a faixa do MCMV e o teto do imóvel daquela faixa (aula A2). Registre no campo Faixa MCMV do Dossiê.","Passo 3, parcela de referência: com seguros e taxa de administração, a parcela cabe em até cerca de 30% da renda bruta familiar. Renda de R$ 5.000, parcela de até R$ 1.500. É referência, não promessa.","Passo 4, FGTS e subsídio: 3 anos de trabalho sob o FGTS, somando vínculos; subsídio só existe na F1 e na F2 e só sai na simulação e na análise (aulas A2 e A4; conta completa no M09).","Passo 5, elegibilidade: imóvel residencial no nome na região, financiamento ativo no sistema, idade mais prazo e finalidade de moradia (aula A4).","Passo 6, nome e compromissos: restrição no nome e parcelas de empréstimo, carro e cartão pesam na análise. Restrição não descarta: vai para a pré-análise com o correspondente (M07).","Passo 7, o produto cabe? Preço dentro do teto da faixa, entrada com o cenário de laudo (M08) e a regra municipal da unidade (M06). Se não cabe, ajuste antes de apresentar ou diga \"não dá\" com o caminho (aula A5).","Os 7 passos cabem na espinha que você já usa (M16): as perguntas saem na ligação, as respostas vão para a ficha e o checklist libera a apresentação."],"na_vida_real":{"caso":"Auditoria das conversas de atendimento (jul a set/2026): perfil incompatível com o MCMV não sinalizado, entre os 5 erros mais frequentes.","o_que_foi_dito":"Nos casos auditados, a conversa seguiu qualificando região, planta e horário de visita depois de o cliente já ter dado um dado que inviabilizava o programa, como renda acima do teto ou imóvel no nome.","resultado":"O problema só apareceu na análise, o ponto mais caro do funil. A regra que saiu dali: \"Dizer ''não dá'' cedo salva o mês\", sempre mostrando o caminho possível.","fonte":"Seção 9.16 do super prompt (156 erros auditados, jul a set/2026)"},"scripts":[{"canal":"Ligação","situacao":"Antes de falar de produto, pedir licença para enquadrar","texto":"Antes de eu te mostrar qualquer apartamento, deixa eu fazer uma conta rápida com você, pra não te apresentar nada que não cabe no seu bolso. Leva uns três minutinhos. Pode ser?","por_que_funciona":"Explica o benefício da pergunta (âncora), pede só um sim e posiciona o corretor como quem protege o tempo do cliente."},{"canal":"WhatsApp","situacao":"O cliente pede preço e planta antes de dar qualquer dado","texto":"Te mando sim! O valor a partir de é R$ [preço] pela tabela de hoje. Pra eu te dizer quanto fica de entrada e de parcela no seu caso, me diz: somando quem entraria na compra, vocês ganham mais ou menos quanto por mês?","por_que_funciona":"Preço \"a partir de\" pode ser dito; parcela depende da renda. Responde ao pedido e devolve com uma pergunta só, a que destrava o enquadramento."}],"erros_que_matam":[{"erro":"Apresentar o apartamento antes de saber a faixa","custo":"O cliente se apaixona por um produto que não cabe, e a frustração chega na análise","correcao":"Os 7 passos antes da primeira planta"},{"erro":"Tratar a simulação como aprovação","custo":"Promessa que a análise pode desmentir e confiança destruída","correcao":"\"Simulação indica. Análise formal aprova.\" Sempre com a palavra estimativa"},{"erro":"Pular o passo 6 porque o cliente parece organizado","custo":"Restrição ou parcela de carro aparece na análise e derruba a pasta","correcao":"A trava de nome e crédito do M16 em toda ligação"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Preencher os 5 campos da espinha e a Faixa MCMV antes de agendar a visita","campo":"Renda informada, Tipo de renda, Usa FGTS, Entrada disponível, Faixa MCMV e Decisor","regra":"Sem faixa definida, não há apresentação de produto nem simulação enviada ao cliente"},"frase_ancora":"Enquadrar antes de ofertar. Quem apresenta antes, descobre depois.","checagem_rapida":[{"pergunta":"Qual é a ordem do enquadramento?","resposta":"Renda, faixa, subsídio, FGTS, entrada e parcela; depois, o produto que cabe."},{"pergunta":"Qual é a parcela de referência para uma renda familiar bruta de R$ 5.000?","resposta":"Até cerca de R$ 1.500, com seguros e taxa de administração (cerca de 30% da renda). É estimativa."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M05-A2', 2, 'As 4 faixas e as fronteiras que enganam', 'texto',
  'R$ 5.000,00 de renda é Faixa 2, com subsídio possível. R$ 5.000,01 é Faixa 3, sem subsídio e com juros mais altos. Um centavo muda a conversa inteira, e é por isso que corretor SMQ não enquadra no olho.

### Por que importa

F2 e F3 somam 70,9% das simulações da casa (247 simulações, jul a set/2026), e é exatamente na divisa entre elas que mora o erro caro: prometer subsídio a quem está na F3, ou apresentar um imóvel de R$ 401 mil a quem, na F3, só pode comprar até R$ 400 mil. Faixa certa é simulação certa, e simulação certa é pasta que não volta.

### O conceito

As faixas são os degraus de uma escada: cada degrau tem o seu teto de imóvel, a sua taxa de juros e, nos dois primeiros, o subsídio. A renda familiar bruta diz em que degrau o cliente pisa. Um detalhe que surpreende: o degrau mais alto nem sempre compra mais. Os juros maiores da F4 comem a capacidade, e ela financia menos que o topo da F3.

### O método SMQ, passo a passo

1. F1: renda familiar bruta de até R$ 3.200; teto do imóvel de R$ 210 mil a R$ 275 mil, conforme o município (de R$ 264 mil a R$ 275 mil nas cidades com mais de 750 mil habitantes); juros nominais de referência de 4,00% a 5,25% ao ano; tem o maior subsídio.
2. F2: de R$ 3.200,01 a R$ 5.000; teto igual ao da F1; juros de 4,75% a 7,00% ao ano; subsídio decrescente com a renda.
3. F3: de R$ 5.000,01 a R$ 9.600; teto de R$ 400 mil; juros de 7,66% a 8,16% ao ano; não tem subsídio.
4. F4: de R$ 9.600,01 a R$ 13.000; teto de R$ 600 mil; juros em torno de 10% a 10,5% ao ano; não tem subsídio.
5. Tabela vigente desde 22/04/2026 (Portaria MCID nº 333/2026), conferida em 29/09/2026: confirme na tabela oficial antes de usar com cliente. Na capital, o teto exato de F1 e F2 e a taxa de cada sub-faixa saem no simulador.
6. Acima de R$ 13.000: Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado. Nunca rejeite lead por renda alta: roteie.
7. Depois da faixa, confira o teto: o preço da unidade precisa caber no teto da faixa do cliente. Se não couber, quem diz o enquadramento possível é o correspondente.
8. Proposta de mudança do programa em análise no governo não é regra. Com cliente, fale só do que vale hoje; se for aprovada, a casa atualiza as aulas no mesmo dia.

### Na vida real

**O caso:** Estudo interno de capacidade por faixa (ago/2026, PRICE, 420 meses, parcela de 30% da renda com seguros e taxa).

**O que foi dito:** Com renda de R$ 9.600, no topo da F3, o valor financiável estimado ficou em cerca de R$ 425,2 mil. Com renda de R$ 11.000, já na F4 e a 10,5% ao ano, ficou em cerca de R$ 407 mil.

**O que aconteceu:** Quem ganhava mais financiou menos. A lição do estudo: "anunciar para a classe média" não é estratégia automática, e a simulação se refaz sempre com a taxa do dia. São números de ordem de grandeza, não para usar com cliente.

### Scripts prontos

#### Ligação · Cliente de F2 pergunta se tem subsídio

> Pelo que você me falou, vocês parecem se encaixar na Faixa 2, e nessa faixa existe subsídio. O valor muda com a renda, a cidade e a família, e quem confirma é a análise da Caixa. Eu te mostro o número antes de você assinar qualquer coisa. Posso já deixar a sua simulação pronta?

**Por que funciona:** Linguagem permitida ("parece se encaixar", "a análise confirma"), subsídio só depois de saber a renda, nenhum valor prometido e um próximo passo no fim.

#### WhatsApp · Cliente com renda de R$ 14 mil acha que não pode comprar

> Pode sim, [nome]! Com essa renda vocês ficam acima do Minha Casa Minha Vida, e o caminho é outra linha de financiamento, com as regras dela. Quer que eu te mostre as opções que cabem pra vocês?

**Por que funciona:** Nunca rejeitar renda alta: rotear. Uma pergunta só, e o cliente sai da conversa com um caminho.

### Erros que matam a venda

- **Dar subsídio como certo para quem está na F3**  
  Quanto custa: Promessa impossível: F3 e F4 não têm subsídio, e o cliente descobre na análise  
  Correção: Subsídio só na F1 e na F2, só depois de saber a renda e sempre como "varia e se confirma na análise"
- **Enquadrar no olho quem está na fronteira**  
  Quanto custa: Simulação com a taxa e o teto errados e pasta que volta  
  Correção: Renda exata, bruta, somando quem entra no contrato, contra a tabela vigente
- **Descartar o lead que ganha acima de R$ 13.000**  
  Quanto custa: Cliente com capacidade de compra perdido sem motivo  
  Correção: Rotear para Pró-Cotista ou SBPE e perder só com o motivo verdadeiro

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Registrar a Faixa MCMV depois de confirmar a renda bruta
- **Campo:** Faixa MCMV e Renda informada
- **Regra:** A faixa registrada é a da renda que se comprova, não a que o anúncio sugere; renda acima de R$ 13.000 não vira perda por "Renda acima do teto MCMV" sem a rota oferecida

### Frase-âncora

> **Um centavo muda a faixa. Enquadre com a renda exata.**

### Checagem rápida

1. Renda familiar bruta de R$ 9.600,01: qual faixa?  
   Resposta: F4, com teto de imóvel de R$ 600 mil e sem subsídio (tabela vigente desde 22/04/2026).
2. Por que a F4 pode financiar menos que o topo da F3?  
   Resposta: Porque os juros mais altos da F4 comem a capacidade de pagamento (estudo interno de ago/2026).
3. Quem ganha R$ 13.500 sai do atendimento?  
   Resposta: Não. Vai para Pró-Cotista ou SBPE: nunca rejeitar lead por renda alta.',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"R$ 5.000,00 de renda é Faixa 2, com subsídio possível. R$ 5.000,01 é Faixa 3, sem subsídio e com juros mais altos. Um centavo muda a conversa inteira, e é por isso que corretor SMQ não enquadra no olho.","por_que_importa":"F2 e F3 somam 70,9% das simulações da casa (247 simulações, jul a set/2026), e é exatamente na divisa entre elas que mora o erro caro: prometer subsídio a quem está na F3, ou apresentar um imóvel de R$ 401 mil a quem, na F3, só pode comprar até R$ 400 mil. Faixa certa é simulação certa, e simulação certa é pasta que não volta.","conceito":"As faixas são os degraus de uma escada: cada degrau tem o seu teto de imóvel, a sua taxa de juros e, nos dois primeiros, o subsídio. A renda familiar bruta diz em que degrau o cliente pisa. Um detalhe que surpreende: o degrau mais alto nem sempre compra mais. Os juros maiores da F4 comem a capacidade, e ela financia menos que o topo da F3.","metodo":["F1: renda familiar bruta de até R$ 3.200; teto do imóvel de R$ 210 mil a R$ 275 mil, conforme o município (de R$ 264 mil a R$ 275 mil nas cidades com mais de 750 mil habitantes); juros nominais de referência de 4,00% a 5,25% ao ano; tem o maior subsídio.","F2: de R$ 3.200,01 a R$ 5.000; teto igual ao da F1; juros de 4,75% a 7,00% ao ano; subsídio decrescente com a renda.","F3: de R$ 5.000,01 a R$ 9.600; teto de R$ 400 mil; juros de 7,66% a 8,16% ao ano; não tem subsídio.","F4: de R$ 9.600,01 a R$ 13.000; teto de R$ 600 mil; juros em torno de 10% a 10,5% ao ano; não tem subsídio.","Tabela vigente desde 22/04/2026 (Portaria MCID nº 333/2026), conferida em 29/09/2026: confirme na tabela oficial antes de usar com cliente. Na capital, o teto exato de F1 e F2 e a taxa de cada sub-faixa saem no simulador.","Acima de R$ 13.000: Pró-Cotista (com FGTS ativo) ou SBPE, com juros de mercado. Nunca rejeite lead por renda alta: roteie.","Depois da faixa, confira o teto: o preço da unidade precisa caber no teto da faixa do cliente. Se não couber, quem diz o enquadramento possível é o correspondente.","Proposta de mudança do programa em análise no governo não é regra. Com cliente, fale só do que vale hoje; se for aprovada, a casa atualiza as aulas no mesmo dia."],"na_vida_real":{"caso":"Estudo interno de capacidade por faixa (ago/2026, PRICE, 420 meses, parcela de 30% da renda com seguros e taxa).","o_que_foi_dito":"Com renda de R$ 9.600, no topo da F3, o valor financiável estimado ficou em cerca de R$ 425,2 mil. Com renda de R$ 11.000, já na F4 e a 10,5% ao ano, ficou em cerca de R$ 407 mil.","resultado":"Quem ganhava mais financiou menos. A lição do estudo: \"anunciar para a classe média\" não é estratégia automática, e a simulação se refaz sempre com a taxa do dia. São números de ordem de grandeza, não para usar com cliente.","fonte":"Seção 9.9 do super prompt (estudo interno de ago/2026)"},"scripts":[{"canal":"Ligação","situacao":"Cliente de F2 pergunta se tem subsídio","texto":"Pelo que você me falou, vocês parecem se encaixar na Faixa 2, e nessa faixa existe subsídio. O valor muda com a renda, a cidade e a família, e quem confirma é a análise da Caixa. Eu te mostro o número antes de você assinar qualquer coisa. Posso já deixar a sua simulação pronta?","por_que_funciona":"Linguagem permitida (\"parece se encaixar\", \"a análise confirma\"), subsídio só depois de saber a renda, nenhum valor prometido e um próximo passo no fim."},{"canal":"WhatsApp","situacao":"Cliente com renda de R$ 14 mil acha que não pode comprar","texto":"Pode sim, [nome]! Com essa renda vocês ficam acima do Minha Casa Minha Vida, e o caminho é outra linha de financiamento, com as regras dela. Quer que eu te mostre as opções que cabem pra vocês?","por_que_funciona":"Nunca rejeitar renda alta: rotear. Uma pergunta só, e o cliente sai da conversa com um caminho."}],"erros_que_matam":[{"erro":"Dar subsídio como certo para quem está na F3","custo":"Promessa impossível: F3 e F4 não têm subsídio, e o cliente descobre na análise","correcao":"Subsídio só na F1 e na F2, só depois de saber a renda e sempre como \"varia e se confirma na análise\""},{"erro":"Enquadrar no olho quem está na fronteira","custo":"Simulação com a taxa e o teto errados e pasta que volta","correcao":"Renda exata, bruta, somando quem entra no contrato, contra a tabela vigente"},{"erro":"Descartar o lead que ganha acima de R$ 13.000","custo":"Cliente com capacidade de compra perdido sem motivo","correcao":"Rotear para Pró-Cotista ou SBPE e perder só com o motivo verdadeiro"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Registrar a Faixa MCMV depois de confirmar a renda bruta","campo":"Faixa MCMV e Renda informada","regra":"A faixa registrada é a da renda que se comprova, não a que o anúncio sugere; renda acima de R$ 13.000 não vira perda por \"Renda acima do teto MCMV\" sem a rota oferecida"},"frase_ancora":"Um centavo muda a faixa. Enquadre com a renda exata.","checagem_rapida":[{"pergunta":"Renda familiar bruta de R$ 9.600,01: qual faixa?","resposta":"F4, com teto de imóvel de R$ 600 mil e sem subsídio (tabela vigente desde 22/04/2026)."},{"pergunta":"Por que a F4 pode financiar menos que o topo da F3?","resposta":"Porque os juros mais altos da F4 comem a capacidade de pagamento (estudo interno de ago/2026)."},{"pergunta":"Quem ganha R$ 13.500 sai do atendimento?","resposta":"Não. Vai para Pró-Cotista ou SBPE: nunca rejeitar lead por renda alta."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M05-A3', 3, 'Renda que conta: tipos de renda e composição', 'texto',
  '"Eu ganho uns R$ 3.000." Parece Faixa 1, com o maior subsídio. Mas é líquido ou bruto? Tem alguém que vai somar? Metade vem por fora? A boa notícia dada cedo demais vira desqualificação na análise, e o cliente não esquece quem deu a notícia.

### Por que importa

A Caixa aprova a renda que se comprova, não a que se declara. Errar o tipo de renda é enquadrar na faixa errada, simular a parcela errada e montar a pasta errada. E na F4 um erro de composição tira o cliente do programa: passou de R$ 13.000, ele sai do MCMV e cai no SBPE, com juros de mercado.

### O conceito

Renda para a Caixa é como bagagem no aeroporto: só embarca o que está etiquetado. O que entra em mãos, sem comprovante, fica no chão. O seu trabalho é descobrir o que já tem etiqueta, o que dá para etiquetar (formalizar, compor com quem entra no contrato) e nunca pôr etiqueta falsa.

### O método SMQ, passo a passo

1. CLT: holerite e carteira de trabalho. É o perfil mais simples de comprovar.
2. Autônomo: comprova com extratos, declaração de imposto e DECORE quando pedido. MEI: vale a média do faturamento, não o valor declarado.
3. Aplicativo: a renda de motorista e de entregador de aplicativo passou a contar como renda formal. O que se sabe: 4 meses seguidos na mesma plataforma, relatório ou extrato mais recente com no máximo 2 meses, resumo mensal emitido pela plataforma e vale o mês de menor valor; não exige MEI nem declaração de imposto [CONFIRMAR a lista de documentos com o correspondente]. Fale sem cravar a data da regra.
4. Não conta como renda: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS. O que entra em mãos sem comprovação também não conta. Renda 100% informal: orientar a formalização ou compor renda, nunca descartar.
5. Renda declarada de até R$ 3.000: confirme se é bruta ou líquida e se há composição antes de falar em elegibilidade.
6. Composição: com quem vai entrar no contrato (cônjuge, pais, filhos maiores, irmãos ou quem mora junto) [CONFIRMAR o limite de participantes com o correspondente]. Com composição, a idade do participante mais velho costuma limitar o prazo [CONFIRMAR com o correspondente].
7. Na F4, calcule a folga antes de sugerir composição: R$ 13.000 menos a renda atual. Renda de R$ 12.000 tem folga de R$ 1.000; somar uma renda de R$ 2.500 leva a R$ 14.500 e tira o cliente do MCMV.
8. Na F2, somar renda pode levar a família para a F3, que não tem subsídio. Antes de afirmar qualquer coisa, a simulação com o correspondente mostra o enquadramento e a condição de cada cenário.
9. Renda é a real. Se o cliente perguntar "qual renda eu informo?", a resposta é a renda real e comprovada; o correspondente orienta como documentar. Ninguém sugere valor.

### Na vida real

**O caso:** Aprendizado do robô de qualificação (27/07/2026): renda perto do piso da F1.

**O que foi dito:** Clientes que declaravam renda de até R$ 3.000 recebiam cedo a notícia de que estavam dentro do programa, sem a confirmação de que o valor era bruto e de quem mais entraria na compra.

**O que aconteceu:** A boa notícia precoce virou desqualificação tardia. A regra passou a ser: confirmar bruto, líquido e composição antes de enquadrar.

### Scripts prontos

#### WhatsApp · Cliente diz que ganha em torno de R$ 3.000

> Show, [nome]! Esse valor é o que cai na conta ou o do holerite, antes dos descontos?

**Por que funciona:** Uma pergunta só, em linguagem de cliente ("o que cai na conta", "antes dos descontos"), que evita enquadrar pela renda líquida.

#### Ligação · Casal na F4 quer somar a renda da mãe

> Entendi a ideia, e faz sentido querer aumentar o valor. Antes, deixa eu te mostrar uma conta: vocês ganham R$ 12 mil juntos, e o programa vai até R$ 13 mil. Se a gente somar a renda da sua mãe, vocês podem sair do Minha Casa Minha Vida e cair num financiamento com juros de mercado. Posso simular os dois cenários pra vocês escolherem com os números na mão?

**Por que funciona:** Calcula a folga antes de sugerir, explica a consequência em linguagem simples e deixa a decisão com o cliente, apoiada na simulação.

#### WhatsApp · Cliente pergunta "qual renda eu informo?"

> A renda real, [nome], a que você consegue comprovar: é ela que a Caixa analisa e é o que te protege. A análise é gratuita e o documento vai só pelo canal oficial da SMQ. Consegue me mandar os 6 últimos extratos ainda hoje?

**Por que funciona:** Integridade da pasta: ninguém sugere valor. Âncora antigolpe no pedido de documento e próximo passo concreto com uma pergunta só.

### Erros que matam a venda

- **Somar renda que entra em mãos, sem comprovante**  
  Quanto custa: Faixa e parcela erradas; a análise corta a renda e a pasta volta  
  Correção: Só conta o que se comprova; o resto vira formalização ou composição
- **Sugerir composição de renda na F4 sem calcular a folga**  
  Quanto custa: O cliente sai do programa e cai no SBPE  
  Correção: R$ 13.000 menos a renda atual, antes de qualquer sugestão
- **Sugerir um valor de renda para "bater" com a aprovação**  
  Quanto custa: Risco grave para o cliente, para o corretor e para a SMQ  
  Correção: A renda real e comprovada define a aprovação, nunca o contrário

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Registrar a renda confirmada e o tipo de renda; anotar a composição nas Observações
- **Campo:** Renda informada e Tipo de renda
- **Regra:** A renda registrada é a bruta e comprovável, somando só quem entra no contrato

### Frase-âncora

> **Renda que conta é renda que se comprova.**

### Checagem rápida

1. Um MEI declara R$ 7.000, e o faturamento médio comprovado é de R$ 5.500. Qual renda a análise tende a considerar?  
   Resposta: A média do faturamento, R$ 5.500, não o valor declarado.
2. Renda de R$ 12.000 na F4: qual a folga para compor sem sair do programa?  
   Resposta: R$ 1.000 (R$ 13.000 menos R$ 12.000).',
  12, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Eu ganho uns R$ 3.000.\" Parece Faixa 1, com o maior subsídio. Mas é líquido ou bruto? Tem alguém que vai somar? Metade vem por fora? A boa notícia dada cedo demais vira desqualificação na análise, e o cliente não esquece quem deu a notícia.","por_que_importa":"A Caixa aprova a renda que se comprova, não a que se declara. Errar o tipo de renda é enquadrar na faixa errada, simular a parcela errada e montar a pasta errada. E na F4 um erro de composição tira o cliente do programa: passou de R$ 13.000, ele sai do MCMV e cai no SBPE, com juros de mercado.","conceito":"Renda para a Caixa é como bagagem no aeroporto: só embarca o que está etiquetado. O que entra em mãos, sem comprovante, fica no chão. O seu trabalho é descobrir o que já tem etiqueta, o que dá para etiquetar (formalizar, compor com quem entra no contrato) e nunca pôr etiqueta falsa.","metodo":["CLT: holerite e carteira de trabalho. É o perfil mais simples de comprovar.","Autônomo: comprova com extratos, declaração de imposto e DECORE quando pedido. MEI: vale a média do faturamento, não o valor declarado.","Aplicativo: a renda de motorista e de entregador de aplicativo passou a contar como renda formal. O que se sabe: 4 meses seguidos na mesma plataforma, relatório ou extrato mais recente com no máximo 2 meses, resumo mensal emitido pela plataforma e vale o mês de menor valor; não exige MEI nem declaração de imposto [CONFIRMAR a lista de documentos com o correspondente]. Fale sem cravar a data da regra.","Não conta como renda: Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS. O que entra em mãos sem comprovação também não conta. Renda 100% informal: orientar a formalização ou compor renda, nunca descartar.","Renda declarada de até R$ 3.000: confirme se é bruta ou líquida e se há composição antes de falar em elegibilidade.","Composição: com quem vai entrar no contrato (cônjuge, pais, filhos maiores, irmãos ou quem mora junto) [CONFIRMAR o limite de participantes com o correspondente]. Com composição, a idade do participante mais velho costuma limitar o prazo [CONFIRMAR com o correspondente].","Na F4, calcule a folga antes de sugerir composição: R$ 13.000 menos a renda atual. Renda de R$ 12.000 tem folga de R$ 1.000; somar uma renda de R$ 2.500 leva a R$ 14.500 e tira o cliente do MCMV.","Na F2, somar renda pode levar a família para a F3, que não tem subsídio. Antes de afirmar qualquer coisa, a simulação com o correspondente mostra o enquadramento e a condição de cada cenário.","Renda é a real. Se o cliente perguntar \"qual renda eu informo?\", a resposta é a renda real e comprovada; o correspondente orienta como documentar. Ninguém sugere valor."],"na_vida_real":{"caso":"Aprendizado do robô de qualificação (27/07/2026): renda perto do piso da F1.","o_que_foi_dito":"Clientes que declaravam renda de até R$ 3.000 recebiam cedo a notícia de que estavam dentro do programa, sem a confirmação de que o valor era bruto e de quem mais entraria na compra.","resultado":"A boa notícia precoce virou desqualificação tardia. A regra passou a ser: confirmar bruto, líquido e composição antes de enquadrar.","fonte":"Seção 9.9 do super prompt (aprendizado de 27/07/2026)"},"scripts":[{"canal":"WhatsApp","situacao":"Cliente diz que ganha em torno de R$ 3.000","texto":"Show, [nome]! Esse valor é o que cai na conta ou o do holerite, antes dos descontos?","por_que_funciona":"Uma pergunta só, em linguagem de cliente (\"o que cai na conta\", \"antes dos descontos\"), que evita enquadrar pela renda líquida."},{"canal":"Ligação","situacao":"Casal na F4 quer somar a renda da mãe","texto":"Entendi a ideia, e faz sentido querer aumentar o valor. Antes, deixa eu te mostrar uma conta: vocês ganham R$ 12 mil juntos, e o programa vai até R$ 13 mil. Se a gente somar a renda da sua mãe, vocês podem sair do Minha Casa Minha Vida e cair num financiamento com juros de mercado. Posso simular os dois cenários pra vocês escolherem com os números na mão?","por_que_funciona":"Calcula a folga antes de sugerir, explica a consequência em linguagem simples e deixa a decisão com o cliente, apoiada na simulação."},{"canal":"WhatsApp","situacao":"Cliente pergunta \"qual renda eu informo?\"","texto":"A renda real, [nome], a que você consegue comprovar: é ela que a Caixa analisa e é o que te protege. A análise é gratuita e o documento vai só pelo canal oficial da SMQ. Consegue me mandar os 6 últimos extratos ainda hoje?","por_que_funciona":"Integridade da pasta: ninguém sugere valor. Âncora antigolpe no pedido de documento e próximo passo concreto com uma pergunta só."}],"erros_que_matam":[{"erro":"Somar renda que entra em mãos, sem comprovante","custo":"Faixa e parcela erradas; a análise corta a renda e a pasta volta","correcao":"Só conta o que se comprova; o resto vira formalização ou composição"},{"erro":"Sugerir composição de renda na F4 sem calcular a folga","custo":"O cliente sai do programa e cai no SBPE","correcao":"R$ 13.000 menos a renda atual, antes de qualquer sugestão"},{"erro":"Sugerir um valor de renda para \"bater\" com a aprovação","custo":"Risco grave para o cliente, para o corretor e para a SMQ","correcao":"A renda real e comprovada define a aprovação, nunca o contrário"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Registrar a renda confirmada e o tipo de renda; anotar a composição nas Observações","campo":"Renda informada e Tipo de renda","regra":"A renda registrada é a bruta e comprovável, somando só quem entra no contrato"},"frase_ancora":"Renda que conta é renda que se comprova.","checagem_rapida":[{"pergunta":"Um MEI declara R$ 7.000, e o faturamento médio comprovado é de R$ 5.500. Qual renda a análise tende a considerar?","resposta":"A média do faturamento, R$ 5.500, não o valor declarado."},{"pergunta":"Renda de R$ 12.000 na F4: qual a folga para compor sem sair do programa?","resposta":"R$ 1.000 (R$ 13.000 menos R$ 12.000)."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M05-A4', 4, 'Quem pode usar o programa: imóvel no nome, FGTS, idade e finalidade', 'texto',
  '"Posso usar o FGTS? Eu fiz o saque-aniversário." A resposta rápida seria "não pode". Está errada. Aderir ao saque-aniversário não impede a compra. O que trava é outra coisa, e quem sabe a diferença não perde o cliente por um mito.

### Por que importa

Elegibilidade é o filtro que a análise aplica sem exceção: imóvel no nome, financiamento ativo, FGTS e idade. Conferir antes evita pasta reprovada e, do outro lado, evita descartar quem pode comprar. O FGTS falta em 73,1% dos dossiês que chegam do robô (notas de qualificação, jul a set/2026): é pergunta sua na primeira ligação.

### O conceito

Elegibilidade é o ingresso do show: não importa quanto o cliente quer entrar, ele precisa do ingresso certo na mão. O programa é para quem vai morar, não tem imóvel residencial na região e não tem outro financiamento ativo no sistema. O FGTS tem as suas próprias regras, e a idade define até quando o contrato pode ir.

### O método SMQ, passo a passo

1. Imóvel no nome e financiamento ativo: pergunte na ligação (Q4 do M16). Quem já tem imóvel ou financiamento ativo não usa MCMV nem FGTS; os caminhos são SBPE, vender antes ou outro produto. Na dúvida, o gerente.
2. FGTS na compra: 3 anos de trabalho sob o regime do FGTS, somando todos os vínculos (não precisam ser seguidos); sem financiamento ativo no SFH em nenhum lugar do país; sem imóvel residencial no município onde mora ou trabalha, nos vizinhos ou na mesma região metropolitana; imóvel residencial urbano para moradia própria, dentro do teto do SFH [CONFIRMAR o alcance exato de cada condição com o correspondente].
3. Faltam meses para os 3 anos? A data é um marco comercial: agende. Com 2 anos e 10 meses, faltam 2 meses.
4. Saque-aniversário: aderir não impede usar o FGTS na compra (conferido em 17/07/2026). O que trava é o saldo dado em garantia numa antecipação feita em banco. Pergunte "Você fez antecipação do saque-aniversário em algum banco?" e confira o saldo no extrato do FGTS [CONFIRMAR o valor livre com o correspondente].
5. Idade: a idade do comprador mais o prazo do financiamento vai até 80 anos e 6 meses (conferido em 09/06/2026). Cliente de 55 anos: prazo máximo de 25 anos e 6 meses. O prazo vai de 120 a 420 meses, então quem tem 45 anos fica limitado aos 35 anos do programa.
6. Finalidade: MCMV é para morar. Lead que declara investimento puro num produto MCMV é requalificado e levado ao produto certo (R2V, nR, SBPE), sem tese de valorização.
7. Aluguel pago hoje não impede o financiamento; o que pesa são as dívidas parceladas [CONFIRMAR os critérios com o correspondente].

### Na vida real

**O caso:** Aprendizado do robô de qualificação (13/07/2026): investidor em produto MCMV.

**O que foi dito:** Leads que declaravam querer o apartamento para investir eram tratados como compradores MCMV comuns e seguiam até o corretor.

**O que aconteceu:** Handoff improdutivo: o programa é para moradia própria. A regra passou a ser requalificar a finalidade e mudar de produto (R2V, nR, SBPE), sem prometer valorização.

### Scripts prontos

#### Ligação · Cliente diz que fez o saque-aniversário

> Isso não te impede de usar o FGTS na compra, fica tranquilo. Só me confirma uma coisa: você chegou a fazer antecipação do saque-aniversário em algum banco? Se fez, uma parte pode estar presa até quitar, e a gente confere no seu extrato do FGTS.

**Por que funciona:** Corrige o mito com a regra conferida, faz a pergunta certa e já aponta o documento que confirma.

#### WhatsApp · Cliente com FGTS de 2 anos e 10 meses acha que não pode usar

> Boa notícia, [nome]: em 2 meses você completa 3 anos de FGTS, e aí ele pode entrar na compra. Dá pra deixar a análise encaminhada até lá, e ela é gratuita e não te compromete. Quer que eu te mande a lista de documentos?

**Por que funciona:** Transforma um "ainda não" num marco com data e próximo passo, com a âncora de que a análise é gratuita e sem prometer aprovação.

#### Ligação · Aposentado de 58 anos pergunta se ainda financia

> Dá, sim. A regra é a sua idade mais o prazo do financiamento até 80 anos e 6 meses. Com 58 anos, o prazo pode ir até 22 anos e 6 meses. Prazo mais curto deixa a parcela maior, então vamos simular juntos pra ver o que cabe no seu mês. Pode ser hoje às 19h ou amanhã às 10h?

**Por que funciona:** Resposta direta com a regra vigente, a conta feita, o efeito na parcela explicado e duas opções de horário.

### Erros que matam a venda

- **Dizer que o saque-aniversário impede o uso do FGTS**  
  Quanto custa: Cliente elegível desanimado ou descartado sem motivo  
  Correção: Perguntar se houve antecipação em banco e conferir o extrato do FGTS
- **Tratar investidor como cliente MCMV**  
  Quanto custa: Handoff improdutivo e promessa de valorização que ninguém pode fazer  
  Correção: Requalificar a finalidade e mudar de produto
- **Usar a regra antiga de idade (80 anos, ou 80 anos e 5 meses)**  
  Quanto custa: Prazo calculado errado e parcela simulada errada  
  Correção: Idade mais prazo até 80 anos e 6 meses

### No CRM

- **Tela:** Dossiê do cliente › aba Dados
- **Ação:** Registrar o uso do FGTS e anotar o tempo de registro, a data em que completa 3 anos, antecipação do saque-aniversário e imóvel no nome
- **Campo:** Usa FGTS e Observações
- **Regra:** Se faltam meses para os 3 anos, crie o próximo passo com a data do marco [GAP DE CRM: não há campo próprio para o tempo de registro no FGTS]

### Frase-âncora

> **Saque-aniversário não trava. Antecipação trava. Faça a pergunta certa.**

### Checagem rápida

1. Cliente de 62 anos: qual o prazo máximo do financiamento pela regra da idade?  
   Resposta: 18 anos e 6 meses (80 anos e 6 meses menos 62 anos).
2. O que trava o FGTS de quem aderiu ao saque-aniversário?  
   Resposta: Só o saldo dado em garantia numa antecipação feita em banco.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"\"Posso usar o FGTS? Eu fiz o saque-aniversário.\" A resposta rápida seria \"não pode\". Está errada. Aderir ao saque-aniversário não impede a compra. O que trava é outra coisa, e quem sabe a diferença não perde o cliente por um mito.","por_que_importa":"Elegibilidade é o filtro que a análise aplica sem exceção: imóvel no nome, financiamento ativo, FGTS e idade. Conferir antes evita pasta reprovada e, do outro lado, evita descartar quem pode comprar. O FGTS falta em 73,1% dos dossiês que chegam do robô (notas de qualificação, jul a set/2026): é pergunta sua na primeira ligação.","conceito":"Elegibilidade é o ingresso do show: não importa quanto o cliente quer entrar, ele precisa do ingresso certo na mão. O programa é para quem vai morar, não tem imóvel residencial na região e não tem outro financiamento ativo no sistema. O FGTS tem as suas próprias regras, e a idade define até quando o contrato pode ir.","metodo":["Imóvel no nome e financiamento ativo: pergunte na ligação (Q4 do M16). Quem já tem imóvel ou financiamento ativo não usa MCMV nem FGTS; os caminhos são SBPE, vender antes ou outro produto. Na dúvida, o gerente.","FGTS na compra: 3 anos de trabalho sob o regime do FGTS, somando todos os vínculos (não precisam ser seguidos); sem financiamento ativo no SFH em nenhum lugar do país; sem imóvel residencial no município onde mora ou trabalha, nos vizinhos ou na mesma região metropolitana; imóvel residencial urbano para moradia própria, dentro do teto do SFH [CONFIRMAR o alcance exato de cada condição com o correspondente].","Faltam meses para os 3 anos? A data é um marco comercial: agende. Com 2 anos e 10 meses, faltam 2 meses.","Saque-aniversário: aderir não impede usar o FGTS na compra (conferido em 17/07/2026). O que trava é o saldo dado em garantia numa antecipação feita em banco. Pergunte \"Você fez antecipação do saque-aniversário em algum banco?\" e confira o saldo no extrato do FGTS [CONFIRMAR o valor livre com o correspondente].","Idade: a idade do comprador mais o prazo do financiamento vai até 80 anos e 6 meses (conferido em 09/06/2026). Cliente de 55 anos: prazo máximo de 25 anos e 6 meses. O prazo vai de 120 a 420 meses, então quem tem 45 anos fica limitado aos 35 anos do programa.","Finalidade: MCMV é para morar. Lead que declara investimento puro num produto MCMV é requalificado e levado ao produto certo (R2V, nR, SBPE), sem tese de valorização.","Aluguel pago hoje não impede o financiamento; o que pesa são as dívidas parceladas [CONFIRMAR os critérios com o correspondente]."],"na_vida_real":{"caso":"Aprendizado do robô de qualificação (13/07/2026): investidor em produto MCMV.","o_que_foi_dito":"Leads que declaravam querer o apartamento para investir eram tratados como compradores MCMV comuns e seguiam até o corretor.","resultado":"Handoff improdutivo: o programa é para moradia própria. A regra passou a ser requalificar a finalidade e mudar de produto (R2V, nR, SBPE), sem prometer valorização.","fonte":"Seções 9.9 (aprendizado de 13/07/2026) e 9.16 do super prompt"},"scripts":[{"canal":"Ligação","situacao":"Cliente diz que fez o saque-aniversário","texto":"Isso não te impede de usar o FGTS na compra, fica tranquilo. Só me confirma uma coisa: você chegou a fazer antecipação do saque-aniversário em algum banco? Se fez, uma parte pode estar presa até quitar, e a gente confere no seu extrato do FGTS.","por_que_funciona":"Corrige o mito com a regra conferida, faz a pergunta certa e já aponta o documento que confirma."},{"canal":"WhatsApp","situacao":"Cliente com FGTS de 2 anos e 10 meses acha que não pode usar","texto":"Boa notícia, [nome]: em 2 meses você completa 3 anos de FGTS, e aí ele pode entrar na compra. Dá pra deixar a análise encaminhada até lá, e ela é gratuita e não te compromete. Quer que eu te mande a lista de documentos?","por_que_funciona":"Transforma um \"ainda não\" num marco com data e próximo passo, com a âncora de que a análise é gratuita e sem prometer aprovação."},{"canal":"Ligação","situacao":"Aposentado de 58 anos pergunta se ainda financia","texto":"Dá, sim. A regra é a sua idade mais o prazo do financiamento até 80 anos e 6 meses. Com 58 anos, o prazo pode ir até 22 anos e 6 meses. Prazo mais curto deixa a parcela maior, então vamos simular juntos pra ver o que cabe no seu mês. Pode ser hoje às 19h ou amanhã às 10h?","por_que_funciona":"Resposta direta com a regra vigente, a conta feita, o efeito na parcela explicado e duas opções de horário."}],"erros_que_matam":[{"erro":"Dizer que o saque-aniversário impede o uso do FGTS","custo":"Cliente elegível desanimado ou descartado sem motivo","correcao":"Perguntar se houve antecipação em banco e conferir o extrato do FGTS"},{"erro":"Tratar investidor como cliente MCMV","custo":"Handoff improdutivo e promessa de valorização que ninguém pode fazer","correcao":"Requalificar a finalidade e mudar de produto"},{"erro":"Usar a regra antiga de idade (80 anos, ou 80 anos e 5 meses)","custo":"Prazo calculado errado e parcela simulada errada","correcao":"Idade mais prazo até 80 anos e 6 meses"}],"no_crm":{"tela":"Dossiê do cliente › aba Dados","acao":"Registrar o uso do FGTS e anotar o tempo de registro, a data em que completa 3 anos, antecipação do saque-aniversário e imóvel no nome","campo":"Usa FGTS e Observações","regra":"Se faltam meses para os 3 anos, crie o próximo passo com a data do marco [GAP DE CRM: não há campo próprio para o tempo de registro no FGTS]"},"frase_ancora":"Saque-aniversário não trava. Antecipação trava. Faça a pergunta certa.","checagem_rapida":[{"pergunta":"Cliente de 62 anos: qual o prazo máximo do financiamento pela regra da idade?","resposta":"18 anos e 6 meses (80 anos e 6 meses menos 62 anos)."},{"pergunta":"O que trava o FGTS de quem aderiu ao saque-aniversário?","resposta":"Só o saldo dado em garantia numa antecipação feita em banco."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M05-A5', 5, 'As três travas e o "não dá" dito cedo', 'texto',
  'Renda na faixa, FGTS em dia, nome limpo. O cliente saiu da visita apaixonado. Aí veio o laudo abaixo da tabela, e a entrada de 20% virou 41,7%. A parcela cabia. O caixa, não. Eram três travas independentes, e só uma tinha sido olhada.

### Por que importa

Passar numa trava não garante as outras. O caso do laudo de ago/2026 mostra a trava de crédito derrubando uma venda que a renda aprovava. Todo "não dá" descoberto tarde custa visita, pasta e a confiança do cliente. Dito cedo, com o caminho, ele vira outra venda.

### O conceito

O cliente passa por três catracas, uma depois da outra, e cada uma tem o seu dono. A municipal (HIS e HMP) diz quem pode comprar aquela unidade. A federal (MCMV) diz em que faixa e condição o crédito sai. A de crédito (análise da Caixa) diz quanto ele pode financiar, com a renda comprovada, os compromissos, o nome e o laudo. Uma catraca aberta não abre as outras.

### O método SMQ, passo a passo

1. Trava municipal: confira o enquadramento da unidade (HIS 1, HIS 2, HMP ou venda livre) na tabela e no memorial. O detalhe está no M06.
2. Trava federal: renda na faixa, preço dentro do teto da faixa e elegibilidade (aulas A2 a A4).
3. Trava de crédito: renda comprovada, compromissos, nome e laudo. O banco financia até 80% do menor valor entre o preço e a avaliação; em F3 e F4, rode o cenário de laudo 10% e 20% abaixo (M08).
4. As duas leis precisam fechar: renda de R$ 12 mil cabe no HMP, mas no MCMV é F4, com teto de R$ 600 mil; renda de R$ 14 mil cabe no HMP e está fora do MCMV (SBPE).
5. Perfil que não fecha: diga na hora, com o caminho possível. Renda acima de R$ 13.000: Pró-Cotista ou SBPE. Imóvel no nome: SBPE ou vender antes. Restrição sem solução no curto prazo: pré-análise e orientação para regularizar. Unidade que não cabe: outro produto.
6. Registre o desfecho com o próximo passo. Perdido, só com o motivo verdadeiro e só depois de oferecer a rota: "Renda acima do teto MCMV", "Crédito: renda (insuficiente/informal)", "Crédito: score/negativado" ou "Já tem imóvel / usou FGTS".

### Na vida real

**O caso:** O laudo que matou a entrada (ago/2026).

**O que foi dito:** Tabela de R$ 480 mil e laudo de cerca de R$ 350 mil. Com 80% sobre o laudo, a entrada exigida chegou a R$ 200 mil, 41,7% do preço.

**O que aconteceu:** A parcela cabia na renda; o caixa para a entrada, não. A lição: produto que só passa com laudo cheio não é recomendação, é aposta. O cenário de laudo entra antes de recomendar.

### Scripts prontos

#### Ligação · O produto que o cliente quer não fecha na conta

> Vou ser direto com você, porque prefiro te poupar tempo: com a renda que vocês têm hoje, esse apartamento não fecha na conta. Mas tem caminho. Separei duas opções que cabem, na mesma região que você gostou. Te mostro sábado às 10h ou às 14h?

**Por que funciona:** "Dizer ''não dá'' cedo salva o mês": verdade dita na hora, seguida do caminho e de duas opções de horário.

#### WhatsApp · Cliente com renda acima de R$ 13.000 recebe a notícia

> [nome], com a renda de vocês o Minha Casa Minha Vida não é o caminho, e isso é boa notícia: vocês podem comprar por outra linha de financiamento, com as regras dela. Posso te ligar hoje às 19h pra te mostrar as opções?

**Por que funciona:** Roteia sem rejeitar, sem jargão e com um próximo passo por ligação.

#### Ligação · Cliente com restrição pergunta se precisa quitar a dívida antes

> Não quita nada ainda. O primeiro passo é uma pré-análise com o correspondente, gratuita e sem compromisso, pra entender o que essa pendência pesa de verdade. E ninguém da SMQ vai te pedir Pix nem senha. Posso te mandar a lista do que precisa?

**Por que funciona:** Restrição não descarta: vai para a pré-análise antes de o cliente quitar qualquer dívida. Acolhe, repete as âncoras antigolpe e fecha com um sim.

### Erros que matam a venda

- **Olhar só a renda e ignorar o laudo**  
  Quanto custa: Entrada de 20% vira 41,7% no pior caso real da casa (ago/2026)  
  Correção: Cenário de laudo 10% e 20% abaixo em F3 e F4 antes de recomendar
- **Seguir qualificando quando o perfil já inviabiliza o MCMV**  
  Quanto custa: O problema só aparece na análise, o ponto mais caro  
  Correção: Sinalizar na hora, com o caminho possível
- **Perder o lead como "Renda acima do teto MCMV" sem oferecer a rota**  
  Quanto custa: Cliente com capacidade de compra jogado fora e relatório de perdas enganoso  
  Correção: Rotear para Pró-Cotista ou SBPE; perdido só com o motivo verdadeiro

### No CRM

- **Tela:** Fila Única e Dossiê do cliente
- **Ação:** Registrar o desfecho com o caminho oferecido, ou perdido com o motivo verdadeiro
- **Campo:** Desfecho, próximo passo e data; motivo de perda
- **Regra:** Nada sai da fila sem desfecho; perda por crédito ou por teto só depois de a rota ter sido oferecida

### Frase-âncora

> **Dizer "não dá" cedo salva o mês.**

### Checagem rápida

1. Quais são as três travas independentes?  
   Resposta: Municipal (HIS e HMP: quem pode comprar a unidade), federal (MCMV: faixa e condição do crédito) e de crédito (análise: renda comprovada, compromissos, nome e laudo).
2. Renda de R$ 14 mil e unidade HMP: fecha no MCMV?  
   Resposta: Não. Cabe no HMP, mas está fora do MCMV: o caminho é o SBPE.',
  11, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Renda na faixa, FGTS em dia, nome limpo. O cliente saiu da visita apaixonado. Aí veio o laudo abaixo da tabela, e a entrada de 20% virou 41,7%. A parcela cabia. O caixa, não. Eram três travas independentes, e só uma tinha sido olhada.","por_que_importa":"Passar numa trava não garante as outras. O caso do laudo de ago/2026 mostra a trava de crédito derrubando uma venda que a renda aprovava. Todo \"não dá\" descoberto tarde custa visita, pasta e a confiança do cliente. Dito cedo, com o caminho, ele vira outra venda.","conceito":"O cliente passa por três catracas, uma depois da outra, e cada uma tem o seu dono. A municipal (HIS e HMP) diz quem pode comprar aquela unidade. A federal (MCMV) diz em que faixa e condição o crédito sai. A de crédito (análise da Caixa) diz quanto ele pode financiar, com a renda comprovada, os compromissos, o nome e o laudo. Uma catraca aberta não abre as outras.","metodo":["Trava municipal: confira o enquadramento da unidade (HIS 1, HIS 2, HMP ou venda livre) na tabela e no memorial. O detalhe está no M06.","Trava federal: renda na faixa, preço dentro do teto da faixa e elegibilidade (aulas A2 a A4).","Trava de crédito: renda comprovada, compromissos, nome e laudo. O banco financia até 80% do menor valor entre o preço e a avaliação; em F3 e F4, rode o cenário de laudo 10% e 20% abaixo (M08).","As duas leis precisam fechar: renda de R$ 12 mil cabe no HMP, mas no MCMV é F4, com teto de R$ 600 mil; renda de R$ 14 mil cabe no HMP e está fora do MCMV (SBPE).","Perfil que não fecha: diga na hora, com o caminho possível. Renda acima de R$ 13.000: Pró-Cotista ou SBPE. Imóvel no nome: SBPE ou vender antes. Restrição sem solução no curto prazo: pré-análise e orientação para regularizar. Unidade que não cabe: outro produto.","Registre o desfecho com o próximo passo. Perdido, só com o motivo verdadeiro e só depois de oferecer a rota: \"Renda acima do teto MCMV\", \"Crédito: renda (insuficiente/informal)\", \"Crédito: score/negativado\" ou \"Já tem imóvel / usou FGTS\"."],"na_vida_real":{"caso":"O laudo que matou a entrada (ago/2026).","o_que_foi_dito":"Tabela de R$ 480 mil e laudo de cerca de R$ 350 mil. Com 80% sobre o laudo, a entrada exigida chegou a R$ 200 mil, 41,7% do preço.","resultado":"A parcela cabia na renda; o caixa para a entrada, não. A lição: produto que só passa com laudo cheio não é recomendação, é aposta. O cenário de laudo entra antes de recomendar.","fonte":"Casoteca (seção 9.12) e regra do laudo (seção 9.9) do super prompt"},"scripts":[{"canal":"Ligação","situacao":"O produto que o cliente quer não fecha na conta","texto":"Vou ser direto com você, porque prefiro te poupar tempo: com a renda que vocês têm hoje, esse apartamento não fecha na conta. Mas tem caminho. Separei duas opções que cabem, na mesma região que você gostou. Te mostro sábado às 10h ou às 14h?","por_que_funciona":"\"Dizer ''não dá'' cedo salva o mês\": verdade dita na hora, seguida do caminho e de duas opções de horário."},{"canal":"WhatsApp","situacao":"Cliente com renda acima de R$ 13.000 recebe a notícia","texto":"[nome], com a renda de vocês o Minha Casa Minha Vida não é o caminho, e isso é boa notícia: vocês podem comprar por outra linha de financiamento, com as regras dela. Posso te ligar hoje às 19h pra te mostrar as opções?","por_que_funciona":"Roteia sem rejeitar, sem jargão e com um próximo passo por ligação."},{"canal":"Ligação","situacao":"Cliente com restrição pergunta se precisa quitar a dívida antes","texto":"Não quita nada ainda. O primeiro passo é uma pré-análise com o correspondente, gratuita e sem compromisso, pra entender o que essa pendência pesa de verdade. E ninguém da SMQ vai te pedir Pix nem senha. Posso te mandar a lista do que precisa?","por_que_funciona":"Restrição não descarta: vai para a pré-análise antes de o cliente quitar qualquer dívida. Acolhe, repete as âncoras antigolpe e fecha com um sim."}],"erros_que_matam":[{"erro":"Olhar só a renda e ignorar o laudo","custo":"Entrada de 20% vira 41,7% no pior caso real da casa (ago/2026)","correcao":"Cenário de laudo 10% e 20% abaixo em F3 e F4 antes de recomendar"},{"erro":"Seguir qualificando quando o perfil já inviabiliza o MCMV","custo":"O problema só aparece na análise, o ponto mais caro","correcao":"Sinalizar na hora, com o caminho possível"},{"erro":"Perder o lead como \"Renda acima do teto MCMV\" sem oferecer a rota","custo":"Cliente com capacidade de compra jogado fora e relatório de perdas enganoso","correcao":"Rotear para Pró-Cotista ou SBPE; perdido só com o motivo verdadeiro"}],"no_crm":{"tela":"Fila Única e Dossiê do cliente","acao":"Registrar o desfecho com o caminho oferecido, ou perdido com o motivo verdadeiro","campo":"Desfecho, próximo passo e data; motivo de perda","regra":"Nada sai da fila sem desfecho; perda por crédito ou por teto só depois de a rota ter sido oferecida"},"frase_ancora":"Dizer \"não dá\" cedo salva o mês.","checagem_rapida":[{"pergunta":"Quais são as três travas independentes?","resposta":"Municipal (HIS e HMP: quem pode comprar a unidade), federal (MCMV: faixa e condição do crédito) e de crédito (análise: renda comprovada, compromissos, nome e laudo)."},{"pergunta":"Renda de R$ 14 mil e unidade HMP: fecha no MCMV?","resposta":"Não. Cabe no HMP, mas está fora do MCMV: o caminho é o SBPE."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q01', 1, 'situacional',
  'O cliente escreve: "Ganho uns R$ 3.000, dá pra comprar pelo Minha Casa Minha Vida?" Qual é a sua próxima mensagem?',
  '["\"Dá sim! Com R$ 3.000 você está na Faixa 1, que tem o maior subsídio.\"","\"Show! Esse valor é o que cai na conta ou o do holerite, antes dos descontos?\"","\"Me manda o seu CPF que eu já consulto pra você.\"","\"Com essa renda fica difícil, mas posso te mandar umas opções.\""]'::jsonb,
  1,
  'A B confirma se a renda é bruta ou líquida antes de enquadrar, com uma pergunta só e em linguagem de cliente. A A dá a boa notícia cedo demais: renda perto do piso sem checar bruto, líquido e composição vira desqualificação tardia. A C pede CPF sem aceite e sem explicar para quê. A D desanima o cliente sem fazer a conta.',
  'M05-A3; seção 9.9 (aprendizado de 27/07/2026)', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q02', 2, 'aplicacao',
  'Renda familiar bruta de R$ 5.000,01, comprovada. Em que faixa o cliente está e o que isso muda?',
  '["Faixa 2, com subsídio possível","Faixa 2, sem subsídio, porque está no topo","Faixa 4, com teto de R$ 600 mil","Faixa 3: teto de imóvel de R$ 400 mil e sem subsídio"]'::jsonb,
  3,
  'A D está certa: a F3 vai de R$ 5.000,01 a R$ 9.600, com teto de R$ 400 mil e sem subsídio (tabela vigente desde 22/04/2026; confirmar na tabela oficial). A A e a B erram a faixa: a F2 termina em R$ 5.000, e o centavo a mais muda tudo. A C confunde com a F4, que começa em R$ 9.600,01.',
  'M05-A2; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q03', 3, 'situacional',
  'Casal com renda de R$ 12.000 diz: "A gente quer somar a renda da minha mãe, R$ 2.500, pra subir o valor do apartamento." O que você faz?',
  '["Mostra a conta antes: a folga até R$ 13.000 é de R$ 1.000; somando a mãe, vão a R$ 14.500 e saem do MCMV. Propõe simular os dois cenários","Aceita na hora: mais renda sempre significa mais crédito","Diz que mãe não pode entrar no contrato","Soma as rendas e manda a simulação da F4 com R$ 14.500"]'::jsonb,
  0,
  'A A calcula a folga (R$ 13.000 menos R$ 12.000) antes de sugerir e mostra a consequência: com R$ 14.500, o casal sai do MCMV e cai no SBPE, com juros de mercado. A B é o erro da auditoria: compor na F4 sem calcular a folga tira o cliente do programa. A C inventa uma regra: pais podem compor, e o correspondente confirma o limite de participantes. A D simula numa faixa que não existe para essa renda.',
  'M05-A3; seções 9.9 e 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q04', 4, 'conceito',
  'Qual é a ordem do enquadramento antes de ofertar um produto?',
  '["Produto, parcela, renda e faixa","Faixa, produto, FGTS e renda","Renda, faixa, subsídio, FGTS, entrada e parcela; depois, o produto que cabe","Parcela, entrada, produto e renda"]'::jsonb,
  2,
  'A C é a sequência da espinha (seção 9.3): sem a faixa definida, a simulação sai errada e a pasta volta. A A e a D começam pelo produto ou pela parcela e fazem o cliente se apaixonar pelo que pode não caber. A B põe a faixa antes da renda, mas é a renda que define a faixa.',
  'M05-A1; seção 9.3', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q05', 5, 'aplicacao',
  'Cliente de 62 anos quer financiar. Pela regra de idade mais prazo, qual o prazo máximo?',
  '["35 anos, o prazo máximo do programa","20 anos","18 anos e 6 meses","18 anos, porque a regra vai até 80 anos"]'::jsonb,
  2,
  'A C: a idade do comprador mais o prazo vai até 80 anos e 6 meses; 80 anos e 6 meses menos 62 anos dá 18 anos e 6 meses (222 meses). A A ignora a idade. A B é um número sem regra. A D usa o limite antigo de 80 anos, superado pela regra conferida em 09/06/2026.',
  'M05-A4; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q06', 6, 'situacional',
  'O cliente diz: "Fiz o saque-aniversário, então não posso usar o FGTS, né?" Qual é a resposta certa?',
  '["\"Pode, sim: aderir ao saque-aniversário não impede. Você chegou a fazer antecipação do saque-aniversário em algum banco?\"","\"Não pode. Quem aderiu ao saque-aniversário perde o direito de usar o FGTS na compra.\"","\"Pode usar todo o saldo, sem nenhuma exceção.\"","\"Isso só a Caixa sabe, espera a análise.\""]'::jsonb,
  0,
  'A A corrige o mito e faz a pergunta certa: o que trava é o saldo dado em garantia numa antecipação feita em banco (conferido em 17/07/2026), e o saldo livre se confere no extrato. A B repete o erro do material antigo. A C promete demais: o valor antecipado fica bloqueado. A D terceiriza uma pergunta que o corretor sabe responder.',
  'M05-A4; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q07', 7, 'aplicacao',
  'Qual é a parcela de referência, com seguros e taxa de administração, para uma renda familiar bruta de R$ 7.500?',
  '["R$ 1.500","R$ 3.000","R$ 2.500, porque na F3 a parcela pode passar de 30%","Até cerca de R$ 2.250 (cerca de 30% da renda), como estimativa"]'::jsonb,
  3,
  'A D aplica a referência: a parcela cabe em até cerca de 30% da renda bruta familiar, e 30% de R$ 7.500 são R$ 2.250; é estimativa, e a análise confirma. A A é a conta de quem ganha R$ 5.000. A B é 40% da renda. A C inventa uma exceção por faixa que não existe.',
  'M05-A1; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q08', 8, 'situacional',
  'Um lead escreve: "Quero um estúdio do Minha Casa Minha Vida pra alugar e ter renda." O que você faz?',
  '["Segue com o MCMV: investimento também é compra","Requalifica a finalidade: o MCMV é para morar; apresenta o produto certo para investidor (R2V, nR ou SBPE), sem prometer valorização","Promete que o estúdio vai valorizar e render bem","Encerra a conversa: investidor não é cliente da SMQ"]'::jsonb,
  1,
  'A B segue o aprendizado de 13/07/2026: o MCMV é para moradia própria, e o investidor vai para outro produto, sem tese de valorização. A A leva adiante um handoff improdutivo. A C promete valorização, o que é proibido. A D descarta um cliente que a SMQ atende por outro produto.',
  'M05-A4; seções 9.9 e 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q09', 9, 'conceito',
  'Quais são as três travas independentes do enquadramento?',
  '["Municipal (HIS e HMP), federal (faixa do MCMV) e de crédito (análise da Caixa)","Renda, idade e estado civil","Entrada, parcela e ITBI","Construtora, correspondente e corretor"]'::jsonb,
  0,
  'A A: a regra municipal diz quem pode comprar a unidade, a federal diz em que condição o crédito sai e a de crédito diz quanto o cliente financia, com renda comprovada, compromissos, nome e laudo. Passar numa não abre as outras. A B e a C misturam itens de uma trava só; a D lista pessoas do processo, não travas.',
  'M05-A5; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q10', 10, 'caca_ao_erro',
  'Encontre o erro nesta mensagem de um corretor: "Oi, [nome]! Com a sua renda de R$ 7.000 você está na Faixa 3 e vai ganhar um subsídio de até R$ 55 mil do governo. Bora marcar a visita?"',
  '["Chamar o cliente pelo nome","Dizer que R$ 7.000 é Faixa 3","Prometer subsídio: a F3 não tem subsídio, e nunca se diz que o governo vai dar R$ 55 mil","Convidar para a visita"]'::jsonb,
  2,
  'A C é o erro: F3 e F4 não têm subsídio, e mesmo na F1 e na F2 o valor varia e só se confirma na análise. A A é boa prática. A B está certa: R$ 7.000 fica entre R$ 5.000,01 e R$ 9.600. A D é o próximo passo certo, embora melhore com duas opções de horário.',
  'M05-A2; seção 9.9 (linguagem proibida)', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q11', 11, 'situacional',
  'Cliente com renda familiar de R$ 13.800 pergunta: "Então eu não posso comprar com vocês?" Qual é a resposta?',
  '["\"Infelizmente não, a SMQ só trabalha com o Minha Casa Minha Vida.\"","\"Pode, sim. Com essa renda o caminho é outra linha de financiamento, como o Pró-Cotista ou o SBPE. Posso te ligar às 19h pra te mostrar as opções?\"","\"Dá pra declarar uma renda menor pra entrar no programa.\"","\"Vou registrar como perdido por renda acima do teto.\""]'::jsonb,
  1,
  'A B roteia sem rejeitar (nunca rejeitar lead por renda alta) e fecha com um próximo passo. A A é falsa e perde o cliente. A C sugere declarar renda diferente da real: risco grave para o cliente, o corretor e a SMQ. A D registra a perda sem oferecer a rota.',
  'M05-A2; seções 9.9 e 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q12', 12, 'aplicacao',
  'Um MEI declara R$ 7.000 por mês, mas o faturamento médio comprovado é de R$ 5.500. Qual renda usar no enquadramento e qual a parcela de referência?',
  '["R$ 7.000; parcela de até cerca de R$ 2.100","A soma, R$ 12.500; Faixa 4","Nenhuma: MEI não financia","R$ 5.500, a média do faturamento; parcela de até cerca de R$ 1.650"]'::jsonb,
  3,
  'A D: no MEI vale a média do faturamento, não o valor declarado, e 30% de R$ 5.500 são R$ 1.650 (estimativa). A A usa o valor declarado e superestima a parcela. A B soma dois números da mesma renda. A C é falsa: MEI comprova pela média do faturamento.',
  'M05-A3; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q13', 13, 'situacional',
  'Solteira CLT, renda de R$ 7.500, FGTS de 2 anos e 10 meses, diz: "Então o FGTS não serve pra mim." O que você responde?',
  '["\"Isso, esquece o FGTS e junta dinheiro pra entrada.\"","\"Serve sim, pode usar agora mesmo.\"","\"Depende do banco, cada um tem uma regra.\"","\"Em 2 meses você completa 3 anos de FGTS, e aí ele pode entrar na compra. Dá pra deixar a análise encaminhada até lá.\""]'::jsonb,
  3,
  'A D transforma o "ainda não" em marco com data: a regra pede 3 anos sob o FGTS, somando vínculos, e faltam 2 meses. A A descarta um recurso que está a 2 meses. A B promete o que a regra ainda não permite. A C inventa variação por banco.',
  'M05-A4; seção 9.9; persona P3', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q14', 14, 'conceito',
  'O que NÃO conta como renda na análise?',
  '["Holerite de CLT","Bolsa Família, BPC, seguro-desemprego, auxílio-doença e FGTS","Faturamento médio comprovado de MEI","Renda de aplicativo comprovada pelo relatório da plataforma"]'::jsonb,
  1,
  'A B lista o que não conta como renda (seção 9.9); o que entra em mãos sem comprovação também não conta. A A e a C contam, cada uma com a sua comprovação. A D passou a contar como renda formal, com os requisitos da plataforma (lista de documentos a confirmar com o correspondente).',
  'M05-A3; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q15', 15, 'aplicacao',
  'Preço de R$ 300 mil (valor de treino) e laudo de R$ 270 mil, 10% abaixo. Com o banco financiando até 80% do menor valor, qual a entrada exigida?',
  '["R$ 84 mil (28% do preço)","R$ 60 mil (20% do preço)","R$ 30 mil (a diferença entre preço e laudo)","R$ 54 mil"]'::jsonb,
  0,
  'A A: 80% de R$ 270 mil (o menor valor) são R$ 216 mil financiados; R$ 300 mil menos R$ 216 mil dá R$ 84 mil, 28% do preço, como na tabela do laudo da seção 9.9. A B calcula sobre o preço, não sobre o laudo. A C esquece os 20% de entrada. A D é 20% do laudo, que não é a conta do banco.',
  'M05-A5; seção 9.9 (a armadilha do laudo)', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q16', 16, 'situacional',
  'Na ligação, o cliente responde: "Nome tá limpo não." Qual é a sua próxima fala?',
  '["\"Ótimo, então vamos direto para a análise.\"","\"Com restrição não dá, infelizmente.\"","\"Obrigado por me contar. Isso não te descarta: a gente faz uma pré-análise com o correspondente, gratuita e sem compromisso, antes de você quitar qualquer coisa. Posso te mandar a lista do que precisa?\"","\"Quita a dívida primeiro e depois a gente conversa.\""]'::jsonb,
  2,
  'A C lê a negação no fim da frase ("nome tá limpo não" quer dizer que não está limpo), acolhe e leva à pré-análise, a regra da casa para restrição. A A lê a frase ao contrário. A B descarta o lead. A D manda quitar antes da pré-análise, o contrário da regra.',
  'M05-A5; seção 9.9; persona P8', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q17', 17, 'aplicacao',
  'Casal: ele ganha R$ 3.000 e ela R$ 2.500, os dois CLT, e vão comprar juntos. O que a composição muda no enquadramento?',
  '["Nada: continuam na Faixa 1","Somados, R$ 5.500 levam à Faixa 3, sem subsídio; a simulação com o correspondente mostra o enquadramento e a condição certa","Vão para a Faixa 4","Composição de renda é proibida no MCMV"]'::jsonb,
  1,
  'A B: R$ 3.000 mais R$ 2.500 dá R$ 5.500, acima do topo da F2 (R$ 5.000), e a F3 não tem subsídio; a simulação mostra a condição real. A A ignora a soma. A C erra a faixa: a F4 começa em R$ 9.600,01. A D é falsa: pode compor com quem entra no contrato.',
  'M05-A3; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q18', 18, 'situacional',
  'O casal se apaixonou por uma unidade de R$ 480 mil (valor de treino). A renda comprovada é de R$ 9.000. O que você faz?',
  '["Mostra com calma que o preço passa do teto de R$ 400 mil da Faixa 3 e apresenta opções que cabem, com duas opções de horário para a visita","Agenda a visita na unidade de R$ 480 mil e vê o que a análise diz","Diz que dá para financiar pela Faixa 3 com uma entrada maior","Some da conversa para não dar a má notícia"]'::jsonb,
  0,
  'A A diz "não dá" cedo, com o caminho: com R$ 9.000 o casal está na F3, cujo teto de imóvel é de R$ 400 mil. A B empurra o problema para o ponto mais caro, a análise. A C inventa uma saída: o teto é do valor do imóvel, não se resolve com entrada. A D deixa o cliente sem resposta, e cliente sem resposta esfria.',
  'M05-A5; seções 9.3 e 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q19', 19, 'conceito',
  'Sobre a proposta de mudança do programa (ampliar a F4 e reduzir juros) divulgada pelo governo em 2026, qual é a regra da casa?',
  '["Já ensinar a nova F4 até R$ 21 mil, porque vai ser aprovada","Usar a proposta como argumento de urgência","Ignorar qualquer notícia sobre o programa","Com cliente, falar só do que vale hoje; se for aprovada, a casa atualiza as aulas no mesmo dia"]'::jsonb,
  3,
  'A D segue o radar regulatório: até 29/09/2026 não havia aprovação, e proposta não é regra. A A ensina como vigente algo que não é. A B cria urgência falsa. A C erra para o outro lado: a casa acompanha e atualiza quando a mudança valer.',
  'M05-A2; seção 9.9 (radar regulatório)', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M05-Q20', 20, 'caca_ao_erro',
  'Encontre o erro no registro deste corretor: cliente com renda de R$ 14.200, marcado como perdido por "Renda acima do teto MCMV" dez minutos depois da primeira ligação, sem nenhuma anotação.',
  '["Registrar a renda no Dossiê","Registrar o desfecho no mesmo dia","Perder o cliente sem oferecer a rota: com R$ 14.200 o caminho é Pró-Cotista ou SBPE, e a perda só entra, com o motivo verdadeiro, se o cliente não seguir","Usar um dos motivos oficiais de perda"]'::jsonb,
  2,
  'A C é o erro: nunca rejeitar lead por renda alta; primeiro se oferece a rota, e só se o cliente não seguir o motivo de perda é registrado. A A, a B e a D são boas práticas de registro: renda no Dossiê, desfecho no dia e motivo oficial.',
  'M05-A5; seções 9.9 e 9.16', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (14)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F01', 1, 'Faixa 1 (vigente desde 22/04/2026)', 'Renda familiar bruta de até R$ 3.200; teto de R$ 210 mil a R$ 275 mil, conforme o município; tem o maior subsídio. Confirmar na tabela oficial.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F02', 2, 'Faixa 2', 'De R$ 3.200,01 a R$ 5.000; teto igual ao da F1; subsídio decrescente com a renda.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F03', 3, 'Faixa 3', 'De R$ 5.000,01 a R$ 9.600; teto de R$ 400 mil; sem subsídio.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F04', 4, 'Faixa 4', 'De R$ 9.600,01 a R$ 13.000; teto de R$ 600 mil; sem subsídio; juros em torno de 10% a 10,5% ao ano.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F05', 5, 'Acima de R$ 13.000', 'Pró-Cotista (com FGTS ativo) ou SBPE. Nunca rejeitar: rotear.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F06', 6, 'Parcela de referência', 'Até cerca de 30% da renda bruta familiar, com seguros e taxa. Renda de R$ 5.000, parcela de até R$ 1.500. É estimativa.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F07', 7, 'Folga na F4', 'R$ 13.000 menos a renda atual. Calcule antes de sugerir composição.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F08', 8, 'Idade', 'Idade mais prazo até 80 anos e 6 meses. Com 55 anos, prazo máximo de 25 anos e 6 meses.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F09', 9, 'FGTS na compra', '3 anos sob o FGTS somando vínculos, sem financiamento ativo no SFH e sem imóvel residencial na região. Confirmar com o correspondente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F10', 10, 'Saque-aniversário', 'Aderir não impede. O que trava é o saldo dado em garantia numa antecipação feita em banco.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F11', 11, 'Não conta como renda', 'Bolsa Família, BPC, seguro-desemprego, auxílio-doença, FGTS e o que entra em mãos sem comprovação.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F12', 12, 'MEI', 'Vale a média do faturamento, não o valor declarado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F13', 13, 'As três travas', 'Municipal (HIS e HMP), federal (MCMV) e de crédito (análise). Uma aberta não abre as outras.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M05-F14', 14, 'Frase-âncora do módulo', 'Dizer "não dá" cedo salva o mês.', true
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente e gabarito da prática)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No 1:1, abra o Dossiê de três clientes do corretor e peça que ele enquadre em voz alta, em 2 minutos cada: faixa, renda que conta, FGTS e o que trava. Na reunião de segunda, leve um perfil de fronteira da semana (renda perto de R$ 5.000 ou de R$ 13.000) e faça o time responder em 30 segundos. Aplique o laboratório de 10 perfis no mês de entrada e repita sempre que a tabela do programa mudar.","sinais_de_dificuldade":["Fichas sem Faixa MCMV, ou com a faixa que não bate com a Renda informada.","Perdas por \"Renda acima do teto MCMV\" sem anotação da rota oferecida (Pró-Cotista ou SBPE).","Clientes com visita agendada sem Renda informada, Tipo de renda ou Usa FGTS preenchidos."],"perguntas_de_coaching":["Qual foi o último cliente em que você disse \"não dá\" cedo, e que caminho você ofereceu?","Nesse cliente, qual renda entra de verdade na análise e qual não entra?","Se esse casal somar a renda de mais alguém, em que faixa ele cai e o que muda?"],"ritual_de_celebracao":"Reunião de segunda: reconhecer quem teve todas as fichas da semana com a faixa conferida. No LEGADO, a categoria Disciplina de Processo."},"pratica_gabarito":["Perfil 1: F1; subsídio possível (varia e se confirma na análise); parcela de referência de até cerca de R$ 840; conferir FGTS e nome.","Perfil 2: não enquadrar ainda. Perguntar se o valor é bruto ou líquido e se alguém vai compor; só depois dizer a faixa.","Perfil 3: F2; subsídio possível; parcela de referência de até cerca de R$ 1.350; FGTS de 4 anos pode entrar na compra (conferir as outras condições); a esposa decide junto.","Perfil 4: renda de aplicativo conta (4 meses seguidos na mesma plataforma; vale o mês de menor valor); F1 provável; lista de documentos confirmada com o correspondente.","Perfil 5: somados, R$ 5.500 levam à F3, sem subsídio; a simulação com o correspondente mostra o enquadramento e a condição; parcela de referência de até cerca de R$ 1.650.","Perfil 6: F3, sem subsídio; parcela de referência de até cerca de R$ 2.250; em 2 meses completa 3 anos de FGTS: marco comercial com data; a trava é a entrada (cenário de laudo no M08).","Perfil 7: vale a média do faturamento, R$ 5.500: F3; parcela de referência de até cerca de R$ 1.650, não R$ 2.100.","Perfil 8: F4, teto de R$ 600 mil; folga de R$ 1.000 até R$ 13.000; somar a mãe (R$ 14.500) tira do MCMV e leva ao SBPE; rodar o cenário de laudo antes de recomendar a unidade.","Perfil 9: F3; prazo máximo de 22 anos e 6 meses (idade mais prazo até 80 anos e 6 meses); parcela de referência de até cerca de R$ 1.560; simular com o prazo real.","Perfil 10: fora do MCMV; Pró-Cotista (se tiver FGTS ativo) ou SBPE; nunca rejeitar: rotear e marcar a conversa."]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M05' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
