import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { backofficeFunctions } from '../../data/firebase';
import { OrganizersRepository, type BackofficeUser } from '../../organizadores/data/organizers.repository';

export const ADMIN_ROLE = 'admin';

export interface NewAdminInput {
  fullName: string;
  email: string;
  temporaryPassword: string;
}

interface CreateResponse {
  uid?: unknown;
  email?: unknown;
}

interface RolesResponse {
  roles?: unknown;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Equipe do backoffice — contas com a claim `admin` (administrador da plataforma).
 *
 * Atenção ao nome do callable: `createOrganizer` cria um **admin do backoffice**,
 * não a role `organizer` (gestor de torneios). É naming legado do backend.
 */
@Injectable({ providedIn: 'root' })
export class TeamRepository {
  private readonly users = inject(OrganizersRepository);

  /** Admins da plataforma (o filtro exato é por claim, não pelo texto da busca). */
  async listAdmins(): Promise<BackofficeUser[]> {
    const rows = await this.users.searchUsers(ADMIN_ROLE, 100);
    return rows.filter((row) => row.roles.includes(ADMIN_ROLE));
  }

  /** Cria a conta já com a claim `admin` e `mustChangePassword`. Só super admin. */
  async createAdmin(input: NewAdminInput): Promise<string> {
    const callable = httpsCallable<Record<string, unknown>, CreateResponse>(
      backofficeFunctions(),
      'createOrganizer',
    );
    const result = await callable({
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      temporaryPassword: input.temporaryPassword,
    });
    return typeof result.data?.uid === 'string' ? result.data.uid : '';
  }

  /** Tira o acesso ao backoffice, mantendo os outros papéis. Só super admin. */
  async revokeAdminRole(uid: string): Promise<string[]> {
    const callable = httpsCallable<Record<string, unknown>, RolesResponse>(
      backofficeFunctions(),
      'removeUserRole',
    );
    const result = await callable({ uid, role: ADMIN_ROLE });
    return stringList(result.data?.roles);
  }
}

/** Senha temporária forte — o convidado é obrigado a trocar no primeiro acesso. */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}
