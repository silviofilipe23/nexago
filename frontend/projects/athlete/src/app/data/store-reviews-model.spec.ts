import { orderViewFromDoc, type StoreOrderView } from './store-checkout-model';
import {
  canPublish,
  draftFromReview,
  fitIndicator,
  formTags,
  formatReviewDate,
  orderReviewFromDoc,
  orderReviewState,
  publicReviewFromDoc,
  reviewChips,
  reviewFilterChips,
  reviewSummary,
  reviewTargets,
  sortReviews,
  submitPayload,
  type PublicReview,
} from './store-reviews-model';
import { storeProductFromDoc, type StoreProduct } from './store-showcase-model';

const NOW = new Date('2026-10-19T15:00:00Z');

function order(over: Record<string, unknown> = {}): StoreOrderView {
  return orderViewFromDoc('ord-1', {
    uid: 'ana',
    number: 'NX-4740',
    status: 'rtd',
    items: [
      { productId: 'cam', skuId: 'branco_m', name: 'Camiseta Dry', variantLabel: 'Branco · M', qty: 1 },
      { productId: 'cam', skuId: 'preto_g', name: 'Camiseta Dry', variantLabel: 'Preto · G', qty: 1 },
      { productId: 'vis', skuId: 'unico', name: 'Viseira Pro', variantLabel: 'Preta', qty: 1 },
    ],
    delivery: { type: 'arena', placeName: 'Arena CFC' },
    createdAt: '2026-09-18T15:00:00Z',
    ...over,
  })!;
}

function product(id: string, over: Record<string, unknown> = {}): StoreProduct {
  return storeProductFromDoc(id, {
    name: id,
    slug: id,
    category: 'vestuario',
    priceCents: 12990,
    minPriceCents: 12990,
    maxPriceCents: 12990,
    axes: [],
    variants: [{ id: 'unico', values: {}, priceCents: 12990, inStock: true }],
    ...over,
  })!;
}

const sized = product('cam', { axes: [{ id: 'tam', label: 'Tamanho', values: [{ id: 'm', label: 'M' }] }] });

function review(id: string, over: Partial<PublicReview> = {}): PublicReview {
  return {
    id,
    rating: 5,
    tags: [],
    fit: null,
    comment: '',
    photos: [],
    variantLabel: '',
    sizeValueId: null,
    authorName: 'Ana S.',
    authorInitials: 'AS',
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...over,
  };
}

