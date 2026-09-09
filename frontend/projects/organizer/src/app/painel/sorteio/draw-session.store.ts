import { Injectable, effect, signal } from '@angular/core';
import { watchDrawSession } from '../data/draw-sessions-repository';
import type { DrawSession } from '../data/draw-session.model';

/**
 * Estado de uma sessão de sorteio: um único listener no documento.
 *
 * Serve as duas superfícies — o telão público (`/sorteio/:sessionId`, sem
 * login) e o console do organizador. Como as rules abrem a leitura de
 * `drawSessions` para qualquer um, o mesmo store funciona autenticado ou não.
 *
 * `notFound` é separado de `error` de propósito: link errado e falha de rede
 * pedem mensagens diferentes, e tratar as duas como "deu erro" manda o público
 * embora sem explicação.
 *
 * SEM `providedIn` — cada tela provê a própria instância e o listener morre com
 * ela.
 */
@Injectable()
export class DrawSessionStore {
  readonly sessionId = signal<string | null>(null);
  readonly session = signal<DrawSession | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal(false);

  constructor() {
    effect((onCleanup) => {
      const id = this.sessionId();
      this.session.set(null);
      this.notFound.set(false);
      this.error.set(false);
      this.loading.set(true);
      if (!id) {
        this.loading.set(false);
        return;
      }

      const unsubscribe = watchDrawSession(
        id,
        (session) => {
          this.session.set(session);
          this.loading.set(false);
          this.notFound.set(false);
          this.error.set(false);
        },
        () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
        () => {
          this.error.set(true);
          this.loading.set(false);
        },
      );
      onCleanup(() => unsubscribe());
    });
  }
}
