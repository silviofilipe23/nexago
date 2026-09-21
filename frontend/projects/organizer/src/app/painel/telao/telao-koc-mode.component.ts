import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TournamentMatch } from '../data/matches-repository';
import {
  kocFinalTable,
  kocHasQualifyingTie,
  kocHasStarted,
  kocIsExpired,
  kocLiveOrder,
  kocPhaseLabel,
  kocPointsOf,
  kocRemainingLabel,
  type KocRoundState,
} from '../data/koc';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgPulseDirective } from './og-pulse.directive';
import type { TelaoTeamDisplay } from './telao-data.service';

interface KocTableRow {
  teamId: string;
  place: number;
  name: string;
  points: number | null;
  role: 'trono' | 'desafia' | 'fila' | '';
  qualifies: boolean;
}

interface KocQueueCard {
  teamId: string;
  place: number;
  name: string;
  points: number;
  team: TelaoTeamDisplay | null;
}

/** Telão full-screen da rodada King of the Court — espelho do board do app
 *  (`public_koc_round_page`) e do mockup TV: trono × desafiante, tabela ao vivo,
 *  fila e legenda de pontuação. Lido DE LONGE; sem interação. */
@Component({
  selector: 'og-telao-koc-mode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OgPulseDirective],
  host: { class: 'og-koc' },
  template: `
    <header class="og-koc-head">
      <div class="og-koc-brand">
        <span class="og-koc-logo">nexa<em>GO</em></span>
        <span class="og-koc-format">KING OF THE COURT</span>
      </div>
      <div class="og-koc-event">
        <span class="og-koc-event-title">{{ eventLine() }}</span>
        <span class="og-koc-event-sub">{{ phaseLine() }}</span>
      </div>
      <div class="og-koc-timers">
        @if (clockLabel(); as clock) {
          <div class="og-koc-round-clock" [class.expired]="clockExpired()">
            <span class="og-koc-timer-kicker">TEMPO DA RODADA</span>
            <span class="og-koc-timer-value" [ogPulse]="clock">{{ clock }}</span>
            <span class="og-koc-timer-dur">DURAÇÃO {{ durationLabel() }}</span>
          </div>
        } @else {
          <div class="og-koc-round-clock waiting">
            <span class="og-koc-timer-kicker">TEMPO DA RODADA</span>
            <span class="og-koc-timer-value">{{ durationLabel() }}</span>
            <span class="og-koc-timer-dur">aguardando apito</span>
          </div>
        }
        <div class="og-koc-wall">{{ clock() }}</div>
      </div>
    </header>

    <div class="og-koc-body">
      <section class="og-koc-rally">
        <header class="og-koc-rally-head">
          <span class="og-koc-rally-title">RALLY EM QUADRA</span>
          <span class="og-koc-rally-rule">SÓ O TRONO PONTUA · COROAÇÃO NÃO VALE PONTO</span>
        </header>

        @if (onCourt(); as sides) {
          <div class="og-koc-sides">
            <article class="og-koc-side throne">
              <span class="og-koc-side-badge">● NO TRONO</span>
              <div class="og-koc-side-avatars">
                @for (p of sides.king.team?.players ?? []; track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="72" />
                }
              </div>
              <p class="og-koc-side-name">{{ sides.king.name }}</p>
              @if (sides.king.team?.sub; as sub) {
                <p class="og-koc-side-sub">{{ sub }}</p>
              }
              <p class="og-koc-side-pts" [ogPulse]="sides.king.points">
                <strong>{{ sides.king.points }}</strong> PTS NA RODADA
              </p>
            </article>

            <span class="og-koc-vs">vs</span>

            <article class="og-koc-side challenger">
              <span class="og-koc-side-badge">DESAFIANTE{{ sides.challenger.serving ? ' · SACA' : '' }}</span>
              <div class="og-koc-side-avatars">
                @for (p of sides.challenger.team?.players ?? []; track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="72" />
                }
              </div>
              <p class="og-koc-side-name">{{ sides.challenger.name }}</p>
              @if (sides.challenger.team?.sub; as sub) {
                <p class="og-koc-side-sub">{{ sub }}</p>
              }
              <p class="og-koc-side-pts">
                <strong>{{ sides.challenger.points }}</strong> PTS NA RODADA
              </p>
            </article>
          </div>
        } @else if (finished()) {
          <div class="og-koc-waiting">Rodada encerrada — veja quem avançou na tabela</div>
        } @else {
          <div class="og-koc-waiting">Elenco na fila · o trono abre no apito</div>
        }
      </section>

      <aside class="og-koc-table">
        <header class="og-koc-table-head">
          <span class="og-koc-table-title">Tabela da rodada</span>
          <span class="og-koc-table-kicker">{{ finished() ? 'Resultado final' : 'Ao vivo · atualiza a cada rally' }}</span>
        </header>
        <div class="og-koc-table-rows">
          @for (row of tableRows(); track row.teamId) {
            <div class="og-koc-table-row" [class.qualifies]="row.qualifies">
              <span class="og-koc-table-place">{{ row.place }}</span>
              <span class="og-koc-table-name">{{ row.name }}</span>
              @if (row.role) {
                <span class="og-koc-table-role" [attr.data-role]="row.role">{{ roleLabel(row.role) }}</span>
              }
              @if (row.points !== null) {
                <span class="og-koc-table-pts">{{ row.points }}</span>
              }
            </div>
          } @empty {
            <p class="og-koc-table-empty">Aguardando elenco…</p>
          }
        </div>
        @if (advanceLine(); as line) {
          <footer class="og-koc-table-foot">{{ line }}</footer>
        }
      </aside>
    </div>

    <div class="og-koc-bottom">
      <section class="og-koc-queue">
        <header class="og-koc-queue-head">
          <span class="og-koc-queue-title">{{ finished() ? 'Quem avançou' : 'Próximos na fila' }}</span>
          <span class="og-koc-queue-kicker">{{
            finished() ? 'colocação final da rodada' : 'quem perde o rally vai para o fim da fila'
          }}</span>
        </header>
        <div class="og-koc-queue-cards">
          @for (card of queueCards(); track card.teamId) {
            <article class="og-koc-queue-card">
              <span class="og-koc-queue-place">{{ card.place }}º</span>
              <span class="og-koc-queue-avatars">
                @for (p of card.team?.players ?? []; track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="40" />
                }
              </span>
              <span class="og-koc-queue-name">{{ card.name }}</span>
              <span class="og-koc-queue-pts">{{ card.points }} PTS</span>
            </article>
          } @empty {
            <p class="og-koc-queue-empty">{{ finished() ? 'Sem classificação' : 'Fila vazia neste momento' }}</p>
          }
        </div>
      </section>

      <aside class="og-koc-tiebreak">
        <span class="og-koc-tiebreak-title">EMPATE NO FIM DO TEMPO</span>
        <ol>
          <li>Bola de ouro — rally único entre as empatadas</li>
          <li>Quem foi rei por último</li>
          <li>Confronto direto</li>
        </ol>
        @if (qualifyingTie()) {
          <p class="og-koc-tiebreak-live">Empate na vaga · bola de ouro</p>
        }
      </aside>
    </div>

    <footer class="og-koc-foot">
      <p class="og-koc-legend">
        <strong>COMO PONTUA</strong>
        Trono vence o rally: <em>+1 ponto</em> e segue no trono · desafiante vence:
        <em>assume o trono sem ponto</em> · quem perde vai para o fim da fila
      </p>
      <span class="og-koc-live">
        <span class="og-dot og-dot-red og-dot-pulse"></span>
        {{ finished() ? 'ENCERRADA' : 'AO VIVO · MESA E APP SINCRONIZADOS' }}
      </span>
    </footer>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 28px 36px 22px;
      overflow: hidden;
      background: #050505;
      color: var(--nx-text);
      animation: og-koc-in 480ms var(--nx-ease-out);
    }
    @keyframes og-koc-in {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .og-koc-head {
      display: grid;
      grid-template-columns: 1fr 1.4fr auto;
      gap: 24px;
      align-items: center;
      flex: none;
    }
    .og-koc-brand {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .og-koc-logo {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.03em;
    }
    .og-koc-logo em {
      font-style: normal;
      color: var(--nx-brand);
    }
    .og-koc-format {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: var(--nx-brand);
    }
    .og-koc-event {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      text-align: center;
    }
    .og-koc-event-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
    }
    .og-koc-event-sub {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-koc-timers {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .og-koc-round-clock {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      min-width: 160px;
      padding: 10px 16px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-koc-round-clock.expired .og-koc-timer-value {
      color: var(--nx-live);
    }
    .og-koc-timer-kicker {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--nx-text-dim);
    }
    .og-koc-timer-value {
      font-family: var(--nx-font-mono);
      font-size: 48px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .og-koc-timer-dur {
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-koc-wall {
      font-family: var(--nx-font-mono);
      font-size: 28px;
      font-weight: 600;
      color: var(--nx-text-mute);
    }

    .og-koc-body {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 1.55fr 1fr;
      gap: 18px;
    }

    .og-koc-rally {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      padding: 18px 20px;
      border-radius: 18px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-koc-rally-head {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .og-koc-rally-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      letter-spacing: 0.08em;
    }
    .og-koc-rally-rule {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--nx-text-dim);
    }
    .og-koc-sides {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 16px;
      align-items: stretch;
      min-height: 0;
    }
    .og-koc-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 22px 18px;
      border-radius: 16px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      text-align: center;
    }
    .og-koc-side.throne {
      background: linear-gradient(160deg, rgba(255, 106, 26, 0.18), rgba(20, 12, 8, 0.95));
      border-color: rgba(255, 106, 26, 0.45);
      box-shadow: inset 0 0 0 1px rgba(255, 106, 26, 0.12);
    }
    .og-koc-side-badge {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: var(--nx-brand);
    }
    .og-koc-side.challenger .og-koc-side-badge {
      color: var(--nx-win);
    }
    .og-koc-side-avatars {
      display: flex;
      gap: 8px;
    }
    .og-koc-side-name {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 34px;
      letter-spacing: -0.03em;
      line-height: 1.05;
    }
    .og-koc-side-sub {
      margin: 0;
      font-size: 14px;
      color: var(--nx-text-mute);
    }
    .og-koc-side-pts {
      margin: 8px 0 0;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--nx-text-mute);
    }
    .og-koc-side-pts strong {
      font-family: var(--nx-font-mono);
      font-size: 42px;
      font-weight: 700;
      letter-spacing: -0.04em;
      color: var(--nx-text);
      margin-right: 6px;
    }
    .og-koc-vs {
      align-self: center;
      font-size: 18px;
      font-weight: 700;
      color: var(--nx-text-dim);
      text-transform: lowercase;
    }
    .og-koc-waiting {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: var(--nx-text-mute);
      text-align: center;
    }

    .og-koc-table {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 16px 18px;
      border-radius: 18px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-koc-table-head {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 12px;
    }
    .og-koc-table-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
    }
    .og-koc-table-kicker {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-koc-table-rows {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow: hidden;
    }
    .og-koc-table-row {
      display: grid;
      grid-template-columns: 36px 1fr auto auto;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--nx-surface-1);
    }
    .og-koc-table-row.qualifies {
      background: rgba(34, 197, 94, 0.1);
      box-shadow: inset 3px 0 0 var(--nx-win);
    }
    .og-koc-table-place {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 18px;
      color: var(--nx-text-mute);
    }
    .og-koc-table-row.qualifies .og-koc-table-place {
      color: var(--nx-win);
    }
    .og-koc-table-name {
      font-weight: 700;
      font-size: 18px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-koc-table-role {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
    }
    .og-koc-table-role[data-role='trono'] {
      color: var(--nx-brand);
    }
    .og-koc-table-role[data-role='desafia'] {
      color: var(--nx-win);
    }
    .og-koc-table-pts {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 22px;
      min-width: 2ch;
      text-align: right;
    }
    .og-koc-table-empty {
      margin: auto;
      color: var(--nx-text-dim);
    }
    .og-koc-table-foot {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(34, 197, 94, 0.16);
      color: var(--nx-win);
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
    }

    .og-koc-bottom {
      flex: none;
      display: grid;
      grid-template-columns: 1.55fr 1fr;
      gap: 18px;
    }
    .og-koc-queue {
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-koc-queue-head {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 10px;
    }
    .og-koc-queue-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 16px;
    }
    .og-koc-queue-kicker {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-koc-queue-cards {
      display: flex;
      gap: 10px;
      overflow: hidden;
    }
    .og-koc-queue-card {
      flex: 1;
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      column-gap: 10px;
      row-gap: 2px;
      align-items: center;
      padding: 12px;
      border-radius: 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-koc-queue-place {
      grid-row: 1 / span 2;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 20px;
      color: var(--nx-text-mute);
    }
    .og-koc-queue-avatars {
      display: flex;
      gap: 4px;
    }
    .og-koc-queue-name {
      grid-column: 2;
      font-weight: 700;
      font-size: 15px;
    }
    .og-koc-queue-pts {
      grid-column: 2;
      font-size: 12px;
      font-weight: 700;
      color: var(--nx-text-mute);
    }
    .og-koc-queue-empty {
      margin: 0;
      color: var(--nx-text-dim);
      font-size: 14px;
    }

    .og-koc-tiebreak {
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-koc-tiebreak-title {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: var(--nx-pending);
    }
    .og-koc-tiebreak ol {
      margin: 0;
      padding-left: 18px;
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
    }
    .og-koc-tiebreak-live {
      margin: 10px 0 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--nx-pending);
    }

    .og-koc-foot {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding-top: 4px;
    }
    .og-koc-legend {
      margin: 0;
      font-size: 13px;
      line-height: 1.4;
      color: var(--nx-text-mute);
    }
    .og-koc-legend strong {
      margin-right: 8px;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
    }
    .og-koc-legend em {
      font-style: normal;
      color: var(--nx-text);
      font-weight: 700;
    }
    .og-koc-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: none;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: var(--nx-live);
    }
    .og-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-live);
    }
    .og-dot-pulse {
      animation: og-koc-dot 1.4s ease-in-out infinite;
    }
    @keyframes og-koc-dot {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
      .og-dot-pulse {
        animation: none;
      }
    }
  `,
})
export class TelaoKocModeComponent {
  readonly match = input.required<TournamentMatch>();
  readonly eventLine = input('');
  readonly locationLine = input('');
  readonly clock = input('');
  readonly nowMs = input.required<number>();
  readonly teamsById = input.required<ReadonlyMap<string, TelaoTeamDisplay>>();
  /** Quantas rodadas classificatórias existem na categoria — pra "Rodada 3 de 7". */
  readonly roundTotal = input(0);

