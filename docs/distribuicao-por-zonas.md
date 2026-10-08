# Distribuição por Zonas — modelo e runbook de virada

## ZONA ESTRITA (2026-10-03) — o modelo vigente

> Decisão do dono: **"um corretor deve receber leads de qualquer origem apenas
> da sua região de atuação."** Implementado em
> `20261009120000_zona_estrita_regiao_unica.sql` e
> `20261009120100_zona_estrita_motor_e_guarda.sql`. Esta seção **substitui** os
> desvios descritos mais abaixo (seções de 16/08 em diante continuam como
> histórico e como o comportamento do rollback).

### Por que vazava

Um inventário de todos os caminhos que gravam `leads.corretor_id` achou ~20
portas de entrega. Só o motor de roleta olhava zona — e com desvios:

| Vazamento                                          | Exemplo real                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Roleta da zona "não pronta" → fluxo por origem     | 8h, ninguém da Leste marcou "Cheguei": lead da Leste ia para o Plantão    |
| Ninguém da zona apto → "qualquer apto"             | cota da Zona Sul estourada: lead do Sul ia para quem estivesse livre      |
| `profiles.zonas` vazio = "atende todas"            | corretor sem zona marcada recebia de toda a cidade pelo Plantão           |
| Duas regras de zona do lead                        | Next Guarulhos/projetos do ABC ficavam SEM zona na distribuição → Plantão |
| Duas "regiões do corretor" (cadastro × roleta)     | a aba Corretores dizia Leste; a roleta dizia Sul; cada motor lia uma      |
| Equipe fixa ignorava zona                          | lead da Norte da campanha `equipe-guilherme` caía num corretor da Sul     |
| Escoar estoque (cron a cada 10 min)                | estoque mais antigo de QUALQUER zona entregue a quem estivesse no Plantão |
| Token de roleta de zona passava por cima do lead   | formulário dizia "Zona Sul", token era `zona-norte` → time da Norte       |
| Transferência manual, Oferta Ativa, espelho do SDR | gestor escolhia qualquer corretor, sem aviso                              |
| SDR, Discador, lote de prospecção                  | dono antigo de outra zona / corretor escolhia qualquer zona no lote       |
| Função legada `atribuir_lead_a_corretor`           | SECURITY DEFINER **sem checagem de permissão**, executável por `anon`     |

### As três peças da solução

1. **Uma zona do lead.** A regra é a da vitrine (`zona_canonica` /
   `_zona_do_lead_campos`): zona do próprio lead (texto livre canonizado) →
   bairro → empreendimento. ABC conta como **Sul**; Guarulhos, Osasco etc. são
   **Grande SP** (6ª zona). Distribuição, lote, Bolsão e guarda usam a mesma
   função.
2. **Uma região do corretor.** Região = **participação ativa nas roletas de
   zona** (as seis: Norte, Sul, Leste, Oeste, Centro, Grande SP).
   `profiles.zonas` virou espelho mantido pelo banco (qualquer escrita direta é
   recalculada). A aba **Corretores** ("Região de atuação") e a aba **Filas**
   editam a mesma coisa. **Não existe mais "vazio = todas"**: quem atende tudo
   é marcado nas seis; sem região, o corretor só recebe lead SEM zona.
