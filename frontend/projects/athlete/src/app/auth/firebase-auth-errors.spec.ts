import { mapFirebaseAuthError } from './firebase-auth-errors';

describe('mapFirebaseAuthError', () => {
  const err = (code: string) => ({ code });

  it('mapeia erros de e-mail/senha', () => {
    expect(mapFirebaseAuthError(err('auth/invalid-credential'))).toContain('incorretos');
    expect(mapFirebaseAuthError(err('auth/user-disabled'))).toContain('desativada');
  });

  it('explica domínio não autorizado em vez de cair no genérico', () => {
    const msg = mapFirebaseAuthError(err('auth/unauthorized-domain'));
    expect(msg).not.toBe('Não foi possível entrar. Tente novamente.');
    expect(msg).toContain('domínio');
  });

  it('explica popup bloqueado pelo navegador', () => {
    const msg = mapFirebaseAuthError(err('auth/popup-blocked'));
    expect(msg).not.toBe('Não foi possível entrar. Tente novamente.');
    expect(msg).toContain('bloqueou');
  });

  it('explica popup fechado antes de concluir', () => {
    const msg = mapFirebaseAuthError(err('auth/popup-closed-by-user'));
    expect(msg).not.toBe('Não foi possível entrar. Tente novamente.');
    expect(msg).toContain('janela');
  });

  it('explica provedor desabilitado no Firebase', () => {
    const msg = mapFirebaseAuthError(err('auth/operation-not-allowed'));
    expect(msg).not.toBe('Não foi possível entrar. Tente novamente.');
    expect(msg).toContain('indisponível');
  });

  it('explica conta já existente com outro método', () => {
    const msg = mapFirebaseAuthError(err('auth/account-exists-with-different-credential'));
    expect(msg).not.toBe('Não foi possível entrar. Tente novamente.');
    expect(msg).toContain('outro método');
  });

  it('mantém o genérico para códigos auth/ desconhecidos', () => {
    expect(mapFirebaseAuthError(err('auth/algo-novo'))).toBe(
      'Não foi possível entrar. Tente novamente.',
    );
  });
});
