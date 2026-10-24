# Painel de Marketing SMQ

App Next.js separado do CRM (o CRM continua na raiz do repositório, no Lovable).
Hospedado na Vercel com `rootDirectory = painel-marketing`.

## Fase 1 (só leitura)

- Login restrito (`marketing.usuarios_permitidos`). Primeiro acesso por convite de uso único.
- Diagnóstico por empreendimento: gasto da Meta, leads, visitas e vendas, com custo por etapa.
- Tela para ligar grafias soltas e campanhas a um empreendimento.
- Nada escreve na Meta nem em `public.*`.

## Fase 4 (vídeo)

- Gerar vídeo por prompt e Editar vídeo, pelo Higgsfield (Seedance 2.5). O Roteirista de vídeo
  (Sonnet) transforma a ideia em prompt; as regras fixas da SMQ barram preço, promessa de crédito e
  travessão.
- Cada vídeo é um pedido em Aprovações com o custo estimado pelo próprio Higgsfield. Na aprovação o
  custo é conferido de novo e o envio leva o id do pedido como chave de idempotência.
- O vídeo pronto é copiado para o Vercel Blob (o Higgsfield apaga em 7 dias) e aparece em Vídeos.
  Nada é apagado: arquiva-se.

## Banco

Projeto Supabase `smq-operacional`. Migrações em `supabase/migrations/` (aplicadas pelo MCP do
Supabase, não pelo `supabase/` da raiz, que é do CRM). O app entra pelo papel `painel_marketing`,
que só enxerga o esquema `marketing`; as vistas `v_*` leem `public` sem dar escrita.

## Variáveis de ambiente (Vercel)

| Nome                                                 | Para quê                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                       | Pooler do Supabase (porta 6543) com o usuário `painel_marketing.<ref>`                               |
| `META_ACCESS_TOKEN`                                  | Token do usuário do sistema da Meta, só `ads_read` na Fase 1 (opcional)                              |
| `META_AD_ACCOUNT_ID`                                 | Conta de anúncios (padrão 382684244661295)                                                           |
| `CRON_SECRET`                                        | Protege a rota do agendamento diário                                                                 |
| `HIGGSFIELD_API_KEY_ID`, `HIGGSFIELD_API_KEY_SECRET` | Fase 4: chave da API do Higgsfield (console.higgsfield.ai, saldo próprio, separado do plano do site) |
| `BLOB_READ_WRITE_TOKEN`                              | Fase 4: criada pela Vercel ao ligar um Blob ao projeto; guarda os vídeos e os arquivos enviados      |

## Rodar

```
npm install
npm test
npm run build
```
