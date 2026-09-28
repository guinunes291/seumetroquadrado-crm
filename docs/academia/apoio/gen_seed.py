"""Gera 02-seed-academia.sql a partir de modulos.json (extraído do Notion) +
o módulo O01 (onboarding) e a aula oficial do método de ligação no M15."""
import json, re

d = json.load(open('./modulos.json', encoding='utf-8'))

def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def js(v):
    return q(json.dumps(v, ensure_ascii=False)) + '::jsonb'

def arr(v):
    return 'array[' + ','.join(q(x) for x in v) + ']::text[]' if v else "'{}'::text[]"

def sem_travessao(t):
    t = re.sub(r'\s+—\s+', ': ', t)
    return t.replace('—', '-').replace('–', '-')

def titulo_limpo(t):
    t = re.sub(r'^M\d+\s*[—:-]\s*', '', t)
    return sem_travessao(t)

def prazo_de(periodo):
    m = re.search(r'Dias?\s*\d+\s*[–-]\s*(\d+)', periodo or '')
    return int(m.group(1)) if m else None

# ---------------------------------------------------------------- curadoria
PRATICA_OBRIGATORIA = {'O01', 'M08', 'M13', 'M14', 'M15', 'M16', 'M18', 'M19', 'M21'}

RUBRICA_PADRAO = [
    {"criterio": "Executou a prática do módulo por completo", "peso": 1},
    {"criterio": "Usou a linguagem e a ordem do método SMQ", "peso": 1},
    {"criterio": "Nenhuma promessa de aprovação, taxa ou prazo", "peso": 1},
    {"criterio": "Saiu com próximo passo concreto (dia, hora ou documento)", "peso": 1},
]
RUBRICA_LIGACAO = [
    {"criterio": "Jornada: perguntou se é o primeiro imóvel", "peso": 1},
    {"criterio": "Simulação: perguntou se já simulou financiamento", "peso": 1},
    {"criterio": "Parcela: descobriu a parcela ideal antes de falar preço", "peso": 1},
    {"criterio": "Conexão: apresentou o conceito SMQ (valor antes de preço)", "peso": 1},
    {"criterio": "Decisor: descobriu se compra com mais alguém", "peso": 1},
    {"criterio": "Agenda: fechou com dia, hora, quem vai e documentos", "peso": 1},
    {"criterio": "Nenhum dos 4 erros fatais", "peso": 2},
]

REVISAO = {
    'M02': 'Existem 2 versões no Notion (3 responsabilidades x 4 funções). Confirmar qual é a oficial.',
    'M11': 'Conferir as 14 etapas contra o enum lead_status do CRM (a versão antiga tinha 13 e outra ordem).',
    'M14': 'Conteúdo repete o M20 (8 tipos de follow-up). Alinhar com o Playbook Método Marquinhos (jul/2026).',
    'M15': 'Conflito de método: o Notion ensina "ligação em 5 momentos"; o método oficial desde set/2026 é "Não sou conduzido. Eu conduzo." (6 perguntas). Decidir se as aulas 1 a 4 saem ou viram contexto.',
    'M17': 'Repete os 7 passos da visita e sinais de compra do M18. Decidir onde cada tema mora.',
    'M20': 'Conferir contra a cadência oficial D1/D2/D3 e a régua de higiene de 7 dias.',
}
TECNICOS_EXPIRAM = {'M04', 'M05', 'M06', 'M07', 'M08', 'M09'}  # regras Caixa/MCMV mudam

