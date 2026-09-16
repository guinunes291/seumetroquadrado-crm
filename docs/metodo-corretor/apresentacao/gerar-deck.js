const pptxgen = require("pptxgenjs");

const NAVY = "12294A", DEEP = "0B1B33", GOLD = "D8B944", GOLDDK = "9A7A15";
const PAPER = "F4F2ED", WHITE = "FFFFFF";
const INK = "1B2A44", INK2 = "46586F", INK3 = "7C8DA3";
const RED = "A32316", REDSOFT = "F7E3DF";
const GRN = "166B45", GRNSOFT = "DFEDE5";
const GOLDSOFT = "F5EBCD", LINE = "DCD8CF";
const H = "Cambria", B = "Calibri";

const p = new pptxgen();
p.layout = "LAYOUT_WIDE";           // 13.3 x 7.5
p.author = "Seu Metro Quadrado";
p.title = "Manual do CRM SMQ";

const W = 13.3, M = 0.7;
const CW = W - M * 2;                // 11.9

/* ---------- helpers ---------- */
function dark(sl) { sl.background = { color: NAVY }; }
function light(sl) { sl.background = { color: PAPER }; }

function eyebrow(sl, txt, color) {
  sl.addText(txt.toUpperCase(), {
    x: M, y: 0.42, w: CW, h: 0.26, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 2,
    color: color || INK3,
  });
}
function title(sl, txt, color, y) {
  sl.addText(txt, {
    x: M, y: y === undefined ? 0.75 : y, w: CW, h: 0.95, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 34, bold: true, color: color || INK, valign: "top",
  });
}
/** círculo dourado numerado — o motivo visual do deck */
function medal(sl, n, x, y, d) {
  const dd = d || 0.46;
  sl.addShape(p.ShapeType.ellipse, { x, y, w: dd, h: dd, fill: { color: GOLD } });
  sl.addText(String(n), {
    x, y, w: dd, h: dd, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 17, bold: true, color: DEEP, align: "center", valign: "middle",
  });
}
function card(sl, o) {
  sl.addShape(p.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.09,
    fill: { color: o.fill || WHITE },
    line: { color: o.line || LINE, width: 1 },
  });
}
function note(sl, t) { sl.addNotes(t); }

/* ============ 1 · CAPA ============ */
{
  const s = p.addSlide(); dark(s);
  s.addText("SEU METRO QUADRADO", {
    x: M, y: 2.05, w: CW, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, charSpacing: 3, color: GOLD,
  });
  s.addText("Como usar o CRM\npara vender toda semana", {
    x: M, y: 2.5, w: 10.6, h: 2.1, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 48, bold: true, color: WHITE, lineSpacing: 54,
  });
  s.addText("Manual do corretor  ·  Setembro de 2026", {
    x: M, y: 4.85, w: CW, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 16, color: "AFC0D6",
  });
  s.addShape(p.ShapeType.rect, { x: M, y: 5.5, w: 1.5, h: 0.05, fill: { color: GOLD } });
  note(s, "Abertura. Hoje não é uma cobrança — é a entrega de um sistema que passou a funcionar.");
}

/* ============ 2 · SEÇÃO: o que consertamos ============ */
{
  const s = p.addSlide(); dark(s);
  eyebrow(s, "Antes de começar", GOLD);
  s.addText("Antes de pedir qualquer coisa\na vocês, consertamos o que\nestava quebrado.", {
    x: M, y: 1.15, w: 7.4, h: 2.4, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 32, bold: true, color: WHITE, lineSpacing: 40,
  });
  s.addText("Por três meses o CRM pediu coisas que ele mesmo não conseguia sustentar. Isso acabou.", {
    x: M, y: 3.75, w: 7.2, h: 0.8, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: "AFC0D6",
  });
  const fixes = [
    ["A régua de follow-up", "criava tarefa e nunca fechava — 96% venciam"],
    ["“Cliente respondeu”", "nunca acendeu: 1 resposta registrada em 90 dias"],
    ["O painel do funil", "não existia no banco — ninguém nunca o viu"],
    ["O funil", "somava 43 mil da pré-venda em “aguardando atendimento”"],
  ];
  fixes.forEach((f, i) => {
    const y = 1.35 + i * 1.12;
    s.addShape(p.ShapeType.roundRect, {
      x: 8.35, y, w: 4.25, h: 0.94, rectRadius: 0.08,
      fill: { color: "1B3760" }, line: { color: "2C4C79", width: 1 },
    });
    s.addText("✓", {
      x: 8.55, y, w: 0.4, h: 0.94, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 17, bold: true, color: GOLD, valign: "middle",
    });
    s.addText([
      { text: f[0] + "  ", options: { bold: true, color: WHITE } },
      { text: f[1], options: { color: "AFC0D6" } },
    ], {
      x: 9.0, y, w: 3.45, h: 0.94, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, valign: "middle",
    });
  });
  note(s, "Diga isto com todas as letras: pedir obediência a um sistema quebrado teria sido injusto. Agora não é.");
}

