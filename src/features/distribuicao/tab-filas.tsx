// Aba "Roletas" (o valor da aba continua `filas`) — as QUATRO roletas do
// sistema (decisão do dono, 13/10/2026: "precisamos apenas dessas roletas no
// sistema"), na ordem do pedido:
//   * Campanhas Facebook Ads — cada uma com token de webhook e equipe própria;
//     a equipe recebe o lead do anúncio de qualquer zona e de qualquer filial
//     (não há mais campanha "comum" nem filial dona);
//   * Filiais — o time de cada loja: os leads das zonas dela e o rodízio do
//     lead sem zona; e o estoque, por vaga na carteira;
//   * SDR — os Agendados do SDR;
//   * Marquinhos — automática: os N com mais vendas nos últimos 30 dias.
// Plantão, Landing e Base saíram (desligadas no banco, só no histórico).
// Participantes SEMPRE pelo RPC auditado (gerenciar_participante_roleta),
// propriedades SEMPRE por atualizar_roleta. A lista das filiais vem do banco
// (roletas tipo 'zona' com filial, na ordem de filiais.ordem) — nunca de uma
// constante, para a gestão abrir loja sem deploy.

import { lazy, Suspense, useMemo, useState } from "react";
import { PlayCircle, Plus } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFiliais } from "@/features/presenca/presenca-client";
import {
  FAMILIA_ROLETA_LABEL,
  FAMILIAS_ROLETA,
  agruparFiliais,
  familiaDaRoleta,
  frasesAlternancia,
  roletaLabel,
  type FamiliaRoleta,
} from "@/lib/distribuicao";
import {
  useCriarRoletaCampanha,
  useEscoarEstoqueFiliais,
  useRoletas,
  useZonasRoletas,
  type RoletaRow,
} from "./queries";
import { FilaPropriedades } from "./fila-propriedades";
import { RoletaTab } from "./roleta-tab";

// Placar da permanência semanal (só admin, só na fila do SDR): lazy para não
// pesar no chunk principal de quem nunca abre a fila.
const PlacarRoletaSdrCard = lazy(() =>
  import("./placar-roleta-sdr").then(({ PlacarRoletaSdrCard }) => ({
    default: PlacarRoletaSdrCard,
  })),
);

const DESCRICAO_GRUPO: Record<FamiliaRoleta, string> = {
  campanha:
    "Cada campanha tem token de webhook próprio e equipe própria (ponderada por faixa A/B/C). A equipe recebe o lead do anúncio de qualquer zona e de qualquer filial; repasse por SLA e transferência ficam entre a equipe. Ninguém da equipe apto: o lead vai para a filial da zona (ou para o rodízio das filiais, se não tiver zona).",
  filial:
    "O time fixo de cada loja: recebe os leads das zonas que ela atende, de qualquer origem, e entra no rodízio do lead SEM zona (a filial há mais tempo sem receber um). Também recebe o estoque, por vaga na carteira, fora da cota do dia. Sem ninguém apto, o lead espera — o lead com zona nunca vai para outra zona.",
  sdr: "Roleta de agendados do SDR: recebe o lead que o SDR agendou ou entregou com motivo. Aptidão própria — perfil ativo, telefone, teto de carteira e agenda livre no horário da visita; sem presença do dia nem cota diária. O corretor original de um lead reaquecido tem prioridade e nem passa por aqui. Com a regra semanal ligada, o time é montado pela produção: quem faz 3 pontos na semana (visita 1, pasta 1,5) fica para a seguinte.",
  marquinhos:
    "Lead do bot de qualificação. Automática: entram os corretores com mais vendas assinadas nos últimos 30 dias (empate pelo valor vendido), apurada todo dia às 06:50. Lead com zona vai primeiro a quem dela atende a zona; sem ninguém, a filial da zona.",
};

/** As roletas de uma família que a aba mostra. Filial: ativa, ou desligada
 *  mas com filial (para religar); as zona-* antigas não. Campanhas ativas e
 *  desligadas (para religar). Plantão, Landing e Base: nunca. */
function visivel(r: RoletaRow): boolean {
  const f = familiaDaRoleta(r);
  if (!f) return false;
  if (f === "filial") return r.ativo || r.filial_id !== null;
  return true;
}

