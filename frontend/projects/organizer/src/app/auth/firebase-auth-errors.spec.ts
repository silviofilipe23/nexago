import { mapFirebaseAuthError } from './firebase-auth-errors';

describe('mapFirebaseAuthError', () => {
  describe('login social (popup do Google)', () => {
    it('explica o pop-up bloqueado pelo navegador', () => {
      expect(mapFirebaseAuthError({ code: 'auth/popup-blocked' })).toContain('pop-ups');
    });

    it('trata janela fechada e requisição cancelada com a mesma mensagem', () => {
      const closed = mapFirebaseAuthError({ code: 'auth/popup-closed-by-user' });
      expect(closed).toContain('fechada');
      expect(mapFirebaseAuthError({ code: 'auth/cancelled-popup-request' })).toBe(closed);
    });

    it('aponta domínio não autorizado como problema de configuração, não erro do usuário', () => {
      const message = mapFirebaseAuthError({ code: 'auth/unauthorized-domain' });
      expect(message).toContain('domínio');
      expect(message).toContain('suporte');
    });

    it('orienta quem já tem conta criada por outro provedor', () => {
      expect(mapFirebaseAuthError({ code: 'auth/account-exists-with-different-credential' })).toContain(
        'outro método de login',
      );
    });

    it('não deixa nenhum código de popup cair no genérico', () => {
      const generico = mapFirebaseAuthError({ code: 'auth/algum-codigo-desconhecido' });
      const codigosDePopup = [
        'auth/popup-blocked',
        'auth/popup-closed-by-user',
        'auth/cancelled-popup-request',
        'auth/unauthorized-domain',
        'auth/account-exists-with-different-credential',
      ];
      for (const code of codigosDePopup) {
        expect(mapFirebaseAuthError({ code })).not.toBe(generico);
      }
    });
  });

  describe('comportamento preexistente', () => {
    it('mantém a mensagem de credencial inválida', () => {
      expect(mapFirebaseAuthError({ code: 'auth/invalid-credential' })).toContain('E-mail ou senha');
    });

    it('usa mensagem genérica para códigos auth/ desconhecidos', () => {
      expect(mapFirebaseAuthError({ code: 'auth/qualquer-coisa' })).toBe(
        'Não foi possível concluir. Tente novamente.',
      );
    });

    it('propaga a mensagem de Error comum (ex.: bloqueio de papel do organizador)', () => {
      expect(mapFirebaseAuthError(new Error('Esta conta não tem acesso ao painel do organizador.'))).toBe(
        'Esta conta não tem acesso ao painel do organizador.',
      );
    });
  });
});