/* ============ 3 · vocês vendem ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "O que os dados dizem de vocês");
  title(s, "A notícia que talvez ninguém tenha te contado");
  const stats = [
    ["126", "vendas registradas", "nos últimos 12 meses"],
    ["R$ 32,2 mi", "de VGV", "116 já aprovadas"],
    ["29", "vendas em setembro", "o melhor mês do ano"],
  ];
  stats.forEach((st, i) => {
    const x = M + i * 4.02;
    card(s, { x, y: 2.15, w: 3.72, h: 2.5 });
    s.addText(st[0], {
      x: x + 0.3, y: 2.45, w: 3.1, h: 1.0, isTextBox: true, margin: 0,
      fontFace: H, fontSize: st[0].length > 5 ? 40 : 54, bold: true, color: NAVY,
    });
    s.addText(st[1], {
      x: x + 0.3, y: 3.5, w: 3.1, h: 0.42, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: INK,
    });
    s.addText(st[2], {
      x: x + 0.3, y: 3.9, w: 3.1, h: 0.42, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, color: INK3,
    });
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 5.05, w: CW, h: 1.15, rectRadius: 0.09, fill: { color: GRNSOFT }, line: { color: GRN, width: 1 },
  });
  s.addText([
    { text: "De cada 100 clientes que visitam um empreendimento com vocês, 45 compram. ", options: { bold: true, color: INK } },
    { text: "A casa fecha muito bem — esse nunca foi o problema.", options: { color: INK2 } },
  ], {
    x: M + 0.35, y: 5.05, w: CW - 0.7, h: 1.15, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, valign: "middle",
  });
  note(s, "Comece elogiando, porque os dados elogiam. Isso compra atenção para o slide seguinte.");
}

/* ============ 4 · o funil, 7 de 8 ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "As 8 passagens do funil · medido em 16/09/2026");
  title(s, "Sete das oito já estão na meta da casa");
  s.addChart(p.ChartType.bar, [
    {
      name: "Hoje",
      labels: ["Distribuição", "1º contato", "Qualificação", "Vira conversa", "Agendamento", "Comparecimento", "Pasta / proposta", "Fechamento"],
      values: [92.6, 65.8, 91.6, 93.4, 5.4, 79.8, 87.0, 45.3],
    },
    {
      name: "Meta da casa",
      labels: ["Distribuição", "1º contato", "Qualificação", "Vira conversa", "Agendamento", "Comparecimento", "Pasta / proposta", "Fechamento"],
      values: [100, 50, 50, 90, 70, 65, 75, 30],
    },
  ], {
    x: M, y: 1.85, w: 8.45, h: 4.9,
    barDir: "bar", barGapWidthPct: 45,
    chartColors: [GOLDDK, "C3CCD9"],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 9,
    dataLabelColor: INK2, dataLabelFontFace: B, dataLabelFormatCode: '0.0"%"',
    catAxisLabelColor: INK, catAxisLabelFontFace: B, catAxisLabelFontSize: 11,
    valAxisLabelColor: INK3, valAxisLabelFontFace: B, valAxisLabelFontSize: 9,
    valAxisMaxVal: 115, valGridLine: { color: "E6E2DA", size: 1 },
    catGridLine: { style: "none" },
    showLegend: true, legendPos: "t", legendColor: INK2, legendFontFace: B, legendFontSize: 11,
  });
  s.addShape(p.ShapeType.roundRect, {
    x: 9.5, y: 2.5, w: 3.1, h: 3.4, rectRadius: 0.09, fill: { color: REDSOFT }, line: { color: RED, width: 1.25 },
  });
  s.addText("A ÚNICA FORA", {
    x: 9.8, y: 2.75, w: 2.5, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 1.5, color: RED,
  });
  s.addText("Agendamento", {
    x: 9.8, y: 3.1, w: 2.5, h: 0.4, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 19, bold: true, color: INK,
  });
  s.addText("5,4%", {
    x: 9.8, y: 3.6, w: 2.5, h: 0.85, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 48, bold: true, color: RED,
  });
  s.addText("contra meta de 70%.\nÉ um treze avos do que\ndeveria ser.", {
    x: 9.8, y: 4.55, w: 2.5, h: 1.1, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, color: INK2, lineSpacing: 17,
  });
  note(s, "Sete verdes, uma vermelha. Deixe o time absorver: não precisam melhorar em sete coisas.");
}

/* ============ 5 · o gargalo ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "O gargalo");
  title(s, "Conversa que não vira visita");
  s.addText("De cada 100 conversas ativas, cinco viram visita.", {
    x: M, y: 1.85, w: 7.6, h: 0.45, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 17, color: INK2,
  });
  card(s, { x: M, y: 2.55, w: 7.6, h: 2.0, fill: WHITE });
  s.addText("6.439", {
    x: M + 0.4, y: 2.75, w: 3.1, h: 1.0, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 54, bold: true, color: NAVY,
  });
  s.addText("clientes parados em “em atendimento”", {
    x: M + 0.4, y: 3.72, w: 4.2, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, bold: true, color: INK,
  });
  s.addText("É a maior etapa comercial do funil — maior\nque “aguardando atendimento”. Todos já\nresponderam. Todos já foram qualificados.", {
    x: 4.55, y: 2.85, w: 3.55, h: 1.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, color: INK2, lineSpacing: 18,
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 4.8, w: 7.6, h: 1.5, rectRadius: 0.09, fill: { color: GOLDSOFT }, line: { color: GOLDDK, width: 1 },
  });
  s.addText("A causa é quase sempre uma só:", {
    x: M + 0.35, y: 4.98, w: 6.9, h: 0.35, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, color: INK2,
  });
  s.addText("não se ofereceu a visita.", {
    x: M + 0.35, y: 5.32, w: 6.9, h: 0.6, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 26, bold: true, color: INK,
  });
  card(s, { x: 8.7, y: 1.85, w: 3.9, h: 4.45, fill: NAVY, line: NAVY });
  s.addText("O QUE ISSO VALE", {
    x: 9.0, y: 2.15, w: 3.3, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 1.5, color: GOLD,
  });
  s.addText("13×", {
    x: 9.0, y: 2.55, w: 3.3, h: 1.35, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 72, bold: true, color: WHITE,
  });
  s.addText("Levar só essa passagem à meta multiplica por treze a conversão da casa inteira.", {
    x: 9.0, y: 4.0, w: 3.3, h: 1.1, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: "CFDCEC", lineSpacing: 19,
  });
  s.addText("Sem mais um lead.\nSem mais um real de mídia.", {
    x: 9.0, y: 5.25, w: 3.3, h: 0.8, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, color: GOLD, lineSpacing: 18,
  });
  note(s, "Este é o slide central do deck. Se o time sair lembrando de um número, que seja 13x.");
}

/* ============ 6 · A FRASE ============ */
{
  const s = p.addSlide(); dark(s);
  eyebrow(s, "A frase que resolve", GOLD);
  s.addText("“Separei duas opções que\ncabem na sua renda.\nVocê prefere conhecer\nsábado de manhã ou\nsábado à tarde?”", {
    x: M, y: 1.35, w: 8.6, h: 4.0, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 34, bold: true, color: WHITE, lineSpacing: 47,
  });
  s.addShape(p.ShapeType.roundRect, {
    x: 9.6, y: 2.1, w: 3.0, h: 3.05, rectRadius: 0.09,
    fill: { color: "1B3760" }, line: { color: GOLD, width: 1.25 },
  });
  s.addText("Duas opções\nde horário.", {
    x: 9.85, y: 2.38, w: 2.5, h: 0.9, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 19, bold: true, color: GOLD, lineSpacing: 25,
  });
  s.addText("Nunca “quer visitar?”.\n\nPergunta aberta devolve\n“vou pensar”. Duas opções\ndevolvem um dia.", {
    x: 9.85, y: 3.32, w: 2.5, h: 1.75, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12.5, color: "CFDCEC", lineSpacing: 17,
  });
  s.addText("Em toda conversa ativa. Sem exceção.", {
    x: M, y: 5.6, w: 8.6, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 16, bold: true, color: GOLD,
  });
  note(s, "Faça o time repetir em voz alta. Role-play de 5 minutos aqui vale mais que o resto do slide.");
}

