import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { matchLiveCurrentSet, matchSetWins } from '../painel/data/live-set-display';
import type { TournamentMatch } from '../painel/data/matches-repository';
import { spTimeLabel } from '../painel/data/schedule-format';
import type { CourtNowKind } from '../painel/telao/telao-selectors';

/** Uma quadra na página pública: quem está jogando, com placar ao vivo; ou a próxima partida
 *  com horário; ou quadra livre. Apresentacional puro — tudo entra por input. */
@Component({
  selector: 'pub-court-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="pub-court-head">
      <span class="pub-court-name">{{ courtName() }}</span>
      @if (kind() === 'live') {
        <span class="pub-court-live"><span class="pub-dot"></span>AO VIVO</span>
      } @else if (kind() === 'next' && time()) {
        <span class="pub-court-when">{{ time() }}</span>
      } @else if (kind() === 'free') {
        <span class="pub-court-free">Quadra livre</span>
      }
    </header>

    @if (match(); as m) {
      @if (categoryLabel()) {
        <span class="pub-court-cat">{{ categoryLabel() }}</span>
      }
      <div class="pub-court-teams">
        <div class="pub-court-team">
          <span class="pub-court-team-name">{{ m.team1Label }}</span>
          <span class="pub-court-score">
            <span class="pub-court-sets">{{ setsA() }}</span>
            @if (current(); as c) {
              <span class="pub-court-points">{{ c.a }}</span>
            }
          </span>
        </div>
        <div class="pub-court-team">
          <span class="pub-court-team-name">{{ m.team2Label }}</span>
          <span class="pub-court-score">
            <span class="pub-court-sets">{{ setsB() }}</span>
            @if (current(); as c) {
              <span class="pub-court-points">{{ c.b }}</span>
            }
          </span>
        </div>
      </div>
    } @else {
      <p class="pub-court-empty">Sem jogo por enquanto.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
    }
    .pub-court-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .pub-court-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
    }
    .pub-court-live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--nx-live);
    }
    .pub-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-live);
    }
    .pub-court-when,
    .pub-court-free,
    .pub-court-cat,
    .pub-court-empty {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-court-teams {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pub-court-team {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .pub-court-team-name {
      font-size: 14px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .pub-court-score {
      display: inline-flex;
      align-items: baseline;
      gap: 10px;
      font-family: var(--nx-font-mono);
    }
    .pub-court-sets {
      font-size: 14px;
      color: var(--nx-text-mute);
    }
    .pub-court-points {
      font-size: 20px;
      font-weight: 700;
    }
  `,
})
export class PublicCourtCardComponent {
  readonly courtName = input.required<string>();
  readonly kind = input.required<CourtNowKind>();
  readonly match = input<TournamentMatch | null>(null);
  readonly categoryLabel = input('');

  private readonly setWins = computed<[number, number]>(() => {
    const m = this.match();
    return m ? matchSetWins(m) : [0, 0];
  });

  protected readonly setsA = computed(() => this.setWins()[0]);
  protected readonly setsB = computed(() => this.setWins()[1]);

  protected readonly current = computed(() => {
    const m = this.match();
    return m ? matchLiveCurrentSet(m) : null;
  });

  protected readonly time = computed(() => {
    const at = this.match()?.scheduledAt;
    return at ? spTimeLabel(at) : '';
  });
}
