import {
  doacaoCycleShowNow,
  doacaoCycleStart,
  doacaoCycleStop,
  doacaoCycleTick,
  type DoacaoCycleInput,
  type DoacaoCycleState,
} from './overlay-doacao-cycle';

describe('overlay-doacao-cycle', () => {
  const base: DoacaoCycleInput = {
    enabled: true,
    hasPix: true,
    atrasoSeg: 3,
    visivelSeg: 20,
    intervaloSeg: 90,
  };

  it('começa em delay de 3 s e ainda não mostra', () => {
    expect(doacaoCycleStart(base)).toEqual({
      phase: 'delay',
      waitMs: 3000,
      show: false,
    });
  });

  it('atraso 0 abre já visível', () => {
    expect(doacaoCycleStart({ ...base, atrasoSeg: 0 })).toEqual({
      phase: 'visible',
      waitMs: 20_000,
      show: true,
    });
  });

  it('sem pix ou desligado fica off', () => {
    expect(doacaoCycleStart({ ...base, hasPix: false }).phase).toBe('off');
    expect(doacaoCycleStart({ ...base, enabled: false }).phase).toBe('off');
  });

  it('ciclo delay → visible → gap → visible', () => {
    let s: DoacaoCycleState = doacaoCycleStart(base);
    s = doacaoCycleTick(s, base);
    expect(s).toEqual({ phase: 'visible', waitMs: 20_000, show: true });
    s = doacaoCycleTick(s, base);
    expect(s).toEqual({ phase: 'gap', waitMs: 90_000, show: false });
    s = doacaoCycleTick(s, base);
    expect(s).toEqual({ phase: 'visible', waitMs: 20_000, show: true });
  });

  it('showNow força visível; stop para o ciclo', () => {
    expect(doacaoCycleShowNow(base).show).toBeTrue();
    expect(doacaoCycleStop()).toEqual({ phase: 'off', waitMs: null, show: false });
  });
});