/* ============ 7 · de onde vem a venda ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "Safra de 6 meses · 32.552 leads, 82 vendas");
  title(s, "De onde a venda realmente vem");
  const origens = [
    ["3", "Indicação e\ncarteira própria", GRN, GRNSOFT],
    ["6", "Lead que VOCÊ\nmesmo capta", GRN, GRNSOFT],
    ["413", "Facebook", INK2, WHITE],
    ["6.550", "Base importada", RED, REDSOFT],
  ];
  origens.forEach((o, i) => {
    const x = M + i * 3.02;
    card(s, { x, y: 2.1, w: 2.75, h: 2.55, fill: o[3], line: o[2] === INK2 ? LINE : o[2] });
    s.addText(o[0], {
      x: x + 0.25, y: 2.4, w: 2.25, h: 1.0, isTextBox: true, margin: 0,
      fontFace: H, fontSize: o[0].length > 3 ? 38 : 50, bold: true, color: o[2],
    });
    s.addText("leads por venda", {
      x: x + 0.25, y: 3.4, w: 2.25, h: 0.32, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: INK3,
    });
    s.addText(o[1], {
      x: x + 0.25, y: 3.8, w: 2.25, h: 0.7, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, bold: true, color: INK, lineSpacing: 18,
    });
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 5.05, w: CW, h: 1.35, rectRadius: 0.09, fill: { color: NAVY }, line: { color: NAVY },
  });
  s.addText([
    { text: "1% dos leads gera 83% das vendas.  ", options: { bold: true, color: GOLD, fontSize: 18 } },
    { text: "É a mesma casa, o mesmo produto e o mesmo CRM. Muda só a origem.", options: { color: "CFDCEC", fontSize: 15 } },
  ], {
    x: M + 0.4, y: 5.05, w: CW - 0.8, h: 1.35, isTextBox: true, margin: 0,
    fontFace: B, valign: "middle",
  });
  note(s, "Aqui a sala costuma ficar em silêncio. Deixe ficar. 6 contra 6.550 é a diferença entre um mês bom e um mês perdido.");
}

/* ============ 8 · SEÇÃO: 2 por dia ============ */
{
  const s = p.addSlide(); dark(s);
  eyebrow(s, "Portanto", GOLD);
  s.addText("Capte 2 clientes\npor dia útil.", {
    x: M, y: 1.5, w: 7.8, h: 2.0, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 46, bold: true, color: WHITE, lineSpacing: 56,
  });
  s.addText("Indicação de cliente. Ex-cliente. Porta. Parceria. Sua rede.\nDois por dia = seis por semana = uma venda por semana.", {
    x: M, y: 3.7, w: 7.8, h: 1.0, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 17, color: "CFDCEC", lineSpacing: 26,
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 5.0, w: 7.8, h: 1.1, rectRadius: 0.09, fill: { color: "1B3760" }, line: { color: "2C4C79", width: 1 },
  });
  s.addText("Trabalhar a base continua valendo — mas não é o que decide sua semana.", {
    x: M + 0.35, y: 5.0, w: 7.1, h: 1.1, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: "AFC0D6", valign: "middle",
  });
  ["2", "por", "dia"].forEach((t, i) => {
    s.addShape(p.ShapeType.ellipse, { x: 9.5, y: 1.7 + i * 1.5, w: 1.25, h: 1.25, fill: { color: i === 0 ? GOLD : "1B3760" }, line: { color: GOLD, width: 1.25 } });
    s.addText(t, {
      x: 9.5, y: 1.7 + i * 1.5, w: 1.25, h: 1.25, isTextBox: true, margin: 0,
      fontFace: H, fontSize: i === 0 ? 40 : 17, bold: true,
      color: i === 0 ? DEEP : GOLD, align: "center", valign: "middle",
    });
  });
  note(s, "A meta de atividade é captação, não toque. A venda é consequência.");
}

