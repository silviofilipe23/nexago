import { replaceOrder, rowsFor, rowsFromDoc, sortRows, tabCounts } from './reviews';

const at = (iso: string) => ({ toDate: () => new Date(iso) });

const DOC = {
  number: 'NX-4740',
  anonymous: true,
  authorName: 'Atleta NexaGO',
  updatedAt: at('2026-10-19T15:00:00Z'),
  items: [
    {
      productId: 'cam', name: 'Camiseta Dry UV50', variantLabel: 'Branco · M', imageUrl: 'https://cdn/cam.jpg',
      rating: 1, tags: ['qualidade', 'inventada'], fit: 'pequeno', comment: '  Rasgou na 1ª lavagem ',
      photos: [{ path: 'u/a.jpg', publicPath: 'p/a.jpg', url: 'https://cdn/a.jpg' }],
      createdAt: at('2026-10-18T10:00:00Z'), updatedAt: at('2026-10-19T15:00:00Z'),
      hiddenAt: at('2026-10-19T16:00:00Z'), hiddenBy: { uid: 'adm', name: 'Ana Souza' }, hiddenReason: 'Ofensivo',
    },
    { productId: 'vis', name: 'Viseira Pro', rating: 5, tags: [], fit: null, comment: '', photos: [], hiddenAt: null },
    { productId: 'bola', name: 'Bola', rating: null },
  ],
};

describe('avaliações da loja · modelo', () => {
  it('achata o pedido por produto avaliado; item sem nota não entra', () => {
    const rows = rowsFromDoc('ord-1', DOC);
    expect(rows.map((r) => r.key)).toEqual(['ord-1/cam', 'ord-1/vis']);
    const [cam, vis] = rows;
    expect(cam).toEqual(jasmine.objectContaining({
      orderNumber: 'NX-4740', productName: 'Camiseta Dry UV50', rating: 1, tags: ['qualidade'], fit: 'pequeno',
      comment: 'Rasgou na 1ª lavagem', photos: ['https://cdn/a.jpg'], anonymous: true,
      hiddenByName: 'Ana Souza', hiddenReason: 'Ofensivo',
    }));
    expect(cam.hiddenAt).toEqual(new Date('2026-10-19T16:00:00Z'));
    expect(vis.hiddenAt).toBeNull();
    expect(vis.updatedAt).toEqual(new Date('2026-10-19T15:00:00Z'));
  });

  it('abas e filtros: comentário/foto e nota até 2 se somam; a contagem segue os filtros', () => {
    const rows = [
      ...rowsFromDoc('ord-1', DOC),
      ...rowsFromDoc('ord-2', { items: [{ productId: 'cam', rating: 2, comment: 'Apertada' }] }),
    ];
    expect(tabCounts(rows, { content: false, low: false })).toEqual({ publicadas: 2, escondidas: 1 });
    expect(rowsFor(rows, 'publicadas', { content: true, low: false }).map((r) => r.key)).toEqual(['ord-2/cam']);
    expect(rowsFor(rows, 'publicadas', { content: false, low: true }).map((r) => r.key)).toEqual(['ord-2/cam']);
    expect(tabCounts(rows, { content: true, low: true })).toEqual({ publicadas: 1, escondidas: 1 });
  });

  it('relido o pedido, as linhas dele são trocadas e a ordem é a da última edição', () => {
    const old = rowsFromDoc('ord-old', { updatedAt: at('2026-10-01T00:00:00Z'), items: [{ productId: 'x', rating: 4 }] });
    const rows = sortRows([...old, ...rowsFromDoc('ord-1', DOC)]);
    expect(rows.map((r) => r.key)).toEqual(['ord-1/cam', 'ord-1/vis', 'ord-old/x']);
    const unhidden = rowsFromDoc('ord-1', { ...DOC, items: [{ ...DOC.items[0], hiddenAt: null }] });
    const next = replaceOrder(rows, 'ord-1', unhidden);
    expect(next.map((r) => r.key)).toEqual(['ord-1/cam', 'ord-old/x']);
    expect(next[0].hiddenAt).toBeNull();
  });
});
