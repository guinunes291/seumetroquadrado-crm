// Manual do CRM — Parte 1: acesso, mapa do sistema e a operação do lead
// (Fila Única, Reserva, Bolsão, Follow-Up, Distribuição, transferência, SDR).
// Texto do manual; nenhuma regra de negócio vive aqui.

import { Aviso, Bloco, Capitulo, Passos, Tabela, Tela } from "./manual-ui";

export function ConteudoOperacao() {
  return (
    <>
      <Capitulo
        id="acesso"
        numero="1"
        titulo="Entrar no sistema"
        resumo="O acesso é por convite. O e-mail do cadastro precisa ser exatamente o e-mail convidado."
      >
        <Bloco titulo="Primeiro acesso" quem="Todos">
          <Passos
            itens={[
              "A gestão libera o convite para o seu e-mail (Configurações › Pessoas).",
              'Abra o endereço do CRM e clique em "Criar conta" na tela de entrada.',
              "Use exatamente o e-mail que foi convidado — qualquer outro endereço é recusado.",
              "Defina a senha e entre. Esqueceu a senha? Use “Esqueci minha senha” na mesma tela.",
              "No primeiro acesso, o corretor recebe a trilha “Como usar o CRM” (6 passos). Ela não bloqueia nada e pode ser reaberta depois pelo menu lateral.",
            ]}
          />
          <Tela src="login" legenda="Tela de entrada: login, criar conta e recuperação de senha." />
        </Bloco>

        <Bloco titulo="Perfis de acesso" quem="Referência">
          <Tabela
            cabecalho={["Perfil", "O que enxerga"]}
            linhas={[
              ["Corretor", "A própria carteira: Fila Única, Reserva, agenda, projetos, seu raio-x e ranking."],
              ["Gestor", "Tudo do corretor + a carteira do time, painel do gestor, oferta ativa e as filas do próprio time na distribuição."],
              ["Superintendente", "Visão de gestão em leitura (sem operar a distribuição)."],
              ["Admin", "Tudo, inclusive política de distribuição, configurações, financeiro e pessoas."],
              ["Pré-vendas (SDR)", "Hub próprio: base de pré-venda, reaquecimento, visitas e entregas ao corretor."],
            ]}
          />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="mapa"
        numero="2"
        titulo="O mapa do sistema"
        resumo="Depois do login você cai no portal de módulos. Cada módulo abre com o seu próprio menu lateral."
      >
        <Bloco titulo="Portal de módulos">
          <p>
            O portal separa os módulos em três grupos: <strong>Seu dia</strong> (Central de Comando,
            Prospecção, Gestão de Carteira, Modo Visita, Follow-Up), <strong>Consulta</strong>{" "}
            (Documentação &amp; Projetos) e <strong>Gestão</strong> (Assinaturas &amp; Comissões,
            Inteligência do Negócio, Configurações). Você volta para o portal a qualquer momento
            pelo item <strong>← Módulos</strong>, no topo do menu lateral.
          </p>
          <Tela src="portal" legenda="Portal de módulos — a primeira tela depois de entrar." />
        </Bloco>

        <Bloco titulo="Recursos que existem em qualquer tela">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Buscar (⌘K / Ctrl+K)</strong> — encontra cliente, projeto e tela pelo nome.
            </li>
            <li>
              <strong>Registrar venda</strong> — botão no topo, disponível de qualquer lugar.
            </li>
            <li>
              <strong>Sino de notificações</strong> — lead novo, transferência, visita e cobranças.
            </li>
            <li>
              <strong>SamiQ</strong> — assistente de IA no canto inferior: resume o cliente, sugere
              a mensagem e responde dúvidas sobre o projeto.
            </li>
            <li>
              <strong>Tema claro/escuro</strong> e, no celular, a barra inferior de atalhos.
            </li>
          </ul>
        </Bloco>
      </Capitulo>

      <Capitulo
        id="funil"
        numero="3"
        titulo="As etapas do cliente (o funil)"
        resumo="Todo cliente está sempre em uma etapa. Mudar de etapa é o que move o funil — e algumas mudanças pedem dados obrigatórios."
      >
        <Bloco titulo="Etapas, na ordem">
          <Tabela
            cabecalho={["Etapa", "O que significa"]}
            linhas={[
              ["Aguardando atendimento", "Recebeu o cliente e ainda não fez o primeiro contato."],
              ["Aguardando retorno", "O cliente pediu para falar depois."],
              ["Qualificação Corretor", "Chegou pelo bot ou pela pré-venda, já com interesse confirmado."],
              ["Em atendimento", "Conversa em andamento."],
              ["Agendado", "Visita marcada (pede data, hora e empreendimento)."],
              ["Visita realizada", "Visita confirmada (pede o resultado da visita)."],
              ["Análise de crédito", "Pasta na Caixa (pede os dados da análise)."],
              ["Venda", "Contrato fechado (pede os dados da venda)."],
              ["Perdido", "Saída honesta do funil — sempre com motivo."],
            ]}
          />
          <Aviso tipo="atencao">
            Cliente que já está em <strong>Venda</strong>, <strong>Perdido</strong> ou{" "}
            <strong>Pós-venda</strong> só volta atrás com a gestão. E não é possível pular de
            “Aguardando atendimento” direto para as etapas finais: o caminho precisa ser registrado.
          </Aviso>
        </Bloco>

        <Bloco titulo="Motivos de perda">
          <p>
            São 11 motivos fechados, para o relatório ficar comparável: sumiu/não responde; esfriou
            depois da proposta ou visita; crédito (score/negativado); crédito (renda); renda acima
            do teto do MCMV; já tem imóvel ou usou o FGTS; achou caro / parcela não cabe; comprou
            com concorrente; adiou a decisão; sem perfil (curioso / lead errado); outro (descrever).
          </p>
        </Bloco>
      </Capitulo>

      <Capitulo
        id="fila"
        numero="4"
        titulo="Central de Comando — Fila Única, Reserva e Bolsão"
        resumo="O dia do corretor começa aqui: uma lista só, ordenada por dinheiro em risco."
      >
        <Bloco titulo="Fila Única" quem="Corretor · Gestor">
          <p>
            A fila junta tudo o que precisa de você hoje e ordena por risco, nesta sequência:
            fundo do funil parado → chegaram agora (SLA correndo) → cliente respondeu e espera →
            follow-up vencido ou de hoje → sem próximo passo → esfriando → pasta travada. São até
            40 clientes por dia.
          </p>
          <Passos
            itens={[
              'Clique em "Começar pelo mais caro" — o sistema abre o primeiro cliente da lista.',
              "Fale com o cliente (WhatsApp ou ligação, pelos botões do próprio card).",
              "Registre o desfecho: é o botão que diz o que aconteceu na conversa.",
              "O sistema grava a interação na linha do tempo, cria o próximo passo com data e, quando for o caso, muda a etapa do cliente.",
              "Passe para o próximo. Nada sai da fila sem desfecho.",
            ]}
          />
          <p className="text-muted-foreground">
            Os desfechos mudam conforme a etapa. Exemplos: em análise de crédito aparecem “Falei ·
            crédito aprovado”, “Falei · aguardando Caixa”, “Falei · reprovado”, “Não atendeu” e
            “Perdeu (motivo)”; em visita agendada aparecem “Sim, foi à visita”, “Não foi
            (no-show)”, “Remarcou” e “Desistiu (motivo)”.
          </p>
          <Aviso>
            Desfecho que <em>não</em> muda a etapa tem “Desfazer” por 5 segundos. Desfecho que muda
            a etapa (visita, venda, perda) não tem — por isso ele pede confirmação e dados.
          </Aviso>
          <Tela src="fila-unica" legenda="Fila Única com o funil “Onde os clientes somem” e os três vazamentos mais caros." />
        </Bloco>

        <Bloco titulo="Carteira ativa: o teto de 65" quem="Corretor">
          <p>
            Cada corretor trabalha até <strong>65 clientes ativos</strong>. Quem estoura o teto
            para de receber cliente novo pela distribuição — nada é tirado de você por causa disso.
            O contador aparece no topo da Fila Única (“0/65 carteira ativa”).
          </p>
        </Bloco>

        <Bloco titulo="Reserva" quem="Corretor">
          <p>
            É a fila de espera da sua carteira: clientes seus que ficaram fora do teto, agrupados
            por motivo (sem próximo passo, nunca engataram, parados, sem vaga hoje).
          </p>
          <Passos
            itens={[
              'Abra Reserva e escolha um cliente.',
              'Clique em "Trazer" para puxá-lo de volta à carteira ativa (só funciona se houver vaga; são até 13 resgates).',
              'Use "Dossiê" para abrir a ficha completa antes de decidir.',
            ]}
          />
          <Tela src="reserva" legenda="Reserva — clientes seus aguardando vaga na carteira ativa." />
        </Bloco>

        <Bloco titulo="Bolsão" quem="Todos (consulta)">
          <p>
            A base geral da casa: clientes sem dono, trabalhados pelo discador e pela pré-venda. É
            uma tela de <strong>consulta</strong> — não há botão para puxar cliente daqui, e o
            telefone aparece mascarado.
          </p>
          <Tela src="bolsao" legenda="Bolsão de oportunidades — base sem dono, somente consulta." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="followup"
        numero="5"
        titulo="Follow-Up — a régua de 13 toques"
        resumo="Ninguém é descartado por esquecimento: a régua diz quando e por onde tocar de novo."
      >
        <Bloco titulo="Como funciona" quem="Corretor">
          <p>
            Cada cliente tem uma cadência de até <strong>13 toques</strong>, com intervalo que muda
            conforme a temperatura e a etapa. Só contato ativo feito por você conta como toque.
            Esgotados os 13 sem resposta, o cliente <strong>não</strong> é perdido automaticamente —
            vai para a sua decisão.
          </p>
          <Passos
            itens={[
              "Abra Follow-Up › Fila do dia: aparece um cliente por vez.",
              "Toque pelo canal que a régua indica (WhatsApp ou ligação).",
              'Registre: "Sem resposta", "Respondeu", "Agendou" ou "Descartar" (com motivo).',
              "Use as setas ← → para andar na fila; W abre o WhatsApp, L liga, D abre o desfecho.",
            ]}
          />
          <p className="text-muted-foreground">
            Abas: <strong>Fila do dia</strong>, <strong>Esgotados (13/13)</strong> — com “Reativar
            régua”, <strong>Curva de resposta</strong>, <strong>Cobertura do time</strong> (gestão)
            e <strong>Config da régua</strong> (admin).
          </p>
          <Tela src="follow-up" legenda="Follow-Up — fila do dia, um cliente por vez." />
          <Tela src="follow-up-cobertura" legenda="Cobertura do time — visão da gestão sobre quem está tocando a base." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="distribuicao"
        numero="6"
        titulo="Distribuição — como o cliente chega até o corretor"
        resumo="Toda a configuração da passagem de leads mora numa tela só: filas, corretores, exceções, histórico e política."
      >
        <Bloco titulo="As filas (roletas)" quem="Admin · Gestor (time)">
          <p>
            Existem as roletas <strong>Plantão</strong>, <strong>Marquinhos</strong> (bot),{" "}
            <strong>Landing Page</strong>, <strong>Base</strong>, <strong>Agendados do SDR</strong>{" "}
            e as roletas por <strong>zona</strong> (Norte, Sul, Leste, Oeste). A origem do cliente
            define a roleta; dentro dela, recebe quem está apto e há mais tempo sem receber.
          </p>
        </Bloco>

        <Bloco titulo="Quem está apto a receber">
          <p>
            O sistema pula o corretor quando: não participa ou está pausado na roleta; perfil
            inativo; sem papel de corretor; sem telefone; <strong>ausente no plantão hoje</strong>;{" "}
            <strong>cota diária atingida</strong>; percentual de leads trabalhados abaixo do mínimo;
            sem modelo de contrato; <strong>onboarding não concluído</strong>; conflito de agenda;
            ou teto de clientes ativos atingido.
          </p>
          <Aviso tipo="atencao">
            Ficar sem receber cliente quase sempre é um destes motivos — a aba{" "}
            <strong>Corretores</strong> mostra o motivo exato de cada um.
          </Aviso>
        </Bloco>

        <Bloco titulo="Prazo de atendimento (SLA) e exceções">
          <p>
            Se o primeiro contato não acontece no prazo, o cliente é repassado ao próximo da fila
            (“Repasse por SLA”). Também há redistribuição de cliente parado e repasse depois de uma
            perda. Quando ninguém está apto, o cliente cai na <strong>fila de exceções</strong> —
            que exige ação da gestão e aparece no painel de saúde no topo da tela.
          </p>
          <Tela src="distribuicao" legenda="Central de Distribuição — saúde da operação e abas de configuração." />
          <p className="text-muted-foreground">
            Abas: Visão Geral, Filas, Corretores, Exceções, Histórico, Política (admin),
            Configurações (admin) e Auditoria. O gestor pode incluir, pausar e remover corretores
            nas filas, limitado ao próprio time.
          </p>
        </Bloco>

        <Bloco titulo="Transferir um cliente para outro corretor" quem="Admin · Gestor">
          <Passos
            itens={[
              "Em Base de leads, marque os clientes (ou use o menu “⋯” de uma linha).",
              'Clique em "Transferir".',
              "Escolha o corretor de destino e confirme.",
              "O sistema registra a troca na linha do tempo e avisa o corretor no WhatsApp com UMA mensagem de resumo (nunca uma por cliente).",
            ]}
          />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="sdr"
        numero="7"
        titulo="Pré-venda (SDR)"
        resumo="A pré-venda esquenta, qualifica e agenda — o corretor recebe o cliente pronto."
      >
        <Bloco titulo="O fluxo" quem="SDR">
          <Passos
            itens={[
              "Minha base: trabalhe os clientes da pré-venda, confirme interesse e perfil.",
              "Reaquecer (parados): retome clientes de corretor sem registro há dias — a posse continua com o corretor.",
              "Agende a visita; ou entregue sem visita marcada, informando o motivo obrigatório.",
              "O cliente entra na base do corretor escolhido pela roleta, na etapa “Qualificação Corretor”.",
              "Visitas & confirmações: confirme a visita na véspera e no dia. Do comparecimento em diante, o corretor assume.",
            ]}
          />
          <Tela src="sdr" legenda="Hub da pré-venda: minha base, reaquecer, entregues, visitas e raio-x." />
        </Bloco>
      </Capitulo>
    </>
  );
}
