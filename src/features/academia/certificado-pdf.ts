// PDF do certificado de nível da Academia, no visual da marca (kit
// lib/pdf-marca, 2026-10-11): uma folha A4 paisagem com moldura azul-marinho,
// logo, nome, nível em dourado, data por extenso e código de verificação.
// Mesmo mecanismo de todos os PDFs do CRM (lib/pdf-print). Carregado em lazy.

import { escHtml as esc, imprimirHtml } from "@/lib/pdf-print";
import { estilosMarca, logoMarca, MARCA } from "@/lib/pdf-marca";

export type DadosCertificado = {
  nome: string;
  nivel: string;
  /** "28 de setembro de 2026". */
  dataExtenso: string;
  /** "28/09/2026". */
  emitidoEm: string;
  codigo: string;
};

export function montarHtmlCertificado(d: DadosCertificado, opts: { origem?: string } = {}): string {
  const M = MARCA;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(`Certificado Academia SMQ ${d.nome} ${d.nivel}`)}</title>
<style>${estilosMarca({
    paisagem: true,
    margem: "10mm",
    rodape: "Academia Seu Metro Quadrado",
    origem: opts.origem,
  })}
  .folha { height: 188mm; background: ${M.navy}; border-radius: 16px; padding: 10mm; }
  .miolo {
    height: 100%; background: ${M.creme}; border: 2px solid ${M.gold}; border-radius: 10px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 0 24mm;
  }
  .sobre { font-family: Montserrat, Inter, sans-serif; font-weight: 700; font-size: 9pt; letter-spacing: 0.24em; color: ${M.goldEscuro}; }
  h1 { margin: 4px 0 0; font-weight: 800; font-size: 30pt; color: ${M.navy}; letter-spacing: -0.01em; }
  .texto { font-size: 11pt; color: ${M.medio}; }
  .nome { font-family: Montserrat, Inter, sans-serif; font-weight: 800; font-size: 24pt; color: ${M.navy}; border-bottom: 3px solid ${M.gold}; padding: 0 12px 4px; }
  .nivel { font-family: Montserrat, Inter, sans-serif; font-weight: 800; font-size: 22pt; color: ${M.goldEscuro}; }
  .data { font-size: 11pt; color: ${M.texto}; }
  .codigo { margin-top: 10px; font-size: 8.5pt; color: ${M.suave}; }
  .codigo b { font-family: ui-monospace, Menlo, Consolas, monospace; color: ${M.navy}; }
</style></head><body>
<div class="folha"><div class="miolo">
  ${logoMarca(64, { rotulo: true, cor: M.navy })}
  <span class="sobre">ACADEMIA SEU METRO QUADRADO</span>
  <h1>Certificado de nível</h1>
  <span class="texto">Certificamos que</span>
  <span class="nome">${esc(d.nome)}</span>
  <span class="texto">concluiu a trilha e alcançou o nível</span>
  <span class="nivel">${esc(d.nivel)}</span>
  <span class="data">em ${esc(d.dataExtenso)}</span>
  <span class="codigo">Código de verificação <b>${esc(d.codigo)}</b> · emitido em ${esc(d.emitidoEm)}</span>
</div></div>
</body></html>`;
}

export function imprimirCertificado(d: DadosCertificado): Promise<void> {
  return imprimirHtml(montarHtmlCertificado(d), { tituloIframe: "Certificado para impressão" });
}
