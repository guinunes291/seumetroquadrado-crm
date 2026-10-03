# Registro mãe e registros filhos

Decisões do dono em 03/10/2026.

| Fatia | Migration                                               | Testes                                                                               |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A     | `20261010120300_registro_mae_clientes` (Drizzle `0054`) | `tests/db/registro-mae.test.ts` (banco), `tests/buscar-oportunidade.test.tsx`        |
| B     | `20261010120400_registro_mae_volta_campanha` (`0055`)   | `tests/db/registro-mae-campanha.test.ts` (banco), `tests/webhook-lead-volta.test.ts` |

## 1. O que o dono pediu

> Dois leads com o mesmo telefone no sistema, com vários corretores. Ocorre
> quando o corretor pega o lead por alguma via fora do CRM. Todo lead precisa
> ter um ID diferente, porém deve ter um registro mãe onde todas as mudanças
> nos registros filhos sejam registradas, para termos o maior nível de
> informação sobre um cliente, independente de qual corretor preencha. Com os
> corretores ficam apenas os registros filhos. A cada corretor novo que cria o
> cliente, cria um novo registro para a base dele.

A referência é o "buscar oportunidade" de outro sistema: busca o registro
principal por telefone, e-mail ou CPF e, se já existir, cria um registro novo
para o corretor que está puxando, com tudo o que já foi preenchido.

## 2. As decisões

| #   | Pergunta                                            | Decisão                                                                                                                           |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | O que o corretor novo recebe dos outros?            | **Só os dados preenchidos.** Notas, conversas e histórico dos outros corretores não aparecem para ele.                            |
| 2   | Outro corretor já está em Visita realizada ou além? | **Não pode criar** o registro dele.                                                                                               |
| 3   | Um corretor muda um dado: e os outros registros?    | **Só a mãe é atualizada**, com quem mudou e quando. Os outros filhos não mudam. Quem criar um filho depois já recebe o mais novo. |
| 4   | O cliente volta por uma campanha paga               | **Sempre filho novo pela roleta.** (Fatia B)                                                                                      |
| 5   | O primeiro a levar o cliente a Visita realizada     | Fica com ele; os registros dos outros viram perda "cliente seguiu com outro corretor", **sem aviso**, sem contar como perda.      |

## 3. O modelo

| Peça                       | O que é                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `clientes`                 | **A mãe.** Uma por pessoa, pela chave do telefone (9 últimos dígitos, a mesma do índice único de sempre).     |
| `clientes.dados`           | O valor mais recente de cada informação do cliente, com o lead, o corretor, o autor e a data.                 |
| `cliente_eventos`          | O histórico: cada mudança feita em qualquer filho, com o valor anterior e o novo.                             |
| `leads.cliente_id`         | O vínculo do filho com a mãe. Obrigatório: todo lead tem mãe.                                                 |
| `leads.registro_adicional` | Filho criado para um corretor quando a pessoa já existia. Só esses ficam fora dos índices únicos de telefone. |

**Informação do cliente** (sobe para a mãe e desce para o filho novo): nome,
e-mail, CPF, renda informada/estimada, tipo de renda, faixa MCMV, FGTS (usa,
tem, valor), entrada, decisor, zona, bairro, dormitórios, vaga, prioridades,
objeções, resumo da qualificação, empreendimento de interesse, construtora,
consentimento LGPD. A lista mora em `_cliente_campos()`, uma fonte só para o
gatilho, o backfill e a criação do filho.

**Não sobe nem desce**, por decisão do dono: observações, próxima ação, motivo
de perda, nota de perfil (textos do corretor) e o estado da negociação
(status, temperatura, cadência).

**Exceção de compliance:** opt-out vale para a pessoa. Quando qualquer filho
recebe opt-out, a mãe e todos os outros filhos recebem também.

A mãe é da gestão: o corretor não lê a tabela `clientes` (RLS) e só usa as
RPCs abaixo, que não revelam valores antes de ele criar o registro, nem quem
são os outros corretores.

## 4. As portas

Registro filho adicional nasce **só** por onde o dono decidiu:

| Porta                                                                 | Fatia |
| --------------------------------------------------------------------- | ----- |
| Corretor acha o cliente pelo **Buscar oportunidade**                  | A     |
| Cliente volta por **campanha paga** (webhook de leads) → roleta (§10) | B     |

