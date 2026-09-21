import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
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
  surnames: string[];
  points: number;
  team: TelaoTeamDisplay | null;
}

interface KocCourtSide {
  teamId: string;
  surnames: string[];
  team: TelaoTeamDisplay | null;
  points: number;
  serving: boolean;
  reignStreak: number;
}

/** Sobrenome pra TV: o último token do nome completo. Sem sobrenome, o próprio nome. */
function surnameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.length === 1 ? parts[0]! : parts[parts.length - 1]!;
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
      <div class="og-koc-identity">
        <div class="og-koc-brand">
          <img class="og-koc-mark" src="/brand/logo.png" alt="" width="44" height="44" />
          <div class="og-koc-brand-text">
            <span class="og-koc-logo">nexa<em>GO</em></span>
            <span class="og-koc-format">King of the Court</span>
          </div>
        </div>
        <span class="og-koc-divider" aria-hidden="true"></span>
        <div class="og-koc-event">
          <span class="og-koc-event-title">{{ eventLine() }}</span>
          <span class="og-koc-event-sub">{{ phaseLine() }}</span>
        </div>
      </div>
      <div class="og-koc-timers">
        <div class="og-koc-round-clock" [class.expired]="clockExpired()" [class.waiting]="!clockLabel()">
          <div class="og-koc-timer-block">
            <span class="og-koc-timer-kicker">Tempo da rodada</span>
            @if (clockLabel(); as clock) {
              <span class="og-koc-timer-value" [ogPulse]="clock">{{ clock }}</span>
            } @else {
              <span class="og-koc-timer-value">—:—</span>
            }
          </div>
          <div class="og-koc-timer-block dur">
            <span class="og-koc-timer-kicker">Duração</span>
            <span class="og-koc-timer-dur-value">
              <strong>{{ durationMin() }}</strong>
              <span>min</span>
            </span>
          </div>
        </div>
        <div class="og-koc-wall">{{ clock() }}</div>
      </div>
    </header>

    <div class="og-koc-body">
      <section class="og-koc-rally">
        <header class="og-koc-rally-head">
          <span class="og-koc-rally-title">Rally em quadra</span>
          <span class="og-koc-rally-rules">
            <span class="og-koc-rally-rule accent">Só o trono pontua</span>
            <span class="og-koc-rally-sep" aria-hidden="true"></span>
            <span class="og-koc-rally-rule">Coroação não vale ponto</span>
          </span>
        </header>

        @if (onCourt(); as sides) {
          <div class="og-koc-sides">
            <article class="og-koc-side throne" [ogPulse]="sides.king.teamId">
              <span class="og-koc-side-badge"><span class="og-koc-side-dot" aria-hidden="true"></span> NO TRONO</span>
              <div class="og-koc-side-avatars">
                <span class="og-koc-side-crown" role="img" aria-label="No trono" [ogPulse]="sides.king.points">👑</span>
                @for (p of sides.king.team?.players ?? []; track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="120" />
                }
              </div>
              <div class="og-koc-side-names">
                @for (n of sides.king.surnames; track $index) {
                  @if ($index > 0) {
                    <span class="og-koc-side-plus">+</span>
                  }
                  <span class="og-koc-side-surname">{{ n }}</span>
                }
              </div>
              <!-- @if (sides.king.team?.sub; as sub) {
                <p class="og-koc-side-sub">{{ sub }}</p>
              } -->
              <p class="og-koc-side-pts" [ogPulse]="sides.king.points">
                <strong>{{ sides.king.points }}</strong>
                <!-- <span>PTS NA RODADA</span> -->
              </p>
              @if (sides.king.reignStreak > 0) {
                <p class="og-koc-side-streak">
                  {{ sides.king.reignStreak }}
                  PONTO{{ sides.king.reignStreak === 1 ? '' : 'S' }} SEGUIDO{{ sides.king.reignStreak === 1 ? '' : 'S' }}
                  NO TRONO
                </p>
              }
            </article>

            <span class="og-koc-vs">vs</span>

            <article class="og-koc-side challenger" [ogPulse]="sides.challenger.teamId">
              <span class="og-koc-side-badge">DESAFIANTE{{ sides.challenger.serving ? ' · SACA' : '' }}</span>
              <div class="og-koc-side-avatars">
                @for (p of sides.challenger.team?.players ?? []; track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="120" />
                }
              </div>
              <div class="og-koc-side-names">
                @for (n of sides.challenger.surnames; track $index) {
                  @if ($index > 0) {
                    <span class="og-koc-side-plus muted">+</span>
                  }
                  <span class="og-koc-side-surname">{{ n }}</span>
                }
              </div>
              <!-- @if (sides.challenger.team?.sub; as sub) {
                <p class="og-koc-side-sub">{{ sub }}</p>
              } -->
              <p class="og-koc-side-pts muted" [ogPulse]="sides.challenger.points">
                <strong>{{ sides.challenger.points }}</strong>
                <!-- <span>PTS NA RODADA</span> -->
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
            <div
              class="og-koc-table-row"
              [class.qualifies]="row.qualifies"
              [ogPulse]="row.place + ':' + (row.role ?? '') + ':' + row.teamId"
            >
              <span class="og-koc-table-place">{{ row.place }}</span>
              <div class="og-koc-table-body">
                <span class="og-koc-table-name">{{ row.name }}</span>
                @if (row.role) {
                  <span class="og-koc-table-role" [attr.data-role]="row.role">{{ roleLabel(row.role) }}</span>
                }
              </div>
              @if (row.points !== null) {
                <span class="og-koc-table-pts">{{ row.points }}</span>
              }
            </div>
          } @empty {
            <p class="og-koc-table-empty">Aguardando elenco…</p>
          }
        </div>
        @if (advanceInfo(); as info) {
          <footer class="og-koc-table-foot">
            <strong class="og-koc-table-foot-adv">AVANÇAM</strong>
            as <em>{{ info.countLabel }}</em>
            dupla{{ info.count === 1 ? '' : 's' }}{{ info.next ? ' vão para a ' + info.next : '' }}
          </footer>
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
            <article class="og-koc-queue-card" [ogPulse]="card.place + ':' + card.teamId">
              <span class="og-koc-queue-place">{{ card.place }}º</span>
              <span class="og-koc-queue-avatars">
                @for (p of card.team?.players ?? []; track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="52" />
                }
              </span>
              <div class="og-koc-queue-body">
                <span class="og-koc-queue-names">
                  @for (n of card.surnames; track $index) {
                    @if ($index > 0) {
                      <span class="og-koc-queue-plus">+</span>
                    }
                    <span>{{ n }}</span>
                  }
                </span>
                @if (card.team?.sub; as sub) {
                  <span class="og-koc-queue-sub">{{ sub }}</span>
                }
              </div>
              <span class="og-koc-queue-pts">
                <strong>{{ card.points }}</strong>
                <span>PTS</span>
              </span>
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 28px;
      flex: none;
    }
    .og-koc-identity {
      display: flex;
      align-items: center;
      gap: 22px;
      min-width: 0;
      flex: 1;
    }
    .og-koc-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: none;
    }
    .og-koc-mark {
      flex: none;
      width: 44px;
      height: 44px;
      object-fit: contain;
      display: block;
    }
    .og-koc-brand-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-koc-logo {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.03em;
      line-height: 1.05;
    }
    .og-koc-logo em {
      font-style: normal;
      color: var(--nx-orange-500);
    }
    .og-koc-format {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-koc-divider {
      flex: none;
      width: 1px;
      align-self: stretch;
      min-height: 44px;
      background: var(--nx-line);
    }
    .og-koc-event {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      text-align: left;
    }
    .og-koc-event-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      line-height: 1.1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-koc-event-sub {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-koc-timers {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .og-koc-round-clock {
      display: grid;
      grid-template-columns: auto auto;
      align-items: stretch;
      gap: 0;
      padding: 12px 18px;
      border-radius: 18px;
      background: linear-gradient(160deg, rgba(255, 106, 26, 0.14), rgba(18, 10, 6, 0.96));
      border: 1px solid rgba(255, 106, 26, 0.4);
    }
    .og-koc-round-clock.expired {
      border-color: color-mix(in srgb, var(--nx-live) 55%, transparent);
      background: linear-gradient(160deg, rgba(255, 59, 48, 0.16), rgba(18, 8, 8, 0.96));
    }
    .og-koc-round-clock.expired .og-koc-timer-value {
      color: var(--nx-live);
    }
    .og-koc-timer-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 2px 16px 2px 4px;
      min-width: 0;
    }
    .og-koc-timer-block.dur {
      padding: 2px 4px 2px 16px;
      border-left: 1px solid rgba(255, 106, 26, 0.28);
      justify-content: center;
    }
    .og-koc-timer-kicker {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-koc-timer-value {
      font-family: var(--nx-font-mono);
      font-size: 44px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
      color: var(--nx-text);
      font-variant-numeric: tabular-nums;
    }
    .og-koc-round-clock.waiting .og-koc-timer-value {
      color: var(--nx-text-mute);
    }
    .og-koc-timer-dur-value {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      color: var(--nx-text);
      line-height: 1;
    }
    .og-koc-timer-dur-value strong {
      font-family: var(--nx-font-display);
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .og-koc-timer-dur-value span {
      font-size: 15px;
      font-weight: 700;
      color: var(--nx-text-mute);
    }
    .og-koc-wall {
      font-family: var(--nx-font-display);
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--nx-text);
      line-height: 1;
    }

    .og-koc-body {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 1.2fr 0.5fr;
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
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .og-koc-rally-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text);
    }
    .og-koc-rally-rules {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      flex: none;
    }
    .og-koc-rally-rule {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }
    .og-koc-rally-rule.accent {
      color: var(--nx-orange-500);
    }
    .og-koc-rally-sep {
      width: 1px;
      height: 14px;
      background: var(--nx-line);
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
    /* Troca de dupla no trono/desafiante. */
    .og-koc-side.og-pulse-run {
      animation: og-koc-side-swap 520ms var(--nx-ease-out);
    }
    @keyframes og-koc-side-swap {
      0% {
        transform: scale(0.94);
        opacity: 0.45;
        filter: brightness(1.25);
      }
      40% {
        transform: scale(1.03);
        opacity: 1;
        filter: brightness(1.1);
      }
      100% {
        transform: scale(1);
        opacity: 1;
        filter: brightness(1);
      }
    }
    .og-koc-side.throne {
      background: linear-gradient(160deg, rgba(255, 106, 26, 0.18), rgba(20, 12, 8, 0.95));
      border-color: rgba(255, 106, 26, 0.45);
      box-shadow: inset 0 0 0 1px rgba(255, 106, 26, 0.12);
    }
    .og-koc-side-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      color: var(--nx-orange-500);
    }
    .og-koc-side-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      box-shadow: 0 0 10px rgba(255, 106, 26, 0.55);
    }
    .og-koc-side.challenger .og-koc-side-badge {
      color: var(--nx-win);
    }
    .og-koc-side-avatars {
      display: inline-flex;
      align-items: center;
      margin-top: 4px;
      position: relative;
    }
    .og-koc-side.throne .og-koc-side-avatars {
      margin-top: 18px;
    }
    .og-koc-side-crown {
      position: absolute;
      top: -34px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 4;
      font-size: 40px;
      line-height: 1;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.55));
      pointer-events: none;
      transform-origin: 50% 80%;
    }
    .og-koc-side-crown.og-pulse-run {
      animation: og-koc-crown-bounce 560ms var(--nx-ease-out);
    }
    @keyframes og-koc-crown-bounce {
      0% {
        transform: translateX(-50%) translateY(0) scale(1) rotate(0deg);
      }
      22% {
        transform: translateX(-50%) translateY(-14px) scale(1.28) rotate(-12deg);
        filter: drop-shadow(0 8px 16px rgba(255, 180, 40, 0.65));
      }
      48% {
        transform: translateX(-50%) translateY(-4px) scale(1.12) rotate(10deg);
      }
      72% {
        transform: translateX(-50%) translateY(-10px) scale(1.18) rotate(-6deg);
      }
      100% {
        transform: translateX(-50%) translateY(0) scale(1) rotate(0deg);
        filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.55));
      }
    }
    .og-koc-side-avatars og-avatar {
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      position: relative;
    }
    .og-koc-side.throne .og-koc-side-avatars og-avatar {
      border-color: var(--nx-orange-500);
    }
    .og-koc-side-avatars og-avatar + og-avatar {
      margin-left: -36px;
    }
    .og-koc-side-avatars og-avatar:nth-child(1) {
      z-index: 1;
    }
    .og-koc-side-avatars og-avatar:nth-child(2) {
      z-index: 2;
    }
    .og-koc-side-names {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      margin-top: 4px;
    }
    .og-koc-side-surname {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 42px;
      letter-spacing: -0.03em;
      line-height: 1.05;
      color: var(--nx-text);
    }
    .og-koc-side-plus {
      font-family: var(--nx-font-display);
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
      color: var(--nx-orange-500);
    }
    .og-koc-side-plus.muted {
      color: var(--nx-text-dim);
    }
    .og-koc-side-sub {
      margin: 2px 0 0;
      font-size: 15px;
      color: var(--nx-text-mute);
    }
    .og-koc-side-pts {
      display: inline-flex;
      align-items: baseline;
      gap: 12px;
      margin: 10px 0 0;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: var(--nx-orange-500);
    }
    .og-koc-side-pts strong {
      font-family: var(--nx-font-mono);
      font-size: 200px;
      font-weight: 700;
      letter-spacing: -0.05em;
      line-height: 0.85;
      color: var(--nx-orange-500);
      display: inline-block;
      transform-origin: center bottom;
    }
    .og-koc-side-pts.muted {
      color: var(--nx-text-mute);
    }
    .og-koc-side-pts.muted strong {
      color: var(--nx-text);
    }
    /* Ponto marcado: pop no número (ogPulse reinicia a cada mudança). */
    .og-koc-side-pts.og-pulse-run strong {
      animation: og-koc-score-pop 420ms var(--nx-ease-out);
    }
    @keyframes og-koc-score-pop {
      0% {
        transform: scale(1);
        filter: brightness(1);
      }
      28% {
        transform: scale(1.22);
        filter: brightness(1.35);
        text-shadow: 0 0 36px rgba(255, 106, 26, 0.55);
      }
      100% {
        transform: scale(1);
        filter: brightness(1);
      }
    }
    .og-koc-side-streak {
      margin: 8px 0 0;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
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
      min-width: 0;
      padding: 22px 22px 18px;
      border-radius: 18px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-koc-table-head {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }
    .og-koc-table-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
    }
    .og-koc-table-kicker {
      font-size: 15px;
      color: var(--nx-text-mute);
    }
    .og-koc-table-rows {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
    }
    .og-koc-table-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 16px 18px;
      border-radius: 16px;
      background: transparent;
    }
    .og-koc-table-row.og-pulse-run {
      animation: og-koc-row-swap 400ms var(--nx-ease-out);
    }
    @keyframes og-koc-row-swap {
      0% {
        transform: translateX(-8px);
        opacity: 0.5;
      }
      55% {
        transform: translateX(2px);
        opacity: 1;
      }
      100% {
        transform: none;
        opacity: 1;
      }
    }
    .og-koc-table-row.qualifies {
      background: rgba(43, 209, 126, 0.14);
    }
    .og-koc-table-place {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 28px;
      color: var(--nx-text-mute);
      text-align: center;
    }
    .og-koc-table-row.qualifies .og-koc-table-place {
      color: var(--nx-win);
    }
    .og-koc-table-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .og-koc-table-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-koc-table-role {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: var(--nx-text-dim);
    }
    .og-koc-table-role[data-role='trono'] {
      color: var(--nx-orange-500);
    }
    .og-koc-table-role[data-role='desafia'] {
      color: var(--nx-text);
    }
    .og-koc-table-role[data-role='fila'] {
      color: var(--nx-text-dim);
    }
    .og-koc-table-pts {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 36px;
      min-width: 2ch;
      text-align: right;
      color: var(--nx-text);
    }
    .og-koc-table-empty {
      margin: auto;
      color: var(--nx-text-dim);
      font-size: 18px;
    }
    .og-koc-table-foot {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
      font-size: 16px;
      line-height: 1.45;
      color: var(--nx-text-mute);
    }
    .og-koc-table-foot-adv {
      margin-right: 6px;
      color: var(--nx-win);
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .og-koc-table-foot em {
      font-style: normal;
      font-weight: 800;
      color: var(--nx-text);
    }

    .og-koc-bottom {
      flex: none;
      display: grid;
      grid-template-columns: 1.2fr 0.5fr;
      gap: 18px;
    }
    .og-koc-queue {
      padding: 16px 18px;
      border-radius: 16px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      min-width: 0;
    }
    .og-koc-queue-head {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 10px 14px;
      margin-bottom: 14px;
    }
    .og-koc-queue-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
    }
    .og-koc-queue-kicker {
      font-size: 14px;
      color: var(--nx-text-mute);
    }
    .og-koc-queue-cards {
      display: flex;
      gap: 12px;
      overflow: hidden;
    }
    .og-koc-queue-card {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border-radius: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .og-koc-queue-card.og-pulse-run {
      animation: og-koc-row-swap 400ms var(--nx-ease-out);
    }
    .og-koc-queue-place {
      flex: none;
      display: grid;
      place-items: center;
      min-width: 42px;
      height: 42px;
      padding: 0 8px;
      border-radius: 10px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-koc-queue-avatars {
      flex: none;
      display: inline-flex;
      align-items: center;
    }
    .og-koc-queue-avatars og-avatar {
      border: 2px solid var(--nx-surface-1);
      border-radius: 50%;
      position: relative;
    }
    .og-koc-queue-avatars og-avatar + og-avatar {
      margin-left: -16px;
    }
    .og-koc-queue-avatars og-avatar:nth-child(1) {
      z-index: 1;
    }
    .og-koc-queue-avatars og-avatar:nth-child(2) {
      z-index: 2;
    }
    .og-koc-queue-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .og-koc-queue-names {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      line-height: 1.1;
      color: var(--nx-text);
    }
    .og-koc-queue-plus {
      color: var(--nx-orange-500);
      font-weight: 800;
    }
    .og-koc-queue-sub {
      font-size: 13px;
      color: var(--nx-text-mute);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-koc-queue-pts {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      line-height: 1;
    }
    .og-koc-queue-pts strong {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 32px;
      color: var(--nx-text);
    }
    .og-koc-queue-pts span {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: var(--nx-text-dim);
    }
    .og-koc-queue-empty {
      margin: 0;
      color: var(--nx-text-dim);
      font-size: 15px;
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
      .og-dot-pulse,
      .og-koc-side-pts.og-pulse-run strong,
      .og-koc-side-crown.og-pulse-run,
      .og-koc-side.og-pulse-run,
      .og-koc-table-row.og-pulse-run,
      .og-koc-queue-card.og-pulse-run {
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

  /** Âncora do reinado atual: ao trocar o rei, zera a contagem de pontos seguidos no trono. */
  private readonly reign = signal<{ kingId: string; basePoints: number }>({ kingId: '', basePoints: 0 });

  constructor() {
    effect(() => {
      const round = this.match().koc;
      const kingId = round?.kingTeamId ?? '';
      const finished = this.match().status === 'completed';
      if (!round || !kingId || !kocHasStarted(round) || finished) {
        this.reign.set({ kingId: '', basePoints: 0 });
        return;
      }
      const pts = kocPointsOf(round, kingId);
      const prev = this.reign();
      if (prev.kingId !== kingId) {
        this.reign.set({ kingId, basePoints: pts });
      }
    });
  }

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

  protected readonly durationMin = computed(() => {
    const sec = this.round()?.configuredDurationSec ?? 900;
    return Math.max(1, Math.round(sec / 60));
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
      king: this.sideOf(round, round.kingTeamId, false, true),
      challenger: this.sideOf(round, round.challengerTeamId, round.servingTeamId === round.challengerTeamId, false),
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
      qualifies: cut > 0 && row.place <= cut,
    }));
  });

  protected readonly advanceInfo = computed(() => {
    const round = this.round();
    if (!round || round.qualifiersPerRound < 1) return null;
    const n = round.qualifiersPerRound;
    return {
      count: n,
      countLabel: n === 1 ? '1 primeira' : `${n} primeiras`,
      next: this.nextPhaseHint(),
    };
  });

  protected readonly queueCards = computed<KocQueueCard[]>(() => {
    const round = this.round();
    if (!round) return [];
    const toCard = (teamId: string, place: number, points: number): KocQueueCard => {
      const team = this.teamsById().get(teamId) ?? null;
      return {
        teamId,
        place,
        surnames: this.surnamesOf(team, this.nameOf(teamId)),
        points,
        team,
      };
    };
    if (this.finished()) {
      return kocFinalTable(round)
        .filter((r) => r.place <= round.qualifiersPerRound)
        .map((r) => toCard(r.teamId, r.place, r.points));
    }
    return round.queue.map((teamId, i) => toCard(teamId, i + 1, kocPointsOf(round, teamId)));
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

  private sideOf(round: KocRoundState, teamId: string, serving: boolean, isKing: boolean): KocCourtSide {
    const team = this.teamsById().get(teamId) ?? null;
    const points = kocPointsOf(round, teamId);
    const reign = this.reign();
    const reignStreak =
      isKing && reign.kingId === teamId ? Math.max(0, points - reign.basePoints) : 0;
    return {
      teamId,
      surnames: this.surnamesOf(team, this.nameOf(teamId)),
      team,
      points,
      serving,
      reignStreak,
    };
  }

  private surnamesOf(team: TelaoTeamDisplay | null, fallbackName: string): string[] {
    const fromPlayers = (team?.playerNames ?? [])
      .map((n) => surnameOf(n))
      .filter((n) => n.length > 0);
    if (fromPlayers.length > 0) return fromPlayers;
    const parts = fallbackName
      .split(/\s*\/\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [fallbackName || 'Dupla'];
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
