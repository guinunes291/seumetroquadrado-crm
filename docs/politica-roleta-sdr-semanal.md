# Roleta "Agendados do SDR": permanência semanal por produção

Aprovada em 05/10/2026 pelo Guilherme (admin SMQ). Implementada nas migrations
`20261011120000_roleta_sdr_permanencia_semanal.sql` (espelho drizzle
`0065_roleta_sdr_permanencia_semanal`) e
`20261011120100_roleta_sdr_peso_rodizio.sql` (espelho `0066_roleta_sdr_peso_rodizio`,
peso no rodízio e exceção por venda sem teto, decidido no mesmo dia) e
`20261011120400_roleta_sdr_aviso_no_crm.sql` (espelho `0069_roleta_sdr_aviso_no_crm`,
aviso de quarta como pop-up dentro do CRM), atrás da chave
`roleta_sdr_regra_ativa` (nasce desligada).

Até aqui o time da roleta `agendados-sdr` era montado à mão pelo admin. Agora a
composição é **semanal e por produção**: quem converteu na semana recebe
agendados do SDR na semana seguinte; quem não converteu fica pausado. A mesma
régua vale para entrar e para sair.

## 1. A regra em 1 página

1. **Semana de apuração:** sábado 00:00 → sexta 23:59, relógio de São Paulo.
   É a mesma semana da folha do SDR (`src/features/dashboard/semana-sdr.ts`;
   no banco, `_roleta_sdr_semana_de`). Visita na sexta 23:30 conta na semana;
   no sábado 00:10, conta na seguinte.
2. **Universo:** todo usuário com papel `corretor` e perfil ativo, **esteja ou
   não na roleta hoje**. Quem não participa e bate a meta entra.
3. **Bloqueio manual vale mais que a regra:** quem foi **removido** da roleta
   por uma pessoa (`ativo = false` e a última remoção no
   `roleta_participantes_log` com `feito_por` preenchido) nunca é reincluído.
   Para devolver essa pessoa à regra, o admin a inclui de novo na fila.
4. **O que conta** (toda a produção do corretor, qualquer origem de lead):

   | Métrica                   | Fonte                                                                                                        | Data que vale                                 | Deduplicação                                                                                                       |
   | ------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
   | Visita realizada          | `agendamentos` tipo `visita`, `status = 'realizado'`, `NOT auto_gerado`, `deleted_at IS NULL`, `corretor_id` | `data_inicio` (dia da visita, régua da folha) | 1 por lead por semana                                                                                              |
   | Pasta                     | `lead_status_transitions` com `para_status = 'analise_credito'`, `corretor_id`                               | `created_at` da transição                     | 1 por lead a cada 30 dias: não conta se o lead já entrou em análise nos 30 dias anteriores (por qualquer corretor) |
   | Venda (só para a exceção) | `vendas` com `status_venda IN ('pendente','aprovada')`, `NOT distrato`                                       | `data_assinatura`                             | por venda                                                                                                          |

   Visita agendada, no-show e visita "sem desfecho" **não contam**. Visita sem
   lead também não (não dá para deduplicar e não é atendimento de cliente).

5. **Pontuação:** visita = **1**, pasta = **1,5**, meta = **3 pontos** na
   semana. Equivale a "3 visitas OU 2 pastas" e aprova combinações:
   2 visitas + 1 pasta = 3,5 (passa); 1 visita + 1 pasta = 2,5 (não passa);
   0 visita + 2 pastas = 3 (passa).
6. **Cascata** para a semana seguinte:
   1. **Meta batida** (≥ 3 pts): todos entram, sem teto.
   2. **Exceção por venda**, também **sem teto**: todo mundo com venda
      assinada **até 15 dias antes da sexta do fechamento** (há 15 dias entra;
      há 16, não) entra, mesmo passando do mínimo de 3, mas com **peso menor**
      no rodízio (item 6a).
   3. **Complemento**, só se ainda faltar gente para o **mínimo de 3 aptos**:
      quem tem mais pontos na semana (pontos > 0), em ordem decrescente, com
      peso menor. Empate final por nome, para a apuração ser determinística.
   4. **Ninguém qualificado:** a roleta fica vazia e os admins recebem no sino
      "Roleta do SDR sem aptos nesta semana: entregas pela entrega manual do
      admin". `agendar_visita_sdr` continua levantando "nenhum corretor apto".

   Quem entra pelas faixas 2 ou 3 fica marcado como **apto por exceção**
   (`apto_venda` / `apto_complemento`) na apuração.

