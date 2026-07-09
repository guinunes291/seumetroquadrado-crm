# Landing Page — Vibra Jardim Bonfiglioli

Rota pública: **`/jd-bonfiglioli`** · Código: `src/routes/jd-bonfiglioli.tsx` + `src/components/lp-jd-bonfiglioli/` + `src/lib/lp-jd-bonfiglioli.ts` (dados/config/lógica) · Leads caem em **`/api/public/webhooks/landing` → tabela `leads_landing`** (visível no CRM em "Captação (Landing)").

---

## 1. Estratégia

**Público:** primeiro imóvel, sair do aluguel, renda familiar compatível com HIS1/HIS2, quem trabalha/estuda na Zona Oeste, investidor de tíquete baixo.

**Tese da página:** ancorar no que é confirmado e forte — _menor preço da Zona Oeste, metrô Vila Sônia, 2 dorms de 32–42 m² a partir de R$ 237.900, Cheque Bônus R$ 2.000_ — e converter por três portas: **simulação por renda** (widget sem cadastro), **WhatsApp** e **formulário em 2 passos**. A dor central trabalhada é o aluguel ("vira recibo, não constrói nada").

**Postura de claims:** tudo que não está no material aparece como "a confirmar" ou em linguagem condicionada ("será confirmado no lançamento"). Nenhuma promessa de aprovação, subsídio ou enquadramento MCMV.

## 2. Arquitetura da página (ordem e função)

| #   | Seção                                         | Função de conversão                                               |
| --- | --------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Hero (navy, grid de planta baixa, orbes gold) | Promessa + preço âncora + CTA simular/WhatsApp                    |
| 2   | Benefícios (5 cards)                          | Varredura rápida dos argumentos confirmados                       |
| 3   | Por que o Jardim Bonfiglioli                  | Narrativa de rotina/mobilidade + endereços reais                  |
| 4   | Plantas (7 cards, snap-scroll no mobile)      | Núcleo comercial; CTA por planta pré-seleciona o formulário       |
| 5   | Simulador por renda (`#simular`)              | Engajamento sem fricção; qualifica o lead (campos `sim_*` no CRM) |
| 6   | Condições de compra (faixa navy)              | Cheque Bônus + financiamento + FGTS, com disclaimer visível       |
| 7   | Lazer (categorias de experiência)             | Desejo, sem inventar itens (lista oficial a confirmar)            |
| 8   | Aluguel × patrimônio (input interativo)       | Emocional/comercial; alimenta `sim_aluguel`                       |
| 9   | Para quem é (4 perfis)                        | Identificação ("é para mim")                                      |
| 10  | Confiança (Vibra + SMQ)                       | Reduz medo do processo (crédito, documentação, assinatura)        |
| 11  | FAQ (10 perguntas)                            | Mata objeções; respostas honestas para o não confirmado           |
| 12  | CTA final + formulário 2 passos (navy)        | Conversão principal, com resumo das condições antes do form       |
| —   | Barra fixa mobile + botão flutuante WhatsApp  | CTA permanente                                                    |

## 3. Headlines alternativas (para A/B)

Atual: **"Seu primeiro apê perto do Metrô Vila Sônia, pelo menor preço da Zona Oeste\*"**

1. "Chega de pagar aluguel: 2 dorms novos na Zona Oeste a partir de R$ 237.900\*"
2. "Morar bem na Zona Oeste ficou possível: lançamento a partir de R$ 237.900\*"
3. "O lançamento mais barato da Zona Oeste\* fica do lado do metrô"
4. "Sair do aluguel custa menos do que você pensa no Jardim Bonfiglioli"

## 4. CTAs alternativos

- Simulação: "Ver se minha renda aprova" (atual) · "Simular minha unidade" · "Quero minha simulação grátis"
- WhatsApp: "Ver condições pelo WhatsApp" (atual) · "Receber tabela no WhatsApp" · "Chamar um especialista"
- Formulário: "Quero receber as condições" (atual) · "Garantir condição de lançamento" · "Quero sair do aluguel"
- Plantas: "Simular esta planta" (atual) · "Quero esta planta" · "Ver condição desta planta"

## 5. Informações **a confirmar** (não afirmadas na página)

