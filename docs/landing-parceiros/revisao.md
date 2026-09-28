# Revisão da landing page de parceiros — 28/09/2026

Página revisada: `docs/landing-parceiros/parceiros-smq.html`, já com a taxa de 60% a 65% e a regra
retroativa ("com 2 vendas no mês, todas passam a 65%").

**Método.** Quatro frentes independentes (conversão e copy, jurídico e compliance, técnico e
rastreamento, mercado) e, para cada uma, um verificador adversarial encarregado de derrubar os
achados. Foram 55 achados e mais 11 que os verificadores acrescentaram. Nenhum foi refutado por
inteiro, mas 41 foram ajustados (severidade ou recomendação corrigida). Medições com
Playwright/Chromium e axe-core. As afirmações que mudam prioridade foram conferidas de novo no
repositório e no n8n (seção 0).

> O que é jurídico ou tributário aqui é diagnóstico com fonte, não parecer. Antes de publicar
> textos de contrato ou de imposto, passe por advogado e contador.

## 0. Fatos conferidos diretamente

| Fato                                                                                                                                              | Onde                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| O n8n chama a linha **5690** de "Z-API legada (linha aposentada após o soft-ban)". A página manda todo mundo para `5511930785690`.                | n8n, workflow `UYqLtDm0tdPC28QI` (nota e nó "Validar e Normalizar")                     |
| O `lp-intake` descarta cadastro sem `consent_lgpd`, responde `{ok:true}` mesmo assim e manda os válidos para o **Marquinhos (bot de comprador)**. | mesmo workflow                                                                          |
| O endpoint de landing do CRM exige Turnstile, Origin na allowlist e `Idempotency-Key`, e distribui o contato na roleta de compradores.            | `src/routes/api/public/webhooks/landing.ts`                                             |
| "Parceiro **não usa o CRM** [DECIDIDO]", e não existe papel de parceiro (`app_role` = admin, gestor, corretor, superintendente, sdr).             | `docs/auditoria/ux-ia-2026-08/02-objetivos.md:19`, `src/integrations/supabase/types.ts` |
| O pagamento de comissões é conciliado com desconto de NF de 6% (`FATOR_NF = 0.94`).                                                               | `src/lib/conciliacao-types.ts`                                                          |
| CNPJ do rodapé: SEU METRO QUADRADO LTDA (66.930.565/0001-86). Existe outra conta histórica em nome da EI 55.579.001/0001-24.                      | `src/lib/conciliacao-types.ts`                                                          |

## 1. Decisões que só o dono pode tomar

Cada uma trava uma parte da revisão. Sem elas, qualquer texto que eu escreva vira uma promessa nova
sem lastro.

| #   | Decisão                                      | Por que trava                                                                                                                                 | Opções                                                                                        |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D1  | Qual WhatsApp atende parceiros?              | Os 7 botões e o formulário vão para a linha que o n8n chama de aposentada. Se ela cair no roteador, o corretor recebe o roteiro de comprador. | Linha humana de parcerias (ideal); 5690 com rota "parcerias" no roteador; outra linha         |
| D2  | Quem paga o parceiro?                        | Define se "sigilo" e "sem nota fiscal" são verdade. Se a pagadoria da construtora divide o pagamento, ela recebe o CPF do parceiro.           | (A) SMQ recebe 100% e paga com RPA; (B) pagadoria da construtora divide                       |
| D3  | Sobre qual base incidem 60% e 65%?           | O CRM desconta 6% de NF das comissões. Se isso vale para o parceiro, 60% vira 56,4% (R$ 6.316,80 em vez de R$ 6.720).                         | Comissão bruta que a construtora paga; comissão líquida dos 6%                                |
| D4  | Custo da co-venda                            | "0,3% da sua comissão" dá **R$ 20,16**, o que ninguém aceita para fazer visita e fechamento.                                                  | 30% da parte do parceiro (R$ 2.016); 0,3% do imóvel (R$ 840); outro valor                     |
| D5  | Como pagar o complemento da regra retroativa | A 1ª venda pode ser paga antes da 2ª existir; a 2ª pode distratar depois de a 1ª ter sido paga a 65%.                                         | Recomendado: cada venda a 60% ao receber; complemento de 5% das anteriores junto com a 2ª     |
| D6  | Número do CRECI-J, e em qual CNPJ            | Obrigatório em publicidade. CRECI-J, credenciamento nas construtoras, contrato com o parceiro e RPA precisam estar na mesma empresa.          | Confirmar que tudo está na LTDA 66.930.565/0001-86                                            |
| D7  | Prova: números reais da SMQ                  | A página não prova que a SMQ existe e paga. O CRM não registra vendas nem VGV, então esses números não saem de lá.                            | Anos de mercado, vendas no ano, parceiros ativos, foto do fundador, 3 depoimentos autorizados |
| D8  | A página deve aparecer no Google?            | Uma página indexada que diz "construtora não fica sabendo" pode ser encontrada pelas construtoras que credenciam a SMQ.                       | `noindex` (divulgação só por anúncio e WhatsApp) ou indexar com a copy corrigida              |
| D9  | Regime tributário da LTDA                    | Muda quanto sobra para a SMQ a 65% (seção 3.3).                                                                                               | Contador                                                                                      |

