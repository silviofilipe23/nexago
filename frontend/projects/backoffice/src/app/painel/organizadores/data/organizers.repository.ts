import { Injectable } from '@angular/core';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { backofficeDb, backofficeFunctions } from '../../data/firebase';

/** Linha devolvida por `listBackofficeUsers` (Auth + fullName do Firestore). */
export interface BackofficeUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
  roles: string[];
  disabled: boolean;
  emailVerified: boolean;
}

/** Organizador da listagem: dados do Auth + cidade/cadastro vindos de `users/{uid}`. */
export interface OrganizerListRow extends BackofficeUser {
  city: string | null;
  since: string | null;
}

interface ListUsersResponse {
  users?: unknown;
  nextPageToken?: string | null;
}

interface AddRoleResponse {
  success?: boolean;
  roles?: unknown;
  alreadyHad?: boolean;
}

export interface GrantRoleResult {
  roles: string[];
  alreadyHad: boolean;
}

export const ORGANIZER_ROLE = 'organizer';

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toBackofficeUser(raw: unknown): BackofficeUser | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const uid = str(row['uid']);
  if (!uid) {
    return null;
  }
  return {
    uid,
    email: str(row['email']),
    displayName: str(row['displayName']),
    fullName: str(row['fullName']),
    roles: stringList(row['roles']),
    disabled: row['disabled'] === true,
    emailVerified: row['emailVerified'] === true,
  };
}

/** "Goiânia · GO" a partir dos campos soltos do doc. */
function cityLabel(data: Record<string, unknown>): string | null {
  const city = str(data['city']);
  const state = str(data['state']);
  if (city && state) {
    return `${city} · ${state}`;
  }
  return city ?? state;
}

/** Data de cadastro no formato curto da tabela ("02/24"). */
function sinceLabel(value: unknown): string | null {
  const date =
    value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : null;
  if (!date) {
    return null;
  }
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${month}/${`${date.getFullYear()}`.slice(-2)}`;
}

/**
 * Operações reais de organizador no backoffice.
 *
 * A atribuição da role usa o callable `addUserRole`, que é a mesma semântica do
 * script `functions/scripts/grant-user-role.js --add organizer`: grava os custom
 * claims (fonte de verdade das rules) e espelha em `users/{uid}.roles`,
 * preservando os papéis que o usuário já tinha.
 */
@Injectable({ providedIn: 'root' })
export class OrganizersRepository {
  /** Busca usuários por nome, e-mail ou UID (callable admin-only). */
  async searchUsers(term: string, maxResults = 20): Promise<BackofficeUser[]> {
    const callable = httpsCallable<Record<string, unknown>, ListUsersResponse>(
      backofficeFunctions(),
      'listBackofficeUsers',
    );
    const result = await callable({ search: term, maxResults });
    return this.rowsOf(result);
  }

  /**
   * Organizadores reais: quem tem a role no Auth (fonte de verdade) enriquecido
   * com cidade e data de cadastro do espelho `users/{uid}`.
   */
  async listOrganizers(maxResults = 100): Promise<OrganizerListRow[]> {
    const callable = httpsCallable<Record<string, unknown>, ListUsersResponse>(
      backofficeFunctions(),
      'listBackofficeUsers',
    );
    // O matcher do callable inclui os papéis no texto pesquisado; o filtro
    // exato fica aqui, pra não depender de e-mails que contenham "organizer".
    const result = await callable({ search: ORGANIZER_ROLE, maxResults });
    const users = this.rowsOf(result).filter((u) => u.roles.includes(ORGANIZER_ROLE));
    if (users.length === 0) {
      return [];
    }

    const extras = await this.organizerDocs();
    return users.map((user) => {
      const extra = extras.get(user.uid);
      return {
        ...user,
        city: extra?.city ?? null,
        since: extra?.since ?? null,
      };
    });
  }

  /** Atribui a role de organizador preservando os papéis existentes. */
  async grantOrganizerRole(uid: string): Promise<GrantRoleResult> {
    const callable = httpsCallable<Record<string, unknown>, AddRoleResponse>(
      backofficeFunctions(),
      'addUserRole',
    );
    const result = await callable({ uid, role: ORGANIZER_ROLE });
    return {
      roles: stringList(result.data?.roles),
      alreadyHad: result.data?.alreadyHad === true,
    };
  }

  /**
   * Remove a role de organizador e devolve os papéis que sobraram.
   * O backend recusa se for o último papel do usuário (`failed-precondition`).
   */
  async revokeOrganizerRole(uid: string): Promise<string[]> {
    const callable = httpsCallable<Record<string, unknown>, AddRoleResponse>(
      backofficeFunctions(),
      'removeUserRole',
    );
    const result = await callable({ uid, role: ORGANIZER_ROLE });
    return stringList(result.data?.roles);
  }

  /** Cidade/cadastro dos organizadores pelo espelho `hasOrganizerRole` (uma leitura só). */
  private async organizerDocs(): Promise<Map<string, { city: string | null; since: string | null }>> {
    const out = new Map<string, { city: string | null; since: string | null }>();
    try {
      const snap = await getDocs(
        query(collection(backofficeDb(), 'users'), where('hasOrganizerRole', '==', true)),
      );
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        out.set(doc.id, { city: cityLabel(data), since: sinceLabel(data['createdAt']) });
      }
    } catch {
      // Enriquecimento é opcional: sem ele a tabela mostra "—" nessas colunas.
    }
    return out;
  }

  private rowsOf(result: HttpsCallableResult<ListUsersResponse>): BackofficeUser[] {
    const raw = result.data?.users;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map(toBackofficeUser).filter((u): u is BackofficeUser => u != null);
  }
}
