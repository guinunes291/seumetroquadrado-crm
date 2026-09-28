# Academia SMQ · Fatia 2 · Telas do corretor (28/09/2026)

Trilha, módulo, aula, quiz, prática e progresso, tudo mobile first, atrás de
duas feature flags desligadas. Nada foi para produção: as migrations da Fatia 1
entram pelo Lovable quando `drizzle/` chega ao `main`, e esta branch não vai
para o `main` nesta fatia.

Decisões do dono em [`fatia0-respostas.md`](fatia0-respostas.md), seção
"Fatia 2 · decisões". A camada de dados está em
[`fatia1-camada-de-dados.md`](fatia1-camada-de-dados.md).

## 1. O que mudou

### Arquivos novos

| Arquivo                                       | O que é                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `src/hooks/use-app-flags.ts`                  | Leitura única de `app_flags`, `useAppFlag(chave)`                |
| `src/features/academia/academia-client.ts`    | Query keys, hooks de leitura e as 4 mutações                     |
| `src/features/academia/estado-modulo.ts`      | Derivação pura do estado do módulo e do "continue de onde parou" |
| `src/features/academia/erros.ts`              | Mensagens das RPCs viradas em texto de tela                      |
| `src/features/academia/formato.ts`            | hh:mm, datas, prazos, leitura de jsonb                           |
| `src/features/academia/midia.ts`              | Embed do Gamma e vídeo direto                                    |
| `src/features/academia/niveis.ts`             | Nomes e ordem dos níveis                                         |
| `src/features/academia/guard.tsx`             | Porta de entrada de toda rota `/academia`                        |
| `src/features/academia/markdown.tsx`          | `react-markdown` + `remark-gfm`, sem HTML cru                    |
| `src/features/academia/trilha-page.tsx`       | `/academia`                                                      |
| `src/features/academia/modulo-page.tsx`       | `/academia/modulo/:codigo`                                       |
| `src/features/academia/aula-page.tsx`         | `/academia/modulo/:codigo/aula/:ordem`                           |
| `src/features/academia/quiz-page.tsx`         | `/academia/modulo/:codigo/quiz`                                  |
| `src/features/academia/progresso-page.tsx`    | `/academia/progresso`                                            |
| `src/features/academia/card-proxima-aula.tsx` | Card "Sua próxima aula" do `/inicio`                             |
| `src/features/academia/use-flags-nav.ts`      | Resolve quais flags de sistema estão ligadas para a pessoa       |
| `src/routes/_authenticated/academia/*.tsx`    | As 5 rotas, cada uma fina, só guard e página                     |
| `tests/academia-*.test.ts(x)`                 | 85 testes novos                                                  |
| `docs/academia/fatia2-prova-mobile.mjs`       | Prova no Chromium a 390x844, com fixtures                        |
| `docs/academia/fatia2-prints/`                | Um print por tela                                                |

### Arquivos existentes tocados, e só no necessário

- `src/features/nav/sistemas.ts`: campo opcional `flag?: string` em `Sistema`,
  `flagsLigadas?: Set<string>` em `PapelCtx`, o gate em `sistemaVisivel`, o id
  `"academia"` e os novos `SISTEMA_ACADEMIA` e `SISTEMAS_NAV`.
- `src/components/app-sidebar.tsx`, `src/features/inicio/inicio-page.tsx`,
  `src/components/command-palette.tsx`: passam `flagsLigadas` no contexto e
  consomem `SISTEMAS_NAV`. O `/inicio` ganhou também o `<CardProximaAula />`.
- `src/routeTree.gen.ts`: regenerado pelo plugin do Vite.
- `package.json`, `package-lock.json`, `bun.lock`: `react-markdown` e
  `remark-gfm`.
- `tests/sistemas.test.ts`: **não foi tocado.** Ver a seção 3.

## 2. O que eu medi

| Checagem                     | Antes                   | Depois                           |
| ---------------------------- | ----------------------- | -------------------------------- |
| `npm test`                   | 2023 de 2023, 196 arqs. | **2108 de 2108, 201 arqs.**      |
| `npm run test:db`            | 761 de 762              | 761 de 762 (nada de banco mudou) |
| Maior chunk gzip             | `index` 232.0 KB        | ver seção 5                      |
| `npm run type-escape-budget` | 145/145                 | **145/145** (zero escapes novos) |
| `npm run lint:ci`            | limpo                   | limpo                            |
| `npm run typecheck`          | limpo                   | limpo                            |
| `npm run format:check`       | vermelho em 8 arquivos  | vermelho nos **mesmos** 8        |

Os 85 testes novos: 34 de derivação (estado do módulo, continue de onde parou,
próxima aula, hh:mm, embed do Gamma, varredura de travessão), 16 de tradução de
erro, 13 de menu, 8 de quiz e 14 de guard, módulo e card.

