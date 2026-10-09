# Presença por filial — check-in e a regra do plantão

Pedido do dono (09/10/2026): _"Hoje temos 3 filiais: Barra Funda, Liberdade e
Belém. Preciso de um hub em que os corretores marquem em que loja estão logando
e marcando presença no dia para que estejam aptos para algumas roletas de
leads. Corretores com menos de 3 vendas no mês não podem pegar lead em casa,
apenas com presença no plantão."_

Migration: `supabase/migrations/20261013120000_presenca_por_filial.sql`
(espelho `drizzle/migrations/0074_presenca_por_filial.sql`). Testes:
`tests/db/presenca-filial.test.ts` (regra no banco) e
`tests/presenca-derive.test.ts` (tela).

## 1. Como era e por que não servia

| Antes                                                                                                                      | Efeito                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Todo login marcava presença sozinho (`auth-guard.ts`, "auto check-in", a cada hora)                                        | Quem abria o CRM de casa, do celular, às 22h, entrava na roleta            |
| A presença não dizia ONDE o corretor estava                                                                                | Impossível separar plantão de casa — e impossível montar roleta por filial |
| O corretor podia ligar `profiles.presente` com um UPDATE direto no próprio perfil (a trava de campos sensíveis não cobria) | Qualquer regra de presença seria contornável pelo DevTools                 |

Em 09/10 às ~18h, 24 corretores estavam "presentes" — todos pelo auto check-in.

## 2. A regra

O corretor faz o check-in em **/presenca** escolhendo **Barra Funda**,
**Liberdade**, **Belém** ou **Em casa**:

| Check-in                                    | Entra na roleta?                        |
| ------------------------------------------- | --------------------------------------- |
| Numa filial (plantão)                       | Sim                                     |
| Em casa, com **3+ vendas** aprovadas no mês | Sim                                     |
| Em casa, com **menos de 3** vendas no mês   | **Não** (fica registrado, com o motivo) |
| Sem check-in                                | Não                                     |

**"Vendas no mês"** = vendas com `status_venda = 'aprovada'`, sem distrato, com
`data_assinatura` no mês corrente (BRT). É o mesmo critério do tier de comissão
(`corretor_vendas_trimestre`), só que no mês — o número que o corretor vê no
card é o mesmo que a comissão usa. Venda **pendente** não conta (senão bastaria
lançar uma venda para trabalhar de casa).

Exemplos (outubro):

- **Ana**, 0 vendas, check-in "Em casa" às 9h → registrado, fora da roleta. O
  card diz: _"Em casa, a roleta só libera com 3 vendas aprovadas em outubro —
  você tem 0. Para receber leads hoje, faça o check-in numa filial."_ Às 10h ela
  chega na Barra Funda, faz o check-in lá → entra na roleta.
- **Beto**, 3 vendas aprovadas, check-in "Em casa" → na roleta.
- **Caio**, 2 aprovadas + 1 pendente + 1 com distrato + 1 de setembro → conta
  **2**. Em casa, fora da roleta. Quando a gestão aprovar a 3ª venda, ele
  clica "Em casa" de novo e entra.

### Onde a regra mora

Todos os motores (roleta v3/`_elegibilidade_roleta`, campanha ponderada,
repasse por SLA, SDR, Escoar estoque) já liam a mesma chave:
`profiles.presente`. **Nenhum motor mudou.** A regra entra no único lugar que
liga essa chave — o check-in (`presenca_checkin`). Check-in em casa abaixo do
mínimo grava a linha com `apto_roleta = false` e deixa `presente = false`.

### Sem burla

- `presente`/`presente_em` só mudam pelas RPCs de presença
  (`protect_profile_sensitive_fields`, item 4): UPDATE direto é ignorado.
- `marcar_presenca(true)` (o que o auto check-in chamava) **não marca mais
  presença sem check-in** — responde _"Faça o check-in: escolha a filial…"_.
  Isso fecha a porta das abas antigas abertas no dia do deploy. Com check-in em
  casa aberto, ele reavalia (o corretor bateu a 3ª venda → entra).
- `marcar_presenca(false)` continua sendo o "Sair".

## 3. Localização (opcional, por filial)

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

Para isso funcionar, cadastre as coordenadas: /presenca → Filiais (admin e
gestor). No Google Maps, botão direito na porta da loja → clique nos números →
cole no campo. Raio padrão: 300 m.

**Recomendação:** rode 1–2 semanas só informando, olhe no quadro quantos
check-ins legítimos aparecem como "fora do raio" (computador de mesa na loja,
sem Wi-Fi, costuma ter localização ruim) e só então ligue a exigência.

