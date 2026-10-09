# Presença por filial — check-in e a regra do plantão

Pedido do dono (09/10/2026): _"Hoje temos 3 filiais: Barra Funda, Liberdade e
Belém. Preciso de um hub em que os corretores marquem em que loja estão logando
e marcando presença no dia para que estejam aptos para algumas roletas de
leads. Corretores com menos de 3 vendas no mês não podem pegar lead em casa,
apenas com presença no plantão."_

Decisões do dono na revisão (09/10/2026, noite):

1. As filas continuam as de hoje (zona, campanha, Marquinhos…): quem está
   cadastrado na fila recebe depois de registrar presença em **qualquer**
   filial. Não há roleta por filial.
2. O corretor precisa estar presente para receber leads de **todas** as filas
   em que está apto.
3. (Respondida no contexto de roleta por filial, que não existe — ver §9.)
4. Com a meta batida, em casa ele entra em todas as filas em que está apto.
5. A meta conta as vendas do **mês anterior**.

Migration: `supabase/migrations/20261013120000_presenca_por_filial.sql`
(espelho `drizzle/migrations/0074_presenca_por_filial.sql`). Testes:
`tests/db/presenca-filial.test.ts` (regra no banco) e
`tests/presenca-derive.test.ts` (tela).

## 1. Como era e por que não servia

| Antes                                                                                                                      | Efeito                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Todo login marcava presença sozinho (`auth-guard.ts`, "auto check-in", a cada hora)                                        | Quem abria o CRM de casa, do celular, às 22h, entrava na roleta   |
| A presença não dizia ONDE o corretor estava                                                                                | Impossível separar plantão de casa                                |
| O corretor podia ligar `profiles.presente` com um UPDATE direto no próprio perfil (a trava de campos sensíveis não cobria) | Qualquer regra de presença seria contornável pelo DevTools        |
| Cada fila tinha um interruptor "Exigir presença"                                                                           | Bastava desligar numa fila para a regra do plantão não valer nela |

Em 09/10 às ~18h, 24 corretores estavam "presentes" — todos pelo auto check-in.

## 2. A regra

O corretor faz o check-in em **/presenca** escolhendo **Barra Funda**,
**Liberdade**, **Belém** ou **Em casa**:

| Check-in                                             | Recebe das filas em que está?           |
| ---------------------------------------------------- | --------------------------------------- |
| Numa filial (plantão) — qualquer uma das três        | Sim                                     |
| Em casa, com **3+ vendas** aprovadas no mês anterior | Sim                                     |
| Em casa, com **menos de 3** vendas no mês anterior   | **Não** (fica registrado, com o motivo) |
| Sem check-in                                         | Não                                     |

**"Vendas no mês anterior"** = vendas com `status_venda = 'aprovada'`, sem
distrato, com `data_assinatura` no mês-calendário anterior (BRT). Em outubro,
valem as assinadas em setembro. É o mesmo critério do tier de comissão
(`corretor_vendas_trimestre`), só que no mês. Venda **pendente** não conta
(senão bastaria lançar uma venda para trabalhar de casa).

Por que mês anterior é melhor do que o mês corrente: a meta fica **fixa o mês
inteiro** — não zera no dia 1º (com o mês corrente, todo mundo começaria o mês
preso ao plantão) e o corretor sabe no dia 1º se vai poder trabalhar de casa
até o dia 30. Ela só muda se a gestão aprovar ou distratar uma venda do mês
anterior.

Exemplos (em outubro):

- **Ana**, 0 vendas em setembro, check-in "Em casa" às 9h → registrado, fora
  das filas. O card diz: _"Em casa, a roleta só libera com 3 vendas aprovadas
  em setembro — você teve 0. Para receber leads hoje, faça o check-in numa
  filial."_ Às 10h ela chega na Barra Funda, faz o check-in lá → recebe da Zona
  Oeste, da campanha em que está e do Marquinhos (as filas em que já estava).
- **Beto**, 3 vendas aprovadas em setembro, check-in "Em casa" → recebe de
  todas as filas em que está, o mês de outubro inteiro.
- **Caio**, em setembro: 2 aprovadas + 1 pendente + 1 com distrato; em
  outubro: 1 aprovada → conta **2** (a de outubro só vale em novembro). Em
  casa, fora das filas. Se a gestão aprovar a venda pendente de setembro, ele
  clica "Em casa" de novo e entra.

### Onde a regra mora

Os motores (roleta v3/`_elegibilidade_roleta`, campanha ponderada, repasse por
SLA, Escoar estoque) já liam a mesma chave: `profiles.presente`. **Nenhum
motor mudou.** A regra entra no único lugar que liga essa chave — o check-in
(`presenca_checkin`). Check-in em casa abaixo do mínimo grava a linha com
`apto_roleta = false` e deixa `presente = false`.

### Presença obrigatória em toda fila

Os motores só olham a presença em fila com `roletas.exigir_presenca`. A
migration liga essa chave em todas as filas e o gatilho
`trg_roletas_presenca_obrigatoria` religa em qualquer fila criada ou editada
depois (Central, `criar_roleta_campanha`, SQL avulso). Na Central, o
interruptor "Exigir presença" aparece travado.

