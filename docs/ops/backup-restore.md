# Backup & Restore — runbook (item 0.3 / métrica C2)

> Antes deste runbook, a recuperação de desastre era "fé no PITR": nenhuma estratégia documentada, nenhum restore jamais ensaiado (diagnóstico em `docs/auditoria/estrategia-2026-08/01-diagnostico-4-eixos.md`, eixo Controle). Este documento fixa o alvo, o roteiro e o registro dos ensaios. A métrica C2 exige **restore testado ≥1× por trimestre**.

## O que protege o quê

| Camada                                 | O que cobre                                                                                                        | Onde vive                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **Backups diários do Supabase**        | Snapshot lógico diário do banco (retenção conforme o plano do projeto)                                             | Painel Supabase → Database → Backups           |
| **PITR (point-in-time recovery)**      | Restauração a qualquer minuto dentro da janela de retenção — exige add-on habilitado no projeto                    | Painel Supabase → Database → Backups → PITR    |
| **Migrations no repositório**          | Reconstrução do SCHEMA do zero (provada a cada CI: replay das ~275 migrations no harness) — **não cobre os dados** | `supabase/migrations/` + `scripts/db-harness/` |
| **Storage (documentação de clientes)** | Buckets `documentacao` e `documentos-leads` — **não entram** no backup lógico do Postgres                          | Painel Supabase → Storage                      |

Pontos cegos conhecidos: (1) drift — `copa_ranking()` existe em produção sem migration no repo (P-5): um restore "a partir das migrations" NÃO a recria; até P-5 fechar, restore de schema é sempre a partir de backup, nunca do repo. (2) Secrets das edge functions e config de Auth/SMTP não entram no backup do banco — inventariá-los no painel faz parte do ensaio.

## Alvos (a confirmar com o dono — decisão D7 toca isto)

- **RPO (perda máxima aceitável):** 24 h com backup diário; **minutos** se o PITR estiver habilitado. Verificar no painel qual dos dois está ativo hoje e anotar no registro abaixo.
- **RTO (tempo máximo de indisponibilidade):** 4 h úteis para restauração completa em projeto novo.

## Antes de QUALQUER migração de risco alto

Ritual herdado de `docs/auditoria/2026-07-11-evolucao-crm.md` (§ pré-flight), obrigatório até o staging da Onda D.3 existir:

1. Criar backup manual no painel (Database → Backups → Back up now, se disponível no plano) **e registrar o identificador/horário do snapshot** no PR ou no Decision Log.
2. Conferir `supabase migration list --linked` × pasta local (drift).
3. Janela: aplicar fora do horário de pico da operação (manhã cedo/noite).
4. Saber de antemão o passo de reversão: qual backup restaurar e o que se perde (RPO real da janela).

## Roteiro do ensaio trimestral de restore

O ensaio NUNCA toca o projeto de produção — restaura para um **projeto descartável**.

1. Criar um projeto Supabase temporário (mesma região, `sa-east-1`).
2. Restaurar o backup mais recente de produção nele (painel → Backups → Restore; com PITR, escolher um timestamp de ontem).
3. Validar com as consultas de aceite:
   ```sql
   SELECT count(*) FROM public.leads;                        -- ordem de grandeza esperada (≥55 mil)
   SELECT count(*) FROM public.vendas WHERE status_venda = 'aprovada';
   SELECT max(created_at) FROM public.leads;                 -- proximidade do timestamp restaurado
   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public';                              -- ~265 funções
   SELECT relrowsecurity FROM pg_class WHERE relname = 'leads'; -- RLS ligada
   ```
4. Cronometrar do início da restauração ao aceite — esse é o RTO real; comparar com o alvo.
5. Registrar na tabela abaixo e **apagar o projeto temporário**.

## Registro de ensaios (C2)

| Data | Backup usado (id/horário) | RTO medido | RPO em vigor | Resultado / observações | Quem |
| ---- | ------------------------- | ---------- | ------------ | ----------------------- | ---- |
|      |                           |            |              |                         |      |
