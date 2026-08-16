# Distribuição por Zonas — modelo e runbook de virada

Decisão de produto (2026-08-16): **a roleta é a zona**. A distribuição passa a
ter 4 roletas geográficas — **Zona Norte, Zona Sul, Zona Leste, Zona Oeste** —
com os corretores de cada uma definidos manualmente pela gestão. A participação
na roleta É o corte geográfico: quem está na roleta da zona recebe os leads
daquela zona, em rodízio simples (há mais tempo sem receber).

Implementado na migration `20260816140000_roletas_por_zona.sql`.

## Como um lead ganha zona (nada disso mudou de lugar)

Cascata `zona_do_lead` (migration 20260813):

1. `leads.zona` explícita (texto livre normalizado pelo trigger: "zona leste",
   "ZL" → `Leste`);
2. `leads.bairro` → tabela `zonas_bairros` (169 bairros de SP, editável);
3. zona do projeto (`projetos.zona_smq` → `regiao`).

Quem grava o quê:

| Canal | Campo que vira zona |
| --- | --- |
| Facebook/Zapier (`lead-intake`) | `zona`/`regiao` e `bairro` do payload |
| Landing page | `regiao` (região de interesse do formulário) |
| Chatbot/Marquinhos (webhook por token) | **novo:** `zona` explícita ou `regiao` da qualificação IA, e `bairro` |
| Criação manual / ficha do lead | campos zona e bairro |

O que não normaliza (ex.: "ABC Paulista", "Guarulhos") fica sem zona — o lead
segue o fluxo por origem, sem travar.

## Como o motor escolhe a roleta (ordem de precedência)

```
slug explícito (manual/exceção/repasse)
  → roleta_da_zona(zona do lead)          ← NOVO
    → mapeamento por canal/origem (landing → landing; chatbot → marquinhos; resto → plantão)
```

`roleta_da_zona` só devolve a roleta da zona se ela está **ativa e tem pelo
menos um participante ativo não pausado**. Roleta ainda não montada nunca
engole lead. As campanhas (tokens por empreendimento) também respeitam a zona:
`distribuir_lead_ponderado` delega para a roleta da zona quando ela existe; a
campanha fica registrada no contexto da decisão (`campanha_zona`).

Dentro da roleta de zona **não** existe segundo filtro por `profiles.zonas` —
a participação já é o corte. Esse filtro por corretor continua valendo apenas
nas roletas de origem e de campanha.

Fallbacks, na ordem em que podem acontecer:

- **Lead sem zona** (não normalizou / fora do recorte) → fluxo por origem.
- **Centro** → sem roleta por decisão; segue o fluxo por origem. Para criar a
  quinta roleta depois: inserir roleta `zona-centro` + linha
  `('Centro','zona-centro')` em `zonas_roletas`.
- **Roleta da zona vazia/desativada** → fluxo por origem.
- **Roleta da zona com time, mas ninguém apto agora** (ausência, cota, pausa)
  → fila de exceções + alerta ao gestor + cron re-tenta a cada minuto — o
  comportamento padrão do motor, nada muda.
- **Repasse por SLA** → o lead distribuído por roleta de zona ganha
  `roleta_slug` da zona, então o repasse fica dentro do mesmo time da zona.

## Runbook da virada (amanhã)

1. **Deploy**: merge desta branch → a migration cria as 4 roletas (vazias) e o
   mapeamento. Nada muda até existir corretor nas roletas.
2. **Montar os times**: Central de Distribuição → aba **Roletas por Zona** →
   selecionar a zona → **Incluir corretor** (repetir para as 4). A partir do
   primeiro corretor incluído, a zona passa a rotear na hora.
3. **Presença**: as roletas de zona nascem com `exigir_presenca = true` (mesma
   regra das demais) — corretor precisa marcar "Cheguei" no dia para receber.
   Para desligar por zona: Configurações → Roletas — funcionamento.
4. **Cotas**: limite diário padrão (`limite_diario_default`, hoje 10) vale por
   roleta; ajustar por corretor na própria aba (ação "Ajustar limite diário").