# ---------------------------------------------------------------- O01
O01 = {
    'codigo': 'O01', 'numero': 0, 'fase': 0,
    'titulo': 'Onboarding: pronto para atender',
    'objetivo_principal': 'Em 5 dias, atender um lead real no padrão SMQ: ligar conduzindo, escrever no WhatsApp sem perder o lead, nunca prometer aprovação e deixar tudo registrado no CRM.',
    'objetivos': [
        'Conduzir a ligação com as 6 perguntas na ordem oficial',
        'Escrever no WhatsApp com 1 pergunta por mensagem e próximo passo concreto',
        'Usar o disclaimer de estimativa em toda conversa de crédito',
        'Executar a cadência D1, D2 e D3 e registrar tudo no CRM no mesmo dia',
        'Pedir os documentos certos para a visita',
    ],
    'pontos_chave': [
        'Quem pergunta conduz, quem só responde obedece.',
        'Ordem trocada é venda perdida: renda antes de preço.',
        'Nunca prometer aprovação, taxa ou prazo: quem confirma é a Caixa.',
        'Nenhum lead sem próximo passo. Registro no mesmo dia.',
        'Ligação boa termina com dia, hora e nome no documento.',
    ],
    'pilares': ['Comercial', 'Operacional'],
    'carga_horaria': 10, 'carga_horaria_texto': '10h em 5 dias (aulas + roleplay + 1 atendimento acompanhado)',
    'prazo': 5,
    'pratica': 'Roleplay de ligação com o gestor (ou na reunião da manhã) usando um lead de anúncio que só perguntou o preço. Avaliado pela rubrica das 6 saídas da ligação. Depois, 1 atendimento real acompanhado, registrado no CRM de ponta a ponta.',
    'aulas': [
        ('A SMQ e a regra de ouro', 'texto', 15, """### Quem somos
A Seu Metro Quadrado atende quem vai comprar o **primeiro imóvel** pelo Minha Casa Minha Vida em São Paulo. O cliente não compra só o apartamento: compra a assessoria que faz o financiamento passar.

### Os 4 pilares do conceito SMQ
1. **Assessoria no crédito**
2. **Curadoria de estoque**
3. **Segurança jurídica**
4. **Acompanhamento até a chave**

> "Na SMQ você não compra só o apartamento, você compra a assessoria que faz o financiamento passar."

### A regra de ouro
**Nunca prometa aprovação, taxa ou prazo.** Toda conta que você faz é estimativa.

Fala padrão, decore:
> "O que eu te passo é uma simulação. Seu perfil indica que dá certo, mas quem confirma é a Caixa."

Por que isso é inegociável: promessa que não se cumpre vira cliente perdido, reclamação e risco jurídico para a empresa. O cliente confia mais em quem é honesto sobre o processo."""),
        ('Método de ligação: "Não sou conduzido. Eu conduzo."', 'texto', 30, """### O princípio
Quem pergunta conduz. Quem só responde obedece. Se o cliente pergunta "quanto custa?" e você responde o preço, a conversa passou a ser dele.

### O mapa da conversa: 6 perguntas, ordem fixa
1. **Vai ser seu primeiro imóvel?**
2. **Você já fez uma simulação de financiamento?**
3. **Qual a parcela ideal para você pagar?**
4. **Conceito Seu Metro Quadrado** (valor antes de preço)
5. **Você vai comprar com mais alguém?**
6. **Documentação e visita** (fechamento)

**Regra dura: ordem trocada é venda perdida.** Falar de preço antes de saber a renda entrega o controle da conversa ao cliente.

### A ligação só termina com 6 coisas
Jornada, simulação, parcela, conexão, decisor e **agenda** (data, hora, quem vai, documentos, canal de envio).

### Objeções: nunca sem horário pronto
Toda objeção sai com alternativa de horário. Urgência real + agilidade ("a visita leva 20 a 30 minutos") + opção específica: **dois horários, nunca "quando você pode?"**.

### Os 4 erros que matam a ligação
1. Falar preço antes de saber a renda.
2. Aceitar "vou pensar" sem oferecer horário.
3. Apresentar unidade sem saber quem decide.
4. Encerrar sem data, hora e documento.

> "Ligação boa não termina em 'vou pensar'. Termina com dia, hora e nome no documento.\""""),
        ('WhatsApp: as 10 regras de escrita', 'texto', 20, """Estas regras vêm do que converte em produção no atendimento da SMQ (Método Marquinhos). Valem igual para o corretor.

1. **Uma pergunta por mensagem.** Nunca duas. Nunca questionário.
2. **No máximo 3 a 4 linhas.** Uma ideia por mensagem. No máximo 1 emoji.
3. **Comece pelo nome da pessoa** sempre que natural.
4. **Âncora antes da pergunta:** explique por que está perguntando.
5. **Nunca resposta oca:** reaja ao que a pessoa disse e termine com um próximo passo concreto.
6. **Nada de linguagem de banco.** Troque "renda bruta familiar" por "quanto vocês ganham por mês, somando todo mundo que entraria na compra?".
7. **Sem urgência falsa** ("últimas unidades", "só hoje"). Urgência só quando for fato.
8. **Português impecável.** Erro de português destrói credibilidade.
9. **Nunca prometa aprovação, taxa ou prazo.**
10. **Levou um SIM, entregue na mensagem seguinte.** Se o lead aceitou "te mando 2 opções?", a próxima mensagem TEM as 2 opções.

### Os 2 caminhos de conversão
Visita com dia e hora é o caminho A. Quando a visita não encaixa, a **análise de crédito gratuita** é o caminho B. Corretor que só oferece visita perde metade do funil."""),
        ('Cadência de contato e CRM', 'texto', 20, """### A cadência oficial
- **D1:** mensagem de abertura + 2 ligações + 1 WhatsApp.
- **D2** (dia seguinte, sem retorno): mais 2 ligações + 1 mensagem.
- **D3** (ainda sem retorno): follow-up de encerramento.

Lead que cumpriu D1, D2 e D3 sem retorno vai para a base de reativação, não fica parado na sua carteira.

### Regras de higiene no CRM
- **Nenhum lead sem próximo passo.**
- **Registrar o atendimento no mesmo dia.**
- Lead sem interação há **7 dias ou mais** conta como parado e pode voltar para a roleta.

Por que isso importa para você: carteira limpa é o que mostra sua conversão real. Lead morto na carteira derruba seus números e tira lead novo de você."""),
        ('Documentos para a visita', 'texto', 10, """Peça antes da visita, sempre. Visita sem documento vira segunda visita.

- RG e CPF
- Comprovante de renda
- Comprovante de residência
- CTPS digital, se for CLT
- Extrato do FGTS, se tiver

Dica: combine também **quem vai** (o decisor precisa estar) e **por onde os documentos serão enviados**."""),
    ],
    'quiz': [
        ('O cliente liga e a primeira coisa que pergunta é o preço. Pelo método SMQ, o que você faz?',
         ['Passa o preço e depois pergunta a renda', 'Conduz com a pergunta 1: se vai ser o primeiro imóvel', 'Manda a tabela completa no WhatsApp', 'Diz que só passa preço na visita e desliga'], 1,
         'Quem pergunta conduz. Preço antes de renda entrega o controle da conversa ao cliente.'),
        ('Qual a ordem correta das 3 primeiras perguntas da ligação?',
         ['Parcela, simulação, primeiro imóvel', 'Simulação, primeiro imóvel, parcela', 'Primeiro imóvel, simulação, parcela', 'Primeiro imóvel, parcela, decisor'], 2,
         'O mapa é fixo: jornada, simulação, parcela, conceito SMQ, decisor, documentação e visita.'),
        ('O cliente diz "vou pensar". Qual resposta segue o método?',
         ['"Tudo bem, fico no aguardo"', '"Quando você puder, me avisa"', 'Oferecer dois horários específicos de visita de 20 a 30 minutos', 'Mandar mensagem de follow-up em 7 dias'], 2,
         'Nunca deixar objeção sem alternativa de horário pronta: urgência real, agilidade e duas opções.'),
        ('Um cliente pergunta se vai ser aprovado. Qual a resposta correta?',
         ['"Com esse perfil, é aprovação certa"', '"Seu perfil indica que dá certo, mas quem confirma é a Caixa"', '"Depende, não sei dizer"', '"Se não aprovar, a gente devolve o sinal"'], 1,
         'Nunca prometer aprovação, taxa ou prazo. Toda conta é estimativa.'),
        ('No WhatsApp, quantas perguntas você faz por mensagem?',
         ['Uma', 'Duas, para ganhar tempo', 'Todas as de qualificação de uma vez', 'Nenhuma, só informação'], 0,
         'Exatamente uma pergunta por mensagem. Questionário mata a conversa.'),
        ('O lead respondeu "sim" para "te mando 2 opções?". O que vem na próxima mensagem?',
         ['"Legal! Me conta mais sobre você?"', 'As 2 opções: nome, região e a partir de quanto', 'Um áudio explicando o MCMV', 'A pergunta sobre renda'], 1,
         'Regra da oferta aceita: levou um SIM, entregue na mensagem seguinte.'),
        ('O lead não respondeu no D1. O que a cadência manda no D2?',
         ['Esperar uma semana', 'Mais 2 ligações e 1 mensagem', 'Passar o lead para outro corretor', 'Marcar como perdido'], 1,
         'D1: abertura + 2 ligações + 1 WhatsApp. D2: mais 2 ligações + 1 mensagem. D3: encerramento.'),
        ('Qual destes NÃO está na lista de documentos para a visita?',
         ['Comprovante de renda', 'Extrato do FGTS, se tiver', 'Certidão de casamento dos pais', 'Comprovante de residência'], 2,
         'A lista: RG e CPF, comprovante de renda, comprovante de residência, CTPS digital se CLT, extrato do FGTS se tiver.'),
    ],
}

