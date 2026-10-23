import { EMPTY_SHOWCASE, parseReais, readShowcase, showcaseError, showcaseImageError, showcaseToFirestore, trialLabel } from './showcase';

describe('vitrine do centro (showcase)', () => {
  it('lê o campo e cai no padrão com lixo', () => {
    expect(readShowcase(null)).toEqual(EMPTY_SHOWCASE);
    expect(readShowcase({ coverUrl: 'ftp://x', description: ' Alto rendimento ', trial: { enabled: true, priceReais: 50, note: ' 1 aula ' } })).toEqual({
      coverUrl: null,
      description: 'Alto rendimento',
      trial: { enabled: true, priceReais: 50, note: '1 aula' },
    });
  });

  it('valor em reais: vírgula, vazio e inválido', () => {
    expect(parseReais('49,90')).toBe(49.9);
    expect(parseReais('R$ 1.200,00')).toBe(1200);
    expect(parseReais('')).toBe(0);
    expect(parseReais('abc')).toBeNaN();
  });

  it('erros do formulário e da imagem', () => {
    expect(showcaseError(EMPTY_SHOWCASE)).toBeNull();
    expect(showcaseError({ ...EMPTY_SHOWCASE, trial: { enabled: true, priceReais: Number.NaN, note: '' } })).toContain('R$');
    expect(showcaseError({ ...EMPTY_SHOWCASE, description: 'x'.repeat(401) })).toContain('400');
    expect(showcaseImageError({ type: 'image/webp', size: 100 })).toBeNull();
    expect(showcaseImageError({ type: 'application/pdf', size: 100 })).not.toBeNull();
    expect(showcaseImageError({ type: 'image/png', size: 6 * 1024 * 1024 })).toContain('5 MB');
  });

  it('grava aparado e com 2 casas; rótulo igual ao do app', () => {
    expect(showcaseToFirestore({ coverUrl: null, description: ' a ', trial: { enabled: true, priceReais: 49.999, note: ' n ' } })).toEqual({
      coverUrl: null,
      description: 'a',
      trial: { enabled: true, priceReais: 50, note: 'n' },
    });
    expect(trialLabel({ enabled: true, priceReais: 0, note: '' })).toBe('Experimental grátis');
    expect(trialLabel({ enabled: true, priceReais: 50, note: '' })).toBe('Experimental R$ 50');
  });
});
