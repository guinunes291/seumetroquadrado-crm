# Link de Proposta

## 1. O que já existe e vai ser reaproveitado

| Item | Situação hoje | Uso no módulo |
|---|---|---|
| `vitrine_links`, `vitrine_link_projetos`, `vitrine_link_eventos` (0 linhas) | Motor completo e em uso no código: token de 32 bytes guardado só como hash SHA-256, expiração, revogação, limite de requisições, eventos idempotentes. Telas: `/vitrine` (envio), `/vitrine-publica` (página pública, token no `#`), rotas `/api/vitrine-links` e `/api/public/vitrine`, RPCs `criar_vitrine_link`, `obter_vitrine_publica`, `consumir_vitrine_requisicao`, `registrar_vitrine_evento`. Filtro de URLs seguras (`safePublicHttpUrl`). | Copiar o padrão (hash, limite, eventos, RPCs estreitas via servidor). Não reaproveitar as tabelas em si: a vitrine compara 2 ou 3 projetos, a proposta é um documento de 1 projeto com versões, sessões e aceite. A vitrine continua como está. |
| `propostas` (0 linhas) | Esqueleto: lead, corretor, projeto, unidade, valor, status, `link_token` em texto puro, validade, `condicoes` jsonb. Nenhuma tela ou rota usa. | Vira a tabela principal (ampliada). `link_token` puro fica sem uso e marcado como obsoleto; passamos a guardar só o hash. |
| `propostas_visitantes` (0 linhas) | Cadastro de visitante de plantão (nome, telefone, e-mail). Nada usa. Não tem relação com tracking. | Não usar. Fica como está. |
| `unidades` (0 linhas) | Sem dados. | Opcional no formulário; se vazio, o corretor digita a unidade (texto livre no snapshot). |
| `agendamento_links` (5 linhas) + RPCs `agendar_pelo_link`, `_agendamento_link_livres` | Em uso em `/agendar/$slug`: o cliente escolhe data e hora livres do corretor e cria agendamento. | O CTA da Apresentação usa os horários livres do link de agendamento do corretor e cria o pedido de visita com status "agendado" para o corretor confirmar (mesma regra). Se o corretor não tiver link de agendamento, o bloco mostra "Falar com o corretor" no WhatsApp. |
| Upload de imagens | Bucket `projetos-plantas` já existe. | Novo bucket privado `propostas-midia`; imagens servidas por URL assinada só dentro da página pública. |

## 2. Aviso ao corretor no WhatsApp (canal existente)

Hoje o aviso ao corretor sai pela instância Z-API (`ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`), usada pela função `notify-lead-transfer` e por `src/lib/zapi.server.ts`. `sdr_avisos_corretor` é só um token de confirmação ligado a esse aviso, e `push_outbox` é notificação do navegador (push). A Sami 1898 é o canal de conversa (`samiq_canal_mensagens`), não de aviso.

Proposta: usar `zapi.server.ts` (mesmo número dos avisos de transferência) e, em paralelo, um push no `push_outbox`. Preciso que você confirme: o número que manda os avisos de transferência é o 1898 da Sami ou outro? Se quiser que saia pela Sami, troco só o remetente.

Disparo:
- Aceite e pedido de visita: aviso imediato, gravado numa fila `proposta_avisos` (idempotente por evento) e enviado na mesma requisição; se falhar, a varredura reenviar.
- Fim de sessão: o heartbeat só atualiza a sessão. Uma varredura agendada (pg_cron a cada 5 min chamando uma rota `/api/public/hooks/proposta-avisos` com segredo) pega sessões sem sinal há 10+ min, marca como encerradas e manda uma mensagem: "João abriu a proposta do Parque das Perdizes agora. Ficou 02:10, mais tempo em Fluxo de pagamento. 3ª abertura." Retorno após 30+ min abre sessão nova.
- Respeito à regra da casa: a mensagem nunca leva telefone do cliente.

## 3. Fases do funil e sugestão para o aceite

As 14 fases existentes: novo, aguardando atendimento, aguardando retorno, qualificação corretor, em atendimento, qualificado, agendado, visita realizada, proposta enviada, análise de crédito, contrato fechado, pós-venda, aguardando corretor, perdido.

Sugestão (você decide):
- Ao enviar uma Proposta: mover para "proposta enviada" só se o lead estiver antes dela; nunca regredir.
- No aceite: manter em "proposta enviada" e criar tarefa para o corretor, OU mover para "análise de crédito" se o aceite já significa que o cliente vai mandar documentos. Minha sugestão é "análise de crédito" apenas quando o lead ainda não passou dela, e nunca mexer em "contrato fechado" ou "pós-venda".
- Pedido de visita pela Apresentação: "agendado" segue a regra atual do link de agendamento.

Atenção: hoje "proposta enviada" não aparece como coluna nas fases de Carteira do kanban. Confirmo antes se isso deve mudar.

