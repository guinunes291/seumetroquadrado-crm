# Prompt para o Lovable — Fase 3.1 (corrigir a busca por telefone)

**Como usar:** cole no Lovable, na mesma conversa. É uma correção focada, não uma fase nova.

---

Fases 1 e 3 recebidas. Duas coisas antes da correção:

**A decisão do Desfazer está certa.** Não reabrir tarefas concluídas no undo é o
comportamento correto — o contato aconteceu de fato, e desfazer o registro não desfaz a
ligação. Obrigado por documentar em vez de decidir em silêncio.

**O achado do telefone é o mais valioso desta rodada.** Sem ele, a integração teria
sido ligada e continuaria sem funcionar para a maior parte da base. Mas **a solução
proposta está no lugar errado**, e a explicação abaixo importa.

---

## Por que "o n8n tira o 55" não resolve

| Como o telefone está gravado | Leads | Se o n8n tirar o 55 |
| --- | ---: | :---: |
| Sem o 55 | 56.217 | ✅ passa a encontrar |
| **Com o 55** | **4.465** | ❌ **para de encontrar** |

A correção trocaria 56.217 falhas por 4.465 falhas novas. E cria uma regra de
normalização de telefone **fora do banco**, que todo chamador futuro (Meta Cloud API,
outro provedor, um script) teria que reimplementar igual.

O lugar certo é a RPC.

---

## A casa já resolveu isso — duas semanas atrás

A busca que o webhook usa, `buscar_lead_ativo_por_telefone_global`
(migration `20260711201106`), compara dígito a dígito:

```sql
AND public.telefone_digits(l.telefone) = public.telefone_digits(_telefone)
```

Dois problemas: exige o mesmo prefixo de país nos dois lados, e **ignora a coluna
`telefone_e164`**, que existe e é preenchida por trigger (`normalize_phone_smq`).

Mas a migration `20260902151052` já estabeleceu a convenção robusta, em
`mesclar_leads_por_telefone`:

```sql
right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9)
  = right(_chave, 9)
```

**E já existe índice para exatamente essa expressão:**

```sql
CREATE INDEX leads_tel9_ativo_idx
  ON public.leads ((right(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g'), 9)))
  WHERE na_lixeira = false AND deleted_at IS NULL;
```

Comparar pelos **9 últimos dígitos** é agnóstico a prefixo de país, cobre os dois
formatos de gravação e usa `telefone_e164` quando existe. **A convenção certa já está
no repositório — só o webhook ficou na antiga.**

---

## ⚠️ Antes de aplicar: meça o risco de colisão

9 dígitos não incluem o DDD. Dois clientes de DDDs diferentes com o mesmo número de
assinante — `(11) 99999-8888` e `(21) 99999-8888` — colidiriam.

O `mesclar_leads_por_telefone` já aceitou esse risco, e ele **funde** leads (bem mais
perigoso que consultar um). Ainda assim, quero o tamanho do problema antes de mexer:

```sql
SELECT count(*) AS chaves_colidindo, sum(n) AS leads_envolvidos
  FROM (
    SELECT right(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g'), 9) AS tel9,
           count(*) AS n
      FROM public.leads
     WHERE deleted_at IS NULL AND na_lixeira = false AND status <> 'perdido'
       AND length(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g')) >= 9
     GROUP BY 1 HAVING count(*) > 1
  ) t;
```

**Me mostre esse número antes de seguir.** Se vier alto, eu mudo a recomendação para
"casar por 11 dígitos quando os dois lados tiverem, e cair para 9 só como fallback".

---

## A correção

Migration nova, substituindo `buscar_lead_ativo_por_telefone_global` pela mesma
expressão da convenção nova:

```sql
CREATE OR REPLACE FUNCTION public.buscar_lead_ativo_por_telefone_global(_telefone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status <> 'perdido'
    AND length(public.telefone_digits(coalesce(l.telefone_e164, l.telefone))) >= 9
    AND right(public.telefone_digits(coalesce(l.telefone_e164, l.telefone)), 9)
      = right(public.telefone_digits(_telefone), 9)
  ORDER BY l.updated_at DESC
  LIMIT 1;
$$;
```

Requisitos:

- **Confirme que o plano usa `leads_tel9_ativo_idx`** (`EXPLAIN`). Se a expressão que
  você escrever não casar com a do índice ao caractere, ele não é usado e a busca vira
  varredura em 63 mil linhas a cada mensagem. **Me mostre o `EXPLAIN`.**
- Mantenha `GRANT`/`REVOKE` como estão hoje.
- Rollback no próprio arquivo: o corpo antigo, em comentário.
- **Não mexa** em `mesclar_leads_por_telefone` nem no índice.

## O teste que prova

Crie **dois** leads de teste, um com telefone gravado **com** o 55 e outro **sem**, e
prove que **os dois** são encontrados quando a mensagem chega no formato E.164 do
WhatsApp (`55` + DDD + número). Depois apague os dois.

Esse é o teste que a Fase 3 não tinha — o lead de teste original não cobria a diferença
de formato, que é justamente onde estava o defeito.

## Depois de aplicar

Atualize `docs/ops/2026-09-16-whatsapp-webhook-contrato.md`:

- O n8n manda o telefone **como o provedor entrega** (E.164, com o 55). **Sem tirar
  nada.** A normalização é do banco.
- Registre a convenção: *"casamento por 9 dígitos, `coalesce(telefone_e164, telefone)`,
  índice `leads_tel9_ativo_idx`"*, e que agora ela vale para busca **e** para merge.

## Resíduo conhecido — só medir, não corrigir agora

Telefone fixo antigo tem 8 dígitos de assinante. Se um lead foi gravado só com DDD + 8
dígitos, os "9 últimos" pegam 1 dígito do DDD e o casamento falha. Quantos são:

```sql
SELECT count(*) AS com_menos_de_9_digitos
  FROM public.leads
 WHERE deleted_at IS NULL AND na_lixeira = false
   AND length(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g')) < 9;
```

Me mande o número. Se for pequeno, fica como está — WhatsApp em telefone fixo é raro.