## 2. Antes de divulgar (P0)

### P0-1. WhatsApp: testar a linha de ponta a ponta (D1)

- **Evidência:** `CONFIG.whatsapp: "5511930785690"`; a nota do n8n diz "Z-API legada 5690 (linha
  aposentada após o soft-ban)". O roteador que recebe as mensagens da Z-API manda para o funil.
- **Por quê:** ou a mensagem morre numa linha que ninguém olha, ou o corretor que escreve "Quero ser
  corretor parceiro" recebe perguntas de renda e FGTS, como se fosse comprador. Para um público
  profissional, as duas coisas matam a confiança no primeiro contato.
- **Como:** mandar as 7 mensagens (topo, hero, mapa, final, flutuante, barra, formulário) e ver quem
  responde. Se for linha com bot, criar no roteador uma rota "parcerias", nos moldes da rota do RH,
  que reconhece o texto pré-preenchido e não aciona o Marquinhos.

### P0-2. Captura do cadastro: hoje nada é gravado

- **Evidência:** `webhookUrl: ""`. Medido: 0 requisições de rede no envio. Nome, telefone e e-mail
  existem só dentro do link do WhatsApp. Depois do envio, a tela mostra "**Recebido!** Estamos abrindo
  o WhatsApp para você confirmar", mas nada foi recebido. O link de reserva ("toque aqui") abre uma
  mensagem genérica, sem os dados.
- **Por quê:** quem não toca em "Enviar" (WhatsApp Web deslogado, navegador do Instagram,
  arrependimento) some sem rastro, e ainda acha que já está cadastrado. Exemplo: de 100 formulários,
  se 30 não enviam, são 30 corretores perdidos sem que ninguém saiba.
- **Como:** um workflow n8n próprio, "SMQ - LP Parceiros", **fora do funil de comprador**: webhook
  POST, gravação numa tabela de candidatos a parceiro e aviso ao responsável. Na página, enviar com
  `navigator.sendBeacon` (`text/plain`, sem preflight de CORS) antes de abrir o WhatsApp. Até isso
  existir, trocar o "Recebido!" por "Falta um passo: toque em Enviar no WhatsApp".
- **Não usar:** o `lp-intake` (descarta e manda para o bot de comprador) nem o
  `/api/public/webhooks/landing` do CRM (roleta de compradores).

### P0-3. CRECI da SMQ na página e CRECI do parceiro no cadastro (D6)

- **Regra:** a Lei 6.530/78, art. 20, IV proíbe anúncio sem o número de inscrição. O Decreto
  81.871/78, art. 4º exige o número "em toda propaganda". A Res. COFECI 1.065/2007, art. 5º pede
  "CRECI" + número + "J" junto do nome da pessoa jurídica. Hoje a página só tem nome fantasia e CNPJ.
- **Regra:** o art. 20, II proíbe "facilitar o exercício da profissão aos não inscritos". O Código
  de Ética (Res. COFECI 326/92, art. 6º, IX) trata isso como transgressão grave. A página não pede
  CRECI e ainda responde "Preciso deixar meu emprego? Não… renda extra", o que atrai quem não é
  corretor.
- **Como:** CRECI-J e razão social no topo e no rodapé; campo "CRECI (número e UF)" obrigatório no
  formulário; FAQ "Quem pode ser parceiro?".

### P0-4. Tirar a promessa de acesso ao CRM