export function TabFilas({
  somenteLeitura,
  filaInicial,
  escopoEquipe = false,
}: {
  somenteLeitura: boolean;
  filaInicial?: string;
  /** Gestor: monta a equipe das filas, mas só com corretores do próprio time. */
  escopoEquipe?: boolean;
}) {
  const roletasQ = useRoletas();
  const filiaisQ = useFiliais();
  const mapaQ = useZonasRoletas();
  const escoar = useEscoarEstoqueFiliais();
  const [novaCampanhaAberta, setNovaCampanhaAberta] = useState(false);

  const grupos = useMemo(() => {
    const todas = (roletasQ.data ?? []).filter(visivel);
    const ordemFilial = new Map((filiaisQ.data ?? []).map((f) => [f.id, f.ordem]));
    const por = (fam: FamiliaRoleta) => todas.filter((r) => familiaDaRoleta(r) === fam);
    return {
      campanha: por("campanha").sort(
        (a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"),
      ),
      filial: por("filial").sort(
        (a, b) =>
          (a.filial_id ? (ordemFilial.get(a.filial_id) ?? 99) : 99) -
            (b.filial_id ? (ordemFilial.get(b.filial_id) ?? 99) : 99) ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      ),
      sdr: por("sdr"),
      marquinhos: por("marquinhos"),
    } as Record<FamiliaRoleta, RoletaRow[]>;
  }, [roletasQ.data, filiaisQ.data]);

  // "A Leste alterna entre Liberdade e Belém" — do mapa, não de texto fixo.
  const alternancia = useMemo(
    () => frasesAlternancia(agruparFiliais(mapaQ.data ?? [])).join(" "),
    [mapaQ.data],
  );

  const grupoInicial: FamiliaRoleta = useMemo(() => {
    if (!filaInicial) return "campanha";
    const alvo = (roletasQ.data ?? []).find((r) => r.slug === filaInicial);
    return (alvo && familiaDaRoleta(alvo)) || "campanha";
  }, [filaInicial, roletasQ.data]);

  const [grupo, setGrupo] = useState<FamiliaRoleta>(grupoInicial);
  const [filaPorGrupo, setFilaPorGrupo] = useState<Partial<Record<FamiliaRoleta, string>>>(
    filaInicial ? { [grupoInicial]: filaInicial } : {},
  );

  const filas = grupos[grupo];
  const slugSelecionado = filaPorGrupo[grupo] ?? filas[0]?.slug;
  const fila = filas.find((r) => r.slug === slugSelecionado) ?? filas[0];

  if (roletasQ.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={grupo} onValueChange={(v) => setGrupo(v as FamiliaRoleta)}>
          <TabsList>
            {FAMILIAS_ROLETA.map((g) => (
              <TabsTrigger key={g} value={g}>
                {FAMILIA_ROLETA_LABEL[g]}
                {(g === "campanha" || g === "filial") && (
                  <span className="ml-1.5 text-[11px] text-muted-foreground tabular-nums">
                    {grupos[g].length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {grupo === "campanha" && !somenteLeitura && (
          <Button size="sm" onClick={() => setNovaCampanhaAberta(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova campanha
          </Button>
        )}
        {grupo === "filial" && !somenteLeitura && (
          <Button
            size="sm"
            variant="outline"
            disabled={escoar.isPending}
            title="Entrega o estoque (leads sem dono) aos aptos das filiais: um lote por corretor, por vaga na carteira, fora da cota do dia. A rotina automática faz isso a cada 10 minutos."
            onClick={() => escoar.mutate(30)}
          >
            <PlayCircle className="mr-1.5 h-4 w-4" />
            {escoar.isPending ? "Escoando…" : "Escoar estoque (todas as filiais)"}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {DESCRICAO_GRUPO[grupo]}
        {grupo === "filial" && alternancia ? ` ${alternancia}` : ""}
      </p>

      {filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {grupo === "campanha" ? "Nenhuma campanha ainda." : "Nenhuma roleta neste grupo."}
        </p>
      ) : (
        <>
          {filas.length > 1 && (
            <Tabs
              value={fila?.slug}
              onValueChange={(v) => setFilaPorGrupo((s) => ({ ...s, [grupo]: v }))}
            >
              <TabsList className="h-auto flex-wrap justify-start">
                {filas.map((r) => (
                  <TabsTrigger key={r.slug} value={r.slug}>
                    {roletaLabel(r.slug, r.nome)}
                    {!r.ativo && (
                      <Badge variant="outline" className="ml-1.5 text-[10px]">
                        desligada
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {fila && (
            <>
              <FilaPropriedades roleta={fila} somenteLeitura={somenteLeitura} />
              {/* Placar de todos os corretores: leitura de admin (o banco recorta o resto). */}
              {fila.slug === "agendados-sdr" && !somenteLeitura && (
                <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                  <PlacarRoletaSdrCard />
                </Suspense>
              )}
              <RoletaTab
                slug={fila.slug}
                nome={fila.nome}
                somenteLeitura={somenteLeitura && !escopoEquipe}
                escopoEquipe={escopoEquipe}
              />
            </>
          )}
        </>
      )}

      {novaCampanhaAberta && <NovaCampanhaDialog onClose={() => setNovaCampanhaAberta(false)} />}
    </div>
  );
}

/** Criação de campanha — a roleta nasce no SERVIDOR (slug único + token via
 *  gen_random_bytes) pela RPC criar_roleta_campanha, auditada. Só o nome: a
 *  campanha é sempre da equipe, de qualquer zona e filial (13/10/2026). */
function NovaCampanhaDialog({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = useState("");
  const criar = useCriarRoletaCampanha();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Cria a roleta da campanha com token de webhook gerado no servidor. Depois, monte a
            equipe (corretores de qualquer filial) e aponte a fonte (Zap/n8n) para a URL do token. A
            equipe recebe o lead do anúncio de qualquer zona.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="nova-campanha-nome">Nome da campanha</Label>
          <Input
            id="nova-campanha-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Well Perdizes"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => criar.mutate({ nome: nome.trim() }, { onSuccess: () => onClose() })}
            disabled={!nome.trim() || criar.isPending}
          >
            {criar.isPending ? "Criando…" : "Criar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
