# Modo Obrigatório do corretor

Data: 2026-09-27. Migration `20261002120000_modo_obrigatorio.sql` (Drizzle `0015`).

## Por quê

Números de produção de 26/09/2026, olhando a semana:

- 195 leads passaram pela cadência;
- 0 toques foram registrados pelos botões da Fila do Dia;
- 170 leads (87%) não tinham nenhum contato registrado;
- 137 voltaram à roleta porque a etapa venceu.

O CRM sugeria o trabalho, mas o corretor podia ignorar.

Decisão do dono: o CRM passa a **obrigar**. Enquanto houver pendência obrigatória, o corretor só acessa:

- a tela do processo (`/obrigatorio`);
- a ficha dos leads que estão na lista;
- o hub de projetos (projeto, projetos-foco, materiais e vitrine), para consulta.

Quando a lista zera, o CRM volta ao normal.

## O que é pendência obrigatória

| Tipo         | Entra quando                                                                                                                                         | Sai quando                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cadência     | O lead está em Lead chegou, 1º ou 2º follow-up ou encerramento, com prazo hoje ou vencido                                                            | A etapa do dia fecha: 2 ligações com 2 min de intervalo + WhatsApp, ou a mensagem de encerramento |
| Fundo parado | O lead está agendado, com visita realizada, proposta ou análise de crédito, e está parado há N dias (padrão 5) **ou** não tem próximo passo com data | O corretor registra o contato e marca o próximo passo com data                                    |

Três casos ficam de fora da lista, porque nunca poderiam ser cumpridos e travariam o corretor para sempre:

- telefone suspeito (a RPC de tentativa recusa esses leads);
- lead com opt-out;
- cadência que vence amanhã.

## Ordem

Regras fixas no banco, auditáveis, sem IA. Regra do dono: **lead novo sempre primeiro.**

1. Lead chegou hoje. Quem espera há mais tempo vem primeiro.
2. Lead chegou atrasado. O mais recente vem primeiro, porque é o mais quente.
3. 1º follow-up, 2º follow-up e encerramento atrasados. O prazo mais antigo vem primeiro.
4. Fundo parado. Proposta e análise de crédito vêm antes de visita realizada, que vem antes de agendado. Dentro de cada um, o mais parado primeiro.
5. 1º follow-up, 2º follow-up e encerramento que vencem hoje.

A trava é contínua. O front consulta de novo a cada 1 minuto, então um lead que chega às 15h trava o corretor de novo e já entra no topo.

## Quem é travado

- É travado só quem tem apenas o papel **corretor**.
- Gestão (admin, gestor, superintendente) e SDR nunca são travados.
- A trava depende de `gestao_config.modo_obrigatorio.ativo = true`. Nasce **desligada**.

**"Liberar hoje"**, no Painel do Dia:

- a gestão libera um corretor até o fim do dia, com motivo obrigatório;
- a liberação é auditada em `modo_obrigatorio_liberacoes`;
- a lista continua visível; só a trava sai.

## Como a trava funciona

**A fonte da verdade é o banco.** `modo_obrigatorio_v1()` devolve a lista, a ordem e `travado`.

**No front, duas camadas leem a mesma query:**

- `beforeLoad` do shell e do `/inicio` redireciona para `/obrigatorio` antes de renderizar;
- `ModoObrigatorioGuard` cuida da trava que liga no meio da sessão (pelo polling).

**Menus:** sidebar, ⌘K e barra de baixo mostram só "Processo obrigatório" e "Projetos". Somem também a busca, "Registrar venda" e a Sami.

**Fail-open:** se a RPC falhar ou devolver algo inesperado, o corretor **não** é travado e o erro vai para o console. Um bug nosso não pode trancar o time fora do CRM.

**Limite conhecido:** a trava é de navegação. Ela não bloqueia a leitura de dados no banco, porque a própria tela do processo e a ficha precisam ler. Contornar exige ferramenta de desenvolvedor.

## Telas

- **`/obrigatorio`:**
  - o card de cadência usa os mesmos botões da Fila do Dia (Liguei, WhatsApp, Cliente respondeu);
  - o card de fundo parado usa o mesmo "o que aconteceu?" da Fila Única;
  - todo card tem **Ver projeto** e **Vitrine**.
- **Ficha do lead:** ganhou **Ver projeto** e **Vitrine** ao lado de "Perguntar à Sami", sempre visíveis.
- **Painel do Gestor, aba Dia, seção "Processo obrigatório":**
  - pendências por corretor, com Liberar hoje;
  - para o admin, o liga/desliga e os dias do fundo parado.

## Implantação

1. Merge com o modo desligado. Nada muda para o corretor.
2. **Ensaio:** a seção no Painel do Dia mostra o tamanho da fila de cada corretor.
3. Ligar pelo interruptor da seção (admin).
4. Depois de 2 ou 3 dias com toques sendo registrados, religar a devolução por vencimento da cadência, que foi pausada em 26/09:

   ```sql
   SELECT cron.schedule('cadencia-vencidos', '0 11 * * *',
     $cron$SELECT public.cadencia_vencidos();$cron$);
   ```
