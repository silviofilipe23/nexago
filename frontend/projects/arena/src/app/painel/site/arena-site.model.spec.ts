import {
  ARENA_SITE_EMPTY,
  slugifyArenaSite,
  validateArenaSiteForPublish,
  validateArenaSiteSlug,
} from './arena-site.model';

describe('arena-site.model', () => {
  describe('slugifyArenaSite', () => {
    it('remove acentos e vira kebab-case', () => {
      expect(slugifyArenaSite('Arena São João — Praia')).toBe('arena-sao-joao-praia');
    });

    it('descarta separadores nas bordas', () => {
      expect(slugifyArenaSite('  -Arena!  ')).toBe('arena');
    });
  });

  describe('validateArenaSiteSlug', () => {
    it('aceita slug válido', () => {
      expect(validateArenaSiteSlug('arena-beach-123')).toBeNull();
    });

    it('rejeita slug curto, maiúsculas e reservados', () => {
      expect(validateArenaSiteSlug('ab')).not.toBeNull();
      expect(validateArenaSiteSlug('Arena')).not.toBeNull();
      expect(validateArenaSiteSlug('nexago')).not.toBeNull();
    });
  });

  describe('validateArenaSiteForPublish', () => {
    function draftWith(overrides: Partial<typeof ARENA_SITE_EMPTY>) {
      return { ...structuredClone(ARENA_SITE_EMPTY), ...overrides };
    }

    it('exige headline do hero', () => {
      expect(validateArenaSiteForPublish(draftWith({}), 'minha-arena')).toContain('hero');
    });

    it('passa com hero preenchido e contatos válidos', () => {
      const draft = draftWith({
        hero: { headline: 'Sua praia é aqui', tagline: '', imageUrl: '', ctaLabel: '', ctaUrl: '' },
        contact: { enabled: true, whatsapp: '(11) 91234-5678', instagram: '@arena.beach', address: '' },
      });
      expect(validateArenaSiteForPublish(draft, 'minha-arena')).toBeNull();
    });

    it('rejeita WhatsApp fora do tamanho e CTA sem http', () => {
      const badWa = draftWith({
        hero: { headline: 'Ok', tagline: '', imageUrl: '', ctaLabel: '', ctaUrl: '' },
        contact: { enabled: true, whatsapp: '123', instagram: '', address: '' },
      });
      expect(validateArenaSiteForPublish(badWa, 'minha-arena')).not.toBeNull();

      const badCta = draftWith({
        hero: { headline: 'Ok', tagline: '', imageUrl: '', ctaLabel: 'Reservar', ctaUrl: 'javascript:x' },
      });
      expect(validateArenaSiteForPublish(badCta, 'minha-arena')).not.toBeNull();
    });
  });
});
