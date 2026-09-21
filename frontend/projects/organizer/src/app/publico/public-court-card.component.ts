import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { matchLiveCurrentSet, matchSetWins } from '../painel/data/live-set-display';
import {
  kocHasStarted,
  kocIsExpired,
  kocPointsOf,
  kocRemainingLabel,
} from '../painel/data/koc';
import type { TournamentMatch } from '../painel/data/matches-repository';
import { spTimeLabel } from '../painel/data/schedule-format';
import type { CourtNowKind } from '../painel/telao/telao-selectors';

/** Uma quadra na página pública: quem está jogando, com placar ao vivo; ou a próxima partida
 *  com horário; ou quadra livre. Apresentacional puro — tudo entra por input.
 *
 *  Rodada King of the Court não tem dois lados: mostra trono × desafiante + pts
 *  e o relógio da rodada (variante compacta do telão). */
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
      @if (koc(); as round) {
        @if (kocClock(); as clock) {
          <div class="pub-koc-clock" [class.expired]="kocExpired()">{{ clock }}</div>
        }
        @if (round.kingTeamId && round.challengerTeamId) {
          <div class="pub-koc-sides">
            <div class="pub-koc-side throne">
              <span class="pub-koc-role">No trono</span>
              <span class="pub-koc-name">{{ kocKingLabel() }}</span>
              <span class="pub-koc-pts">{{ kocPoints(round.kingTeamId) }} pts</span>
            </div>
            <span class="pub-koc-vs">vs</span>
            <div class="pub-koc-side">
              <span class="pub-koc-role">Desafiante</span>
              <span class="pub-koc-name">{{ kocChallengerLabel() }}</span>
              <span class="pub-koc-pts">{{ kocPoints(round.challengerTeamId) }} pts</span>
            </div>
          </div>
        } @else {
          <p class="pub-court-empty">{{ kocRosterHint() }}</p>
        }
      } @else {
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
      }
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

    .pub-koc-clock {
      font-family: var(--nx-font-mono);
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .pub-koc-clock.expired {
      color: var(--nx-live);
    }
    .pub-koc-sides {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      align-items: center;
    }
    .pub-koc-side {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px;
      border-radius: 8px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .pub-koc-side.throne {
      border-color: rgba(255, 106, 26, 0.45);
      background: rgba(255, 106, 26, 0.08);
    }
    .pub-koc-role {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .pub-koc-side.throne .pub-koc-role {
      color: var(--nx-brand);
    }
    .pub-koc-name {
      font-size: 13px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .pub-koc-pts {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .pub-koc-vs {
      font-size: 11px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }
  `,
})
export class PublicCourtCardComponent {
  readonly courtName = input.required<string>();
  readonly kind = input.required<CourtNowKind>();
  readonly match = input<TournamentMatch | null>(null);
  readonly categoryLabel = input('');
  /** Nomes curtos por teamId — só usados na variante KOTC. */
  readonly teamNames = input<ReadonlyMap<string, string>>(new Map());
  /** Relógio do host (ms) — sem ele o cronômetro KOTC congela. */
  readonly nowMs = input(Date.now());

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

  protected readonly koc = computed(() => this.match()?.koc ?? null);

  protected kocPoints(teamId: string): number {
    const round = this.koc();
    return round ? kocPointsOf(round, teamId) : 0;
  }

  protected kocKingLabel(): string {
    const id = this.koc()?.kingTeamId ?? '';
    return this.teamNames().get(id) ?? 'Dupla';
  }

  protected kocChallengerLabel(): string {
    const id = this.koc()?.challengerTeamId ?? '';
    return this.teamNames().get(id) ?? 'Dupla';
  }

  protected kocClock(): string | null {
    const round = this.koc();
    if (!round?.clock || !kocHasStarted(round)) return null;
    return kocIsExpired(round.clock, this.nowMs()) ? 'TEMPO!' : kocRemainingLabel(round.clock, this.nowMs());
  }

  protected kocExpired(): boolean {
    const clock = this.koc()?.clock;
    return clock != null && kocIsExpired(clock, this.nowMs());
  }

  protected kocRosterHint(): string {
    const round = this.koc();
    if (!round) return 'Sem jogo por enquanto.';
    if (round.teamIds.length === 0) return 'Elenco a definir.';
    return `${round.teamIds.length} duplas na rodada`;
  }
}