| Informação                                                            | Onde impacta                                                | O que muda ao confirmar                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Número oficial de WhatsApp da SMQ**                                 | Todos os CTAs de WhatsApp (hoje degradam para o formulário) | Preencher `LP_CONFIG.whatsapp` em `src/lib/lp-jd-bonfiglioli.ts` — ativa hero, barra fixa, botão flutuante e pós-envio |
| Renda mínima por segmento (HIS1/HIS2/R2V)                             | Seção condições, FAQ                                        | Exibir tabela de renda por planta e recalibrar simulador                                                               |
| Condições de entrada / parcelamento                                   | Seção condições, FAQ                                        | Substituir texto condicionado por números reais                                                                        |
| Enquadramento MCMV / subsídio                                         | Selo no hero, condições, FAQ, simulador                     | Adicionar selo MCMV e taxas do programa nas premissas                                                                  |
| Itens de lazer                                                        | Seção lazer                                                 | Trocar categorias genéricas pela lista oficial                                                                         |
| Varanda                                                               | Hero/plantas                                                | Adicionar bullet e destaque nas plantas que tiverem                                                                    |
| Renders/fotos e plantas ilustrativas                                  | Hero, plantas (`Planta.img`), og:image                      | Colocar arquivos em `public/lp/` e preencher `img` de cada planta; trocar `LP_OG_IMAGE`                                |
| Distâncias exatas (metrô, USP, comércio)                              | Localização (badge "a confirmar")                           | Substituir badge por minutos/km reais                                                                                  |
| Ano do lançamento ("Agosto" sem ano no material; assumido o corrente) | Hero, chips do formulário                                   | Ajustar `LP_CONFIG.lancamento`                                                                                         |
| CRECI e razão social da SMQ                                           | Rodapé (TODO no código)                                     | Incluir no rodapé (obrigação publicitária CRECI)                                                                       |

## 6. Observações legais/comerciais

- "Menor preço da Zona Oeste" sempre com asterisco de condição comercial do lançamento.
- Disclaimer de crédito obrigatório visível na seção de condições e no rodapé: _"Condições sujeitas à análise de crédito, disponibilidade e regras do programa"_ + _"Valores, condições e disponibilidade sujeitos à alteração sem aviso prévio…"_.
- Nenhuma promessa de aprovação (FAQ responde explicitamente "não é garantida").
- Simulador rotulado como estimativa (tabela Price, premissas editáveis, "não é proposta de crédito").
- Quando os renders chegarem, marcar "imagens meramente ilustrativas".
- LGPD: microcopy no formulário informa a finalidade do uso dos dados.
- Incluir CRECI no rodapé antes de veicular mídia paga.

## 7. Conversão — decisões implementadas

- Preço âncora na primeira dobra (headline + subtítulo + card de tabela).
- CTA repetido por seção (plantas → form pré-selecionado; condições → "Receber tabela"; aluguel → simulador; simulador → form com payload `sim_*`).
- Formulário em 2 passos (contato primeiro, qualificação depois) com validação amigável e honeypot anti-spam.
- Captura de UTM/gclid/fbclid com fallback em `sessionStorage`.
- Barra fixa mobile (Simular + WhatsApp/Falar) com safe-area; botão flutuante de WhatsApp no desktop.
- Resumo das condições imediatamente antes do formulário.
- Estados de carregamento (spinner), erro (toast preservando dados) e sucesso (confirmação + atalho WhatsApp + endereço do decorado).

## 8. Backlog de melhorias

1. Preencher WhatsApp oficial (`LP_CONFIG.whatsapp`) — maior impacto imediato.
2. Renders reais: hero, cards de planta (`Planta.img`) e og:image dedicada (1200×630) para compartilhamento.
3. Pixel Meta + GA4/GTM com eventos (`view_plantas`, `simulou`, `lead_enviado`) — a página já captura UTMs.
4. Selo/ajuste MCMV quando o enquadramento for confirmado (taxas do programa no simulador).
5. Mapa embed ou imagem estática da região com pontos de interesse.
6. Prova social (depoimentos de clientes SMQ) na seção de confiança.
7. A/B de headline (ver §3) e do CTA principal.
8. Contador de disponibilidade por tipologia (gatilho de escassez honesto, via tabela `projetos`/`unidades` do CRM).
9. Página de obrigado dedicada (`/jd-bonfiglioli/obrigado`) para conversão de pixel mais confiável.
10. Integração com o webhook por token do projeto (roleta de corretores + SLA) quando o empreendimento tiver cadastro em `projetos`.
