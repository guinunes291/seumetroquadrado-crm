# Revisão completa — Projetos em Foco (`/projetos-foco`) → Prateleira de Empreendimentos

**Data:** 2026-09-02 · **Escopo:** `src/features/projetos/projetos-foco-page.tsx` e o ecossistema
que a página monta (parceiras, campanhas `projeto_foco`, Materiais, Vitrine, catálogo, ficha).
Cruzado com dados reais de produção (MCP do CRM) e com as auditorias anteriores
(`docs/revisao-crm.md`, `docs/auditoria/ux-ia-2026-08/*`).

Formato: diagnóstico → decisões do dono (28 perguntas respondidas) → plano em camadas →
critérios de aceite → pendências conscientes.

---

## 1. Diagnóstico em uma frase

A página hoje é uma lista de links bem organizada, não uma prateleira. O maior obstáculo
para virar um e-shop não é visual, é dado: preço, capa, zona e metragem estão vazios ou
errados em boa parte do estoque, e nenhum card bonito sobrevive a isso.

## 2. Números de produção que mudam a leitura (MCP do CRM, 02/09/2026)

| Fato observado                                        | Valor                     |
| ----------------------------------------------------- | ------------------------- |
| Projetos ativos que a página carrega de uma vez       | **918**                   |
| Zona Sul / Oeste / Leste / Norte                      | 330 / 151 / 98 / 48       |
| Centro, Grande SP ou sem zona reconhecida             | 291                       |
| Projetos com preço "a partir de" abaixo de R$ 300 mil | 81                        |
| Cury: projetos com preço preenchido                   | **0 de 33**               |
| Mundo Apto: projetos com preço preenchido             | **0 de 18**               |
| Renda mínima preenchida (amostra de 80 projetos)      | 0                         |
| Metragem acima de 150 m² em produto MCMV (amostra)    | maioria — dado corrompido |

Exemplos reais do dado corrompido: "Lift Vila Das Belezas" com 240 m² e R$ 175 mil;
"MK8 Ipiranga" 170–670 m²; "Condominio Village da Serra" 10.000 m². Padrão de vírgula
decimal perdida na origem (24,0 → 240).

## 3. O que a página é hoje e onde quebra

1. **Carrega o estoque inteiro de uma vez.** Uma consulta com 45 colunas para 918 linhas,
   renderização plana sem paginação nem virtualização. Catálogo e Vitrine repetem a mesma
   consulta com caches separados: a base é baixada três vezes ao circular entre as telas.
2. **Só o item em campanha tem cara de produto.** Apenas o card "Em foco" mostra imagem, em
   faixa de 28 px sob véu navy de 45%. O resto é uma linha de texto com quatro botões.
3. **Parceiras aparecem sem preço.** Cury e Mundo Apto não têm `preco_a_partir`; sem a flag
   `sob_consulta` marcada, o card fica mudo (o rótulo só aparece com a flag).
4. **Metragem corrompida na origem** (ver §2). Vai para o chip do card e para o resumo colado
   no WhatsApp do cliente.
5. **Zona some para quem mais precisa.** "Grande SP" não é reconhecido pela normalização e cai
   em "Sem zona" (Guarulhos, Osasco, ABC). Vivaz inteira vem com bairro "Sao Paulo" e zona
   vazia. Bairros com sufixo " - Sao Paulo" duplicam a cidade no chip.
6. **Parceira mal casada por nome.** "Mundo APTO Voluntários da Pátria" está com construtora
   vazia e cai em "Sem construtora informada". O casamento só olha a coluna `construtora`.
7. **Filtros de lista, não de loja.** Só zona e construtora. Sem preço, dormitórios, entrega,
   material, renda ou faixa MCMV. Ordenação alfabética por grupo.
8. **Parede de chips.** Centenas de construtoras viram um bloco de chips que empurra o
   primeiro produto para baixo da dobra, pior no celular.
9. **Sem frescor nem demanda.** Nada de "tabela atualizada há X dias", "N leads em 30 dias",
   "N vendas". O banco tem tudo (leads.projeto_id, vendas.projeto_id, updated_at).
10. **Campanha sem urgência.** `projeto_foco.fim` existe, mas "termina em X dias" não aparece.
11. **Sacola em outra loja.** Vitrine tem shortlist, comparação e link seguro; a bancada não.
12. **Cinco cards para o mesmo produto.** Catálogo, card em foco, linha da bancada, painel da
    Vitrine e card público. Cada melhoria visual é feita cinco vezes.
13. **Capa sem ferramenta de preenchimento em massa.** Só o formulário completo, um a um, admin.
14. **KPIs ocupam o melhor espaço.** Três StatTiles sem valor de decisão para o corretor no
    lugar do banner de campanha.

**O que está bom e fica:** estados de erro/vazio/carregamento, acessibilidade dos chips,
resumo para WhatsApp (testado), ordem "campanha → parceiras → resto".

## 4. Decisões do dono (28 perguntas, 02/09/2026)