- **Evidência:** a página promete o CRM em 7 lugares ("A gente libera seu acesso ao CRM", "CRM
  próprio para acompanhar cada cliente", o link "Já sou parceiro: acessar CRM" no topo). A decisão
  registrada no repositório é o contrário.
- **Por quê:** a primeira mensagem depois do cadastro vira "cadê meu acesso?". Dar o papel
  "corretor" para resolver expõe leads da SMQ e o `percentual_comissao` de cada empreendimento, que a
  vitrine mostra.
- **Como:** "A gente libera o mapa e te manda book e tabela pelo WhatsApp"; acompanhamento dos
  clientes pelo time SMQ, pelo WhatsApp.

### P0-5. Sigilo e origem do cliente: o ponto de maior risco (D2)

- **Evidência:** "Construtora não fica sabendo que é você" (card do hero, desktop) e, no passo 2,
  "Lead seu, de indicação ou **que não encaixou no produto da sua construtora**".
- **Por quê:** (1) é uma garantia que a SMQ não controla: o cliente conta quem o atendeu, o corretor
  aparece no plantão e, se a pagadoria for da construtora, ela recebe o CPF dele. (2) O Código de
  Ética, art. 6º, VII veda "desviar, por qualquer modo, cliente de outro corretor", e vale para a
  pessoa jurídica. Um lead que a construtora entregou ao corretor dela é dela. (3) Para o parceiro com
  carteira assinada na construtora, a CLT (art. 482, c) prevê justa causa por concorrência. (4) A
  página é pública e está nas mãos das mesmas construtoras que credenciam a SMQ.
- **Como:** passo 2: "Cliente seu: da sua rede, das suas redes sociais ou de indicação. Lead que a
  construtora ou a imobiliária onde você atua te entregou é dela, e esse não entra." Card do hero:
  "Na construtora, a venda fica no nome da SMQ". FAQ "E se a construtora onde eu trabalho descobrir?",
  com os limites reais. Decidir D2 antes de escrever sobre sigilo.

### P0-6. Co-venda com valor impossível (D4)

- **Evidência:** `coVendaTaxa: "0,3% da sua comissão", // CONFIRMAR`, publicado em 2 lugares.
- **Conta:** 0,3% de R$ 6.720 = R$ 20,16. As leituras prováveis são 30% da parte (R$ 2.016, na linha
  do mercado: no Loft Market quem vende fica com 70%) ou 0,3% do imóvel (R$ 840).
- **Como:** até decidir, esconder a co-venda da página. Depois, publicar em R$ no exemplo e trocar "A
  comissão continua sua" por "O restante continua seu".

## 3. Dinheiro: o que o parceiro vai perguntar

### 3.1 Bruto ou líquido

Com pagamento por RPA, a SMQ retém 11% de INSS (até o teto de 2026, R$ 8.475,55) e o IRRF (com a
redução mensal da Lei 15.270/2025). Estimativas do verificador:

| Bruto                                          | Líquido estimado | %     |
| ---------------------------------------------- | ---------------- | ----- |
| R$ 6.720 (1 venda a 60%)                       | R$ 5.328,70      | 79,3% |
| R$ 7.280 (1 venda a 65%)                       | R$ 5.615,47      | 77,1% |
| R$ 14.560 (2 vendas a 65%, pagas no mesmo mês) | R$ 10.788,80     | 74,1% |

"Vão para o seu bolso" e "Sua renda extra por mês" mostram o bruto. Trocar para "brutos, antes do
INSS e do IR retidos na fonte". Em São Paulo capital, o autônomo com CCM é isento de ISS (Lei
14.864/2008); sem CCM, a SMQ tem de reter. Pedir o CCM no cadastro. "Sem nota fiscal" pode continuar
verdadeiro, mas "com RPA e demonstrativo" soa mais profissional ao corretor experiente.

### 3.2 Base do percentual (D3)

`comissaoTotalPct: 4` "não aparece na página". A mesma regra de 60% dá R$ 5.880 se a construtora
paga 3,5% e R$ 8.400 se paga 5%. Escrever a base embaixo da calculadora: "Simulação com imóvel de R$
280.000 e comissão de 4% paga pela construtora à SMQ. Seu percentual incide sobre [a comissão bruta /
a comissão líquida dos 6% de NF]." Calcular os 4% a partir de `projetos.percentual_comissao` dos
projetos vendidos em 2026, e não de memória.

### 3.3 Quanto sobra para a SMQ a 65% (D9)

Venda de R$ 280 mil: comissão de R$ 11.200 e parceiro com R$ 7.280. Estimativas, a conferir com o
contador:

