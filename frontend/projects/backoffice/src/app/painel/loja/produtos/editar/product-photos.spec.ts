import { dimensionError, fileError, galleryForColor, moveItem, persistable, type PhotoItem } from './product-photos';
import { toggleBold, toggleList } from './description-format';

const item = (id: string, over: Partial<PhotoItem> = {}): PhotoItem => ({
  id, url: 'https://x/' + id, path: 'store/products/p/' + id, colorValueId: null, progress: null, error: null, ...over,
});

describe('product-photos', () => {
  it('valida tipo, tamanho e limite', () => {
    expect(fileError({ type: 'image/gif', size: 10 }, 0)).toContain('JPG');
    expect(fileError({ type: 'image/png', size: 11 * 1024 * 1024 }, 0)).toContain('10 MB');
    expect(fileError({ type: 'image/png', size: 10 }, 10)).toContain('Máximo');
    expect(fileError({ type: 'image/webp', size: 10 }, 9)).toBeNull();
  });

  it('exige 1200 px nos dois lados', () => {
    expect(dimensionError(1200, 1200)).toBeNull();
    expect(dimensionError(1199, 2000)).toContain('1199×2000');
  });

  it('reordena e define capa', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('só persiste o que já subiu sem erro', () => {
    const list = [item('a'), item('b', { progress: 40 }), item('c', { error: 'x' })];
    expect(persistable(list).map((p) => p.id)).toEqual(['a']);
  });

  it('galeria por cor põe as fotos da cor primeiro', () => {
    const list = [item('a'), item('b', { colorValueId: 'laranja' }), item('c', { colorValueId: 'laranja' })];
    expect(galleryForColor(list, 'laranja').map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('description-format', () => {
  it('liga e desliga negrito', () => {
    const on = toggleBold('uma bola', 4, 8);
    expect(on.text).toBe('uma **bola**');
    expect(toggleBold(on.text, on.selStart, on.selEnd).text).toBe('uma bola');
  });

  it('liga e desliga lista nas linhas tocadas', () => {
    const on = toggleList('a\nb\nc', 0, 3);
    expect(on.text).toBe('- a\n- b\nc');
    expect(toggleList(on.text, on.selStart, on.selEnd).text).toBe('a\nb\nc');
  });
});
