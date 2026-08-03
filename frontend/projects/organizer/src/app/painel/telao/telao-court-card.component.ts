import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { matchClosedSets, matchLiveCurrentSet } from '../data/live-set-display';
import type { TournamentMatch } from '../data/matches-repository';
import { initialsOf } from '../data/mock-data';
import { spDayLabel, spTimeLabel } from '../data/schedule-format';
import { OgAvatarComponent } from '../ui/avatar.component';
import type { TelaoTeamDisplay } from './telao-data.service';

/** Card de uma quadra no telão: partida ao vivo (avatares, sets fechados, pontos do set
 *  corrente e indicador de saque), próxima partida ("em seguida") ou quadra livre. */
@Component({
  selector: 'og-telao-court-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent],
  host: { class: 'og-tlc', '[class.og-tlc-live]': 'kind() === "live"' },
  template: `
    <header class="og-tlc-head">
      <span class="og-tlc-court">{{ courtName() }}</span>
      @if (categoryLabel()) {
        <span class="og-tlc-cat">{{ categoryLabel() }}</span>
      }
      <span class="og-tlc-flex"></span>
      @switch (kind()) {
        @case ('live') {
          <span class="og-tlc-badge live"><span class="og-dot og-dot-red og-dot-pulse"></span>Ao vivo</span>
        }
        @case ('next') {
          <span class="og-tlc-badge next">Em seguida{{ nextTimeLabel() ? ' · ' + nextTimeLabel() : '' }}</span>
        }
      }
    </header>

    @if (kind() === 'free') {
      <div class="og-tlc-free">Quadra livre</div>
    } @else {
      <div class="og-tlc-teams">
        @for (row of rows(); track row.side) {
          <div class="og-tlc-team">
            @if (showAvatars()) {
              <span class="og-tlc-avatars">
                @if (row.team.players.length > 0) {
                  @for (p of row.team.players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="52" />
                  }
                } @else {
                  <og-avatar [initials]="fallbackInitials(row.team.label)" [size]="52" />
                }
              </span>
            }
            <span class="og-tlc-names">
              <span class="og-tlc-short">
                {{ row.team.short }}
                @if (servingSide() === row.side) {
                  <span class="og-tlc-serve" title="No saque"></span>
                }
              </span>
              @if (row.team.sub) {
                <span class="og-tlc-sub">{{ row.team.sub }}</span>
              }
            </span>
            @if (kind() === 'live') {
              <span class="og-tlc-score">
                @for (s of closedSets(); track $index) {
                  <span class="og-tlc-set" [class.win]="row.side === 'A' ? s.a > s.b : s.b > s.a">{{ row.side === 'A' ? s.a : s.b }}</span>
                }
                @if (current(); as c) {
                  <span class="og-tlc-points">{{ row.side === 'A' ? c.a : c.b }}</span>
                }
              </span>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 26px 30px;
      gap: 18px;
    }
    :host(.og-tlc-live) {
      border-color: rgba(255, 59, 48, 0.35);
    }
    .og-tlc-head {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .og-tlc-court {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
      flex: none;
    }
    .og-tlc-cat {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .og-tlc-flex {
      flex: 1;
    }
    .og-tlc-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-mono);
      font-size: 14px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 7px 14px;
      border-radius: var(--nx-r-pill);
      align-self: center;
      white-space: nowrap;
      flex: none;
    }
    .og-tlc-badge.live {
      color: var(--nx-live);
      border: 1px solid rgba(255, 59, 48, 0.4);
      background: rgba(255, 59, 48, 0.08);
    }
    .og-tlc-badge.next {
      color: var(--nx-orange-400);
      border: 1px solid rgba(255, 106, 26, 0.4);
      background: var(--nx-orange-tint);
    }
    .og-tlc-free {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--nx-text-dim);
      font-size: 20px;
    }
    .og-tlc-teams {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
    }
    .og-tlc-team {
      display: flex;
      align-items: center;
      gap: 18px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 16px 20px;
      min-height: 88px;
    }
    .og-tlc-avatars {
      display: inline-flex;
      flex: none;
    }
    .og-tlc-avatars og-avatar {
      border: 2px solid var(--nx-surface-1);
    }
    .og-tlc-avatars og-avatar + og-avatar {
      margin-left: -14px;
    }
    .og-tlc-names {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }
    .og-tlc-short {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 26px;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-tlc-serve {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      margin-left: 6px;
      vertical-align: middle;
    }
    .og-tlc-sub {
      font-size: 15px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-tlc-score {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex: none;
    }
    .og-tlc-set {
      font-family: var(--nx-font-mono);
      font-size: 24px;
      font-variant-numeric: tabular-nums;
      color: var(--nx-text-dim);
      min-width: 44px;
      height: 52px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 0 8px;
    }
    .og-tlc-set.win {
      color: var(--nx-orange-400);
      border-color: rgba(255, 106, 26, 0.45);
    }
    .og-tlc-points {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 34px;
      font-variant-numeric: tabular-nums;
      min-width: 72px;
      height: 64px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      padding: 0 12px;
    }
  `,
})
export class TelaoCourtCardComponent {
  readonly courtName = input.required<string>();
  readonly kind = input.required<'live' | 'next' | 'free'>();
  readonly match = input<TournamentMatch | null>(null);
  readonly categoryLabel = input('');
  readonly teamA = input<TelaoTeamDisplay | null>(null);
  readonly teamB = input<TelaoTeamDisplay | null>(null);
  readonly showAvatars = input(true);

  protected readonly rows = computed(() => {
    const a = this.teamA();
    const b = this.teamB();
    if (!a || !b) return [];
    return [
      { side: 'A' as const, team: a },
      { side: 'B' as const, team: b },
    ];
  });

  protected readonly closedSets = computed(() => {
    const m = this.match();
    return m && this.kind() === 'live' ? matchClosedSets(m) : [];
  });

  protected readonly current = computed(() => {
    const m = this.match();
    return m && this.kind() === 'live' ? matchLiveCurrentSet(m) : null;
  });

  protected readonly servingSide = computed<'A' | 'B' | null>(() => {
    const m = this.match();
    if (!m || this.kind() !== 'live' || !m.servingTeamId) return null;
    if (m.servingTeamId === m.teamAId) return 'A';
    if (m.servingTeamId === m.teamBId) return 'B';
    return null;
  });

  /** "Em seguida · 15:30" (com o dia junto quando o jogo não é hoje na parede SP). */
  protected readonly nextTimeLabel = computed(() => {
    const d = this.match()?.scheduledAt;
    if (!d) return null;
    const today = spDayLabel(new Date());
    return spDayLabel(d) === today ? spTimeLabel(d) : `${spDayLabel(d)} ${spTimeLabel(d)}`;
  });

  protected fallbackInitials(label: string): string {
    return initialsOf(label.split(' / ').join(' ')) || '—';
  }
}