3. **Regra aplicada em todo caminho, em duas camadas.**
   - _Motores_ escolhem só dentro da região: roleta (lead com zona vai SEMPRE
     para a roleta da zona dele), campanha (comum delega à zona; equipe fixa
     sorteia só quem da equipe atende a zona, senão vai para o time da zona),
     esteira base, repasse por SLA, Escoar estoque, SDR, Oferta Ativa,
     Discador e lote de prospecção.
   - _Guarda no banco_ (`trg_zz_guarda_zona_corretor`): qualquer escrita que
     dê a um corretor um lead de zona que ele não atende é recusada com
     `SQLSTATE SMQZ1` e mensagem pronta ("Fora da região: o lead é da Zona
     Leste e Fulano não atende essa zona…"). Cobre o que não passa por motor:
     PATCH direto, importação, criação com corretor escolhido e funções que só
     existem em produção (`redistribuir_duplicado_campanha`).

### O que acontece quando ninguém da zona pode receber

O lead **espera** — nunca muda de zona. Ele entra na fila de exceções com um
motivo próprio, a gestão recebe alerta (um por lead) e o cron (a cada minuto)
tenta de novo:

| Motivo                 | Quando                                                      | O que fazer                                 |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `sem_corretor_na_zona` | o time existe, mas ninguém apto agora (ausência/cota/pausa) | nada — entrega quando alguém da zona chegar |
| `zona_sem_time`        | a roleta da zona não tem participante                       | montar o time da zona na Central            |
| `zona_sem_roleta`      | a zona perdeu a linha em `zonas_roletas`                    | religar zona → roleta                       |

Quando um corretor da zona marca **"Cheguei"** (ou entra no time), as
exceções de espera daquela zona zeram a contagem e voltam no minuto seguinte —
sem esperar o backoff de 30 min do cron.

### Lead do Marquinhos: Roleta Marquinhos da zona (20261012120000)

Relato de 08/10: _"os leads do Marquinhos não estão seguindo a roleta do
Marquinhos, estão respeitando apenas a roleta de zona"_. Com a zona estrita, o
lead COM zona ia sempre direto para a roleta da zona — e o Marquinhos manda a
região de interesse da qualificação, que vira `leads.zona`. Na prática nenhum
lead do bot chegava ao time da Roleta Marquinhos.

Agora, com a zona estrita ligada, o lead cuja origem resolve para a roleta
`marquinhos` (mapeamento origem → roleta; hoje `chatbot`) segue a mesma ideia
da campanha de equipe fixa:

1. **Roleta Marquinhos, só quem atende a zona do lead** (participa da roleta da
   zona). Quem é da Marquinhos mas de outra zona fica auditado em
   `fora_da_regiao`.
2. **Ninguém da Marquinhos apto naquela zona** (ninguém da zona no time,
   ausência, cota, pausa, trava dos 65, já teve o lead, fora do horário da
   roleta) → **time da zona**, na mesma chamada. O lead nunca espera pelo bot
   nem sai da zona; o contexto da decisão traz `roleta_pedida: "marquinhos"` e
   `marquinhos_sem_apto_na_zona: true`, e o motivo no Histórico diz "ninguém da
   Roleta Marquinhos apto na Zona X".
3. **Repasse por SLA/parado**: a entrega pela Marquinhos não grava pino de zona,
   então o repasse tenta de novo a Marquinhos da zona (sem quem já teve o lead)
   antes do time da zona.

Exemplo: Mara (Leste, na Marquinhos), Lia (Leste, fora da Marquinhos) e Otto
(Oeste, na Marquinhos). Lead do bot da Leste → Mara, mesmo que a Lia seja a
próxima da vez na zona. Lead do bot da Norte → time da Norte (ninguém da
Marquinhos atende a Norte). Mara ausente → lead do bot da Leste vai para a Lia.

Não muda: lead do bot sem zona (Roleta Marquinhos inteira), leads de outras
origens (roleta da zona), Roleta Marquinhos desativada ou `chatbot` reapontado
para outra roleta em Configurações (o lead do bot vai direto para a zona), e o
rollback da zona estrita (caminho antigo).

**Cota**: a entrega pela Marquinhos conta na cota diária da Roleta Marquinhos,
não na da zona (a cota é por roleta). Se um corretor recebe muito lead do bot,
ajuste o limite dele na aba Filas → Marquinhos.

**Desligar** (volta ao "zona direto"): Central → Configurações → "Lead do
Marquinhos vai primeiro para a Roleta Marquinhos", ou

```sql
UPDATE public.distribuicao_settings SET valor = 'false' WHERE chave = 'marquinhos_antes_da_zona';
```

Conferência (banco do CRM):

```sql
-- Leads do bot nas últimas 24h: por qual roleta saíram e quantos desviaram.
SELECT dl.roleta_slug, public.zona_do_lead(dl.lead_id) AS zona,
       count(*) FILTER (WHERE (ctx.contexto->>'marquinhos_sem_apto_na_zona')::boolean) AS desvio_para_zona,
       count(*) AS total
  FROM public.distribution_log dl
  JOIN public.leads l ON l.id = dl.lead_id
  LEFT JOIN public.distribuicao_log_contexto ctx ON ctx.log_id = dl.id
 WHERE dl.resultado = 'sucesso' AND l.origem = 'chatbot'
   AND dl.created_at > now() - interval '24 hours'
 GROUP BY 1, 2 ORDER BY 1, 2;

-- Cobertura: em quais zonas a Roleta Marquinhos tem gente (zona sem ninguém
-- = todo lead do bot dessa zona vai para o time da zona).
SELECT zr.zona, string_agg(p.nome, ', ' ORDER BY p.nome) AS marquinhos_na_zona
  FROM public.zonas_roletas zr
  LEFT JOIN public.roleta_participantes rp
         ON rp.ativo AND rp.roleta_id = (SELECT id FROM public.roletas WHERE slug = 'marquinhos')
        AND public.corretor_atende_zona(rp.corretor_id, zr.zona)
  LEFT JOIN public.profiles p ON p.id = rp.corretor_id
 GROUP BY 1 ORDER BY 1;
```

### O que continua permitido (de propósito)

- **Lead sem zona** (sem zona, bairro reconhecido nem empreendimento com zona):
  segue o fluxo por origem (Plantão/Marquinhos/Landing/campanha).
- **Captação própria**: o corretor cadastrando o próprio cliente.
- **Dono que não é corretor** (gestor/admin assumindo um lead).
- **Exceção da gestão** (política v1 §6 — indicação, cliente que pediu o
  corretor): nos diálogos de transferência e no "atribuir manual" da fila de
  exceções há a caixa _"Exceção da gestão"_, que exige **motivo escrito** e
  fica no `distribution_log` (`transferencia_fora_da_regiao` /
  "Atribuição manual FORA DA REGIÃO"). Na API pública:
  `PATCH /api/public/leads/:id/corretor` com `forcar_fora_da_zona: true` +
  `motivo`; sem isso, destino fora da região devolve **409** `{ codigo:
"fora_da_regiao" }`.
- **"Desfazer" de emergência** (higiene, régua de devolução, fase 0): só
  devolvem o lead ao dono anterior.
- **SQL de manutenção** (console do banco, reimportação de histórico): a
  transação pode avisar a guarda com
  `SELECT set_config('app.zona_override', 'on', true);` — vale só até o fim
  daquela transação. Use para restaurar estado, nunca para distribuir.

### Como a virada chega à produção

O Lovable aplica no banco de produção o que está em **`drizzle/migrations`**,
pelo migrator do drizzle (`drizzle.__drizzle_migrations`): toda entrada do
journal com `when` maior que o da última aplicada roda, **numa transação só**,
quando `drizzle/` chega ao `main`. `supabase/migrations` é o que o CI aplica — o
runner do Supabase não registra nada em produção desde 16/09.

O PR #234 levou as cinco migrations só para `supabase/migrations`: CI verde,
nada em produção. Conferido no banco vivo em 03/10 (18:54 UTC): nenhuma função
nova, `zonas_roletas` com as quatro zonas antigas, anônimo ainda executando
`processar_distribuicao_automatica()`. O espelho é
`drizzle/migrations/0045`–`0049` (cópia byte a byte, `when` de 09/10), e
`tests/drizzle-espelho.test.ts` agora reprova migration sem espelho.

Simulado com o migrator do drizzle de verdade, num banco no estado da produção
(até a 0043, `search_path` sem `extensions`): aplica só as cinco, em ~85 ms;
segunda passada não aplica nada.

**Times em produção em 03/10** (participação ativa): Leste 6, Norte 2, Oeste 9,
**Sul 0**; Centro e Grande SP ainda não existem. Com a regra ligada, lead da Sul
(e do ABC, que é Sul) e da Grande SP (Guarulhos) espera até a zona ter time.

### Prévia: como cada time fica (rodar ANTES da virada)

Usa só tabelas que já existem. Conferida contra o resultado real do migrator
num banco simulado: bate nas seis zonas.

```sql
-- fica  = já participa ativo da roleta da zona;
-- entra = tem a zona no cadastro (profiles.zonas) e nunca esteve na roleta
--         (quem a gestão removeu da roleta NÃO volta).
WITH c AS (
  SELECT p.id, p.nome, p.zonas
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'
   WHERE p.ativo
), z(zona, slug) AS (
  VALUES ('Norte', 'zona-norte'), ('Sul', 'zona-sul'), ('Leste', 'zona-leste'),
         ('Oeste', 'zona-oeste'), ('Centro', 'zona-centro'), ('Grande SP', 'zona-grande-sp')
)
SELECT z.zona,
       count(*) FILTER (WHERE rp.ativo OR (rp.corretor_id IS NULL AND z.zona = ANY (c.zonas))) AS time_depois,
       string_agg(c.nome, ', ' ORDER BY c.nome) FILTER (WHERE rp.ativo) AS fica,
       string_agg(c.nome, ', ' ORDER BY c.nome)
         FILTER (WHERE rp.corretor_id IS NULL AND z.zona = ANY (c.zonas)) AS entra
  FROM z
 CROSS JOIN c
  LEFT JOIN public.roletas r ON r.slug = z.slug
  LEFT JOIN public.roleta_participantes rp ON rp.roleta_id = r.id AND rp.corretor_id = c.id
 GROUP BY z.zona
 ORDER BY z.zona;
```

### Runbook da virada

A migration não move nenhum lead já atribuído. Há dois jeitos de virar:

**A) Em duas etapas — quando alguma zona fica sem time na prévia.** Centro e
Grande SP só ganham roleta COM a migration, então o time delas não pode ser
montado antes; a Sul, em 03/10, também estava vazia.

