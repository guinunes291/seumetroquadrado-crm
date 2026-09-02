// Workflow n8n (Workflow SDK) que coleta as logos das construtoras para a prateleira.
// Uso: colar em create_workflow_from_code (MCP do n8n) ou importar pelo SDK; rodar manualmente;
// ler a saída do nó "Juntar" (base64 por candidato) e do nó "Candidatos" (diagnóstico).
// Detalhes e o porquê de cada nó em docs/revisao-projetos-foco.md §11.
import { workflow, node, trigger, ifElse, expr } from "@n8n/workflow-sdk";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const start = trigger({
  type: "n8n-nodes-base.manualTrigger",
  version: 1,
  config: { name: "Start" },
});

const alvos = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Alvos",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "// Um item por página. Pode ser domínio ('https://x.com.br/'), página de RI/Wikipedia\n// ou URL direta de imagem/bundle .js — o nó Candidatos trata cada caso.\nconst alvos = [\n  ['vivaz', 'https://www.meuvivaz.com.br/static/js/main.af2c4be5.js'], ['cyrela', 'https://cyrela.com.br/'],\n  ['cury', 'https://ri.cury.net/'], ['trisul', 'https://ri.trisul-sa.com.br/'], ['direcional', 'https://ri.direcional.com.br/'],\n  ['conx', 'https://conx.com.br/'], ['plano-e-plano', 'https://planoeplano.com.br/'], ['mbigucci', 'https://mbigucci.com.br/'],\n  ['vibra', 'https://vibraresidencial.com.br/'], ['one-innovation', 'https://oneinnovation.com.br/'], ['mundo-apto', 'https://mundoapto.com.br/'],\n  ['lavvi', 'https://www.lavvi.com.br/'], ['tenda', 'https://ri.tenda.com/'], ['patriani', 'https://www.construtorapatriani.com.br/'],\n  ['vitta', 'https://vittaresidencial.com.br/'], ['bild', 'https://bild.com.br/'], ['vinx', 'https://vinx.com.br/'],\n  ['emccamp', 'https://emccamp.com.br/'], ['maskan', 'https://maskan.com.br/'], ['migras', 'https://migras.com.br/'],\n  ['magik-jc', 'https://magikjc.com.br/'], ['longitude', 'https://longitude.com.br/'], ['kazzas', 'https://kazzas.com.br/'],\n];\nreturn alvos.map(([slug, url]) => ({ json: { slug, dominio: url.replace(/^https?:\\/\\//, '').split('/')[0], url } }));\n",
    },
  },
});

const baixarHtml = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Baixar HTML",
    onError: "continueRegularOutput",
    parameters: {
      method: "GET",
      url: expr("{{ $json.url }}"),
      sendHeaders: true,
      specifyHeaders: "keypair",
      headerParameters: {
        parameters: [
          { name: "User-Agent", value: UA },
          { name: "Accept", value: "text/html,application/xhtml+xml,*/*;q=0.8" },
          { name: "Accept-Language", value: "pt-BR,pt;q=0.9,en;q=0.5" },
        ],
      },
      options: {
        timeout: 20000,
        allowUnauthorizedCerts: true,
        redirect: { redirect: { followRedirects: true, maxRedirects: 10 } },
        response: {
          response: { responseFormat: "text", outputPropertyName: "data", neverError: true },
        },
        batching: { batch: { batchSize: 5, batchInterval: 300 } },
      },
    },
  },
});

