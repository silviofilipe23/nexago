/** Ciclo de aparição do card de doação no overlay.
 *
 *  Puro de propósito: a tela só agenda timers; a regra de "quando mostra" mora
 *  aqui e tem teste. Sem isto, 3/20/90 viraria setTimeout espalhado no
 *  componente e qualquer ajuste quebraria o OBS no ar. */

export type DoacaoCyclePhase = 'off' | 'delay' | 'visible' | 'gap';

export interface DoacaoCycleInput {
  enabled: boolean;
  /** Tem chave PIX configurada — sem ela o card não entra no ar. */
  hasPix: boolean;
  atrasoSeg: number;
  visivelSeg: number;
  intervaloSeg: number;
}

export interface DoacaoCycleState {
  phase: DoacaoCyclePhase;
  /** Próximo atraso em ms até a transição; `null` = nada a agendar. */
  waitMs: number | null;
  /** Card deve estar montado (entrada/saída animada). */
  show: boolean;
}

function sec(n: number): number {
  return Math.max(0, Math.floor(Number(n) || 0) * 1000);
}

/** Estado inicial ao abrir o overlay (ou ao reabilitar). */
export function doacaoCycleStart(input: DoacaoCycleInput): DoacaoCycleState {
  if (!input.enabled || !input.hasPix) {
    return { phase: 'off', waitMs: null, show: false };
  }
  const delay = sec(input.atrasoSeg);
  if (delay === 0) {
    return { phase: 'visible', waitMs: sec(input.visivelSeg), show: true };
  }
  return { phase: 'delay', waitMs: delay, show: false };
}

/** Avança uma fase do ciclo. */
export function doacaoCycleTick(state: DoacaoCycleState, input: DoacaoCycleInput): DoacaoCycleState {
  if (!input.enabled || !input.hasPix) {
    return { phase: 'off', waitMs: null, show: false };
  }
  switch (state.phase) {
    case 'off':
      return doacaoCycleStart(input);
    case 'delay':
      return { phase: 'visible', waitMs: sec(input.visivelSeg), show: true };
    case 'visible':
      return { phase: 'gap', waitMs: sec(input.intervaloSeg), show: false };
    case 'gap':
      return { phase: 'visible', waitMs: sec(input.visivelSeg), show: true };
  }
}

/** Força o card na hora (botão doação / `NXOverlay.showDoacao`). */
export function doacaoCycleShowNow(input: DoacaoCycleInput): DoacaoCycleState {
  if (!input.hasPix) {
    return { phase: 'off', waitMs: null, show: false };
  }
  return { phase: 'visible', waitMs: sec(input.visivelSeg), show: true };
}

/** Tira o card e para o ciclo (botão desligar / `NXOverlay.hideDoacao`). */
export function doacaoCycleStop(): DoacaoCycleState {
  return { phase: 'off', waitMs: null, show: false };
}
