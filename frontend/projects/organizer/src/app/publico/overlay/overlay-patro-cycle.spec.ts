import {
  PATRO_RETRY_MS,
  patroCycleShowNow,
  patroCycleStart,
  patroCycleStop,
  patroCycleTick,
  type PatroCycleInput,
} from './overlay-patro-cycle';

const base: PatroCycleInput = { enabled: true, count: 3, intervaloSeg: 300, visivelSeg: 15, ocupado: false };

describe('ciclo do card de patrocinadores', () => {
  it('espera um intervalo inteiro antes da 1ª aparição', () => {
    expect(patroCycleStart(base)).toEqual({ phase: 'wait', waitMs: 300_000, show: false });
  });

  it('entra por visivelSeg e volta a esperar o intervalo', () => {
    const visivel = patroCycleTick(patroCycleStart(base), base);
    expect(visivel).toEqual({ phase: 'visible', waitMs: 15_000, show: true });
    expect(patroCycleTick(visivel, base)).toEqual({ phase: 'wait', waitMs: 300_000, show: false });
  });

  it('com a tela ocupada na hora da vez, tenta de novo em 30 s em vez de pular', () => {
    const vez = patroCycleStart(base);
    const adiado = patroCycleTick(vez, { ...base, ocupado: true });
    expect(adiado).toEqual({ phase: 'wait', waitMs: PATRO_RETRY_MS, show: false });
    expect(patroCycleTick(adiado, base).show).toBeTrue();
  });

  it('não existe sem patrocinador ou desligado', () => {
    expect(patroCycleStart({ ...base, count: 0 }).phase).toBe('off');
    expect(patroCycleStart({ ...base, enabled: false }).phase).toBe('off');
    const visivel = patroCycleShowNow(base);
    expect(patroCycleTick(visivel, { ...base, enabled: false }).show).toBeFalse();
  });

  it('"patroc. agora" entra na hora mesmo com o ciclo desligado, mas não sem patrocinador', () => {
    expect(patroCycleShowNow({ ...base, enabled: false }).show).toBeTrue();
    expect(patroCycleShowNow({ ...base, count: 0 }).show).toBeFalse();
  });

  it('parar tira o card e não agenda nada', () => {
    expect(patroCycleStop()).toEqual({ phase: 'off', waitMs: null, show: false });
  });
});
