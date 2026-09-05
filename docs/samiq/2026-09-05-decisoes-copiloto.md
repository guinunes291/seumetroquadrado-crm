# SamiQ como copiloto do corretor — as 20 decisões (05/09/2026)

> Registro das respostas do dono às 20 perguntas feitas em 05/09/2026 para transformar a Sami
> de "assistente que sugere texto" em copiloto que **lê a carteira inteira e registra no CRM
> enquanto o corretor conversa com ela**. Benchmark declarado: a Elô (Grupo Direcional), que em
> 12 meses chegou a 56 mil conversas, 4 mil corretores, 0,4% de fallback e nota 8,9 — e cuja
> virada de adoção foi **conectar a assistente à carteira do corretor no CRM**.
>
> Cada decisão está amarrada ao código atual. Nada aqui foi implementado ainda.

---

## 1. Estado atual (o que o código faz hoje)

| Peça | Onde | O que faz | Limite que a decisão remove |
| --- | --- | --- | --- |
| Painel ⌘J / bottom-drawer | `src/components/samiq/samiq-panel.tsx`, `samiq-launcher.tsx` | Chat leve + grade de 10 ações rápidas | Contexto = só o lead da rota `/leads/$id` (regex); thread morre ao fechar |
| Catálogo de ações | `src/lib/samiq.ts` | 11 ações somente-leitura; sugestões viram copiar/navegar | "O SamiQ SUGERE, o corretor decide. Nada aqui escreve no banco" |
| Execução | `src/lib/samiq.functions.ts` | `generateText` sem ferramentas; contexto pré-montado por ação | Sem tool-calling, sem multi-passo, sem escrita |
| Governança | `samiq_prompt_versions` (v2 `samiq-2026-08-v2`), `samiq_politica`, `samiq_execucoes` | Prompt/modelo versionados, quota distribuída, telemetria sem conteúdo | System prompt diz "você não possui ferramentas de escrita" |
| PII | `src/lib/samiq-governance.ts` | Só primeiro nome; telefone/CPF/endereço/banco bloqueados | Não dá para responder "quem tem visita amanhã?" por nome |
| Sami do WhatsApp | n8n + `supabase/functions/sami-agendar-visita`, `sami-consultar-agenda`, `sami-anexar-documento` | Escrita server-to-server com `x-sami-key` e escopo no código | Cérebro separado do painel; prompt fora do banco versionado |
| Fontes não ligadas | `chamadas.gravacao_url` (Sonax), `mensagens` (Fase 7a, simulada), Web Speech no `modo-visita` | Existem, ninguém as lê para registrar | Adiadas por decisão (D6) |

Modelo ativo: `google/gemini-3-flash-preview` via gateway Lovable. Cotas: 60 req/10 min por usuário,
600 por equipe, 60k tokens/dia por usuário.

---

## 2. As 20 decisões

### Bloco A — Doutrina e limites de escrita

| # | Tema | Decisão | Por quê / implicação no código |
| --- | --- | --- | --- |
| D1 | Autonomia | **Confirmar com 1 toque.** A Sami monta um card com a ação preenchida; o corretor confirma. | Mantém "IA sugere, humano decide". Escritas do modelo devolvem uma **proposta** (nunca gravam); a gravação acontece num endpoint separado, com o supabase do usuário (RLS). |
| D2 | Escritas permitidas | **Todas as quatro famílias**: (a) interações, notas e follow-ups; (b) agenda de visitas; (c) etapa do funil e perda; (d) qualificação e documentos. | (a) reusa o caminho do `RegistrarContatoDialog` + `garantirFollowUpAberto`; (b) reusa a lógica de `sami-agendar-visita`; (c) só via `transicionarLead`, coletando na conversa os campos dos 4 modais obrigatórios; (d) `leads.renda_informada/usa_fgts/temperatura/objecoes/resumo_qualificacao` e `documentacoes.status`. |
| D3 | Envio ao cliente | **Nunca envia.** Só rascunho para copiar/abrir no WhatsApp. | Não depende da decisão D1 do roadmap (provedor). O system prompt mantém "nunca envie mensagens". |
| D4 | Modelo | **Manter Gemini Flash e medir.** | Instrumentar taxa de erro de ferramenta e fallback em `samiq_execucoes` antes de trocar. Critério sugerido de troca: erro de ferramenta > 5% ou fallback > 2% sustentado por 2 semanas. |

