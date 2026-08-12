import type { UniformSelection } from '../tournament-uniform';
import { UniformAutoSaver, sameUniformSelection, type UniformAutoSaveState } from './uniform-autosave';

const DELAY = 5;

function selection(overrides: Partial<UniformSelection> = {}): UniformSelection {
  return { sizeTop: 'M', sizeShorts: null, jerseyNumber: 10, jerseyName: 'Silva', ...overrides };
}

/** Timers reais com atraso minúsculo — o saver mistura setTimeout e promessas,
 *  e relógio falso obrigaria a bombear microtasks à mão a cada gravação. */
function tick(ms = DELAY * 3): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Harness {
  readonly saver: UniformAutoSaver;
  readonly saved: UniformSelection[];
  readonly states: UniformAutoSaveState[];
  failNext(times?: number): void;
  /** Segura a próxima gravação até `release()`. */
  hold(): () => void;
}

function makeHarness(delayMs = DELAY): Harness {
  const saved: UniformSelection[] = [];
  const states: UniformAutoSaveState[] = [];
  let failures = 0;
  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;

  const saver = new UniformAutoSaver({
    delayMs,
    onStateChange: (state) => states.push(state),
    save: async (value) => {
      if (gate) {
        const waiting = gate;
        gate = null;
        await waiting;
      }
      if (failures > 0) {
        failures -= 1;
        throw new Error('falhou');
      }
      saved.push(value);
    },
  });

  return {
    saver,
    saved,
    states,
    failNext(times = 1) {
      failures = times;
    },
    hold() {
      gate = new Promise<void>((resolve) => (openGate = resolve));
      return () => openGate?.();
    },
  };
}

describe('sameUniformSelection', () => {
  it('ignora espaços em volta do nome da camisa', () => {
    expect(sameUniformSelection(selection({ jerseyName: ' Silva ' }), selection())).toBeTrue();
  });

  it('distingue tamanho diferente', () => {
    expect(sameUniformSelection(selection({ sizeTop: 'G' }), selection())).toBeFalse();
  });

  it('trata null e vazio como a mesma ausência de nome', () => {
    expect(sameUniformSelection(selection({ jerseyName: null }), selection({ jerseyName: '' }))).toBeTrue();
  });
});

describe('UniformAutoSaver', () => {
  it('grava uma vez só depois da última mexida', async () => {
    const h = makeHarness();
    h.saver.schedule(selection({ sizeTop: 'P' }));
    h.saver.schedule(selection({ sizeTop: 'M' }));
    h.saver.schedule(selection({ sizeTop: 'G' }));
    await tick();

    expect(h.saved.length).toBe(1);
    expect(h.saved[0].sizeTop).toBe('G');
    expect(h.states).toEqual(['saving', 'saved']);
    h.saver.dispose();
  });

  it('não chama o backend quando o valor volta a ser o já gravado', async () => {
    const h = makeHarness();
    h.saver.schedule(selection({ sizeTop: 'G' }));
    await tick();
    h.saver.schedule(selection({ sizeTop: 'G' }));
    await tick();

    expect(h.saved.length).toBe(1);
    h.saver.dispose();
  });

  it('a última escolha vence mesmo entrando durante uma gravação', async () => {
    const h = makeHarness();
    const release = h.hold();
    h.saver.schedule(selection({ sizeTop: 'P' }));
    await tick();
    expect(h.saved.length).toBe(0);

    h.saver.schedule(selection({ sizeTop: 'GG' }));
    await tick();
    release();
    await tick();

    expect(h.saved.map((s) => s.sizeTop)).toEqual(['P', 'GG']);
    h.saver.dispose();
  });

  it('acusa falha e regrava no retry', async () => {
    const h = makeHarness();
    h.failNext();
    h.saver.schedule(selection({ sizeTop: 'G' }));
    await tick();

    expect(h.saved.length).toBe(0);
    expect(h.states).toEqual(['saving', 'failed']);

    h.saver.retry();
    await tick();

    expect(h.saved.map((s) => s.sizeTop)).toEqual(['G']);
    expect(h.states).toEqual(['saving', 'failed', 'saving', 'saved']);
    h.saver.dispose();
  });

  it('depois de falhar, uma escolha nova tenta sozinha em vez de esperar o retry', async () => {
    const h = makeHarness();
    const release = h.hold();
    h.failNext();
    h.saver.schedule(selection({ sizeTop: 'P' }));
    await tick();

    h.saver.schedule(selection({ sizeTop: 'GG' }));
    await tick();
    release();
    await tick();

    expect(h.saved.map((s) => s.sizeTop)).toEqual(['GG']);
    expect(h.states.at(-1)).toBe('saved');
    h.saver.dispose();
  });

  it('saveNow não espera o debounce', async () => {
    const h = makeHarness(200);
    h.saver.saveNow(selection({ sizeTop: 'G' }));
    await tick(20);

    expect(h.saved.length).toBe(1);
    h.saver.dispose();
  });

  it('saveNow repetido do mesmo valor não vira duas chamadas', async () => {
    const h = makeHarness();
    const release = h.hold();
    h.saver.saveNow(selection({ sizeTop: 'G' }));
    await tick();
    h.saver.saveNow(selection({ sizeTop: 'G' }));
    release();
    await tick();

    expect(h.saved.length).toBe(1);
    expect(h.states.at(-1)).toBe('saved');
    h.saver.dispose();
  });

  it('markSaved dispensa a gravação do mesmo valor', async () => {
    const h = makeHarness();
    h.saver.markSaved(selection({ sizeTop: 'G' }));
    h.saver.schedule(selection({ sizeTop: 'G' }));
    await tick();

    expect(h.saved.length).toBe(0);
    expect(h.states).toEqual(['saved']);
    h.saver.dispose();
  });

  it('reset esquece o que já foi gravado (troca de categoria)', async () => {
    const h = makeHarness();
    h.saver.markSaved(selection({ sizeTop: 'G' }));
    h.saver.reset();
    h.saver.schedule(selection({ sizeTop: 'G' }));
    await tick();

    expect(h.saved.length).toBe(1);
    h.saver.dispose();
  });

  it('dispose cancela a gravação agendada', async () => {
    const h = makeHarness();
    h.saver.schedule(selection({ sizeTop: 'G' }));
    h.saver.dispose();
    await tick();

    expect(h.saved.length).toBe(0);
  });
});