6a. **Peso no rodízio** (vale com a regra ligada e fora da sombra):

| Quem                                       | Peso padrão | Na prática                                  |
| ------------------------------------------ | ----------- | ------------------------------------------- |
| Bateu a meta                               | 2           | Peso cheio                                  |
| Sem a meta, com **2 ou mais vendas**       | 2           | Peso cheio                                  |
| Sem a meta, com **1 venda**                | 1           | 1 agendado para cada 2 de quem bateu a meta |
| Complemento (sem meta e sem venda)         | 1           | Idem                                        |
| Incluído à mão pela Central (sem apuração) | 2           | Peso cheio                                  |

O rodízio ponderado é o mesmo das campanhas (`wrr_current`): cada apto
soma o próprio peso, recebe quem tem o maior saldo, e o vencedor devolve a
soma dos pesos. Conflito de agenda, zona e "quem já tentou o lead"
continuam valendo. O peso vem da última semana **aplicada** em
`roleta_sdr_apuracoes`, e o saldo zera a cada apuração aplicada. Em sombra
ou com a regra desligada, a roleta segue "quem está há mais tempo sem
receber".

7. **Efeito na roleta** (sábado 08:00 BRT, sobre a semana que fechou na véspera):
   - **Apto:** linha em `roleta_participantes` com `ativo = true` e sem pausa
     (INSERT se ainda não participa). Loga `incluido` ou `reativado`.
   - **Não apto:** `pausado_ate` = **sábado seguinte 09:00 BRT** (1h depois da
     próxima apuração, para a pausa nunca expirar antes de a régua rodar de
     novo) e `motivo_pausa` =
     `Regra semanal: 2,5 pts (1 visita, 1 pasta) na semana 03/10 a 09/10. Meta 3 pts.`
     Loga `pausado`. Quem não bate e já está fora da roleta continua fora.
   - **Pausa de outra origem em vigor** (admin, gestor, SLA do quente): a regra
     não a encurta nem a apaga. Apto com pausa manual segue pausado até ela
     vencer; não apto com pausa manual mais longa fica com a manual.
   - **A pausa não mexe em nada que já está com o corretor:** visitas
     marcadas, leads e tarefas continuam no nome dele. A devolução ao SDR
     (no-show, 7 dias sem registro) segue como está.
   - Todo log da regra tem `feito_por = NULL` e motivo começando por
     `"Regra semanal"`. É assim que se separa ação automática de ação manual.
   - **Idempotente:** rodar duas vezes a mesma semana regrava as mesmas
     linhas, e o efeito vira no-op (só loga quando o estado muda de fato).
   - **Só a última semana fechada mexe na roleta.** Semana mais antiga é
     recálculo histórico (sempre em sombra) e é recusada se já teve efeito;
     senão o recálculo desfaria a decisão de uma semana posterior.