M15_AULA_OFICIAL = ('Método oficial SMQ: as 6 perguntas', 'texto', 25,
    O01['aulas'][1][3] + "\n\n> Esta é a versão oficial do método de ligação da SMQ (set/2026). Onde o conteúdo antigo deste módulo divergir, vale esta aula.")

# ---------------------------------------------------------------- SQL
out = []
w = out.append
w('-- =====================================================================')
w('-- ACADEMIA SMQ · carga inicial (seed 02). Idempotente: pode rodar de novo.')
w('-- Fonte: Notion "Módulos da Academia SMQ" (22/04/2026) + O01 escrito a partir')
w('-- do método oficial de ligação (set/2026), Playbook Método Marquinhos e cadência D1/D2/D3.')
w('-- Todos os módulos entram como RASCUNHO: nada aparece para o corretor até')
w('-- o Guilherme revisar e publicar. Isso é de propósito.')
w('-- =====================================================================')
w('begin;')
w('')
fases = [
    (0, 'Onboarding', 'Dias 1-5', 1, 5, 'Pronto para atender lead no padrão SMQ', 'apto'),
    (1, 'Fundação', 'Dias 1-30', 1, 30, 'Mentalidade, papel, mercado e MCMV', 'intermediario'),
    (2, 'Domínio Técnico', 'Dias 31-90', 31, 90, 'Faixas, crédito, simulação, FGTS', 'intermediario'),
    (3, 'Domínio Comercial', 'Dias 91-180', 91, 180, 'Funil, prospecção, qualificação, fechamento', 'especialista'),
    (4, 'Alta Performance', 'Recorrente', None, None, 'Marca pessoal, IA, tecnologia', 'mestre'),
    (5, 'Excelência', 'Recorrente', None, None, 'Ética, cultura, legado', 'mestre'),
]
w('insert into public.academia_fases (numero, nome, periodo_texto, dia_inicio, dia_fim, foco, nivel_que_exige) values')
w(',\n'.join(f"  ({n}, {q(nm)}, {q(pt)}, {q(di)}, {q(df)}, {q(fo)}, {q(nv)})" for n, nm, pt, di, df, fo, nv in fases))
w('on conflict (numero) do update set nome = excluded.nome, periodo_texto = excluded.periodo_texto,')
w('  dia_inicio = excluded.dia_inicio, dia_fim = excluded.dia_fim, foco = excluded.foco,')
w('  nivel_que_exige = excluded.nivel_que_exige;')
w('')

