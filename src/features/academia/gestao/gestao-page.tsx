// Hub de gestão da Academia (/academia/gestao). Uma linha de abas, no limite
// da regra dos 2 menus: a sidebar lista as páginas (Gestão e Conteúdo) e as
// abas vivem aqui dentro. Abre em "Agora", no que precisa de ação.

import { Link } from "@tanstack/react-router";
import { ListChecks } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { useUserRoles } from "@/hooks/use-auth";
import { AbaAgora } from "./aba-agora";
import { AbaEfeito } from "./aba-efeito";
import { AbaEncontros } from "./aba-encontros";
import { AbaParticipantes } from "./aba-participantes";
import { AbaPraticas } from "./aba-praticas";
import { AbaRecomendacoes } from "./aba-recomendacoes";
import { AbaTime } from "./aba-time";
import { ABAS_GESTAO, type AbaGestao } from "./abas";

export function GestaoPage({
  aba,
  onAbaChange,
}: {
  aba: AbaGestao | undefined;
  onAbaChange: (aba: AbaGestao) => void;
}) {
  const { isAdmin } = useUserRoles();
  const itens = [
    { value: "agora", label: "Agora" },
    { value: "praticas", label: "Práticas" },
    { value: "time", label: "Time" },
    ...(isAdmin ? [{ value: "participantes", label: "Participantes" }] : []),
    { value: "recomendacoes", label: "Recomendações" },
    { value: "efeito", label: "Efeito" },
    { value: "encontros", label: "Encontros" },
  ];
  const ativa: AbaGestao = aba && itens.some((i) => i.value === aba) ? aba : "agora";
  const mudar = (v: string) => {
    const alvo = ABAS_GESTAO.find((a) => a === v);
    if (alvo) onAbaChange(alvo);
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Gestão da Academia"
        description="Abre no que precisa de ação. Você vê só a sua equipe; ninguém age sobre si mesmo."
        actions={
          isAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/academia/conteudo">
                <ListChecks className="mr-1.5 h-4 w-4" /> Conteúdo
              </Link>
            </Button>
          ) : undefined
        }
      />
      <ResponsiveTabs
        value={ativa}
        onValueChange={mudar}
        items={itens}
        ariaLabel="Seções da gestão da Academia"
        className="space-y-4"
      >
        <ResponsiveTabsContent value="agora">
          <AbaAgora irPara={mudar} />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="praticas">
          <AbaPraticas />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="time">
          <AbaTime />
        </ResponsiveTabsContent>
        {isAdmin && (
          <ResponsiveTabsContent value="participantes">
            <AbaParticipantes />
          </ResponsiveTabsContent>
        )}
        <ResponsiveTabsContent value="recomendacoes">
          <AbaRecomendacoes />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="efeito">
          <AbaEfeito />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="encontros">
          <AbaEncontros />
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}
