import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { loadPlansMenuFlag } from '../data/plan-contracts-repository';

/** Item "Planos & Sponsors" do menu: aceso só com `appConfig/tournamentPlans.enabled`, lido
 *  uma vez por uid. A rota funciona com a flag apagada (link direto, QA) — a flag só segura a
 *  entrada até a NexaGO ter como atender os pedidos de contratação. Falha de leitura = apagado:
 *  aqui esconder não tira nada de ninguém (ao contrário do Financeiro). */
@Injectable({ providedIn: 'root' })
export class PlansMenuService {
  private readonly auth = inject(AuthService);

  readonly enabled = signal(false);
  private loadedUid: string | null = null;

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.loadedUid) return;
      this.loadedUid = uid;
      this.enabled.set(false);
      if (!uid) return;
      void loadPlansMenuFlag().then((on) => {
        if (uid === this.loadedUid) this.enabled.set(on);
      });
    });
  }
}
