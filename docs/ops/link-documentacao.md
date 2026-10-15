# Link de documentação do cliente

| Peça              | Onde                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations        | `20261024115900_lead_origem_documentacao` (Drizzle `0088`) e `20261024120000_link_documentacao_cliente` (`0089`)                         |
| Páginas públicas  | `/documentos/<slug>` (cadastro) e `/pasta/<token>` (envio) — `src/routes/documentos.$slug.tsx`, `src/routes/pasta.$token.tsx`            |
| API pública       | `POST /api/public/documentacao` (link, iniciar, pasta, perfil) e `POST /api/public/documentacao-arquivo` (um arquivo por vez, multipart) |
| Telas do corretor | Carteira → **Link de documentos** e aba **Documentação** do lead → "Link da pasta para o cliente" (`src/features/documentacao/`)         |
| Testes            | `tests/db/link-documentacao.test.ts` (banco), `tests/documentacao-link.test.ts`, `tests/link-documentacao-ui.test.tsx`                   |

## 1. O que foi pedido

> Um link como o de agendamento, para documentação: o cliente anexa a
> documentação pelo link, e o sistema já vincula, cria o lead, com os dados.

Decisões do dono (15/10/2026):

| #   | Pergunta                     | Decisão                                                                                                               |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Dados que o cliente preenche | **Básico**: nome, telefone, e-mail, CPF e o perfil de renda (com casado, FGTS e IR — o que monta a lista).            |
| 2   | Etapa do lead                | **Regra da pasta**: lead novo nasce em Em atendimento; no 3º documento recebido, vai sozinho para Análise de crédito. |
| 3   | Envio                        | **Aos poucos**: o cliente ganha o link pessoal da pasta (30 dias); o corretor também manda pela aba Documentação.     |

## 2. Como funciona

1. **Link fixo** (`/documentos/<slug>`, um por corretor). O corretor pega em
   Carteira → **Link de documentos** e manda no WhatsApp. O cliente informa os
   dados, escolhe como recebe a renda (carteira assinada, autônomo, empresário,
   aposentado) e responde casado/FGTS/IR. O servidor monta a lista com a
   **mesma função da aba Documentação** (`checklistPorPerfil`) e a página segue
   para a pasta. Quem volta pelo link fixo no mesmo aparelho tem o atalho
   "continuar a minha pasta"; em outro aparelho, o mesmo telefone cai na mesma
   pasta.
2. **Pasta** (`/pasta/<token>`, uma ativa por lead). O cliente vê cada
   documento com o andamento (Falta enviar, Envie de novo, Enviado, Aprovado) e
   manda foto ou PDF — um ou vários de uma vez. O primeiro arquivo preenche o
   item que falta; os seguintes entram como arquivos a mais do mesmo documento
   (outro holerite, o verso do RG). "Trocar o último" vira versão nova do
   item; aprovado não se troca. Sempre há "Outro documento".
3. **Pelo lead que já existe.** Na aba Documentação, "Link da pasta para o
   cliente": gerar, mandar no WhatsApp do lead (fica registrado na timeline),
   copiar, trocar. Sem checklist, a página pergunta o perfil ao cliente.
   Mandar ou copiar de novo **renova o prazo** para 30 dias.

## 3. O lead

As mesmas portas do registro mãe do link de agendamento
(`docs/ops/link-agendamento.md` §3): pessoa nova → lead novo (origem
`documentacao_self_service`, "Link de documentos"); registro do próprio
corretor → reaproveita e só **completa campos vazios** (o que diverge vai numa
nota da linha do tempo); pessoa de outro corretor → registro filho; outro
corretor em Visita realizada ou além → recusa com mensagem genérica.

O perfil vira `tipo_renda` (se vazio) e "vai usar FGTS" liga `usa_fgts`.

## 4. A etapa

- Cadastrar, responder o perfil ou mandar arquivo é o cliente **respondendo**:
  lead em prospecção (novo, aguardando atendimento/corretor/retorno) vai para
  **Em atendimento**, pelo caminho de sistema do link de agendamento
  (atualização sob `app.transicionar_lead`, `lead_status_transitions`, evento
  `transicao_lead` com origem `resposta`); a cadência sai sozinha pelo gatilho.
  Etapa adiante não regride.
- O próximo passo é a tarefa **"Conferir os documentos de Fulano"**
  (tipo documentação; o espelho `proximo_followup` sai dela) — uma só aberta.
- Como as outras entradas de sistema (SDR, serviço), não passa pelo **teto dos
  65**: o corretor não está na tela para fazer a troca, e a regra da pasta tira
  o lead de lá no 3º documento.
- A regra da pasta (`pasta_montada_after_doc`, 3 resolvidos → Análise de
  crédito) **não mudou**: vale igual para upload do corretor, WhatsApp e link.

## 5. Os arquivos

- Mesmo lugar dos do corretor: bucket privado `documentacao`, caminho
  `<lead>/<item>/<uuid>.<ext>`, uma **versão imutável** por envio
  (`documentacao_versoes`). A versão do cliente não tem usuário:
  `enviado_por` nulo, `pelo_cliente = true`, `pasta_id` diz qual pasta. O
  corretor abre, aprova, reprova e remove pelo caminho de sempre.
- O item fica **recebido** com `origem = 'link_cliente'` (badge "Pelo
  cliente" na aba) e `arquivo_path` limpo — o assinador do CRM prefere
  `arquivo_path`, que numa linha do WhatsApp apontaria o arquivo antigo.
- O servidor confere o **conteúdo** (assinatura de PDF, JPEG, PNG, WebP), não o
  tipo declarado; até 15 MB. No celular, foto acima de 2,5 MB vira JPEG de até
  2400 px (legível, ~700 KB) e HEIC é convertido antes do envio.
- O cliente **nunca lê arquivo de volta**: a página mostra só a lista com o
  andamento — sem nome do cliente, sem arquivo.

## 6. Avisos ao corretor

- Cadastro: push "Cliente no seu link de documentos" e nota na linha do tempo
  (perfil, itens novos, dados divergentes).
- Arquivos: push "Documentos chegando" e nota **uma vez por leva** (30
  minutos): o cliente costuma mandar vários seguidos.

## 7. Segurança

- Tabelas fechadas para anon/authenticated; páginas públicas só pelo servidor
  (service_role) e pelas funções estreitas. Corretor: link fixo dele; pasta de
  quem ele pode ver (`pode_acessar_lead`).
- Slug (96 bits) e token (192 bits) em claro, feitos para circular; "Gerar
  novo"/"Trocar link" derruba o antigo na hora. O token só permite enviar
  arquivo e ver a lista.
- Limites: 120 requisições/min por link e por pasta; **10 pastas novas/hora e
  30/dia** por link fixo; **40 arquivos/hora e 150 no total** por pasta; 12
  arquivos por documento; honeypot no cadastro; corpo acima de ~15 MB recusado
  antes de ler.
- Nenhuma rota registra corpo, nome de arquivo ou dado do cliente.

## 8. Próximos passos possíveis

- Lembrete automático ao cliente (WhatsApp) do que falta, pela mensageria.
- Pré-classificação por IA do "Outro documento" (como no WhatsApp da Sami).