### Bloco B — Registro por conversa

| # | Tema | Decisão | Por quê / implicação |
| --- | --- | --- | --- |
| D5 | Extração passiva | **Pacote único para confirmar.** "Liguei pra Maria, achou a parcela alta, retorno sexta" vira UM card com 3 itens editáveis (interação + objeção + follow-up). | Uma confirmação, não três. O modelo devolve `propostas[]` tipadas; a UI agrupa por turno. |
| D6 | Fontes automáticas | **Só o chat por agora.** Gravações Sonax, threads de `mensagens` e notas de voz ficam para depois. | Entregar extração pelo chat, medir adoção, ligar outras fontes com dado. |
| D7 | Atribuição | **Autor = corretor + marca "via Sami".** `autor_id` do corretor, `metadata.origem = 'samiq'` + `execution_id`, selo na timeline, **Desfazer por 24 h**. | Score, temperatura, metas diárias e ranking leem `interacoes` assumindo autor = corretor; nada quebra. Permite medir "quantos registros a Sami fez" e reverter em lote. |
| D8 | Voz | **Ambos**: microfone no painel (Web Speech, mobile primeiro) **e** áudio pelo WhatsApp da Sami (depende de D15). | Corretor na rua dita 30 s e a Sami registra. O áudio no WhatsApp entra quando o cérebro for único. |

### Bloco C — Contexto, arquitetura e memória

| # | Tema | Decisão | Por quê / implicação |
| --- | --- | --- | --- |
| D9 | Escopo de leitura | **Carteira inteira por ferramentas.** | Ferramentas tipadas reusando `atendimento_inbox_v4`, `pipeline_snapshot_v2`, `agendamentos`, `tarefas`, `documentacoes`, `leads_search_v2`. Com o supabase do usuário, o RLS limita sozinho. |
| D10 | Arquitetura | **Tool-calling no servidor** (AI SDK já instalado), loop multi-passo em `samiq.functions.ts`. | Catálogo zod de ferramentas de leitura e de escrita; escritas retornam proposta. Reusa governança (`samiq_reservar_execucao`) — o teto de passos entra na política. |
| D11 | Memória | **Conversas persistidas com retenção**: tabela por corretor, RLS própria, PII redigida antes de salvar, 90 dias. | "Continuar de onde parou" + matéria-prima para auditar qualidade e evoluir prompts com conversas reais (método da Elô). Revoga a decisão de julho de não guardar conteúdo — registrar no Decision Log. |
| D12 | PII | **Nome completo liberado; telefone, CPF, endereço e banco continuam bloqueados.** Modelo devolve ids; a UI monta links e números. | Ajustar `BLOCKED_KEYS`/`firstNameForSamiQ` e `TITLE_CASE_FULL_NAME_PATTERN` só para campos estruturados de lead. Texto livre continua com a camada agressiva. |

### Bloco D — Proatividade, papéis, canais e skills