## 4. Modelo de dados

Alterações:
- `propostas`: + `modelo` (apresentacao | proposta), `token_hash` único, `versao_atual`, `status` (rascunho, enviada, aceita, expirada, revogada), `expira_em`, `revogado_em`, `primeira_abertura_em`, `ultimo_acesso_em`, `total_aberturas`, `limite_janela_*`, `agendamento_link_id`. `link_token` comentado como obsoleto.

Novas:
- `proposta_versoes`: proposta, número, `snapshot` jsonb (blocos ordenados e visíveis, textos, imagens, fluxos até 3, unidade, validade, primeiro nome do lead, corretor), `snapshot_hash`, criado_por, criado_em. Imutável.
- `proposta_sessoes`: proposta, versão, início, último sinal, encerrada_em, aparelho, navegador, tempo total, profundidade máxima, `tempo_por_secao` jsonb, aviso_enviado_em. Sem IP guardado fora do aceite.
- `proposta_eventos`: sessão, tipo (abertura, secao_vista, clique_whatsapp, clique_mapa, fluxo_visto, visita_pedida, aceite), seção, chave de idempotência.
- `proposta_aceites`: proposta (única), versão, opção de fluxo, nome completo, CPF (guardado só como hash + 3 últimos dígitos), IP, user agent, `snapshot_hash`, aceito_em.
- `proposta_avisos`: fila de mensagens ao corretor (tipo, referência única, enviado_em, tentativas).

Segurança:
- Todas com RLS. Leitura: corretor dono, gestor da equipe e admin (`is_active_member` + regra de escopo já usada em leads). Escrita só por funções.
- Nada é acessível ao público direto. Página pública fala só com rotas do servidor que chamam RPCs estreitas com service role: `obter_proposta_publica(hash)`, `consumir_proposta_requisicao(hash)`, `registrar_proposta_sinal(hash, sessao, eventos)`, `aceitar_proposta(hash, ...)`, `pedir_visita_proposta(hash, ...)`.
- Corretor: `criar_proposta`, `publicar_versao_proposta`, `revogar_proposta`, todas checando dono do lead.
- Timeline: eventos gravados em `lead_eventos` (envio, 1ª abertura, aceite, visita pedida), sem um evento por heartbeat.

## 5. Rotas e telas

- Ficha do lead: botão "Gerar link" abre o editor (modelo, projeto, unidade, fluxos, ordem/ocultar blocos, upload). Prévia lado a lado. Ações "Copiar link" e "Enviar no WhatsApp" com texto pronto. Cartão "Propostas" com status, aberturas, último acesso, tempo por seção em hh:mm, seção mais vista.
- `/propostas` (logado): lista das propostas (corretor vê só as dele).
- Painel do gestor dentro de `/propostas` (aba, admin/gestor): filtros período, corretor, projeto; enviadas, % abertas, tempo até 1ª abertura, tempo médio, seção mais lida, apresentação para visita pedida, proposta para aceite.
- `/p/$token` (público, SSR): página mobile-first. O token vai na URL para a prévia do WhatsApp funcionar (o `#` da vitrine impede o Open Graph); proteção por hash, limite de requisições, expiração e `noindex`. Título "Proposta para João | Parque das Perdizes" e imagem de capa só quando for URL pública segura.
- `/p/$token?previa=1` logado: prévia que não conta acesso. Acesso de usuário logado do CRM também não conta.
- Rotas de servidor: `/api/propostas` (corretor, autenticada) e `/api/public/propostas/*` (sinais, aceite, visita, comprovante).

Design: marinho #0F1E3A, dourado #B89968, creme #F5F1EA, Montserrat Bold e Inter (já existem em `public/fonts/aurum`). Sem travessão nos textos. Página nunca mostra telefone, CPF ou e-mail; só primeiro nome. Texto legal do aceite obrigatório.

## 6. Ordem de entrega

1. Banco: tabelas, RLS, RPCs, bucket, testes das regras (token, limite, aceite único, travamento, não regredir fase).
2. Editor na ficha do lead + snapshot e versões + copiar/enviar no WhatsApp (modelo Apresentação).
3. Página pública Apresentação + tracking por sessão + pedido de visita.
4. Modelo Proposta: unidade, fluxos, validade, aceite digital e comprovante.
5. Avisos no WhatsApp (sessão encerrada, aceite, visita) + timeline.
6. Lista de propostas, cartão na ficha e painel do gestor.

Cada etapa só avança com o seu "ok".

## Pontos para você decidir

- Número que manda os avisos: o mesmo dos avisos de transferência ou a Sami 1898.
- Fase no aceite: "análise de crédito" (sugestão) ou manter "proposta enviada" com tarefa.
- Validade padrão do link (sugiro 15 dias para Proposta, 30 para Apresentação).