describe('Loja · avaliações (modelo)', () => {
  it('estado do botão: só entregue/retirado; editar até o fim do prazo', () => {
    const r = orderReviewFromDoc('ord-1', { uid: 'ana', items: [{ productId: 'cam', rating: 4 }], editableUntil: new Date('2026-11-18T15:00:00Z') });
    expect(orderReviewState(order({ status: 'tra' }), null, NOW)).toBe('unavailable');
    expect(orderReviewState(order(), null, NOW)).toBe('none');
    expect(orderReviewState(order({ status: 'ent' }), r, NOW)).toBe('editable');
    expect(orderReviewState(order(), r, new Date('2026-11-19T00:00:00Z'))).toBe('locked');
  });

  it('um alvo por produto (a primeira linha); Tamanho tira o chip "Tamanho certo"', () => {
    const targets = reviewTargets(order(), new Map([['cam', sized]]));
    expect(targets.map((t) => [t.productId, t.variantLabel, t.sized])).toEqual([
      ['cam', 'Branco · M', true],
      ['vis', 'Preta', false],
    ]);
    expect(formTags(true).map((t) => t.id)).not.toContain('tamanho');
    expect(formTags(false).map((t) => t.id)).toContain('tamanho');
  });

  it('rascunho da edição volta com nota, etiquetas, fotos; envio leva só o que tem nota', () => {
    const targets = reviewTargets(order(), new Map([['cam', sized]]));
    const prev = orderReviewFromDoc('ord-1', {
      anonymous: true,
      items: [{ productId: 'cam', rating: 4, tags: ['conforto', 'tamanho'], fit: 'certo', comment: 'Bom', photos: [{ path: 'p/a.jpg', url: 'https://u/a' }] }],
      pickup: { placeName: 'Arena CFC', rating: 5 },
    });
    const draft = draftFromReview(targets, prev);
    expect(draft[0]).toEqual({
      productId: 'cam',
      rating: 4,
      tags: ['conforto'],
      fit: 'certo',
      comment: 'Bom',
      photos: [{ path: 'p/a.jpg', preview: 'https://u/a', uploading: false }],
    });
    expect(draft[1]!.rating).toBe(0);
    expect(canPublish(draft)).toBeTrue();
    expect(submitPayload('ord-1', true, draft, 5)).toEqual({
      orderId: 'ord-1',
      anonymous: true,
      items: [{ productId: 'cam', rating: 4, tags: ['conforto'], fit: 'certo', comment: 'Bom', photos: ['p/a.jpg'] }],
      pickupRating: 5,
    });
  });

  it('sem nota nenhuma ou com foto subindo não publica', () => {
    const draft = draftFromReview(reviewTargets(order(), new Map()), null);
    expect(canPublish(draft)).toBeFalse();
    draft[0] = { ...draft[0]!, rating: 5, photos: [{ path: '', preview: 'blob:x', uploading: true }] };
    expect(canPublish(draft)).toBeFalse();
  });

  it('caimento: só com 3 respostas; posição e rótulo pela diferença', () => {
    expect(fitIndicator({ pequeno: 1, certo: 1, grande: 0 })).toBeNull();
    expect(fitIndicator({ pequeno: 0, certo: 8, grande: 2 })).toEqual({ position: 60, label: 'Veste bem' });
    expect(fitIndicator({ pequeno: 6, certo: 2, grande: 0 })).toEqual({ position: 13, label: 'Veste pequeno' });
    expect(fitIndicator({ pequeno: 0, certo: 1, grande: 3 })!.label).toBe('Veste grande');
  });

  it('resumo: média só a partir de 3, % por estrela e recomendam', () => {
    const p = product('cam', {
      axes: sized.axes,
      ratingAvg: 4.75,
      ratingCount: 4,
      reviewStats: { dist: [0, 0, 0, 1, 3], recommend: 4, withPhotos: 1, fit: { pequeno: 0, certo: 3, grande: 0 } },
    });
    const s = reviewSummary(p);
    expect(s.average).toBe('4,8');
    expect(s.stars).toBe(5);
    expect(s.distPct.map((d) => d.pct)).toEqual([75, 25, 0, 0, 0]);
    expect(s.recommendPct).toBe(100);
    expect(s.fit).toEqual({ position: 50, label: 'Veste bem' });
    expect(reviewSummary(product('x', { ratingAvg: 5, ratingCount: 2 })).average).toBeNull();
  });

  it('filtros: "Tamanho M" só com tamanho escolhido e avaliação nele', () => {
    const list = [review('a', { photos: ['u'], sizeValueId: 'm' }), review('b', { rating: 4 }), review('c', { sizeValueId: 'g' })];
    expect(reviewFilterChips(list, null).map((c) => `${c.label}:${c.count}`)).toEqual(['Todas:3', 'Com foto:1', '5 estrelas:2']);
    expect(reviewFilterChips(list, { valueId: 'm', label: 'M' }).at(-1)).toEqual({ id: 'tamanho', label: 'Tamanho M', count: 1 });
    expect(reviewFilterChips(list, { valueId: 'p', label: 'P' }).length).toBe(3);
  });

  it('ordem: recentes, melhor e pior nota (empate pela data)', () => {
    const list = [
      review('velha', { rating: 5, createdAt: new Date('2026-09-01') }),
      review('nova', { rating: 2, createdAt: new Date('2026-10-10') }),
      review('meio', { rating: 5, createdAt: new Date('2026-10-01') }),
    ];
    expect(sortReviews(list, 'recentes').map((r) => r.id)).toEqual(['nova', 'meio', 'velha']);
    expect(sortReviews(list, 'melhor').map((r) => r.id)).toEqual(['meio', 'velha', 'nova']);
    expect(sortReviews(list, 'pior').map((r) => r.id)).toEqual(['nova', 'meio', 'velha']);
  });

  it('card: etiquetas + caimento, sem repetir "Tamanho certo"; data curta', () => {
    expect(reviewChips({ tags: ['conforto', 'tamanho'], fit: 'certo' })).toEqual(['Conforto', 'Tamanho certo']);
    expect(reviewChips({ tags: ['qualidade'], fit: 'pequeno' })).toEqual(['Qualidade', 'Veste pequeno']);
    expect(formatReviewDate(new Date('2026-10-12T15:00:00Z'), NOW)).toBe('12 out');
    expect(formatReviewDate(new Date('2025-10-12T15:00:00Z'), NOW)).toBe('12 out 2025');
  });

  it('espelho público malformado é descartado; anônimo tem nome padrão', () => {
    expect(publicReviewFromDoc('x', { rating: 7 })).toBeNull();
    expect(publicReviewFromDoc('x', { rating: 4, tags: ['bonito', 'conforto'] })).toEqual(jasmine.objectContaining({
      authorName: 'Atleta NexaGO',
      authorInitials: '··',
      tags: ['conforto'],
    }));
  });
});
