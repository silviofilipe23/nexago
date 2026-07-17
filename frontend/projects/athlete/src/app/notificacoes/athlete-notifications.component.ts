import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import {
  markAllNotificationsRead,
  markNotificationRead,
  watchNotifications,
  type AthleteNotification,
} from '../data/notifications-repository';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function relativeTime(date: Date | null): string {
  if (!date) return 'agora';
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'ontem';
  return `há ${diffDays} dias`;
}

type NotifTone = 'success' | 'warning' | 'accent' | 'neutral';

function toneOf(type: string | null): NotifTone {
  const normalized = type?.toLowerCase() ?? '';
  if (normalized.includes('booking') || normalized.includes('reserva')) return 'success';
  if (normalized.includes('payment') || normalized.includes('pag')) return 'warning';
  if (normalized.includes('tournament') || normalized.includes('torneio') || normalized.includes('match')) return 'accent';
  return 'neutral';
}

/** Central de notificações — mesma fonte do app (`users/{uid}/notifications`, criadas por
 *  Cloud Functions). Ler é live (onSnapshot); clicar numa notificação marca como lida
 *  (`read: true`, permitido pelas rules), com "marcar todas" em lote. */
@Component({
  selector: 'app-athlete-notifications',
  standalone: true,
  imports: [AtPanelShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <header class="nt-page-header">
        <div>
          <h1>Notificações</h1>
          <div class="nt-page-header-sub">
            @if (unreadCount() > 0) {
              {{ unreadCount() }} não lida{{ unreadCount() === 1 ? '' : 's' }}
            } @else {
              Tudo em dia
            }
          </div>
        </div>
        <div class="nt-page-header-spacer"></div>
        @if (unreadCount() > 0) {
          <button type="button" class="nt-mark-all" [disabled]="marking()" (click)="markAll()">
            {{ marking() ? 'Marcando…' : 'Marcar todas como lidas' }}
          </button>
        }
      </header>

      <div class="nt-body">
        @if (loading()) {
          <div class="nt-empty">Carregando notificações…</div>
        } @else if (error()) {
          <div class="nt-empty">Não foi possível carregar as notificações agora. Tente de novo em instantes.</div>
        } @else {
          <div class="nt-list" role="list">
            @for (n of items(); track n.id) {
              <button
                type="button"
                class="nt-item"
                role="listitem"
                [class.nt-item--unread]="n.unread"
                (click)="markRead(n)"
              >
                <span class="nt-item-dot" [class]="'nt-item-dot tone-' + toneOf(n.type)" aria-hidden="true"></span>
                <span class="nt-item-body">
                  <span class="nt-item-top">
                    <span class="nt-item-title">{{ n.title }}</span>
                    <span class="nt-item-time">{{ timeOf(n) }}</span>
                  </span>
                  @if (n.body) {
                    <span class="nt-item-text">{{ n.body }}</span>
                  }
                </span>
                @if (n.unread) {
                  <span class="nt-item-unread" aria-label="Não lida"></span>
                }
              </button>
            } @empty {
              <div class="nt-empty">
                Nenhuma notificação ainda — avisos de reservas, torneios e ranking chegam aqui.
              </div>
            }
          </div>
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .nt-page-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 28px;
      border-bottom: 1px solid var(--nx-line);
    }
    .nt-page-header h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .nt-page-header-sub {
      margin-top: 3px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .nt-page-header-spacer {
      flex: 1;
    }
    .nt-mark-all {
      height: 34px;
      padding: 0 14px;
      border-radius: 10px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
    }
    .nt-mark-all:hover:not(:disabled) {
      color: var(--nx-text);
      border-color: var(--nx-orange-500);
    }
    .nt-mark-all:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .nt-body {
      padding: 20px 28px 32px;
      max-width: 720px;
    }
    .nt-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .nt-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
      text-align: left;
      padding: 14px 16px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      cursor: pointer;
      transition: border-color 140ms ease-out;
    }
    .nt-item:hover {
      border-color: var(--nx-line-strong);
    }
    .nt-item--unread {
      background: var(--nx-surface-1);
      border-color: rgba(255, 106, 26, 0.22);
    }
    .nt-item-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex: none;
      margin-top: 5px;
    }
    .nt-item-dot.tone-success { background: var(--nx-win); }
    .nt-item-dot.tone-warning { background: var(--nx-pending); }
    .nt-item-dot.tone-accent { background: var(--nx-orange-500); }
    .nt-item-dot.tone-neutral { background: var(--nx-text-dim); }
    .nt-item-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nt-item-top {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .nt-item-title {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .nt-item-time {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
    .nt-item-text {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      line-height: 1.45;
    }
    .nt-item-unread {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      flex: none;
      margin-top: 6px;
    }
    .nt-empty {
      padding: 28px 16px;
      border-radius: var(--nx-r-4);
      border: 1px dashed var(--nx-line-strong);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      text-align: center;
    }
  `,
})
export class AthleteNotificationsComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly marking = signal(false);
  protected readonly items = signal<AthleteNotification[]>([]);

  protected readonly unreadCount = computed(() => this.items().filter((n) => n.unread).length);
  protected readonly toneOf = toneOf;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user || !this.firestore) {
        this.items.set([]);
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      const stop = watchNotifications(
        this.firestore,
        user.uid,
        (items) => {
          this.items.set(items);
          this.loading.set(false);
          this.error.set(false);
        },
        () => {
          this.loading.set(false);
          this.error.set(true);
        },
      );
      onCleanup(() => stop());
    });
  }

  protected timeOf(n: AthleteNotification): string {
    return relativeTime(n.createdAt);
  }

  protected markRead(n: AthleteNotification): void {
    const user = this.auth.user();
    if (!user || !this.firestore || n.read) return;
    void markNotificationRead(this.firestore, user.uid, n.id).catch(() => {
      // onSnapshot re-sincroniza o estado real; falha pontual não precisa de banner.
    });
  }

  protected async markAll(): Promise<void> {
    const user = this.auth.user();
    if (!user || !this.firestore || this.marking()) return;
    const ids = this.items().filter((n) => n.unread).map((n) => n.id);
    this.marking.set(true);
    try {
      await markAllNotificationsRead(this.firestore, user.uid, ids);
    } finally {
      this.marking.set(false);
    }
  }
}
