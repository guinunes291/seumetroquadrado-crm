# Portal do Empreendimento — a ficha vira página de produto (2026-09-13)

**Pedido do dono:** "quero criar algo assim para minha imobiliária", apontando o
Portal Econ Mais (portal de corretores da Econ Construtora). Respostas às
perguntas de escopo: público = **corretores da própria SMQ**, dentro do CRM;
arquitetura = **este repositório e este Supabase**; MVP = **catálogo de
empreendimentos**; sem fluxo novo de cadastro (o portal é um módulo do CRM já
existente, com os papéis de sempre).

Formato: o que um portal desses tem → o que já existia → decisões → o que mudou
→ como aplicar em produção → pendências conscientes.

---

## 1. O que um portal de construtora entrega ao corretor

A receita é estável em todos os portais do gênero (Econ, Cury, Tenda, MRV):

1. **Catálogo** de empreendimentos com foto, preço "a partir de", região, entrega.
2. **Página do empreendimento** com galeria, plantas, ficha técnica, lazer e
   diferenciais, localização com mapa e **todos os materiais de venda** num lugar
   só (book, tabela, plantas, vídeo, tour, memorial, artes para redes).
3. **Espelho** de disponibilidade por tipologia.
4. Gestos de venda: enviar ao cliente, favoritar, copiar link/mensagem.
5. Camadas seguintes: cadastro/chancela de cliente, reserva, proposta, comissões,
   ranking, treinamentos.

A rede desta sessão não alcança `lovable.app` nem os domínios da Econ, então o
portal de referência não foi renderizado; a leitura acima vem do gênero e das
páginas públicas do programa de corretores da Econ.

## 2. O que já existia no CRM (e por que não duplicar)

| Peça do portal         | Já existia em                                                  | Estado                                             |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| Catálogo com filtros   | `/projetos-foco` (prateleira, `docs/revisao-projetos-foco.md`) | Maduro: cards, renda, campanhas, favoritos, sacola |
| Book e tabela          | `projetos.book_url` / `tabela_precos_url` + Materiais em massa | OK, mas UM de cada e nada além                     |
| Galeria                | `projetos.galeria_urls` (até 12), editada no formulário        | Gravada, **nunca exibida** na ficha                |
| Ficha técnica, munição | `ProjetoFichaTecnica`, `ProjetoComercial`                      | OK                                                 |
| Espelho de unidades    | aba Unidades (grade/tabela), `unidades`                        | Gestão; sem leitura por tipologia                  |
| Localização            | `lat/lng`, `logradouro/numero/endereco`                        | Só texto na ficha; mapa só na Vitrine (mercado)    |
| Enviar ao cliente      | `EnviarVitrineDialog`, `useWhatsAppLead`                       | Só na prateleira e na Vitrine                      |

Conclusão: o catálogo (item 1) já é a prateleira. O buraco era a **página do
empreendimento** (item 2), que até aqui era uma tela de gestão (StatTiles de VGV,
CRUD de unidades) e não uma página de produto. Criar um módulo "Portal" paralelo
repetiria o card, o cache e o catálogo — exatamente o que a revisão de 02/09
mandou parar de fazer ("cinco cards para o mesmo produto"). A decisão foi
**evoluir `/projetos/$projetoId`**, que a prateleira já abre em cada card.

## 3. Decisões

| #   | Tema                   | Decisão                                                                                                                                           |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Onde vive o portal     | Dentro de Documentação & Projetos, sem módulo novo. A "porta" é a prateleira; a página de produto é a ficha. Nada muda no `sistemas.ts`.          |
| 2   | Materiais além do book | Tabela nova `projeto_materiais` (N por projeto, tipados). `book_url`/`tabela_precos_url` **continuam** — a ficha funde as duas fontes.            |
| 3   | Tipos de material      | Fechados no CHECK e em `lib/projeto-materiais`: book, tabela, planta, video, tour, memorial, apresentacao, arte, outro.                           |
| 4   | Quem gere materiais    | admin \| gestor (mesmo recorte do Materiais em massa e da RLS). Unidades e campanha seguem só admin, como antes.                                  |
| 5   | Ordem da página        | Hero → galeria → [materiais (coluna) · ficha técnica · munição · disponibilidade · localização] → espelho/gestão. No celular, materiais primeiro. |
| 6   | Favoritos              | O coração da ficha grava na **mesma** preferência da prateleira (`prateleira:favoritos`).                                                         |
| 7   | Enviar ao cliente      | Com `?leadId` e telefone, dispara direto no WhatsApp do lead e registra interação; sem lead, abre o seletor da Vitrine. Gera `enviar_lead`.       |
| 8   | Métricas               | Abrir planta/vídeo/tour grava `projeto_eventos.tipo = material_abrir`; book e tabela mantêm `book_abrir`/`tabela_abrir` (decisão 28 intacta).     |
| 9   | Mapa                   | Leaflet/OSM com um pino, `import()` no efeito (SSR), roda do mouse desligada. Sem coordenada: só endereço e links do Google Maps.                 |
| 10  | Degradação             | Sem a migration aplicada a ficha abre igual (book/tabela das colunas antigas) e esconde a gestão de materiais com aviso.                          |
| 11  | Numeração da migration | `20260913190000`, maior que a última da base (`…180000`) — regra do harness (README) para o runner do Supabase não recusar o lote.                |

