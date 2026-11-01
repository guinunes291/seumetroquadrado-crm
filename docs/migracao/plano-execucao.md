# Plano de execução: saída do Lovable

> Complementa o [relatório da Fase 0](./fase0-relatorio.md). Decisões registradas em 01/11/2026.
> Regra de ouro: **nada muda em produção sem confirmação explícita no momento**. Cada passo abaixo diz quem faz e o que confirma.

---

## 1. Decisões tomadas

| #   | Tema                | Decisão                                                                                                                                                                                                    | Consequência no plano                                                                                                                  |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Hospedagem          | **Vercel Pro** (~US$ 20/mês: cobra por membro do time na Vercel, não por usuário do CRM)                                                                                                                   | Upload de documentos passa a ir direto para o Storage (limite de 4,5 MB por requisição na Vercel)                                      |
| D2  | Domínio             | **`crm.seumetroquadrado.com.br`**. O domínio já é seu, DNS na **Locaweb**                                                                                                                                  | Não precisa comprar nada: o subdomínio é criado na zona DNS da Locaweb. Ligado primeiro no Lovable, depois só muda o DNS para a Vercel |
| D3  | Supabase            | **Subir a org atual para Pro** e criar um projeto novo só do CRM em São Paulo                                                                                                                              | O `smq-operacional` ganha backup automático. Primeiro uso do projeto novo: backup do CRM fora do Lovable                               |
| D4  | Uso do Lovable      | **Só telas, nada de banco** a partir de agora. Congelamento total no dia do dump de baseline                                                                                                               | Toda mudança de banco passa a vir por PR deste repositório                                                                             |
| D5  | Logs antigos        | **Arquivar fora do banco**: sucessos e erros de distribuição, 30 dias de tentativas falhas, 90 dias de auditoria e 60 de alertas vão para o banco novo; o resto vira arquivo compactado num bucket privado | Banco a migrar cai de 20 GB para ~2 a 3 GB e cabe no export oficial do Lovable                                                         |
| D6  | Suporte do Lovable  | Você vai mandar as perguntas da seção 17 do relatório                                                                                                                                                      | O caminho de extração dos dados é escolhido quando eles responderem                                                                    |
| D7  | Push                | **Consertar e descartar a fila antiga**                                                                                                                                                                    | Corrigir o cron e o segredo, expirar as ~102 mil notificações paradas e pôr corte por idade                                            |
| D8  | IA                  | **Tudo em Claude**, inclusive o fallback                                                                                                                                                                   | Uma chave só (Anthropic). Testar antes a leitura de carta de aprovação, que nunca rodou em Claude                                      |
| D9  | Permissão do gestor | **Manter como está** (gestor gerencia fila, projetos e templates)                                                                                                                                          | O repositório passa a refletir a produção; a trava "só admin" é abandonada                                                             |
| D10 | Integrações         | **Manter só o 3C Plus**. Aposentar Sonax, `lead-intake` e as `sami-*` antigas                                                                                                                              | Migrar 5 edge functions: `notify-lead-transfer`, `crm-convites` e as 3 `tcplus-*`                                                      |
| D11 | "CRM MCP" (Railway) | **Portar para o repositório**                                                                                                                                                                              | As 8 ferramentas `crm_*` viram parte do MCP do CRM, com números corretos e login por usuário. O Railway é desligado depois             |
| D12 | Google Cloud        | Não se sabe qual conta criou o client atual                                                                                                                                                                | Descobrir pelo `client_id` (tarefa V5). Se não achar, projeto novo e 9 corretores reconectam a agenda uma vez                          |
| D13 | Anthropic           | Usar a conta que já existe (a do n8n), com **workspace separado só do CRM**                                                                                                                                | Chave e limite de gasto próprios                                                                                                       |
| D14 | Janela do corte     | **Madrugada de sábado para domingo** (00h a 07h)                                                                                                                                                           | Data marcada só depois de um ensaio de restore aprovado                                                                                |

### 1.1 Números usados nas decisões

- **IA (dado real, 24 a 31/10):** 173 execuções em 8 dias, todas em `anthropic/claude-sonnet-5`, 3,38 milhões de tokens de entrada e 39 mil de saída, custo estimado de R$ 36,37. Projeção: **~650 execuções e US$ 25 a 30 por mês** na API direta, antes do ganho com prompt caching.
- **`main` vermelha:** o orçamento de escapes de tipo continua estourado (146 para um limite de 145), conferido em 01/11. O escape a mais muda de lugar a cada edição do Lovable: é mais um motivo para a regra D4.
- **O Lovable continua mexendo no banco:** desde 25/10 entraram 8 migrations novas pelo Lovable (`drizzle/migrations/0117` a `0124`: tarefas, indicação, comissões e permissões do `docs-bot`).

---

## 2. Suas tarefas (só você consegue fazer)

Ordem sugerida. Nenhuma delas exige mexer em código.

### V1. Avisar a equipe sobre a regra do Lovable (hoje)

Quem usa o chat do Lovable: a partir de agora, **só pedidos de tela** (texto, layout, cor, componente). Qualquer pedido que crie ou altere tabela, coluna, função, permissão, cron ou regra de negócio no banco vem para mim por PR.

