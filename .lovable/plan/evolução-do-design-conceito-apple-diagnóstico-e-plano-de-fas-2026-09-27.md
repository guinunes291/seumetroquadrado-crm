# Evolução do design "conceito Apple" — diagnóstico e plano de fases

Esta entrega é só o diagnóstico que você pediu na "Primeira resposta". Nada será implementado ao aprovar este plano, além da Fase 0, e só se você der o "ok" nela.

Pendência sua: a lista de ITENS BLINDADOS veio vazia. Sugestão inicial para você confirmar ou editar: logo, paleta azul-marinho + dourado, cores dos 10 módulos, card do Kanban, cabeçalho e números do Financeiro/DRE, portal "Acesso aos Módulos", barra inferior do celular, tela do Ranking/Copa (Arena Aurum), Manual.

## 1. Inventário do design atual (extraído do código)

**Cores** — já centralizadas no arquivo de estilos, nos modos claro ("Clareza", o padrão) e escuro ("Modo Comando"):
- Marca: azul-marinho (texto e fundo base), dourado (destaque), com escalas de 50 a 950.
- Semânticas: principal, secundária, suave, destaque, perigo, sucesso, alerta, info, borda, gráficos 1–5, barra lateral.
- 10 cores de módulo com a mesma saturação (Central, Prospecção, Visita, Carteira, Follow-Up, Projetos, Financeiro, BI, Config, Pré-venda).
- Superfícies 1–3, "vidro", borda sutil.
- Fora dos tokens: 155 usos de cor fixa (branco, preto, vermelho…) em 48 arquivos.
- Dourado usado como cor de texto em 41 lugares.

**Tipografia**: Manrope (corpo) e Sora (títulos). Números com alinhamento tabular em 322 lugares. Texto menor que 12px em 148 lugares.

**Raios**: base de 8px, com escala do pequeno ao 4xl. Em uso: médio 196, redondo 140, grande 132, xl 106, 2xl 12, mais 4 valores avulsos (2, 3 e 5px).

**Sombras**: 4 níveis próprios (elev-1 a elev-4, com 83 usos), brilho dourado (9) e sombras genéricas do kit (sm/md/lg/xl, 41 usos), mais 4 brilhos avulsos.

**Movimento**: 5 animações próprias, de 0,2s a 0,45s, além de 2,4s no pulso. Há 24 carregamentos com ícone girando.

**Ícones**: uma única biblioteca (Phosphor, duotone) em 222 arquivos. Já consistente.

**Componentes**:
- 6 variações de botão (principal, contorno 356 usos, fantasma 199, secundário 95, perigo 25, link 3), além de um botão só de ícone.
- 4 selos básicos, mais selos próprios de status, temperatura e prazo.
- 3 famílias de card: card padrão (222), card de vidro e card de número (128), card de entidade.
- Janelas: diálogo, confirmação, painel lateral e gaveta (112 usos).
- Tabela, tabela de dados, abas, abas responsivas, barra de filtros, barra de ações em lote, barra de ações fixa.
- 184 controles com menos de 44px de altura.

## 2. Classificação

| Item | Classe | O que muda |
|---|---|---|
| Paleta marinho/dourado, 10 cores de módulo, modos claro/escuro | MANTER | — |
| Manrope + Sora, números tabulares | MANTER | Acrescentar tabular onde faltar (moeda, hh:mm) |
| Ícones Phosphor | MANTER | — |
| Níveis de sombra elev-1…4 | CONSOLIDAR | Viram o único padrão; sm/md/lg/xl passam para elev-1/2/3 equivalentes |
| Brilhos avulsos e brilho dourado | REFINAR | Ficam só em venda, meta batida e ranking |
| Raios | CONSOLIDAR | Padrão: médio para controles, xl para cards, redondo para selos; os 4 avulsos entram na escala |
| Botões | CONSOLIDAR | Mantêm-se as 6 variações; o "link" fica só em texto corrido |
| Cards | CONSOLIDAR | Card padrão vira a base; vidro só em painéis flutuantes; cards com borda fina em vez de sombra |
| Selos | CONSOLIDAR | O selo de status vira o padrão de etapa, e o básico fica para rótulos neutros |
| Texto < 12px (148) | SUBSTITUIR | Mínimo de 12px (legibilidade) |
| Controles < 44px no celular (184) | SUBSTITUIR | 44px no celular, tamanho atual no computador |
| Dourado como cor de texto (41) | SUBSTITUIR | Contraste abaixo de AA: trocar por marinho, e o dourado vira fundo ou fio |
| Cores fixas (155) | SUBSTITUIR | Passam para tokens. Sem isso, quebram no modo escuro |
| Ícone girando em tela cheia | REFINAR | Troca por esqueleto de carregamento |
| Animações | REFINAR | 180–250ms, respeitando "reduzir movimento" (o pulso fica só no que exige atenção) |

## 3. Páginas e menus
São 57 telas autenticadas, organizadas em 10 módulos pelo portal "Acesso aos Módulos". Os pontos com mais cliques, segundo a auditoria de UX de agosto e o código:
- Ficha do cliente abre página nova e perde a posição na lista.
- Mudar etapa, agendar visita e registrar ligação exigem abrir a ficha.
- Portal → módulo → tela: 2 cliques antes de trabalhar. O atalho Ctrl+K já existe, mas só em algumas telas.

O inventário completo, tela a tela (objetivo e contagem de cliques), sai como documento na Fase 0.

## 4. Melhorias de usabilidade (propostas, nada será implementado sem aprovação)
- **Ficha em painel lateral**: sem conflito, porque o painel lateral já existe. Entraria como opção na lista, e a página atual continua.
- **Busca Ctrl+K global**: já existe parcialmente. É só estender para nome, telefone e CPF.
- **Edições rápidas em janela**: o menu de etapa e as janelas de agendamento já existem. Seriam só expostas na lista.
- **Funil em 5 famílias**: tem conflito leve com as cores de status atuais. A proposta é agrupar só visualmente, com as etapas intactas.
- **Barra inferior no celular**: já existe e está blindada. Não muda.

## 5. Fases
- **Fase 0 — Tokens + /design-system** (visual idêntico): leva as 155 cores fixas e os valores avulsos para tokens e cria a página interna /design-system com tudo como está hoje. A mudança nas telas é nenhuma.
- **Fase 1 — Consolidação**, um componente por entrega: botão, card, selo, sombra/raio, texto mínimo e toque de 44px, dourado. Cada item muda pouco, mas aparece em todas as telas.
- **Fase 2 em diante — tela por tela**, na ordem que você escolher. Sugestão, com estimativa de quanto muda:
  - Leads/lista: médio
  - Ficha do cliente: médio
  - Pipeline/Kanban: pouco (o card é blindado)
  - Follow-Up: pouco
  - Pré-venda: pouco
  - Painel do Gestor: médio
  - Projetos: pouco
  - Financeiro por último: só troca de componente, com valores idênticos ao centavo

Critérios de cada entrega: lista antes/depois, arquivos alterados, confirmação de que nenhuma lógica mudou, conferência em 375px e 1440px sem rolagem lateral, nada fora dos tokens.

## Detalhes técnicos
- Os tokens ficam em `src/styles.css` (`@theme inline` + `:root`/`.dark`). As variantes ficam nos componentes de `src/components/ui`.
- A Fase 0 cria `src/routes/_authenticated/design-system.tsx`, só para admin.
- Fica proibido mexer em RPCs, migrations, `src/lib/leads.ts`, cálculos da DRE e comissões.