Todo o resto (landing, importação, cadastro manual sem oportunidade)
**continua deduplicando exatamente como antes**. O índice único global de
telefone foi recriado com a mesma chave e condição, mais
`NOT registro_adicional`. Apagar a unicidade faria cada entrada antiga criar
duplicata sem querer.

Os dois índices de 10 dígitos por empreendimento só são recriados onde já
existem. **Em produção eles nunca existiram**: a migration de julho os pula
quando há duplicata antiga. Criá-los sem condição poderia derrubar o deploy.

## 5. Na tela

No **Novo lead**, o corretor vê no topo o bloco **"Buscar oportunidade"**
(telefone, e-mail ou CPF formatado). Os resultados possíveis:

- **Não encontrado:** segue o cadastro normal abaixo.
- **Já é dele:** link para o lead.
- **Outro corretor em Visita realizada ou além:** bloqueado, com o motivo.
- **Existe no CRM:** mostra quais informações virão prontas e o botão **"Criar
  meu registro"**. O registro nasce na carteira dele, em Aguardando atendimento,
  origem captação própria, e entra na cadência como qualquer lead novo.

Se o corretor ignorar a busca e cadastrar um telefone que já está em outra
carteira, o diálogo não dá mais o erro "lead duplicado em outra carteira". Ele
leva o corretor para a busca, já preenchida.

## 6. O encerramento

Quando um filho entra em Visita realizada (ou além), os outros registros ativos
da mesma pessoa viram `perdido` com o motivo `seguiu_outro_corretor`:

- **Sem retrabalho** (`motivo_perda_sem_retrabalho`): nem SDR, nem discador,
  nem a reciclagem de perdidos voltam a eles.
- **Como sistema:** a identidade da sessão é limpa só durante o encerramento.
  Sem isso, `registrar_transicao_status` gravaria no histórico do corretor
  encerrado uma "mudança de status" com o nome de quem avançou.
- **Tarefas canceladas** pelo gatilho de sempre (`trg_leads_cancelar_followups`).
- **Não encerra:** registro que também já avançou (conflito, fica com a
  gestão), venda viva, lixeira, excluído.

`seguiu_outro_corretor` não aparece no menu de motivos de perda do corretor: é
gravado só pelo sistema.

## 7. O que supunha "um telefone, um lead"

Hoje cada uma destas vê no máximo um lead ativo por telefone, então **nenhuma
muda de resultado agora**. Elas passam a escolher certo quando houver filhos:

| Onde                                                                                 | O que muda                                                                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| WhatsApp recebido (`buscar_lead_ativo_por_telefone_global`)                          | Vai para o filho com corretor e **contato real mais recente**, não para o atualizado por último. |
| Recuperação do 23505 e landing (`buscar_lead_duplicado`, `buscar_lead_por_telefone`) | O registro original primeiro.                                                                    |
| Página de duplicatas (`detectar_duplicatas_leads`)                                   | Registro adicional não é duplicata.                                                              |
| Bolsão (`_bolsao_elegivel`)                                                          | Quem já está com um corretor não entra na fila do discador por outro registro.                   |
| Mescla em lote por telefone (três funções, `service_role`, sem cron)                 | Nunca junta filhos de corretores diferentes. A mescla manual da gestão fica como está.           |

## 8. O backfill

- Uma mãe por chave de telefone, contando todos os leads, inclusive os da
  lixeira e os excluídos.
- Os dados da mãe são o valor mais recente de cada campo entre todos os
  registros da pessoa.
- Lead sem telefone que identifique alguém ganha mãe própria, com o mesmo id.
- Os gatilhos de usuário ficam desligados **só durante o vínculo**. Sem isso,
  os UPDATEs moveriam `updated_at`, que é o relógio de reserva de várias telas.

Medido em produção em 03/10/2026, somente leitura: **104.769 mães com dados**,
427 mil valores, cerca de 4 campos por mãe.

## 9. Como foi conferido

- `tests/db/registro-mae.test.ts`, com 23 testes:
  - vínculo com a mãe e deduplicação antiga intacta;
  - busca por telefone, CPF e e-mail;
  - herança só de dados e sincronização só da mãe;
  - opt-out propagado;
  - encerramento como sistema e conflito preservado;
  - Bolsão, WhatsApp, mescla, duplicatas e acesso.