| # | Tema | Decisão | Por quê / implicação |
| --- | --- | --- | --- |
| D13 | Proatividade | **Briefing ao abrir + alertas.** | Ao abrir o painel/home: "hoje: 2 visitas, 1 sem confirmar, 3 follow-ups vencidos, pasta da Maria travou" com botões. Alertas em eventos críticos (visita amanhã sem confirmação, crédito reprovado) pela notificação do CRM. Fonte: `atendimento_inbox_v4` + `painel-dia/derive.ts`. |
| D14 | Gestor | **Fase 2.** Primeiro o corretor completo. | Quando entrar: ferramentas de gestão (`gestao_painel_dia`, funil por corretor) com o supabase do gestor. |
| D15 | Unificação | **Um cérebro, dois canais.** Catálogo de ferramentas + prompt versionado no banco = fonte única. CRM chama direto; n8n vira transporte e chama `/api/sami`. | As edge functions `sami-*` viram ferramentas do catálogo (mesma lógica de escopo por corretor). Uma correção de prompt vale nos dois canais. |
| D16 | Skills como ferramentas | **Todas as quatro**: pré-análise MCMV determinística; preparador de visita; qualificação 7 dimensões; curador com estoque real. | A calculadora MCMV é portada para TypeScript como ferramenta pura — o modelo **nunca** faz aritmética de parcela. Preparador pode ser proativo no dia anterior à visita (liga com D13). Qualificação preenche os campos de D2(d). Curador precisa de unidades/tabela reais, não só o catálogo resumido de hoje. |

### Bloco E — Qualidade, orçamento, superfície e rollout

| # | Tema | Decisão | Por quê / implicação |
| --- | --- | --- | --- |
| D17 | Qualidade | **Nota por resposta (👍/👎 com motivo opcional) + taxa de fallback + aceitação de propostas + painel em Configurações.** | Sem isso a evolução é palpite. Tabela `samiq_avaliacoes` ligada a `samiq_execucoes`; propostas guardam `aceita/editada/rejeitada`. |
| D18 | Orçamento (D8 do roadmap) | **Teto mensal por papel + alerta em 80%**, degradando para somente-leitura ao estourar. **Valor em R$ ainda não informado.** | Novas colunas em `samiq_politica` (`max_cost_corretor_micros_mes`, `max_cost_equipe_micros_mes`) + alerta ao gestor. Pendência: definir o número. |
| D19 | Superfície | **Painel + chips contextuais.** | Gatilhos onde o trabalho acontece: card de Atender ("Sami: registrar esta ligação"), dossiê ("resumo", "próximo passo"), ao encerrar chamada do Sonax. O painel abre já com lead e intenção. |
| D20 | Rollout | **Todos de uma vez, com escrita em modo confirmar.** | Sem grupo de controle. Mitigações obrigatórias: card de confirmação (D1), desfazer 24 h (D7), kill switch por `prompt_version` (voltar para a v2 desliga as ferramentas) e teto de custo (D18). |

---

## 3. Tensões e pendências que as respostas deixam

1. **Valor do teto de IA (D18).** A opção escolhida pede um número por corretor e por equipe. Sem
   ele, a política nasce com o teto herdado (60k tokens/dia), que provavelmente aperta com
   tool-calling. Sugestão de partida: medir 2 semanas e fixar em 1,5× o p90 observado.
2. **LGPD (D11 + D12).** Persistir conversas por 90 dias e liberar nome completo ao gateway muda o
   que sai do CRM. Precisa constar na política de privacidade interna e no termo dos corretores.
   PII de texto livre continua redigida antes de salvar.
3. **Modelo × tool-calling (D4 + D10).** Gemini Flash com muitas ferramentas pode escolher a
   ferramenta errada ou alucinar argumentos. O card de confirmação (D1) é a rede; a métrica de erro
   de ferramenta (D17) é o gatilho de troca.
4. **Rollout sem piloto (D20).** A Elô cresceu por iteração sobre conversas reais. Sem grupo de
   controle, a leitura das conversas persistidas (D11) nas duas primeiras semanas vira o "piloto".
5. **Áudio no WhatsApp (D8) depende de D15.** Só entra depois de `/api/sami` existir; até lá, só o
   microfone no painel.
6. **Gestor em fase 2 (D14)** mas alertas (D13) já tocam em exceções do Painel do Dia: os alertas
   desta fase são só os da carteira do próprio corretor.

---

## 4. Arquitetura resultante