  protected readonly round = computed(() => this.match().koc);

  protected readonly finished = computed(() => this.match().status === 'completed');

  protected readonly phaseLine = computed(() => {
    const m = this.match();
    const round = m.koc;
    const labelNum = round?.roundLabel || m.matchNumber;
    const phase = kocPhaseLabel(m.matchType, labelNum).toUpperCase();
    const total = this.roundTotal();
    const withTotal =
      total > 1 && labelNum > 0 && !phase.includes('SEMIFINAL') && !phase.includes('FINAL')
        ? `${phase} DE ${total}`
        : phase;
    const loc = this.locationLine().trim();
    return loc ? `${withTotal} · ${loc.toUpperCase()}` : withTotal;
  });

  protected readonly durationLabel = computed(() => {
    const sec = this.round()?.configuredDurationSec ?? 900;
    const min = Math.max(1, Math.round(sec / 60));
    return `${min} min`;
  });

  protected clockLabel(): string | null {
    const round = this.round();
    if (!round?.clock) return null;
    return kocIsExpired(round.clock, this.nowMs()) ? 'TEMPO!' : kocRemainingLabel(round.clock, this.nowMs());
  }

  protected clockExpired(): boolean {
    const clock = this.round()?.clock;
    return clock != null && kocIsExpired(clock, this.nowMs());
  }

