-- ===========================================================================
-- ACADEMIA SMQ · LOTE 1 (v1.1) · seed do módulo M00
-- ===========================================================================
-- GERADO por scripts/academia/converter-lote.mjs a partir de docs/academia/lote-1/academia-smq-lote-1.json.
-- Não edite à mão: corrija o JSON (ou o conversor) e gere de novo.
--
-- Idempotente: upsert pelo código do módulo, da aula, da questão e do
-- flashcard, só enquanto o módulo está em 'rascunho'. Conteúdo antigo sem
-- código é arquivado (aula 'arquivado', questão ativa = false), nunca apagado.
-- 4 aulas · 20 questões · 13 flashcards
-- ===========================================================================

-- 1. Módulo
INSERT INTO public.academia_modulos
  (codigo, numero, fase, titulo, objetivo_principal, objetivos, carga_horaria_h,
   carga_horaria_texto, exige_pratica, pratica_descricao, pratica_rubrica, nota_minima,
   status, revisao_pendente, extras)
VALUES
  ('M00', 0, 0, 'Bem-vindo à SMQ: como a casa funciona e como a Academia te leva ao Apto', 'Ao final, você explica em 60 segundos o que a SMQ vende de verdade, o que conta como venda e quais são as regras do jogo, e isso aparece no CRM como a trilha "Como usar o CRM" concluída e o perfil completo (foto, telefone e preferências).',
   '["Eu sou capaz de explicar em 60 segundos o conceito SMQ e os 4 pilares, com a fala-âncora oficial.","Eu sou capaz de dizer o que conta como venda na SMQ (contrato assinado, cliente aprovado e ato pago) e o que não conta.","Eu sou capaz de desenhar o caminho do cliente do anúncio à chave, dizendo quem faz o quê em cada passo.","Eu sou capaz de explicar as regras do jogo: política de performance, roleta, carteira e venda registrada pelo diálogo.","Eu sou capaz de dizer o que preciso para conquistar o selo Apto e como cada evidência é medida."]'::jsonb, 0.8, '50 min', true,
   '**Role-play em trio (corretor, cliente e observador)** · 20 min

**Papéis:** Corretor, cliente com o cartão da persona P5 e observador com a rubrica. Três rodadas, trocando os papéis.

**Persona:** P5 (lead saturado e desconfiado)

**Roteiro:** O corretor liga para um lead que preencheu um formulário há três dias. Tem 60 segundos para se apresentar, explicar o que a SMQ faz e responder às duas perguntas do cliente. Termina com uma pergunta que leva ao próximo passo.

**Roteiro do cliente:**

- Começa com: "Já me ligaram umas vinte vezes. Vocês são de qual construtora?"
- Depois de ouvir a resposta: "E como eu sei que isso não é golpe?"
- Se o corretor for honesto e claro, aceita responder a uma pergunta. Se prometer aprovação ou fugir da pergunta, encerra a ligação.

**O que o observador procura:**

- Identificação completa: nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida.
- Resposta honesta sobre ser imobiliária independente, com a vantagem da curadoria.
- As âncoras antigolpe: análise gratuita; ninguém da SMQ pede Pix, taxa ou senha; convite para conhecer o escritório ou o estande.
- A fala-âncora do conceito SMQ, sem promessa de aprovação.
- Final com pergunta e próximo passo, nunca "qualquer coisa me chama".

**Rubrica:** Padrão SMQ, critérios 1 (abertura e conexão), 3 (condução) e 6 (verdade e conformidade). Aprovação: média 3,5 ou mais.', '[{"criterio":"Abertura e conexão: personalização, nome, prova de que leu o cadastro","peso":1},{"criterio":"Condução: toda fala termina em pergunta, próximo passo concreto","peso":1},{"criterio":"Verdade e conformidade: sem promessa, sem urgência falsa, LGPD, antigolpe (tolerância zero: só vale nota 5)","peso":1}]'::jsonb, 80,
   'rascunho', 'LOTE 1 v1.1 importado: revisar no CRM antes de publicar. | [CONFIRMAR] Se o selo Apto vai pesar na roleta numa fase 2. | [DADO A MEDIR NO CRM] Linha de base de onboarding concluído e perfil completo.', '{"formato":"canonico-8.2","lote":1,"versao_conteudo":"1.1","trilha":"T0","ordem":1,"nivel_alvo":"Iniciante","nivel_alvo_sistema":"iniciante","subtitulo":"Na SMQ você não vende apartamento. Você entrega a assessoria que faz o financiamento passar.","duracao_min":50,"por_que_vale_dinheiro":{"texto":"A casa já tem lead, sistema e método. O que decide o seu mês é a execução. Hoje só 5,4% dos clientes em atendimento viram agendamento, contra uma meta de 70%. Levar só essa passagem à meta multiplica a conversão da casa por 13. Quem entende o jogo desde o primeiro dia joga para essa virada.","numero":"5,4% de \"Em atendimento\" para \"Agendado\" (meta de 70%); multiplicador de 13 vezes","fonte":"Treinamento do CRM SMQ","periodo":"set/2026"},"pre_requisitos":[],"indicador_crm":{"nome":"Onboarding concluído e perfil completo","onde_ler":"Meu Perfil (foto, telefone, preferências e elegibilidade nas filas); para o gerente, Distribuição › aba Corretores, que mostra se o corretor está sendo pulado por \"Onboarding não concluído\" ou \"Sem telefone\"","linha_de_base":"[DADO A MEDIR NO CRM]","meta_sugerida":"100% dos novos corretores com trilha concluída e perfil completo em até 48 horas","fonte":"Manual do CRM, set/2026","gap_de_crm":false},"pratica":{"tipo":"Role-play em trio (corretor, cliente e observador)","duracao_min":20,"persona":"P5 (lead saturado e desconfiado)","rubrica":"Padrão SMQ, critérios 1 (abertura e conexão), 3 (condução) e 6 (verdade e conformidade)","nota_minima":3.5,"papeis":"Corretor, cliente com o cartão da persona P5 e observador com a rubrica. Três rodadas, trocando os papéis.","roteiro":"O corretor liga para um lead que preencheu um formulário há três dias. Tem 60 segundos para se apresentar, explicar o que a SMQ faz e responder às duas perguntas do cliente. Termina com uma pergunta que leva ao próximo passo.","roteiro_cliente":["Começa com: \"Já me ligaram umas vinte vezes. Vocês são de qual construtora?\"","Depois de ouvir a resposta: \"E como eu sei que isso não é golpe?\"","Se o corretor for honesto e claro, aceita responder a uma pergunta. Se prometer aprovação ou fugir da pergunta, encerra a ligação."],"observador_procura":["Identificação completa: nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida.","Resposta honesta sobre ser imobiliária independente, com a vantagem da curadoria.","As âncoras antigolpe: análise gratuita; ninguém da SMQ pede Pix, taxa ou senha; convite para conhecer o escritório ou o estande.","A fala-âncora do conceito SMQ, sem promessa de aprovação.","Final com pergunta e próximo passo, nunca \"qualquer coisa me chama\"."]},"desafio_campo":{"tarefa":"Primeiro dia pronto para jogar: concluir a trilha \"Como usar o CRM\" (6 passos), subir a foto de perfil, completar telefone e preferências de notificação e escolher, em Documentação & Projetos, os 2 Projetos em Foco que você vai estudar primeiro.","prazo_horas":24,"evidencia_no_crm":"Perfil completo com foto (aparece em Ranking e Conquistas), onboarding concluído e nenhum motivo de pulo por \"Onboarding não concluído\" ou \"Sem telefone\".","como_o_gestor_confere":"Abre Ranking e Conquistas (a foto aparece) e a aba Corretores da Distribuição (o corretor não aparece com motivo de pulo). Pergunta quais foram os 2 projetos escolhidos e por quê."},"quiz":{"nota_minima":80,"sorteio":10},"roteiro_video":{"duracao_min":4,"quem_grava":"O diretor","cenario":"Sede da SMQ ou estande de um lançamento, com o CRM aberto num notebook","blocos":[{"tempo":"0:00","fala":"Dez da noite, chega a mensagem: \"será que eu consigo?\". Esse cliente não está comprando metro quadrado. Está comprando certeza.","na_tela":"Celular com a mensagem (anônima)"},{"tempo":"0:20","fala":"Hoje, de cada 100 clientes em atendimento, só 5 viram visita marcada. A meta é 70. Se a gente destravar só isso, a casa vende 13 vezes mais. É por isso que você está aqui.","na_tela":"Número 5,4% contra 70%"},{"tempo":"0:50","fala":"A SMQ é uma imobiliária independente. A gente compara várias construtoras, faz a análise de crédito de graça, confere o jurídico e acompanha até a chave. Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar.","na_tela":"Os 4 pilares"},{"tempo":"1:40","fala":"Venda aqui tem três palavras: assinado, aprovado e pago. E só existe quando você registra pelo diálogo.","na_tela":"Botão \"Registrar venda\" no topo do CRM"},{"tempo":"2:20","fala":"O erro que mais vejo: arrastar o card para Venda e achar que contou. Não contou. Fica fora do ranking e da comissão.","na_tela":"Card sendo arrastado, com um X"},{"tempo":"2:50","fala":"O seu desafio de hoje: termine a trilha do CRM, suba a sua foto, cadastre o telefone e escolha os dois projetos que você vai estudar primeiro.","na_tela":"Checklist do desafio"},{"tempo":"3:30","fala":"E lembra: aqui ninguém certifica por presença. Bem-vindo à SMQ.","na_tela":"Frase-âncora"}]},"fontes_internas":["Seções 2, 4, 6.1, 9.1, 9.8, 9.10, 9.11, 9.12, 9.17 e 9.18 do super prompt","Treinamento do CRM SMQ e Manual do CRM (set/2026)","Política de performance (01/08/2026)"],"origem":"SMQ","pendencias":["[CONFIRMAR] Se o selo Apto vai pesar na roleta numa fase 2.","[DADO A MEDIR NO CRM] Linha de base de onboarding concluído e perfil completo."],"data_revisao":"2026-09-29","dono_do_conteudo":"Diretoria comercial SMQ"}'::jsonb)
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
  FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status <> 'arquivado'
   AND (a.codigo IS NULL OR a.codigo NOT IN ('M00-A1', 'M00-A2', 'M00-A3', 'M00-A4'));
