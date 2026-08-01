import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { watchNotifications } from '../data/notifications-repository';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Sino de notificações — leva à central (`/notificacoes`) e acende o ponto
 *  quando há notificação real não lida. Substitui os sinos decorativos. */
@Component({
  selector: 'at-bell',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/notificacoes" class="at-bell-link" aria-label="Ver notificações">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
        <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      </svg>
      @if (unreadCount() > 0) {
        <span class="at-bell-link-dot" aria-hidden="true"></span>
      }
    </a>
  `,
  styles: `
    .at-bell-link {
      position: relative;
      /* 44px é o alvo mínimo de toque; a 36px o sino era um dos pontos mais difíceis de
         acertar no cabeçalho. */
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      cursor: pointer;
      transition: border-color 140ms ease-out, color 140ms ease-out;
    }
    .at-bell-link:hover {
      border-color: var(--nx-line-strong);
      color: var(--nx-text);
    }
    .at-bell-link-dot {
      position: absolute;
      top: 7px;
      right: 8px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      box-shadow: 0 0 0 2px var(--nx-surface-0);
    }
  `,
})
export class AtBellComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly unreadCount = signal(0);

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user || !this.firestore) {
        this.unreadCount.set(0);
        return;
      }
      const stop = watchNotifications(
        this.firestore,
        user.uid,
        (items) => this.unreadCount.set(items.filter((n) => n.unread).length),
        () => this.unreadCount.set(0),
      );
      onCleanup(() => stop());
    });
  }
}
