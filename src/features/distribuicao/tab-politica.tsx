// Aba Política (admin) — os parâmetros da Política de Distribuição de Leads
// SMQ v1 (migrations 20260826*): feature flag do motor v2, SLA do quente,
// faixas de velocidade, posse 7/30 e teto de leads ativos. Nasceu para acabar
// com a configuração invisível: TODA chave de distribuicao_settings aparece
// aqui — as conhecidas em campos próprios, as demais no bloco data-driven
// "Outras chaves" (uma chave nova criada por migration nunca mais fica sem
// tela). Tudo grava pela RPC auditada atualizar_distribuicao_setting.

import { useState } from "react";
import { FloppyDisk, ShieldWarning } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Json } from "@/integrations/supabase/types";
import { useAtualizarSetting, useDistribuicaoSettings } from "./queries";
import { SettingBooleano, SettingNumero } from "./setting-fields";

/** Chaves com campo PRÓPRIO nas abas Configurações e Política. Toda chave de
 *  distribuicao_settings fora desta lista cai no bloco "Outras chaves". */
export const CHAVES_COBERTAS: string[] = [
  // Aba Configurações (parâmetros gerais)
  "percentual_minimo_trabalhado",
  "limite_diario_default",
  "max_minutos_sem_atendimento",
  "reprocesso_max_tentativas",
  "permitir_inclusao_manual",
  "cota_conta_redistribuicao",
  "statuses_aguardando",
  "statuses_encerrados",
  // Aba Política (modelo v2)
  "modelo_v2_ativo",
  "modelo_v2_sombra",
  "sla_quente_minutos",
  "pausa_estouros_dia",
  "faixa_a_max_min",
  "faixa_b_max_min",
  "amostra_minima_faixa",
  "janela_faixa_dias",
  "posse_dias_atendimento",
  "posse_dias_avancado",
  "disjuntor_wip",
];

/** Flag do motor v2 — muda o comportamento de PRODUÇÃO, então liga/desliga
 *  só depois de confirmação explícita. */
function FlagMotorV2() {
  const settingsQ = useDistribuicaoSettings();
  const salvar = useAtualizarSetting();
  const ligado = settingsQ.data?.["modelo_v2_ativo"]?.valor === true;
  const [confirmando, setConfirmando] = useState<boolean | null>(null);

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-warning/40 bg-warning/5 p-3">
      <div>
        <Label className="flex items-center gap-1.5">
          <ShieldWarning className="h-4 w-4 text-warning" />
          Motor v2 ativo (quente por velocidade + base universal)
        </Label>
        <p className="text-xs text-muted-foreground">
          Liga a Política v1 em produção: SLA de 15 min úteis com devolução e pausa automática,
          faixas por velocidade, posse 7/30 e esteira base. Rollback = desligar aqui (1 clique, sem
          migração de dados).
        </p>
      </div>
      <Switch
        checked={ligado}
        disabled={settingsQ.isLoading || salvar.isPending}
        onCheckedChange={(v) => setConfirmando(v)}
      />

      <AlertDialog open={confirmando !== null} onOpenChange={(o) => !o && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmando ? "Ligar o motor v2 em produção?" : "Desligar o motor v2?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando
                ? "A partir do próximo lead, a distribuição passa a seguir a Política v1: ponderado por velocidade no quente, rodízio universal na base, SLA de 15 minutos úteis com devolução. A mudança vale imediatamente para a operação inteira."
                : "A distribuição volta imediatamente ao comportamento anterior (rodízio por zona/origem). Nenhum dado é perdido; leads já distribuídos ficam onde estão."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmando !== null) {
                  salvar.mutate({
                    chave: "modelo_v2_ativo",
                    valor: confirmando as unknown as Json,
                  });
                }
                setConfirmando(null);
              }}
            >
              {confirmando ? "Ligar motor v2" : "Desligar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Editor genérico para chave sem campo próprio: switch para boolean, número
 *  para number, JSON bruto (validado) para o resto. */
function SettingGenerico({ chave }: { chave: string }) {
  const settingsQ = useDistribuicaoSettings();
  const salvar = useAtualizarSetting();
  const entrada = settingsQ.data?.[chave];
  const valor = entrada?.valor;
  const [rascunho, setRascunho] = useState<string | null>(null);

  if (typeof valor === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <div>
          <Label className="font-mono text-xs">{chave}</Label>
          {entrada?.descricao && (
            <p className="text-xs text-muted-foreground">{entrada.descricao}</p>
          )}
        </div>
        <Switch
          checked={valor}
          disabled={salvar.isPending}
          onCheckedChange={(v) => salvar.mutate({ chave, valor: v as unknown as Json })}
        />
      </div>
    );
  }

  if (typeof valor === "number") {
    return (
      <SettingNumero chave={chave} label={chave} hint={entrada?.descricao ?? undefined} min={0} />
    );
  }

  const atualTexto = JSON.stringify(valor ?? null);
  const exibido = rascunho ?? atualTexto;
  const mudou = rascunho !== null && rascunho !== atualTexto;
  let valido = true;
  try {
    JSON.parse(exibido);
  } catch {
    valido = false;
  }

  return (
    <div className="space-y-1 rounded-md border p-3">
      <Label className="font-mono text-xs">{chave}</Label>
      {entrada?.descricao && <p className="text-xs text-muted-foreground">{entrada.descricao}</p>}
      <div className="flex items-start gap-2">
        <Textarea
          className="min-h-9 flex-1 font-mono text-xs"
          value={exibido}
          onChange={(e) => setRascunho(e.target.value)}
        />
        {mudou && (
          <Button
            size="sm"
            disabled={!valido || salvar.isPending}
            title={valido ? undefined : "JSON inválido"}
            onClick={() =>
              salvar.mutate(
                { chave, valor: JSON.parse(exibido) as Json },
                { onSuccess: () => setRascunho(null) },
              )
            }
          >
            <FloppyDisk className="mr-1 h-3.5 w-3.5" /> Salvar
          </Button>
        )}
      </div>
    </div>
  );
}