1. No SQL Editor, ANTES do merge do espelho (a migration respeita a chave que
   já existe — `ON CONFLICT DO NOTHING`):

   ```sql
   INSERT INTO public.distribuicao_settings (chave, valor, descricao)
   VALUES ('zona_estrita', 'false'::jsonb, 'Virada em duas etapas: ligar depois de montar os times')
   ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
   ```

2. Merge do espelho. Entram a região única, as roletas Centro e Grande SP, o
   repasse por SLA de campanha e o fechamento das RPCs para anônimo — essas
   correções valem com a regra desligada. A distribuição segue com os desvios
   antigos.
3. Montar os times: Central de Distribuição → Corretores → coluna **Região de
   atuação** (ou aba Filas → zona → Incluir corretor). Rodar a consulta "Times
   por zona" (SQL de verificação) até nenhuma zona ficar vazia.
4. Ligar: Central → **Configurações** → "Zona estrita" (ou o UPDATE do
   rollback com `'true'`).

**B) Direto — quando a prévia não mostra zona vazia.** Merge do espelho; a regra
nasce ligada. Zona que ficar sem time segura os leads dela com `zona_sem_time`
até a gestão incluir alguém.

Nos dois casos, depois de ligada:

- **Revisar "Sem região"** na aba Corretores (selo amarelo). Esses corretores
  só recebem lead sem zona e não pedem lote.
