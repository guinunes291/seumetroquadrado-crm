// "Roleta do SDR" dentro do card Metas do dia: o placar do PRÓPRIO corretor na
// semana em curso (sábado a sexta) e o que falta para seguir — ou entrar — na
// roleta de agendados do SDR na semana seguinte. Só aparece com a regra semanal
// ligada (docs/politica-roleta-sdr-semanal.md); o banco devolve só a linha de
// quem pergunta (roleta_sdr_placar).

import { useMemo } from "react";
import { Fire } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  bateuMeta,
  faltaParaMeta,
  formatarPontos,
  resumoFalta,
  semanaEmCurso,
  situacaoNaRoleta,
  textoAviso,
} from "@/lib/roleta-sdr-semanal";
import {
  usePlacarRoletaSdr,
  useRoletaSdrConfig,
} from "@/features/distribuicao/roleta-sdr-semanal-queries";

export function PlacarRoletaSdrCorretor({ uid }: { uid: string }) {
  const agora = useMemo(() => new Date(), []);
  const semana = semanaEmCurso(agora);
  const cfgQ = useRoletaSdrConfig(!!uid);
  const ligada = !!cfgQ.data?.regra_ativa;
  const placarQ = usePlacarRoletaSdr(semana, ligada);
  const cfg = cfgQ.data;
  const minha = placarQ.data?.find((l) => l.corretor_id === uid);

  if (!cfg || !ligada || !minha || minha.bloqueado_admin) return null;

  const batida = bateuMeta(minha.pontos, cfg);
  const pct =
    cfg.meta_pontos > 0 ? Math.min(100, Math.round((100 * minha.pontos) / cfg.meta_pontos)) : 100;
  const situacao = situacaoNaRoleta(minha, agora);
  const resto = resumoFalta(faltaParaMeta(minha.pontos, cfg));

  return (
    <div
      className="border-t pt-2"
      data-testid="metas-dia-roleta-sdr"
      title={textoAviso(minha, situacao, cfg)}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Fire className="h-3.5 w-3.5" /> Roleta do SDR
          {cfg.modo_sombra && (
            <span className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide">teste</span>
          )}
        </span>
        <span className="font-display font-semibold tabular-nums">
          {formatarPontos(minha.pontos).replace(/ pts?$/, "")}
          <span className="font-normal text-muted-foreground">
            /{formatarPontos(cfg.meta_pontos)}
          </span>
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`Roleta do SDR: ${pct}% da meta da semana`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            batida ? "bg-success" : "bg-gradient-gold",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {minha.visitas} {minha.visitas === 1 ? "visita" : "visitas"} · {minha.pastas}{" "}
        {minha.pastas === 1 ? "pasta" : "pastas"} ·{" "}
        {batida ? (
          <span className="text-success">meta batida: na roleta do SDR a partir de sábado</span>
        ) : (
          <span>{resto ? `${resto} até sexta` : "sem caminho de pontos configurado"}</span>
        )}
      </p>
    </div>
  );
}
