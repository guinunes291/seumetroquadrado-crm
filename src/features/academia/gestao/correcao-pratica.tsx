// Correção de prática e registro de roleplay presencial: a MESMA rubrica do
// módulo em checklist, status Aprovada ou Refazer e feedback obrigatório (a
// RPC recusa vazio). Um componente para os dois caminhos porque o gestor
// avalia do mesmo jeito o que o corretor enviou e o que ele viu ao vivo.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AcademiaCorretorResumoRow } from "@/features/academia/tipos";
import { itensDaRubrica, pontuacaoDaRubrica, resultadoDaRubrica, tempoDeEspera } from "./derivacao";
import {
  useAvaliarPratica,
  useRegistrarRoleplay,
  type ModuloResumo,
  type PraticaPendente,
} from "./gestao-client";
import { mensagemDaGestao } from "./mensagens";

type Props =
  | {
      modo: "pratica";
      pratica: PraticaPendente;
      nomeCorretor: string;
      aberto: boolean;
      onFechar: () => void;
    }
  | {
      modo: "roleplay";
      corretores: AcademiaCorretorResumoRow[];
      modulos: ModuloResumo[];
      corretorInicial?: string;
      aberto: boolean;
      onFechar: () => void;
    };

export function CorrecaoPratica(props: Props) {
  const avaliar = useAvaliarPratica();
  const roleplay = useRegistrarRoleplay();
  const [corretorId, setCorretorId] = useState(
    props.modo === "roleplay" ? (props.corretorInicial ?? "") : props.pratica.corretor_id,
  );
  const [moduloId, setModuloId] = useState(props.modo === "pratica" ? props.pratica.modulo_id : "");
  const [atendidos, setAtendidos] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<"aprovada" | "refazer" | "">("");
  const [feedback, setFeedback] = useState("");

  const modulo: ModuloResumo | null =
    props.modo === "pratica"
      ? props.pratica.modulo
      : (props.modulos.find((m) => m.id === moduloId) ?? null);
  const itens = useMemo(() => itensDaRubrica(modulo?.pratica_rubrica), [modulo]);
  const { feitos, total } = pontuacaoDaRubrica(itens, atendidos);
  const enviando = avaliar.isPending || roleplay.isPending;
  const podeEnviar =
    status !== "" &&
    feedback.trim().length > 0 &&
    corretorId !== "" &&
    moduloId !== "" &&
    !enviando;

  function alternar(i: number, marcado: boolean) {
    setAtendidos((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(i);
      else novo.delete(i);
      return novo;
    });
  }

  async function enviar() {
    if (!podeEnviar) return;
    const rubrica = resultadoDaRubrica(itens, atendidos);
    try {
      if (props.modo === "pratica") {
        await avaliar.mutateAsync({
          praticaId: props.pratica.id,
          status,
          rubrica,
          feedback: feedback.trim(),
        });
      } else {
        await roleplay.mutateAsync({
          corretorId,
          moduloId,
          status,
          rubrica,
          feedback: feedback.trim(),
        });
      }
      toast.success(
        status === "aprovada" ? "Prática aprovada." : "Prática devolvida para refazer.",
      );
      props.onFechar();
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  return (
    <Dialog open={props.aberto} onOpenChange={(v) => !v && props.onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {props.modo === "pratica" ? "Corrigir prática" : "Registrar roleplay presencial"}
          </DialogTitle>
          <DialogDescription>
            {props.modo === "pratica"
              ? `${props.nomeCorretor} · ${modulo?.codigo ?? ""} ${modulo?.titulo ?? ""} · esperando há ${tempoDeEspera(props.pratica.enviado_em)}`
              : "A mesma rubrica da prática do módulo, para o que você viu ao vivo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {props.modo === "roleplay" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="roleplay-corretor">Corretor</Label>
                <Select value={corretorId} onValueChange={setCorretorId}>
                  <SelectTrigger id="roleplay-corretor">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.corretores.map((c) => (
                      <SelectItem key={c.corretor_id} value={c.corretor_id}>
                        {c.corretor_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="roleplay-modulo">Módulo</Label>
                <Select
                  value={moduloId}
                  onValueChange={(v) => {
                    setModuloId(v);
                    setAtendidos(new Set());
                  }}
                >
                  <SelectTrigger id="roleplay-modulo">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.modulos
                      .filter((m) => m.status === "publicado")
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.codigo} · {m.titulo}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {props.modo === "pratica" && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                O que o corretor enviou
              </p>
              {props.pratica.evidencia_texto && (
                <p className="whitespace-pre-wrap">{props.pratica.evidencia_texto}</p>
              )}
              {props.pratica.evidencia_url && (
                <a
                  href={props.pratica.evidencia_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 block break-all text-primary underline"
                >
                  {props.pratica.evidencia_url}
                </a>
              )}
            </div>
          )}

          {modulo?.pratica_descricao && (
            <p className="text-xs text-muted-foreground">{modulo.pratica_descricao}</p>
          )}

          {itens.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium">
                <span>Rubrica</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {feitos} de {total} pontos
                </span>
              </legend>
              {itens.map((it, i) => (
                <label key={it.criterio} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={atendidos.has(i)}
                    onCheckedChange={(v) => alternar(i, v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    {it.criterio}
                    {it.peso > 1 && (
                      <span className="text-xs text-muted-foreground"> · peso {it.peso}</span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <RadioGroup
              value={status}
              onValueChange={(v) => setStatus(v as "aprovada" | "refazer")}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="aprovada" /> Aprovada
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="refazer" /> Refazer
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="correcao-feedback">Feedback (obrigatório)</Label>
            <Textarea
              id="correcao-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="1 foco de melhoria, com exemplo do que ouvir ou dizer."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!podeEnviar}>
            {enviando ? "Salvando..." : "Salvar avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
