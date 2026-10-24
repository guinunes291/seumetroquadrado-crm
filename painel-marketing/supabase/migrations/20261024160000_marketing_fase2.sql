-- Fase 2: fila de aprovação para campanhas e públicos.
-- Só acrescenta (nada é apagado nem trocado de nome).

-- Cada job guarda o plano legível que o Guilherme aprova, a proposta dos agentes
-- e, na execução, o que de fato foi aplicado na Meta (para poder reverter).
alter table marketing.jobs add column if not exists titulo text;
alter table marketing.jobs add column if not exists proposta jsonb;
alter table marketing.jobs add column if not exists descartado_em timestamptz;
alter table marketing.jobs add column if not exists descartado_por text;

-- Contatos para público de lista de clientes, já em sha256 como a Meta pede
-- (só dígitos com DDI, sem "+"). O Painel nunca vê o telefone em claro.
-- Telefones de teste (551195555...) ficam de fora.
create or replace view marketing.v_publico_telefones as
select distinct
  marketing.empreendimento_de(l.empreendimento_interesse) as empreendimento_id,
  'lead'::text as fonte,
  encode(sha256(convert_to(regexp_replace(l.telefone_e164, '\D', '', 'g'), 'UTF8')), 'hex') as hash_telefone
from public.leads l
where l.telefone_e164 is not null
  and length(regexp_replace(l.telefone_e164, '\D', '', 'g')) between 12 and 13
  and not marketing.telefone_teste(l.telefone_e164)
union
select distinct
  coalesce(marketing.empreendimento_de(v.projeto), marketing.empreendimento_de(l.empreendimento_interesse)),
  'comprador',
  encode(sha256(convert_to(regexp_replace(l.telefone_e164, '\D', '', 'g'), 'UTF8')), 'hex')
from public.vendas v
join public.leads l on l.lead_id = v.lead_id
where l.telefone_e164 is not null
  and length(regexp_replace(l.telefone_e164, '\D', '', 'g')) between 12 and 13
  and not marketing.telefone_teste(l.telefone_e164);

revoke all on marketing.v_publico_telefones from public;
grant select on marketing.v_publico_telefones to painel_marketing;
