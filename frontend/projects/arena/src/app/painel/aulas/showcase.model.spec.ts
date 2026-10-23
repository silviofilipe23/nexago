import { EMPTY_SHOWCASE, showcaseError, showcaseFromDoc, trialLabel } from './showcase.model';

describe('vitrine de aulas (showcase.model)', () => {
  it('lê o doc e cai no padrão com lixo', () => {
    expect(showcaseFromDoc(undefined)).toEqual(EMPTY_SHOWCASE);
    expect(
      showcaseFromDoc({ coverUrl: 'http://x/a.jpg', description: ' Turmas ', trial: { enabled: true, priceReais: -3, note: ' 1 aula ' } }),
    ).toEqual({ coverUrl: null, description: 'Turmas', trial: { enabled: true, priceReais: 0, note: '1 aula' } });
  });

  it('valida descrição, preço e observação', () => {
    expect(showcaseError(EMPTY_SHOWCASE)).toBeNull();
    expect(showcaseError({ ...EMPTY_SHOWCASE, description: 'x'.repeat(401) })).toContain('400');
    expect(showcaseError({ ...EMPTY_SHOWCASE, trial: { enabled: true, priceReais: 2500, note: '' } })).toContain('2000');
    expect(showcaseError({ ...EMPTY_SHOWCASE, trial: { enabled: true, priceReais: Number.NaN, note: '' } })).not.toBeNull();
    expect(showcaseError({ ...EMPTY_SHOWCASE, trial: { enabled: true, priceReais: 0, note: 'x'.repeat(121) } })).toContain('120');
  });

  it('rótulo igual ao do app', () => {
    expect(trialLabel({ enabled: false, priceReais: 0, note: '' })).toBe('Sem aula experimental');
    expect(trialLabel({ enabled: true, priceReais: 0, note: '' })).toBe('Experimental grátis');
    expect(trialLabel({ enabled: true, priceReais: 50, note: '' })).toBe('Experimental R$ 50');
    expect(trialLabel({ enabled: true, priceReais: 49.9, note: '' })).toBe('Experimental R$ 49,90');
  });
});