UPDATE public.academia_aulas a
   SET ordem = a.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
   AND a.modulo_id = m.id AND a.status = 'arquivado' AND a.ordem <= 4;

UPDATE public.academia_questoes q
   SET ativa = false
  FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND q.ativa
   AND (q.codigo IS NULL OR q.codigo NOT IN ('M00-Q01', 'M00-Q02', 'M00-Q03', 'M00-Q04', 'M00-Q05', 'M00-Q06', 'M00-Q07', 'M00-Q08', 'M00-Q09', 'M00-Q10', 'M00-Q11', 'M00-Q12', 'M00-Q13', 'M00-Q14', 'M00-Q15', 'M00-Q16', 'M00-Q17', 'M00-Q18', 'M00-Q19', 'M00-Q20'));
UPDATE public.academia_questoes q
   SET ordem = q.ordem + 100
  FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
   AND q.modulo_id = m.id AND NOT q.ativa AND q.ordem <= 20;

UPDATE public.academia_flashcards f
   SET ativa = false, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND f.ativa
   AND f.codigo NOT IN ('M00-F01', 'M00-F02', 'M00-F03', 'M00-F04', 'M00-F05', 'M00-F06', 'M00-F07', 'M00-F08', 'M00-F09', 'M00-F10', 'M00-F11', 'M00-F12', 'M00-F13');
UPDATE public.academia_flashcards f
   SET ordem = f.ordem + 100, atualizado_em = now()
  FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
   AND f.modulo_id = m.id AND NOT f.ativa AND f.ordem <= 13;

-- 3. Aulas (4)
INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M00-A1', 1, 'A SMQ em 10 minutos', 'texto',
  'Dez da noite. Chega a mensagem: "Será que eu consigo comprar?". Esse cliente não está comprando metro quadrado. Está comprando a certeza de que o financiamento passa e de que ninguém vai enganar a família dele. É isso que a SMQ vende.

### Por que importa

O cliente do primeiro imóvel tem dois medos: não ser aprovado e cair em golpe. Quem acha que vende apartamento vira catálogo e compete por preço com os vinte corretores que ligaram antes. Quem entende que vende assessoria conduz a conversa, ganha confiança e chega à visita.

### O conceito

A SMQ é uma imobiliária independente, especializada em lançamentos e Minha Casa Minha Vida, que trabalha com várias construtoras ao mesmo tempo. Pense num bom médico de família: ele não vende o remédio de um laboratório só. Ele examina, entende o caso e indica o que serve para aquele paciente. A SMQ faz isso com imóvel e crédito.

### O método SMQ, passo a passo

1. Quem somos: imobiliária independente de São Paulo, especializada em lançamentos e MCMV, com várias construtoras parceiras (entre elas Cury, Vibra, Direcional, Mundo Apto, Longitude, Riva, Trisul, Novvo e EMCCAMP), atuando em todas as zonas da capital. Sedes na Barra Funda, na Liberdade e no Belém.
2. Quem é o nosso cliente: em geral, comprador do primeiro imóvel, com renda familiar entre R$ 4 mil e R$ 9 mil, muita emoção e pouca informação técnica. Também atendemos investidores e clientes de renda maior.
3. Os 4 pilares do conceito SMQ: assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave.
4. A fala-âncora, para usar do jeito que está: "Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar."
5. O que isso muda no seu dia: você é consultor de crédito (explica e simula), curador (compara e indica), guardião (nada de promessa ou golpe) e parceiro (acompanha até a chave).

### Na vida real

**O caso:** Uma cliente com crédito aprovado esperou dois meses por uma unidade que não estava disponível (fev a abr/2025).

**O que foi dito:** No primeiro contato, o corretor contou a verdade e explicou o sistema: "As unidades que voltam passaram por clientes que não conseguiram resolver pendências dentro do prazo. Há um limite mensal para liberação. Estou acompanhando." E manteve contato mesmo sem novidade.

**O que aconteceu:** Quando a unidade voltou, os documentos já estavam atualizados. Aprovação às 10h19 e contrato assinado horas depois, no mesmo dia.

### Scripts prontos

#### WhatsApp · O cliente pergunta "você é da construtora?"

> Não, [nome]! A Seu Metro Quadrado é uma imobiliária independente. A gente trabalha com várias construtoras ao mesmo tempo, então consegue comparar e te mostrar o que mais encaixa no seu perfil.

**Por que funciona:** É honesto e transforma a pergunta em vantagem (curadoria). Numa conversa real de jul/2026, o cliente que fez essa pergunta continuou a qualificação depois dessa resposta.

#### Ligação · O cliente pergunta "por que comprar com vocês e não direto no estande?"

> Boa pergunta. No estande você conhece um produto. Com a gente, você compara vários, faz a análise de crédito de graça antes de se comprometer, a gente confere a parte jurídica e te acompanha até a chave. Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar. Posso te fazer duas perguntas rápidas pra te mostrar o que cabe no seu bolso?

**Por que funciona:** Responde com os 4 pilares, sem falar mal da construtora, e devolve a condução com uma pergunta.

### Erros que matam a venda

- **Vender como catálogo: mandar book e preço antes de entender o cliente**  
  Quanto custa: A conversa vira comparação de preço e o cliente some  
  Correção: Qualificar primeiro; valor antes de preço (M15)
- **Esconder que é corretor ou dizer que é "da construtora"**  
  Quanto custa: Quando o cliente descobre, a confiança acaba e a venda também  
  Correção: Nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida
- **Prometer aprovação para acalmar o medo do cliente**  
  Quanto custa: Responsabilidade legal e cliente perdido quando a análise diz outra coisa  
  Correção: "Pelo seu perfil você tem condições, a confirmação vem na análise da Caixa."

### No CRM

- **Tela:** Documentação & Projetos
- **Ação:** Abrir "Projetos em Foco" e o catálogo
- **Campo:** Ficha técnica, condições e unidades
- **Regra:** Produto, preço e condição vêm só daqui ou do material oficial da construtora, nunca da memória

### Frase-âncora

> **Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar.**

### Checagem rápida

1. Quais são os 4 pilares do conceito SMQ?  
   Resposta: Assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave.
