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
import { formatCourtLabel } from '../data/schedule-format';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgPulseDirective } from './og-pulse.directive';
import type { TelaoTeamDisplay } from './telao-data.service';
import { KOC_FINISHED_SHOWCASE_MS } from './telao-koc-mode';

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

/** On fire a partir de 4 pontos seguidos no trono (>3). */
const KOC_ON_FIRE_AFTER = 3;
/** Em 10 pontos seguidos a cor chega no vermelho puro. */
const KOC_FIRE_RED_AT = 10;

/** 0 = laranja (início do on-fire), 1 = vermelho. */
function kocFireHeat(reignStreak: number): number {
  if (reignStreak <= KOC_ON_FIRE_AFTER) return 0;
  return Math.min(1, (reignStreak - KOC_ON_FIRE_AFTER - 1) / (KOC_FIRE_RED_AT - KOC_ON_FIRE_AFTER - 1));
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Canal RGB "r, g, b" — laranja nexa → vermelho vivo conforme o heat. */
function kocFireRgb(heat: number): string {
  return `${lerpChannel(255, 255, heat)}, ${lerpChannel(106, 45, heat)}, ${lerpChannel(26, 40, heat)}`;
}

/** Tom mais claro do brilho/anel no pico do trkFire. */
function kocFireHotRgb(heat: number): string {
  return `${lerpChannel(255, 255, heat)}, ${lerpChannel(138, 80, heat)}, ${lerpChannel(74, 70, heat)}`;
}

/** Intensidade dos pulsos (brilho + velocidade) — sobe com o heat. */
function kocFirePulseVars(heat: number): {
  glowLo: string;
  glowHi: string;
  aLo: string;
  aHi: string;
  textLo: string;
  textHi: string;
  dur: string;
  pulseDur: string;
} {
  return {
    glowLo: `${Math.round(46 + heat * 50)}px`,
    glowHi: `${Math.round(110 + heat * 90)}px`,
    aLo: (0.18 + heat * 0.14).toFixed(2),
    aHi: (0.34 + heat * 0.28).toFixed(2),
    textLo: `${Math.round(22 + heat * 24)}px`,
    textHi: `${Math.round(46 + heat * 48)}px`,
    dur: `${(1.5 - heat * 0.45).toFixed(2)}s`,
    pulseDur: `${(1.6 - heat * 0.4).toFixed(2)}s`,
  };
}

interface KocFinalStandingRow {
  teamId: string;
  place: number;
  surnames: string[];
  points: number;
  crowns: number;
  qualifies: boolean;
  team: TelaoTeamDisplay | null;
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
  host: { class: 'og-koc', '[class.finished]': 'finished()' },
  template: `
    @if (finished()) {
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
          <span class="og-koc-done-pill">
            <span class="og-koc-done-dot" aria-hidden="true"></span>
            Rodada encerrada
          </span>
          <div class="og-koc-wall">{{ clock() }}</div>
        </div>
      </header>

      @if (champion(); as champ) {
        <article class="og-koc-champ">
          <span class="og-koc-champ-shine" aria-hidden="true"></span>
          <span class="og-koc-champ-badge">Rei da quadra · Rodada {{ roundLabel() }}</span>
          <div class="og-koc-champ-row">
            <div class="og-koc-champ-team">
              <span class="og-koc-stack og-koc-champ-avatars">
                @for (p of champ.team?.players ?? []; track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="110" />
                } @empty {
                  <og-avatar initials="?" [size]="110" />
                }
              </span>
              <div class="og-koc-champ-body">
                <strong class="og-koc-champ-name">{{ champ.surnames.join(' + ') }}</strong>
                @if (champ.team?.sub; as sub) {
                  <span class="og-koc-champ-sub">{{ sub }}</span>
                } @else if (playerLine(champ.team); as line) {
                  <span class="og-koc-champ-sub">{{ line }}</span>
                }
              </div>
            </div>
            <div class="og-koc-champ-stats">
              <div class="og-koc-champ-stat">
                <strong>{{ champ.points }}</strong>
                <span>Pts da campeã</span>
              </div>
              <div class="og-koc-champ-stat">
                <strong>{{ champ.crowns }}</strong>
                <span>Coroas</span>
              </div>
              <div class="og-koc-champ-stat">
                <strong>{{ rallies() }}</strong>
                <span>Rallys na rodada</span>
              </div>
              <div class="og-koc-champ-stat">
                <strong>{{ durationLabel() }}</strong>
                <span>Duração</span>
              </div>
            </div>
          </div>
        </article>
      }

      <section class="og-koc-class">
        <header class="og-koc-class-head">
          <span>Posição</span>
          <span>Dupla</span>
          <span class="num">Coroas (vezes no trono)</span>
          <span class="num">Pontos</span>
        </header>
        @for (row of finalStandings(); track row.teamId; let i = $index) {
          <div
            class="og-koc-class-row"
            [class.king]="row.place === 1"
            [class.advances]="row.qualifies && row.place > 1"
            [style.animation-delay.ms]="180 + i * 110"
          >
            <span class="og-koc-class-place">{{ row.place }}º</span>
            <div class="og-koc-class-dupla">
              <span class="og-koc-stack og-koc-class-avatars">
                @for (p of row.team?.players ?? []; track $index) {
                  <og-avatar
                    [initials]="p.initials"
                    [photoUrl]="p.photoUrl"
                    [size]="row.place === 1 ? 96 : 76"
                  />
                }
              </span>
              <div class="og-koc-class-body">
                <span class="og-koc-class-name">{{ row.surnames.join(' + ') }}</span>
                @if (row.team?.sub; as sub) {
                  <span class="og-koc-class-sub">{{ sub }}</span>
                } @else if (playerLine(row.team); as line) {
                  <span class="og-koc-class-sub">{{ line }}</span>
                }
              </div>
              @if (row.place === 1) {
                <span class="og-koc-class-tag king">Rei da quadra</span>
              } @else if (row.qualifies) {
                <span class="og-koc-class-tag advances">Avança</span>
              }
            </div>
            <span class="og-koc-class-crowns">
              <strong>{{ row.crowns }}</strong>
              <span>coroas</span>
            </span>
            <span class="og-koc-class-pts">
              <strong>{{ row.points }}</strong>
              <span>pts</span>
            </span>
          </div>
        }
      </section>

      <footer class="og-koc-class-foot">
        <div class="og-koc-class-next">
          @if (nextBanner(); as next) {
            <span class="og-koc-class-next-label">{{ next }}</span>
            <strong class="og-koc-class-next-clock">{{ showcaseRemaining() }}</strong>
          }
          <span class="og-koc-class-legend">
            As duplas em <em>verde</em> avançam · as demais se dispedem do evento.
          </span>
        </div>
        <span class="og-koc-class-homolog">Sujeito a homologação</span>
        <div class="og-koc-class-progress" aria-hidden="true">
          <span class="og-koc-class-progress-bar" [style.width.%]="showcaseRemainingPct()"></span>
        </div>
      </footer>
    } @else {
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
            @if (fireStyleOf(sides.king.reignStreak); as fire) {
            <article
              class="og-koc-side throne"
              [class.on-fire]="sides.king.reignStreak > KOC_ON_FIRE_AFTER"
              [style.--koc-fire]="fire['--koc-fire']"
              [style.--koc-fire-hot]="fire['--koc-fire-hot']"
              [style.--koc-fire-glow-lo]="fire['--koc-fire-glow-lo']"
              [style.--koc-fire-glow-hi]="fire['--koc-fire-glow-hi']"
              [style.--koc-fire-a-lo]="fire['--koc-fire-a-lo']"
              [style.--koc-fire-a-hi]="fire['--koc-fire-a-hi']"
              [style.--koc-fire-text-lo]="fire['--koc-fire-text-lo']"
              [style.--koc-fire-text-hi]="fire['--koc-fire-text-hi']"
              [style.--koc-fire-dur]="fire['--koc-fire-dur']"
              [style.--koc-fire-pulse-dur]="fire['--koc-fire-pulse-dur']"
              [ogPulse]="sides.king.teamId"
            >
              <span class="og-koc-side-badge"
                ><span class="og-koc-side-dot" aria-hidden="true"></span> NO TRONO</span
              >
              <div class="og-koc-stack og-koc-side-avatars">
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
              <p
                class="og-koc-side-pts"
                [class.on-fire]="sides.king.reignStreak > KOC_ON_FIRE_AFTER"
                [ogPulse]="sides.king.points"
              >
                <strong>{{ sides.king.points }}</strong>
              </p>
              @if (sides.king.reignStreak > KOC_ON_FIRE_AFTER) {
                <span class="og-koc-on-fire-pill">On fire</span>
              } @else if (sides.king.reignStreak > 0) {
                <p class="og-koc-side-streak">
                  {{ sides.king.reignStreak }}
                  PONTO{{ sides.king.reignStreak === 1 ? '' : 'S' }} SEGUIDO{{ sides.king.reignStreak === 1 ? '' : 'S' }}
                  NO TRONO
                </p>
              }
              <div class="og-koc-fire-burst" aria-hidden="true">
                @for (e of fireEmojis(); track e.id) {
                  <span
                    class="og-koc-fire-emoji"
                    [style.left.%]="e.left"
                    [style.--drift.px]="e.drift"
                    [style.font-size.px]="e.size"
                    [style.animation-delay.ms]="e.delay"
                    [style.animation-duration.ms]="e.dur"
                    >🔥</span
                  >
                }
              </div>
            </article>
            }

            <span class="og-koc-vs">vs</span>

            <article class="og-koc-side challenger" [ogPulse]="sides.challenger.teamId">
              <span class="og-koc-side-badge">DESAFIANTE{{ sides.challenger.serving ? ' · SACA' : '' }}</span>
              <div class="og-koc-stack og-koc-side-avatars">
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
              <p class="og-koc-side-pts muted" [ogPulse]="sides.challenger.points">
                <strong>{{ sides.challenger.points }}</strong>
              </p>
            </article>
          </div>
        } @else {
          <div class="og-koc-waiting">Elenco na fila · o trono abre no apito</div>
        }
      </section>

      <aside class="og-koc-table">
        <header class="og-koc-table-head">
          <span class="og-koc-table-title">Tabela da rodada</span>
          <span class="og-koc-table-kicker">Ao vivo · atualiza a cada rally</span>
        </header>
        <div class="og-koc-table-rows">
          @for (row of tableRows(); track row.teamId) {
            <div
              class="og-koc-table-row"
              [class.qualifies]="row.qualifies"
              [ogPulse]="row.place + ':' + row.role + ':' + row.teamId"
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
          <span class="og-koc-queue-title">Próximos na fila</span>
          <span class="og-koc-queue-kicker">quem perde o rally vai para o fim da fila</span>
        </header>
        <div class="og-koc-queue-cards">
          @for (card of queueCards(); track card.teamId) {
            <article class="og-koc-queue-card" [ogPulse]="card.place + ':' + card.teamId">
              <span class="og-koc-queue-place">{{ card.place }}º</span>
              <span class="og-koc-stack og-koc-queue-avatars">
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
            <p class="og-koc-queue-empty">Fila vazia neste momento</p>
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
        AO VIVO · MESA E APP SINCRONIZADOS
      </span>
    </footer>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      container-type: size;
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
      flex: 1 1 0;
      min-height: 0;
      display: grid;
      grid-template-columns: 1.2fr 0.5fr;
      grid-template-rows: 1fr;
      gap: 18px;
      align-items: stretch;
    }

    .og-koc-rally {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      height: 100%;
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
      position: relative;
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
      overflow: hidden;
    }
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
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.45);
      box-shadow: inset 0 0 0 1px rgba(255, 106, 26, 0.12);
    }
    .og-koc-side.throne.on-fire {
      --koc-fire: 255, 106, 26;
      --koc-fire-hot: 255, 138, 74;
      --koc-fire-glow-lo: 46px;
      --koc-fire-glow-hi: 110px;
      --koc-fire-a-lo: 0.18;
      --koc-fire-a-hi: 0.34;
      --koc-fire-text-lo: 22px;
      --koc-fire-text-hi: 46px;
      --koc-fire-dur: 1.5s;
      --koc-fire-pulse-dur: 1.6s;
      background: linear-gradient(
        180deg,
        rgba(var(--koc-fire), 0.26),
        rgba(var(--koc-fire), 0.08)
      );
      border-color: rgba(var(--koc-fire-hot), 0.75);
      animation: trkFire var(--koc-fire-dur) ease-in-out infinite;
    }
    .og-koc-side.throne.on-fire.og-pulse-run {
      animation:
        og-koc-side-swap 520ms var(--nx-ease-out),
        trkFire var(--koc-fire-dur) ease-in-out infinite;
    }
    @keyframes trkFire {
      0%,
      100% {
        border-color: rgba(var(--koc-fire), 0.45);
        box-shadow: inset 0 0 var(--koc-fire-glow-lo) rgba(var(--koc-fire), var(--koc-fire-a-lo));
      }
      50% {
        border-color: rgba(var(--koc-fire-hot), 0.95);
        box-shadow: inset 0 0 var(--koc-fire-glow-hi) rgba(var(--koc-fire), var(--koc-fire-a-hi));
      }
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
      animation: trkPulse 1.6s ease-in-out infinite;
    }
    @keyframes trkPulse {
      0%,
      100% {
        opacity: 1;
        transform: scale(1);
        box-shadow: 0 0 10px rgba(255, 106, 26, 0.55);
      }
      50% {
        opacity: 0.4;
        transform: scale(0.82);
        box-shadow: 0 0 4px rgba(255, 106, 26, 0.25);
      }
    }
    .og-koc-side.challenger .og-koc-side-badge {
      color: var(--nx-win);
    }
    /* A pilha de avatares (borda, sobreposição, z-index) é a mesma em quatro
       lugares desta tela — vive em .og-koc-stack. Aqui fica só o que difere. */
    .og-koc-stack {
      display: inline-flex;
      align-items: center;
    }
    .og-koc-stack og-avatar {
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      position: relative;
    }
    .og-koc-stack og-avatar:nth-child(1) {
      z-index: 1;
    }
    .og-koc-stack og-avatar:nth-child(2) {
      z-index: 2;
    }
    .og-koc-side-avatars {
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
    .og-koc-side.throne .og-koc-side-avatars og-avatar {
      border-color: var(--nx-orange-500);
    }
    .og-koc-side-avatars og-avatar + og-avatar {
      margin-left: -36px;
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
    .og-koc-side-pts.og-pulse-run strong {
      animation: og-koc-score-pop 420ms var(--nx-ease-out);
    }
    .og-koc-side.throne.on-fire .og-koc-side-dot {
      background: rgb(var(--koc-fire));
      animation: trkPulse var(--koc-fire-pulse-dur) ease-in-out infinite;
    }
    .og-koc-side-pts.on-fire strong {
      animation: trkFireText var(--koc-fire-dur) ease-in-out infinite;
    }
    .og-koc-side-pts.on-fire.og-pulse-run strong {
      animation:
        og-koc-score-pop 420ms var(--nx-ease-out),
        trkFireText var(--koc-fire-dur) ease-in-out infinite;
    }
    .og-koc-side.throne.on-fire .og-koc-side-badge {
      color: rgb(var(--koc-fire-hot));
    }
    .og-koc-side.throne.on-fire .og-koc-side-pts strong {
      color: rgb(var(--koc-fire-hot));
    }
    @keyframes trkFireText {
      0%,
      100% {
        text-shadow: 0 0 var(--koc-fire-text-lo) rgba(var(--koc-fire-hot), 0.55);
      }
      50% {
        text-shadow: 0 0 var(--koc-fire-text-hi) rgba(var(--koc-fire-hot), 0.95);
      }
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
    .og-koc-on-fire-pill {
      margin-top: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      border-radius: 999px;
      border: 1px solid rgba(var(--koc-fire), 0.45);
      background: rgb(var(--koc-fire));
      color: #fff;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      box-shadow: inset 0 0 46px rgba(255, 255, 255, 0.12);
      animation: trkFire var(--koc-fire-dur, 1.5s) ease-in-out infinite;
    }
    .og-koc-fire-burst {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 6;
      overflow: hidden;
    }
    .og-koc-fire-emoji {
      position: absolute;
      bottom: 22%;
      transform: translateX(-50%);
      line-height: 1;
      opacity: 0;
      filter: drop-shadow(0 4px 10px rgba(255, 106, 26, 0.45));
      animation-name: trkFireRise;
      animation-timing-function: ease-out;
      animation-fill-mode: forwards;
    }
    @keyframes trkFireRise {
      0% {
        opacity: 0;
        transform: translate(-50%, 28px) scale(0.55) rotate(-12deg);
      }
      12% {
        opacity: 1;
      }
      70% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: translate(calc(-50% + var(--drift, 0px)), -260px) scale(1.25) rotate(18deg);
      }
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
      height: 100%;
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
      flex: 1 1 0;
      min-height: 0;
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 12px 18px;
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
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1.2fr 0.5fr;
      gap: 18px;
      min-height: 0;
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
    }
    .og-koc-queue-avatars og-avatar {
      border: 2px solid var(--nx-surface-1);
    }
    .og-koc-queue-avatars og-avatar + og-avatar {
      margin-left: -16px;
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
      .og-koc-side-dot,
      .og-koc-side.throne.on-fire,
      .og-koc-on-fire-pill,
      .og-koc-side-pts.on-fire strong,
      .og-koc-fire-emoji,
      .og-koc-side-pts.og-pulse-run strong,
      .og-koc-side-crown.og-pulse-run,
      .og-koc-side.og-pulse-run,
      .og-koc-table-row.og-pulse-run,
      .og-koc-queue-card.og-pulse-run,
      .og-koc-champ,
      .og-koc-champ-shine,
      .og-koc-class-row {
        animation: none;
      }
      .og-koc-class-progress-bar {
        transition: none;
      }
    }

    :host.finished {
      gap: clamp(10px, 1.4cqh, 18px);
      padding: clamp(16px, 2.2cqh, 28px) clamp(24px, 2.2cqw, 40px) clamp(12px, 1.6cqh, 20px);
    }
    .og-koc-done-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--nx-win) 50%, transparent);
      color: var(--nx-win);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .og-koc-done-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-win);
      box-shadow: 0 0 10px color-mix(in srgb, var(--nx-win) 70%, transparent);
    }
    .og-koc-champ {
      position: relative;
      flex: 1.15 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: clamp(12px, 1.6cqh, 20px);
      padding: clamp(20px, 2.8cqh, 36px) clamp(24px, 2cqw, 36px);
      border-radius: 20px;
      border: 1px solid rgba(255, 106, 26, 0.5);
      background: linear-gradient(120deg, rgba(255, 106, 26, 0.2), rgba(12, 10, 8, 0.95) 55%);
      box-shadow: inset 0 0 0 1px rgba(255, 106, 26, 0.1);
      overflow: hidden;
      animation: treUp 0.7s var(--nx-ease-out) both;
    }
    .og-koc-champ-shine {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.12) 48%, transparent 62%);
      transform: translateX(-120%);
      animation: treSweep 1.4s var(--nx-ease-out) 0.55s both;
    }
    @keyframes treUp {
      from {
        opacity: 0;
        transform: translateY(40px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @keyframes treSweep {
      from {
        transform: translateX(-120%);
      }
      to {
        transform: translateX(120%);
      }
    }
    .og-koc-champ-badge {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-koc-champ-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 28px;
      flex-wrap: wrap;
    }
    .og-koc-champ-team {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .og-koc-champ-avatars og-avatar {
      border-color: rgba(255, 106, 26, 0.55);
    }
    .og-koc-champ-avatars og-avatar + og-avatar {
      margin-left: -28px;
    }
    .og-koc-champ-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .og-koc-champ-name {
      font-family: var(--nx-font-display);
      font-size: clamp(36px, 4.2cqh, 56px);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.05;
    }
    .og-koc-champ-sub {
      font-size: 18px;
      color: var(--nx-text-mute);
    }
    .og-koc-champ-stats {
      display: grid;
      grid-template-columns: repeat(4, auto);
      gap: 32px;
    }
    .og-koc-champ-stat {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      text-align: right;
    }
    .og-koc-champ-stat strong {
      font-family: var(--nx-font-display);
      font-size: clamp(40px, 4.6cqh, 56px);
      font-weight: 800;
      line-height: 1;
      color: var(--nx-orange-500);
      font-variant-numeric: tabular-nums;
    }
    .og-koc-champ-stat span {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
      white-space: nowrap;
    }

    .og-koc-class {
      flex: 1.35 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: clamp(8px, 1.1cqh, 14px);
      overflow: hidden;
    }
    .og-koc-class-head,
    .og-koc-class-row {
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr) minmax(240px, max-content) 140px;
      gap: 18px;
      align-items: center;
    }
    .og-koc-class-head {
      flex: none;
      padding: 0 26px 2px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-koc-class-head .num {
      text-align: right;
      white-space: nowrap;
    }
    .og-koc-class-row {
      flex: 1 1 0;
      min-height: 0;
      padding: clamp(12px, 1.6cqh, 20px) 26px;
      border-radius: 18px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      animation: treIn 0.55s var(--nx-ease-out) both;
    }
    @keyframes treIn {
      from {
        opacity: 0;
        transform: translateY(26px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .og-koc-class-row.king {
      flex: 1.55 1 0;
      min-height: 0;
      padding: clamp(16px, 2cqh, 26px) 28px;
      border-radius: 20px;
      border-color: rgba(255, 106, 26, 0.5);
      background: linear-gradient(90deg, rgba(255, 106, 26, 0.16), transparent 72%);
    }
    .og-koc-class-row.advances {
      border-color: color-mix(in srgb, var(--nx-win) 45%, transparent);
      background: linear-gradient(90deg, color-mix(in srgb, var(--nx-win) 16%, transparent), transparent 72%);
    }
    .og-koc-class-place {
      font-family: var(--nx-font-display);
      font-size: 40px;
      font-weight: 800;
      color: var(--nx-text-mute);
      font-variant-numeric: tabular-nums;
    }
    .og-koc-class-row.king .og-koc-class-place {
      font-size: 52px;
      color: var(--nx-orange-500);
    }
    .og-koc-class-row.advances .og-koc-class-place {
      color: var(--nx-win);
    }
    .og-koc-class-dupla {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .og-koc-class-avatars {
      flex: none;
    }
    .og-koc-class-avatars og-avatar + og-avatar {
      margin-left: -18px;
    }
    .og-koc-class-row.king .og-koc-class-avatars og-avatar {
      border-color: rgba(255, 106, 26, 0.55);
    }
    .og-koc-class-row.king .og-koc-class-avatars og-avatar + og-avatar {
      margin-left: -24px;
    }
    .og-koc-class-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .og-koc-class-name {
      font-family: var(--nx-font-display);
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-koc-class-row.king .og-koc-class-name {
      font-size: 34px;
    }
    .og-koc-class-sub {
      font-size: 15px;
      color: var(--nx-text-mute);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-koc-class-row.king .og-koc-class-sub {
      font-size: 16px;
    }
    .og-koc-class-tag {
      flex: none;
      margin-left: auto;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .og-koc-class-row.king .og-koc-class-tag {
      padding: 8px 16px;
      font-size: 13px;
    }
    .og-koc-class-tag.king {
      color: var(--nx-orange-500);
      background: rgba(255, 106, 26, 0.16);
      border: 1px solid rgba(255, 106, 26, 0.4);
    }
    .og-koc-class-tag.advances {
      color: var(--nx-win);
      background: color-mix(in srgb, var(--nx-win) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--nx-win) 40%, transparent);
    }
    .og-koc-class-crowns,
    .og-koc-class-pts {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      text-align: right;
    }
    .og-koc-class-crowns strong {
      font-family: var(--nx-font-mono);
      font-size: 26px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .og-koc-class-crowns span,
    .og-koc-class-pts span {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-koc-class-pts strong {
      font-family: var(--nx-font-display);
      font-size: 44px;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .og-koc-class-row.king .og-koc-class-pts strong {
      font-size: 56px;
      color: var(--nx-orange-500);
    }
    .og-koc-class-row.king .og-koc-class-crowns strong {
      font-size: 30px;
    }

    .og-koc-class-foot {
      position: relative;
      flex: none;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      padding: 14px 0 10px;
    }
    .og-koc-class-next {
      display: flex;
      align-items: baseline;
      gap: 14px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .og-koc-class-next-label {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    .og-koc-class-next-clock {
      font-family: var(--nx-font-mono);
      font-size: 36px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .og-koc-class-legend {
      font-size: 14px;
      color: var(--nx-text-mute);
    }
    .og-koc-class-legend em {
      color: var(--nx-win);
      font-style: normal;
      font-weight: 800;
    }
    .og-koc-class-homolog {
      flex: none;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
    .og-koc-class-progress {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }
    .og-koc-class-progress-bar {
      display: block;
      height: 100%;
      background: var(--nx-orange-500);
      box-shadow: 0 0 12px rgba(255, 106, 26, 0.55);
      transition: width 1s linear;
    }
  `,
})
export class TelaoKocModeComponent {
  /** Exposto ao template — limiar do on-fire (>3 pontos seguidos no trono). */
  protected readonly KOC_ON_FIRE_AFTER = KOC_ON_FIRE_AFTER;

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
  /** Início da vitrine de 45s — bate com `kocShowcaseOf` no telão. */
  private readonly finishedAtMs = signal<number | null>(null);
  /** Emojis 🔥 subindo a cada ponto no on-fire. */
  protected readonly fireEmojis = signal<
    { id: number; left: number; drift: number; size: number; delay: number; dur: number }[]
  >([]);
  private fireEmojiSeq = 0;
  private lastKingPointsForBurst = -1;

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