## 4. O que a gestão vê e faz

- **/presenca → Presença de hoje** (admin, gestor, superintendente): uma
  coluna por filial, Em casa, Liberados pela gestão e Sem check-in; contadores
  de "na roleta", "no plantão", "em casa fora da roleta" e "sem check-in";
  vendas do mês e evidência de localização de cada um.
- **Confirmar no plantão** (admin e gestor, menu ⋮ do corretor): faz o
  check-in por ele numa filial — para quem está na loja sem celular.
- **Interruptor de presença da Central** (aba Corretores/Filas): continua
  furando a regra de propósito (é decisão da gestão), mas agora fica registrado
  como **"Liberado pela gestão"**, com quem liberou.

## 5. Configurações (Central de Distribuição → Configurações, admin)

| Chave                             | Padrão  | Efeito                                                                               |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `presenca_casa_min_vendas_mes`    | `3`     | Mínimo de vendas no mês para o check-in em casa liberar. `0` = em casa sempre libera |
| `presenca_loja_exige_localizacao` | `false` | Check-in na filial só libera dentro do raio                                          |

**Rollback da regra, sem deploy:**

```sql
UPDATE public.distribuicao_settings SET valor = '0' WHERE chave = 'presenca_casa_min_vendas_mes';
```

O check-in continua (e continua dizendo onde cada um está); só a trava das
vendas sai.

## 6. Antes de ligar em produção (checklist)

1. **Vendas de outubro no CRM.** Em 09/10 o CRM tinha **0 vendas aprovadas no
   mês**. Se houve venda que não foi lançada/aprovada, o corretor que vendeu vai
   ficar preso ao plantão por erro de cadastro. Aprovar as vendas pendentes
   antes do deploy.
2. **Comunicado ao time** (rascunho): _"A partir de [data], a presença no CRM
   passa a ser por check-in: ao abrir o CRM, escolha a filial em que você está
   (Barra Funda, Liberdade ou Belém) ou Em casa. Quem tem 3 ou mais vendas
   aprovadas no mês recebe leads de casa; abaixo disso, só no plantão. O CRM
   mostra quantas vendas você tem e quantas faltam."_
3. **Primeiro dia do mês:** a contagem zera. No dia 1º, todo mundo começa com 0
   vendas — ninguém recebe lead de casa até aprovar a 3ª venda do mês. É a
   regra como pedida ("no mês"); se a intenção for "no mês anterior" ou "nos
   últimos 30 dias", é uma troca de uma linha em `_corretor_vendas_mes`.
4. **Deploy:** o Lovable aplica `drizzle/migrations` ao chegar no `main`
   (`0074`, `when` maior que o da `0073`). Depois do merge, conferir:

```sql
SELECT count(*) AS filiais FROM public.filiais;                         -- 3
SELECT chave, valor FROM public.distribuicao_settings
 WHERE chave LIKE 'presenca_%';                                          -- 3 / false
SELECT has_function_privilege('anon', 'public.marcar_presenca(boolean)', 'EXECUTE');  -- false
```

## 7. Conferências do dia a dia

```sql
-- Quem está onde hoje, e se está na roleta.
SELECT p.nome, c.modo, f.nome AS filial, c.apto_roleta, c.motivo,
       c.vendas_mes, c.localizacao, c.distancia_m,
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
```

## 8. Limites conhecidos (de propósito)

- A regra é avaliada **no check-in**. Distrato no meio do dia não tira da
  roleta até o próximo check-in (no máximo até o auto-checkout das 23h).
- Venda aprovada no meio do dia: o corretor em casa clica "Em casa" de novo
  para entrar (`marcar_presenca(true)` também reavalia, mas a tela nova não o
  chama sozinha).
- A localização do navegador pode ser falsificada por quem souber usar o
  DevTools. A conferência eleva muito o custo de mentir sem pôr nada no
  caminho de quem está de fato na loja; o registro (com distância e hora) fica
  para auditoria.

## 9. Próximo passo: roletas por filial (a definir com o dono)

O check-in já grava a filial — a base para roletas como "Plantão Barra Funda"
(só quem fez check-in lá recebe). Decisões pendentes antes de codar:

1. Quais roletas passam a olhar a filial? (ex.: lead de stand/placa da região da
   Barra Funda → só quem está na Barra Funda)
2. A roleta de filial convive com a zona estrita (região do corretor) ou a
   substitui naquela fila?
3. Se ninguém estiver na filial, o lead espera (como a zona estrita) ou cai na
   roleta geral?
4. Corretor com 3+ vendas em casa entra nas roletas de filial ou só nas gerais?
