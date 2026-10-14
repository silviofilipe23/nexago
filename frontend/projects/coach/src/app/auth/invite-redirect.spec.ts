import { isInviteRedirect, validRedirect } from './invite-redirect';

describe('isInviteRedirect', () => {
  it('só caminhos /convite-equipe/<id> válidos', () => {
    expect(isInviteRedirect('/convite-equipe/abc')).toBeTrue();
    expect(isInviteRedirect(null)).toBeFalse();
    expect(isInviteRedirect('')).toBeFalse();
    expect(isInviteRedirect('/painel')).toBeFalse();
    expect(isInviteRedirect('//convite-equipe/x')).toBeFalse();
    expect(isInviteRedirect('/convite-equipe')).toBeFalse();
  });
});

describe('validRedirect', () => {
  it('aceita caminho interno e recusa o resto', () => {
    expect(validRedirect('/painel')).toBe('/painel');
    expect(validRedirect('//evil.com')).toBeNull();
    expect(validRedirect('https://evil.com')).toBeNull();
    expect(validRedirect(null)).toBeNull();
  });
});
