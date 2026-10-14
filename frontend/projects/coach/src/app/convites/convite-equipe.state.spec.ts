import { inviteViewState } from './convite-equipe.state';

describe('inviteViewState', () => {
  const NOW = 1_000_000;
  const base = { status: 'pending', emailLower: 'ana@x.com', expiresAtMs: NOW + 1000 };

  it('pendente válido para o e-mail da conta -> ready', () => {
    expect(inviteViewState(base, 'ana@x.com', NOW)).toBe('ready');
  });

  it('sem prazo (expiresAtMs null) -> ready', () => {
    expect(inviteViewState({ ...base, expiresAtMs: null }, 'ana@x.com', NOW)).toBe('ready');
  });

  it('status diferente de pending -> not-pending', () => {
    expect(inviteViewState({ ...base, status: 'accepted' }, 'ana@x.com', NOW)).toBe('not-pending');
    expect(inviteViewState({ ...base, status: 'revoked' }, 'ana@x.com', NOW)).toBe('not-pending');
  });

  it('status manda sobre prazo e e-mail', () => {
    expect(
      inviteViewState({ ...base, status: 'accepted', expiresAtMs: NOW - 1 }, 'outro@x.com', NOW),
    ).toBe('not-pending');
  });

  it('pendente vencido -> expired (inclusive no instante exato)', () => {
    expect(inviteViewState({ ...base, expiresAtMs: NOW - 1 }, 'ana@x.com', NOW)).toBe('expired');
    expect(inviteViewState({ ...base, expiresAtMs: NOW }, 'ana@x.com', NOW)).toBe('expired');
  });

  it('prazo manda sobre e-mail', () => {
    expect(inviteViewState({ ...base, expiresAtMs: NOW - 1 }, 'outro@x.com', NOW)).toBe('expired');
  });

  it('e-mail diferente -> wrong-account', () => {
    expect(inviteViewState(base, 'outro@x.com', NOW)).toBe('wrong-account');
  });

  it('sem e-mail na conta -> wrong-account', () => {
    expect(inviteViewState(base, null, NOW)).toBe('wrong-account');
    expect(inviteViewState(base, '  ', NOW)).toBe('wrong-account');
  });

  it('e-mail da conta é comparado sem diferenciar maiúsculas/espaços', () => {
    expect(inviteViewState(base, ' Ana@X.com ', NOW)).toBe('ready');
  });
});