def modulo_sql(c):
    w(f"-- {c['codigo']} · {c['titulo']}")
    w('insert into public.academia_modulos (codigo, numero, fase, titulo, objetivo_principal, objetivos, pontos_chave,')
    w('  pilares, carga_horaria_h, carga_horaria_texto, prazo_dias, obrigatorio, exige_pratica, pratica_descricao,')
    w('  pratica_rubrica, url_gamma, url_notion, notion_page_id, status, revisao_pendente, revisar_em)')
    w(f"values ({q(c['codigo'])}, {c['numero']}, {c['fase']}, {q(c['titulo'])}, {q(c['objetivo_principal'])},")
    w(f"  {js(c['objetivos'])}, {js(c['pontos_chave'])}, {arr(c['pilares'])}, {q(c['carga'])}, {q(c['carga_texto'])},")
    w(f"  {q(c['prazo'])}, {q(c['obrigatorio'])}, {q(c['exige_pratica'])}, {q(c['pratica'])}, {js(c['rubrica'])},")
    w(f"  {q(c['gamma'])}, {q(c['notion'])}, {q(c['notion_id'])}, 'rascunho', {q(c['revisao'])},")
    w(f"  {c['revisar_em']})")
    w('on conflict (codigo) do update set titulo = excluded.titulo, objetivo_principal = excluded.objetivo_principal,')
    w('  objetivos = excluded.objetivos, pontos_chave = excluded.pontos_chave, pilares = excluded.pilares,')
    w('  carga_horaria_h = excluded.carga_horaria_h, carga_horaria_texto = excluded.carga_horaria_texto,')
    w('  url_gamma = excluded.url_gamma, url_notion = excluded.url_notion, notion_page_id = excluded.notion_page_id')
    w('  where public.academia_modulos.status = \'rascunho\';  -- nunca sobrescreve módulo já publicado')
    # aulas
    for i, (tit, tipo, dur, md, url) in enumerate(c['aulas'], start=1):
        w('insert into public.academia_aulas (modulo_id, ordem, titulo, tipo, conteudo_md, url_material, duracao_min)')
        w(f"select id, {i}, {q(tit)}, {q(tipo)}, {q(md)}, {q(url)}, {q(dur)} from public.academia_modulos where codigo = {q(c['codigo'])}")
        w('on conflict (modulo_id, ordem) do nothing;')
    for i, (enun, alts, cor, exp) in enumerate(c['quiz'], start=1):
        w('insert into public.academia_questoes (modulo_id, ordem, enunciado, alternativas, correta, explicacao)')
        w(f"select id, {i}, {q(enun)}, {js(alts)}, {cor}, {q(exp)} from public.academia_modulos where codigo = {q(c['codigo'])}")
        w('on conflict (modulo_id, ordem) do nothing;')
    w('')