/* ============ 9 · o CRM mudou de papel ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "Como o sistema funciona agora");
  title(s, "Você não escolhe o cliente. A fila escolhe.");
  s.addText("Num CRM comum você abre uma lista e decide quem chamar. Aqui o sistema decide — e decide melhor, porque sabe quantos dias cada cliente está parado, em que etapa está, quanto dinheiro está em jogo e quem prometeu voltar quando.", {
    x: M, y: 1.95, w: 7.3, h: 1.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15.5, color: INK2, lineSpacing: 24,
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 3.6, w: 7.3, h: 1.35, rectRadius: 0.09, fill: { color: GOLDSOFT }, line: { color: GOLDDK, width: 1 },
  });
  s.addText("Seu trabalho não é escolher.\nÉ executar e registrar.", {
    x: M + 0.35, y: 3.6, w: 6.6, h: 1.35, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 22, bold: true, color: INK, valign: "middle", lineSpacing: 30,
  });
  s.addText("A memória perde clientes. A fila não.", {
    x: M, y: 5.15, w: 7.3, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, italic: true, color: INK3,
  });
  card(s, { x: 8.45, y: 1.95, w: 4.15, h: 4.3, fill: WHITE });
  s.addText("O CICLO", {
    x: 8.8, y: 2.2, w: 3.45, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 1.5, color: INK3,
  });
  ["O CRM identifica a prioridade", "Você executa", "O CRM registra", "O CRM cria a próxima ação", "Você executa de novo"].forEach((t, i) => {
    const y = 2.62 + i * 0.7;
    medal(s, i + 1, 8.8, y, 0.38);
    s.addText(t, {
      x: 9.3, y, w: 2.95, h: 0.38, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, bold: i === 1 || i === 4, color: i === 1 || i === 4 ? INK : INK2, valign: "middle",
    });
  });
  note(s, "O corretor que abre a Base de leads para 'procurar alguém' desligou o motor de priorização.");
}

/* ============ 10 · a ordem da fila ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "A Fila Única · de cima para baixo, sem escolher");
  title(s, "A ordem em que o dinheiro está em risco");
  const baldes = [
    ["Fundo do funil parado", "agendado, visita e análise — é onde o dinheiro está", true],
    ["Chegaram agora", "o SLA de 15 minutos está correndo", true],
    ["Cliente respondeu e espera", "ele falou por último", false],
    ["Follow-up vencido ou de hoje", "você combinou de voltar", false],
    ["Sem próximo passo", "precisa terminar o dia em zero", false],
    ["Esfriando", "quente ou morno sem contato há 3+ dias", false],
    ["Pasta travada", "documento pendente segurando a análise", false],
  ];
  baldes.forEach((bd, i) => {
    const y = 1.95 + i * 0.66;
    medal(s, i + 1, M, y, 0.44);
    s.addText(bd[0], {
      x: M + 0.62, y, w: 4.5, h: 0.44, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14.5, bold: true, color: bd[2] ? NAVY : INK, valign: "middle",
    });
    s.addText(bd[1], {
      x: M + 5.2, y, w: 7.0, h: 0.44, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, color: INK2, valign: "middle",
    });
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 6.62, w: CW, h: 0.62, rectRadius: 0.08, fill: { color: GOLDSOFT }, line: { color: GOLDDK, width: 1 },
  });
  s.addText("Um cliente em análise de crédito parado há 66 dias vale mais que 200 leads frios novos.", {
    x: M + 0.3, y: 6.62, w: CW - 0.6, h: 0.62, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, color: INK, valign: "middle",
  });
  note(s, "Exceção única: lead novo com SLA correndo interrompe qualquer coisa. O relógio dele é irreversível.");
}

/* ============ 11 · as três portas ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "A regra que sustenta tudo");
  title(s, "As três portas");
  s.addText("Você só sai da ficha de um cliente por uma destas três portas:", {
    x: M, y: 1.9, w: CW, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 16, color: INK2,
  });
  const portas = [
    ["a", "Desfecho registrado", "com próximo passo E data"],
    ["b", "Agendamento criado", "mudar o status não é agendar"],
    ["c", "Perdido, com motivo", "uma das onze categorias"],
  ];
  portas.forEach((pt, i) => {
    const x = M + i * 4.02;
    card(s, { x, y: 2.5, w: 3.72, h: 2.1 });
    s.addShape(p.ShapeType.ellipse, { x: x + 0.3, y: 2.78, w: 0.55, h: 0.55, fill: { color: GOLD } });
    s.addText(pt[0], {
      x: x + 0.3, y: 2.78, w: 0.55, h: 0.55, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 20, bold: true, color: DEEP, align: "center", valign: "middle",
    });
    s.addText(pt[1], {
      x: x + 0.3, y: 3.5, w: 3.1, h: 0.42, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 17, bold: true, color: INK,
    });
    s.addText(pt[2], {
      x: x + 0.3, y: 3.95, w: 3.1, h: 0.5, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, color: INK2,
    });
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 5.0, w: CW, h: 1.3, rectRadius: 0.09, fill: { color: REDSOFT }, line: { color: RED, width: 1.25 },
  });
  s.addText("Não existe a porta (d) “fechei a tela”.", {
    x: M + 0.4, y: 5.0, w: CW - 0.8, h: 1.3, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 26, bold: true, color: RED, valign: "middle",
  });
  note(s, "Se o time levar só uma regra deste deck, é esta.");
}

/* ============ 12 · o botão Registrar ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "O gesto central");
  title(s, "O botão Registrar");
  s.addText("Em cada card da fila. Abre “o que aconteceu?” com 3 a 5 respostas prontas, adequadas àquela situação. Você escolhe uma. Pronto.", {
    x: M, y: 1.9, w: 6.0, h: 1.0, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15.5, color: INK2, lineSpacing: 24,
  });
  card(s, { x: M, y: 3.0, w: 6.0, h: 2.45, fill: WHITE });
  s.addText("O QUE ELE GRAVA, DE UMA VEZ", {
    x: M + 0.35, y: 3.22, w: 5.3, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 1.5, color: INK3,
  });
  ["a conversa no histórico", "a objeção que o cliente levantou", "a próxima tarefa, com data", "a mudança de etapa, quando cabe"].forEach((t, i) => {
    s.addText("✓  " + t, {
      x: M + 0.35, y: 3.62 + i * 0.44, w: 5.3, h: 0.4, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, color: INK, valign: "middle",
    });
  });
  s.addText("Leva 4 segundos e tem desfazer de 5.", {
    x: M, y: 5.62, w: 6.0, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, italic: true, color: INK3,
  });
  card(s, { x: 7.1, y: 1.9, w: 5.5, h: 3.55, fill: NAVY, line: NAVY });
  s.addText("POR QUE ELE DECIDE TUDO", {
    x: 7.45, y: 2.15, w: 4.8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 1.5, color: GOLD,
  });
  s.addText("Sem o registro, o CRM fica cego:", {
    x: 7.45, y: 2.52, w: 4.8, h: 0.35, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, bold: true, color: WHITE,
  });
  ["o cliente volta amanhã na sua fila, igual", "a régua repete o mesmo toque", "você aparece como “sem próximo passo”", "sua meta fica sem base de cálculo"].forEach((t, i) => {
    s.addText("—  " + t, {
      x: 7.45, y: 2.95 + i * 0.5, w: 4.8, h: 0.45, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, color: "CFDCEC", valign: "middle",
    });
  });
  s.addText("20 desfechos por dia. É o único número que realmente precisa entrar na sua cabeça.", {
    x: 7.1, y: 5.62, w: 5.5, h: 0.75, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, bold: true, color: NAVY, lineSpacing: 20,
  });
  note(s, "Peça para abrirem o celular e registrarem um desfecho agora, na sala.");
}

/* ============ 13 · o dia ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "Sua rotina");
  title(s, "O dia em quatro blocos");
  const dia = [
    ["08:50", "Abrir", "Presença → metas do dia → ler o placar da fila"],
    ["09:00", "O dinheiro na mesa", "Fundo parado → chegaram agora → cliente respondeu"],
    ["10:30", "A régua", "Follow-up vencido ou de hoje → sem próximo passo"],
    ["13:30", "Agendar", "Esfriando → pasta travada → oferecer visita em toda conversa"],
    ["15:30", "Anti-ociosidade", "Reserva → Modo Foco → Discador → Bolsão"],
    ["17:30", "Fechar", "Os dois zeros, e a agenda de amanhã organizada"],
  ];
  dia.forEach((d, i) => {
    const y = 1.95 + i * 0.73;
    s.addText(d[0], {
      x: M, y, w: 1.0, h: 0.55, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 17, bold: true, color: GOLDDK, valign: "middle",
    });
    s.addText(d[1], {
      x: M + 1.1, y, w: 3.0, h: 0.55, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, bold: true, color: INK, valign: "middle",
    });
    s.addText(d[2], {
      x: M + 4.2, y, w: 8.0, h: 0.55, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, color: INK2, valign: "middle",
    });
  });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 6.45, w: CW, h: 0.65, rectRadius: 0.08, fill: { color: REDSOFT }, line: { color: RED, width: 1 },
  });
  s.addText("A única interrupção permitida: lead novo com SLA correndo. São 15 minutos úteis.", {
    x: M + 0.3, y: 6.45, w: CW - 0.6, h: 0.65, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, color: INK, valign: "middle",
  });
  note(s, "Dois estouros de SLA no mesmo dia pausam o corretor no lead quente até o dia seguinte.");
}

/* ============ 14 · as 5 telas ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "O CRM tem dezenas de telas · você vai viver em cinco");
  title(s, "As cinco que importam");
  const telas = [
    ["Fila Única", "“o que eu faço agora?”", "é a sua casa, o dia inteiro"],
    ["Follow-Up", "“quem combinei de retomar?”", "a régua dos 13 toques"],
    ["Agenda", "“quais visitas eu tenho?”", "de manhã e ao fechar o dia"],
    ["Ficha do cliente", "“quem é essa pessoa?”", "antes de ligar"],
    ["Projetos em Foco", "“o que eu vendo?”", "primeira semana, e a cada produto novo"],
  ];
  telas.forEach((t, i) => {
    const y = 2.0 + i * 0.92;
    card(s, { x: M, y, w: CW, h: 0.8 });
    medal(s, i + 1, M + 0.28, y + 0.17, 0.46);
    s.addText(t[0], {
      x: M + 0.95, y, w: 3.0, h: 0.8, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 17, bold: true, color: NAVY, valign: "middle",
    });
    s.addText(t[1], {
      x: M + 4.0, y, w: 4.0, h: 0.8, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, italic: true, color: INK, valign: "middle",
    });
    s.addText(t[2], {
      x: M + 8.1, y, w: 3.6, h: 0.8, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, color: INK3, valign: "middle",
    });
  });
  s.addText("As outras existem e são úteis — Reserva, Bolsão, Discador, Modo Visita. Você chega nelas quando a fila do dia acabar. Nunca antes.", {
    x: M, y: 6.62, w: CW, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, italic: true, color: INK3,
  });
  note(s, "Tire a ansiedade de cima deles: ninguém precisa dominar 60 telas.");
}

/* ============ 15 · o placar ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "Como você sabe se o dia foi bom");
  title(s, "Seu placar mínimo");
  const hoje = [["20", "desfechos registrados"], ["25", "clientes tocados"], ["2", "clientes captados"], ["1,4", "agendamento criado"]];
  hoje.forEach((h, i) => {
    const x = M + i * 3.02;
    card(s, { x, y: 2.1, w: 2.75, h: 1.75 });
    s.addText(h[0], {
      x: x + 0.25, y: 2.3, w: 2.25, h: 0.8, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 40, bold: true, color: NAVY,
    });
    s.addText(h[1], {
      x: x + 0.25, y: 3.12, w: 2.25, h: 0.6, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, bold: true, color: INK2,
    });
  });
  card(s, { x: M, y: 4.1, w: 5.85, h: 1.55, fill: GRNSOFT, line: GRN });
  s.addText("NA SEMANA", {
    x: M + 0.35, y: 4.3, w: 5.15, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 1.5, color: GRN,
  });
  s.addText("6 captações  ·  7 agendamentos  ·  1 venda", {
    x: M + 0.35, y: 4.68, w: 5.15, h: 0.75, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 19, bold: true, color: INK, valign: "middle",
  });
  card(s, { x: 6.85, y: 4.1, w: 5.75, h: 1.55, fill: REDSOFT, line: RED });
  s.addText("AO FIM DO DIA, SEMPRE ZERO", {
    x: 7.2, y: 4.3, w: 5.05, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 1.5, color: RED,
  });
  s.addText("follow-ups vencidos  ·  clientes sem próximo passo", {
    x: 7.2, y: 4.68, w: 5.05, h: 0.75, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14.5, bold: true, color: INK, valign: "middle",
  });
  s.addText("O CRM calcula sua meta pela SUA conversão — não por um número que alguém inventou. Nos primeiros dias usa a do time, até você ter histórico.", {
    x: M, y: 5.95, w: CW, h: 0.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13.5, color: INK2,
  });
  note(s, "Checkpoints automáticos às 12h, 15h e 17h avisam se o ritmo está abaixo.");
}

/* ============ 16 · nunca / sempre ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "Para não perder cliente");
  title(s, "Cinco nunca, três sempre");
  card(s, { x: M, y: 2.0, w: 6.35, h: 4.15, fill: WHITE, line: RED });
  s.addText("NUNCA", {
    x: M + 0.4, y: 2.25, w: 5.5, h: 0.4, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 21, bold: true, color: RED,
  });
  ["Feche a ficha sem registrar o desfecho", "Mova para “Agendado” sem criar o agendamento", "Deixe um cliente sem próximo passo com data", "Trabalhe lead frio novo antes do fundo do funil", "Deixe cliente morto na carteira — perdido tem motivo"]
    .forEach((t, i) => {
      s.addText("✕   " + t, {
        x: M + 0.4, y: 2.8 + i * 0.63, w: 5.55, h: 0.58, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 13.5, color: INK, valign: "middle",
      });
    });
  card(s, { x: 7.3, y: 2.0, w: 5.3, h: 4.15, fill: WHITE, line: GRN });
  s.addText("SEMPRE", {
    x: 7.7, y: 2.25, w: 4.5, h: 0.4, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 21, bold: true, color: GRN,
  });
  ["Ofereça visita com duas opções de horário", "Confirme a visita em D-2, D-1 e no dia", "Preencha renda, FGTS e faixa MCMV na 1ª conversa"]
    .forEach((t, i) => {
      s.addText("✓   " + t, {
        x: 7.7, y: 2.85 + i * 0.85, w: 4.55, h: 0.8, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 13.5, color: INK, valign: "middle",
      });
    });
  s.addText("O comparecimento da casa é de 80% — acima da meta de 65%. Esse protocolo funciona: mantenha.", {
    x: 7.7, y: 5.45, w: 4.55, h: 0.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, italic: true, color: INK3,
  });
  note(s, "Os cinco nunca são todos consequência de um só: não registrar.");
}

/* ============ 17 · os dois zeros ============ */
{
  const s = p.addSlide(); dark(s);
  eyebrow(s, "O teste de 30 segundos para ir embora", GOLD);
  s.addText("Abra a fila e olhe o placar.", {
    x: M, y: 1.25, w: CW, h: 0.55, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 19, color: "CFDCEC",
  });
  [["0", "follow-ups vencidos"], ["0", "clientes sem próximo passo"]].forEach((z, i) => {
    const x = M + i * 6.3;
    s.addShape(p.ShapeType.roundRect, {
      x, y: 2.15, w: 5.6, h: 2.85, rectRadius: 0.12,
      fill: { color: "1B3760" }, line: { color: GOLD, width: 1.5 },
    });
    s.addText(z[0], {
      x, y: 2.4, w: 5.6, h: 1.6, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 86, bold: true, color: GOLD, align: "center",
    });
    s.addText(z[1], {
      x, y: 4.1, w: 5.6, h: 0.6, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 17, bold: true, color: WHITE, align: "center",
    });
  });
  s.addText("Os dois zeros? Pode ir. Se não, ainda tem dinheiro na mesa.", {
    x: M, y: 5.5, w: CW, h: 0.7, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 26, bold: true, color: WHITE, align: "center",
  });
  note(s, "Simples de cobrar e simples de cumprir. É o ritual de fechamento do dia.");
}

