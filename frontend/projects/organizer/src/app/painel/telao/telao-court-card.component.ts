import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core';
import { formatMedicalTimeoutMmSs, medicalTimeoutRemainingSeconds } from '@nexago/live-scoring';
import { matchClosedSets, matchLiveCurrentSet, matchSetWins } from '../data/live-set-display';
import type { TournamentMatch } from '../data/matches-repository';
import {
  kocCardTitle,
  kocFinalTable,
  kocHasQualifyingTie,
  kocHasStarted,
  kocIsExpired,
  kocLiveOrder,
  kocPointsOf,
  kocRemainingLabel,
} from '../data/koc';
import { initialsOf } from '../data/mock-data';
import { spDayLabel, spTimeLabel } from '../data/schedule-format';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPulseDirective } from './og-pulse.directive';
import type { TelaoTeamDisplay } from './telao-data.service';
import { FINISHED_SHOWCASE_MS } from './telao-finished';
import { leadingSideOf } from './telao-selectors';
import { fireLevelOf } from './telao-streaks';

/** Card de uma quadra no telão: partida ao vivo (avatares, sets fechados, pontos do set
 *  corrente e indicador de saque), próxima partida ("em seguida") ou quadra livre. */
@Component({
  selector: 'og-telao-court-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OgIconComponent, OgPulseDirective],
  host: { class: 'og-tlc', '[class.og-tlc-live]': 'kind() === "live"', '[class.og-tlc-finished]': 'kind() === "finished"' },
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
        @case ('finished') {
          <span class="og-tlc-badge finished"><og-icon name="trophy" [size]="14" [strokeWidth]="2" />Fim de jogo</span>
        }
      }
    </header>

    @if (kind() === 'free') {
      <div class="og-tlc-free">Quadra livre</div>
    } @else if (koc(); as round) {
      <!-- Rodada King of the Court: não há dois lados nem sets. O que o público
           na beira da quadra precisa ler, em ordem: qual rodada, quem está no
           trono, quanto tempo falta, a tabela e quem entra depois. -->
      <div class="og-tlc-koc">
        @if (kocRoundTitle(); as title) {
          <div class="og-tlc-koc-round">{{ title }}</div>
        }
        @if (kocClockLabel(); as clock) {
          <div class="og-tlc-koc-clock" [class.expired]="kocExpired()">{{ clock }}</div>
        }
        @if (round.kingTeamId && round.challengerTeamId) {
          <div class="og-tlc-koc-court">
            <span class="og-tlc-koc-crown" role="img" aria-label="No trono">👑</span>
            <span class="og-tlc-koc-king">{{ kocName(round.kingTeamId) }}</span>
            <span class="og-tlc-koc-vs">vs {{ kocName(round.challengerTeamId) }}</span>
            <span class="og-tlc-koc-kingpts">{{ kocPoints(round.kingTeamId) }}</span>
          </div>
        }
        <div class="og-tlc-koc-table">
          @for (row of kocRows(); track row.teamId) {
            <div class="og-tlc-koc-row" [class.qualifies]="row.qualifies">
              <span class="og-tlc-koc-place">{{ row.place }}</span>
              @if (row.isKing) {
                <span class="og-tlc-koc-rowcrown" role="img" aria-label="No trono">👑</span>
              }
              <span class="og-tlc-koc-name">{{ row.name }}</span>
              @if (row.points !== null) {
                <span class="og-tlc-koc-pts">{{ row.points }}</span>
              }
            </div>
          }
        </div>
        @if (kocTie()) {
          <div class="og-tlc-koc-tie">Empate na vaga · bola de ouro</div>
        }
        @if (kocFinished()) {
          <!-- "Eu passei?" não se responde com um destaque de cor visto de longe. -->
          <div class="og-tlc-koc-next"><span class="og-tlc-koc-next-kicker">AVANÇAM</span>{{ kocQualifiedLabel() }}</div>
        } @else if (kocNextLabel(); as next) {
          <!-- Quem espera pergunta "quando eu entro?": o PRÓXIMO sai da fila. -->
          <div class="og-tlc-koc-next">
            <span class="og-tlc-koc-next-kicker">PRÓXIMO</span>{{ next }}
            @if (kocAfterLabel(); as after) {
              <span class="og-tlc-koc-after">depois {{ after }}</span>
            }
          </div>
        }
      </div>
    } @else {
      <!-- Tempo médico: a partida está PARADA, e na parede isso precisa ser óbvio — quem está
           sendo atendido e quanto falta, com a mesma contagem das mesas (derivada do carimbo
           do servidor, sem escrita nenhuma durante os 5 minutos). -->
      @if (medical(); as med) {
        <div class="og-tlc-med" role="status">
          <span class="og-tlc-med-kicker">TEMPO MÉDICO</span>
          <span class="og-tlc-med-who">{{ med.playerName }}</span>
          <span class="og-tlc-med-clock">{{ med.clock }}</span>
        </div>
      }
      <div class="og-tlc-teams">
        @for (row of rows(); track row.side) {
          <div
            class="og-tlc-team"
            [class.leading]="leadingSide() === row.side"
            [class.champion]="winnerSide() === row.side"
            [class.beaten]="winnerSide() !== null && winnerSide() !== row.side"
          >
            @if (showAvatars()) {
              <span class="og-tlc-avatars">
                @if (row.team.players.length > 0) {
                  @for (p of row.team.players; track $index) {
                    <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="100" />
                  }
                } @else {
                  <og-avatar [initials]="fallbackInitials(row.team.label)" [size]="100" />
                }
              </span>
            }
            <span class="og-tlc-names">
              <span class="og-tlc-short">
                {{ row.team.short }}
                @if (servingSide() === row.side) {
                  <span class="og-tlc-serve" title="No saque"></span>
                  @if (servingPlayerName(); as who) {
                    <span class="og-tlc-server" [attr.aria-label]="who + ' no saque'">{{ who }}</span>
                  }
                }
                @if (winnerSide() === row.side) {
                  <span class="og-tlc-champ" role="img" aria-label="Vencedora da partida"><og-icon name="trophy" [size]="20" [strokeWidth]="2" /></span>
                }
                @if (fireLevel(row.side); as level) {
                  <span class="og-tlc-fire" [class.fire-2]="level === 2" [class.fire-3]="level >= 3" role="img" [attr.aria-label]="fireCount(row.side) + ' pontos seguidos'">
                    <og-icon name="flame" [size]="20" [strokeWidth]="2" />
                    <span class="og-tlc-fire-count">×{{ fireCount(row.side) }}</span>
                  </span>
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
                  <span
                    class="og-tlc-points"
                    [class.fire-1]="fireLevel(row.side) === 1"
                    [class.fire-2]="fireLevel(row.side) === 2"
                    [class.fire-3]="fireLevel(row.side) >= 3"
                    [ogPulse]="row.side === 'A' ? c.a : c.b"
                    >{{ row.side === 'A' ? c.a : c.b }}</span
                  >
                }
              </span>
            } @else if (kind() === 'finished') {
              <span class="og-tlc-score">
                @for (s of finishedSets(); track $index) {
                  <span class="og-tlc-set" [class.win]="row.side === 'A' ? s.a > s.b : s.b > s.a">{{ row.side === 'A' ? s.a : s.b }}</span>
                }
                <span class="og-tlc-setswon" [class.gold]="winnerSide() === row.side">{{ row.side === 'A' ? setsWon()[0] : setsWon()[1] }}</span>
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
      height: 100%;
      position: relative;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 26px 30px;
      gap: 18px;
    }
    :host(.og-tlc-live) {
      border-color: rgba(255, 59, 48, 0.35);
    }
    :host(.og-tlc-finished) {
      border-color: rgba(244, 197, 67, 0.5);
      box-shadow: 0 0 34px rgba(244, 197, 67, 0.12);
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
    .og-tlc-badge.finished {
      color: var(--nx-pending);
      border: 1px solid rgba(244, 197, 67, 0.45);
      background: rgba(244, 197, 67, 0.08);
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
      transition:
        border-color var(--nx-d-base) var(--nx-ease-out),
        background-color var(--nx-d-base) var(--nx-ease-out);
    }
    /* Equipe na frente (sets fechados → pontos do set corrente): realce laranja que faz
       crossfade quando a liderança vira. Só cor — sem mexer em layout. */
    .og-tlc-team.leading {
      border-color: rgba(255, 106, 26, 0.5);
      background-color: rgba(255, 106, 26, 0.07);
    }
    /* Fim de jogo: vencedora em dourado com varredura de brilho; derrotada esmaece. */
    .og-tlc-team.champion {
      position: relative;
      overflow: hidden;
      border-color: rgba(244, 197, 67, 0.65);
      background-color: rgba(244, 197, 67, 0.08);
      box-shadow: 0 0 26px rgba(244, 197, 67, 0.18);
    }
    .og-tlc-team.champion::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(105deg, transparent 42%, rgba(255, 255, 255, 0.16) 50%, transparent 58%);
      transform: translateX(-100%);
      animation: og-tlc-shimmer 1.5s var(--nx-ease-out) 400ms 2;
      pointer-events: none;
    }
    .og-tlc-team.beaten {
      opacity: 0.55;
    }
    .og-tlc-champ {
      display: inline-flex;
      color: var(--nx-pending);
      margin-left: 8px;
      vertical-align: middle;
      animation: og-tlc-in 400ms var(--nx-ease-out) 250ms both;
    }
    .og-tlc-setswon {
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
      color: var(--nx-text-dim);
    }
    .og-tlc-setswon.gold {
      color: var(--nx-pending);
      border-color: rgba(244, 197, 67, 0.6);
      box-shadow: 0 0 22px rgba(244, 197, 67, 0.25);
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
      animation: og-tlc-in 220ms var(--nx-ease-out);
    }
    .og-tlc-server {
      margin-left: 6px;
      font-family: var(--nx-font-mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--nx-orange-500);
      vertical-align: middle;
    }
    .og-tlc-med {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      padding: 8px 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid color-mix(in srgb, var(--nx-live) 45%, transparent);
      background: color-mix(in srgb, var(--nx-live) 12%, transparent);
    }
    .og-tlc-med-kicker {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--nx-live);
    }
    .og-tlc-med-who {
      flex: 1;
      min-width: 0;
      font-size: 16px;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-tlc-med-clock {
      font-family: var(--nx-font-mono);
      font-size: 20px;
      font-weight: 700;
      color: var(--nx-text);
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
      /* Set recém-fechado entra com pop (o chip é criado na hora do fechamento). */
      animation: og-tlc-in 220ms var(--nx-ease-out);
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
    /* "Em chamas": 3+ pontos seguidos. A intensidade cresce com a sequência —
       nível 1 (×3–4) chama laranja · nível 2 (×5–6) + brilho no placar · nível 3 (×7+) vermelho. */
    .og-tlc-fire {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: 8px;
      color: var(--nx-orange-400);
      vertical-align: middle;
      animation: og-tlc-in 220ms var(--nx-ease-out);
    }
    .og-tlc-fire og-icon {
      display: inline-flex;
      animation: og-tlc-flicker 700ms ease-in-out infinite alternate;
    }
    .og-tlc-fire-count {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
    }
    .og-tlc-fire.fire-2 {
      color: var(--nx-orange-500);
    }
    .og-tlc-fire.fire-2 og-icon {
      animation-duration: 480ms;
    }
    .og-tlc-fire.fire-3 {
      color: var(--nx-live);
    }
    .og-tlc-fire.fire-3 og-icon {
      animation-duration: 340ms;
    }
    .og-tlc-points {
      transition: box-shadow var(--nx-d-base) var(--nx-ease-out), border-color var(--nx-d-base) var(--nx-ease-out);
    }
    .og-tlc-points.fire-1 {
      border-color: rgba(255, 106, 26, 0.5);
    }
    .og-tlc-points.fire-2 {
      border-color: rgba(255, 106, 26, 0.7);
      box-shadow: 0 0 18px rgba(255, 106, 26, 0.35);
    }
    .og-tlc-points.fire-3 {
      border-color: rgba(255, 59, 48, 0.75);
      box-shadow: 0 0 26px rgba(255, 59, 48, 0.45);
    }
    /* Ponto marcado: pop com flash laranja (ogPulse reinicia a cada mudança de valor). */
    .og-tlc-points.og-pulse-run {
      animation: og-tlc-score-pop 280ms var(--nx-ease-out);
    }
    @keyframes og-tlc-score-pop {
      0% {
        transform: scale(1);
      }
      35% {
        transform: scale(1.16);
        color: var(--nx-orange-400);
        border-color: rgba(255, 106, 26, 0.6);
      }
      100% {
        transform: scale(1);
      }
    }
    /* ── King of the Court ─────────────────────────────────────────────────
       Sem placar por sets e sem dois lados: cronômetro, quem está na quadra,
       tabela e fila. Tamanhos pensados para leitura à distância. */
    .og-tlc-koc {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 4px 0;
    }
    .og-tlc-koc-round {
      font-family: var(--nx-font-display);
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .og-tlc-koc-clock {
      font-size: 44px;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .og-tlc-koc-clock.expired {
      font-size: 32px;
      color: #f4c543;
    }
    .og-tlc-koc-court {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgb(255 106 26 / 16%);
      border: 1px solid rgb(255 106 26 / 45%);
    }
    .og-tlc-koc-crown {
      font-size: 22px;
    }
    .og-tlc-koc-king {
      font-size: 24px;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-tlc-koc-vs {
      flex: 1;
      font-size: 16px;
      opacity: 0.75;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-tlc-koc-kingpts {
      font-size: 34px;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .og-tlc-koc-table {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .og-tlc-koc-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border-radius: 10px;
      background: rgb(255 255 255 / 5%);
    }
    /* A faixa de classificação é o que o atleta procura primeiro na tabela. */
    .og-tlc-koc-row.qualifies {
      background: rgb(255 106 26 / 14%);
    }
    .og-tlc-koc-place {
      min-width: 22px;
      font-size: 17px;
      font-weight: 800;
      opacity: 0.6;
    }
    .og-tlc-koc-row.qualifies .og-tlc-koc-place {
      color: #ff6a1a;
      opacity: 1;
    }
    .og-tlc-koc-name {
      flex: 1;
      font-size: 19px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-tlc-koc-pts {
      font-size: 24px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .og-tlc-koc-tie {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.6px;
      color: #f4c543;
    }
    .og-tlc-koc-next {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-size: 20px;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-tlc-koc-next-kicker {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #ff6a1a;
    }
    .og-tlc-koc-after {
      flex: 1;
      text-align: right;
      font-size: 13px;
      font-weight: 400;
      opacity: 0.45;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @keyframes og-tlc-in {
      from {
        transform: scale(0.7);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
    @keyframes og-tlc-flicker {
      from {
        transform: scale(1) rotate(-4deg);
      }
      to {
        transform: scale(1.14) rotate(4deg);
      }
    }
    @keyframes og-tlc-shimmer {
      to {
        transform: translateX(100%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .og-tlc-team,
      .og-tlc-points {
        transition: none;
      }
      .og-tlc-set,
      .og-tlc-serve,
      .og-tlc-fire,
      .og-tlc-fire og-icon,
      .og-tlc-champ,
      .og-tlc-team.champion::after,
      .og-tlc-points.og-pulse-run {
        animation: none;
      }
    }
  `,
})
export class TelaoCourtCardComponent {
  readonly courtName = input.required<string>();
  /** Mapa `teamId` → dupla resolvida, para a rodada KOTC: ela tem elenco, não
   *  dois lados, então `teamA`/`teamB` não bastam. */
  readonly teamsById = input<ReadonlyMap<string, TelaoTeamDisplay>>(new Map());
  /** Relógio do host, passado como input para o card não criar timer próprio —
   *  o telão já redesenha a cada segundo. */
  readonly nowMs = input(0);
  readonly kind = input.required<'live' | 'finished' | 'next' | 'free'>();
  readonly match = input<TournamentMatch | null>(null);
  readonly categoryLabel = input('');
  readonly teamA = input<TelaoTeamDisplay | null>(null);
  readonly teamB = input<TelaoTeamDisplay | null>(null);
  readonly showAvatars = input(true);
  /** Pontos seguidos de cada lado (0 = sem sequência ou recurso desligado na config). */
  readonly streakA = input(0);
  readonly streakB = input(0);

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

  protected readonly leadingSide = computed<'A' | 'B' | null>(() => {
    const m = this.match();
    return m && this.kind() === 'live' ? leadingSideOf(m) : null;
  });

  /** Vencedora da partida — só no estado de celebração (fim de jogo). */
  protected readonly winnerSide = computed<'A' | 'B' | null>(() => {
    const m = this.match();
    if (!m || this.kind() !== 'finished') return null;
    return m.winnerSide === 1 ? 'A' : m.winnerSide === 2 ? 'B' : null;
  });

  protected readonly finishedSets = computed(() => {
    const m = this.match();
    return m && this.kind() === 'finished' ? matchClosedSets(m) : [];
  });

  protected readonly setsWon = computed<[number, number]>(() => {
    const m = this.match();
    return m && this.kind() === 'finished' ? matchSetWins(m) : [0, 0];
  });

  protected readonly servingSide = computed<'A' | 'B' | null>(() => {
    const m = this.match();
    if (!m || this.kind() !== 'live' || !m.servingTeamId) return null;
    if (m.servingTeamId === m.teamAId) return 'A';
    if (m.servingTeamId === m.teamBId) return 'B';
    return null;
  });

  /** O ATLETA no saque — a partida grava a posição na dupla (1 ou 2) e o telão resolve o nome
   *  no elenco que já carregou pro rótulo, sem join novo. Primeiro nome só: na parede o que
   *  identifica é ele, e o sobrenome não cabe ao lado do nome da dupla. */
  protected readonly servingPlayerName = computed(() => {
    const m = this.match();
    const side = this.servingSide();
    if (!m || side == null) return null;
    const slot = m.servingPlayerSlot;
    if (slot !== 1 && slot !== 2) return null;
    const team = side === 'A' ? this.teamA() : this.teamB();
    const name = team?.playerNames[slot - 1]?.trim() ?? '';
    return name ? (name.split(/\s+/)[0] ?? '') : null;
  });

  /** Atendimento médico em andamento: a partida está parada. A contagem sai de `startedAt`
   *  (carimbo do servidor) contra o relógio do telão — nenhuma escrita durante os 5 minutos,
   *  e o número bate com o das três mesas. */
  protected readonly medical = computed<{ playerName: string; clock: string } | null>(() => {
    const m = this.match();
    const active = m?.medicalTimeout;
    if (!m || !active || this.kind() !== 'live') return null;
    const team = active.side === 'A' ? this.teamA() : this.teamB();
    const name = active.playerName.trim() || team?.playerNames[active.playerSlot - 1]?.trim() || 'Atleta';
    return {
      playerName: name,
      clock: formatMedicalTimeoutMmSs(medicalTimeoutRemainingSeconds(active, new Date(this.nowMs() || Date.now()))),
    };
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

  protected fireCount(side: 'A' | 'B'): number {
    return this.kind() === 'live' ? (side === 'A' ? this.streakA() : this.streakB()) : 0;
  }

  protected fireLevel(side: 'A' | 'B'): number {
    return fireLevelOf(this.fireCount(side));
  }

  constructor() {
    // Confete da celebração: lazy-load do canvas-confetti só quando uma partida termina,
    // desenhado num canvas PRÓPRIO do card (quadras terminando juntas não se misturam).
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect((onCleanup) => {
      if (this.kind() !== 'finished') return;
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      let cancelled = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      let canvas: HTMLCanvasElement | null = null;
      void import('canvas-confetti').then(({ default: confetti }) => {
        if (cancelled) return;
        canvas = document.createElement('canvas');
        // Estilo inline: o canvas é criado fora do template, então o CSS com escopo do
        // componente (emulated encapsulation) não o alcançaria.
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;border-radius:inherit';
        host.appendChild(canvas);
        const shoot = confetti.create(canvas, { resize: true });
        const colors = ['#FF6A1A', '#FF8A4A', '#F4C543', '#FFFFFF'];
        const burst = (strength: number) => {
          void shoot({ particleCount: Math.round(70 * strength), spread: 70, startVelocity: 32, angle: 60, origin: { x: 0.08, y: 0.95 }, colors, disableForReducedMotion: true });
          void shoot({ particleCount: Math.round(70 * strength), spread: 70, startVelocity: 32, angle: 120, origin: { x: 0.92, y: 0.95 }, colors, disableForReducedMotion: true });
        };
        burst(1);
        timers.push(setTimeout(() => burst(0.6), 700));
        // Rajadas suaves espaçadas até perto do fim da vitrine de 30 s.
        for (let t = 6000; t < FINISHED_SHOWCASE_MS - 3000; t += 7000) {
          timers.push(setTimeout(() => burst(0.35), t));
        }
      });
      onCleanup(() => {
        cancelled = true;
        for (const t of timers) clearTimeout(t);
        canvas?.remove();
      });
    });
  }

  // ── King of the Court ───────────────────────────────────────────────────────

  protected readonly koc = computed(() => this.match()?.koc ?? null);

  /** Nome da rodada no card — substitui o "A definir × A definir" do duelo. */
  protected readonly kocRoundTitle = computed(() => {
    const m = this.match();
    return m ? kocCardTitle(m) : null;
  });

  protected kocName(teamId: string): string {
    return this.teamsById().get(teamId)?.short ?? 'Dupla';
  }

  protected kocPoints(teamId: string): number {
    const round = this.koc();
    return round ? kocPointsOf(round, teamId) : 0;
  }

  /** Nulo antes do apito: rodada sem relógio não mostra contagem. */
  protected kocClockLabel(): string | null {
    const round = this.koc();
    if (!round?.clock) return null;
    return kocIsExpired(round.clock, this.nowMs()) ? 'TEMPO!' : kocRemainingLabel(round.clock, this.nowMs());
  }

  protected kocExpired(): boolean {
    const round = this.koc();
    return round?.clock != null && kocIsExpired(round.clock, this.nowMs());
  }

  /** Antes do apito a ordem é a de entrada (quem abre no trono); depois, a tabela. */
  protected readonly kocRows = computed(() => {
    const round = this.koc();
    if (!round) return [];
    // Encerrada, a tabela OFICIAL (a que resolveu o empate), não a ao vivo.
    if (this.kocFinished()) {
      return kocFinalTable(round).map((row) => ({
        teamId: row.teamId,
        place: row.place,
        name: this.kocName(row.teamId),
        points: row.points,
        qualifies: row.place <= round.qualifiersPerRound,
        isKing: false,
      }));
    }
    const started = kocHasStarted(round);
    const order = started ? kocLiveOrder(round) : round.teamIds;
    return order.map((teamId, i) => ({
      teamId,
      place: i + 1,
      name: this.kocName(teamId),
      points: started ? kocPointsOf(round, teamId) : null,
      qualifies: started && i < round.qualifiersPerRound,
      isKing: round.kingTeamId === teamId,
    }));
  });

  protected kocTie(): boolean {
    const round = this.koc();
    if (this.kocFinished()) return false;
    return round != null && kocHasStarted(round) && kocHasQualifyingTie(round);
  }

  /** Rodada concluída — do `status` do jogo, a mesma fonte do guard do servidor.
   *  `kind()` diz o papel do card na grade, não o estado da rodada. */
  protected kocFinished(): boolean {
    return this.match()?.status === 'completed';
  }

  /** Quem entra depois do rally atual. Vazio quando não há fila. */
  protected kocNextLabel(): string {
    const next = this.koc()?.queue[0];
    return next ? this.kocName(next) : '';
  }

  /** O resto da fila, atrás do próximo. */
  protected kocAfterLabel(): string {
    const queue = this.koc()?.queue ?? [];
    return queue.slice(1).map((id) => this.kocName(id)).join('  →  ');
  }

  protected kocQualifiedLabel(): string {
    const round = this.koc();
    if (!round) return '';
    return kocFinalTable(round)
      .filter((row) => row.place <= round.qualifiersPerRound)
      .map((row) => this.kocName(row.teamId))
      .join('  ·  ');
  }
}
