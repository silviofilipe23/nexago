import {
  ownPerkFromRaw,
  ownPerkPreviewCents,
  platformFeeCents,
  readSquadDiscount,
  readSquadPerk,
  squadDiscountPreviewCents,
} from './squad-discount';

describe('squad-discount', () => {
  it('% sobre o preço, arredondado ao centavo', () => {
    expect(squadDiscountPreviewCents(150, 10)).toBe(1500);
    expect(squadDiscountPreviewCents(66.67, 15)).toBe(1000);
    expect(squadDiscountPreviewCents(150, 0)).toBe(0);
  });

  it('nunca deixa a cobrança abaixo de R$ 5', () => {
    expect(squadDiscountPreviewCents(6, 30)).toBe(100);
    expect(squadDiscountPreviewCents(5, 30)).toBe(0);
  });

  it('nunca passa da taxa da plataforma (a nexaGO banca o desconto com a taxa)', () => {
    // R$ 150 × 15% = R$ 22,50; taxa de 8% = R$ 12,00.
    expect(squadDiscountPreviewCents(150, 15, 8)).toBe(1200);
    // Taxa com piso de R$ 1,50.
    expect(squadDiscountPreviewCents(10, 30, 8)).toBe(150);
    expect(squadDiscountPreviewCents(150, 15, 0)).toBe(0);
    // Sem organizador: só o mínimo de cobrança.
    expect(squadDiscountPreviewCents(150, 15, null)).toBe(2250);
  });

  it('taxa como no servidor: % ou piso, nunca o preço inteiro', () => {
    expect(platformFeeCents(100, 8)).toBe(800);
    expect(platformFeeCents(10, 8)).toBe(150);
    expect(platformFeeCents(1, 8)).toBe(99);
    expect(platformFeeCents(100, null)).toBeNull();
  });

  it('clubinho: 5% sem piso — R$ 15 dá no máximo R$ 0,75', () => {
    expect(squadDiscountPreviewCents(15, 10, 5, 0)).toBe(75);
    expect(platformFeeCents(15, 5, 0)).toBe(75);
    // Com o piso de R$ 1,50 da reserva, o teto do mesmo preço seria R$ 1,50.
    expect(squadDiscountPreviewCents(15, 10, 5)).toBe(150);
  });

  it('lê o desconto da resposta; ausente é zero', () => {
    expect(readSquadDiscount({ squadDiscountReais: 15 })).toBe(15);
    expect(readSquadDiscount({})).toBe(0);
    expect(readSquadDiscount(null)).toBe(0);
  });

  it('benefício do embaixador: % só da parcela dele e nunca abaixo de R$ 5 com o desconto do seguidor', () => {
    expect(ownPerkPreviewCents(20, 50, 50, 0)).toBe(1000);
    expect(ownPerkPreviewCents(20, 50, 100, 0)).toBe(1000);
    expect(ownPerkPreviewCents(100, 50, 50, 0)).toBe(4500);
    expect(ownPerkPreviewCents(50, 10, 10, 3)).toBe(200);
    expect(readSquadPerk({ squadPerkReais: 9 })).toBe(9);
    expect(readSquadPerk({})).toBe(0);
  });

  it('lê o benefício da conferência do código; backend antigo ou malformado é null', () => {
    expect(ownPerkFromRaw({ type: 'discount', pct: 20 })).toEqual({ type: 'discount', pct: 20 });
    expect(ownPerkFromRaw({ type: 'free', available: true, remaining: null })).toEqual({ type: 'free', available: true, remaining: null });
    expect(ownPerkFromRaw({ type: 'free' })).toEqual({ type: 'free', available: false, remaining: null });
    expect(ownPerkFromRaw(undefined)).toBeNull();
    expect(ownPerkFromRaw({ type: 'discount' })).toBeNull();
  });
});