5. **Acompanhar**: aba Visão Geral (cards das 4 zonas com aptos e próximo da
   vez), aba Histórico (botão "Por quê?" mostra zona, roleta e aptos/inaptos de
   cada decisão), fila de Exceções.

Verificação rápida pós-virada (SQL no banco do CRM):

```sql
-- leads das últimas 24h por zona resolvida
SELECT public.zona_do_lead(id) AS zona, count(*)
FROM public.leads WHERE created_at > now() - interval '24 hours'
GROUP BY 1 ORDER BY 2 DESC;

-- decisões por roleta nas últimas 24h
SELECT roleta_slug, resultado, count(*)
FROM public.distribution_log WHERE created_at > now() - interval '24 hours'
GROUP BY 1, 2 ORDER BY 1;
```

## Consolidação das roletas (migration 20260816150000)

A Central caiu de 9 para 7 abas: **Visão Geral · Roletas por Zona · Roletas de
Origem · Exceções · Histórico · Configurações · Auditoria**. Plantão,
Marquinhos e Landing viraram uma aba só ("Roletas de Origem"), com seletor —
com o modelo por zona elas são o fallback de quem não tem zona, não merecem
três abas de primeira classe.

Mesclar/desativar roleta virou operação de dados, segura e reversível:

- O destino fixo da landing saiu do código: o canal da landing page resolve
  pela linha **site** do mapeamento origem → roleta (Configurações). Reapontar
  `site` move também os leads de LP.
- Roleta de origem **desativada ou sem time** não represa lead: a triagem
  desvia para o Plantão (quando pronto), com o desvio auditável no contexto
  (`origem_fallback`). Antes, desativar a Marquinhos mandava todo lead de
  chatbot sem zona para a fila de exceções.

Recomendação de estado-alvo, quando a operação por zona estiver rodando bem:

| Roleta | Veredito | Como |
| --- | --- | --- |
| 4 zonas | **Principal** | Times definidos pela gestão |
| Plantão | **Manter** — é o catch-all | Nada a fazer |
| Marquinhos | Mesclar no Plantão | Configurações: `chatbot` → Plantão; desativar a roleta |
| Landing | Mesclar no Plantão | Configurações: `site` → Plantão; desativar a roleta |
| Campanhas (7) | Desativar conforme encerram | Painel Campanhas: switch Ativa; token desativado cai na triagem normal |

Tudo pela UI, sem migration, e reversível (reativar a roleta e reapontar a
origem desfaz a mesclagem).

## O que fica como está (de propósito)

- **n8n/Marquinhos**: nenhuma mudança necessária. O handoff continua batendo no
  mesmo token de sempre; o campo `regiao` que a qualificação já envia passa a
  virar a zona do lead no CRM. As rotas por empreendimento (`rotas_intake` /
  Data Table de roletas) continuam funcionando — a zona vence quando resolve.
- **Roletas de origem** (Plantão, Marquinhos, Landing): viram o fallback de
  quem não tem zona. O Plantão é a rede de segurança — manter sempre;
  Marquinhos e Landing podem ser mescladas nele quando a gestão quiser (ver a
  tabela de consolidação acima).
- **Roletas de campanha**: seguem aceitando leads pelos tokens; a delegação por
  zona acontece no motor. Se quiser aposentá-las depois, é `ativo = false` no
  painel de Campanhas (sem pressa e sem apagar nada).
- **Tokens por zona**: cada roleta de zona tem `webhook_token` próprio — dá
  para apontar uma campanha do Meta direto para uma zona no futuro
  (`/api/public/webhooks/lead/<token>`), sem passar pelo matching por
  empreendimento.

## Limitações conhecidas

- `zonas_bairros` cobre a capital; Grande SP (Guarulhos, Osasco, ABC) não tem
  zona — esses leads seguem o fluxo por origem. Se a operação quiser, dá para
  mapear cidades da Grande SP para uma zona na própria tabela.
- `profiles.zonas` (aptidão por corretor, modelo de 13/08) continua existindo
  e só atua fora das roletas de zona. Com o modelo novo, o normal é deixá-lo
  vazio e gerir tudo pela participação nas roletas.
