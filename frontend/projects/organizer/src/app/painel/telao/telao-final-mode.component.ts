import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { matchClosedSets, matchLiveCurrentSet, matchSetWins } from '../data/live-set-display';
import type { TournamentMatch } from '../data/matches-repository';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgPulseDirective } from './og-pulse.directive';
import { TelaoChampionsComponent } from './telao-champions.component';
import type { TelaoTeamDisplay } from './telao-data.service';
import { pointAlertOf, type FinalKind } from './telao-final-mode';

const ORDINAL = ['1º', '2º', '3º', '4º', '5º'];

/** Modo GRANDE FINAL: a tela inteira do telão dedicada à partida decisiva — duplas frente a
 *  frente, placar gigante, alerta de match point e, no fim, a tela de campeões. Dourado na
 *  final/grand final, bronze na disputa de 3º lugar. */
@Component({
  selector: 'og-telao-final-mode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OgPulseDirective, TelaoChampionsComponent],
  host: { class: 'og-fm', '[class.bronze]': 'kind() === "third-place"' },
  template: `
    <span class="og-fm-corner tl"></span><span class="og-fm-corner tr"></span>
    <span class="og-fm-corner bl"></span><span class="og-fm-corner br"></span>

    <header class="og-fm-head">
      <p class="og-fm-event"><span class="og-fm-mark">N</span>{{ eventLine() }}</p>
      <h1 class="og-fm-title">{{ kind() === 'third-place' ? 'DISPUTA DE 3º LUGAR' : 'GRANDE FINAL' }}</h1>
      <p class="og-fm-sub"><i></i>{{ categoryLine() }}<i></i></p>
    </header>

    <div class="og-fm-body">
      @for (row of rows(); track row.side) {
        <section class="og-fm-team">
          <span class="og-fm-avatars">
            @for (p of row.team?.players ?? []; track $index) {
              <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="110" />
            }
          </span>
          <p class="og-fm-name">{{ row.team?.short ?? '—' }}</p>
          @if (serving() === row.side) {
            <p class="og-fm-serve"><span></span>Saque</p>
          } @else {
            <p class="og-fm-players">{{ row.team?.sub ?? '' }}</p>
          }
          <span class="og-fm-points" [class.hot]="serving() === row.side" [ogPulse]="points(row.side)">{{ points(row.side) }}</span>
        </section>

        @if (row.side === 'A') {
          <section class="og-fm-center">
            <p class="og-fm-setlabel">{{ setLabel() }}</p>
            <p class="og-fm-sets">{{ setsWon()[0] }}<i>–</i>{{ setsWon()[1] }}</p>
            <span class="og-fm-chips">
              @for (s of closedSets(); track $index) {
                <span class="og-fm-chip">{{ ORDINAL[$index] }} set <strong>{{ s.a }}-{{ s.b }}</strong></span>
              }
            </span>
            @if (alert(); as a) {
              <span class="og-fm-alert">{{ a.kind === 'match' ? 'MATCH POINT' : 'SET POINT' }}</span>
            }
          </section>
        }
      }
    </div>

    <footer class="og-fm-foot">
      <span class="og-fm-foot-live"><span class="og-dot og-dot-red og-dot-pulse"></span>Ao vivo</span>
      <span class="og-fm-foot-court">{{ courtLabel() }} · {{ clock() }}</span>
      <span class="og-fm-foot-share">Compartilhe · <strong>{{ hashtag() }}</strong> · &#64;nexago.app</span>
      <span class="og-fm-foot-logo">nexa<em>GO</em></span>
    </footer>

    @if (state() === 'champions') {
      <og-telao-champions [kind]="kind()" [team]="winnerTeam()" [setsLabel]="championSets()" [eventLine]="championEvent()" [hashtag]="hashtag()" />
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      padding: 44px 64px 0;
      overflow: hidden;
      animation: og-fm-in 560ms var(--nx-ease-out);
      --fm-a: #f4c543;
      --fm-b: #ffe89a;
      --fm-glow: rgba(244, 197, 67, 0.3);
    }
    :host(.bronze) {
      --fm-a: #c87f4a;
      --fm-b: #e9b98d;
      --fm-glow: rgba(200, 127, 74, 0.3);
    }
    :host::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(118deg, transparent 34%, rgba(255, 232, 154, 0.07) 50%, transparent 66%);
      pointer-events: none;
    }
    .og-fm-corner {
      position: absolute;
      width: 54px;
      height: 54px;
      border: 2px solid rgba(244, 197, 67, 0.42);
    }
    .og-fm-corner.tl { top: 26px; left: 30px; border-right: 0; border-bottom: 0; }
    .og-fm-corner.tr { top: 26px; right: 30px; border-left: 0; border-bottom: 0; }
    .og-fm-corner.bl { bottom: 26px; left: 30px; border-right: 0; border-top: 0; }
    .og-fm-corner.br { bottom: 26px; right: 30px; border-left: 0; border-top: 0; }

    .og-fm-head {
      text-align: center;
      flex: none;
      animation: og-fm-rise 620ms var(--nx-ease-out) 80ms both;
    }
    .og-fm-event {
      margin: 0 0 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-family: var(--nx-font-mono);
      font-size: 16px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-fm-mark {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 17px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      letter-spacing: 0;
    }
    .og-fm-title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 132px;
      line-height: 0.95;
      letter-spacing: -0.015em;
      background: linear-gradient(180deg, var(--fm-b) 0%, var(--fm-a) 58%, #a97a1e 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      filter: drop-shadow(0 0 40px var(--fm-glow));
    }
    :host(.bronze) .og-fm-title {
      font-size: 96px;
    }
    .og-fm-sub {
      margin: 12px 0 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 18px;
      font-family: var(--nx-font-mono);
      font-size: 16px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-fm-sub i {
      width: 108px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(244, 197, 67, 0.55));
    }
    .og-fm-sub i:last-child {
      background: linear-gradient(90deg, rgba(244, 197, 67, 0.55), transparent);
    }

    .og-fm-body {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 380px 1fr;
      align-items: center;
      gap: 24px;
      min-height: 0;
    }
    .og-fm-team {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      animation: og-fm-rise 700ms var(--nx-ease-out) 160ms both;
    }
    .og-fm-avatars {
      display: inline-flex;
    }
    .og-fm-avatars og-avatar {
      border: 3px solid rgba(255, 255, 255, 0.08);
    }
    .og-fm-avatars og-avatar + og-avatar {
      margin-left: -30px;
    }
    .og-fm-name {
      margin: 8px 0 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 62px;
      line-height: 1.05;
      text-align: center;
    }
    .og-fm-players {
      margin: 0;
      font-family: var(--nx-font-mono);
      font-size: 16px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-fm-serve {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 9px;
      font-family: var(--nx-font-mono);
      font-size: 16px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--fm-a);
    }
    .og-fm-serve span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--fm-a);
    }
    .og-fm-points {
      margin-top: 18px;
      width: 300px;
      height: 216px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 132px;
      font-variant-numeric: tabular-nums;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: 26px;
      transition: border-color var(--nx-d-base) var(--nx-ease-out), box-shadow var(--nx-d-base) var(--nx-ease-out);
    }
    .og-fm-points.hot {
      border-color: rgba(244, 197, 67, 0.55);
      box-shadow: 0 0 46px rgba(244, 197, 67, 0.16);
    }
    .og-fm-points.og-pulse-run {
      animation: og-fm-pop 320ms var(--nx-ease-out);
    }

    .og-fm-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      animation: og-fm-rise 700ms var(--nx-ease-out) 240ms both;
    }
    .og-fm-setlabel {
      margin: 0;
      font-family: var(--nx-font-mono);
      font-size: 15px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-fm-sets {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 18px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 96px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .og-fm-sets i {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-fm-chips {
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: center;
    }
    .og-fm-chip {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-pill);
      padding: 7px 16px;
    }
    .og-fm-chip strong {
      color: var(--nx-text);
    }
    .og-fm-alert {
      margin-top: 6px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 21px;
      letter-spacing: 0.2em;
      color: var(--fm-a);
      border: 2px solid var(--fm-a);
      border-radius: var(--nx-r-pill);
      padding: 12px 26px;
      animation: og-fm-alert 1.3s ease-in-out infinite;
    }

    .og-fm-foot {
      flex: none;
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 22px 0 30px;
      font-family: var(--nx-font-mono);
      font-size: 15px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-fm-foot-live {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      color: var(--nx-live);
    }
    .og-fm-foot-share {
      margin-left: auto;
      color: var(--nx-text-mute);
    }
    .og-fm-foot-share strong {
      color: var(--fm-a);
    }
    .og-fm-foot-logo {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: 0;
      text-transform: none;
      color: var(--nx-text);
    }
    .og-fm-foot-logo em {
      font-style: normal;
      color: var(--nx-orange-500);
    }

    @keyframes og-fm-in {
      from { opacity: 0; transform: scale(0.985); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes og-fm-rise {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes og-fm-pop {
      0% { transform: scale(1); }
      38% { transform: scale(1.09); color: var(--fm-a); }
      100% { transform: scale(1); }
    }
    @keyframes og-fm-alert {
      0%, 100% { box-shadow: 0 0 0 rgba(244, 197, 67, 0); }
      50% { box-shadow: 0 0 34px var(--fm-glow); }
    }
    @media (prefers-reduced-motion: reduce) {
      :host, .og-fm-head, .og-fm-team, .og-fm-center, .og-fm-alert, .og-fm-points.og-pulse-run {
        animation: none;
      }
      .og-fm-points {
        transition: none;
      }
    }
  `,
})
export class TelaoFinalModeComponent {
  readonly match = input.required<TournamentMatch>();
  readonly kind = input.required<FinalKind>();
  readonly state = input.required<'live' | 'champions'>();
  readonly teamA = input<TelaoTeamDisplay | null>(null);
  readonly teamB = input<TelaoTeamDisplay | null>(null);
  /** "Liga Municipal de Beach Tennis · Arena Beira-Rio". */
  readonly eventLine = input('');
  /** "Open Misto · Melhor de 3 sets". */
  readonly categoryLine = input('');
  readonly courtLabel = input('');
  readonly clock = input('');

