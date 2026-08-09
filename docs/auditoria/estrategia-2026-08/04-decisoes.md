# 04 · As 8 decisões do dono

> Cada decisão abaixo bloqueia uma parte do roadmap. Nenhuma exige resposta imediata, mas todas têm custo de espera declarado. Recomendação = a posição deste estudo, para aceitar ou vetar.

---

## D1 · Provedor de WhatsApp

**Contexto:** a Onda C (mensageria 2 vias) tem as fases 7a/7b independentes de provedor, mas a 7c (ligar de verdade) precisa da escolha. Análise completa em `docs/fase7-mensageria.md`.

| Opção                          | Prós                                           | Contras                                                             |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------- |
| Meta Cloud API direto          | oficial, sem intermediário, custo por conversa | onboarding burocrático (Business Manager, templates)                |
| BSP (360dialog/Gupshup/Twilio) | onboarding assistido, ferramentas prontas      | custo adicional por mensagem/mensalidade                            |
| Manter Z-API (não oficial)     | já existe credencial, zero atrito              | risco de banimento do número; sem templates oficiais; insustentável |

**Recomendação:** Cloud API oficial (via BSP se o onboarding travar), Z-API só como ponte consciente e temporária. **Custo de esperar:** nenhum até a 7b terminar — a decisão pode ser tomada durante as semanas 6–9.

## D2 · Escopo de `metas` (pendência P-1)

**Contexto:** hoje qualquer autenticado **lê as metas de todos** (`USING true`) e gestor de qualquer equipe edita metas de qualquer corretor; superintendente não pode escrever. Está assertado como está nos testes, aguardando decisão de produto (`2026-07-19-pendencias.md`).

**Recomendação:** leitura = própria + equipe + gestão; escrita = gestor restrito à própria equipe + admin. **Custo de esperar:** vazamento interno contínuo de metas/performance entre equipes.

## D3 · Comissão com `beneficiario_id` NULL (pendência P-2)

**Contexto:** quando a hierarquia não resolve (corretor sem gerente/superintendente), `gerar_comissoes_para_venda` cria comissões "de ninguém" que somam no total e nunca serão pagas a alguém identificável.

| Opção                               | Efeito                                                         |
| ----------------------------------- | -------------------------------------------------------------- |
| Não gerar a linha                   | total de comissões reflete só o pagável; histórico "some"      |
| Gerar marcada para resolução manual | dinheiro não desaparece; exige fila de resolução no financeiro |

**Recomendação:** gerar marcada para resolução manual (não some dinheiro), com badge na tela de fechamento. **Custo de esperar:** distorção silenciosa do total de comissões a cada venda aprovada nessa condição.

## D4 · Janela para o crédito em 3 estados (item 3.1, já decidido "sim")

**Contexto:** a mudança em si está decidida; falta **quando**. É risco alto (muda `LEAD_STATUS_ORDER`, transições, modais, kanban + migração dos leads em `analise_credito`) e o plano vigente manda fazê-la sozinha, nunca junto com 3.2.

**Recomendação:** após a Onda B estabilizar (mês 3), antes da Onda E — o score v2 quer aprender com os 3 desfechos de crédito. **Custo de esperar:** cada mês adia a visão da etapa mais decisiva do MCMV (Caixa aprova ou mata o negócio).

## D5 · `novo` + `aguardando_corretor` entram no funil (item 3.2)

**Contexto:** hoje o kanban não mostra quem acabou de chegar. Incluir muda a leitura de **todos os gráficos históricos** de funil.

**Recomendação:** sim, com corte documentado ("série recalculada a partir de \<data\>") e nota nos relatórios. **Custo de esperar:** o gestor segue sem ver a boca do funil.

## D6 · Critério de triagem dos 45,6 mil leads fora do funil

**Contexto:** a Onda A.2 precisa de uma régua de descarte em massa: quem pode descartar, com qual motivo padrão, a partir de quanto tempo sem contato.

**Recomendação:** campanha assistida — corte inicial "sem contato há 180+ dias e sem agendamento/venda" vira `perdido: sem_contato` em lote com revisão do gestor por amostragem; a faixa 30–180 dias vai para reativação (oferta ativa) antes de descartar. **Custo de esperar:** G2 parado em ~0% e temperatura/score treinando com base morta.

## D7 · Staging (2º projeto Supabase)

**Contexto:** hoje não há homologação; migrations vão à produção pela plataforma, sem ensaio com dados. O incidente P0-1 (logout global por deploy desacoplado, `2026-07-11-auditoria-completa.md`) é o precedente.

**Recomendação:** sim — o custo de um projeto adicional é ordens de grandeza menor que 1 hora de operação parada. Entra na Onda D.3 com o pipeline de migrations. **Custo de esperar:** cada migração de risco alto (D.1, por exemplo) ensaia direto em produção.

## D8 · Orçamento de IA por papel

**Contexto:** ao unificar a governança (0.6), a quota distribuída do SamiQ passa a valer para todas as superfícies de IA — e a Onda E multiplica o consumo. Falta o teto: R$/mês (ou tokens/mês) por corretor, por gestor, global.

**Recomendação:** definir teto mensal por papel + alerta em 80%, revisado trimestralmente. **Custo de esperar:** 0.6 entra com quota herdada arbitrária do SamiQ; risco de custo surpresa na Onda E.

---

## Resumo — o que cada espera custa

| #   | Decisão                     | Se não decidir, o que fica travado               |
| --- | --------------------------- | ------------------------------------------------ |
| D1  | Provedor WhatsApp           | Onda C para na fase simulada (7b)                |
| D2  | RLS de metas                | vazamento interno contínuo                       |
| D3  | Comissão NULL               | total financeiro distorcido em silêncio          |
| D4  | Janela do crédito 3 estados | gestão cega na etapa mais decisiva do MCMV       |
| D5  | Boca do funil               | gráficos seguem sem `novo`/`aguardando_corretor` |
| D6  | Triagem dos 45,6 mil        | Onda A.2/A.6 e G2 parados                        |
| D7  | Staging                     | migrações de risco alto ensaiam em produção      |
| D8  | Orçamento de IA             | quota arbitrária; custo surpresa na Onda E       |
