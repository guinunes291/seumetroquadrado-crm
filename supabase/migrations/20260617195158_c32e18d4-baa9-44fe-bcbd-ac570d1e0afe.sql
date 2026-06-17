-- Add zona_smq to projetos and backfill from bairro mapping
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS zona_smq text;

CREATE OR REPLACE FUNCTION public._norm_bairro(_t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(translate(
    coalesce(_t,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  )))
$$;

WITH mapping(bairro_norm, zona) AS (
  VALUES
  ('bela vista', 'Centro'),
  ('vila osasco', 'Grande SP'),
  ('chac. klabin', 'Zona Sul'),
  ('granja julieta', 'Zona Sul'),
  ('cambuci', 'Zona Sul'),
  ('jd. pirituba', 'Zona Norte'),
  ('pereira leite', 'Grande SP'),
  ('praca da arvore', 'Zona Sul'),
  ('guarulhos', 'Grande SP'),
  ('jd. botanico', 'Zona Sul'),
  ('alto da lapa', 'Zona Oeste'),
  ('parada inglesa', 'Zona Norte'),
  ('av. julio buono, 196 - vila gustavo', 'Zona Norte'),
  ('r. doutor orlando zamiti mammana, 175', 'Zona Norte'),
  ('r. grauca, 136 - vila sonia', 'Zona Oeste'),
  ('alameda doutor silvio de campos, 148 - jd. miriam', 'Zona Sul'),
  ('vila das belezas - sao paulo', 'Zona Sul'),
  ('vila nova conceicao - sp', 'Zona Sul'),
  ('cidade tremembe', 'Zona Norte'),
  ('indianopolis - sp', 'Zona Sul'),
  ('pinheiros', 'Zona Oeste'),
  ('santa cecilia', 'Centro'),
  ('alto boa vista', 'Zona Sul'),
  ('penha', 'Zona Leste'),
  ('r. tapari, 139 - vila esperanca', 'Zona Leste'),
  ('r. professor antonio austregesilo, 245', 'Zona Sul'),
  ('r. monte caseros, 167 - vila gomes', 'Zona Sul'),
  ('r. bernardino estazione, 179 - vila das belezas', 'Zona Sul'),
  ('r. rafael de proenca, 248 - vila nova das belezas', 'Zona Sul'),
  ('r. degrouz, 49 - parque imperial', 'Zona Sul'),
  ('brooklin - sp', 'Zona Sul'),
  ('itaim - sp', 'Zona Sul'),
  ('jardins - sp', 'Zona Oeste'),
  ('butanta - sp', 'Zona Oeste'),
  ('paraiso/jardins - sp', 'Zona Sul'),
  ('agua branca', 'Zona Oeste'),
  ('bom retiro', 'Centro'),
  ('mutinga', 'Zona Norte'),
  ('chac. sto antonio', 'Zona Sul'),
  ('real parque', 'Zona Sul'),
  ('v. mariana', 'Zona Sul'),
  ('pq. do carmo', 'Zona Leste'),
  ('vila cambuci', 'Zona Sul'),
  ('vila silvia', 'Zona Leste'),
  ('chacara klabin', 'Zona Sul'),
  ('av. itaquera, 6751 - cidade lider', 'Zona Leste'),
  ('av. vila ema, 4161 - vila ema', 'Zona Leste'),
  ('r. doutor jose cioffi, 432 - cidade sao mateus', 'Zona Leste'),
  ('r. barao de castro lima, 25 - real parque', 'Zona Sul'),
  ('r. aristodemo gazzotti, 91 - vila das belezas', 'Zona Sul'),
  ('cerqueira cesar - sp', 'Zona Oeste'),
  ('vila mariana - sp', 'Zona Sul'),
  ('vila carmosina', 'Zona Leste'),
  ('butanta', 'Zona Oeste'),
  ('ipiranga', 'Zona Sul'),
  ('vila leopoldina', 'Zona Oeste'),
  ('republica', 'Centro'),
  ('cidade jardim', 'Zona Sul'),
  ('sbc', 'Grande SP'),
  ('jaragua', 'Zona Norte'),
  ('santo andre', 'Grande SP'),
  ('klabin', 'Zona Sul'),
  ('analia franco', 'Zona Leste'),
  ('aricanduva', 'Zona Leste'),
  ('r. ana neri, 236 - mooca', 'Zona Leste'),
  ('r. pires pimentel, 97 - pq. da vila prudente', 'Zona Leste'),
  ('r. das gamboas, 491 - vila mazzei', 'Zona Norte'),
  ('r. umberto caputi, 127 - jd. caravelas', 'Zona Sul'),
  ('jabaquara - sp', 'Zona Sul'),
  ('vila clementino - sp', 'Zona Sul'),
  ('barra funda - sp', 'Zona Oeste'),
  ('itaim bibi - sp', 'Zona Sul'),
  ('jardim paulista - sp', 'Zona Oeste'),
  ('jd. diogo', 'Grande SP'),
  ('aclimacao - sp', 'Zona Sul'),
  ('nova klabin', 'Zona Sul'),
  ('paraiso', 'Zona Sul'),
  ('brooklin', 'Zona Sul'),
  ('vl. clementino', 'Zona Sul'),
  ('jardins', 'Zona Oeste'),
  ('consolacao', 'Centro'),
  ('vl. andrade', 'Zona Sul'),
  ('vila dos remedios', 'Zona Oeste'),
  ('r. santo antonio, 1080 - bela vista', 'Centro'),
  ('r. comendador francisco pettinati / ministro edmundo lins', 'Zona Sul'),
  ('taboao da serra', 'Grande SP'),
  ('morumbi - sao paulo', 'Zona Sul'),
  ('higienopolis - sp', 'Centro'),
  ('carrao', 'Zona Leste'),
  ('alto de pinheiros', 'Zona Oeste'),
  ('chac. santo antonio', 'Zona Sul'),
  ('jd. guedala', 'Zona Sul'),
  ('vila formosa', 'Zona Leste'),
  ('pacaembu', 'Centro'),
  ('interlagos', 'Zona Sul'),
  ('r. epitacio pessoa, 137 - republica', 'Centro'),
  ('av. brigadeiro luis antonio, 2779 - jd. paulista', 'Zona Oeste'),
  ('av. ouro verde de minas, 1949 - jd. imperador', 'Zona Leste'),
  ('r. boleeiro, 20 - itaquera', 'Zona Leste'),
  ('r. tocandira, 83 - vila regente feijo', 'Zona Leste'),
  ('r. silveira campos, 66 - cambuci', 'Zona Sul'),
  ('r. dias vieira, 410/238 - vila sonia', 'Zona Oeste'),
  ('av. das belezas, 605 / r. joao calixto, 40', 'Zona Sul'),
  ('paraiso - sp', 'Zona Sul'),
  ('cruz preta', 'Grande SP'),
  ('presidente altino', 'Grande SP'),
  ('perdizes', 'Zona Oeste'),
  ('vila romana', 'Zona Oeste'),
  ('pompeia', 'Zona Oeste'),
  ('jacana', 'Zona Norte'),
  ('vila saude', 'Zona Sul'),
  ('santa marina', 'Zona Sul'),
  ('assuncao', 'Grande SP'),
  ('limao', 'Zona Norte'),
  ('r. tobias barreto, 501 - mooca', 'Zona Leste'),
  ('r. adolfo schnabel, 132 - vila ema', 'Zona Leste'),
  ('r. benedito guedes de oliveira, 309 - vila palmeiras', 'Zona Norte'),
  ('r. conselheiro moreira de barros, 1379 - santana', 'Zona Norte'),
  ('r. isaias branco de araujo, 109 - vila das belezas', 'Zona Sul'),
  ('vila madalena - sp', 'Zona Oeste'),
  ('vila clementino', 'Zona Sul'),
  ('pirituba', 'Zona Norte'),
  ('freguesia do o', 'Zona Norte'),
  ('vila prel', 'Zona Sul'),
  ('sto amaro', 'Zona Sul'),
  ('jundiai', 'Grande SP'),
  ('colonia', 'Zona Leste'),
  ('vila buarque', 'Centro'),
  ('santo amaro', 'Zona Sul'),
  ('freguesia', 'Zona Norte'),
  ('r. baixada santista, 586 - itaquera', 'Zona Leste'),
  ('r. bento luiz, s/n - parque boturussu', 'Zona Leste'),
  ('av. cristo rei, 214 - vila pereira barreto', 'Zona Norte'),
  ('r. sheldon, 67 - lapa', 'Zona Oeste'),
  ('r. dona rosina, 276 - perus', 'Zona Norte'),
  ('r. marilia de dirceu, 274 - jd. aeroporto', 'Zona Sul'),
  ('r. alexandre benois, 17 - vila andrade', 'Zona Sul'),
  ('r. catulo da paixao cearense, 544 - vila da saude', 'Zona Sul'),
  ('jabaquara - sao paulo', 'Zona Sul'),
  ('perdizes - sp', 'Zona Oeste'),
  ('liberdade - sp', 'Centro'),
  ('jardim angela - sp', 'Zona Sul'),
  ('vila yara', 'Grande SP'),
  ('alphaville conde i', 'Grande SP'),
  ('itaim bibi', 'Zona Sul'),
  ('higienopolis', 'Centro'),
  ('alto do ipiranga', 'Zona Sul'),
  ('bosque da saude', 'Zona Sul'),
  ('cupece', 'Zona Sul'),
  ('boacava', 'Zona Oeste'),
  ('r. barao de iguape, 855 - liberdade', 'Centro'),
  ('av. cangaiba, 3720 - cidade lider', 'Zona Leste'),
  ('av. guilherme mankel, 381 - vila clarice', 'Zona Norte'),
  ('r. guaicurus, 827 - lapa', 'Zona Oeste'),
  ('r. guaicurus, 1037 - agua branca', 'Zona Oeste'),
  ('r. joao alfredo, 342 - santo amaro', 'Zona Sul'),
  ('bela vista - sp', 'Centro'),
  ('alto da lapa - sp', 'Zona Oeste'),
  ('jardim da saude', 'Zona Sul'),
  ('jabaquara', 'Zona Sul'),
  ('saude', 'Zona Sul'),
  ('liberdade', 'Centro'),
  ('lapa', 'Zona Oeste'),
  ('guarapiranga', 'Zona Sul'),
  ('perdizes/pacaembu', 'Zona Oeste'),
  ('itaquera', 'Zona Leste'),
  ('jd. angela', 'Zona Sul'),
  ('campos eliseos', 'Centro'),
  ('vila matilde', 'Zona Leste'),
  ('r. barao de campinas, 265 - campos eliseos', 'Centro'),
  ('r. mituto mizumoto, 392 - liberdade', 'Centro'),
  ('r. correia da camara, 422 - vila tolstoi', 'Zona Leste'),
  ('r. francisco coimbra, 797 - penha de franca', 'Zona Leste'),
  ('r. guaracica, 341 - vila curuca', 'Zona Leste'),
  ('r. oti, 115 - vila re', 'Zona Leste'),
  ('r. tomas goncalves, 114 - vila gomes', 'Zona Oeste'),
  ('r. catipara, 285 - brooklin paulista', 'Zona Sul'),
  ('r. marques de lages, 1150 - vila moraes', 'Zona Sul'),
  ('chacara sto antonio - sao paulo', 'Zona Sul'),
  ('osasco', 'Grande SP'),
  ('mooca', 'Zona Leste'),
  ('belem', 'Zona Leste'),
  ('jaguare', 'Zona Oeste'),
  ('campo limpo', 'Zona Sul'),
  ('vila olimpia', 'Zona Sul'),
  ('vl. madalena', 'Zona Oeste'),
  ('cursino', 'Zona Sul'),
  ('r. munhoz de melo, 190 - jd. danfer', 'Zona Leste'),
  ('r. irma emerenciana / av. paulo lincoln', 'Zona Norte'),
  ('av. jornalista paulo zingg, 1031 - jd. jaragua', 'Zona Norte'),
  ('rudge ramos', 'Grande SP'),
  ('vila madalena', 'Zona Oeste'),
  ('vila prudente', 'Zona Leste'),
  ('bras', 'Zona Leste'),
  ('sacoma', 'Zona Sul'),
  ('parque do carmo', 'Zona Leste'),
  ('barra funda/sta cecilia', 'Zona Oeste'),
  ('suzano', 'Grande SP'),
  ('cotia', 'Grande SP'),
  ('ibirapuera', 'Zona Sul'),
  ('santana', 'Zona Norte'),
  ('rua palmerino calabrese, 151 - vila santana', 'Zona Norte'),
  ('r. silvio de sousa / euclides payao silveira', 'Zona Leste'),
  ('r. ari cajado, 158 - vila monument', 'Zona Leste'),
  ('av. nazare, 2075 / r. padre francisco xavier roser', 'Zona Sul'),
  ('r. giovanni di balduccio, s/n - vila moraes', 'Zona Sul'),
  ('r. jureia, 216 - chacara inglesa', 'Zona Sul'),
  ('freguesia - sao paulo', 'Zona Norte'),
  ('pinheiros - sp', 'Zona Oeste'),
  ('vila re', 'Zona Leste'),
  ('centro', 'Centro'),
  ('barra funda', 'Zona Oeste'),
  ('moema', 'Zona Sul'),
  ('conceicao', 'Zona Sul'),
  ('alto da boa vista', 'Zona Sul'),
  ('vila carrao', 'Zona Leste'),
  ('lapa/perdizes', 'Zona Oeste'),
  ('vl. romana', 'Zona Oeste'),
  ('itaim', 'Zona Sul'),
  ('jardim', 'Grande SP'),
  ('ceramica', 'Grande SP'),
  ('vila guarani', 'Zona Sul'),
  ('av. adriano bertozzi, 624 - jd. helian', 'Zona Leste'),
  ('r. baltazar da silveira, 139 - vila pereira', 'Zona Norte'),
  ('r. fernao vaz da costa, 90 - campo limpo', 'Zona Sul'),
  ('r. calogero calia, 593 - vila santo estefano', 'Zona Sul'),
  ('moema - sp', 'Zona Sul'),
  ('centro - sp', 'Centro'),
  ('jd. do mar', 'Zona Sul'),
  ('aclimacao', 'Zona Sul'),
  ('indianopolis', 'Zona Sul'),
  ('vl. leopoldina', 'Zona Oeste'),
  ('tucuruvi', 'Zona Norte'),
  ('cidade tiradentes', 'Zona Leste'),
  ('itaim paulista', 'Zona Leste'),
  ('vila das belezas', 'Zona Sul'),
  ('marajoara', 'Zona Sul'),
  ('rudge ramos (abc)', 'Grande SP'),
  ('r. iarucu/guaraxaim/palmerino calabrese', 'Zona Leste'),
  ('r. sao serapiao, 357 - vila re', 'Zona Leste'),
  ('r. cumai, 190 - vila matilde', 'Zona Leste'),
  ('r. carlos da cunha mattos / celso vieira', 'Zona Norte'),
  ('r. tiagem, 175 - jaguare', 'Zona Oeste'),
  ('r. conde moreira lima, 522 - jd. jabaquara', 'Zona Sul'),
  ('estrada das lagrimas, 472 - ipiranga', 'Zona Sul'),
  ('r. juari, 116 - jd. sabara', 'Zona Sul'),
  ('r. gil simoes da costa, 170 - parque reboucas', 'Zona Sul'),
  ('saude - sao paulo', 'Zona Sul'),
  ('consolacao - sp', 'Centro'),
  ('v. carrao', 'Zona Leste'),
  ('vila leopoldina - sp', 'Zona Oeste'),
  ('morumbi', 'Zona Sul'),
  ('panamby', 'Zona Sul'),
  ('vila mariana', 'Zona Sul'),
  ('nova cantareira', 'Zona Norte'),
  ('ponte grande (guarulhos)', 'Grande SP'),
  ('campo belo', 'Zona Sul'),
  ('jd. america de penha', 'Zona Oeste'),
  ('jd. aricanduva', 'Zona Leste'),
  ('r. henrique jacobs, 96 - vila santa teresa', 'Zona Leste'),
  ('r. santo henrique, 648 - patriarca', 'Zona Leste'),
  ('r. balsa, 158 - vila santa delfina', 'Zona Norte'),
  ('r. sao francisco de assis, 811 - vila guedes', 'Zona Norte'),
  ('r. conselheiro amaral, 182 - vila jaguara', 'Zona Oeste'),
  ('r. joao delgado, 199 - itaberaba', 'Zona Norte'),
  ('r. marquesa de santos, 127 - vila dom pedro i', 'Zona Sul'),
  ('r. alsacia, 280 - jd. aeroporto', 'Zona Sul'),
  ('r. marguerite louise riechelman, 116 - vila erna', 'Zona Sul'),
  ('r. nove de julho, 220 - santo amaro', 'Zona Sul'),
  ('mooca - sp', 'Zona Leste'),
  ('santa paula', 'Zona Sul'),
  ('alphaville', 'Grande SP'),
  ('jd. paulista', 'Zona Oeste'),
  ('vila cruzeiro', 'Zona Sul'),
  ('vila mascote', 'Zona Sul'),
  ('tatuape', 'Zona Leste'),
  ('centro historico', 'Centro'),
  ('mirandopolis', 'Zona Sul'),
  ('vila ema', 'Zona Leste'),
  ('pq. s. vicente (maua)', 'Grande SP'),
  ('campestre', 'Grande SP'),
  ('vila das merces', 'Zona Sul'),
  ('r. doutor alarico silveira, 612 - vila aricanduva', 'Zona Leste'),
  ('av. vila ema, 6600 - vila ema', 'Zona Leste'),
  ('r. dona ana araujo de paula, 482 - vila santa clara', 'Zona Leste'),
  ('r. jericino, 86 - chacara california', 'Zona Leste'),
  ('r. henrique ongari, 381 - agua branca', 'Zona Oeste'),
  ('r. capichana, 128 - vila nair', 'Zona Sul'),
  ('jd. guedala - sp', 'Zona Sul')
)
UPDATE public.projetos p
SET zona_smq = m.zona
FROM mapping m
WHERE public._norm_bairro(p.bairro) = m.bairro_norm
  AND (p.zona_smq IS NULL OR p.zona_smq <> m.zona);

CREATE OR REPLACE FUNCTION public._oferta_ativa_query(_filtros jsonb, _corretor uuid)
RETURNS SETOF public.leads
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  _statuses text[];
  _temps text[];
  _projetos uuid[];
  _origens text[];
  _zonas text[];
  _sem_dias int;
BEGIN
  _statuses := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'status','[]'::jsonb)));
  _temps    := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'temperatura','[]'::jsonb)));
  _projetos := ARRAY(SELECT (jsonb_array_elements_text(COALESCE(_filtros->'projetoId','[]'::jsonb)))::uuid);
  _origens  := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'origem','[]'::jsonb)));
  _zonas    := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_filtros->'zona','[]'::jsonb)));
  _sem_dias := NULLIF(_filtros->>'semInteracaoHaDias','')::int;

  RETURN QUERY
  SELECT l.* FROM public.leads l
  WHERE l.deleted_at IS NULL AND l.na_lixeira = false
    AND (_corretor IS NULL OR l.corretor_id = _corretor)
    AND (COALESCE(array_length(_statuses,1),0) = 0 OR l.status::text = ANY(_statuses))
    AND (COALESCE(array_length(_temps,1),0) = 0 OR l.temperatura::text = ANY(_temps))
    AND (
      COALESCE(array_length(_projetos,1),0) = 0
      OR l.projeto_id = ANY(_projetos)
      OR EXISTS (
        SELECT 1 FROM public.projetos p
        WHERE p.id = ANY(_projetos)
          AND l.projeto_nome IS NOT NULL
          AND lower(btrim(l.projeto_nome)) = lower(btrim(p.nome))
      )
    )
    AND (COALESCE(array_length(_origens,1),0) = 0 OR l.origem::text = ANY(_origens))
    AND (
      COALESCE(array_length(_zonas,1),0) = 0
      OR EXISTS (
        SELECT 1 FROM public.projetos p
        WHERE p.zona_smq = ANY(_zonas)
          AND (
            l.projeto_id = p.id
            OR (l.projeto_nome IS NOT NULL AND lower(btrim(l.projeto_nome)) = lower(btrim(p.nome)))
          )
      )
    )
    AND (
      _sem_dias IS NULL
      OR l.ultima_interacao IS NULL
      OR l.ultima_interacao < now() - (_sem_dias || ' days')::interval
    );
END;
$func$;