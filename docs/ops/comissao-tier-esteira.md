# Comissão por tier e esteira — o que roda em produção (03/10/2026)

A comissão por tier nasceu no chat do Lovable em 28/09
(`drizzle/migrations/0015_comissao_tier_esteira.sql`) e só existia em
`drizzle/` — o CI nunca a tinha testado. Desde `20261010120000` ela entra no
replay do CI com o mesmo SQL de produção, junto com as outras migrations
criadas pelo Lovable (0013, 0022, 0037; a 0044, origem "portal", entrou em
`20261009120500`).

## Como a fatia do corretor é calculada

Na venda registrada **pelo corretor**, o gatilho `trg_vendas_tier_comissao`
(BEFORE INSERT) grava `tier_comissao`, `esteira_comissao`, `pct_share_corretor`
e **sobrescreve** `percentual_corretor` = `percentual_comissao` × fatia / 100. O
que o corretor digita no percentual dele não vale. Depois de registrada, só a
gestão (admin, gestor, superintendente) muda percentuais — o corretor recebe
"Somente a gestão pode alterar os percentuais de comissão". Venda registrada
pela gestão (ou sem login) guarda os percentuais informados.

**Tier** = vendas aprovadas (sem distrato) do corretor no trimestre ANTERIOR:

| Tier   | Vendas no trimestre anterior | Lead da empresa | Lead próprio | Marquinhos | SDR |
| ------ | ---------------------------- | --------------- | ------------ | ---------- | --- |
| tier_1 | 0+                           | 40%             | 45%          | 30%        | 8%  |
| tier_2 | 3+                           | 45%             | 50%          | 35%        | 8%  |
| tier_3 | 5+                           | 50%             | 55%          | 37%        | 8%  |
| elite  | 8+                           | 55%             | 60%          | 40%        | 8%  |

**Esteira** do lead (`lead_esteira_comissao`), na ordem:

1. **marquinhos** — o lead tem visita marcada pelo robô: visita sem autor
   (`criado_por_id` nulo) que não é automática (`auto_gerado`) nem
   reagendamento do Modo Visita;
2. **sdr** — o lead tem SDR (`leads.sdr_id`);
3. **lead_proprio** — origem `captacao_corretor` ou `investimento_corretor`;
4. **lead_empresa** — o resto.

Exemplo: corretor tier_1, lead de campanha, venda de R$ 245.000 a 3,5% →
percentual do corretor 1,4% → R$ 3.430,00.

## O que foi corrigido em 03/10

- **Anônimo lia comissão** (`20261010120100`, espelho `0052`): as funções do
  tier eram executáveis sem login. Reproduzido como anon: vendas aprovadas no
  trimestre de qualquer corretor, tier, esteira e % de comissão. Agora só
  `authenticated` e `service_role`.
- **Esteira "Marquinhos" errada** (`20261010120200`, espelho `0053`): qualquer
  visita sem autor contava como do robô, e três caminhos do CRM gravam visita
  sem autor — a visita automática "Visita realizada — …", o registro histórico
  da régua de datas e o reagendamento pelo Modo Visita. O corretor perdia 10 a
  15 pontos de fatia (tier_1: 30% em vez de 40%). Vale para venda registrada
  depois da migration.
- **Sami gravava a visita sem autor** (`supabase/functions/sami-agendar-visita`):
  agora grava o corretor que pediu. **Edge function não sobe pelo GitHub** —
  depois do merge, pedir no chat do Lovable: "faça o redeploy da edge function
  sami-agendar-visita". Até o redeploy, visita marcada pela Sami continua
  contando como do robô.

## Revisão das vendas já gravadas

A esteira e a fatia são gravadas no registro da venda; as já registradas não
mudam sozinhas. Depois do merge, no SQL Editor:

```sql
-- Vendas gravadas como "marquinhos" cujo lead NÃO tem visita do robô pela
-- regra corrigida (fatia gravada menor que a devida).
SELECT v.id AS venda_id, v.status_venda, v.data_assinatura, p.nome AS corretor,
       l.nome AS lead, v.tier_comissao, v.pct_share_corretor AS fatia_gravada,
       public.lead_esteira_comissao(v.lead_id) AS esteira_correta,
       v.percentual_comissao, v.percentual_corretor
  FROM public.vendas v
  JOIN public.leads l ON l.id = v.lead_id
  LEFT JOIN public.profiles p ON p.id = v.corretor_id
 WHERE v.esteira_comissao = 'marquinhos'
   AND public.lead_esteira_comissao(v.lead_id) <> 'marquinhos'
 ORDER BY v.data_assinatura DESC;
```

Limite: visita marcada pela **Sami** antes do redeploy não tem marca que a
separe da visita do robô — essas vendas não aparecem na consulta acima. Para
elas, conferir pelo histórico do lead (quem marcou a visita).

Venda **pendente** precisa ser corrigida ANTES da aprovação: a tela de
aprovação recalcula o percentual do corretor pela fatia gravada
(`pct_share_corretor`), então aprovar pela tela repete o erro. No SQL Editor
(testado no harness: marquinhos/30%/1,125 → lead_empresa/40%/1,5):

```sql
UPDATE public.vendas v
   SET esteira_comissao   = s.esteira,
       pct_share_corretor = s.pct_share,
       percentual_corretor = round(coalesce(v.percentual_comissao, 0) * s.pct_share / 100, 4)
  FROM public.vendas v2
  CROSS JOIN LATERAL public.comissao_sugerida_corretor(v2.lead_id, v2.corretor_id, v2.data_assinatura) s
 WHERE v2.id = v.id
   AND v.status_venda = 'pendente'
   AND v.esteira_comissao = 'marquinhos'
   AND s.esteira <> 'marquinhos'
RETURNING v.id, v.esteira_comissao, v.pct_share_corretor, v.percentual_corretor;
```

Venda **aprovada** não muda mais (`trg_validar_mutacao_venda`) e a comissão já
foi gerada: a diferença precisa de um acerto de comissão decidido pela gestão.

## Conferência depois do merge

```sql
SELECT has_function_privilege('anon', 'public.corretor_vendas_trimestre(uuid,date,integer)', 'EXECUTE') AS anon_le_vendas,  -- false
       position('auto_gerado' IN pg_get_functiondef('public.lead_esteira_comissao(uuid)'::regprocedure)) > 0 AS esteira_corrigida; -- true
```

Testes: `tests/db/comissao-tier.test.ts`.
