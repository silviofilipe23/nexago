import {
  BLOG_DEFAULT_CATEGORIES,
  CATEGORY_PALETTE,
  MIN_CONTRAST,
  authorChoices,
  authorErrors,
  authorFromDoc,
  categoryChoices,
  categoryErrors,
  categoryFromDoc,
  categoryIdFrom,
  categoryMetaIn,
  changedOrders,
  contrastRatio,
  darkContrast,
  effectiveCategories,
  isCategoryId,
  lightContrast,
  moveCategory,
  nextOrder,
  pairWarnings,
  taxonomyCounts,
  type BlogAuthorDef,
} from './blog-taxonomy';

const doc = (id: string, data: Record<string, unknown>) => categoryFromDoc(id, data)!;

describe('blog · categorias e autores', () => {
  it('id: formato do servidor e id tirado do nome', () => {
    expect(categoryIdFrom('Saúde & corpo')).toBe('saude-corpo');
    expect(categoryIdFrom('  !!  ')).toBe('');
    expect(isCategoryId('saude-corpo')).toBeTrue();
    expect(isCategoryId('Saúde')).toBeFalse();
    expect(isCategoryId('a'.repeat(33))).toBeFalse();
  });

  it('lista efetiva: padrões ⊕ docs (doc vence), por ordem e depois rótulo', () => {
    const list = effectiveCategories([
      doc('treino', { label: 'Treinos', color: '#123456', colorLight: '#0A0A0A', order: 9, active: false }),
      doc('saude', { label: 'Saúde', color: '#3DD9C1', colorLight: '#0F6E60', order: 2, active: true }),
    ]);
    expect(list.map((c) => c.id)).toEqual(['torneios', 'regras', 'saude', 'arenas', 'guia', 'loja', 'treino']);
    const treino = list.find((c) => c.id === 'treino')!;
    expect([treino.label, treino.color, treino.active, treino.hasDoc, treino.isDefault]).toEqual(['Treinos', '#123456', false, true, true]);
    expect(list.find((c) => c.id === 'saude')!.isDefault).toBeFalse();
    // Empate de ordem: rótulo decide ("Regras" < "Saúde").
    expect(effectiveCategories([]).map((c) => c.id)).toEqual(BLOG_DEFAULT_CATEGORIES.map((c) => c.id));
  });

  it('doc com campo ruim cai no padrão daquele id; id inválido é descartado', () => {
    const c = doc('guia', { label: '', color: 'azul', order: 'x' });
    expect([c.label, c.color, c.colorLight, c.order, c.active]).toEqual(['Guia do app', '#9AB4FF', '#2F55B8', 4, true]);
    const nova = doc('nova', {});
    expect([nova.label, nova.color, nova.order]).toEqual(['nova', '#A1A1AA', 999]);
    expect(categoryFromDoc('Inválido', {})).toBeNull();
  });

  it('meta: id sumido = "Blog" neutro; opções do editor só ativas, com a do post marcada', () => {
    const list = effectiveCategories([doc('regras', { label: 'Regras', color: '#C9A7FF', colorLight: '#6B3FB8', order: 2, active: false })]);
    expect(categoryMetaIn(list, 'sumiu')).toEqual(jasmine.objectContaining({ label: 'Blog', color: '#A1A1AA', known: false }));
    expect(categoryMetaIn(list, 'regras')).toEqual(jasmine.objectContaining({ label: 'Regras', active: false, known: true }));
    expect(categoryChoices(list, 'torneios').map((o) => o.id)).not.toContain('regras');
    expect(categoryChoices(list, 'regras').pop()).toEqual({ id: 'regras', label: 'Regras (inativa)' });
    expect(categoryChoices(list, 'sumiu').pop()).toEqual({ id: 'sumiu', label: 'sumiu (não existe mais)' });
  });

  it('mover: troca com o vizinho, renumera e só as que mudaram vão ao servidor', () => {
    const list = effectiveCategories([]);
    const moved = moveCategory(list, 1, -1);
    expect(moved.slice(0, 3).map((c) => [c.id, c.order])).toEqual([
      ['treino', 0],
      ['torneios', 1],
      ['regras', 2],
    ]);
    expect(changedOrders(list, moved).map((c) => c.id)).toEqual(['treino', 'torneios']);
    expect(moveCategory(list, 0, -1)).toEqual(list);
    expect(nextOrder(list)).toBe(6);
  });

  it('validação da categoria com os textos do servidor', () => {
    const ok = { id: null, label: 'Saúde', color: '#3DD9C1', colorLight: '#0F6E60', order: 6, active: true };
    expect(categoryErrors(ok)).toEqual([]);
    expect(categoryErrors({ ...ok, label: ' ' })).toEqual(['Dê um nome à categoria.']);
    expect(categoryErrors({ ...ok, label: '!!!' })).toEqual(['Use letras ou números no nome.']);
    expect(categoryErrors({ ...ok, label: 'x'.repeat(25) })).toEqual(['Nome passa de 24 caracteres.']);
    expect(categoryErrors({ ...ok, color: '#12', colorLight: 'azul', order: 1000 })).toEqual([
      'Cor do tema escuro inválida.',
      'Cor do tema claro inválida.',
      'Ordem inválida.',
    ]);
  });

  it('contraste WCAG: valores conhecidos e o pior dos fundos claros do app', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // #AE3A0A (texto laranja do app no claro): 5,3:1 no cartão #F0EDE8, o pior dos três fundos.
    expect(lightContrast('#AE3A0A')).toBeCloseTo(contrastRatio('#AE3A0A', '#F0EDE8'), 5);
    expect(lightContrast('#AE3A0A')).toBeGreaterThan(5.2);
    expect(lightContrast('#FF6A1A')).toBeLessThan(MIN_CONTRAST); // o laranja da marca não serve de texto no claro
  });

  it('todos os pares prontos passam de 4,5:1 nos dois temas, e as 6 de origem estão neles', () => {
    expect(CATEGORY_PALETTE.length).toBe(12);
    for (const p of CATEGORY_PALETTE) {
      expect(darkContrast(p.color)).withContext(`${p.name} no escuro`).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(lightContrast(p.colorLight)).withContext(`${p.name} no claro`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
    for (const c of BLOG_DEFAULT_CATEGORIES) {
      expect(CATEGORY_PALETTE.some((p) => p.color === c.color && p.colorLight === c.colorLight)).withContext(c.id).toBeTrue();
    }
  });

  it('aviso do par digitado à mão', () => {
    expect(pairWarnings('#3DD9C1', '#0F6E60')).toEqual([]);
    const w = pairWarnings('#222222', '#FFB000');
    expect(w.length).toBe(2);
    expect(w[1]).toContain('Escureça a cor.');
    expect(pairWarnings('#12', 'x')).toEqual([]);
  });

  it('autor: leitura do doc, validação e opções do editor', () => {
    const a = authorFromDoc('a1', { name: ' Ana  Souza ', role: 'Editora', photoUrl: 'http://x', bio: ' Oi ', active: true });
    expect(a).toEqual({ id: 'a1', name: 'Ana Souza', role: 'Editora', photoUrl: null, bio: 'Oi', active: true });
    const base = { id: null, name: 'Ana', role: '', photoUrl: null, bio: '', active: true };
    expect(authorErrors(base)).toEqual([]);
    expect(authorErrors({ ...base, name: '', photoUrl: 'http://x', bio: 'x'.repeat(161) })).toEqual([
      'Informe o nome do autor.',
      'Foto sem endereço https.',
      'Bio passa de 160 caracteres.',
    ]);
    const list: BlogAuthorDef[] = [
      { id: 'z', name: 'Zé', role: '', photoUrl: null, bio: '', active: true },
      { id: 'b', name: 'Bruno', role: '', photoUrl: null, bio: '', active: false },
      { id: 'a', name: 'Álvaro', role: '', photoUrl: null, bio: '', active: true },
    ];
    expect(authorChoices(list, null).map((x) => x.id)).toEqual(['a', 'z']);
    expect(authorChoices(list, 'b').map((x) => [x.id, x.inactive])).toEqual([
      ['a', false],
      ['z', false],
      ['b', true],
    ]);
  });

  it('contagem de posts por categoria e por autor cadastrado', () => {
    const counts = taxonomyCounts([
      { category: 'treino', author: { id: 'a1' } },
      { category: 'treino', author: { id: null } },
      { category: 'loja', author: {} },
    ]);
    expect([...counts.categories]).toEqual([
      ['treino', 2],
      ['loja', 1],
    ]);
    expect([...counts.authors]).toEqual([['a1', 1]]);
  });
});
