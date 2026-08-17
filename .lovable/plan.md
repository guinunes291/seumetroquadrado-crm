# Zona em toda a base de clientes

Hoje **nenhum** dos 61.428 clientes tem zona preenchida, e o motivo é simples: a
cascata que resolve zona (zona → bairro → empreendimento) não tem de onde puxar.
Ninguém tem bairro preenchido e os 29 empreendimentos que concentram os clientes
estão sem "Zona SMQ".

Diagnóstico atual:

| Situação                                                     | Clientes |
| ------------------------------------------------------------ | -------- |
| Vinculados a empreendimento **sem zona cadastrada**           | 25.796   |
| Vinculados a empreendimento **com zona** (já resolvem sozinho) | 1.403    |
| Sem vínculo, mas com nome de campanha/empreendimento no texto | 9.974    |
| Sem nenhuma pista geográfica                                  | 24.255   |

## Passo 1 — zona nos 29 empreendimentos (destrava 25.796 de uma vez)

Preencher "Zona SMQ" nos empreendimentos abaixo. É o passo de maior alavancagem:
resolve 42% da base e faz todo lead novo daquele empreendimento nascer com zona.
Proposta de mapeamento (confirme ou corrija os marcados com "?"):

| Empreendimento | Clientes | Zona |
| --- | --- | --- |
| Longitude Tietê | 2.674 | Norte |
| Zen Residence | 2.539 | ? |
| Longitude Rio Branco | 2.212 | Centro |
| Longitude Perus | 2.075 | Norte |
| Longitude Estação Dom Bosco | 1.915 | Leste |
| Longitude Città | 1.691 | ? |
| Conquista Clube Itaim Paulista | 1.547 | Leste |
| Vibe Residencial | 1.507 | ? |
| Pátio Central Galeria (Cambuci) | 1.375 | Centro |
| Signature Barra Funda | 1.211 | Oeste |
| 011 Brooklin | 954 | Sul |
| Longitude Estação Guaianases | 887 | Leste |
| Longitude Estação Freguesia | 879 | Norte |
| Holistic Residence | 762 | ? |
| Concept Barra Funda Residence | 568 | Oeste |
| Raiz Home Clube (Limão) | 519 | Norte |
| Conquista Sacomã | 449 | Sul |
| Brooklin Sky Home Tower | 446 | Sul |
| Abytá Santo Amaro | 419 | Sul |
| Conquista Clube Butantã | 332 | Oeste |
| Mirante Jardim das Esmeraldas | 213 | Leste |
| Alto Liviero (Ipiranga) | 167 | Sul |
| Volume | 155 | ? |
| Conquista São Miguel | 96 | Leste |
| Casa Prado Residence | 88 | ? |
| Reserva Direcional Limão | 83 | Norte |
| Well Perdizes | 21 | Oeste |
| MA Vila Prudente | 10 | Leste |
| Longitude Tucuruvi | 2 | Norte |

## Passo 2 — propagar a zona para a base

Rodar um backfill único: para todo cliente sem zona, gravar a zona do
empreendimento vinculado. Só escreve onde está vazio — nada que a gestão já
tenha ajustado à mão é sobrescrito.

## Passo 3 — os 9.974 sem vínculo, com nome de campanha

Casar o texto (`projeto_nome`, ex.: "Riva SP - Signature 05.25", "SPC - Zona
Leste 04.2024", "LIMÃO - RAIZ") com o empreendimento correspondente e herdar a
zona dele. Nomes genéricos ("BR - Orgânico", "Motoboy", "minha casa minha
vida") continuam sem zona — chutar zona é pior que não ter.

## Passo 4 — o que sobra (~24 mil) e o futuro

- Esses seguem sem zona e caem no fluxo por origem (Plantão), como o modelo já
  prevê. Ganham zona naturalmente quando o corretor preencher bairro/zona na
  ficha, ou quando forem vinculados a um empreendimento.
- Para acelerar: incluir **bairro** na ficha do cliente e na tela de edição em
  massa, já que a tabela `zonas_bairros` (169 bairros) converte bairro em zona
  automaticamente.

## Detalhes técnicos

- Passo 1 e 2 saem como uma migração de dados (UPDATE em `projetos.zona_smq` e
  `leads.zona`), com o trigger existente `zona_normalizar` cuidando do formato.
- Passo 3 usa correspondência por texto normalizado (sem acento/caixa) contra os
  nomes de `projetos`, com revisão da lista de correspondências antes de gravar.
- Conferência ao final: contagem de clientes por zona e por roleta resolvida
  (`zona_do_lead`), para a gestão validar antes de montar os times.