8. **Aviso de meio de semana** (quarta 18:00 BRT), para quem ainda não bateu
   os 3 pontos na semana em curso (removidos pelo admin ficam de fora):
   - **Sino** (`public.alertas`, link `/fila#aviso-roleta-sdr`), dedup por
     `ref_id = md5('roleta-sdr-aviso:' || corretor || ':' || semana)`, mesmo
     padrão de `metas_dia_alerta_checkpoint`.
   - Texto com o placar e o que falta pelos dois caminhos (o mais curto de
     cada lado até ≥ 3):

     > Sua semana na roleta do SDR: 1 visita realizada e 1 pasta (2,5 pts).
     > Para continuar recebendo agendados a partir de sábado, falta 1 visita ou
     > 1 pasta até sexta.

     O verbo acompanha a situação de hoje: "continuar recebendo" (na roleta e
     sem pausa), "voltar a receber" (pausado) ou "entrar na roleta e receber"
     (fora dela).

   - **Pop-up no CRM com o card do placar** (decisão de 05/10/2026: o aviso
     fica **só no CRM**, sem WhatsApp). É o mesmo alerta do sino, apresentado
     como um card: "Olá, Ana!", pontos da semana e a barra até a meta,
     visitas e pastas com quanto cada uma vale, o que falta até sexta, a
     situação de hoje na roleta e o selo "Teste" em sombra.
     - Quem abre o CRM depois das 18h de quarta com o alerta **não lido** vê
       o pop-up na hora — depois do pop-up de metas do dia, do onboarding e
       do estudo do funil, nunca por cima deles, e nunca no Modo Visita.
     - Se o alerta chega com o CRM **aberto**, sai um toast "Ver placar" em
       vez do pop-up, para não tomar a tela de quem está atendendo; o pop-up
       abre na próxima vez que o CRM carregar, se o alerta seguir não lido.
     - **"Entendi"** (ou fechar) marca o alerta como lido: some do contador
       do sino também. O link do sino reabre o pop-up a qualquer hora.
     - O card lê o placar **ao vivo**: quem fez visita na quinta abre o
       pop-up com o número novo; quem bateu a meta depois do aviso vê "Meta
       da semana batida".
9. **Modo sombra:** a apuração calcula e grava tudo (`sombra = true`), mas não
   pausa nem inclui ninguém; o aviso de quarta e o alerta de "sem aptos" saem
   com o prefixo **"[Teste]"**.

## 2. Chaves (`distribuicao_settings`)

Todas editáveis na Central de Distribuição → Política, card "Roleta do SDR —
permanência semanal por produção". Sair do modo sombra pede confirmação.

| Chave                              | Default | O que faz                                                             |
| ---------------------------------- | ------- | --------------------------------------------------------------------- |
| `roleta_sdr_regra_ativa`           | `false` | Liga a apuração e o aviso. Desligada, as duas funções não fazem nada. |
| `roleta_sdr_modo_sombra`           | `true`  | Calcula e grava sem mexer na roleta; aviso com "[Teste]".             |
| `roleta_sdr_peso_visita`           | `1`     | Pontos por visita realizada.                                          |
| `roleta_sdr_peso_pasta`            | `1.5`   | Pontos por pasta.                                                     |
| `roleta_sdr_meta_pontos`           | `3`     | Meta da semana.                                                       |
| `roleta_sdr_minimo_aptos`          | `3`     | Mínimo de aptos antes das exceções.                                   |
| `roleta_sdr_venda_janela_dias`     | `15`    | Janela da exceção por venda, contada da sexta do fechamento.          |
| `roleta_sdr_peso_rodizio_meta`     | `2`     | Peso no rodízio de quem bateu a meta (ou tem vendas para peso cheio). |
| `roleta_sdr_peso_rodizio_reduzido` | `1`     | Peso de quem entrou com 1 venda ou pelo complemento.                  |
| `roleta_sdr_vendas_peso_cheio`     | `2`     | Vendas na janela que dão peso cheio sem a meta (0 = nunca).           |

Valor fora do tipo (ex.: `"1,5"` gravado como texto) cai no padrão em vez de
derrubar o cron de sábado.

## 3. Funções e crons

| Função                                               | Quem chama                                                              | O que faz                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `roleta_sdr_config()`                                | telas (qualquer usuário logado)                                         | A régua em um jsonb (não é sensível: o corretor precisa dela para saber quanto falta).                  |
| `roleta_sdr_placar(semana)`                          | apuração, aviso, telas                                                  | Contagem por corretor. Admin (ou o cron) vê todos; qualquer outro recebe só a própria linha.            |
| `roleta_sdr_previa(semana)`                          | admin (SQL / simulação), apuração                                       | A cascata da semana **sem gravar nada**, com a regra ligada ou não, e o peso de cada apto. Só admin.    |
| `_roleta_sdr_escolher_ponderado(roleta, candidatos)` | `_distribuir_lead_sdr` (regra valendo)                                  | Rodízio ponderado entre os aptos da roleta de agendados. Fechada para a API.                            |
| `_roleta_sdr_peso_atual(corretor)`                   | rodízio ponderado                                                       | Peso da última semana aplicada; sem linha = peso cheio.                                                 |
| `roleta_sdr_apuracoes_recentes(n)`                   | tela (últimas apurações)                                                | As últimas `n` semanas gravadas, com o nome. SECURITY INVOKER: a RLS da tabela decide o que cada um vê. |
| `roleta_sdr_apurar_semana(semana?)`                  | cron `roleta-sdr-apuracao-semanal` `0 11 * * 6` (sáb 08:00 BRT), admin  | Grava `roleta_sdr_apuracoes` e aplica o efeito (fora da sombra). Sem argumento = última semana fechada. |
| `roleta_sdr_aviso_meio_semana()`                     | cron `roleta-sdr-aviso-meio-semana` `0 21 * * 3` (qua 18:00 BRT), admin | Sino para quem ainda não bateu a meta na semana em curso.                                               |
| `roleta_sdr_meu_aviso()`                             | pop-up do aviso (corretor logado)                                       | O alerta da semana em curso do próprio usuário (id, lido, sombra) ou nulo. Sem usuário, nulo.           |

