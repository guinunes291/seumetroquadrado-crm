# As demais páginas no padrão Lançamento (2026-10)

> Sexta rodada do redesign. A anterior, `lancamento-2026-10.md`, trocou a
> **moldura** (sidebar, header, cabeçalho, hub). Esta leva o **miolo** das
> páginas que ficaram fora da Central de Comando para o mesmo desenho, em
> fases. O desenho de cada página (hoje → depois → por quê → o que não muda)
> foi aprovado pelo dono no canvas de 12/10/2026 antes de qualquer código.
>
> A auditoria das 62 rotas e o plano das 6 fases estão em
> `plano-paginas-padrao-lancamento.md`; este arquivo registra o que cada fase
> entregou.

## As regras desta rodada

1. **Só visual.** Nenhuma regra, contador, RPC, chave de cache ou permissão
   muda. Onde a tela precisa saber algo para avisar antes (ex.: "resgate
   fechado"), ela LÊ o que o banco já expõe — a regra continua no banco e o
   banco continua respondendo no clique.
2. **Uma pergunta, um desenho.** "Quantos de quantos" é sempre o anel da
   Central (`AnelNdeM`); "quem está olhando a tela de outro" é sempre a faixa
   `VendoDeOutro`; tom de situação é sempre `INTENT_BADGE`.
3. **Menos na tela, nada a menos no produto.** Filtros raros vão para trás de
   "Filtros"; tabelas de gestão vão para trás de "Ver …"; 50 botões que
   falham viram um aviso. Nada é removido — só muda de lugar.
4. **O shell já dá a margem.** Página não põe `max-w`/`px`/`py` próprios.
5. **O treino prático do onboarding não muda** (telas de treino, clientes
   fictícios, só a conclusão em `user_preferences` com chave versionada).

## As peças (Fase 1)

Extraídas da Central sem mudar a Fila Única (os testes da Fila e da Central
passam sem alteração):

| Peça                                       | Onde                                     | Para quê                                                                                                                            |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AnelNdeM`, `Numero`, `Notas`              | `src/components/ui/placar.tsx`           | O anel "X de N" (verde → âmbar → vermelho) com nome acessível `"X de N <rótulo>"`; o número com dono (cor só quando > 0); as notas. |
| `Placar`                                   | `src/components/ui/placar.tsx`           | Anel + até 4 números + notas + ação, num cartão. É o "como estou agora" de qualquer página.                                         |
| `CartaoPrincipal`                          | `src/components/ui/cartao-principal.tsx` | O cartão grande da Fila (título, subtítulo, destaque centralizado, números, notas, ação, rodapé).                                   |
| `Painel`                                   | `src/components/ui/painel.tsx`           | O painel lateral com título, sub e ação. O `Painel` do Ranking só migra na Fase 5.                                                  |
| `VendoDeOutro`                             | `src/components/vendo-de-outro.tsx`      | "Vendo a fila de Ana · voltar para a minha" — a gestão sabe de quem é a tela e volta num toque.                                     |
| `SeloAoVivo`                               | `src/components/ui/selo-ao-vivo.tsx`     | O ponto "ao vivo" do Painel do Gestor, reutilizável.                                                                                |
| `FiltrosMenu`                              | `src/components/ui/filtros-menu.tsx`     | Um botão "Filtros (N)" com os filtros raros dentro e "Limpar filtros"; o resumo do que está ativo fica ao lado.                     |
| `AcoesLinha`                               | `src/components/ui/acoes-linha.tsx`      | O "⋮" da linha; ação destrutiva pede confirmação (`AlertDialog`).                                                                   |
| `useNomeDoCorretor`                        | `src/hooks/use-nome-do-corretor.ts`      | O nome para a faixa `VendoDeOutro` (lê `profiles.nome`, cache de 10 min).                                                           |
| `portasLegadasFechadas`, `LOTE_STATUS_KEY` | `src/features/prospeccao/lote-client.ts` | A Minha base lê o mesmo status do lote da Prospecção (mesma chave de cache = uma chamada só) para saber se o resgate está fechado.  |

Testes: `tests/pecas-lancamento.test.tsx`.

## Decisões do dono (12/10/2026)

1. **Superintendente:** hoje não existe ninguém no papel — fica fora do
   escopo do redesign (o papel continua no código, intacto).
2. **Gestor em Configurações → Pessoas:** sim, vendo o próprio time (Fase 4).
3. **"Ligar" na Agenda:** pelo 3C Plus quando houver integração; sem ela,
   `tel:` (o `useLigarLead` já degrada assim) (Fase 3).
4. **Gerente de duas zonas:** as zonas lado a lado (Fase 4).
5. **Match:** opção B, só IA (a mais barata) (Fase 6).

## Fase 1 — o que mudou, e por quê

### Minha base (`/reserva`)

| Antes                                                                                     | Agora                                                                                                                                         | Por quê                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O placar era uma frase longa no cabeçalho                                                 | `Placar` com o anel da Central (X de 65 em atendimento) e três números: vagas livres · na Minha base · em formação (cadência)                 | A mesma pergunta ("quanto cabe?") com o mesmo desenho da Central. "Vagas livres" usa a conta da carteira ativa — a mesma do botão "Trazer" e do aviso `vagas_agora` depois do resgate.                                                 |
| Chips por motivo só informavam                                                            | Os chips filtram a lista ("Todos" volta); com mais de uma página, "nesta página"                                                              | O corretor quer ver "só os parados", não só saber quantos são.                                                                                                                                                                         |
| 50 botões "Trazer": cinza sem vaga, ou falhando no clique com a porta fechada desde 28/09 | **Um aviso** acima da lista — "fechado desde 28/09, clientes novos chegam pelo lote de 30 na Prospecção" ou "sem vaga livre" — e nenhum botão | Botão que sempre falha ensina que o CRM está quebrado. O aviso só aparece quando o banco DISSE `portas_legadas: false`; banco antigo, sem a chave, mantém os botões e responde no clique. Enquanto o status chega, nenhum botão pisca. |
| A gestão via a base de um corretor sem saber de quem                                      | `VendoDeOutro`: "Vendo a base de Ana · voltar para a minha"; sem botão de resgate (o banco recusa lead de outro)                              | Mesmo padrão da Fila.                                                                                                                                                                                                                  |
| "Ir para a Fila Única" era um botão contornado                                            | Link de texto                                                                                                                                 | A ação principal da página é buscar e trazer; o atalho não compete com ela.                                                                                                                                                            |

Não mudou: busca por nome/telefone (só dígitos no banco), motivo de cada um em
texto, paginação de 50, os toasts do resgate (cap, porta fechada, erro),
`carteira_resgatar`. Testes: `tests/reserva-minha-base.test.tsx`.

### Meus 65 (`/meus-65`)

| Antes                                                  | Agora                                                                                                   | Por quê                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| "3/65" em texto, outro desenho para a pergunta do anel | `Placar` com o mesmo anel da Central e três números com dono: escolhidos · ficam nos 65 · perdem a vaga | Uma pergunta, um desenho.                        |
| Tons próprios (`ACAO_TOM`)                             | `INTENT_BADGE` (fica = sucesso, acima do teto = atenção, perde a vaga = perigo, cadência = neutro)      | Os tons de intenção do sistema.                  |
| A regra do relógio num parágrafo                       | Uma linha no topo da lista ("A escolha não segura o relógio: sem ligação ou WhatsApp em 5 dias…")       | Fica onde a decisão é tomada (a caixa "Manter"). |
| Erro e "sem dado" com desenho próprio                  | `QueryErrorState` e `EmptyState`                                                                        | Os estados do sistema.                           |
| Gestão sem identificação                               | `VendoDeOutro` ("Vendo os 65 de Ana · voltar para os meus")                                             | Mesmo padrão da Fila.                            |

Não mudou: a escolha (`escolherEmAtendimento`, trava de 65), o modo sombra, o
prazo "toque até dd/mm para manter". Teste ajustado:
`tests/em-atendimento-fatia2.test.tsx` (o "3/65" virou o anel acessível e os
números).

### Painel do Gestor e Fila Única

Só trocam o markup local pelas peças (`SeloAoVivo`, `CartaoPrincipal`,
`Painel`, `VendoDeOutro`), com o mesmo resultado na tela.
`tests/bi-lancamento.test.tsx` passou a procurar `<SeloAoVivo` dentro da aba
Dia em vez do `<span>` antigo.

### Comissões (`/financeiro` → Comissões)

- **Filtros:** Período, Status e Beneficiário foram para um `FiltrosMenu` na
  linha logo acima da tabela, com o estado em texto ("Outubro de 2026 · todos
  os status · todos os beneficiários"). Contam como ativos os que saem do
  padrão (status, beneficiário, período fora do mês corrente); "Limpar
  filtros" volta ao mês corrente. O "Limpar" do estado vazio continua levando
  a "Todo o período", como antes.
- **Cabeçalho:** "Exportar" é a única ação; descrição em uma frase.
- **Totais:** só Valor e Líquido. O VGV não se repete, porque é o primeiro número
  do topo. `computeTotais` não mudou.
- **Vendas do período (distrato e exclusão):** atrás de "Ver vendas do
  período", no fim, só para a gestão. O quadro só monta, e a consulta só
  roda, quando alguém abre.
- **"…" da linha:** é o `AcoesLinha` compartilhado, com os mesmos itens e
  condições de antes.

Ficou de fora do mockup, de propósito: "Pagar"/"Atribuir" visíveis na linha e
uma busca. Os dois seriam comportamento novo. Testes:
`tests/comissoes-lancamento.test.tsx`.

### Oferta Ativa, detalhe da lista (`/oferta-ativa/$ofertaId`)

- **Cabeçalho:** um título só, sem a seta de voltar (a trilha do header leva de
  volta), com o status ao lado do nome.
- **Números:** três `StatTile`: Total ("na lista desde dd/mm"), Contatados e
  Avançados, com % e barra. São os números de `computeOfertaStats`, com as
  explicações no tooltip.
- **Faixa de 100%:** sem emoji, em `success`: "Todos os N leads desta lista já
  foram contatados."
- **Filtros:** busca e Contato à vista; as etapas atrás de `FiltrosMenu`.
- **Linha:** WhatsApp é a ação visível. Ligar, Abrir lead e a troca de etapa
  vão para o "…", montado como o da Fila Única (`fila-card.tsx`), porque a
  troca de etapa é o funil inteiro com as permissões por papel
  (`LeadStageMenuItems`) e não cabe nos itens simples do `AcoesLinha`.
- **Pequenos acréscimos:** o nome do lead virou link para o lead, e a coluna
  "Status" virou "Etapa".

Testes: `tests/oferta-lista-lancamento.test.tsx`.

### Aula da Academia (`/academia/modulo/$codigo/aula/$ordem`)

- **Cabeçalho:** `PageHeader` com o eyebrow explícito ("Módulo 10 · {módulo} ·
  Aula N de M"). O número vem do shell (`useModuloAtual`), então nunca discorda
  da sidebar. O botão "← módulo" saiu, porque a trilha do header leva de volta.
- **Ações:** no desktop ficam numa linha no fim do texto; no celular, no
  `StickyActionRail`. A barra fixa caseira e os `p-4 md:p-6` saíram.
- **Não mudou:** marcar/desmarcar, a navegação "Próxima / Voltar ao módulo",
  o vídeo, os slides e o markdown. O treino prático do onboarding não foi
  tocado.

### Planilha de amortização (`/simulador-amortizacao`)

- **Ordem do Resumo:** a "Leitura para o cliente" (a mesma frase do PDF) vem
  primeiro, como cartão principal. Depois, três `StatTile` com SAC e PRICE lado
  a lado: 1ª parcela, Renda mínima (30%), em vermelho acima de 30% quando há
  renda informada, e Total pago. A tabela de 15 linhas fica atrás de "Ver
  comparativo completo".
- **O que saiu:** os três `Kpi` que repetiam o formulário (valor, juros,
  correção). A taxa mensal com 4 casas só existia ali; a conversão
  nominal/efetiva continua na dica do formulário.
- **Ações e textos:** "Exportar PDF" é a única ação navy; "Fluxo das
  construtoras" virou link discreto; o aviso legal ficou numa linha.
- **Não mudou:** o formulário, as contas (`lib/amortizacao`), as abas, o PDF e
  o texto copiado.

### Materiais (`/projetos-materiais`)

- **Topo:** os quatro `StatTile` e a barra de progresso viraram um `Placar`. O
  anel mostra "prontos para a prateleira" (N de M), e os números são o trabalho
  que sobra: Sem book · Sem tabela · Sem capa · Sem preço, em âmbar só acima
  de zero. "Sob consulta" continua contando como preço.
- **Ações:** "Colar lista" é a ação navy; "Ver a prateleira" é contornada.
- **Grupos:** usam `SectionHeader`, com estrela dourada só para construtora
  parceira.
- **Espaçamento:** saiu o `p-6 pb-24`. O `pb-20` só entra enquanto a barra de
  Salvar está na tela.

Testes das três telas acima: `tests/fase1-telas-consulta.test.tsx`.

## Validação da Fase 1

`tsc --noEmit` limpo; eslint e prettier limpos nos arquivos tocados; suíte
completa com 254 arquivos e 2750 testes verdes (antes da fase: 249 e 2709).
Testes que já existiam e foram ajustados: só `bi-lancamento` e
`em-atendimento-fatia2`, os dois descritos acima. Nenhum teste foi pulado ou
desligado.
