# Cadastro de venda duplicada
- [x] Tratar venda ativa existente e envio simultâneo no cadastro compartilhado, preservando registros e regras financeiras; 17 testes passaram e compilação OK.
- [ ] Conferir o fluxo autenticado sem cadastrar venda real: emissão de sessão do solicitante indisponível; aguarda login no preview. Não foi localizada no banco a venda com nome/valor da imagem.

# Filtro de projeto na Gestão de Carteira
- [x] Adicionar seleção de projeto na lista, preservando permissões, contagens, paginação e seleção em lote.
- [x] Testar filtro Playball Cury por vínculo e nome, paginação e URL: 23 testes passaram; compilação OK.
- [ ] Conferir seleção na tela autenticada: emissão da sessão do solicitante falhou; aguarda login no preview.

# Marquinhos (Mark) pela Sami
- [x] Separar CANCELAR de DESFAZER: trava também na ferramenta de IA; CANCELAR testado na API com e sem conversa nova, sem alterações.
- [x] Permitir seleção independente de conversa por lead_id ou nome e status; 54 testes passaram e ambas as seleções leram Teste Qa em conversas novas, sem propostas nem gravações.
- [x] Autorizar escopo global somente para canal Marquinhos com chave válida e perfil Admin indicado; manter carteira nos demais canais.
- [x] Separar conversa e confirmação, preservar desfazer e registrar autoria Marquinhos.
- [ ] Corrigir timeout do MCP externo: crm_buscar_lead não existe nos fontes disponíveis; índice trigram de nome já existe e busca direta levou 49 ms. Aguarda acesso à implementação/chamada do MCP.
- [x] Testar permissões, isolamento e ensaio/nota confirmada em lead de teste: 165 testes passaram; ensaio descartado; CONFIRMAR na Sami não confirmou proposta Mark; nota única gravada com autoria correta.
- [ ] Conferir nota na tela autenticada: sessão do solicitante indisponível; aguarda login no preview. Teste com lead de corretor aguarda identificação de cliente fictício ativo com responsável (os testes disponíveis estão sem corretor).

# Ajuste de comissão na aprovação
- [x] Permitir ajuste da comissão do corretor com justificativa obrigatória fora da regra e registrar regra, justificativa e autor da aprovação.
- [x] Conferir percentuais Marquinhos no banco e testar cálculo e justificativa: 15 testes passaram.
- [ ] Validar aprovação autenticada na tela: emissão da sessão do solicitante falhou; aguarda login no preview. Camila não possui agendamento que a classifique como Marquinhos; nenhuma venda real foi aprovada ou recalculada.

# Buscas da Sami
- [x] Criar colunas normalizadas e índices de projetos, preservando políticas e grants existentes.
- [x] Ajustar ferramentas e testes para nome, acentos e curadoria filtrada.
- [x] Executar testes (3.102 passaram), conferir Nações Unidas/José no banco e solicitar publicação.

# Telefones de corretores
- [x] Retirar leads com telefone de corretor preservando histórico: 23 retirados, zero restantes.
- [x] Bloquear telefone de corretor na busca e no cadastro com conferência global no servidor; testes automatizados.
- [ ] Aplicar proteção global no banco: 0103 foi pulada por data futura do histórico gerenciado; requer correção pela plataforma.
- [ ] Validar cadastro autenticado na tela: não foi possível obter sessão do solicitante; aguarda login no preview.

# Aprovação e comissão dos sócios
- [x] Abrir seleção dos beneficiários na aprovação, com bloqueio seguro enquanto configuração não existe.
- [x] Aplicar comissão de 0,3% por sócio no banco (aplicada; vendas antigas intactas).
- [x] Testar cálculo: 41 testes passaram.
- [ ] Validar aprovação real: depende da configuração no banco e de sessão autorizada; existem dois Fábios, seleção explícita na tela.

# Integração 3C Plus
- [x] Criar roleta dedicada 3C Plus, pausada, sem alterar as demais.
- [x] Configurar os dois tokens e credencial exclusiva com leads:read, leads:write e events:write; leitura HTTP 200 no preview e no site publicado.
- [ ] Ativar roleta para todos os corretores com check-in apto na filial. Bloqueado: histórico gerenciado de migrations tem datas futuras; 0100 foi pulada e o journal é somente leitura. Requer correção do histórico pela plataforma antes de aplicar 0100; roleta permanece pausada.
- [ ] Ativar avisos reais exclusivos da roleta, preservando os avisos existentes. Destino autorizado; mesmo bloqueio da migration 0100. Avisos ainda não estão ativos.
- [x] Enviar evento fictício de teste: HTTP 200, workflow iniciado; sem dados de clientes.