- **Cotas**: o limite diário (padrão 10) é por roleta. Sem o desvio para o
  Plantão, a roleta da zona é o único caminho do lead da zona — se o time é
  pequeno, aumente o limite individual (aba Filas → zona → Limite). Norte com
  dois corretores segura 20 leads/dia.
- **Presença**: as roletas de zona exigem "Cheguei". Leads da madrugada
  esperam o primeiro da zona marcar presença (e saem no minuto seguinte).
- **Acompanhar** pela fila de Exceções e pelos cards das seis zonas na Visão
  Geral ("Sem corretor apto — leads da zona esperam").

**Rollback (Central → Configurações → "Zona estrita", ou 1 UPDATE):**

```sql
UPDATE public.distribuicao_settings SET valor = 'false' WHERE chave = 'zona_estrita';
```

Motores e guarda voltam ao comportamento anterior linha a linha. A região
única (parte 1) continua — ela não muda quem recebe nada sozinha.

### Repasse por SLA de lead de campanha (20261009120200)

O repasse imediato (tela, quando o relógio zera) e o cron de leads parados
mandavam o lead de campanha para a roleta ponderada de lead NOVO, que recusa
lead com dono (`ja_atribuido`). O lead ficava com quem estourou o SLA, nunca
escalava, e no cron de parados voltava como candidato a cada minuto — ~50
leads assim travavam o repasse de todos os outros. Agora os três caminhos de
repasse (imediato, parados e cron de SLA) usam `_repassar_lead_campanha`:

- repassa **dentro da equipe da campanha** (SWRR por tier, cota diária),
  pulando quem já teve o lead, mantendo o pino e **reiniciando o relógio**;
- respeita a zona estrita: campanha comum com lead de zona → time da zona;
  equipe fixa → quem da equipe atende a zona, senão o time da zona;
- campanha desligada → triagem normal;
- ninguém para receber → o lead fica com o dono atual e abre exceção
  (`sem_corretor_elegivel`), com alerta e o backoff do cron.

### SQL de verificação (banco do CRM)