## 4. O que mudou

**Banco** — `supabase/migrations/20260913190000_portal_projeto_materiais.sql`

- `projeto_materiais` (id, projeto_id → projetos ON DELETE CASCADE, tipo CHECK,
  titulo 1–120, url `^https?://`, descricao ≤300, ordem, ativo, criado_por,
  carimbos + trigger `tg_set_updated_at`). RLS: autenticado lê ativos; admin/gestor
  vê inativos e escreve. GRANTs para `authenticated` e `service_role`.
- `projeto_eventos.tipo`: CHECK recriado com `material_abrir` (procura a
  constraint pela definição, não só pelo nome; no-op sem a tabela).
- Idempotente: aplicada duas vezes no harness local sem erro.

**Regras puras** (testadas sem React)

- `src/lib/projeto-materiais.ts`: tipos e rótulos, `materiaisDoProjeto` (fusão +
  dedupe por URL normalizada), `agruparMateriais`, `inferirTipoPelaUrl` (palpite
  para o formulário), `hostLegivel`, `validarMaterial` (espelha o CHECK),
  `eventoDeAbertura`, `textoMateriaisParaWhatsApp`, `moverMaterial`, `proximaOrdem`.
- `src/lib/projeto-localizacao.ts`: `enderecoLegivel`, `temCoordenada`,
  `urlGoogleMaps`, `urlComoChegar`, `textoLocalizacao`.
- `src/lib/unidades.ts`: `resumoPorTipologia` (área e menor preço só das
  disponíveis) e `descreverTipologia`.

**Tela** (`src/features/projetos/`)

- `projeto-galeria.tsx` — faixa de miniaturas (capa + galeria, sem duplicar) e
  lightbox com setas, teclado e "Original"; imagem quebrada some.
- `projeto-materiais-section.tsx` — grupos por tipo, Abrir (registra evento),
  Copiar link, "Copiar todos os links para o WhatsApp"; vazio com próximo passo.
- `projeto-materiais-dialog.tsx` — gestão: adicionar/editar (tipo pré-selecionado
  pelo link), subir/descer, ocultar, remover.
- `use-projeto-materiais.ts` — leitura com `rpcWithFallback` (`disponivel:false`
  sem a tabela) e mutations.
- `projeto-localizacao.tsx` — endereço, Google Maps, Como chegar, Copiar, mapa.
- `projeto-disponibilidade.tsx` — tabela por tipologia; fallback no texto
  `disponibilidade_resumo`.
- `src/routes/_authenticated/projetos.$projetoId.tsx` — reorganizada na ordem da
  decisão 5; hero ganha Prateleira · ♥ · Enviar ao cliente; StatTiles e abas de
  gestão descem para "Espelho de vendas". Nenhuma função de gestão foi removida.
- `src/integrations/supabase/pendentes.ts` — fronteira tipada de
  `projeto_materiais` e do tipo `material_abrir` (apagar ao regenerar `types.ts`).

**Testes**

- Unidade: `tests/projeto-materiais.test.ts`, `tests/projeto-localizacao.test.ts`,
  `tests/unidades.test.ts` (novos casos), `tests/projeto-materiais-section.test.tsx`
  (Testing Library), `tests/portal-materiais-migration.test.ts` (contrato do SQL).
- Banco real: `tests/db/projeto-materiais.test.ts` — RLS por papel, CHECKs,
  trigger, `material_abrir`, cascade. Passou no harness local (Postgres 16 do
  sistema, sem Docker) com as 365 migrations anteriores aplicadas.

## 5. Como aplicar em produção

1. Aplicar `20260913190000_portal_projeto_materiais.sql` no Supabase do CRM
   (idempotente; sem dependência de dado).
2. Regenerar `types.ts`; remover de `pendentes.ts` o bloco de `projeto_materiais`
   e trocar `supabasePendente` por `supabase` em `use-projeto-materiais.ts`.
3. Preencher, para as parceiras primeiro (Vibra, Mundo Apto, Cury): galeria
   (formulário do projeto), plantas e vídeo (botão **Gerir** na ficha) e
   coordenadas (já usadas pela Vitrine) para o mapa aparecer.
4. Medir no `projeto_eventos`: `material_abrir` por projeto e por corretor, ao
   lado de `book_abrir`/`tabela_abrir`.

## 6. Pendências conscientes (próximas camadas do portal)

- **Chancela de cliente** (registro com proteção por prazo) e **reserva de
  unidade** pela ficha — são a camada 2 do gênero; o CRM já tem `propostas`,
  `unidades.status` e detector de duplicatas para sustentar.
- **Tabela de preços estruturada** (`tabelas_preco` do roadmap): hoje é PDF; o
  espelho por tipologia depende de `unidades` cadastradas.
- **Upload direto** de material para o Storage (hoje é link de Drive/YouTube).
- **Card da prateleira** mostrando contagem de plantas/vídeos (o dado já existe;
  falta o selo).
- **Portal externo** para imobiliárias parceiras: exigiria papel novo, RLS de
  isolamento e cadastro com aprovação — fora deste MVP por decisão do dono.