  protected readonly onCourt = computed(() => {
    const round = this.round();
    if (!round || this.finished() || !kocHasStarted(round)) return null;
    if (!round.kingTeamId || !round.challengerTeamId) return null;
    return {
      king: this.sideOf(round, round.kingTeamId, false),
      challenger: this.sideOf(round, round.challengerTeamId, round.servingTeamId === round.challengerTeamId),
    };
  });

  protected readonly tableRows = computed<KocTableRow[]>(() => {
    const round = this.round();
    if (!round) return [];
    const showPts = kocHasStarted(round) || this.finished();
    const rows = this.finished()
      ? kocFinalTable(round).map((r) => ({ teamId: r.teamId, place: r.place, points: r.points as number | null }))
      : (showPts ? kocLiveOrder(round) : round.teamIds).map((teamId, i) => ({
          teamId,
          place: i + 1,
          points: showPts ? kocPointsOf(round, teamId) : null,
        }));
    const cut = round.qualifiersPerRound;
    return rows.map((row) => ({
      teamId: row.teamId,
      place: row.place,
      name: this.nameOf(row.teamId),
      points: row.points,
      role: this.roleOf(round, row.teamId),
      qualifies: row.place <= cut,
    }));
  });

  protected readonly advanceLine = computed(() => {
    const round = this.round();
    if (!round || round.qualifiersPerRound < 1) return '';
    const n = round.qualifiersPerRound;
    const next = this.nextPhaseHint();
    return `AVANÇAM as ${n} primeira${n === 1 ? '' : 's'} dupla${n === 1 ? '' : 's'}${next ? ` vão para a ${next}` : ''}`;
  });