- Checagem de mutação, quatro vezes: encerramento com a identidade de quem
  avançou, opt-out sem propagação, Bolsão sem a regra e índice sem a exceção.
  Cada mutação derruba pelo menos um teste.
- Três fixtures antigos que inserem lead com gatilhos desligados
  (`session_replication_role = replica`) passaram a criar a mãe no mesmo
  comando. Nenhum caminho de produção usa esse modo.
- **Fatia B:** `tests/db/registro-mae-campanha.test.ts`, com 18 testes:
  - filho novo vinculado e fora do índice;
  - o mesmo celular sem o 9 é a mesma pessoa (na volta e no Buscar
    oportunidade);
  - exclusão de quem já tem a pessoa na roleta da campanha e no time da zona;
  - herança sem o lugar de interesse;
  - reenvio, perdidos, negociação avançada, concorrência real entre duas
    conexões e acesso.
- Checagem de mutação da Fatia B, sete vezes: roleta sem a exclusão, filho
  herdando a zona, sem o cadeado, sem a janela de reenvio, sem a lista de
  excluídos, sem o bloqueio e chave sobre o telefone cru. Cada mutação derruba
  pelo menos um teste.

## 10. Fatia B: a volta pela campanha

> **Decisão do dono:** "Sempre filho novo pela roleta". Toda volta por campanha
> gera um registro novo para o corretor que a roleta sortear, mesmo que outro
> esteja atendendo.

### O defeito que ela fecha

A regra do lead repetido (01/10) chamava duas funções que **nunca existiram**,
nem em produção: `buscar_lead_por_telefone_global_incl_perdido` e
`redistribuir_duplicado_campanha`. Sem elas, o webhook ia direto para o INSERT
e batia no índice único de telefone. Esse índice vale também para os perdidos.
A recuperação só achava o repetido do **mesmo** empreendimento. Resultado: o
cliente que voltava por outro anúncio virava erro 500 e não entrava no CRM.

- No **Marquinhos**, o erro é silencioso: o robô pausa, o Copiloto recebe o
  lead vazio e ninguém é avisado.
- No **aviso das campanhas (Zaps)**, o lead some sem rastro.

### Como decide

O webhook pergunta ao banco (`registrar_volta_campanha`). O banco decide sob
o mesmo cadeado do gatilho de vínculo (`'cliente:' || chave`). Assim, duas
entradas da mesma pessoa ao mesmo tempo passam uma de cada vez.

| Situação da pessoa                                                      | O que acontece                                                             | Resposta ao n8n                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Telefone que o CRM não conhece (ou só na lixeira)                       | O INSERT de sempre.                                                        | Lead novo, como antes.                                                |
| Um registro dela entrou **pelo webhook há menos de 10 minutos**         | Reenvio: é a mesma entrada. Nota no registro, nada novo.                   | `duplicate: true`, `motivo: reenvio_recente`.                         |
| Um registro dela em **Visita realizada ou além**, ou com **venda viva** | Fica com o dono. Nota no registro e alerta no CRM para ele.                | `duplicate: true`, `motivo: mantido_negociacao_avancada`, dono atual. |
| O resto: ativos com corretores, sem dono ou só perdidos                 | **Filho novo**, já vinculado à mãe, sem os corretores que já têm a pessoa. | Lead novo para o corretor sorteado, `registro_adicional: true`.       |

O filho segue daqui **exatamente como um lead novo**:

- mesma roleta (campanha, zona ou triagem);
- mesmo SLA;
- mesma fila de exceções;
- mesmo WhatsApp ao corretor;
- mesmo envio ao Banco Operacional.

O registro dos outros corretores não muda e ninguém é avisado. É a mesma regra
do Buscar oportunidade.

### O que o filho recebe

- **Do formulário:** tudo o que ele trouxe. É o dado mais novo e manda.
- **Da mãe:** o que o formulário não trouxe (renda, FGTS, decisor, e-mail,
  CPF, prioridades…). Cada um desses campos é listado na nota do filho
  ("Vieram preenchidos: …").