```sql
-- Times por zona (a região de cada corretor).
SELECT zr.zona, string_agg(p.nome, ', ' ORDER BY p.nome) FILTER (WHERE rp.ativo) AS time
  FROM public.zonas_roletas zr
  JOIN public.roletas r ON r.slug = zr.roleta_slug
  LEFT JOIN public.roleta_participantes rp ON rp.roleta_id = r.id
  LEFT JOIN public.profiles p ON p.id = rp.corretor_id
 GROUP BY 1 ORDER BY 1;

-- Corretores ativos SEM região (só recebem lead sem zona).
SELECT p.nome FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'
 WHERE p.ativo AND cardinality(p.zonas) = 0 ORDER BY 1;

-- Leads esperando o time da zona.
SELECT motivo, public.zona_do_lead(lead_id) AS zona, count(*)
  FROM public.distribuicao_excecoes
 WHERE status IN ('pendente', 'em_analise')
   AND motivo IN ('sem_corretor_na_zona', 'zona_sem_time', 'zona_sem_roleta')
 GROUP BY 1, 2 ORDER BY 3 DESC;

-- Entregas fora da região nas últimas 24h: só pode aparecer exceção da gestão.
SELECT dl.created_at, dl.regra_aplicada, dl.motivo, p.nome,
       public.zona_do_lead(dl.lead_id) AS zona
  FROM public.distribution_log dl
  JOIN public.profiles p ON p.id = dl.corretor_id
 WHERE dl.resultado = 'sucesso'
   AND dl.created_at > now() - interval '24 hours'
   AND public.has_role(dl.corretor_id, 'corretor')
   AND NOT public.corretor_atende_zona(dl.corretor_id, public.zona_do_lead(dl.lead_id))
 ORDER BY 1 DESC;

-- Carteira HERDADA fora da região (de antes da regra; a migration não mexe).
SELECT p.nome, public.zona_do_lead(l.id) AS zona, count(*)
  FROM public.leads l
  JOIN public.profiles p ON p.id = l.corretor_id
 WHERE l.deleted_at IS NULL AND NOT l.na_lixeira
   AND l.status NOT IN ('contrato_fechado', 'pos_venda', 'perdido')
   AND public.has_role(l.corretor_id, 'corretor')
   AND NOT public.corretor_atende_zona(l.corretor_id, public.zona_do_lead(l.id))
 GROUP BY 1, 2 ORDER BY 3 DESC;
```

---

## Histórico: roletas por zona com desvios (2026-08-16 → 2026-10-03)

Decisão de produto (2026-08-16): **a roleta é a zona**. A distribuição passa a
ter 4 roletas geográficas — **Zona Norte, Zona Sul, Zona Leste, Zona Oeste** —
com os corretores de cada uma definidos manualmente pela gestão. A participação
na roleta É o corte geográfico: quem está na roleta da zona recebe os leads
daquela zona, em rodízio simples (há mais tempo sem receber).

Implementado na migration `20260816140000_roletas_por_zona.sql`.

## Como um lead ganha zona (nada disso mudou de lugar)

Cascata `zona_do_lead` (migration 20260813):

1. `leads.zona` explícita (texto livre normalizado pelo trigger: "zona leste",
   "ZL" → `Leste`);
2. `leads.bairro` → tabela `zonas_bairros` (169 bairros de SP, editável);
3. zona do projeto (`projetos.zona_smq` → `regiao`).

Quem grava o quê:

| Canal                                  | Campo que vira zona                                                   |
| -------------------------------------- | --------------------------------------------------------------------- |
| Facebook/Zapier (`lead-intake`)        | `zona`/`regiao` e `bairro` do payload                                 |
| Landing page                           | `regiao` (região de interesse do formulário)                          |
| Chatbot/Marquinhos (webhook por token) | **novo:** `zona` explícita ou `regiao` da qualificação IA, e `bairro` |
| Criação manual / ficha do lead         | campos zona e bairro                                                  |

O que não normaliza (ex.: "ABC Paulista", "Guarulhos") fica sem zona — o lead
segue o fluxo por origem, sem travar.

## Como o motor escolhe a roleta (ordem de precedência)

```
slug explícito (manual/exceção/repasse)
  → roleta_da_zona(zona do lead)          ← NOVO
    → mapeamento por canal/origem (landing → landing; chatbot → marquinhos; resto → plantão)
```

