import type { BackofficeUser } from './data/organizers.repository';
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
 * Usuário real do Auth → conta do formulário. Só preenche o que existe hoje
 * (nome, e-mail, cidade); documento e verificação não têm backend, então ficam
 * vazios em vez de inventar dado.
 */
export function subjectFromUser(user: BackofficeUser, city: string | null): RoleFormSubject {
  return {
    name: userDisplayName(user),
    badge: roleLabels(user.roles),
    brand: '',
    city: city ?? '',
    accountType: 'Pessoa física (CPF)',
    document: '',
    documentStatus: '',
    email: user.email ?? '',
    whatsapp: '',
    verification: [],
  };
}