export function TabPolitica() {
  const settingsQ = useDistribuicaoSettings();
  const cobertas = new Set(CHAVES_COBERTAS);
  const outras = Object.keys(settingsQ.data ?? {})
    .filter((chave) => !cobertas.has(chave))
    .sort();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Motor v2 — Política de Distribuição v1</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FlagMotorV2 />
          <SettingBooleano
            chave="modelo_v2_sombra"
            label="Modo sombra (validação sem efeito)"
            hint="Com o motor v2 DESLIGADO: cada distribuição real registra em distribuicao_sombra quem o v2 teria escolhido. Use na Semana 0 do rollout."
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">SLA do quente e pausa automática</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingNumero
              chave="sla_quente_minutos"
              label="SLA de 1º contato no lead quente"
              hint="Minutos ÚTEIS (08:00-19:00). Estourou: o lead vai para o próximo e o estouro conta na faixa."
              sufixo="min"
            />
            <SettingNumero
              chave="pausa_estouros_dia"
              label="Estouros no dia que pausam o corretor"
              hint="Atingiu: pausado no quente até o dia seguinte, volta automática. A base continua."
              sufixo="estouros"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Faixas de velocidade (peso 3/2/1)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingNumero
              chave="faixa_a_max_min"
              label="Faixa A até (mediana)"
              hint="Mediana do 1º contato até este valor = faixa A (peso 3)."
              sufixo="min"
            />
            <SettingNumero
              chave="faixa_b_max_min"
              label="Faixa B até (mediana)"
              hint="Até este valor = faixa B (peso 2). Acima = faixa C (peso 1)."
              sufixo="min"
            />
            <SettingNumero
              chave="amostra_minima_faixa"
              label="Amostra mínima para ter faixa própria"
              hint="Abaixo disso a faixa é B (neutra) — novato não nasce punido nem premiado."
              sufixo="leads"
            />
            <SettingNumero
              chave="janela_faixa_dias"
              label="Janela da mediana"
              hint="Recalculada toda segunda 08:00 sobre este período."
              sufixo="dias"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Posse do lead (7/30)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingNumero
              chave="posse_dias_atendimento"
              label="Etapas iniciais — dias sem registro"
              hint="Sem nenhum registro nesse período, o lead volta para a casa como BASE."
              sufixo="dias"
            />
            <SettingNumero
              chave="posse_dias_avancado"
              label="Etapas avançadas — dias sem registro"
              hint="Qualificado, agendado, visita, proposta e análise de crédito."
              sufixo="dias"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Teto de carteira</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingNumero
              chave="disjuntor_wip"
              label="Disjuntor de leads ativos por corretor"
              hint="Atingiu o teto, para de receber (quente e base) até dar baixa na carteira."
              sufixo="leads"
            />
          </CardContent>
        </Card>
      </div>

      {outras.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Outras chaves</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Chaves de configuração sem campo próprio nas abas — criadas por migration ou ainda não
              mapeadas. Editor inferido pelo tipo do valor.
            </p>
            {outras.map((chave) => (
              <SettingGenerico key={chave} chave={chave} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
