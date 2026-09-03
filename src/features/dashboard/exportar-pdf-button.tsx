import { useState } from "react";
import { CircleNotch, FileArrowDown } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type RelatoriosPdf = typeof import("@/features/dashboard/relatorios-pdf");

/**
 * "Exportar PDF" das sub-abas de Relatórios. O módulo do documento só desce
 * no clique (import dinâmico, padrão do raio-x); `montar` recebe o módulo e
 * devolve o documento pronto a partir dos dados que a aba já carregou.
 */
export function ExportarPdfButton({
  montar,
  disabled = false,
}: {
  montar: (pdf: RelatoriosPdf) => import("@/features/dashboard/relatorios-pdf").DocumentoRelatorio;
  disabled?: boolean;
}) {
  const [gerando, setGerando] = useState(false);
  const exportar = async () => {
    setGerando(true);
    try {
      const pdf = await import("@/features/dashboard/relatorios-pdf");
      pdf.imprimirRelatorio(montar(pdf));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={exportar}
      disabled={disabled || gerando}
      title="Gera o documento na caixa de impressão — escolha “Salvar como PDF”"
    >
      {gerando ? (
        <CircleNotch className="h-4 w-4 animate-spin" />
      ) : (
        <FileArrowDown className="h-4 w-4" />
      )}
      Exportar PDF
    </Button>
  );
}
