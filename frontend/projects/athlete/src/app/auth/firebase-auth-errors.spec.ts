import { mapFirebaseAuthError } from './firebase-auth-errors';

describe('mapFirebaseAuthError', () => {
  describe('Phone Auth (verificação de telefone)', () => {
    it('mapeia código de verificação inválido', () => {
      expect(mapFirebaseAuthError({ code: 'auth/invalid-verification-code' })).toBe(
        'Código incorreto. Confira os 6 dígitos e tente de novo.',
      );
    });

    it('mapeia sessão de verificação expirada/inválida', () => {
      expect(mapFirebaseAuthError({ code: 'auth/invalid-verification-id' })).toBe(
        'Essa verificação expirou. Peça um novo código.',
      );
    });

    it('mapeia cota de SMS excedida', () => {
      expect(mapFirebaseAuthError({ code: 'auth/quota-exceeded' })).toBe(
        'Limite de envios de SMS atingido. Tente novamente mais tarde.',
      );
    });

    it('mapeia número de telefone inválido', () => {
      expect(mapFirebaseAuthError({ code: 'auth/invalid-phone-number' })).toBe(
        'Número de telefone inválido.',
      );
    });

    it('mapeia número já vinculado a outra conta', () => {
      expect(mapFirebaseAuthError({ code: 'auth/credential-already-in-use' })).toBe(
        'Este número já está vinculado a outra conta.',
      );
    });

    it('mapeia falha do reCAPTCHA', () => {
      expect(mapFirebaseAuthError({ code: 'auth/captcha-check-failed' })).toBe(
        'Não foi possível confirmar que você não é um robô. Tente novamente.',
      );
    });

    it('mapeia telefone já vinculado à própria conta', () => {
      expect(mapFirebaseAuthError({ code: 'auth/provider-already-linked' })).toBe(
        'Esta conta já tem um telefone vinculado.',
      );
    });
  });
});
