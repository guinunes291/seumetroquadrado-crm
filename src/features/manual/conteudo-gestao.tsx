// Manual do CRM — Parte 2: carteira, prospecção, visitas, projetos,
// financeiro, inteligência do negócio, configurações e recursos globais.

import { Aviso, Bloco, Capitulo, Passos, Tabela, Tela } from "./manual-ui";

export function ConteudoGestao() {
  return (
    <>
      <Capitulo
        id="carteira"
        numero="8"
        titulo="Gestão de Carteira — base, kanban e agenda"
        resumo="A base completa de clientes, o quadro do funil e o calendário de compromissos."
      >
        <Bloco titulo="Base de leads (/leads)" quem="Todos">
          <p>
            A lista completa, com filtros por etapa, origem, corretor, temperatura, período, data,
            contato, tempo parado e resultado da análise de crédito. Há busca por nome ou telefone e{" "}
            <strong>visões salvas</strong> para guardar um conjunto de filtros que você usa sempre.
          </p>
          <Passos
            itens={[
              'Novo cliente: botão "Novo lead" — nome e telefone são o mínimo.',
              "Importar planilha: botão de importação, com conferência antes de gravar.",
              "Selecionar vários: use as caixinhas; aparece a barra de ações em massa.",
              'Em massa você pode: "Transferir" para outro corretor, agendar follow-up e descartar com motivo.',
              'Tecla F abre o "Modo Foco": um cliente por vez, sem distração.',
            ]}
          />
          <Tela
            src="base-leads"
            legenda="Base de leads com filtros, visões salvas e seleção múltipla."
          />
        </Bloco>

        <Bloco titulo="Ficha do cliente (dossiê)" quem="Todos">
          <p>
            Clicando no nome, você abre a ficha: dados e qualificação, linha do tempo de tudo que
            aconteceu, conversa de WhatsApp, documentos, agendamentos, histórico de responsáveis e
            as ações de etapa. É de lá que sai a maior parte do trabalho fino do cliente.
          </p>
          <Tela src="ficha-lead" legenda="Ficha do cliente: dados, linha do tempo e ações." />
        </Bloco>

        <Bloco titulo="Funil em quadro (/pipeline)" quem="Todos">
          <p>
            As mesmas pessoas em colunas por etapa. Arraste o card para mudar de etapa — o sistema
            recusa passagens inválidas e pede os dados obrigatórios quando a etapa exige. Cada
            coluna mostra quantidade, VGV potencial, follow-ups vencidos, quem está sem próximo
            passo e quem está parado há 7 dias ou mais. A aba <strong>Fechamento</strong> reúne o
            que está perto de virar contrato.
          </p>
          <Tela src="kanban" legenda="Quadro do funil — arraste o card para mudar a etapa." />
        </Bloco>

        <Bloco titulo="Agenda e tarefas (/agendamentos)" quem="Todos">
          <p>
            <strong>Agenda</strong> mostra visitas e compromissos; <strong>Tarefas</strong> mostra
            os próximos passos com data. Toda tarefa nasce de um desfecho ou de um agendamento — é a
            tarefa que garante que ninguém fica sem próximo passo.
          </p>
          <Tela src="agenda" legenda="Agenda de visitas e compromissos." />
          <Tela src="tarefas" legenda="Tarefas — os próximos passos com data." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="visita"
        numero="9"
        titulo="Modo Visita"
        resumo="A tela de campo: as visitas dos próximos sete dias, o briefing antes e o resultado depois."
      >
        <Bloco titulo="Como usar no dia da visita" quem="Corretor">
          <Passos
            itens={[
              "Abra Modo Visita: aparecem as visitas dos próximos 7 dias.",
              "Antes de sair, abra o briefing: quem é o cliente, o que ele procura e o que já foi conversado.",
              "No local, use os botões do card para ligar, mandar WhatsApp ou abrir a ficha.",
              "Depois da visita, registre o resultado — é isso que move o cliente para “Visita realizada” e define o próximo passo.",
            ]}
          />
          <Tela src="modo-visita" legenda="Modo Visita — visitas dos próximos sete dias." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="prospeccao"
        numero="10"
        titulo="Prospecção — Modo Foco, Oferta Ativa e Discador"
        resumo="Onde se trabalha volume: lote do dia, listas dirigidas e discagem."
      >
        <Bloco titulo="Modo Foco (/prospeccao)" quem="Corretor · SDR">
          <p>
            Você escolhe a base do dia (Aguardando Atendimento, Aguardando Retorno ou Em
            Qualificação), o sistema monta o lote e o trabalho acontece um cliente por vez, com
            desfecho obrigatório a cada um.
          </p>
          <Tela
            src="prospeccao-modo-foco"
            legenda="Modo Foco — o lote do dia, um cliente por vez."
          />
        </Bloco>

        <Bloco titulo="Oferta Ativa (/oferta-ativa)" quem="Admin · Gestor">
          <Passos
            itens={[
              'Clique em "Nova lista".',
              "Dê nome e descrição e monte os filtros (etapa, temperatura, projeto, origem, zona) — o total aparece na hora.",
              "Escolha o corretor dono da lista (isso define quem trabalha a lista, não quem é filtrado).",
              "Salve. Para repetir uma campanha, use a opção de duplicar a partir de uma lista existente.",
            ]}
          />
        </Bloco>

        <Bloco titulo="Discador (/discador)" quem="Corretor · Gestor">
          <p>
            Integração com o discador 3C Plus. Você conecta o seu ramal, roda a sessão de discagem
            e, quando o cliente atende, a ficha dele aparece na tela em qualquer página do CRM, com
            som. As abas <strong>Atendidos</strong> e <strong>Histórico de chamadas</strong> mostram
            o que foi falado.
          </p>
          <Tela src="discador" legenda="Discador 3C Plus — sessão, atendidos e histórico." />
        </Bloco>

        <Bloco titulo="Captação (Landing)" quem="Admin · Gestor">
          <p>Acompanha o que entra pelas páginas de captação e campanhas, antes da distribuição.</p>
          <Tela src="captacao-landing" legenda="Captação — entrada de leads das landing pages." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="projetos"
        numero="11"
        titulo="Documentação & Projetos"
        resumo="O material de venda: empreendimentos, ficha técnica, tabela, unidades e mapa."
      >
        <Bloco titulo="Projetos em foco e catálogo" quem="Todos">
          <p>
            <strong>Projetos em Foco</strong> traz o que a casa está vendendo agora.{" "}
            <strong>Catálogo completo</strong> lista todos os empreendimentos; a ficha de cada um
            reúne dados técnicos, condições comerciais e as unidades disponíveis, em grade ou
            tabela. <strong>Materiais</strong> (gestão) guarda os arquivos de apoio.
          </p>
          <p>
            Em <strong>Construtoras parceiras</strong>, cada construtora aparece como uma barra
            fechada com logo, nome e número de projetos. Clique para abrir e ver os projetos; clique
            de novo para fechar.
          </p>
          <Aviso>
            Produtos, Projetos em Foco e Vitrine mostram só as construtoras parceiras: Vibra, Trisul,
            Plano&amp;Plano, Mundo APTO, Holos, Engelux, Conx, Cavazani, Cury, Longitude,
            Direcional, Riva, Econ e Emccamp. O Catálogo da gestão continua mostrando tudo. Para
            aparecer em Produtos, o empreendimento precisa de zona e de book ou tabela.
          </Aviso>
          <Tela src="projetos-foco" legenda="Projetos em foco." />
          <Tela src="catalogo-projetos" legenda="Catálogo completo de empreendimentos." />
        </Bloco>

        <Bloco titulo="Completar materiais colando uma planilha" quem="Admin · Gestor">
          <p>
            Em <strong>Materiais</strong>, cole as linhas (sem títulos) nesta ordem: nome do
            empreendimento, link do book, link da tabela, link da capa e preço a partir de (aceita
            “R$ 450.000”, “320 mil” ou “1,2 mi”). Coluna vazia não apaga nada. Nomes que não
            batem com o cadastro aparecem numa lista para corrigir.
          </p>
        </Bloco>

        <Bloco titulo="Capas e banners de campanha" quem="Admin · Gestor">
          <p>
            Links do Google Drive funcionam como capa e banner, desde que o arquivo esteja
            compartilhado como “Qualquer pessoa com o link”. Faça o banner de campanha em{" "}
            <strong>2400 × 600 px</strong> (JPG, até 500 KB), com a metade esquerda limpa para o
            texto e o elemento principal no centro-direita. Não escreva nome, preço ou datas na
            arte — o CRM já mostra.
          </p>
        </Bloco>

        <Bloco titulo="Vitrine (mapa)" quem="Todos">
          <p>
            Os empreendimentos no mapa, para achar opção por região — útil na conversa com o cliente
            e para montar roteiro de visita.
          </p>
          <Tela src="vitrine" legenda="Vitrine — empreendimentos no mapa." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="financeiro"
        numero="12"
        titulo="Assinaturas & Comissões"
        resumo="Registrar a venda, aprovar, acompanhar a comissão e ler o resultado."
      >
        <Bloco titulo="Registrar uma venda" quem="Todos">
          <Passos
            itens={[
              'Clique em "Registrar venda" no topo de qualquer tela (ou pela busca ⌘K).',
              "Escolha o cliente, informe o valor e a data de assinatura.",
              "Selecione o projeto e a unidade e, se precisar, ajuste a divisão da comissão.",
              "Marque os marcos de efetivação e salve — a venda nasce pendente.",
              "A gestão aprova depois; sem os marcos de efetivação, a aprovação não passa.",
            ]}
          />
          <Aviso>
            O período de todos os relatórios de venda usa a <strong>data de assinatura</strong> — é
            ela que define em qual mês a venda entra.
          </Aviso>
        </Bloco>

        <Bloco titulo="Fechamento" quem="Admin · Gestor">
          <p>
            Abas internas: <strong>Fila de decisão</strong>, <strong>Recebíveis</strong>,{" "}
            <strong>Sem corretor</strong>, <strong>Integridade</strong> e{" "}
            <strong>Conciliação</strong>. Nos indicadores você vê “Em aberto”, “Travado por
            recebimento”, “Apto a pagar” e “Pago no mês”. Por linha dá para corrigir beneficiário,
            cancelar a comissão ou ver o histórico; também há ação em lote.
          </p>
          <Tela src="financeiro-fechamento" legenda="Fechamento — fila de decisão e recebíveis." />
        </Bloco>

        <Bloco titulo="Comissões" quem="Todos">
          <p>
            Cada corretor vê as próprias comissões (VGV, percentual, valor, líquido, status e
            pagamento); a gestão vê a imobiliária inteira.
          </p>
          <Tela src="financeiro-comissoes" legenda="Comissões — valores, status e pagamento." />
        </Bloco>

        <Bloco titulo="DRE" quem="Admin · Gestor">
          <p>
            Resultado por unidade e consolidado da rede, com despesas lançadas por mês e o detalhe
            de cada célula (“ver o que compõe”).
          </p>
          <Tela src="financeiro-dre" legenda="DRE — resultado por unidade e consolidado." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="bi"
        numero="13"
        titulo="Inteligência do Negócio"
        resumo="Seu desempenho, o ranking e os painéis da gestão."
      >
        <Bloco titulo="Meu Raio-X" quem="Todos">
          <p>
            Os seus números: atendimento, conversão por etapa, visitas, vendas e onde você perde
            mais clientes. Cada um vê o próprio recorte.
          </p>
          <Tela src="meu-raio-x" legenda="Meu Raio-X — desempenho individual." />
        </Bloco>

        <Bloco titulo="Ranking e conquistas" quem="Todos">
          <Tela src="ranking" legenda="Ranking do time e conquistas." />
        </Bloco>

        <Bloco titulo="Painel do Gestor" quem="Admin · Gestor · Superintendente">
          <p>
            Abas <strong>Dia</strong>, <strong>Relatórios</strong>, <strong>Funil</strong>,{" "}
            <strong>Time</strong> e <strong>Metas &amp; Ritmo</strong>. É onde se acompanha o ritmo
            do time, os gargalos do funil e as metas. No alto da tela, a faixa{" "}
            <strong>Vendas da empresa</strong> mostra o total de vendas aprovadas da empresa inteira
            no mês, no ano e no geral (pela data de assinatura, sem distratos).
          </p>
          <Tela src="painel-gestor" legenda="Painel do Gestor — dia, funil, time e metas." />
        </Bloco>

        <Bloco titulo="Higiene do Funil" quem="Admin · Gestor · Superintendente">
          <p>
            Mostra o que está sujo na base: cliente parado, sem próximo passo, duplicado ou preso
            numa etapa que já não corresponde à realidade.
          </p>
          <Tela src="higiene-funil" legenda="Higiene do Funil." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="config"
        numero="14"
        titulo="Configurações"
        resumo="Só administradores. É aqui que se libera acesso, define metas da casa, equipes e integrações."
      >
        <Bloco titulo="As abas" quem="Admin">
          <Tabela
            cabecalho={["Aba", "Para que serve"]}
            linhas={[
              ["Integrações", "Google Agenda, API pública e webhooks, WhatsApp (Z-API)."],
              ["Gestão", "Parâmetros da casa: teto de carteira, prazos, régua e cortes."],
              ["Pessoas", "Corretores e equipes — é onde se libera o acesso de alguém novo."],
              ["Estoque", "Unidades e disponibilidade."],
              ["Campanhas", "Campanhas de origem dos leads."],
              ["Comunicação", "Modelos de mensagem."],
              ["Qualidade", "Duplicatas, lixeira e qualidade das respostas da IA."],
              ["Preferências", "Perfil, conta e notificações."],
            ]}
          />
          <Tela src="configuracoes" legenda="Configurações — integrações, API e WhatsApp." />
          <Tela src="config-pessoas" legenda="Pessoas — corretores e equipes." />
          <Tela src="config-estoque" legenda="Estoque — unidades e disponibilidade." />
        </Bloco>

        <Bloco titulo="Liberar acesso a uma pessoa nova" quem="Admin">
          <Passos
            itens={[
              "Vá em Configurações › Pessoas.",
              "Cadastre a pessoa com o e-mail exato que ela vai usar, o papel (corretor, gestor, SDR…) e a equipe.",
              "Ela se cadastra sozinha na tela de entrada, com esse mesmo e-mail.",
              "Para tirar o acesso, bloqueie a conta — o histórico de vendas, comissões e atendimentos é sempre preservado.",
            ]}
          />
          <Aviso tipo="atencao">
            Metas do time ficam em <strong>Painel do Gestor › Metas &amp; Ritmo</strong>, não em
            Configurações.
          </Aviso>
        </Bloco>
      </Capitulo>

      <Capitulo
        id="global"
        numero="15"
        titulo="Recursos que ajudam no dia a dia"
        resumo="Busca, atalhos, mensagens e o assistente."
      >
        <Bloco titulo="Trilha de boas-vindas (Como usar o CRM)" quem="Corretor">
          <p>
            No primeiro acesso, uma trilha de 6 passos abre sozinha. Ela não bloqueia nada: dá para
            fechar e voltar depois pelo item <strong>Como usar o CRM</strong> no menu. O último
            passo só conclui depois de registrar um atendimento de verdade. Concluída, a trilha não
            abre mais sozinha — e só quem concluiu passa a estar apto a receber clientes.
          </p>
        </Bloco>

        <Bloco titulo="Central de Mensagens (/mensagens)" quem="Operação">
          <p>
            As conversas de WhatsApp em um lugar só, com aviso de quem está aguardando resposta.
            Cada mensagem também aparece na linha do tempo do cliente.
          </p>
          <Tela src="mensagens" legenda="Central de Mensagens — conversas de WhatsApp." />
        </Bloco>

        <Bloco titulo="Atalhos de teclado">
          <Tabela
            cabecalho={["Atalho", "O que faz"]}
            linhas={[
              ["⌘K / Ctrl+K", "Busca global e ações (inclui “Registrar venda”)."],
              ["⌘J / Ctrl+J", "Abre o SamiQ, o assistente de IA."],
              ["?", "Lista todos os atalhos disponíveis na tela."],
              ["[", "Recolhe ou expande o menu lateral."],
              ["F", "Modo Foco na base de leads."],
              ["← → · W · L · D", "Na fila: navegar, WhatsApp, ligar e registrar desfecho."],
            ]}
          />
        </Bloco>

        <Bloco titulo="Meu perfil" quem="Todos">
          <p>
            Foto, telefone, preferências de notificação, sua elegibilidade nas filas de distribuição
            e os seus números. A foto é obrigatória para aparecer no ranking e nas telas do time.
          </p>
          <Tela src="meu-perfil" legenda="Meu perfil — dados, notificações e elegibilidade." />
        </Bloco>
      </Capitulo>

      <Capitulo
        id="novidades"
        numero="16"
        titulo="Novidades — outubro de 2026"
        resumo="O que mudou no CRM nas últimas semanas: lote do Bolsão, regras de carteira, telas de Leads e Relatórios, estudo diário e zonas."
      >
        <Bloco titulo="Pedir lote de 30 do Bolsão (/prospeccao)" quem="Corretor">
          <p>
            É a forma de receber base nova, além das roletas e redistribuições. Você escolhe a zona
            e o sistema entrega até 30 clientes do Bolsão daquela zona, já em cadência D+3.
          </p>
          <Passos
            itens={[
              'Abra Prospecção e clique em "Pedir lote".',
              "Escolha a zona — só aparecem as zonas para as quais a gestão liberou você.",
              "Os clientes entram na sua carteira em “Aguardando retorno” com a cadência D+3.",
              "Trabalhe o lote até o fim da cadência; quem respondeu fica na sua carteira ativa.",
            ]}
          />
          <Aviso>
            Só pode pedir um lote novo quando o anterior terminar a cadência e a sua carteira estiver
            abaixo de 65 clientes. Se a zona tiver menos de 30, vem o que houver.
          </Aviso>
        </Bloco>

        <Bloco titulo="Regras da carteira ativa" quem="Corretor · Gestor">
          <Tabela
            cabecalho={["Situação", "O que acontece"]}
            linhas={[
              ["Cliente parado há mais de 30 dias (Bolsão) ou 60 dias (corretor)", "Volta para a roleta ou para o Bolsão"],
              ["Cliente sem próximo passo marcado há vários dias", "Pode ser devolvido — sempre marque o próximo passo"],
              ["Carteira acima de 65 clientes", "Os parados há mais tempo saem até caber"],
              ["Cliente em “Qualificação Corretor”", "Fica protegido com você durante o prazo da etapa"],
              ["Visita, proposta, análise, venda ou cliente que você mesmo captou", "Nunca sai da sua carteira por essas regras"],
            ]}
          />
          <Aviso tipo="atencao">
            Toda devolução fica registrada e pode ser desfeita pela gestão. Registre o desfecho e o
            próximo passo em todo contato — é isso que mantém o cliente com você.
          </Aviso>
        </Bloco>

        <Bloco titulo="Tela de Leads e Relatórios" quem="Todos">
          <Passos
            itens={[
              "Leads: um card por linha, com empreendimento, origem, renda, entrada, FGTS, corretor, último contato, próximo follow-up e resumo já visíveis.",
              "Funil da Gestão de Leads: conta os clientes que entraram no período e até onde chegaram, não só a etapa de hoje.",
              "Relatórios › Vendas: novo quadro “Vendas por construtora”, com quantidade e VGV, pela data de assinatura.",
              "Relatórios: novo filtro de corretor ao lado do período, para ver Resumo, Vendas, Atividades e Aprovações de uma pessoa.",
              "Admin pode corrigir a Origem do cliente no botão Editar da ficha.",
            ]}
          />
        </Bloco>

        <Bloco titulo="Estudo diário e zonas" quem="Corretor">
          <Passos
            itens={[
              "O estudo obrigatório aparece uma vez por dia. Depois de concluir, não volta ao trocar de página.",
              "Todo o ABC (Santo André, São Bernardo, São Caetano, Diadema, Mauá, Ribeirão Pires e Rio Grande da Serra) conta como Zona Sul.",
              "Cliente fora da sua zona não é entregue a você — a regra vale para roleta, lote e devoluções.",
              "Visita que você mesmo agendou não passa pela fila do SDR.",
            ]}
          />
        </Bloco>
      </Capitulo>
    </>
  );
}
