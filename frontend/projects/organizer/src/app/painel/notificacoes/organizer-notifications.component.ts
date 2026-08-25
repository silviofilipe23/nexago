import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { organizerFirestore } from '../data/firestore';
import {
  markAllNotificationsRead,
  markNotificationRead,
  watchNotifications,
  type OrganizerNotification,
} from '../data/notifications-repository';
import { OgPageHeaderComponent } from '../ui/page-header.component';

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
  if (normalized.includes('cancel')) return 'warning';
  if (normalized.includes('pag')) return 'success';
  if (normalized.includes('tournament') || normalized.includes('torneio') || normalized.includes('liga')) return 'accent';
  return 'neutral';
}

/** Central de notificações do organizador — mesma coleção do app e do atleta
 *  (`users/{uid}/notifications`, criadas por Cloud Functions: nova inscrição, pagamento
 *  declarado/confirmado, pedido de cancelamento). Ler é live (onSnapshot); clicar numa
 *  notificação marca como lida e, se ela tiver um destino (`data.url`), navega pra lá. */
@Component({
  selector: 'og-notificacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, NxPageLoadingComponent, NxSpinnerComponent],
  template: `
    <og-page-header title="Notificações" [subtitle]="headerSubtitle()">
      @if (unreadCount() > 0) {
        <button type="button" class="og-mini-btn" [disabled]="marking()" (click)="markAll()">
          @if (marking()) {
            <app-nx-spinner [size]="12" />
          }
          {{ marking() ? 'Marcando…' : 'Marcar todas como lidas' }}
        </button>
      }
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <app-nx-page-loading title="Carregando notificações…" />
      } @else if (error()) {
        <div class="og-nt-empty">Não foi possível carregar as notificações agora. Tente de novo em instantes.</div>
      } @else {
        <div class="og-nt-list" role="list">
          @for (n of items(); track n.id) {
            <button
              type="button"
              class="og-nt-item"
              role="listitem"
              [class.og-nt-item--unread]="n.unread"
              (click)="open(n)"
            >
              <span class="og-nt-item-dot" [class]="'og-nt-item-dot tone-' + toneOf(n.type)" aria-hidden="true"></span>
              <span class="og-nt-item-body">
                <span class="og-nt-item-top">
                  <span class="og-nt-item-title">{{ n.title }}</span>
                  <span class="og-nt-item-time">{{ timeOf(n) }}</span>
                </span>
                @if (n.body) {
                  <span class="og-nt-item-text">{{ n.body }}</span>
                }
              </span>
              @if (n.unread) {
                <span class="og-nt-item-unread" aria-label="Não lida"></span>
              }
            </button>
          } @empty {
            <div class="og-nt-empty">
              Nenhuma notificação ainda — avisos de inscrições, pagamentos e cancelamentos chegam aqui.
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .og-nt-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 720px;
    }
    .og-nt-item {
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
    .og-nt-item:hover {
      border-color: var(--nx-line-strong);
    }
    .og-nt-item--unread {
      background: var(--nx-surface-1);
      border-color: rgba(255, 106, 26, 0.22);
    }
    .og-nt-item-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex: none;
      margin-top: 5px;
    }
    .og-nt-item-dot.tone-success { background: var(--nx-win); }
    .og-nt-item-dot.tone-warning { background: var(--nx-pending); }
    .og-nt-item-dot.tone-accent { background: var(--nx-orange-500); }
    .og-nt-item-dot.tone-neutral { background: var(--nx-text-dim); }
    .og-nt-item-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .og-nt-item-top {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .og-nt-item-title {
      flex: 1;
      min-width: 0;
      overflow-wrap: break-word;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-nt-item-time {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
    .og-nt-item-text {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      line-height: 1.45;
    }
    .og-nt-item-unread {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      flex: none;
      margin-top: 6px;
    }
    .og-nt-empty {
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
export class OrganizerNotificationsComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly firestore = organizerFirestore();

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly marking = signal(false);
  protected readonly items = signal<OrganizerNotification[]>([]);

  protected readonly unreadCount = computed(() => this.items().filter((n) => n.unread).length);
  protected readonly toneOf = toneOf;

  protected readonly headerSubtitle = computed(() => {
    const n = this.unreadCount();
    return n > 0 ? `${n} não lida${n === 1 ? '' : 's'}` : 'Tudo em dia';
  });

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user) {
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

  protected timeOf(n: OrganizerNotification): string {
    return relativeTime(n.createdAt);
  }

  protected open(n: OrganizerNotification): void {
    const user = this.auth.user();
    if (user && !n.read) {
      void markNotificationRead(this.firestore, user.uid, n.id).catch(() => {
        // onSnapshot re-sincroniza o estado real; falha pontual não precisa de banner.
      });
    }
    if (n.url) {
      void this.router.navigateByUrl(n.url);
    }
  }

  protected async markAll(): Promise<void> {
    const user = this.auth.user();
    if (!user || this.marking()) return;
    const ids = this.items().filter((n) => n.unread).map((n) => n.id);
    this.marking.set(true);
    try {
      await markAllNotificationsRead(this.firestore, user.uid, ids);
    } finally {
      this.marking.set(false);
    }
  }
}