    effect(() => {
      if (!this.finished()) {
        this.finishedAtMs.set(null);
        return;
      }
      if (this.finishedAtMs() != null) return;
      const ended = this.match().matchEndedAt?.getTime();
      const now = this.nowMs();
      this.finishedAtMs.set(
        ended != null && now - ended < KOC_FINISHED_SHOWCASE_MS ? ended : now,
      );
    });

    // Ponto no trono em on-fire → rajada de 🔥 subindo.
    effect(() => {
      const round = this.match().koc;
      const kingId = round?.kingTeamId ?? '';
      if (!round || !kingId || this.finished() || !kocHasStarted(round)) {
        this.lastKingPointsForBurst = -1;
        return;
      }
      const pts = kocPointsOf(round, kingId);
      const reign = this.reign();
      const streak = reign.kingId === kingId ? Math.max(0, pts - reign.basePoints) : 0;
      const prev = this.lastKingPointsForBurst;
      this.lastKingPointsForBurst = pts;
      if (prev < 0 || pts <= prev || streak <= KOC_ON_FIRE_AFTER) return;
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      queueMicrotask(() => this.spawnFireEmojis(streak));
    });
  }

  protected readonly round = computed(() => this.match().koc);

  protected readonly finished = computed(() => this.match().status === 'completed');

  protected readonly rallies = computed(() => this.round()?.rallies ?? 0);

  protected readonly roundLabel = computed(() => {
    const m = this.match();
    return m.koc?.roundLabel || m.matchNumber || 0;
  });

  protected readonly finalStandings = computed<KocFinalStandingRow[]>(() => {
    const round = this.round();
    if (!round) return [];
    const cut = round.qualifiersPerRound;
    return kocFinalTable(round).map((row) => {
      const team = this.teamsById().get(row.teamId) ?? null;
      return {
        teamId: row.teamId,
        place: row.place,
        surnames: this.surnamesOf(team, this.nameOf(row.teamId)),
        points: row.points,
        crowns: row.crowns,
        qualifies: cut > 0 && row.place <= cut,
        team,
      };
    });
  });

  protected readonly champion = computed(() => this.finalStandings().find((r) => r.place === 1) ?? null);

  protected durationLabel(): string {
    return `${this.durationMin()}'`;
  }

  protected readonly nextBanner = computed(() => {
    const m = this.match();
    const court = formatCourtLabel(m.court) || 'Quadra';
    const next = this.nextPhaseLabel();
    if (!next) return null;
    return `Próxima: ${next} · ${court} · começa em`;
  });

  protected showcaseRemaining(): string {
    const left = this.showcaseRemainingSec();
    return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  }

  /** Largura restante da barra (encolhe) — sincronizada com o countdown de 1s. */
  protected showcaseRemainingPct(): number {
    return (this.showcaseRemainingSec() / Math.round(KOC_FINISHED_SHOWCASE_MS / 1000)) * 100;
  }

  protected playerLine(team: TelaoTeamDisplay | null | undefined): string | null {
    if (!team) return null;
    const names = team.playerNames.filter((n) => !!n?.trim());
    return names.length > 0 ? names.join(' · ') : null;
  }

  private showcaseRemainingSec(): number {
    const started = this.finishedAtMs();
    if (started == null) return Math.round(KOC_FINISHED_SHOWCASE_MS / 1000);
    const leftMs = Math.max(0, KOC_FINISHED_SHOWCASE_MS - (this.nowMs() - started));
    return Math.ceil(leftMs / 1000);
  }

  private nextPhaseLabel(): string {
    const m = this.match();
    const t = (m.matchType ?? '').trim().toLowerCase().replace(/_/g, ' ');
    if (t === 'koc final') return '';
    if (t === 'koc semifinal') return 'Final';
    const n = m.koc?.roundLabel || m.matchNumber;
    return n > 0 ? `Rodada ${n + 1}` : 'Próxima rodada';
  }

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

  /** Cor + intensidade do pulso (brilho e cadência sobem com a sequência). */
  protected fireStyleOf(reignStreak: number): Record<string, string> {
    const heat = kocFireHeat(reignStreak);
    const pulse = kocFirePulseVars(heat);
    return {
      '--koc-fire': kocFireRgb(heat),
      '--koc-fire-hot': kocFireHotRgb(heat),
      '--koc-fire-glow-lo': pulse.glowLo,
      '--koc-fire-glow-hi': pulse.glowHi,
      '--koc-fire-a-lo': pulse.aLo,
      '--koc-fire-a-hi': pulse.aHi,
      '--koc-fire-text-lo': pulse.textLo,
      '--koc-fire-text-hi': pulse.textHi,
      '--koc-fire-dur': pulse.dur,
      '--koc-fire-pulse-dur': pulse.pulseDur,
    };
  }

  private spawnFireEmojis(reignStreak: number): void {
    const heat = kocFireHeat(reignStreak);
    const count = 5 + Math.round(heat * 4);
    const batch: { id: number; left: number; drift: number; size: number; delay: number; dur: number }[] = [];
    for (let i = 0; i < count; i++) {
      batch.push({
        id: ++this.fireEmojiSeq,
        left: 18 + Math.random() * 64,
        drift: Math.round((Math.random() - 0.5) * (80 + heat * 60)),
        size: Math.round(28 + Math.random() * (22 + heat * 18)),
        delay: Math.round(Math.random() * 180),
        dur: Math.round(900 + Math.random() * 500 + heat * 200),
      });
    }
    const ids = new Set(batch.map((e) => e.id));
    this.fireEmojis.update((cur) => [...cur, ...batch].slice(-40));
    const maxLife = Math.max(...batch.map((e) => e.delay + e.dur)) + 80;
    window.setTimeout(() => {
      this.fireEmojis.update((cur) => cur.filter((e) => !ids.has(e.id)));
    }, maxLife);
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