**Exceção pendente: Agendados do SDR.** A elegibilidade dessa fila
(`_elegibilidade_roleta_sdr`) nunca leu a presença: a política do SDR
(04/09, `docs/politica-sdr-v1.md` item 7) entrega a visita marcada pelo SDR por
**agenda livre no horário**, "sem presença do dia". Mudar isso é decisão
própria do dono — ver §9.

### Sem burla

- `presente`/`presente_em` só mudam pelas RPCs de presença
  (`protect_profile_sensitive_fields`, item 4): UPDATE direto é ignorado.
- `marcar_presenca(true)` (o que o auto check-in chamava) **não marca mais
  presença sem check-in** — responde _"Faça o check-in: escolha a filial…"_.
  Isso fecha a porta das abas antigas abertas no dia do deploy. Com check-in em
  casa aberto, ele reavalia (a gestão aprovou uma venda do mês anterior →
  entra).
- `marcar_presenca(false)` continua sendo o "Sair".

## 3. Filiais e localização

A migration cria as três filiais com os endereços passados pelo dono:

| Filial      | Endereço                                                                  |
| ----------- | ------------------------------------------------------------------------- |
| Barra Funda | Av. Marquês de São Vicente, 1619 - Barra Funda, São Paulo - SP, 01139-003 |
| Liberdade   | Av. da Liberdade, 1000 - Liberdade, São Paulo - SP, 01502-001             |
| Belém       | Av. Álvaro Ramos, 896 - Quarta Parada, São Paulo - SP, 03330-002          |

**As coordenadas NÃO vêm na migration.** O ambiente onde ela foi escrita não
alcançava nenhum geocodificador (OpenStreetMap, Google, ArcGIS, ViaCEP), e os
sites de CEP só dão o centro do trecho do CEP — o 01502-001 cobre a Av. da
Liberdade "do 370 ao fim, lado par". Com raio de 300 m, um ponto chutado faria
check-in legítimo aparecer "fora do raio". Para preencher (admin ou gestor):
**/presenca → Filiais → "Buscar pelo endereço"** (consulta o OpenStreetMap no
navegador, o mesmo do Mapa de Lojas) → **"Ver no mapa"** para conferir →
**Salvar**. Se a busca achar só a avenida (não o número), a tela avisa; nesse
caso, no Google Maps, botão direito na porta da loja → clique nos números →
cole no campo.

No check-in **na filial**, o celular informa a localização **só naquele
momento**; o banco calcula a **distância até a loja** e descarta a coordenada
(a tabela não tem latitude/longitude do corretor). **Em casa, a localização
nunca é pedida.**

| `localizacao`            | Quando                                                          |
| ------------------------ | --------------------------------------------------------------- |
| `confirmada`             | dentro do raio (+ até 150 m de tolerância pela precisão do GPS) |
| `fora_do_raio`           | longe da loja                                                   |
| `sem_localizacao`        | o corretor negou, o aparelho não tem GPS ou demorou 10 s        |
| `filial_sem_coordenadas` | a filial ainda não tem coordenadas cadastradas                  |
| `confirmada_gestao`      | a gestão fez o check-in pelo corretor                           |

Por padrão a localização **só informa** (a gestão vê no quadro: "Na filial (80
m)", "A 4,2 km da filial"). Para **exigir**: Central de Distribuição →
Configurações → _"Check-in na filial exige a localização do celular"_. Ligado,
fora do raio ou sem localização o check-in fica registrado mas não libera.

**Recomendação:** depois de cadastrar as coordenadas, rode 1–2 semanas só
informando, olhe no quadro quantos check-ins legítimos aparecem como "fora do
raio" (computador de mesa na loja, sem Wi-Fi, costuma ter localização ruim) e
só então ligue a exigência.

## 4. O que a gestão vê e faz

- **/presenca → Presença de hoje** (admin, gestor, superintendente): uma
  coluna por filial, Em casa, Liberados pela gestão e Sem check-in; contadores
  de "na roleta", "no plantão", "em casa fora da roleta" e "sem check-in";
  vendas do mês anterior e evidência de localização de cada um.
- **Confirmar no plantão** (admin e gestor, menu ⋮ do corretor): faz o
  check-in por ele numa filial — para quem está na loja sem celular.
- **Interruptor de presença da Central** (aba Corretores/Filas): continua
  furando a regra de propósito (é decisão da gestão), mas agora fica registrado
  como **"Liberado pela gestão"**, com quem liberou.

## 5. Configurações (Central de Distribuição → Configurações, admin)

| Chave                                   | Padrão  | Efeito                                                                                        |
| --------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `presenca_casa_min_vendas_mes_anterior` | `3`     | Mínimo de vendas no mês anterior para o check-in em casa liberar. `0` = em casa sempre libera |
| `presenca_loja_exige_localizacao`       | `false` | Check-in na filial só libera dentro do raio                                                   |

**Rollback da regra, sem deploy:**

```sql
UPDATE public.distribuicao_settings SET valor = '0'
 WHERE chave = 'presenca_casa_min_vendas_mes_anterior';
```