- **Nunca da mãe: zona, bairro, empreendimento e construtora.** Dizem onde o
  cliente quer comprar, e na volta quem diz isso é o anúncio novo.
  `zona_do_lead` olha a zona e o bairro do lead **antes** do empreendimento.
  Herdar a Zona Norte de antes faria a roleta seguir o interesse antigo, o
  contrário do que a regra de 01/10 já queria.
- **Não vem:** observações e histórico dos outros corretores (decisão 1).
- **Opt-out:** o filho da campanha nasce sem. Formulário novo é pedido novo de
  contato, como sempre foi para um lead novo do webhook.

### Quem não é sorteado

Os corretores com registro **ativo** da pessoa vão para
`corretores_que_tentaram` do filho:

- **Motor v3 (roleta de zona e triagem)** e **repasse por SLA:** já excluíam
  essa lista.
- **Roleta ponderada da campanha:** passou a excluir também. Ela só é chamada
  pelo webhook, sempre com lead recém-criado, então para todo lead que não é
  filho de campanha a lista é vazia e nada muda.

Quem só tem registro **perdido** da pessoa pode recebê-la de novo.

### O que o n8n vê

- **Aviso das campanhas (Zaps):** o fluxo decide por `duplicate`.
  - Filho novo: "novo lead" para o corretor sorteado.
  - Reenvio ou negociação: "lead seu que voltou" para o dono e aviso ao
    gestor.
- **Marquinhos:** lê só `distributed`. Com `false`, grava o alerta "roleta sem
  distribuição". Por isso a resposta sem registro novo diz `distributed: true`
  quando o registro tem dono com telefone, e manda o telefone desse dono. Assim
  o Copiloto recebe o corretor certo.

### Segurança do deploy

- **Resposta fora do contrato ou RPC fora do ar:** o webhook segue o INSERT de
  sempre. O índice único segura a duplicata e a recuperação antiga continua
  lá.
- **Corrida no INSERT (23505):** o webhook pergunta ao banco de novo antes do
  caminho antigo.

### Conserto da Fatia A que veio junto

O vínculo e o índice único usam o telefone **normalizado**
(`normalize_phone_smq`), que põe o 9 no celular antigo. A busca do Buscar
oportunidade calculava a chave sobre o texto digitado. Exemplo:

- O cliente está gravado como `(11) 98765-4321`, chave `987654321`.
- O corretor digita `11 8765-4321`. A busca calculava `187654321` e não achava
  ninguém. O corretor acabava cadastrando um lead paralelo.

Agora a busca e a volta usam a mesma função: `cliente_chave_do_telefone`.

### Fora da Fatia B

`supabase/functions/lead-intake` (Facebook → Zapier → CRM) tem o mesmo defeito
de recuperação. Ela **não recebe nenhum lead há 90 dias** (medido em produção em
03/10/2026: todo o tráfego pago entra pelo webhook). Não foi mexida.

## 11. O que vem depois

Pendências conhecidas:

- **Perda que não conta para o corretor:** nenhum relatório de desempenho
  separa hoje as perdas gravadas pelo sistema (nem `sem_retorno_cadencia`). O
  motivo `seguiu_outro_corretor` precisa ser excluído das perdas do corretor
  nos rankings e painéis.
- **Registro adicional que perde o dono** (cadência vencida, devolução) vira
  um segundo registro sem dono da mesma pessoa. O Bolsão já não o oferece se
  outro corretor está com ela; a régua da regra dos 65 (Fatia 3) deve
  encerrá-lo em vez de devolvê-lo.
- **Tela da mãe para a gestão:** `cliente_registro_mae_v1` já devolve dados,
  filhos e histórico; falta a tela.
- **Distribuição que não olha os outros registros da pessoa.** Quem já tem a
  pessoa fica fora do sorteio do filho porque entra em `corretores_que_tentaram`
  **quando o filho nasce**. Um registro antigo **sem dono** da mesma pessoa que
  ainda esteja na fila (exceções, cron de redistribuição) é distribuído depois
  sem saber do filho. Pode cair em quem já tem a pessoa. O conserto certo é o
  motor v3, a roleta ponderada e o repasse por SLA excluírem, **na hora de
  distribuir**, quem tem registro ativo da mesma mãe. Vale também para os
  filhos da Fatia A.
