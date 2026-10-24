-- Diagnóstico da Fase 1: leads vêm de public.leads (o intake de campanha registra
-- transferências e aberturas ativas, não entrada de lead). Origem de anúncio =
-- facebook_lead_ads (formulário) e chatbot (WhatsApp, inclui clique para conversar).
-- Vistas novas ao lado das da migração anterior (v_leads, v_vendas e
-- v_apelidos_pendentes ficam sem uso): criar em vez de trocar evita apagar nada.
create view marketing.v_leads_funil as
select l.lead_id, l.created_at as criado_em, l.created_at::date as dia, l.origem,
  marketing.empreendimento_de(l.empreendimento_interesse) as empreendimento_id,
  l.empreendimento_interesse as empreendimento_bruto
from public.leads l
where l.origem in ('facebook_lead_ads','facebook','chatbot')
  and not marketing.telefone_teste(l.telefone_e164);

create view marketing.v_vendas_funil as
select v.id, coalesce(v.data_contrato, v.created_at) as quando,
  coalesce(v.data_contrato, v.created_at)::date as dia, v.status_venda, v.valor_venda,
  coalesce(marketing.empreendimento_de(v.projeto), marketing.empreendimento_de(l.empreendimento_interesse)) as empreendimento_id,
  coalesce(nullif(btrim(v.projeto),''), l.empreendimento_interesse) as empreendimento_bruto
from public.vendas v
left join public.leads l on l.lead_id = v.lead_id
where not marketing.telefone_teste(l.telefone_e164);

-- Gasto e resultados da Meta por empreendimento, no período do retrato.
create view marketing.v_gasto_empreendimento as
select c.empreendimento_id, i.data_inicio, i.data_fim,
  sum(i.gasto) as gasto, sum(i.resultados) as resultados_meta,
  count(distinct c.campaign_id) as campanhas,
  bool_or(c.status = 'ACTIVE') as tem_ativa,
  max(i.capturado_em) as capturado_em
from marketing.meta_insights i
join marketing.meta_campanhas c using (campaign_id)
group by 1,2,3;

create view marketing.v_nomes_pendentes as
select fonte, nome_bruto, count(*)::int as ocorrencias, max(dia) as ultimo_dia from (
  select 'leads' fonte, empreendimento_bruto nome_bruto, dia from marketing.v_leads_funil where empreendimento_id is null
  union all select 'visitas', empreendimento_bruto, dia from marketing.v_visitas where empreendimento_id is null
  union all select 'vendas', empreendimento_bruto, dia from marketing.v_vendas_funil where empreendimento_id is null
) x
where coalesce(btrim(nome_bruto),'') <> ''
group by fonte, nome_bruto;

grant select on marketing.v_leads_funil, marketing.v_vendas_funil, marketing.v_nomes_pendentes, marketing.v_gasto_empreendimento to painel_marketing;

-- Empreendimentos das campanhas com gasto nos últimos 30 dias (24/10/2026) e as grafias conhecidas.
insert into marketing.empreendimentos (nome) values
  ('Parque das Perdizes (Playball Cury)'),
  ('Jardim das Origens (Plano&Plano São Mateus)'),
  ('Elev Saúde'),
  ('Elev Praça da Árvore'),
  ('Elev Anhaia Mello'),
  ('Vibra Marajoara'),
  ('Nova Leopoldina (Cury Mundo Apto)'),
  ('Jardim das Perdizes Sequoia')
on conflict (nome) do nothing;

insert into marketing.empreendimento_apelidos (apelido, empreendimento_id)
select a, e.id from (values
  ('parque das perdizes','Parque das Perdizes (Playball Cury)'),
  ('playball - cury','Parque das Perdizes (Playball Cury)'),
  ('cury playball','Parque das Perdizes (Playball Cury)'),
  ('playball cury','Parque das Perdizes (Playball Cury)'),
  ('playball','Parque das Perdizes (Playball Cury)'),
  ('jardim das origens','Jardim das Origens (Plano&Plano São Mateus)'),
  ('jardim das origens (parque aruá)','Jardim das Origens (Plano&Plano São Mateus)'),
  ('elev saúde','Elev Saúde'),
  ('elev saude','Elev Saúde'),
  ('eleve saude','Elev Saúde'),
  ('elev praça da árvore','Elev Praça da Árvore'),
  ('elev anhaia mello - trisul','Elev Anhaia Mello'),
  ('vibra marajoara','Vibra Marajoara'),
  ('vibra reserva marajoara','Vibra Marajoara'),
  ('nova leopoldina','Nova Leopoldina (Cury Mundo Apto)'),
  ('nova leopoldina cond. art','Nova Leopoldina (Cury Mundo Apto)'),
  ('nova leopoldina (condomínio art)','Nova Leopoldina (Cury Mundo Apto)'),
  ('cury leopoldina (mundo apto)','Nova Leopoldina (Cury Mundo Apto)')
) v(a, nome) join marketing.empreendimentos e on e.nome = v.nome
on conflict (apelido) do nothing;
