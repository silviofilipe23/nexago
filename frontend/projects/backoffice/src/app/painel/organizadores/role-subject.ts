import type { BackofficeUser, OrganizerRegistration } from './data/organizers.repository';
import type { Athlete } from './organizadores.data';
import type { RoleFormSubject } from './role-form.state';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  organizer: 'Organizador',
  athlete: 'Atleta',
  arena: 'Gestor de arena',
  coach: 'Treinador',
};

export function roleLabels(roles: readonly string[]): string {
  return roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ');
}

/** Nome de exibição de um usuário real, com os fallbacks do backoffice. */
export function userDisplayName(user: BackofficeUser): string {
  return user.fullName ?? user.displayName ?? user.email ?? user.uid;
}

/** Atleta do mock (telas de solicitação) → conta do formulário. */
export function subjectFromAthlete(athlete: Athlete): RoleFormSubject {
  return { ...athlete, badge: athlete.elo };
}

/**
 * Usuário real do Auth → conta do formulário, pré-preenchida com o cadastro que
 * a conta já tem. `registration` é `null` enquanto a leitura não voltou (ou se
 * ela falhou): aí só o que vem do Auth aparece, e o admin preenche o resto.
 *
 * Verificação segue vazia: o fluxo de checagens do organizador não existe no
 * backend, e inventar item aqui seria mentir sobre o estado da conta.
 */
export function subjectFromUser(
  user: BackofficeUser,
  registration: OrganizerRegistration | null,
): RoleFormSubject {
  const profile = registration?.profile;
  const terms = registration?.terms;
  return {
    name: userDisplayName(user),
    badge: roleLabels(user.roles),
    brand: profile?.orgName ?? '',
    city: profile?.city ?? '',
    state: profile?.state ?? '',
    accountType: terms?.accountType === 'Pessoa jurídica (CNPJ)'
      ? 'Pessoa jurídica (CNPJ)'
      : 'Pessoa física (CPF)',
    document: terms?.document ?? '',
    documentStatus: '',
    email: profile?.contactEmail || (user.email ?? ''),
    whatsapp: profile?.contactPhone ?? '',
    verification: [],
  };
}