| #   | Pergunta                  | Decisão                                                                                  |
| --- | ------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Origem/frequência da base | Mistura (tabelão + manual). Corrigir no importador **e** no banco.                       |
| 2   | Metragem 240 m² em studio | Vírgula perdida. Dividir por 10 com regra de sanidade (>150 m² em produto < R$ 600 mil). |
| 3   | Cury/Mundo Apto sem preço | Falta de preenchimento → entra no Materiais em massa (coluna de preço).                  |
| 4   | Grande SP                 | Vira zona de primeira classe (Norte, Sul, Leste, Oeste, Centro, **Grande SP**).          |
| 5   | Dono da qualidade do dado | Gestão corrige (inline + Materiais); corretor **reporta erro** pelo card.                |
| 6   | Score de completude       | Visível para gestão; **esconder da prateleira** o que está abaixo do mínimo.             |
| 7   | Dispositivo               | Meio a meio: vitrine no celular, mesa de trabalho no desktop, mesmos dados.              |
| 8   | Pergunta nº 1 do corretor | **"O que cabe na renda deste cliente?"** → renda no topo, prateleira reorganiza.         |
| 9   | Curadoria                 | Curado: campanhas e parceiras no topo, resto abaixo por relevância, nada some.           |
| 10  | Comissão no card          | Só gestor e admin.                                                                       |
| 11  | Estilo do card            | Híbrido: foto grande + 3 números no celular; grade densa 4–5 por linha no desktop.       |
| 12  | Sem foto                  | Gradiente navy + inicial/logo da construtora.                                            |
| 13  | Logos das construtoras    | Temos e podemos usar → campo `logo_url` na parceira.                                     |
| 14  | Banner de campanha        | Arte própria se houver (`projeto_foco.arte_url`), capa do projeto como fallback.         |
| 15  | Grade ou lista            | Grade no celular; no desktop a escolha é lembrada por usuário.                           |
| 16  | Sacola                    | Unificar com a shortlist da Vitrine: escolhe aqui, gera link dali.                       |
| 17  | Enviar para lead          | Registra interação no lead, como a Vitrine.                                              |
| 18  | Comparar 2–3              | Sim, uso real (reaproveita a comparação da Vitrine).                                     |
| 19  | Simulação MCMV            | Estimativa inline "Cabe na renda?" (PRICE, 30% da prestação total, com aviso).           |
| 20  | Badges                    | "Preço/tabela atualizada" (além de Em foco e Parceira já existentes).                    |
| 21  | Favoritos                 | Sim, por corretor.                                                                       |
| 22  | Campanhas                 | Contagem regressiva + programar campanhas futuras (início no futuro).                    |
| 23  | Capa/galeria              | Gestão pelo Materiais em massa + extração automática da 1ª página do book (fase 2).      |
| 24  | Painel de saúde           | Não agora (o score de completude no Materiais cobre o básico).                           |
| 25  | Sinais de demanda         | Leads 30d, vendas e envios visíveis para todos.                                          |
| 26  | Arquitetura               | RPC paginada com fallback no cliente.                                                    |
| 27  | Convergência de telas     | Separadas, mas com **card e cache únicos**.                                              |
| 28  | Métricas de sucesso       | Envios/corretor/semana · tempo até 1º book · visitas com projeto · leads com projeto.    |

## 5. Plano em camadas

### Camada 0 — Dados (pré-requisito de tudo)

- `src/lib/projetos-saneamento.ts`: `saneiaMetragem` (regra da decisão 2, idempotente),
  `saneiaLocal` (bairro/cidade: remove " - Sao Paulo", extrai "(Guarulhos)"),
  aplicado na leitura da prateleira, do resumo de WhatsApp e no importador.
- `src/lib/zonas.ts`: `Grande SP` como zona de projeto (`ZonaProjeto`), detectada por
  `zona_smq`/`regiao`/`cidade`/`bairro`. `ZONAS_ORDEM` (leads/distribuição) segue com 5 zonas.
- `src/lib/construtoras.ts`: `parceiraDoProjetoOuNome` — sem construtora, casa pelo nome.
- `src/lib/projetos-completude.ts`: score 0–100 com pesos e `prontoParaPrateleira`
  (zona conhecida **e** book ou tabela). Campanha em foco sempre aparece.
- `src/lib/mcmv-estimativa.ts`: PRICE, faixas (CCFGTS 03/2026), prestação total com MIP/DFI/
  taxa adm, `avaliarRenda(renda, preco)`; taxas conservadoras (teto da faixa).
- Migration `20260902120000_prateleira_projetos.sql`: `projeto_eventos` (book, tabela, envio,
  resumo, sacola), RPC `projetos_demanda_v1` (leads 30d, vendas, envios), `projeto_foco.arte_url`,
  `construtoras_parceiras.logo_url`, correção de metragem com tabela de backup.
- Materiais em massa: colunas de **capa** e **preço**, colagem com 5 colunas, filtro "falta algo".

### Camada 1 — A prateleira

- Um único `ProdutoCard` (grade/lista) usado pela prateleira (e, em seguida, pelas outras telas).
- Topo: renda do cliente (chips R$ 3/4/5/7/10 mil) → "Cabe na renda?" por card + filtro.
- FilterBar: zona (com Grande SP), construtora (parceiras primeiro), preço, dormitórios, entrega,
  com material, favoritos. Ordenação: relevância, menor/maior preço, entrega, mais novos, mais
  enviados. Grade/lista por usuário (`usePreference`).