todos = []
# O01
todos.append(dict(codigo='O01', numero=0, fase=0, titulo=O01['titulo'], objetivo_principal=O01['objetivo_principal'],
    objetivos=O01['objetivos'], pontos_chave=O01['pontos_chave'], pilares=O01['pilares'], carga=O01['carga_horaria'],
    carga_texto=O01['carga_horaria_texto'], prazo=5, obrigatorio=True, exige_pratica=True, pratica=O01['pratica'],
    rubrica=RUBRICA_LIGACAO, gamma=None, notion=None, notion_id=None,
    revisao='Conteúdo novo escrito a partir do método oficial. Guilherme revisa o texto antes de publicar.',
    revisar_em="null",
    aulas=[(t, tp, du, md, None) for t, tp, du, md in O01['aulas']], quiz=O01['quiz']))

for m in d['modulos']:
    cod = m['codigo']
    aulas = []
    for s in m['secoes']:
        md = s.get('conteudo_md') or (s['resumo'] + '\n\n> Resumo provisório. O texto completo vem do Notion pelo script de importação.')
        aulas.append((sem_travessao(s['titulo']), 'texto', 10, md, None))
    if cod == 'M15':
        aulas.insert(0, (M15_AULA_OFICIAL[0], M15_AULA_OFICIAL[1], M15_AULA_OFICIAL[2], M15_AULA_OFICIAL[3], None))
    if m.get('url_gamma'):
        aulas.append(('Slides do módulo', 'slides', 20, 'Revise os slides completos do módulo antes do quiz.', m['url_gamma']))
    if m.get('pratica'):
        aulas.append(('Prática do módulo', 'pratica', None, m['pratica'], None))
    rev = REVISAO.get(cod, 'Revisar conteúdo importado do Notion (abr/2026) antes de publicar.')
    quiz = [(p['pergunta'], p['alternativas'], p['correta'], p.get('explicacao')) for p in m['perguntas_quiz']]
    if cod == 'M15':
        quiz += [(p[0], p[1], p[2], p[3]) for p in O01['quiz'][:3]]
    todos.append(dict(codigo=cod, numero=m['numero'], fase=m['fase'], titulo=titulo_limpo(m['titulo']),
        objetivo_principal=m.get('objetivo_principal'), objetivos=m.get('objetivos_aprendizagem', []),
        pontos_chave=m.get('pontos_chave', []), pilares=m.get('pilar', []), carga=m.get('carga_horaria'),
        carga_texto=m.get('carga_horaria_texto'), prazo=prazo_de(m.get('periodo')), obrigatorio=True,
        exige_pratica=cod in PRATICA_OBRIGATORIA, pratica=m.get('pratica'),
        rubrica=RUBRICA_LIGACAO if cod == 'M15' else RUBRICA_PADRAO,
        gamma=m.get('url_gamma'), notion=m.get('url_notion'), notion_id=m.get('notion_page_id'),
        revisao=rev, revisar_em="current_date + 90" if cod in TECNICOS_EXPIRAM else "null",
        aulas=aulas, quiz=quiz))

