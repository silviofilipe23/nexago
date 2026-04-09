import { Injectable, signal } from '@angular/core';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';

import { firebaseAuth } from '../../firebase';

function rolesFromTokenClaims(claims: Record<string, unknown>): string[] {
  const fromArray = claims['roles'];
  let list: string[] = [];
  if (Array.isArray(fromArray)) {
    list = fromArray.filter((x): x is string => typeof x === 'string');
  }
  const legacy = claims['role'];
  if (typeof legacy === 'string' && legacy) {
    const set = new Set(list);
    set.add(legacy);
    list = Array.from(set);
  }
  return list.sort();
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = firebaseAuth;

  /** Current Firebase user, or null when signed out. */
  readonly user = signal<User | null>(null);

  /** Papéis do JWT (claim `roles` + fallback `role` legado). Atualizado no auth state e após refresh de token. */
  readonly roles = signal<readonly string[]>([]);

  /** Custom claim `superAdmin` (acesso total à plataforma). */
  readonly isSuperAdmin = signal(false);

  private resolveReady!: () => void;
  private readyDone = false;

  /** Resolves after the first auth state event (initial session restored or signed out). */
  readonly whenReady = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      void this.syncRolesFromUser(user);
      if (!this.readyDone) {
        this.readyDone = true;
        this.resolveReady();
      }
    });
  }

  /** True se o token inclui o papel (ex.: admin = organizador). */
  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }

  /**
   * Entrada no app backoffice: admin da plataforma, gestor de torneios (`organizer`) ou super admin.
   */
  canAccessBackoffice(): boolean {
    return this.hasRole('admin') || this.hasRole('organizer') || this.isSuperAdmin();
  }

  /** Painel, usuários e cadastros administrativos — apenas admin da plataforma ou super admin. */
  canManageUsers(): boolean {
    return this.hasRole('admin') || this.isSuperAdmin();
  }

  /**
   * Força novo JWT após mudança de papéis no servidor (custom claims).
   * Também usado pelo guard do backoffice para claims atualizados.
   */
  async refreshIdToken(): Promise<void> {
    const u = this.user();
    if (!u) {
      this.roles.set([]);
      return;
    }
    await u.getIdToken(true);
    await this.syncRolesFromUser(u);
  }

  private async syncRolesFromUser(user: User | null): Promise<void> {
    if (!user) {
      this.roles.set([]);
      this.isSuperAdmin.set(false);
      return;
    }
    try {
      const result = await user.getIdTokenResult();
      const claims = result.claims as Record<string, unknown>;
      this.roles.set(rolesFromTokenClaims(claims));
      this.isSuperAdmin.set(claims['superAdmin'] === true);
    } catch {
      this.roles.set([]);
      this.isSuperAdmin.set(false);
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    await cred.user.getIdToken(true);
    await this.syncRolesFromUser(cred.user);
  }

  signOut() {
    return signOut(this.auth);
  }
}