**Atenção ao `test:db`:** ele só é confiável depois de `npm run db:reset`. Os
testes de distribuição deixam roleta suja e uma segunda execução seguida
reprova 22 casos que nada têm a ver com a mudança. Isso não é da Academia, mas
custou tempo até eu descobrir, então fica registrado.

## 3. Por que a Academia ficou FORA de `SISTEMAS`

`tests/sistemas.test.ts` tem duas asserções que percorrem o registro inteiro: o
mapa de grupos (`toEqual` com as 11 chaves) e `ids(admin) === SISTEMAS.map(...)`.
Um sistema novo dentro do array quebraria as duas, e a regra da fatia era não
mudar nenhuma asserção existente.

A saída usa uma porta que já existia: `sistemasVisiveis(ctx, lista)`,
`sistemaAtivo(loc, lista)` e `sistemaAtivoContextual(loc, fase, lista)` sempre
aceitaram lista própria. Então `SISTEMAS` continua sendo o registro estável (o
que existe para todo mundo, sempre) e `SISTEMAS_NAV = [...SISTEMAS, SISTEMA_ACADEMIA]`
é o que a navegação consome.

O efeito colateral é real e está declarado no código: `SISTEMAS` deixou de ser
a lista completa. **Quando a Academia sair da flag, mova o objeto para dentro
de `SISTEMAS`, apague o campo `flag` e acrescente `academia` às duas asserções.**
São três linhas. Se você preferir fazer isso agora e aceitar o ajuste nos dois
testes, é uma decisão sua e eu faço.

## 4. As regras que as telas seguem

- **Flag ausente é DESLIGADA.** A migration da Fatia 1 pode não estar aplicada
  no ambiente vivo. Carregando não é desligada (senão o menu pisca), e erro de
  leitura é `QueryErrorState`, nunca tela em branco.
- **A flag é global, a Academia é individual.** `academia_menu` só entra no
  conjunto de flags se a flag estiver ligada E a pessoa for participante ativa.
  O admin entra junto, sem participar, para pré-visualizar. O card do `/inicio`
  não abre essa exceção: é só de quem estuda.
- **Quem não participa vê recado, não erro.** "Você ainda não está na Academia.
  Fale com seu gestor." Sem redirect e sem stack trace.
- **O gabarito não existe no navegador antes do envio.** `academia_quiz_iniciar`
  devolve enunciado e alternativas, sem o campo `correta`. A correção só chega
  na resposta de `academia_quiz_enviar`. Há teste provando que a palavra da
  explicação não está no DOM antes do envio.
- **Erro de regra é conteúdo, não susto.** Intervalo entre tentativas, limite
  diário e tempo esgotado viram texto na tela, com o que fazer a seguir. A
  tradução é função pura (`erros.ts`) e os testes usam as MESMAS frases que a
  migration levanta: se alguém mudar um `RAISE` lá, o teste cai aqui.
- **Sem HTML cru no markdown** (nada de `rehype-raw`) e link externo sempre com
  `rel="noopener noreferrer"`.
- **Iframe só de gamma.app em https.** Qualquer outro domínio vira botão
  "Abrir slides": iframe de origem desconhecida em tela autenticada é risco sem
  ganho.
- **O `/inicio` fica idêntico ao de hoje** com a flag desligada ou para quem não
  participa. Há teste de componente provando que o card renderiza vazio.

## 5. Como provar

```bash
npm ci
npm test                       # 2108 de 2108
npm run lint:ci && npm run typecheck
npm run type-escape-budget     # 145/145
npm run format:check           # vermelho só nos 8 arquivos pré-existentes
npm run build && npm run bundle-budget

# banco (o reset é obrigatório antes de medir)
npm run db:reset && npm run test:db   # 761 de 762, só cadencia-painel

# celular: Chromium a 390x844, tudo com fixture, nenhum byte sai para a rede
npx playwright install chromium
node docs/academia/fatia2-prova-mobile.mjs
```

A prova no celular sobe o `vite dev` com credenciais falsas de Supabase, semeia
uma sessão no `localStorage` e responde toda chamada de rede com fixture. Ela
reprova se qualquer erro aparecer no console. Os prints ficam em
`docs/academia/fatia2-prints/`.

## 6. Roteiro de aceite, depois do merge

As migrations da Fatia 1 precisam estar aplicadas. **As flags são globais:** com
a flag ligada, quem vê a Academia é só quem participa, e hoje o único
participante vai ser o corretor de teste. Ainda assim, faça fora do horário de
pico.

### 6.1 Inscrever um corretor de teste

`academia_definir_participacao` é só de admin e lê `auth.uid()`, que no SQL
Editor não existe. Por isso a identidade entra à mão, dentro da transação:

```sql
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<UUID_DO_ADMIN>', 'role', 'authenticated')::text,
  true);                      -- true = vale só nesta transação
SET LOCAL ROLE authenticated;

SELECT public.academia_definir_participacao('<UUID_DO_CORRETOR_DE_TESTE>', true, NULL);

RESET ROLE;
COMMIT;

-- confere
SELECT corretor_id, participa, nivel, inicio_trilha
  FROM public.academia_participantes;
```

