import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { organizerFirestore } from '../data/firestore';
import { watchNotifications } from '../data/notifications-repository';

/** Sino de notificações do painel — leva à central (`/painel/notificacoes`) e acende o ponto
 *  quando há notificação real não lida (nova inscrição, pagamento, pedido de cancelamento). */
@Component({
  selector: 'og-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a routerLink="/painel/notificacoes" class="og-bell-link" aria-label="Ver notificações">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
        <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      </svg>
      @if (unreadCount() > 0) {
        <span class="og-bell-link-dot" aria-hidden="true"></span>
      }
    </a>
  `,
  styles: `
    .og-bell-link {
      position: relative;
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
    .og-bell-link:hover {
      border-color: var(--nx-line-strong);
      color: var(--nx-text);
    }
    .og-bell-link-dot {
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
export class OgBellComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = organizerFirestore();

  protected readonly unreadCount = signal(0);

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user) {
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