O check-in continua (e continua dizendo onde cada um está); só a trava das
vendas sai. A presença obrigatória nas filas não tem chave: é a decisão 2.

## 6. Antes de ligar em produção (checklist)

1. **Vendas de setembro no CRM.** Em outubro, a regra lê as vendas de
   **setembro** aprovadas no CRM. Venda feita e não lançada/aprovada deixa o
   corretor que vendeu preso ao plantão por erro de cadastro. Conferir no
   próprio CRM (Assinaturas & Comissões) quem tem 3+ aprovadas em setembro e
   aprovar as pendentes antes do deploy. **Não confiar no conector MCP do CRM
   para isso**: em 09/10 ele respondeu 0 vendas, 0 agendamentos e 0 tarefas
   concluídas para julho, agosto, setembro e outubro inteiros — não enxerga
   essas tabelas.
2. **Comunicado ao time** (rascunho): _"A partir de [data], a presença no CRM
   passa a ser por check-in: ao abrir o CRM, escolha a filial em que você está
   (Barra Funda, Liberdade ou Belém) ou Em casa. Sem check-in, você não recebe
   lead de nenhuma fila. Quem teve 3 ou mais vendas aprovadas no mês anterior
   recebe leads de casa o mês inteiro; abaixo disso, só no plantão. O CRM
   mostra quantas vendas você teve."_
3. **Coordenadas das filiais** (§3): um clique por filial em /presenca.
4. **Deploy:** o Lovable aplica `drizzle/migrations` ao chegar no `main`
   (`0074`, `when` maior que o da `0073`). Depois do merge, conferir:

```sql
SELECT slug, endereco FROM public.filiais ORDER BY ordem;               -- 3, com endereço
SELECT chave, valor FROM public.distribuicao_settings
 WHERE chave LIKE 'presenca_%';                                          -- 3 / false
SELECT slug FROM public.roletas
 WHERE tipo IS DISTINCT FROM 'sdr' AND NOT exigir_presenca;              -- nenhuma
SELECT has_function_privilege('anon', 'public.marcar_presenca(boolean)', 'EXECUTE');  -- false
```

## 7. Conferências do dia a dia

```sql
-- Quem está onde hoje, e se está nas filas.
SELECT p.nome, c.modo, f.nome AS filial, c.apto_roleta, c.motivo,
       c.vendas_mes_anterior, c.localizacao, c.distancia_m,
       to_char(c.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS hora
  FROM public.presenca_checkins c
  JOIN public.profiles p ON p.id = c.corretor_id
  LEFT JOIN public.filiais f ON f.id = c.filial_id
 WHERE c.dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND c.encerrado_em IS NULL
 ORDER BY f.nome NULLS LAST, p.nome;

-- Frequência no plantão por filial no mês (dias com check-in na loja).
SELECT f.nome AS filial, p.nome, count(DISTINCT c.dia) AS dias_no_plantao
  FROM public.presenca_checkins c
  JOIN public.filiais f ON f.id = c.filial_id
  JOIN public.profiles p ON p.id = c.corretor_id
 WHERE c.modo = 'loja'
   AND c.dia >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
 GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- Quem pode trabalhar de casa este mês (3+ vendas aprovadas no mês anterior).
SELECT p.nome, public._corretor_vendas_mes_anterior(p.id) AS vendas_mes_anterior
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'
 WHERE p.ativo
 ORDER BY 2 DESC, 1;
```

## 8. Limites conhecidos (de propósito)

- A regra é avaliada **no check-in**. Distrato de uma venda do mês anterior no
  meio do dia não tira das filas até o próximo check-in (no máximo até o
  auto-checkout das 23h).
- Venda do mês anterior aprovada no meio do dia: o corretor em casa clica "Em
  casa" de novo para entrar (`marcar_presenca(true)` também reavalia, mas a
  tela nova não o chama sozinha).
- A localização do navegador pode ser falsificada por quem souber usar o
  DevTools. A conferência eleva muito o custo de mentir sem pôr nada no
  caminho de quem está de fato na loja; o registro (com distância e hora) fica
  para auditoria.

## 9. Pendências com o dono

1. **Fila Agendados do SDR** — exigir presença também? Hoje (política de
   04/09) ela entrega a visita marcada pelo SDR a quem tem agenda livre no
   horário, sem olhar presença: o SDR marca às 19h uma visita para amanhã e o
   corretor recebe na hora. Exigindo presença, só quem está com check-in aberto
   naquele momento entra no sorteio.
2. **Lead que o corretor PUXA** (Bolsão, lote de prospecção, Discador) não é
   fila: o corretor pede. Hoje funciona sem check-in. Se "não pegar lead em
   casa" vale também para isso, é outra mudança.
3. **Resposta 3 ("cai na geral")** foi dada para "se ninguém estiver na
   filial". Como não há roleta por filial, não muda nada. Se a intenção for
   "se ninguém da ZONA estiver presente, o lead vai para a geral", isso desfaz
   a zona estrita de 03/10 (hoje o lead espera alguém da zona chegar) — pedir
   confirmação explícita antes.
