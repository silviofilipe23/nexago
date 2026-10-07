/** Controle da tela de Intervalo — o overlay para os momentos sem jogo na transmissão.
 *
 *  O painel grava o texto (modo, título em duas linhas, subtítulo) e a contagem; o "A seguir", os
 *  3 jogos seguintes e o letreiro de resultados o overlay lê sozinho das partidas do torneio
 *  (públicas). A contagem NÃO é um cronômetro gravado: o doc guarda o carimbo do servidor do início
 *  e a duração, e cada tela calcula o que falta — como no tempo médico. */
export type IntervaloMode = 'intervalo' | 'voltamos' | 'pausa';

export interface BroadcastIntervalo {
  on: boolean;
  mode: IntervaloMode;
  /** Título em duas linhas; a segunda sai em laranja ("Intervalo" / "na arena"). */
  line1: string;
  line2: string;
  subtitle: string;
  /** Duração da contagem em segundos; 0 = sem contagem. */
  durationSec: number;
  /** Início da contagem (carimbo do servidor); `null` = contagem não iniciada. */
  startedAt: Date | null;
}

export const INTERVALO_MODES: readonly IntervaloMode[] = ['intervalo', 'voltamos', 'pausa'];

/** Selo laranja de cada modo. */
export const INTERVALO_BADGE: Record<IntervaloMode, string> = {
  intervalo: 'Intervalo',
  voltamos: 'Já voltamos',
  pausa: 'Pausa',
};

/** Textos padrão de cada modo — o painel preenche com eles e o operador edita. */
export const INTERVALO_PRESETS: Record<IntervaloMode, { line1: string; line2: string; subtitle: string; durationSec: number }> = {
  intervalo: { line1: 'Intervalo', line2: 'na arena', subtitle: 'A transmissão continua em instantes com a próxima partida.', durationSec: 300 },
  voltamos: { line1: 'Voltamos', line2: 'já', subtitle: 'Fique com a gente. A próxima partida está chegando à quadra.', durationSec: 300 },
  pausa: { line1: 'Pausa para', line2: 'o almoço', subtitle: 'Os jogos voltam à tarde com as quartas de final.', durationSec: 300 },
};

export const DEFAULT_BROADCAST_INTERVALO: BroadcastIntervalo = { on: false, mode: 'intervalo', ...INTERVALO_PRESETS.intervalo, startedAt: null };

function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export function intervaloFromRaw(raw: unknown): BroadcastIntervalo {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mode = INTERVALO_MODES.includes(d['mode'] as IntervaloMode) ? (d['mode'] as IntervaloMode) : 'intervalo';
  const preset = INTERVALO_PRESETS[mode];
  const dur = d['durationSec'];
  const started = d['startedAt'] as { toDate?: () => Date } | undefined;
  return {
    on: d['on'] === true,
    mode,
    line1: text(d['line1'], 40) ?? preset.line1,
    line2: text(d['line2'], 40) ?? preset.line2,
    subtitle: text(d['subtitle'], 140) ?? preset.subtitle,
    durationSec: typeof dur === 'number' && Number.isFinite(dur) && dur >= 0 ? Math.min(Math.trunc(dur), 6 * 3600) : preset.durationSec,
    startedAt: typeof started?.toDate === 'function' ? started.toDate() : null,
  };
}