`roleta_da_zona` só devolve a roleta da zona se ela está **pronta**: ativa e
com pelo menos um corretor **apto agora** (presente, dentro da cota, não
pausado — a mesma régua de elegibilidade do motor). Roleta ainda não montada,
ou com o time todo ausente/estourado, nunca engole lead — a triagem segue o
fluxo por origem. As campanhas (tokens por empreendimento) também respeitam a
zona: `distribuir_lead_ponderado` delega para a roleta da zona quando ela está
pronta; a campanha fica registrada no contexto da decisão (`campanha_zona`).

> **Atenção na virada:** a cascata de zona inclui a zona do PROJETO — então
> praticamente todo lead de campanha com empreendimento vinculado tem zona. No
> instante em que a primeira roleta de zona ficar pronta, os leads de campanha
> daquela zona passam a ir para o time da zona, não mais para a equipe da
> campanha (tiers). É o modelo pedido — mas avise as equipes de campanha, que
> verão o fluxo migrar.

Dentro da roleta de zona **não** existe segundo filtro por `profiles.zonas` —
a participação já é o corte. Esse filtro por corretor continua valendo apenas
nas roletas de origem e de campanha.

Fallbacks, na ordem em que podem acontecer:

- **Lead sem zona** (não normalizou / fora do recorte) → fluxo por origem.
- **Centro** → sem roleta por decisão; segue o fluxo por origem. Para criar a
  quinta roleta depois: inserir roleta `zona-centro` + linha
  `('Centro','zona-centro')` em `zonas_roletas`.
- **Roleta da zona vazia, desativada ou sem ninguém apto agora** (ausência,
  cota, pausa) → fluxo por origem. Atender rápido vale mais que o corte; na
  manhã da virada, enquanto o time da zona não marcou "Cheguei", os leads
  continuam sendo atendidos pelo Plantão.
- **Roleta de origem desativada ou sem ninguém apto** → a triagem desvia para
  o Plantão pronto (contexto `origem_fallback`). Plantão também parado →
  fila de exceções + alerta + cron, como sempre.
- **Repasse por SLA** → o lead distribuído por roleta de zona ganha
  `roleta_slug` da zona e repassa DENTRO do time da zona (tanto o repasse
  imediato quanto os crons honram o pino). Se o time inteiro ficar inapto, o
  repasse abre exceção com alerta — decisão da gestão, não desvio silencioso.

## Runbook da virada (amanhã)

> Operar a Central exige papel **admin** (gestor e superintendente enxergam em
> modo leitura — decisão de produto antiga da página). Quem for montar os
> times amanhã precisa ser admin.

1. **Deploy**: merge desta branch → a migration cria as 4 roletas (vazias) e o
   mapeamento. Nada muda até existir corretor apto nas roletas.
2. **Montar os times**: Central de Distribuição → aba **Roletas por Zona** →
   selecionar a zona → **Incluir corretor** (repetir para as 4). A zona começa
   a rotear quando tiver o primeiro corretor **apto** (presente e dentro da
   cota) — inclusive os leads de campanha daquela zona (ver aviso acima).
3. **Presença**: as roletas de zona nascem com `exigir_presenca = true` (mesma
   regra das demais) — corretor precisa marcar "Cheguei" no dia para receber.
   Sem ninguém presente na zona, os leads seguem no fluxo por origem (não
   travam). Para desligar a exigência por zona: Configurações → Roletas —
   funcionamento.
4. **Cotas**: o limite diário (`limite_diario_default`, hoje 10) é **por
   roleta** — corretor que está na zona E nas roletas de origem/campanha soma
   as cotas e pode receber bem mais que 10/dia. Ao montar as zonas, considere
   remover o corretor das roletas de origem (a sub-linha "Também em:" da
   tabela mostra a sobreposição) ou ajustar o limite individual.
5. **Acompanhar**: aba Visão Geral (cards das 4 zonas com aptos e próximo da
   vez), aba Histórico (botão "Por quê?" mostra zona, roleta e aptos/inaptos de
   cada decisão), fila de Exceções.

Verificação rápida pós-virada (SQL no banco do CRM):

```sql
-- leads das últimas 24h por zona resolvida
SELECT public.zona_do_lead(id) AS zona, count(*)
FROM public.leads WHERE created_at > now() - interval '24 hours'
GROUP BY 1 ORDER BY 2 DESC;

-- decisões por roleta nas últimas 24h
SELECT roleta_slug, resultado, count(*)
FROM public.distribution_log WHERE created_at > now() - interval '24 hours'
GROUP BY 1, 2 ORDER BY 1;
```

