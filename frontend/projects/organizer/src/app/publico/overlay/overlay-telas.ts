import { intervaloRestanteSeg } from './overlay-intervalo';

/** Helpers das telas Início e Fim. Puros — a tela só desenha. */

export interface TelasRelogio {
  /** "08:14" em caracteres: cada dígito rola sozinho quando muda. */
  chars: string[];
  /** Zerou: o relógio vira "Começa agora". */
  zerou: boolean;
  /** 0–1: quanto da contagem já passou (barra do topo). */
  progresso: number;
  restanteSeg: number;
}

/** Relógio MM:SS da contagem; `null` quando não há contagem rodando (duração 0 ou não iniciada). */
export function telasRelogioOf(startedAt: Date | null, durationSec: number, nowMs: number): TelasRelogio | null {
  const restante = intervaloRestanteSeg(startedAt, durationSec, nowMs);
  if (restante === null) return null;
  const mm = Math.floor(restante / 60);
  const ss = restante % 60;
  const texto = `${String(Math.min(mm, 99)).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return {
    chars: [...texto],
    zerou: restante === 0,
    progresso: durationSec > 0 ? Math.min(1, Math.max(0, 1 - restante / durationSec)) : 1,
    restanteSeg: restante,
  };
}

const DIA_MS = 86_400_000;
const inicioDoDia = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "Dia 2 · Quartas de final": o dia do evento (1 = primeiro dia) e a fase do primeiro jogo. */
export function telasDiaLabelOf(startAt: Date | null, fase: string | null, nowMs: number): string | null {
  const partes: string[] = [];
  if (startAt) partes.push(`Dia ${Math.max(1, Math.round((inicioDoDia(nowMs) - inicioDoDia(startAt.getTime())) / DIA_MS) + 1)}`);
  if (fase?.trim()) partes.push(fase.trim());
  return partes.length > 0 ? partes.join(' · ') : null;
}