/* ============ 18 · o contrato ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "Um acordo de mão dupla");
  title(s, "O que cada lado se compromete a fazer");
  card(s, { x: M, y: 2.0, w: 5.85, h: 4.1, fill: WHITE });
  s.addText("VOCÊ", {
    x: M + 0.4, y: 2.25, w: 5.0, h: 0.4, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 21, bold: true, color: NAVY,
  });
  ["Presença e metas antes das 9h", "Trabalha a fila de cima para baixo", "Sai da ficha só pelas três portas", "Oferece visita em toda conversa", "Termina o dia com os dois zeros"]
    .forEach((t, i) => {
      s.addText(t, {
        x: M + 0.4, y: 2.8 + i * 0.62, w: 5.05, h: 0.58, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 13.5, color: INK, valign: "middle", bullet: true,
      });
    });
  card(s, { x: 6.85, y: 2.0, w: 5.75, h: 4.1, fill: NAVY, line: NAVY });
  s.addText("A CASA", {
    x: 7.25, y: 2.25, w: 5.0, h: 0.4, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 21, bold: true, color: GOLD,
  });
  ["O CRM diz quem chamar — fila errada é problema nosso", "Lead com dono em 1 hora útil", "A régua calcula o follow-up por você", "Sua meta sai da sua conversão, não de um chute", "Feedback no mesmo dia, não na sexta"]
    .forEach((t, i) => {
      s.addText(t, {
        x: 7.25, y: 2.8 + i * 0.62, w: 5.0, h: 0.58, isTextBox: true, margin: 0,
        fontFace: B, fontSize: 13, color: "CFDCEC", valign: "middle", bullet: true,
      });
    });
  s.addShape(p.ShapeType.roundRect, {
    x: M, y: 6.35, w: CW, h: 0.72, rectRadius: 0.08, fill: { color: GOLDSOFT }, line: { color: GOLDDK, width: 1 },
  });
  s.addText("Nenhum corretor é cobrado por um número que o CRM não mostra para ele mesmo, na própria tela, no mesmo dia.", {
    x: M + 0.35, y: 6.35, w: CW - 0.7, h: 0.72, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13.5, bold: true, color: INK, valign: "middle",
  });
  note(s, "Esta última linha é o que faz o time aceitar o resto. Leia em voz alta.");
}

/* ============ 19 · a meta com prazo ============ */
{
  const s = p.addSlide(); light(s);
  eyebrow(s, "Honestidade sobre o prazo");
  title(s, "1 venda por semana é o destino, não a largada");
  card(s, { x: M, y: 1.95, w: CW, h: 1.05, fill: REDSOFT, line: RED });
  s.addText("Hoje o melhor corretor da casa faz 0,40 venda por semana. Ninguém aqui chega a 1 ainda — e prometer isso para semana que vem seria mentira.", {
    x: M + 0.35, y: 1.95, w: CW - 0.7, h: 1.05, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14.5, color: INK, valign: "middle",
  });
  const fases = [
    ["Mês 1 e 2", "6 captações/semana\n+ 1 venda no mês", GOLDSOFT, GOLDDK],
    ["Mês 3 e 4", "1 venda a cada\n2 semanas", GOLDSOFT, GOLDDK],
    ["Mês 6 em diante", "1 venda\npor semana", GRNSOFT, GRN],
  ];
  fases.forEach((f, i) => {
    const x = M + i * 4.02;
    card(s, { x, y: 3.25, w: 3.72, h: 2.15, fill: f[2], line: f[3] });
    s.addText(f[0], {
      x: x + 0.3, y: 3.5, w: 3.1, h: 0.4, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13, bold: true, charSpacing: 1, color: f[3],
    });
    s.addText(f[1], {
      x: x + 0.3, y: 3.95, w: 3.1, h: 1.2, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 21, bold: true, color: INK, lineSpacing: 28,
    });
  });
  s.addText("A meta de atividade é a captação. A venda é consequência — e a consequência chega, se a atividade não falhar.", {
    x: M, y: 5.65, w: CW, h: 0.6, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, bold: true, color: INK2,
  });
  note(s, "Meta inatingível destrói adesão. Prazo honesto constrói.");
}

