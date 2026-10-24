-- Biblioteca: empreendimentos que faltavam, anúncios de vagas em categoria
-- própria e teto de custo por empreendimento. Só acrescenta; nada é apagado.

-- Teto de custo por resultado de cada empreendimento. Vazio usa o teto geral
-- do Painel (R$ 20), porque ticket e público mudam de um para outro.
alter table marketing.empreendimentos add column if not exists custo_teto numeric(10,2)
  check (custo_teto is null or custo_teto > 0);

-- Empreendimentos que aparecem nos nomes das campanhas e não estavam cadastrados.
insert into marketing.empreendimentos (nome) values
  ('Mundo Apto Morumbi'), ('Mundo Apto Borba Gato'), ('Vibra Sabará'), ('Novvo Santa Marina'),
  ('Well Perdizes'), ('Vibra Vila Prudente'), ('Estilo Lapa'), ('Lyne Cury'),
  ('Abytá Nações Unidas'), ('MOB Barra Funda'), ('Magik Albuquerque Lins'),
  ('Vibra Paes de Barros'), ('Mirae Bom Retiro'), ('Longitude Rio Branco'),
  ('Longitude Tucuruvi'), ('Sinfonia Santo Amaro'), ('Mundo Apto Voluntários da Pátria'),
  ('Elevato Pinheiros'), ('Lavvi Hípica'), ('Vibra Vila Mooca'), ('Galeria SP'),
  ('Raiz Home Clube'), ('Supreme Vila Romana'), ('Vibra Vila Romana')
on conflict (nome) do nothing;

insert into marketing.empreendimento_apelidos (apelido, empreendimento_id)
select a.apelido, e.id
from (values
  ('morumbi mundoapto', 'Mundo Apto Morumbi'),
  ('morumbi borbagato', 'Mundo Apto Borba Gato'), ('borbagato mundoapto', 'Mundo Apto Borba Gato'),
  ('vibra sabará', 'Vibra Sabará'), ('vibra sabara', 'Vibra Sabará'),
  ('novvo santa marina', 'Novvo Santa Marina'),
  ('well perdizes', 'Well Perdizes'), ('vid well', 'Well Perdizes'),
  ('vibra vila prudente', 'Vibra Vila Prudente'),
  ('estilo lapa', 'Estilo Lapa'),
  ('lyne cury', 'Lyne Cury'),
  ('abytá', 'Abytá Nações Unidas'), ('abyta', 'Abytá Nações Unidas'),
  ('mob barra funda', 'MOB Barra Funda'), ('vid mob', 'MOB Barra Funda'),
  ('magik albuquerque lins', 'Magik Albuquerque Lins'),
  ('vibra paes de barros', 'Vibra Paes de Barros'),
  ('mirae bom retiro', 'Mirae Bom Retiro'),
  ('longitude rio branco', 'Longitude Rio Branco'),
  ('longitude tucuruvi', 'Longitude Tucuruvi'),
  ('sinfonia santo amaro', 'Sinfonia Santo Amaro'),
  ('ma voluntários da pa', 'Mundo Apto Voluntários da Pátria'),
  ('pinheiros elevato', 'Elevato Pinheiros'),
  ('lavvi hípica', 'Lavvi Hípica'), ('lavvi hipica', 'Lavvi Hípica'),
  ('vibra vila mooca', 'Vibra Vila Mooca'),
  ('pub sem 2% - galeria', 'Galeria SP'), ('galeria sp', 'Galeria SP'),
  ('raiz home clube', 'Raiz Home Clube'), ('raíz home clube', 'Raiz Home Clube'),
  ('- raiz -', 'Raiz Home Clube'), ('leads - raiz', 'Raiz Home Clube'), ('testes raíz', 'Raiz Home Clube'),
  ('aptos raíz', 'Raiz Home Clube'), ('raiz foto', 'Raiz Home Clube'), ('vídeo raíz', 'Raiz Home Clube'),
  ('raíz //', 'Raiz Home Clube'), ('raíz teste', 'Raiz Home Clube'), ('forms raíz', 'Raiz Home Clube'),
  ('novo video - raíz', 'Raiz Home Clube'), ('leads - raiz', 'Raiz Home Clube'),
  ('supreme vila romana', 'Supreme Vila Romana'),
  ('vila romana vibra', 'Vibra Vila Romana'),
  ('jd das perdizes', 'Jardim das Perdizes Sequoia'), ('jardim das perdizes', 'Jardim das Perdizes Sequoia'),
  ('elev anhaia mello', 'Elev Anhaia Mello')
) as a(apelido, nome)
join marketing.empreendimentos e on e.nome = a.nome
on conflict (apelido) do nothing;

-- Campanhas ainda sem vínculo cujo nome agora bate com um apelido.
update marketing.meta_campanhas c set empreendimento_id = x.empreendimento_id, vinculo = 'nome',
  atualizado_em = now()
from (
  select distinct on (c2.campaign_id) c2.campaign_id, a.empreendimento_id
  from marketing.meta_campanhas c2
  join marketing.empreendimento_apelidos a on position(a.apelido in lower(c2.nome)) > 0
  where c2.vinculo = 'pendente'
  order by c2.campaign_id, length(a.apelido) desc
) x
where c.campaign_id = x.campaign_id;

-- A view ganha duas colunas no fim:
-- categoria: 'recrutamento' para anúncios de vagas de corretor, 'vendas' para o resto.
--   O nome da campanha manda ("Vagas", "Contratação"); no texto só valem frases de
--   recrutamento, porque "vaga" sozinha costuma ser vaga de garagem.
-- custo_teto: o teto do empreendimento, ou o geral.
-- Quando o nome não traz apelido, procura no texto só apelidos longos
-- (8 letras ou mais), para não ligar por acaso.
create or replace view marketing.v_criativos as
select x.*,
  case when coalesce(x.campanha_nome, '') || ' ' || x.nome ~* '(vagas|contrata[cç][aã]o|recrut)'
         or coalesce(x.texto, '') ~* '(estamos contratando|fazer parte do nosso time|venha ser corretor|vagas para corretor|vagas abertas|oportunidade de carreira|#emprego)'
       then 'recrutamento' else 'vendas' end as categoria,
  e.custo_teto
from (
  select c.*,
    case when mc.vinculo = 'fora' then null else coalesce(
      case when mc.vinculo in ('nome','manual') then mc.empreendimento_id end,
      (select a.empreendimento_id from marketing.empreendimento_apelidos a
        where position(a.apelido in lower(coalesce(c.campanha_nome, '') || ' ' || c.nome)) > 0
        order by length(a.apelido) desc limit 1),
      (select a.empreendimento_id from marketing.empreendimento_apelidos a
        where length(a.apelido) >= 8
          and position(a.apelido in lower(coalesce(c.titulo, '') || ' ' || coalesce(c.texto, ''))) > 0
        order by length(a.apelido) desc limit 1)
    ) end as empreendimento_id,
    case when c.resultados > 0 then round(c.gasto / c.resultados, 2) end as custo_por_resultado,
    case when c.impressoes > 0 then round(100.0 * c.cliques / c.impressoes, 2) end as ctr
  from marketing.criativos c
  left join marketing.meta_campanhas mc on mc.campaign_id = c.campaign_id
) x
left join marketing.empreendimentos e on e.id = x.empreendimento_id;
