# Link de agendamento do corretor

| Peça              | Onde                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Migration         | `20261022120000_link_agendamento_cliente` (Drizzle `0083`) e `20261023120000_link_agendamento_por_local` (`0087`)       |
| Página do cliente | `/agendar/<slug>` — `src/routes/agendar.$slug.tsx`                                                                      |
| API pública       | `POST /api/public/agendamento` (carregar/agendar), `GET /api/public/agendamento-ics?c=`                                 |
| Tela do corretor  | Agenda → **Meu link** (`link-agendamento-dialog.tsx` + `seletor-local-visita.tsx`, em `src/features/agenda/`)           |
| Testes            | `tests/db/link-agendamento.test.ts` (banco), `tests/agendamento-link.test.ts`, `tests/link-agendamento-dialog.test.tsx` |

## 1. O que foi pedido

> O corretor pega o link do agendamento e o cliente entra numa página para
> incluir nome completo, telefone, e-mail, data, horário, endereço e o nome do
> corretor responsável. Ao final, ele pode adicionar o evento ao calendário,
> com aviso 1 dia antes e no dia 5 horas antes.

Decisões do dono (14/10/2026):

| #   | Pergunta                          | Decisão                                                                                                        |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Link por lead ou fixo do corretor | **Fixo do corretor** (estilo Calendly). O lead nasce na carteira dele, já em Agendado, com a visita na agenda. |
| 2   | Dados do cliente                  | Nome completo, telefone, e-mail **e CPF**.                                                                     |
| 3   | Endereço da visita                | **O corretor pré-preenche** no link; em branco, o cliente informa.                                             |

Decisão do dono (15/10/2026): o local sai do **Mapa de Lojas**, de forma
compacta dentro do formulário, e cada endereço tem o **seu link** — o corretor
passa a ter um link por stand (até 20 ativos), em vez de um link só.

## 2. Como funciona

1. O corretor abre **Agenda → Meu link** ("Meus links de agendamento") e, em
   cada link, escolhe o local — o stand no mapa compacto (busca por
   construtora, bairro ou endereço; toque no pino ou na lista) ou "Outro
   endereço" digitado — mais primeiro e último horário, dias e duração. Copia
   o link ou manda direto no WhatsApp com a mensagem pronta (que cita o stand).
   **Mesmo endereço = mesmo link**: criar de novo devolve o que já existe.
2. O cliente abre `/agendar/<slug>`, vê o corretor, o local e só os **horários
   livres**: de 30 em 30 minutos, a partir de 2 horas de antecedência, até 30
   dias, menos o que choca com visita, reunião ou "outro" já na agenda do
   corretor. A agenda é **uma só** para todos os links dele: o horário pego
   por um link some dos outros (ninguém está em dois stands ao mesmo tempo).
3. Ao confirmar, o banco faz tudo numa transação (`agendar_pelo_link`): lead,
   visita, etapa, tarefas, linha do tempo, aviso ao corretor.
4. O cliente sai com os botões **Google Agenda** e **iPhone/Outlook (.ics)**,
   WhatsApp do corretor e mapa.

## 3. O lead segue as portas do registro mãe

| Situação do telefone                               | O que acontece                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Pessoa nova                                        | Lead novo do corretor, origem `agendamento_self_service`; o gatilho de sempre cria a mãe.              |
| O corretor já tem registro vivo da pessoa          | Reaproveita. O formulário só **preenche campos vazios**; o que diverge vai na descrição da visita.     |
| A pessoa é de outro corretor                       | Nasce o **registro filho** deste corretor, com a regra de `criar_registro_filho` (herda dados da mãe). |
| Outro corretor já está em Visita realizada ou além | **Recusa**, com mensagem genérica (a página não revela quem é cliente de quem).                        |

A chave da mãe sai do telefone **normalizado** (`normalize_phone_smq` põe o 9º
dígito em número de 10 dígitos), igual ao gatilho — senão um telefone fixo não
acharia a mãe e bateria no índice único.