Histórico em `roleta_sdr_apuracoes` (uma linha por corretor por semana:
visitas, pastas, pontos, vendas na janela, resultado `apto_meta` |
`apto_venda` | `apto_complemento` | `pausado` | `bloqueado_admin`, `peso_rodizio`, `sombra`,
`aplicado_em`, `apurado_em` e o retrato da régua usada). RLS: admin vê tudo,
corretor vê só a própria linha; ninguém escreve fora da apuração.

## 4. Telas

- **Central de Distribuição → Filas → SDR → "Placar da semana"** (admin):
  corretor, visitas, pastas, pontos, venda nos 15 dias, peso no rodízio e status previsto (vai
  ficar / vai entrar / vai voltar / vai pausar / fica fora / removido pelo
  admin), com a semana **em curso** ("se a semana fechasse agora") ou a
  **última fechada** (a que o sábado aplica). Embaixo, as últimas 4
  apurações, marcadas como sombra ou aplicada.
- **Card Metas do dia** (corretor, em todo o CRM; a página Hoje virou a Fila
  em 12/09): bloco "Roleta do SDR" com o próprio placar, a barra até a meta e
  o que falta. Aparece só com a regra ligada; em sombra, com o selo "teste".
- **Pop-up do aviso de quarta** (corretor, em todo o CRM): o card do placar
  descrito no item 8 da seção 1.

## 5. Peças no repositório

| Peça                                                         | Onde                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Migration (chaves, tabela, funções, crons)                   | `supabase/migrations/20261011120000_roleta_sdr_permanencia_semanal.sql`           |
| Espelho para o Lovable aplicar em produção                   | `drizzle/migrations/0065_roleta_sdr_permanencia_semanal.sql`                      |
| Peso no rodízio + venda sem teto (motor do SDR ponderado)    | `supabase/migrations/20261011120100_roleta_sdr_peso_rodizio.sql` (espelho `0066`) |
| Regras puras (contagem, cascata, efeito, textos)             | `src/lib/roleta-sdr-semanal.ts`                                                   |
| Testes das regras puras                                      | `tests/roleta-sdr-semanal.test.ts`                                                |
| Leituras da tela (RPC + zod, sem tocar no `types.ts` gerado) | `src/features/distribuicao/roleta-sdr-semanal-queries.ts`                         |
| Card "Placar da semana"                                      | `src/features/distribuicao/placar-roleta-sdr.tsx` (em `tab-filas.tsx`)            |
| Chaves na Política                                           | `src/features/distribuicao/tab-politica.tsx`                                      |
| Bloco no card Metas do dia                                   | `src/features/metas-dia/roleta-sdr-placar.tsx`                                    |
| Aviso de quarta no CRM (RPC + link do sino)                  | `supabase/migrations/20261011120400_roleta_sdr_aviso_no_crm.sql` (espelho `0069`) |
| Pop-up do aviso (card do placar, em `metas-dia-global.tsx`)  | `src/features/metas-dia/aviso-roleta-sdr.tsx`                                     |
| Testes de tela                                               | `tests/roleta-sdr-placar-tela.test.tsx`, `tests/roleta-sdr-aviso-tela.test.tsx`   |
| Suíte de banco (ponta a ponta)                               | `tests/db/roleta-sdr-semanal.test.ts`                                             |

