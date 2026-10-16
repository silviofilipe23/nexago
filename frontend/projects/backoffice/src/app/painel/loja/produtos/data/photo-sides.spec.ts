import { photoSides } from './photo-sides';

describe('photoSides', () => {
  const p = (url: string, view?: string) => ({ url, view: view ?? null });

  it('usa a foto marcada de cada lado', () => {
    expect(photoSides([p('capa'), p('f', 'frente'), p('c', 'costas')])).toEqual({ frente: 'f', costas: 'c' });
  });

  it('sem marcação, a frente é a capa e as costas ficam sem foto', () => {
    expect(photoSides([p('capa'), p('outra')])).toEqual({ frente: 'capa', costas: null });
  });

  it('capa marcada como costas não vira frente', () => {
    expect(photoSides([p('c', 'costas'), p('outra')])).toEqual({ frente: null, costas: 'c' });
  });

  it('sem fotos, nada', () => {
    expect(photoSides(undefined)).toEqual({ frente: null, costas: null });
    expect(photoSides([{ url: '' }])).toEqual({ frente: null, costas: null });
  });
});