## 4. A etapa e a produção

- A matriz de `transicionar_lead` não leva Aguardando atendimento a Agendado.
  O caminho é o da visita marcada por terceiros (`_sdr_visita_roleta`):
  atualização sob `app.transicionar_lead`, gravada em
  `lead_status_transitions`, evento `transicao_lead` e tarefas de confirmação
  **D-1 e D-0** para o corretor. Lead já em Agendado ou além não regride.
- A visita nasce com `criado_por_id = corretor`: conta na pontuação dele e
  **não** cai na esteira "marquinhos" da comissão (visita sem autor = robô).
- O lead entra na cadência ao nascer e sai pelo agendamento ("respondeu").
- Captação própria: a guarda de zona é ligada (`app.zona_override`) só durante
  o insert do lead, porque a rota roda como service_role.

## 5. Segurança

- **Slug público de propósito** (16 caracteres, 96 bits): feito para circular,
  impossível de enumerar. **Gerar um link novo** derruba o antigo na hora.
- Tabelas fechadas para anon/authenticated. O corretor usa RPCs sobre o
  próprio link; a página pública passa pelo servidor (service_role) e só pelas
  funções estreitas.
- Limites: 120 requisições/min por link; **10 agendamentos/hora e 30/dia** por
  link; honeypot no formulário; reenvio idempotente (`idempotency_key`).
- Corretor desligado ou bloqueado: o link para de abrir sozinho.
- O comprovante (.ics) é outro segredo de 256 bits; o banco guarda só o
  SHA-256. Ele vai na query do GET (aparece em access logs), mas só abre o
  evento — data, endereço e corretor, nada do cliente — e vale até 1 dia depois.
- Nenhuma rota registra o corpo da requisição (nome, telefone, e-mail, CPF).

## 6. Lembretes (1 dia e 5 horas antes)

| Calendário                        | Lembretes                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| iPhone, Outlook, Samsung (`.ics`) | Vêm no arquivo (dois `VALARM`: `-P1D` e `-PT5H`).                                              |
| Google Agenda (link)              | O link do Google **não aceita lembretes**: vale o padrão da agenda do usuário. A página avisa. |

O `.ics` é servido por URL (GET), não por Blob: é o que o iPhone abre direto no
Calendário e o que funciona no navegador embutido do WhatsApp/Instagram. O UID
é o id da visita — reimportar atualiza o evento; se o corretor remarcar, o
comprovante já devolve o horário novo.

## 7. Link por local (20261023120000)

| Peça                             | O que é                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `local_id`                       | Id estável do stand no Mapa de Lojas (construtora + endereço); `null` = endereço digitado. |
| `local_nome`                     | "Construtora · Stand" — aparece na página do cliente, na confirmação e no `.ics`.          |
| `endereco_chave` (gerada)        | Endereço sem caixa nem espaços repetidos; único por corretor entre os links ativos.        |
| `meus_agendamento_links`         | Os links ativos do corretor, mais novo primeiro.                                           |
| `criar_agendamento_link`         | Cria o link do local; se já existe para o endereço, devolve o existente (`ja_existia`).    |
| `atualizar_agendamento_link`     | Ajusta um link (mesmo slug); mudar para o endereço de outro link ativo é recusado (23505). |
| `trocar_agendamento_link(id)`    | Revoga e cria outro slug com a mesma configuração e local.                                 |
| `desativar_agendamento_link(id)` | Revoga só aquele link.                                                                     |

O mapa do formulário é o mesmo `LojasMap` do `/mapa-lojas` em modo
**seletor**: o clique no pino escolhe o stand e não há popup (num mapa
compacto ele cobriria tudo). Leaflet e a base de stands só carregam quando o
formulário abre (`React.lazy`).

## 8. Próximos passos possíveis

- Lembrete ativo ao cliente (WhatsApp D-1 e D-0) pela mensageria, que cobre
  também quem usa o Google Agenda.
- Remarcar/cancelar pelo próprio link do comprovante.