2. Quais são os dois maiores medos do nosso cliente típico?  
   Resposta: Não ser aprovado e cair em golpe.',
  9, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Dez da noite. Chega a mensagem: \"Será que eu consigo comprar?\". Esse cliente não está comprando metro quadrado. Está comprando a certeza de que o financiamento passa e de que ninguém vai enganar a família dele. É isso que a SMQ vende.","por_que_importa":"O cliente do primeiro imóvel tem dois medos: não ser aprovado e cair em golpe. Quem acha que vende apartamento vira catálogo e compete por preço com os vinte corretores que ligaram antes. Quem entende que vende assessoria conduz a conversa, ganha confiança e chega à visita.","conceito":"A SMQ é uma imobiliária independente, especializada em lançamentos e Minha Casa Minha Vida, que trabalha com várias construtoras ao mesmo tempo. Pense num bom médico de família: ele não vende o remédio de um laboratório só. Ele examina, entende o caso e indica o que serve para aquele paciente. A SMQ faz isso com imóvel e crédito.","metodo":["Quem somos: imobiliária independente de São Paulo, especializada em lançamentos e MCMV, com várias construtoras parceiras (entre elas Cury, Vibra, Direcional, Mundo Apto, Longitude, Riva, Trisul, Novvo e EMCCAMP), atuando em todas as zonas da capital. Sedes na Barra Funda, na Liberdade e no Belém.","Quem é o nosso cliente: em geral, comprador do primeiro imóvel, com renda familiar entre R$ 4 mil e R$ 9 mil, muita emoção e pouca informação técnica. Também atendemos investidores e clientes de renda maior.","Os 4 pilares do conceito SMQ: assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave.","A fala-âncora, para usar do jeito que está: \"Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar.\"","O que isso muda no seu dia: você é consultor de crédito (explica e simula), curador (compara e indica), guardião (nada de promessa ou golpe) e parceiro (acompanha até a chave)."],"na_vida_real":{"caso":"Uma cliente com crédito aprovado esperou dois meses por uma unidade que não estava disponível (fev a abr/2025).","o_que_foi_dito":"No primeiro contato, o corretor contou a verdade e explicou o sistema: \"As unidades que voltam passaram por clientes que não conseguiram resolver pendências dentro do prazo. Há um limite mensal para liberação. Estou acompanhando.\" E manteve contato mesmo sem novidade.","resultado":"Quando a unidade voltou, os documentos já estavam atualizados. Aprovação às 10h19 e contrato assinado horas depois, no mesmo dia.","fonte":"Casoteca SMQ, caso C (seção 9.12 do super prompt)"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente pergunta \"você é da construtora?\"","texto":"Não, [nome]! A Seu Metro Quadrado é uma imobiliária independente. A gente trabalha com várias construtoras ao mesmo tempo, então consegue comparar e te mostrar o que mais encaixa no seu perfil.","por_que_funciona":"É honesto e transforma a pergunta em vantagem (curadoria). Numa conversa real de jul/2026, o cliente que fez essa pergunta continuou a qualificação depois dessa resposta."},{"canal":"Ligação","situacao":"O cliente pergunta \"por que comprar com vocês e não direto no estande?\"","texto":"Boa pergunta. No estande você conhece um produto. Com a gente, você compara vários, faz a análise de crédito de graça antes de se comprometer, a gente confere a parte jurídica e te acompanha até a chave. Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar. Posso te fazer duas perguntas rápidas pra te mostrar o que cabe no seu bolso?","por_que_funciona":"Responde com os 4 pilares, sem falar mal da construtora, e devolve a condução com uma pergunta."}],"erros_que_matam":[{"erro":"Vender como catálogo: mandar book e preço antes de entender o cliente","custo":"A conversa vira comparação de preço e o cliente some","correcao":"Qualificar primeiro; valor antes de preço (M15)"},{"erro":"Esconder que é corretor ou dizer que é \"da construtora\"","custo":"Quando o cliente descobre, a confiança acaba e a venda também","correcao":"Nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida"},{"erro":"Prometer aprovação para acalmar o medo do cliente","custo":"Responsabilidade legal e cliente perdido quando a análise diz outra coisa","correcao":"\"Pelo seu perfil você tem condições, a confirmação vem na análise da Caixa.\""}],"no_crm":{"tela":"Documentação & Projetos","acao":"Abrir \"Projetos em Foco\" e o catálogo","campo":"Ficha técnica, condições e unidades","regra":"Produto, preço e condição vêm só daqui ou do material oficial da construtora, nunca da memória"},"frase_ancora":"Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar.","checagem_rapida":[{"pergunta":"Quais são os 4 pilares do conceito SMQ?","resposta":"Assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave."},{"pergunta":"Quais são os dois maiores medos do nosso cliente típico?","resposta":"Não ser aprovado e cair em golpe."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M00-A2', 2, 'Do anúncio à chave: quem faz o quê', 'texto',
  'Antes de você dizer "oi", o seu cliente pode ter trocado 11 mensagens com o robô da casa. Se você perguntar tudo de novo, ele desiste. Saber quem já fez o quê é metade da venda.

### Por que importa

De cada 100 leads que o robô entrega qualificados, só 37 aparecem como trabalhados pelo corretor no CRM. E quem registra o trabalho avança 8 vezes mais: 15,2% contra 1,8%. O cliente cai na passagem de uma mão para a outra.

### O conceito

A operação da SMQ é uma corrida de revezamento. O bastão é o cliente. Cada corredor tem o seu trecho (anúncio, robô, corretor, gerente, correspondente, construtora, Caixa) e a regra é uma só: não deixar o bastão cair na passagem.

### O método SMQ, passo a passo

1. O cliente chega: formulário do Meta, anúncio que abre o WhatsApp, landing page, rota direta (campanha que cai direto na roleta), reativação da base, pré-venda, indicação ou captação própria.
2. O robô Marquinhos abre a conversa, qualifica e leva ao próximo passo. Ele só entrega ao corretor com desfecho (visita marcada ou análise) e com um dossiê. Na rota direta, o lead chega cru, sem conversa.
3. A distribuição escolhe o corretor: a origem do cliente define a roleta, e dentro dela recebe quem está apto e há mais tempo sem receber.
4. Você assume: os primeiros 5 minutos (M26), a continuidade do handoff (M27) e a ligação que termina em visita ou análise (M15).
5. Visita: o robô Vitor manda a confirmação automática; o relacionamento e a condução são seus (M18).
6. Pasta e crédito: você anexa os documentos no CRM, o seu gerente revisa e orienta, e você envia ao correspondente do empreendimento, que leva a análise à Caixa (M21).
7. Construtora: garantia da unidade, ato pago por canal oficial e contrato.
8. Venda registrada pelo diálogo "Registrar venda" e pós-venda até a chave, que gera indicação.

### Na vida real

**O caso:** Um handoff do robô chegou às 21h32 (2026).

**O que foi dito:** O corretor assumiu o lead 2 minutos depois do robô, à noite, e continuou a conversa de onde ela estava.

**O que aconteceu:** Venda fechada em 24 dias. Velocidade e presença fora do horário comercial, quando o cliente MCMV conversa.

### Scripts prontos

#### WhatsApp · Continuidade depois do handoff do robô, quando o cliente não atende a ligação

> Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai cuidar do seu atendimento. Vi que você conversou com a gente sobre o [empreendimento] e que [resumo em uma linha]. Te ligo agora ou prefere às 19h?

**Por que funciona:** Prova que você leu a conversa, não repete perguntas e já oferece duas opções de horário.

### Erros que matam a venda

- **Repetir o questionário que o robô já fez**  
  Quanto custa: O cliente responde tudo de novo, cansa e desiste  
  Correção: Ler o dossiê e confirmar em uma frase (M27)
- **Assumir o lead e sumir**  
  Quanto custa: Quando você assume, o robô pausa para aquele telefone: se você larga, ninguém mais responde  
  Correção: Assumiu, é seu até o desfecho
- **Achar que o robô cuida da visita**  
  Quanto custa: A confirmação automática não substitui o relacionamento; visita sem contato humano esfria  
  Correção: D-2 humano, D-1 com endereço e decisor, D+0 avisando que está a caminho

### No CRM

- **Tela:** Ficha do cliente (Dossiê)
- **Ação:** Ler resumo, conversa e linha do tempo antes de ligar
- **Campo:** Etapa "Qualificação Corretor" (chegou pelo robô ou pela pré-venda, com interesse confirmado)
- **Regra:** O aviso "Novo lead recebido!" vem sem o telefone de propósito: você abre o CRM e atualiza o lead

### Frase-âncora

> **O cliente é o bastão. Na SMQ, ninguém deixa o bastão cair na passagem.**

### Checagem rápida

1. O que significa a etapa "Qualificação Corretor"?  
   Resposta: O cliente chegou pelo robô ou pela pré-venda, já com interesse confirmado.
2. Por que o aviso de lead novo vem sem o telefone?  
   Resposta: Para o corretor abrir o CRM, ler a ficha e registrar o atendimento.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Antes de você dizer \"oi\", o seu cliente pode ter trocado 11 mensagens com o robô da casa. Se você perguntar tudo de novo, ele desiste. Saber quem já fez o quê é metade da venda.","por_que_importa":"De cada 100 leads que o robô entrega qualificados, só 37 aparecem como trabalhados pelo corretor no CRM. E quem registra o trabalho avança 8 vezes mais: 15,2% contra 1,8%. O cliente cai na passagem de uma mão para a outra.","conceito":"A operação da SMQ é uma corrida de revezamento. O bastão é o cliente. Cada corredor tem o seu trecho (anúncio, robô, corretor, gerente, correspondente, construtora, Caixa) e a regra é uma só: não deixar o bastão cair na passagem.","metodo":["O cliente chega: formulário do Meta, anúncio que abre o WhatsApp, landing page, rota direta (campanha que cai direto na roleta), reativação da base, pré-venda, indicação ou captação própria.","O robô Marquinhos abre a conversa, qualifica e leva ao próximo passo. Ele só entrega ao corretor com desfecho (visita marcada ou análise) e com um dossiê. Na rota direta, o lead chega cru, sem conversa.","A distribuição escolhe o corretor: a origem do cliente define a roleta, e dentro dela recebe quem está apto e há mais tempo sem receber.","Você assume: os primeiros 5 minutos (M26), a continuidade do handoff (M27) e a ligação que termina em visita ou análise (M15).","Visita: o robô Vitor manda a confirmação automática; o relacionamento e a condução são seus (M18).","Pasta e crédito: você anexa os documentos no CRM, o seu gerente revisa e orienta, e você envia ao correspondente do empreendimento, que leva a análise à Caixa (M21).","Construtora: garantia da unidade, ato pago por canal oficial e contrato.","Venda registrada pelo diálogo \"Registrar venda\" e pós-venda até a chave, que gera indicação."],"na_vida_real":{"caso":"Um handoff do robô chegou às 21h32 (2026).","o_que_foi_dito":"O corretor assumiu o lead 2 minutos depois do robô, à noite, e continuou a conversa de onde ela estava.","resultado":"Venda fechada em 24 dias. Velocidade e presença fora do horário comercial, quando o cliente MCMV conversa.","fonte":"Dados do CRM e do robô, 2026 (seção 9.12)"},"scripts":[{"canal":"WhatsApp","situacao":"Continuidade depois do handoff do robô, quando o cliente não atende a ligação","texto":"Oi, [nome]! Aqui é o [seu nome], da Seu Metro Quadrado. Sou o consultor que vai cuidar do seu atendimento. Vi que você conversou com a gente sobre o [empreendimento] e que [resumo em uma linha]. Te ligo agora ou prefere às 19h?","por_que_funciona":"Prova que você leu a conversa, não repete perguntas e já oferece duas opções de horário."}],"erros_que_matam":[{"erro":"Repetir o questionário que o robô já fez","custo":"O cliente responde tudo de novo, cansa e desiste","correcao":"Ler o dossiê e confirmar em uma frase (M27)"},{"erro":"Assumir o lead e sumir","custo":"Quando você assume, o robô pausa para aquele telefone: se você larga, ninguém mais responde","correcao":"Assumiu, é seu até o desfecho"},{"erro":"Achar que o robô cuida da visita","custo":"A confirmação automática não substitui o relacionamento; visita sem contato humano esfria","correcao":"D-2 humano, D-1 com endereço e decisor, D+0 avisando que está a caminho"}],"no_crm":{"tela":"Ficha do cliente (Dossiê)","acao":"Ler resumo, conversa e linha do tempo antes de ligar","campo":"Etapa \"Qualificação Corretor\" (chegou pelo robô ou pela pré-venda, com interesse confirmado)","regra":"O aviso \"Novo lead recebido!\" vem sem o telefone de propósito: você abre o CRM e atualiza o lead"},"frase_ancora":"O cliente é o bastão. Na SMQ, ninguém deixa o bastão cair na passagem.","checagem_rapida":[{"pergunta":"O que significa a etapa \"Qualificação Corretor\"?","resposta":"O cliente chegou pelo robô ou pela pré-venda, já com interesse confirmado."},{"pergunta":"Por que o aviso de lead novo vem sem o telefone?","resposta":"Para o corretor abrir o CRM, ler a ficha e registrar o atendimento."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M00-A3', 3, 'As regras do jogo', 'texto',
  'Pasta em análise não é venda. Proposta assinada não é venda. Na SMQ, venda tem três palavras: assinado, aprovado e pago. E só existe no sistema quando é registrada pelo diálogo.

### Por que importa

Renovação de contrato, ranking, conquistas e comissão dependem da definição de venda. Quem arrasta o card para "Venda" em vez de registrar pelo diálogo fica fora do VGV, do ranking e da comissão, e descobre isso no pior momento.

### O conceito

As regras do jogo são como o regulamento de um campeonato. Quem conhece joga para ganhar. Quem não conhece perde ponto sem entender por quê.

### O método SMQ, passo a passo

1. O que é venda: contrato assinado + cliente aprovado + ato pago. Proposta e pasta em análise não contam.
2. Registrar venda em 5 passos: botão "Registrar venda" no topo de qualquer tela (ou ⌘K) → cliente, valor e data de assinatura → projeto e unidade → marcos de efetivação e salvar (a venda nasce pendente) → a gestão aprova. O mês da venda é o da data de assinatura.
3. Política de performance desde 01/08/2026: no modelo fixo, renova quem faz no mínimo 2 vendas a cada 2 meses; no autônomo, 90 dias sem venda levam ao desligamento.
4. Roleta: a origem define a fila; dentro dela, recebe quem está apto e há mais tempo sem receber. O sistema pula quem está com onboarding não concluído, sem telefone, com percentual de leads trabalhados abaixo do mínimo ou com a carteira no teto, entre outros motivos.
5. Carteira: teto de 65 clientes ativos. Quem estoura para de receber cliente novo, e nada é tirado.
6. Comissão: segue a política oficial vigente, apresentada pelo seu gerente. A lógica que vale saber: a escada funciona por trimestre (as vendas de um trimestre definem o percentual do seguinte), a comissão varia pela origem do lead e o lead próprio paga mais do que o lead da empresa em todos os níveis.
7. Ética da carteira: telefone que já existe mantém o dono, ninguém "pega" cliente de colega e transferência só pela gestão.

### Na vida real

**O caso:** O conserto do CRM em 16/09/2026.

**O que foi dito:** Antes de cobrar o time, a casa consertou o sistema: a régua criava tarefa e nunca fechava (96% das tarefas venciam sozinhas), o balde "cliente respondeu" tinha registrado 1 resposta em 90 dias e o funil somava 43 mil clientes da pré-venda em "aguardando atendimento". A frase do treinamento foi: "Pedir obediência a um sistema quebrado teria sido injusto."

**O que aconteceu:** Com o sistema confiável, as regras passaram a valer para todos. O combinado agora é seguir exatamente o que o CRM manda fazer.

### Scripts prontos

#### WhatsApp · O cliente assinou a proposta e pergunta "já está tudo certo?"

> Parabéns pela decisão, [nome]! Pra ficar tudo redondo faltam três passos: a aprovação da Caixa, o pagamento do ato pelo canal oficial da construtora e a assinatura do contrato. Eu te aviso de cada passo, no máximo a cada 5 dias úteis.

**Por que funciona:** Alinha a expectativa do cliente com a definição de venda, protege contra golpe (canal oficial) e cria o compromisso de atualização que evita cancelamento.

#### Reunião com o gerente · Você parou de receber leads e quer entender o motivo

> Parei de receber lead desde [dia]. Conferi o Meu Perfil e a minha elegibilidade aparece como [status]. Você consegue ver na aba Corretores qual é o motivo exato, pra eu corrigir hoje?

**Por que funciona:** Vai direto à fonte do motivo (a aba Corretores mostra o motivo exato de cada um) e mostra responsabilidade pelo próprio resultado.

### Erros que matam a venda

- **Arrastar o card para "Venda" em vez de registrar pelo diálogo**  
  Quanto custa: A venda fica fora do VGV, do ranking e da comissão  
  Correção: "Registrar venda" com data de assinatura e marcos, no mesmo dia
- **Contar pasta em análise como venda**  
  Quanto custa: Surpresa na renovação do contrato  
  Correção: Venda é assinado, aprovado e pago
- **Ignorar os motivos pelos quais o sistema pula você**  
  Quanto custa: Dias sem receber lead sem saber por quê  
  Correção: Perfil completo, onboarding concluído e leads trabalhados em dia

### No CRM

- **Tela:** Botão "Registrar venda" (topo de qualquer tela) e Meu Perfil
- **Ação:** Registrar venda com data de assinatura e marcos; conferir a elegibilidade nas filas
- **Campo:** Data de assinatura, projeto, unidade, marcos de efetivação
- **Regra:** A venda nasce pendente e a gestão aprova; sem os marcos, a aprovação não passa

### Frase-âncora

> **Venda é assinado, aprovado e pago. E registrado pelo diálogo.**

### Checagem rápida

1. O cliente assinou a proposta e a análise está na Caixa. Já é venda?  
   Resposta: Não. Faltam a aprovação e o ato pago, e depois o registro pelo diálogo.
2. Qual data define o mês da venda?  
   Resposta: A data de assinatura.
3. O que acontece quando a sua carteira passa de 65 ativos?  
   Resposta: Você para de receber cliente novo pela distribuição, sem perder nenhum cliente.',
  10, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Pasta em análise não é venda. Proposta assinada não é venda. Na SMQ, venda tem três palavras: assinado, aprovado e pago. E só existe no sistema quando é registrada pelo diálogo.","por_que_importa":"Renovação de contrato, ranking, conquistas e comissão dependem da definição de venda. Quem arrasta o card para \"Venda\" em vez de registrar pelo diálogo fica fora do VGV, do ranking e da comissão, e descobre isso no pior momento.","conceito":"As regras do jogo são como o regulamento de um campeonato. Quem conhece joga para ganhar. Quem não conhece perde ponto sem entender por quê.","metodo":["O que é venda: contrato assinado + cliente aprovado + ato pago. Proposta e pasta em análise não contam.","Registrar venda em 5 passos: botão \"Registrar venda\" no topo de qualquer tela (ou ⌘K) → cliente, valor e data de assinatura → projeto e unidade → marcos de efetivação e salvar (a venda nasce pendente) → a gestão aprova. O mês da venda é o da data de assinatura.","Política de performance desde 01/08/2026: no modelo fixo, renova quem faz no mínimo 2 vendas a cada 2 meses; no autônomo, 90 dias sem venda levam ao desligamento.","Roleta: a origem define a fila; dentro dela, recebe quem está apto e há mais tempo sem receber. O sistema pula quem está com onboarding não concluído, sem telefone, com percentual de leads trabalhados abaixo do mínimo ou com a carteira no teto, entre outros motivos.","Carteira: teto de 65 clientes ativos. Quem estoura para de receber cliente novo, e nada é tirado.","Comissão: segue a política oficial vigente, apresentada pelo seu gerente. A lógica que vale saber: a escada funciona por trimestre (as vendas de um trimestre definem o percentual do seguinte), a comissão varia pela origem do lead e o lead próprio paga mais do que o lead da empresa em todos os níveis.","Ética da carteira: telefone que já existe mantém o dono, ninguém \"pega\" cliente de colega e transferência só pela gestão."],"na_vida_real":{"caso":"O conserto do CRM em 16/09/2026.","o_que_foi_dito":"Antes de cobrar o time, a casa consertou o sistema: a régua criava tarefa e nunca fechava (96% das tarefas venciam sozinhas), o balde \"cliente respondeu\" tinha registrado 1 resposta em 90 dias e o funil somava 43 mil clientes da pré-venda em \"aguardando atendimento\". A frase do treinamento foi: \"Pedir obediência a um sistema quebrado teria sido injusto.\"","resultado":"Com o sistema confiável, as regras passaram a valer para todos. O combinado agora é seguir exatamente o que o CRM manda fazer.","fonte":"Treinamento do CRM SMQ, set/2026"},"scripts":[{"canal":"WhatsApp","situacao":"O cliente assinou a proposta e pergunta \"já está tudo certo?\"","texto":"Parabéns pela decisão, [nome]! Pra ficar tudo redondo faltam três passos: a aprovação da Caixa, o pagamento do ato pelo canal oficial da construtora e a assinatura do contrato. Eu te aviso de cada passo, no máximo a cada 5 dias úteis.","por_que_funciona":"Alinha a expectativa do cliente com a definição de venda, protege contra golpe (canal oficial) e cria o compromisso de atualização que evita cancelamento."},{"canal":"Reunião com o gerente","situacao":"Você parou de receber leads e quer entender o motivo","texto":"Parei de receber lead desde [dia]. Conferi o Meu Perfil e a minha elegibilidade aparece como [status]. Você consegue ver na aba Corretores qual é o motivo exato, pra eu corrigir hoje?","por_que_funciona":"Vai direto à fonte do motivo (a aba Corretores mostra o motivo exato de cada um) e mostra responsabilidade pelo próprio resultado."}],"erros_que_matam":[{"erro":"Arrastar o card para \"Venda\" em vez de registrar pelo diálogo","custo":"A venda fica fora do VGV, do ranking e da comissão","correcao":"\"Registrar venda\" com data de assinatura e marcos, no mesmo dia"},{"erro":"Contar pasta em análise como venda","custo":"Surpresa na renovação do contrato","correcao":"Venda é assinado, aprovado e pago"},{"erro":"Ignorar os motivos pelos quais o sistema pula você","custo":"Dias sem receber lead sem saber por quê","correcao":"Perfil completo, onboarding concluído e leads trabalhados em dia"}],"no_crm":{"tela":"Botão \"Registrar venda\" (topo de qualquer tela) e Meu Perfil","acao":"Registrar venda com data de assinatura e marcos; conferir a elegibilidade nas filas","campo":"Data de assinatura, projeto, unidade, marcos de efetivação","regra":"A venda nasce pendente e a gestão aprova; sem os marcos, a aprovação não passa"},"frase_ancora":"Venda é assinado, aprovado e pago. E registrado pelo diálogo.","checagem_rapida":[{"pergunta":"O cliente assinou a proposta e a análise está na Caixa. Já é venda?","resposta":"Não. Faltam a aprovação e o ato pago, e depois o registro pelo diálogo."},{"pergunta":"Qual data define o mês da venda?","resposta":"A data de assinatura."},{"pergunta":"O que acontece quando a sua carteira passa de 65 ativos?","resposta":"Você para de receber cliente novo pela distribuição, sem perder nenhum cliente."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

INSERT INTO public.academia_aulas
  (modulo_id, codigo, ordem, titulo, tipo, conteudo_md, duracao_min, status, extras)
SELECT m.id, 'M00-A4', 4, 'Como a Academia te leva ao Apto', 'texto',
  'Ninguém certifica por presença. Na Academia SMQ, o selo vem de três provas: você sabe (quiz), você faz (prática avaliada) e o CRM mostra (comportamento).

### Por que importa

O selo Apto é o caminho mais curto até o placar batido e a primeira venda. Hoje ele é informativo; numa fase 2, poderá pesar na roleta. [CONFIRMAR]

### O conceito

É como faixa de arte marcial: para trocar de faixa não basta saber a teoria, é preciso mostrar no tatame. A escada é Iniciante → Apto → Intermediário → Especialista → Mestre SMQ.

### O método SMQ, passo a passo

1. Semana 1: a Trilha 0 (M00, M25, M26 e M27) e as versões essenciais do M15 (ligação e agendamento) e do M04 (MCMV), porque você já recebe lead.
2. Dias 8 a 30: o núcleo do Apto (M13, M16, M18, M19, M20, M21, M05) mais M01, M02 e M29.
3. Critério do Apto: Trilha 0 completa; núcleo com quiz de 80% ou mais; role-play "Eu conduzo" com média de 3,5 ou mais e nota máxima em "Verdade e conformidade"; uma semana inteira com o placar mínimo batido todo dia (mínimo de 100 desfechos, 7 agendamentos e 3 análises no período) e apresentação do próprio funil e do próprio gargalo ao seu gerente. É a mesma régua da certificação do CRM (decisão do diretor, 29/09/2026).
4. A rubrica padrão tem 7 critérios: abertura e conexão, qualificação, condução, objeção, desfecho, verdade e conformidade (só vale nota 5) e registro no CRM.
5. Como estudar pelo celular: uma aula por intervalo e o desafio de campo no mesmo dia.
6. Onde você é visto: 1:1 quinzenal com o gerente, All Hands quinzenal e LEGADO mensal.

### Na vida real

**O caso:** A certificação do CRM apresentada ao time em set/2026.

**O que foi dito:** Os critérios: uma semana inteira com o placar mínimo batido todo dia; mínimo de 100 desfechos, 7 agendamentos e 3 análises; apresentação ao gerente do próprio funil e do próprio gargalo. A nota do apresentador: "Os critérios são objetivos. Ninguém certifica por presença."

**O que aconteceu:** É a mesma régua que a Academia usa para o selo Apto: evidência no CRM, não opinião.

### Scripts prontos

#### Reunião com o gerente · Apresentar o próprio funil (critério do Apto)

> Meu funil da semana: [X] desfechos, [Y] agendamentos criados e [Z] análises. A minha passagem mais fraca foi [etapa], com [taxa]. Meu plano para a próxima semana é [ação], e vou medir pelo [indicador] no Meu Raio-X.

**Por que funciona:** Mostra número, gargalo, plano e indicador em quatro frases. É exatamente o que a certificação pede.

### Erros que matam a venda

- **Estudar tudo de uma vez e não aplicar**  
  Quanto custa: O conteúdo some em uma semana  
  Correção: Uma aula e um desafio por dia
- **Fazer o quiz no chute**  
  Quanto custa: Reprova, refaz e perde tempo  
  Correção: Ler a explicação de cada alternativa
- **Tratar o role-play como teatro**  
  Quanto custa: Na ligação real, trava na primeira objeção  
  Correção: Treinar com a persona e a rubrica, como se fosse de verdade

### No CRM

- **Tela:** Academia › Minha trilha; Ranking e Conquistas; Meu Raio-X
- **Ação:** Acompanhar trilha, nível e conquistas
- **Campo:** Selo Apto (informativo)
- **Regra:** A foto de perfil é obrigatória para aparecer no ranking

### Frase-âncora

> **Ninguém certifica por presença.**

### Checagem rápida

1. Quais são as três evidências que sobem o seu nível?  
   Resposta: Quiz, prática avaliada com a rubrica e comportamento medido no CRM.
2. Qual critério da rubrica só aceita nota 5?  
   Resposta: Verdade e conformidade.',
  8, 'publicado',
  '{"formato":"canonico-8.2","gancho":"Ninguém certifica por presença. Na Academia SMQ, o selo vem de três provas: você sabe (quiz), você faz (prática avaliada) e o CRM mostra (comportamento).","por_que_importa":"O selo Apto é o caminho mais curto até o placar batido e a primeira venda. Hoje ele é informativo; numa fase 2, poderá pesar na roleta. [CONFIRMAR]","conceito":"É como faixa de arte marcial: para trocar de faixa não basta saber a teoria, é preciso mostrar no tatame. A escada é Iniciante → Apto → Intermediário → Especialista → Mestre SMQ.","metodo":["Semana 1: a Trilha 0 (M00, M25, M26 e M27) e as versões essenciais do M15 (ligação e agendamento) e do M04 (MCMV), porque você já recebe lead.","Dias 8 a 30: o núcleo do Apto (M13, M16, M18, M19, M20, M21, M05) mais M01, M02 e M29.","Critério do Apto: Trilha 0 completa; núcleo com quiz de 80% ou mais; role-play \"Eu conduzo\" com média de 3,5 ou mais e nota máxima em \"Verdade e conformidade\"; uma semana inteira com o placar mínimo batido todo dia (mínimo de 100 desfechos, 7 agendamentos e 3 análises no período) e apresentação do próprio funil e do próprio gargalo ao seu gerente. É a mesma régua da certificação do CRM (decisão do diretor, 29/09/2026).","A rubrica padrão tem 7 critérios: abertura e conexão, qualificação, condução, objeção, desfecho, verdade e conformidade (só vale nota 5) e registro no CRM.","Como estudar pelo celular: uma aula por intervalo e o desafio de campo no mesmo dia.","Onde você é visto: 1:1 quinzenal com o gerente, All Hands quinzenal e LEGADO mensal."],"na_vida_real":{"caso":"A certificação do CRM apresentada ao time em set/2026.","o_que_foi_dito":"Os critérios: uma semana inteira com o placar mínimo batido todo dia; mínimo de 100 desfechos, 7 agendamentos e 3 análises; apresentação ao gerente do próprio funil e do próprio gargalo. A nota do apresentador: \"Os critérios são objetivos. Ninguém certifica por presença.\"","resultado":"É a mesma régua que a Academia usa para o selo Apto: evidência no CRM, não opinião.","fonte":"Treinamento do CRM SMQ, set/2026"},"scripts":[{"canal":"Reunião com o gerente","situacao":"Apresentar o próprio funil (critério do Apto)","texto":"Meu funil da semana: [X] desfechos, [Y] agendamentos criados e [Z] análises. A minha passagem mais fraca foi [etapa], com [taxa]. Meu plano para a próxima semana é [ação], e vou medir pelo [indicador] no Meu Raio-X.","por_que_funciona":"Mostra número, gargalo, plano e indicador em quatro frases. É exatamente o que a certificação pede."}],"erros_que_matam":[{"erro":"Estudar tudo de uma vez e não aplicar","custo":"O conteúdo some em uma semana","correcao":"Uma aula e um desafio por dia"},{"erro":"Fazer o quiz no chute","custo":"Reprova, refaz e perde tempo","correcao":"Ler a explicação de cada alternativa"},{"erro":"Tratar o role-play como teatro","custo":"Na ligação real, trava na primeira objeção","correcao":"Treinar com a persona e a rubrica, como se fosse de verdade"}],"no_crm":{"tela":"Academia › Minha trilha; Ranking e Conquistas; Meu Raio-X","acao":"Acompanhar trilha, nível e conquistas","campo":"Selo Apto (informativo)","regra":"A foto de perfil é obrigatória para aparecer no ranking"},"frase_ancora":"Ninguém certifica por presença.","checagem_rapida":[{"pergunta":"Quais são as três evidências que sobem o seu nível?","resposta":"Quiz, prática avaliada com a rubrica e comportamento medido no CRM."},{"pergunta":"Qual critério da rubrica só aceita nota 5?","resposta":"Verdade e conformidade."}]}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo,
  conteudo_md = EXCLUDED.conteudo_md, duracao_min = EXCLUDED.duracao_min,
  status = EXCLUDED.status, extras = EXCLUDED.extras, atualizado_em = now();

-- 4. Questões (20); correta é o índice 0-based da alternativa
INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q01', 1, 'situacional',
  'O cliente pergunta no WhatsApp: "Você é da construtora?". Qual resposta segue o padrão SMQ?',
  '["\"Sou sim, da equipe de vendas do empreendimento.\"","\"Não! A Seu Metro Quadrado é uma imobiliária independente. Trabalhamos com várias construtoras, então conseguimos comparar e te mostrar o que mais encaixa no seu perfil.\"","\"Isso não importa. O que importa é que o preço está ótimo.\"","\"Sou gestora de atendimento da construtora parceira.\""]'::jsonb,
  1,
  'A B é honesta e transforma a pergunta em vantagem (curadoria de estoque); em conversa real, o cliente seguiu qualificando depois dessa resposta. A A e a D mentem sobre a identidade, o que é proibido e destrói a confiança quando o cliente descobre. A C foge da pergunta e ancora a conversa em preço, a pior âncora possível.',
  'M00-A1; seção 9.14', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q02', 2, 'situacional',
  'O cliente assinou a proposta, a pasta está na Caixa e o ato ainda não foi pago. Um colega diz: "Fechou! Já lança como venda." O que você faz?',
  '["Arrasta o card para \"Venda\" para garantir o ranking do mês.","Registra a venda agora e ajusta depois, se a Caixa reprovar.","Marca como perdido para não sujar o funil.","Mantém em \"Análise de crédito\" e só registra a venda pelo diálogo quando houver contrato assinado, cliente aprovado e ato pago."]'::jsonb,
  3,
  'A D segue a definição de venda da SMQ (assinado, aprovado e pago) e o registro pelo diálogo. A A não cria venda de verdade: arrastar o card fecha o lead, mas fica fora do VGV, do ranking e da comissão. A B registra algo que ainda não é venda. A C é falsa: o cliente não foi perdido e sairia do seu acompanhamento.',
  'M00-A3; seção 9.8', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q03', 3, 'situacional',
  'Você parou de receber leads da roleta há dois dias. Qual é o caminho mais rápido para descobrir o motivo?',
  '["Conferir a elegibilidade no Meu Perfil e pedir ao gerente o motivo exato na aba Corretores da Distribuição.","Esperar, porque a roleta é aleatória.","Pedir a um colega que transfira alguns leads para você.","Perguntar no grupo do time se alguém sabe o que houve."]'::jsonb,
  0,
  'A A vai à fonte: o Meu Perfil mostra a elegibilidade nas filas e a aba Corretores mostra o motivo exato de cada um (onboarding, telefone, leads trabalhados, teto da carteira). A B está errada: a roleta não é aleatória, recebe quem está apto e há mais tempo sem receber. A C quebra a ética da carteira: transferência só pela gestão. A D pode até ajudar, mas é lenta e não mostra o motivo registrado no sistema.',
  'M00-A3; seção 9.10', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q04', 4, 'situacional',
  'O cliente diz: "Tenho medo de dar entrada e o banco não aprovar." Qual resposta respeita a regra de verdade técnica?',
  '["\"Fica tranquilo, com certeza aprova.\"","\"Aprovação garantida se você fechar hoje.\"","\"Pelo seu perfil você tem condições, e a confirmação vem na análise da Caixa. A análise é gratuita e não te compromete.\"","\"Não dá pra saber. Só arriscando.\""]'::jsonb,
  2,
  'A C acolhe o medo, é verdadeira e oferece o caminho (análise gratuita, sem compromisso). A A e a B prometem aprovação, o que é proibido e cria responsabilidade legal; a B ainda usa pressão falsa. A D é honesta, mas abandona o cliente sem caminho e aumenta o medo.',
  'M00-A1; seção 9.9', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q05', 5, 'situacional',
  'Primeiro dia. Você concluiu a trilha "Como usar o CRM", mas ainda não subiu foto nem cadastrou telefone. O gerente pergunta o que falta para você começar a jogar. O que responder?',
  '["Nada falta: a trilha concluída já basta.","Completar o perfil: sem telefone o sistema pula você na distribuição, e sem foto você não aparece no ranking.","Esperar a primeira venda para completar o perfil.","Pedir ao gerente para completar o perfil por você."]'::jsonb,
  1,
  'A B está certa: "Sem telefone" é um dos motivos para o sistema pular o corretor e a foto é obrigatória para aparecer no ranking e nas telas do time. A A ignora esses motivos. A C inverte a ordem: sem perfil completo, a primeira venda demora mais. A D transfere uma responsabilidade que é sua e leva minutos.',
  'Manual do CRM, cap. 06 e 15', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q06', 6, 'situacional',
  'O cliente pergunta: "Por que eu compraria com vocês e não direto no estande da construtora?" Qual resposta é a mais SMQ?',
  '["\"Porque com a gente sai mais barato.\"","\"Porque a construtora não atende bem.\"","\"Tanto faz, o apartamento é o mesmo.\"","\"Com a gente você compara vários produtos, faz a análise de crédito de graça antes de se comprometer, tem a parte jurídica conferida e é acompanhado até a chave.\""]'::jsonb,
  3,
  'A D usa os 4 pilares do conceito SMQ, sem prometer e sem falar mal de ninguém. A A promete algo que você não pode garantir. A B fala mal de um parceiro e tira a sua credibilidade. A C joga fora a razão de existir da SMQ.',
  'M00-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q07', 7, 'situacional',
  'O cliente foi aprovado, pagou o ato e assinou o contrato numa sexta-feira. Você só lembrou de registrar na terça. O que fazer?',
  '["Registrar pelo diálogo informando a data real de assinatura (a sexta-feira), com os marcos de efetivação.","Registrar com a data de terça, que é quando você lembrou.","Não registrar, porque já passou do dia.","Arrastar o card para \"Venda\", que é mais rápido."]'::jsonb,
  0,
  'A A está certa: o mês da venda é definido pela data de assinatura, e é ela que precisa estar no registro, com os marcos. A B distorce os relatórios. A C deixa a venda fora do sistema, do ranking e da comissão. A D fecha o lead, mas não cria a venda.',
  'M00-A3; Manual do CRM, cap. 12', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q08', 8, 'situacional',
  'Chegou o aviso "Novo lead recebido!", com nome e empreendimento, mas sem o telefone do cliente. O que você faz?',
  '["Pede o telefone ao gerente.","Espera o cliente chamar no WhatsApp.","Abre a ficha pelo link, lê o resumo e liga pelo botão do card.","Procura o telefone no grupo do time."]'::jsonb,
  2,
  'A C é o fluxo certo: o aviso vem sem o telefone de propósito, para você abrir o CRM, ler a ficha e registrar o atendimento. A A e a D atrasam o primeiro contato e tiram o lead do sistema. A B deixa a janela de ouro passar: 86% de quem responde, responde na primeira hora.',
  'M00-A2; seção 9.11', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q09', 9, 'aplicacao',
  'Qual destas situações conta como venda para a política de performance?',
  '["Pasta completa enviada ao correspondente.","Proposta assinada, com a análise em andamento.","Cliente aprovado, aguardando para pagar o ato.","Contrato assinado, cliente aprovado e ato pago."]'::jsonb,
  3,
  'Só a D reúne as três condições da venda na SMQ. A A e a B são etapas do caminho e não contam. A C ainda não tem o ato pago nem, necessariamente, o contrato assinado.',
  'M00-A3; política de performance de 01/08/2026', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q10', 10, 'aplicacao',
  'Você é do modelo fixo e está no meio do ciclo de 2 meses com 1 venda. O que a política exige para renovar?',
  '["No mínimo 2 vendas no ciclo de 2 meses.","Nada: 1 venda já basta.","3 vendas no ciclo.","1 venda e 5 pastas completas."]'::jsonb,
  0,
  'A A é a regra desde 01/08/2026: no modelo fixo, 2 vendas a cada 2 meses. A B e a C erram o número. A D mistura pasta com venda: pasta não conta para a renovação.',
  'M00-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q11', 11, 'aplicacao',
  'Um corretor autônomo está há 75 dias sem venda. Pela política, a partir de quantos dias sem venda ele é desligado?',
  '["60 dias.","90 dias.","120 dias.","Não há prazo para autônomo."]'::jsonb,
  1,
  'A B é a regra desde 01/08/2026: autônomo com 90 dias sem venda é desligado. Faltam 15 dias para ele virar o jogo. A A, a C e a D estão erradas; a D ignora que a política vale para os dois modelos.',
  'M00-A3', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q12', 12, 'aplicacao',
  'A sua carteira chegou a 65 clientes ativos. O que acontece?',
  '["Os clientes mais antigos vão para colegas.","Você é pausado da roleta por 7 dias.","Você para de receber cliente novo pela distribuição, e nenhum cliente é tirado de você.","Nada muda."]'::jsonb,
  2,
  'A C é a regra do teto: estourou, para de receber cliente novo, e o contador fica no topo da Fila Única. A A e a B inventam punições que não existem. A D ignora que o teto é um dos motivos pelos quais o sistema pula o corretor.',
  'Manual do CRM, cap. 04', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q13', 13, 'aplicacao',
  'Para registrar uma venda, o que o diálogo "Registrar venda" pede?',
  '["Só o nome do cliente.","Cliente, valor, data de assinatura, projeto e unidade e os marcos de efetivação.","Um print do contrato enviado no grupo do time.","Só o valor do imóvel."]'::jsonb,
  1,
  'A B lista o que o diálogo pede; sem os marcos de efetivação, a aprovação da gestão não passa. A A e a D são incompletas. A C expõe documento de cliente em grupo, o que fere a LGPD, e não registra nada no sistema.',
  'Manual do CRM, cap. 12', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q14', 14, 'aplicacao',
  'Na safra de 6 meses medida pelo CRM, qual origem precisou de MENOS leads para gerar uma venda?',
  '["Facebook (413 leads por venda).","Base importada (6.550 leads por venda).","Chatbot (602 leads por venda).","Indicação ou carteira própria (3 leads por venda)."]'::jsonb,
  3,
  'A D está certa: indicação e carteira própria precisaram de 3 leads por venda, e o lead captado pelo corretor, de 6. Por isso a captação própria é prioridade (M28). As outras alternativas mostram origens que exigem centenas ou milhares de leads por venda.',
  'Treinamento do CRM SMQ, set/2026 (seção 9.1)', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q15', 15, 'conceito',
  'Quais são os 4 pilares do conceito SMQ?',
  '["Menor preço, maior estoque, entrega rápida e brinde na assinatura.","Assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave.","Atendimento 24 horas, desconto garantido, aprovação garantida e chave na mão.","Marketing, tecnologia, robôs e ranking."]'::jsonb,
  1,
  'A B são os 4 pilares oficiais. A A e a C prometem o que a SMQ não promete (preço, desconto e aprovação garantidos). A D descreve ferramentas internas, não o que o cliente recebe.',
  'M00-A1', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q16', 16, 'conceito',
  'Qual é a escada de níveis da Academia SMQ?',
  '["Iniciante → Apto → Intermediário → Especialista → Mestre SMQ.","Trainee → Júnior → Pleno → Sênior.","Bronze → Prata → Ouro → Diamante.","Apto → Iniciante → Mestre SMQ → Especialista."]'::jsonb,
  0,
  'A A é a escada oficial da Academia, e cada degrau exige prova, prática e comportamento no CRM. A B e a C são escadas de cargos ou de jogos que não existem na SMQ. A D tem os nomes certos na ordem errada: ninguém chega a Mestre SMQ antes de ser Apto.',
  'M00-A4; seção 6.1', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q17', 17, 'conceito',
  'Quais são as três evidências que fazem você subir de nível na Academia?',
  '["Tempo de casa, presença nas aulas e simpatia com o gerente.","Quiz, prática avaliada com a rubrica e comportamento medido no CRM.","Número de seguidores, vendas do mês e presença no All Hands.","Só a nota do quiz."]'::jsonb,
  1,
  'A B está certa: a Academia certifica competência, não presença, e junta prova, prática e comportamento no CRM. A A usa critérios que a Academia descarta. A C mistura indicadores que não medem o método. A D mede só o que você sabe, não o que você faz.',
  'M00-A4', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q18', 18, 'conceito',
  'Na rubrica padrão SMQ, qual critério só aceita nota 5?',
  '["Abertura e conexão.","Condução.","Verdade e conformidade.","Registro no CRM."]'::jsonb,
  2,
  'A C está certa: em verdade e conformidade (sem promessa, sem urgência falsa, LGPD e antigolpe) a tolerância é zero. As outras são importantes, mas aceitam evolução gradual de 1 a 5.',
  'Seção 7.4', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q19', 19, 'caca_ao_erro',
  'Leia a mensagem de um corretor: "Oi! Sou da construtora e o seu financiamento está garantido, é só mandar os documentos hoje." Quais são os erros?',
  '["Faltou emoji.","A mensagem é curta demais.","Pediu documento cedo demais, só isso.","Identidade falsa e promessa de aprovação."]'::jsonb,
  3,
  'A D aponta os dois erros graves: mentir que é da construtora e prometer aprovação, os dois proibidos. A A e a B tratam de forma, não de conteúdo. A C vê só um problema menor e deixa passar os dois que destroem a confiança e criam responsabilidade legal.',
  'Seção 4, regras 6 e 10; seção 9.17', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

INSERT INTO public.academia_questoes
  (modulo_id, codigo, ordem, tipo, enunciado, alternativas, correta, explicacao, fonte, ativa)
SELECT m.id, 'M00-Q20', 20, 'caca_ao_erro',
  'Um corretor explica a um colega: "Arrastei o card para Venda, então já conta no ranking." Onde está o erro?',
  '["Arrastar o card fecha o lead, mas não cria venda, VGV, ranking nem comissão: a venda só existe pelo diálogo \"Registrar venda\" e com a aprovação da gestão.","Não há erro: arrastar o card é o jeito certo de registrar.","O erro é contar para o colega antes de o gerente aprovar.","O erro é não ter mandado print do card no grupo."]'::jsonb,
  0,
  'A A descreve a regra do CRM: a venda nasce pendente pelo diálogo e a gestão aprova. A B é justamente o erro. A C e a D tratam de detalhes sociais e não resolvem o problema, que é a venda não existir no sistema.',
  'M00-A3; Manual do CRM, cap. 12', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO UPDATE SET
  ordem = EXCLUDED.ordem, tipo = EXCLUDED.tipo, enunciado = EXCLUDED.enunciado,
  alternativas = EXCLUDED.alternativas, correta = EXCLUDED.correta,
  explicacao = EXCLUDED.explicacao, fonte = EXCLUDED.fonte, ativa = true;

-- 5. Flashcards (13)
INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F01', 1, 'O que a SMQ vende?', 'A assessoria que faz o financiamento passar, e o apartamento certo para o perfil do cliente.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F02', 2, 'Os 4 pilares', 'Assessoria no crédito, curadoria de estoque, segurança jurídica e acompanhamento até a chave.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F03', 3, 'Fala-âncora do conceito', '"Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar."', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F04', 4, 'Como se identificar', 'Nome + Seu Metro Quadrado + especialista em Minha Casa Minha Vida.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F05', 5, 'O que é venda', 'Contrato assinado + cliente aprovado + ato pago, registrado pelo diálogo "Registrar venda".', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F06', 6, 'Mês da venda', 'É o mês da data de assinatura.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F07', 7, 'Modelo fixo', 'Renova com no mínimo 2 vendas a cada 2 meses.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F08', 8, 'Modelo autônomo', '90 dias sem venda levam ao desligamento.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F09', 9, 'Teto da carteira', '65 clientes ativos. Estourou, para de receber cliente novo; nada é tirado.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F10', 10, 'Quem recebe na roleta', 'A origem define a fila; dentro dela, recebe quem está apto e há mais tempo sem receber.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F11', 11, 'Escada da Academia', 'Iniciante → Apto → Intermediário → Especialista → Mestre SMQ.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F12', 12, 'As 3 evidências do nível', 'Quiz, prática avaliada e comportamento medido no CRM.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

INSERT INTO public.academia_flashcards (modulo_id, codigo, ordem, frente, verso, ativa)
SELECT m.id, 'M00-F13', 13, 'Âncoras antigolpe', 'Análise gratuita; ninguém da SMQ pede Pix, taxa ou senha; a Caixa não chama no WhatsApp pedindo dado; o cliente recebe o número exato de quem vai ligar.', true
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (codigo) DO UPDATE SET
  ordem = EXCLUDED.ordem, frente = EXCLUDED.frente, verso = EXCLUDED.verso,
  ativa = true, atualizado_em = now();

-- 6. Material do gerente (guia do gerente)
INSERT INTO public.academia_conteudo_gerente (modulo_id, conteudo)
SELECT m.id, '{"guia_gestor":{"como_aplicar":"No primeiro dia, sente 30 minutos com o corretor: faça a prática de 60 segundos com a persona P5, confira o perfil e combine o desafio de campo. Na reunião de segunda, apresente o novo corretor ao time e diga qual é o desafio da semana dele.","sinais_de_dificuldade":["Perfil sem foto ou sem telefone depois de 48 horas.","O corretor aparece na aba Corretores com o motivo \"Onboarding não concluído\".","Card arrastado para \"Venda\" sem o registro pelo diálogo."],"perguntas_de_coaching":["O que você diria se o cliente perguntasse se somos da construtora?","O que falta para aquela pasta virar venda de verdade?","Qual é a sua meta de captação desta semana e onde você vai medir?"],"ritual_de_celebracao":"All Hands quinzenal: boas-vindas e primeira conquista (\"Primeiro desfecho\")."}}'::jsonb
FROM public.academia_modulos m WHERE m.codigo = 'M00' AND m.status = 'rascunho'
ON CONFLICT (modulo_id) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now();

NOTIFY pgrst, 'reload schema';