const candidatos = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Candidatos",
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const paginas = $('Alvos').all();\nconst respostas = $input.all();\nfunction limpar(s) { return (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\").trim(); }\nfunction attrs(tag) {\n  const out = {};\n  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))/g;\n  let m;\n  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = limpar(m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5]);\n  return out;\n}\nfunction resolver(base, src) {\n  src = (src || '').trim().replace(/^['\"]|['\"]$/g, '');\n  if (!src) return null;\n  if (/^https?:\\/\\//i.test(src)) return src;\n  const mb = base.match(/^(https?:)\\/\\/([^\\/?#]+)(\\/[^?#]*)?/i);\n  if (!mb) return null;\n  const proto = mb[1], host = mb[2];\n  let path = mb[3] || '/';\n  if (src.startsWith('//')) return proto + src;\n  if (src.startsWith('/')) return proto + '//' + host + src;\n  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null;\n  path = path.replace(/[^\\/]*$/, '');\n  const partes = (path + src).split('/');\n  const out = [];\n  for (const p of partes) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }\n  return proto + '//' + host + out.join('/');\n}\nfunction melhorSrc(a) {\n  let src = a.src || a['data-src'] || a['data-lazy-src'] || a['data-original'] || '';\n  if ((!src || src.startsWith('data:image/gif')) && (a.srcset || a['data-srcset'])) {\n    const partes = (a.srcset || a['data-srcset']).split(',').map(p => p.trim().split(/\\s+/)).filter(p => p[0]);\n    partes.sort((x, y) => (parseInt(y[1]) || 0) - (parseInt(x[1]) || 0));\n    if (partes.length) src = partes[0][0];\n  }\n  return src;\n}\nfunction desembrulharNext(u) {\n  const m = u.match(/\\/_next\\/image\\?(?:.*&)?url=([^&]+)/);\n  return m ? decodeURIComponent(m[1]) : u;\n}\nconst NEG = /icon|favicon|whats|facebook|instagram|linkedin|youtube|tiktok|selo|seal|award|premio|badge|banner|hero|slide|foto|photo|apple|google|play|loading|spinner|arrow|seta|search|busca|menu|hamburger|close|fechar|flag|bandeira|avatar|user|cookie|pixel|blank|placeholder|1x1|reclame|ssl|secure|certific|parceir|partner|abrainc|secovi|pbqp|iso/i;\nfunction pontuar(a, contexto, posRel) {\n  const t = ((a.src || '') + ' ' + (a.alt || '') + ' ' + (a.class || '') + ' ' + (a.id || '') + ' ' + (a.title || '')).toLowerCase();\n  const c = contexto.toLowerCase();\n  let p = 0;\n  if (/logo|marca|brand/.test(t)) p += 6;\n  if (/logo|marca|brand/.test(c)) p += 3;\n  if (/\\.svg(\\?|$)/i.test(a.src || '')) p += 2;\n  else if (/\\.(png|webp)(\\?|$)/i.test(a.src || '')) p += 1;\n  if (NEG.test(t)) p -= 5;\n  if (/footer|rodape|rodapé/.test(t) || /footer|rodape/.test(c)) p -= 1;\n  if (posRel < 0.35) p += 1.5;\n  if (/white|branc|negativ|light|-w\\./.test(t)) p -= 1;\n  return p;\n}\nconst saida = [];\nfor (let i = 0; i < respostas.length; i++) {\n  const alvo = paginas[i] ? paginas[i].json : { slug: 'desconhecido-' + i, dominio: '', url: '' };\n  const j = respostas[i].json || {};\n  let html = typeof j.data === 'string' ? j.data : typeof j.body === 'string' ? j.body : '';\n  if (!html && j.body && typeof j.body === 'object' && typeof j.body.data === 'string') html = j.body.data;\n  if (!html) {\n    saida.push({ json: { slug: alvo.slug, dominio: alvo.dominio, kind: 'erro', motivo: j.error ? JSON.stringify(j.error).slice(0, 300) : 'sem html' } });\n    continue;\n  }\n  const base = alvo.url;\n  const cands = [];\n  if (/\\.(png|jpe?g|webp|svg|gif)(\\?|$)/i.test(base)) {\n    saida.push({ json: { slug: alvo.slug, dominio: alvo.dominio, pagina: base, kind: 'img', url: base, pontos: 20, motivo: 'url direta' } });\n    continue;\n  }\n  if (/\\.js(\\?|$)/i.test(base)) {\n    // SPA sem <img>: o bundle referencia os assets (Vivaz: /Files/.../brand1.svg).\n    const origem = base.replace(/^(https?:\\/\\/[^\\/]+).*$/, '$1') + '/';\n    const achados = new Set();\n    let mm;\n    const reMedia = /[\"'`]([^\"'`\\s]*(?:static\\/media|assets|images|img)[^\"'`\\s]*\\.(?:svg|png|webp|jpe?g))[\"'`]/gi;\n    while ((mm = reMedia.exec(html))) achados.add(mm[1]);\n    const reLogo = /[\"'`]([^\"'`\\s]*logo[^\"'`\\s]*\\.(?:svg|png|webp|jpe?g))[\"'`]/gi;\n    while ((mm = reLogo.exec(html))) achados.add(mm[1]);\n    saida.push({ json: { slug: alvo.slug, dominio: alvo.dominio, kind: 'diag', motivo: 'js=' + html.length + ' midias=' + achados.size + ' ' + Array.from(achados).slice(0, 40).join(' , ') } });\n    const lista = Array.from(achados).map(u => ({ u, p: (/logo|marca|brand/i.test(u) ? 8 : 2) + (/\\.svg/i.test(u) ? 1 : 0) - (/icon|favicon|whats|face|insta|youtube|arrow|seta|banner|hero|foto|bg[-_.]/i.test(u) ? 5 : 0) })).sort((x, y) => y.p - x.p).slice(0, 8);\n    for (const c of lista) { const abs = resolver(origem, c.u); if (abs) saida.push({ json: { slug: alvo.slug, dominio: alvo.dominio, pagina: origem, kind: 'img', url: abs, pontos: c.p, motivo: 'bundle ' + c.u } }); }\n    continue;\n  }\n  const reImg = /<img\\b[^>]*>/gi;\n  let m;\n  while ((m = reImg.exec(html))) {\n    const a = attrs(m[0]);\n    let src = melhorSrc(a);\n    if (!src) continue;\n    const contexto = html.slice(Math.max(0, m.index - 300), m.index);\n    if (src.startsWith('data:')) {\n      if (/^data:image\\/svg\\+xml/.test(src) && src.length < 80000 && /logo|marca|brand/i.test(m[0] + contexto)) {\n        cands.push({ kind: 'data', url: src, pontos: 5, motivo: 'data-uri svg alt=' + (a.alt || '') });\n      }\n      continue;\n    }\n    src = desembrulharNext(src);\n    const abs = resolver(base, src);\n    if (!abs || !/^https?:/.test(abs)) continue;\n    const pontos = pontuar(Object.assign({}, a, { src: abs }), contexto, m.index / html.length);\n    cands.push({ kind: 'img', url: abs, pontos, motivo: 'img alt=' + (a.alt || '') + ' class=' + (a.class || '') });\n  }\n  const reSvg = /<svg\\b[^>]*>[\\s\\S]*?<\\/svg>/gi;\n  let n = 0;\n  while ((m = reSvg.exec(html)) && n < 2) {\n    const contexto = html.slice(Math.max(0, m.index - 300), m.index) + m[0].slice(0, 300);\n    if (/logo|marca|brand/i.test(contexto) && m[0].length > 400 && m[0].length < 120000) {\n      cands.push({ kind: 'svg', url: '', pontos: 5 + (m.index / html.length < 0.35 ? 1.5 : 0), motivo: 'svg inline', svg: m[0] });\n      n++;\n    }\n  }\n  const og = html.match(/<meta[^>]+property=[\"']og:image[\"'][^>]*>/i);\n  if (og) {\n    const a = attrs(og[0]);\n    const abs = a.content ? resolver(base, a.content) : null;\n    if (abs) cands.push({ kind: 'img', url: abs, pontos: 0.5, motivo: 'og:image' });\n  }\n  const reLink = /<link\\b[^>]*>/gi;\n  while ((m = reLink.exec(html))) {\n    const a = attrs(m[0]);\n    const rel = (a.rel || '').toLowerCase();\n    if (!/icon/.test(rel) || !a.href) continue;\n    const abs = resolver(base, a.href);\n    if (!abs) continue;\n    const tam = parseInt((a.sizes || '').split('x')[0]) || (rel.includes('apple') ? 180 : 32);\n    if (tam >= 120) cands.push({ kind: 'img', url: abs, pontos: 1 + tam / 1000, motivo: 'icon ' + rel + ' ' + (a.sizes || '') });\n  }\n  const vistos = new Set();\n  const top = cands.filter(c => {\n    const k = c.kind + '|' + (c.url || (c.svg || '').slice(0, 200));\n    if (vistos.has(k)) return false;\n    vistos.add(k);\n    return true;\n  }).sort((x, y) => y.pontos - x.pontos).slice(0, 4);\n  if (!top.length) saida.push({ json: { slug: alvo.slug, dominio: alvo.dominio, kind: 'erro', motivo: 'nenhum candidato em ' + html.length + ' chars; imgs=' + (html.match(/<img\\b/gi) || []).length + '; trecho=' + html.replace(/\\s+/g, ' ').slice(0, 400) + '; scripts=' + (html.match(/<script[^>]+src=[\"']([^\"']+)[\"']/gi) || []).map(t => (t.match(/src=[\"']([^\"']+)/i) || [])[1]).join(' , ') } });\n  saida.push({ json: { slug: alvo.slug, dominio: alvo.dominio, kind: 'diag', motivo: 'html=' + html.length + ' imgs=' + (html.match(/<img\\b/gi) || []).length + ' cands=' + cands.length + ' titulo=' + ((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').slice(0, 80) } });\n  for (const c of top) saida.push({ json: Object.assign({ slug: alvo.slug, dominio: alvo.dominio, pagina: base }, c) });\n}\nreturn saida;\n",
    },
  },
});