| Regime da SMQ                                                            | Sobra por venda |
| ------------------------------------------------------------------------ | --------------- |
| Simples (cerca de 6%, sem cota patronal à parte)                         | ~R$ 3.248       |
| Lucro Presumido, sem contrato de associação registrado                   | ~R$ 635         |
| Lucro Presumido, com associação registrada (ISS só sobre a parte da SMQ) | ~R$ 999         |

No Lucro Presumido, a SMQ paga cerca de 16,33% sobre os R$ 11.200 inteiros e mais 20% de INSS
patronal sobre o RPA. O `FATOR_NF = 0.94` do CRM sugere algo perto de 6%, mas o regime precisa ser
confirmado antes de manter os 65%.

### 3.4 Contrato: associação registrada

A Lei 6.530, art. 6º, §§2º a 4º (Lei 13.097/2015) prevê o corretor associado: contrato registrado
**no sindicato** (SCIESP, em SP), que "ajusta critérios para a partilha". Parceria entre corretores
(CC, art. 728) também é válida. O ganho de formalizar é segurança, e possivelmente ISS menor para a
SMQ (Parecer SF 01/2015). O Anexo I do contrato deve trazer: base de cálculo, 60% e 65%, regra
mensal retroativa pela data de assinatura, complemento (D5), distrato e estorno.

### 3.5 Regra retroativa: pagamento e distrato (D5)

Proposta que evita cobrar o parceiro de volta: **cada venda é paga a 60% quando a SMQ recebe a
comissão dela; o complemento de 5% das anteriores vai junto com o pagamento da venda que completou
o mês.** Se a 2ª cair antes de a SMQ receber, a 1ª fica em 60% e ninguém devolve nada.

Exemplo: venda A em 03/10 e venda B em 25/10. A é paga a R$ 6.720. Quando a SMQ recebe a comissão de
B, o parceiro recebe R$ 7.280 + R$ 560 = R$ 7.840.

Falta também dizer o que acontece se a construtora estornar uma comissão já paga. Sugestão de FAQ:
"Você recebe sobre o que a SMQ efetivamente recebeu. Se a construtora estornar a comissão, a sua
parte é estornada na mesma proporção, descontada do próximo repasse."

Consequência conhecida da regra por mês civil: se a 2ª venda escorregar de 30/09 para 01/10 pela
agenda da Caixa, o parceiro deixa de ganhar R$ 1.120 (2 × R$ 7.280 contra 2 × R$ 6.720).

### 3.6 Prazo

"Somente 5 dias úteis após o recebimento pela imobiliária" conta a partir de algo que o parceiro não
vê, e o "somente" em negrito soa como restrição. Trocar por uma linha do tempo: "Sua parte cai em até
5 dias úteis depois que a construtora paga a SMQ. A construtora paga depois da assinatura do cliente
na Caixa; nas últimas [N] vendas, isso levou em média [X] dias" (só com dado real).

## 4. Conversão

1. **Hero no celular.** São 12 linhas (3 do título e 9 do subtítulo) antes do 1º botão, e o
   primeiro R$ aparece a 61% da página, porque o card com dinheiro só existe no desktop. Encurtar o
   subtítulo para cerca de 20 palavras e pôr uma faixa "Numa venda de R$ 280 mil, você recebe R$
   6.720" visível só no celular.
2. **Liderar pelo mecanismo, não pelo percentual.** Com 60% a 65%, a SMQ não é a maior do mercado
   (seção 6), mas ganha de associado (30% a 40%) e de parceria fifty (50%). Título sugerido: "O
   cliente que não coube no seu produto ainda vira comissão." Subtítulo: "60% da comissão: R$ 6.720
   numa venda de R$ 280 mil. Com 2 vendas no mês, 65% em todas. Sem mensalidade." Nunca usar "até
   65%".
3. **Prova (D7).** Criar a seção "Quem é a SMQ" entre o hero e "Como funciona", usando o CSS que já
   existe sem uso (`.stats`, `.stat-grid`, `.src`), com 4 números conferíveis, CRECI-J, rosto do
   fundador e depoimentos reais no formato "resultado em R$ + prazo".
4. **"Todo MCMV de SP" aparece 8 vezes**, mas o mapa mostra 76 empreendimentos e o catálogo não tem
   MRV. Só em 2025, a capital lançou 85,4 mil unidades MCMV (Secovi-SP). Trocar por "76
   empreendimentos MCMV", inclusive no `<meta>` e no `og:`, que precisam ser editados à mão.
