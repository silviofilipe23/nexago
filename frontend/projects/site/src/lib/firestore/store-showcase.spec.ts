import { mapShowcaseProduct } from './store-showcase';

describe('mapShowcaseProduct', () => {
  it('resume nome, capa e faixa de preço', () => {
    expect(
      mapShowcaseProduct('p1', {
        name: ' Camiseta ',
        coverUrl: 'https://cdn.x/c.jpg',
        priceCents: 9900,
        minPriceCents: 8900,
        maxPriceCents: 12900,
        soldOut: false,
        channels: { app: true, web: true },
      }),
    ).toEqual({ id: 'p1', name: 'Camiseta', coverUrl: 'https://cdn.x/c.jpg', minPriceCents: 8900, maxPriceCents: 12900, soldOut: false });
  });

  it('é tolerante: sem minPriceCents usa priceCents; capa não-https vira null', () => {
    const p = mapShowcaseProduct('p1', { name: 'Toalha', priceCents: 5000, coverUrl: 'http://x/a.jpg' });
    expect(p?.minPriceCents).toBe(5000);
    expect(p?.maxPriceCents).toBe(5000);
    expect(p?.coverUrl).toBeNull();
  });

  it('some sem nome, sem preço ou quando não é vendido pelo app', () => {
    expect(mapShowcaseProduct('p', { name: '', priceCents: 100 })).toBeNull();
    expect(mapShowcaseProduct('p', { name: 'X' })).toBeNull();
    expect(mapShowcaseProduct('p', { name: 'X', priceCents: 100, channels: { app: false, web: true } })).toBeNull();
  });
});
