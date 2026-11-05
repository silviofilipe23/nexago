import { BLOG_DEFAULT_CATEGORIES, mapCategoryDoc, mergeBlogCategories } from './categories';

describe('mergeBlogCategories', () => {
  it('sem doc: as 6 de origem, na ordem, com os tokens do site', () => {
    const cats = mergeBlogCategories([]);
    expect(cats.map((c) => c.id)).toEqual(['torneios', 'treino', 'regras', 'arenas', 'guia', 'loja']);
    expect(cats[0].dark).toBe('var(--color-cat-torneios)');
    expect(cats[0].light).toBe('var(--color-cat-torneios)');
    expect(cats[0].art).toBe('#ff6a1a');
  });

  it('doc vence no mesmo id: rótulo, cor (par), ordem e ativa', () => {
    const cats = mergeBlogCategories([
      { id: 'treino', data: { label: 'Treinos', color: '#11AA55', colorLight: '#0A5530', order: 9, active: false } },
    ]);
    const treino = cats.find((c) => c.id === 'treino')!;
    expect(treino).toEqual({ id: 'treino', label: 'Treinos', order: 9, active: false, dark: '#11aa55', light: '#0a5530', art: '#11aa55' });
    expect(cats[cats.length - 1].id).toBe('treino'); // ordem 9 vai pro fim
  });

  it('categoria nova entra com as cores do doc; empate de ordem desempata pelo rótulo', () => {
    const cats = mergeBlogCategories([
      { id: 'saude', data: { label: 'Saúde', color: '#22AA88', colorLight: '#116644', order: 0, active: true } },
      { id: 'agenda', data: { label: 'Agenda', color: '#2288AA', colorLight: '#114466', order: 0, active: true } },
    ]);
    expect(cats.slice(0, 3).map((c) => c.id)).toEqual(['agenda', 'saude', 'torneios']);
    expect(cats.find((c) => c.id === 'saude')?.light).toBe('#116644');
  });

  it('campo inválido no doc de uma de origem mantém o valor da origem', () => {
    const [torneios] = mergeBlogCategories([{ id: 'torneios', data: { label: '', color: 'laranja', colorLight: '#000000', order: 'x' } }]);
    expect(torneios).toEqual(BLOG_DEFAULT_CATEGORIES[0]);
  });
});

describe('mapCategoryDoc', () => {
  it('categoria nova sem rótulo ou sem as duas cores válidas é descartada', () => {
    expect(mapCategoryDoc('nova', { label: 'Nova', color: '#112233' })).toBeNull();
    expect(mapCategoryDoc('nova', { color: '#112233', colorLight: '#445566' })).toBeNull();
    expect(mapCategoryDoc('Nova Cat', { label: 'Nova', color: '#112233', colorLight: '#445566' })).toBeNull();
  });

  it('categoria nova sem ordem/ativa: ordem 999 e ativa', () => {
    expect(mapCategoryDoc('nova', { label: 'Nova', color: '#112233', colorLight: '#445566' })).toEqual({
      id: 'nova',
      label: 'Nova',
      order: 999,
      active: true,
      dark: '#112233',
      light: '#445566',
      art: '#112233',
    });
  });
});
