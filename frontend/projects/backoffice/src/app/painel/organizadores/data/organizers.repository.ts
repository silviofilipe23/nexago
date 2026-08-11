import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
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

/** Perfil público do organizador — `users/{uid}.organizerProfile`. */
export interface OrganizerProfileInput {
  orgName: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  /** Sigla da UF. */
  state: string;
}

/** Cadastro sensível e condições comerciais — `organizers/{uid}`, admin-only. */
export interface OrganizerTermsInput {
  accountType: string;
  document: string;
  commissionPercent: number;
  payoutSchedule: string;
  tournamentLimit: string;
  permissions: string[];
}

/** Cadastro já existente da conta, para pré-preencher o formulário. */
export interface OrganizerRegistration {
  profile: OrganizerProfileInput;
  terms: OrganizerTermsInput | null;
  /** `organizerWallets/{uid}.payoutPixKey`; `''` = não configurada. */
  payoutPixKey: string;
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

/**
 * "Goiânia · GO". `organizerProfile` primeiro (é o que a promoção grava e o que
 * o organizador edita no painel dele); os campos soltos são o cadastro de
 * atleta, usados só enquanto não existe perfil de organizador.
 */
function cityLabel(data: Record<string, unknown>): string | null {
  const profile = (data['organizerProfile'] ?? {}) as Record<string, unknown>;
  const city = str(profile['city']) ?? str(data['city']);
  const state = str(profile['state']) ?? str(data['state']);
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

  /**
   * Cadastro atual da conta para pré-preencher o formulário. Cada leitura é
   * opcional: doc inexistente ou negado vira campo vazio, nunca erro de tela —
   * o admin ainda consegue preencher tudo à mão.
   */
  async loadRegistration(uid: string): Promise<OrganizerRegistration> {
    const [user, terms, wallet] = await Promise.all([
      this.readDoc(`users/${uid}`),
      this.readDoc(`organizers/${uid}`),
      this.readDoc(`organizerWallets/${uid}`),
    ]);

    const profile = (user?.['organizerProfile'] ?? {}) as Record<string, unknown>;
    return {
      profile: {
        orgName: str(profile['orgName']) ?? '',
        contactEmail: str(profile['contactEmail']) ?? str(user?.['email']) ?? '',
        contactPhone: str(profile['contactPhone']) ?? str(user?.['phone']) ?? '',
        // Sem organizerProfile ainda, a cidade do atleta é o melhor palpite:
        // são os mesmos campos soltos que a listagem já lê.
        city: str(profile['city']) ?? str(user?.['city']) ?? '',
        state: str(profile['state']) ?? str(user?.['state']) ?? '',
      },
      terms: terms
        ? {
            accountType: str(terms['accountType']) ?? '',
            document: str(terms['document']) ?? '',
            commissionPercent:
              typeof terms['commissionPercent'] === 'number' ? terms['commissionPercent'] : NaN,
            payoutSchedule: str(terms['payoutSchedule']) ?? '',
            tournamentLimit: str(terms['tournamentLimit']) ?? '',
            permissions: stringList(terms['permissions']),
          }
        : null,
      payoutPixKey: str(wallet?.['payoutPixKey']) ?? '',
    };
  }

  /**
   * Grava o passo 2. Server-side por necessidade: update de `users/{uid}` por
   * terceiro exige `isSuperAdmin()` nas rules, e `organizers/{uid}` é
   * write-only por Cloud Function.
   */
  async saveRegistration(
    uid: string,
    profile: OrganizerProfileInput,
    terms: OrganizerTermsInput,
  ): Promise<void> {
    const callable = httpsCallable<Record<string, unknown>, unknown>(
      backofficeFunctions(),
      'saveOrganizerRegistration',
    );
    await callable({ uid, profile, terms });
  }

  private async readDoc(path: string): Promise<Record<string, unknown> | null> {
    try {
      const snap = await getDoc(doc(backofficeDb(), path));
      return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    } catch {
      return null;
    }
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
