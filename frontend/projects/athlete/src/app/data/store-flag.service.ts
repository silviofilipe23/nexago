import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { athleteFirestore } from './firestore';
import { fetchStoreEnabled } from './store-showcase-repository';

/**
 * A Loja aparece no menu? Lido uma vez por sessão logada (`appConfig/store` exige login).
 * Carregando ou com erro conta como desligado: sem checkout, entrada aberta por engano é pior
 * que entrada que demora um instante para surgir.
 */
@Injectable({ providedIn: 'root' })
export class StoreFlagService {
  private readonly auth = inject(AuthService);
  private loadedFor: string | null = null;

  readonly enabled = signal(false);

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.loadedFor) return;
      this.loadedFor = uid;
      const db = athleteFirestore();
      if (!uid || !db) {
        this.enabled.set(false);
        return;
      }
      void fetchStoreEnabled(db).then((on) => {
        if (this.loadedFor === uid) this.enabled.set(on);
      });
    });
  }
}