/* ============ 20 · fechamento ============ */
{
  const s = p.addSlide(); dark(s);
  eyebrow(s, "O combinado", GOLD);
  s.addText("Siga exatamente o que\no CRM mandar você fazer.", {
    x: M, y: 1.5, w: 11.0, h: 1.7, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 40, bold: true, color: WHITE, lineSpacing: 50,
  });
  s.addText("Cumpra os indicadores mínimos todo dia. Execute os follow-ups.\nE 1 venda por semana deixa de ser meta e vira consequência.", {
    x: M, y: 3.45, w: 11.0, h: 1.1, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 18, color: "CFDCEC", lineSpacing: 30,
  });
  const q = [["2", "captações por dia"], ["20", "desfechos por dia"], ["0", "vencidos no fim do dia"]];
  q.forEach((it, i) => {
    const x = M + i * 4.02;
    s.addShape(p.ShapeType.roundRect, {
      x, y: 4.85, w: 3.72, h: 1.35, rectRadius: 0.1,
      fill: { color: "1B3760" }, line: { color: "2C4C79", width: 1 },
    });
    s.addText(it[0], {
      x: x + 0.35, y: 4.95, w: 1.15, h: 1.15, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 38, bold: true, color: GOLD, valign: "middle",
    });
    s.addText(it[1], {
      x: x + 1.5, y: 4.95, w: 2.0, h: 1.15, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, bold: true, color: WHITE, valign: "middle",
    });
  });
  s.addText("Seu Metro Quadrado  ·  Método do Corretor  ·  Setembro de 2026", {
    x: M, y: 6.6, w: CW, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, color: "7E93AE",
  });
  note(s, "Feche pedindo o compromisso em voz alta, um a um. Compromisso dito na frente dos colegas adere.");
}

p.writeFile({ fileName: "Manual-CRM-SMQ.pptx" }).then(f => console.log("gerado:", f));