5. **Tabela comparativa.** "Tabela da casa" contra "60% a 65%" não compara nada, e quem vende direto
   na construtora (MRV, 100% de 1,8% a 3%) ganha dessa comparação. Comparar o incremental: "Cliente
   que não cabe no produto da casa | R$ 0 | R$ 6.720 a R$ 7.280 numa venda de R$ 280 mil". Apagar a
   linha repetida de "Estoque".
6. **O mapa é o diferencial e está escondido.** O print mostra "Digite a renda do cliente pra ver
   quem fecha", que resolve exatamente a dor da página. No celular o print sai em escala de 0,24,
   ilegível, e os campos desenhados não funcionam. Vender a ferramenta em texto e usar um recorte
   legível, desde que o parceiro vá ter acesso a ela.
7. **De quem é o cliente?** Faltam regra e prazo de vínculo. Exemplo de mercado: a Companha usa 90
   dias renováveis. FAQ: "O cliente que você registrou com a SMQ fica vinculado a você por [90] dias,
   inclusive em co-venda."
8. **Perguntas de dinheiro no FAQ:** "Quem me garante que vou receber?", "Quanto tempo até a 1ª
   comissão?", "O valor é bruto ou líquido?", "E se a venda cair depois que eu recebi?".
9. **"100 vagas em 2026"**, publicado em 28/09 e sem contador, parece tática, e vai anunciar vagas de
   um ano encerrado em janeiro. Tirar, ou trocar por algo verdadeiro. O vermelho também comunica
   erro.
10. **Promessas operacionais.** A meta diz "mapa em tempo real" e o corpo diz "atualizado todo mês".
    "Ainda hoje", "resposta no mesmo dia" e "todos os dias" dependem de uma pessoa só. Prometer o
    horário real, por exemplo "até 1 dia útil".
11. **Mensagens de WhatsApp.** A do hero e a do final são idênticas e nenhuma diz de onde veio. Pôr
    um código curto de origem (ex.: `ref HERO-campanha`) para medir o que converte.
12. **Ordem das seções:** Hero, Quem é a SMQ, Calculadora (sobe de ~4.600px para ~1.700px no
    celular), Como funciona, Comparativo (absorvendo os cards de Vantagens, que repetem), Mapa, FAQ,
    Formulário. "Pré-análise" aparece 9 vezes e "nota fiscal" 6.
13. **"Sem mensalidade"** é o contra-argumento ao "até 88%" da Imóvelp, que cobra plano mensal, e hoje
    está no texto menos legível do hero. Levar para os chips: "R$ 0 — sem mensalidade nem adesão".

## 5. Técnico, rastreamento e acessibilidade

| Item                            | Evidência medida                                                                                                                                 | Correção                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Máscara corta o +55             | "+55 11 98765-4321" (autopreenchimento ou colado do WhatsApp) vira "(55) 11987-6543" e passa na validação                                        | Normalizar antes da máscara (tirar o 55 com 12-13 dígitos), `autocomplete="tel-national"`, validar celular com o 9 |
| Botões mortos na carga          | Os `.js-wa` nascem com `href="#"` e só viram link depois dos 118 KB de base64: 4,7 s no 3G                                                       | `href` real no HTML; imagem externa com `loading="lazy"` (com data URI, o lazy não economiza nenhum byte)          |
| Erro no CONFIG derruba a página | Uma vírgula faltando: 7 de 7 WhatsApps mortos, rodapé vazio e formulário enviado por GET com os dados na URL                                     | CONFIG num `<script>` separado; `method="post"` no formulário                                                      |
| Botão flutuante sobre CTAs      | No celular, cobre "comissões" no CTA do hero e o CTA da calculadora; fica sobre algo clicável em cerca de 25% das posições de rolagem            | Esconder abaixo de 760px; esconder a barra fixa quando o formulário estiver visível                                |
| UTM crua na mensagem            | Com fbclid, a mensagem vai de 120 para 371 caracteres de código estranho                                                                         | Guardar a UTM (localStorage, 30 dias), enviar no webhook e pôr só "Ref: XXXX" na mensagem                          |
| Sem Pixel/GA                    | Nenhuma campanha mede nada. Quando instalar: Lead antes do envio real, sem `event_id` para deduplicar com a CAPI, `form_submit` colide com o GA4 | `generate_lead` + `eventID` compartilhado; banner de consentimento (guia de cookies da ANPD)                       |
| Prévia no WhatsApp              | Sem `og:image`, `og:url` e favicon: a prévia é só texto                                                                                          | Imagem 1200×630 hospedada, URL absoluta; decidir D8 antes de canonical/JSON-LD                                     |
| Contraste                       | Eyebrows dourados 2,44 a 2,64:1; texto branco nos botões verdes 3,09:1 (mínimo 4,5:1)                                                            | `--gold-text #8A6420` (5,35:1), verde `#15803D` (5,02:1)                                                           |
| Formulário acessível            | Erros não são anunciados (sem `aria-invalid`/`aria-describedby`); o anel de foco tem 1,14:1                                                      | Ligar erros aos campos, resumo em `role=status`, `:focus-visible` com contorno de 3px                              |
| Fontes                          | O CSS do Google Fonts bloqueia a renderização (FCP de 684 para 480 ms no 4G lento ao carregar assíncrono); CLS 0,029 (ok)                        | `media="print" onload` ou hospedar os 2 woff2                                                                      |
| Tabela                          | `role=table` sem células (axe: critical); sem `<main>`                                                                                           | Usar `<table>` ou completar os roles                                                                               |