const ehImagem = ifElse({
  version: 2.2,
  config: {
    name: "É imagem?",
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            leftValue: expr("{{ $json.kind }}"),
            operator: { type: "string", operation: "equals" },
            rightValue: "img",
          },
        ],
        combinator: "and",
      },
    },
  },
});

const baixarImagem = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Baixar imagem",
    onError: "continueRegularOutput",
    parameters: {
      method: "GET",
      url: expr("{{ $json.url }}"),
      sendHeaders: true,
      specifyHeaders: "keypair",
      headerParameters: {
        parameters: [
          { name: "User-Agent", value: UA },
          { name: "Accept", value: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8" },
          { name: "Referer", value: expr("{{ $json.pagina }}") },
        ],
      },
      options: {
        timeout: 20000,
        allowUnauthorizedCerts: true,
        redirect: { redirect: { followRedirects: true, maxRedirects: 10 } },
        response: {
          response: { responseFormat: "file", outputPropertyName: "data", neverError: true },
        },
        batching: { batch: { batchSize: 4, batchInterval: 300 } },
      },
    },
  },
});

const paraBase64 = node({
  type: "n8n-nodes-base.extractFromFile",
  version: 1.1,
  config: {
    name: "Para base64",
    onError: "continueRegularOutput",
    parameters: { operation: "binaryToPropery", destinationKey: "base64" },
  },
});

const juntar = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Juntar",
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "let cand = {};\ntry { cand = $('Candidatos').item.json; } catch (e) { try { cand = $('É imagem?').item.json; } catch (e2) {} }\nlet mime = null, tamanho = null;\ntry { const b = $('Baixar imagem').item.binary; if (b && b.data) { mime = b.data.mimeType || null; tamanho = b.data.fileSize || null; } } catch (e) {}\nlet base64 = typeof $json.base64 === 'string' ? $json.base64 : null;\nlet motivo = cand.motivo || '';\nif (base64 && base64.length > 900000) { motivo += ' (grande demais: ' + base64.length + ')'; base64 = null; }\nreturn { json: { slug: cand.slug, dominio: cand.dominio, url: cand.url, pontos: cand.pontos, motivo, mime, tamanho, base64 } };\n",
    },
  },
});

const semDownload = node({
  type: "n8n-nodes-base.noOp",
  version: 1,
  config: { name: "Sem download" },
});

export default workflow("logos-construtoras-smq", "Logos construtoras SMQ")
  .add(start)
  .to(alvos)
  .to(baixarHtml)
  .to(candidatos)
  .to(ehImagem.onTrue(baixarImagem.to(paraBase64).to(juntar)).onFalse(semDownload));