Como reconhecer um pedido de banco: se a resposta do Lovable falar em "migration", "SQL", "tabela", "RLS", "policy", "função" ou "trigger", pare e me mande o pedido.

### V2. Mandar as perguntas ao suporte do Lovable (esta semana)

O texto está pronto na seção 17 do relatório. Cite o projeto `862f238b-1c33-4bd3-aec6-6e4ffb74e9ba`. Quando responderem, cole a resposta aqui.

### V3. Subir a organização Supabase para Pro (esta semana)

1. Entre em supabase.com/dashboard com a conta da organização **guinunes291's Org**.
2. Organization settings → Billing → Change plan → **Pro**.
3. Cadastre o cartão. O Pro custa US$ 25/mês e inclui US$ 10 de crédito de compute.
4. Me avise. Eu crio o projeto `smq-crm` em São Paulo (`sa-east-1`), compute **Small**, e te mostro o custo antes de confirmar.

O `smq-operacional` passa a ter backup automático diário assim que a org vira Pro.

### V4. Criar o subdomínio na Locaweb e ligar no Lovable (esta semana)

1. No Lovable, abra o projeto **Seu Metro Quadrado** → configurações do projeto → **Domains** → conectar domínio → digite `crm.seumetroquadrado.com.br`.
2. O Lovable mostra **os registros DNS exatos** que precisam ser criados (normalmente um registro de apontamento e um de verificação). Copie cada um.
3. Na Locaweb: Central do Cliente → Domínios → `seumetroquadrado.com.br` → gerenciar DNS (zona DNS).
4. Crie os registros exatamente como o Lovable mostrou. No campo de nome/host, a Locaweb costuma pedir **só o prefixo** (`crm`), sem o `.seumetroquadrado.com.br`. Confira o exemplo na própria tela.
5. **Não mexa** nos registros que já existem (`www`, `@`, `MX` do e-mail).
6. Volte ao Lovable e aguarde a verificação e o certificado HTTPS. A propagação pode levar de minutos a algumas horas.
7. Teste `https://crm.seumetroquadrado.com.br` no navegador e me avise.

Se o Lovable disser que o plano não permite domínio próprio, me avise antes de contratar qualquer coisa.

**Por que agora:** com o domínio ligado ainda no Lovable, eu troco aos poucos todos os lugares que usam `lovable.app` (n8n, Zapier, Z-API, banco, código). No dia do corte, basta mudar o DNS na Locaweb para a Vercel.

### V5. Descobrir qual conta Google criou o OAuth client (esta semana)

O `client_id` não é segredo e aparece na URL de conexão do Google Agenda:

1. No CRM, vá até a conexão do Google Agenda e clique para conectar (pode ser com uma conta de teste).
2. Na tela do Google, **antes de autorizar**, copie a URL inteira do navegador.
3. Procure `client_id=` na URL. O valor termina em `.apps.googleusercontent.com`, e o número antes do primeiro hífen é o **número do projeto**.
4. Entre em console.cloud.google.com com cada conta Google que você usa (pessoal e de trabalho) e procure esse número no seletor de projetos.
5. Me diga em qual conta achou, ou que não achou. Pode me mandar o `client_id`; ele é público.

### V6. Criar o workspace da Anthropic para o CRM (quando eu pedir, na Fase 1)

1. console.anthropic.com → Settings → **Workspaces** → criar `CRM SMQ`.
2. Dentro dele: **Limits** → limite mensal de gasto. Sugestão: **US$ 60/mês** (o dobro da projeção) com alerta em US$ 40.
3. **API keys** → criar uma chave no workspace `CRM SMQ`.
4. **Não cole a chave aqui.** Cadastre-a direto no Lovable: Cloud → Secrets → novo segredo `ANTHROPIC_API_KEY`. Isso é configuração, não mudança de banco, então respeita a regra D4.

### V7. Assinar a Vercel Pro (só na Fase 3)

Não precisa agora. Quando o app estiver pronto para testar na Vercel, eu aviso. O time "Seu Metro Quadrado" já existe.

---

## 3. Minhas tarefas: Fase 1 em entregas pequenas

Cada item é uma entrega separada (commits na branch `claude/vibrant-mayer-gdwt4j`, viram PR quando você pedir), testado no CI e, quando fizer sentido, no preview do Lovable. Nenhum deles muda o comportamento de produção até ser ligado de propósito. **Não edito os arquivos que o Lovable regrava** (`src/integrations/supabase/*`, `src/integrations/lovable/*`): crio módulos novos e troco os imports.