## 6. Mercado: onde 60% a 65% se posiciona

Imóvel de R$ 280 mil e comissão de 4%, quando aplicável. Fontes coletadas pela busca em 28/09/2026;
confiança média quando há uma fonte só.

| Oferta                                             | O que o corretor recebe                                                                           | Fonte                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| Associado de imobiliária                           | Cerca de 30% dos 4% em empreendimentos (R$ 3.360); 30% a 50% em geral                             | credipronto.com.br, cvcrm.com.br |
| Parceria entre corretores (fifty)                  | 50% (R$ 5.600)                                                                                    | homer.com.br                     |
| **SMQ**                                            | **60% (R$ 6.720); 65% com 2 vendas no mês (R$ 7.280), sem mensalidade**                           | esta página                      |
| Loft                                               | 50% a 80%, com bônus para os 100 melhores                                                         | exame.com                        |
| Imóvelp                                            | Até 88% da comissão recebida em lançamentos, paga em até 24h, com plano mensal a partir de R$ 69  | imovelp.com.br                   |
| MRV Agente de Sonhos (canal direto)                | 100% da comissão da MRV, "a partir de 1,8%" do valor; 3% fixos num lançamento regional (R$ 8.400) | mrv.com.br                       |
| Homer                                              | "Comissão Garantida", com antecipação                                                             | homer.com.br                     |
| Companha                                           | Indicação válida por 90 dias, renovável                                                           | companha.com.br                  |
| Cury, Tenda, Direcional, Vibra, Plano&Plano, Vivaz | Recrutam, mas sem percentual público                                                              | sites das construtoras           |

**Leitura.** A SMQ ganha claramente de associado e de fifty, mas perde no número absoluto para
Imóvelp (com mensalidade) e para o canal direto de construtora (no produto dela). O que ninguém
oferece junto é: várias construtoras MCMV numa conta só (o mapa por renda), pré-análise e pasta
conferidas pela SMQ, co-venda e nenhuma mensalidade. É isso que deve abrir a página. Os melhores
benchmarks de confiança são pagamento previsível (Imóvelp em 24h, antecipação da Homer) e regra
escrita de proteção do cliente (Companha).

## 7. Ordem sugerida

1. **Hoje, sem decisão de negócio:** normalização do telefone, `href` real nos botões, CONFIG
   separado, `method="post"`, "Recebido!" honesto, botão flutuante, UTM limpa, "tempo real" corrigido,
   "todo MCMV" trocado por 76, contraste e acessibilidade do formulário, fontes assíncronas.
2. **Depois de D1, D2, D4 e D6 (P0):** linha de WhatsApp testada, workflow "SMQ - LP Parceiros", CRECI
   nos dois lados, promessa de CRM removida, sigilo e origem do cliente reescritos, co-venda com valor.
3. **Depois de D3, D5 e D9:** base, bruto/líquido, FAQ de dinheiro, cláusulas do Anexo I.
4. **Depois de D7:** seção "Quem é a SMQ", novo hero, nova ordem das seções e tabela incremental.
5. **Medir:** Pixel/GA com consentimento, códigos de origem nas mensagens e, só então, testar
   ângulos de título.
