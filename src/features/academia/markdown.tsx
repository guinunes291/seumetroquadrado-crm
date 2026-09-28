// Renderizador de markdown das aulas.
//
// SEM HTML cru de propósito: nada de rehype-raw. O conteudo_md vem do seed e
// um dia virá de edição pela tela; HTML cru ali seria injeção direta. Link
// externo sai com rel="noopener noreferrer" para o destino não alcançar a
// janela de origem.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: filhos }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
              {filhos}
            </a>
          ),
          table: ({ children: filhos }) => (
            <div className="overflow-x-auto">
              <table>{filhos}</table>
            </div>
          ),
          img: ({ src, alt }) => (
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              className="max-w-full rounded-md"
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