## 6. Rollout

1. **Deploy** e, no mesmo dia, ligar `roleta_sdr_regra_ativa` na Política,
   com `roleta_sdr_modo_sombra` ligado (padrão). A apuração de **sábado
   10/10/2026** roda em sombra (semana 03/10 a 09/10).
2. **Semana 10/10 a 16/10 valendo:** aviso na quarta **14/10** (ainda com
   "[Teste]" se a sombra seguir ligada). Na **véspera da primeira apuração
   real (sexta 16/10)**, o admin desliga `roleta_sdr_modo_sombra`.
3. **Primeira apuração real:** sábado **17/10/2026, 08:00**.

O pop-up do aviso de quarta precisa das duas pontas: a migration
`20261011120400` no banco (sem ela a tela trata como "sem aviso" e só o sino
aparece) e o front publicado. O primeiro aviso com pop-up é o de **quarta
07/10, 18:00**, com o selo "Teste".

### Simulação de uma semana (sem gravar nada)

Funciona com a regra ligada ou desligada, no SQL do Lovable Cloud:

```sql
SELECT nome, visitas, pastas, pontos, vendas_janela, resultado
  FROM public.roleta_sdr_previa('2026-09-26')   -- semana 26/09 a 02/10
 ORDER BY resultado, pontos DESC, nome;
```

Ou na tela: Filas → SDR → Placar da semana → "Última fechada".

### Rollback

Desligar `roleta_sdr_regra_ativa` na Política (as duas funções param na hora)
e tirar as pausas da regra que ainda valem:

```sql
WITH r AS (SELECT id FROM public.roletas WHERE slug = 'agendados-sdr'),
despausados AS (
  UPDATE public.roleta_participantes rp
     SET pausado_ate = NULL, motivo_pausa = NULL
    FROM r
   WHERE rp.roleta_id = r.id
     AND rp.motivo_pausa LIKE 'Regra semanal%'
     AND rp.pausado_ate > now()
  RETURNING rp.roleta_id, rp.corretor_id
)
INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
SELECT roleta_id, corretor_id, 'reativado', 'Rollback da regra semanal (despausado)', NULL
  FROM despausados;
```

Quem a regra **incluiu** continua na roleta. Para conferir (e remover pela
Central, se for o caso):

```sql
SELECT p.nome, l.created_at, l.motivo
  FROM public.roleta_participantes_log l
  JOIN public.roletas r ON r.id = l.roleta_id AND r.slug = 'agendados-sdr'
  JOIN public.profiles p ON p.id = l.corretor_id
 WHERE l.acao = 'incluido' AND l.feito_por IS NULL AND l.motivo LIKE 'Regra semanal%'
 ORDER BY l.created_at DESC;
```

## 7. Pendências

- ~~WhatsApp do aviso de quarta.~~ Decidido em 05/10/2026: o aviso fica só
  no CRM (pop-up com o card do placar, migration 20261011120400). Disparar
  ~45 WhatsApps no mesmo minuto pela mesma instância da Z-API é o padrão que
  o WhatsApp trata como spam — o mesmo motivo que levou a transferência em
  lote a mandar uma mensagem só (`_shared/notificacao-transferencia.ts`).
- **Quem validou a presença.** `agendamentos` guarda `realizado_em`, mas não
  quem marcou a visita como realizada. Hoje o próprio corretor dono pode
  validar (`salvar_modo_visita` só exige acesso ao lead), e só o `audit_log`
  mostra quem foi, indiretamente. Sugestão (fora do escopo, nada criado):
  colunas `agendamentos.presenca_validada_por uuid REFERENCES auth.users(id)`
  e `presenca_validada_em timestamptz`, preenchidas por um trigger BEFORE
  UPDATE quando `status` muda para `realizado` ou `nao_compareceu`
  (`auth.uid()`). Com elas, o placar passa a exigir
  `presenca_validada_por IS DISTINCT FROM corretor_id`.
- **Simulação de 26/09 a 02/10 com dados reais.** O ambiente de
  desenvolvimento não alcança o banco do CRM. Rodar a consulta da seção 6
  depois do deploy.
