import { readSquadDiscount, squadDiscountPreviewCents } from './squad-discount';

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

  it('lê o desconto da resposta; ausente é zero', () => {
    expect(readSquadDiscount({ squadDiscountReais: 15 })).toBe(15);
    expect(readSquadDiscount({})).toBe(0);
    expect(readSquadDiscount(null)).toBe(0);
  });
});
