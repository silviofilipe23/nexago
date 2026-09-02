import {
  registrationTabBodyParts,
  registrationTabHeroBody,
  registrationTabHeroTitle,
  registrationTabPaymentMetricValue,
  registrationTabTeamMetricValue,
  registrationTabWhenLabel,
  registrationTabWhereLabel,
} from './registration-tab-view';

describe('registration-tab-view', () => {
  describe('registrationTabWhenLabel', () => {
    it('formata dia da semana, data e hora cheia', () => {
      // domingo 12 jul 2026 08:00 (local)
      expect(registrationTabWhenLabel(new Date(2026, 6, 12, 8, 0))).toBe('dom · 12 jul · 08h');
    });

    it('inclui minutos quando não é hora cheia', () => {
      expect(registrationTabWhenLabel(new Date(2026, 6, 12, 8, 30))).toBe('dom · 12 jul · 08h30');
    });

    it('retorna null sem data', () => {
      expect(registrationTabWhenLabel(null)).toBeNull();
    });
  });

  describe('registrationTabWhereLabel', () => {
    it('junta arena e cidade', () => {
      expect(registrationTabWhereLabel('Arena CFC', 'Aparecida')).toBe('Arena CFC · Aparecida');
    });

    it('cai no que existir', () => {
      expect(registrationTabWhereLabel('Arena CFC', null)).toBe('Arena CFC');
      expect(registrationTabWhereLabel(null, 'Aparecida')).toBe('Aparecida');
    });

    it('retorna null sem local', () => {
      expect(registrationTabWhereLabel(null, null)).toBeNull();
      expect(registrationTabWhereLabel('  ', '')).toBeNull();
    });
  });

  describe('registrationTabHeroTitle', () => {
    it('confirmação paga e completa', () => {
      expect(
        registrationTabHeroTitle({ paymentState: 'paid', teamLabel: 'Dupla', rosterComplete: true }),
      ).toBe('Dupla completa. Vocês estão dentro.');
    });

    it('equipe incompleta', () => {
      expect(
        registrationTabHeroTitle({ paymentState: 'pending', teamLabel: 'Equipe', rosterComplete: false }),
      ).toBe('Equipe incompleta. Falta gente no elenco.');
    });
  });

  describe('registrationTabHeroBody', () => {
    it('conta a história das cotas quando pago', () => {
      const copy = registrationTabHeroBody({
        paymentState: 'paid',
        teamLabel: 'Dupla',
        rosterComplete: true,
        partnerFirstName: 'Gabriel',
        entryFee: 220,
        teamSize: 2,
        paymentHint: 'Sua vaga está garantida.',
      });
      expect(copy.title).toBe('Dupla completa. Vocês estão dentro.');
      expect(copy.body).toContain('Gabriel aceitou');
      expect(copy.body).toContain('R$');
      expect(copy.highlights.length).toBe(2);
    });

    it('usa o hint operacional fora do estado pago', () => {
      const copy = registrationTabHeroBody({
        paymentState: 'pending',
        teamLabel: 'Dupla',
        rosterComplete: true,
        partnerFirstName: 'Gabriel',
        entryFee: 220,
        teamSize: 2,
        paymentHint: 'A vaga só é confirmada depois do pagamento.',
      });
      expect(copy.body).toBe('A vaga só é confirmada depois do pagamento.');
      expect(copy.highlights).toEqual([]);
    });
  });

  describe('registrationTabTeamMetricValue / paymentMetricValue', () => {
    it('mostra completa e o valor pago', () => {
      expect(
        registrationTabTeamMetricValue({
          paymentState: 'paid',
          rosterComplete: true,
          rosterFlag: null,
        }),
      ).toBe('completa');
      expect(
        registrationTabPaymentMetricValue({
          paymentState: 'paid',
          entryFeeLabel: 'R$ 220',
        }),
      ).toBe('R$ 220');
    });

    it('mostra pendente quando não pago', () => {
      expect(
        registrationTabPaymentMetricValue({
          paymentState: 'pending',
          entryFeeLabel: 'R$ 220',
        }),
      ).toBe('pendente');
    });
  });

  describe('registrationTabBodyParts', () => {
    it('destaca substrings na ordem', () => {
      expect(registrationTabBodyParts('A R$ 110 + R$ 110 de R$ 220.', ['R$ 110 + R$ 110', 'R$ 220'])).toEqual([
        { text: 'A ', emphasize: false },
        { text: 'R$ 110 + R$ 110', emphasize: true },
        { text: ' de ', emphasize: false },
        { text: 'R$ 220', emphasize: true },
        { text: '.', emphasize: false },
      ]);
    });
  });
});
