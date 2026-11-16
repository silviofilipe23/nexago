import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { clubVisible, isAdminClaims, isTester, type BenefitsClubConfig } from '../clube.logic';
import { CLUB_API } from './clube-api';

export interface ClubAccess {
  uid: string;
  config: BenefitsClubConfig;
  tester: boolean;
}

/** O pedaço do `User` do Firebase que importa aqui (o spec passa um objeto simples). */
interface TokenOwner {
  uid: string;
  getIdTokenResult?: () => Promise<{ claims: Record<string, unknown> }>;
}

async function readIsAdmin(user: TokenOwner): Promise<boolean> {
  try {
    const token = await user.getIdTokenResult?.();
    return isAdminClaims(token?.claims);
  } catch {
    return false;
  }
}

/**
 * O clube aparece para esta conta? (card do Competir e item do menu). Lido uma vez por sessão
 * logada: `appConfig/benefitsClub` mais o papel no token. Carregando ou com erro conta como
 * escondido: o Competir de hoje não pode quebrar nem piscar um card que some em seguida.
 */
@Injectable({ providedIn: 'root' })
export class ClubAccessService {
  private readonly api = inject(CLUB_API);
  private readonly auth = inject(AuthService);

  private readonly access = signal<ClubAccess | null>(null);
  private loadedFor: string | null = null;
  private pending: Promise<ClubAccess | null> = Promise.resolve(null);

  /** `true` só com a leitura concluída e a flag ligada (ou quem testa). */
  readonly visible = computed(() => {
    const a = this.access();
    return a !== null && clubVisible(a.config, a.tester);
  });

  constructor() {
    effect(() => {
      const user = this.auth.user() as TokenOwner | null;
      untracked(() => this.loadFor(user));
    });
  }

  /**
   * A leitura da conta atual (o store do clube espera por ela em vez de ler de novo). Dispara a
   * leitura na hora se o `effect` ainda não rodou: num link direto para `/clube` o serviço nasce
   * junto com o store, e o `effect` só roda depois.
   */
  current(): Promise<ClubAccess | null> {
    this.loadFor(untracked(() => this.auth.user()) as TokenOwner | null);
    return this.pending;
  }

  private loadFor(user: TokenOwner | null): void {
    const uid = user?.uid ?? null;
    if (uid === this.loadedFor) return;
    this.loadedFor = uid;
    this.access.set(null);
    const api = this.api;
    if (!uid || !user || !api) {
      this.pending = Promise.resolve(null);
      return;
    }
    this.pending = Promise.all([api.fetchConfig(), readIsAdmin(user)])
      .then(([config, admin]) => {
        const result: ClubAccess = { uid, config, tester: isTester(uid, admin, config) };
        if (this.loadedFor === uid) this.access.set(result);
        return result;
      })
      .catch(() => null);
  }
}