- Banner de campanhas (Embla) com arte/capa, motivo e "termina em X dias".
- Corredores: Em foco → Parceiras (logo + contagem) → Outras construtoras. Carregamento
  incremental de 24 em 24.
- Sacola = `VitrineShortlist`; Enviar = `EnviarVitrineDialog` + `useWhatsAppLead` (registra).
- Demanda por card via `rpcWithFallback(projetos_demanda_v1)`; eventos gravados em `projeto_eventos`.
- Incompletos escondidos por padrão; gestor/admin tem o toggle "mostrar incompletos" e o link para
  Materiais. Botão "Reportar erro" no card abre pendência (fase 1b).

### Camada 1b — Servidor

- RPC `projetos_prateleira_v1(filtros, ordenacao, offset, limit)` + `projetos_prateleira_facetas_v1`
  com fallback no cliente (decisão 26). Entra depois da UI estar validada em produção.

### Camada 2 — Comércio e inteligência

- Extração automática da capa a partir do book (edge function, decisão 23).
- Badge "Últimas unidades" quando unidades estiverem cadastradas.
- Recomendações por perfil do lead aberto (Match) e "mais enviados da semana".

## 6. Critérios de aceite (Fase 0 + 1)

- Nenhum card mostra metragem > 250 m² em produto < R$ 600 mil.
- Projetos de Guarulhos/Osasco/ABC aparecem no chip "Grande SP".
- "Mundo APTO Voluntários da Pátria" aparece no corredor Mundo Apto.
- Com renda R$ 4.000 informada, cards mostram "cabe" ou "não cabe" com a prestação estimada e
  o aviso de que não é aprovação.
- Book/Tabela abrem em 1 toque; Enviar registra interação; sacola gera link da Vitrine.
- Primeira pintura com no máximo 24 cards; "mostrar mais" carrega o restante.
- Sem a migration aplicada: a página funciona (sem demanda, sem eventos, sem arte).
- Gate: typecheck, lint, vitest, build, bundle e type-escape budgets verdes.

## 7. Métricas (decisão 28)

Fonte: `projeto_eventos` (envios, book/tabela abertos) + `leads.projeto_id` + `agendamentos`.
Leitura inicial no Materiais (gestão) e, depois, widget na Home do gestor.

## 8. Pendências conscientes

- Extração de capa do PDF do book (fase 2) — exige edge function/n8n com renderização de PDF.
- RPC paginada (camada 1b) — a UI nasce com fallback no cliente e virtualização por lotes.
- Botão "Reportar erro" grava em `projeto_eventos` (tipo `reportar_erro`) e aparece no
  Materiais; a fila de pendências dedicada fica para a fase 1b.
- Completude de capa/book/tabela na base não pôde ser medida pelo MCP (não expõe as colunas).

## 9. Entregue nesta rodada (branch `claude/projetos-page-review-optimization-1bt1cb`, 2026-09-02)

**Fase 0 — dados**

- `src/lib/projetos-saneamento.ts` (metragem ÷10 com sanidade, bairro/cidade), `src/lib/zonas.ts`
  (Grande SP), `src/lib/construtoras.ts` (`parceiraDoProjetoOuNome`), `src/lib/projetos-completude.ts`,
  `src/lib/mcmv-estimativa.ts`, `src/lib/renda.ts` — todos puros, com testes.
- Migration `supabase/migrations/20260902120000_prateleira_projetos.sql` (eventos, demanda, arte,
  logo, carimbos de atualização, correção de metragem com backup) + teste de contrato.
- Importador aplica o saneamento na prévia e na gravação. Materiais em massa com capa, preço,
  score de completude e filtro "falta algo".
- `src/integrations/supabase/pendentes.ts`: fronteira tipada única para os objetos novos
  (substitui `as never`/`as any` espalhados; type-escape budget mantido em 144/144).

**Fase 1 — prateleira**

- `ProdutoCard` (grade/lista), `BannerCampanhas` (arte → capa → gradiente, contagem regressiva),
  `RendaCliente` ("cabe na renda?" por card + "só o que cabe").
- Página `/projetos-foco` reescrita: filtros de loja, ordenação, grade/lista por usuário,
  corredores, carregamento incremental, sacola = shortlist da Vitrine, envio ao lead com registro,
  favoritos, reporte de erro, eventos e demanda via fallback. Aceita `?leadId`.
- Ficha: campanha programada (início futuro) e arte do banner; o foco anterior vale até o novo
  começar.

**Como aplicar em produção**

1. Aplicar a migration no projeto Supabase do CRM (ela é idempotente e faz backup da metragem).
2. Regenerar `types.ts` e remover `pendentes.ts` (ver comentário no arquivo).
3. Preencher capa e preço das parceiras no Materiais (Cury e Mundo Apto primeiro).
4. Subir os logos das parceiras em `construtoras_parceiras.logo_url`.