| Ordem | Entrega                                   | O que faz                                                                                                                                                             | Depende de                                       | Muda produção?                                                                                                    |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1     | Deixar a `main` verde                     | Corrige o escape de tipo a mais. O de 25/10 já saiu; o atual é `p_gerente_id: (gerenteId                                                                              |                                                  | null) as unknown as string`em`src/components/pending-sales-approval.tsx:206`, criado pelo bot do Lovable em 01/11 | —   | Não |
| 2     | IA atrás de `AI_PROVIDER`                 | Provider direto da Anthropic, padrão `lovable` (nada muda); fallback vira Claude; testes                                                                              | —                                                | Só quando virar a variável (depois de V6)                                                                         |
| 3     | Lead não some em silêncio                 | Webhook de lead responde 503 (com log) quando o banco está indisponível, em vez de 401; documentar o retry no n8n                                                     | —                                                | Sim, mas só no caminho de erro                                                                                    |
| 4     | URLs públicas por variável                | `CRM_URL_PUBLICA` e demais URLs fixas passam a vir de `APP_BASE_URL`, com o valor atual como padrão                                                                   | —                                                | Não                                                                                                               |
| 5     | Push consertado                           | Migration que expira a fila antiga, corte por idade em `claim_push_outbox`, cron com cabeçalho `x-push-secret` lido do Vault                                          | Você cadastrar `PUSH_DISPATCH_SECRET` no Lovable | **Sim** (confirmo com você antes do merge)                                                                        |
| 6     | Upload direto ao Storage                  | URL assinada de upload; a rota só registra o documento                                                                                                                | —                                                | Sim, troca o caminho do upload (testado em preview)                                                               |
| 7     | MCP com as ferramentas `crm_*`            | Porta as 8 ferramentas do Railway para o MCP do repositório, com números corretos e escopo do usuário; corrige `list_minhas_tarefas`                                  | —                                                | Não (ferramentas novas)                                                                                           |
| 8     | Login Google nativo                       | `supabase.auth.signInWithOAuth` com client próprio                                                                                                                    | V5 + configuração do Google no Lovable           | Sim (testado antes com uma conta)                                                                                 |
| 9     | Aposentar código morto                    | Remove `sonax-*`, `lead-intake`, `sami-agendar-visita`, `sami-consultar-agenda`, `sami-anexar-documento` do repositório (continuam publicadas no Lovable até o corte) | Confirmação de que nenhum Zap usa `lead-intake`  | Não                                                                                                               |
| 10    | Repositório reflete a permissão do gestor | Documenta a decisão D9; a migration que restringia a admin deixa de ser referência                                                                                    | —                                                | Não                                                                                                               |
| 11    | Retenção e gravação de logs               | Grava a foto completa da distribuição só no sucesso ou na primeira falha; jobs de retenção                                                                            | Arquivamento feito (D5)                          | **Sim** (confirmo antes)                                                                                          |
| 12    | Limpeza para a Vercel                     | Remove fallbacks do `vite.config.ts`, apaga `bun.lock`, helper de IP por plataforma, `vercel.json` com região `gru1` e `maxDuration`                                  | Projeto Supabase novo existir                    | Não (só vale no deploy novo)                                                                                      |

### 3.1 Trabalho de banco que começa assim que o projeto Pro existir (V3)

1. **Primeiro backup fora do Lovable:** dump do núcleo do CRM (sem os logs grandes) guardado no projeto novo. Depende do caminho de extração (resposta do suporte); enquanto isso, preparo os scripts.
2. **Ensaio de restore** com a receita da seção 8.3 do relatório, com todas as saídas (n8n, WhatsApp, `smq-operacional`) neutralizadas.
3. **Arquivamento dos logs** (D5): exportar para o bucket privado, conferir, e só então reduzir as tabelas no Lovable, com sua confirmação.
4. **Baseline:** no dia do congelamento total (D4), `pg_dump --schema-only` da produção vira `supabase/migrations/<data>_baseline.sql`.

---

## 4. Ordem geral

```text
Semana 1   V1, V2, V3, V4, V5          | entregas 1, 2, 3, 4
Semana 2   V6 (virar a IA)             | entregas 5, 6, 7 · ensaio de restore no projeto Pro
Semana 3   resposta do Lovable         | entregas 8, 9, 10, 11 · arquivamento dos logs · trocar URLs para o domínio novo
Semana 4   V7 (Vercel Pro)             | entrega 12 · deploy de teste na Vercel · segundo ensaio completo
Depois     congelamento + baseline     | corte numa madrugada de sábado para domingo (D14)
```

As semanas são estimativas. O que pode atrasar: a resposta do suporte do Lovable e a propagação do domínio.

---

## 5. Pendências que ainda podem gerar pergunta

- **Caminho de extração dos dados:** depende da resposta do Lovable (V2).
- **PR #291 (roletas simples):** já está aplicado em produção pelo Lovable. Com a baseline, ele entra no repositório pelo dump; o PR pode ser fechado depois, sem merge.
- **Migrations 0100 (eventos do 3C Plus) e 0103 (bloqueio de telefone de corretor):** não estão em produção. Como o 3C Plus continua (D10), a 0100 volta à mesa quando o discador for de fato usado.
- **Usuários sem identidade, sem profile e banidos:** decidir antes do ensaio final (relatório, seção 8.4).
- **SMTP para convites e reset de senha no projeto novo:** proposta Resend, com o domínio `seumetroquadrado.com.br`. Vai exigir registros SPF/DKIM na Locaweb, na Fase 2.