# extra -> P01 complementar
e = d['extra'][0]
todos.append(dict(codigo='P01', numero=99, fase=3, titulo='Treinamento prático: WhatsApp e ligação',
    objetivo_principal=e.get('subtitulo'), objetivos=e.get('objetivos_aprendizagem', []), pontos_chave=e.get('pontos_chave', []),
    pilares=['Comercial'], carga=e.get('carga_horaria'), carga_texto=None, prazo=None, obrigatorio=False,
    exige_pratica=False, pratica=e.get('pratica'), rubrica=RUBRICA_PADRAO, gamma=e.get('url_gamma'),
    notion=e.get('url_notion'), notion_id=e.get('notion_page_id'),
    revisao='Página do Notion parece incompleta (termina no meio da tabela de gatilhos e não tem a parte de documentação).',
    revisar_em="null",
    aulas=[(sem_travessao(s['titulo']), 'texto', 10, s.get('conteudo_md') or s['resumo'], None) for s in e['secoes']],
    quiz=[(p['pergunta'], p['alternativas'], p['correta'], p.get('explicacao')) for p in e['perguntas_quiz']]))

for c in todos:
    modulo_sql(c)

# regras de recomendação (ficam em sombra até a Fatia 4 validar os indicadores)
regras = [
    ('R01', 'tempo_primeiro_contato', 'Demora para o primeiro contato bem acima do time', 'M13', 'maior_e_pior', 1.5, 30, 8,
     'Mediana em hh:mm entre a atribuição do lead e a 1a interação do corretor.'),
    ('R02', 'taxa_agendamento', 'Agenda pouco em relação aos leads que atende', 'M15', 'menor_e_pior', 0.7, 30, 15,
     'Leads que PASSARAM POR agendado / leads atribuídos na janela (bool_or no histórico, não último status).'),
    ('R03', 'taxa_comparecimento', 'Muitas visitas marcadas não acontecem', 'M14', 'menor_e_pior', 0.7, 60, 8,
     'Passou por visita_realizada / passou por agendado. M14 tem o protocolo de confirmação D-2/D-1/D+0.'),
    ('R04', 'taxa_visita_para_avanco', 'Visita que não vira proposta ou análise', 'M18', 'menor_e_pior', 0.7, 60, 8,
     'Passou por proposta_enviada ou analise_credito / passou por visita_realizada.'),
    ('R05', 'pct_carteira_parada', 'Carteira com muito lead parado 7+ dias', 'M20', 'maior_e_pior', 1.5, 7, 20,
     'Mesma régua da Higiene do Funil (7 dias sem interação). Excluir lotes de importação.'),
    ('R06', 'pct_sem_proximo_passo', 'Leads sem próximo passo registrado', 'M11', 'maior_e_pior', 1.5, 7, 20,
     'Leads ativos da carteira sem tarefa/follow-up futuro.'),
    ('R07', 'taxa_pasta_devolvida', 'Pastas devolvidas ou com pendência de documento', 'M21', 'maior_e_pior', 1.5, 90, 5,
     'Depende do schema de documentacoes. Validar na Fatia 0.'),
    ('R08', 'taxa_perda_por_qualificacao', 'Muitas perdas por perfil não qualificado depois de avançar', 'M16', 'maior_e_pior', 1.5, 90, 8,
     'Depende do motivo_perda (remendo motivo-perda). Só ativar se o campo estiver sendo preenchido.'),
]
w('-- Regras de recomendação por indicador. Todas começam valendo, mas o motor')
w('-- roda em modo SOMBRA (academia_config.recomendacao_modo) até validar.')
for cod, ind, desc, mod, dirc, lim, jan, amo, obs in regras:
    w('insert into public.academia_regras_recomendacao (codigo, indicador, descricao, modulo_codigo, direcao, limiar_relativo, janela_dias, amostra_minima, observacao)')
    w(f"values ({q(cod)}, {q(ind)}, {q(desc)}, {q(mod)}, {q(dirc)}, {lim}, {jan}, {amo}, {q(obs)})")
    w('on conflict (codigo) do nothing;')
w('')
w('commit;')

sql = '\n'.join(out)
open('./02-seed-academia.sql', 'w', encoding='utf-8').write(sql)
print('modulos', len(todos), 'aulas', sum(len(c['aulas']) for c in todos), 'questoes', sum(len(c['quiz']) for c in todos), 'bytes', len(sql))