### 6.2 Publicar o módulo O01

Ele nasce em rascunho e com nota de revisão, de propósito. Limpe a nota e
publique com a mesma identidade de admin:

```sql
BEGIN;
UPDATE public.academia_modulos SET revisao_pendente = NULL WHERE codigo = 'O01';

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<UUID_DO_ADMIN>', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

SELECT public.academia_publicar_modulo(
  (SELECT id FROM public.academia_modulos WHERE codigo = 'O01'));

RESET ROLE;
COMMIT;

-- confere: status publicado, e quantas aulas e questões ele tem
SELECT m.codigo, m.status,
       (SELECT count(*) FROM public.academia_aulas a
         WHERE a.modulo_id = m.id AND a.status = 'publicado') AS aulas,
       (SELECT count(*) FROM public.academia_questoes q
         WHERE q.modulo_id = m.id AND q.ativa)                AS questoes
  FROM public.academia_modulos m WHERE m.codigo = 'O01';
```

### 6.3 Ligar as flags

```sql
UPDATE public.app_flags
   SET ativo = true, atualizado_em = now()
 WHERE chave IN ('academia_menu', 'academia_card_inicio');
```

### 6.4 No celular, com o corretor de teste

1. Entre no CRM. O `/inicio` mostra o card **"Sua próxima aula"** e o card do
   módulo **Academia** no grupo Consulta.
2. Abra a Academia. A trilha mostra nível **Iniciante**, a fase **Integração**
   aberta e o módulo O01.
3. Abra o O01. O botão do quiz está **desabilitado** com o motivo à vista.
4. Abra a aula 1, leia, toque em **"Concluí esta aula"** e depois em
   **"Próxima"**. Repita até a última.
5. Volte ao módulo: o quiz liberou. Faça, responda uma por tela, confirme e veja
   a correção comentada.
6. Envie a **prática** com um texto e, se quiser, um link.
7. **Com o gestor** (outro login, mesma equipe do corretor de teste), aprove a
   prática. Pelo SQL Editor, com a identidade do gestor:
   ```sql
   BEGIN;
   SELECT set_config('request.jwt.claims',
     json_build_object('sub', '<UUID_DO_GESTOR>', 'role', 'authenticated')::text, true);
   SET LOCAL ROLE authenticated;
   SELECT public.academia_pratica_avaliar(
     (SELECT id FROM public.academia_praticas
       WHERE corretor_id = '<UUID_DO_CORRETOR_DE_TESTE>' AND status = 'pendente'
       ORDER BY enviado_em DESC LIMIT 1),
     'aprovada', '[]'::jsonb, 'Boa condução. Foco: perguntar a renda antes do preço.');
   RESET ROLE;
   COMMIT;
   ```
8. No celular, recarregue a trilha: o nível virou **Habilitado**, e
   `/academia/progresso` mostra o certificado com o código de verificação.

Em nenhum momento pode aparecer erro no console.

### 6.5 Desligar tudo

```sql
-- 1. as telas somem na hora
UPDATE public.app_flags SET ativo = false, atualizado_em = now()
 WHERE chave IN ('academia_menu', 'academia_card_inicio');

-- 2. tirar o corretor de teste da trilha (opcional)
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '<UUID_DO_ADMIN>', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.academia_definir_participacao('<UUID_DO_CORRETOR_DE_TESTE>', false, NULL);
RESET ROLE;
COMMIT;

-- 3. devolver o O01 ao rascunho (opcional)
UPDATE public.academia_modulos
   SET status = 'rascunho', publicado_em = NULL, publicado_por = NULL
 WHERE codigo = 'O01';
```

O schema inteiro sai com `docs/academia/fatia1-rollback.sql`. Desligue as flags
antes.

## 7. O que falta

- **Painel do gestor** (Fatia 3): a fila de práticas para avaliar hoje só existe
  por SQL, como no passo 6.4.7 acima.
- **Página imprimível do certificado**: é da Fatia 6. Hoje o código de
  verificação aparece na tela e só.
- **`academia_encontros` não tem tela de criação.** A trilha mostra o próximo
  encontro se alguém inserir a linha; criar encontro é da Fatia 3.
- **Vídeo**: nenhuma aula do seed tem `url_video`. O player existe e cai em
  "Vídeo em breve" até alguém gravar.
- **O quiz ainda vira decoreba** (herdado da Fatia 1): cerca de 5 questões por
  módulo e sorteio de até 10. O intervalo e o limite diário só atrasam. Mais
  questão por módulo é conteúdo, não código.
- **`SISTEMAS` deixou de ser a lista completa** enquanto a Academia estiver atrás
  de flag. Ver a seção 3.
- **A prova no celular vive em `docs/academia/`** porque a fatia não podia criar
  arquivo em `e2e/`. Quando a Academia sair da flag, mova para lá, junto do
  smoke.
