/** Ciclo do card rotativo de patrocinadores no overlay.
 *
 *  Puro pelo mesmo motivo do ciclo da doação: a tela só agenda timers, e a regra de
 *  "quando entra no ar" mora aqui, com teste. Diferença pro ciclo da doação: o card de
 *  patrocínio respeita a transmissão — não entra em pausa, com placar de resultado no ar
 *  ou com outro card no canto. Nesse caso ele não pula a vez: tenta de novo em 30 s. */

export type PatroCyclePhase = 'off' | 'wait' | 'visible';

export interface PatroCycleInput {
  enabled: boolean;
  /** Quantos patrocinadores há pra mostrar — sem nenhum, o card não existe. */
  count: number;
  intervaloSeg: number;
  visivelSeg: number;
  /** A tela está numa situação em que o card não deve entrar (pausa, resumo, doação…). */
  ocupado: boolean;
}

export interface PatroCycleState {
  phase: PatroCyclePhase;
  /** Próximo atraso em ms até a transição; `null` = nada a agendar. */
  waitMs: number | null;
  show: boolean;
}

/** Nova tentativa quando a vez do card cai numa situação ocupada. */
export const PATRO_RETRY_MS = 30_000;

function sec(n: number): number {
  return Math.max(0, Math.floor(Number(n) || 0) * 1000);
}

const OFF: PatroCycleState = { phase: 'off', waitMs: null, show: false };

function ativo(input: PatroCycleInput): boolean {
  return input.enabled && input.count > 0;
}

/** Ao abrir o overlay (ou religar): espera um intervalo inteiro antes da 1ª aparição. */
export function patroCycleStart(input: PatroCycleInput): PatroCycleState {
  if (!ativo(input)) return OFF;
  return { phase: 'wait', waitMs: Math.max(1000, sec(input.intervaloSeg)), show: false };
}

/** Avança uma fase. Quem chama passa o `ocupado` do momento da transição. */
export function patroCycleTick(state: PatroCycleState, input: PatroCycleInput): PatroCycleState {
  if (!ativo(input)) return OFF;
  switch (state.phase) {
    case 'off':
      return patroCycleStart(input);
    case 'wait':
      if (input.ocupado) return { phase: 'wait', waitMs: PATRO_RETRY_MS, show: false };
      return { phase: 'visible', waitMs: Math.max(1000, sec(input.visivelSeg)), show: true };
    case 'visible':
      return patroCycleStart(input);
  }
}

/** "patroc. agora": entra na hora, mesmo fora da vez — é o operador quem manda. */
export function patroCycleShowNow(input: PatroCycleInput): PatroCycleState {
  if (input.count <= 0) return OFF;
  return { phase: 'visible', waitMs: Math.max(1000, sec(input.visivelSeg)), show: true };
}

export function patroCycleStop(): PatroCycleState {
  return OFF;
}
