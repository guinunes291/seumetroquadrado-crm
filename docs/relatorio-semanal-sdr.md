# Relatório semanal do SDR (folha do sábado)

Relatório PADRÃO do time de pré-venda, feito para a conferência do pagamento:
**Gestão → Relatórios → aba SDR** (`/painel-gestor?tab=relatorios`, sub-aba
"SDR"). Só **admin** enxerga a aba — ler o papel de outras pessoas
(`user_roles`) é de admin, e conferir folha também.

## 1. A semana é SÁBADO → SEXTA

O pagamento do SDR é fechado **todo sábado de manhã**, sobre o que aconteceu
de sábado passado até a sexta que acabou. Por isso a aba tem calendário
próprio e o filtro de período do topo da página some quando ela está aberta:
a semana "normal" do CRM (segunda a domingo) leria o sábado do pagamento
dentro da semana que já foi paga e jogaria a sexta — o último dia da apuração
— para a semana seguinte.

- **No sábado**, a aba abre já na semana que **acabou de fechar** (sáb passado
  → sexta de ontem): é a que vai ser paga naquela manhã.
- **Nos outros dias**, abre a semana **em curso**, para acompanhar o time.
- O seletor guarda as **8 últimas semanas**, e o selo diz se a semana está
  fechada ("folha do sábado") ou em curso.

Regras puras e testadas em `src/features/dashboard/semana-sdr.ts` +
`tests/semana-sdr.test.ts`.

## 2. Os quatro números — e a data de cada um

A régua de data é a **mesma do resto do CRM** (`dashboard_atividade_periodo`,
migration `20260731122000`), para o número da folha bater com o número do
Dashboard:

| Número                 | Conta                                                            | Data que vale                            |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| **Agendamentos**       | visitas marcadas (`agendamentos`, tipo visita, não auto-geradas) | data em que o compromisso foi **criado** |
| **Visitas realizadas** | visita com presença **validada** (`status = realizado`)          | **dia da visita**                        |
| **Pastas**             | lead que **entrou em análise de crédito** (uma vez por semana)   | data da **mudança de status**            |
| **Vendas**             | venda aprovada, sem distrato                                     | data da **assinatura**                   |
| **Vendas recebidas**   | venda cujo valor a imobiliária **recebeu** (qualquer assinatura) | `data_recebimento`                       |

O que o SDR recebe por unidade: **visita realizada**, **pasta (avaliação de
crédito) enviada** e **venda** — e a venda só é paga **no recebimento pela
imobiliária**. Por isso "Vendas recebidas" é coluna e card próprios: venda
assinada na semana quase nunca é venda paga na semana.

Duas leituras que a tela deixa explícitas de propósito:

- **No-show e visita sem desfecho não pagam.** A visita só conta como
  realizada depois que alguém valida a presença; enquanto ninguém valida ela
  aparece como "Sem desfecho" na lista e fica fora do total.
- **Remarcação cria um compromisso novo.** O total de "Agendamentos" conta
  cada horário marcado — remarcar conta de novo. Quem paga por visita
  realizada não é afetado por isso.

## 3. De quem é o número (atribuição)

O vínculo é o **dono de pré-venda do lead** (`leads.sdr_id`) — é ele que
sobrevive a tudo o que acontece depois: entrega ao corretor, remarcação da
visita por outra pessoa, devolução. Quando o lead não tem SDR, vale **quem
criou o registro**, se for um SDR (cobre a carteira antiga, em que o SDR marca
visita num lead que nunca entrou na base de pré-venda).

Não usamos "quem criou" como regra principal de propósito: remarcar uma visita
cria uma linha nova no nome de quem remarcou (`remarcarPayload`), e o SDR
perderia justamente a visita realizada que ele recebe para produzir.

Efeitos colaterais desejados:

- SDR **sem produção aparece zerado** — zero é informação na folha.
- Quem produziu na semana e **saiu do time** continua aparecendo, com o nome
  do perfil.
- Lead **sem SDR** não entra em lugar nenhum do relatório (é produção de
  corretor, e vive nas outras sub-abas de Relatórios).

## 4. Conferência e PDF

Abaixo do quadro por SDR, cinco listas nominais (cliente com link para a
ficha, SDR, corretor, data) — agendamentos, visitas da semana, pastas, vendas
assinadas e vendas recebidas — com filtro por SDR para conferir a folha de uma
pessoa. **Exportar PDF** gera o documento da semana inteira (resumo + as cinco
listas), que é a folha para imprimir ou arquivar; telefone de cliente nunca
entra no PDF, igual ao resto de Relatórios.

## 5. Peças no repositório

| Peça                               | Onde                                               |
| ---------------------------------- | -------------------------------------------------- |
| Semana sáb→sex, atribuição, resumo | `src/features/dashboard/semana-sdr.ts`             |
| Consultas da semana                | `src/features/dashboard/relatorios-sdr-queries.ts` |
| Aba (UI + PDF)                     | `src/features/dashboard/relatorios-sdr-tab.tsx`    |
| Ligação na página de Relatórios    | `src/features/dashboard/relatorios-view.tsx`       |
| Testes das regras puras            | `tests/semana-sdr.test.ts`                         |

Nenhuma migration nova: tudo é leitura das tabelas que já existem, sob a RLS
de admin.
