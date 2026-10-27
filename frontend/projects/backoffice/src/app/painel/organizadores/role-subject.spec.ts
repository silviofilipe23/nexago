import type { BackofficeUser } from './data/organizers.repository';
import { userInitials } from './role-subject';

function userOf(overrides: Partial<BackofficeUser> = {}): BackofficeUser {
  return {
    uid: 'abc123',
    email: 'ana@exemplo.com',
    displayName: null,
    fullName: 'Ana Lima Souza',
    roles: ['athlete'],
    disabled: false,
    emailVerified: true,
    ...overrides,
  };
}

describe('userInitials', () => {
  it('usa a primeira e a última palavra do nome', () => {
    expect(userInitials(userOf())).toBe('AS');
  });

  it('com uma palavra só, fica uma letra', () => {
    expect(userInitials(userOf({ fullName: 'ana' }))).toBe('A');
  });

  it('sem nome, cai no mesmo fallback do nome de exibição (e-mail)', () => {
    expect(userInitials(userOf({ fullName: null }))).toBe('A');
  });
});
