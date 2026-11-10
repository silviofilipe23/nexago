import { athletePricingFromQuote } from './arena-bookings-repository';

describe('preço por perfil na cotação (portal do atleta)', () => {
  it('lê o perfil aplicado', () => {
    expect(
      athletePricingFromQuote({ athletePricingTier: 'student', athletePricingLabel: 'Aluno', athletePricingDiscountReais: 50 }),
    ).toEqual({ athletePricingLabel: 'Aluno', athletePricingDiscountReais: 50 });
  });

  it('sem nome usa o padrão do perfil', () => {
    expect(athletePricingFromQuote({ athletePricingTier: 'professor', athletePricingDiscountReais: 30 }).athletePricingLabel).toBe(
      'Professor',
    );
  });

  it('avulso ou servidor antigo: sem perfil', () => {
    expect(athletePricingFromQuote({})).toEqual({ athletePricingLabel: null, athletePricingDiscountReais: 0 });
    expect(athletePricingFromQuote({ athletePricingTier: 'student', athletePricingDiscountReais: 0 }).athletePricingLabel).toBeNull();
  });
});