  protected readonly ORDINAL = ORDINAL;

  protected readonly hashtag = computed(() => (this.kind() === 'third-place' ? '#nexaGO' : '#GrandeFinalNexaGO'));

  protected readonly rows = computed(() => [
    { side: 'A' as const, team: this.teamA() },
    { side: 'B' as const, team: this.teamB() },
  ]);

  private readonly current = computed(() => matchLiveCurrentSet(this.match()));
  protected readonly closedSets = computed(() => matchClosedSets(this.match()));
  protected readonly setsWon = computed(() => matchSetWins(this.match()));
  protected readonly alert = computed(() => (this.state() === 'live' ? pointAlertOf(this.match()) : null));

  protected readonly setLabel = computed(() => {
    const n = this.current()?.setNumber ?? this.closedSets().length;
    return `${ORDINAL[Math.max(0, n - 1)] ?? `${n}º`} set`;
  });

  protected readonly serving = computed<'A' | 'B' | null>(() => {
    const m = this.match();
    if (this.state() !== 'live' || !m.servingTeamId) return null;
    if (m.servingTeamId === m.teamAId) return 'A';
    if (m.servingTeamId === m.teamBId) return 'B';
    return null;
  });

  protected readonly winnerTeam = computed(() => {
    const m = this.match();
    return m.winnerSide === 1 ? this.teamA() : m.winnerSide === 2 ? this.teamB() : null;
  });

  protected readonly championSets = computed(() =>
    this.closedSets()
      .map((s) => `${s.a}-${s.b}`)
      .join(' · '),
  );

  protected readonly championEvent = computed(() => [this.eventLine().split(' · ')[0], this.categoryLine().split(' · ')[0]].filter(Boolean).join(' · '));

  protected points(side: 'A' | 'B'): number {
    const c = this.current();
    if (c) return side === 'A' ? c.a : c.b;
    const last = this.closedSets().at(-1);
    return last ? (side === 'A' ? last.a : last.b) : 0;
  }
}