```
corretor ──(painel ⌘J / chips / microfone)──► perguntarSamiQ (server fn)
                                                   │ reserva (quota, prompt_version, teto de passos)
                                                   ▼
                                       loop de ferramentas (AI SDK)
                                       ├─ leitura: inbox, funil, agenda, tarefas, docs, busca lead,
                                       │           catálogo/estoque, calculadora MCMV (pura)
                                       └─ escrita: devolvem PROPOSTA tipada, nunca gravam
                                                   │
                                                   ▼
                              resposta = texto + propostas[] + sugestoes[]
                                                   │
                        UI renderiza card "Registrar N itens?" ──► confirmarPropostaSamiQ
                                                                     │ supabase do usuário (RLS)
                                                                     │ metadata.origem='samiq'
                                                                     │ execution_id, desfazer 24h
                                                                     ▼
                                              interacoes · tarefas · agendamentos · transicionar_lead
                                              leads (qualificação) · documentacoes

n8n (WhatsApp) ──► /api/sami (mesmo loop, corretor resolvido por telefone) ──► mesmas ferramentas
```

Tabelas novas: `samiq_conversas` (mensagens por corretor, PII redigida, retenção 90 d),
`samiq_propostas` (proposta, status aceita/editada/rejeitada, ids gravados para desfazer),
`samiq_avaliacoes` (👍/👎 + motivo). Política ganha teto mensal por papel e teto de passos.

---

## 5. Ondas de entrega sugeridas (cada uma cabe em PRs pequenos)

| Onda | Entrega | Decisões cobertas |
| --- | --- | --- |
| **S1 — Fundação** | Tool-calling somente-leitura sobre a carteira; nome completo; conversas persistidas; 👍/👎 e contador de fallback; teto de passos e custo por papel na política | D4, D9, D10, D11, D12, D17, D18 |
| **S2 — Escrita** | Propostas + card de confirmação; interações/notas/follow-ups; agenda; etapa via `transicionarLead`; qualificação/docs; marca "via Sami" e desfazer 24 h; extração passiva em pacote | D1, D2, D5, D7 |
| **S3 — Presença** | Briefing ao abrir; alertas da própria carteira; chips no card de Atender, dossiê e pós-chamada; microfone no painel | D8 (parte), D13, D19 |
| **S4 — Um cérebro** | `/api/sami` para o n8n; edge functions `sami-*` viram ferramentas; áudio pelo WhatsApp | D8 (parte), D15 |
| **S5 — Skills** | Calculadora MCMV em TS; preparador de visita (proativo D-1); qualificação 7 dimensões; curador com estoque real | D16 |
| **Depois** | Modo gestor; fontes automáticas (Sonax, `mensagens`) | D6, D14 |

Ordem: S1 → S2 são pré-requisito de tudo. S3 e S5 podem andar em paralelo depois de S2. S4 depende de S2.

---

## 6. Métricas (espelho das da Elô)

| Métrica | Fonte | Meta inicial |
| --- | --- | --- |
| Conversas por corretor por mês | `samiq_conversas` | ≥ 7 (número da Elô) |
| Corretores ativos na semana / total | `samiq_execucoes` | ≥ 60% |
| Taxa de fallback ("não consegui") | `samiq_execucoes.error_code` + marcação na resposta | < 2%, tendendo a < 1% |
| Nota média (👍 / total avaliadas) | `samiq_avaliacoes` | ≥ 85% de 👍 |
| Propostas aceitas sem edição / propostas | `samiq_propostas` | ≥ 70% |
| Registros via Sami / registros totais | `interacoes.metadata.origem` | crescente; sinal de que a timeline deixou de depender da disciplina |
| Latência p50 / p95 | `samiq_execucoes.latency_ms` | p95 < 8 s com ferramentas |
| Custo por corretor por mês vs teto | `samiq_execucoes.estimated_cost_micros` | dentro do teto D18 |