## Consolidação das roletas (migration 20260816150000)

A Central caiu de 9 para 7 abas: **Visão Geral · Roletas por Zona · Roletas de
Origem · Exceções · Histórico · Configurações · Auditoria**. Plantão,
Marquinhos e Landing viraram uma aba só ("Roletas de Origem"), com seletor —
com o modelo por zona elas são o fallback de quem não tem zona, não merecem
três abas de primeira classe.

Mesclar/desativar roleta virou operação de dados, segura e reversível:

- O destino fixo da landing saiu do código: o canal da landing page resolve
  pela linha **site** do mapeamento origem → roleta (Configurações). Reapontar
  `site` move também os leads de LP.
- Roleta de origem **desativada ou sem time** não represa lead: a triagem
  desvia para o Plantão (quando pronto), com o desvio auditável no contexto
  (`origem_fallback`). Antes, desativar a Marquinhos mandava todo lead de
  chatbot sem zona para a fila de exceções.

Recomendação de estado-alvo, quando a operação por zona estiver rodando bem:

| Roleta        | Veredito                    | Como                                                                                                                                                           |
| ------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 zonas       | **Principal**               | Times definidos pela gestão                                                                                                                                    |
| Plantão       | **Manter** — é o catch-all  | Nada a fazer                                                                                                                                                   |
| Marquinhos    | Mesclar no Plantão          | Configurações: `chatbot` → Plantão; desativar a roleta                                                                                                         |
| Landing       | Mesclar no Plantão          | Configurações: `site` → Plantão; desativar a roleta                                                                                                            |
| Campanhas (7) | Desativar conforme encerram | Painel Campanhas: switch Ativa; o token desativado continua aceitando lead — ele só deixa de usar a equipe da campanha e cai na triagem normal (zona primeiro) |

Tudo pela UI, sem migration, e reversível (reativar a roleta e reapontar a
origem desfaz a mesclagem).

### Campanhas de equipe fixa (migration 20260819100000)

Exceção deliberada ao zona-primeiro: campanha marcada como **equipe fixa** no
painel de Campanhas não delega para as roletas de zona nem filtra por
`profiles.zonas` — o lead cai SEMPRE no time da campanha (rodízio ponderado
por tier), seja qual for a zona. Uso: contas de anúncio próprias por equipe
(`equipe-guilherme` e `equipe-bruno`, semeadas com token próprio). O painel
ganhou o botão "Nova campanha" e o switch "Equipe fixa" por campanha; o
repasse por SLA já ficava dentro da equipe da campanha e segue igual.

## O que fica como está (de propósito)

- **n8n/Marquinhos**: nenhuma mudança necessária. O handoff continua batendo no
  mesmo token de sempre; o campo `regiao` que a qualificação já envia passa a
  virar a zona do lead no CRM. As rotas por empreendimento (`rotas_intake` /
  Data Table de roletas) continuam funcionando — a zona vence quando resolve.
- **Roletas de origem** (Plantão, Marquinhos, Landing): viram o fallback de
  quem não tem zona. O Plantão é a rede de segurança — manter sempre;
  Marquinhos e Landing podem ser mescladas nele quando a gestão quiser (ver a
  tabela de consolidação acima).
- **Roletas de campanha**: seguem aceitando leads pelos tokens; a delegação por
  zona acontece no motor. Se quiser aposentá-las depois, é `ativo = false` no
  painel de Campanhas (sem pressa e sem apagar nada).
- **Tokens por zona**: cada roleta de zona tem `webhook_token` próprio — dá
  para apontar uma campanha do Meta direto para uma zona no futuro
  (`/api/public/webhooks/lead/<token>`), sem passar pelo matching por
  empreendimento.

## Limitações conhecidas

- `zonas_bairros` cobre a capital; Grande SP (Guarulhos, Osasco, ABC) não tem
  zona — esses leads seguem o fluxo por origem. Se a operação quiser, dá para
  mapear cidades da Grande SP para uma zona na própria tabela.
- `profiles.zonas` (aptidão por corretor, modelo de 13/08) continua existindo
  e só atua fora das roletas de zona. Com o modelo novo, o normal é deixá-lo
  vazio e gerir tudo pela participação nas roletas.
