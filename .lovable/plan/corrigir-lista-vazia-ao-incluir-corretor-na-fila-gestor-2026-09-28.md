# Corrigir lista vazia ao incluir corretor na fila (gestor)

## Causa confirmada
A janela "Incluir corretor" monta a lista lendo os papéis de todos os usuários. Pelas regras de acesso do banco, só o administrador enxerga os papéis dos outros; o gestor vê apenas os próprios. Resultado: para o Bruno a lista vem vazia e o menu não abre nada. O time dele tem 16 corretores ativos, então deveriam aparecer.

## O que muda
- Quando quem abre a janela é gestor (modo equipe), a lista passa a ser montada a partir dos perfis ativos da própria equipe dele (que ele já tem permissão de ver), sem depender da leitura de papéis.
- Para o administrador, nada muda.
- Se mesmo assim a lista ficar vazia, a janela mostra o aviso "Nenhum corretor disponível da sua equipe" em vez de um menu em branco.

## O que NÃO muda
- Nenhuma permissão do banco é alterada.
- A inclusão continua passando pela mesma função auditada, que já confere no banco se o corretor é do time do gestor.

## Detalhes técnicos
- `src/features/distribuicao/queries.ts`: nova consulta `useCorretoresDaMinhaEquipeLista` (id, nome dos `profiles` ativos com `equipe_id` nas equipes geridas/próprias, excluindo o próprio gestor).
- `src/features/distribuicao/roleta-tab.tsx` (diálogo de incluir): se `restritoA` definido, usar essa lista em vez de `useCorretoresDisponiveis`; estado vazio com mensagem.
- Conferir no navegador logado como Bruno.
