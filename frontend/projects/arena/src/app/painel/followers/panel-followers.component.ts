import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { resolveAthleteLabel } from '../bookings/bookings-repository';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { formatFollowerSince, isNewFollower, type ArenaFollower } from './arena-follower.model';
import { watchFollowers } from './followers-repository';

/** Tela Seguidores: quem favoritou/segue a arena (`arenas/{id}/followers`) — espelha
 *  `ArenaFollowersPage` (Flutter). Somente leitura: seguir/deixar de seguir é sempre uma
 *  ação do atleta, nunca do gestor. */
@Component({
  selector: 'ar-panel-followers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Seguidores" [subtitle]="headerSubtitle()" />

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando seguidores…</p>
          </ar-panel-card>
        } @else {
          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Seguidores</div>
              <div class="summary-value">{{ followers().length }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Novos (últimos 7 dias)</div>
              <div class="summary-value tone-green">{{ newCount() }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="listKicker()" title="Atletas que seguem sua arena" class="list-card">
            @if (followers().length === 0) {
              <p class="state-text empty-text">Ainda não há seguidores para esta arena.</p>
            } @else {
              <div class="follower-list">
                @for (f of followers(); track f.userId) {
                  <div class="follower-row">
                    <div class="follower-avatar">{{ initialsOf(athleteLabel(f.userId)) }}</div>
                    <div class="follower-who">
                      <div class="follower-name">{{ athleteLabel(f.userId) }}</div>
                      <div class="follower-since">Segue desde {{ formatSince(f.createdAt) }}</div>
                    </div>
                    <div class="spacer"></div>
                    @if (isNew(f)) {
                      <ar-pill tone="orange">Novo seguidor</ar-pill>
                    }
                  </div>
                }
              </div>
            }
          </ar-panel-card>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .empty-text {
      margin: 12px 0;
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .summary-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .summary-label.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .summary-value.tone-green {
      color: var(--nx-win);
    }

    .list-card {
      flex: 1;
      min-height: 0;
    }

    .follower-list {
      display: flex;
      flex-direction: column;
    }

    .follower-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .follower-row:last-child {
      border-bottom: none;
    }

    .follower-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      flex: none;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-orange-500);
    }

    .follower-who {
      min-width: 0;
    }

    .follower-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .follower-since {
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .spacer {
      flex: 1;
    }

    @media (max-width: 1180px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelFollowersComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly formatSince = formatFollowerSince;
  protected readonly isNew = isNewFollower;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly loading = signal(true);
  protected readonly followers = signal<ArenaFollower[]>([]);
  protected readonly athleteLabels = signal<Record<string, string>>({});

  protected readonly newCount = computed(() => this.followers().filter((f) => isNewFollower(f)).length);
  protected readonly listKicker = computed(() => `${this.followers().length} registros`);
  protected readonly headerSubtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · atletas que seguem sua arena`);

  private unsubscribeFollowers: (() => void) | null = null;

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubscribeFollowers?.();
      this.unsubscribeFollowers = null;
      if (!arenaId) return;

      this.loading.set(true);
      const db = arenaFirestore();
      this.unsubscribeFollowers = watchFollowers(db, arenaId, (list) => {
        this.followers.set(list);
        this.loading.set(false);
        this.resolveMissingAthleteLabels(list);
      });
    });
  }

  private resolveMissingAthleteLabels(list: ArenaFollower[]): void {
    const known = this.athleteLabels();
    const missing = new Set(list.map((f) => f.userId).filter((id) => id && !(id in known)));
    if (missing.size === 0) return;
    const db = arenaFirestore();
    for (const userId of missing) {
      void resolveAthleteLabel(db, userId).then((label) => {
        this.athleteLabels.update((current) => ({ ...current, [userId]: label }));
      });
    }
  }

  protected athleteLabel(userId: string): string {
    return this.athleteLabels()[userId] ?? 'Carregando…';
  }

  protected initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0]![0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
    return (first + last).toUpperCase();
  }
}