  protected readonly queueCards = computed<KocQueueCard[]>(() => {
    const round = this.round();
    if (!round) return [];
    if (this.finished()) {
      return kocFinalTable(round)
        .filter((r) => r.place <= round.qualifiersPerRound)
        .map((r) => ({
          teamId: r.teamId,
          place: r.place,
          name: this.nameOf(r.teamId),
          points: r.points,
          team: this.teamsById().get(r.teamId) ?? null,
        }));
    }
    return round.queue.map((teamId, i) => ({
      teamId,
      place: i + 1,
      name: this.nameOf(teamId),
      points: kocPointsOf(round, teamId),
      team: this.teamsById().get(teamId) ?? null,
    }));
  });

  protected readonly qualifyingTie = computed(() => {
    const round = this.round();
    return round != null && !this.finished() && kocHasStarted(round) && kocHasQualifyingTie(round);
  });

  protected roleLabel(role: KocTableRow['role']): string {
    if (role === 'trono') return 'TRONO';
    if (role === 'desafia') return 'DESAFIA';
    if (role === 'fila') return 'NA FILA';
    return '';
  }

  private sideOf(round: KocRoundState, teamId: string, serving: boolean) {
    return {
      teamId,
      name: this.nameOf(teamId),
      team: this.teamsById().get(teamId) ?? null,
      points: kocPointsOf(round, teamId),
      serving,
    };
  }

  private nameOf(teamId: string): string {
    return this.teamsById().get(teamId)?.short ?? 'Dupla';
  }

  private roleOf(round: KocRoundState, teamId: string): KocTableRow['role'] {
    if (this.finished() || !kocHasStarted(round)) return '';
    if (teamId === round.kingTeamId) return 'trono';
    if (teamId === round.challengerTeamId) return 'desafia';
    if (round.queue.includes(teamId)) return 'fila';
    return '';
  }

  private nextPhaseHint(): string {
    const t = (this.match().matchType ?? '').trim().toLowerCase().replace(/_/g, ' ');
    if (t === 'koc final') return '';
    if (t === 'koc semifinal') return 'Final';
    return 'Semifinal';
  }
}
